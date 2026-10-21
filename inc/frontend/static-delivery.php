<?php
/** Public-page snapshots. Only the web server can deliver these without PHP. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
require_once __DIR__ . '/../templates/expansion.php';

define( 'LIEVE_STATIC_OPTION', 'lieve_static_delivery' );
define( 'LIEVE_STATIC_META', '_lieve_static_snapshot' );
define( 'LIEVE_STATIC_SELECTED', '_lieve_static_enabled' );

function lieve_static_settings() {
	return wp_parse_args( get_option( LIEVE_STATIC_OPTION, array() ), array( 'enabled' => false, 'automatic' => true, 'epoch' => 'initial', 'verified' => '', 'verified_at' => 0, 'fence_verified' => '', 'failure' => array() ) );
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

/** Only our namespace, with no symlink hops. Never follow or remove foreign files. */
function lieve_static_owned_path( $file ) {
	$base = lieve_static_directory()['path'];
	if ( 0 !== strpos( $file, $base . '/' ) ) { return false; }
	$relative = substr( $file, strlen( $base ) + 1 );
	if ( ! preg_match( '#^(?:enabled|revoked|\.lock|\.verify\.lock|pages/(?:[a-zA-Z0-9_-]+/)*index\.html)(?:\.[a-zA-Z0-9]{16}\.tmp)?$#D', $relative ) ) { return false; }
	$path = rtrim( WP_CONTENT_DIR, '/' );
	foreach ( explode( '/', substr( $file, strlen( $path ) + 1 ) ) as $part ) {
		// stat(false) is NOT proof of absence when PHP cannot traverse the parent but the server can.
		clearstatcache( true, $path );
		if ( file_exists( $path ) && ( ! is_dir( $path ) || ! is_readable( $path ) || ( '\\' !== DIRECTORY_SEPARATOR && ! is_executable( $path ) ) ) ) { return false; }
		$path .= '/' . $part; clearstatcache( true, $path );
		if ( is_link( $path ) ) { return false; }
	}
	return true;
}
function lieve_static_gate_state() {
	$base = lieve_static_directory()['path']; $gate = $base . '/enabled'; $fence = $base . '/revoked';
	clearstatcache();
	$safe = lieve_static_owned_path( $gate ) && lieve_static_owned_path( $fence );
	$present = file_exists( $gate ) || is_link( $gate ); $revoked = file_exists( $fence ) && ! is_link( $fence );
	$trusted = hash_equals( lieve_static_config_signature(), (string) lieve_static_settings()['fence_verified'] );
	// Old installed rules do not understand revoked. Never trust that fence until HTTP verification.
	return array( 'present' => $present, 'revoked' => $revoked, 'inspectable' => $safe, 'fenced' => $safe && ( ! $present || ( $revoked && $trusted ) ) );
}
function lieve_static_recovery_message() {
	return 'Static delivery could not be safely reconciled. Ask the host to remove the Lieve Static Delivery routing block from this virtual host (Nginx: test and reload; Apache: remove the block above WordPress), deny direct access to the snapshot directory, and purge any external HTML caches. Restore storage permissions, disable delivery again, then run Verify Server before re-enabling it. A WordPress setting alone cannot revoke files served without PHP.';
}
function lieve_static_fresh_settings() {
	wp_cache_delete( LIEVE_STATIC_OPTION, 'options' ); wp_cache_delete( 'notoptions', 'options' ); wp_cache_delete( 'alloptions', 'options' );
	return lieve_static_settings();
}
function lieve_static_save_settings( $settings ) {
	update_option( LIEVE_STATIC_OPTION, $settings, false );
	return lieve_static_fresh_settings() === $settings;
}
/** Persistent operational failure, not a successful disable. Keep affected routes after post deletion. */
function lieve_static_failure( $message, $routes = array() ) {
	$settings = lieve_static_fresh_settings(); $previous = $settings['failure'];
	$routes = array_values( array_unique( array_merge( $previous['routes'] ?? array(), $routes ) ) );
	$routes = array_values( array_filter( $routes, static function( $route ) { return is_string( $route ) && preg_match( '#^/(?:[a-zA-Z0-9_-]+/)*$#D', $route ); } ) );
	$settings['verified'] = ''; $settings['verified_at'] = 0; $settings['epoch'] = wp_generate_uuid4();
	$settings['failure'] = array( 'message' => $message, 'routes' => $routes, 'time' => time() );
	$saved = lieve_static_save_settings( $settings );
	// Also close AFTER recording the fence: an already-running publisher must see this epoch.
	lieve_static_gate( false );
	$state = lieve_static_gate_state();
	return new WP_Error( 'lieve_static_storage_failure', $message . ( $saved ? '' : ' The failure record could not be persisted; contact the host immediately.' ) . ' ' . ( $state['fenced'] ? 'The local gate is fenced; restore storage and verify the server again.' : lieve_static_recovery_message() ), array( 'status' => 500, 'fenced' => $state['fenced'], 'manualIntervention' => ! $state['fenced'] || ! $saved ) );
}

/** Short filesystem lock: HTTP capture is deliberately outside this critical section. */
function lieve_static_locked( $callback ) {
	$dir = lieve_static_directory()['path'];
	if ( ! lieve_static_owned_path( $dir . '/.lock' ) || ! wp_mkdir_p( $dir ) ) { return lieve_static_error( 'The snapshot directory is not writable or contains an unsupported link.', 500 ); }
	$handle = @fopen( $dir . '/.lock', 'c' );
	if ( ! $handle || ! flock( $handle, LOCK_EX | LOCK_NB ) ) { if ( $handle ) { fclose( $handle ); } return lieve_static_error( 'Could not lock snapshot storage. Try again.', 503 ); }
	try {
		// A second PHP request may have committed while this one captured HTML.
		// Refresh request-local option caches before comparing the publication fence.
		wp_cache_delete( LIEVE_STATIC_OPTION, 'options' ); wp_cache_delete( 'notoptions', 'options' ); wp_cache_delete( 'alloptions', 'options' );
		return $callback();
	} finally { flock( $handle, LOCK_UN ); fclose( $handle ); }
}
function lieve_static_atomic_write( $file, $body ) {
	if ( ! lieve_static_owned_path( $file ) || ( file_exists( $file ) && ! is_file( $file ) ) || ! wp_mkdir_p( dirname( $file ) ) ) { return false; }
	$temp = $file . '.' . wp_generate_password( 16, false ) . '.tmp';
	$handle = @fopen( $temp, 'x+b' ); if ( ! $handle ) { return false; }
	$written = @fwrite( $handle, $body ); $flushed = @fflush( $handle ); fclose( $handle );
	$ok = strlen( $body ) === $written && $flushed && @rename( $temp, $file );
	if ( is_file( $temp ) ) { @unlink( $temp ); }
	clearstatcache( true, $file );
	$ok = $ok && is_readable( $file ) && hash_equals( hash( 'sha256', $body ), (string) @hash_file( 'sha256', $file ) );
	return $ok;
}
function lieve_static_remove_file( $file ) {
	if ( ! lieve_static_owned_path( $file ) ) { return false; }
	clearstatcache( true, $file );
	if ( ! file_exists( $file ) ) { return true; }
	if ( ! is_file( $file ) || ! @unlink( $file ) ) { return false; }
	clearstatcache( true, $file ); return ! file_exists( $file );
}
/** The second server-visible fence also covers an enabled file that cannot be removed. */
function lieve_static_gate( $enabled ) {
	$base = lieve_static_directory()['path'];
	if ( ! $enabled ) {
		$removed = lieve_static_remove_file( $base . '/enabled' );
		// Publishing always removes this last, so interruption leaves delivery fenced.
		lieve_static_atomic_write( $base . '/revoked', 'revoked' );
		return ( $removed || lieve_static_gate_state()['fenced'] ) && lieve_static_gate_state()['fenced'];
	}
	return lieve_static_atomic_write( $base . '/enabled', 'enabled' ) && lieve_static_remove_file( $base . '/revoked' ) && ! lieve_static_gate_state()['revoked'];
}
function lieve_static_config_signature() { return hash( 'sha256', wp_json_encode( array( home_url( '/' ), lieve_static_directory(), 2 ) ) ); }

/** Reconcile every routable file before opening the global gate, including crash leftovers. */
function lieve_static_publication_issues() {
	$known = array(); $settings = lieve_static_settings();
	foreach ( lieve_static_selected_ids() as $id ) {
		wp_cache_delete( $id, 'post_meta' ); wp_cache_delete( $id, 'posts' );
		$meta = get_post_meta( $id, LIEVE_STATIC_META, true ); $route = $meta['route'] ?? '';
		if ( ! is_string( $route ) || ! preg_match( '#^/(?:[a-zA-Z0-9_-]+/)*$#D', $route ) ) { continue; }
		$file = lieve_static_file( $route );
		if ( ! file_exists( $file ) ) { continue; }
		if ( ! lieve_static_owned_path( $file ) || 'ready' !== ( $meta['status'] ?? '' ) || $settings['epoch'] !== ( $meta['epoch'] ?? '' ) || $route !== lieve_static_route( get_permalink( $id ) ) || lieve_static_page_issues( $id ) || ! is_readable( $file ) || empty( $meta['hash'] ) || ! hash_equals( $meta['hash'], (string) @hash_file( 'sha256', $file ) ) ) { return 'A snapshot is stale, unreadable or no longer public. Invalidate delivery and generate fresh snapshots.'; }
		$known[ $file ] = true;
	}
	$pages = lieve_static_directory()['path'] . '/pages';
	if ( is_link( $pages ) ) { return 'Snapshot storage contains an unsupported link.'; }
	if ( ! is_dir( $pages ) ) { return ''; }
	try {
		$iterator = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $pages, FilesystemIterator::SKIP_DOTS ) );
		foreach ( $iterator as $entry ) {
			if ( $entry->isLink() || ( 'index.html' === $entry->getFilename() && empty( $known[ $entry->getPathname() ] ) ) ) { return 'Unrecognized snapshot files require host review. They were not removed or published.'; }
		}
	} catch ( UnexpectedValueException $error ) { return 'Snapshot storage cannot be inspected safely.'; }
	return '';
}
function lieve_static_publish_gate() {
	$settings = lieve_static_fresh_settings();
	if ( ! $settings['enabled'] || ! hash_equals( lieve_static_config_signature(), (string) $settings['verified'] ) || $settings['failure'] ) { return true; }
	$issue = lieve_static_publication_issues();
	if ( $issue || ! lieve_static_gate( true ) ) { lieve_static_gate( false ); return lieve_static_failure( $issue ?: 'The delivery gate could not be published.' ); }
	$after = lieve_static_fresh_settings();
	if ( $settings['epoch'] !== $after['epoch'] || $after['failure'] || ! $after['enabled'] || $settings['verified'] !== $after['verified'] ) { lieve_static_gate( false ); return lieve_static_failure( 'Publication was interrupted by another revocation.' ); }
	return true;
}

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
		$result = lieve_static_invalidate( implode( ' ', $issues ) );
		if ( is_wp_error( $result ) ) { return $result; }
		$old = get_post_meta( $id, LIEVE_STATIC_META, true );
		update_post_meta( $id, LIEVE_STATIC_META, array_merge( is_array( $old ) ? $old : array(), array( 'status' => 'blocked', 'message' => implode( ' ', $issues ), 'epoch' => lieve_static_settings()['epoch'] ) ) );
		return lieve_static_error( implode( ' ', $issues ), 422 );
	}
	if ( $settings['failure'] ) { return lieve_static_error( 'Static storage needs recovery. Disable delivery and verify the server before generating again.', 409 ); }
	$epoch = $settings['epoch']; $url = get_permalink( $id ); $route = lieve_static_route( $url );
	$token = bin2hex( random_bytes( 32 ) ); $key = 'lieve_static_build_' . hash( 'sha256', $token );
	set_transient( $key, $id, 60 );
	$response = wp_safe_remote_get( $url, lieve_static_http_args( array( 'headers' => array( 'X-Lieve-Static-Build' => $token, 'Cache-Control' => 'no-cache' ) ) ) );
	delete_transient( $key ); $html = lieve_static_validate_html( $response, $token );
	$entered = false;
	$result = lieve_static_locked( function() use ( $id, $epoch, $route, $html, &$entered ) {
		$entered = true;
		wp_cache_delete( $id, 'post_meta' ); wp_cache_delete( $id, 'posts' );
		$settings = lieve_static_settings();
		if ( $epoch !== $settings['epoch'] || $settings['failure'] || '1' !== get_post_meta( $id, LIEVE_STATIC_SELECTED, true ) || lieve_static_page_issues( $id ) || $route !== lieve_static_route( get_permalink( $id ) ) ) { return lieve_static_error( 'The website changed during generation. Try again.', 409 ); }
		$old = get_post_meta( $id, LIEVE_STATIC_META, true );
		if ( ! empty( $old['route'] ) && $old['route'] !== $route && preg_match( '#^/(?:[a-zA-Z0-9_-]+/)*$#D', $old['route'] ) && ! lieve_static_remove_file( lieve_static_file( $old['route'] ) ) ) { lieve_static_gate( false ); return lieve_static_failure( 'The previous route snapshot could not be removed.', array( $old['route'] ) ); }
		if ( is_wp_error( $html ) ) {
			$closed = lieve_static_gate( false ); $removed = lieve_static_remove_file( lieve_static_file( $route ) );
			if ( ! $closed || ! $removed || lieve_static_gate_state()['present'] ) { return lieve_static_failure( 'A rejected capture could not be fully revoked.', array( $route ) ); }
			update_post_meta( $id, LIEVE_STATIC_META, array( 'route' => $route, 'status' => 'blocked', 'message' => $html->get_error_message(), 'epoch' => $epoch ) ); return $html;
		}
		if ( ! lieve_static_atomic_write( lieve_static_file( $route ), $html ) ) { lieve_static_gate( false ); return lieve_static_failure( 'The HTML snapshot could not be written and verified.', array( $route ) ); }
		$meta = array( 'route' => $route, 'status' => 'ready', 'epoch' => $epoch, 'generated' => time(), 'bytes' => strlen( $html ), 'hash' => hash( 'sha256', $html ) );
		update_post_meta( $id, LIEVE_STATIC_META, $meta ); wp_cache_delete( $id, 'post_meta' );
		if ( get_post_meta( $id, LIEVE_STATIC_META, true ) !== $meta ) { return lieve_static_failure( 'Snapshot metadata could not be persisted.', array( $route ) ); }
		return lieve_static_publish_gate();
	} );
	if ( ! $entered && is_wp_error( $result ) ) { return lieve_static_failure( $result->get_error_message(), array( $route ) ); }
	return $result;
}

/** Close server routing FIRST. Failed cleanup is recoverable, never an implicit re-enable. Caller holds lock. */
function lieve_static_revoke_locked( $reason, $disable = false ) {
	$closed = lieve_static_gate( false ); $settings = lieve_static_settings(); $settings['epoch'] = wp_generate_uuid4();
	if ( $disable ) { $settings['enabled'] = false; }
	// Persist the generation fence before touching snapshots, including on an interrupted cleanup.
	$saved = lieve_static_save_settings( $settings );
	$failed = array(); $routes = $settings['failure']['routes'] ?? array();
	foreach ( lieve_static_selected_ids() as $id ) {
		wp_cache_delete( $id, 'post_meta' );
		$meta = get_post_meta( $id, LIEVE_STATIC_META, true );
		$route = $meta['route'] ?? '';
		$removed = true;
		if ( $route && preg_match( '#^/(?:[a-zA-Z0-9_-]+/)*$#D', $route ) ) { $routes[] = $route; $removed = lieve_static_remove_file( lieve_static_file( $route ) ); if ( ! $removed ) { $failed[] = $route; } }
		update_post_meta( $id, LIEVE_STATIC_META, array_merge( is_array( $meta ) ? $meta : array(), array( 'route' => $route, 'status' => $removed ? 'stale' : 'error', 'message' => $removed ? $reason : 'Snapshot cleanup failed. Host recovery is required.', 'epoch' => $settings['epoch'] ) ) );
	}
	// Retain and retry routes whose original post may already have been deleted.
	foreach ( array_unique( $routes ) as $route ) { if ( preg_match( '#^/(?:[a-zA-Z0-9_-]+/)*$#D', $route ) && ! lieve_static_remove_file( lieve_static_file( $route ) ) ) { $failed[] = $route; } }
	if ( ! $closed || lieve_static_gate_state()['present'] || $failed ) { return lieve_static_failure( 'Static revocation did not complete: the gate or one or more snapshots could not be removed.', array_merge( $routes, $failed ) ); }
	if ( ! $saved ) { return lieve_static_failure( 'The generation fence could not be persisted.', $routes ); }
	return true;
}
function lieve_static_invalidate( $reason = 'Website content changed.', $disable = false ) {
	$settings = lieve_static_settings(); $state = lieve_static_gate_state();
	if ( ! $disable && ! lieve_static_selected_ids() && ! $settings['enabled'] && ! $settings['failure'] && $state['fenced'] ) { return true; }
	$result = lieve_static_locked( function() use ( $reason, $disable ) { return lieve_static_revoke_locked( $reason, $disable ); } );
	if ( is_wp_error( $result ) ) {
		// Lock/disk failure must still attempt immediate revocation; do not wait for a future cron.
		lieve_static_gate( false );
		if ( $disable ) { $settings = lieve_static_settings(); $settings['enabled'] = false; update_option( LIEVE_STATIC_OPTION, $settings, false ); }
		$routes = array();
		foreach ( lieve_static_selected_ids() as $id ) { $meta = get_post_meta( $id, LIEVE_STATIC_META, true ); if ( ! empty( $meta['route'] ) ) { $routes[] = $meta['route']; } }
		return lieve_static_failure( $result->get_error_message(), $routes );
	}
	$settings = lieve_static_settings();
	if ( $settings['enabled'] && $settings['automatic'] && ! $settings['failure'] && ! wp_next_scheduled( 'lieve_static_regenerate' ) ) { wp_schedule_single_event( time() + 10, 'lieve_static_regenerate' ); }
	return true;
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
// Fence public-to-private/password/draft edits before WordPress changes the post row.
add_action( 'pre_post_update', 'lieve_static_source_post_changed' );
add_action( 'before_delete_post', 'lieve_static_source_post_changed' );
add_action( 'added_post_meta', 'lieve_static_source_meta_changed', 10, 3 );
add_action( 'updated_post_meta', 'lieve_static_source_meta_changed', 10, 3 );
add_action( 'deleted_post_meta', 'lieve_static_source_meta_changed', 10, 3 );
add_action( 'updated_option', 'lieve_static_source_option_changed' );
add_action( 'added_option', 'lieve_static_source_option_changed' );
add_action( 'deleted_option', 'lieve_static_source_option_changed' );
// Remove the old origin's gate before its directory key changes.
foreach ( array( 'home', 'siteurl' ) as $option ) { add_filter( 'pre_update_option_' . $option, function( $value, $old ) { if ( $value !== $old && is_wp_error( lieve_static_invalidate( 'Website address changed.' ) ) ) { return $old; } return $value; }, 10, 2 ); }
foreach ( array( 'set_object_terms', 'edited_term', 'delete_term', 'wp_update_nav_menu', 'comment_post', 'edit_comment', 'transition_comment_status', 'switch_theme', 'upgrader_process_complete' ) as $hook ) { add_action( $hook, function() { lieve_static_invalidate(); } ); }
function lieve_static_run_queue() {
	$settings = lieve_static_settings(); if ( ! $settings['enabled'] || ! $settings['automatic'] || $settings['failure'] ) { return; }
	$remaining = false; $count = 0;
	foreach ( lieve_static_selected_ids() as $id ) {
		$meta = get_post_meta( $id, LIEVE_STATIC_META, true );
		if ( ! in_array( $meta['status'] ?? '', array( 'ready', 'blocked' ), true ) ) { if ( ++$count > 3 ) { $remaining = true; break; } lieve_static_generate( $id ); }
	}
	if ( $remaining && ! wp_next_scheduled( 'lieve_static_regenerate' ) ) { wp_schedule_single_event( time() + 10, 'lieve_static_regenerate' ); }
}
add_action( 'lieve_static_regenerate', 'lieve_static_run_queue' );

/** Legacy rules/flags may survive an upgrade or restore. Fence on the next PHP request. */
function lieve_static_reconcile() {
	$settings = lieve_static_settings(); $state = lieve_static_gate_state();
	// Verification deliberately opens a probe-only gate. Its anonymous bypass requests still boot WP.
	$guard_file = lieve_static_directory()['path'] . '/.verify.lock';
	if ( lieve_static_owned_path( $guard_file ) && is_file( $guard_file ) ) {
		$guard = @fopen( $guard_file, 'r' );
		if ( $guard ) { $available = flock( $guard, LOCK_EX | LOCK_NB ); if ( $available ) { flock( $guard, LOCK_UN ); } fclose( $guard ); if ( ! $available ) { return true; } }
	}
	if ( ! $state['inspectable'] || ( $state['present'] && ( ! $settings['enabled'] || $settings['failure'] || ! hash_equals( lieve_static_config_signature(), (string) $settings['verified'] ) ) ) ) { return lieve_static_invalidate( 'Stored delivery state no longer matches the installed rules.' ); }
	return true;
}
add_action( 'init', 'lieve_static_reconcile', 1 );

/** Verify the actual server, including its cookie/query/method/build-header/kill-switch bypasses. */
function lieve_static_verify() {
	if ( ! lieve_static_settings()['enabled'] ) { return lieve_static_error( 'Enable static delivery before verifying the server. Unverified delivery remains inactive.', 422 ); }
	// Never expose old or orphaned HTML while testing an as-yet-untrusted server configuration.
	$revoked = lieve_static_invalidate( 'Server routing is being verified.' );
	if ( is_wp_error( $revoked ) ) { return $revoked; }
	$issue = lieve_static_publication_issues();
	if ( $issue ) { return lieve_static_failure( $issue ); }
	$dir = lieve_static_directory(); $probe = '/lieve-static-check-' . bin2hex( random_bytes( 10 ) ) . '/'; $proof = bin2hex( random_bytes( 24 ) );
	if ( ! lieve_static_owned_path( $dir['path'] . '/.verify.lock' ) || ! wp_mkdir_p( $dir['path'] ) ) { return lieve_static_failure( 'The snapshot directory is not writable.' ); }
	$guard = @fopen( $dir['path'] . '/.verify.lock', 'c' );
	if ( ! $guard || ! flock( $guard, LOCK_EX | LOCK_NB ) ) { if ( $guard ) { fclose( $guard ); } return lieve_static_error( 'Another server verification is running. Try again shortly.', 409 ); }
	$epoch = lieve_static_settings()['epoch'];
	$file = lieve_static_file( $probe );
	$prepared = lieve_static_locked( function() use ( $file, $proof, $epoch ) {
		$settings = lieve_static_settings();
		if ( $epoch !== $settings['epoch'] || ! $settings['enabled'] ) { return false; }
		$settings['verified'] = ''; $settings['verified_at'] = 0;
		if ( ! lieve_static_save_settings( $settings ) ) { return false; }
		return lieve_static_atomic_write( $file, '<!doctype html><html><body>' . $proof . '</body></html>' ) && lieve_static_gate( true );
	} );
	$failure = '';
	try {
		if ( is_wp_error( $prepared ) || ! $prepared ) { $failure = 'Cannot create the server verification probe.'; }
		$url = home_url( $probe );
		$normal = $failure ? null : wp_safe_remote_get( $url, lieve_static_http_args() );
		if ( ! $failure && ( is_wp_error( $normal ) || 200 !== wp_remote_retrieve_response_code( $normal ) || false === strpos( wp_remote_retrieve_body( $normal ), $proof ) || 'server' !== wp_remote_retrieve_header( $normal, 'x-lieve-static-delivery' ) || 'no-store' !== wp_remote_retrieve_header( $normal, 'cache-control' ) ) ) { $failure = 'Server routing is not active or HTML is cacheable. Install the current generated configuration, reload the server and verify again.'; }
		if ( ! $failure ) {
			$head = wp_safe_remote_request( $url, lieve_static_http_args( array( 'method' => 'HEAD' ) ) );
			if ( is_wp_error( $head ) || 200 !== wp_remote_retrieve_response_code( $head ) || 'server' !== wp_remote_retrieve_header( $head, 'x-lieve-static-delivery' ) ) { $failure = 'The server did not deliver the HEAD request correctly.'; }
			$tests = array( array( $url . '?lieve_bypass=1', array() ), array( $url, array( 'headers' => array( 'Cookie' => 'lieve_probe=1' ) ) ), array( $url, array( 'headers' => array( 'Authorization' => 'Bearer lieve-probe' ) ) ), array( $url, array( 'headers' => array( 'X-Lieve-Static-Build' => 'probe' ) ) ), array( $url, array( 'method' => 'POST' ) ) );
			foreach ( $tests as $test ) { $r = wp_safe_remote_request( $test[0], lieve_static_http_args( $test[1] ) ); if ( is_wp_error( $r ) || false !== strpos( wp_remote_retrieve_body( $r ), $proof ) || 'server' === wp_remote_retrieve_header( $r, 'x-lieve-static-delivery' ) ) { $failure = 'The server failed a safety bypass check. Cookies, queries, authorization, build requests and non-GET requests must use WordPress.'; break; } }
			// Test the NEW negative fence with enabled still present. Legacy rules must fail this test.
			$fenced = lieve_static_locked( function() use ( $dir ) { return lieve_static_atomic_write( $dir['path'] . '/revoked', 'revoked' ); } );
			$r = wp_safe_remote_get( $url, lieve_static_http_args() );
			if ( is_wp_error( $fenced ) || ! $fenced || is_wp_error( $r ) || false !== strpos( wp_remote_retrieve_body( $r ), $proof ) || 'server' === wp_remote_retrieve_header( $r, 'x-lieve-static-delivery' ) ) { $failure = 'The server ignored the revocation fence. Install the current generated rules; old rules cannot be reactivated.'; }
			$closed = lieve_static_locked( function() { return lieve_static_gate( false ); } );
			$r = wp_safe_remote_get( $url, lieve_static_http_args() );
			if ( is_wp_error( $closed ) || ! $closed || lieve_static_gate_state()['present'] || is_wp_error( $r ) || false !== strpos( wp_remote_retrieve_body( $r ), $proof ) || 'server' === wp_remote_retrieve_header( $r, 'x-lieve-static-delivery' ) ) { $failure = 'The server ignored the delivery kill switch or the gate could not be removed. Disable upstream HTML caching and check the generated configuration.'; }
			$direct = wp_safe_remote_get( content_url( '/cache/lieve-static/' . $dir['key'] . '/pages' . $probe . 'index.html' ), lieve_static_http_args() );
			if ( is_wp_error( $direct ) || ! in_array( wp_remote_retrieve_response_code( $direct ), array( 403, 404 ), true ) || false !== strpos( wp_remote_retrieve_body( $direct ), $proof ) ) { $failure = 'Direct access to the snapshot directory must be denied by the server.'; }
		}
	} finally {
		$cleanup = lieve_static_locked( function() use ( $file ) { $closed = lieve_static_gate( false ); $removed = lieve_static_remove_file( $file ); return $closed && $removed && ! lieve_static_gate_state()['present']; } );
		if ( is_wp_error( $cleanup ) || ! $cleanup ) { lieve_static_gate( false ); $failure = 'Server verification cleanup failed. Host recovery is required.'; }
		flock( $guard, LOCK_UN ); fclose( $guard );
	}
	$result = lieve_static_locked( function() use ( $failure, $epoch ) {
		$settings = lieve_static_settings();
		if ( $epoch !== $settings['epoch'] || ! $settings['enabled'] ) { $failure = 'The website changed during verification. Run verification again.'; }
		if ( $failure ) { return lieve_static_failure( $failure ); }
		$settings['verified'] = lieve_static_config_signature(); $settings['fence_verified'] = $settings['verified']; $settings['verified_at'] = time(); $settings['failure'] = array();
		if ( ! lieve_static_save_settings( $settings ) ) { return lieve_static_failure( 'Server verification could not be persisted.' ); }
		return lieve_static_publish_gate();
	} );
	if ( is_wp_error( $result ) && ! lieve_static_settings()['failure'] ) { return lieve_static_failure( $result->get_error_message(), array( $probe ) ); }
	return $result;
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
if (-e "__PATH__/revoked") { set $lieve_candidate /__lieve_static_bypass__/index.html; }
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
RewriteCond "__PATH__/revoked" !-f
RewriteCond "__PATH__/revoked" !-d
RewriteCond "__PATH__/revoked" !-l
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
	if ( ! current_user_can( 'manage_options' ) ) { return lieve_static_error( 'You do not have permission to inspect static delivery.', 403 ); }
	$settings = lieve_static_settings(); $pages = array();
	foreach ( get_posts( array( 'post_type' => 'page', 'post_status' => array( 'publish', 'draft', 'pending', 'private', 'future' ), 'posts_per_page' => -1, 'orderby' => 'title', 'order' => 'ASC' ) ) as $post ) {
		$meta = get_post_meta( $post->ID, LIEVE_STATIC_META, true ); $issues = lieve_static_page_issues( $post->ID ); $selected = '1' === get_post_meta( $post->ID, LIEVE_STATIC_SELECTED, true );
		$status = ! $selected ? 'dynamic' : ( $issues ? 'blocked' : ( $meta['status'] ?? 'stale' ) );
		if ( 'ready' === $status && ( ( $meta['epoch'] ?? '' ) !== $settings['epoch'] || ! is_file( lieve_static_file( $meta['route'] ?? '' ) ) ) ) { $status = 'stale'; }
		$pages[] = array( 'id' => $post->ID, 'title' => get_the_title( $post ) ?: '(Untitled page)', 'url' => get_permalink( $post ), 'edit' => get_edit_post_link( $post->ID, 'raw' ), 'selected' => $selected, 'status' => $status, 'issues' => $issues, 'message' => $issues ? implode( ' ', $issues ) : ( $meta['message'] ?? '' ), 'generated' => ! empty( $meta['generated'] ) ? wp_date( 'Y-m-d · H:i', $meta['generated'] ) : '', 'bytes' => $meta['bytes'] ?? 0 );
	}
	$verified = hash_equals( lieve_static_config_signature(), (string) $settings['verified'] ); $state = lieve_static_gate_state();
	$problem = ! empty( $settings['failure'] ) || ( $state['present'] && ( ! $verified || ! $settings['enabled'] ) ) || ! lieve_static_owned_path( lieve_static_directory()['path'] . '/enabled' );
	$safety = $problem ? ( $state['fenced'] ? 'fenced' : 'unsafe' ) : 'ok';
	return array( 'settings' => array( 'enabled' => (bool) $settings['enabled'], 'automatic' => (bool) $settings['automatic'], 'verified' => $verified, 'active' => ! $problem && $verified && $settings['enabled'] && $state['present'] && ! $state['revoked'], 'verifiedAt' => $settings['verified_at'], 'safety' => $safety, 'error' => $problem ? ( $settings['failure']['message'] ?? 'Database and server gate disagree. Do not assume that delivery is disabled.' ) : '', 'recovery' => $problem ? lieve_static_recovery_message() : '' ), 'pages' => $pages, 'config' => array( 'nginx' => str_replace( '\n', "\n", lieve_static_server_config( 'nginx' ) ), 'apache' => str_replace( '\n', "\n", lieve_static_server_config( 'apache' ) ) ) );
}
function lieve_static_rest_action( $request ) {
	if ( ! current_user_can( 'manage_options' ) ) { return lieve_static_error( 'You do not have permission to manage static delivery.', 403 ); }
	$action = $request['action']; $result = true;
	if ( 'generate' === $action ) { $result = lieve_static_generate( (int) $request['id'] ); }
	elseif ( 'verify' === $action ) { $result = lieve_static_verify(); }
	elseif ( 'settings' === $action ) {
		if ( ! is_bool( $request['enabled'] ) || ! is_bool( $request['automatic'] ) ) { return lieve_static_error( 'Delivery settings must be true or false.' ); }
		if ( ! $request['enabled'] ) { $result = lieve_static_invalidate( 'Static delivery was disabled manually.', true ); }
		if ( is_wp_error( $result ) ) { return $result; }
		$result = lieve_static_locked( function() use ( $request ) {
			$settings = lieve_static_settings(); $settings['enabled'] = $request['enabled']; $settings['automatic'] = $request['automatic'];
			if ( ! lieve_static_save_settings( $settings ) ) { return lieve_static_failure( 'Delivery settings could not be persisted.' ); }
			if ( ! hash_equals( lieve_static_config_signature(), (string) $settings['verified'] ) ) {
				if ( ! lieve_static_gate( false ) || lieve_static_gate_state()['present'] ) { return lieve_static_failure( 'Unverified delivery could not be stopped.' ); }
				return true;
			}
			return lieve_static_publish_gate();
		} );
		if ( is_wp_error( $result ) ) { lieve_static_gate( false ); return lieve_static_failure( $result->get_error_message() ); }
		if ( $request['enabled'] && $request['automatic'] && ! lieve_static_settings()['failure'] && ! wp_next_scheduled( 'lieve_static_regenerate' ) ) { wp_schedule_single_event( time() + 10, 'lieve_static_regenerate' ); }
	}
	elseif ( 'select' === $action ) {
		$id = (int) $request['id']; $post = get_post( $id );
		if ( ! $post || 'page' !== $post->post_type || ! current_user_can( 'edit_post', $id ) || ! is_bool( $request['selected'] ) ) { return lieve_static_error( 'Choose an editable page and a valid static-mode flag.' ); }
		$result = lieve_static_locked( function() use ( $request, $id ) {
			$revoked = lieve_static_revoke_locked( 'The selected static pages changed.' );
			if ( is_wp_error( $revoked ) ) { return $revoked; }
			update_post_meta( $id, LIEVE_STATIC_SELECTED, $request['selected'] ? '1' : '0' ); delete_post_meta( $id, LIEVE_STATIC_META ); return true;
		} );
		if ( is_wp_error( $result ) ) { lieve_static_gate( false ); return lieve_static_failure( $result->get_error_message() ); }
		$settings = lieve_static_settings();
		if ( ! is_wp_error( $result ) && $request['selected'] && $settings['enabled'] && $settings['automatic'] && ! $settings['failure'] && ! wp_next_scheduled( 'lieve_static_regenerate' ) ) { wp_schedule_single_event( time() + 10, 'lieve_static_regenerate' ); }
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
