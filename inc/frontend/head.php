<?php
/** Individually controlled public head output. No hooks or asset queues are removed. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
define( 'LIEVE_META_HEAD', '_lieve_head_overrides' );

function lieve_head_valid_key( $key ) {
	return is_string( $key ) && strlen( $key ) <= 180 && preg_match( '/^[a-z0-9][a-z0-9:_.-]*$/D', $key ) && ! in_array( $key, array( '__proto__', 'constructor', 'prototype' ), true );
}
function lieve_head_validate( $value ) {
	if ( is_object( $value ) ) { $value = (array) $value; }
	if ( ! is_array( $value ) || count( $value ) > 512 ) { return new WP_Error( 'lieve_head_invalid', __( 'HEAD settings must contain up to 512 named switches.', 'lieve-builder' ), array( 'status' => 400 ) ); }
	foreach ( $value as $key => $enabled ) {
		if ( ! lieve_head_valid_key( $key ) || ! is_bool( $enabled ) ) { return new WP_Error( 'lieve_head_invalid', __( 'Every HEAD setting needs a valid element key and a true or false value.', 'lieve-builder' ), array( 'status' => 400 ) ); }
	}
	ksort( $value, SORT_STRING ); return $value;
}
function lieve_head_normalize( $value, $global = false ) {
	// Native Settings API submits one JSON field, REST submits an object.
	if ( is_string( $value ) && strlen( $value ) <= 120000 ) { $value = json_decode( $value, true ); }
	$clean = lieve_head_validate( $value ); if ( ! is_array( $clean ) ) { return array(); }
	return $global ? array_filter( $clean, static function( $enabled ) { return ! $enabled; } ) : $clean;
}
function lieve_get_head_overrides( $id ) { return lieve_head_normalize( get_post_meta( $id, LIEVE_META_HEAD, true ) ); }
function lieve_head_revision( $id, $value = null ) { return hash( 'sha256', wp_json_encode( null === $value ? lieve_get_head_overrides( $id ) : $value ) ); }
function lieve_head_enabled( $key, $global, $page ) { return array_key_exists( $key, $page ) ? $page[$key] : ( $global[$key] ?? true ); }
function lieve_head_schema() { return array( 'type' => 'object', 'maxProperties' => 512, 'additionalProperties' => array( 'type' => 'boolean' ), 'validate_callback' => static function( $value ) { $clean = lieve_head_validate( $value ); return is_wp_error( $clean ) ? $clean : true; } ); }

/** Known controls are available immediately, even when the tag is absent on this page. */
function lieve_head_catalog() {
	$rows = array(
		'charset' => array( 'Character encoding', 'Document', true ),
		'meta:viewport' => array( 'Viewport', 'Document', true ),
		'title' => array( 'Page title', 'Document', true ),
		'meta:robots' => array( 'Robots directives', 'SEO & social', true ),
		'meta:description' => array( 'Meta description', 'SEO & social', false ),
		'link:canonical' => array( 'Canonical URL', 'SEO & social', true ),
		'meta:generator' => array( 'Generator', 'WordPress', false ),
		'link:shortlink' => array( 'Shortlink', 'WordPress', false ),
		'link:https-api-w-org' => array( 'REST API discovery', 'WordPress', false ),
		'meta:og:title' => array( 'Open Graph title', 'SEO & social', false ),
		'meta:og:description' => array( 'Open Graph description', 'SEO & social', false ),
		'meta:og:type' => array( 'Open Graph type', 'SEO & social', false ),
		'meta:og:url' => array( 'Open Graph URL', 'SEO & social', false ),
		'meta:og:image' => array( 'Open Graph image', 'SEO & social', false ),
		'meta:twitter:card' => array( 'X / Twitter card', 'SEO & social', false ),
		'meta:twitter:title' => array( 'X / Twitter title', 'SEO & social', false ),
		'meta:twitter:description' => array( 'X / Twitter description', 'SEO & social', false ),
		'meta:twitter:image' => array( 'X / Twitter image', 'SEO & social', false ),
	);
	$out = array(); foreach ( $rows as $key => $row ) { $out[] = array( 'key' => $key, 'label' => $row[0], 'group' => $row[1], 'sensitive' => $row[2] ); } return $out;
}

/** The public bookmark API supplies byte spans without reserializing authored HTML. */
if ( class_exists( 'WP_HTML_Tag_Processor' ) ) {
	class Lieve_Head_Tokens extends WP_HTML_Tag_Processor {
		public function span() {
			if ( ! $this->set_bookmark( 'lieve_head_token' ) ) { return null; }
			$mark = $this->bookmarks['lieve_head_token']; $span = array( $mark->start, $mark->length );
			$this->release_bookmark( 'lieve_head_token' ); return $span;
		}
	}
}
function lieve_head_slug( $text ) { return trim( preg_replace( '/[^a-z0-9_.:-]+/', '-', strtolower( $text ) ), '-' ); }
function lieve_head_descriptor( $parser, $raw ) {
	$tag = strtolower( $parser->get_tag() ); $id = $parser->get_attribute( 'id' );
	$key = ''; $label = ''; $group = 'Other elements'; $sensitive = false;
	if ( 'title' === $tag ) { $key = 'title'; $label = 'Page title'; $group = 'Document'; $sensitive = true; }
	elseif ( 'meta' === $tag ) {
		if ( null !== $parser->get_attribute( 'charset' ) ) { $key = 'charset'; $label = 'Character encoding'; $group = 'Document'; $sensitive = true; }
		else { $name = $parser->get_attribute( 'name' ) ?: $parser->get_attribute( 'property' ) ?: $parser->get_attribute( 'http-equiv' );
			if ( is_string( $name ) && '' !== $name ) { $key = 'meta:' . lieve_head_slug( $name ); $label = $name; $group = 'generator' === strtolower( $name ) ? 'WordPress' : ( preg_match( '/^(og:|twitter:|description|robots)/i', $name ) ? 'SEO & social' : 'Document' ); $sensitive = in_array( strtolower( $name ), array( 'viewport', 'robots', 'content-security-policy', 'referrer' ), true ); }
		}
	} elseif ( 'link' === $tag ) {
		$rel = strtolower( (string) $parser->get_attribute( 'rel' ) ); $href = (string) $parser->get_attribute( 'href' );
		$group = in_array( $rel, array( 'canonical', 'alternate' ), true ) ? 'SEO & social' : 'Links & discovery';
		$key = 'link:' . lieve_head_slug( $rel ); $label = $rel ?: 'Link';
		if ( 'https://api.w.org/' === $rel ) { $key = 'link:https-api-w-org'; $group = 'WordPress'; }
		if ( ! in_array( $rel, array( 'canonical', 'shortlink', 'https://api.w.org/' ), true ) ) {
			$detail = (string) ( $parser->get_attribute( 'hreflang' ) ?: $parser->get_attribute( 'type' ) ?: $parser->get_attribute( 'sizes' ) );
			$identity = $id ?: ( $detail . ':' . preg_replace( '/([?&])ver=[^&]*(&|$)/', '$1', $href ) );
			$key .= ':' . substr( hash( 'sha256', $identity ), 0, 16 );
			$path = wp_parse_url( $href, PHP_URL_PATH ); $label .= ' · ' . ( $detail ?: basename( $path ?: $href ) );
		}
		if ( in_array( $rel, array( 'stylesheet', 'preload', 'modulepreload' ), true ) ) { $group = 'Styles & scripts'; $sensitive = true; $label = $id ?: $label; }
		if ( 'canonical' === $rel ) { $sensitive = true; }
	} elseif ( in_array( $tag, array( 'script', 'style' ), true ) ) {
		$group = 'Styles & scripts'; $sensitive = true;
		$src = $parser->get_attribute( 'src' ); $type = $parser->get_attribute( 'type' );
		if ( 'application/ld+json' === $type ) { $group = 'SEO & social'; $sensitive = false; }
		$identity = $id ?: ( $src ? preg_replace( '/([?&])ver=[^&]*(&|$)/', '$1', $src ) : $raw );
		$key = $tag . ':' . ( $id && preg_match( '/^[a-z0-9_.:-]{1,140}$/D', $id ) ? $id : substr( hash( 'sha256', $identity ), 0, 20 ) );
		$label = $id ?: ( $src ? basename( wp_parse_url( $src, PHP_URL_PATH ) ?: $src ) : ( 'application/ld+json' === $type ? 'Structured data (JSON-LD)' : 'Inline ' . $tag ) . ' · ' . substr( hash( 'sha256', $identity ), 0, 6 ) );
		if ( ! $id && 'application/ld+json' === $type ) {
			$data = json_decode( $parser->get_modifiable_text(), true, 32 ); $kind = is_array( $data ) ? ( $data['@type'] ?? ( isset( $data['@graph'] ) ? 'graph' : 'data' ) ) : 'data';
			$kind = is_array( $kind ) ? implode( '-', array_filter( $kind, 'is_string' ) ) : ( is_string( $kind ) ? $kind : 'data' );
			$key = 'script:jsonld:' . substr( lieve_head_slug( $kind ) ?: 'data', 0, 120 ); $label = 'Structured data · ' . $kind;
		}
	}
	if ( ! $key || ! lieve_head_valid_key( $key ) ) { $key = $tag . ':' . substr( hash( 'sha256', $raw ), 0, 20 ); $label = ucfirst( $tag ) . ' · ' . substr( hash( 'sha256', $raw ), 0, 6 ); }
	return array( 'key' => $key, 'label' => substr( wp_strip_all_tags( $label ), 0, 160 ), 'group' => $group, 'sensitive' => $sensitive );
}

/** Opaque raw-text tags are whole tokens. Nested noscript/template content is one item. */
function lieve_head_tokens( $html ) {
	if ( ! class_exists( 'Lieve_Head_Tokens' ) || ! method_exists( 'Lieve_Head_Tokens', 'next_token' ) || strlen( $html ) > 2097152 ) { return array(); }
	$parser = new Lieve_Head_Tokens( $html ); $rows = array(); $seen = array(); $pending = null; $depth = 0; $catalog = array_column( lieve_head_catalog(), null, 'key' );
	while ( $parser->next_token() ) {
		if ( '#tag' !== $parser->get_token_type() ) { continue; }
		$tag = $parser->get_tag(); $span = $parser->span(); if ( ! $span ) { return array(); }
		if ( $pending ) {
			if ( $tag === $pending['tag'] ) { $depth += $parser->is_tag_closer() ? -1 : 1; }
			if ( 0 === $depth ) { $pending['row']['length'] = $span[0] + $span[1] - $pending['row']['start']; $rows[] = $pending['row']; $pending = null; }
			continue;
		}
		if ( $parser->is_tag_closer() ) { continue; }
		if ( ! in_array( $tag, array( 'META', 'LINK', 'TITLE', 'SCRIPT', 'STYLE', 'BASE', 'NOSCRIPT', 'TEMPLATE' ), true ) ) { return array(); } // Malformed head: fail open.
		$row = lieve_head_descriptor( $parser, substr( $html, $span[0], $span[1] ) );
		$key = $row['key']; if ( isset( $catalog[$key] ) ) { $row = $catalog[$key]; }
		$seen[$key] = ( $seen[$key] ?? 0 ) + 1; if ( $seen[$key] > 1 ) { $row['key'] .= ':n' . $seen[$key]; $row['label'] .= ' · ' . $seen[$key]; }
		$row['start'] = $span[0]; $row['length'] = $span[1];
		if ( in_array( $tag, array( 'NOSCRIPT', 'TEMPLATE' ), true ) ) { $pending = array( 'tag' => $tag, 'row' => $row ); $depth = 1; }
		else { $rows[] = $row; }
		if ( count( $rows ) > 512 ) { return array(); }
	}
	return $pending || $parser->paused_at_incomplete_token() ? array() : $rows;
}
function lieve_filter_head_html( $html, $global, $page = array() ) {
	if ( ! $global && ! $page ) { return $html; }
	$rows = lieve_head_tokens( $html );
	foreach ( array_reverse( $rows ) as $row ) { if ( ! lieve_head_enabled( $row['key'], $global, $page ) ) { $html = substr_replace( $html, '', $row['start'], $row['length'] ); } }
	return $html;
}
function lieve_capture_site_head() {
	$level = ob_get_level(); ob_start();
	try { echo '<meta charset="' . esc_attr( get_bloginfo( 'charset' ) ) . '">' . "\n" . '<meta name="viewport" content="width=device-width, initial-scale=1">' . "\n"; wp_head(); return ob_get_clean(); }
	finally { while ( ob_get_level() > $level ) { ob_end_clean(); } }
}
function lieve_render_site_head() {
	$html = lieve_capture_site_head();
	if ( is_admin() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || ! empty( $GLOBALS['lieve_element_preview'] ) ) { echo $html; return; }
	$page = is_singular() && 'lieve_template' !== get_post_type() ? lieve_get_head_overrides( get_queried_object_id() ) : array();
	echo lieve_filter_head_html( $html, lieve_theme_setting( 'head_items' ) ?: array(), $page ); // Trusted output from wp_head; unchanged bytes, no added markup.
}

/** An explicit same-origin scan renders only the unfiltered head in frontend context. */
function lieve_head_scan_url( $id = 0 ) {
	$url = $id ? ( 'publish' === get_post_status( $id ) ? get_permalink( $id ) : get_preview_post_link( $id ) ) : home_url( '/' );
	return add_query_arg( array( 'lieve_head_scan' => '1', '_lieve_head_nonce' => wp_create_nonce( 'lieve_head_scan' ) ), $url ?: get_permalink( $id ) );
}
function lieve_head_scan_request() {
	if ( ! isset( $_GET['lieve_head_scan'] ) ) { return; }
	$id = is_singular() ? get_queried_object_id() : 0;
	$nonce = isset( $_GET['_lieve_head_nonce'] ) && is_string( $_GET['_lieve_head_nonce'] ) ? wp_unslash( $_GET['_lieve_head_nonce'] ) : '';
	if ( ! wp_verify_nonce( $nonce, 'lieve_head_scan' ) || ! ( current_user_can( 'manage_options' ) || ( $id && current_user_can( 'edit_post', $id ) && lieve_builder_supports_post_type( get_post_type( $id ) ) ) ) ) { wp_send_json_error( array( 'message' => __( 'You cannot scan this page head.', 'lieve-builder' ) ), 403 ); }
	nocache_headers();
	$rows = lieve_head_tokens( lieve_capture_site_head() );
	foreach ( $rows as &$row ) { unset( $row['start'], $row['length'] ); } unset( $row );
	wp_send_json( array( 'items' => $rows, 'complete' => ! empty( $rows ) ) );
}
add_action( 'template_redirect', 'lieve_head_scan_request', 0 );

function lieve_head_control_config( $id = 0, $template = false ) {
	return array( 'items' => lieve_head_catalog(), 'global' => (object) ( lieve_theme_setting( 'head_items' ) ?: array() ), 'scanUrl' => $template ? '' : lieve_head_scan_url( $id ), 'template' => $template );
}

/** Server-render the global host; the shared component owns its internal controls. */
function lieve_head_settings_panel( $settings ) {
	?><header class="lieve-settings-section-head"><h2><?php esc_html_e( 'Site head output', 'lieve-builder' ); ?></h2><p><?php esc_html_e( 'Choose which HTML head elements reach visitors. Pages inherit these settings unless you override them in the builder.', 'lieve-builder' ); ?></p></header>
	<input type="hidden" data-setting data-setting-head name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION ); ?>[head_items]" value="<?php echo esc_attr( wp_json_encode( (object) $settings['head_items'] ) ); ?>">
	<div data-head-settings></div><noscript><p><?php esc_html_e( 'Enable JavaScript to manage individual HEAD elements.', 'lieve-builder' ); ?></p></noscript><?php
}
