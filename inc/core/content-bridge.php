<?php
/** Safe native-content projection. Never overwrites Gutenberg's post_content. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
define( 'LIEVE_CONTENT_INDEX_META', '_lieve_content_index' );
define( 'LIEVE_CONTENT_INDEX_VERSION', 1 );

/** Public, static text only: no PHP, shortcodes, queries or visitor-dependent data. */
function lieve_document_public_text( $document, $native_content = '' ) {
	$text = array(); $bytes = 0;
	$walk = static function( $nodes ) use ( &$walk, &$text, &$bytes, $native_content ) {
		foreach ( $nodes as $node ) {
			if ( $bytes >= 200000 ) { break; }
			$props = $node['props'] ?? array(); $type = $node['type'] ?? '';
			if ( ! empty( $props['conditions']['enabled'] ) || ! empty( $props['listing']['enabled'] ) || 'template' === $type || 'html' === $type && false !== strpos( $props['content'] ?? '', '<?' ) ) { continue; }
			$fields = lieve_element_registry()[ $type ]['seoTextFields'] ?? array();
			if ( 'button' === $type ) { $fields[] = 'label'; }
			$values = array();
			foreach ( $fields as $field ) { $value = $props[ $field ] ?? ''; if ( is_string( $value ) && ! lieve_dynamic_reference( $value ) ) { $values[] = $value; } }
			if ( 'post-content' === $type ) { $values[] = $native_content; }
			foreach ( $values as $value ) {
				// Strip shortcode syntax rather than invoking extension callbacks.
				$value = preg_replace( '/\[[^\]]*\]/u', '', $value );
				$value = trim( preg_replace( '/\s+/u', ' ', html_entity_decode( wp_strip_all_tags( $value, true ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ) ) );
				if ( '' !== $value ) { $text[] = $value; $bytes += strlen( $value ); }
			}
			$walk( $node['children'] ?? array() );
		}
	};
	$walk( $document['children'] ?? array() );
	return implode( "\n", $text );
}
function lieve_content_projection( $id ) {
	$post = get_post( $id );
	return $post ? lieve_document_public_text( lieve_get_document( $id ), $post->post_content ) : '';
}
function lieve_update_content_index( $id ) {
	$post = get_post( $id );
	if ( ! $post || wp_is_post_revision( $id ) || LIEVE_TEMPLATE_POST_TYPE === $post->post_type ) { return; }
	if ( ! lieve_builder_is_enabled( $id ) ) { delete_post_meta( $id, LIEVE_CONTENT_INDEX_META ); delete_post_meta( $id, '_lieve_content_index_version' ); return; }
	update_post_meta( $id, LIEVE_CONTENT_INDEX_META, wp_slash( lieve_content_projection( $id ) ) );
	update_post_meta( $id, '_lieve_content_index_version', LIEVE_CONTENT_INDEX_VERSION );
}
add_action( 'lieve_builder_saved', 'lieve_update_content_index', 30 );
add_action( 'save_post', 'lieve_update_content_index', 105 );
foreach ( array( 'added_post_meta', 'updated_post_meta', 'deleted_post_meta' ) as $hook ) {
	add_action( $hook, static function( $meta_id, $id, $key ) { if ( in_array( $key, array( LIEVE_META_DOCUMENT, LIEVE_META_ENABLED ), true ) ) { lieve_update_content_index( $id ); } }, 30, 3 );
}

/** Retain core's exact search semantics, exclusions and password/status safeguards. */
function lieve_search_content_projection( $search, $query ) {
	global $wpdb;
	if ( ! $query->is_search() || ! $search ) { return $search; }
	$projection = $wpdb->prepare( "COALESCE((SELECT li.meta_value FROM {$wpdb->postmeta} li WHERE li.post_id = {$wpdb->posts}.ID AND li.meta_key = %s AND EXISTS (SELECT 1 FROM {$wpdb->postmeta} le WHERE le.post_id = li.post_id AND le.meta_key = %s AND le.meta_value = '1') LIMIT 1), {$wpdb->posts}.post_content)", LIEVE_CONTENT_INDEX_META, LIEVE_META_ENABLED );
	return str_replace( "{$wpdb->posts}.post_content", $projection, $search );
}
add_filter( 'posts_search', 'lieve_search_content_projection', 20, 2 );
function lieve_native_builder_excerpt( $excerpt, $post ) {
	if ( ! $post || '' !== $post->post_excerpt || ! lieve_builder_is_enabled( $post->ID ) || post_password_required( $post ) ) { return $excerpt; }
	return wp_trim_words( lieve_content_projection( $post->ID ), (int) apply_filters( 'excerpt_length', 55 ), apply_filters( 'excerpt_more', ' [&hellip;]' ) );
}
add_filter( 'get_the_excerpt', 'lieve_native_builder_excerpt', 9, 2 );
function lieve_native_builder_content( $content ) {
	static $rendering = array();
	$id = get_the_ID();
	$rest = defined( 'REST_REQUEST' ) && REST_REQUEST || ! empty( $GLOBALS['lieve_rest_content_depth'] );
	if ( ! $id || is_admin() && ! $rest || isset( $rendering[ $id ] ) || ! lieve_builder_is_enabled( $id ) || LIEVE_TEMPLATE_POST_TYPE === get_post_type( $id ) || post_password_required( $id ) ) { return $content; }
	// Feeds and REST consumers get stable public content, not executable widgets.
	if ( is_feed() || $rest ) { return wpautop( esc_html( lieve_content_projection( $id ) ) ); }
	$rendering[ $id ] = true;
	try { ob_start(); lieve_render_document( lieve_get_document( $id ) ); return ob_get_clean(); }
	finally { unset( $rendering[ $id ] ); }
}
add_filter( 'the_content', 'lieve_native_builder_content', 9 );
// Also cover programmatic core REST dispatches, where REST_REQUEST may be absent.
add_filter( 'rest_request_before_callbacks', static function( $response ) { $GLOBALS['lieve_rest_content_depth'] = ( $GLOBALS['lieve_rest_content_depth'] ?? 0 ) + 1; return $response; }, 0 );
add_filter( 'rest_request_after_callbacks', static function( $response ) { $GLOBALS['lieve_rest_content_depth'] = max( 0, ( $GLOBALS['lieve_rest_content_depth'] ?? 1 ) - 1 ); if ( ! $GLOBALS['lieve_rest_content_depth'] ) { unset( $GLOBALS['lieve_rest_content_depth'] ); } return $response; }, PHP_INT_MAX );

/** Bounded background backfill; old documents remain intact, including native content. */
function lieve_backfill_content_index() {
	global $wpdb;
	$ids = $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT e.post_id FROM {$wpdb->postmeta} e INNER JOIN {$wpdb->posts} p ON p.ID=e.post_id WHERE e.meta_key=%s AND e.meta_value='1' AND p.post_type<>%s AND NOT EXISTS (SELECT 1 FROM {$wpdb->postmeta} v WHERE v.post_id=e.post_id AND v.meta_key='_lieve_content_index_version' AND v.meta_value=%s) LIMIT 50", LIEVE_META_ENABLED, LIEVE_TEMPLATE_POST_TYPE, (string) LIEVE_CONTENT_INDEX_VERSION ) );
	foreach ( $ids as $id ) { lieve_update_content_index( (int) $id ); }
	if ( count( $ids ) === 50 ) { wp_schedule_single_event( time() + 30, 'lieve_content_index_backfill' ); }
	else { update_option( '_lieve_content_index_version', LIEVE_CONTENT_INDEX_VERSION, false ); }
}
add_action( 'lieve_content_index_backfill', 'lieve_backfill_content_index' );
add_action( 'init', static function() { if ( LIEVE_CONTENT_INDEX_VERSION !== (int) get_option( '_lieve_content_index_version', 0 ) && ! wp_next_scheduled( 'lieve_content_index_backfill' ) ) { wp_schedule_single_event( time() + 10, 'lieve_content_index_backfill' ); } } );
add_action( 'switch_theme', static function() { wp_clear_scheduled_hook( 'lieve_content_index_backfill' ); } );
