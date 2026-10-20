<?php
/** Page metadata. Builder UI and public output share one validated data contract. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
define( 'LIEVE_META_SEO', '_lieve_page_seo' );
require_once __DIR__ . '/head.php';
require_once __DIR__ . '/page-markup.php';
require_once __DIR__ . '/seo-schema.php';

function lieve_seo_revision( $id, $seo = null ) { return hash( 'sha256', wp_json_encode( null === $seo ? lieve_get_seo( $id ) : $seo ) ); }
function lieve_seo_snapshot( $id ) { $seo = lieve_get_seo( $id ); $head = lieve_get_head_overrides( $id ); $markup = lieve_get_page_markup( $id ); return array( 'seo' => $seo, 'seoRevision' => lieve_seo_revision( $id, $seo ), 'headOverrides' => (object) $head, 'headRevision' => lieve_head_revision( $id, $head ), 'pageMarkup' => (object) $markup, 'markupRevision' => lieve_page_markup_revision( $id, $markup ) ); }
/** Same owner-checked lock protocol as templates, with a separate page-SEO scope. */
function lieve_seo_lock_key( $id ) { return '_lieve_seo_lock_' . (int) $id; }
function lieve_with_seo_lock( $id, $callback ) {
	// The private prefix avoids treating transient read locks as website setting changes.
	$key = lieve_seo_lock_key( $id ); $previous = get_option( $key, false );
	if ( $previous && time() - (int) explode( ':', (string) $previous )[0] > 120 ) { lieve_release_template_lock( $key, $previous ); }
	$owner = time() . ':' . bin2hex( random_bytes( 16 ) );
	if ( ! add_option( $key, $owner, '', false ) ) { return new WP_Error( 'lieve_seo_busy', __( 'Another page save is in progress. Your draft is retained; try again shortly.', 'lieve-builder' ), array( 'status' => 409 ) ); }
	try { return $callback(); } finally { lieve_release_template_lock( $key, $owner ); }
}
/** Verify both SEO settings and their sitemap flag; rollback a partially failed write. */
function lieve_store_seo( $id, $seo, $head = null, $markup = null ) {
	$values = array( LIEVE_META_SEO => $seo, '_lieve_seo_noindex' => $seo['output'] && 'noindex' === $seo['index'] ? '1' : null ); $old = array();
	if ( null !== $head ) { $values[LIEVE_META_HEAD] = $head ?: null; } // Same transaction/readback/rollback as SEO.
	if ( null !== $markup ) { $values[LIEVE_META_PAGE_MARKUP] = $markup ?: null; }
	foreach ( $values as $key => $value ) { $old[$key] = array( metadata_exists( 'post', $id, $key ), get_post_meta( $id, $key, true ) ); }
	foreach ( $values as $key => $value ) {
		if ( null === $value ) { delete_post_meta( $id, $key ); } else { update_post_meta( $id, $key, wp_slash( $value ) ); }
		if ( get_post_meta( $id, $key, true ) !== ( null === $value ? '' : $value ) ) {
			$restored = true;
			foreach ( $old as $old_key => $previous ) {
				if ( $previous[0] ) { update_post_meta( $id, $old_key, wp_slash( $previous[1] ) ); } else { delete_post_meta( $id, $old_key ); }
				if ( get_post_meta( $id, $old_key, true ) !== $previous[1] || metadata_exists( 'post', $id, $old_key ) !== $previous[0] ) { $restored = false; }
			}
			return new WP_Error( 'lieve_seo_storage_failed', $restored ? __( 'Unable to save SEO metadata. Your draft is retained; please try again.', 'lieve-builder' ) : __( 'The SEO save could not be restored completely. Your draft is retained; reload and review the stored settings before retrying.', 'lieve-builder' ), array( 'status' => 500 ) );
		}
	}
	return true;
}

function lieve_seo_defaults() {
	return array( 'output' => false, 'title' => '', 'description' => '', 'canonical' => '', 'index' => 'default', 'follow' => 'default', 'noSnippet' => false, 'noImageIndex' => false, 'noTranslate' => false, 'maxSnippet' => '', 'maxVideoPreview' => '', 'maxImagePreview' => 'default', 'ogType' => 'default', 'ogTitle' => '', 'ogDescription' => '', 'ogImageId' => 0, 'ogImageUrl' => '', 'ogImageAlt' => '', 'twitterCard' => 'summary_large_image', 'twitterTitle' => '', 'twitterDescription' => '', 'twitterImageId' => 0, 'twitterImageUrl' => '', 'twitterImageAlt' => '', 'twitterSite' => '', 'twitterCreator' => '', 'schemaType' => '', 'schemaJson' => '', 'languages' => array() );
}
function lieve_seo_enums() {
	return array( 'index' => array( 'default', 'index', 'noindex' ), 'follow' => array( 'default', 'follow', 'nofollow' ), 'maxImagePreview' => array( 'default', 'none', 'standard', 'large' ), 'ogType' => array( 'default', 'website', 'article' ), 'twitterCard' => array( 'summary', 'summary_large_image' ), 'schemaType' => array( '', 'WebPage', 'AboutPage', 'ContactPage', 'CollectionPage', 'Article' ) );
}
function lieve_seo_url( $value ) {
	if ( ! is_string( $value ) || strlen( $value ) > 2048 || preg_match( '/[\x00-\x20<>]/', $value ) ) { return false; }
	$parts = wp_parse_url( $value );
	return is_array( $parts ) && ! empty( $parts['host'] ) && in_array( strtolower( $parts['scheme'] ?? '' ), array( 'http', 'https' ), true ) && ! isset( $parts['user'] ) && ! isset( $parts['pass'] );
}
function lieve_seo_error( $message ) { return new WP_Error( 'lieve_invalid_seo', $message, array( 'status' => 400 ) ); }
function lieve_seo_rest_schema() {
	$properties = array(); $enums = lieve_seo_enums();
	foreach ( lieve_seo_defaults() as $key => $value ) {
		$properties[ $key ] = array( 'type' => is_bool( $value ) ? 'boolean' : ( is_int( $value ) ? 'integer' : 'string' ) );
		if ( isset( $enums[ $key ] ) ) { $properties[ $key ]['enum'] = $enums[ $key ]; }
		if ( is_string( $value ) ) { $properties[ $key ]['maxLength'] = 'schemaJson' === $key ? 30000 : 4000; }
		if ( is_int( $value ) ) { $properties[ $key ]['minimum'] = 0; }
	}
	$properties['languages'] = array( 'type' => 'array', 'maxItems' => 30, 'items' => array( 'type' => 'object', 'required' => array( 'lang', 'url' ), 'properties' => array( 'lang' => array( 'type' => 'string', 'maxLength' => 50 ), 'url' => array( 'type' => 'string', 'maxLength' => 2048 ) ), 'additionalProperties' => false ) );
	return array( 'type' => 'object', 'properties' => $properties, 'additionalProperties' => false );
}
function lieve_validate_seo( $value, $validate_schema = true ) {
	if ( ! is_array( $value ) ) { return lieve_seo_error( __( 'SEO settings must be an object.', 'lieve-builder' ) ); }
	$defaults = lieve_seo_defaults(); $clean = $defaults; $enums = lieve_seo_enums();
	foreach ( $value as $key => $item ) {
		if ( ! array_key_exists( $key, $defaults ) ) { return lieve_seo_error( __( 'Unknown SEO field.', 'lieve-builder' ) ); }
		if ( is_bool( $defaults[ $key ] ) ) {
			if ( ! is_bool( $item ) ) { return lieve_seo_error( __( 'SEO switches must be true or false.', 'lieve-builder' ) ); }
			$clean[ $key ] = $item; continue;
		}
		if ( isset( $enums[ $key ] ) ) {
			if ( ! is_string( $item ) || ! in_array( $item, $enums[ $key ], true ) ) { return lieve_seo_error( __( 'Invalid SEO selection.', 'lieve-builder' ) ); }
			$clean[ $key ] = $item; continue;
		}
		if ( in_array( $key, array( 'ogImageId', 'twitterImageId' ), true ) ) {
			if ( ! is_int( $item ) || $item < 0 || ( $item && ! wp_attachment_is_image( $item ) ) ) { return lieve_seo_error( __( 'Choose a valid image from the Media Library.', 'lieve-builder' ) ); }
			$clean[ $key ] = $item; continue;
		}
		if ( 'languages' === $key ) {
			if ( ! is_array( $item ) || count( $item ) > 30 ) { return lieve_seo_error( __( 'Use up to 30 language alternates.', 'lieve-builder' ) ); }
			$rows = array(); $seen = array();
			foreach ( $item as $row ) {
				if ( ! is_array( $row ) || ! is_string( $row['lang'] ?? null ) || ! is_string( $row['url'] ?? null ) ) { return lieve_seo_error( __( 'Every alternate needs a language code and URL.', 'lieve-builder' ) ); }
				$lang = strtolower( trim( $row['lang'] ) ); $url = trim( $row['url'] );
				if ( ! preg_match( '/^(?:x-default|[a-z]{2,3}(?:-[a-z0-9]{2,8})*)$/', $lang ) || isset( $seen[ $lang ] ) || ! lieve_seo_url( $url ) || false !== strpos( $url, '#' ) ) { return lieve_seo_error( __( 'Language codes must be unique and paired with absolute HTTP(S) URLs without fragments.', 'lieve-builder' ) ); }
				$rows[] = array( 'lang' => $lang, 'url' => esc_url_raw( $url, array( 'http', 'https' ) ) ); $seen[ $lang ] = true;
			}
			$clean[ $key ] = $rows; continue;
		}
		if ( ! is_string( $item ) ) { return lieve_seo_error( __( 'SEO text fields must contain text.', 'lieve-builder' ) ); }
		$item = trim( $item );
		if ( 'schemaJson' === $key ) {
			if ( strlen( $item ) > 30000 ) { return lieve_seo_error( __( 'Custom JSON-LD must be under 30 KB.', 'lieve-builder' ) ); }
			if ( '' !== $item ) {
				$json = json_decode( $item, true, 32 );
				if ( JSON_ERROR_NONE !== json_last_error() || ! is_array( $json ) || ( empty( $json['@type'] ) && empty( $json['@graph'] ) ) || empty( $json['@context'] ) ) { return lieve_seo_error( __( 'JSON-LD must be a valid object with @context and @type or @graph. Do not include script tags.', 'lieve-builder' ) ); }
				if ( $validate_schema ) { $report = lieve_seo_schema_report( json_decode( $item ) ); if ( $report['errors'] ) { return lieve_seo_error( implode( ' ', $report['errors'] ) ); } }
			}
			$clean[ $key ] = $item; continue;
		}
		if ( in_array( $key, array( 'maxSnippet', 'maxVideoPreview' ), true ) ) {
			if ( '' !== $item && ( ! preg_match( '/^(?:-1|\d{1,5})$/', $item ) || (int) $item > 10000 ) ) { return lieve_seo_error( __( 'Preview limits accept -1 or a number from 0 to 10000.', 'lieve-builder' ) ); }
			$clean[ $key ] = '' === $item ? '' : (string) (int) $item; continue;
		}
		if ( in_array( $key, array( 'canonical', 'ogImageUrl', 'twitterImageUrl' ), true ) ) {
			if ( '' !== $item && ( ! lieve_seo_url( $item ) || ( 'canonical' === $key && false !== strpos( $item, '#' ) ) ) ) { return lieve_seo_error( __( 'Use an absolute HTTP(S) URL. Canonical URLs cannot contain fragments.', 'lieve-builder' ) ); }
			$clean[ $key ] = esc_url_raw( $item, array( 'http', 'https' ) ); continue;
		}
		if ( strlen( $item ) > 4000 ) { return lieve_seo_error( __( 'SEO text fields must be under 4000 bytes.', 'lieve-builder' ) ); }
		if ( in_array( $key, array( 'twitterSite', 'twitterCreator' ), true ) && '' !== $item && ! preg_match( '/^@?[a-zA-Z0-9_]{1,30}$/', $item ) ) { return lieve_seo_error( __( 'Social handles accept letters, digits and underscores.', 'lieve-builder' ) ); }
		$clean[ $key ] = sanitize_text_field( $item );
		if ( in_array( $key, array( 'twitterSite', 'twitterCreator' ), true ) && '' !== $item ) { $clean[ $key ] = '@' . ltrim( $clean[ $key ], '@' ); }
	}
	return $clean;
}
function lieve_get_seo( $id ) {
	$raw = get_post_meta( $id, LIEVE_META_SEO, true );
	// A removed attachment must not discard the page's unrelated search metadata.
	if ( is_array( $raw ) ) { foreach ( array( 'og', 'twitter' ) as $prefix ) { if ( ! empty( $raw[ $prefix . 'ImageId' ] ) && ! wp_attachment_is_image( $raw[ $prefix . 'ImageId' ] ) ) { $raw[ $prefix . 'ImageId' ] = 0; $raw[ $prefix . 'ImageUrl' ] = ''; } } }
	// Retain older drafts for correction; invalid custom schema must not erase title/robots.
	$clean = lieve_validate_seo( is_array( $raw ) ? $raw : array(), false );
	return is_wp_error( $clean ) ? lieve_seo_defaults() : $clean;
}
/** Do not compete with an established SEO owner. Extensions can name other providers. */
function lieve_seo_provider() {
	$provider = '';
	foreach ( array( 'WPSEO_VERSION' => 'Yoast SEO', 'RANK_MATH_VERSION' => 'Rank Math', 'AIOSEO_VERSION' => 'All in One SEO', 'SEOPRESS_VERSION' => 'SEOPress', 'THE_SEO_FRAMEWORK_VERSION' => 'The SEO Framework' ) as $constant => $name ) { if ( defined( $constant ) ) { $provider = $name; break; } }
	return (string) apply_filters( 'lieve_seo_external_provider', $provider );
}
function lieve_seo_description( $id ) {
	$post = get_post( $id ); if ( ! $post ) { return ''; }
	$text = $post->post_excerpt;
	if ( ! $text && lieve_builder_is_enabled( $id ) ) {
		$walk = static function( $nodes ) use ( &$walk, &$text, $post ) {
			foreach ( $nodes as $node ) {
				if ( strlen( $text ) > 2500 ) { break; }
				// Personalized/conditional content must not leak into shared metadata.
				if ( ! empty( $node['props']['conditions']['enabled'] ) || ! empty( $node['props']['listing']['enabled'] ) ) { continue; }
				// Never derive public metadata from stored executable PHP source.
				if ( 'html' === $node['type'] && false !== strpos( $node['props']['content'] ?? '', '<?' ) ) { continue; }
				$fields = function_exists( 'lieve_element_registry' ) ? ( lieve_element_registry()[ $node['type'] ]['seoTextFields'] ?? array() ) : ( in_array( $node['type'], array( 'heading', 'text-basic', 'text', 'html' ), true ) ? array( 'content' ) : array() );
				foreach ( $fields as $field ) {
					$value = $node['props'][ $field ] ?? '';
					// Explicit metadata is preferable to resolving visitor-specific dynamic values.
					if ( is_string( $value ) && ( ! function_exists( 'lieve_dynamic_reference' ) || ! lieve_dynamic_reference( $value ) ) ) { $text .= ' ' . $value; }
				}
				if ( 'post-content' === $node['type'] ) { $text .= ' ' . $post->post_content; }
				$walk( $node['children'] ?? array() );
			}
		};
		$walk( lieve_get_document( $id )['children'] );
	} elseif ( ! $text ) { $text = $post->post_content; }
	return wp_trim_words( preg_replace( '/\s+/u', ' ', wp_strip_all_tags( $text ) ), 35, '…' );
}
function lieve_seo_image( $id, $url, $alt = '' ) {
	$image = $id ? wp_get_attachment_image_src( $id, 'full' ) : false;
	return array( 'id' => (int) $id, 'url' => $image ? $image[0] : $url, 'width' => $image ? $image[1] : 0, 'height' => $image ? $image[2] : 0, 'alt' => $alt ?: ( $id ? get_post_meta( $id, '_wp_attachment_image_alt', true ) : '' ) );
}
function lieve_seo_context( $id ) {
	$post = get_post( $id ); $seo = lieve_get_seo( $id ); $title = wp_strip_all_tags( get_the_title( $id ) );
	$separator = apply_filters( 'document_title_separator', '-' ); $site_name = get_bloginfo( 'name' );
	$default_title = $title . ( $title ? ' ' . $separator . ' ' : '' ) . $site_name;
	if ( 'page' === get_option( 'show_on_front' ) && (int) get_option( 'page_on_front' ) === (int) $id ) { $default_title = $site_name . ( get_bloginfo( 'description' ) ? ' ' . $separator . ' ' . get_bloginfo( 'description' ) : '' ); }
	return array( 'provider' => lieve_seo_provider(), 'siteName' => $site_name, 'title' => $default_title, 'description' => lieve_seo_description( $id ), 'url' => get_permalink( $id ), 'public' => (bool) get_option( 'blog_public' ), 'passwordProtected' => ! empty( $post->post_password ), 'ogImage' => lieve_seo_image( $seo['ogImageId'], $seo['ogImageUrl'], $seo['ogImageAlt'] ), 'twitterImage' => lieve_seo_image( $seo['twitterImageId'], $seo['twitterImageUrl'], $seo['twitterImageAlt'] ), 'featuredImage' => lieve_seo_image( get_post_thumbnail_id( $id ), '' ) );
}
function lieve_seo_query_id() {
	if ( is_admin() || is_preview() || lieve_seo_provider() ) { return 0; }
	$id = is_singular() ? get_queried_object_id() : 0;
	if ( ! $id && is_home() ) { $id = (int) get_option( 'page_for_posts' ); }
	if ( ! $id && function_exists( 'is_shop' ) && is_shop() && function_exists( 'wc_get_page_id' ) ) { $id = (int) wc_get_page_id( 'shop' ); }
	$post = $id > 0 ? get_post( $id ) : null;
	if ( ! $post || 'publish' !== $post->post_status || ! empty( $post->post_password ) || ( defined( 'LIEVE_TEMPLATE_POST_TYPE' ) && LIEVE_TEMPLATE_POST_TYPE === $post->post_type ) || ( ! lieve_builder_is_enabled( $id ) && ! is_array( get_post_meta( $id, LIEVE_META_SEO, true ) ) ) || ! lieve_get_seo( $id )['output'] ) { return 0; }
	return $id;
}
function lieve_seo_document_title( $title ) {
	$id = lieve_seo_query_id(); return $id && lieve_get_seo( $id )['title'] ? lieve_get_seo( $id )['title'] : $title;
}
function lieve_seo_canonical( $url, $post ) {
	$id = lieve_seo_query_id(); return $id && (int) $post->ID === $id && lieve_get_seo( $id )['canonical'] ? lieve_get_seo( $id )['canonical'] : $url;
}
function lieve_seo_robots( $robots ) {
	$id = lieve_seo_query_id(); if ( ! $id ) { return $robots; } $seo = lieve_get_seo( $id );
	// A page-level switch never defeats WordPress's site-wide privacy setting.
	if ( 'noindex' === $seo['index'] ) { unset( $robots['index'] ); $robots['noindex'] = true; }
	elseif ( 'index' === $seo['index'] && get_option( 'blog_public' ) ) { unset( $robots['noindex'] ); $robots['index'] = true; }
	if ( 'default' !== $seo['follow'] ) { unset( $robots['follow'], $robots['nofollow'] ); $robots[ $seo['follow'] ] = true; }
	foreach ( array( 'noSnippet' => 'nosnippet', 'noImageIndex' => 'noimageindex', 'noTranslate' => 'notranslate' ) as $key => $rule ) { if ( $seo[ $key ] ) { $robots[ $rule ] = true; } }
	if ( ! $seo['noSnippet'] && '' !== $seo['maxSnippet'] ) { $robots['max-snippet'] = $seo['maxSnippet']; }
	if ( '' !== $seo['maxVideoPreview'] ) { $robots['max-video-preview'] = $seo['maxVideoPreview']; }
	if ( 'default' !== $seo['maxImagePreview'] ) { $robots['max-image-preview'] = $seo['maxImagePreview']; }
	return $robots;
}
function lieve_seo_print_meta( $attribute, $key, $value ) {
	if ( '' !== (string) $value ) { echo '<meta ' . $attribute . '="' . esc_attr( $key ) . '" content="' . esc_attr( $value ) . '">' . "\n"; }
}
function lieve_seo_print_head() {
	$id = lieve_seo_query_id(); if ( ! $id ) { return; } $seo = lieve_get_seo( $id ); $post = get_post( $id );
	$title = $seo['title'] ?: wp_get_document_title(); $description = $seo['description'] ?: lieve_seo_description( $id );
	$url = $seo['canonical'] ?: ( is_singular() ? wp_get_canonical_url( $id ) : get_pagenum_link( max( 1, (int) get_query_var( 'paged' ) ) ) );
	// Core rel_canonical only covers singular requests; these are real configured pages.
	if ( ! is_singular() && $url ) { echo '<link rel="canonical" href="' . esc_url( $url ) . '">' . "\n"; }
	lieve_seo_print_meta( 'name', 'description', $description );
	$type = 'default' === $seo['ogType'] ? ( 'post' === $post->post_type ? 'article' : 'website' ) : $seo['ogType'];
	$og_title = $seo['ogTitle'] ?: $title; $og_description = $seo['ogDescription'] ?: $description;
	foreach ( array( 'og:type' => $type, 'og:title' => $og_title, 'og:description' => $og_description, 'og:url' => $url, 'og:site_name' => get_bloginfo( 'name' ), 'og:locale' => get_locale() ) as $key => $value ) { lieve_seo_print_meta( 'property', $key, $value ); }
	$image = lieve_seo_image( $seo['ogImageId'] ?: get_post_thumbnail_id( $id ), $seo['ogImageUrl'], $seo['ogImageAlt'] );
	// An explicit image URL wins over the featured-image fallback.
	if ( ! $seo['ogImageId'] && $seo['ogImageUrl'] ) { $image = lieve_seo_image( 0, $seo['ogImageUrl'], $seo['ogImageAlt'] ); }
	foreach ( array( 'url' => 'og:image', 'width' => 'og:image:width', 'height' => 'og:image:height', 'alt' => 'og:image:alt' ) as $key => $tag ) { if ( ! empty( $image[ $key ] ) ) { lieve_seo_print_meta( 'property', $tag, $image[ $key ] ); } }
	if ( 'article' === $type ) { lieve_seo_print_meta( 'property', 'article:published_time', get_post_time( DATE_W3C, true, $post ) ); lieve_seo_print_meta( 'property', 'article:modified_time', get_post_modified_time( DATE_W3C, true, $post ) ); }
	$twitter = ( $seo['twitterImageId'] || $seo['twitterImageUrl'] ) ? lieve_seo_image( $seo['twitterImageId'], $seo['twitterImageUrl'], $seo['twitterImageAlt'] ) : $image;
	foreach ( array( 'twitter:card' => $seo['twitterCard'], 'twitter:title' => $seo['twitterTitle'] ?: $og_title, 'twitter:description' => $seo['twitterDescription'] ?: $og_description, 'twitter:image' => $twitter['url'], 'twitter:image:alt' => $seo['twitterImageAlt'] ?: $twitter['alt'], 'twitter:site' => $seo['twitterSite'], 'twitter:creator' => $seo['twitterCreator'] ) as $key => $value ) { lieve_seo_print_meta( 'name', $key, $value ); }
	foreach ( $seo['languages'] as $row ) { echo '<link rel="alternate" hreflang="' . esc_attr( $row['lang'] ) . '" href="' . esc_url( $row['url'] ) . '">' . "\n"; }
	$graph = array();
	if ( $seo['schemaType'] ) {
		$item = array( '@context' => 'https://schema.org', '@type' => $seo['schemaType'], '@id' => $url . '#webpage', 'url' => $url, 'name' => $title, 'description' => $description, 'inLanguage' => get_bloginfo( 'language' ) );
		if ( 'Article' === $seo['schemaType'] ) { $item['headline'] = $title; $item['datePublished'] = get_post_time( DATE_W3C, true, $post ); $item['dateModified'] = get_post_modified_time( DATE_W3C, true, $post ); $item['author'] = array( '@type' => 'Person', 'name' => get_the_author_meta( 'display_name', $post->post_author ) ); }
		if ( $image['url'] ) { $item['image'] = $image['url']; }
		$graph[] = $item;
	}
	if ( $seo['schemaJson'] && ! lieve_seo_schema_report( json_decode( $seo['schemaJson'] ) )['errors'] ) { $graph[] = json_decode( $seo['schemaJson'], true, 32 ); }
	foreach ( $graph as $item ) { echo '<script type="application/ld+json">' . wp_json_encode( $item, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) . '</script>' . "\n"; }
}
/** Keep explicit noindex pages out of WordPress's core sitemap, not plugin sitemaps. */
function lieve_seo_sitemap_query( $args ) {
	if ( lieve_seo_provider() ) { return $args; }
	$visibility = array( 'relation' => 'OR', array( 'key' => '_lieve_seo_noindex', 'compare' => 'NOT EXISTS' ), array( 'key' => '_lieve_seo_noindex', 'value' => '1', 'compare' => '!=' ) );
	$args['meta_query'] = empty( $args['meta_query'] ) ? array( $visibility ) : array( 'relation' => 'AND', $args['meta_query'], $visibility ); return $args;
}
add_filter( 'pre_get_document_title', 'lieve_seo_document_title', 20 );
add_filter( 'get_canonical_url', 'lieve_seo_canonical', 20, 2 );
add_filter( 'wp_robots', 'lieve_seo_robots', 20 );
add_action( 'wp_head', 'lieve_seo_print_head', 5 );
add_filter( 'wp_sitemaps_posts_query_args', 'lieve_seo_sitemap_query', 20 );
