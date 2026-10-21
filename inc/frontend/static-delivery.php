<?php
/** Public-page snapshots. Only the web server can deliver these without PHP. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
require_once __DIR__ . '/../templates/expansion.php';

define( 'LIEVE_STATIC_OPTION', 'lieve_static_delivery' );
define( 'LIEVE_STATIC_META', '_lieve_static_snapshot' );
define( 'LIEVE_STATIC_SELECTED', '_lieve_static_enabled' );

function lieve_static_settings() {
	return wp_parse_args( get_option( LIEVE_STATIC_OPTION, array() ), array( 'enabled' => false, 'automatic' => true, 'epoch' => 'initial', 'verified' => '', 'verified_at' => 0 ) );
}
function lieve_static_error( $message, $status = 400 ) { return new WP_Error( 'lieve_static_error', $message, array( 'status' => $status ) ); }
function lieve_static_directory() {
	$key = substr( hash( 'sha256', home_url( '/' ) . '|' . get_current_blog_id() ), 0, 16 );
	return array( 'path' => WP_CONTENT_DIR . '/cache/lieve-static/' . $key, 'uri' => wp_parse_url( content_url( '/cache/lieve-static/' . $key ), PHP_URL_PATH ), 'key' => $key );
}
/** Only canonical, ASCII pretty-permalink routes; never accept a client path or URL. */
function lieve_static_route( $url ) {
	$parts = wp_parse_url( $url ); $home = wp_parse_url( home_url( '/' ) );
	if ( ! is_array( $parts ) || ! is_array( $home ) || ( $parts['scheme'] ?? '' ) !== ( $home['scheme'] ?? '' ) || ( $parts['host'] ?? '' ) !== ( $home['host'] ?? '' ) || ( $parts['port'] ?? null ) !== ( $home['port'] ?? null ) || isset( $parts['query'] ) || isset( $parts['fragment'] ) || isset( $parts['user'] ) || isset( $parts['pass'] ) ) { return false; }
	$path = $parts['path'] ?? '/'; $base = $home['path'] ?? '/';
	if ( strlen( $path ) > 500 || ! preg_match( '#^/(?:[a-zA-Z0-9_-]+/)*$#D', $path ) || 0 !== strpos( $path, $base ) || preg_match( '#/(?:wp-admin|wp-json|wp-login|feed|embed|lieve-static-check)(?:/|$)#i', $path ) ) { return false; }
	return $path;
}
function lieve_static_file( $route ) { return lieve_static_directory()['path'] . '/pages' . $route . 'index.html'; }
function lieve_static_selected_ids() { return get_posts( array( 'post_type' => 'page', 'post_status' => array( 'publish', 'draft', 'pending', 'private', 'future', 'trash' ), 'posts_per_page' => -1, 'fields' => 'ids', 'meta_key' => LIEVE_STATIC_SELECTED, 'meta_value' => '1', 'cache_results' => false ) ); }

/** Short filesystem lock: HTTP capture is deliberately outside this critical section. */
function lieve_static_locked( $callback ) {
	$dir = lieve_static_directory()['path'];
	if ( ! wp_mkdir_p( $dir ) ) { return lieve_static_error( 'The snapshot directory is not writable.', 500 ); }
	$handle = fopen( $dir . '/.lock', 'c' );
	if ( ! $handle || ! flock( $handle, LOCK_EX ) ) { if ( $handle ) { fclose( $handle ); } return lieve_static_error( 'Could not lock snapshot storage. Try again.', 503 ); }
	try {
		// A second PHP request may have committed while this one captured HTML.
		// Refresh request-local option caches before comparing the publication fence.
		wp_cache_delete( LIEVE_STATIC_OPTION, 'options' ); wp_cache_delete( 'notoptions', 'options' ); wp_cache_delete( 'alloptions', 'options' );
		return $callback();
	} finally { flock( $handle, LOCK_UN ); fclose( $handle ); }
}
function lieve_static_atomic_write( $file, $body ) {
	if ( ! wp_mkdir_p( dirname( $file ) ) ) { return false; }
	$temp = $file . '.' . wp_generate_password( 16, false ) . '.tmp';
	$written = file_put_contents( $temp, $body, LOCK_EX );
	$ok = strlen( $body ) === $written && rename( $temp, $file );
	if ( is_file( $temp ) ) { unlink( $temp ); }
	return $ok;
}
/** Gates are removed first; failed cleanup can never re-enable delivery. */
function lieve_static_remove_file( $file ) { return ! is_file( $file ) || unlink( $file ); }
function lieve_static_gate( $enabled ) {
	$file = lieve_static_directory()['path'] . '/enabled';
	return $enabled ? lieve_static_atomic_write( $file, 'enabled' ) : lieve_static_remove_file( $file );
}
function lieve_static_config_signature() { return hash( 'sha256', wp_json_encode( array( home_url( '/' ), lieve_static_directory(), 1 ) ) ); }

/** Recursive conservative compatibility check. Unknown/PHP-backed widgets stay dynamic. */
function lieve_static_scan( $document, &$issues, &$visited, $depth = 0 ) {
	$document = lieve_prepare_template_document( $document, $visited, $depth );
	if ( ! empty( $document['_lieveTemplateIssues'] ) ) { $issues[] = 'Reusable content is unavailable, recursive or exceeds the safe expansion budget.'; }
	$allowed = array( 'section', 'container', 'block', 'div', 'slot', 'heading', 'text-basic', 'text', 'button', 'image', 'spacer', 'divider', 'icon', 'icon-box', 'video', 'audio', 'svg', 'html', 'code', 'list', 'social-icons', 'pricing-tables', 'team-members', 'testimonials', 'image-gallery', 'accordion', 'accordion-nested', 'tabs', 'tabs-nested', 'slider', 'slider-nested', 'carousel', 'offcanvas', 'toggle', 'toggle-mode', 'alert', 'back-to-top', 'animated-typing', 'counter', 'countdown', 'nav-menu', 'nav-nested', 'dropdown', 'breadcrumbs', 'logo', 'text-link', 'file', 'progress-bar', 'pie-chart', 'rating', 'template', 'post-title', 'post-excerpt', 'post-meta', 'post-sharing', 'post-author', 'post-taxonomy', 'post-reading-time', 'post-reading-progress-bar', 'post-toc', 'map', 'map-leaflet', 'map-connector', 'facebook-page', 'instagram-feed' );
	lieve_visit_template_document( $document, static function( $node ) use ( &$issues, $allowed ) {
		$type = $node['type'] ?? ''; $props = $node['props'] ?? array();
		if ( 'html' === $type && false !== strpos( $props['content'] ?? '', '<?' ) ) { $issues[] = 'Custom Code containing PHP requires dynamic delivery.'; }
		if ( function_exists( 'lieve_listing_enabled' ) && lieve_listing_enabled( $node ) ) { $issues[] = 'Query-backed listings require dynamic delivery so results and permissions stay current.'; }
		if ( ! empty( $props['conditions']['enabled'] ) ) { $issues[] = 'Elements with rendering conditions require dynamic delivery.'; }
		if ( function_exists( 'lieve_dynamic_request_bound' ) && lieve_dynamic_request_bound( $props ) ) { $issues[] = 'Request-specific dynamic data cannot be frozen in a public snapshot.'; }
		if ( ! in_array( $type, $allowed, true ) || ! empty( $props['shortcode'] ) ) { $issues[] = 'The ' . $type . ' element requires dynamic delivery or is not supported yet.'; }
		// Inspect values, not JSON object delimiters. Unknown extensions must opt in explicitly.
		foreach ( $props as $value ) { if ( is_string( $value ) && preg_match( '/\{\{[^}]+\}\}/', $value ) && 'code' !== $type ) { $issues[] = 'Dynamic tags need a compatibility review.'; } }
		if ( 'html' === $type && preg_match( '/<\s*form\b|(?:wpnonce|form_nonce)/i', $props['content'] ?? '' ) ) { $issues[] = 'HTML forms and nonce-bearing markup cannot be frozen.'; }
	} );
}
function lieve_static_page_issues( $id ) {
	$post = get_post( $id ); $issues = array();
	if ( ! $post || 'page' !== $post->post_type || 'publish' !== $post->post_status || $post->post_password ) { return array( 'Only published, public, password-free pages are supported.' ); }
	if ( is_multisite() || '/' !== wp_parse_url( home_url( '/' ), PHP_URL_PATH ) || rtrim( WP_CONTENT_DIR, '/' ) !== rtrim( ABSPATH, '/' ) . '/wp-content' || wp_parse_url( content_url(), PHP_URL_HOST ) !== wp_parse_url( home_url(), PHP_URL_HOST ) || '/wp-content' !== rtrim( wp_parse_url( content_url(), PHP_URL_PATH ), '/' ) ) { $issues[] = 'This beta supports single-site, root installs with the standard local wp-content directory only.'; }
	if ( ! lieve_static_route( get_permalink( $id ) ) ) { $issues[] = 'Use an ASCII pretty permalink ending with a slash, on the website’s own origin.'; }
	if ( ! lieve_builder_is_enabled( $id ) ) { $issues[] = 'The page must be built with LieveBuilder.'; }
	foreach ( array( 'woocommerce_cart_page_id', 'woocommerce_checkout_page_id', 'woocommerce_myaccount_page_id', 'woocommerce_shop_page_id' ) as $option ) {
		if ( (int) get_option( $option ) === (int) $id && 0 !== (int) $id ) { $issues[] = 'WooCommerce system pages must remain dynamic.'; }
	}
	return array_values( array_unique( apply_filters( 'lieve_static_page_issues', $issues, $id ) ) );
}
/** Called in the real anonymous frontend request, so template conditions have their real context. */
function lieve_static_request_issues( $id ) {
	$issues = lieve_static_page_issues( $id ); $ids = array( $id );
	foreach ( array( 'header', 'footer' ) as $area ) { $ids[] = lieve_get_effective_area_template_id( $id, $area ); }
	if ( lieve_theme_setting( 'enable_popups' ) ) { $ids = array_merge( $ids, lieve_get_available_popup_ids( $id ) ); }
	foreach ( get_posts( array( 'post_type' => LIEVE_TEMPLATE_POST_TYPE, 'post_status' => 'publish', 'posts_per_page' => -1, 'fields' => 'ids', 'meta_key' => LIEVE_TEMPLATE_TYPE_META, 'meta_value' => 'section' ) ) as $section ) {
		if ( lieve_conditional_section_hook_groups( lieve_get_template_conditions( $section ), $id ) ) { $ids[] = $section; }
	}
	$visited = array();
	foreach ( array_unique( array_filter( $ids ) ) as $document_id ) { $visited = array( (int) $document_id ); lieve_static_scan( lieve_get_document( $document_id ), $issues, $visited ); }
	$usage = lieve_frontend_asset_usage();
	if ( $usage['commerce'] || $usage['opaque'] || $usage['blocks'] ) { $issues[] = 'Commerce, blocks or opaque plugin output require WordPress.'; }
	return array_values( array_unique( apply_filters( 'lieve_static_request_issues', $issues, $id ) ) );
}

/** Build tokens are one-shot, short-lived and never establish an authenticated user. */
function lieve_static_capture_request() {
	$token = isset( $_SERVER['HTTP_X_LIEVE_STATIC_BUILD'] ) ? (string) $_SERVER['HTTP_X_LIEVE_STATIC_BUILD'] : '';
	if ( ! preg_match( '/^[a-f0-9]{64}$/D', $token ) ) { return; }
	$key = 'lieve_static_build_' . hash( 'sha256', $token ); $id = (int) get_transient( $key );
	if ( ! $id ) { return; }
	delete_transient( $key );
	nocache_headers();
	if ( is_user_logged_in() || ! empty( $_COOKIE ) || ! empty( $_SERVER['HTTP_AUTHORIZATION'] ) || ! is_page( $id ) || is_preview() || is_feed() || is_search() ) { status_header( 409 ); exit; }
	$issues = lieve_static_request_issues( $id );
	if ( $issues ) { status_header( 422 ); header( 'Content-Type: application/json; charset=utf-8' ); echo wp_json_encode( array( 'issues' => $issues ) ); exit; }
	header( 'X-Lieve-Static-Source: ' . $token );
}
add_action( 'template_redirect', 'lieve_static_capture_request', 1 );

function lieve_static_http_args( $extra = array() ) {
	return array_merge( array( 'timeout' => 25, 'redirection' => 0, 'cookies' => array(), 'headers' => array(), 'limit_response_size' => 5 * 1024 * 1024 + 1, 'sslverify' => 'local' !== wp_get_environment_type() ), $extra );
}
function lieve_static_validate_html( $response, $token ) {
	if ( is_wp_error( $response ) ) { return lieve_static_error( 'The anonymous loopback request failed: ' . $response->get_error_message(), 502 ); }
	$body = wp_remote_retrieve_body( $response );
	if ( 422 === wp_remote_retrieve_response_code( $response ) ) { $data = json_decode( $body, true ); return lieve_static_error( implode( ' ', $data['issues'] ?? array( 'This page requires dynamic delivery.' ) ), 422 ); }
	if ( 200 !== wp_remote_retrieve_response_code( $response ) || ! hash_equals( $token, (string) wp_remote_retrieve_header( $response, 'x-lieve-static-source' ) ) || false === stripos( (string) wp_remote_retrieve_header( $response, 'content-type' ), 'text/html' ) ) { return lieve_static_error( 'The origin did not return a verified anonymous HTML page. Check redirects and page-cache rules.', 502 ); }
	if ( strlen( $body ) > 5 * 1024 * 1024 || ! preg_match( '/<!doctype\s+html/i', $body ) || ! preg_match( '#</html>\s*$#i', $body ) || ! preg_match( '#<main\b#i', $body ) ) { return lieve_static_error( 'The rendered HTML is incomplete or exceeds 5 MB.', 422 ); }
	if ( wp_remote_retrieve_header( $response, 'set-cookie' ) || preg_match( '/<\s*form\b|wpnonce|form_nonce|"nonce"\s*:|id=["\x27]wpadminbar|<\?php/i', $body ) ) { return lieve_static_error( 'The rendered page contains a form, session cookie, nonce or private toolbar. It must remain dynamic.', 422 ); }
	return $body;
}
function lieve_static_generate( $id ) {
	$id = absint( $id ); $settings = lieve_static_settings();
	if ( '1' !== get_post_meta( $id, LIEVE_STATIC_SELECTED, true ) ) { return lieve_static_error( 'Enable static mode for this page first.' ); }
	$issues = lieve_static_page_issues( $id );
	if ( $issues ) {
		lieve_static_locked( function() use ( $id, $issues, $settings ) {
			wp_cache_delete( $id, 'post_meta' ); $old = get_post_meta( $id, LIEVE_STATIC_META, true );
			if ( ! empty( $old['route'] ) && preg_match( '#^/(?:[a-zA-Z0-9_-]+/)*$#D', $old['route'] ) ) { lieve_static_remove_file( lieve_static_file( $old['route'] ) ); }
			update_post_meta( $id, LIEVE_STATIC_META, array( 'status' => 'blocked', 'message' => implode( ' ', $issues ), 'epoch' => $settings['epoch'] ) );
		} );
		return lieve_static_error( implode( ' ', $issues ), 422 );
	}
	$epoch = $settings['epoch']; $url = get_permalink( $id ); $route = lieve_static_route( $url );
	$token = bin2hex( random_bytes( 32 ) ); $key = 'lieve_static_build_' . hash( 'sha256', $token );
	set_transient( $key, $id, 60 );
	$response = wp_safe_remote_get( $url, lieve_static_http_args( array( 'headers' => array( 'X-Lieve-Static-Build' => $token, 'Cache-Control' => 'no-cache' ) ) ) );
	delete_transient( $key ); $html = lieve_static_validate_html( $response, $token );
	return lieve_static_locked( function() use ( $id, $epoch, $route, $html ) {
		wp_cache_delete( $id, 'post_meta' ); wp_cache_delete( $id, 'posts' );
		$settings = lieve_static_settings();
		if ( $epoch !== $settings['epoch'] || '1' !== get_post_meta( $id, LIEVE_STATIC_SELECTED, true ) || lieve_static_page_issues( $id ) || $route !== lieve_static_route( get_permalink( $id ) ) ) { return lieve_static_error( 'The website changed during generation. Try again.', 409 ); }
		$old = get_post_meta( $id, LIEVE_STATIC_META, true );
		if ( ! empty( $old['route'] ) && $old['route'] !== $route && preg_match( '#^/(?:[a-zA-Z0-9_-]+/)*$#D', $old['route'] ) ) { lieve_static_remove_file( lieve_static_file( $old['route'] ) ); }
		if ( is_wp_error( $html ) ) {
			lieve_static_remove_file( lieve_static_file( $route ) );
			update_post_meta( $id, LIEVE_STATIC_META, array( 'route' => $route, 'status' => 'blocked', 'message' => $html->get_error_message(), 'epoch' => $epoch ) ); return $html;
		}
		if ( ! lieve_static_atomic_write( lieve_static_file( $route ), $html ) ) { return lieve_static_error( 'The HTML snapshot could not be written.', 500 ); }
		update_post_meta( $id, LIEVE_STATIC_META, array( 'route' => $route, 'status' => 'ready', 'epoch' => $epoch, 'generated' => time(), 'bytes' => strlen( $html ), 'hash' => hash( 'sha256', $html ) ) );
		if ( $settings['enabled'] && hash_equals( lieve_static_config_signature(), $settings['verified'] ) ) { lieve_static_gate( true ); }
		return true;
	} );
}

/** Remove ready snapshots before queuing regeneration. Source edits can never leave stale HTML active. */
function lieve_static_invalidate( $reason = 'Website content changed.' ) {
	$ids = lieve_static_selected_ids(); if ( ! $ids && ! lieve_static_settings()['enabled'] ) { return; }
	lieve_static_locked( function() use ( $reason ) {
		lieve_static_gate( false ); $settings = lieve_static_settings(); $settings['epoch'] = wp_generate_uuid4();
		$ok = true;
		foreach ( lieve_static_selected_ids() as $id ) {
			wp_cache_delete( $id, 'post_meta' );
			$meta = get_post_meta( $id, LIEVE_STATIC_META, true );
			$route = $meta['route'] ?? '';
			if ( $route && preg_match( '#^/(?:[a-zA-Z0-9_-]+/)*$#D', $route ) ) { $ok = lieve_static_remove_file( lieve_static_file( $route ) ) && $ok; }
			update_post_meta( $id, LIEVE_STATIC_META, array( 'route' => $route, 'status' => 'stale', 'message' => $reason, 'epoch' => $settings['epoch'] ) );
		}
		if ( ! $ok ) { $settings['verified'] = ''; }
		update_option( LIEVE_STATIC_OPTION, $settings, false );
		if ( $settings['enabled'] && $settings['automatic'] && ! wp_next_scheduled( 'lieve_static_regenerate' ) ) { wp_schedule_single_event( time() + 10, 'lieve_static_regenerate' ); }
		return true;
	} );
}
function lieve_static_source_post_changed( $id ) {
	if ( wp_is_post_revision( $id ) || wp_is_post_autosave( $id ) ) { return; }
	lieve_static_invalidate();
}
function lieve_static_source_meta_changed( $meta_id, $id, $key ) {
	if ( 0 === strpos( $key, '_lieve_static' ) || 0 === strpos( $key, '_edit_' ) || wp_is_post_revision( $id ) ) { return; }
	lieve_static_invalidate();
}
function lieve_static_source_option_changed( $option ) {
	if ( LIEVE_STATIC_OPTION === $option || 0 === strpos( $option, '_transient_' ) ) { return; }
	// Read/write ownership locks are operational state, not changed website settings.
	if ( preg_match( '/^lieve_template_lock_[a-f0-9]{32}$/D', $option ) ) { return; }
	if ( preg_match( '/(?:_lock|_revision|_archive)$/', $option ) ) { return; }
	if ( 0 === strpos( $option, 'lieve_' ) || 0 === strpos( $option, 'theme_mods_' ) || 0 === strpos( $option, 'woocommerce_' ) || 0 === strpos( $option, 'widget_' ) || in_array( $option, array( 'home', 'siteurl', 'permalink_structure', 'blogname', 'blogdescription', 'page_on_front', 'show_on_front', 'active_plugins', 'stylesheet', 'template', 'sidebars_widgets', 'timezone_string', 'gmt_offset' ), true ) ) { lieve_static_invalidate( 'Website settings changed.' ); }
}
add_action( 'save_post', 'lieve_static_source_post_changed', 100 );
add_action( 'before_delete_post', 'lieve_static_source_post_changed' );
add_action( 'added_post_meta', 'lieve_static_source_meta_changed', 10, 3 );
add_action( 'updated_post_meta', 'lieve_static_source_meta_changed', 10, 3 );
add_action( 'deleted_post_meta', 'lieve_static_source_meta_changed', 10, 3 );
add_action( 'updated_option', 'lieve_static_source_option_changed' );
add_action( 'added_option', 'lieve_static_source_option_changed' );
add_action( 'deleted_option', 'lieve_static_source_option_changed' );
// Remove the old origin's gate before its directory key changes.
foreach ( array( 'home', 'siteurl' ) as $option ) { add_filter( 'pre_update_option_' . $option, function( $value, $old ) { if ( $value !== $old ) { lieve_static_invalidate( 'Website address changed.' ); } return $value; }, 10, 2 ); }
foreach ( array( 'set_object_terms', 'edited_term', 'delete_term', 'wp_update_nav_menu', 'comment_post', 'edit_comment', 'transition_comment_status', 'switch_theme', 'upgrader_process_complete' ) as $hook ) { add_action( $hook, function() { lieve_static_invalidate(); } ); }
function lieve_static_run_queue() {
	$settings = lieve_static_settings(); if ( ! $settings['enabled'] || ! $settings['automatic'] ) { return; }
	$remaining = false; $count = 0;
	foreach ( lieve_static_selected_ids() as $id ) {
		$meta = get_post_meta( $id, LIEVE_STATIC_META, true );
		if ( ! in_array( $meta['status'] ?? '', array( 'ready', 'blocked' ), true ) ) { if ( ++$count > 3 ) { $remaining = true; break; } lieve_static_generate( $id ); }
	}
	if ( $remaining && ! wp_next_scheduled( 'lieve_static_regenerate' ) ) { wp_schedule_single_event( time() + 10, 'lieve_static_regenerate' ); }
}
add_action( 'lieve_static_regenerate', 'lieve_static_run_queue' );

/** Verify the actual server, including its cookie/query/method/build-header/kill-switch bypasses. */
function lieve_static_verify() {
	if ( ! lieve_static_settings()['enabled'] ) { return lieve_static_error( 'Enable static delivery before verifying the server. Unverified delivery remains inactive.', 422 ); }
	$dir = lieve_static_directory(); $probe = '/lieve-static-check-' . bin2hex( random_bytes( 10 ) ) . '/'; $proof = bin2hex( random_bytes( 24 ) );
	if ( ! wp_mkdir_p( $dir['path'] ) ) { return lieve_static_error( 'The snapshot directory is not writable.', 500 ); }
	$guard = fopen( $dir['path'] . '/.verify.lock', 'c' );
	if ( ! $guard || ! flock( $guard, LOCK_EX | LOCK_NB ) ) { if ( $guard ) { fclose( $guard ); } return lieve_static_error( 'Another server verification is running. Try again shortly.', 409 ); }
	$epoch = lieve_static_settings()['epoch'];
	$file = lieve_static_file( $probe );
	$prepared = lieve_static_locked( function() use ( $file, $proof ) { return lieve_static_atomic_write( $file, '<!doctype html><html><body>' . $proof . '</body></html>' ) && lieve_static_gate( true ); } );
	if ( is_wp_error( $prepared ) || ! $prepared ) { flock( $guard, LOCK_UN ); fclose( $guard ); return lieve_static_error( 'Cannot create the server verification probe.', 500 ); }
	$failure = '';
	try {
		$url = home_url( $probe );
		$normal = wp_safe_remote_get( $url, lieve_static_http_args() );
		if ( is_wp_error( $normal ) || 200 !== wp_remote_retrieve_response_code( $normal ) || false === strpos( wp_remote_retrieve_body( $normal ), $proof ) || 'server' !== wp_remote_retrieve_header( $normal, 'x-lieve-static-delivery' ) ) { $failure = 'Server routing is not active. Install the generated configuration, reload the server and verify again.'; }
		if ( ! $failure ) {
			$head = wp_safe_remote_request( $url, lieve_static_http_args( array( 'method' => 'HEAD' ) ) );
			if ( is_wp_error( $head ) || 200 !== wp_remote_retrieve_response_code( $head ) || 'server' !== wp_remote_retrieve_header( $head, 'x-lieve-static-delivery' ) ) { $failure = 'The server did not deliver the HEAD request correctly.'; }
			$tests = array( array( $url . '?lieve_bypass=1', array() ), array( $url, array( 'headers' => array( 'Cookie' => 'lieve_probe=1' ) ) ), array( $url, array( 'headers' => array( 'Authorization' => 'Bearer lieve-probe' ) ) ), array( $url, array( 'headers' => array( 'X-Lieve-Static-Build' => 'probe' ) ) ), array( $url, array( 'method' => 'POST' ) ) );
			foreach ( $tests as $test ) { $r = wp_safe_remote_request( $test[0], lieve_static_http_args( $test[1] ) ); if ( is_wp_error( $r ) || false !== strpos( wp_remote_retrieve_body( $r ), $proof ) || 'server' === wp_remote_retrieve_header( $r, 'x-lieve-static-delivery' ) ) { $failure = 'The server failed a safety bypass check. Cookies, queries, authorization, build requests and non-GET requests must use WordPress.'; break; } }
			lieve_static_gate( false );
			$r = wp_safe_remote_get( $url, lieve_static_http_args() );
			if ( is_wp_error( $r ) || false !== strpos( wp_remote_retrieve_body( $r ), $proof ) ) { $failure = 'The server ignored the delivery kill switch. Disable upstream HTML caching and check the generated configuration.'; }
			$direct = wp_safe_remote_get( content_url( '/cache/lieve-static/' . $dir['key'] . '/pages' . $probe . 'index.html' ), lieve_static_http_args() );
			if ( is_wp_error( $direct ) || ! in_array( wp_remote_retrieve_response_code( $direct ), array( 403, 404 ), true ) || false !== strpos( wp_remote_retrieve_body( $direct ), $proof ) ) { $failure = 'Direct access to the snapshot directory must be denied by the server.'; }
		}
	} finally { lieve_static_remove_file( $file ); lieve_static_gate( false ); flock( $guard, LOCK_UN ); fclose( $guard ); }
	return lieve_static_locked( function() use ( $failure, $epoch ) {
		$settings = lieve_static_settings();
		if ( $epoch !== $settings['epoch'] ) { $failure = 'The website changed during verification. Run verification again.'; }
		$settings['verified'] = $failure ? '' : lieve_static_config_signature(); $settings['verified_at'] = $failure ? 0 : time(); update_option( LIEVE_STATIC_OPTION, $settings, false );
		if ( ! $failure && $settings['enabled'] ) { lieve_static_gate( true ); }
		return $failure ? lieve_static_error( $failure, 422 ) : true;
	} );
}

/** Nginx location / replacement; Apache rules precede WordPress. Never edit host configuration automatically. */
function lieve_static_server_config( $server ) {
	$dir = lieve_static_directory(); $uri = $dir['uri']; $path = str_replace( array( '\\', '"', '$' ), array( '\\\\', '\\"', '\\$' ), $dir['path'] );
	if ( 'nginx' === $server ) {
		$config = <<<'NGINX'
# Within the correct server block, outside any location.
# Replace location /, keep your PHP handler. Test with nginx -t before reloading.
# Do not cache these HTML responses upstream.
# Repeat any inherited security add_header directives in the internal location.
open_file_cache off;
set $lieve_candidate /__lieve_static_bypass__/index.html;
set $lieve_request "$request_method|$args|$http_cookie|$http_authorization|$http_x_lieve_static_build";
if ($lieve_request ~ "^(GET|HEAD)\|\|\|\|$") {
    set $lieve_candidate __URI__/pages${uri}index.html;
}
if (!-f "__PATH__/enabled") { set $lieve_candidate /__lieve_static_bypass__/index.html; }
if (-f $document_root$lieve_candidate) { rewrite ^ $lieve_candidate last; }
location ^~ __URI__/ {
    internal;
    add_header X-Lieve-Static-Delivery server;
    add_header Cache-Control "no-store";
    open_file_cache off;
}
location / {
    open_file_cache off;
    try_files $uri $uri/ /index.php?$args;
}
NGINX;
		return strtr( $config, array( '__URI__' => $uri, '__PATH__' => $path ) ) . "\n";
	}
	$config = <<<'APACHE'
# Apache 2.4: place ABOVE the WordPress block in the document-root .htaccess.
# Requires mod_rewrite and mod_headers; no upstream HTML caching.
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteCond %{ENV:REDIRECT_LIEVE_STATIC} !^1$
RewriteRule ^__RELATIVE__/ - [F,L]
RewriteCond %{REQUEST_METHOD} ^(?:GET|HEAD)$
RewriteCond %{QUERY_STRING} ^$
RewriteCond %{HTTP:Cookie} ^$
RewriteCond %{HTTP:Authorization} ^$
RewriteCond %{HTTP:X-Lieve-Static-Build} ^$
RewriteCond "__PATH__/enabled" -f
RewriteCond %{DOCUMENT_ROOT}__URI__/pages%{REQUEST_URI}index.html -f
RewriteRule ^ - [E=LIEVE_STATIC:1]
RewriteCond %{ENV:LIEVE_STATIC} =1
RewriteRule ^ __URI__/pages%{REQUEST_URI}index.html [L]
</IfModule>
<IfModule mod_headers.c>
Header set X-Lieve-Static-Delivery "server" env=LIEVE_STATIC
Header set X-Lieve-Static-Delivery "server" env=REDIRECT_LIEVE_STATIC
Header set Cache-Control "no-store" env=LIEVE_STATIC
Header set Cache-Control "no-store" env=REDIRECT_LIEVE_STATIC
</IfModule>
APACHE;
	return strtr( $config, array( '__URI__' => $uri, '__PATH__' => $path, '__RELATIVE__' => ltrim( $uri, '/' ) ) ) . "\n";
}

function lieve_static_payload() {
	$settings = lieve_static_settings(); $pages = array();
	foreach ( get_posts( array( 'post_type' => 'page', 'post_status' => array( 'publish', 'draft', 'pending', 'private', 'future' ), 'posts_per_page' => -1, 'orderby' => 'title', 'order' => 'ASC' ) ) as $post ) {
		$meta = get_post_meta( $post->ID, LIEVE_STATIC_META, true ); $issues = lieve_static_page_issues( $post->ID ); $selected = '1' === get_post_meta( $post->ID, LIEVE_STATIC_SELECTED, true );
		$status = ! $selected ? 'dynamic' : ( $issues ? 'blocked' : ( $meta['status'] ?? 'stale' ) );
		if ( 'ready' === $status && ( ( $meta['epoch'] ?? '' ) !== $settings['epoch'] || ! is_file( lieve_static_file( $meta['route'] ?? '' ) ) ) ) { $status = 'stale'; }
		$pages[] = array( 'id' => $post->ID, 'title' => get_the_title( $post ) ?: '(Untitled page)', 'url' => get_permalink( $post ), 'edit' => get_edit_post_link( $post->ID, 'raw' ), 'selected' => $selected, 'status' => $status, 'issues' => $issues, 'message' => $issues ? implode( ' ', $issues ) : ( $meta['message'] ?? '' ), 'generated' => ! empty( $meta['generated'] ) ? wp_date( 'Y-m-d · H:i', $meta['generated'] ) : '', 'bytes' => $meta['bytes'] ?? 0 );
	}
	$verified = hash_equals( lieve_static_config_signature(), $settings['verified'] );
	return array( 'settings' => array( 'enabled' => (bool) $settings['enabled'], 'automatic' => (bool) $settings['automatic'], 'verified' => $verified, 'active' => $verified && $settings['enabled'] && is_file( lieve_static_directory()['path'] . '/enabled' ), 'verifiedAt' => $settings['verified_at'] ), 'pages' => $pages, 'config' => array( 'nginx' => str_replace( '\n', "\n", lieve_static_server_config( 'nginx' ) ), 'apache' => str_replace( '\n', "\n", lieve_static_server_config( 'apache' ) ) ) );
}
function lieve_static_rest_action( $request ) {
	$action = $request['action']; $result = true;
	if ( 'generate' === $action ) { $result = lieve_static_generate( (int) $request['id'] ); }
	elseif ( 'verify' === $action ) { $result = lieve_static_verify(); }
	elseif ( 'settings' === $action ) {
		if ( ! is_bool( $request['enabled'] ) || ! is_bool( $request['automatic'] ) ) { return lieve_static_error( 'Delivery settings must be true or false.' ); }
		$result = lieve_static_locked( function() use ( $request ) {
			$settings = lieve_static_settings(); $settings['enabled'] = $request['enabled']; $settings['automatic'] = $request['automatic'];
			if ( ! $settings['enabled'] ) { lieve_static_gate( false ); }
			update_option( LIEVE_STATIC_OPTION, $settings, false );
			if ( $settings['enabled'] && hash_equals( lieve_static_config_signature(), $settings['verified'] ) ) { lieve_static_gate( true ); }
			return true;
		} );
		if ( $request['enabled'] && $request['automatic'] && ! wp_next_scheduled( 'lieve_static_regenerate' ) ) { wp_schedule_single_event( time() + 10, 'lieve_static_regenerate' ); }
	}
	elseif ( 'select' === $action ) {
		$id = (int) $request['id']; $post = get_post( $id );
		if ( ! $post || 'page' !== $post->post_type || ! current_user_can( 'edit_post', $id ) || ! is_bool( $request['selected'] ) ) { return lieve_static_error( 'Choose an editable page and a valid static-mode flag.' ); }
		$result = lieve_static_locked( function() use ( $request, $id ) {
			$meta = get_post_meta( $id, LIEVE_STATIC_META, true ); $route = $meta['route'] ?? '';
			if ( $route && preg_match( '#^/(?:[a-zA-Z0-9_-]+/)*$#D', $route ) && ! lieve_static_remove_file( lieve_static_file( $route ) ) ) { lieve_static_gate( false ); return lieve_static_error( 'The previous snapshot cannot be removed. Delivery has been stopped.', 500 ); }
			update_post_meta( $id, LIEVE_STATIC_SELECTED, $request['selected'] ? '1' : '0' ); delete_post_meta( $id, LIEVE_STATIC_META ); return true;
		} );
		$settings = lieve_static_settings();
		if ( ! is_wp_error( $result ) && $request['selected'] && $settings['enabled'] && $settings['automatic'] && ! wp_next_scheduled( 'lieve_static_regenerate' ) ) { wp_schedule_single_event( time() + 10, 'lieve_static_regenerate' ); }
	}
	else { return lieve_static_error( 'Unknown static delivery action.' ); }
	if ( is_wp_error( $result ) ) { return $result; }
	return rest_ensure_response( lieve_static_payload() );
}
function lieve_static_register_routes() {
	$permission = function() { return current_user_can( 'manage_options' ); };
	register_rest_route( 'lieve/v1', '/static-delivery', array( 'methods' => WP_REST_Server::READABLE, 'callback' => function() { return rest_ensure_response( lieve_static_payload() ); }, 'permission_callback' => $permission ) );
	register_rest_route( 'lieve/v1', '/static-delivery/(?P<action>settings|select|generate|verify)', array( 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'lieve_static_rest_action', 'permission_callback' => $permission, 'args' => array( 'id' => array( 'type' => 'integer', 'minimum' => 1 ), 'selected' => array( 'type' => 'boolean' ), 'enabled' => array( 'type' => 'boolean' ), 'automatic' => array( 'type' => 'boolean' ) ) ) );
}
add_action( 'rest_api_init', 'lieve_static_register_routes' );
