<?php
/** Condition target catalogues and shared editor configuration. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Public post types available to condition controls.
 *
 * @return array
 */
function lieve_condition_post_type_options() {
	$options = array();
	$objects = get_post_types( array( 'public' => true ), 'objects' );

	foreach ( $objects as $name => $object ) {
		if ( 'attachment' === $name || LIEVE_TEMPLATE_POST_TYPE === $name ) {
			continue;
		}
		$options[ $name ] = $object->labels->singular_name ?: $object->label;
	}

	natcasesort( $options );
	return $options;
}

/**
 * Public taxonomy terms available to condition controls.
 *
 * @return array
 */
function lieve_condition_term_options() {
	$options    = array();
	$taxonomies = get_taxonomies( array( 'public' => true ), 'objects' );
	if ( ! $taxonomies ) {
		return $options;
	}
	foreach ( $taxonomies as $name => $taxonomy ) {
		$options[ $name . '::all' ] = sprintf( __( '%s: All terms', 'lieve-builder' ), $taxonomy->labels->singular_name );
	}

	$terms = get_terms(
		array(
			'taxonomy'   => array_keys( $taxonomies ),
			'hide_empty' => false,
			'number'     => 500,
		)
	);
	if ( is_wp_error( $terms ) ) {
		return $options;
	}

	foreach ( $terms as $term ) {
		$taxonomy_label = isset( $taxonomies[ $term->taxonomy ] ) ? $taxonomies[ $term->taxonomy ]->labels->singular_name : $term->taxonomy;
		$options[ $term->taxonomy . '::' . $term->term_id ] = $taxonomy_label . ': ' . $term->name;
	}

	natcasesort( $options );
	return $options;
}

/**
 * Published content available to Individual conditions.
 *
 * @return array
 */
function lieve_condition_individual_options() {
	$options    = array();
	$post_types = array_keys( lieve_condition_post_type_options() );
	if ( ! $post_types ) {
		return $options;
	}

	$posts = get_posts(
		array(
			'post_type'      => $post_types,
			'post_status'    => 'publish',
			'posts_per_page' => 300,
			'orderby'        => 'title',
			'order'          => 'ASC',
		)
	);

	foreach ( $posts as $post ) {
		$post_type = get_post_type_object( $post->post_type );
		$type_name = $post_type ? $post_type->labels->singular_name : $post->post_type;
		$title     = get_the_title( $post ) ?: __( 'Untitled', 'lieve-builder' );
		$options[ (string) $post->ID ] = sprintf( '%1$s — %2$s #%3$d', $title, $type_name, $post->ID );
	}

	return $options;
}

/**
 * Return the data used by both condition editors.
 *
 * @return array
 */
function lieve_condition_editor_config() {
	$defaults = array();
	foreach ( array_keys( lieve_template_types() ) as $type ) {
		$defaults[ $type ] = lieve_default_template_conditions( $type );
	}

	return array(
		'actions'       => array( 'include' => __( 'Include', 'lieve-builder' ), 'exclude' => __( 'Exclude', 'lieve-builder' ) ),
		'types'         => lieve_condition_types(),
		'archiveTypes'  => lieve_archive_condition_types(),
		'optionsUrl'    => esc_url_raw( rest_url( 'lieve/v1/condition-options' ) ),
		'nonce'         => wp_create_nonce( 'wp_rest' ),
		'postTypes'     => lieve_condition_post_type_options(),
		'terms'         => lieve_condition_term_options(),
		'individuals'   => lieve_condition_individual_options(),
		'defaults'      => $defaults,
		'addLabel'      => __( 'Add Condition', 'lieve-builder' ),
		'removeLabel'   => __( 'Remove condition', 'lieve-builder' ),
		'emptyLabel'    => __( 'No automatic conditions. This template can still be used manually.', 'lieve-builder' ),
		'valuesLabel'   => __( 'Select one or more values', 'lieve-builder' ),
		'childrenLabel' => __( 'Apply to child items', 'lieve-builder' ),
	);
}
