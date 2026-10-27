<?php
/**
 * REST endpoints used by the visual editor.
 *
 * @package LieveBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
require_once __DIR__ . '/document-storage.php';

/**
 * Register builder REST routes.
 */
function lieve_register_rest_routes() {
	register_rest_route( 'lieve/v1', '/preview/(?P<id>\d+)', array( 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'lieve_rest_preview_element', 'permission_callback' => 'lieve_rest_can_edit_post' ) );
	register_rest_route(
		'lieve/v1',
		'/page/(?P<id>\d+)',
		array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'lieve_rest_get_document',
				'permission_callback' => 'lieve_rest_can_edit_post',
			),
			array(
				'methods'             => WP_REST_Server::EDITABLE,
				'callback'            => 'lieve_rest_save_document',
				'permission_callback' => 'lieve_rest_can_edit_post',
				'args'                => array(
					'metadataOnly' => array( 'type' => 'boolean' ),
					'documentRevision' => array( 'type' => 'string', 'pattern' => '^[a-f0-9]{64}$' ),
					'headOverrides' => lieve_head_schema(), 'headRevision' => array( 'type' => 'string', 'pattern' => '^[a-f0-9]{64}$' ),
					'pageMarkup' => lieve_page_markup_schema(), 'markupRevision' => array( 'type' => 'string', 'pattern' => '^[a-f0-9]{64}$' ),
					'seoRevision' => array( 'type' => 'string', 'pattern' => '^[a-f0-9]{64}$' ),
					'seo' => array_merge( lieve_seo_rest_schema(), array( 'validate_callback' => static function( $value ) { $clean = lieve_validate_seo( $value ); return is_wp_error( $clean ) ? $clean : true; } ) ),
				),
			),
			'schema' => function() {
				return array(
					'$schema' => 'http://json-schema.org/draft-04/schema#',
					'title'   => 'lieve-builder-document',
					'type'    => 'object',
				);
			},
		)
	);
}
add_action( 'rest_api_init', 'lieve_register_rest_routes' );

/** No saves or built-in actions. Administrator PHP previews are an explicit opt-in. */
function lieve_rest_preview_element( $request ) {
	$payload = $request->get_json_params();
	$count = 0;
	$node = lieve_sanitize_node( $payload['node'] ?? null, 0, $count );
	$post = get_post( (int) $request['id'] );
	if ( ! $node || ! $post ) { return new WP_Error( 'lieve_invalid_preview', __( 'Invalid element preview.', 'lieve-builder' ), array( 'status' => 400 ) ); }
	if ( true === ( $payload['listingProjection'] ?? false ) && lieve_listing_enabled( $node ) ) {
		return rest_ensure_response( lieve_editor_listing_preview( $node, $post ) );
	}
	if ( true === ( $payload['expandedControls'] ?? false ) && in_array( $node['type'], array( 'template', 'component' ), true ) ) {
		return rest_ensure_response( lieve_editor_expanded_preview( $node, $post ) );
	}
	return rest_ensure_response( array( 'html' => lieve_render_editor_preview( $node, $post, true === ( $payload['executeCustomCode'] ?? false ) ) ) );
}

/**
 * Check the current user may edit the requested post.
 *
 * @param WP_REST_Request $request Request object.
 * @return bool
 */
function lieve_rest_can_edit_post( $request ) {
	$post_id = (int) $request['id'];
	return current_user_can( 'edit_post', $post_id ) && lieve_builder_supports_post_type( get_post_type( $post_id ) );
}

/**
 * Return the current builder document.
 *
 * @param WP_REST_Request $request Request object.
 * @return WP_REST_Response|WP_Error
 */
function lieve_rest_get_document( $request ) {
	$post_id = (int) $request['id'];
	$post    = get_post( $post_id );

	if ( ! $post ) {
		return new WP_Error( 'lieve_missing_post', __( 'Content not found.', 'lieve-builder' ), array( 'status' => 404 ) );
	}
	if ( LIEVE_TEMPLATE_POST_TYPE === $post->post_type ) {
		return lieve_with_template_lock( $post_id, function() use ( $post_id ) { return rest_ensure_response( lieve_template_editor_data( $post_id ) ); } );
	}

	$seo_snapshot = lieve_with_seo_lock( $post_id, static function() use ( $post_id ) { if ( function_exists( 'clean_post_cache' ) ) { clean_post_cache( $post_id ); } return lieve_page_editor_snapshot( $post_id ); } );
	if ( is_wp_error( $seo_snapshot ) ) { return $seo_snapshot; }
	return rest_ensure_response(
		array(
			'document'         => $seo_snapshot['document'],
			'documentRevision' => $seo_snapshot['documentRevision'],
			'enabled'          => lieve_builder_is_enabled( $post_id ),
			'headerTemplateId' => $seo_snapshot['headerTemplateId'],
			'footerTemplateId' => $seo_snapshot['footerTemplateId'],
			'templateType'      => LIEVE_TEMPLATE_POST_TYPE === $post->post_type ? lieve_get_template_type( $post_id ) : '',
			'templateConditions' => LIEVE_TEMPLATE_POST_TYPE === $post->post_type ? lieve_get_template_conditions( $post_id ) : array(),
			'templateRevision' => LIEVE_TEMPLATE_POST_TYPE === $post->post_type ? lieve_template_revision( $post_id ) : '',
			'templateStatus'   => LIEVE_TEMPLATE_POST_TYPE === $post->post_type ? get_post_status( $post_id ) : '',
			'seo'             => $seo_snapshot['seo'],
			'seoRevision'     => $seo_snapshot['seoRevision'],
			'headOverrides'   => $seo_snapshot['headOverrides'],
			'headRevision'    => $seo_snapshot['headRevision'],
			'pageMarkup'      => $seo_snapshot['pageMarkup'],
			'markupRevision'  => $seo_snapshot['markupRevision'],
			'modified'         => get_post_modified_time( DATE_ATOM, true, $post_id ),
		)
	);
}

/**
 * Save a sanitized builder document.
 *
 * @param WP_REST_Request $request Request object.
 * @return WP_REST_Response|WP_Error
 */
function lieve_rest_save_document( $request ) {
	$post_id  = (int) $request['id'];
	$post     = get_post( $post_id );
	$document = $request->get_param( 'document' );

	if ( ! $post ) {
		return new WP_Error( 'lieve_missing_post', __( 'Content not found.', 'lieve-builder' ), array( 'status' => 404 ) );
	}

	if ( ! is_array( $document ) ) {
		return new WP_Error( 'lieve_invalid_document', __( 'Invalid builder document.', 'lieve-builder' ), array( 'status' => 400 ) );
	}
	$valid = lieve_validate_document( $document ); if ( is_wp_error( $valid ) ) { return $valid; }
	if ( function_exists( 'lieve_validate_template_expansion' ) ) { $valid = lieve_validate_template_expansion( $document, $post_id ); if ( is_wp_error( $valid ) ) { return $valid; } }
	if ( function_exists( 'lieve_validate_component_document' ) ) { $valid = lieve_validate_component_document( $document, $post_id ); if ( is_wp_error( $valid ) ) { return $valid; } }
	if ( function_exists( 'lieve_validate_document_interactions' ) ) { $valid = lieve_validate_document_interactions( $document ); if ( is_wp_error( $valid ) ) { return $valid; } }
	if ( function_exists( 'lieve_validate_document_motion' ) ) { $valid = lieve_validate_document_motion( $document ); if ( is_wp_error( $valid ) ) { return $valid; } }
	if ( function_exists( 'lieve_validate_document_element_conditions' ) ) { $valid = lieve_validate_document_element_conditions( $document ); if ( is_wp_error( $valid ) ) { return $valid; } }
	if ( LIEVE_TEMPLATE_POST_TYPE === $post->post_type ) {
		return lieve_rest_save_template_document( $request );
	}
	if ( $request->has_param( 'seo' ) ) {
		$seo = lieve_validate_seo( $request->get_param( 'seo' ) ); if ( is_wp_error( $seo ) ) { return $seo; }
		$revision = $request->get_param( 'seoRevision' );
		if ( ! is_string( $revision ) || ! preg_match( '/^[a-f0-9]{64}$/', $revision ) ) { return new WP_Error( 'lieve_seo_revision_required', __( 'Reload the editor before saving SEO. Your draft is retained.', 'lieve-builder' ), array( 'status' => 409 ) ); }
	}
	if ( $request->has_param( 'headOverrides' ) ) {
		$head = lieve_head_validate( $request->get_param( 'headOverrides' ) ); if ( is_wp_error( $head ) ) { return $head; }
		$head_revision = $request->get_param( 'headRevision' );
		if ( ! is_string( $head_revision ) || ! preg_match( '/^[a-f0-9]{64}$/', $head_revision ) ) { return new WP_Error( 'lieve_head_revision_required', __( 'Reload the editor before saving HEAD overrides. Your draft is retained.', 'lieve-builder' ), array( 'status' => 409 ) ); }
	}
	if ( $request->has_param( 'pageMarkup' ) ) {
		$markup = lieve_page_markup_validate( $request->get_param( 'pageMarkup' ) ); if ( is_wp_error( $markup ) ) { return $markup; }
		if ( ! is_string( $request->get_param( 'markupRevision' ) ) || ! preg_match( '/^[a-f0-9]{64}$/D', $request->get_param( 'markupRevision' ) ) ) { return new WP_Error( 'lieve_markup_revision_required', __( 'Reload the editor before saving page IDs. Your draft is retained.', 'lieve-builder' ), array( 'status' => 409 ) ); }
	}
	{
		return lieve_with_seo_lock( $post_id, static function() use ( $post_id, $request ) {
			if ( function_exists( 'clean_post_cache' ) ) { clean_post_cache( $post_id ); }
			$raw = get_post_meta( $post_id, LIEVE_META_DOCUMENT, true );
			if ( is_string( $raw ) && '' !== $raw ) { $raw = json_decode( $raw, true ); }
			if ( $raw && true !== $request->get_param( 'metadataOnly' ) && is_wp_error( lieve_validate_document( $raw ) ) ) { return new WP_Error( 'lieve_stored_document_unsupported', __( 'The stored layout contains unsupported or invalid content. Nothing was overwritten. Restore the required extension or a compatible revision before saving.', 'lieve-builder' ), array( 'status' => 409 ) ); }
			if ( true !== $request->get_param( 'metadataOnly' ) && ( ! is_string( $request->get_param( 'documentRevision' ) ) || ! hash_equals( lieve_document_revision( $post_id ), $request->get_param( 'documentRevision' ) ) ) ) { return new WP_Error( 'lieve_document_conflict', __( 'Page content changed in another editor, or this editor is out of date. Nothing was overwritten. Your draft is retained; reload the latest version before saving.', 'lieve-builder' ), array( 'status' => 409 ) ); }
			if ( $request->has_param( 'seo' ) && ! hash_equals( lieve_seo_revision( $post_id ), $request->get_param( 'seoRevision' ) ) ) { return new WP_Error( 'lieve_seo_conflict', __( 'SEO changed in another tab or editor. Your draft is retained and nothing was overwritten. Reload the editor with the latest settings before saving again.', 'lieve-builder' ), array( 'status' => 409 ) ); }
			if ( $request->has_param( 'headOverrides' ) && ! hash_equals( lieve_head_revision( $post_id ), $request->get_param( 'headRevision' ) ) ) { return new WP_Error( 'lieve_head_conflict', __( 'HEAD settings changed in another editor. Nothing was overwritten; reload before saving your retained draft.', 'lieve-builder' ), array( 'status' => 409 ) ); }
			if ( $request->has_param( 'pageMarkup' ) && ! hash_equals( lieve_page_markup_revision( $post_id ), $request->get_param( 'markupRevision' ) ) ) { return new WP_Error( 'lieve_markup_conflict', __( 'Page IDs changed in another editor. Nothing was overwritten; reload before saving your retained draft.', 'lieve-builder' ), array( 'status' => 409 ) ); }
			return lieve_rest_save_page_document( $request );
		} );
	}
}

/** Called under the page writer lock after content and metadata revision checks. */
function lieve_rest_save_page_document( $request ) {
	$post_id = (int) $request['id']; $document = $request->get_param( 'document' );

	$clean              = lieve_sanitize_document( $document );
	$seo = $request->has_param( 'seo' ) ? lieve_validate_seo( $request->get_param( 'seo' ) ) : lieve_get_seo( $post_id );
	if ( is_wp_error( $seo ) ) { return $seo; } // Validate everything before writing any page data.
	$head = $request->has_param( 'headOverrides' ) ? lieve_head_validate( $request->get_param( 'headOverrides' ) ) : null;
	if ( is_wp_error( $head ) ) { return $head; }
	$markup = $request->has_param( 'pageMarkup' ) ? lieve_page_markup_validate( $request->get_param( 'pageMarkup' ) ) : null;
	if ( is_wp_error( $markup ) ) { return $markup; }
	$metadata_only = true === $request->get_param( 'metadataOnly' );
	if ( ! $metadata_only && function_exists( 'lieve_prepare_custom_code_document' ) ) { $clean = lieve_prepare_custom_code_document( $clean, $post_id, lieve_get_document( $post_id ) ); if ( is_wp_error( $clean ) ) { return $clean; } }
	if ( $metadata_only && ! $request->has_param( 'seo' ) && null === $head && null === $markup ) { return lieve_seo_error( __( 'Metadata-only saves require SEO, Head or page Markup settings.', 'lieve-builder' ) ); }
	$header_template_id = lieve_validate_area_template_id( $request->get_param( 'headerTemplateId' ), 'header' );
	$footer_template_id = lieve_validate_area_template_id( $request->get_param( 'footerTemplateId' ), 'footer' );
	$template_type       = '';
	$template_conditions = array();

	// One verified write set: content failure must also roll back SEO, Head and Markup.
	$values = array();
	if ( $request->has_param( 'seo' ) ) { $values[LIEVE_META_SEO] = $seo; $values['_lieve_seo_noindex'] = $seo['output'] && 'noindex' === $seo['index'] ? '1' : null; }
	if ( null !== $head ) { $values[LIEVE_META_HEAD] = $head ?: null; }
	if ( null !== $markup ) { $values[LIEVE_META_PAGE_MARKUP] = $markup ?: null; }
	if ( ! $metadata_only ) { $values += array( LIEVE_META_DOCUMENT => $clean, LIEVE_META_ENABLED => '1', LIEVE_META_HEADER_TEMPLATE => $header_template_id ? (string) $header_template_id : null, LIEVE_META_FOOTER_TEMPLATE => $footer_template_id ? (string) $footer_template_id : null ); }
	if ( function_exists( 'wp_save_post_revision' ) ) { wp_save_post_revision( $post_id ); }
	$stored = lieve_write_document_meta( $post_id, $values, function_exists( 'lieve_record_document_revision' ) ? static function() use ( $post_id ) { return lieve_record_document_revision( $post_id ); } : null ); if ( is_wp_error( $stored ) ) { return $stored; }

	/**
	 * Fires after a builder document is saved.
	 *
	 * @param int   $post_id Post ID.
	 * @param array $clean   Sanitized builder document.
	 */
	if ( ! $metadata_only ) { do_action( 'lieve_builder_saved', $post_id, $clean ); }
	else { $clean = lieve_get_document( $post_id ); unset( $clean['sourcePostId'] ); $header_template_id = lieve_get_assigned_template_id( $post_id, 'header' ); $footer_template_id = lieve_get_assigned_template_id( $post_id, 'footer' ); }

	return rest_ensure_response(
		array(
			'success'           => true,
			'documentRevision' => lieve_document_revision( $post_id ),
			'seo'               => $seo,
			'seoRevision'       => lieve_seo_revision( $post_id, $seo ),
			'headOverrides'     => (object) lieve_get_head_overrides( $post_id ),
			'headRevision'      => lieve_head_revision( $post_id ),
			'pageMarkup'        => (object) lieve_get_page_markup( $post_id ),
			'markupRevision'    => lieve_page_markup_revision( $post_id ),
			'document'          => $clean,
			'headerTemplateId'  => $header_template_id,
			'footerTemplateId'  => $footer_template_id,
			'templateType'       => $template_type,
			'templateConditions' => $template_conditions,
			'modified'          => current_time( 'c', true ),
		)
	);
}
