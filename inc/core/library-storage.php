<?php
/** Read-only integrity snapshots for global libraries. Never repairs persisted data. */
defined( 'ABSPATH' ) || exit;

function lieve_library_snapshot( $option, $empty, $normalize, $fresh = false, $cached = false ) {
	static $snapshots = array();
	$missing = new stdClass();
	global $wpdb;
	try {
		if ( $fresh && function_exists( 'wp_cache_delete' ) ) {
			// An autoloaded value and a negative lookup can both hide a newer writer.
			foreach ( array( $option, 'alloptions', 'notoptions' ) as $key ) { wp_cache_delete( $key, 'options' ); }
		}
		$queries = isset( $wpdb->num_queries ) ? $wpdb->num_queries : null;
		$raw = get_option( $option, $missing );
		if ( ! empty( $wpdb->last_error ) && ( $fresh || $queries !== ( $wpdb->num_queries ?? null ) ) ) { throw new RuntimeException( 'Library read failed.' ); }
	} catch ( Throwable $error ) {
		return lieve_library_blocked_snapshot( $option, 'unreadable', null );
	}
	if ( $raw === $missing ) {
		return array( 'state' => 'missing', 'data' => $empty, 'revision' => hash( 'sha256', wp_json_encode( $empty ) ), 'error' => null );
	}
	if ( $cached && ! $fresh && isset( $snapshots[ $option ] ) && $snapshots[ $option ]['raw'] === $raw ) { return $snapshots[ $option ]['snapshot']; }
	try { $data = call_user_func( $normalize, $raw ); }
	catch ( Throwable $error ) { $data = null; }
	if ( ! is_array( $data ) || is_wp_error( $data ) ) {
		$state = is_array( $raw ) && is_int( $raw['version'] ?? null ) && $raw['version'] > 1 ? 'future' : 'invalid';
		$snapshot = lieve_library_blocked_snapshot( $option, $state, $raw );
		if ( $cached ) { $snapshots[ $option ] = array( 'raw' => $raw, 'snapshot' => $snapshot ); }
		return $snapshot;
	}
	$snapshot = array( 'state' => 'valid', 'data' => $data, 'revision' => hash( 'sha256', wp_json_encode( $data ) ), 'error' => null );
	if ( $cached ) { $snapshots[ $option ] = array( 'raw' => $raw, 'snapshot' => $snapshot ); }
	return $snapshot;
}

function lieve_library_blocked_snapshot( $option, $state, $raw ) {
	// Domain separation prevents an invalid raw from becoming an empty-library revision.
	try { $identity = serialize( $raw ); }
	catch ( Throwable $error ) { $identity = gettype( $raw ); }
	$message = 'The stored library could not be read or validated. The original data has been preserved. Editing and saving this library are disabled. Restore a compatible backup or use a compatible version of Lieve Builder.';
	if ( 'future' === $state ) { $message = 'This library uses a newer schema that this version of Lieve Builder cannot edit. The original data has been preserved. Use a compatible version before editing or saving it.'; }
	return array(
		'state' => $state, 'data' => null,
		'revision' => hash( 'sha256', 'lieve-blocked-library:' . $option . ':' . $state . ':' . $identity ),
		'error' => new WP_Error( 'lieve_library_unavailable', $message, array( 'status' => 'unreadable' === $state ? 500 : 409, 'state' => $state ) ),
	);
}

/** Safe bootstrap metadata only. No original option value or validation internals. */
function lieve_library_error_config( $snapshot ) {
	return $snapshot['error'] ? array( 'code' => 'lieve_library_unavailable', 'state' => $snapshot['state'], 'message' => $snapshot['error']->get_error_message() ) : null;
}

function lieve_render_library_error( $message ) {
	echo '<div class="lieve-ds-guide" role="alert"><h3>Library unavailable</h3><p>' . esc_html( $message ) . '</p></div>';
}
