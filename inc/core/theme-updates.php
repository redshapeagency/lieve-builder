<?php
/** Public GitHub releases, integrated with WordPress theme updates. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'LIEVE_UPDATE_URI', 'https://github.com/redshapeagency/lieve-builder' );
define( 'LIEVE_UPDATE_CACHE', 'lieve_github_release_v2' );
define( 'LIEVE_UPDATE_MAX_BYTES', 104857600 );

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

/** Request-local, per-upgrader verification; never reuse a manifest between bulk items. */
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

/** Release-specific URLs: never download from a mutable latest/source-code URL. */
function lieve_update_urls( $tag ) {
	$version = lieve_update_version( $tag );
	if ( ! $version ) { return array(); }
	$package = LIEVE_UPDATE_URI . '/releases/download/' . $tag . '/lieve-builder-' . $version . '.zip';
	return array( 'package' => $package, 'manifest' => $package . '.manifest.json', 'url' => LIEVE_UPDATE_URI . '/releases/tag/' . $tag );
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

/** Metadata is generated alongside the installable ZIP by scripts/package.mjs. */
function lieve_update_validate_manifest( $data, $version ) {
	if ( lieve_update_version( $version ) !== $version || ! is_array( $data ) || ( $data['theme'] ?? '' ) !== 'lieve-builder' || ( $data['version'] ?? '' ) !== $version || ( $data['development'] ?? null ) !== false || ( $data['update_uri'] ?? '' ) !== LIEVE_UPDATE_URI || ! is_string( $data['sha256'] ?? null ) || ! preg_match( '/^[a-f0-9]{64}$/D', $data['sha256'] ) ) {
		return new WP_Error( 'lieve_update_manifest', __( 'The update manifest does not match this theme and release.', 'lieve-builder' ) );
	}
	foreach ( array( 'requires', 'requires_php' ) as $key ) {
		if ( ! is_string( $data[ $key ] ?? null ) || ! preg_match( '/^[0-9]+(?:\.[0-9]+){1,3}$/D', $data[ $key ] ) ) { return new WP_Error( 'lieve_update_requirements', __( 'The release compatibility requirements could not be verified.', 'lieve-builder' ) ); }
	}
	// Existing manifests have no schema/package/size fields; keep that format usable.
	if ( ( array_key_exists( 'schema', $data ) && $data['schema'] !== 2 ) || ( array_key_exists( 'package', $data ) && $data['package'] !== 'lieve-builder-' . $version . '.zip' ) || ( array_key_exists( 'size', $data ) && ( ! is_int( $data['size'] ) || $data['size'] < 22 || $data['size'] > LIEVE_UPDATE_MAX_BYTES ) ) || ( isset( $data['schema'] ) && ! isset( $data['package'], $data['size'] ) ) ) { return new WP_Error( 'lieve_update_manifest', __( 'The manifest package identity or size is invalid.', 'lieve-builder' ) ); }
	$files = $data['files'] ?? null; $seen = array(); $total = 0;
	if ( ! is_array( $files ) || ! $files || count( $files ) > 5000 || array_values( $files ) !== $files ) { return new WP_Error( 'lieve_update_inventory', __( 'The release file inventory could not be verified.', 'lieve-builder' ) ); }
	foreach ( $files as $entry ) {
		if ( ! is_array( $entry ) || ! lieve_update_file_path( $entry['file'] ?? null ) || isset( $seen[ $entry['file'] ] ) || ! is_string( $entry['sha256'] ?? null ) || ! preg_match( '/^[a-f0-9]{64}$/D', $entry['sha256'] ) || ( isset( $data['schema'] ) && ! array_key_exists( 'size', $entry ) ) || ( array_key_exists( 'size', $entry ) && ( ! is_int( $entry['size'] ) || $entry['size'] < 0 || $entry['size'] > LIEVE_UPDATE_MAX_BYTES ) ) ) { return new WP_Error( 'lieve_update_inventory', __( 'The release file inventory contains an invalid or duplicate entry.', 'lieve-builder' ) ); }
		$seen[ $entry['file'] ] = true; $total += $entry['size'] ?? 0;
	}
	if ( ! isset( $seen['style.css'], $seen['functions.php'] ) || $total > LIEVE_UPDATE_MAX_BYTES ) { return new WP_Error( 'lieve_update_inventory', __( 'The release inventory is incomplete or exceeds the size limit.', 'lieve-builder' ) ); }
	return array_intersect_key( $data, array_flip( array( 'schema', 'theme', 'version', 'development', 'package', 'size', 'sha256', 'requires', 'requires_php', 'update_uri', 'files' ) ) );
}

function lieve_update_cache_valid( $cached ) {
	if ( ! is_array( $cached ) || ! isset( $cached['checked_at'], $cached['error'], $cached['retry_at'] ) || ! is_int( $cached['checked_at'] ) || $cached['checked_at'] < 0 || $cached['checked_at'] > time() + 300 || ! is_int( $cached['retry_at'] ) || $cached['retry_at'] < 0 || $cached['retry_at'] > time() + DAY_IN_SECONDS || ! is_string( $cached['error'] ) || ! array_key_exists( 'release', $cached ) ) { return false; }
	$release = $cached['release'];
	if ( null === $release ) { return true; }
	if ( ! is_array( $release ) || empty( $release['version'] ) || lieve_update_version( $release['version'] ) !== $release['version'] || ! is_string( $release['package'] ?? null ) ) { return false; }
	foreach ( array( $release['version'], 'v' . $release['version'] ) as $tag ) {
		$urls = lieve_update_urls( $tag );
		if ( ( $release['url'] ?? '' ) !== $urls['url'] ) { continue; }
		if ( '' === $release['package'] ) { return true; }
		$manifest = $release; $manifest['package'] = basename( $urls['package'] );
		return $release['package'] === $urls['package'] && ! is_wp_error( lieve_update_validate_manifest( $manifest, $release['version'] ) );
	}
	return false;
}

/** Cache successes for six hours, incomplete releases/errors briefly, rate limits until retry. */
function lieve_theme_update_check( $force = false ) {
	$cached = get_site_transient( LIEVE_UPDATE_CACHE );
	if ( lieve_update_cache_valid( $cached ) && ( ! $force || $cached['retry_at'] > time() ) ) { return $cached; }
	$result = array( 'checked_at' => time(), 'release' => null, 'error' => '', 'retry_at' => 0 );
	$raw = lieve_update_json( 'https://api.github.com/repos/redshapeagency/lieve-builder/releases/latest' );
	$error = is_wp_error( $raw ) ? $raw : null;
	if ( ! $error ) {
		$tag = $raw['tag_name'] ?? null; $version = lieve_update_version( $tag ); $urls = lieve_update_urls( $tag );
		if ( ! $version || ( $raw['draft'] ?? true ) !== false || ( $raw['prerelease'] ?? true ) !== false || ( $raw['html_url'] ?? '' ) !== ( $urls['url'] ?? null ) || ! is_array( $raw['assets'] ?? null ) ) {
			$error = new WP_Error( 'lieve_update_release', __( 'The published stable release could not be verified.', 'lieve-builder' ) );
		} else {
			$found = array(); $sizes = array();
			foreach ( $raw['assets'] as $asset ) {
				if ( ! is_array( $asset ) || ( $asset['state'] ?? '' ) !== 'uploaded' || ! is_int( $asset['size'] ?? null ) || $asset['size'] <= 0 || $asset['size'] > LIEVE_UPDATE_MAX_BYTES ) { continue; }
				foreach ( array( 'package', 'manifest' ) as $type ) { if ( ( $asset['browser_download_url'] ?? '' ) === $urls[ $type ] && ( $asset['name'] ?? '' ) === basename( $urls[ $type ] ) && ( $type !== 'manifest' || $asset['size'] <= 1048576 ) ) { $found[ $type ] = ( $found[ $type ] ?? 0 ) + 1; $sizes[ $type ] = $asset['size']; } }
			}
			$result['release'] = array( 'version' => $version, 'url' => $urls['url'], 'package' => '' );
			if ( count( $found ) === 2 && $found['package'] === 1 && $found['manifest'] === 1 ) {
				$manifest = lieve_update_json( $urls['manifest'] );
				$manifest = is_wp_error( $manifest ) ? $manifest : lieve_update_validate_manifest( $manifest, $version );
				if ( ! is_wp_error( $manifest ) && isset( $manifest['size'] ) && $manifest['size'] !== $sizes['package'] ) { $manifest = new WP_Error( 'lieve_update_manifest', __( 'The manifest and release asset sizes do not match.', 'lieve-builder' ) ); }
				if ( is_wp_error( $manifest ) ) { $error = $manifest; $result['release'] = null; }
				else { $result['release'] = array_merge( $manifest, $urls ); }
			}
		}
	}
	if ( $error ) { $result['error'] = $error->get_error_message(); $result['retry_at'] = (int) ( $error->get_error_data()['retry_at'] ?? 0 ); }
	$ttl = ! empty( $result['release']['package'] ) ? 6 * HOUR_IN_SECONDS : 600;
	set_site_transient( LIEVE_UPDATE_CACHE, $result, max( $ttl, $result['retry_at'] - time() ) );
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
	elseif ( empty( $release['package'] ) ) { $status['state'] = 'unavailable'; $status['message'] = __( 'The latest release does not have its installable ZIP and verification manifest yet. Try again after they are attached.', 'lieve-builder' ); }
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

/** Validate only our native theme upgrades, leaving all other downloads alone. */
function lieve_theme_update_download( $reply, $package, $upgrader, $extra ) {
	if ( ! lieve_theme_update_context( $upgrader, $extra ) ) { return $reply; }
	$verified = lieve_theme_update_verifications();
	if ( isset( $verified[ $upgrader ] ) ) { unset( $verified[ $upgrader ] ); }
	if ( is_wp_error( $reply ) ) { return $reply; }
	if ( ! lieve_update_location_valid() ) { return new WP_Error( 'lieve_update_location', __( 'Install the parent theme in the lieve-builder folder before using automatic updates.', 'lieve-builder' ) ); }
	$prefix = LIEVE_UPDATE_URI . '/releases/download/';
	if ( ! is_string( $package ) || strpos( $package, $prefix ) !== 0 ) { return new WP_Error( 'lieve_update_source', __( 'The update package is not an official LieveBuilder release.', 'lieve-builder' ) ); }
	$parts = explode( '/', substr( $package, strlen( $prefix ) ) ); $urls = lieve_update_urls( $parts[0] ?? null );
	if ( $package !== ( $urls['package'] ?? null ) ) { return new WP_Error( 'lieve_update_source', __( 'The release package URL could not be verified.', 'lieve-builder' ) ); }
	$manifest = lieve_update_json( $urls['manifest'] );
	$manifest = is_wp_error( $manifest ) ? $manifest : lieve_update_validate_manifest( $manifest, lieve_update_version( $parts[0] ) );
	if ( is_wp_error( $manifest ) ) { return $manifest; }
	if ( ! lieve_update_compatible( $manifest ) ) { return new WP_Error( 'lieve_update_incompatible', __( 'Upgrade WordPress or PHP before installing this release.', 'lieve-builder' ) ); }
	if ( ! version_compare( $manifest['version'], lieve_update_installed_version(), '>' ) ) { return new WP_Error( 'lieve_update_downgrade', __( 'The updater only installs newer releases. Use a deliberate manual installation to roll back.', 'lieve-builder' ) ); }
	if ( ! function_exists( 'download_url' ) ) { require_once ABSPATH . 'wp-admin/includes/file.php'; }
	$file = $reply;
	if ( false === $reply ) {
		$bound = static function( $args, $url ) use ( $package ) { if ( $url === $package ) { $args['limit_response_size'] = LIEVE_UPDATE_MAX_BYTES + 1; } return $args; };
		add_filter( 'http_request_args', $bound, 10, 2 );
		try { $file = download_url( $package, 60 ); } finally { remove_filter( 'http_request_args', $bound, 10 ); }
	}
	if ( is_wp_error( $file ) ) { return $file; }
	$size = is_string( $file ) && is_readable( $file ) && is_file( $file ) ? filesize( $file ) : false;
	$actual = is_int( $size ) && $size <= LIEVE_UPDATE_MAX_BYTES && ( ! isset( $manifest['size'] ) || $size === $manifest['size'] ) ? hash_file( 'sha256', $file ) : '';
	if ( ! is_string( $actual ) || ! hash_equals( $manifest['sha256'], $actual ) || ! is_int( $size ) || $size > LIEVE_UPDATE_MAX_BYTES || ( isset( $manifest['size'] ) && $size !== $manifest['size'] ) ) {
		if ( false === $reply && is_string( $file ) && is_file( $file ) ) { wp_delete_file( $file ); }
		return new WP_Error( 'lieve_update_checksum', __( 'The update download failed its SHA-256 check. Nothing has been installed.', 'lieve-builder' ) );
	}
	$verified[ $upgrader ] = $manifest;
	return $file;
}
add_filter( 'upgrader_pre_download', 'lieve_theme_update_download', 10, 4 );

/** Refuse a different theme/folder before WordPress replaces any installed files. */
function lieve_theme_update_source( $source, $remote_source, $upgrader, $extra ) {
	if ( ! lieve_theme_update_context( $upgrader, $extra ) ) { return $source; }
	$verified = lieve_theme_update_verifications();
	if ( is_wp_error( $source ) ) { if ( isset( $verified[ $upgrader ] ) ) { unset( $verified[ $upgrader ] ); } return $source; }
	if ( ! isset( $verified[ $upgrader ] ) ) { return new WP_Error( 'lieve_update_unverified', __( 'The release download was not verified. Nothing has been installed.', 'lieve-builder' ) ); }
	$manifest = $verified[ $upgrader ]; unset( $verified[ $upgrader ] );
	global $wp_filesystem;
	$root = rtrim( (string) $remote_source, '/\\' ) . '/';
	$top = $wp_filesystem ? $wp_filesystem->dirlist( $root, true, false ) : false;
	$direct = $wp_filesystem && ( $wp_filesystem->method ?? '' ) === 'direct';
	if ( ! $remote_source || rtrim( (string) $source, '/\\' ) . '/' !== $root . 'lieve-builder/' || ! is_array( $top ) || count( $top ) !== 1 || ( $top['lieve-builder']['type'] ?? '' ) !== 'd' || ( $direct && is_link( $root . 'lieve-builder' ) ) ) { return new WP_Error( 'lieve_update_identity', __( 'The ZIP must contain only the official lieve-builder root folder. Nothing has been installed.', 'lieve-builder' ) ); }
	$inventory = array_column( $manifest['files'], null, 'file' ); $seen = array(); $bytes = 0; $allowed_dirs = array();
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
	$headers = lieve_update_headers( $css );
	if ( count( $seen ) !== count( $inventory ) || $headers['Theme Name'] !== 'Lieve Builder' || $headers['Version'] !== $manifest['version'] || $headers['Update URI'] !== LIEVE_UPDATE_URI || $headers['Text Domain'] !== 'lieve-builder' || $headers['Template'] !== '' || $headers['Requires at least'] !== $manifest['requires'] || $headers['Requires PHP'] !== $manifest['requires_php'] || ! preg_match( '/define\s*\(\s*[\'\"]LIEVE_VERSION[\'\"]\s*,\s*[\'\"]' . preg_quote( $manifest['version'], '/' ) . '[\'\"]\s*\)/', $functions ) ) { return new WP_Error( 'lieve_update_identity', __( 'The extracted theme identity, version or requirements do not match the verified release.', 'lieve-builder' ) ); }
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
