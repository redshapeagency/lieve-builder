<?php
/** Template type catalogue and WordPress post-type registration. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Available semantic template types.
 *
 * @return array
 */
function lieve_template_types() {
	return array(
		'header'  => __( 'Header', 'lieve-builder' ),
		'footer'  => __( 'Footer', 'lieve-builder' ),
		'content' => __( 'Single', 'lieve-builder' ),
		'section' => __( 'Section', 'lieve-builder' ),
		'component' => __( 'Component', 'lieve-builder' ),
		'popup'   => __( 'Pop Up', 'lieve-builder' ),
		'archive' => __( 'Archive', 'lieve-builder' ),
		'search'  => __( 'Search Results', 'lieve-builder' ),
		'error'   => __( 'Error Page', 'lieve-builder' ),
	);
}

/**
 * Short explanations shown in the guided creation flow.
 *
 * @return array
 */
function lieve_template_type_descriptions() {
	return array(
		'header'  => __( 'Navigation and content at the top of a page.', 'lieve-builder' ),
		'footer'  => __( 'Content and links at the bottom of a page.', 'lieve-builder' ),
		'content' => __( 'The layout of an individual page or post.', 'lieve-builder' ),
		'section' => __( 'A reusable section to insert in your layouts.', 'lieve-builder' ),
		'component' => __( 'A linked model with editable instance properties and named content slots.', 'lieve-builder' ),
		'popup'   => __( 'An overlay for selected pages or audiences.', 'lieve-builder' ),
		'archive' => __( 'Blog, category, and other archive layouts.', 'lieve-builder' ),
		'search'  => __( 'The layout of your site\'s search results.', 'lieve-builder' ),
		'error'   => __( 'A custom layout for pages that cannot be found.', 'lieve-builder' ),
	);
}

/**
 * Register the template post type.
 */
function lieve_register_templates() {
	register_post_type(
		LIEVE_TEMPLATE_POST_TYPE,
		array(
			'labels'              => array(
				'name'               => __( 'Template', 'lieve-builder' ),
				'singular_name'      => __( 'Template', 'lieve-builder' ),
				'menu_name'          => __( 'Template', 'lieve-builder' ),
				'add_new'            => __( 'Add Template', 'lieve-builder' ),
				'add_new_item'       => __( 'Create a New Template', 'lieve-builder' ),
				'edit_item'          => __( 'Edit Template', 'lieve-builder' ),
				'new_item'           => __( 'New Template', 'lieve-builder' ),
				'view_item'          => __( 'View Template', 'lieve-builder' ),
				'search_items'       => __( 'Search Templates', 'lieve-builder' ),
				'not_found'          => __( 'No templates found.', 'lieve-builder' ),
				'not_found_in_trash' => __( 'No templates found in Trash.', 'lieve-builder' ),
			),
			'public'              => false,
			'publicly_queryable'  => false,
			'show_ui'             => true,
			'show_in_menu'        => 'lieve-dashboard',
			'show_in_rest'        => true,
			'exclude_from_search' => true,
			'map_meta_cap'        => true,
			'capability_type'     => 'post',
			'supports'            => array( 'title', 'editor', 'revisions' ),
			'has_archive'         => false,
			'rewrite'             => false,
		)
	);
}
