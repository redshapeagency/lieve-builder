<?php
/** Native, unstyled element markup. External embeds are opt-in. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_element_items( $value, $columns = 4 ) {
	$decoded = json_decode( (string) $value, true );
	if ( is_array( $decoded ) ) {
		$output = array();
		foreach ( array_slice( $decoded, 0, 100 ) as $row ) {
			if ( ! is_array( $row ) ) { continue; }
			$output[] = array_map( function( $item ) { return is_scalar( $item ) ? trim( (string) $item ) : ''; }, array_slice( array_values( $row ), 0, $columns ) );
		}
		return $output;
	}
	$lines = preg_split( '/\r?\n/', (string) $value );
	return array_map( function( $line ) use ( $columns ) { return array_map( 'trim', explode( '|', $line, $columns ) ); }, array_slice( array_values( array_filter( $lines, 'strlen' ) ), 0, 100 ) );
}

function lieve_render_element_children( $node ) {
	lieve_render_nodes( $node['children'] ?? array() );
}

function lieve_find_document_node( $nodes, $id ) {
	foreach ( $nodes as $node ) {
		if ( $node['id'] === $id ) { return $node; }
		$found = lieve_find_document_node( $node['children'] ?? array(), $id );
		if ( $found ) { return $found; }
	}
	return null;
}

function lieve_element_query( $node ) {
	$p = $node['props'] ?? array();
	$prefix = 'lv_' . sanitize_key( $node['id'] ) . '_';
	$read = function( $name ) use ( $prefix ) { return isset( $_GET[ $prefix . $name ] ) && is_scalar( $_GET[ $prefix . $name ] ) ? sanitize_text_field( wp_unslash( $_GET[ $prefix . $name ] ) ) : ''; };
	if ( ! empty( $p['savedQuery'] ) && function_exists( 'lieve_query_run' ) ) {
		$definition = lieve_query_find( $p['savedQuery'] ); $query = new WP_Query();
		$query->posts = array(); $query->post_count = 0; $query->found_posts = 0; $query->max_num_pages = 0; $query->query_vars = array( 'paged' => max( 1, (int) $read( 'page' ) ) );
		if ( ! $definition || ! in_array( $definition['type'], array( 'posts', 'current' ), true ) ) { return $query; }
		if ( $read( 'search' ) ) { $definition['search'] = trim( $definition['search'] . ' ' . $read( 'search' ) ); }
		if ( 'related-posts' === $node['type'] ) { $definition['excludeCurrent'] = true; }
		$taxonomy = sanitize_key( $p['taxonomy'] ?? 'category' );
		$context = array( 'postId' => get_the_ID(), 'page' => $query->get( 'paged' ) );
		if ( $read( 'terms' ) && taxonomy_exists( $taxonomy ) ) { $context['taxFilter'] = array( 'taxonomy' => $taxonomy, 'terms' => $read( 'terms' ) ); }
		if ( lieve_query_date_valid( $read( 'date' ) ) ) { $context['after'] = $read( 'date' ); }
		if ( in_array( 'product', $definition['postTypes'], true ) && is_numeric( $read( 'price' ) ) ) { $context['maxPrice'] = max( 0, (float) $read( 'price' ) ); }
		$result = lieve_query_run( $definition, $context );
		if ( is_wp_error( $result ) ) { return $query; }
		$query->posts = $result['items']; $query->post_count = count( $result['items'] ); $query->found_posts = $result['total'] ?? $query->post_count; $query->max_num_pages = $result['pages'] ?? 0;
		$query->query_vars['lieve_total_unknown'] = null === $result['total'];
		return $query;
	}
	$type = $p['postType'] ?? 'post';
	$public = get_post_types( array( 'public' => true ), 'names' );
	$type = in_array( $type, $public, true ) ? $type : 'post';
	$args = array( 'post_type' => $type, 'post_status' => 'publish', 'posts_per_page' => min( 50, max( 1, (int) ( $p['count'] ?? 6 ) ) ), 'paged' => max( 1, (int) $read( 'page' ) ), 'ignore_sticky_posts' => true );
	if ( $read( 'search' ) ) { $args['s'] = $read( 'search' ); }
	$taxonomy = sanitize_key( $p['taxonomy'] ?? 'category' );
	$terms = array_filter( array_map( 'absint', explode( ',', $read( 'terms' ) ?: (string) ( $p['termId'] ?? '' ) ) ) );
	if ( $terms && taxonomy_exists( $taxonomy ) ) { $args['tax_query'] = array( array( 'taxonomy' => $taxonomy, 'field' => 'term_id', 'terms' => $terms ) ); }
	if ( preg_match( '/^\d{4}-\d{2}-\d{2}$/', $read( 'date' ) ) ) { $args['date_query'] = array( array( 'after' => $read( 'date' ), 'inclusive' => true ) ); }
	if ( 'product' === $type && is_numeric( $read( 'price' ) ) ) { $args['meta_query'] = array( array( 'key' => '_price', 'value' => max( 0, (float) $read( 'price' ) ), 'compare' => '<=', 'type' => 'NUMERIC' ) ); }
	if ( 'related-posts' === $node['type'] ) {
		$args['post__not_in'] = array( get_the_ID() );
		if ( ! $terms && taxonomy_exists( $taxonomy ) ) {
			$related = wp_get_post_terms( get_the_ID(), $taxonomy, array( 'fields' => 'ids' ) );
			if ( ! is_wp_error( $related ) && $related ) { $args['tax_query'] = array( array( 'taxonomy' => $taxonomy, 'field' => 'term_id', 'terms' => $related ) ); }
		}
	}
	return new WP_Query( $args );
}

function lieve_render_posts_element( $node ) {
	$query = lieve_element_query( $node );
	echo '<ul data-lieve-query="' . esc_attr( $node['id'] ) . '">';
	foreach ( $query->posts as $item ) {
		echo '<li><article><a href="' . esc_url( get_permalink( $item ) ) . '">' . get_the_post_thumbnail( $item, 'medium' ) . '<h3>' . esc_html( get_the_title( $item ) ) . '</h3></a><p>' . esc_html( get_the_excerpt( $item ) ) . '</p></article></li>';
	}
	if ( ! $query->posts ) { echo '<li>' . esc_html__( 'No results found.', 'lieve-builder' ) . '</li>'; }
	echo '</ul>';
}

function lieve_query_target( $props ) {
	$runtime = $GLOBALS['lieve_runtime_document'] ?? null;
	if ( is_array($runtime) ) { if ( function_exists('lieve_components_runtime_document') ) { $runtime=lieve_components_runtime_document($runtime); } $target=lieve_find_document_node($runtime['children']??array(),$props['queryId']??''); if($target)return $target; }
	$document = lieve_get_document( $GLOBALS['lieve_document_source_id'] ?? get_the_ID() );
	if ( function_exists('lieve_components_runtime_document') ) { $document=lieve_components_runtime_document($document); }
	return lieve_find_document_node( $document['children'], $props['queryId'] ?? '' );
}

/** Return an allowlisted provider URL; never embed arbitrary websites. */
function lieve_external_embed_url( $type, $url ) {
	$host = strtolower( wp_parse_url( $url, PHP_URL_HOST ) ?: '' );
	$providers = array(
		'map' => array( 'www.google.com', 'maps.google.com' ),
		'map-leaflet' => array( 'www.openstreetmap.org' ),
		'facebook-page' => array( 'www.facebook.com' ),
		'instagram-feed' => array( 'www.instagram.com' ),
	);
	if ( ! in_array( $host, $providers[ $type ] ?? array(), true ) || 'https' !== wp_parse_url( $url, PHP_URL_SCHEME ) ) { return ''; }
	$path = wp_parse_url( $url, PHP_URL_PATH ) ?: '';
	$valid = array(
		'map' => 0 === strpos( $path, '/maps/embed' ),
		'map-leaflet' => '/export/embed.html' === $path,
		'facebook-page' => '/plugins/page.php' === $path,
		'instagram-feed' => (bool) preg_match( '~^/(p|reel)/[A-Za-z0-9_-]+/embed/?$~', $path ),
	);
	if ( empty( $valid[ $type ] ) ) { return ''; }
	return esc_url_raw( $url );
}

function lieve_render_registered_element( $node, $attributes ) {
	$type = $node['type']; $p = $node['props'] ?? array();
	$id = 'lieve-' . lieve_element_number( $node['id'] );
	$items = lieve_element_items( $p['items'] ?? '' );
	$label = $p['label'] ?? '';
	$wrap = function( $tag = 'div', $extra = '' ) use ( $attributes ) { echo '<' . $tag . $attributes . $extra . '>'; };
	if ( function_exists( 'lieve_render_commerce_element' ) && lieve_render_commerce_element( $node, $attributes ) ) { return; }
	switch ( $type ) {
		case 'block': case 'div': case 'slot':
			$wrap(); lieve_render_element_children( $node ); echo '</div>'; break;
		case 'text-basic': $wrap(); echo esc_html( $p['content'] ?? '' ); echo '</div>'; break;
		case 'text-link': case 'file':
			$wrap( 'a', ' href="' . esc_url( $p['url'] ?? '#' ) . '"' . ( 'file' === $type ? ' download' : '' ) . ( ! empty( $p['target'] ) ? ' target="_blank" rel="noopener noreferrer"' : '' ) ); echo esc_html( $label ); echo '</a>'; break;
		case 'icon': $wrap( 'span', ' role="img" aria-label="' . esc_attr( $label ) . '"' ); echo esc_html( $p['symbol'] ?? '★' ); echo '</span>'; break;
		case 'icon-box': $wrap( 'article' ); echo '<span aria-hidden="true">' . esc_html( $p['symbol'] ?? '★' ) . '</span><h3>' . esc_html( $p['title'] ?? '' ) . '</h3><p>' . esc_html( $p['content'] ?? '' ) . '</p></article>'; break;
		case 'logo':
			$wrap( 'a', ' href="' . esc_url( $p['linkUrl'] ?? home_url( '/' ) ) . '"' ); echo '<img src="' . esc_url( $p['url'] ?? LIEVE_LOGO_URL ) . '" alt="' . esc_attr( $p['alt'] ?? get_bloginfo( 'name' ) ) . '"></a>'; break;
		case 'svg': $wrap( 'img', ' src="' . esc_url( $p['url'] ?? '' ) . '" alt="' . esc_attr( $p['alt'] ?? '' ) . '"' ); break;
		case 'video': case 'audio':
			$wrap( $type, ' controls src="' . esc_url( $p['url'] ?? '' ) . '"' . ( ! empty( $p['loop'] ) ? ' loop' : '' ) . ( ! empty( $p['muted'] ) ? ' muted' : '' ) . ( 'video' === $type && ! empty( $p['poster'] ) ? ' poster="' . esc_url( $p['poster'] ) . '"' : '' ) ); echo '</' . $type . '>'; break;
		case 'divider': $wrap( 'hr' ); break;
		case 'html':
			$wrapped = lieve_html_has_wrapper( $p ); if ( $wrapped ) { $wrap(); }
			if ( function_exists( 'lieve_render_custom_code' ) ) { lieve_render_custom_code( $node ); }
			else { echo function_exists( 'lieve_safe_html' ) ? lieve_safe_html( $p['content'] ?? '' ) : wp_kses_post( $p['content'] ?? '' ); }
			if ( $wrapped ) { echo '</div>'; } break;
		case 'code': $wrap( 'pre' ); echo '<code>' . esc_html( $p['content'] ?? '' ) . '</code></pre>'; break;
		case 'nav-nested': lieve_render_menu_widget( $node, $attributes ); break;
		case 'dropdown': $wrap( 'details' ); echo '<summary>' . esc_html( $label ) . '</summary>'; lieve_render_element_children( $node ); echo '</details>'; break;
		case 'offcanvas':
			$wrap(); echo '<button type="button" data-lieve-open="' . esc_attr( $id . '-dialog' ) . '">' . esc_html( $label ?: 'Open panel' ) . '</button><dialog id="' . esc_attr( $id . '-dialog' ) . '"><button type="button" data-lieve-dialog-close>' . esc_html__( 'Close', 'lieve-builder' ) . '</button>'; lieve_render_element_children( $node ); echo '</dialog></div>'; break;
		case 'toggle': $wrap( 'button', ' type="button" data-lieve-toggle="' . esc_attr( lieve_element_target_id( $p['targetId'] ?? '' ) ) . '" aria-expanded="false"' ); echo esc_html( $label ); echo '</button>'; break;
		case 'toggle-mode': $wrap( 'button', ' type="button" data-lieve-color-mode aria-pressed="false"' ); echo esc_html( $label ); echo '</button>'; break;
		case 'alert': $wrap( 'aside', ' role="status"' ); echo esc_html( $p['content'] ?? '' ); if ( ! empty( $p['dismissible'] ) ) { echo '<button type="button" data-lieve-dismiss aria-label="Close">×</button>'; } echo '</aside>'; break;
		case 'list': case 'social-icons':
			$wrap( 'ul' ); foreach ( $items as $item ) { echo '<li>'; if ( 'social-icons' === $type ) { echo '<a href="' . esc_url( $item[1] ?? '#' ) . '" rel="noopener noreferrer">' . esc_html( $item[0] ) . '</a>'; } else { echo esc_html( $item[0] ) . ( isset( $item[1] ) ? ' — ' . esc_html( $item[1] ) : '' ); } echo '</li>'; } echo '</ul>'; break;
		case 'pricing-tables': case 'team-members': case 'testimonials':
			$wrap(); foreach ( $items as $item ) {
				if ( 'testimonials' === $type ) { echo '<blockquote><p>' . esc_html( $item[1] ?? '' ) . '</p><cite>' . esc_html( $item[0] ?? '' ) . '</cite>'; }
				else { echo '<article><h3>' . esc_html( $item[0] ?? '' ) . '</h3><p>' . esc_html( $item[1] ?? '' ) . '</p>'; }
				if ( ! empty( $item[2] ) ) { echo 'pricing-tables' === $type ? '<p>' . esc_html( $item[2] ) . '</p>' : '<img src="' . esc_url( $item[2] ) . '" alt="' . esc_attr( $item[0] ?? '' ) . '" loading="lazy">'; }
				if ( ! empty( $item[3] ) ) { echo '<a href="' . esc_url( $item[3] ) . '">' . esc_html__( 'Learn more', 'lieve-builder' ) . '</a>'; }
				echo 'testimonials' === $type ? '</blockquote>' : '</article>';
			} echo '</div>'; break;
		case 'accordion':
			$wrap(); foreach ( $items as $item ) { echo '<details><summary>' . esc_html( $item[0] ) . '</summary><p>' . esc_html( $item[1] ?? '' ) . '</p></details>'; } echo '</div>'; break;
		case 'accordion-nested':
			$wrap(); foreach ( $node['children'] ?? array() as $index => $child ) { echo '<details><summary>' . esc_html( $child['props']['label'] ?? 'Item ' . ( $index + 1 ) ) . '</summary>'; lieve_render_node( $child ); echo '</details>'; } echo '</div>'; break;
		case 'tabs': case 'tabs-nested':
			$nested = 'tabs-nested' === $type; $entries = $nested ? ( $node['children'] ?? array() ) : $items;
			$wrap( 'div', ' data-lieve-tabs' ); echo '<div role="tablist" aria-label="' . esc_attr( $label ?: 'Tabs' ) . '">';
			foreach ( $entries as $index => $item ) { echo '<button type="button" role="tab" id="' . esc_attr( $id . '-tab-' . $index ) . '" aria-controls="' . esc_attr( $id . '-panel-' . $index ) . '" aria-selected="' . ( 0 === $index ? 'true' : 'false' ) . '" tabindex="' . ( 0 === $index ? '0' : '-1' ) . '">' . esc_html( $nested ? ( $item['props']['label'] ?? 'Tab ' . ( $index + 1 ) ) : $item[0] ) . '</button>'; }
			echo '</div>'; foreach ( $entries as $index => $item ) { echo '<div role="tabpanel" id="' . esc_attr( $id . '-panel-' . $index ) . '" aria-labelledby="' . esc_attr( $id . '-tab-' . $index ) . '" tabindex="0"' . ( $index ? ' hidden' : '' ) . '>'; if ( $nested ) { lieve_render_node( $item ); } else { echo wp_kses_post( wpautop( $item[1] ?? '' ) ); } echo '</div>'; } echo '</div>'; break;
		case 'image-gallery': case 'carousel': case 'slider': case 'slider-nested':
			lieve_render_gallery_widget( $node, $attributes ); break;
		case 'animated-typing': $wrap( 'span', ' data-lieve-phrases="' . esc_attr( wp_json_encode( array_column( $items, 0 ) ) ) . '" data-lieve-interval="' . (int) max( 500, $p['interval'] ?? 2400 ) . '"' ); echo esc_html( $items[0][0] ?? '' ); echo '</span>'; break;
		case 'countdown': $wrap( 'time', ' datetime="' . esc_attr( $p['date'] ?? '' ) . '" data-lieve-countdown data-completed="' . esc_attr( $label ) . '"' ); echo esc_html( $p['date'] ?? 'Choose an end date' ); echo '</time>'; break;
		case 'counter': $wrap( 'span', ' data-lieve-counter="' . (float) ( $p['value'] ?? 0 ) . '" data-prefix="' . esc_attr( $p['prefix'] ?? '' ) . '" data-suffix="' . esc_attr( $p['suffix'] ?? '' ) . '"' ); echo esc_html( ( $p['prefix'] ?? '' ) . ( $p['value'] ?? 0 ) . ( $p['suffix'] ?? '' ) ); echo '</span>'; break;
		case 'progress-bar':
			$max = max( 1, (float) ( $p['maximum'] ?? 100 ) ); $value = max( 0, min( $max, (float) ( $p['value'] ?? 0 ) ) );
			$wrap( 'label' ); echo esc_html( $label ) . ' <progress value="' . $value . '" max="' . $max . '">' . $value . ' / ' . $max . '</progress></label>'; break;
		case 'rating':
			$max = min( 10, max( 1, (int) ( $p['maximum'] ?? 5 ) ) ); $value = max( 0, min( $max, (float) ( $p['value'] ?? 3 ) ) );
			$wrap( 'span', ' role="img" aria-label="' . esc_attr( $label . ': ' . $value . ' / ' . $max ) . '"' );
			for ( $index = 0; $index < $max; $index++ ) { echo '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><defs><clipPath id="' . esc_attr( $id . '-star-' . $index ) . '"><rect width="' . ( 24 * min( 1, max( 0, $value - $index ) ) ) . '" height="24"/></clipPath></defs><path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.5l6.2-.9Z" fill="none" stroke="currentColor"/><path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.5l6.2-.9Z" fill="currentColor" clip-path="url(#' . esc_attr( $id . '-star-' . $index ) . ')"/></svg>'; }
			echo '</span>'; break;
		case 'pie-chart':
			$max = max( 1, (float) ( $p['maximum'] ?? 100 ) ); $value = max( 0, min( $max, (float) ( $p['value'] ?? 0 ) ) ); $fraction = $value / $max;
			$wrap( 'figure' ); echo '<svg width="120" height="120" viewBox="0 0 100 100" role="img" aria-label="' . esc_attr( $label . ': ' . $value . ' / ' . $max ) . '"><circle cx="50" cy="50" r="48" fill="none" stroke="currentColor"/>';
			if ( $fraction >= 1 ) { echo '<circle cx="50" cy="50" r="48" fill="currentColor"/>'; }
			elseif ( $fraction > 0 ) { $angle = $fraction * 2 * M_PI - M_PI / 2; $x = 50 + 48 * cos( $angle ); $y = 50 + 48 * sin( $angle ); echo '<path d="M50 50L50 2A48 48 0 ' . ( $fraction > 0.5 ? '1' : '0' ) . ' 1 ' . round( $x, 4 ) . ' ' . round( $y, 4 ) . 'Z" fill="currentColor"/>'; }
			echo '</svg><figcaption>' . esc_html( $label . ' ' . $value . ' / ' . $max ) . '</figcaption></figure>'; break;
		case 'back-to-top': $wrap( 'a', ' href="#" data-lieve-back-top' ); echo esc_html( $label ?: 'Back to top' ); echo '</a>'; break;
		case 'map': case 'map-leaflet': case 'facebook-page': case 'instagram-feed':
			if ( ! empty( $p['shortcode'] ) ) { $wrap( 'div', empty( $GLOBALS['lieve_element_preview'] ) ? '' : ' data-editor-ui' ); echo empty( $GLOBALS['lieve_element_preview'] ) ? do_shortcode( $p['shortcode'] ) : esc_html__( 'Configured integration shortcode renders on the frontend.', 'lieve-builder' ); echo '</div>'; break; }
			$url = lieve_external_embed_url( $type, $p['embedUrl'] ?? '' ); $wrap( 'div', ' data-lieve-embed="' . esc_attr( $url ) . '" data-embed-title="' . esc_attr( $type ) . '"' );
			if ( $url ) { echo '<button type="button" data-lieve-load-embed>' . esc_html( $label ?: 'Load external content' ) . '</button>'; } else { echo esc_html__( 'Configure a valid HTTPS provider embed URL.', 'lieve-builder' ); } echo '</div>'; break;
		case 'map-connector': $wrap( 'button', ' type="button" data-lieve-map-target="' . esc_attr( lieve_element_target_id( $p['targetId'] ?? '' ) ) . '" data-map-url="' . esc_attr( lieve_external_embed_url( 'map', $p['embedUrl'] ?? '' ) ?: lieve_external_embed_url( 'map-leaflet', $p['embedUrl'] ?? '' ) ) . '"' ); echo esc_html( $label ); echo '</button>'; break;
		case 'posts': case 'related-posts': $wrap(); lieve_render_posts_element( $node ); echo '</div>'; break;
		case 'query-results':
			$wrap();
			$result = function_exists( 'lieve_query_run' ) ? lieve_query_run( $p['savedQuery'] ?? '', array( 'postId' => get_the_ID() ) ) : null;
			$records = $result && ! is_wp_error( $result ) ? lieve_query_records( $result ) : array();
			if ( $records ) { echo '<ul>'; foreach ( $records as $record ) { echo '<li><a href="' . esc_url( $record['url'] ) . '">' . esc_html( $record['title'] ) . '</a>'; if ( ! empty( $p['showDescription'] ) && $record['description'] ) { echo '<p>' . esc_html( $record['description'] ) . '</p>'; } echo '</li>'; } echo '</ul>'; }
			elseif ( ! empty( $p['emptyText'] ) ) { echo '<p>' . esc_html( $p['emptyText'] ) . '</p>'; }
			echo '</div>'; break;
		case 'search':
			$wrap( 'form', ' role="search" method="get" action="' . esc_url( home_url( '/' ) ) . '"' ); echo '<label>' . esc_html( $p['placeholder'] ?? 'Search' ) . '<input type="search" name="s" value="' . esc_attr( get_search_query() ) . '"></label><button type="submit">' . esc_html( $label ?: 'Search' ) . '</button></form>'; break;
		case 'nav-menu': lieve_render_menu_widget( $node, $attributes ); break;
		case 'sidebar': $wrap( 'aside', empty( $GLOBALS['lieve_element_preview'] ) ? '' : ' data-editor-ui' ); if ( ! empty( $GLOBALS['lieve_element_preview'] ) ) { echo esc_html__( 'Sidebar widgets render on the frontend.', 'lieve-builder' ); } elseif ( ! empty( $p['sidebarId'] ) ) { dynamic_sidebar( $p['sidebarId'] ); } echo '</aside>'; break;
		case 'shortcode': $wrap( 'div', empty( $GLOBALS['lieve_element_preview'] ) ? '' : ' data-editor-ui' ); if ( empty( $GLOBALS['lieve_element_preview'] ) ) { echo do_shortcode( $p['content'] ?? '' ); } else { echo esc_html( $p['content'] ?? 'Enter a shortcode. It executes on the frontend only.' ); } echo '</div>'; break;
		case 'wordpress':
			$wrap(); $mode = $p['mode'] ?? 'calendar'; if ( 'calendar' === $mode ) { get_calendar(); } elseif ( 'archives' === $mode ) { echo '<ul>'; wp_get_archives(); echo '</ul>'; } elseif ( 'categories' === $mode ) { echo '<ul>'; wp_list_categories( array( 'title_li' => '' ) ); echo '</ul>'; } else { echo '<ul>'; wp_list_pages( array( 'title_li' => '' ) ); echo '</ul>'; } echo '</div>'; break;
		case 'template':
			if ( ! isset( $node['_lieveTemplateDocument'] ) ) {
				$plan = lieve_prepare_template_document( array( 'children' => array( $node ) ) );
				if ( ! empty( $plan['_lieveTemplateFailed'] ) ) { lieve_template_expansion_fallback(); break; }
				$node = $plan['children'][0] ?? $node;
			}
			$document = $node['_lieveTemplateDocument'] ?? array();
			if ( ! empty( $node['_lieveTemplateIssue'] ) ) { lieve_template_expansion_fallback( $node['_lieveTemplateIssue'] ); break; }
			if ( empty( $document['children'] ) ) { break; }
			$wrap();
			$listing_scope = $GLOBALS['lieve_listing_instance_scope'] ?? null;
			if ( null !== $listing_scope ) { $GLOBALS['lieve_listing_instance_scope'] = $listing_scope . ':template:' . $node['id']; }
			try { lieve_render_document( $document ); } finally { if ( null !== $listing_scope ) { $GLOBALS['lieve_listing_instance_scope'] = $listing_scope; } echo '</div>'; }
			break;
		case 'breadcrumbs':
			$wrap( 'nav', ' aria-label="Breadcrumbs"' ); echo '<ol><li><a href="' . esc_url( home_url( '/' ) ) . '">' . esc_html__( 'Home', 'lieve-builder' ) . '</a></li>'; foreach ( array_reverse( get_post_ancestors( get_the_ID() ) ) as $ancestor ) { echo '<li><a href="' . esc_url( get_permalink( $ancestor ) ) . '">' . esc_html( get_the_title( $ancestor ) ) . '</a></li>'; } echo '<li aria-current="page">' . esc_html( get_the_title() ) . '</li></ol></nav>'; break;
		case 'post-title': $wrap( 'h1' ); echo esc_html( get_the_title() ); echo '</h1>'; break;
		case 'post-excerpt': $wrap(); echo wp_kses_post( wpautop( get_the_excerpt() ) ); echo '</div>'; break;
		case 'post-content': $wrap( 'div', ' data-lieve-native-content' ); $content = get_post_field( 'post_content', get_the_ID() ); echo wp_kses_post( function_exists( 'do_blocks' ) ? do_blocks( $content ) : wpautop( $content ) ); echo '</div>'; break;
		case 'post-meta': $wrap( 'p' ); echo '<time datetime="' . esc_attr( get_the_date( 'c' ) ) . '">' . esc_html( get_the_date() ) . '</time> · ' . esc_html( get_the_author() ); echo '</p>'; break;
		case 'post-author': $wrap( 'aside' ); echo get_avatar( get_the_author_meta( 'ID' ) ) . '<a href="' . esc_url( get_author_posts_url( get_the_author_meta( 'ID' ) ) ) . '">' . esc_html( get_the_author() ) . '</a><p>' . esc_html( get_the_author_meta( 'description' ) ) . '</p></aside>'; break;
		case 'post-taxonomy': $wrap(); $terms = get_the_term_list( get_the_ID(), sanitize_key( $p['taxonomy'] ?? 'category' ), '', ', ' ); if ( ! is_wp_error( $terms ) ) { echo $terms; } echo '</div>'; break;
		case 'post-navigation': $wrap( 'nav', ' aria-label="Post navigation"' ); previous_post_link(); next_post_link(); echo '</nav>'; break;
		case 'post-comments': $wrap( 'div', empty( $GLOBALS['lieve_element_preview'] ) ? '' : ' data-editor-ui' ); if ( empty( $GLOBALS['lieve_element_preview'] ) ) { comments_template(); } else { echo esc_html__( 'Comments appear on the frontend.', 'lieve-builder' ); } echo '</div>'; break;
		case 'post-sharing':
			$wrap( 'nav', ' aria-label="Share this post"' ); $url = rawurlencode( get_permalink() ); foreach ( array( 'Facebook' => 'https://www.facebook.com/sharer/sharer.php?u=', 'LinkedIn' => 'https://www.linkedin.com/sharing/share-offsite/?url=', 'Email' => 'mailto:?body=' ) as $network => $base ) { echo '<a href="' . esc_url( $base . $url ) . '" rel="noopener noreferrer">' . esc_html( $network ) . '</a> '; } echo '</nav>'; break;
		case 'post-reading-time': $wrap( 'span' ); echo esc_html( max( 1, (int) ceil( str_word_count( wp_strip_all_tags( get_post_field( 'post_content', get_the_ID() ) ) ) / 200 ) ) ) . ' ' . esc_html__( 'min read', 'lieve-builder' ); echo '</span>'; break;
		case 'post-reading-progress-bar': $wrap( 'progress', ' max="100" value="0" data-lieve-reading-progress aria-label="Reading progress"' ); echo '</progress>'; break;
		case 'post-toc':
			$wrap( 'nav', ' aria-label="Table of contents" data-lieve-toc' ); echo '<ol></ol></nav>'; break;
		case 'form': lieve_render_contact_form( $node, $attributes ); break;
		case 'form-checkbox': $wrap( 'label' ); echo '<input type="checkbox" name="' . esc_attr( sanitize_key( $p['fieldName'] ?? 'consent' ) ) . '" value="1"' . ( ! empty( $p['required'] ) ? ' required' : '' ) . '>' . esc_html( $label ) . '</label>'; break;
		default: lieve_render_query_control( $node, $attributes );
	}
}

function lieve_render_query_control( $node, $attributes ) {
	$type = $node['type']; $p = $node['props']; $query_id = $p['queryId'] ?? ''; $label = $p['label'] ?? 'Filter';
	if ( in_array( $type, array( 'pagination', 'query-results-summary' ), true ) ) {
		$target = lieve_query_target( $p ); if ( ! $target || ! in_array( $target['type'], array( 'posts', 'related-posts' ), true ) ) { return; } $query = lieve_element_query( $target );
		echo '<div' . $attributes . '>'; if ( 'pagination' === $type ) { $key = 'lv_' . sanitize_key( $target['id'] ) . '_page'; echo wp_kses_post( paginate_links( array( 'base' => add_query_arg( $key, '%#%' ), 'format' => '', 'current' => $query->get( 'paged' ), 'total' => $query->max_num_pages ) ) ); } else { echo esc_html( $query->found_posts ) . ' ' . esc_html( $query->get( 'lieve_total_unknown' ) ? __( 'shown', 'lieve-builder' ) : __( 'results', 'lieve-builder' ) ); } echo '</div>'; return;
	}
	if ( 0 !== strpos( $type, 'filter-' ) ) { return; }
	echo '<div' . $attributes . ' data-lieve-filter="' . esc_attr( sanitize_key( $query_id ) ) . '">';
	if ( 'filter-submit' === $type || 'filter-active-filters' === $type ) { echo '<button type="button" ' . ( 'filter-submit' === $type ? 'data-lieve-filter-submit' : 'data-lieve-filter-reset' ) . '>' . esc_html( 'filter-submit' === $type ? $label : 'Clear filters' ) . '</button>'; }
	elseif ( in_array( $type, array( 'filter-checkbox', 'filter-radio', 'filter-select' ), true ) ) {
		$terms = get_terms( array( 'taxonomy' => sanitize_key( $p['taxonomy'] ?? 'category' ), 'hide_empty' => true ) );
		if ( ! is_wp_error( $terms ) ) {
			if ( 'filter-select' === $type ) { echo '<label>' . esc_html( $label ) . '<select data-filter-key="terms"><option value="">All</option>'; }
			foreach ( $terms as $term ) { if ( 'filter-select' === $type ) { echo '<option value="' . (int) $term->term_id . '">' . esc_html( $term->name ) . '</option>'; } else { echo '<label><input type="' . ( 'filter-radio' === $type ? 'radio' : 'checkbox' ) . '" data-filter-key="terms" name="' . esc_attr( 'filter-' . $node['id'] ) . '" value="' . (int) $term->term_id . '">' . esc_html( $term->name ) . '</label>'; } }
			if ( 'filter-select' === $type ) { echo '</select></label>'; }
		}
	} else {
		$input_type = array( 'filter-datepicker' => 'date', 'filter-range' => 'range', 'filter-search' => 'search' )[ $type ] ?? 'text';
		$key = array( 'filter-datepicker' => 'date', 'filter-range' => 'price', 'filter-search' => 'search' )[ $type ] ?? 'search';
		$minimum = max( 0, (float) ( $p['minimum'] ?? 0 ) ); $maximum = max( $minimum, (float) ( $p['maximum'] ?? 100 ) );
		echo '<label>' . esc_html( $label ) . '<input type="' . esc_attr( $input_type ) . '" data-filter-key="' . esc_attr( $key ) . '"' . ( 'range' === $input_type ? ' min="' . $minimum . '" max="' . $maximum . '" value="' . $maximum . '"' : '' ) . '></label>';
	}
	echo '</div>';
}
