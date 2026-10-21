<?php
/** Public GitHub releases, integrated with WordPress theme updates. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'LIEVE_UPDATE_URI', 'https://github.com/redshapeagency/lieve-builder' );
define( 'LIEVE_UPDATE_CACHE', 'lieve_github_release_v3' );
define( 'LIEVE_UPDATE_MAX_BYTES', 104857600 );
require_once __DIR__ . '/theme-update-package.php';

/** The running constant may still be old after files were replaced in this request. */
function lieve_update_installed_version() {
	$file = dirname( __DIR__, 2 ) . '/style.css';
	$css = is_readable( $file ) ? file_get_contents( $file, false, null, 0, 8192 ) : '';
	$headers = lieve_update_headers( $css ); $disk = lieve_update_version( $headers['Version'] );
	return $disk && version_compare( $disk, LIEVE_VERSION, '>' ) ? $disk : LIEVE_VERSION;
}

function lieve_update_headers( $css ) {
	$result = array();
	foreach ( array( 'Theme Name', 'Version', 'Requires at least', 'Requires PHP', 'Update URI', 'Text Domain', 'Template' ) as $key ) {
		$result[ $key ] = preg_match( '/^[ \t\/*#@]*' . preg_quote( $key, '/' ) . ':[ \t]*(.*)$/mi', (string) $css, $match ) ? trim( preg_replace( '/\s*(?:\*\/|\?>).*/', '', $match[1] ) ) : '';
	}
	return $result;
}

function lieve_update_location_valid() {
	return ( function_exists( 'get_template' ) ? get_template() : basename( dirname( __DIR__, 2 ) ) ) === 'lieve-builder';
}

/** Core supplies theme in every item, but bulk_upgrade omits type/action there. */
function lieve_theme_update_context( $upgrader, $extra ) {
	return $upgrader instanceof Theme_Upgrader && is_array( $extra ) && ( $extra['theme'] ?? '' ) === 'lieve-builder' && ( ! array_key_exists( 'type', $extra ) || $extra['type'] === 'theme' ) && ( ! array_key_exists( 'action', $extra ) || $extra['action'] === 'update' );
}

/** Request-local, per-upgrader verification; never reuse an inventory between bulk items. */
function lieve_theme_update_verifications() {
	static $verified;
	if ( null === $verified ) { $verified = new SplObjectStorage(); }
	return $verified;
}

function lieve_update_file_path( $path ) {
	if ( ! is_string( $path ) || ! $path || strlen( $path ) > 1024 || preg_match( '/[\x00-\x1f\x7f\\\\:]/', $path ) ) { return false; }
	foreach ( explode( '/', $path ) as $part ) { if ( ! $part || $part[0] === '.' || in_array( strtolower( $part ), array( 'node_modules', 'tests', '__macosx' ), true ) ) { return false; } }
	return true;
}

/** Only stable numeric tags, with an optional v prefix. */
function lieve_update_version( $tag ) {
	return is_string( $tag ) && preg_match( '/^v?((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))$/D', $tag, $match ) ? $match[1] : '';
}

/** Tag-specific URLs, never mutable latest/source-code archive URLs. */
function lieve_update_urls( $tag ) {
	if ( ! lieve_update_version( $tag ) ) { return array(); }
	return array(
		'package' => LIEVE_UPDATE_URI . '/releases/download/' . $tag . '/lieve-builder.zip',
		'url' => LIEVE_UPDATE_URI . '/releases/tag/' . $tag,
		'release' => 'https://api.github.com/repos/redshapeagency/lieve-builder/releases/tags/' . $tag,
		'stylesheet' => 'https://api.github.com/repos/redshapeagency/lieve-builder/contents/style.css?ref=' . $tag,
	);
}

/** Bounded HTTPS reads; no credentials, site URL or authored content is sent. */
function lieve_update_json( $url ) {
	$headers = array( 'Accept' => 'application/json', 'User-Agent' => 'LieveBuilder/' . LIEVE_VERSION );
	if ( strpos( $url, 'https://api.github.com/' ) === 0 ) { $headers['Accept'] = 'application/vnd.github+json'; $headers['X-GitHub-Api-Version'] = '2022-11-28'; }
	$response = wp_safe_remote_get( $url, array( 'timeout' => 8, 'redirection' => 3, 'limit_response_size' => 1048576, 'headers' => $headers ) );
	if ( is_wp_error( $response ) ) { return new WP_Error( 'lieve_update_network', __( 'GitHub could not be reached. Try again later.', 'lieve-builder' ) ); }
	$code = wp_remote_retrieve_response_code( $response );
	if ( 403 === $code || 429 === $code ) {
		$reset = (int) wp_remote_retrieve_header( $response, 'x-ratelimit-reset' );
		$after = wp_remote_retrieve_header( $response, 'retry-after' );
		$retry = is_numeric( $after ) ? (int) $after : max( 0, (int) strtotime( (string) $after ) - time() );
		return new WP_Error( 'lieve_update_rate_limit', __( 'GitHub is limiting requests. Please try again later.', 'lieve-builder' ), array( 'retry_at' => min( time() + DAY_IN_SECONDS, max( time() + 600, $reset, time() + $retry ) ) ) );
	}
	if ( 404 === $code ) { return new WP_Error( 'lieve_update_missing', __( 'No published release or required release asset is available yet.', 'lieve-builder' ) ); }
	if ( 200 !== $code ) { return new WP_Error( 'lieve_update_http', __( 'GitHub returned an unexpected response. Try again later.', 'lieve-builder' ) ); }
	$data = json_decode( wp_remote_retrieve_body( $response ), true );
	return is_array( $data ) ? $data : new WP_Error( 'lieve_update_json', __( 'The release information could not be verified.', 'lieve-builder' ) );
}

/** GitHub is the hash authority: a missing/malformed digest is never optional. */
function lieve_update_release_metadata( $raw, $expected_tag = null ) {
	$tag = is_array( $raw ) ? ( $raw['tag_name'] ?? null ) : null;
	$version = lieve_update_version( $tag ); $urls = lieve_update_urls( $tag );
	if ( ! $version || ( null !== $expected_tag && $tag !== $expected_tag ) || ( $raw['draft'] ?? true ) !== false || ( $raw['prerelease'] ?? true ) !== false || ( $raw['html_url'] ?? '' ) !== $urls['url'] || ! is_array( $raw['assets'] ?? null ) ) { return new WP_Error( 'lieve_update_release', __( 'The published stable release could not be verified.', 'lieve-builder' ) ); }
	if ( count( $raw['assets'] ) !== 1 ) { return new WP_Error( 'lieve_update_asset', __( 'The release must contain only lieve-builder.zip. Legacy versioned ZIPs and external manifests are not supported by this updater; ask the maintainer for migration instructions.', 'lieve-builder' ) ); }
	$asset = reset( $raw['assets'] );
	if ( ! is_array( $asset ) || ( $asset['name'] ?? '' ) !== 'lieve-builder.zip' || ( $asset['browser_download_url'] ?? '' ) !== $urls['package'] || ( $asset['state'] ?? '' ) !== 'uploaded' || ! is_int( $asset['id'] ?? null ) || $asset['id'] <= 0 || ! is_int( $asset['size'] ?? null ) || $asset['size'] < 22 || $asset['size'] > LIEVE_UPDATE_MAX_BYTES ) { return new WP_Error( 'lieve_update_asset', __( 'The official lieve-builder.zip release asset could not be verified.', 'lieve-builder' ) ); }
	if ( ! is_string( $asset['digest'] ?? null ) || ! preg_match( '/^sha256:([a-f0-9]{64})$/D', $asset['digest'], $hash ) ) { return new WP_Error( 'lieve_update_digest', __( 'GitHub did not supply a valid SHA-256 digest. The update has been blocked.', 'lieve-builder' ) ); }
	return array( 'tag' => $tag, 'version' => $version, 'url' => $urls['url'], 'package' => $urls['package'], 'sha256' => $hash[1], 'size' => $asset['size'], 'asset_id' => $asset['id'] );
}

/** Compatibility for native offers comes from the existing stylesheet at the tag. */
function lieve_update_release_headers( $tag ) {
	$urls = lieve_update_urls( $tag ); $data = lieve_update_json( $urls['stylesheet'] );
	if ( is_wp_error( $data ) ) { return $data; }
	if ( ( $data['type'] ?? '' ) !== 'file' || ( $data['path'] ?? '' ) !== 'style.css' || ( $data['encoding'] ?? '' ) !== 'base64' || ! is_string( $data['content'] ?? null ) || ! is_int( $data['size'] ?? null ) || $data['size'] > 524288 || $data['size'] < 1 ) { return new WP_Error( 'lieve_update_identity', __( 'The tagged theme stylesheet could not be verified.', 'lieve-builder' ) ); }
	$css = base64_decode( $data['content'], true );
	if ( ! is_string( $css ) || strlen( $css ) !== $data['size'] ) { return new WP_Error( 'lieve_update_identity', __( 'The tagged theme stylesheet is invalid.', 'lieve-builder' ) ); }
	return lieve_update_validate_headers( substr( $css, 0, 8192 ), lieve_update_version( $tag ) );
}

function lieve_update_cache_valid( $cached ) {
	if ( ! is_array( $cached ) || ! isset( $cached['checked_at'], $cached['error'], $cached['retry_at'] ) || ! is_int( $cached['checked_at'] ) || $cached['checked_at'] < 0 || $cached['checked_at'] > time() + 300 || ! is_int( $cached['retry_at'] ) || $cached['retry_at'] < 0 || $cached['retry_at'] > time() + DAY_IN_SECONDS || ! is_string( $cached['error'] ) || ! array_key_exists( 'release', $cached ) ) { return false; }
	$r = $cached['release']; if ( null === $r ) { return true; }
	if ( ! is_array( $r ) || ! is_string( $r['tag'] ?? null ) || ( $r['version'] ?? '' ) !== lieve_update_version( $r['tag'] ) || empty( $r['version'] ) ) { return false; }
	$urls = lieve_update_urls( $r['tag'] );
	foreach ( array( 'url', 'package' ) as $key ) { if ( ( $r[ $key ] ?? '' ) !== $urls[ $key ] ) { return false; } }
	return is_string( $r['sha256'] ?? null ) && preg_match( '/^[a-f0-9]{64}$/D', $r['sha256'] ) && is_int( $r['size'] ?? null ) && $r['size'] >= 22 && $r['size'] <= LIEVE_UPDATE_MAX_BYTES && is_int( $r['asset_id'] ?? null ) && $r['asset_id'] > 0 && is_string( $r['requires'] ?? null ) && preg_match( '/^[0-9]+(?:\\.[0-9]+){1,3}$/D', $r['requires'] ) && is_string( $r['requires_php'] ?? null ) && preg_match( '/^[0-9]+(?:\\.[0-9]+){1,3}$/D', $r['requires_php'] );
}

/** Cache valid releases for six hours; failures briefly, respecting rate limits. */
function lieve_theme_update_check( $force = false ) {
	$cached = get_site_transient( LIEVE_UPDATE_CACHE );
	if ( lieve_update_cache_valid( $cached ) && ( ! $force || $cached['retry_at'] > time() ) ) { return $cached; }
	$result = array( 'checked_at' => time(), 'release' => null, 'error' => '', 'retry_at' => 0 );
	$raw = lieve_update_json( 'https://api.github.com/repos/redshapeagency/lieve-builder/releases/latest' );
	$release = is_wp_error( $raw ) ? $raw : lieve_update_release_metadata( $raw );
	if ( ! is_wp_error( $release ) ) {
		$headers = lieve_update_release_headers( $release['tag'] );
		$release = is_wp_error( $headers ) ? $headers : array_merge( $release, $headers );
	}
	if ( is_wp_error( $release ) ) { $result['error'] = $release->get_error_message(); $result['retry_at'] = (int) ( $release->get_error_data()['retry_at'] ?? 0 ); }
	else { $result['release'] = $release; }
	set_site_transient( LIEVE_UPDATE_CACHE, $result, max( $result['release'] ? 6 * HOUR_IN_SECONDS : 600, $result['retry_at'] - time() ) );
	return $result;
}

function lieve_update_compatible( $release ) {
	return is_wp_version_compatible( $release['requires'] ) && is_php_version_compatible( $release['requires_php'] );
}

/** The native update response preserves the administrator's auto-update preference. */
function lieve_theme_update_offer( $release ) {
	if ( ! $release || empty( $release['package'] ) || ! lieve_update_location_valid() || ! version_compare( $release['version'], lieve_update_installed_version(), '>' ) ) { return false; }
	return array( 'id' => LIEVE_UPDATE_URI, 'theme' => 'lieve-builder', 'version' => $release['version'], 'new_version' => $release['version'], 'url' => $release['url'], 'package' => lieve_update_compatible( $release ) ? $release['package'] : '', 'requires' => $release['requires'], 'requires_php' => $release['requires_php'] );
}

function lieve_theme_update_response( $update, $theme_data, $stylesheet ) {
	if ( 'lieve-builder' !== $stylesheet || ! lieve_update_location_valid() || ! is_string( $theme_data['UpdateURI'] ?? null ) || rtrim( $theme_data['UpdateURI'], '/' ) !== LIEVE_UPDATE_URI ) { return $update; }
	// Registration is cheap; visiting the frontend must not initiate a GitHub request.
	if ( ! is_admin() && ! wp_doing_cron() && ! ( defined( 'WP_CLI' ) && WP_CLI ) ) { return false; }
	$result = lieve_theme_update_check();
	return lieve_theme_update_offer( $result['release'] );
}
add_filter( 'update_themes_github.com', 'lieve_theme_update_response', 10, 3 );

/** Read-only UI status. Rendering Settings never initiates an update request. */
function lieve_theme_update_status( $result = null ) {
	$result = null === $result ? get_site_transient( LIEVE_UPDATE_CACHE ) : $result;
	$status = array( 'state' => 'not_checked', 'message' => __( 'Check for published stable releases on GitHub. This does not install an update or save your settings.', 'lieve-builder' ), 'installed_version' => lieve_update_installed_version(), 'latest_version' => '', 'checked_at' => 0 );
	if ( ! lieve_update_location_valid() ) { $status['state'] = 'error'; $status['message'] = __( 'Updates are unavailable: the parent theme folder must be named lieve-builder. Back up the site and reinstall the official ZIP in the correct folder; do not rename an active theme in place.', 'lieve-builder' ); return $status; }
	if ( ! lieve_update_cache_valid( $result ) ) { return $status; }
	$status['checked_at'] = (int) ( $result['checked_at'] ?? 0 );
	if ( ! empty( $result['error'] ) ) { $status['state'] = 'error'; $status['message'] = $result['error']; return $status; }
	$release = $result['release'] ?? null;
	if ( ! $release ) { $status['state'] = 'unavailable'; $status['message'] = __( 'No published stable release is available yet.', 'lieve-builder' ); return $status; }
	$status['latest_version'] = $release['version'];
	if ( ! version_compare( $release['version'], $status['installed_version'], '>' ) ) { $status['state'] = 'current'; $status['message'] = __( 'No newer stable version is available.', 'lieve-builder' ); }
	elseif ( empty( $release['package'] ) ) { $status['state'] = 'unavailable'; $status['message'] = __( 'The release does not have a verified lieve-builder.zip asset. Try again after the maintainer prepares it.', 'lieve-builder' ); }
	elseif ( ! lieve_update_compatible( $release ) ) { $status['state'] = 'incompatible'; $status['message'] = sprintf( __( 'This release requires WordPress %1$s and PHP %2$s or newer.', 'lieve-builder' ), $release['requires'], $release['requires_php'] ); }
	else { $status['state'] = 'available'; $status['message'] = sprintf( __( 'Version %s is available. Open WordPress Updates to install it.', 'lieve-builder' ), $release['version'] ); }
	return $status;
}

function lieve_theme_update_permission() { return current_user_can( 'manage_options' ) && current_user_can( 'update_themes' ); }

function lieve_rest_check_theme_updates() {
	if ( ! lieve_theme_update_permission() ) { return new WP_Error( 'lieve_update_forbidden', __( 'You cannot check for theme updates.', 'lieve-builder' ), array( 'status' => 403 ) ); }
	if ( ! lieve_update_location_valid() ) { return rest_ensure_response( lieve_theme_update_status() ); }
	if ( get_site_transient( 'lieve_update_manual_cooldown' ) ) { return new WP_Error( 'lieve_update_cooldown', __( 'Please wait a minute before checking again.', 'lieve-builder' ), array( 'status' => 429 ) ); }
	set_site_transient( 'lieve_update_manual_cooldown', true, 60 );
	$result = lieve_theme_update_check( true );
	$updates = get_site_transient( 'update_themes' );
	if ( ! is_object( $updates ) ) { $updates = (object) array( 'last_checked' => 0 ); }
	$updates->checked = isset( $updates->checked ) && is_array( $updates->checked ) ? $updates->checked : array();
	$updates->checked['lieve-builder'] = lieve_update_installed_version();
	$updates->response = isset( $updates->response ) && is_array( $updates->response ) ? $updates->response : array();
	$updates->no_update = isset( $updates->no_update ) && is_array( $updates->no_update ) ? $updates->no_update : array();
	unset( $updates->response['lieve-builder'], $updates->no_update['lieve-builder'] );
	$offer = lieve_theme_update_offer( $result['release'] );
	if ( $offer ) { $updates->response['lieve-builder'] = $offer; }
	set_site_transient( 'update_themes', $updates );
	return rest_ensure_response( lieve_theme_update_status( $result ) );
}
add_action( 'rest_api_init', static function() {
	register_rest_route( 'lieve/v1', '/theme-updates/check', array( 'methods' => 'POST', 'permission_callback' => 'lieve_theme_update_permission', 'callback' => 'lieve_rest_check_theme_updates' ) );
} );

/** Refetch the offered tag's digest before every single/bulk/background upgrade. */
function lieve_theme_update_download( $reply, $package, $upgrader, $extra ) {
	if ( ! lieve_theme_update_context( $upgrader, $extra ) ) { return $reply; }
	$verified = lieve_theme_update_verifications();
	if ( isset( $verified[ $upgrader ] ) ) { unset( $verified[ $upgrader ] ); }
	if ( is_wp_error( $reply ) ) { return $reply; }
	if ( ! lieve_update_location_valid() ) { return new WP_Error( 'lieve_update_location', __( 'Install the parent theme in the lieve-builder folder before using automatic updates.', 'lieve-builder' ) ); }
	$prefix = LIEVE_UPDATE_URI . '/releases/download/';
	if ( ! is_string( $package ) || strpos( $package, $prefix ) !== 0 ) { return new WP_Error( 'lieve_update_source', __( 'The package is not an official Lieve Builder release.', 'lieve-builder' ) ); }
	$parts = explode( '/', substr( $package, strlen( $prefix ) ) ); $urls = lieve_update_urls( $parts[0] ?? null );
	if ( $package !== ( $urls['package'] ?? null ) ) { return new WP_Error( 'lieve_update_source', __( 'The cached update uses an obsolete or invalid package URL. Check for updates again; legacy updater installations require one manual update.', 'lieve-builder' ) ); }
	$raw = lieve_update_json( $urls['release'] );
	$release = is_wp_error( $raw ) ? $raw : lieve_update_release_metadata( $raw, $parts[0] );
	if ( is_wp_error( $release ) ) { return $release; }
	if ( ! version_compare( $release['version'], lieve_update_installed_version(), '>' ) ) { return new WP_Error( 'lieve_update_downgrade', __( 'Only newer releases may be installed automatically. Rollbacks require a deliberate manual installation.', 'lieve-builder' ) ); }
	$headers = lieve_update_release_headers( $release['tag'] );
	if ( is_wp_error( $headers ) ) { return $headers; }
	if ( ! lieve_update_compatible( $headers ) ) { return new WP_Error( 'lieve_update_incompatible', __( 'Upgrade WordPress or PHP before installing this release.', 'lieve-builder' ) ); }
	if ( ! function_exists( 'download_url' ) ) { require_once ABSPATH . 'wp-admin/includes/file.php'; }
	$file = $reply;
	if ( false === $reply ) {
		$bound = static function( $args, $url ) use ( $package ) { if ( $url === $package ) { $args['limit_response_size'] = LIEVE_UPDATE_MAX_BYTES + 1; } return $args; };
		add_filter( 'http_request_args', $bound, 10, 2 );
		try { $file = download_url( $package, 60 ); } finally { remove_filter( 'http_request_args', $bound, 10 ); }
	}
	if ( is_wp_error( $file ) ) { return $file; }
	if ( is_string( $file ) ) { clearstatcache( true, $file ); }
	$size = is_string( $file ) && is_readable( $file ) && is_file( $file ) ? filesize( $file ) : false;
	$actual = $size === $release['size'] ? hash_file( 'sha256', $file ) : '';
	$inventory = ! is_string( $actual ) || ! hash_equals( $release['sha256'], $actual ) ? new WP_Error( 'lieve_update_checksum', __( 'The downloaded ZIP failed GitHub SHA-256 verification. Nothing has been installed.', 'lieve-builder' ) ) : lieve_update_zip_inventory( $file, $release['version'] );
	if ( ! is_wp_error( $inventory ) ) { $after = @hash_file( 'sha256', $file ); if ( ! is_string( $after ) || ! hash_equals( $release['sha256'], $after ) ) { $inventory = new WP_Error( 'lieve_update_checksum', __( 'The ZIP changed during verification. Nothing has been installed.', 'lieve-builder' ) ); } }
	if ( ! is_wp_error( $inventory ) && ( $inventory['requires'] !== $headers['requires'] || $inventory['requires_php'] !== $headers['requires_php'] ) ) { $inventory = new WP_Error( 'lieve_update_identity', __( 'The ZIP requirements differ from the tagged theme. Nothing has been installed.', 'lieve-builder' ) ); }
	if ( is_wp_error( $inventory ) ) { if ( false === $reply && is_string( $file ) && is_file( $file ) ) { wp_delete_file( $file ); } return $inventory; }
	$verified[ $upgrader ] = $inventory;
	return $file;
}

add_filter( 'upgrader_pre_download', 'lieve_theme_update_download', 10, 4 );

/** Refuse a different theme/folder before WordPress replaces any installed files. */
function lieve_theme_update_source( $source, $remote_source, $upgrader, $extra ) {
	if ( ! lieve_theme_update_context( $upgrader, $extra ) ) { return $source; }
	$verified = lieve_theme_update_verifications();
	if ( is_wp_error( $source ) ) { if ( isset( $verified[ $upgrader ] ) ) { unset( $verified[ $upgrader ] ); } return $source; }
	if ( ! isset( $verified[ $upgrader ] ) ) { return new WP_Error( 'lieve_update_unverified', __( 'The release download was not verified. Nothing has been installed.', 'lieve-builder' ) ); }
	$verified_package = $verified[ $upgrader ]; unset( $verified[ $upgrader ] );
	global $wp_filesystem;
	$root = rtrim( (string) $remote_source, '/\\' ) . '/';
	$top = $wp_filesystem ? $wp_filesystem->dirlist( $root, true, false ) : false;
	$direct = $wp_filesystem && ( $wp_filesystem->method ?? '' ) === 'direct';
	if ( ! $remote_source || rtrim( (string) $source, '/\\' ) . '/' !== $root . 'lieve-builder/' || ! is_array( $top ) || count( $top ) !== 1 || ( $top['lieve-builder']['type'] ?? '' ) !== 'd' || ( $direct && is_link( $root . 'lieve-builder' ) ) ) { return new WP_Error( 'lieve_update_identity', __( 'The ZIP must contain only the official lieve-builder root folder. Nothing has been installed.', 'lieve-builder' ) ); }
	$inventory = array_column( $verified_package['files'], null, 'file' ); $seen = array(); $bytes = 0; $allowed_dirs = array();
	foreach ( array_keys( $inventory ) as $file ) { $parts = explode( '/', $file ); array_pop( $parts ); $prefix = ''; foreach ( $parts as $part ) { $prefix .= $part . '/'; $allowed_dirs[ $prefix ] = true; } }
	$pending = array( array( $root . 'lieve-builder/', '', 0 ) ); $css = ''; $functions = ''; $directories = 0;
	while ( $pending ) {
		list( $directory, $relative, $depth ) = array_pop( $pending );
		$items = $wp_filesystem->dirlist( $directory, true, false );
		if ( ! is_array( $items ) || $depth > 20 || ++$directories > 5000 ) { return new WP_Error( 'lieve_update_inventory', __( 'The extracted release could not be read safely.', 'lieve-builder' ) ); }
		foreach ( $items as $name => $item ) {
			$file = $relative . $name;
			if ( ! lieve_update_file_path( $file ) || ! is_array( $item ) || ( $direct && is_link( $directory . $name ) ) ) { return new WP_Error( 'lieve_update_inventory', __( 'The extracted release contains an unsafe path.', 'lieve-builder' ) ); }
			if ( ( $item['type'] ?? '' ) === 'd' && isset( $allowed_dirs[ $file . '/' ] ) ) { $pending[] = array( $directory . $name . '/', $file . '/', $depth + 1 ); continue; }
			if ( ( $item['type'] ?? '' ) !== 'f' || ! isset( $inventory[ $file ] ) || isset( $seen[ $file ] ) || count( $seen ) >= 5000 || ( isset( $item['size'] ) && (int) $item['size'] > LIEVE_UPDATE_MAX_BYTES - $bytes ) ) { return new WP_Error( 'lieve_update_inventory', __( 'The extracted release does not match its file inventory.', 'lieve-builder' ) ); }
			$content = $wp_filesystem->get_contents( $directory . $name );
			if ( ! is_string( $content ) || ! hash_equals( $inventory[ $file ]['sha256'], hash( 'sha256', $content ) ) || ( isset( $inventory[ $file ]['size'] ) && strlen( $content ) !== $inventory[ $file ]['size'] ) ) { return new WP_Error( 'lieve_update_inventory', __( 'An extracted release file failed verification.', 'lieve-builder' ) ); }
			$bytes += strlen( $content ); $seen[ $file ] = true;
			if ( $bytes > LIEVE_UPDATE_MAX_BYTES ) { return new WP_Error( 'lieve_update_inventory', __( 'The extracted release exceeds the size limit.', 'lieve-builder' ) ); }
			if ( $file === 'style.css' ) { $css = substr( $content, 0, 8192 ); } elseif ( $file === 'functions.php' ) { $functions = $content; }
		}
	}
	$headers = lieve_update_validate_headers( $css, $verified_package['version'], $functions );
	if ( is_wp_error( $headers ) || count( $seen ) !== count( $inventory ) || $headers['requires'] !== $verified_package['requires'] || $headers['requires_php'] !== $verified_package['requires_php'] ) { return new WP_Error( 'lieve_update_identity', __( 'The extracted theme identity, version or requirements do not match the verified release.', 'lieve-builder' ) ); }
	return $source;
}
add_filter( 'upgrader_source_selection', 'lieve_theme_update_source', 10, 4 );

/** Never rename a running installation or change native auto-update preferences. */
function lieve_theme_update_location_notice() {
	if ( lieve_update_location_valid() || ! current_user_can( 'update_themes' ) ) { return; }
	echo '<div class="notice notice-warning"><p>' . esc_html( lieve_theme_update_status()['message'] ) . '</p></div>';
}
add_action( 'admin_notices', 'lieve_theme_update_location_notice' );
add_action( 'network_admin_notices', 'lieve_theme_update_location_notice' );

/** Uses Settings' existing flat group, quiet actions and status treatment. */
function lieve_render_theme_updates_settings() {
	$status = lieve_theme_update_status();
	?>
	<section class="lieve-settings-group" data-theme-updates aria-labelledby="lieve-settings-updates-title">
		<noscript><style>[data-theme-update-check]{display:none!important}</style></noscript>
		<header class="lieve-settings-section-head"><h3 id="lieve-settings-updates-title"><?php esc_html_e( 'Theme updates', 'lieve-builder' ); ?></h3><p><?php esc_html_e( 'Published stable releases from redshapeagency/lieve-builder. Updates use the standard WordPress installer; prereleases and source-code archives are excluded.', 'lieve-builder' ); ?></p></header>
		<p class="lieve-settings-group-help" role="status" aria-live="polite" data-theme-update-status><?php echo esc_html( $status['message'] ); ?></p>
		<div class="lieve-settings-actions lieve-settings-update-actions">
			<?php if ( lieve_theme_update_permission() ) : ?><button type="button" class="lieve-conditions-cancel" data-theme-update-check><?php esc_html_e( 'Check for updates', 'lieve-builder' ); ?></button><a class="lieve-conditions-cancel" href="<?php echo esc_url( network_admin_url( 'update-core.php' ) ); ?>"><?php esc_html_e( 'Open WordPress Updates', 'lieve-builder' ); ?></a><?php endif; ?>
			<a class="lieve-conditions-cancel" href="<?php echo esc_url( LIEVE_UPDATE_URI . '/releases' ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'View releases', 'lieve-builder' ); ?></a>
		</div>
	</section>
	<?php
}
