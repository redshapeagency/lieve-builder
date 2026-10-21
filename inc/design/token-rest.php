<?php
/** Design-token configuration and REST read/save/preview handlers. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_design_config( $post_id = 0 ) {
	$snapshot = lieve_design_snapshot(); $data = $snapshot['data']; $condition = lieve_condition_editor_config();
	$condition['emptyLabel'] = 'No conditions: available across the entire website.';
	return array( 'data' => $data, 'revision' => $snapshot['revision'], 'storageError' => lieve_library_error_config( $snapshot ), 'activeIds' => $data && $post_id ? lieve_design_context_ids( $data, $post_id ) : array(), 'url' => esc_url_raw( rest_url( 'lieve/v1/design-system' ) ), 'previewUrl' => $post_id ? esc_url_raw( rest_url( 'lieve/v1/design-system/preview/' . $post_id ) ) : '', 'postId' => $post_id, 'nonce' => wp_create_nonce( 'wp_rest' ), 'canManage' => current_user_can( 'manage_options' ), 'conditions' => $condition, 'breakpoints' => lieve_breakpoint_definitions(), 'breakpointIcons' => lieve_breakpoint_icon_config(), 'variablePageSize' => LIEVE_VARIABLE_PAGE_SIZE );
}

function lieve_design_response( $data, $post_id = 0 ) {
	return rest_ensure_response( array( 'data' => $data, 'revision' => lieve_design_revision( $data ), 'activeIds' => $post_id ? lieve_design_context_ids( $data, $post_id ) : array() ) );
}

function lieve_register_design_routes() {
	register_rest_route( 'lieve/v1', '/design-system', array(
		array( 'methods' => WP_REST_Server::READABLE, 'callback' => 'lieve_rest_get_design', 'permission_callback' => function() { return current_user_can( 'edit_posts' ); } ),
		array( 'methods' => WP_REST_Server::EDITABLE, 'callback' => 'lieve_rest_save_design', 'permission_callback' => function() { return current_user_can( 'manage_options' ); } ),
	) );
	register_rest_route( 'lieve/v1', '/design-system/preview/(?P<id>\d+)', array( 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'lieve_rest_preview_design', 'permission_callback' => 'lieve_rest_can_edit_post' ) );
}

function lieve_rest_get_design( $request ) {
	$post_id = absint( $request->get_param( 'postId' ) );
	if ( $post_id && ! current_user_can( 'edit_post', $post_id ) ) { return new WP_Error( 'lieve_forbidden_context', 'You cannot preview this content.', array( 'status' => 403 ) ); }
	$snapshot = lieve_design_snapshot();
	return $snapshot['error'] ?: lieve_design_response( $snapshot['data'], $post_id );
}

function lieve_rest_save_design( $request ) {
	$raw = $request->get_json_params(); $data = lieve_normalize_design_system( $raw['data'] ?? null );
	if ( is_wp_error( $data ) ) { return $data; }
	$revision = $raw['revision'] ?? null; $post_id = absint( $raw['postId'] ?? 0 );
	if ( $post_id && ! current_user_can( 'edit_post', $post_id ) ) { return new WP_Error( 'lieve_forbidden_context', 'You cannot preview this content.', array( 'status' => 403 ) ); }
	return lieve_with_library_lock( LIEVE_DESIGN_OPTION, function( $lease ) use ( $data, $revision, $post_id ) {
		$snapshot = lieve_library_owned_snapshot( $lease );
		if ( $snapshot['error'] ) { return $snapshot['error']; }
		if ( ! is_string( $revision ) || ! hash_equals( $snapshot['revision'], $revision ) ) { return new WP_Error( 'lieve_design_conflict', 'The design system changed in another tab. Export your draft, then reload before saving.', array( 'status' => 409 ) ); }
		$saved = lieve_library_write_owned( $lease, $data ); if ( is_wp_error( $saved ) ) { return $saved; }
		return lieve_design_response( $data, $post_id );
	} );
}

function lieve_rest_preview_design( $request ) {
	$data = lieve_normalize_design_system( $request->get_json_params()['data'] ?? null );
	if ( is_wp_error( $data ) ) { return $data; }
	if ( ! get_post( (int) $request['id'] ) ) { return new WP_Error( 'lieve_missing_context', 'Preview content not found.', array( 'status' => 404 ) ); }
	return lieve_design_response( $data, (int) $request['id'] );
}
