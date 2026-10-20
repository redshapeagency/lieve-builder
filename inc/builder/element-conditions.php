<?php
/** Element visibility: validated data, trusted resolvers, no executable expressions. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_element_condition_catalog() {
	static $catalog;
	if ( null === $catalog ) { $catalog = json_decode( file_get_contents( __DIR__ . '/element-condition-catalog.json' ), true ); }
	return $catalog;
}

function lieve_element_condition_text( $value, $max ) {
	return is_string( $value ) && preg_match( '//u', $value ) && count( preg_split( '//u', $value, -1, PREG_SPLIT_NO_EMPTY ) ?: array() ) <= $max && ! preg_match( '/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $value );
}

function lieve_element_condition_order_value( $value ) {
	if ( ! is_string( $value ) ) { return false; }
	if ( preg_match( '/^-?(?:\d+(?:\.\d+)?|\.\d+)$/D', $value ) ) { return is_finite( (float) $value ); }
	if ( preg_match( '/^(\d{4})-(\d{2})-(\d{2})$/D', $value, $date ) ) { return checkdate( (int) $date[2], (int) $date[3], (int) $date[1] ); }
	return (bool) preg_match( '/^(?:[01]\d|2[0-3]):[0-5]\d$/D', $value );
}

function lieve_element_condition_errors( $value ) {
	$catalog = lieve_element_condition_catalog(); $errors = array(); $seen = array();
	if ( ! is_array( $value ) || 1 !== ( $value['version'] ?? null ) || ! is_bool( $value['enabled'] ?? null ) || ! in_array( $value['relation'] ?? null, array( 'all', 'any' ), true ) || ! is_array( $value['groups'] ?? null ) || array_values( $value['groups'] ) !== $value['groups'] || count( $value['groups'] ) > $catalog['groupLimit'] ) { return array( 'settings' => 'Invalid visibility settings. Reset conditions and try again.' ); }
	if ( $value['enabled'] && ! $value['groups'] ) { $errors['settings'] = 'Add a rule group or turn off conditions.'; }
	foreach ( $value['groups'] as $group ) {
		if ( ! is_array( $group ) || ! is_string( $group['id'] ?? null ) || ! preg_match( '/^lc_[a-f0-9]{16}$/D', $group['id'] ) || isset( $seen[ $group['id'] ] ) || ! lieve_element_condition_text( $group['name'] ?? null, 120 ) || ! in_array( $group['relation'] ?? null, array( 'all', 'any' ), true ) || ! is_array( $group['rules'] ?? null ) || ! $group['rules'] || array_values( $group['rules'] ) !== $group['rules'] || count( $group['rules'] ) > $catalog['ruleLimit'] ) { $errors['groups'] = 'Each group needs a unique ID, a name up to 120 characters and 1–16 rules.'; continue; }
		$seen[ $group['id'] ] = true;
		foreach ( $group['rules'] as $rule ) {
			$spec = is_string( $rule['source'] ?? null ) ? ( $catalog['sources'][ $rule['source'] ] ?? null ) : null;
			if ( ! is_array( $rule ) || ! is_string( $rule['id'] ?? null ) || ! preg_match( '/^lc_[a-f0-9]{16}$/D', $rule['id'] ) || isset( $seen[ $rule['id'] ] ) || ! $spec || ! is_string( $rule['operator'] ?? null ) || ! isset( $catalog['operators'][ $rule['operator'] ] ) || ! lieve_element_condition_text( $rule['parameter'] ?? null, 1200 ) || ! lieve_element_condition_text( $rule['value'] ?? null, 1200 ) ) { $errors[ is_string( $rule['id'] ?? null ) ? $rule['id'] : $group['id'] ] = 'Choose a valid source, comparison and text values.'; continue; }
			$seen[ $rule['id'] ] = true;
			if ( isset( $spec['parameter'] ) && ( '' === trim( $rule['parameter'] ) || ( 'dynamic' === $rule['source'] ? ! function_exists( 'lieve_dynamic_reference' ) || ! lieve_dynamic_reference( $rule['parameter'] ) : ! preg_match( '/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/D', $rule['parameter'] ) ) ) ) { $errors[ $rule['id'] ] = 'dynamic' === $rule['source'] ? 'Choose a dynamic value to check.' : 'Enter a valid ' . strtolower( $spec['parameter'] ) . '.'; }
			foreach ( array( $rule['parameter'], $rule['value'] ) as $operand ) { if ( false !== strpos( $operand, '{{lieve:' ) && ( ! function_exists( 'lieve_dynamic_reference' ) || ! lieve_dynamic_reference( $operand ) ) ) { $errors[ $rule['id'] ] = 'Use one complete dynamic binding, not mixed text.'; } }
			if ( in_array( $rule['operator'], array( 'gt', 'gte', 'lt', 'lte' ), true ) && ! ( function_exists( 'lieve_dynamic_reference' ) && lieve_dynamic_reference( $rule['value'] ) ) && ! lieve_element_condition_order_value( $rule['value'] ) ) { $errors[ $rule['id'] ] = 'Enter a number, valid YYYY-MM-DD date, HH:MM time or dynamic value.'; }
		}
	}
	return $errors;
}

/** Invalid legacy data must never silently become an unconditional element. */
function lieve_sanitize_element_conditions( $value ) {
	if ( lieve_element_condition_errors( $value ) ) { return array( 'version' => 0, 'enabled' => true, 'relation' => 'any', 'groups' => array() ); }
	$clean = array_intersect_key( $value, array_flip( array( 'version', 'enabled', 'relation', 'groups' ) ) );
	foreach ( $clean['groups'] as &$group ) { $group = array_intersect_key( $group, array_flip( array( 'id', 'name', 'relation', 'rules' ) ) ); foreach ( $group['rules'] as &$rule ) { $rule = array_intersect_key( $rule, array_flip( array( 'id', 'source', 'parameter', 'operator', 'value' ) ) ); } unset( $rule ); } unset( $group );
	return $clean;
}

function lieve_validate_document_element_conditions( $document ) {
	$walk = static function( $nodes, $depth = 0 ) use ( &$walk ) {
		if ( ! is_array( $nodes ) || $depth > 12 ) { return true; }
		foreach ( $nodes as $node ) {
			if ( ! is_array( $node ) ) { continue; }
			$props = is_array( $node['props'] ?? null ) ? $node['props'] : array();
			if ( array_key_exists( 'conditions', $props ) ) { $errors = lieve_element_condition_errors( $props['conditions'] ); if ( $errors ) { return new WP_Error( 'lieve_invalid_element_conditions', reset( $errors ), array( 'status' => 400, 'elementId' => $node['id'] ?? '', 'fields' => $errors ) ); } }
			$result = $walk( $node['children'] ?? array(), $depth + 1 ); if ( is_wp_error( $result ) ) { return $result; }
		}
		return true;
	};
	return $walk( $document['children'] ?? array() );
}

/** Dynamic callbacks are explicitly registered by trusted server code. Fail closed on errors. */
function lieve_element_condition_dynamic( $binding, $post, $context = array() ) {
	$ref = function_exists( 'lieve_dynamic_reference' ) ? lieve_dynamic_reference( $binding ) : null;
	$source = $ref ? ( lieve_dynamic_data_sources()[ $ref['source'] ] ?? null ) : null;
	if ( ! $source || ! is_callable( $source['resolve'] ?? null ) || null === ( $options = lieve_dynamic_options( $source, $ref['options'] ) ) ) { return null; }
	if ( ! empty( $context['preview'] ) && ( preg_match( '/^(?:archive|term|query|taxonomy)\./', $ref['source'] ) || 'site.url_parameter' === $ref['source'] || ! empty( $source['requestBound'] ) && ! preg_match( '/^(?:user|date)\./', $ref['source'] ) ) ) { return null; }
	try { $value = call_user_func( $source['resolve'], array( 'post' => $post, 'postId' => $post ? (int) $post->ID : 0, 'options' => $options, 'preview' => ! empty( $context['preview'] ), 'listing' => $GLOBALS['lieve_listing_context'] ?? null ) ); } catch ( Throwable $error ) { return null; }
	if ( ! is_scalar( $value ) ) { return null; }
	if ( is_bool( $value ) ) { $value = $value ? '1' : '0'; }
	if ( '' === (string) $value ) { $value = $options['fallback'] ?? ''; }
	return substr( wp_strip_all_tags( (string) $value ), 0, 20000 ) . $ref['unit'];
}

/** null means unavailable, never an empty value which a negative comparison could match. */
function lieve_element_condition_source( $rule, $context = array() ) {
	$post = $context['post'] ?? ( function_exists( 'lieve_dynamic_context_post' ) ? lieve_dynamic_context_post() : get_post() ); $id = $post ? (int) $post->ID : 0;
	$key = $rule['source']; $parameter = $rule['parameter']; $preview = ! empty( $context['preview'] );
	if ( 'dynamic' === $key ) { return lieve_element_condition_dynamic( $parameter, $post, $context ); }
	if ( 0 === strpos( $key, 'post.' ) ) {
		if ( ! $post || ! empty( $post->post_password ) ) { return null; }
		$fields = array( 'id' => 'ID', 'title' => 'post_title', 'type' => 'post_type', 'status' => 'post_status', 'parent' => 'post_parent', 'author' => 'post_author', 'comments' => 'comment_count' ); $field = substr( $key, 5 );
		if ( isset( $fields[ $field ] ) ) { return $post->{$fields[ $field ]} ?? null; }
		if ( 'date' === $field || 'modified' === $field ) { return substr( $post->{ 'date' === $field ? 'post_date' : 'post_modified' }, 0, 10 ); }
		if ( 'thumbnail' === $field ) { return has_post_thumbnail( $id ) ? '1' : '0'; }
		if ( 'terms' === $field || 'term_ids' === $field ) { if ( ! taxonomy_exists( $parameter ) ) { return null; } $terms = wp_get_post_terms( $id, $parameter, array( 'fields' => 'terms' === $field ? 'slugs' : 'ids' ) ); return is_wp_error( $terms ) ? null : $terms; }
	}
	if ( 'user.logged_in' === $key ) { return is_user_logged_in() ? '1' : '0'; }
	if ( 'user.id' === $key ) { return get_current_user_id(); }
	if ( 'user.roles' === $key ) { return wp_get_current_user()->roles; }
	if ( 'user.capability' === $key ) { return current_user_can( $parameter ) ? '1' : '0'; }
	if ( 'site.language' === $key ) { return get_bloginfo( 'language' ); }
	if ( 0 === strpos( $key, 'page.' ) ) {
		$field = substr( $key, 5 );
		if ( $preview ) {
			// A template has no unique public URL context. Never pretend the admin request is its preview.
			if ( ! $post || ( defined( 'LIEVE_TEMPLATE_POST_TYPE' ) && LIEVE_TEMPLATE_POST_TYPE === $post->post_type ) ) { return null; }
			if ( 'front' === $field ) { return 'page' === get_option( 'show_on_front' ) && (int) get_option( 'page_on_front' ) === $id ? '1' : '0'; }
			if ( 'home' === $field ) { return 'page' === get_option( 'show_on_front' ) && (int) get_option( 'page_for_posts' ) === $id ? '1' : '0'; }
			if ( 'singular' === $field ) { return (int) get_option( 'page_for_posts' ) !== $id ? '1' : '0'; }
			if ( in_array( $field, array( 'archive', 'search', '404' ), true ) ) { return '0'; }
			if ( 'paged' === $field ) { return 1; }
			return null;
		}
		$callbacks = array( 'front' => 'is_front_page', 'home' => 'is_home', 'singular' => 'is_singular', 'archive' => 'is_archive', 'search' => 'is_search', '404' => 'is_404' );
		if ( isset( $callbacks[ $field ] ) ) { return call_user_func( $callbacks[ $field ] ) ? '1' : '0'; }
		if ( 'paged' === $field ) { return max( 1, (int) get_query_var( 'paged' ), (int) get_query_var( 'page' ) ); }
		$object = get_queried_object(); return $object instanceof WP_Term ? ( 'taxonomy' === $field ? $object->taxonomy : $object->slug ) : null;
	}
	if ( 'request.path' === $key ) { return $preview ? ( $post && ( ! defined( 'LIEVE_TEMPLATE_POST_TYPE' ) || LIEVE_TEMPLATE_POST_TYPE !== $post->post_type ) ? wp_parse_url( get_permalink( $id ), PHP_URL_PATH ) : null ) : wp_parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH ); }
	if ( 'request.query' === $key ) { if ( $preview ) { return null; } $value = isset( $_GET[ $parameter ] ) ? wp_unslash( $_GET[ $parameter ] ) : ''; return is_scalar( $value ) ? substr( (string) $value, 0, 20000 ) : null; }
	if ( 'request.search' === $key ) { return $preview ? null : get_search_query( false ); }
	if ( 0 === strpos( $key, 'date.' ) ) { $formats = array( 'date.today' => 'Y-m-d', 'date.time' => 'H:i', 'date.weekday' => 'N', 'date.timestamp' => 'U' ); return 'date.timestamp' === $key ? time() : wp_date( $formats[ $key ] ); }
	if ( 0 === strpos( $key, 'woo.' ) ) {
		if ( ! function_exists( 'WC' ) ) { return null; }
		if ( 'woo.cart_count' === $key || 'woo.cart_total' === $key ) { $cart = WC()->cart; return $cart ? ( 'woo.cart_count' === $key ? $cart->get_cart_contents_count() : $cart->get_subtotal() ) : null; }
		$product = function_exists( 'wc_get_product' ) ? wc_get_product( $id ) : false; if ( ! $product ) { return null; }
		if ( 'woo.product_type' === $key ) { return $product->get_type(); }
		if ( 'woo.product_price' === $key ) { return $product->get_price(); }
		if ( 'woo.in_stock' === $key ) { return $product->is_in_stock() ? '1' : '0'; }
		if ( 'woo.on_sale' === $key ) { return $product->is_on_sale() ? '1' : '0'; }
		if ( 'woo.purchased' === $key ) { return get_current_user_id() && wc_customer_bought_product( '', get_current_user_id(), $id ) ? '1' : '0'; }
	}
	return null;
}

function lieve_element_condition_compare( $left, $operator, $right ) {
	if ( null === $left || null === $right ) { return null; }
	$values = is_array( $left ) ? array_map( 'strval', $left ) : array( is_bool( $left ) ? ( $left ? '1' : '0' ) : (string) $left ); $right = (string) $right;
	if ( 'empty' === $operator || 'not_empty' === $operator ) { $empty = ! $values || array( '' ) === $values; return 'empty' === $operator ? $empty : ! $empty; }
	$match = static function( $value ) use ( $right, $operator ) {
		if ( 'eq' === $operator || 'neq' === $operator ) { return $value === $right; }
		if ( 'contains' === $operator || 'not_contains' === $operator ) { return false !== strpos( $value, $right ); }
		if ( 'starts' === $operator ) { return 0 === strpos( $value, $right ); }
		if ( 'ends' === $operator ) { return '' === $right || substr( $value, -strlen( $right ) ) === $right; }
		if ( 'in' === $operator || 'not_in' === $operator ) { return in_array( $value, array_map( 'trim', explode( ',', $right ) ), true ); }
		if ( ! lieve_element_condition_order_value( $value ) || ! lieve_element_condition_order_value( $right ) ) { return null; }
		// ISO dates and padded 24-hour times compare lexically, numbers numerically.
		if ( is_numeric( $value ) && is_numeric( $right ) ) { $a = (float) $value; $b = (float) $right; if ( ! is_finite( $a ) || ! is_finite( $b ) ) { return null; } }
		elseif ( preg_match( '/^\d{4}-\d{2}-\d{2}$/D', $value ) && preg_match( '/^\d{4}-\d{2}-\d{2}$/D', $right ) || preg_match( '/^\d{2}:\d{2}$/D', $value ) && preg_match( '/^\d{2}:\d{2}$/D', $right ) ) { $a = $value; $b = $right; }
		else { return null; }
		switch ( $operator ) { case 'gt': return $a > $b; case 'gte': return $a >= $b; case 'lt': return $a < $b; case 'lte': return $a <= $b; } return null;
	};
	$matches = array_map( $match, $values ); if ( in_array( null, $matches, true ) ) { return null; } $any = in_array( true, $matches, true ); return in_array( $operator, array( 'neq', 'not_contains', 'not_in' ), true ) ? ! $any : $any;
}

/** Three-valued logic: unavailable is not invertible into a pass. */
function lieve_element_condition_combine( $values, $relation ) {
	if ( ! $values ) { return null; }
	if ( 'all' === $relation && in_array( false, $values, true ) ) { return false; }
	if ( 'any' === $relation && in_array( true, $values, true ) ) { return true; }
	if ( in_array( null, $values, true ) ) { return null; }
	return 'all' === $relation;
}

function lieve_evaluate_element_conditions( $value, $context = array() ) {
	$errors = lieve_element_condition_errors( $value );
	if ( $errors ) { return array( 'matches' => false, 'result' => null, 'errors' => $errors, 'groups' => array() ); }
	if ( ! $value['enabled'] ) { return array( 'matches' => true, 'result' => true, 'groups' => array(), 'disabled' => true ); }
	$groups = array();
	foreach ( $value['groups'] as $group ) {
		$rules = array();
		foreach ( $group['rules'] as $rule ) {
			try { $left = lieve_element_condition_source( $rule, $context ); $right = in_array( $rule['operator'], array( 'empty', 'not_empty' ), true ) ? '' : ( function_exists( 'lieve_dynamic_reference' ) && lieve_dynamic_reference( $rule['value'] ) ? lieve_element_condition_dynamic( $rule['value'], $context['post'] ?? lieve_dynamic_context_post(), $context ) : $rule['value'] ); $result = lieve_element_condition_compare( $left, $rule['operator'], $right ); } catch ( Throwable $error ) { $result = null; }
			$rules[] = array( 'id' => $rule['id'], 'result' => $result );
		}
		$groups[] = array( 'id' => $group['id'], 'result' => lieve_element_condition_combine( array_column( $rules, 'result' ), $group['relation'] ), 'rules' => $rules );
	}
	$result = lieve_element_condition_combine( array_column( $groups, 'result' ), $value['relation'] );
	return array( 'matches' => true === $result, 'result' => $result, 'groups' => $groups );
}

function lieve_element_conditions_request_bound( $value ) {
	if ( ! is_array( $value ) || empty( $value['enabled'] ) ) { return false; }
	if ( lieve_element_condition_errors( $value ) ) { return true; }
	$catalog = lieve_element_condition_catalog();
	foreach ( $value['groups'] as $group ) { foreach ( $group['rules'] as $rule ) { if ( ! empty( $catalog['sources'][ $rule['source'] ]['requestBound'] ) || ( function_exists( 'lieve_dynamic_request_bound' ) && lieve_dynamic_request_bound( array( $rule['parameter'], $rule['value'] ) ) ) ) { return true; } } }
	return false;
}

function lieve_reidentify_element_conditions( &$nodes ) {
	foreach ( $nodes as &$node ) {
		if ( isset( $node['props']['conditions']['groups'] ) ) {
			foreach ( $node['props']['conditions']['groups'] as &$group ) { $group['id'] = 'lc_' . substr( str_replace( '-', '', wp_generate_uuid4() ), 0, 16 ); foreach ( $group['rules'] as &$rule ) { $rule['id'] = 'lc_' . substr( str_replace( '-', '', wp_generate_uuid4() ), 0, 16 ); } unset( $rule ); } unset( $group );
		}
		lieve_reidentify_element_conditions( $node['children'] );
	} unset( $node );
}

/** Discoverable REST schema; the shared semantic validator adds cross-field checks. */
function lieve_element_condition_rest_schema() {
	$catalog = lieve_element_condition_catalog(); $id = array( 'type' => 'string', 'pattern' => '^lc_[a-f0-9]{16}$' );
	$rule = array( 'type' => 'object', 'required' => array( 'id', 'source', 'parameter', 'operator', 'value' ), 'additionalProperties' => false, 'properties' => array( 'id' => $id, 'source' => array( 'type' => 'string', 'enum' => array_keys( $catalog['sources'] ) ), 'operator' => array( 'type' => 'string', 'enum' => array_keys( $catalog['operators'] ) ), 'parameter' => array( 'type' => 'string', 'maxLength' => 1200 ), 'value' => array( 'type' => 'string', 'maxLength' => 1200 ) ) );
	$group = array( 'type' => 'object', 'required' => array( 'id', 'name', 'relation', 'rules' ), 'additionalProperties' => false, 'properties' => array( 'id' => $id, 'name' => array( 'type' => 'string', 'maxLength' => 120 ), 'relation' => array( 'type' => 'string', 'enum' => array( 'all', 'any' ) ), 'rules' => array( 'type' => 'array', 'minItems' => 1, 'maxItems' => $catalog['ruleLimit'], 'items' => $rule ) ) );
	return array( 'type' => 'object', 'required' => array( 'version', 'enabled', 'relation', 'groups' ), 'additionalProperties' => false, 'properties' => array( 'version' => array( 'type' => 'integer', 'enum' => array( 1 ) ), 'enabled' => array( 'type' => 'boolean' ), 'relation' => array( 'type' => 'string', 'enum' => array( 'all', 'any' ) ), 'groups' => array( 'type' => 'array', 'maxItems' => $catalog['groupLimit'], 'items' => $group ) ) );
}

function lieve_register_element_condition_route() {
	register_rest_route( 'lieve/v1', '/element-conditions/(?P<id>\d+)', array( 'methods' => WP_REST_Server::CREATABLE, 'permission_callback' => 'lieve_rest_can_edit_post', 'callback' => static function( $request ) {
		$value = $request->get_param( 'conditions' ); $errors = lieve_element_condition_errors( $value ); if ( $errors ) { return new WP_Error( 'lieve_invalid_element_conditions', reset( $errors ), array( 'status' => 400, 'fields' => $errors ) ); }
		$post = get_post( (int) $request['id'] ); $response = rest_ensure_response( lieve_evaluate_element_conditions( $value, array( 'post' => $post, 'preview' => true ) ) ); $response->header( 'Cache-Control', 'private, no-store' ); return $response;
	}, 'args' => array( 'id' => array( 'type' => 'integer', 'minimum' => 1 ), 'conditions' => array_merge( lieve_element_condition_rest_schema(), array( 'required' => true, 'validate_callback' => static function( $value, $request, $param ) { $schema = lieve_element_condition_rest_schema(); $valid = rest_validate_value_from_schema( $value, $schema, $param ); return is_wp_error( $valid ) ? $valid : ! lieve_element_condition_errors( $value ); } ) ) ) ) );
}
if ( function_exists( 'add_action' ) ) { add_action( 'rest_api_init', 'lieve_register_element_condition_route' ); }
