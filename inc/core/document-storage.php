<?php
/** Verified document writes and explicit schema limits. Read-time normalization is separate. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Reject structural loss before sanitization; never silently remove an unsupported widget. */
function lieve_validate_document( $document ) {
	$error = static function( $message ) { return new WP_Error( 'lieve_invalid_document', $message, array( 'status' => 400 ) ); };
	if ( ! is_array( $document ) || ( isset( $document['version'] ) && 1 !== $document['version'] ) || ! isset( $document['children'] ) || ! is_array( $document['children'] ) || array_values( $document['children'] ) !== $document['children'] ) { return $error( __( 'Unsupported document schema. Version 1 and an ordered children list are required. Your draft has not been changed.', 'lieve-builder' ) ); }
	if ( strlen( wp_json_encode( $document ) ) > 4000000 ) { return $error( __( 'The document exceeds the 4 MB editing limit. Split it into reusable templates before saving.', 'lieve-builder' ) ); }
	$registry = function_exists( 'lieve_element_registry' ) ? lieve_element_registry() : null;
	$count = 0; $ids = array();
	$walk = static function( $nodes, $depth ) use ( &$walk, &$count, &$ids, $registry, $error ) {
		foreach ( $nodes as $node ) {
			if ( ++$count > 400 || $depth > 12 ) { return $error( __( 'A document supports at most 400 elements and 13 nesting levels. No elements were discarded.', 'lieve-builder' ) ); }
			if ( ! is_array( $node ) || ! is_string( $node['id'] ?? null ) || ! preg_match( '/^[a-zA-Z0-9_-]{1,64}$/D', $node['id'] ) || isset( $ids[ $node['id'] ] ) ) { return $error( __( 'Every element needs a unique internal ID (1–64 letters, digits, hyphens or underscores).', 'lieve-builder' ) ); }
			$ids[ $node['id'] ] = true;
			if ( ! is_string( $node['type'] ?? null ) || ( null !== $registry && ! isset( $registry[ $node['type'] ] ) ) ) { return $error( __( 'This document contains an unavailable element. Restore its extension before saving; no content was removed.', 'lieve-builder' ) ); }
			$props = $node['props'] ?? array(); $children = $node['children'] ?? array();
			if ( ! is_array( $props ) || ! is_array( $children ) || array_values( $children ) !== $children || ( $children && function_exists( 'lieve_element_can_nest' ) && ! lieve_element_can_nest( $node['type'] ) ) ) { return $error( __( 'Invalid element properties or children. Your draft is retained.', 'lieve-builder' ) ); }
			if ( isset( $props['className'] ) && ( ! is_string( $props['className'] ) || count( preg_split( '/\s+/', trim( $props['className'] ), -1, PREG_SPLIT_NO_EMPTY ) ) > 100 ) ) { return $error( __( 'An element accepts up to 100 manual CSS classes.', 'lieve-builder' ) ); }
			foreach ( preg_split( '/\s+/', trim( $props['className'] ?? '' ), -1, PREG_SPLIT_NO_EMPTY ) as $class ) { if ( function_exists( 'sanitize_html_class' ) && $class !== sanitize_html_class( $class ) ) { return $error( __( 'Manual classes must be valid CSS class names, separated by spaces.', 'lieve-builder' ) ); } }
			foreach ( $registry[ $node['type'] ]['fields'] ?? array() as $key => $field ) {
				if ( isset( $props[ $key ] ) && ! is_scalar( $props[ $key ] ) ) { return $error( sprintf( __( '%1$s: %2$s requires a scalar field value. No content was discarded.', 'lieve-builder' ), $node['type'], $key ) ); }
				if ( ! isset( $props[ $key ] ) || ! is_string( $props[ $key ] ) ) { continue; }
				$limit = 'textarea' === $field['type'] ? 20000 : ( in_array( $field['type'], array( 'text', 'url' ), true ) ? 2000 : 0 );
				if ( $limit && strlen( $props[ $key ] ) > $limit ) { return $error( sprintf( __( '%1$s: %2$s exceeds its %3$d-byte limit. Shorten it before saving; the original draft is retained.', 'lieve-builder' ), $node['type'], $key, $limit ) ); }
			}
			$valid = $walk( $children, $depth + 1 ); if ( is_wp_error( $valid ) ) { return $valid; }
		}
		return true;
	};
	return $walk( $document['children'], 0 );
}

/** Hash raw storage, not a lossy read-time view. Includes enablement and assignments. */
function lieve_document_revision( $id ) {
	$values = array();
	foreach ( array( LIEVE_META_DOCUMENT, LIEVE_META_ENABLED, LIEVE_META_HEADER_TEMPLATE, LIEVE_META_FOOTER_TEMPLATE ) as $key ) { $values[ $key ] = get_post_meta( $id, $key, true ); }
	return hash( 'sha256', wp_json_encode( $values ) );
}

/** Read under the page lock: visible document and revision must share a baseline. */
function lieve_page_editor_snapshot( $id ) {
	return array_merge( lieve_seo_snapshot( $id ), array( 'document' => lieve_get_document( $id ), 'documentRevision' => lieve_document_revision( $id ), 'headerTemplateId' => lieve_get_assigned_template_id( $id, 'header' ), 'footerTemplateId' => lieve_get_assigned_template_id( $id, 'footer' ) ) );
}

/** Compensating transaction with readback. A false update may simply mean unchanged. */
function lieve_write_document_meta( $id, $values, $finalize = null ) {
	$before = array();
	foreach ( $values as $key => $value ) { $before[ $key ] = array( metadata_exists( 'post', $id, $key ), get_post_meta( $id, $key, true ) ); }
	$failed = false;
	foreach ( $values as $key => $value ) {
		try {
		if ( null === $value ) { delete_post_meta( $id, $key ); } else { update_post_meta( $id, $key, wp_slash( $value ) ); }
		$expected = null === $value ? '' : ( is_scalar( $value ) ? (string) $value : $value );
		if ( get_post_meta( $id, $key, true ) === $expected && ( null !== $value || ! metadata_exists( 'post', $id, $key ) ) ) { continue; }
		$failed = true; break;
		} catch ( Throwable $error ) { $failed = true; break; }
	}
	if ( ! $failed && $finalize ) { try { $result = $finalize(); $failed = is_wp_error( $result ) || false === $result; } catch ( Throwable $error ) { $failed = true; } }
	if ( $failed ) {
		$restored = true;
		foreach ( $before as $old_key => $old ) {
			try {
			if ( $old[0] ) { update_post_meta( $id, $old_key, wp_slash( $old[1] ) ); } else { delete_post_meta( $id, $old_key ); }
			if ( get_post_meta( $id, $old_key, true ) !== $old[1] || metadata_exists( 'post', $id, $old_key ) !== $old[0] ) { $restored = false; }
			} catch ( Throwable $error ) { $restored = false; }
		}
		return new WP_Error( 'lieve_document_storage_failed', $restored ? __( 'The page could not be saved. Previous settings were restored and your draft is retained. Try again.', 'lieve-builder' ) : __( 'The save failed and could not be fully rolled back. Your draft is retained. Reload and review stored content before retrying.', 'lieve-builder' ), array( 'status' => 500, 'rollbackComplete' => $restored ) );
	}
	return true;
}
