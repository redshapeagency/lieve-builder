<?php
/** Template lifecycle: revisions, owned locks, verified writes, duplication and activation. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Covers all fields shared by the editor and library, not just conditions. */
function lieve_template_revision( $id, $captured = array() ) {
	$post = get_post( $id ); $data = array( 'title' => $post->post_title ?? '', 'status' => $post->post_status ?? '', 'type' => lieve_get_template_type( $id ), 'conditions' => lieve_get_template_conditions( $id ), 'popupOpening' => lieve_get_popup_opening( $id ) );
	foreach ( array( LIEVE_META_DOCUMENT, LIEVE_META_ENABLED, LIEVE_META_HEADER_TEMPLATE, LIEVE_META_FOOTER_TEMPLATE, LIEVE_POPUP_SETTINGS_META ) as $key ) { $data[ $key ] = get_post_meta( $id, $key, true ); }
	return hash( 'sha256', json_encode( array_replace( $data, $captured ) ) );
}

function lieve_release_template_lock( $key, $owner ) {
	global $wpdb;
	if ( isset( $wpdb ) ) {
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s", $key, $owner ) );
		wp_cache_delete( $key, 'options' ); wp_cache_delete( 'notoptions', 'options' );
	} elseif ( get_option( $key, false ) === $owner ) { delete_option( $key ); }
}

/** Serialize our writers; the revision is checked after acquiring ownership. */
function lieve_with_template_lock( $scope, $callback ) {
	$key = 'lieve_template_lock_' . substr( hash( 'sha256', (string) $scope ), 0, 32 );
	$previous = get_option( $key, false );
	if ( $previous && time() - (int) explode( ':', (string) $previous )[0] > 120 ) { lieve_release_template_lock( $key, $previous ); }
	$owner = time() . ':' . bin2hex( random_bytes( 16 ) );
	if ( ! add_option( $key, $owner, '', false ) ) { return new WP_Error( 'lieve_template_busy', __( 'Another template operation is in progress. Your draft is retained; try again shortly.', 'lieve-builder' ), array( 'status' => 409 ) ); }
	try { return $callback(); } finally { lieve_release_template_lock( $key, $owner ); }
}

function lieve_check_template_revision( $id, $revision ) {
	if ( function_exists( 'clean_post_cache' ) ) { clean_post_cache( $id ); }
	if ( ! is_string( $revision ) || ! hash_equals( lieve_template_revision( $id ), $revision ) ) { return new WP_Error( 'lieve_template_conflict', __( 'This template changed in another tab or editor. Your draft is retained. Close and reopen Conditions, or reload the editor, before saving again.', 'lieve-builder' ), array( 'status' => 409 ) ); }
	if ( in_array( get_post_status( $id ), array( 'trash', 'auto-draft' ), true ) ) { return new WP_Error( 'lieve_template_unavailable', __( 'Restore this template from Trash before editing it.', 'lieve-builder' ), array( 'status' => 409 ) ); }
	return true;
}

/** An unchanged meta write also returns false: compare actual stored values. */
function lieve_write_template_meta( $id, $values ) {
	$old = array();
	foreach ( $values as $key => $value ) { $old[ $key ] = array( metadata_exists( 'post', $id, $key ), get_post_meta( $id, $key, true ) ); }
	foreach ( $values as $key => $value ) {
		update_post_meta( $id, $key, wp_slash( $value ) );
		if ( get_post_meta( $id, $key, true ) !== $value ) {
			foreach ( $old as $old_key => $previous ) { if ( $previous[0] ) { update_post_meta( $id, $old_key, wp_slash( $previous[1] ) ); } else { delete_post_meta( $id, $old_key ); } }
			return new WP_Error( 'lieve_template_not_saved', __( 'The template could not be saved. Your draft is retained. Please try again.', 'lieve-builder' ), array( 'status' => 500 ) );
		}
	}
	return true;
}

/** Independent node identities; authored HTML and external references are preserved. */
function lieve_duplicate_template_document( $document ) {
	$document = lieve_sanitize_document( $document ); $ids = array();
	$interaction_ids = array();
	$assign = function( &$nodes ) use ( &$assign, &$ids ) { foreach ( $nodes as &$node ) { $old = $node['id']; $node['id'] = 'lv-' . substr( str_replace( '-', '', wp_generate_uuid4() ), 0, 16 ); $ids[ $old ] = $node['id']; $assign( $node['children'] ); } unset( $node ); };
	$remap = function( &$nodes ) use ( &$remap, &$ids ) { foreach ( $nodes as &$node ) { foreach ( array( 'queryId', 'targetId' ) as $key ) { if ( isset( $node['props'][ $key ], $ids[ $node['props'][ $key ] ] ) ) { $node['props'][ $key ] = $ids[ $node['props'][ $key ] ]; } } $remap( $node['children'] ); } unset( $node ); };
	$assign( $document['children'] ); $remap( $document['children'] );
	$bindings = static function( &$nodes ) use ( &$bindings, $ids ) { foreach ( $nodes as &$node ) { foreach ( $node['props']['componentProperties'] ?? array() as $i => $row ) { if ( isset( $ids[$row['nodeId']] ) ) { $node['props']['componentProperties'][$i]['nodeId'] = $ids[$row['nodeId']]; } } $bindings( $node['children'] ); } unset($node); }; $bindings( $document['children'] );
	$rules = static function( &$nodes, $apply ) use ( &$rules, &$interaction_ids, &$ids ) { foreach ( $nodes as &$node ) { foreach ( $node['props']['interactions'] ?? array() as $index => $row ) { if ( ! $apply ) { $interaction_ids[ $row['id'] ] = 'li_' . substr( str_replace( '-', '', wp_generate_uuid4() ), 0, 20 ); } else { $row['id'] = $interaction_ids[ $row['id'] ]; if ( 'element' === $row['targetMode'] && isset( $ids[ $row['targetValue'] ] ) ) { $row['targetValue'] = $ids[ $row['targetValue'] ]; } if ( isset( $interaction_ids[ $row['afterId'] ] ) ) { $row['afterId'] = $interaction_ids[ $row['afterId'] ]; } $node['props']['interactions'][ $index ] = $row; } } $rules( $node['children'], $apply ); } unset( $node ); };
	$rules( $document['children'], false ); $rules( $document['children'], true );
	if ( function_exists( 'lieve_reidentify_motion' ) ) { lieve_reidentify_motion( $document['children'], $ids ); }
	if ( function_exists( 'lieve_reidentify_element_conditions' ) ) { lieve_reidentify_element_conditions( $document['children'] ); }
	return $document;
}

/** Idempotency keys are user-scoped and retained on the resulting draft. */
function lieve_create_inactive_template( $title, $type, $conditions, $document, $request_id, $source = 0, $popup_opening = 'automatic' ) {
	if ( 'component' === $type ) { $conditions = array(); }
	if ( function_exists( 'lieve_validate_document' ) ) { $valid = lieve_validate_document( $document ); if ( is_wp_error( $valid ) ) { return $valid; } }
	if ( ! is_string( $popup_opening ) || ! array_key_exists( $popup_opening, lieve_popup_opening_modes() ) ) { return new WP_Error( 'lieve_invalid_popup_opening', __( 'Choose a valid popup opening mode.', 'lieve-builder' ), array( 'status' => 400 ) ); }
	if ( ! is_string( $title ) || '' === trim( $title ) || preg_match_all( '/./us', $title ) > 200 || ! is_string( $type ) || ! array_key_exists( $type, lieve_template_types() ) ) { return new WP_Error( 'lieve_invalid_template', __( 'Enter a template name of up to 200 characters and a valid type.', 'lieve-builder' ), array( 'status' => 400 ) ); }
	$error = lieve_validate_template_conditions( $conditions );
	if ( $error ) { return new WP_Error( 'lieve_invalid_conditions', $error, array( 'status' => 400 ) ); }
	$conditions = lieve_sanitize_template_conditions( $conditions );
	if ( function_exists( 'lieve_validate_document_interactions' ) ) { $valid = lieve_validate_document_interactions( $document ); if ( is_wp_error( $valid ) ) { return $valid; } }
	if ( function_exists( 'lieve_validate_document_motion' ) ) { $valid = lieve_validate_document_motion( $document ); if ( is_wp_error( $valid ) ) { return $valid; } }
	if ( function_exists( 'lieve_validate_document_element_conditions' ) ) { $valid = lieve_validate_document_element_conditions( $document ); if ( is_wp_error( $valid ) ) { return $valid; } }
	$document = lieve_sanitize_document( $document );
	if ( ! is_string( $request_id ) || ! preg_match( '/^[a-zA-Z0-9_-]{16,80}$/', $request_id ) ) { return new WP_Error( 'lieve_template_request', __( 'Reload the creation form before trying again.', 'lieve-builder' ), array( 'status' => 400 ) ); }
	$key = get_current_user_id() . ':' . $request_id;
	return lieve_with_template_lock( 'create:' . $key, function() use ( $key, $title, $type, $conditions, $document, $source, $popup_opening ) {
		$reservation = 'lieve_template_created_' . substr( hash( 'sha256', $key ), 0, 32 );
		$previous = get_posts( array( 'post_type' => LIEVE_TEMPLATE_POST_TYPE, 'post_status' => array( 'draft', 'pending', 'private', 'publish', 'trash' ), 'posts_per_page' => 1, 'fields' => 'ids', 'meta_key' => '_lieve_template_request', 'meta_value' => $key ) );
		if ( $previous ) {
			if ( 'trash' === get_post_status( $previous[0] ) ) { return new WP_Error( 'lieve_template_request_used', __( 'This request already created a template that is now in Trash. Restore it or start a new creation.', 'lieve-builder' ), array( 'status' => 409 ) ); }
			if ( '1' !== get_post_meta( $previous[0], '_lieve_template_creation_complete', true ) ) { return new WP_Error( 'lieve_template_create_failed', __( 'An inactive template was created, but its settings were not saved completely. Review it in the library before continuing.', 'lieve-builder' ), array( 'status' => 500 ) ); }
			return (int) $previous[0];
		}
		// Reserve before insertion: even a failed request-meta write must not create a second post on retry.
		if ( ! add_option( $reservation, 'pending', '', false ) ) { return new WP_Error( 'lieve_template_create_incomplete', __( 'This creation request was already started. Review the inactive template in the library before continuing.', 'lieve-builder' ), array( 'status' => 409 ) ); }
		$meta = array( LIEVE_META_DOCUMENT => $document, LIEVE_META_ENABLED => '1', LIEVE_TEMPLATE_TYPE_META => $type, LIEVE_TEMPLATE_CONDITIONS_META => $conditions, LIEVE_TEMPLATE_CONDITION_META => 'manual', '_lieve_template_request' => $key );
		if ( 'popup' === $type ) { $meta[ LIEVE_POPUP_OPENING_META ] = $source ? lieve_get_popup_opening( $source ) : $popup_opening; }
		if ( $source && metadata_exists( 'post', $source, LIEVE_POPUP_SETTINGS_META ) ) { $meta[ LIEVE_POPUP_SETTINGS_META ] = lieve_get_popup_settings( $source ); }
		if ( $source ) { foreach ( array( LIEVE_META_HEADER_TEMPLATE, LIEVE_META_FOOTER_TEMPLATE ) as $field ) { if ( metadata_exists( 'post', $source, $field ) ) { $meta[ $field ] = get_post_meta( $source, $field, true ); } } }
		$post = array( 'post_type' => LIEVE_TEMPLATE_POST_TYPE, 'post_status' => 'draft', 'post_title' => $title, 'meta_input' => array( '_lieve_template_request' => $key ) );
		if ( $source ) { $original = get_post( $source ); $post['post_content'] = $original->post_content ?? ''; $post['post_excerpt'] = $original->post_excerpt ?? ''; }
		$id = wp_insert_post( wp_slash( $post ), true );
		if ( is_wp_error( $id ) ) { delete_option( $reservation ); return $id; }
		update_option( $reservation, (string) $id, false );
		$meta['_lieve_template_creation_complete'] = '1';
		$saved = lieve_write_template_meta( $id, $meta );
		if ( is_wp_error( $saved ) ) { return new WP_Error( 'lieve_template_create_failed', __( 'The inactive template was created, but some settings could not be saved. Review it in the library before continuing.', 'lieve-builder' ), array( 'status' => 500 ) ); }
		delete_option( $reservation );
		return (int) $id;
	} );
}

function lieve_set_template_status( $id, $status ) {
	if ( ! in_array( $status, array( 'draft', 'publish' ), true ) || ! current_user_can( 'publish_posts' ) ) { return new WP_Error( 'lieve_template_status', __( 'You cannot change this template activation state.', 'lieve-builder' ), array( 'status' => 403 ) ); }
	if ( 'publish' === $status ) {
		$error = lieve_validate_template_conditions( lieve_get_template_conditions( $id ) ); if ( $error ) { return new WP_Error( 'lieve_invalid_conditions', $error, array( 'status' => 400 ) ); }
	}
	$result = wp_update_post( array( 'ID' => $id, 'post_status' => $status ), true );
	if ( is_wp_error( $result ) || get_post_status( $id ) !== $status ) { return new WP_Error( 'lieve_template_status_failed', __( 'The activation state could not be saved. Please try again.', 'lieve-builder' ), array( 'status' => 500 ) ); }
	return true;
}
