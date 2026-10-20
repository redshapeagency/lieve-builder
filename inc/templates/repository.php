<?php
/** Read saved template metadata, assignments and editor/library snapshots. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Return all display conditions assigned to a template.
 *
 * @param int $template_id Template post ID.
 * @return array
 */
function lieve_get_template_conditions( $template_id ) {
	if ( metadata_exists( 'post', $template_id, LIEVE_TEMPLATE_CONDITIONS_META ) ) {
		return lieve_sanitize_template_conditions( get_post_meta( $template_id, LIEVE_TEMPLATE_CONDITIONS_META, true ) );
	}

	$legacy = sanitize_key( get_post_meta( $template_id, LIEVE_TEMPLATE_CONDITION_META, true ) );
	$legacy = lieve_normalize_template_condition( $legacy, lieve_get_template_type( $template_id ) );
	return lieve_legacy_condition_to_rows( $legacy );
}

/**
 * Return the semantic type of a saved template.
 *
 * @param int $template_id Template post ID.
 * @return string
 */
function lieve_get_template_type( $template_id ) {
	$type = sanitize_key( get_post_meta( $template_id, LIEVE_TEMPLATE_TYPE_META, true ) );

	// Pre-beta builds called reusable full layouts "page". They map most
	// closely to a Bricks-style section and remain insertable from the library.
	if ( 'page' === $type ) {
		return 'section';
	}

	return array_key_exists( $type, lieve_template_types() ) ? $type : 'section';
}

/**
 * Return the display condition assigned to a template.
 *
 * @param int $template_id Template post ID.
 * @return string
 */
function lieve_get_template_condition( $template_id ) {
	if ( metadata_exists( 'post', $template_id, LIEVE_TEMPLATE_CONDITIONS_META ) ) {
		$rows = lieve_get_template_conditions( $template_id );
		if ( ! $rows ) {
			return 'manual';
		}
		$row = $rows[0];
		switch ( $row['type'] ) {
			case 'entire_site':
				return 'entire_site';
			case 'front_page':
				return 'front_page';
			case 'post_type':
				return array( 'page' ) === $row['values'] ? 'pages' : ( array( 'post' ) === $row['values'] ? 'posts' : 'manual' );
			case 'archive':
				return 'archives';
			case 'search':
				return 'search';
			case 'error_page':
				return 'not_found';
			default:
				return 'manual';
		}
	}

	$condition = sanitize_key( get_post_meta( $template_id, LIEVE_TEMPLATE_CONDITION_META, true ) );
	return lieve_normalize_template_condition( $condition, lieve_get_template_type( $template_id ) );
}

/**
 * Validate an assignable header or footer template.
 *
 * @param int    $template_id Template post ID.
 * @param string $area        Header or footer.
 * @return int
 */
function lieve_validate_area_template_id( $template_id, $area ) {
	$template_id = absint( $template_id );
	$area        = sanitize_key( $area );
	$post        = $template_id ? get_post( $template_id ) : null;

	if (
		! $post ||
		LIEVE_TEMPLATE_POST_TYPE !== $post->post_type ||
		'publish' !== $post->post_status ||
		! in_array( $area, array( 'header', 'footer' ), true ) ||
		$area !== lieve_get_template_type( $template_id )
	) {
		return 0;
	}

	return $template_id;
}

/**
 * Get a valid header/footer template assigned to a page.
 *
 * @param int    $post_id Page ID.
 * @param string $area    Header or footer.
 * @return int
 */
function lieve_get_assigned_template_id( $post_id, $area ) {
	$meta_key = 'header' === $area ? LIEVE_META_HEADER_TEMPLATE : LIEVE_META_FOOTER_TEMPLATE;
	return lieve_validate_area_template_id( get_post_meta( $post_id, $meta_key, true ), $area );
}

function lieve_template_is_automatic( $id, $rows = null, $type = null ) {
	$rows = null === $rows ? lieve_get_template_conditions( $id ) : $rows; $type = null === $type ? lieve_get_template_type( $id ) : $type;
	if ( 'component' === $type ) { return false; }
	if ( 'section' !== $type ) { return (bool) $rows; }
	foreach ( $rows as $row ) { if ( $row['hookName'] ) { return true; } }
	return false;
}

function lieve_template_state( $id ) {
	$status = get_post_status( $id );
	if ( 'trash' === $status ) { return array( 'key' => 'trash', 'label' => __( 'In Trash', 'lieve-builder' ) ); }
	if ( 'publish' !== $status ) { return array( 'key' => 'inactive', 'label' => __( 'Inactive', 'lieve-builder' ) ); }
	if ( 'component' === lieve_get_template_type( $id ) ) { return array( 'key' => 'active', 'label' => __( 'Active', 'lieve-builder' ) ); }
	return lieve_template_is_automatic( $id ) ? array( 'key' => 'active', 'label' => __( 'Active', 'lieve-builder' ) ) : array( 'key' => 'manual', 'label' => __( 'Manual', 'lieve-builder' ) );
}

function lieve_template_library_snapshot( $id ) {
	$rows = lieve_get_template_conditions( $id ); $type = lieve_get_template_type( $id ); $status = get_post_status( $id );
	// Bind the revision to the exact displayed draft, even if a background writer finishes during rendering.
	return array( 'templateType' => $type, 'popupOpening' => lieve_get_popup_opening( $id ), 'popupSettings' => lieve_get_popup_settings( $id ), 'conditions' => $rows, 'templateRevision' => lieve_template_revision( $id, array( 'type' => $type, 'conditions' => $rows, 'status' => $status ) ), 'templateStatus' => $status, 'state' => lieve_template_state( $id ), 'summary' => lieve_template_conditions_summary( $id ), 'details' => array_map( 'lieve_template_rule_description', $rows ), 'displayRules' => array_map( 'lieve_template_rule_display', $rows ), 'competition' => lieve_template_competition( $id ) );
}

/** Call under the template lock so document and revision belong to the same read. */
function lieve_template_editor_data( $id ) {
	return array_merge( lieve_template_library_snapshot( $id ), array( 'document' => lieve_get_document( $id ), 'enabled' => lieve_builder_is_enabled( $id ), 'headerTemplateId' => lieve_get_assigned_template_id( $id, 'header' ), 'footerTemplateId' => lieve_get_assigned_template_id( $id, 'footer' ), 'templateConditions' => lieve_get_template_conditions( $id ), 'modified' => get_post_modified_time( DATE_ATOM, true, $id ) ) );
}
