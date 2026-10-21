<?php
/** Administrative library/preview endpoints. Query execution is never exposed publicly. */
defined( 'ABSPATH' ) || exit;
function lieve_queries_can_manage() { return current_user_can( 'manage_options' ); }
function lieve_queries_can_choose( $request ) { $id = (int) $request->get_param( 'postId' ); return lieve_queries_can_manage() || ( $id && current_user_can( 'edit_post', $id ) && lieve_builder_supports_post_type( get_post_type( $id ) ) ); }
function lieve_queries_response() { $snapshot = lieve_queries_snapshot(); return array( 'data' => $snapshot['data'], 'revision' => $snapshot['revision'], 'storageError' => lieve_library_error_config( $snapshot ) ); }
function lieve_queries_rest_response( $data ) { $response = rest_ensure_response( $data ); if ( $response instanceof WP_REST_Response ) { $response->header( 'Cache-Control', 'private, no-store' ); } return $response; }
function lieve_rest_save_queries( $request ) {
	if ( ! lieve_queries_can_manage() ) { return lieve_query_error( 'You cannot manage queries.', 403 ); }
	$data = lieve_queries_validate( $request->get_param( 'data' ) ); if ( is_wp_error( $data ) ) { return $data; }
	$lock = 'lieve_queries_lock'; $value = time() . ':' . wp_generate_uuid4(); $old = get_option( $lock );
	if ( $old && time() - (int) $old > 120 ) {
		global $wpdb; $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s", $lock, $old ) );
		wp_cache_delete( $lock, 'options' ); wp_cache_delete( 'notoptions', 'options' );
	}
	if ( ! add_option( $lock, $value, '', false ) ) { return lieve_query_error( 'Another query save is in progress. Your draft is preserved; try again.', 409 ); }
	try {
		$snapshot = lieve_queries_snapshot( true );
		if ( $snapshot['error'] ) { return $snapshot['error']; }
		$revision = $request->get_param( 'revision' );
		if ( ! is_string( $revision ) || ! hash_equals( $snapshot['revision'], $revision ) ) { return lieve_query_error( 'Queries changed in another tab. Export your draft before reloading the latest library.', 409 ); }
		if ( false === update_option( LIEVE_QUERIES_OPTION, $data, false ) && lieve_queries_revision() !== lieve_queries_revision( $data ) ) { return lieve_query_error( 'Queries could not be saved. Your draft is preserved.', 500 ); }
		lieve_query_invalidate();
		return lieve_queries_rest_response( lieve_queries_response() );
	} finally { if ( get_option( $lock ) === $value ) { delete_option( $lock ); } }
}
function lieve_rest_preview_query( $request ) {
	if ( ! lieve_queries_can_manage() ) { return lieve_query_error( 'You cannot preview queries.', 403 ); }
	$query = lieve_query_validate( $request->get_param( 'query' ) ); if ( is_wp_error( $query ) ) { return $query; }
	$query['enabled'] = true; $query['trashed'] = false; // Preview the draft without activating the saved definition.
	$post_id = (int) $request->get_param( 'postId' );
	if ( $post_id && ( ! get_post( $post_id ) || ! current_user_can( 'edit_post', $post_id ) ) ) { return lieve_query_error( 'Choose a context page you can edit.', 403 ); }
	global $wpdb; $started = microtime( true ); $before = $wpdb->num_queries;
	$result = lieve_query_run( $query, array( 'postId' => $post_id, 'page' => (int) ( $request->get_param( 'page' ) ?: 1 ) ), true === $request->get_param( 'bypassCache' ) );
	if ( is_wp_error( $result ) ) { return $result; }
	$items = lieve_query_records( $result ); $records = lieve_query_preview_records( $result );
	return lieve_queries_rest_response( array( 'items' => $items, 'records' => $records, 'fields' => lieve_query_core_fields( $query['type'] ), 'total' => $result['total'], 'pages' => $result['pages'], 'page' => $result['page'], 'cacheHit' => $result['cacheHit'], 'cacheState' => $result['cacheState'], 'durationMs' => round( ( microtime( true ) - $started ) * 1000, 2 ), 'dbQueries' => $wpdb->num_queries - $before, 'persistentCache' => wp_using_ext_object_cache() ) );
}
function lieve_register_query_routes() {
	$object = array( 'type' => 'object', 'required' => true );
	register_rest_route( 'lieve/v1', '/queries', array(
		array( 'methods' => WP_REST_Server::READABLE, 'permission_callback' => 'lieve_queries_can_manage', 'callback' => static function() { $snapshot = lieve_queries_snapshot(); return $snapshot['error'] ?: lieve_queries_rest_response( lieve_queries_response() ); } ),
		array( 'methods' => WP_REST_Server::EDITABLE, 'permission_callback' => 'lieve_queries_can_manage', 'callback' => 'lieve_rest_save_queries', 'args' => array( 'data' => $object + array( 'validate_callback' => static function( $value ) { $valid = lieve_queries_validate( $value ); return is_wp_error( $valid ) ? $valid : true; } ), 'revision' => array( 'type' => 'string', 'required' => true, 'pattern' => '^[a-f0-9]{64}$' ) ) ),
	) );
	register_rest_route( 'lieve/v1', '/queries/preview', array( 'methods' => WP_REST_Server::CREATABLE, 'permission_callback' => 'lieve_queries_can_manage', 'callback' => 'lieve_rest_preview_query', 'args' => array( 'query' => $object, 'postId' => array( 'type' => 'integer', 'default' => 0, 'minimum' => 0 ), 'page' => array( 'type' => 'integer', 'default' => 1, 'minimum' => 1, 'maximum' => 10000 ), 'bypassCache' => array( 'type' => 'boolean', 'default' => false ) ) ) );
	register_rest_route( 'lieve/v1', '/queries/choices', array( 'methods' => WP_REST_Server::READABLE, 'permission_callback' => 'lieve_queries_can_choose', 'args' => array( 'postId' => array( 'type' => 'integer', 'minimum' => 0, 'default' => 0 ) ), 'callback' => static function() { return lieve_queries_rest_response( array( 'all' => lieve_query_choices(), 'posts' => lieve_query_choices( true ), 'revision' => lieve_queries_revision() ) ); } ) );
}
add_action( 'rest_api_init', 'lieve_register_query_routes' );
