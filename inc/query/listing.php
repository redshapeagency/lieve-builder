<?php
/** Query-backed layout containers. Result instances never enter the saved document. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
require_once __DIR__ . '/listing-instance-context.php';

function lieve_listing_supports( $type ) { return in_array( $type, array( 'section', 'container', 'block', 'div', 'slot' ), true ); }
function lieve_listing_enabled( $node ) { return lieve_listing_supports( $node['type'] ?? '' ) && true === ( $node['props']['listing']['enabled'] ?? false ); }
function lieve_listing_request_bound( $listing ) {
	if ( ! is_array( $listing ) || true !== ( $listing['enabled'] ?? false ) || ! function_exists( 'lieve_query_find' ) ) { return false; }
	if ( in_array( $listing['pagination'] ?? '', array( 'links', 'load-more' ), true ) ) { return true; }
	$query = lieve_query_find( is_string( $listing['query'] ?? null ) ? $listing['query'] : '' );
	return ! $query || 'current' === $query['type'] || (bool) preg_match( '/\{(?:current_user_id|search)\}/', wp_json_encode( $query ) );
}

function lieve_sanitize_listing( $input ) {
	if ( ! is_array( $input ) ) { return array(); }
	$out = array( 'enabled' => true === ( $input['enabled'] ?? false ), 'query' => '', 'mode' => 'slider' === ( $input['mode'] ?? '' ) ? 'slider' : 'grid', 'label' => sanitize_text_field( substr( (string) ( is_scalar( $input['label'] ?? '' ) ? $input['label'] ?? '' : '' ), 0, 160 ) ), 'emptyText' => sanitize_text_field( substr( (string) ( is_scalar( $input['emptyText'] ?? '' ) ? $input['emptyText'] ?? '' : '' ), 0, 300 ) ), 'hideEmpty' => true === ( $input['hideEmpty'] ?? false ), 'arrows' => false !== ( $input['arrows'] ?? true ), 'dots' => true === ( $input['dots'] ?? false ), 'autoplay' => true === ( $input['autoplay'] ?? false ), 'interval' => 5000, 'layout' => array() );
	if ( is_string( $input['query'] ?? null ) && preg_match( '/^[a-zA-Z0-9_-]{1,80}$/D', $input['query'] ) ) { $out['query'] = $input['query']; }
	if ( is_numeric( $input['interval'] ?? null ) ) { $out['interval'] = min( 60000, max( 2000, (int) $input['interval'] ) ); }
	$out['advance'] = 'page' === ( $input['advance'] ?? '' ) ? 'page' : 'item';
	$out['pagination'] = in_array( $input['pagination'] ?? '', array( 'links', 'load-more' ), true ) && 'grid' === $out['mode'] ? $input['pagination'] : 'none';
	$out['rewind'] = true === ( $input['rewind'] ?? false );
	$out['drag'] = false !== ( $input['drag'] ?? true );
	$out['scrollbar'] = true === ( $input['scrollbar'] ?? false );
	$out['motion'] = 'instant' === ( $input['motion'] ?? '' ) ? 'instant' : 'smooth';
	$layouts = is_array( $input['layout'] ?? null ) ? $input['layout'] : array();
	foreach ( array_slice( $layouts, 0, 100, true ) as $device => $values ) {
		$valid = function_exists( 'lieve_valid_breakpoint_id' ) ? lieve_valid_breakpoint_id( $device ) : in_array( $device, array( 'desktop', 'tablet', 'mobile' ), true );
		if ( ! $valid || ! is_array( $values ) ) { continue; } $clean = array();
		foreach ( array( 'columns', 'columnGap', 'rowGap', 'padding', 'align', 'equalHeight', 'controlsAlign', 'controlsGap', 'controlsOffset', 'arrowSize', 'dotSize', 'dotGap' ) as $key ) {
			$value = $values[ $key ] ?? null;
			if ( 'columns' === $key && is_numeric( $value ) ) { $clean[ $key ] = min( 12, max( 1, (int) $value ) ); }
			elseif ( in_array( $key, array( 'columnGap', 'rowGap', 'padding', 'controlsGap', 'controlsOffset', 'arrowSize', 'dotSize', 'dotGap' ), true ) && is_string( $value ) && strlen( $value ) <= 1200 ) { $safe = lieve_style_value( 'padding-top', $value ); if ( '' !== $safe ) { $clean[ $key ] = $safe; } }
			elseif ( 'align' === $key && in_array( $value, array( 'start', 'center', 'end', 'stretch' ), true ) ) { $clean[ $key ] = $value; }
			elseif ( 'controlsAlign' === $key && in_array( $value, array( 'start', 'center', 'end', 'space-between' ), true ) ) { $clean[ $key ] = $value; }
			elseif ( 'equalHeight' === $key && is_bool( $value ) ) { $clean[ $key ] = $value; }
		}
		if ( $clean ) { $out['layout'][ $device ] = $clean; }
	}
	return $out;
}

/** Layout belongs to the listing track/items; ordinary element styling stays opt-in. */
function lieve_listing_css( $node, $editor_device = '' ) {
	if ( ! lieve_listing_enabled( $node ) ) { return ''; }
	$listing = lieve_sanitize_listing( $node['props']['listing'] ); $root = '[data-lieve-listing="' . $node['id'] . '"]'; $css = '';
	$points = lieve_style_breakpoints(); $base = $points[0];
	foreach ( $points as $point ) {
		if ( $editor_device && ! in_array( $point['id'], lieve_style_devices( $editor_device ), true ) ) { continue; }
		$values = $listing['layout'][ $point['id'] ] ?? array();
		if ( $point['base'] ) { $values = array_replace( array( 'columns' => 3, 'columnGap' => '24px', 'rowGap' => '24px', 'padding' => '0px', 'align' => 'stretch', 'equalHeight' => true, 'controlsAlign' => 'center', 'controlsGap' => '8px', 'controlsOffset' => '12px', 'arrowSize' => '20px', 'dotSize' => '6px', 'dotGap' => '2px' ), $values ); }
		$rules = '';
		foreach ( $values as $key => $value ) {
			$map = array( 'columns' => 'columns', 'columnGap' => 'gap-x', 'rowGap' => 'gap-y', 'padding' => 'padding', 'align' => 'align', 'equalHeight' => 'height', 'controlsAlign' => 'controls-align', 'controlsGap' => 'controls-gap', 'controlsOffset' => 'controls-offset', 'arrowSize' => 'arrow-size', 'dotSize' => 'dot-size', 'dotGap' => 'dot-gap' );
			if ( 'equalHeight' === $key ) { $rules .= '--lieve-listing-item-align:' . ( $value ? 'auto' : 'start' ) . ';'; $value = $value ? '1fr' : 'auto'; }
			elseif ( in_array( $key, array( 'columnGap', 'rowGap', 'padding', 'controlsGap', 'controlsOffset', 'arrowSize', 'dotSize', 'dotGap' ), true ) ) { $value = lieve_dimension_variable_value( 'padding-top', $value ); }
			$rules .= '--lieve-listing-' . $map[ $key ] . ':' . $value . ';';
		}
		if ( ! $rules ) { continue; } $rule = $root . '{' . $rules . '}';
		$media = $point['base'] || $editor_device ? '' : ( $point['width'] > $base['width'] ? 'min-width:' : 'max-width:' ) . $point['width'] . 'px';
		$css .= $media ? '@media(' . $media . '){' . $rule . '}' : $rule;
	}
	return $css;
}

/** Safe, source-neutral fields; current-user/session fields keep their existing meaning. */
function lieve_listing_dynamic_sources( $sources ) {
	foreach ( array( 'id' => array( 'Item ID', 'number' ), 'title' => array( 'Item title / name', 'text' ), 'url' => array( 'Item URL', 'url' ), 'content' => array( 'Item excerpt / description', 'text' ), 'image' => array( 'Item image', 'image' ), 'index' => array( 'Item position (1-based)', 'number' ), 'count' => array( 'Items in this result page', 'number' ), 'total' => array( 'Total matching items', 'number' ), 'meta' => array( 'Item custom field', 'text' ) ) as $field => $definition ) {
		$sources[ 'listing.' . $field ] = array( 'label' => $definition[0], 'group' => 'Listing', 'type' => $definition[1], 'hint' => 'Resolved separately for every listing result.', 'resolve' => static function( $context ) use ( $field ) { return lieve_listing_dynamic_value( $field, $context['options'] ?? array() ); } );
		if ( 'meta' === $field ) { $sources[ 'listing.meta' ]['parameters'] = array( 'key' => lieve_dynamic_parameter( 'Field key', 'e.g. price or subtitle', true ) ); $sources[ 'listing.meta' ]['flexible'] = true; }
	}
	return $sources;
}
add_filter( 'lieve_dynamic_data_sources', 'lieve_listing_dynamic_sources' );

function lieve_listing_dynamic_value( $field, $options = array() ) {
	$context = $GLOBALS['lieve_listing_context'] ?? null; if ( ! $context ) { return ''; }
	$item = $context['item']; $type = $context['type'];
	if ( in_array( $field, array( 'index', 'count', 'total' ), true ) ) { return $context[ $field ] ?? ''; }
	$id = in_array( $type, array( 'posts', 'current', 'users' ), true ) ? $item->ID : ( 'terms' === $type ? $item->term_id : $item->comment_ID );
	if ( 'id' === $field ) { return $id; }
	if ( 'meta' === $field ) { return lieve_dynamic_public_meta_value( in_array( $type, array( 'posts', 'current' ), true ) ? 'post' : ( array( 'terms' => 'term', 'users' => 'user', 'comments' => 'comment' )[ $type ] ?? 'post' ), $id, $options['key'] ?? '' ); }
	if ( in_array( $type, array( 'posts', 'current' ), true ) ) { switch ( $field ) { case 'title': return get_the_title( $item ); case 'url': return get_permalink( $item ); case 'content': return wp_strip_all_tags( get_the_excerpt( $item ) ); case 'image': return get_the_post_thumbnail_url( $id, 'full' ) ?: ''; } return ''; }
	if ( 'terms' === $type ) { if ( 'url' === $field ) { $url = get_term_link( $item ); return is_wp_error( $url ) ? '' : $url; } return array( 'title' => $item->name, 'content' => wp_strip_all_tags( $item->description ) )[ $field ] ?? ''; }
	if ( 'users' === $type ) { switch ( $field ) { case 'title': return $item->display_name; case 'content': return wp_strip_all_tags( get_the_author_meta( 'description', $id ) ); case 'url': return get_author_posts_url( $id ); case 'image': return get_avatar_url( $id ); } return ''; }
	switch ( $field ) { case 'title': return $item->comment_author; case 'content': return wp_strip_all_tags( $item->comment_content ); case 'url': return get_comment_link( $item ); case 'image': return get_avatar_url( $item ); } return '';
}

/** Clone only for rendering: public IDs and internal targets are unique in every item. */
function lieve_listing_instances( $nodes, $scope, &$aliases ) {
	$out = array();
	foreach ( $nodes as $node ) {
		$original = $node; $suffix = '--li-' . substr( hash( 'sha256', $scope . ':' . $node['id'] ), 0, 16 );
		// Authored code is approved before runtime ID/reference remapping, never after it.
		if ( 'html' === $node['type'] ) { $node['_lieveCustomCodeSource'] = $original['_lieveCustomCodeSource'] ?? array( 'id' => $original['_lieveListingSourceId'] ?? $original['id'], 'props' => $original['props'] ); }
		$node['id'] = 'lvi-' . substr( hash( 'sha256', $scope . ':' . $node['id'] ), 0, 24 );
		$node['props']['htmlId'] = substr( lieve_element_html_id( $original ), 0, 100 ) . $suffix;
		$node['props']['dataLieveId'] = substr( lieve_element_data_id( $original ), 0, 100 ) . $suffix;
		$node['_lieveListingSourceId'] = $original['_lieveListingSourceId'] ?? $original['id'];
		$node['_lieveListingScopes'] = array_merge( $original['_lieveListingScopes'] ?? array(), array( $scope ) );
		$node['_lieveListingAliases'] = $original['_lieveListingAliases'] ?? array( $original['id'], lieve_element_html_id( $original ), lieve_element_data_id( $original ), 'lieve-' . $original['id'], 'lieve-' . lieve_element_number( $original['id'] ), 'lieve-data-' . lieve_element_number( $original['id'] ) );
		if ( 'html' === $node['type'] && class_exists( 'WP_HTML_Tag_Processor' ) ) {
			$processor = new WP_HTML_Tag_Processor( $node['props']['content'] ?? '' ); $raw_aliases = array();
			while ( $processor->next_tag() ) { $raw_id = $processor->get_attribute( 'id' ); if ( is_string( $raw_id ) && '' !== $raw_id ) { $raw_aliases[ $raw_id ] = substr( $raw_id, 0, 100 ) . $suffix; } }
			$node['_lieveListingRawAliases'] = $raw_aliases; $aliases += $raw_aliases;
		}
		// An editor-only root keeps arbitrary HTML fragments selectable in every item.
		if ( ! empty( $GLOBALS['lieve_element_preview'] ) && 'html' === $node['type'] ) { $node['props']['wrapHtml'] = true; }
		$target = lieve_element_output_enabled( $node['props'], 'outputHtmlId' ) || ! empty( $GLOBALS['lieve_element_preview'] ) ? $node['props']['htmlId'] : ( lieve_element_output_enabled( $node['props'], 'outputLieveId' ) ? $node['props']['dataLieveId'] : $node['id'] );
		foreach ( array_merge( $node['_lieveListingAliases'], array( $original['id'], lieve_element_html_id( $original ), lieve_element_data_id( $original ) ) ) as $alias ) { $aliases[ $alias ] = $target; }
		$node['children'] = lieve_listing_instances( $node['children'] ?? array(), $scope, $aliases ); $out[] = $node;
	}
	return $out;
}

/** Static internal links/labels follow the same per-result targets as interactions. */
function lieve_listing_remap_references( $nodes, $aliases ) {
	foreach ( $nodes as &$node ) {
		if ( 'html' === $node['type'] && class_exists( 'WP_HTML_Tag_Processor' ) ) {
			$map = ( $node['_lieveListingRawAliases'] ?? array() ) + $aliases; $processor = new WP_HTML_Tag_Processor( $node['props']['content'] ?? '' );
			while ( $processor->next_tag() ) {
				$id = $processor->get_attribute( 'id' ); if ( is_string( $id ) && isset( $map[ $id ] ) ) { $processor->set_attribute( 'id', $map[ $id ] ); }
				$href = $processor->get_attribute( 'href' ); if ( is_string( $href ) && '#' === substr( $href, 0, 1 ) && isset( $map[ substr( $href, 1 ) ] ) ) { $processor->set_attribute( 'href', '#' . $map[ substr( $href, 1 ) ] ); }
				foreach ( array( 'for', 'aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-owns', 'headers' ) as $key ) { $value = $processor->get_attribute( $key ); if ( is_string( $value ) ) { $processor->set_attribute( $key, implode( ' ', array_map( static function( $part ) use ( $map ) { return $map[ $part ] ?? $part; }, explode( ' ', $value ) ) ) ); } }
			}
			$node['props']['content'] = $processor->get_updated_html();
		}
		if ( isset( $node['props']['url'] ) && is_string( $node['props']['url'] ) && '#' === substr( $node['props']['url'], 0, 1 ) ) { $id = substr( $node['props']['url'], 1 ); if ( isset( $aliases[ $id ] ) ) { $node['props']['url'] = '#' . $aliases[ $id ]; } }
		foreach ( $node['props']['attributes'] ?? array() as $key => $value ) {
			if ( in_array( $key, array( 'for', 'aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-owns', 'headers' ), true ) && is_string( $value ) ) { $node['props']['attributes'][ $key ] = implode( ' ', array_map( static function( $id ) use ( $aliases ) { return $aliases[ $id ] ?? $id; }, explode( ' ', $value ) ) ); }
		}
		$node['children'] = lieve_listing_remap_references( $node['children'] ?? array(), $aliases );
	} unset( $node );
	return $nodes;
}

/** One request-wide render budget also bounds nested listings. */
function lieve_render_listing( $node, $attributes ) {
	$listing = lieve_sanitize_listing( $node['props']['listing'] ); $preview = ! empty( $GLOBALS['lieve_element_preview'] );
	if ( ! $preview && lieve_listing_request_bound( $listing ) && function_exists( 'lieve_dynamic_mark_request_bound' ) ) { lieve_dynamic_mark_request_bound( null, true ); }
	$depth = $GLOBALS['lieve_listing_depth'] ?? 0; $top = 0 === $depth;
	if ( $top ) { $GLOBALS['lieve_listing_remaining'] = 3000; }
	$tag = 'section' === $node['type'] ? 'section' : 'div'; $root = $node['id'];
	$page_key = 'lieve_lp_' . substr( hash( 'sha256', ( $GLOBALS['lieve_document_source_id'] ?? 0 ) . ':' . $root ), 0, 12 );
	$page = ! $preview && 'none' !== $listing['pagination'] && is_scalar( $_GET[ $page_key ] ?? null ) ? min( 1000, max( 1, (int) $_GET[ $page_key ] ) ) : 1;
	try { $result = $depth < 3 && $listing['query'] && ( $GLOBALS['lieve_listing_remaining'] ?? 0 ) > 0 ? lieve_query_run( $listing['query'], array( 'postId' => function_exists( 'get_the_ID' ) ? get_the_ID() : 0, 'page' => $page ) ) : null; }
	catch ( Throwable $error ) { if ( $top ) { unset( $GLOBALS['lieve_listing_remaining'] ); } throw $error; }
	$items = $result && ! is_wp_error( $result ) ? $result['items'] : array();
	$message = ! $listing['query'] ? 'Choose a saved query to preview this listing.' : ( is_wp_error( $result ) ? 'The selected query is unavailable. Choose an enabled query in Query Builder.' : ( $depth >= 3 ? 'Nested listing limit reached (3 levels).' : 'No results match this query.' ) );
	if ( ! $items && $listing['hideEmpty'] && ! $preview ) { if ( $top ) { unset( $GLOBALS['lieve_listing_remaining'] ); } return; }
	$globals = array( 'post', 'id', 'authordata', 'currentday', 'currentmonth', 'page', 'pages', 'multipage', 'more', 'numpages', 'lieve_dynamic_term', 'lieve_listing_context', 'lieve_listing_depth', 'lieve_listing_instance_scope', 'lieve_document_element_ids', 'lieve_listing_css_rules' );
	$before = array(); foreach ( $globals as $key ) { if ( array_key_exists( $key, $GLOBALS ) ) { $before[ $key ] = $GLOBALS[ $key ]; } }
	$GLOBALS['lieve_listing_depth'] = $depth + 1; $GLOBALS['lieve_listing_css_rules'] = array();
	$level = ob_get_level(); $html = ''; $limited = false;
	try {
		ob_start();
		if ( ! $items && $preview ) { unset( $GLOBALS['lieve_listing_context'], $GLOBALS['lieve_dynamic_term'] ); echo '<p data-editor-ui class="lieve-editor-preview-message">' . esc_html( $message ) . '</p><div data-lieve-listing-track><div data-lieve-listing-item>'; lieve_render_nodes( $node['children'] ?? array() ); echo '</div></div>'; }
		elseif ( ! $items ) { echo '<p data-lieve-listing-empty>' . esc_html( $listing['emptyText'] ?: 'No results found.' ) . '</p>'; }
		else {
			$cap = min( count( $items ), $preview ? 20 : 100 );
			echo '<div data-lieve-listing-track' . ( 'slider' === $listing['mode'] ? ' tabindex="0" aria-label="' . esc_attr( $listing['label'] ?: 'Listing items' ) . '"' : '' ) . '>';
			foreach ( array_slice( $items, 0, $cap ) as $index => $item ) {
				if ( $GLOBALS['lieve_listing_remaining'] <= 0 ) { $limited = true; break; }
				$type = $result['query']['type']; $GLOBALS['lieve_listing_context'] = array( 'item' => $item, 'type' => $type, 'index' => $index + 1, 'count' => count( $items ), 'total' => $result['total'] ?? '' );
				unset( $GLOBALS['lieve_dynamic_term'] );
				if ( in_array( $type, array( 'posts', 'current' ), true ) ) { $GLOBALS['post'] = $item; setup_postdata( $item ); }
				elseif ( 'terms' === $type ) { $GLOBALS['lieve_dynamic_term'] = $item; }
				elseif ( 'comments' === $type ) { $GLOBALS['post'] = get_post( $item->comment_post_ID ); if ( $GLOBALS['post'] ) { setup_postdata( $GLOBALS['post'] ); } }
				$item_id = $item->ID ?? $item->term_id ?? $item->comment_ID ?? $index;
				$GLOBALS['lieve_listing_instance_scope'] = $root . ':' . $type . ':' . $item_id;
				$aliases = array(); $children = lieve_listing_instances( $node['children'] ?? array(), $GLOBALS['lieve_listing_instance_scope'], $aliases );
				$GLOBALS['lieve_document_element_ids'] = array_replace( $before['lieve_document_element_ids'] ?? array(), $aliases );
				$children = lieve_listing_remap_references( $children, $aliases );
				echo '<div data-lieve-listing-item data-listing-position="' . ( $index + 1 ) . '"' . ( 'slider' === $listing['mode'] ? ' role="group" aria-roledescription="slide" aria-label="' . esc_attr( ( $index + 1 ) . ' of ' . count( $items ) ) . '"' : '' ) . '>'; lieve_render_nodes( $children ); echo '</div>';
			}
			echo '</div>';
			if ( $preview && ( count( $items ) > $cap || $limited ) ) { echo '<p data-editor-ui class="lieve-editor-preview-message">Preview limited to ' . ( $limited ? 'the rendering budget' : $cap . ' items' ) . '. The saved model is unchanged.</p>'; }
		}
		$html = ob_get_clean(); $css = lieve_listing_css( $node ) . implode( '', $GLOBALS['lieve_listing_css_rules'] );
	} finally {
		while ( ob_get_level() > $level ) { ob_end_clean(); }
		foreach ( $globals as $key ) { if ( array_key_exists( $key, $before ) ) { $GLOBALS[ $key ] = $before[ $key ]; } else { unset( $GLOBALS[ $key ] ); } }
		if ( $top ) { unset( $GLOBALS['lieve_listing_remaining'] ); }
	}
	if ( isset( $GLOBALS['lieve_listing_css_rules'] ) ) { $GLOBALS['lieve_listing_css_rules'][] = $css; }
	elseif ( $css ) { if ( function_exists( 'lieve_print_generated_css' ) && ! $preview ) { lieve_print_generated_css( $css, 'data-lieve-listing-styles', $root ); } else { echo '<style data-lieve-listing-styles="' . esc_attr( $root ) . '">' . $css . '</style>'; } }
	if ( ! $preview && ( 'slider' === $listing['mode'] || 'none' !== $listing['pagination'] ) && function_exists( 'lieve_enqueue_listings' ) ) { lieve_enqueue_listings(); }
	$slider_attributes = '';
	if ( 'slider' === $listing['mode'] ) {
		foreach ( array( 'advance', 'rewind', 'drag', 'scrollbar', 'motion' ) as $key ) { $slider_attributes .= ' data-listing-' . $key . '="' . esc_attr( is_bool( $listing[ $key ] ) ? ( $listing[ $key ] ? 'true' : 'false' ) : $listing[ $key ] ) . '"'; }
		$slider_attributes .= ' role="region" aria-roledescription="carousel" aria-label="' . esc_attr( $listing['label'] ?: 'Content listing' ) . '"';
	}
	echo '<' . $tag . lieve_node_class_attributes( $node, 'lieve-' . $node['type'] ) . $attributes . ' data-lieve-listing="' . esc_attr( $root ) . '" data-listing-mode="' . esc_attr( $listing['mode'] ) . '" data-listing-autoplay="' . ( $listing['autoplay'] ? 'true' : 'false' ) . '" data-listing-interval="' . (int) $listing['interval'] . '"' . $slider_attributes . '>' . $html;
	if ( $items && 'slider' === $listing['mode'] && ( $listing['arrows'] || $listing['dots'] || $listing['autoplay'] ) ) {
		echo '<div data-lieve-listing-controls>';
		if ( $listing['arrows'] ) { foreach ( array( 'prev' => 'Previous items', 'next' => 'Next items' ) as $direction => $label ) { echo '<button type="button" data-listing-' . $direction . ' aria-label="' . esc_attr( $label ) . '"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="' . ( 'prev' === $direction ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6' ) . '"/></svg></button>'; } }
		if ( $listing['dots'] ) { echo '<div data-listing-dots aria-label="Go to item"></div>'; }
		if ( $listing['autoplay'] ) { echo '<button type="button" data-listing-pause aria-pressed="false">Pause autoplay</button>'; }
		echo '<span data-listing-status class="screen-reader-text" aria-live="polite" aria-atomic="true"></span></div>';
	}
	if ( $items && 'none' !== $listing['pagination'] && ! $preview ) {
		$limit = $result['query']['limit']; $has_next = null !== $result['pages'] ? $page < $result['pages'] : count( $items ) >= $limit;
		$url = remove_query_arg( $page_key );
		echo '<nav data-lieve-listing-pagination aria-label="Listing pages">';
		if ( $page > 1 && 'links' === $listing['pagination'] ) { echo '<a href="' . esc_url( add_query_arg( $page_key, $page - 1, $url ) ) . '" rel="prev">Previous</a>'; }
		if ( 'links' === $listing['pagination'] ) { echo '<span aria-current="page">' . esc_html( sprintf( 'Page %d', $page ) ) . '</span>'; }
		if ( $has_next ) { echo '<a href="' . esc_url( add_query_arg( $page_key, $page + 1, $url ) ) . '" rel="next"' . ( 'load-more' === $listing['pagination'] ? ' data-lieve-listing-more' : '' ) . '>' . ( 'load-more' === $listing['pagination'] ? 'Load more' : 'Next' ) . '</a>'; }
		echo '<span data-lieve-listing-page-status role="status" aria-live="polite"></span></nav>';
	}
	echo '</' . $tag . '>';
}

function lieve_enqueue_listings() {
	wp_enqueue_script( 'lieve-listing', LIEVE_URL . 'assets/js/listing.js', array(), lieve_asset_version( 'assets/js/listing.js' ), true );
	wp_enqueue_script( 'lieve-listing-pagination', LIEVE_URL . 'assets/js/listing-pagination.js', array( 'lieve-listing' ), lieve_asset_version( 'assets/js/listing-pagination.js' ), true );
}
