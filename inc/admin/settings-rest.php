<?php
/** In-place Settings saves, with the same cookie/nonce flow as the design managers. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
require_once __DIR__ . '/../frontend/head.php';
require_once __DIR__ . '/../frontend/page-markup.php';

function lieve_settings_revision( $settings = null ) {
	return hash( 'sha256', wp_json_encode( null === $settings ? lieve_theme_settings() : $settings ) );
}

function lieve_settings_rest_schema() {
	$targets = array();
	foreach ( lieve_output_class_catalog() as $target => $definition ) {
		$targets[ $target ] = array( 'type' => 'object', 'additionalProperties' => false, 'required' => array( 'defaults', 'custom' ), 'properties' => array(
			'defaults' => array( 'type' => 'array', 'maxItems' => count( $definition['classes'] ), 'uniqueItems' => true, 'items' => array( 'type' => 'string', 'enum' => array_keys( $definition['classes'] ) ) ),
			'custom' => array( 'type' => 'string', 'maxLength' => 3029 ),
			'version' => array( 'type' => 'integer', 'enum' => array( 2 ) ),
		) );
	}
	$properties = array(
		'accent_start' => array( 'type' => 'string', 'pattern' => '^#[a-fA-F0-9]{3}([a-fA-F0-9]{3})?$' ),
		'accent_end' => array( 'type' => 'string', 'pattern' => '^#[a-fA-F0-9]{3}([a-fA-F0-9]{3})?$' ),
		'content_width' => array( 'type' => 'integer', 'minimum' => 480, 'maximum' => 1200 ),
		'wide_width' => array( 'type' => 'integer', 'minimum' => 720, 'maximum' => 1920 ),
		'popup_width' => array( 'type' => 'integer', 'minimum' => 320, 'maximum' => 1200 ),
		'enable_popups' => array( 'type' => 'boolean' ),
		'execute_php' => array( 'type' => 'boolean' ),
		'builder_post_types' => array( 'type' => 'array', 'uniqueItems' => true, 'maxItems' => count( lieve_builder_post_type_options() ), 'items' => array( 'type' => 'string', 'enum' => array_keys( lieve_builder_post_type_options() ) ) ),
		'css_loading_method' => array( 'type' => 'string', 'enum' => array( 'inline', 'external', 'internal' ) ),
		'preload_fonts' => array( 'type' => 'boolean' ),
		'editor_exit_destination' => array( 'type' => 'string', 'enum' => array_keys( lieve_editor_exit_destinations() ) ),
		'editor_exit_new_tab' => array( 'type' => 'boolean' ),
		'remove_wp_classes' => array( 'type' => 'boolean' ),
		'output_html_ids' => array( 'type' => 'boolean' ),
		'output_data_ids' => array( 'type' => 'boolean' ),
		'breakpoint_tablet' => array( 'type' => 'integer', 'minimum' => 320, 'maximum' => 2560 ),
		'breakpoint_mobile' => array( 'type' => 'integer', 'minimum' => 240, 'maximum' => 2559 ),
		'output_classes' => array( 'type' => 'object', 'additionalProperties' => false, 'properties' => $targets ),
		'output_ids' => lieve_page_markup_schema(),
		'head_items' => lieve_head_schema(),
	);
	return array( 'type' => 'object', 'additionalProperties' => false, 'required' => array_values( array_diff( array_keys( $properties ), array( 'head_items', 'output_ids', 'execute_php' ) ) ), 'properties' => $properties );
}

function lieve_register_settings_routes() {
	register_rest_route( 'lieve/v1', '/settings', array(
		'methods' => WP_REST_Server::EDITABLE,
		'callback' => 'lieve_rest_save_settings',
		'permission_callback' => static function() { return current_user_can( 'manage_options' ); },
		'args' => array(
			'data' => array_merge( lieve_settings_rest_schema(), array( 'required' => true, 'validate_callback' => 'lieve_validate_settings_rest_data' ) ),
			'revision' => array( 'type' => 'string', 'required' => true, 'pattern' => '^[a-f0-9]{64}$' ),
		),
	) );
}
add_action( 'rest_api_init', 'lieve_register_settings_routes' );

/** Reject coerced scalar/associative selections before WordPress array sanitization. */
function lieve_validate_settings_rest_data( $raw ) {
	if ( is_array( $raw ) && array_key_exists( 'output_ids', $raw ) ) { $ids = lieve_page_markup_validate( $raw['output_ids'], array() ); if ( is_wp_error( $ids ) ) { return $ids; } }
	if ( is_array( $raw ) && array_key_exists( 'head_items', $raw ) ) { $head = lieve_head_validate( $raw['head_items'] ); if ( is_wp_error( $head ) ) { return $head; } }
	if ( is_array( $raw ) && array_key_exists( 'builder_post_types', $raw ) ) {
		$types = $raw['builder_post_types'];
		if ( ! is_array( $types ) || ( $types && array_keys( $types ) !== range( 0, count( $types ) - 1 ) ) ) {
			return new WP_Error( 'lieve_settings_invalid_post_types', __( 'Choose the content types using the switches in General.', 'lieve-builder' ), array( 'status' => 400 ) );
		}
	}
	return rest_validate_value_from_schema( $raw, lieve_settings_rest_schema(), 'data' );
}

function lieve_rest_save_settings( $request ) {
	if ( ! current_user_can( 'manage_options' ) ) { return new WP_Error( 'lieve_settings_forbidden', __( 'You cannot manage these settings.', 'lieve-builder' ), array( 'status' => 403 ) ); }
	$raw = $request->get_param( 'data' );
	if ( ! empty( $raw['execute_php'] ) && ! lieve_theme_setting( 'execute_php' ) && ! lieve_can_author_custom_code() ) { return new WP_Error( 'lieve_php_execution_forbidden', __( 'You are not allowed to enable PHP execution. Theme-code editing and unfiltered HTML permissions are required.', 'lieve-builder' ), array( 'status' => 403 ) ); }
	$valid = lieve_validate_settings_rest_data( $raw );
	if ( is_wp_error( $valid ) ) { $valid->add_data( array_merge( (array) $valid->get_error_data(), array( 'status' => 400 ) ) ); return $valid; }
	if ( ! lieve_valid_breakpoints( array( 'tablet' => $raw['breakpoint_tablet'], 'mobile' => $raw['breakpoint_mobile'] ) ) ) { return new WP_Error( 'lieve_settings_invalid', __( 'Invalid legacy breakpoint values.', 'lieve-builder' ), array( 'status' => 400 ) ); }
	foreach ( $raw['output_classes'] as $target => $row ) {
		$names = preg_split( '/\s+/', trim( $row['custom'] ), -1, PREG_SPLIT_NO_EMPTY );
		if ( count( $names ) > 30 || array_filter( $names, static function( $name ) { return strlen( $name ) > 100 || ! preg_match( '/^(?:--|[a-zA-Z_]|-[a-zA-Z_])[a-zA-Z0-9_-]*$/D', $name ); } ) ) {
			return new WP_Error( 'lieve_settings_invalid_classes', sprintf( __( 'Invalid custom classes for %s. Use up to 30 CSS class names without dots.', 'lieve-builder' ), lieve_output_class_catalog()[ $target ]['label'] ), array( 'status' => 400 ) );
		}
	}
	$lock = 'lieve_settings_lock'; $value = time() . ':' . wp_generate_uuid4(); $old = get_option( $lock );
	if ( $old && time() - (int) $old > 120 ) {
		global $wpdb;
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s", $lock, $old ) );
		wp_cache_delete( $lock, 'options' ); wp_cache_delete( 'notoptions', 'options' );
	}
	if ( ! add_option( $lock, $value, '', false ) ) { return new WP_Error( 'lieve_settings_busy', __( 'Another Settings save is in progress. Try again in a moment.', 'lieve-builder' ), array( 'status' => 409 ) ); }
	try {
		$revision = $request->get_param( 'revision' );
		if ( ! is_string( $revision ) || ! hash_equals( lieve_settings_revision(), $revision ) ) { return new WP_Error( 'lieve_settings_conflict', __( 'Settings changed in another tab. Your draft is preserved; reload before saving.', 'lieve-builder' ), array( 'status' => 409 ) ); }
		if ( ! array_key_exists( 'head_items', $raw ) ) { $raw['head_items'] = lieve_theme_setting( 'head_items' ); } // Preserve policies for older clients.
		if ( ! array_key_exists( 'output_ids', $raw ) ) { $raw['output_ids'] = lieve_theme_setting( 'output_ids' ); }
		if ( ! array_key_exists( 'execute_php', $raw ) ) { $raw['execute_php'] = lieve_theme_setting( 'execute_php' ); }
		$clean = lieve_sanitize_theme_settings( $raw );
		if ( false === update_option( LIEVE_SETTINGS_OPTION, $clean ) && lieve_settings_revision() !== lieve_settings_revision( $clean ) ) { return new WP_Error( 'lieve_settings_save_failed', __( 'Settings could not be saved. Your draft is still available.', 'lieve-builder' ), array( 'status' => 500 ) ); }
		return rest_ensure_response( array( 'data' => lieve_theme_settings(), 'revision' => lieve_settings_revision() ) );
	} finally { if ( get_option( $lock ) === $value ) { delete_option( $lock ); } }
}
