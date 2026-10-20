<?php
/** Reusable classes. Stored independently from variables and colors. */
defined( 'ABSPATH' ) || exit;
define( 'LIEVE_CLASSES_OPTION', 'lieve_global_classes' );

function lieve_classes_empty() {
	return array( 'version' => 1, 'categories' => array(), 'classes' => array(), 'variables' => array(), 'colors' => array(), 'palettes' => array(), 'darkMode' => 'auto' );
}
/** Declaration lists only. Selectors and media queries are generated, never interpolated. */
function lieve_class_declarations( $value ) {
	if ( ! is_string( $value ) || strlen( $value ) > 12000 ) { return false; }
	$value = trim( preg_replace( '~/\*.*?\*/~s', '', $value ) );
	if ( false !== strpos( $value, '/*' ) || false !== strpos( $value, '*/' ) ) { return false; }
	if ( preg_match( '/[{}<>@\\\\\x00-\x08\x0b\x0c\x0e-\x1f]|expression\s*\(|(?:javascript|vbscript|data)\s*:|(?:behavior|-moz-binding)\s*:/i', $value ) ) { return false; }
	$parts = array(); $start = 0; $depth = 0; $quote = '';
	for ( $i = 0, $length = strlen( $value ); $i < $length; $i++ ) {
		$char = $value[ $i ];
		if ( $quote ) { if ( $char === $quote ) { $quote = ''; } continue; }
		if ( '"' === $char || "'" === $char ) { $quote = $char; }
		elseif ( '(' === $char ) { $depth++; }
		elseif ( ')' === $char ) { if ( --$depth < 0 ) { return false; } }
		elseif ( ';' === $char && ! $depth ) { $parts[] = substr( $value, $start, $i - $start ); $start = $i + 1; }
	}
	if ( $depth || $quote ) { return false; }
	$parts[] = substr( $value, $start ); $clean = array();
	foreach ( $parts as $part ) {
		if ( '' === trim( $part ) ) { continue; }
		if ( ! preg_match( '/^\s*((?:--[a-zA-Z_][a-zA-Z0-9_-]*|-?[a-zA-Z][a-zA-Z0-9-]*))\s*:\s*(\S[\s\S]*)$/', $part, $match ) ) { return false; }
		$clean[] = $match[1] . ':' . trim( $match[2] ) . ';';
	}
	return implode( '', $clean );
}
function lieve_normalize_classes( $raw ) {
	$error = new WP_Error( 'lieve_invalid_classes', 'Each class needs a unique CSS name, ID, category and valid CSS declarations. Use declarations only, without selectors or braces.', array( 'status' => 400 ) );
	if ( ! is_array( $raw ) || strlen( wp_json_encode( $raw ) ) > 1500000 || 1 !== ( $raw['version'] ?? null ) || ! isset( $raw['classes'], $raw['categories'] ) || ! is_array( $raw['classes'] ) || ! is_array( $raw['categories'] ) || array_values( $raw['classes'] ) !== $raw['classes'] || array_values( $raw['categories'] ) !== $raw['categories'] || count( $raw['classes'] ) > 1000 || count( $raw['categories'] ) > 100 ) { return $error; }
	// Reuse the exact category/condition validation of the other managers.
	$groups = lieve_design_empty(); $groups['categories'] = $raw['categories'];
	$groups = lieve_normalize_design_system( $groups ); if ( is_wp_error( $groups ) ) { return $groups; }
	$data = lieve_classes_empty(); $data['categories'] = $groups['categories'];
	$ids = array_fill_keys( array_column( $data['categories'], 'id' ), true ); $names = array(); $category_ids = $ids;
	foreach ( $raw['classes'] as $item ) {
		if ( ! is_array( $item ) || ! lieve_design_id( $item['id'] ?? '' ) || isset( $ids[ $item['id'] ] ) || ! lieve_design_name( $item['name'] ?? '' ) || ! isset( $item['enabled'] ) || ! is_bool( $item['enabled'] ) || ! is_string( $item['categoryId'] ?? null ) || ( $item['categoryId'] && ! isset( $category_ids[ $item['categoryId'] ] ) ) ) { return $error; }
		$ids[ $item['id'] ] = true; $conditions = lieve_design_conditions( $item['conditions'] ?? array() ); if ( false === $conditions ) { return $error; }
		if ( isset( $item['description'] ) && ( ! is_string( $item['description'] ) || strlen( $item['description'] ) > 4000 ) ) { return $error; }
		$aliases = $item['aliases'] ?? array(); if ( ! is_array( $aliases ) || array_values( $aliases ) !== $aliases || count( $aliases ) > 20 ) { return $error; }
		foreach ( array_merge( array( $item['name'] ), $aliases ) as $name ) { if ( ! lieve_design_name( $name ) || isset( $names[ $name ] ) ) { return $error; } $names[ $name ] = true; }
		$value = lieve_class_declarations( $item['value'] ?? null ); if ( false === $value ) { return $error; }
		$values = $item['values'] ?? array(); $states = $item['states'] ?? array(); $responsive_states = $item['responsiveStates'] ?? array();
		if ( ! is_array( $values ) || ! is_array( $states ) || count( $values ) > 30 || count( $states ) > 6 ) { return $error; }
		foreach ( $values as $id => $css ) { if ( ! lieve_valid_breakpoint_id( $id ) || false === lieve_class_declarations( $css ) ) { return $error; } }
		foreach ( $states as $state => $css ) { if ( ! in_array( $state, array( 'hover', 'focus-visible', 'active', 'disabled', 'before', 'after' ), true ) || false === lieve_class_declarations( $css ) ) { return $error; } }
		if ( ! is_array( $responsive_states ) || count( $responsive_states ) > 30 ) { return $error; }
		foreach ( $responsive_states as $id => $context ) {
			if ( ! lieve_valid_breakpoint_id( $id ) || ! is_array( $context ) || count( $context ) > 6 ) { return $error; }
			foreach ( $context as $state => $css ) { if ( ! in_array( $state, array( 'hover', 'focus-visible', 'active', 'disabled', 'before', 'after' ), true ) || false === lieve_class_declarations( $css ) ) { return $error; } }
		}
		$trash = lieve_design_trash_metadata( $item ); if ( false === $trash ) { return $error; }
		$data['classes'][] = array_merge( array( 'id' => $item['id'], 'name' => $item['name'], 'categoryId' => $item['categoryId'], 'enabled' => $item['enabled'], 'conditions' => $conditions, 'aliases' => $aliases, 'description' => sanitize_textarea_field( substr( (string) ( $item['description'] ?? '' ), 0, 1000 ) ), 'value' => trim( $item['value'] ), 'values' => $values, 'states' => $states, 'responsiveStates' => $responsive_states ), $trash );
	}
	return $data;
}
function lieve_classes() { $data = lieve_normalize_classes( get_option( LIEVE_CLASSES_OPTION, lieve_classes_empty() ) ); return is_wp_error( $data ) ? lieve_classes_empty() : $data; }
function lieve_classes_revision( $data = null ) { return hash( 'sha256', wp_json_encode( $data ?? lieve_classes() ) ); }
function lieve_classes_active_ids( $data, $post_id = 0 ) {
	return array_values( array_column( array_filter( $data['classes'], function( $item ) use ( $post_id ) { return empty( $item['trashed'] ) && $item['enabled'] && lieve_design_matches( $item['conditions'], $post_id ); } ), 'id' ) );
}
function lieve_classes_context_ids( $data, $post_id ) {
	$post = $post_id ? get_post( $post_id ) : null;
	return $post && function_exists( 'lieve_with_editor_page_context' ) ? lieve_with_editor_page_context( $post, function() use ( $data, $post_id ) { return lieve_classes_active_ids( $data, $post_id ); } ) : lieve_classes_active_ids( $data );
}
function lieve_class_names( $ids, $data = null ) {
	static $library = null; static $source = null;
	if ( null === $data ) { $raw = get_option( LIEVE_CLASSES_OPTION, lieve_classes_empty() ); if ( null === $library || $raw !== $source ) { $source = $raw; $library = lieve_normalize_classes( $raw ); if ( is_wp_error( $library ) ) { $library = lieve_classes_empty(); } } $data = $library; } $names = array();
	$by_id = array(); foreach ( $data['classes'] as $item ) { if ( empty( $item['trashed'] ) ) { $by_id[ $item['id'] ] = $item['name']; } }
	foreach ( array_unique( (array) $ids ) as $id ) { if ( isset( $by_id[ $id ] ) ) { $names[] = $by_id[ $id ]; } }
	return $names;
}
function lieve_classes_css( $data = null, $active_ids = null ) {
	$data = $data ?? lieve_classes(); $active = array_flip( $active_ids ?? lieve_classes_active_ids( $data, get_queried_object_id() ) ); $css = ''; $order = lieve_breakpoint_order();
	$rules = function( $item, $declarations, $state = '' ) {
		$value = lieve_class_declarations( $declarations ); if ( ! $value ) { return ''; }
		$value = lieve_dimension_css( $value );
		$suffix = $state ? ( in_array( $state, array( 'before', 'after' ), true ) ? '::' : ':' ) . $state : '';
		$names = array_merge( array( $item['name'] ), $item['aliases'] );
		$selector = implode( ',', array_map( function( $name ) use ( $suffix ) { return '.' . $name . $suffix; }, $names ) );
		$overlay = ''; if ( ! in_array( $state, array( 'before', 'after' ), true ) && function_exists( 'lieve_gradient_overlay_css' ) ) { foreach ( $names as $name ) { $overlay .= lieve_gradient_overlay_css( '.' . $name . $suffix, $value ); } }
		return $selector . '{' . $value . '}' . $overlay;
	};
	foreach ( $data['classes'] as $item ) {
		if ( ! empty( $item['trashed'] ) || ! isset( $active[ $item['id'] ] ) ) { continue; }
		$css .= $rules( $item, $item['value'] );
		foreach ( $item['states'] as $state => $value ) { $css .= $rules( $item, $value, $state ); }
		// A base override applies everywhere; the same cascade as element styles follows.
		if ( isset( $item['values'][ $order[0]['id'] ] ) ) { $css .= $rules( $item, $item['values'][ $order[0]['id'] ] ); }
		foreach ( $item['responsiveStates'][ $order[0]['id'] ] ?? array() as $state => $value ) { $css .= $rules( $item, $value, $state ); }
	}
	foreach ( array_slice( $order, 1 ) as $bp ) {
		$ruleset = ''; foreach ( $data['classes'] as $item ) { if ( ! empty( $item['trashed'] ) || ! isset( $active[ $item['id'] ] ) ) { continue; } $ruleset .= $rules( $item, $item['values'][ $bp['id'] ] ?? '' ); foreach ( $item['responsiveStates'][ $bp['id'] ] ?? array() as $state => $value ) { $ruleset .= $rules( $item, $value, $state ); } }
		if ( $ruleset ) { $css .= '@media(' . lieve_breakpoint_media( $bp, $order[0] ) . '){' . $ruleset . '}'; }
	}
	return $css;
}
function lieve_print_classes_css() { lieve_print_generated_css( lieve_classes_css(), 'id', 'lieve-global-classes' ); }
add_action( 'wp_head', 'lieve_print_classes_css', 31 );
function lieve_classes_response( $data, $post_id = 0 ) { return rest_ensure_response( array( 'data' => $data, 'revision' => lieve_classes_revision( $data ), 'activeIds' => $post_id ? lieve_classes_context_ids( $data, $post_id ) : array() ) ); }
function lieve_classes_config( $post_id = 0 ) {
	$config = lieve_design_config( $post_id ); $data = lieve_classes();
	return array_merge( $config, array( 'data' => $data, 'revision' => lieve_classes_revision( $data ), 'activeIds' => $post_id ? lieve_classes_context_ids( $data, $post_id ) : array(), 'url' => esc_url_raw( rest_url( 'lieve/v1/classes' ) ), 'previewUrl' => $post_id ? esc_url_raw( rest_url( 'lieve/v1/classes/preview/' . $post_id ) ) : '' ) );
}
function lieve_rest_get_classes( $request ) {
	$post_id = absint( $request->get_param( 'postId' ) ); if ( $post_id && ! current_user_can( 'edit_post', $post_id ) ) { return new WP_Error( 'lieve_forbidden_context', 'You cannot preview this content.', array( 'status' => 403 ) ); }
	return lieve_classes_response( lieve_classes(), $post_id );
}
function lieve_rest_save_classes( $request ) {
	$raw = $request->get_json_params(); $data = lieve_normalize_classes( $raw['data'] ?? null ); if ( is_wp_error( $data ) ) { return $data; }
	$post_id = absint( $raw['postId'] ?? 0 ); if ( $post_id && ! current_user_can( 'edit_post', $post_id ) ) { return new WP_Error( 'lieve_forbidden_context', 'You cannot preview this content.', array( 'status' => 403 ) ); }
	$lock = 'lieve_classes_lock'; $locked_at = get_option( $lock, 0 );
	if ( $locked_at && time() - (int) $locked_at > 30 ) { global $wpdb; $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s", $lock, (string) $locked_at ) ); wp_cache_delete( $lock, 'options' ); wp_cache_delete( 'notoptions', 'options' ); }
	if ( ! add_option( $lock, time(), '', false ) ) { return new WP_Error( 'lieve_classes_busy', 'Another save is in progress. Try again.', array( 'status' => 409 ) ); }
	try {
		if ( ! is_string( $raw['revision'] ?? null ) || ! hash_equals( lieve_classes_revision(), $raw['revision'] ) ) { return new WP_Error( 'lieve_classes_conflict', 'Classes changed in another tab. Export your draft and reload before saving.', array( 'status' => 409 ) ); }
		if ( false === update_option( LIEVE_CLASSES_OPTION, $data, false ) && lieve_classes_revision() !== lieve_classes_revision( $data ) ) { return new WP_Error( 'lieve_classes_save_failed', 'Classes could not be saved. Your draft is still available.', array( 'status' => 500 ) ); }
		return lieve_classes_response( $data, $post_id );
	} finally { delete_option( $lock ); }
}
function lieve_rest_preview_classes( $request ) {
	$data = lieve_normalize_classes( $request->get_json_params()['data'] ?? null ); if ( is_wp_error( $data ) ) { return $data; }
	if ( ! get_post( (int) $request['id'] ) ) { return new WP_Error( 'lieve_missing_context', 'Preview content not found.', array( 'status' => 404 ) ); }
	return lieve_classes_response( $data, (int) $request['id'] );
}
function lieve_register_classes_routes() {
	$context = array( 'type' => 'integer', 'minimum' => 0, 'default' => 0 );
	$data = array( 'type' => 'object', 'required' => true, 'validate_callback' => function( $value ) { return ! is_wp_error( lieve_normalize_classes( $value ) ); } );
	register_rest_route( 'lieve/v1', '/classes', array(
		array( 'methods' => WP_REST_Server::READABLE, 'callback' => 'lieve_rest_get_classes', 'permission_callback' => function() { return current_user_can( 'edit_posts' ); }, 'args' => array( 'postId' => $context ) ),
		array( 'methods' => WP_REST_Server::EDITABLE, 'callback' => 'lieve_rest_save_classes', 'permission_callback' => function() { return current_user_can( 'manage_options' ); }, 'args' => array( 'data' => $data, 'revision' => array( 'type' => 'string', 'required' => true, 'pattern' => '^[a-f0-9]{64}$' ), 'postId' => $context ) ),
	) );
	register_rest_route( 'lieve/v1', '/classes/preview/(?P<id>\d+)', array( 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'lieve_rest_preview_classes', 'permission_callback' => 'lieve_rest_can_edit_post', 'args' => array( 'data' => $data, 'id' => array( 'type' => 'integer', 'minimum' => 1 ) ) ) );
}
add_action( 'rest_api_init', 'lieve_register_classes_routes' );
function lieve_render_classes_page() { lieve_render_design_page( 'classes' ); }
function lieve_classes_empty_detail() {
	return '<div class="lieve-ds-detail-empty"><span class="lieve-ds-kicker">CLASS INSPECTOR</span><h3>One class.<br>A consistent website.</h3><p>Select a class to manage its reusable styles.</p><ol class="lieve-ds-guide"><li><strong>CSS & organization</strong><span>Write declarations and organize classes by category.</span></li><li><strong>Responsive styles & states</strong><span>Adapt styles at any breakpoint and define hover or focus.</span></li><li><strong>Display conditions</strong><span>Apply styles across the website or only where needed.</span></li></ol><div class="lieve-ds-safe-note">Your website stays unchanged until you save.</div></div>';
}
