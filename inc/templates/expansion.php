<?php
/** Request-local template models and one bounded, context-free expansion plan per document operation. */
defined( 'ABSPATH' ) || exit;

function lieve_template_expansion_limits() {
	// Storage: 400 nodes / 4 MB / 13 local levels. Existing template/component reference depths: 4 / 8.
	return array( 'nodes' => 400 * 5, 'work' => 400 * 5 * 2, 'references' => 400 * 4, 'templateDepth' => 4, 'referenceDepth' => 8, 'bytes' => 4000000 * 5 );
}

function lieve_template_expansion_reset() {
	unset( $GLOBALS['lieve_template_model_cache'], $GLOBALS['lieve_template_expansion_metrics'], $GLOBALS['lieve_template_expansion_diagnostics'] );
}

/** Cache source models, never resolved dynamic values or HTML. Raw metadata identity prevents stale reads after a save. */
function lieve_template_model_document( $id, &$state ) {
	if ( isset( $state['models'][ $id ] ) ) { return $state['models'][ $id ]; }
	$raw = function_exists( 'get_post_meta' ) && defined( 'LIEVE_META_DOCUMENT' ) ? get_post_meta( $id, LIEVE_META_DOCUMENT, true ) : null;
	$cache_key = $id . ':' . ( function_exists( 'get_current_user_id' ) ? get_current_user_id() : 0 ) . ':' . (int) ! empty( $GLOBALS['lieve_element_preview'] );
	$cache = &$GLOBALS['lieve_template_model_cache'];
	if ( ! is_array( $cache ) ) { $cache = array( 'entries' => array(), 'bytes' => 0 ); }
	if ( null !== $raw && isset( $cache['entries'][ $cache_key ] ) && $cache['entries'][ $cache_key ]['raw'] === $raw ) {
		$document = $cache['entries'][ $cache_key ]['document'];
		$bytes = $cache['entries'][ $cache_key ]['bytes'];
	} else {
		$raw_bytes = null === $raw ? 0 : ( is_string( $raw ) ? strlen( $raw ) : strlen( json_encode( $raw ) ?: '' ) );
		if ( $raw_bytes > 4000000 || $state['modelBytes'] + $raw_bytes > $state['limits']['bytes'] ) { $state['failed'] = true; lieve_template_expansion_issue( $state, 'bytes' ); return array( 'children' => array() ); }
		$document = lieve_get_document( $id ); ++$state['loads'];
		$bytes = $raw_bytes + strlen( json_encode( $document ) ?: '' );
		$limit = lieve_template_expansion_limits();
		// Bound the request cache too; a new independent operation may safely reload an evicted model.
		if ( $cache['bytes'] + $bytes > $limit['bytes'] || count( $cache['entries'] ) >= $limit['references'] ) { $cache = array( 'entries' => array(), 'bytes' => 0 ); }
		if ( isset( $cache['entries'][ $cache_key ] ) ) { $cache['bytes'] -= $cache['entries'][ $cache_key ]['bytes']; }
		if ( null !== $raw && $bytes <= $limit['bytes'] ) { $cache['entries'][ $cache_key ] = compact( 'raw', 'document', 'bytes' ); $cache['bytes'] += $bytes; }
	}
	$state['modelBytes'] += $bytes;
	if ( $state['modelBytes'] > $state['limits']['bytes'] ) { $state['failed'] = true; lieve_template_expansion_issue( $state, 'bytes' ); return array( 'children' => array() ); }
	$state['models'][ $id ] = $document;
	return $document;
}

function lieve_template_expansion_issue( &$state, $code ) {
	$state['issues'][ $code ] = true;
}

/** Component expansion participates in the same edge/work budget, without changing its identity/slot logic. */
function lieve_template_expansion_reference( &$state ) {
	if ( ++$state['references'] > $state['limits']['references'] ) { $state['failed'] = true; lieve_template_expansion_issue( $state, 'references' ); return false; }
	return true;
}

/** No HTML/user data is memoized. Prepared documents are passed down, not expanded again by each scanner. */
function lieve_prepare_template_document( $document, $seen = array(), $depth = 0 ) {
	if ( ! empty( $document['_lieveTemplatePrepared'] ) ) { return $document; }
	$limits = lieve_template_expansion_limits();
	$state = array( 'limits' => $limits, 'remaining' => $limits['work'], 'nodes' => 0, 'references' => 0, 'loads' => 0, 'bytes' => 0, 'modelBytes' => 0, 'models' => array(), 'issues' => array(), 'failed' => false );
	$owner = (int) ( $document['sourcePostId'] ?? 0 );
	$owner_post = $owner && function_exists( 'get_post' ) ? get_post( $owner ) : null;
	if ( $owner_post && defined( 'LIEVE_TEMPLATE_POST_TYPE' ) && LIEVE_TEMPLATE_POST_TYPE === $owner_post->post_type && ! in_array( $owner, $seen, true ) ) { $seen[] = $owner; }
	$state['ownerDepth'] = $owner && in_array( $owner, $seen, true ) ? 1 : 0;
	$walk = static function( $nodes, $path, $template_depth, $local_depth = 0 ) use ( &$walk, &$state ) {
		$out = array();
		foreach ( $nodes as $node ) {
			if ( $state['failed'] ) { break; }
			if ( --$state['remaining'] < 0 || $local_depth > 13 * ( $state['limits']['referenceDepth'] + 1 ) ) { $state['failed'] = true; lieve_template_expansion_issue( $state, 'work' ); break; }
			if ( 'component' === ( $node['type'] ?? '' ) && function_exists( 'lieve_component_expand' ) ) {
				$id = absint( $node['props']['componentId'] ?? 0 );
				$node = lieve_component_expand( $node, $path, $state['remaining'], $state );
				if ( $state['remaining'] < 0 ) { $state['failed'] = true; lieve_template_expansion_issue( $state, 'work' ); }
				if ( ! $node || $state['failed'] ) { break; }
				if ( $id && ! in_array( $id, $path, true ) ) { $component_path = array_merge( $path, array( $id ) ); } else { $component_path = $path; }
			} else { $component_path = $path; }
			$origin = (int) ( $node['_lieveComponentPostId'] ?? 0 );
			if ( $origin && ! in_array( $origin, $component_path, true ) ) { $component_path[] = $origin; }
			if ( ++$state['nodes'] > $state['limits']['nodes'] ) { $state['failed'] = true; lieve_template_expansion_issue( $state, 'nodes' ); break; }
			$state['bytes'] += strlen( json_encode( array( $node['id'] ?? '', $node['type'] ?? '', $node['props'] ?? array() ) ) ?: '' );
			if ( $state['bytes'] > $state['limits']['bytes'] ) { $state['failed'] = true; lieve_template_expansion_issue( $state, 'bytes' ); break; }
			$node['children'] = $walk( $node['children'] ?? array(), $component_path, $template_depth, $local_depth + 1 );
			if ( 'template' === ( $node['type'] ?? '' ) ) {
				unset( $node['_lieveTemplateIssue'] );
				$id = absint( $node['props']['templateId'] ?? 0 );
				$nested = array( 'children' => array(), '_lieveTemplatePrepared' => true );
				if ( ! lieve_template_expansion_reference( $state ) ) { break; }
				$post = $id ? get_post( $id ) : null;
				if ( in_array( $id, $component_path, true ) ) { $node['_lieveTemplateIssue'] = 'cycle'; }
				elseif ( $template_depth >= $state['limits']['templateDepth'] || count( $component_path ) >= $state['limits']['referenceDepth'] + $state['ownerDepth'] ) { $node['_lieveTemplateIssue'] = 'depth'; }
				elseif ( ! $post || LIEVE_TEMPLATE_POST_TYPE !== $post->post_type || 'publish' !== $post->post_status || ! empty( $post->post_password ) ) { $node['_lieveTemplateIssue'] = 'unavailable'; }
				else {
					$nested = lieve_template_model_document( $id, $state );
					$nested['children'] = $walk( $nested['children'] ?? array(), array_merge( $component_path, array( $id ) ), $template_depth + 1, $local_depth + 1 );
					$nested['_lieveTemplatePrepared'] = true;
				}
				if ( isset( $node['_lieveTemplateIssue'] ) ) { lieve_template_expansion_issue( $state, $node['_lieveTemplateIssue'] ); }
				$node['_lieveTemplateDocument'] = $nested;
			}
			$node['_lieveTemplateNodePrepared'] = true;
			$out[] = $node;
		}
		return $out;
	};
	try { $children = $walk( $document['children'] ?? array(), $seen, $depth ); }
	finally { $walk = null; } // Break the recursive closure cycle; do not retain a completed operation's models until GC.
	$document['children'] = $state['failed'] ? array() : $children;
	$document['_lieveTemplatePrepared'] = true;
	$document['_lieveTemplateIssues'] = array_keys( $state['issues'] );
	$document['_lieveTemplateFailed'] = $state['failed'];
	$metrics = array( 'nodes' => $state['nodes'], 'work' => $state['limits']['work'] - $state['remaining'], 'references' => $state['references'], 'loads' => $state['loads'], 'bytes' => $state['bytes'], 'modelBytes' => $state['modelBytes'], 'failed' => $state['failed'] );
	$document['_lieveTemplateMetrics'] = $metrics;
	$GLOBALS['lieve_template_expansion_metrics'] = $metrics;
	if ( $state['issues'] ) {
		if ( count( $GLOBALS['lieve_template_expansion_diagnostics'] ?? array() ) >= 128 ) { $GLOBALS['lieve_template_expansion_diagnostics'] = array(); }
		$key = hash( 'sha256', $owner . ':' . implode( ',', array_keys( $state['issues'] ) ) );
		$GLOBALS['lieve_template_expansion_diagnostics'][ $key ] = array( 'source' => $owner, 'issues' => array_keys( $state['issues'] ), 'metrics' => $metrics );
		if ( function_exists( 'do_action' ) ) { do_action( 'lieve_template_expansion_error', $owner, array_keys( $state['issues'] ), $metrics ); }
	}
	return $document;
}

/** Shared traversal contract. A visitor may skip a subtree (e.g. listing CSS resolved per result). */
function lieve_visit_template_document( $document, $visit ) {
	$walk = static function( $nodes ) use ( &$walk, $visit ) { foreach ( $nodes as $node ) {
		if ( false === $visit( $node ) ) { continue; }
		$walk( $node['children'] ?? array() );
		$walk( $node['_lieveTemplateDocument']['children'] ?? array() );
	} };
	try { $walk( $document['children'] ?? array() ); }
	finally { $walk = null; }
}

function lieve_template_expansion_fallback( $reason = 'budget' ) {
	echo '<!-- Lieve: reusable content unavailable. -->';
	if ( function_exists( 'current_user_can' ) && current_user_can( 'edit_posts' ) ) {
		$messages = array(
			'unavailable' => 'This reusable item is unavailable or not public. Choose an available template/component; saved documents are unchanged.',
			'cycle' => 'Circular reusable content was skipped. Remove its circular reference; saved documents are unchanged.',
			'depth' => 'Reusable content exceeds the supported nesting depth. Reduce nested references; saved documents are unchanged.',
		);
		echo '<p class="lieve-editor-preview-message" data-editor-ui>' . esc_html( $messages[ $reason ] ?? 'Reusable content could not be displayed safely. Simplify nested/repeated templates or components; saved documents are unchanged.' ) . '</p>';
	}
}

/** Validate prospective references, not just the currently stored owner. Never writes or replaces a document. */
function lieve_validate_template_expansion( $document, $owner = 0 ) {
	// A client may submit unknown keys. Runtime plan/provenance flags are never authority at the write boundary.
	$count = 0; $invalid = false;
	$stored_nodes = static function( $nodes, $depth = 0 ) use ( &$stored_nodes, &$count, &$invalid ) {
		$out = array(); foreach ( $nodes as $node ) {
			if ( ++$count > 400 || $depth > 12 || ! is_array( $node ) ) { $invalid = true; break; }
			$clean = array_intersect_key( $node, array_flip( array( 'id', 'type', 'props', 'children' ) ) );
			$clean['children'] = $stored_nodes( $node['children'] ?? array(), $depth + 1 ); $out[] = $clean;
		} return $out;
	};
	$document = array( 'children' => $stored_nodes( $document['children'] ?? array() ), 'sourcePostId' => (int) $owner );
	$stored_nodes = null;
	if ( $invalid ) { return new WP_Error( 'lieve_template_expansion_limit', 'The document exceeds its storage structure limits. Your draft and stored documents are unchanged.', array( 'status' => 400 ) ); }
	$plan = lieve_prepare_template_document( $document );
	if ( ! empty( $plan['_lieveTemplateFailed'] ) || array_intersect( $plan['_lieveTemplateIssues'], array( 'cycle', 'depth' ) ) ) {
		return new WP_Error( 'lieve_template_expansion_limit', 'The reusable template/component graph is circular, too deeply nested or exceeds the expansion budget (2,000 nodes / 1,600 references). Simplify its references before saving. Your draft and stored documents are unchanged.', array( 'status' => 400 ) );
	}
	return true;
}
