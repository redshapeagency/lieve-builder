<?php
/**
 * Builder document storage and sanitization.
 *
 * @package LieveBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'LIEVE_META_DOCUMENT', '_lieve_builder_document' );
define( 'LIEVE_META_ENABLED', '_lieve_builder_enabled' );
define( 'LIEVE_META_HEADER_TEMPLATE', '_lieve_header_template_id' );
define( 'LIEVE_META_FOOTER_TEMPLATE', '_lieve_footer_template_id' );
require_once __DIR__ . '/../builder/element-identity.php';
require_once __DIR__ . '/../builder/interactions.php';
require_once __DIR__ . '/../builder/motion.php';
require_once __DIR__ . '/../builder/element-conditions.php';
require_once __DIR__ . '/document-storage.php';
require_once __DIR__ . '/../builder/custom-code.php';

/**
 * Return a new empty builder document.
 *
 * @return array
 */
function lieve_empty_document() {
	return array(
		'version'  => 1,
		'children' => array(),
	);
}

/**
 * Whether a post is rendered through Lieve Builder.
 *
 * @param int $post_id Post ID.
 * @return bool
 */
function lieve_builder_is_enabled( $post_id ) {
	return '1' === get_post_meta( $post_id, LIEVE_META_ENABLED, true );
}

/**
 * Read and normalize a builder document.
 *
 * @param int $post_id Post ID.
 * @return array
 */
function lieve_get_document( $post_id ) {
	$document = get_post_meta( $post_id, LIEVE_META_DOCUMENT, true );

	if ( is_string( $document ) ) {
		$decoded = json_decode( $document, true );
		$document = is_array( $decoded ) ? $decoded : array();
	}

	$document = lieve_sanitize_document( $document );
	// Runtime provenance only. Never trust or persist a client-supplied owner.
	$document['sourcePostId'] = (int) $post_id;
	return $document;
}

/**
 * Sanitize a complete builder document.
 *
 * @param mixed $document Raw document.
 * @return array
 */
function lieve_sanitize_document( $document ) {
	if ( ! is_array( $document ) ) {
		return lieve_empty_document();
	}

	$count    = 0;
	$children = isset( $document['children'] ) && is_array( $document['children'] ) ? $document['children'] : array();
	$output   = array();

	foreach ( $children as $node ) {
		$clean = lieve_sanitize_node( $node, 0, $count );
		if ( $clean ) {
			$output[] = $clean;
		}
	}
	// Each public identifier has its own namespace; custom values must be unique.
	$walk = static function( &$nodes, $visit ) use ( &$walk ) { foreach ( $nodes as &$item ) { $visit( $item ); $walk( $item['children'], $visit ); } };
	foreach ( array( 'htmlId' => 'lieve_element_html_id', 'dataLieveId' => 'lieve_element_data_id' ) as $property => $identifier ) {
		$used_ids = array();
		$walk( $output, static function( $item ) use ( &$used_ids, $identifier ) { $used_ids[ $identifier( array( 'id' => $item['id'] ) ) ] = true; } );
		$walk( $output, static function( &$item ) use ( &$used_ids, $property ) {
			if ( empty( $item['props'][ $property ] ) ) { return; }
			$id = $item['props'][ $property ];
			if ( isset( $used_ids[ $id ] ) ) { unset( $item['props'][ $property ] ); }
			else { $used_ids[ $id ] = true; }
		} );
	}

	return array(
		'version'  => 1,
		'children' => $output,
	);
}

/**
 * Sanitize one node recursively.
 *
 * @param mixed $node  Raw node.
 * @param int   $depth Current nesting depth.
 * @param int   $count Total node count, passed by reference.
 * @return array|null
 */
function lieve_sanitize_node( $node, $depth, &$count ) {
	$allowed_types = function_exists( 'lieve_element_registry' ) ? array_keys( lieve_element_registry() ) : array( 'section', 'container', 'heading', 'text', 'button', 'image', 'spacer' );

	if ( ! is_array( $node ) || $depth > 12 || $count >= 400 ) {
		return null;
	}

	$type = isset( $node['type'] ) ? sanitize_key( $node['type'] ) : '';
	if ( ! in_array( $type, $allowed_types, true ) ) {
		return null;
	}

	$count++;
	$id = isset( $node['id'] ) ? preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) $node['id'] ) : '';
	if ( '' === $id ) {
		$id = wp_generate_uuid4();
	}

	$props = isset( $node['props'] ) && is_array( $node['props'] ) ? $node['props'] : array();
	$clean = array(
		'id'       => substr( $id, 0, 64 ),
		'type'     => $type,
		'props'    => lieve_sanitize_props( $type, $props ),
		'children' => array(),
	);

	$can_nest = function_exists( 'lieve_element_can_nest' ) ? lieve_element_can_nest( $type ) : in_array( $type, array( 'section', 'container' ), true );
	if ( $can_nest && ! empty( $node['children'] ) && is_array( $node['children'] ) ) {
		foreach ( $node['children'] as $child ) {
			$clean_child = lieve_sanitize_node( $child, $depth + 1, $count );
			if ( $clean_child ) {
				$clean['children'][] = $clean_child;
			}
		}
	}

	return $clean;
}

/** Sanitize an attribute value without splitting a UTF-8 character at the limit. */
function lieve_sanitize_attribute_value( $value ) {
	// Attribute values are escaped by the tag processor, not treated as HTML content.
	// Keep literal text and percent-encoded URLs intact; remove invalid UTF-8/control bytes.
	$value = function_exists( 'wp_check_invalid_utf8' ) ? wp_check_invalid_utf8( (string) $value ) : (string) $value;
	$value = preg_replace( '/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u', '', $value ) ?? '';
	return function_exists( 'mb_substr' ) ? mb_substr( $value, 0, 500, 'UTF-8' ) : implode( '', array_slice( preg_split( '//u', $value, -1, PREG_SPLIT_NO_EMPTY ) ?: array(), 0, 500 ) );
}

/** Arbitrary HTML names, excluding executable attributes and dedicated builder controls. */
function lieve_custom_attribute_name_allowed( $name ) {
	return strlen( $name ) <= 100 && preg_match( '/^[a-z_][a-z0-9_.:-]*$/D', $name ) && ! preg_match( '/^on|^data-(lieve-|editor-|wp-|id$)/', $name ) && ! in_array( $name, array( 'id', 'class', 'style', 'srcdoc' ), true );
}

/** URL-bearing attributes require safe protocols, including URL lists and srcset candidates. */
function lieve_custom_attribute_value_allowed( $name, $value ) {
	if ( ! in_array( $name, array( 'href', 'src', 'action', 'formaction', 'poster', 'cite', 'background', 'longdesc', 'manifest', 'codebase', 'profile', 'data', 'xlink:href', 'ping', 'archive', 'srcset', 'imagesrcset' ), true ) ) { return true; }
	$value = html_entity_decode( $value, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	foreach ( array_merge( array( $value ), preg_split( '/[\s,]+/', $value ) ) as $url ) {
		$url = preg_replace( '/[\x00-\x20\x7f]+/', '', $url );
		// Only an initial scheme can execute. Colons in relative paths and later
		// srcset candidates must not be mistaken for the first URL's protocol.
		if ( ! preg_match( '/^([^\/?#:]*):/', $url ) ) { continue; }
		if ( strtolower( wp_kses_bad_protocol( $url, wp_allowed_protocols() ) ) !== strtolower( $url ) ) { return false; }
	}
	return true;
}

/**
 * Sanitize node properties using explicit allowlists.
 *
 * @param string $type  Node type.
 * @param array  $props Raw properties.
 * @return array
 */
function lieve_sanitize_props( $type, $props ) {
	$listing = function_exists( 'lieve_listing_supports' ) && lieve_listing_supports( $type ) && isset( $props['listing'] ) ? lieve_sanitize_listing( $props['listing'] ) : array();
	$clean = array();
	if ( 'html' === $type && is_string( $props['codeApproval'] ?? null ) && preg_match( '/^[a-f0-9]{64}$/D', $props['codeApproval'] ) ) { $clean['codeApproval'] = $props['codeApproval']; }
	if ( isset( $props['interactions'] ) ) { $clean['interactions'] = lieve_sanitize_interactions( $props['interactions'] ); }
	if ( isset( $props['motion'] ) ) { $clean['motion'] = lieve_sanitize_motion( $props['motion'] ); }
	if ( array_key_exists( 'conditions', $props ) ) { $clean['conditions'] = lieve_sanitize_element_conditions( $props['conditions'] ); }
	if ( isset( $props['classIds'] ) && is_array( $props['classIds'] ) ) {
		$clean['classIds'] = array_slice( array_values( array_unique( array_filter( $props['classIds'], static function( $id ) { return is_string( $id ) && preg_match( '/^ds_[a-z0-9]{8,24}$/D', $id ); } ) ) ), 0, 30 );
	}
	// Missing inherits Settings → Markup (enabled by default). Only JSON booleans override.
	foreach ( array( 'outputLieveId', 'outputHtmlId' ) as $flag ) {
		if ( isset( $props[ $flag ] ) && is_bool( $props[ $flag ] ) ) { $clean[ $flag ] = $props[ $flag ]; }
	}
	// Missing class keys inherit Settings → Markup. Overrides never inject new classes.
	if ( isset( $props['markupClasses'] ) && is_array( $props['markupClasses'] ) ) {
		foreach ( array_slice( $props['markupClasses'], 0, 100, true ) as $name => $enabled ) {
			if ( is_string( $name ) && strlen( $name ) <= 100 && preg_match( '/^(?:--|[a-zA-Z_]|-[a-zA-Z_])[a-zA-Z0-9_-]*$/D', $name ) && is_bool( $enabled ) ) { $clean['markupClasses'][ $name ] = $enabled; }
		}
	}
	if ( isset( $props['htmlId'] ) && is_string( $props['htmlId'] ) && preg_match( '/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/D', $props['htmlId'] ) && 0 !== strpos( $props['htmlId'], 'lieve-' ) ) {
		$clean['htmlId'] = $props['htmlId'];
	}
	if ( isset( $props['dataLieveId'] ) && is_string( $props['dataLieveId'] ) && preg_match( '/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/D', $props['dataLieveId'] ) && 0 !== strpos( $props['dataLieveId'], 'lieve-data-' ) ) {
		$clean['dataLieveId'] = $props['dataLieveId'];
	}
	if ( $listing ) { $clean['listing'] = $listing; }
	if ( function_exists( 'lieve_sanitize_styles' ) && isset( $props['styles'] ) ) {
		$styles = lieve_sanitize_styles( $props['styles'], $type );
		if ( $styles ) { $clean['styles'] = $styles; }
	}
	foreach ( array( 'editorLabel' ) as $key ) {
		if ( isset( $props[ $key ] ) && is_scalar( $props[ $key ] ) ) {
			$value = sanitize_text_field( $props[ $key ] );
			$clean[ $key ] = function_exists( 'mb_substr' ) ? mb_substr( $value, 0, 120, 'UTF-8' ) : implode( '', array_slice( preg_split( '//u', $value, -1, PREG_SPLIT_NO_EMPTY ) ?: array(), 0, 120 ) );
		}
	}
	$attributes = $props['attributes'] ?? array();
	if ( isset( $props['attributeRows'] ) && is_array( $props['attributeRows'] ) ) {
		// Ordered repeater rows are authoritative; legacy maps remain compatible.
		$clean['attributeRows'] = array();
		$attributes = array();
		foreach ( array_slice( $props['attributeRows'], 0, 30 ) as $row ) {
			if ( ! is_array( $row ) || ! isset( $row['name'] ) || ! is_string( $row['name'] ) || ( isset( $row['value'] ) && ! is_scalar( $row['value'] ) ) ) { continue; }
			$name = strtolower( trim( $row['name'] ) );
			if ( '' !== $name && ! lieve_custom_attribute_name_allowed( $name ) ) { continue; }
			$value = lieve_sanitize_attribute_value( (string) ( $row['value'] ?? '' ) );
			if ( ! lieve_custom_attribute_value_allowed( $name, $value ) ) { continue; }
			$clean['attributeRows'][] = array( 'name' => $name, 'value' => $value );
			if ( '' !== $name && ! array_key_exists( $name, $attributes ) ) { $attributes[ $name ] = $value; }
		}
	}
	if ( is_array( $attributes ) ) {
		foreach ( array_slice( $attributes, 0, 30, true ) as $key => $value ) {
			$key = strtolower( trim( (string) $key ) );
			if ( ! is_scalar( $value ) || ! lieve_custom_attribute_name_allowed( $key ) ) { continue; }
			$value = lieve_sanitize_attribute_value( (string) $value );
			if ( lieve_custom_attribute_value_allowed( $key, $value ) && ! isset( $clean['attributes'][ $key ] ) ) { $clean['attributes'][ $key ] = $value; }
		}
	}

	$color_keys = array( 'backgroundColor', 'color' );
	foreach ( $color_keys as $key ) {
		if ( ! empty( $props[ $key ] ) ) {
			$color = sanitize_hex_color( $props[ $key ] );
			if ( $color ) {
				$clean[ $key ] = $color;
			}
		}
	}

	$numeric_limits = array(
		'paddingTop'    => array( 0, 240 ),
		'paddingRight'  => array( 0, 240 ),
		'paddingBottom' => array( 0, 240 ),
		'paddingLeft'   => array( 0, 240 ),
		'marginTop'     => array( 0, 240 ),
		'marginBottom'  => array( 0, 240 ),
		'borderRadius'  => array( 0, 120 ),
		'fontSize'      => array( 10, 120 ),
		'maxWidth'      => array( 240, 1800 ),
		'minHeight'     => array( 0, 1200 ),
		'gap'           => array( 0, 160 ),
		'height'        => array( 8, 400 ),
		'width'         => array( 10, 100 ),
	);

	foreach ( $numeric_limits as $key => $limits ) {
		if ( isset( $props[ $key ] ) && '' !== $props[ $key ] ) {
			$clean[ $key ] = min( $limits[1], max( $limits[0], (int) $props[ $key ] ) );
		}
	}

	if ( ! empty( $props['className'] ) ) {
		$classes = preg_split( '/\s+/', (string) $props['className'] );
		$classes = array_filter( array_map( 'sanitize_html_class', array_slice( $classes, 0, 100 ) ) );
		if ( $classes ) {
			$clean['className'] = implode( ' ', $classes );
		}
	}

	if ( isset( $props['textAlign'] ) && in_array( $props['textAlign'], array( 'left', 'center', 'right' ), true ) ) {
		$clean['textAlign'] = $props['textAlign'];
	}

	if ( isset( $props['fontWeight'] ) && in_array( (string) $props['fontWeight'], array( '400', '500', '600', '700', '800' ), true ) ) {
		$clean['fontWeight'] = (string) $props['fontWeight'];
	}

	if ( isset( $props['direction'] ) && in_array( $props['direction'], array( 'column', 'row' ), true ) ) {
		$clean['direction'] = $props['direction'];
	}

	if ( isset( $props['alignItems'] ) && in_array( $props['alignItems'], array( 'stretch', 'flex-start', 'center', 'flex-end' ), true ) ) {
		$clean['alignItems'] = $props['alignItems'];
	}

	if ( isset( $props['justifyContent'] ) && in_array( $props['justifyContent'], array( 'flex-start', 'center', 'flex-end', 'space-between', 'space-around' ), true ) ) {
		$clean['justifyContent'] = $props['justifyContent'];
	}

	switch ( $type ) {
		case 'heading':
			$clean['content'] = isset( $props['content'] ) ? sanitize_text_field( $props['content'] ) : '';
			$clean['level']   = isset( $props['level'] ) ? min( 6, max( 1, (int) $props['level'] ) ) : 2;
			break;

		case 'text':
			$clean['content'] = isset( $props['content'] ) ? wp_kses_post( $props['content'] ) : '';
			break;

		case 'button':
			$clean['label']  = isset( $props['label'] ) ? sanitize_text_field( $props['label'] ) : '';
			$clean['url']    = isset( $props['url'] ) ? esc_url_raw( $props['url'] ) : '';
			$clean['target'] = ! empty( $props['target'] );
			break;

		case 'image':
			$clean['attachmentId'] = isset( $props['attachmentId'] ) ? absint( $props['attachmentId'] ) : 0;
			$clean['url']          = isset( $props['url'] ) ? esc_url_raw( $props['url'] ) : '';
			$clean['alt']          = isset( $props['alt'] ) ? sanitize_text_field( $props['alt'] ) : '';
			if ( in_array( $props['imageSource'] ?? '', array( 'attachment', 'url' ), true ) ) { $clean['imageSource'] = $props['imageSource']; }
			if ( 'url' === ( $clean['imageSource'] ?? '' ) ) { $clean['attachmentId'] = 0; }
			if ( isset( $props['imageSize'] ) && is_string( $props['imageSize'] ) ) { $clean['imageSize'] = sanitize_key( $props['imageSize'] ); }
			foreach ( array( 'imageLoading' => array( 'auto', 'lazy', 'eager' ), 'imagePriority' => array( 'auto', 'high', 'low' ) ) as $key => $values ) { if ( in_array( $props[ $key ] ?? '', $values, true ) ) { $clean[ $key ] = $props[ $key ]; } }
			break;
	}

	$registry = function_exists( 'lieve_element_registry' ) ? lieve_element_registry() : array();
	if ( ! empty( $registry[ $type ]['children'] ) && isset( $props['label'] ) && is_scalar( $props['label'] ) ) { $clean['label'] = sanitize_text_field( $props['label'] ); }
	foreach ( $registry[ $type ]['fields'] ?? array() as $key => $field ) {
		if ( ! array_key_exists( $key, $props ) || isset( $clean[ $key ] ) ) { continue; }
		$value = $props[ $key ];
		if ( ! is_scalar( $value ) ) { continue; }
		switch ( $field['type'] ) {
			case 'checkbox': $clean[ $key ] = ! empty( $value ); break;
			case 'url': $clean[ $key ] = esc_url_raw( $value ); break;
			case 'number':
				if ( is_numeric( $value ) && '' !== $value ) { $clean[ $key ] = max( -1000000, min( 1000000, (float) $value ) ); }
				break;
			case 'select':
				if ( array_key_exists( (string) $value, $field['options'] ) ) { $clean[ $key ] = sanitize_text_field( $value ); }
				break;
			case 'textarea':
				$clean[ $key ] = ( 'code' === $type && 'content' === $key || 'html' === $type && in_array( $key, array( 'content', 'customCss', 'customJs' ), true ) ) ? wp_check_invalid_utf8( (string) $value ) : ( 'text' === $type && 'content' === $key ? wp_kses_post( $value ) : sanitize_textarea_field( $value ) );
				// Strict write validation enforces size. Never cut authored HTML/UTF-8 here.
				break;
			default: $clean[ $key ] = substr( sanitize_text_field( $value ), 0, 2000 );
		}
	}

	foreach ( $props as $key => $value ) {
		if ( function_exists( 'lieve_dynamic_reference' ) && lieve_dynamic_accepts( lieve_dynamic_reference( $value ), lieve_dynamic_prop_kind( $type, $key ) ) ) { $clean[ $key ] = trim( $value ); }
	}
	return function_exists( 'lieve_component_sanitize_props' ) ? lieve_component_sanitize_props( $props, $clean ) : $clean;
}
