<?php
/** Popup availability is independent of when an eligible popup opens. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
require_once __DIR__ . '/popup-settings.php';
define( 'LIEVE_POPUP_OPENING_META', '_lieve_popup_opening' );

function lieve_popup_opening_modes() {
	return array( 'automatic' => __( 'Automatic', 'lieve-builder' ), 'interaction' => __( 'On interaction', 'lieve-builder' ) );
}

function lieve_get_popup_opening( $id ) {
	$mode = get_post_meta( $id, LIEVE_POPUP_OPENING_META, true );
	return 'interaction' === $mode ? 'interaction' : 'automatic';
}

function lieve_popup_available( $id ) {
	$post = get_post( $id );
	return $post && LIEVE_TEMPLATE_POST_TYPE === $post->post_type && 'publish' === $post->post_status && 'popup' === lieve_get_template_type( $id ) && ! empty( lieve_get_document( $id )['children'] );
}

/** Retain the one most-specific automatic popup; manual popups are independent. */
function lieve_get_available_popup_ids( $post_id = 0 ) {
	$ids = get_posts( array( 'post_type' => LIEVE_TEMPLATE_POST_TYPE, 'post_status' => 'publish', 'posts_per_page' => -1, 'orderby' => 'modified', 'order' => 'DESC', 'fields' => 'ids', 'meta_key' => LIEVE_TEMPLATE_TYPE_META, 'meta_value' => 'popup' ) );
	$manual = array(); $best = 0; $score = 0;
	foreach ( $ids as $id ) {
		if ( ! lieve_popup_available( $id ) ) { continue; }
		$opening = lieve_get_popup_opening( $id ); $rows = lieve_get_template_conditions( $id );
		// An interaction-only popup without display rules is available site-wide, not auto-opened.
		$result = 'interaction' === $opening && ! $rows ? array( 'matches' => true, 'score' => 1 ) : lieve_evaluate_template_conditions( $rows, $post_id );
		if ( ! $result['matches'] ) { continue; }
		if ( 'interaction' === $opening ) { $manual[] = (int) $id; }
		elseif ( $result['score'] > $score ) { $best = (int) $id; $score = $result['score']; }
	}
	return array_merge( $best ? array( $best ) : array(), $manual );
}

/** Only active, nonempty public popup titles are exposed to the authorized editor. */
function lieve_editor_popup_choices() {
	$choices = array();
	foreach ( get_posts( array( 'post_type' => LIEVE_TEMPLATE_POST_TYPE, 'post_status' => 'publish', 'posts_per_page' => -1, 'orderby' => 'title', 'order' => 'ASC', 'fields' => 'ids', 'meta_key' => LIEVE_TEMPLATE_TYPE_META, 'meta_value' => 'popup' ) ) as $id ) {
		if ( lieve_popup_available( $id ) ) { $choices[ (string) $id ] = ( get_the_title( $id ) ?: __( 'Untitled', 'lieve-builder' ) ) . ' · #' . $id; }
	}
	return $choices;
}

function lieve_register_popup_options_route() {
	register_rest_route( 'lieve/v1', '/popup-options', array( 'methods' => WP_REST_Server::READABLE, 'permission_callback' => static function() { return current_user_can( 'edit_posts' ) || current_user_can( 'edit_pages' ); }, 'callback' => static function() { return rest_ensure_response( array( 'choices' => (object) lieve_editor_popup_choices() ) ); } ) );
}
add_action( 'rest_api_init', 'lieve_register_popup_options_route' );
