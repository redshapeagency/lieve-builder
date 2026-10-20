<?php
/** Generated CSS delivery. Content-addressed files also remain valid in static snapshots.
 * @package LieveBuilder
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_css_frontend_context() {
	return ! is_admin() && ! is_preview()
		&& empty( $GLOBALS['lieve_element_preview'] ) && empty( $GLOBALS['lieve_full_preview'] ) && ! ( defined( 'REST_REQUEST' ) && REST_REQUEST );
}

function lieve_css_loading_method() {
	$method = lieve_theme_setting( 'css_loading_method' );
	return in_array( $method, array( 'inline', 'external', 'internal' ), true ) ? $method : 'internal';
}

function lieve_use_external_css() { return lieve_css_frontend_context() && empty( $GLOBALS['lieve_dynamic_request_bound'] ) && 'external' === lieve_css_loading_method(); }

/** Only server-generated CSS and server-owned paths enter this cache. Failure stays internal. */
function lieve_generated_css_file( $css ) {
	if ( ! is_string( $css ) || '' === trim( $css ) ) { return ''; }
	$uploads = wp_upload_dir( null, false );
	if ( ! empty( $uploads['error'] ) || empty( $uploads['basedir'] ) || empty( $uploads['baseurl'] ) ) { return ''; }
	$directory = trailingslashit( $uploads['basedir'] ) . 'lieve-builder-css';
	$name = hash( 'sha256', $css ) . '.css'; $path = $directory . '/' . $name;
	$url = trailingslashit( $uploads['baseurl'] ) . 'lieve-builder-css/' . $name;
	if ( is_file( $path ) && is_readable( $path ) && filesize( $path ) === strlen( $css ) ) { if ( filemtime( $path ) < time() - 86400 ) { @touch( $path ); } return $url; }
	if ( ! wp_mkdir_p( $directory ) || ! is_writable( $directory ) ) { return ''; }
	// Atomic publication: concurrent requests must never see a partially written stylesheet.
	$temporary = @tempnam( $directory, '.lieve-css-' );
	if ( ! $temporary ) { return ''; }
	$written = @file_put_contents( $temporary, $css, LOCK_EX );
	$published = strlen( $css ) === $written && @chmod( $temporary, defined( 'FS_CHMOD_FILE' ) ? FS_CHMOD_FILE : 0644 ) && @rename( $temporary, $path );
	if ( ! $published ) { wp_delete_file( $temporary ); return ''; }
	return $url;
}

/** Global declarations cannot be style attributes: embed them unless External Files is selected. */
function lieve_enqueue_generated_css( $handle, $css, $inline_handle = 'lieve-style' ) {
	if ( ! $css ) { return; }
	$url = lieve_use_external_css() ? lieve_generated_css_file( $css ) : '';
	if ( $url ) { wp_enqueue_style( $handle, $url, array( $inline_handle ), null ); }
	else { wp_add_inline_style( $inline_handle, $css ); }
}

function lieve_print_generated_css( $css, $attribute, $value ) {
	if ( ! $css ) { return; }
	$url = lieve_use_external_css() ? lieve_generated_css_file( $css ) : '';
	if ( $url ) { echo '<link rel="stylesheet" ' . $attribute . '="' . esc_attr( $value ) . '" href="' . esc_url( $url ) . '">'; }
	else { echo '<style ' . $attribute . '="' . esc_attr( $value ) . '">' . $css . '</style>'; }
}

/** Include nested reusable templates, with the renderer's depth and publication rules. */
function lieve_collect_document_css( $document, &$rules, $visited = array(), $depth = 0 ) {
	if ( function_exists( 'lieve_components_runtime_document' ) ) { $document = lieve_components_runtime_document( $document ); }
	if ( lieve_css_frontend_context() && function_exists( 'lieve_dynamic_mark_request_bound' ) ) { lieve_dynamic_mark_request_bound( $document ); }
	foreach ( $document['children'] ?? array() as $node ) {
		$css = lieve_node_style_css( $node, true, 'inline' === lieve_css_loading_method() );
		if ( $css ) { $rules[ hash( 'sha256', $css ) ] = $css; }
		if ( function_exists( 'lieve_listing_enabled' ) && lieve_listing_enabled( $node ) ) { continue; } // Item styles resolve in each result's context, not the page's.
		if ( 'template' === $node['type'] && $depth < 4 ) {
			$id = absint( $node['props']['templateId'] ?? 0 ); $post = $id ? get_post( $id ) : null;
			if ( $post && LIEVE_TEMPLATE_POST_TYPE === $post->post_type && 'publish' === $post->post_status && ! in_array( $id, $visited, true ) ) {
				lieve_collect_document_css( lieve_get_document( $id ), $rules, array_merge( $visited, array( $id ) ), $depth + 1 );
			}
		}
		if ( ! empty( $node['children'] ) ) { lieve_collect_document_css( array( 'children' => $node['children'] ), $rules, $visited, $depth ); }
	}
}

/** Discover styles before wp_head prints assets, including condition-matched landmarks. */
function lieve_enqueue_document_css() {
	$GLOBALS['lieve_document_css_rules'] = array();
	if ( ! lieve_css_frontend_context() ) { return; }
	$rules = array();
	foreach ( lieve_frontend_asset_usage()['documents'] ?? array() as $id ) {
		lieve_collect_document_css( lieve_get_document( $id ), $rules, array( (int) $id ) );
		if ( 'popup' === lieve_get_template_type( $id ) ) { $popup_css = lieve_popup_style_css( $id, lieve_get_popup_settings( $id ), 'inline' === lieve_css_loading_method() ); if ( $popup_css ) { $rules[ hash( 'sha256', $popup_css ) ] = $popup_css; } }
	}
	if ( ! $rules ) { return; }
	$css = implode( "\n", $rules );
	$url = lieve_use_external_css() ? lieve_generated_css_file( $css ) : '';
	if ( $url ) {
		wp_enqueue_style( 'lieve-generated-elements', $url, array( 'lieve-style', 'lieve-element-base' ), null );
	} else { wp_add_inline_style( 'lieve-element-base', $css ); }
	$GLOBALS['lieve_document_css_rules'] = array_fill_keys( array_keys( $rules ), true );
}
add_action( 'wp_enqueue_scripts', 'lieve_enqueue_document_css', 30 );

/** Late hook/shortcode elements retain styles even when not discoverable before the head. */
function lieve_generated_node_styles( $node, &$style_attribute ) {
	if ( ! lieve_css_frontend_context() ) { return false; }
	if ( function_exists( 'lieve_dynamic_mark_request_bound' ) ) { lieve_dynamic_mark_request_bound( $node ); }
	$inline = 'inline' === lieve_css_loading_method();
	$declarations = $inline ? lieve_node_inline_style( $node ) : '';
	$style_attribute = $declarations ? ' style="' . esc_attr( $declarations ) . '"' : '';
	$css = lieve_node_style_css( $node, true, $inline );
	if ( isset( $GLOBALS['lieve_listing_css_rules'] ) ) { if ( $css ) { $GLOBALS['lieve_listing_css_rules'][ hash( 'sha256', $css ) ] = $css; } return true; }
	if ( $css && empty( $GLOBALS['lieve_document_css_rules'][ hash( 'sha256', $css ) ] ) ) {
		lieve_print_generated_css( $css, 'data-lieve-styles', $node['id'] );
	}
	return true;
}
