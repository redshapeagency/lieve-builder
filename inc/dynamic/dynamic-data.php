<?php
/** Public, typed dynamic data references. Integrations opt in explicitly.
 * @package LieveBuilder
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }
require_once __DIR__ . '/dynamic-data-catalog.php';
require_once __DIR__ . '/dynamic-data-plugins.php';

/** The reference is the entire field, never executable code or an interpolated template. */
function lieve_dynamic_reference( $value ) {
	if ( ! is_string( $value ) || strlen( $value ) > 1200 || ! preg_match( '/^\{\{lieve:([a-z][a-z0-9_.-]{0,79})(?:\|(px|%|rem|em|vh|vw|dvh|svh|vmin|vmax|ch|fr))?(?:@([^{}\s]+))?\}\}$/D', trim( $value ), $match ) ) { return null; }
	$options = isset( $match[3] ) ? json_decode( rawurldecode( $match[3] ), true ) : array();
	if ( ! is_array( $options ) || count( $options ) > 12 ) { return null; }
	foreach ( $options as $key => $item ) { if ( ! is_string( $key ) || ! preg_match( '/^[a-z_]{1,30}$/D', $key ) || ! is_scalar( $item ) || strlen( (string) $item ) > 240 ) { return null; } }
	return array( 'source' => $match[1], 'unit' => $match[2] ?? '', 'options' => $options );
}

/** Third-party code supplies trusted resolvers; browser payloads can only name a source. */
function lieve_dynamic_data_sources( $reset = false ) {
	static $sources = null;
	if ( null !== $sources && ! $reset ) { return $sources; }
	$definitions = array(
		'post.title' => array( 'Post title', 'Post', 'text' ),
		'post.excerpt' => array( 'Post excerpt', 'Post', 'text' ),
		'post.url' => array( 'Post URL', 'Post', 'url' ),
		'post.id' => array( 'Post ID', 'Post', 'number' ),
		'post.date' => array( 'Published date', 'Post', 'text' ),
		'post.modified' => array( 'Modified date', 'Post', 'text' ),
		'post.type' => array( 'Post type', 'Post', 'text' ),
		'post.comments' => array( 'Comment count', 'Post', 'number' ),
		'post.categories' => array( 'Categories', 'Post', 'text' ),
		'post.tags' => array( 'Tags', 'Post', 'text' ),
		'post.image' => array( 'Featured image', 'Post', 'image' ),
		'post.image_alt' => array( 'Featured image alternative text', 'Post', 'text' ),
		'author.name' => array( 'Author display name', 'Author', 'text' ),
		'author.bio' => array( 'Author biography', 'Author', 'text' ),
		'author.url' => array( 'Author archive URL', 'Author', 'url' ),
		'author.website' => array( 'Author website', 'Author', 'url' ),
		'author.avatar' => array( 'Author avatar', 'Author', 'image' ),
		'site.title' => array( 'Site title', 'Site', 'text' ),
		'site.description' => array( 'Site tagline', 'Site', 'text' ),
		'site.url' => array( 'Site URL', 'Site', 'url' ),
		'site.logo' => array( 'Site logo', 'Site', 'image' ),
		'site.language' => array( 'Site language', 'Site', 'text' ),
	);
	$native = array();
	foreach ( $definitions as $id => $definition ) {
		$native[ $id ] = array( 'label' => $definition[0], 'group' => $definition[1], 'type' => $definition[2], 'resolve' => static function( $context ) use ( $id ) { return lieve_dynamic_native_value( $id, $context['post'] ); } );
	}
	$native = lieve_dynamic_builtin_sources( $native );
	/** Callbacks must declare requestBound for session/private/request-specific data. */
	$registered = apply_filters( 'lieve_dynamic_data_sources', $native );
	$sources = array();
	foreach ( is_array( $registered ) ? array_slice( $registered, 0, 2000, true ) : array() as $id => $definition ) {
		if ( ! is_string( $id ) || ! preg_match( '/^[a-z][a-z0-9_.-]{0,79}$/D', $id ) || ! is_array( $definition ) || ! is_callable( $definition['resolve'] ?? null ) || ! in_array( $definition['type'] ?? '', array( 'text', 'html', 'number', 'url', 'image', 'color' ), true ) ) { continue; }
		$sources[ $id ] = array( 'label' => lieve_dynamic_string_limit( sanitize_text_field( $definition['label'] ?? $id ), 120 ), 'group' => lieve_dynamic_string_limit( sanitize_text_field( $definition['group'] ?? 'Integrations' ), 80 ), 'type' => $definition['type'], 'resolve' => $definition['resolve'], 'parameters' => $definition['parameters'] ?? array(), 'flexible' => ! empty( $definition['flexible'] ), 'requestBound' => ! empty( $definition['requestBound'] ), 'hint' => sanitize_text_field( $definition['hint'] ?? '' ) );
	}
	$order = array_flip( array( 'Post', 'Author', 'Site', 'Archive', 'Taxonomies', 'Terms', 'Date & Time', 'Query', 'Query Filters', 'User Profile', 'Custom Fields', 'Miscellaneous', 'Advanced', 'WooCommerce · Product', 'WooCommerce · Cart', 'WooCommerce · Checkout', 'WooCommerce · Account', 'WooCommerce · Order', 'WooCommerce · Downloads', 'WooCommerce · Notes' ) );
	uasort( $sources, static function( $a, $b ) use ( $order ) { return ( $order[ $a['group'] ] ?? 100 ) <=> ( $order[ $b['group'] ] ?? 100 ); } );
	return $sources;
}

function lieve_dynamic_native_value( $id, $post ) {
	if ( 0 === strpos( $id, 'site.' ) ) {
		switch ( $id ) {
			case 'site.title': return get_bloginfo( 'name', 'raw' );
			case 'site.description': return get_bloginfo( 'description', 'raw' );
			case 'site.url': return home_url( '/' );
			case 'site.logo': return wp_get_attachment_image_url( (int) get_theme_mod( 'custom_logo' ), 'full' ) ?: '';
			case 'site.language': return get_bloginfo( 'language', 'raw' );
		}
	}
	if ( ! $post || ! empty( $post->post_password ) ) { return ''; }
	$author = (int) $post->post_author;
	switch ( $id ) {
		case 'post.title': return $post->post_title;
		case 'post.excerpt': return $post->post_excerpt ?: wp_trim_words( wp_strip_all_tags( strip_shortcodes( $post->post_content ) ), 55 );
		case 'post.url': return get_permalink( $post );
		case 'post.id': return $post->ID;
		case 'post.date': return get_the_date( '', $post );
		case 'post.modified': return get_the_modified_date( '', $post );
		case 'post.type': return get_post_type_object( $post->post_type )->labels->singular_name ?? $post->post_type;
		case 'post.comments': return (int) $post->comment_count;
		case 'post.categories': case 'post.tags':
			$terms = wp_get_post_terms( $post->ID, 'post.tags' === $id ? 'post_tag' : 'category', array( 'fields' => 'names' ) );
			return is_wp_error( $terms ) ? '' : implode( ', ', $terms );
		case 'post.image': return get_the_post_thumbnail_url( $post, 'full' ) ?: '';
		case 'post.image_alt': return get_post_meta( get_post_thumbnail_id( $post ), '_wp_attachment_image_alt', true );
		case 'author.name': return get_the_author_meta( 'display_name', $author );
		case 'author.bio': return get_the_author_meta( 'description', $author );
		case 'author.url': return get_author_posts_url( $author );
		case 'author.website': return get_the_author_meta( 'user_url', $author );
		case 'author.avatar': return get_avatar_url( $author );
	}
	return '';
}

/** Current loop/page context wins over the template document's source ID. */
function lieve_dynamic_context_post() {
	$post = get_post();
	if ( $post && defined( 'LIEVE_TEMPLATE_POST_TYPE' ) && LIEVE_TEMPLATE_POST_TYPE === $post->post_type && function_exists( 'is_singular' ) && is_singular() ) {
		$queried = get_post( get_queried_object_id() );
		if ( $queried && LIEVE_TEMPLATE_POST_TYPE !== $queried->post_type ) { return $queried; }
	}
	return $post;
}

function lieve_dynamic_source_value( $id, $post = null, $options = array(), $kind = 'text' ) {
	$source = lieve_dynamic_data_sources()[ $id ] ?? null;
	if ( ! $source ) { return ''; }
	$post = $post ?: lieve_dynamic_context_post();
	$options = lieve_dynamic_options( $source, $options );
	if ( null === $options ) { return ''; }
	try { $value = call_user_func( $source['resolve'], array( 'post' => $post, 'postId' => $post ? (int) $post->ID : 0, 'options' => $options, 'listing' => $GLOBALS['lieve_listing_context'] ?? null ) ); }
	catch ( Throwable $error ) { return ''; }
	if ( null === $value ) { $value = ''; }
	if ( ! is_scalar( $value ) ) { return ''; }
	if ( is_bool( $value ) ) { $value = $value ? '1' : '0'; }
	if ( '' === (string) $value ) { $value = $options['fallback'] ?? ''; }
	if ( 'html' === $source['type'] && 'html' === $kind ) { return lieve_dynamic_string_limit( function_exists( 'lieve_safe_html' ) ? lieve_safe_html( (string) $value ) : wp_kses_post( (string) $value ), 20000 ); }
	if ( ! empty( $source['flexible'] ) && in_array( $kind, array( 'number', 'dimension' ), true ) && ! is_numeric( $value ) ) { return ''; }
	if ( ! empty( $source['flexible'] ) && in_array( $kind, array( 'image', 'url' ), true ) ) { return esc_url_raw( (string) $value, array( 'http', 'https', 'mailto', 'tel' ) ); }
	if ( 'number' === $source['type'] ) { return is_numeric( $value ) && is_finite( (float) $value ) ? (string) max( -1000000, min( 1000000, (float) $value ) ) : ''; }
	if ( in_array( $source['type'], array( 'image', 'url' ), true ) ) { return esc_url_raw( (string) $value, array( 'http', 'https', 'mailto', 'tel' ) ); }
	$text = preg_replace( '~<br\s*/?>|</(?:p|div|li)>~i', ' ', (string) $value );
	return lieve_dynamic_string_limit( sanitize_text_field( html_entity_decode( wp_strip_all_tags( $text ), ENT_QUOTES, 'UTF-8' ) ), 20000 );
}

function lieve_dynamic_accepts( $reference, $kind ) {
	if ( ! $reference || ! $kind ) { return false; }
	$type = lieve_dynamic_data_sources()[ $reference['source'] ]['type'] ?? null;
	// Keep references to a temporarily disabled integration, but never resolve it.
	if ( null === $type ) { return true; }
	if ( ! empty( lieve_dynamic_data_sources()[ $reference['source'] ]['flexible'] ) ) { return in_array( $kind, array( 'text', 'html', 'url', 'image', 'number', 'dimension', 'color' ), true ) && ( ! $reference['unit'] || 'dimension' === $kind ); }
	return in_array( $type, array( 'html' => array( 'text', 'html', 'number', 'url', 'image', 'color' ), 'text' => array( 'text', 'html', 'number', 'url', 'image', 'color' ), 'url' => array( 'url', 'image' ), 'image' => array( 'image' ), 'number' => array( 'number' ), 'dimension' => array( 'number' ), 'color' => array( 'color' ) )[ $kind ] ?? array(), true ) && ( ! $reference['unit'] || 'dimension' === $kind );
}

/** Restrict bindings to presentational content, never executable/integration/settings fields. */
function lieve_dynamic_prop_kind( $type, $property ) {
	if ( in_array( $type, array( 'html', 'code', 'shortcode' ), true ) || ! in_array( $property, array( 'content', 'title', 'label', 'alt', 'url', 'caption', 'description', 'placeholder' ), true ) ) { return ''; }
	$field = lieve_element_registry()[ $type ]['fields'][ $property ] ?? null;
	if ( ! $field ) { return ''; }
	if ( 'text' === $type && 'content' === $property ) { return 'html'; }
	if ( 'url' === $field['type'] ) { return in_array( $type, array( 'image', 'logo' ), true ) ? 'image' : 'url'; }
	return in_array( $field['type'], array( 'text', 'textarea' ), true ) ? 'text' : '';
}

function lieve_dynamic_style_kind( $property ) {
	$field = lieve_style_field( $property );
	if ( ! $field || 'custom-css' === $property || in_array( $property, array( 'gradient-count', 'gradient-local-stops' ), true ) ) { return ''; }
	return array( 'content' => 'text', 'text' => 'text', 'image' => 'image', 'number' => 'number', 'dimension' => 'dimension', 'color' => 'color' )[ $field['type'] ] ?? '';
}

/** Resolve then revalidate in the existing CSS grammar. No reference enters published CSS. */
function lieve_dynamic_style_value( $property, $value ) {
	$reference = lieve_dynamic_reference( $value );
	if ( ! $reference ) { return $value; }
	if ( ! lieve_dynamic_accepts( $reference, lieve_dynamic_style_kind( $property ) ) ) { return ''; }
	$resolved = lieve_dynamic_source_value( $reference['source'], null, $reference['options'], lieve_dynamic_style_kind( $property ) );
	if ( '' === $resolved || lieve_dynamic_reference( $resolved ) ) { return ''; }
	return lieve_style_value( $property, $resolved . $reference['unit'] );
}

function lieve_resolve_dynamic_node( $node ) {
	foreach ( $node['props'] ?? array() as $key => $value ) {
		$reference = lieve_dynamic_reference( $value ); $kind = lieve_dynamic_prop_kind( $node['type'], $key );
		if ( ! $reference || ! $kind ) { continue; }
		$resolved = lieve_dynamic_accepts( $reference, $kind ) ? lieve_dynamic_source_value( $reference['source'], null, $reference['options'], $kind ) : '';
		$node['props'][ $key ] = lieve_dynamic_reference( $resolved ) ? '' : $resolved;
		if ( 'text' === $node['type'] && 'content' === $key && 'html' === $kind ) { $node['_lieveDynamicHtml'] = true; $node['_lieveDynamicNativeContent'] = 'post.content' === $reference['source']; }
		if ( 'url' === $key && 'image' === $kind ) { $node['props']['attachmentId'] = 0; }
	}
	return $node;
}

/** One authorized bootstrap, no extra requests or loading flash when opening a picker. */
function lieve_editor_dynamic_data( $post_id ) {
	$post = get_post( $post_id ); $sources = array(); $fields = array();
	if ( ! $post || ! current_user_can( 'edit_post', $post_id ) ) { return array( 'sources' => array(), 'fields' => array() ); }
	$budget = 350000;
	foreach ( lieve_dynamic_data_sources() as $id => $source ) { $value = ! empty( $source['requestBound'] ) ? '' : lieve_dynamic_source_value( $id, $post ); $value = lieve_dynamic_string_limit( $value, max( 0, min( 1000, $budget ) ) ); $budget -= strlen( $value ); $sources[] = array( 'id' => $id, 'label' => $source['label'], 'group' => $source['group'], 'type' => $source['type'], 'value' => $value, 'parameters' => $source['parameters'], 'flexible' => $source['flexible'], 'requestBound' => $source['requestBound'], 'hint' => $source['hint'] ); }
	foreach ( lieve_element_registry() as $type => $element ) { foreach ( $element['fields'] as $key => $field ) { $kind = lieve_dynamic_prop_kind( $type, $key ); if ( $kind ) { $fields[ $type ][ $key ] = $kind; } } }
	return array( 'sources' => $sources, 'fields' => $fields, 'resolveUrl' => function_exists( 'rest_url' ) ? esc_url_raw( rest_url( 'lieve/v1/dynamic-data/' . (int) $post_id ) ) : '' );
}
