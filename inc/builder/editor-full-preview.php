<?php
/** Authenticated, short-lived full-page draft previews. Never publishes a document. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_validate_preview_context( $value, $source_id ) {
	if ( ! is_array( $value ) ) { return new WP_Error( 'lieve_preview_context', 'Choose a preview context.', array( 'status' => 400 ) ); }
	$kind = $value['kind'] ?? 'current'; $id = absint( $value['id'] ?? 0 );
	if ( ! is_string( $kind ) || isset( $value['id'] ) && ! is_scalar( $value['id'] ) ) { return new WP_Error( 'lieve_preview_context', 'Choose a valid preview context and object ID.', array( 'status' => 400 ) ); }
	if ( 'current' === $kind ) { $kind = LIEVE_TEMPLATE_POST_TYPE === get_post_type( $source_id ) ? 'archive' : 'post'; $id = $source_id; }
	if ( 'post' === $kind ) {
		$post = get_post( $id );
		if ( ! $post || LIEVE_TEMPLATE_POST_TYPE === $post->post_type || ! is_post_type_viewable( $post->post_type ) || 'publish' !== $post->post_status && ! current_user_can( 'read_post', $id ) ) { return new WP_Error( 'lieve_preview_post', 'Choose an accessible page or post ID.', array( 'status' => 400 ) ); }
	} elseif ( 'term' === $kind ) {
		$term = get_term( $id );
		if ( ! $term || is_wp_error( $term ) || ! get_taxonomy( $term->taxonomy )->public ) { return new WP_Error( 'lieve_preview_term', 'Choose a public term ID.', array( 'status' => 400 ) ); }
	} elseif ( ! in_array( $kind, array( 'archive', 'search', 'error' ), true ) ) { return new WP_Error( 'lieve_preview_context', 'Choose a valid preview context.', array( 'status' => 400 ) ); }
	$type = is_string( $value['postType'] ?? null ) ? $value['postType'] : 'post';
	if ( ! is_post_type_viewable( $type ) ) { return new WP_Error( 'lieve_preview_type', 'Choose a public post type.', array( 'status' => 400 ) ); }
	return array( 'kind' => $kind, 'id' => $id, 'postType' => $type, 'search' => sanitize_text_field( substr( is_string( $value['search'] ?? null ) ? $value['search'] : '', 0, 200 ) ), 'visitor' => true === ( $value['visitor'] ?? false ) );
}
function lieve_full_preview_entries() {
	$rows = get_user_meta( get_current_user_id(), '_lieve_full_previews', true );
	return array_filter( is_array( $rows ) ? $rows : array(), static function( $row ) { return is_array( $row ) && ( $row['expires'] ?? 0 ) > time(); } );
}
function lieve_rest_create_full_preview( $request ) {
	$id = (int) $request['id']; $snapshot = $request->get_param( 'snapshot' );
	if ( ! is_array( $snapshot ) || strlen( wp_json_encode( $snapshot ) ) > 4000000 ) { return new WP_Error( 'lieve_preview_size', 'The draft preview exceeds 4 MB.', array( 'status' => 400 ) ); }
	$snapshot = array_intersect_key( $snapshot, array_flip( array( 'document', 'seo', 'headOverrides', 'pageMarkup', 'headerTemplateId', 'footerTemplateId', 'templateType', 'popupSettings' ) ) );
	$context = lieve_validate_preview_context( $request->get_param( 'context' ) ?? array(), $id ); if ( is_wp_error( $context ) ) { return $context; }
	foreach ( array( 'headerTemplateId', 'footerTemplateId' ) as $field ) { if ( isset( $snapshot[ $field ] ) && ( ! is_int( $snapshot[ $field ] ) || $snapshot[ $field ] < 0 ) ) { return new WP_Error( 'lieve_preview_assignment', 'Choose a valid header or footer template.', array( 'status' => 400 ) ); } }
	$document = $snapshot['document'] ?? null; $valid = lieve_validate_document( $document ); if ( is_wp_error( $valid ) ) { return $valid; }
	foreach ( array( 'lieve_validate_document_interactions', 'lieve_validate_document_motion', 'lieve_validate_document_element_conditions' ) as $validate ) { $valid = $validate( $document ); if ( is_wp_error( $valid ) ) { return $valid; } }
	$document = lieve_prepare_custom_code_document( lieve_sanitize_document( $document ), $id, lieve_get_document( $id ) ); if ( is_wp_error( $document ) ) { return $document; }
	$snapshot['document'] = $document;
	foreach ( array( 'seo' => 'lieve_validate_seo', 'headOverrides' => 'lieve_head_validate', 'pageMarkup' => 'lieve_page_markup_validate' ) as $key => $validate ) {
		if ( isset( $snapshot[ $key ] ) && function_exists( $validate ) ) { $value = $validate( $snapshot[ $key ] ); if ( is_wp_error( $value ) ) { return $value; } $snapshot[ $key ] = $value; }
	}
	if ( LIEVE_TEMPLATE_POST_TYPE === get_post_type( $id ) ) {
		if ( ! isset( lieve_template_types()[ $snapshot['templateType'] ?? '' ] ) ) { return new WP_Error( 'lieve_preview_template', 'Choose a valid template type.', array( 'status' => 400 ) ); }
		$valid = lieve_validate_popup_settings( $snapshot['popupSettings'] ?? array() ); if ( $valid ) { return new WP_Error( 'lieve_preview_popup', $valid, array( 'status' => 400 ) ); }
		$snapshot['popupSettings'] = lieve_normalize_popup_settings( $snapshot['popupSettings'] ?? array() );
	} else { unset( $snapshot['templateType'], $snapshot['popupSettings'] ); }
	$token = bin2hex( random_bytes( 16 ) ); $entries = array_slice( lieve_full_preview_entries(), -2, null, true );
	$entries[ $token ] = array( 'postId' => $id, 'expires' => time() + 15 * MINUTE_IN_SECONDS, 'snapshot' => $snapshot, 'context' => $context );
	update_user_meta( get_current_user_id(), '_lieve_full_previews', wp_slash( $entries ) );
	if ( get_user_meta( get_current_user_id(), '_lieve_full_previews', true ) !== $entries ) { return new WP_Error( 'lieve_preview_storage', 'The private preview could not be stored. Your draft is retained.', array( 'status' => 500 ) ); }
	return rest_ensure_response( array( 'url' => add_query_arg( array( 'lieve_draft_preview' => $token, '_wpnonce' => wp_create_nonce( 'lieve_full_preview_' . $token ) ), home_url( '/' ) ), 'expiresIn' => 900 ) );
}
add_action( 'rest_api_init', static function() { register_rest_route( 'lieve/v1', '/editor/full-preview/(?P<id>\d+)', array( 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'lieve_rest_create_full_preview', 'permission_callback' => 'lieve_rest_can_edit_post', 'args' => array( 'snapshot' => array( 'type' => 'object', 'required' => true ), 'context' => array( 'type' => 'object' ) ) ) ); } );

/** Request-scoped metadata overlay: no writes, revisions, notifications or publication. */
function lieve_full_preview_meta( $value, $id, $key, $single ) {
	$preview = $GLOBALS['lieve_full_preview'] ?? null; if ( ! $preview ) { return $value; }
	$snapshot = $preview['snapshot']; $source = $preview['postId'];
	$context_id = 'post' === $preview['context']['kind'] && ! isset( $snapshot['templateType'] ) ? (int) $preview['context']['id'] : 0;
	if ( (int) $id === $source || $context_id && (int) $id === $context_id ) {
		$map = array( LIEVE_META_DOCUMENT => $snapshot['document'], LIEVE_META_ENABLED => '1', LIEVE_META_SEO => $snapshot['seo'] ?? lieve_seo_defaults(), LIEVE_META_HEAD => $snapshot['headOverrides'] ?? array(), LIEVE_META_PAGE_MARKUP => $snapshot['pageMarkup'] ?? array() );
		if ( isset( $snapshot['templateType'] ) && LIEVE_TEMPLATE_POST_TYPE === get_post_type( $source ) ) { $map[ LIEVE_TEMPLATE_TYPE_META ] = $snapshot['templateType']; $map[ LIEVE_POPUP_SETTINGS_META ] = $snapshot['popupSettings'] ?? lieve_popup_settings_defaults(); $map[ LIEVE_POPUP_OPENING_META ] = 'automatic'; }
		foreach ( array( 'headerTemplateId' => LIEVE_META_HEADER_TEMPLATE, 'footerTemplateId' => LIEVE_META_FOOTER_TEMPLATE ) as $field => $meta ) { if ( isset( $snapshot[ $field ] ) ) { $map[ $meta ] = (string) lieve_validate_area_template_id( (int) $snapshot[ $field ], str_replace( 'TemplateId', '', $field ) ); } }
		if ( array_key_exists( $key, $map ) ) { return array( $map[ $key ] ); }
	}
	return $value;
}
function lieve_full_preview_query( $context ) {
	$args = array( 'post_status' => 'publish', 'posts_per_page' => 10, 'post_type' => $context['postType'] );
	if ( 'post' === $context['kind'] ) { $post = get_post( $context['id'] ); $args = array( 'page' === $post->post_type ? 'page_id' : 'p' => $post->ID, 'post_type' => $post->post_type, 'post_status' => $context['visitor'] ? 'publish' : $post->post_status ); }
	elseif ( 'term' === $context['kind'] ) { $term = get_term( $context['id'] ); $args['tax_query'] = array( array( 'taxonomy' => $term->taxonomy, 'field' => 'term_id', 'terms' => array( $term->term_id ) ) ); }
	elseif ( 'search' === $context['kind'] ) { $args['s'] = $context['search'] ?: 'preview'; }
	$query = new WP_Query( $args );
	if ( 'archive' === $context['kind'] ) { $query->is_home = false; $query->is_archive = true; $query->is_post_type_archive = true; $query->queried_object = get_post_type_object( $context['postType'] ); }
	if ( 'error' === $context['kind'] ) { $query->set_404(); $query->posts = array(); $query->post_count = 0; }
	return $query;
}
function lieve_serve_full_preview() {
	if ( ! isset( $_GET['lieve_draft_preview'] ) ) { return; }
	if ( ! defined( 'DONOTCACHEPAGE' ) ) { define( 'DONOTCACHEPAGE', true ); }
	nocache_headers(); header( 'X-Robots-Tag: noindex, nofollow, noarchive', true ); header( 'Referrer-Policy: no-referrer', true );
	$token = is_string( $_GET['lieve_draft_preview'] ) ? $_GET['lieve_draft_preview'] : '';
	$entry = preg_match( '/^[a-f0-9]{32}$/D', $token ) ? ( lieve_full_preview_entries()[ $token ] ?? null ) : null;
	if ( ! is_user_logged_in() || ! $entry || ! current_user_can( 'edit_post', $entry['postId'] ) || ! is_string( $_GET['_wpnonce'] ?? null ) || ! wp_verify_nonce( $_GET['_wpnonce'], 'lieve_full_preview_' . $token ) ) { wp_die( esc_html__( 'This private preview expired or is unavailable. Open a new preview from the editor.', 'lieve-builder' ), '', array( 'response' => 403 ) ); }
	$context = lieve_validate_preview_context( $entry['context'], $entry['postId'] ); if ( is_wp_error( $context ) ) { wp_die( esc_html( $context->get_error_message() ), '', array( 'response' => 403 ) ); }
	$entry['context'] = $context; $GLOBALS['lieve_full_preview'] = $entry; $GLOBALS['lieve_disable_php_preview'] = true;
	add_filter( 'get_post_metadata', 'lieve_full_preview_meta', 10, 4 );
	if ( $context['visitor'] ) { wp_set_current_user( 0 ); }
	$query = lieve_full_preview_query( $context ); $GLOBALS['wp_query'] = $query; $GLOBALS['wp_the_query'] = $query;
	if ( $query->post_count ) { $query->the_post(); } else { $GLOBALS['post'] = null; }
	$status = 'error' === $context['kind'] ? 404 : 200; status_header( $status );
	$source = $entry['postId']; $type = LIEVE_TEMPLATE_POST_TYPE === get_post_type( $source ) ? $entry['snapshot']['templateType'] : '';
	if ( in_array( $type, array( 'header', 'footer' ), true ) ) { add_filter( 'lieve_effective_area_template_id', static function( $id, $area ) use ( $type, $source ) { return $area === $type ? $source : $id; }, 100, 2 ); }
	// Runtime assets must also include the draft when previewing a template in another context.
	$usage = array(); $visited = array(); lieve_scan_frontend_document( $entry['snapshot']['document'], $usage, $visited );
	if ( ! empty( $usage['interactions'] ) ) { lieve_enqueue_interactions( ! empty( $usage['motion'] ) ); }
	if ( ! empty( $usage['motion'] ) ) { lieve_enqueue_motion(); }
	lieve_enqueue_listings(); wp_enqueue_script( 'lieve-frontend', LIEVE_URL . 'assets/js/frontend.js', array( 'lieve-popup-controller' ), lieve_asset_version( 'assets/js/frontend.js' ), true );
	get_header();
	if ( in_array( $type, array( 'header', 'footer' ), true ) ) {
		if ( $query->post_count ) { $id = get_the_ID(); if ( lieve_builder_is_enabled( $id ) ) { lieve_render_document( lieve_get_document( $id ) ); } else { the_content(); } }
	} elseif ( 'popup' !== $type ) { $document = $entry['snapshot']['document']; $document['sourcePostId'] = $source; lieve_render_document( $document ); }
	get_footer(); exit;
}
add_action( 'template_redirect', 'lieve_serve_full_preview', -100 );
