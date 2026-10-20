<?php
/** Allowlisted field filters and administrative record inspection. Never accepts SQL identifiers. */
defined( 'ABSPATH' ) || exit;

function lieve_query_core_fields( $type ) {
	$post = array( 'ID' => array( 'Post ID', 'number' ), 'post_title' => array( 'Title', 'text' ), 'post_name' => array( 'Slug', 'text' ), 'post_parent' => array( 'Parent ID', 'number' ), 'post_author' => array( 'Author ID', 'number' ), 'post_date' => array( 'Published date', 'date' ), 'post_date_gmt' => array( 'Published date (UTC)', 'date' ), 'post_modified' => array( 'Modified date', 'date' ), 'post_modified_gmt' => array( 'Modified date (UTC)', 'date' ), 'menu_order' => array( 'Menu order', 'number' ), 'comment_count' => array( 'Comment count', 'number' ), 'post_excerpt' => array( 'Excerpt', 'text' ), 'post_content' => array( 'Content', 'text' ) );
	$post += array( 'post_type' => array( 'Post type', 'text' ), 'post_status' => array( 'Post status', 'text' ), 'post_mime_type' => array( 'MIME type', 'text' ), 'comment_status' => array( 'Comment status', 'text' ), 'ping_status' => array( 'Ping status', 'text' ) );
	$fields = array(
		'posts' => $post, 'current' => $post,
		'terms' => array( 'term_id' => array( 'Term ID', 'number' ), 'name' => array( 'Name', 'text' ), 'slug' => array( 'Slug', 'text' ), 'parent' => array( 'Parent ID', 'number' ), 'count' => array( 'Object count', 'number' ), 'description' => array( 'Description', 'text' ), 'term_group' => array( 'Term group', 'number' ), 'taxonomy' => array( 'Taxonomy', 'text' ), 'term_taxonomy_id' => array( 'Term taxonomy ID', 'number' ) ),
		'users' => array( 'ID' => array( 'Author ID', 'number' ), 'display_name' => array( 'Display name', 'text' ), 'user_nicename' => array( 'Public slug', 'text' ), 'user_registered' => array( 'Registered date', 'date' ), 'user_url' => array( 'Website URL', 'text' ) ),
		'comments' => array( 'comment_ID' => array( 'Comment ID', 'number' ), 'comment_post_ID' => array( 'Post ID', 'number' ), 'user_id' => array( 'Author user ID', 'number' ), 'comment_author' => array( 'Author name', 'text' ), 'comment_parent' => array( 'Parent comment ID', 'number' ), 'comment_date' => array( 'Comment date', 'date' ), 'comment_date_gmt' => array( 'Comment date (UTC)', 'date' ), 'comment_content' => array( 'Content', 'text' ), 'comment_type' => array( 'Comment type', 'text' ), 'comment_approved' => array( 'Approval status', 'text' ), 'comment_author_url' => array( 'Author website URL', 'text' ) ),
	);
	$out = array(); foreach ( $fields[ $type ] ?? array() as $key => $definition ) { $out[ $key ] = array( 'label' => $definition[0], 'type' => $definition[1] ); }
	return $out;
}

function lieve_query_field_operators( $type ) {
	return 'text' === $type ? array( '=', '!=', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN' ) : array( '=', '!=', '>', '>=', '<', '<=', 'IN', 'NOT IN', 'BETWEEN', 'NOT BETWEEN' );
}

function lieve_query_core_values( $row, $type, $context = null ) {
	$value = null === $context ? str_replace( array( '{current_post_id}', '{current_author_id}', '{current_user_id}', '{queried_id}', '{today}' ), array( '0', '0', '0', '0', '2000-01-01' ), $row['value'] ) : lieve_query_resolve( $row['value'], $context );
	$values = in_array( $row['compare'], array( 'IN', 'NOT IN', 'BETWEEN', 'NOT BETWEEN' ), true ) ? array_map( 'trim', explode( ',', $value ) ) : array( $value );
	if ( count( $values ) > 200 || in_array( $row['compare'], array( 'BETWEEN', 'NOT BETWEEN' ), true ) && 2 !== count( $values ) ) { return lieve_query_error( 'Use at most 200 field values; BETWEEN needs exactly two comma-separated values.' ); }
	foreach ( $values as $part ) {
		if ( 'number' === $type && ( ! preg_match( '/^-?\d{1,15}$/D', trim( $part ) ) ) ) { return lieve_query_error( 'Numeric field filters need whole numbers or numeric dynamic values.' ); }
		if ( 'date' === $type ) {
			if ( ! preg_match( '/^(\d{4}-\d{2}-\d{2})(?: ([01]\d|2[0-3]):[0-5]\d:[0-5]\d)?$/D', trim( $part ), $match ) || ! lieve_query_date_valid( $match[1] ) ) { return lieve_query_error( 'Date field filters use YYYY-MM-DD, YYYY-MM-DD HH:MM:SS or {today}.' ); }
		}
	}
	return $values;
}

function lieve_query_validate_core_filters( $q ) {
	if ( ! lieve_query_list( $q['core'] ) || count( $q['core'] ) > 20 || ! in_array( $q['coreRelation'], array( 'AND', 'OR' ), true ) ) { return lieve_query_error( 'Use up to 20 WordPress field filters with an AND/OR relation.' ); }
	$fields = lieve_query_core_fields( $q['type'] );
	foreach ( $q['core'] as $row ) {
		if ( ! is_array( $row ) || array_diff( array_keys( $row ), array( 'field', 'compare', 'value' ) ) || ! is_string( $row['field'] ?? null ) || ! isset( $fields[ $row['field'] ] ) || ! in_array( $row['compare'] ?? null, lieve_query_field_operators( $fields[ $row['field'] ]['type'] ), true ) || ! is_string( $row['value'] ?? null ) || strlen( $row['value'] ) > 2000 || preg_match( '/[\x00-\x08\x0b\x0c\x0e-\x1f]/', $row['value'] ) ) { return lieve_query_error( 'Choose a valid WordPress field, comparison and value for every field filter.' ); }
		$valid = lieve_query_core_values( $row, $fields[ $row['field'] ]['type'] ); if ( is_wp_error( $valid ) ) { return $valid; }
	}
	return true;
}

/** Prepared WHERE fragments use only server-owned table/column maps and fixed operators. */
function lieve_query_core_where( $q, $context ) {
	if ( ! $q['core'] ) { return ''; }
	global $wpdb; $fields = lieve_query_core_fields( $q['type'] ); $clauses = array();
	foreach ( $q['core'] as $row ) {
		$type = $fields[ $row['field'] ]['type']; $values = lieve_query_core_values( $row, $type, $context ); if ( is_wp_error( $values ) ) { return $values; }
		$key = $row['field']; $operator = $row['compare'];
		if ( 'terms' === $q['type'] ) { $column = ( in_array( $key, array( 'parent', 'count', 'description', 'taxonomy', 'term_taxonomy_id' ), true ) ? 'tt.' : 't.' ) . $key; }
		else { $table = in_array( $q['type'], array( 'posts', 'current' ), true ) ? $wpdb->posts : ( 'users' === $q['type'] ? $wpdb->users : $wpdb->comments ); $column = $table . '.' . $key; }
		$placeholder = 'number' === $type ? '%d' : '%s';
		if ( in_array( $operator, array( 'LIKE', 'NOT LIKE' ), true ) ) { $values[0] = '%' . $wpdb->esc_like( $values[0] ) . '%'; }
		if ( in_array( $operator, array( 'IN', 'NOT IN' ), true ) ) { $sql = $column . ' ' . $operator . ' (' . implode( ', ', array_fill( 0, count( $values ), $placeholder ) ) . ')'; }
		elseif ( in_array( $operator, array( 'BETWEEN', 'NOT BETWEEN' ), true ) ) { $sql = $column . ' ' . $operator . ' ' . $placeholder . ' AND ' . $placeholder; }
		else { $sql = $column . ' ' . $operator . ' ' . $placeholder; }
		$clauses[] = $wpdb->prepare( $sql, $values );
	}
	return ' AND (' . implode( ' ' . $q['coreRelation'] . ' ', $clauses ) . ')';
}

/** Install for one bounded native execution, remove in finally (including count queries). */
function lieve_query_install_field_filters( $type, $scope, $where ) {
	if ( '' === $where ) { return array(); }
	if ( in_array( $type, array( 'posts', 'current' ), true ) ) {
		$hook = 'posts_where'; $callback = static function( $sql, $query ) use ( $scope, $where ) { return $scope === $query->get( 'lieve_query_scope' ) ? $sql . $where : $sql; }; $args = 2;
	} elseif ( 'terms' === $type ) {
		$hook = 'terms_clauses'; $callback = static function( $clauses, $taxonomies, $args ) use ( $scope, $where ) { if ( $scope === ( $args['lieve_query_scope'] ?? null ) ) { $clauses['where'] .= $where; } return $clauses; }; $args = 3;
	} elseif ( 'users' === $type ) {
		$hook = 'pre_user_query'; $callback = static function( $query ) use ( $scope, $where ) { if ( $scope === ( $query->query_vars['lieve_query_scope'] ?? null ) ) { $query->query_where .= $where; } }; $args = 1;
	} else {
		$hook = 'comments_clauses'; $callback = static function( $clauses, $query ) use ( $scope, $where ) { if ( $scope === ( $query->query_vars['lieve_query_scope'] ?? null ) ) { $clauses['where'] .= $where; } return $clauses; }; $args = 2;
	}
	add_filter( $hook, $callback, 10, $args ); return array( array( $hook, $callback ) );
}

/** Field names only. Public keys and registered schemas, never private metadata values. */
function lieve_query_meta_fields( $type ) {
	$object = in_array( $type, array( 'posts', 'current' ), true ) ? 'post' : ( 'terms' === $type ? 'term' : ( 'users' === $type ? 'user' : 'comment' ) );
	$keys = array(); $subtypes = array( '' );
	if ( 'post' === $object ) { $subtypes = array_merge( $subtypes, array_values( get_post_types( array( 'public' => true ), 'names' ) ) ); }
	if ( 'term' === $object ) { $subtypes = array_merge( $subtypes, array_values( get_taxonomies( array( 'public' => true ), 'names' ) ) ); }
	foreach ( $subtypes as $subtype ) { foreach ( get_registered_meta_keys( $object, $subtype ) as $key => $definition ) { if ( lieve_dynamic_meta_key_allowed( $key ) ) { $keys[ $key ] = ! empty( $definition['label'] ) && is_string( $definition['label'] ) ? $definition['label'] : $key; } } }
	global $wpdb; $table = $wpdb->{$object . 'meta'} ?? null;
	if ( $table ) { foreach ( $wpdb->get_col( "SELECT DISTINCT meta_key FROM {$table} WHERE meta_key NOT LIKE '\\_%' ORDER BY meta_key LIMIT 300" ) as $key ) { if ( lieve_dynamic_meta_key_allowed( $key ) ) { $keys[ $key ] = $keys[ $key ] ?? $key; } } }
	if ( 'post' === $object && function_exists( 'WC' ) ) { $keys += array( '_price' => 'Product price', '_regular_price' => 'Regular price', '_sale_price' => 'Sale price', '_sku' => 'Product SKU', '_stock' => 'Stock quantity', '_stock_status' => 'Stock status', '_weight' => 'Product weight' ); }
	natcasesort( $keys ); return array_slice( $keys, 0, 300, true );
}

function lieve_query_preview_value( $value, $depth = 0, &$budget = null, $structured = false ) {
	if ( null === $budget ) { $budget = 24000; }
	if ( $budget <= 0 ) { return '[Preview limit]'; }
	$budget -= 16;
	if ( $depth > 3 ) { return '[Nested value]'; }
	if ( $structured && is_string( $value ) ) {
		$serialized = is_serialized( $value ); $json = preg_match( '/^\s*[\[{]/', $value );
		if ( $serialized || $json ) {
			if ( strlen( $value ) > 16000 ) { return '[Structured value exceeds preview limit]'; }
			if ( $serialized ) {
				if ( preg_match( '/^[OCE]:/', $value ) ) { return '[Serialized object omitted]'; }
				$decoded = @unserialize( $value, array( 'allowed_classes' => false, 'max_depth' => 8 ) );
				if ( false === $decoded && 'b:0;' !== $value ) { return '[Serialized value omitted]'; }
				return lieve_query_preview_value( $decoded, $depth + 1, $budget, true );
			}
			$decoded = json_decode( $value, true, 8, JSON_BIGINT_AS_STRING );
			if ( JSON_ERROR_NONE === json_last_error() && is_array( $decoded ) ) { return lieve_query_preview_value( $decoded, $depth + 1, $budget, true ); }
			return '[Structured value omitted]';
		}
	}
	if ( is_string( $value ) ) { $length = max( 0, min( 4000, $budget ) ); $result = function_exists( 'mb_strcut' ) ? mb_strcut( $value, 0, $length, 'UTF-8' ) : wp_check_invalid_utf8( substr( $value, 0, $length ) ); $budget -= strlen( $result ); return $result; }
	if ( is_int( $value ) || is_float( $value ) || is_bool( $value ) || null === $value ) { return $value; }
	if ( ! is_array( $value ) ) { return '[Unsupported value]'; }
	$out = array(); foreach ( array_slice( $value, 0, 30, true ) as $key => $part ) { if ( $budget <= 0 ) { break; } if ( is_int( $key ) || lieve_dynamic_meta_key_allowed( (string) $key ) ) { $budget -= strlen( (string) $key ); $out[ $key ] = lieve_query_preview_value( $part, $depth + 1, $budget, $structured ); } } return $out;
}

/** Administrative inspection, with an explicit safe projection instead of serializing native objects. */
function lieve_query_preview_records( $result ) {
	$type = $result['query']['type']; $fields = lieve_query_core_fields( $type ); $records = array();
	$object = in_array( $type, array( 'posts', 'current' ), true ) ? 'post' : ( 'terms' === $type ? 'term' : ( 'users' === $type ? 'user' : 'comment' ) );
	foreach ( $result['items'] as $item ) {
		$record = array(); $budget = 24000; foreach ( $fields as $key => $definition ) { $record[ $key ] = lieve_query_preview_value( $item->$key ?? null, 0, $budget ); }
		$id_key = 'term' === $object ? 'term_id' : ( 'comment' === $object ? 'comment_ID' : 'ID' ); $id = (int) ( $item->$id_key ?? 0 );
		if ( 'post' === $object ) { $record['post_type'] = $item->post_type; $record['post_status'] = $item->post_status; }
		if ( 'term' === $object ) { $record['taxonomy'] = $item->taxonomy; }
		// Author profile metadata is not automatically disclosed, even through this administrative endpoint.
		$meta = 'user' === $object ? array() : get_metadata( $object, $id ); $record['meta'] = array();
		foreach ( is_array( $meta ) ? $meta : array() as $key => $values ) {
			$woo = 'post' === $object && 'product' === ( $item->post_type ?? '' ) && in_array( $key, array( '_price', '_regular_price', '_sale_price', '_sku', '_stock', '_stock_status', '_weight' ), true );
			if ( ( ! $woo && ! lieve_dynamic_meta_key_allowed( $key ) ) || count( $record['meta'] ) >= 30 || $budget <= 0 ) { continue; }
			// Project raw WordPress cache structures without constructing serialized classes.
			$budget -= strlen( $key ); $record['meta'][ $key ] = lieve_query_preview_value( 1 === count( $values ) ? reset( $values ) : $values, 0, $budget, true );
		}
		$records[] = $record;
	}
	return $records;
}
