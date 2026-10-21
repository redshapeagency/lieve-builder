<?php
/** Preview rendering. Custom PHP requires an explicit, authenticated code-preview request. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Match the client cache input: styles compile separately, HTML wrapper choice does not. */
function lieve_editor_preview_node( $node, $listing = false ) {
	$listing = $listing || function_exists( 'lieve_listing_enabled' ) && lieve_listing_enabled( $node );
	if ( 'html' === ( $node['type'] ?? '' ) ) { $node['props']['wrapHtml'] = lieve_html_has_wrapper( $node['props'] ?? array() ); }
	if ( ! $listing ) { unset( $node['props']['styles'] ); }
	$node['children'] = array_map( static function( $child ) use ( $listing ) { return lieve_editor_preview_node( $child, $listing ); }, $node['children'] ?? array() );
	return $node;
}

/** The caller supplies a sanitized node. PHP runs only for an explicit code-administrator preview. */
function lieve_render_editor_preview( $node, $post, $execute_custom_code = false ) {
	// Setting only $post is insufficient: PHP loops call wp_reset_postdata(),
	// which restores the main query's post. Use the same complete, isolated
	// page context as inherited templates so that reset targets this document.
	return lieve_with_editor_page_context( $post, static function() use ( $node, $post, $execute_custom_code ) {
		$previous_source = $GLOBALS['lieve_document_source_id'] ?? null;
		$previous_code = $GLOBALS['lieve_custom_code_preview'] ?? null;
		$previous_runtime = $GLOBALS['lieve_runtime_document'] ?? null;
		$level = ob_get_level();
		$GLOBALS['lieve_document_source_id'] = (int) $post->ID;
		$GLOBALS['lieve_runtime_document'] = array('children'=>array($node));
		$GLOBALS['lieve_custom_code_preview'] = true === $execute_custom_code && function_exists( 'lieve_can_author_custom_code' ) && lieve_can_author_custom_code() && current_user_can( 'edit_post', $post->ID );
		try {
			ob_start(); lieve_render_document( array( 'children' => array( $node ) ) ); return ob_get_clean();
		} finally {
			while ( ob_get_level() > $level ) { ob_end_clean(); }
			if ( null === $previous_source ) { unset( $GLOBALS['lieve_document_source_id'] ); } else { $GLOBALS['lieve_document_source_id'] = $previous_source; }
			if ( null === $previous_code ) { unset( $GLOBALS['lieve_custom_code_preview'] ); } else { $GLOBALS['lieve_custom_code_preview'] = $previous_code; }
			if ( null === $previous_runtime ) { unset($GLOBALS['lieve_runtime_document']); } else { $GLOBALS['lieve_runtime_document']=$previous_runtime; }
		}
	} );
}

function lieve_editor_preview_has_php( $node ) {
	if ( 'component' === ($node['type']??'') && function_exists('lieve_component_expand') ) { $node=lieve_component_expand($node);if(!$node)return false; }
	if ( 'html' === ( $node['type'] ?? '' ) && false !== strpos( $node['props']['content'] ?? '', '<?' ) ) { return true; }
	foreach ( $node['children'] ?? array() as $child ) { if ( lieve_editor_preview_has_php( $child ) ) { return true; } }
	return false;
}

/** Preload the same server-rendered branches the canvas would otherwise request after paint. */
function lieve_editor_initial_previews( $post_id, $document ) {
	$post = get_post( $post_id );
	if ( ! $post || ! current_user_can( 'edit_post', $post_id ) || ! lieve_builder_supports_post_type( $post->post_type ) ) { return array(); }
	$native = array( 'section', 'container', 'heading', 'button', 'image', 'spacer', 'block', 'div', 'slot' );
	$previews = array(); $bytes = 0; $started = microtime( true ); $finished = false;
	$walk = function( $nodes ) use ( &$walk, &$previews, &$bytes, &$finished, $started, $post, $native ) {
		foreach ( $nodes as $node ) {
			if ( $finished || count( $previews ) >= 200 || microtime( true ) - $started > .075 ) { return; }
			$image_preview = 'image' === ( $node['type'] ?? '' ) && ( ! empty( $node['props']['attachmentId'] ) || ! empty( $node['props']['caption'] ) || ! empty( $node['props']['imageLink'] ) || ! empty( $node['props']['imageSizes'] ) || ! empty( $node['props']['imageDecoding'] ) );
			if ( ! $image_preview && in_array( $node['type'] ?? '', $native, true ) && ! ( function_exists( 'lieve_listing_enabled' ) && lieve_listing_enabled( $node ) ) ) { $walk( $node['children'] ?? array() ); continue; }
			// Do not execute PHP in the admin HTML request or seed an inert PHP result
			// that would suppress the explicit, authorized live-preview request.
			if ( lieve_editor_preview_has_php( $node ) && function_exists( 'lieve_can_author_custom_code' ) && lieve_can_author_custom_code() && lieve_theme_setting( 'execute_php' ) ) { continue; }
			$count = 0; $clean = lieve_sanitize_node( lieve_editor_preview_node( $node ), 0, $count );
			if ( ! $clean ) { continue; }
			try { $html = lieve_render_editor_preview( $clean, $post ); }
			catch ( Throwable $error ) { continue; } // The regular preview request remains the recovery path.
			if ( $bytes + strlen( $html ) > 524288 ) { $finished = true; return; }
			$previews[ $clean['id'] ] = $html; $bytes += strlen( $html );
		}
	};
	$walk( $document['children'] ?? array() );
	return $previews;
}
