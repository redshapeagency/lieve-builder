<?php
/** Template/library REST routes, permissions and request/response orchestration. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Register template-library REST endpoints.
 */
function lieve_register_template_routes() {
	register_rest_route(
		'lieve/v1',
		'/templates',
		array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'lieve_rest_list_templates',
				'permission_callback' => function() {
					return current_user_can( 'edit_posts' );
				},
			),
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'lieve_rest_create_template',
				'args'                => array( 'requestId' => array( 'type' => 'string', 'required' => true, 'pattern' => '^[a-zA-Z0-9_-]{16,80}$' ) ),
				'permission_callback' => function() {
					return current_user_can( 'publish_posts' );
				},
			),
		)
	);
	register_rest_route(
		'lieve/v1',
		'/templates/(?P<id>\d+)/conditions',
		array(
			array(
				'methods' => WP_REST_Server::READABLE,
				'callback' => 'lieve_rest_get_template_conditions',
				'permission_callback' => 'lieve_rest_can_edit_post',
			),
			array(
				'methods' => WP_REST_Server::EDITABLE,
				'callback' => 'lieve_rest_save_template_conditions',
				'permission_callback' => 'lieve_rest_can_edit_post',
				'args' => array(
					'templateRevision' => array( 'type' => 'string', 'required' => true, 'pattern' => '^[a-f0-9]{64}$' ),
					'conditions' => array( 'type' => 'array', 'required' => true, 'maxItems' => 30, 'items' => array( 'type' => 'object' ) ),
					'visibleIds' => array( 'type' => 'array', 'maxItems' => 100, 'items' => array( 'type' => 'integer', 'minimum' => 1 ) ),
					'popupOpening' => array( 'type' => 'string', 'enum' => array( 'automatic', 'interaction' ) ),
				),
			),
		)
	);
	register_rest_route( 'lieve/v1', '/condition-options', array(
		'methods' => WP_REST_Server::READABLE,
		'callback' => 'lieve_rest_condition_options',
		'permission_callback' => function() { return current_user_can( 'edit_posts' ); },
	) );
}

/** Search and paginate condition targets, including previously selected values. */
function lieve_rest_condition_options( $request ) {
	$kind = sanitize_key( $request->get_param( 'kind' ) );
	$search = sanitize_text_field( $request->get_param( 'search' ) ?? '' );
	$page = max( 1, absint( $request->get_param( 'page' ) ) );
	$selected = $request->get_param( 'selected' );
	$selected = is_array( $selected ) ? array_slice( array_filter( $selected, 'is_scalar' ), 0, 100 ) : array();
	$options = array();
	$size = 50;
	if ( 'terms' === $kind ) {
		$taxonomies = get_taxonomies( array( 'public' => true ), 'objects' );
		if ( ! $taxonomies ) { return rest_ensure_response( array( 'options' => array(), 'hasMore' => false ) ); }
		$terms = get_terms( array( 'taxonomy' => array_keys( $taxonomies ), 'hide_empty' => false, 'search' => $search, 'number' => $size + 1, 'offset' => ( $page - 1 ) * $size, 'orderby' => 'name' ) );
		if ( is_wp_error( $terms ) ) { return $terms; }
		$more = count( $terms ) > $size;
		$terms = array_slice( $terms, 0, $size );
		$ids = array();
		foreach ( $selected as $value ) {
			$parts = explode( '::', (string) $value );
			if ( 2 === count( $parts ) && isset( $taxonomies[ $parts[0] ] ) && absint( $parts[1] ) ) { $ids[] = absint( $parts[1] ); }
		}
		if ( $ids ) {
			$chosen = get_terms( array( 'taxonomy' => array_keys( $taxonomies ), 'hide_empty' => false, 'include' => $ids ) );
			if ( ! is_wp_error( $chosen ) ) { $terms = array_merge( $terms, $chosen ); }
		}
		foreach ( $taxonomies as $name => $taxonomy ) {
			$options[ $name . '::all' ] = sprintf( __( '%s: All terms', 'lieve-builder' ), $taxonomy->labels->singular_name );
		}
		foreach ( $terms as $term ) {
			$options[ $term->taxonomy . '::' . $term->term_id ] = $taxonomies[ $term->taxonomy ]->labels->singular_name . ': ' . $term->name;
		}
	} elseif ( 'individual' === $kind ) {
		$types = array_keys( lieve_condition_post_type_options() );
		if ( ! $types ) { return rest_ensure_response( array( 'options' => array(), 'hasMore' => false ) ); }
		$posts = get_posts( array( 'post_type' => $types, 'post_status' => 'publish', 's' => $search, 'posts_per_page' => $size + 1, 'offset' => ( $page - 1 ) * $size, 'orderby' => 'title', 'order' => 'ASC' ) );
		$more = count( $posts ) > $size;
		$posts = array_slice( $posts, 0, $size );
		$ids = array_filter( array_map( 'absint', $selected ) );
		if ( $ids ) { $posts = array_merge( $posts, get_posts( array( 'post_type' => $types, 'post_status' => 'publish', 'post__in' => $ids, 'posts_per_page' => 100 ) ) ); }
		foreach ( $posts as $post ) {
			$object = get_post_type_object( $post->post_type );
			$options[ (string) $post->ID ] = sprintf( '%1$s — %2$s #%3$d', get_the_title( $post ) ?: __( 'Untitled', 'lieve-builder' ), $object->labels->singular_name, $post->ID );
		}
	} else {
		return new WP_Error( 'lieve_invalid_condition_target', __( 'Invalid condition target.', 'lieve-builder' ), array( 'status' => 400 ) );
	}
	return rest_ensure_response( array( 'options' => $options, 'hasMore' => $more ) );
}

/** Read conditions without loading or changing the document. */
function lieve_rest_get_template_conditions( $request ) {
	$id = (int) $request['id'];
	if ( LIEVE_TEMPLATE_POST_TYPE !== get_post_type( $id ) ) {
		return new WP_Error( 'lieve_missing_template', __( 'Template not found.', 'lieve-builder' ), array( 'status' => 404 ) );
	}
	return rest_ensure_response( lieve_template_library_snapshot( $id ) );
}

/** Save only conditions, preserving the builder document and template type. */
function lieve_rest_save_template_conditions( $request ) {
	$id = (int) $request['id'];
	if ( LIEVE_TEMPLATE_POST_TYPE !== get_post_type( $id ) ) {
		return new WP_Error( 'lieve_missing_template', __( 'Template not found.', 'lieve-builder' ), array( 'status' => 404 ) );
	}
	return lieve_with_template_lock( $id, function() use ( $id, $request ) {
		$check = lieve_check_template_revision( $id, $request->get_param( 'templateRevision' ) ); if ( is_wp_error( $check ) ) { return $check; }
		$error = lieve_validate_template_conditions( $request->get_param( 'conditions' ) );
		if ( $error ) { return new WP_Error( 'lieve_invalid_conditions', $error, array( 'status' => 400 ) ); }
		$values = array( LIEVE_TEMPLATE_CONDITIONS_META => lieve_sanitize_template_conditions( $request->get_param( 'conditions' ) ) );
		if ( $request->has_param( 'popupOpening' ) ) {
			$mode = $request->get_param( 'popupOpening' );
			if ( ! is_string( $mode ) || ! array_key_exists( $mode, lieve_popup_opening_modes() ) ) { return new WP_Error( 'lieve_invalid_popup_opening', __( 'Choose a valid popup opening mode.', 'lieve-builder' ), array( 'status' => 400 ) ); }
			if ( 'popup' === lieve_get_template_type( $id ) ) { $values[ LIEVE_POPUP_OPENING_META ] = $mode; }
		}
		$result = lieve_write_template_meta( $id, $values );
		if ( is_wp_error( $result ) ) { return $result; }
		$payload = lieve_template_library_snapshot( $id ); $payload['related'] = array(); $ids = $request->get_param( 'visibleIds' );
		foreach ( is_array( $ids ) ? array_slice( array_unique( array_map( 'absint', array_filter( $ids, 'is_scalar' ) ) ), 0, 100 ) : array() as $peer ) {
			if ( $peer !== $id && LIEVE_TEMPLATE_POST_TYPE === get_post_type( $peer ) && current_user_can( 'edit_post', $peer ) ) { $payload['related'][] = array( 'id' => $peer ) + lieve_template_library_snapshot( $peer ); }
		}
		return rest_ensure_response( $payload );
	} );
}

/**
 * Format a template for the builder library.
 *
 * @param WP_Post $post Template post.
 * @return array
 */
function lieve_template_response( $post ) {
	$type       = lieve_get_template_type( $post->ID );
	$conditions = lieve_get_template_conditions( $post->ID );

	return array(
		'id'             => $post->ID,
		'title'          => get_the_title( $post ),
		'type'           => $type,
		'typeLabel'      => lieve_template_types()[ $type ],
		'condition'      => lieve_get_template_condition( $post->ID ),
		'conditions'     => $conditions,
		'conditionLabel' => lieve_template_conditions_summary( $post->ID ),
		'templateRevision' => lieve_template_revision( $post->ID ),
		'templateStatus' => get_post_status( $post->ID ),
		'state'          => lieve_template_state( $post->ID ),
		'document'       => lieve_get_document( $post->ID ),
		'modified'       => get_post_modified_time( DATE_ATOM, true, $post ),
	);
}

/**
 * Return all published templates and the Bricks-style type filters.
 *
 * @return WP_REST_Response
 */
function lieve_rest_list_templates() {
	$posts = get_posts(
		array(
			'post_type'      => LIEVE_TEMPLATE_POST_TYPE,
			'post_status'    => 'publish',
			'posts_per_page' => 100,
			'orderby'        => 'title',
			'order'          => 'ASC',
		)
	);

	$templates = array_map( 'lieve_template_response', $posts );
	$types     = array();
	foreach ( lieve_template_types() as $type => $label ) {
		$count = 0;
		foreach ( $templates as $template ) {
			if ( $type === $template['type'] ) {
				++$count;
			}
		}
		$types[] = array(
			'id'    => $type,
			'name'  => $label,
			'count' => $count,
		);
	}

	return rest_ensure_response(
		array(
			'templates' => $templates,
			'types'     => $types,
		)
	);
}

/**
 * Create a reusable template from the current builder document.
 *
 * @param WP_REST_Request $request Request object.
 * @return WP_REST_Response|WP_Error
 */
function lieve_rest_create_template( $request ) {
	$title     = is_string( $request->get_param( 'title' ) ) ? sanitize_text_field( $request->get_param( 'title' ) ) : '';
	$document  = $request->get_param( 'document' );
	$type      = sanitize_key( $request->get_param( 'type' ) );
	$conditions = lieve_sanitize_template_conditions( $request->get_param( 'conditions' ) );

	if ( '' === $title || ! is_array( $document ) ) {
		return new WP_Error( 'lieve_invalid_template', __( 'Enter a name and a valid document.', 'lieve-builder' ), array( 'status' => 400 ) );
	}

	if ( ! array_key_exists( $type, lieve_template_types() ) ) {
		$type = 'section';
	}
	if ( ! $request->has_param( 'conditions' ) ) {
		$conditions = lieve_default_template_conditions( $type );
	}

	$error = lieve_validate_template_conditions( $request->has_param( 'conditions' ) ? $request->get_param( 'conditions' ) : $conditions );
	if ( $error ) { return new WP_Error( 'lieve_invalid_conditions', $error, array( 'status' => 400 ) ); }
	$post_id = lieve_create_inactive_template( $title, $type, $conditions, $document, $request->get_param( 'requestId' ), 0, $request->has_param( 'popupOpening' ) ? $request->get_param( 'popupOpening' ) : 'automatic' );

	if ( is_wp_error( $post_id ) ) {
		return $post_id;
	}

	return new WP_REST_Response( lieve_template_response( get_post( $post_id ) ), 201 );
}

function lieve_rest_duplicate_template( $request ) {
	$id = (int) $request['id'];
	if ( LIEVE_TEMPLATE_POST_TYPE !== get_post_type( $id ) ) { return new WP_Error( 'lieve_missing_template', __( 'Template not found.', 'lieve-builder' ), array( 'status' => 404 ) ); }
	return lieve_with_template_lock( $id, function() use ( $id, $request ) {
		$check = lieve_check_template_revision( $id, $request->get_param( 'templateRevision' ) ); if ( is_wp_error( $check ) ) { return $check; }
		$title = preg_replace( '/^(.{0,190}).*$/us', '$1', get_the_title( $id ) );
		$copy = lieve_create_inactive_template( $title . ' — ' . __( 'Copy', 'lieve-builder' ), lieve_get_template_type( $id ), lieve_get_template_conditions( $id ), lieve_duplicate_template_document( lieve_get_document( $id ) ), $request->get_param( 'requestId' ), $id );
		return is_wp_error( $copy ) ? $copy : rest_ensure_response( array( 'id' => $copy, 'editUrl' => lieve_builder_url( $copy ), 'listUrl' => add_query_arg( 'lieve_duplicated', $copy, admin_url( 'edit.php?post_type=' . LIEVE_TEMPLATE_POST_TYPE ) ) ) );
	} );
}

function lieve_rest_template_status( $request ) {
	$id = (int) $request['id'];
	if ( LIEVE_TEMPLATE_POST_TYPE !== get_post_type( $id ) ) { return new WP_Error( 'lieve_missing_template', __( 'Template not found.', 'lieve-builder' ), array( 'status' => 404 ) ); }
	return lieve_with_template_lock( $id, function() use ( $id, $request ) {
		$check = lieve_check_template_revision( $id, $request->get_param( 'templateRevision' ) ); if ( is_wp_error( $check ) ) { return $check; }
		$result = lieve_set_template_status( $id, $request->get_param( 'templateStatus' ) ); return is_wp_error( $result ) ? $result : rest_ensure_response( lieve_template_library_snapshot( $id ) );
	} );
}

/** Editor writes participate in the same lock/revision protocol as Conditions. */
function lieve_rest_save_template_document( $request ) {
	$id = (int) $request['id'];
	if ( function_exists( 'lieve_validate_document' ) ) { $valid = lieve_validate_document( $request->get_param( 'document' ) ); if ( is_wp_error( $valid ) ) { return $valid; } }
	if ( function_exists( 'lieve_validate_template_expansion' ) ) { $valid = lieve_validate_template_expansion( $request->get_param( 'document' ), $id ); if ( is_wp_error( $valid ) ) { return $valid; } }
	if ( function_exists( 'lieve_validate_document_interactions' ) ) { $valid = lieve_validate_document_interactions( $request->get_param( 'document' ) ); if ( is_wp_error( $valid ) ) { return $valid; } }
	if ( function_exists( 'lieve_validate_document_motion' ) ) { $valid = lieve_validate_document_motion( $request->get_param( 'document' ) ); if ( is_wp_error( $valid ) ) { return $valid; } }
	if ( function_exists( 'lieve_validate_document_element_conditions' ) ) { $valid = lieve_validate_document_element_conditions( $request->get_param( 'document' ) ); if ( is_wp_error( $valid ) ) { return $valid; } }
	return lieve_with_template_lock( $id, function() use ( $id, $request ) {
		$check = lieve_check_template_revision( $id, $request->get_param( 'templateRevision' ) ); if ( is_wp_error( $check ) ) { return $check; }
		$raw = get_post_meta( $id, LIEVE_META_DOCUMENT, true ); if ( is_string( $raw ) && $raw ) { $raw = json_decode( $raw, true ); }
		if ( $raw && function_exists( 'lieve_validate_document' ) && is_wp_error( lieve_validate_document( $raw ) ) ) { return new WP_Error( 'lieve_stored_document_unsupported', __( 'The stored template contains unsupported content. Nothing was overwritten. Restore its extension or a compatible revision first.', 'lieve-builder' ), array( 'status' => 409 ) ); }
		$type = $request->get_param( 'templateType' );
		if ( ! is_string( $type ) || ! array_key_exists( $type, lieve_template_types() ) ) { return new WP_Error( 'lieve_invalid_template_type', __( 'Choose a valid template type.', 'lieve-builder' ), array( 'status' => 400 ) ); }
		$rows = $request->has_param( 'templateConditions' ) ? $request->get_param( 'templateConditions' ) : lieve_get_template_conditions( $id );
		$error = lieve_validate_template_conditions( $rows ); if ( $error ) { return new WP_Error( 'lieve_invalid_conditions', $error, array( 'status' => 400 ) ); }
		$popup_opening = $request->has_param( 'popupOpening' ) ? $request->get_param( 'popupOpening' ) : lieve_get_popup_opening( $id );
		if ( ! is_string( $popup_opening ) || ! array_key_exists( $popup_opening, lieve_popup_opening_modes() ) ) { return new WP_Error( 'lieve_invalid_popup_opening', __( 'Choose a valid popup opening mode.', 'lieve-builder' ), array( 'status' => 400 ) ); }
		$clean = lieve_sanitize_document( $request->get_param( 'document' ) );
		if ( function_exists( 'lieve_prepare_custom_code_document' ) ) { $clean = lieve_prepare_custom_code_document( $clean, $id, lieve_get_document( $id ) ); if ( is_wp_error( $clean ) ) { return $clean; } }
		$popup_settings = $request->has_param( 'popupSettings' ) ? $request->get_param( 'popupSettings' ) : lieve_get_popup_settings( $id );
		$error = lieve_validate_popup_settings( $popup_settings ); if ( $error ) { return new WP_Error( 'lieve_invalid_popup_settings', $error, array( 'status' => 400 ) ); }
		$old_status = get_post_status( $id ); $status = $request->has_param( 'templateStatus' ) ? $request->get_param( 'templateStatus' ) : $old_status;
		if ( $request->has_param( 'templateStatus' ) && ( ! in_array( $status, array( 'draft', 'publish' ), true ) || ! current_user_can( 'publish_posts' ) ) ) { return new WP_Error( 'lieve_template_status', __( 'You cannot change this template activation state.', 'lieve-builder' ), array( 'status' => 403 ) ); }
		$header = lieve_validate_area_template_id( $request->get_param( 'headerTemplateId' ), 'header' );
		$footer = lieve_validate_area_template_id( $request->get_param( 'footerTemplateId' ), 'footer' );
		$values = array( LIEVE_META_DOCUMENT => $clean, LIEVE_META_ENABLED => '1', LIEVE_TEMPLATE_TYPE_META => $type, LIEVE_TEMPLATE_CONDITIONS_META => lieve_sanitize_template_conditions( $rows ), LIEVE_TEMPLATE_CONDITION_META => 'manual', LIEVE_META_HEADER_TEMPLATE => (string) $header, LIEVE_META_FOOTER_TEMPLATE => (string) $footer );
		if ( 'popup' === $type ) { $values[ LIEVE_POPUP_OPENING_META ] = $popup_opening; }
		// Retain settings across a type switch, without creating popup metadata on unrelated templates.
		if ( 'popup' === $type || metadata_exists( 'post', $id, LIEVE_POPUP_SETTINGS_META ) ) { $values[ LIEVE_POPUP_SETTINGS_META ] = lieve_normalize_popup_settings( $popup_settings ); }
		$old = array(); foreach ( $values as $key => $value ) { $old[ $key ] = array( metadata_exists( 'post', $id, $key ), get_post_meta( $id, $key, true ) ); }
		if ( function_exists( 'wp_save_post_revision' ) ) { wp_save_post_revision( $id ); }
		$result = lieve_write_template_meta( $id, $values ); if ( is_wp_error( $result ) ) { return $result; }
		if ( $status !== $old_status ) {
			$result = lieve_set_template_status( $id, $status );
			if ( is_wp_error( $result ) ) {
				foreach ( $old as $key => $previous ) { if ( $previous[0] ) { update_post_meta( $id, $key, wp_slash( $previous[1] ) ); } else { delete_post_meta( $id, $key ); } }
				return $result;
			}
		}
		if ( function_exists( 'lieve_record_document_revision' ) ) {
			$result = lieve_record_document_revision( $id );
			if ( is_wp_error( $result ) ) {
				foreach ( $old as $key => $previous ) { if ( $previous[0] ) { update_post_meta( $id, $key, wp_slash( $previous[1] ) ); } else { delete_post_meta( $id, $key ); } }
				if ( $status !== $old_status ) { lieve_set_template_status( $id, $old_status ); }
				return $result;
			}
		}
		do_action( 'lieve_builder_saved', $id, $clean );
		return rest_ensure_response( array_merge( lieve_template_library_snapshot( $id ), array( 'success' => true, 'document' => $clean, 'headerTemplateId' => $header, 'footerTemplateId' => $footer, 'templateConditions' => lieve_get_template_conditions( $id ), 'modified' => current_time( 'c', true ) ) ) );
	} );
}

function lieve_register_template_library_routes() {
	foreach ( array( 'duplicate' => 'lieve_rest_duplicate_template', 'status' => 'lieve_rest_template_status' ) as $action => $callback ) {
		$args = array( 'templateRevision' => array( 'type' => 'string', 'required' => true, 'pattern' => '^[a-f0-9]{64}$' ) );
		$args += 'duplicate' === $action ? array( 'requestId' => array( 'type' => 'string', 'required' => true, 'pattern' => '^[a-zA-Z0-9_-]{16,80}$' ) ) : array( 'templateStatus' => array( 'type' => 'string', 'required' => true, 'enum' => array( 'draft', 'publish' ) ) );
		register_rest_route( 'lieve/v1', '/templates/(?P<id>\d+)/' . $action, array( 'methods' => WP_REST_Server::CREATABLE, 'callback' => $callback, 'args' => $args, 'permission_callback' => function( $request ) { return LIEVE_TEMPLATE_POST_TYPE === get_post_type( (int) $request['id'] ) && current_user_can( 'edit_post', (int) $request['id'] ) && current_user_can( 'publish_posts' ); } ) );
	}
}
