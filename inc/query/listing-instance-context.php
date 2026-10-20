<?php
/** Signed, public listing context for server-backed fragment refreshes. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
function lieve_listing_fragment_token( $post_id, $node ) {
	if ( empty( $node['_lieveListingSourceId'] ) || empty( $GLOBALS['lieve_listing_context'] ) ) { return ''; }
	$context = $GLOBALS['lieve_listing_context']; $item = $context['item'];
	$data = array( 'post' => (int) $post_id, 'source' => $node['_lieveListingSourceId'], 'scopes' => $node['_lieveListingScopes'] ?? array(), 'type' => $context['type'], 'item' => (int) ( $item->ID ?? $item->term_id ?? $item->comment_ID ?? 0 ), 'index' => $context['index'], 'count' => $context['count'], 'total' => $context['total'], 'revision' => hash( 'sha256', wp_json_encode( get_post_meta( $post_id, LIEVE_META_DOCUMENT, true ) ) ) );
	$payload = rtrim( strtr( base64_encode( wp_json_encode( $data ) ), '+/', '-_' ), '=' );
	return $payload . '.' . wp_create_nonce( 'lieve_fragment_instance_' . hash( 'sha256', $payload ) );
}

/** Tokens bind source, public record, namespaces and saved document; never trust client context. */
function lieve_with_listing_fragment_context( $token, $post_id, $node, $render ) {
	if ( '' === $token ) { return $render( $node ); }
	$invalid = static function() { return new WP_Error( 'lieve_fragment_instance', 'The listing instance is no longer available.', array( 'status' => 409 ) ); };
	if ( ! is_string( $token ) || strlen( $token ) > 6000 || ! preg_match( '/^([a-zA-Z0-9_-]+)\.([a-zA-Z0-9]+)$/D', $token, $parts ) || ! wp_verify_nonce( $parts[2], 'lieve_fragment_instance_' . hash( 'sha256', $parts[1] ) ) ) { return $invalid(); }
	$data = json_decode( base64_decode( strtr( $parts[1], '-_', '+/' ), true ), true );
	if ( ! is_array( $data ) || $data['post'] !== (int) $post_id || $data['source'] !== $node['id'] || ! hash_equals( hash( 'sha256', wp_json_encode( get_post_meta( $post_id, LIEVE_META_DOCUMENT, true ) ) ), $data['revision'] ?? '' ) || ! is_array( $data['scopes'] ?? null ) || count( $data['scopes'] ) > 3 ) { return $invalid(); }
	$item = null; $post = null;
	if ( in_array( $data['type'], array( 'posts', 'current' ), true ) ) { $item = get_post( $data['item'] ); $post = $item; }
	elseif ( 'terms' === $data['type'] ) { $item = get_term( $data['item'] ); if ( is_wp_error( $item ) || ! $item ) { return $invalid(); } $taxonomy = get_taxonomy( $item->taxonomy ); if ( ! $taxonomy || ! $taxonomy->public ) { return $invalid(); } }
	elseif ( 'users' === $data['type'] ) { $item = get_user_by( 'id', $data['item'] ); if ( ! $item || ! count_user_posts( $item->ID, 'any', true ) ) { return $invalid(); } }
	elseif ( 'comments' === $data['type'] ) { $item = get_comment( $data['item'] ); if ( ! $item || '1' !== (string) $item->comment_approved ) { return $invalid(); } $post = get_post( $item->comment_post_ID ); }
	if ( ! $item || ( $post && ( ! is_post_publicly_viewable( $post ) || ! empty( $post->post_password ) ) ) ) { return $invalid(); }
	$keys = array( 'post', 'id', 'authordata', 'currentday', 'currentmonth', 'page', 'pages', 'multipage', 'more', 'numpages', 'lieve_dynamic_term', 'lieve_listing_context', 'lieve_listing_instance_scope', 'lieve_document_element_ids' );
	$before = array(); foreach ( $keys as $key ) { if ( array_key_exists( $key, $GLOBALS ) ) { $before[ $key ] = $GLOBALS[ $key ]; } }
	try {
		if ( $post ) { $GLOBALS['post'] = $post; setup_postdata( $post ); }
		if ( 'terms' === $data['type'] ) { $GLOBALS['lieve_dynamic_term'] = $item; } else { unset( $GLOBALS['lieve_dynamic_term'] ); }
		$GLOBALS['lieve_listing_context'] = array( 'item' => $item, 'type' => $data['type'], 'index' => $data['index'], 'count' => $data['count'], 'total' => $data['total'] );
		foreach ( $data['scopes'] as $scope ) {
			if ( ! is_string( $scope ) || strlen( $scope ) > 300 ) { return $invalid(); }
			$aliases = array(); $nodes = lieve_listing_instances( array( $node ), $scope, $aliases ); $node = lieve_listing_remap_references( $nodes, $aliases )[0];
			$GLOBALS['lieve_listing_instance_scope'] = $scope; $GLOBALS['lieve_document_element_ids'] = array_replace( $GLOBALS['lieve_document_element_ids'] ?? array(), $aliases );
		}
		return $render( $node );
	} finally { foreach ( $keys as $key ) { if ( array_key_exists( $key, $before ) ) { $GLOBALS[ $key ] = $before[ $key ]; } else { unset( $GLOBALS[ $key ] ); } } }
}
