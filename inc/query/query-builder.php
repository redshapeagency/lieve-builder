<?php
/** Saved, bounded native WordPress queries. No SQL, PHP or public execution endpoint. */
defined( 'ABSPATH' ) || exit;
define( 'LIEVE_QUERIES_OPTION', 'lieve_saved_queries' );
require_once __DIR__ . '/query-builder-fields.php';

function lieve_query_types() {
	return array( 'posts' => 'Posts & products', 'terms' => 'Taxonomy terms', 'users' => 'Authors', 'comments' => 'Comments', 'current' => 'Current WordPress query' );
}
function lieve_query_defaults() {
	return array( 'id' => '', 'name' => '', 'slug' => '', 'description' => '', 'type' => 'posts', 'enabled' => true, 'trashed' => false, 'limit' => 12, 'offset' => 0, 'calculateTotal' => false, 'cache' => true, 'ttl' => 300, 'postTypes' => array( 'post' ), 'taxonomy' => 'category', 'hideEmpty' => true, 'parent' => '', 'include' => '', 'exclude' => '', 'author' => '', 'search' => '', 'role' => '', 'after' => '', 'before' => '', 'excludeCurrent' => false, 'coreRelation' => 'AND', 'core' => array(), 'metaRelation' => 'AND', 'taxRelation' => 'AND', 'meta' => array(), 'tax' => array(), 'sort' => array( array( 'field' => 'date', 'direction' => 'DESC' ) ) );
}
function lieve_query_order_fields( $type ) {
	$fields = array( 'posts' => array( 'date', 'modified', 'title', 'ID', 'menu_order', 'comment_count', 'post__in', 'meta_value', 'meta_value_num' ), 'current' => array( 'date', 'modified', 'title', 'ID', 'menu_order', 'comment_count', 'post__in', 'meta_value', 'meta_value_num' ), 'terms' => array( 'name', 'slug', 'term_id', 'count', 'include', 'meta_value', 'meta_value_num' ), 'users' => array( 'display_name', 'ID', 'registered', 'include', 'meta_value', 'meta_value_num' ), 'comments' => array( 'comment_date_gmt', 'comment_ID', 'comment_author', 'comment_post_ID', 'meta_value', 'meta_value_num' ) );
	return $fields[ $type ] ?? array();
}
function lieve_query_error( $message, $status = 400 ) { return new WP_Error( 'lieve_query_invalid', $message, array( 'status' => $status ) ); }
function lieve_query_list( $value ) { return is_array( $value ) && array_values( $value ) === $value; }

/** Strict import/save validation; unknown arguments cannot reach WP query constructors. */
function lieve_query_validate( $raw ) {
	if ( ! is_array( $raw ) || false === wp_json_encode( $raw ) || array_diff( array_keys( $raw ), array_keys( lieve_query_defaults() ) ) ) { return lieve_query_error( 'Unknown query fields. Import a Lieve Query Builder file.' ); }
	$q = array_replace( lieve_query_defaults(), $raw );
	if ( ! is_string( $q['id'] ) || ! preg_match( '/^q_[a-zA-Z0-9_-]{6,70}$/D', $q['id'] ) || ! is_string( $q['slug'] ) || ! preg_match( '/^[a-z][a-z0-9_-]{0,79}$/D', $q['slug'] ) || ! is_string( $q['name'] ) || '' === trim( $q['name'] ) || strlen( $q['name'] ) > 160 || ! is_string( $q['type'] ) || ! isset( lieve_query_types()[ $q['type'] ] ) ) { return lieve_query_error( 'Every query needs a name, a unique ID and a unique key beginning with a lowercase letter.' ); }
	$q['name'] = sanitize_text_field( $q['name'] );
	if ( '' === trim( $q['name'] ) ) { return lieve_query_error( 'Every query needs a name containing visible text.' ); }
	foreach ( array( 'enabled', 'trashed', 'calculateTotal', 'cache', 'hideEmpty', 'excludeCurrent' ) as $key ) { if ( ! is_bool( $q[ $key ] ) ) { return lieve_query_error( 'Query switches must be true or false.' ); } }
	foreach ( array( 'limit' => array( 1, 100 ), 'offset' => array( 0, 10000 ), 'ttl' => array( 10, 86400 ) ) as $key => $range ) { if ( ! is_int( $q[ $key ] ) || $q[ $key ] < $range[0] || $q[ $key ] > $range[1] ) { return lieve_query_error( 'Use 1–100 items, an offset up to 10,000 and a cache lifetime of 10–86,400 seconds.' ); } }
	foreach ( array( 'description' => 1000, 'taxonomy' => 80, 'role' => 80, 'parent' => 240, 'include' => 2000, 'exclude' => 2000, 'author' => 240, 'search' => 240, 'after' => 80, 'before' => 80 ) as $key => $max ) {
		if ( ! is_string( $q[ $key ] ) || strlen( $q[ $key ] ) > $max || preg_match( '/[<>\x00-\x08\x0b\x0c\x0e-\x1f]/', $q[ $key ] ) ) { return lieve_query_error( 'Invalid query text: ' . $key . '.' ); }
		$q[ $key ] = trim( $q[ $key ] );
	}
	if ( ! preg_match( '/^[a-zA-Z0-9_-]+$/D', $q['taxonomy'] ) || ( $q['role'] && ! preg_match( '/^[a-zA-Z0-9_-]+$/D', $q['role'] ) ) || ! lieve_query_list( $q['postTypes'] ) || ! $q['postTypes'] || count( $q['postTypes'] ) > 30 ) { return lieve_query_error( 'Choose valid content types and a taxonomy.' ); }
	foreach ( $q['postTypes'] as $type ) { if ( ! is_string( $type ) || ! preg_match( '/^[a-zA-Z0-9_-]{1,80}$/D', $type ) ) { return lieve_query_error( 'Invalid post type.' ); } }
	foreach ( array( 'after', 'before' ) as $key ) { if ( $q[ $key ] && '{today}' !== $q[ $key ] && ! lieve_query_date_valid( $q[ $key ] ) ) { return lieve_query_error( 'Dates use YYYY-MM-DD or {today}.' ); } }
	foreach ( array( 'parent', 'include', 'exclude', 'author' ) as $key ) { if ( ! lieve_query_id_text_valid( $q[ $key ] ) ) { return lieve_query_error( 'ID filters accept numbers, comma-separated lists and supported numeric dynamic values.' ); } }
	if ( ! in_array( $q['metaRelation'], array( 'AND', 'OR' ), true ) || ! in_array( $q['taxRelation'], array( 'AND', 'OR' ), true ) ) { return lieve_query_error( 'Filter relations must be AND or OR.' ); }
	$core_valid = lieve_query_validate_core_filters( $q ); if ( is_wp_error( $core_valid ) ) { return $core_valid; }
	foreach ( array( 'meta', 'tax' ) as $kind ) {
		if ( ! lieve_query_list( $q[ $kind ] ) || count( $q[ $kind ] ) > 20 ) { return lieve_query_error( 'Use at most 20 rows per filter group.' ); }
		foreach ( $q[ $kind ] as $row ) {
			if ( ! is_array( $row ) || array_diff( array_keys( $row ), 'meta' === $kind ? array( 'key', 'compare', 'value', 'type' ) : array( 'taxonomy', 'operator', 'terms', 'field', 'includeChildren' ) ) ) { return lieve_query_error( 'Invalid filter row.' ); }
			if ( 'meta' === $kind ) {
				if ( ! is_string( $row['key'] ?? null ) || ! preg_match( '/^[a-zA-Z0-9_.-]{1,120}$/D', $row['key'] ) || ! in_array( $row['compare'] ?? '', array( '=', '!=', '>', '>=', '<', '<=', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'BETWEEN', 'NOT BETWEEN', 'EXISTS', 'NOT EXISTS' ), true ) || ! in_array( $row['type'] ?? '', array( 'CHAR', 'NUMERIC', 'DECIMAL', 'SIGNED', 'UNSIGNED', 'DATE', 'DATETIME', 'BINARY' ), true ) || ! is_string( $row['value'] ?? null ) || strlen( $row['value'] ) > 1000 ) { return lieve_query_error( 'Complete every custom-field filter with a key, comparison, value and value type.' ); }
				if ( in_array( $row['compare'], array( 'BETWEEN', 'NOT BETWEEN' ), true ) && count( explode( ',', $row['value'] ) ) !== 2 ) { return lieve_query_error( 'BETWEEN needs two comma-separated values.' ); }
			} elseif ( ! is_string( $row['taxonomy'] ?? null ) || ! preg_match( '/^[a-zA-Z0-9_-]{1,80}$/D', $row['taxonomy'] ) || ! in_array( $row['operator'] ?? '', array( 'IN', 'NOT IN', 'AND', 'EXISTS', 'NOT EXISTS' ), true ) || ! is_string( $row['terms'] ?? null ) || strlen( $row['terms'] ) > 2000 || ( ! in_array( $row['operator'], array( 'EXISTS', 'NOT EXISTS' ), true ) && '' === trim( $row['terms'] ) ) ) { return lieve_query_error( 'Complete every taxonomy filter with a taxonomy, operator and term IDs.' ); }
			if ( 'tax' === $kind ) {
				$field = $row['field'] ?? 'term_id';
				if ( ! in_array( $field, array( 'term_id', 'term_taxonomy_id', 'slug', 'name' ), true ) || isset( $row['includeChildren'] ) && ! is_bool( $row['includeChildren'] ) ) { return lieve_query_error( 'Choose a valid taxonomy field and child-term switch.' ); }
				if ( in_array( $field, array( 'term_id', 'term_taxonomy_id' ), true ) && ! lieve_query_id_text_valid( $row['terms'] ) ) { return lieve_query_error( 'Taxonomy ID filters need term IDs or supported numeric dynamic values.' ); }
			}
		}
	}
	if ( ! lieve_query_list( $q['sort'] ) || ! $q['sort'] || count( $q['sort'] ) > 5 ) { return lieve_query_error( 'Choose one to five sorting rules.' ); }
	if ( 'terms' === $q['type'] && count( $q['sort'] ) > 1 ) { return lieve_query_error( 'Taxonomy queries support one sorting rule.' ); }
	$used = array(); foreach ( $q['sort'] as $row ) {
		if ( ! is_array( $row ) || array_diff( array_keys( $row ), array( 'field', 'direction' ) ) || ! in_array( $row['field'] ?? '', lieve_query_order_fields( $q['type'] ), true ) || isset( $used[ $row['field'] ] ) || ! in_array( $row['direction'] ?? '', array( 'ASC', 'DESC' ), true ) ) { return lieve_query_error( 'Sorting fields must be valid, unique and ascending or descending.' ); }
		if ( in_array( $row['field'], array( 'meta_value', 'meta_value_num' ), true ) && empty( $q['meta'] ) ) { return lieve_query_error( 'Custom-field sorting requires at least one custom-field filter.' ); }
		if ( in_array( $row['field'], array( 'include', 'post__in' ), true ) && '' === $q['include'] ) { return lieve_query_error( 'Sorting by included IDs requires an Include IDs filter.' ); }
		$used[ $row['field'] ] = true;
	}
	$q['description'] = sanitize_textarea_field( $q['description'] ); $q['postTypes'] = array_values( array_unique( $q['postTypes'] ) );
	return $q;
}
function lieve_query_date_valid( $date ) { return is_string( $date ) && preg_match( '/^(\d{4})-(\d{2})-(\d{2})$/D', $date, $m ) && checkdate( (int) $m[2], (int) $m[3], (int) $m[1] ); }
function lieve_query_id_text_valid( $value ) {
	if ( '' === trim( $value ) ) { return true; }
	$value = str_replace( array( '{current_post_id}', '{current_author_id}', '{current_user_id}', '{queried_id}' ), '0', $value );
	return (bool) preg_match( '/^\s*\d+(?:[\s,]+\d+)*\s*$/D', $value ) && count( preg_split( '/[\s,]+/', trim( $value ) ) ) <= 200;
}
function lieve_queries_validate( $raw ) {
	if ( ! is_array( $raw ) || array_diff( array_keys( $raw ), array( 'version', 'queries' ) ) || 1 !== ( $raw['version'] ?? null ) || ! lieve_query_list( $raw['queries'] ?? null ) || count( $raw['queries'] ) > 200 || strlen( wp_json_encode( $raw ) ) > 1048576 ) { return lieve_query_error( 'Use a version 1 Lieve query library with up to 200 queries and a maximum size of 1 MB.' ); }
	$data = array( 'version' => 1, 'queries' => array() ); $ids = array(); $slugs = array();
	foreach ( $raw['queries'] as $raw_query ) {
		$q = lieve_query_validate( $raw_query ); if ( is_wp_error( $q ) ) { return $q; }
		if ( isset( $ids[ $q['id'] ] ) || isset( $slugs[ $q['slug'] ] ) ) { return lieve_query_error( 'Each query ID and key must be unique, including queries in Trash.' ); }
		$ids[ $q['id'] ] = true; $slugs[ $q['slug'] ] = true; $data['queries'][] = $q;
	} return $data;
}
function lieve_queries_data() {
	static $last = null, $clean = null;
	$raw = get_option( LIEVE_QUERIES_OPTION, array( 'version' => 1, 'queries' => array() ) );
	if ( null === $clean || $last !== $raw ) { $last = $raw; $clean = lieve_queries_validate( $raw ); if ( is_wp_error( $clean ) ) { $clean = array( 'version' => 1, 'queries' => array() ); } }
	return $clean;
}
function lieve_queries_revision( $data = null ) { return hash( 'sha256', wp_json_encode( $data ?? lieve_queries_data() ) ); }
function lieve_query_find( $key ) { foreach ( lieve_queries_data()['queries'] as $q ) { if ( $q['id'] === $key || $q['slug'] === $key ) { return $q; } } return null; }
function lieve_query_choices( $posts_only = false ) {
	$out = array( '' => 'Use element settings' );
	foreach ( lieve_queries_data()['queries'] as $q ) { if ( $q['enabled'] && ! $q['trashed'] && ( ! $posts_only || in_array( $q['type'], array( 'posts', 'current' ), true ) ) ) { $out[ $q['id'] ] = $q['name'] . ' · ' . $q['slug']; } }
	return $out;
}

/** Only named, bounded values; never eval, arbitrary query vars or arbitrary callbacks. */
function lieve_query_resolve( $text, $context ) {
	$post = get_post( (int) ( $context['postId'] ?? get_the_ID() ) );
	$values = array( '{current_post_id}' => $post ? $post->ID : 0, '{current_author_id}' => $post ? $post->post_author : 0, '{current_user_id}' => get_current_user_id(), '{queried_id}' => get_queried_object_id(), '{search}' => get_search_query( false ), '{today}' => current_time( 'Y-m-d' ) );
	return strtr( $text, array_map( 'strval', $values ) );
}
function lieve_query_ids( $text, $context ) {
	$text = lieve_query_resolve( $text, $context );
	if ( '' === trim( $text ) ) { return array(); }
	$parts = preg_split( '/[\s,]+/', trim( $text ), -1, PREG_SPLIT_NO_EMPTY );
	if ( count( $parts ) > 200 || array_filter( $parts, static function( $id ) { return ! ctype_digit( $id ); } ) ) { return lieve_query_error( 'ID filters accept positive numbers, comma-separated lists or supported dynamic values.' ); }
	return array_values( array_unique( array_map( 'absint', $parts ) ) ); // Keep 0: an unresolved context must match nothing, not everything.
}
function lieve_query_args( $q, $context = array() ) {
	$page = min( 10000, max( 1, (int) ( $context['page'] ?? 1 ) ) ); $offset = $q['offset'] + ( $page - 1 ) * $q['limit'];
	$include = lieve_query_ids( $q['include'], $context ); $exclude = lieve_query_ids( $q['exclude'], $context );
	if ( is_wp_error( $include ) || is_wp_error( $exclude ) ) { return is_wp_error( $include ) ? $include : $exclude; }
	if ( $include && $exclude ) { $include = array_values( array_diff( $include, $exclude ) ) ?: array( 0 ); }
	$meta = array( 'relation' => $q['metaRelation'] );
	foreach ( $q['meta'] as $row ) {
		$row['value'] = lieve_query_resolve( $row['value'], $context );
		if ( in_array( $row['compare'], array( 'IN', 'NOT IN', 'BETWEEN', 'NOT BETWEEN' ), true ) ) { $row['value'] = array_map( 'trim', explode( ',', $row['value'] ) ); }
		$meta[] = $row;
	}
	$order = array(); foreach ( $q['sort'] as $sort ) { $order[ $sort['field'] ] = $sort['direction']; }
	$common = array( 'orderby' => $order, 'meta_query' => count( $meta ) > 1 ? $meta : array() );
	if ( $q['meta'] && array_intersect( array_keys( $order ), array( 'meta_value', 'meta_value_num' ) ) ) { $common['meta_key'] = $q['meta'][0]['key']; }
	$search = lieve_query_resolve( $q['search'], $context );
	if ( in_array( $q['type'], array( 'posts', 'current' ), true ) ) {
		$public_types = get_post_types( array( 'public' => true ), 'names' );
		$types = 'current' === $q['type'] ? array_values( $public_types ) : array_values( array_intersect( $q['postTypes'], $public_types ) );
		if ( ! $types ) { return lieve_query_error( 'None of the configured post types is publicly queryable.' ); }
		$author = lieve_query_ids( $q['author'], $context ); if ( is_wp_error( $author ) ) { return $author; }
		if ( $q['excludeCurrent'] ) { $exclude[] = (int) ( $context['postId'] ?? get_the_ID() ); }
		if ( $include && $exclude ) { $include = array_values( array_diff( $include, $exclude ) ) ?: array( 0 ); }
		$args = $common + array( 'post_type' => $types, 'post_status' => 'publish', 'has_password' => false, 'posts_per_page' => $q['limit'], 'offset' => $offset, 'paged' => $page, 'ignore_sticky_posts' => true, 'no_found_rows' => ! $q['calculateTotal'], 'fields' => 'ids', 's' => $search, 'post__in' => $include, 'post__not_in' => $exclude, 'author__in' => $author );
		$tax = array( 'relation' => $q['taxRelation'] ); foreach ( $q['tax'] as $row ) {
			$taxonomy = get_taxonomy( $row['taxonomy'] ); if ( ! $taxonomy || ! $taxonomy->public ) { return lieve_query_error( 'A taxonomy filter references an unavailable or non-public taxonomy.' ); }
			$field = $row['field'] ?? 'term_id'; $terms = in_array( $field, array( 'term_id', 'term_taxonomy_id' ), true ) ? lieve_query_ids( $row['terms'], $context ) : array_map( 'trim', explode( ',', lieve_query_resolve( $row['terms'], $context ) ) ); if ( is_wp_error( $terms ) ) { return $terms; }
			$tax[] = array( 'taxonomy' => $row['taxonomy'], 'field' => $field, 'terms' => $terms, 'operator' => $row['operator'], 'include_children' => $row['includeChildren'] ?? true );
		} if ( count( $tax ) > 1 ) { $args['tax_query'] = $tax; }
		$date = array( 'inclusive' => true ); foreach ( array( 'after', 'before' ) as $key ) { if ( $q[ $key ] ) { $date[ $key ] = lieve_query_resolve( $q[ $key ], $context ); } }
		if ( count( $date ) > 1 ) { $args['date_query'] = array( $date ); }
		// Frontend filters narrow the saved policy, even when its own rule group uses OR.
		if ( ! empty( $context['taxFilter'] ) ) {
			$filter = $context['taxFilter']; $taxonomy = get_taxonomy( $filter['taxonomy'] ); $terms = lieve_query_ids( $filter['terms'], $context );
			if ( ! $taxonomy || ! $taxonomy->public || is_wp_error( $terms ) ) { return lieve_query_error( 'Invalid frontend taxonomy filter.' ); }
			$args['tax_query'] = array_filter( array( 'relation' => 'AND', $args['tax_query'] ?? array(), array( 'taxonomy' => $filter['taxonomy'], 'field' => 'term_id', 'terms' => $terms, 'operator' => 'IN' ) ) );
		}
		if ( isset( $context['maxPrice'] ) && in_array( 'product', $types, true ) ) { $args['meta_query'] = array_filter( array( 'relation' => 'AND', $args['meta_query'], array( 'key' => '_price', 'value' => max( 0, (float) $context['maxPrice'] ), 'compare' => '<=', 'type' => 'NUMERIC' ) ) ); }
		if ( ! empty( $context['after'] ) && lieve_query_date_valid( $context['after'] ) ) { $args['date_query'][] = array( 'after' => $context['after'], 'inclusive' => true ); }
		return $args;
	}
	if ( 'terms' === $q['type'] ) {
		$taxonomy = get_taxonomy( $q['taxonomy'] ); if ( ! $taxonomy || ! $taxonomy->public ) { return lieve_query_error( 'Choose a registered public taxonomy.' ); }
		$args = $common + array( 'taxonomy' => $q['taxonomy'], 'number' => $q['limit'], 'offset' => $offset, 'hide_empty' => $q['hideEmpty'], 'include' => $include, 'exclude' => $exclude, 'search' => $search, 'fields' => 'ids' );
		// WP_Term_Query accepts a single sort column, unlike post/user/comment queries.
		$args['orderby'] = $q['sort'][0]['field']; $args['order'] = $q['sort'][0]['direction'];
		if ( '' !== $q['parent'] ) { $parent = lieve_query_ids( $q['parent'], $context ); if ( is_wp_error( $parent ) || count( $parent ) !== 1 ) { return lieve_query_error( 'Parent term needs one ID or a supported dynamic value.' ); } $args['parent'] = $parent[0]; }
		return $args;
	}
	if ( 'users' === $q['type'] ) { return $common + array( 'number' => $q['limit'], 'offset' => $offset, 'include' => $include, 'exclude' => $exclude, 'search' => $search ? '*' . $search . '*' : '', 'search_columns' => array( 'display_name', 'user_nicename' ), 'role' => $q['role'], 'has_published_posts' => true, 'count_total' => $q['calculateTotal'], 'fields' => 'ID' ); }
	return $common + array( 'number' => $q['limit'], 'offset' => $offset, 'comment__in' => $include, 'comment__not_in' => $exclude, 'search' => $search, 'status' => 'approve', 'post_status' => 'publish', 'post_type' => array_values( get_post_types( array( 'public' => true ), 'names' ) ), 'type' => 'comment', 'no_found_rows' => true, 'fields' => 'ids' );
}

/** IDs only in cache; core object/meta priming handles hydration, never one query per row. */
function lieve_query_hydrate( $type, $ids ) {
	if ( in_array( $type, array( 'posts', 'current' ), true ) ) { _prime_post_caches( $ids, true, true ); return array_values( array_filter( array_map( 'get_post', $ids ), static function( $post ) { return $post && is_post_publicly_viewable( $post ) && ! $post->post_password; } ) ); }
	if ( 'terms' === $type ) { _prime_term_caches( $ids, true ); return array_values( array_filter( array_map( 'get_term', $ids ), static function( $term ) { return $term && ! is_wp_error( $term ); } ) ); }
	if ( 'users' === $type ) { cache_users( $ids ); return array_values( array_filter( array_map( 'get_userdata', $ids ) ) ); }
	_prime_comment_caches( $ids, true );
	$items = array_values( array_filter( array_map( 'get_comment', $ids ) ) );
	_prime_post_caches( array_values( array_unique( array_map( static function( $item ) { return (int) $item->comment_post_ID; }, $items ) ) ), false, false );
	return array_values( array_filter( $items, static function( $item ) { $post = get_post( $item->comment_post_ID ); return '1' === (string) $item->comment_approved && $post && is_post_publicly_viewable( $post ) && ! $post->post_password; } ) );
}
function lieve_query_invalidate() { wp_cache_set_last_changed( 'lieve_queries' ); }
foreach ( array( 'clean_post_cache', 'clean_term_cache', 'clean_user_cache', 'clean_comment_cache', 'set_object_terms', 'added_post_meta', 'updated_post_meta', 'deleted_post_meta', 'added_term_meta', 'updated_term_meta', 'deleted_term_meta', 'added_user_meta', 'updated_user_meta', 'deleted_user_meta', 'added_comment_meta', 'updated_comment_meta', 'deleted_comment_meta' ) as $lieve_query_hook ) { add_action( $lieve_query_hook, 'lieve_query_invalidate', 10, 0 ); }

/** Public PHP API: result contains native objects, total (or null), pages and measured cache statistics. */
function lieve_query_run( $key, $context = array(), $bypass_cache = false ) {
	$q = is_array( $key ) ? lieve_query_validate( $key ) : lieve_query_find( $key );
	if ( is_wp_error( $q ) ) { return $q; }
	if ( ! $q || ! $q['enabled'] || $q['trashed'] ) { return lieve_query_error( 'This saved query is missing, disabled or in Trash.', 404 ); }
	$started = microtime( true ); global $wpdb; $before = $wpdb->num_queries;
	$args = lieve_query_args( $q, $context ); if ( is_wp_error( $args ) ) { return $args; }
	$main = null;
	if ( 'current' === $q['type'] ) {
		$main = $GLOBALS['wp_the_query'] ?? null;
		if ( ! $main || is_admin() || defined( 'REST_REQUEST' ) && REST_REQUEST ) {
			$post_id = (int) ( $context['postId'] ?? 0 );
			if ( ! $post_id ) { return lieve_query_error( 'Select a context page to preview the current WordPress query.' ); }
			$main_ids = array( $post_id );
		} else {
			$main_ids = array_map( static function( $post ) { return is_object( $post ) ? $post->ID : (int) $post; }, (array) $main->posts );
		}
		$args['post__in'] = $args['post__in'] ? array_values( array_intersect( $main_ids, $args['post__in'] ) ) ?: array( 0 ) : ( $main_ids ?: array( 0 ) );
		if ( $args['post__not_in'] ) { $args['post__in'] = array_values( array_diff( $args['post__in'], $args['post__not_in'] ) ) ?: array( 0 ); }
	}
	$args = apply_filters( 'lieve_saved_query_args', $args, $q, $context );
	$where = lieve_query_core_where( $q, $context ); if ( is_wp_error( $where ) ) { return $where; }
	if ( $where ) { $args['lieve_query_scope'] = hash( 'sha256', $where ); $args['suppress_filters'] = false; }
	$cache_key = hash( 'sha256', wp_json_encode( array( $q, $args, get_current_blog_id(), get_current_user_id(), determine_locale(), wp_cache_get_last_changed( 'posts' ), wp_cache_get_last_changed( 'terms' ), wp_cache_get_last_changed( 'lieve_queries' ) ) ) );
	$hit = false; $result = $q['cache'] && ! $bypass_cache ? wp_cache_get( $cache_key, 'lieve_query_results', false, $hit ) : false;
	if ( ! $hit ) {
		$field_filters = lieve_query_install_field_filters( $q['type'], $args['lieve_query_scope'] ?? '', $where );
		try {
		$total = null;
		if ( in_array( $q['type'], array( 'posts', 'current' ), true ) ) { $query = new WP_Query( $args ); $ids = $query->posts; if ( $q['calculateTotal'] ) { $total = max( 0, (int) $query->found_posts - $q['offset'] ); } }
		elseif ( 'terms' === $q['type'] ) { $query = new WP_Term_Query( $args ); $ids = $query->terms; if ( is_wp_error( $ids ) ) { return $ids; } if ( $q['calculateTotal'] ) { $count_args = array_replace( $args, array( 'fields' => 'count', 'number' => 0, 'offset' => 0 ) ); $count = get_terms( $count_args ); if ( is_wp_error( $count ) ) { return $count; } $total = max( 0, (int) $count - $q['offset'] ); } }
		elseif ( 'users' === $q['type'] ) { $query = new WP_User_Query( $args ); $ids = $query->get_results(); if ( $q['calculateTotal'] ) { $total = max( 0, (int) $query->get_total() - $q['offset'] ); } }
		else { $query = new WP_Comment_Query( $args ); $ids = $query->comments; }
		$result = array( 'ids' => array_values( array_map( 'intval', $ids ?: array() ) ), 'total' => $total );
		} finally { foreach ( $field_filters as $filter ) { remove_filter( $filter[0], $filter[1], 10 ); } }
		if ( $q['cache'] && ! $bypass_cache ) { wp_cache_set( $cache_key, $result, 'lieve_query_results', $q['ttl'] ); }
	}
	$items = lieve_query_hydrate( $q['type'], $result['ids'] );
	return array( 'query' => $q, 'items' => $items, 'total' => $result['total'], 'pages' => null === $result['total'] ? null : (int) ceil( $result['total'] / $q['limit'] ), 'page' => min( 10000, max( 1, (int) ( $context['page'] ?? 1 ) ) ), 'cacheHit' => $hit, 'cacheState' => ! $q['cache'] ? 'Off' : ( $bypass_cache ? 'Bypassed' : ( $hit ? 'Hit' : 'Miss' ) ), 'durationMs' => round( ( microtime( true ) - $started ) * 1000, 2 ), 'dbQueries' => $wpdb->num_queries - $before );
}

/** Presentation-safe records only: never expose emails, passwords, meta or SQL in preview. */
function lieve_query_records( $result ) {
	$records = array(); foreach ( $result['items'] as $item ) {
		switch ( $result['query']['type'] ) {
			case 'terms': $url = get_term_link( $item ); $records[] = array( 'id' => (int) $item->term_id, 'title' => $item->name, 'url' => is_wp_error( $url ) ? '' : $url, 'description' => wp_strip_all_tags( $item->description ), 'type' => $item->taxonomy ); break;
			case 'users': $records[] = array( 'id' => (int) $item->ID, 'title' => $item->display_name, 'url' => get_author_posts_url( $item->ID ), 'description' => '', 'type' => 'author' ); break;
			case 'comments': $records[] = array( 'id' => (int) $item->comment_ID, 'title' => get_comment_author( $item ), 'url' => get_comment_link( $item ), 'description' => wp_trim_words( wp_strip_all_tags( $item->comment_content ), 24 ), 'type' => 'comment' ); break;
			default: $records[] = array( 'id' => (int) $item->ID, 'title' => get_the_title( $item ), 'url' => get_permalink( $item ), 'description' => wp_trim_words( wp_strip_all_tags( $item->post_excerpt ?: $item->post_content ), 24 ), 'type' => $item->post_type );
		}
	} return $records;
}

require_once __DIR__ . '/query-builder-rest.php';
if ( is_admin() ) { require_once __DIR__ . '/query-builder-admin.php'; }
