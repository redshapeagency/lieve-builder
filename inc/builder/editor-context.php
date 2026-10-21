<?php
/** Read-only frontend template composition for the editor. @package LieveBuilder */
if ( ! defined( 'ABSPATH' ) ) { exit; }
require_once __DIR__ . '/../templates/expansion.php';

/** Evaluate the existing frontend resolver against the edited post, not WP Admin. */
function lieve_with_editor_page_context( $post, $callback ) {
	$keys = array( 'wp_query', 'wp_the_query', 'post', 'id', 'authordata', 'currentday', 'currentmonth', 'page', 'pages', 'multipage', 'more', 'numpages', 'lieve_element_preview' );
	$previous = array();
	foreach ( $keys as $key ) { if ( array_key_exists( $key, $GLOBALS ) ) { $previous[ $key ] = $GLOBALS[ $key ]; } }
	$query = new WP_Query();
	$query->parse_query( array( 'post_type' => $post->post_type, ( 'page' === $post->post_type ? 'page_id' : 'p' ) => $post->ID ) );
	$query->is_admin = false;
	$query->post = $post; $query->posts = array( $post ); $query->post_count = 1;
	$query->queried_object = $post; $query->queried_object_id = $post->ID;
	if ( 'page' === $post->post_type && 'page' === get_option( 'show_on_front' ) && (int) get_option( 'page_for_posts' ) === (int) $post->ID ) {
		$query->is_page = false; $query->is_singular = false; $query->is_home = true;
		$query->set( 'post_type', 'post' );
	}
	// The WooCommerce shop URL is a product archive, not a singular Page request.
	if ( function_exists( 'wc_get_page_id' ) && (int) wc_get_page_id( 'shop' ) === (int) $post->ID && ! $query->is_front_page() ) {
		$query->is_page = false; $query->is_singular = false; $query->is_home = false;
		$query->is_archive = true; $query->is_post_type_archive = true; $query->set( 'post_type', 'product' );
		$query->queried_object = get_post_type_object( 'product' ); $query->queried_object_id = 0;
	}
	$GLOBALS['wp_query'] = $query; $GLOBALS['wp_the_query'] = $query; $GLOBALS['post'] = $post; $GLOBALS['lieve_element_preview'] = true;
	try { setup_postdata( $post ); return $callback(); }
	finally {
		foreach ( $keys as $key ) { if ( array_key_exists( $key, $previous ) ) { $GLOBALS[ $key ] = $previous[ $key ]; } else { unset( $GLOBALS[ $key ] ); } }
	}
}

/** Include styles of nested reusable templates, without executing arbitrary hooks. */
function lieve_editor_template_style_nodes( $document, $seen = array() ) {
	$nodes = array();
	$document = lieve_prepare_template_document( $document, $seen );
	lieve_visit_template_document( $document, static function( $node ) use ( &$nodes ) {
			$nodes[] = array( 'id' => $node['id'], 'type' => $node['type'], 'props' => $node['props'] ?? array() );
	} );
	return $nodes;
}

function lieve_editor_template_placement( $id, $position, $source ) {
	$document = lieve_prepare_template_document( lieve_get_document( $id ) );
	if ( empty( $document['children'] ) && empty( $document['_lieveTemplateFailed'] ) ) { return null; }
	ob_start();
	try { lieve_render_document( $document ); $html = ob_get_clean(); }
	finally { if ( ! isset( $html ) ) { ob_end_clean(); } }
	return array( 'key' => $position . '-' . $id, 'position' => $position, 'id' => (int) $id, 'title' => get_the_title( $id ), 'source' => $source,
		'editUrl' => current_user_can( 'edit_post', $id ) ? lieve_builder_url( $id ) : '', 'html' => $html,
		'styleNodes' => lieve_editor_template_style_nodes( $document, array( (int) $id ) ) );
}

/** Manual draft assignments override automatic rules without persisting that choice. */
function lieve_editor_template_context( $post_id, $assignments = array() ) {
	$post = get_post( $post_id );
	if ( ! $post || LIEVE_TEMPLATE_POST_TYPE === $post->post_type ) { return array( 'placements' => array() ); }
	return lieve_with_editor_page_context( $post, function() use ( $post_id, $assignments ) {
		$placements = array();
		foreach ( array( 'header', 'footer' ) as $area ) {
			$assigned = array_key_exists( $area, $assignments ) ? lieve_validate_area_template_id( $assignments[ $area ], $area ) : lieve_get_assigned_template_id( $post_id, $area );
			$id = $assigned ?: lieve_get_matching_area_template_id( $area, $post_id );
			if ( $id ) { $item = lieve_editor_template_placement( $id, $area, $assigned ? 'assigned' : 'automatic' ); if ( $item ) { $placements[] = $item; } }
		}
		$hooks = array( 'lieve_before_header', 'lieve_after_header', 'lieve_before_content', 'lieve_after_content', 'lieve_before_footer', 'lieve_after_footer' );
		$sections = get_posts( array( 'post_type' => LIEVE_TEMPLATE_POST_TYPE, 'post_status' => 'publish', 'posts_per_page' => -1, 'fields' => 'ids', 'meta_key' => LIEVE_TEMPLATE_TYPE_META, 'meta_value' => 'section' ) );
		$hook_items = array();
		foreach ( $sections as $id ) {
			foreach ( lieve_conditional_section_hook_groups( lieve_get_template_conditions( $id ), $post_id ) as $hook ) {
				if ( ! in_array( $hook['name'], $hooks, true ) ) { continue; }
				$item = lieve_editor_template_placement( $id, substr( $hook['name'], 6 ), 'hook' );
				if ( $item ) { $item['key'] .= '-' . $hook['priority']; $item['priority'] = $hook['priority']; $hook_items[] = $item; }
			}
		}
		usort( $hook_items, function( $a, $b ) { return $a['priority'] <=> $b['priority']; } );
		return array( 'placements' => array_merge( $placements, $hook_items ) );
	} );
}

function lieve_register_editor_context_route() {
	register_rest_route( 'lieve/v1', '/editor/context/(?P<id>\d+)', array( 'methods' => WP_REST_Server::READABLE, 'callback' => 'lieve_rest_editor_template_context', 'permission_callback' => 'lieve_rest_can_edit_post' ) );
}
add_action( 'rest_api_init', 'lieve_register_editor_context_route' );

function lieve_rest_editor_template_context( $request ) {
	if ( ! get_post( (int) $request['id'] ) ) { return new WP_Error( 'lieve_missing_post', __( 'Content not found.', 'lieve-builder' ), array( 'status' => 404 ) ); }
	$assignments = array();
	foreach ( array( 'header', 'footer' ) as $area ) {
		$value = $request->get_param( $area . 'TemplateId' );
		if ( null === $value ) { continue; }
		if ( ! is_scalar( $value ) || ! preg_match( '/^\d+$/', (string) $value ) || is_bool( $value ) ) { return new WP_Error( 'lieve_invalid_assignment', __( 'Invalid template assignment.', 'lieve-builder' ), array( 'status' => 400 ) ); }
		$assignments[ $area ] = (int) $value;
	}
	return rest_ensure_response( lieve_editor_template_context( (int) $request['id'], $assignments ) );
}
