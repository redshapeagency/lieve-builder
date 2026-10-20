<?php
/**
 * Plan frontend assets from the actual page and its assigned/conditional templates.
 * Unknown shortcode/widget output deliberately keeps WordPress/plugin assets intact.
 *
 * @package LieveBuilder
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_interactive_element_types() {
	return array( 'tabs', 'tabs-nested', 'slider', 'carousel', 'slider-nested', 'offcanvas', 'toggle', 'toggle-mode', 'alert', 'back-to-top', 'animated-typing', 'countdown', 'counter', 'post-toc', 'post-reading-progress-bar', 'form', 'map', 'map-leaflet', 'facebook-page', 'instagram-feed', 'map-connector', 'woocommerce-dynamic-fragment', 'woocommerce-checkout-step', 'woocommerce-checkout-steps-nav', 'woocommerce-checkout-step-nav-item' );
}

/** Inspect reusable documents recursively, bounded exactly like template rendering. */
function lieve_scan_frontend_document( $document, &$usage, &$visited, $depth = 0 ) {
	if ( function_exists( 'lieve_components_runtime_document' ) ) { $document = lieve_components_runtime_document( $document ); }
	foreach ( $document['children'] ?? array() as $node ) {
		$type = $node['type']; $props = $node['props'] ?? array();
		if ( in_array( $type, array( 'slider', 'slider-nested', 'carousel' ), true ) || 'lightbox' === ( $props['imageLink'] ?? '' ) || 'lightbox' === ( $props['galleryLink'] ?? '' ) || ! empty( $props['menuMobile'] ) || ! empty( $props['menuSubmenus'] ) ) { $usage['widgets'] = true; }
		if ( function_exists( 'lieve_listing_enabled' ) && lieve_listing_enabled( $node ) && 'slider' === ( $props['listing']['mode'] ?? '' ) ) { $usage['listings'] = true; }
		if ( function_exists( 'lieve_dynamic_reference' ) ) {
			$scan_data = static function( $value ) use ( &$scan_data, &$usage ) {
				if ( is_array( $value ) ) { foreach ( $value as $part ) { $scan_data( $part ); } return; }
				$binding = lieve_dynamic_reference( $value ); if ( ! $binding ) { return; }
				if ( 'post.content' === $binding['source'] ) { $usage['blocks'] = true; }
				if ( 0 === strpos( $binding['source'], 'woo.' ) ) { $usage['commerce'] = true; }
				if ( 0 === strpos( $binding['source'], 'advanced.' ) ) { $usage['opaque'] = true; }
				$source = function_exists( 'lieve_dynamic_data_sources' ) ? ( lieve_dynamic_data_sources()[ $binding['source'] ] ?? null ) : null;
				if ( ! $source || 'html' === ( $source['type'] ?? '' ) && 'post.content' !== $binding['source'] ) { $usage['opaque'] = true; }
			}; $scan_data( $props );
		}
		foreach ( $props['interactions'] ?? array() as $rule ) { if ( true === ( $rule['enabled'] ?? false ) ) { $usage['interactions'] = true; } }
		foreach ( $props['motion'] ?? array() as $timeline ) { if ( true === ( $timeline['enabled'] ?? false ) ) { $usage['motion'] = true; } }
		foreach ( $props['interactions'] ?? array() as $rule ) { if ( true === ( $rule['enabled'] ?? false ) && 0 === strpos( $rule['action'] ?? '', 'motion-' ) ) { $usage['motion'] = true; } }
		if ( in_array( $type, lieve_interactive_element_types(), true ) || 0 === strpos( $type, 'filter-' ) ) { $usage['interactive'] = true; }
		if ( 0 === strpos( $type, 'product-' ) || 0 === strpos( $type, 'woocommerce-' ) ) { $usage['commerce'] = true; }
		if ( 'post-content' === $type ) { $usage['blocks'] = true; }
		if ( ( 'shortcode' === $type && ! empty( $props['content'] ) ) || ( 'sidebar' === $type && ! empty( $props['sidebarId'] ) ) || ! empty( $props['shortcode'] ) ) {
			$usage['opaque'] = true; $usage['blocks'] = true;
		}
		if ( 'html' === $type && false !== strpos( $props['content'] ?? '', 'wp-block-' ) ) { $usage['blocks'] = true; }
		if ( 'html' === $type && false !== strpos( $props['content'] ?? '', '<?' ) ) { $usage['opaque'] = true; $usage['blocks'] = true; }
		if ( 'template' === $type && $depth < 4 ) {
			$id = absint( $props['templateId'] ?? 0 );
			$template = $id ? get_post( $id ) : null;
			if ( $template && LIEVE_TEMPLATE_POST_TYPE === $template->post_type && 'publish' === $template->post_status && ! in_array( $id, $visited, true ) ) {
				$visited[] = $id;
				lieve_scan_frontend_document( lieve_get_document( $id ), $usage, $visited, $depth + 1 );
				array_pop( $visited );
			}
		}
		if ( ! empty( $node['children'] ) ) { lieve_scan_frontend_document( array( 'children' => $node['children'] ), $usage, $visited, $depth ); }
	}
}

/** Cached only for this request. The reset argument is useful for read-only smoke tests. */
function lieve_frontend_asset_usage( $reset = false ) {
	static $cached = null;
	if ( null !== $cached && ! $reset ) { return $cached; }
	$usage = array( 'controlled' => false, 'blocks' => false, 'opaque' => false, 'commerce' => false, 'interactive' => false );
	$id = is_singular() ? get_queried_object_id() : 0;
	$documents = array();
	foreach ( array( 'header', 'footer' ) as $area ) { $documents[] = lieve_get_effective_area_template_id( $id, $area ); }
	if ( $id && lieve_builder_is_enabled( $id ) ) {
		$usage['controlled'] = true; $documents[] = $id;
	} else {
		$type = is_singular() ? 'content' : ( is_search() ? 'search' : ( is_404() ? 'error' : 'archive' ) );
		$template = lieve_get_matching_template_id( $type, $id );
		if ( $template ) { $usage['controlled'] = true; $documents[] = $template; }
	}
	if ( ! $usage['controlled'] ) { $usage['blocks'] = true; $usage['opaque'] = true; }
	$popups = lieve_theme_setting( 'enable_popups' ) ? lieve_get_available_popup_ids( $id ) : array();
	foreach ( $popups as $popup ) { $documents[] = $popup; $usage['interactive'] = true; }
	$sections = get_posts( array( 'post_type' => LIEVE_TEMPLATE_POST_TYPE, 'post_status' => 'publish', 'posts_per_page' => -1, 'fields' => 'ids', 'meta_key' => LIEVE_TEMPLATE_TYPE_META, 'meta_value' => 'section' ) );
	foreach ( $sections as $section ) {
		if ( (int) $section !== $id && lieve_conditional_section_hook_groups( lieve_get_template_conditions( $section ), $id ) ) { $documents[] = $section; }
	}
	$visited = array();
	$usage['documents'] = array_values( array_unique( array_filter( array_map( 'absint', $documents ) ) ) );
	foreach ( $usage['documents'] as $document_id ) {
		lieve_scan_frontend_document( lieve_get_document( $document_id ), $usage, $visited );
	}
	foreach ( array( 'is_woocommerce', 'is_cart', 'is_checkout', 'is_account_page' ) as $condition ) {
		if ( function_exists( $condition ) && $condition() ) { $usage['commerce'] = true; }
	}
	// Coming Soon can replace the entire document with a WooCommerce block template.
	if ( function_exists( 'WC' ) && 'yes' === get_option( 'woocommerce_coming_soon' ) && ! current_user_can( 'manage_woocommerce' ) && ( 'yes' !== get_option( 'woocommerce_store_pages_only' ) || $usage['commerce'] ) ) {
		$usage['blocks'] = true; $usage['opaque'] = true; $usage['commerce'] = true;
	}
	/** Extensions which render content from custom hooks can declare their requirements. */
	$cached = apply_filters( 'lieve_frontend_asset_usage', $usage );
	return $cached;
}

function lieve_is_clean_builder_request() {
	if ( is_admin() || is_feed() || wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || is_customize_preview() ) { return false; }
	$usage = lieve_frontend_asset_usage();
	return $usage['controlled'] && ! $usage['blocks'] && ! $usage['opaque'] && ! $usage['commerce'];
}

/** Run after template selection, before wp_head queues and prints styles. */
function lieve_prepare_frontend_assets() {
	if ( ! lieve_is_clean_builder_request() ) { return; }
	remove_action( 'wp_enqueue_scripts', 'wp_common_block_scripts_and_styles' );
	remove_action( 'wp_enqueue_scripts', 'wp_enqueue_classic_theme_styles' );
	remove_action( 'wp_enqueue_scripts', 'wp_enqueue_global_styles' );
	remove_action( 'wp_footer', 'wp_enqueue_global_styles', 1 );
	remove_action( 'wp_head', 'wp_print_font_faces', 50 );
	remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
	remove_action( 'wp_enqueue_scripts', 'wp_enqueue_emoji_styles' );
	remove_action( 'wp_print_styles', 'print_emoji_styles' );
}
add_action( 'template_redirect', 'lieve_prepare_frontend_assets', 30 );

/** Remove only known presentation assets; never deregister shared libraries. */
function lieve_optimize_frontend_assets() {
	if ( is_admin() ) { return; }
	$usage = lieve_frontend_asset_usage();
	if ( ! empty( $usage['widgets'] ) && function_exists( 'lieve_widget_assets' ) ) { lieve_widget_assets(); }
	if ( ! empty( $usage['listings'] ) && function_exists( 'lieve_enqueue_listings' ) ) { lieve_enqueue_listings(); }
	if ( ! empty( $usage['motion'] ) && function_exists( 'lieve_enqueue_motion' ) ) { lieve_enqueue_motion(); }
	if ( ! empty( $usage['interactions'] ) && function_exists( 'lieve_enqueue_interactions' ) ) { lieve_enqueue_interactions( ! empty( $usage['motion'] ) ); }
	if ( $usage['interactive'] || $usage['opaque'] ) {
		if ( function_exists( 'lieve_widget_assets' ) ) { lieve_widget_assets(); }
		wp_enqueue_script( 'lieve-popup-controller', LIEVE_URL . 'assets/js/popup-controller.js', array(), lieve_asset_version( 'assets/js/popup-controller.js' ), true );
		wp_enqueue_script( 'lieve-frontend', LIEVE_URL . 'assets/js/frontend.js', function_exists( 'lieve_widget_assets' ) ? array( 'lieve-popup-controller', 'lieve-widget-runtime' ) : array( 'lieve-popup-controller' ), lieve_asset_version( 'assets/js/frontend.js' ), true );
	}
	if ( ! lieve_is_clean_builder_request() ) { return; }
	foreach ( array( 'wp-block-library', 'wp-block-library-theme', 'classic-theme-styles', 'global-styles', 'wp-emoji-styles', 'woocommerce-layout', 'woocommerce-smallscreen', 'woocommerce-general', 'woocommerce-inline', 'woocommerce-coming-soon' ) as $handle ) { wp_dequeue_style( $handle ); }
	foreach ( array( 'woocommerce', 'wc-add-to-cart' ) as $handle ) { wp_dequeue_script( $handle ); }
	// Order attribution and consent tracking are intentionally left unchanged:
	// landing-page visits contribute to order attribution even without commerce markup.
}
add_action( 'wp_enqueue_scripts', 'lieve_optimize_frontend_assets', 100 );

/** Keep the script available for content inserted by runtime hooks after wp_head. */
function lieve_enqueue_element_controller( $type ) {
	if ( ! empty( $GLOBALS['lieve_element_preview'] ) ) { return; }
	if ( in_array( $type, lieve_interactive_element_types(), true ) || 0 === strpos( $type, 'filter-' ) ) {
		if ( function_exists( 'lieve_widget_assets' ) ) { lieve_widget_assets(); }
		wp_enqueue_script( 'lieve-popup-controller', LIEVE_URL . 'assets/js/popup-controller.js', array(), lieve_asset_version( 'assets/js/popup-controller.js' ), true );
		wp_enqueue_script( 'lieve-frontend', LIEVE_URL . 'assets/js/frontend.js', function_exists( 'lieve_widget_assets' ) ? array( 'lieve-popup-controller', 'lieve-widget-runtime' ) : array( 'lieve-popup-controller' ), lieve_asset_version( 'assets/js/frontend.js' ), true );
	}
}
