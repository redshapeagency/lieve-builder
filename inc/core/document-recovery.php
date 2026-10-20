<?php
/** Private recovery drafts and WordPress-native revision metadata. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Core revisions retain the complete page contract, not global design libraries. */
function lieve_register_document_revisions() {
	$keys = array( LIEVE_META_DOCUMENT => 'object', LIEVE_META_ENABLED => 'string', LIEVE_META_HEADER_TEMPLATE => 'string', LIEVE_META_FOOTER_TEMPLATE => 'string', LIEVE_META_SEO => 'object', LIEVE_META_HEAD => 'object', LIEVE_META_PAGE_MARKUP => 'object', '_lieve_seo_noindex' => 'string' );
	$keys += array( LIEVE_TEMPLATE_TYPE_META => 'string', LIEVE_TEMPLATE_CONDITIONS_META => 'array', LIEVE_TEMPLATE_CONDITION_META => 'string', LIEVE_POPUP_OPENING_META => 'string', LIEVE_POPUP_SETTINGS_META => 'object' );
	foreach ( get_post_types() as $type ) {
		if ( ! lieve_builder_supports_post_type( $type ) ) { continue; }
		add_post_type_support( $type, 'revisions' );
		foreach ( $keys as $key => $data_type ) { register_post_meta( $type, $key, array( 'type' => $data_type, 'single' => true, 'show_in_rest' => false, 'revisions_enabled' => true, 'auth_callback' => static function( $allowed, $meta_key, $id ) { return current_user_can( 'edit_post', $id ); } ) ); }
	}
}
add_action( 'init', 'lieve_register_document_revisions', 99 );
add_filter( 'wp_revisions_to_keep', static function( $count, $post ) { return lieve_builder_is_enabled( $post->ID ) ? ( $count < 0 ? 20 : min( 20, $count ) ) : $count; }, 10, 2 );
function lieve_record_document_revision( $id ) {
	// Do not touch post_content. Core owns timestamps and revision creation.
	$result = wp_update_post( array( 'ID' => $id ), true );
	return is_wp_error( $result ) || ! $result ? new WP_Error( 'lieve_document_timestamp_failed', __( 'The page modification record could not be saved. Your draft is retained.', 'lieve-builder' ), array( 'status' => 500 ) ) : true;
}
add_action( 'wp_restore_post_revision', static function( $id ) { do_action( 'lieve_builder_saved', $id, lieve_get_document( $id ) ); }, 20 );

/** Make builder-only changes visible on the native Revisions comparison screen. */
function lieve_document_revision_diff( $fields, $from, $to ) {
	$id = $to->post_parent ?: $to->ID;
	if ( ! current_user_can( 'edit_post', $id ) || ! lieve_builder_supports_post_type( get_post_type( $id ) ) ) { return $fields; }
	$labels = array( LIEVE_META_DOCUMENT => 'Lieve layout', LIEVE_META_ENABLED => 'Lieve enabled', LIEVE_META_HEADER_TEMPLATE => 'Header assignment', LIEVE_META_FOOTER_TEMPLATE => 'Footer assignment', LIEVE_META_SEO => 'Page SEO', LIEVE_META_HEAD => 'Head overrides', LIEVE_META_PAGE_MARKUP => 'Page Markup', LIEVE_TEMPLATE_TYPE_META => 'Template type', LIEVE_TEMPLATE_CONDITIONS_META => 'Display conditions', LIEVE_POPUP_SETTINGS_META => 'Pop Up settings' );
	$format = static function( $value ) { $json = wp_json_encode( $value, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ); return strlen( $json ) > 200000 ? 'Large layout (' . strlen( $json ) . ' bytes). SHA-256: ' . hash( 'sha256', $json ) . "\nRestore this revision to inspect the complete layout in Lieve." : $json; };
	foreach ( $labels as $key => $label ) {
		$before = $from ? get_post_meta( $from->ID, $key, true ) : ''; $after = get_post_meta( $to->ID, $key, true );
		if ( $before === $after ) { continue; }
		$diff = wp_text_diff( $format( $before ), $format( $after ), array( 'show_split_view' => true ) );
		if ( $diff ) { $fields[] = array( 'id' => $key, 'name' => $label, 'diff' => $diff ); }
	}
	return $fields;
}
add_filter( 'wp_get_revision_ui_diff', 'lieve_document_revision_diff', 10, 3 );

/** One non-public user-meta record, max ten sessions / seven days, never autoloaded. */
function lieve_recovery_entries( $user_id = 0 ) {
	$entries = get_user_meta( $user_id ?: get_current_user_id(), '_lieve_editor_recovery', true );
	return array_slice( array_values( array_filter( is_array( $entries ) ? $entries : array(), static function( $entry ) { return is_array( $entry ) && ( $entry['updated'] ?? 0 ) > time() - 7 * DAY_IN_SECONDS; } ) ), -10 );
}
function lieve_rest_document_recovery( $request ) {
	$id = (int) $request['id']; $method = $request->get_method();
	return lieve_with_template_lock( 'recovery:' . get_current_user_id(), static function() use ( $id, $method, $request ) {
		$entries = lieve_recovery_entries();
		if ( 'GET' === $method ) { return rest_ensure_response( array( 'drafts' => array_values( array_filter( $entries, static function( $entry ) use ( $id ) { return $entry['postId'] === $id; } ) ) ) ); }
		$session = $request->get_param( 'session' );
		if ( ! is_string( $session ) || ! preg_match( '/^[a-zA-Z0-9_-]{16,80}$/D', $session ) ) { return new WP_Error( 'lieve_recovery_session', __( 'Invalid recovery session.', 'lieve-builder' ), array( 'status' => 400 ) ); }
		$entries = array_values( array_filter( $entries, static function( $entry ) use ( $id, $session ) { return $entry['postId'] !== $id || $entry['session'] !== $session; } ) );
		if ( 'DELETE' !== $method ) {
			$snapshot = $request->get_param( 'snapshot' ); $base = $request->get_param( 'baseRevision' );
			if ( ! is_array( $snapshot ) || ! is_array( $snapshot['document'] ?? null ) || strlen( wp_json_encode( $snapshot ) ) > 4000000 || ! is_string( $base ) || ! preg_match( '/^[a-f0-9]{64}$/D', $base ) ) { return new WP_Error( 'lieve_recovery_payload', __( 'The recovery draft is invalid or exceeds 4 MB. The previous recovery copy is unchanged.', 'lieve-builder' ), array( 'status' => 400 ) ); }
			$entries[] = array( 'postId' => $id, 'session' => $session, 'updated' => time(), 'baseRevision' => $base, 'snapshot' => $snapshot );
		}
		$entries = array_slice( $entries, -10 );
		while ( count( $entries ) > 1 && strlen( wp_json_encode( $entries ) ) > 8000000 ) { array_shift( $entries ); }
		$actual = get_user_meta( get_current_user_id(), '_lieve_editor_recovery', true );
		if ( $entries !== $actual && ( $entries || '' !== $actual ) ) { update_user_meta( get_current_user_id(), '_lieve_editor_recovery', wp_slash( $entries ) ); }
		$actual = get_user_meta( get_current_user_id(), '_lieve_editor_recovery', true );
		if ( $actual !== $entries && ! ( ! $entries && '' === $actual ) ) { return new WP_Error( 'lieve_recovery_failed', __( 'Recovery copy could not be stored or discarded. Keep this editor open and save your work.', 'lieve-builder' ), array( 'status' => 500 ) ); }
		return rest_ensure_response( array( 'success' => true ) );
	} );
}
add_action( 'rest_api_init', static function() {
	register_rest_route( 'lieve/v1', '/recovery/(?P<id>\d+)', array( 'methods' => array( 'GET', 'POST', 'DELETE' ), 'callback' => 'lieve_rest_document_recovery', 'permission_callback' => 'lieve_rest_can_edit_post', 'args' => array( 'session' => array( 'type' => 'string' ), 'snapshot' => array( 'type' => 'object' ), 'baseRevision' => array( 'type' => 'string' ) ) ) );
} );

/** Bounded daily expiry, serialized with the same per-user recovery writer. */
function lieve_expire_recovery_drafts() {
	global $wpdb;
	$cursor = (int) get_option( '_lieve_recovery_cleanup_cursor', 0 );
	$users = $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT user_id FROM {$wpdb->usermeta} WHERE meta_key = %s AND user_id > %d ORDER BY user_id LIMIT 100", '_lieve_editor_recovery', $cursor ) );
	foreach ( $users as $user_id ) {
		lieve_with_template_lock( 'recovery:' . $user_id, static function() use ( $user_id ) {
			$previous = get_user_meta( $user_id, '_lieve_editor_recovery', true ); $entries = lieve_recovery_entries( $user_id );
			if ( $previous === $entries ) { return; }
			if ( $entries ) { update_user_meta( $user_id, '_lieve_editor_recovery', wp_slash( $entries ) ); } else { delete_user_meta( $user_id, '_lieve_editor_recovery' ); }
		} );
	}
	update_option( '_lieve_recovery_cleanup_cursor', count( $users ) === 100 ? (int) end( $users ) : 0, false );
}
add_action( 'lieve_recovery_cleanup', 'lieve_expire_recovery_drafts' );
add_action( 'init', static function() { if ( ! wp_next_scheduled( 'lieve_recovery_cleanup' ) ) { wp_schedule_event( time() + DAY_IN_SECONDS, 'daily', 'lieve_recovery_cleanup' ); } } );
add_action( 'switch_theme', static function() { wp_clear_scheduled_hook( 'lieve_recovery_cleanup' ); } );
