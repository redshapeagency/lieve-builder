<?php
/** Public GitHub releases, integrated with WordPress theme updates. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'LIEVE_UPDATE_URI', 'https://github.com/redshapeagency/lieve-builder' );
define( 'LIEVE_UPDATE_CACHE', 'lieve_github_release_v1' );

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
	$response = wp_safe_remote_get( $url, array( 'timeout' => 8, 'redirection' => 3, 'limit_response_size' => 1048576, 'headers' => array( 'Accept' => 'application/json', 'User-Agent' => 'LieveBuilder/' . LIEVE_VERSION ) ) );
	if ( is_wp_error( $response ) ) { return new WP_Error( 'lieve_update_network', __( 'GitHub could not be reached. Try again later.', 'lieve-builder' ) ); }
	$code = wp_remote_retrieve_response_code( $response );
	if ( 403 === $code || 429 === $code ) {
		$reset = (int) wp_remote_retrieve_header( $response, 'x-ratelimit-reset' );
		$retry = (int) wp_remote_retrieve_header( $response, 'retry-after' );
		return new WP_Error( 'lieve_update_rate_limit', __( 'GitHub is limiting requests. Please try again later.', 'lieve-builder' ), array( 'retry_at' => min( time() + DAY_IN_SECONDS, max( time() + 600, $reset, time() + $retry ) ) ) );
	}
	if ( 404 === $code ) { return new WP_Error( 'lieve_update_missing', __( 'No published release or required release asset is available yet.', 'lieve-builder' ) ); }
	if ( 200 !== $code ) { return new WP_Error( 'lieve_update_http', __( 'GitHub returned an unexpected response. Try again later.', 'lieve-builder' ) ); }
	$data = json_decode( wp_remote_retrieve_body( $response ), true );
	return is_array( $data ) ? $data : new WP_Error( 'lieve_update_json', __( 'The release information could not be verified.', 'lieve-builder' ) );
}

/** Metadata is generated alongside the installable ZIP by scripts/package.mjs. */
function lieve_update_validate_manifest( $data, $version ) {
	if ( ! is_array( $data ) || ( $data['theme'] ?? '' ) !== 'lieve-builder' || ( $data['version'] ?? '' ) !== $version || ( $data['development'] ?? null ) !== false || ( $data['update_uri'] ?? '' ) !== LIEVE_UPDATE_URI || ! is_string( $data['sha256'] ?? null ) || ! preg_match( '/^[a-f0-9]{64}$/D', $data['sha256'] ) ) {
		return new WP_Error( 'lieve_update_manifest', __( 'The update manifest does not match this theme and release.', 'lieve-builder' ) );
	}
	foreach ( array( 'requires', 'requires_php' ) as $key ) {
		if ( ! is_string( $data[ $key ] ?? null ) || ! preg_match( '/^[0-9]+(?:\.[0-9]+){1,3}$/D', $data[ $key ] ) ) { return new WP_Error( 'lieve_update_requirements', __( 'The release compatibility requirements could not be verified.', 'lieve-builder' ) ); }
	}
	return array_intersect_key( $data, array_flip( array( 'theme', 'version', 'sha256', 'requires', 'requires_php', 'update_uri' ) ) );
}

/** Cache successes for six hours, incomplete releases/errors briefly, rate limits until retry. */
function lieve_theme_update_check( $force = false ) {
	$cached = get_site_transient( LIEVE_UPDATE_CACHE );
	if ( is_array( $cached ) && ( ! $force || ( $cached['retry_at'] ?? 0 ) > time() ) ) { return $cached; }
	$result = array( 'checked_at' => time(), 'release' => null, 'error' => '', 'retry_at' => 0 );
	$raw = lieve_update_json( 'https://api.github.com/repos/redshapeagency/lieve-builder/releases/latest' );
	$error = is_wp_error( $raw ) ? $raw : null;
	if ( ! $error ) {
		$tag = $raw['tag_name'] ?? null; $version = lieve_update_version( $tag ); $urls = lieve_update_urls( $tag );
		if ( ! $version || ( $raw['draft'] ?? true ) !== false || ( $raw['prerelease'] ?? true ) !== false || ( $raw['html_url'] ?? '' ) !== ( $urls['url'] ?? null ) || ! is_array( $raw['assets'] ?? null ) ) {
			$error = new WP_Error( 'lieve_update_release', __( 'The published stable release could not be verified.', 'lieve-builder' ) );
		} else {
			$found = array();
			foreach ( $raw['assets'] as $asset ) {
				if ( ! is_array( $asset ) || ( $asset['state'] ?? '' ) !== 'uploaded' || ! is_numeric( $asset['size'] ?? null ) || $asset['size'] <= 0 ) { continue; }
				foreach ( array( 'package', 'manifest' ) as $type ) { if ( ( $asset['browser_download_url'] ?? '' ) === $urls[ $type ] && ( $asset['name'] ?? '' ) === basename( $urls[ $type ] ) ) { $found[ $type ] = true; } }
			}
			$result['release'] = array( 'version' => $version, 'url' => $urls['url'], 'package' => '' );
			if ( count( $found ) === 2 ) {
				$manifest = lieve_update_json( $urls['manifest'] );
				$manifest = is_wp_error( $manifest ) ? $manifest : lieve_update_validate_manifest( $manifest, $version );
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
	if ( ! $release || empty( $release['package'] ) ) { return false; }
	return array( 'id' => LIEVE_UPDATE_URI, 'theme' => 'lieve-builder', 'version' => $release['version'], 'new_version' => $release['version'], 'url' => $release['url'], 'package' => lieve_update_compatible( $release ) ? $release['package'] : '', 'requires' => $release['requires'], 'requires_php' => $release['requires_php'] );
}

function lieve_theme_update_response( $update, $theme_data, $stylesheet ) {
	if ( 'lieve-builder' !== $stylesheet || ! is_string( $theme_data['UpdateURI'] ?? null ) || rtrim( $theme_data['UpdateURI'], '/' ) !== LIEVE_UPDATE_URI ) { return $update; }
	// Registration is cheap; visiting the frontend must not initiate a GitHub request.
	if ( ! is_admin() && ! wp_doing_cron() && ! ( defined( 'WP_CLI' ) && WP_CLI ) ) { return false; }
	$result = lieve_theme_update_check();
	return lieve_theme_update_offer( $result['release'] );
}
add_filter( 'update_themes_github.com', 'lieve_theme_update_response', 10, 3 );

/** Read-only UI status. Rendering Settings never initiates an update request. */
function lieve_theme_update_status( $result = null ) {
	$result = null === $result ? get_site_transient( LIEVE_UPDATE_CACHE ) : $result;
	$status = array( 'state' => 'not_checked', 'message' => __( 'Check for published stable releases on GitHub. This does not install an update or save your settings.', 'lieve-builder' ), 'installed_version' => LIEVE_VERSION, 'latest_version' => '', 'checked_at' => 0 );
	if ( ! is_array( $result ) ) { return $status; }
	$status['checked_at'] = (int) ( $result['checked_at'] ?? 0 );
	if ( ! empty( $result['error'] ) ) { $status['state'] = 'error'; $status['message'] = $result['error']; return $status; }
	$release = $result['release'] ?? null;
	if ( ! $release ) { $status['state'] = 'unavailable'; $status['message'] = __( 'No published stable release is available yet.', 'lieve-builder' ); return $status; }
	$status['latest_version'] = $release['version'];
	if ( ! version_compare( $release['version'], LIEVE_VERSION, '>' ) ) { $status['state'] = 'current'; $status['message'] = __( 'No newer stable version is available.', 'lieve-builder' ); }
	elseif ( empty( $release['package'] ) ) { $status['state'] = 'unavailable'; $status['message'] = __( 'The latest release does not have its installable ZIP and verification manifest yet. Try again after they are attached.', 'lieve-builder' ); }
	elseif ( ! lieve_update_compatible( $release ) ) { $status['state'] = 'incompatible'; $status['message'] = sprintf( __( 'This release requires WordPress %1$s and PHP %2$s or newer.', 'lieve-builder' ), $release['requires'], $release['requires_php'] ); }
	else { $status['state'] = 'available'; $status['message'] = sprintf( __( 'Version %s is available. Open WordPress Updates to install it.', 'lieve-builder' ), $release['version'] ); }
	return $status;
}

function lieve_theme_update_permission() { return current_user_can( 'manage_options' ) && current_user_can( 'update_themes' ); }

function lieve_rest_check_theme_updates() {
	if ( ! lieve_theme_update_permission() ) { return new WP_Error( 'lieve_update_forbidden', __( 'You cannot check for theme updates.', 'lieve-builder' ), array( 'status' => 403 ) ); }
	if ( get_site_transient( 'lieve_update_manual_cooldown' ) ) { return new WP_Error( 'lieve_update_cooldown', __( 'Please wait a minute before checking again.', 'lieve-builder' ), array( 'status' => 429 ) ); }
	set_site_transient( 'lieve_update_manual_cooldown', true, 60 );
	$result = lieve_theme_update_check( true );
	$updates = get_site_transient( 'update_themes' );
	if ( ! is_object( $updates ) ) { $updates = (object) array( 'last_checked' => 0 ); }
	$updates->checked = isset( $updates->checked ) && is_array( $updates->checked ) ? $updates->checked : array();
	$updates->checked['lieve-builder'] = LIEVE_VERSION;
	$updates->response = isset( $updates->response ) && is_array( $updates->response ) ? $updates->response : array();
	$updates->no_update = isset( $updates->no_update ) && is_array( $updates->no_update ) ? $updates->no_update : array();
	unset( $updates->response['lieve-builder'], $updates->no_update['lieve-builder'] );
	$offer = lieve_theme_update_offer( $result['release'] );
	if ( $offer ) { if ( version_compare( $offer['version'], LIEVE_VERSION, '>' ) ) { $updates->response['lieve-builder'] = $offer; } else { $updates->no_update['lieve-builder'] = $offer; } }
	set_site_transient( 'update_themes', $updates );
	return rest_ensure_response( lieve_theme_update_status( $result ) );
}
add_action( 'rest_api_init', static function() {
	register_rest_route( 'lieve/v1', '/theme-updates/check', array( 'methods' => 'POST', 'permission_callback' => 'lieve_theme_update_permission', 'callback' => 'lieve_rest_check_theme_updates' ) );
} );

/** Validate only our native theme upgrades, leaving all other downloads alone. */
function lieve_theme_update_download( $reply, $package, $upgrader, $extra ) {
	if ( ( $extra['type'] ?? '' ) !== 'theme' || ( $extra['action'] ?? '' ) !== 'update' || ( $extra['theme'] ?? '' ) !== 'lieve-builder' || is_wp_error( $reply ) ) { return $reply; }
	$prefix = LIEVE_UPDATE_URI . '/releases/download/';
	if ( ! is_string( $package ) || strpos( $package, $prefix ) !== 0 ) { return new WP_Error( 'lieve_update_source', __( 'The update package is not an official LieveBuilder release.', 'lieve-builder' ) ); }
	$parts = explode( '/', substr( $package, strlen( $prefix ) ) ); $urls = lieve_update_urls( $parts[0] ?? null );
	if ( $package !== ( $urls['package'] ?? null ) ) { return new WP_Error( 'lieve_update_source', __( 'The release package URL could not be verified.', 'lieve-builder' ) ); }
	$manifest = lieve_update_json( $urls['manifest'] );
	$manifest = is_wp_error( $manifest ) ? $manifest : lieve_update_validate_manifest( $manifest, lieve_update_version( $parts[0] ) );
	if ( is_wp_error( $manifest ) ) { return $manifest; }
	if ( ! lieve_update_compatible( $manifest ) ) { return new WP_Error( 'lieve_update_incompatible', __( 'Upgrade WordPress or PHP before installing this release.', 'lieve-builder' ) ); }
	if ( ! version_compare( $manifest['version'], LIEVE_VERSION, '>' ) ) { return new WP_Error( 'lieve_update_downgrade', __( 'The updater only installs newer releases. Use a deliberate manual installation to roll back.', 'lieve-builder' ) ); }
	if ( ! function_exists( 'download_url' ) ) { require_once ABSPATH . 'wp-admin/includes/file.php'; }
	$file = false === $reply ? download_url( $package, 60 ) : $reply;
	if ( is_wp_error( $file ) ) { return $file; }
	$actual = is_string( $file ) && is_readable( $file ) && is_file( $file ) ? hash_file( 'sha256', $file ) : '';
	if ( ! is_string( $actual ) || ! hash_equals( $manifest['sha256'], $actual ) ) {
		if ( false === $reply && is_string( $file ) && is_file( $file ) ) { wp_delete_file( $file ); }
		return new WP_Error( 'lieve_update_checksum', __( 'The update download failed its SHA-256 check. Nothing has been installed.', 'lieve-builder' ) );
	}
	return $file;
}
add_filter( 'upgrader_pre_download', 'lieve_theme_update_download', 10, 4 );

/** Refuse a different theme/folder before WordPress replaces any installed files. */
function lieve_theme_update_source( $source, $remote_source, $upgrader, $extra ) {
	if ( ( $extra['type'] ?? '' ) !== 'theme' || ( $extra['action'] ?? '' ) !== 'update' || ( $extra['theme'] ?? '' ) !== 'lieve-builder' || is_wp_error( $source ) ) { return $source; }
	global $wp_filesystem;
	$css = $wp_filesystem ? $wp_filesystem->get_contents( $source . 'style.css' ) : ( is_readable( $source . 'style.css' ) ? file_get_contents( $source . 'style.css' ) : '' );
	if ( basename( rtrim( $source, '/\\' ) ) !== 'lieve-builder' || ! preg_match( '/^Theme Name:\s*Lieve Builder\s*$/m', (string) $css ) || ! preg_match( '/^Update URI:\s*' . preg_quote( LIEVE_UPDATE_URI, '/' ) . '\s*$/m', (string) $css ) ) { return new WP_Error( 'lieve_update_identity', __( 'The ZIP must contain the official theme inside the lieve-builder folder. Nothing has been installed.', 'lieve-builder' ) ); }
	return $source;
}
add_filter( 'upgrader_source_selection', 'lieve_theme_update_source', 10, 4 );

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
