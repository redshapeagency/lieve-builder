<?php
/** Preview rendering. Custom PHP requires an explicit, authenticated code-preview request. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Transient editor projection collected during the REAL listing render/query.
 * HTML is presentation only. Tree edges come from renderer calls matched against
 * the sanitized model, never from attributes, comments or authored HTML.
 */
final class Lieve_Editor_Listing_Projection {
	private $model;
	private $stack = array();
	private $root;
	private $valid = true;
	private $bytes = 0;
	private $nodes = 0;

	public function __construct( $model ) { $this->model = $model; }

	public function render( $node, $render ) {
		$parent = end( $this->stack );
		if ( $parent && ! in_array( $parent->kind, array( 'container', 'item' ), true ) ) { $render(); return; }
		if ( ! $parent && $this->root ) { $this->valid = false; $render(); return; }
		$expected = $parent ? ( $parent->model['children'][ $parent->index++ ] ?? null ) : $this->model;
		if ( ! $expected || ( $node['_lieveListingSourceId'] ?? $node['id'] ) !== $expected['id'] || $node['type'] !== $expected['type'] ) {
			$this->valid = false; $render(); return;
		}
		$kind = ! $parent ? 'listing' : ( ! lieve_listing_enabled( $node ) && in_array( $node['type'], array( 'section', 'container', 'block', 'div', 'slot' ), true ) ? 'container' : 'opaque' );
		$frame = (object) array( 'model' => $expected, 'index' => 0, 'kind' => $kind, 'children' => array(), 'items' => array(), 'html' => '' );
		if ( $parent ) { $parent->children[] = $frame; } else { $this->root = $frame; }
		$this->stack[] = $frame; $level = ob_get_level();
		try { ob_start(); $render(); $html = ob_get_clean(); }
		finally { while ( ob_get_level() > $level ) { ob_end_clean(); } array_pop( $this->stack ); }
		$frame->html = $html;
		if ( 'opaque' !== $kind ) { $frame->shell = $this->shell( $frame ); $frame->html = ''; }
		$this->bytes += 'opaque' === $kind ? strlen( $html ) : 0;
		if ( ++$this->nodes > 3000 || $this->bytes > 524288 || in_array( $kind, array( 'container', 'item' ), true ) && $frame->index !== count( $expected['children'] ?? array() ) ) { $this->valid = false; }
		echo $html;
	}

	public function begin_item( $owner, $type, $result, $position ) {
		$parent = end( $this->stack );
		// Nested/unmapped previews do not acquire internal identities.
		if ( $parent !== $this->root || 'listing' !== $parent->kind || $owner['id'] !== $this->model['id'] ) { return; }
		$frame = (object) array( 'kind' => 'item', 'model' => $this->model, 'index' => 0, 'children' => array(), 'type' => $type, 'result' => (string) $result, 'position' => $position, 'count' => (int) ( $GLOBALS['lieve_listing_context']['count'] ?? $position ) );
		$parent->items[] = $frame; $this->stack[] = $frame;
	}

	public function end_item( $owner ) {
		$frame = end( $this->stack );
		if ( $owner['id'] !== $this->model['id'] || ! $frame || 'item' !== $frame->kind ) { return; }
		if ( $frame->index !== count( $this->model['children'] ?? array() ) ) { $this->valid = false; }
		array_pop( $this->stack );
	}

	private function node_data( $frame ) {
		$data = array( 'id' => $frame->model['id'], 'type' => $frame->model['type'], 'kind' => $frame->kind );
		if ( 'opaque' === $frame->kind ) { $data['html'] = $frame->html; }
		else { $data['shell'] = $frame->shell; $data['children'] = array_map( array( $this, 'node_data' ), $frame->children ); }
		return $data;
	}

	private function shell( $frame ) {
		// Presentation attributes only; the client creates the actual registered shell.
		$p = new WP_HTML_Tag_Processor( $frame->html ); $attributes = array();
		while ( $p->next_tag() ) {
			if ( 'STYLE' === $p->get_tag() ) { continue; }
			foreach ( array( 'id', 'class', 'style', 'data-lieve-id', 'data-lieve-node', 'data-lieve-listing-source', 'data-lieve-listing', 'data-listing-mode', 'data-listing-autoplay', 'data-listing-interval', 'data-listing-advance', 'data-listing-rewind', 'data-listing-drag', 'data-listing-scrollbar', 'data-listing-motion', 'role', 'aria-label' ) as $key ) {
				$value = $p->get_attribute( $key ); if ( is_string( $value ) ) { $attributes[ $key ] = $value; }
			}
			break;
		}
		return $attributes;
	}

	public function result() {
		if ( ! $this->valid || ! $this->root || $this->stack || count( $this->root->items ) > 20 ) { return null; }
		$items = array();
		foreach ( $this->root->items as $item ) {
			$items[] = array( 'type' => $item->type, 'result' => $item->result, 'position' => $item->position, 'count' => $item->count, 'children' => array_map( array( $this, 'node_data' ), $item->children ) );
		}
		return array( 'version' => 1, 'owner' => $this->model['id'], 'query' => $this->model['props']['listing']['query'], 'shell' => $this->root->shell, 'items' => $items );
	}
}

/** Authenticated REST opt-in only. Never seeded or enabled in ordinary startup. */
function lieve_editor_listing_preview( $node, $post ) {
	$before = $GLOBALS['lieve_editor_listing_projection'] ?? null;
	$revision = lieve_queries_revision();
	$collector = new Lieve_Editor_Listing_Projection( $node );
	$GLOBALS['lieve_editor_listing_projection'] = $collector;
	try {
		$html = lieve_render_editor_preview( $node, $post ); $data = $collector->result();
		if ( $data && hash_equals( $revision, lieve_queries_revision() ) ) { $data['revision'] = $revision; } else { $data = null; }
		return array( 'html' => $html, 'listingProjection' => $data );
	}
	finally { if ( null === $before ) { unset( $GLOBALS['lieve_editor_listing_projection'] ); } else { $GLOBALS['lieve_editor_listing_projection'] = $before; } }
}

/** Renderer-call provenance for reusable previews; never an editable expanded document. */
final class Lieve_Editor_Expanded_Controls {
	private $owner;
	private $stack = array();
	private $root;
	private $valid = true;
	private $forbidden = false;
	private $dependencies = array();
	private $nodes = 0;
	private $bytes = 0;

	public function __construct( $owner ) { $this->owner = $owner; }

	private function dependency( $id, $kind ) {
		if ( isset( $this->dependencies[$id] ) ) { return $this->dependencies[$id]['revision']; }
		$post = get_post( $id );
		$available = $post && LIEVE_TEMPLATE_POST_TYPE === $post->post_type && empty( $post->post_password ) &&
			( 'publish' === $post->post_status || 'component' === $kind && current_user_can( 'edit_post', $id ) );
		if ( ! $available || ! current_user_can( 'read_post', $id ) || ( 'component' === $kind && ! lieve_is_component( $id ) ) ) { $this->valid = false; $this->forbidden = true; return null; }
		$revision = lieve_template_revision( $id );
		$this->dependencies[$id] = array( 'id' => (int) $id, 'kind' => $kind, 'revision' => $revision );
		return $revision;
	}

	public function render( $node, $render ) {
		$parent = end( $this->stack );
		if ( $parent && 'container' !== $parent->kind ) { $render(); return; }
		if ( ! $parent ) {
			if ( $this->root || $node['id'] !== $this->owner['id'] || empty( $node['_lieveTemplateNodePrepared'] ) ||
				( 'template' === $this->owner['type'] ? 'template' !== $node['type'] || $node['props']['templateId'] !== $this->owner['props']['templateId'] :
					(int) ( $node['_lieveComponentPostId'] ?? 0 ) !== (int) $this->owner['props']['componentId'] || ( $node['_lieveComponentScope'] ?? '' ) !== $this->owner['id'] ) ) { $this->valid = false; $render(); return; }
		} else {
			$expected = $parent->expected[ $parent->index++ ] ?? null;
			if ( ! $expected || $expected['id'] !== $node['id'] || $expected['type'] !== $node['type'] ) { $this->valid = false; $render(); return; }
		}
		$source = $parent ? $parent->source : null;
		if ( 'template' === $node['type'] ) {
			$id = (int) $node['props']['templateId']; $revision = $this->dependency( $id, 'template' );
			$source = array( 'definition' => $id, 'revision' => $revision, 'instance' => $node['id'], 'kind' => 'template' );
		} elseif ( ! empty( $node['_lieveComponentPostId'] ) ) {
			$id = (int) $node['_lieveComponentPostId']; $revision = $this->dependency( $id, 'component' );
			$source = array( 'definition' => $id, 'revision' => $revision, 'instance' => $node['_lieveComponentScope'], 'kind' => 'component' );
		}
		$kind = in_array( $node['type'], array( 'section', 'container', 'block', 'div', 'template' ), true ) && ! lieve_listing_enabled( $node ) ? 'container' : 'opaque';
		// Slots, nested widgets, listings and authored HTML remain opaque. Simple
		// Tabs retain the real items renderer's literal labels, including references.
		// The client verifies the exact source rows; label text grants no authority.
		if ( 'tabs' === $node['type'] ) { $kind = 'tabs'; }
		$frame = (object) array( 'kind' => $kind, 'node' => $node, 'source' => $source, 'index' => 0, 'children' => array(), 'expected' =>
			'template' === $node['type'] ? ( $node['_lieveTemplateDocument']['children'] ?? array() ) : ( $node['children'] ?? array() ) );
		if ( $parent ) { $parent->children[] = $frame; } else { $this->root = $frame; }
		$this->stack[] = $frame; $level = ob_get_level();
		try { ob_start(); $render(); $html = ob_get_clean(); }
		finally { while ( ob_get_level() > $level ) { ob_end_clean(); } array_pop( $this->stack ); }
		$frame->html = $html;
		if ( 'opaque' !== $kind ) { $frame->shell = $this->shell( $html, $node ); if ( 'container' === $kind ) { $frame->html = ''; } }
		$this->bytes += 'container' !== $kind ? strlen( $html ) : 0;
		if ( ++$this->nodes > 2000 || $this->bytes > 524288 || 'container' === $kind && $frame->index !== count( $frame->expected ) ) { $this->valid = false; }
		echo $html;
	}

	private function data( $frame ) {
		$node = $frame->node; $source = $frame->source; if ( $source ) { $source['node'] = $node['_lieveComponentOriginalId'] ?? $node['id']; }
		$data = array( 'kind' => $frame->kind, 'id' => $node['id'], 'type' => $node['type'], 'source' => $source );
		if ( 'opaque' === $frame->kind ) { $data['html'] = $frame->html; return $data; }
		$data['shell'] = $frame->shell;
		if ( 'tabs' === $frame->kind ) { $data['items'] = $node['props']['items'] ?? ''; $data['html'] = $frame->html; $data['label'] = $node['props']['label'] ?? ''; $data['presentationId'] = 'lieve-' . lieve_element_number( $node['id'] ); }
		else { $data['children'] = array_map( array( $this, 'data' ), $frame->children ); }
		return $data;
	}

	private function shell( $html, $node ) {
		$p = new WP_HTML_Tag_Processor( $html ); $shell = array();
		while ( $p->next_tag() ) {
			if ( in_array( $p->get_tag(), array( 'STYLE', 'SCRIPT', 'LINK' ), true ) ) { continue; }
			$shell['tag'] = strtolower( $p->get_tag() );
			$keys = array( 'id', 'class', 'style', 'data-lieve-id', 'data-lieve-node', 'data-lieve-scope', 'data-lieve-tabs', 'role', 'aria-label' );
			foreach ( array_keys( $node['props']['attributes'] ?? array() ) as $key ) { if ( preg_match( '/^(?:title|lang|dir|itemprop|itemscope|itemtype|aria-[a-z0-9_-]+|data-(?!editor|lieve)[a-z0-9_-]+)$/iD', $key ) ) { $keys[] = $key; } }
			foreach ( array_unique( $keys ) as $key ) { $value = $p->get_attribute( $key ); if ( is_string( $value ) || true === $value ) { $shell[$key] = true === $value ? '' : $value; } }
			break;
		}
		return $shell;
	}

	public function forbidden() { return $this->forbidden; }

	public function result() {
		foreach ( $this->dependencies as $id => $dependency ) { if ( ! hash_equals( $dependency['revision'], lieve_template_revision( $id ) ) ) { $this->valid = false; } }
		if ( ! $this->valid || ! $this->root || $this->stack || $this->bytes > 524288 ) { return null; }
		return array( 'version' => 1, 'owner' => $this->owner['id'], 'type' => $this->owner['type'], 'definition' => (int) $this->owner['props'][ 'component' === $this->owner['type'] ? 'componentId' : 'templateId' ], 'dependencies' => array_values( $this->dependencies ), 'tree' => $this->data( $this->root ) );
	}
}

function lieve_editor_expanded_preview( $node, $post ) {
	$previous = $GLOBALS['lieve_editor_expanded_controls'] ?? null;
	$collector = new Lieve_Editor_Expanded_Controls( $node ); $GLOBALS['lieve_editor_expanded_controls'] = $collector;
	try { $html = lieve_render_editor_preview( $node, $post ); $projection = $collector->result(); if ( $collector->forbidden() ) { return new WP_Error( 'lieve_expanded_forbidden', 'This reusable definition is unavailable to the current user.', array( 'status' => 403 ) ); } return array( 'html' => $html, 'expandedControls' => $projection ); }
	finally { if ( null === $previous ) { unset( $GLOBALS['lieve_editor_expanded_controls'] ); } else { $GLOBALS['lieve_editor_expanded_controls'] = $previous; } }
}

/** Match the client cache input: styles compile separately, HTML wrapper choice does not. */
function lieve_editor_preview_node( $node, $listing = false ) {
	$listing = $listing || function_exists( 'lieve_listing_enabled' ) && lieve_listing_enabled( $node );
	if ( 'html' === ( $node['type'] ?? '' ) ) { $node['props']['wrapHtml'] = lieve_html_has_wrapper( $node['props'] ?? array() ); }
	if ( ! $listing ) { unset( $node['props']['styles'] ); }
	$node['children'] = array_map( static function( $child ) use ( $listing ) { return lieve_editor_preview_node( $child, $listing ); }, $node['children'] ?? array() );
	return $node;
}

/** The caller supplies a sanitized node. PHP runs only for an explicit code-administrator preview. */
function lieve_render_editor_preview( $node, $post, $execute_custom_code = false ) {
	// Setting only $post is insufficient: PHP loops call wp_reset_postdata(),
	// which restores the main query's post. Use the same complete, isolated
	// page context as inherited templates so that reset targets this document.
	return lieve_with_editor_page_context( $post, static function() use ( $node, $post, $execute_custom_code ) {
		$previous_source = $GLOBALS['lieve_document_source_id'] ?? null;
		$previous_code = $GLOBALS['lieve_custom_code_preview'] ?? null;
		$previous_runtime = $GLOBALS['lieve_runtime_document'] ?? null;
		$level = ob_get_level();
		$GLOBALS['lieve_document_source_id'] = (int) $post->ID;
		$GLOBALS['lieve_runtime_document'] = array('children'=>array($node));
		$GLOBALS['lieve_custom_code_preview'] = true === $execute_custom_code && function_exists( 'lieve_can_author_custom_code' ) && lieve_can_author_custom_code() && current_user_can( 'edit_post', $post->ID );
		try {
			ob_start(); lieve_render_document( array( 'children' => array( $node ) ) ); return ob_get_clean();
		} finally {
			while ( ob_get_level() > $level ) { ob_end_clean(); }
			if ( null === $previous_source ) { unset( $GLOBALS['lieve_document_source_id'] ); } else { $GLOBALS['lieve_document_source_id'] = $previous_source; }
			if ( null === $previous_code ) { unset( $GLOBALS['lieve_custom_code_preview'] ); } else { $GLOBALS['lieve_custom_code_preview'] = $previous_code; }
			if ( null === $previous_runtime ) { unset($GLOBALS['lieve_runtime_document']); } else { $GLOBALS['lieve_runtime_document']=$previous_runtime; }
		}
	} );
}

function lieve_editor_preview_has_php( $node ) {
	if ( 'component' === ($node['type']??'') && function_exists('lieve_component_expand') ) { $node=lieve_component_expand($node);if(!$node)return false; }
	if ( 'html' === ( $node['type'] ?? '' ) && false !== strpos( $node['props']['content'] ?? '', '<?' ) ) { return true; }
	foreach ( $node['children'] ?? array() as $child ) { if ( lieve_editor_preview_has_php( $child ) ) { return true; } }
	return false;
}

/** Preload the same server-rendered branches the canvas would otherwise request after paint. */
function lieve_editor_initial_previews( $post_id, $document ) {
	$post = get_post( $post_id );
	if ( ! $post || ! current_user_can( 'edit_post', $post_id ) || ! lieve_builder_supports_post_type( $post->post_type ) ) { return array(); }
	$native = array( 'section', 'container', 'heading', 'button', 'image', 'spacer', 'block', 'div', 'slot' );
	$previews = array(); $bytes = 0; $started = microtime( true ); $finished = false;
	$walk = function( $nodes ) use ( &$walk, &$previews, &$bytes, &$finished, $started, $post, $native ) {
		foreach ( $nodes as $node ) {
			if ( $finished || count( $previews ) >= 200 || microtime( true ) - $started > .075 ) { return; }
			$image_preview = 'image' === ( $node['type'] ?? '' ) && ( ! empty( $node['props']['attachmentId'] ) || ! empty( $node['props']['caption'] ) || ! empty( $node['props']['imageLink'] ) || ! empty( $node['props']['imageSizes'] ) || ! empty( $node['props']['imageDecoding'] ) );
			if ( ! $image_preview && in_array( $node['type'] ?? '', $native, true ) && ! ( function_exists( 'lieve_listing_enabled' ) && lieve_listing_enabled( $node ) ) ) { $walk( $node['children'] ?? array() ); continue; }
			// Do not execute PHP in the admin HTML request or seed an inert PHP result
			// that would suppress the explicit, authorized live-preview request.
			if ( lieve_editor_preview_has_php( $node ) && function_exists( 'lieve_can_author_custom_code' ) && lieve_can_author_custom_code() && lieve_theme_setting( 'execute_php' ) ) { continue; }
			$count = 0; $clean = lieve_sanitize_node( lieve_editor_preview_node( $node ), 0, $count );
			if ( ! $clean ) { continue; }
			try { $html = lieve_render_editor_preview( $clean, $post ); }
			catch ( Throwable $error ) { continue; } // The regular preview request remains the recovery path.
			if ( $bytes + strlen( $html ) > 524288 ) { $finished = true; return; }
			$previews[ $clean['id'] ] = $html; $bytes += strlen( $html );
		}
	};
	$walk( $document['children'] ?? array() );
	return $previews;
}
