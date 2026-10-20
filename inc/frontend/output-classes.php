<?php
/**
 * Optional removal of WordPress frontend metadata classes.
 *
 * Use source-specific filters, not output buffering: authored HTML, block styling,
 * navigation state, plugin behavior and image optimization must remain intact.
 *
 * @package LieveBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
require_once __DIR__ . '/../admin/output-class-settings.php';

/** Never alter admin/editor, REST, AJAX, feeds or other non-page output. */
function lieve_remove_wp_classes_enabled() {
	return ! is_admin()
		&& ! wp_doing_ajax()
		&& ! wp_doing_cron()
		&& ! ( defined( 'REST_REQUEST' ) && REST_REQUEST )
		&& ! ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST )
		&& ! is_feed()
		&& ( lieve_theme_setting( 'remove_wp_classes' ) || lieve_theme_setting( 'output_classes' ) );
}

/** Groups describe dynamic core tokens without saving page-specific IDs or slugs. */
function lieve_wp_metadata_group( $target, $class ) {
	if ( 'body' === $target ) {
		if ( in_array( $class, lieve_output_body_additional_defaults(), true ) ) { return $class; }
		if ( preg_match( '/^(?:postid|attachmentid|parent-pageid|page-id)-\d+$/D', $class ) ) { return 'wp:id'; }
		if ( preg_match( '/^(?:(?:single|page|category|tag|date|author|search|post-type)-)?paged(?:-\d+)?$/D', $class ) ) { return 'wp:pagination'; }
		if ( 0 === strpos( $class, 'wp-theme-' ) || 0 === strpos( $class, 'wp-child-theme-' ) ) { return 'wp:theme'; }
		if ( false !== strpos( $class, '-template' ) ) { return 'wp:template'; }
		if ( preg_match( '/^(?:author|category|tag|tax|term)(?:-|$)/', $class ) ) { return 'wp:terms'; }
		if ( in_array( $class, array( 'logged-in', 'wp-custom-logo' ), true ) ) { return 'wp:user'; }
		return 'wp:context';
	}
	if ( 'post' === $target ) {
		if ( preg_match( '/^post-\d+$/D', $class ) ) { return 'wp:id'; }
		if ( 0 === strpos( $class, 'status-' ) && 'status-sticky' !== $class ) { return 'wp:status'; }
		if ( 0 === strpos( $class, 'format-' ) ) { return 'wp:format'; }
		if ( 0 === strpos( $class, 'type-' ) || in_array( $class, get_post_types(), true ) ) { return 'wp:type'; }
		if ( in_array( $class, array( 'hentry', 'sticky', 'status-sticky', 'post-password-required', 'post-password-protected', 'has-post-thumbnail' ), true ) ) { return 'wp:markers'; }
		return 'wp:terms';
	}
	return 'wp:metadata';
}

function lieve_filter_output_metadata( $target, $classes, $automatic, $custom = array() ) {
	$rule = lieve_output_class_rule( $target );
	$remove = array_filter( $automatic, static function( $class ) use ( $target, $rule ) { return ! in_array( lieve_wp_metadata_group( $target, $class ), $rule['defaults'], true ); } );
	$classes = lieve_remove_automatic_class_tokens( $classes, $remove, $custom );
	return array_values( array_unique( array_merge( $classes, preg_split( '/\s+/', $rule['custom'], -1, PREG_SPLIT_NO_EMPTY ) ) ) );
}

/** Remove known core tokens while retaining explicitly supplied classes. */
function lieve_remove_automatic_class_tokens( $classes, $automatic, $custom = array() ) {
	$custom = is_array( $custom ) ? $custom : preg_split( '/\s+/', (string) $custom, -1, PREG_SPLIT_NO_EMPTY );
	$keep   = array_map( 'esc_attr', $custom );
	return array_values( array_filter( $classes, static function ( $class ) use ( $automatic, $keep ) {
		return ! in_array( $class, $automatic, true ) || in_array( $class, $keep, true );
	} ) );
}

/** Keep toolbar, RTL, background/embed behavior and classes supplied by callers. */
function lieve_filter_wp_body_classes( $classes, $custom ) {
	if ( ! lieve_remove_wp_classes_enabled() ) {
		return $classes;
	}
	$automatic = array(
		'home', 'blog', 'privacy-policy', 'archive', 'date', 'search', 'search-results',
		'search-no-results', 'paged', 'attachment', 'error404', 'wp-singular', 'single',
		'page', 'page-parent', 'page-child', 'post-type-archive', 'author', 'category',
		'tag', 'logged-in', 'wp-custom-logo', 'wp-embed-responsive',
	);
	foreach ( $classes as $class ) {
		if ( preg_match( '/^(?:(?:postid|attachmentid|parent-pageid|page-id|paged)-\d+|(?:single|page|category|tag|date|author|search|post-type)-paged-\d+|(?:author|category|tag|tax|term|attachment|single-format|wp-theme|wp-child-theme)-.+)$/D', $class ) ) {
			$automatic[] = $class;
		}
	}
	foreach ( get_post_types() as $type ) {
		$automatic[] = 'single-' . $type;
		$automatic[] = 'post-type-archive-' . $type;
		foreach ( $classes as $class ) {
			if ( 0 === strpos( $class, $type . '-template' ) && preg_match( '/^' . preg_quote( $type, '/' ) . '-template(?:-.+)?$/D', $class ) ) {
				$automatic[] = $class;
			}
		}
	}
	$custom = is_array( $custom ) ? $custom : preg_split( '/\s+/', $custom, -1, PREG_SPLIT_NO_EMPTY );
	$classes = preg_split( '/\s+/', lieve_output_classes( 'body', $classes ), -1, PREG_SPLIT_NO_EMPTY );
	return lieve_filter_output_metadata( 'body', $classes, $automatic, array_diff( $custom, array( 'lieve-canvas-page' ) ) );
}
// Run before ordinary plugin filters so their own classes are not cleaned later.
add_filter( 'body_class', 'lieve_filter_wp_body_classes', 0, 2 );

/** WooCommerce adds its theme marker later; filter that exact token only. */
function lieve_filter_late_body_classes( $classes, $custom ) {
	if ( ! lieve_remove_wp_classes_enabled() ) { return $classes; }
	$theme = lieve_output_body_additional_defaults()[1];
	return lieve_remove_automatic_class_tokens( $classes, lieve_output_class_enabled( 'body', $theme ) ? array() : array( $theme ), $custom );
}
add_filter( 'body_class', 'lieve_filter_late_body_classes', PHP_INT_MAX, 2 );

/** Remove post IDs, type/status/format and taxonomy metadata, not plugin classes. */
function lieve_filter_wp_post_classes( $classes, $custom, $post_id ) {
	if ( ! lieve_remove_wp_classes_enabled() ) {
		return $classes;
	}
	$post = get_post( $post_id );
	if ( ! $post ) {
		return $classes;
	}
	$automatic = array( 'post-' . $post->ID, 'type-' . $post->post_type, 'status-' . $post->post_status, 'hentry', 'sticky', 'status-sticky', 'post-password-required', 'post-password-protected', 'has-post-thumbnail' );
	// WooCommerce also uses the bare product class as a functional selector.
	if ( ! in_array( $post->post_type, array( 'product', 'product_variation' ), true ) || ! function_exists( 'WC' ) ) {
		$automatic[] = $post->post_type;
	}
	$prefixes = array( 'format-' );
	foreach ( get_object_taxonomies( $post->post_type ) as $taxonomy ) {
		$prefixes[] = ( 'post_tag' === $taxonomy ? 'tag' : $taxonomy ) . '-';
	}
	foreach ( $classes as $class ) {
		foreach ( $prefixes as $prefix ) {
			if ( 0 === strpos( $class, $prefix ) ) {
				$automatic[] = $class;
				break;
			}
		}
	}
	return lieve_filter_output_metadata( 'post', $classes, $automatic, $custom );
}
add_filter( 'post_class', 'lieve_filter_wp_post_classes', 0, 3 );

/** Keep user-entered menu classes, current-item state and submenu behavior. */
function lieve_filter_wp_menu_classes( $classes, $item ) {
	if ( ! lieve_remove_wp_classes_enabled() ) {
		return $classes;
	}
	$automatic = array( 'menu-item', 'menu-item-' . $item->ID, 'menu-item-type-' . $item->type, 'menu-item-object-' . $item->object, 'menu-item-home', 'menu-item-privacy-policy' );
	$custom    = get_post_meta( $item->ID, '_menu_item_classes', true );
	return lieve_filter_output_metadata( 'menu', $classes, $automatic, is_array( $custom ) ? $custom : array() );
}
add_filter( 'nav_menu_css_class', 'lieve_filter_wp_menu_classes', 0, 2 );

/** Page/category list metadata; keep current states and parent/child behavior. */
function lieve_filter_wp_page_classes( $classes, $page ) {
	return lieve_remove_wp_classes_enabled() ? lieve_filter_output_metadata( 'page-list', $classes, array( 'page_item', 'page-item-' . $page->ID ) ) : $classes;
}
add_filter( 'page_css_class', 'lieve_filter_wp_page_classes', 0, 2 );

function lieve_filter_wp_category_classes( $classes, $category ) {
	return lieve_remove_wp_classes_enabled() ? lieve_filter_output_metadata( 'category-list', $classes, array( 'cat-item', 'cat-item-' . $category->term_id ) ) : $classes;
}
add_filter( 'category_css_class', 'lieve_filter_wp_category_classes', 0, 2 );

/** Metadata-only image tokens; alignment, block classes and other tokens survive. */
function lieve_wp_image_metadata_classes( $classes, $size = null ) {
	$automatic = array( 'wp-post-image' );
	$sizes     = get_intermediate_image_sizes();
	$sizes[]   = 'full';
	if ( null !== $size ) {
		$sizes[] = is_array( $size ) ? implode( 'x', $size ) : $size;
	}
	foreach ( $sizes as $name ) {
		$automatic[] = 'attachment-' . $name;
		$automatic[] = 'size-' . $name;
	}
	foreach ( $classes as $class ) {
		if ( preg_match( '/^(?:wp-image-\d+|(?:attachment|size)-\d+x\d+)$/D', $class ) ) {
			$automatic[] = $class;
		}
	}
	return $automatic;
}

/** Attachment metadata is removed after WordPress computes responsive attributes. */
function lieve_filter_wp_attachment_classes( $attributes, $attachment, $size ) {
	if ( ! lieve_remove_wp_classes_enabled() ) {
		return $attributes;
	}
	$classes = preg_split( '/\s+/', $attributes['class'] ?? '', -1, PREG_SPLIT_NO_EMPTY );
	$classes = lieve_filter_output_metadata( 'wp-image', $classes, lieve_wp_image_metadata_classes( $classes, $size ) );
	if ( $classes ) {
		$attributes['class'] = implode( ' ', $classes );
	} else {
		unset( $attributes['class'] );
	}
	return $attributes;
}
add_filter( 'wp_get_attachment_image_attributes', 'lieve_filter_wp_attachment_classes', 100, 3 );

/** Content image IDs must remain until core has computed srcset, sizes and loading. */
function lieve_filter_wp_content_image_classes( $html ) {
	if ( ! lieve_remove_wp_classes_enabled() || ! class_exists( 'WP_HTML_Tag_Processor' ) ) {
		return $html;
	}
	$processor = new WP_HTML_Tag_Processor( $html );
	if ( ! $processor->next_tag( 'IMG' ) ) {
		return $html;
	}
	$attribute = $processor->get_attribute( 'class' );
	$classes = preg_split( '/\s+/', is_string( $attribute ) ? $attribute : '', -1, PREG_SPLIT_NO_EMPTY );
	$clean   = lieve_filter_output_metadata( 'wp-image', $classes, lieve_wp_image_metadata_classes( $classes ) );
	if ( $clean === $classes ) {
		return $html;
	}
	if ( $clean ) {
		$processor->set_attribute( 'class', implode( ' ', $clean ) );
	} else {
		$processor->remove_attribute( 'class' );
	}
	return $processor->get_updated_html();
}
add_filter( 'wp_content_img_tag', 'lieve_filter_wp_content_image_classes', 100 );
