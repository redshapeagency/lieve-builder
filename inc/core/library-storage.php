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

/** AUD-06: only these two library writers participate; no other lock protocol is changed. */
function lieve_library_lock_key( $option ) {
	$keys = array( 'lieve_design_system' => 'lieve_design_system_lock', 'lieve_global_classes' => 'lieve_classes_lock' );
	return $keys[ $option ] ?? null;
}
function lieve_library_flush_options( $option ) {
	foreach ( array( $option, 'alloptions', 'notoptions' ) as $key ) { wp_cache_delete( $key, 'options' ); }
}
function lieve_library_save_error( $status = 500 ) {
	return new WP_Error( 409 === $status ? 'lieve_library_conflict' : 'lieve_library_save_failed', 409 === $status ? 'This save lost its lease or the library changed. Your draft is retained; reload the library before saving again.' : 'The library operation could not be confirmed. Your draft is retained; reload the current library before retrying.', array( 'status' => $status ) );
}
/** A raw SQL read, never an object-cache ownership decision. NULL means the option is absent. */
function lieve_library_sql_value( $option ) {
	global $wpdb;
	$value = $wpdb->get_var( $wpdb->prepare( "SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", $option ) );
	return $wpdb->last_error ? lieve_library_save_error() : $value;
}
function lieve_library_acquire_lock( $option ) {
	global $wpdb;
	$key = lieve_library_lock_key( $option ); if ( ! $key ) { return lieve_library_save_error(); }
	try {
		$now = $wpdb->get_var( 'SELECT UNIX_TIMESTAMP()' );
		if ( $wpdb->last_error || ! preg_match( '/^[0-9]+$/D', (string) $now ) || (int) $now <= 0 ) { return lieve_library_save_error(); }
		$owner = $now . ':' . bin2hex( random_bytes( 16 ) ); $previous = lieve_library_sql_value( $key );
		if ( is_wp_error( $previous ) ) { return $previous; }
		if ( null === $previous ) {
			// add_option() uses an upsert; a stale negative cache must never replace a live owner.
			$result = $wpdb->query( $wpdb->prepare( "INSERT IGNORE INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %s, 'no')", $key, $owner ) );
		} elseif ( preg_match( '/^[0-9]+(?::[a-f0-9]{32})?$/D', $previous ) ) {
			// Atomic takeover of the exact expired value, including supported legacy timestamp locks.
			$result = $wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->options} SET option_value = %s, autoload = 'no' WHERE option_name = %s AND BINARY option_value = %s AND CAST(SUBSTRING_INDEX(option_value, ':', 1) AS UNSIGNED) < UNIX_TIMESTAMP() - 30", $owner, $key, $previous ) );
		} else { return lieve_library_save_error( 409 ); }
		if ( false === $result || $wpdb->last_error ) { return lieve_library_save_error(); }
		return 1 === (int) $result ? array( 'option' => $option, 'key' => $key, 'owner' => $owner ) : lieve_library_save_error( 409 );
	} catch ( Throwable $error ) { return lieve_library_save_error(); }
	finally { lieve_library_flush_options( $key ); }
}
/** Compare and delete in ONE statement. Zero affected rows is a harmless non-owner release. */
function lieve_library_release_lock( $option, $owner ) {
	global $wpdb;
	$key = lieve_library_lock_key( $option );
	if ( ! $key || ! is_string( $owner ) || ! preg_match( '/^[0-9]+:[a-f0-9]{32}$/D', $owner ) ) { return lieve_library_save_error(); }
	try {
		$result = $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name = %s AND BINARY option_value = %s", $key, $owner ) );
		return false === $result || $wpdb->last_error ? lieve_library_save_error() : (int) $result;
	} catch ( Throwable $error ) { return lieve_library_save_error(); }
	finally { lieve_library_flush_options( $key ); }
}
function lieve_with_library_lock( $option, $callback ) {
	$lease = lieve_library_acquire_lock( $option ); if ( is_wp_error( $lease ) ) { return $lease; }
	try {
		// Capture BEFORE the fresh AUD-02 validation/revision read. A later external edit must fail CAS.
		$lease['raw'] = lieve_library_sql_value( $option );
		$result = is_wp_error( $lease['raw'] ) ? $lease['raw'] : $callback( $lease );
	} catch ( Throwable $error ) { $result = lieve_library_save_error(); }
	finally { $released = lieve_library_release_lock( $option, $lease['owner'] ); }
	return is_wp_error( $released ) ? $released : $result;
}

/** Bind validation/revision to the SAME authoritative bytes used by the SQL write fence. */
function lieve_library_owned_snapshot( $lease ) {
	$design = 'lieve_design_system' === $lease['option'];
	$empty = $design ? lieve_design_empty() : lieve_classes_empty();
	lieve_library_flush_options( $lease['option'] );
	if ( null === $lease['raw'] ) { return array( 'state' => 'missing', 'data' => $empty, 'revision' => hash( 'sha256', wp_json_encode( $empty ) ), 'error' => null ); }
	$raw = maybe_unserialize( $lease['raw'] );
	try { $data = $design ? lieve_normalize_design_system( $raw ) : lieve_normalize_classes( $raw ); }
	catch ( Throwable $error ) { $data = null; }
	if ( ! is_array( $data ) || is_wp_error( $data ) ) {
		$state = is_array( $raw ) && is_int( $raw['version'] ?? null ) && $raw['version'] > 1 ? 'future' : 'invalid';
		return lieve_library_blocked_snapshot( $lease['option'], $state, $raw );
	}
	return array( 'state' => 'valid', 'data' => $data, 'revision' => hash( 'sha256', wp_json_encode( $data ) ), 'error' => null );
}

/** Recognize the active core writer when an adapter changes its SQL beyond supported shapes. */
function lieve_library_is_option_write( $option ) {
	$frames = debug_backtrace( DEBUG_BACKTRACE_PROVIDE_OBJECT, 12 );
	global $wpdb;
	foreach ( $frames as $i => $frame ) {
		if ( 'query' !== $frame['function'] || ( $frame['object'] ?? null ) !== $wpdb ) { continue; }
		$caller = $frames[ $i + 1 ] ?? array();
		if ( 'update' === ( $caller['function'] ?? '' ) && ( $caller['object'] ?? null ) === $wpdb ) { $caller = $frames[ $i + 2 ] ?? array(); }
		return in_array( $caller['function'] ?? '', array( 'update_option', 'add_option' ), true ) && ( $caller['args'][0] ?? null ) === $option;
	}
	return false;
}

/**
 * Keep WordPress option filters/hooks/cache semantics; fence only its two managed DML shapes.
 * Lease ownership, lease validity and the original bytes are checked by the SAME SQL write.
 * UPDATE JOIN / INSERT SELECT FOR UPDATE also lock the lease row for the statement's duration.
 */
function lieve_library_write_owned( $lease, $data ) {
	global $wpdb;
	$option = $lease['option']; $key = lieve_library_lock_key( $option );
	if ( ! $key || $key !== $lease['key'] || ! preg_match( '/^[0-9]+:[a-f0-9]{32}$/D', $lease['owner'] ) || ! array_key_exists( 'raw', $lease ) ) { return lieve_library_save_error(); }
	$table = '`' . str_replace( '`', '``', $wpdb->options ) . '`';
	$quoted_option = $wpdb->prepare( '%s', $option ); $attempted = false;
	$fence = static function( $sql ) use ( $wpdb, $table, $quoted_option, $lease, $key, &$attempted ) {
		// Match complete SQL string literals, including escaped quotes/backslashes. Never parse CSS as SQL.
		$literal = "'(?:[^'\\\\]++|\\\\.)*+'"; $identifier = preg_quote( $table, '~' ); $name = preg_quote( $quoted_option, '~' );
		$target_table = '`?' . preg_quote( $wpdb->options, '~' ) . '`?';
		$update_target = preg_match( '~^\s*UPDATE\s+' . $target_table . '\s+SET\s+.*\sWHERE\s+`?option_name`?\s*=\s*' . $name . '(?:\s|$)~is', $sql );
		$insert_target = preg_match( '~^\s*INSERT\s+INTO\s+' . $target_table . '\s+.*\sVALUES\s*\\(\s*' . $name . '\s*,~is', $sql );
		if ( ! $update_target && ! $insert_target ) {
			// Unknown core DML must not silently escape the fence (field order, comments, adapters).
			if ( preg_match( '~^\s*(?:/\*.*?\*/\s*)*(?:UPDATE|INSERT|REPLACE|DELETE)\b~is', $sql ) && lieve_library_is_option_write( $lease['option'] ) ) { throw new RuntimeException( 'Unsupported library option write.' ); }
			return $sql;
		}
		$attempted = true;
		// query's priority-0 placeholder cleanup already ran; clean any tokens our prepare adds here.
		$guard = $wpdb->remove_placeholder_escape( $wpdb->prepare( "lieve_lease.option_name = %s AND BINARY lieve_lease.option_value = %s AND CAST(SUBSTRING_INDEX(lieve_lease.option_value, ':', 1) AS UNSIGNED) >= UNIX_TIMESTAMP() - 30", $key, $lease['owner'] ) );
		if ( $update_target && preg_match( '~^UPDATE ' . $identifier . ' SET `option_value` = (' . $literal . '), `autoload` = (' . $literal . ') WHERE `option_name` = ' . $name . '$~sD', $sql, $values ) ) {
			if ( null === $lease['raw'] ) { return "UPDATE $table SET option_value = option_value WHERE 1 = 0"; }
			$baseline = $wpdb->remove_placeholder_escape( $wpdb->prepare( 'lieve_data.option_name = %s AND BINARY lieve_data.option_value = %s', $lease['option'], $lease['raw'] ) );
			return "UPDATE $table AS lieve_data INNER JOIN $table AS lieve_lease ON $guard SET lieve_data.option_value = {$values[1]}, lieve_data.autoload = {$values[2]} WHERE $baseline";
		}
		if ( $insert_target && preg_match( '~^INSERT INTO ' . $identifier . ' \(`option_name`, `option_value`, `autoload`\) VALUES \(' . $name . ', (' . $literal . '), (' . $literal . ')\) ON DUPLICATE KEY UPDATE .*\z~sD', $sql, $values ) ) {
			if ( null !== $lease['raw'] ) { return "UPDATE $table SET option_value = option_value WHERE 1 = 0"; }
			return "INSERT INTO $table (option_name, option_value, autoload) SELECT $quoted_option, {$values[1]}, {$values[2]} FROM $table AS lieve_lease WHERE $guard FOR UPDATE";
		}
		// A changed/custom core DML format must fail closed, never fall through to an unfenced write.
		throw new RuntimeException( 'Unsupported library option write.' );
	};
	add_filter( 'query', $fence, PHP_INT_MAX );
	try { $updated = update_option( $option, $data, false ); $sql_error = $wpdb->last_error; }
	finally { remove_filter( 'query', $fence, PHP_INT_MAX ); lieve_library_flush_options( $option ); }
	if ( $sql_error ) { return lieve_library_save_error(); }
	if ( $attempted && ! $updated ) { return lieve_library_save_error( 409 ); }
	if ( ! $attempted ) {
		// update_option() may short-circuit an unchanged value. It still cannot confirm a lost lease.
		$alive = $wpdb->get_var( $wpdb->prepare( "SELECT 1 FROM {$wpdb->options} WHERE option_name = %s AND BINARY option_value = %s AND CAST(SUBSTRING_INDEX(option_value, ':', 1) AS UNSIGNED) >= UNIX_TIMESTAMP() - 30", $key, $lease['owner'] ) );
		if ( $wpdb->last_error ) { return lieve_library_save_error(); }
		if ( '1' !== (string) $alive ) { return lieve_library_save_error( 409 ); }
	}
	$lease['raw'] = lieve_library_sql_value( $option );
	if ( is_wp_error( $lease['raw'] ) ) { return $lease['raw']; }
	$snapshot = lieve_library_owned_snapshot( $lease );
	if ( $snapshot['error'] ) { return $snapshot['error']; }
	return hash_equals( hash( 'sha256', wp_json_encode( $data ) ), $snapshot['revision'] ) ? true : lieve_library_save_error();
}
