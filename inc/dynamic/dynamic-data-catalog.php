<?php
/** Independently implemented WordPress/WooCommerce data catalogue. @package LieveBuilder */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_dynamic_parameter( $label, $placeholder = '', $required = false, $choices = array() ) {
	return array( 'label' => $label, 'placeholder' => $placeholder, 'required' => $required, 'choices' => $choices, 'control' => $choices ? 'select' : 'text' );
}

function lieve_dynamic_options( $source, $input ) {
	if ( ! is_array( $input ) || count( $input ) > 12 ) { return null; }
	$clean = array();
	foreach ( $source['parameters'] ?? array() as $key => $field ) {
		$value = $input[ $key ] ?? '';
		if ( ! is_scalar( $value ) || strlen( (string) $value ) > 240 ) { return null; }
		$value = sanitize_text_field( (string) $value );
		if ( ! empty( $field['required'] ) && '' === $value ) { return null; }
		if ( '' !== $value && 'select' === ( $field['control'] ?? '' ) && ! array_key_exists( $value, $field['choices'] ?? array() ) ) { return null; }
		if ( '' !== $value && 'json' === ( $field['control'] ?? '' ) && ! is_array( json_decode( $value, true, 6 ) ) ) { return null; }
		if ( '' !== $value && isset( $field['minimum'] ) && ( ! preg_match( '/^-?\d+$/D', $value ) || (float) $value < $field['minimum'] || (float) $value > $field['maximum'] ) ) { return null; }
		if ( '' !== $value ) { $clean[ $key ] = $value; }
	}
	if ( isset( $input['fallback'] ) && is_scalar( $input['fallback'] ) ) { $clean['fallback'] = substr( sanitize_text_field( (string) $input['fallback'] ), 0, 240 ); }
	return $clean;
}

function lieve_dynamic_builtin_sources( $sources ) {
	$add = static function( $id, $label, $group, $type = 'text', $parameters = array(), $request = false, $hint = '' ) use ( &$sources ) {
		$sources[ $id ] = array( 'label' => $label, 'group' => $group, 'type' => $type, 'parameters' => $parameters, 'requestBound' => $request, 'hint' => $hint, 'resolve' => static function( $context ) use ( $id ) { return lieve_dynamic_extended_value( $id, $context ); } );
	};
	$date = array( 'format' => lieve_dynamic_parameter( 'Date format', 'Y-m-d · d/m/Y · timestamp' ) );
	$meta = array( 'key' => lieve_dynamic_parameter( 'Meta key', 'Select a public field', true, lieve_dynamic_public_meta_keys() ) );
	$meta['key']['control'] = 'select';
	foreach ( array( 'post.slug' => 'Post slug', 'post.time' => 'Post time', 'post.content' => 'Post content', 'post.comment_list' => 'Post comments', 'post.read_more' => 'Read more' ) as $id => $label ) { $add( $id, $label, 'Post', in_array( $id, array( 'post.content', 'post.comment_list', 'post.read_more' ), true ) ? 'html' : 'text' ); }
	$add( 'post.date', 'Published date', 'Post', 'text', $date ); $add( 'post.modified', 'Modified date', 'Post', 'text', $date );
	$add( 'post.excerpt', 'Post excerpt', 'Post', 'text', array( 'words' => lieve_dynamic_parameter( 'Maximum words', '55' ) ) );
	$add( 'author.id', 'Author ID', 'Author', 'number' );
	$add( 'author.email', 'Author email', 'Author', 'text', array(), true, 'Only available to the author or an authorized user.' );
	$user_meta = array( 'key' => lieve_dynamic_parameter( 'Public profile field', '', true, array( 'first_name' => 'First name', 'last_name' => 'Last name', 'nickname' => 'Nickname', 'description' => 'Biography', 'user_url' => 'Website' ) ) );
	$add( 'author.meta', 'Author meta', 'Author', 'text', $user_meta );
	$redirect = array( 'redirect' => lieve_dynamic_parameter( 'Redirect URL', '/account/' ) );
	$add( 'site.login', 'Login URL', 'Site', 'url', $redirect ); $add( 'site.logout', 'Logout URL', 'Site', 'url', $redirect, true );
	$add( 'site.url_parameter', 'URL parameter', 'Site', 'text', array( 'key' => lieve_dynamic_parameter( 'Parameter name', 'campaign', true ) ), true );
	foreach ( array( 'title' => 'Archive title', 'description' => 'Archive description' ) as $field => $label ) { $add( 'archive.' . $field, $label, 'Archive' ); }
	foreach ( array( 'id' => 'Term ID', 'name' => 'Term name', 'slug' => 'Term slug', 'count' => 'Term count', 'taxonomy' => 'Term taxonomy slug', 'url' => 'Term archive URL', 'parent' => 'Term parent', 'children' => 'Term children', 'description' => 'Term description' ) as $field => $label ) {
		$add( 'term.' . $field, $label, 'Terms', in_array( $field, array( 'id', 'count' ), true ) ? 'number' : ( 'url' === $field ? 'url' : ( in_array( $field, array( 'parent', 'children' ), true ) ? 'html' : 'text' ) ), in_array( $field, array( 'parent', 'children' ), true ) ? array( 'output' => lieve_dynamic_parameter( 'Output', '', false, array( 'name' => 'Name', 'id' => 'ID', 'slug' => 'Slug', 'link' => 'Link' ) ) ) : array() );
	}
	$add( 'term.meta', 'Term meta', 'Terms', 'text', array( 'key' => lieve_dynamic_parameter( 'Public term meta key', 'subtitle', true ) ) );
	foreach ( function_exists( 'get_taxonomies' ) ? get_taxonomies( array( 'public' => true ), 'objects' ) : array() as $taxonomy ) {
		$id = 'taxonomy.' . substr( hash( 'sha256', $taxonomy->name ), 0, 24 );
		$sources[ $id ] = array( 'label' => $taxonomy->label . ' (' . $taxonomy->name . ')', 'group' => 'Taxonomies', 'type' => 'text', 'parameters' => array( 'separator' => lieve_dynamic_parameter( 'Separator', ', ' ) ), 'resolve' => static function( $context ) use ( $taxonomy ) { $names = wp_get_post_terms( $context['postId'], $taxonomy->name, array( 'fields' => 'names' ) ); return is_wp_error( $names ) ? '' : implode( $context['options']['separator'] ?? ', ', $names ); } );
	}
	$add( 'date.utc', 'Current date (UTC)', 'Date & Time', 'text', $date, true ); $add( 'date.local', 'Current date (WordPress)', 'Date & Time', 'text', $date, true );
	$add( 'date.format', 'String to date', 'Date & Time', 'text', array( 'input' => lieve_dynamic_parameter( 'Date value', '2026-10-13', true ), 'from' => lieve_dynamic_parameter( 'Input format', 'Y-m-d', true ), 'to' => lieve_dynamic_parameter( 'Output format', 'd/m/Y', true ) ) );
	$add( 'query.index', 'Query loop index', 'Query', 'text', array( 'start' => lieve_dynamic_parameter( 'Start at', '0' ), 'pad' => lieve_dynamic_parameter( 'Leading-zero width', '0 · 2 · 3' ) ) ); $sources['query.index']['flexible'] = true;
	$add( 'query.count', 'Query results count', 'Query', 'number' );
	foreach ( array( 'api' => 'Query API', 'array' => 'Query array' ) as $field => $label ) { $add( 'query.' . $field, $label, 'Query', 'text', array( 'path' => lieve_dynamic_parameter( 'Data path', 'title · address.city', true ) ), true, 'Reads a registered query context; never makes a remote request.' ); }
	$add( 'query.filter_count', 'Query results count (Filter)', 'Query Filters', 'number', array(), true ); $add( 'query.active_filters', 'Active filters count', 'Query Filters', 'number', array(), true );
	$add( 'query.search_filter', 'Search term (Filter)', 'Query Filters', 'text', array(), true ); $add( 'query.search', 'Search term', 'Miscellaneous', 'text', array(), true );
	foreach ( array( 'id' => 'User ID', 'login' => 'Username', 'email' => 'Email', 'url' => 'Website', 'author_url' => 'User author URL', 'role' => 'Role', 'registered_date' => 'User registered date', 'nicename' => 'Nicename', 'nickname' => 'Nickname', 'description' => 'Biography', 'first_name' => 'First name', 'last_name' => 'Last name', 'display_name' => 'Display name', 'picture' => 'Profile picture' ) as $field => $label ) {
		$add( 'user.' . $field, $label, 'User Profile', 'id' === $field ? 'number' : ( in_array( $field, array( 'url', 'author_url' ), true ) ? 'url' : ( 'picture' === $field ? 'image' : 'text' ) ), array(), true, 'Current signed-in user only; anonymous visitors output no value.' );
	}
	$add( 'user.meta', 'User meta', 'User Profile', 'text', $user_meta, true );
	$add( 'custom.meta', 'Custom field by key', 'Custom Fields', 'text', $meta );
	$sources['custom.meta']['flexible'] = true;
	foreach ( $meta['key']['choices'] as $key => $label ) {
		$id = 'custom.' . substr( hash( 'sha256', $key ), 0, 24 );
		$sources[ $id ] = array( 'label' => $label, 'group' => 'Custom Fields', 'type' => 'text', 'flexible' => true, 'resolve' => static function( $context ) use ( $key ) { return ! $context['post'] || ! empty( $context['post']->post_password ) ? '' : lieve_dynamic_public_meta_value( 'post', $context['postId'], $key ); } );
	}
	$callbacks = apply_filters( 'lieve_dynamic_output_callbacks', array() );
	foreach ( array( 'function' => 'Registered function output', 'action' => 'Registered display hook' ) as $mode => $label ) {
		$names = array(); foreach ( is_array( $callbacks ) ? $callbacks : array() as $key => $callback ) { if ( is_string( $key ) && is_callable( $callback ) && preg_match( '/^[a-zA-Z0-9_.:\/-]{1,80}$/D', $key ) ) { $names[ $key ] = $key; } }
		$add( 'advanced.' . $mode, $label, 'Advanced', 'html', array( 'name' => lieve_dynamic_parameter( 'Registered output', 'No registered outputs', true, $names ), 'args' => lieve_dynamic_parameter( 'Arguments (JSON, optional)', '{"limit":3}' ) ), true, 'Only explicitly registered read-only callbacks. No arbitrary PHP or actions.' );
		$sources[ 'advanced.' . $mode ]['parameters']['name']['control'] = 'select';
		$sources[ 'advanced.' . $mode ]['parameters']['args']['control'] = 'json';
	}
	if ( function_exists( 'WC' ) ) { lieve_dynamic_woo_sources( $sources, $add ); }
	foreach ( $sources as &$source ) { foreach ( $source['parameters'] ?? array() as $key => $parameter ) { if ( in_array( $key, array( 'index', 'words', 'start', 'pad' ), true ) ) { $source['parameters'][ $key ]['minimum'] = 'start' === $key ? -1000000 : ( 'words' === $key ? 1 : 0 ); $source['parameters'][ $key ]['maximum'] = 'pad' === $key ? 12 : 1000000; } } } unset( $source );
	$sources['post.content']['requestBound'] = true;
	foreach ( array( 'query.filter_count', 'query.active_filters', 'query.search_filter' ) as $id ) { $sources[ $id ]['hint'] = 'Requires a registered query/filter context.'; }
	if ( function_exists( 'lieve_dynamic_plugin_sources' ) ) { $sources = lieve_dynamic_plugin_sources( $sources ); }
	return $sources;
}

function lieve_dynamic_string_limit( $value, $length ) {
	$value = (string) $value; if ( strlen( $value ) <= $length ) { return $value; }
	if ( function_exists( 'mb_strcut' ) ) { return mb_strcut( $value, 0, $length, 'UTF-8' ); }
	while ( $length > 0 && ! preg_match( '//u', substr( $value, 0, $length ) ) ) { $length--; }
	return substr( $value, 0, $length );
}

/** Discovery exposes names, not values. Private/system/secret keys never become choices. */
function lieve_dynamic_public_meta_keys() {
	$keys = array();
	foreach ( function_exists( 'get_registered_meta_keys' ) ? get_registered_meta_keys( 'post' ) : array() as $key => $args ) { if ( lieve_dynamic_meta_key_allowed( $key ) ) { $keys[ $key ] = $key; } }
	global $wpdb;
	if ( isset( $wpdb->postmeta ) && method_exists( $wpdb, 'get_col' ) ) {
		$rows = $wpdb->get_col( "SELECT DISTINCT meta_key FROM {$wpdb->postmeta} ORDER BY meta_key LIMIT 1000" );
		foreach ( $rows as $key ) { if ( lieve_dynamic_meta_key_allowed( $key ) ) { $keys[ $key ] = $key; } }
	}
	$keys = apply_filters( 'lieve_dynamic_public_meta_keys', $keys );
	return is_array( $keys ) ? array_filter( array_slice( $keys, 0, 1000, true ), static function( $label, $key ) { return lieve_dynamic_meta_key_allowed( $key ) && is_string( $label ); }, ARRAY_FILTER_USE_BOTH ) : array();
}

function lieve_dynamic_meta_key_allowed( $key ) {
	return is_string( $key ) && strlen( $key ) <= 160 && preg_match( '/^[a-zA-Z][a-zA-Z0-9_.-]*$/D', $key ) && ! preg_match( '/password|passwd|secret|token|nonce|session|api.?key|capabilities|user_level/i', $key );
}

function lieve_dynamic_public_meta_value( $object, $id, $key ) {
	if ( ! $id || ! lieve_dynamic_meta_key_allowed( $key ) ) { return ''; }
	$value = get_metadata( $object, $id, $key, true );
	return is_scalar( $value ) ? $value : '';
}

function lieve_dynamic_path_value( $data, $path, $structured = false ) {
	if ( ! is_string( $path ) || strlen( $path ) > 200 || ! preg_match( '/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/D', $path ) ) { return ''; }
	foreach ( explode( '.', $path ) as $key ) { if ( in_array( $key, array( '__proto__', 'prototype', 'constructor' ), true ) || ! ctype_digit( $key ) && ! lieve_dynamic_meta_key_allowed( $key ) || ! is_array( $data ) || ! array_key_exists( $key, $data ) ) { return ''; } $data = $data[ $key ]; }
	return is_scalar( $data ) || $structured && is_array( $data ) ? $data : '';
}

function lieve_dynamic_extended_value( $id, $context ) {
	$post = $context['post']; $options = $context['options'] ?? array();
	if ( 0 === strpos( $id, 'woo.' ) ) { return lieve_dynamic_woo_value( $id, $context ); }
	if ( 0 === strpos( $id, 'user.' ) ) {
		$user = function_exists( 'wp_get_current_user' ) ? wp_get_current_user() : null; if ( ! $user || ! $user->ID ) { return ''; }
		$field = substr( $id, 5 );
		if ( 'id' === $field ) { return $user->ID; } if ( 'picture' === $field ) { return get_avatar_url( $user->ID ); }
		if ( 'author_url' === $field ) { return get_author_posts_url( $user->ID ); }
		if ( 'meta' === $field ) { return get_the_author_meta( $options['key'] ?? '', $user->ID ); }
		if ( 'role' === $field ) { $roles = wp_roles(); return $roles->roles[ $user->roles[0] ?? '' ]['name'] ?? ''; }
		$map = array( 'login' => 'user_login', 'email' => 'user_email', 'url' => 'user_url', 'nicename' => 'user_nicename', 'registered_date' => 'user_registered' );
		return get_the_author_meta( $map[ $field ] ?? $field, $user->ID );
	}
	if ( 0 === strpos( $id, 'term.' ) ) {
		$term = $GLOBALS['lieve_dynamic_term'] ?? ( function_exists( 'get_queried_object' ) ? get_queried_object() : null ); if ( ! $term || ! isset( $term->term_id, $term->taxonomy ) ) { return ''; }
		$field = substr( $id, 5 );
		if ( 'meta' === $field ) { return lieve_dynamic_public_meta_value( 'term', $term->term_id, $options['key'] ?? '' ); }
		if ( 'url' === $field ) { $url = get_term_link( $term ); return is_wp_error( $url ) ? '' : $url; }
		if ( 'parent' === $field || 'children' === $field ) {
			$terms = 'parent' === $field ? ( $term->parent ? array( get_term( $term->parent, $term->taxonomy ) ) : array() ) : get_terms( array( 'taxonomy' => $term->taxonomy, 'parent' => $term->term_id, 'hide_empty' => false ) );
			$output = array(); foreach ( is_wp_error( $terms ) ? array() : $terms as $item ) {
				if ( ! $item || is_wp_error( $item ) ) { continue; } $format = $options['output'] ?? 'name';
				if ( 'link' === $format ) { $url = get_term_link( $item ); if ( ! is_wp_error( $url ) ) { $output[] = '<a href="' . esc_url( $url ) . '">' . esc_html( $item->name ) . '</a>'; } }
				else { $output[] = 'id' === $format ? (string) $item->term_id : esc_html( 'slug' === $format ? $item->slug : $item->name ); }
			} return implode( ', ', $output );
		}
		return $term->{ 'id' === $field ? 'term_id' : $field } ?? '';
	}
	if ( 0 === strpos( $id, 'query.' ) ) {
		$query = $GLOBALS['wp_query'] ?? null; $field = substr( $id, 6 );
		if ( isset( $GLOBALS['lieve_listing_context'] ) && in_array( $field, array( 'index', 'count' ), true ) ) { $loop = $GLOBALS['lieve_listing_context']; return 'count' === $field ? ( $loop['total'] ?: $loop['count'] ) : str_pad( (string) ( $loop['index'] - 1 + (int) ( $options['start'] ?? 0 ) ), min( 12, max( 0, (int) ( $options['pad'] ?? 0 ) ) ), '0', STR_PAD_LEFT ); }
		if ( 'index' === $field ) { return $query && $query->in_the_loop ? str_pad( (string) ( max( 0, (int) $query->current_post ) + (int) ( $options['start'] ?? 0 ) ), min( 12, max( 0, (int) ( $options['pad'] ?? 0 ) ) ), '0', STR_PAD_LEFT ) : ''; }
		if ( 'count' === $field ) { return $query ? (int) $query->found_posts : ''; }
		if ( 'search' === $field ) { return get_search_query( false ); }
		$data = apply_filters( 'lieve_dynamic_query_context', $GLOBALS['lieve_dynamic_query_context'] ?? array(), $context );
		return in_array( $field, array( 'api', 'array' ), true ) ? lieve_dynamic_path_value( $data[ $field ] ?? array(), $options['path'] ?? '' ) : ( $data[ $field ] ?? '' );
	}
	if ( 0 === strpos( $id, 'advanced.' ) ) { $callbacks = apply_filters( 'lieve_dynamic_output_callbacks', array() ); $callback = $callbacks[ $options['name'] ?? '' ] ?? null; $context['arguments'] = isset( $options['args'] ) ? json_decode( $options['args'], true, 6 ) : array(); return is_callable( $callback ) ? call_user_func( $callback, $context ) : ''; }
	if ( 0 === strpos( $id, 'date.' ) ) {
		if ( 'date.format' === $id ) { $date = DateTimeImmutable::createFromFormat( '!' . ( $options['from'] ?? 'Y-m-d' ), $options['input'] ?? '' ); $errors = DateTimeImmutable::getLastErrors(); return $date && ( ! $errors || ! $errors['warning_count'] && ! $errors['error_count'] ) ? $date->format( $options['to'] ?? 'Y-m-d' ) : ''; }
		$format = $options['format'] ?? get_option( 'date_format' );
		if ( 'timestamp' === $format ) { return time(); }
		return 'date.utc' === $id ? gmdate( $format ) : wp_date( $format );
	}
	if ( 'site.login' === $id || 'site.logout' === $id ) { $redirect = isset( $options['redirect'] ) ? wp_validate_redirect( $options['redirect'], '' ) : ''; return 'site.login' === $id ? wp_login_url( $redirect ) : wp_logout_url( $redirect ); }
	if ( 'site.url_parameter' === $id ) { $key = $options['key'] ?? ''; return lieve_dynamic_meta_key_allowed( $key ) && ! in_array( strtolower( $key ), array( 'key', 'code', 'state', 'auth', 'signature', 'authorization' ), true ) && isset( $_GET[ $key ] ) && is_scalar( $_GET[ $key ] ) ? sanitize_text_field( wp_unslash( $_GET[ $key ] ) ) : ''; }
	if ( 'archive.title' === $id ) { return get_the_archive_title(); } if ( 'archive.description' === $id ) { return get_the_archive_description(); }
	if ( ! $post || ! empty( $post->post_password ) ) { return ''; }
	switch ( $id ) {
		case 'custom.meta': return lieve_dynamic_public_meta_value( 'post', $post->ID, $options['key'] ?? '' );
		case 'post.slug': return $post->post_name;
		case 'post.time': return get_the_time( get_option( 'time_format' ), $post );
		case 'post.date': return 'timestamp' === ( $options['format'] ?? '' ) ? get_post_time( 'U', true, $post ) : get_the_date( $options['format'] ?? '', $post );
		case 'post.modified': return 'timestamp' === ( $options['format'] ?? '' ) ? get_post_modified_time( 'U', true, $post ) : get_the_modified_date( $options['format'] ?? '', $post );
		case 'post.excerpt': return wp_trim_words( $post->post_excerpt ?: wp_strip_all_tags( strip_shortcodes( $post->post_content ) ), max( 1, min( 1000, (int) ( $options['words'] ?? 55 ) ) ) );
		case 'post.content': return function_exists( 'do_blocks' ) ? do_blocks( $post->post_content ) : wpautop( $post->post_content );
		case 'post.read_more': return '<a href="' . esc_url( get_permalink( $post ) ) . '">Read more</a>';
		case 'post.comment_list':
			$html = '<ul>'; foreach ( get_comments( array( 'post_id' => $post->ID, 'status' => 'approve', 'number' => 100 ) ) as $comment ) { $html .= '<li>' . esc_html( $comment->comment_author ) . ': ' . wp_kses_post( $comment->comment_content ) . '</li>'; } return $html . '</ul>';
		case 'author.id': return (int) $post->post_author;
		case 'author.email': return ( get_current_user_id() === (int) $post->post_author || current_user_can( 'edit_user', (int) $post->post_author ) ) ? get_the_author_meta( 'user_email', $post->post_author ) : '';
		case 'author.meta': return get_the_author_meta( $options['key'] ?? '', $post->post_author );
	}
	return '';
}

function lieve_dynamic_woo_sources( &$sources, $add ) {
	$product = array( 'type' => 'Product type', 'price' => 'Product price', 'regular_price' => 'Product regular price', 'sale_price' => 'Product sale price', 'excerpt' => 'Product short description', 'stock' => 'Product stock', 'sku' => 'Product SKU', 'gtin' => 'Product GTIN', 'rating' => 'Product rating', 'on_sale' => 'Product on sale', 'badge_new' => 'Product badge new', 'add_to_cart' => 'Add to cart URL', 'cat_image' => 'Product category image', 'images' => 'Product images', 'gallery_images' => 'Product gallery images', 'stock_status' => 'Product stock status' );
	foreach ( $product as $key => $label ) { $add( 'woo.product.' . $key, $label, 'WooCommerce · Product', in_array( $key, array( 'price', 'regular_price', 'sale_price', 'stock', 'rating', 'on_sale', 'badge_new' ), true ) ? 'number' : ( 'add_to_cart' === $key ? 'url' : ( in_array( $key, array( 'cat_image', 'images', 'gallery_images' ), true ) ? 'image' : 'text' ) ), in_array( $key, array( 'images', 'gallery_images' ), true ) ? array( 'index' => lieve_dynamic_parameter( 'Image index', '0 (first image)' ) ) : array() ); }
	$cart = array( 'product_name', 'product_title', 'remove_link', 'quantity', 'item_price', 'item_save', 'subtotal', 'update', 'items_count', 'order_subtotal', 'order_total', 'applied_coupon', 'applied_coupon_amount', 'applied_coupon_total_amount', 'applied_fee', 'applied_fee_amount', 'applied_fee_total_amount', 'shipping_method', 'shipping_total_amount', 'free_shipping_min_amount', 'free_shipping_remaining', 'free_shipping_progress', 'applied_tax_label', 'applied_tax_amount' );
	foreach ( $cart as $key ) { $type = in_array( $key, array( 'remove_link', 'update' ), true ) ? 'url' : ( in_array( $key, array( 'product_name', 'product_title', 'applied_coupon', 'applied_fee', 'shipping_method', 'applied_tax_label' ), true ) ? 'text' : 'number' ); $add( 'woo.cart.' . $key, ucwords( str_replace( '_', ' ', $key ) ), 'WooCommerce · Cart', $type, array(), true, 'Current cart; item values need a Cart Items loop.' ); }
	$add( 'woo.checkout.step', 'Checkout current step number', 'WooCommerce · Checkout', 'number', array(), true );
	$add( 'woo.url', 'WooCommerce URL', 'WooCommerce · Checkout', 'url', array( 'endpoint' => lieve_dynamic_parameter( 'Destination', '', true, array( 'shop' => 'Shop', 'cart' => 'Cart', 'checkout' => 'Checkout', 'myaccount' => 'My account', 'orders' => 'Orders', 'downloads' => 'Downloads', 'edit-account' => 'Edit account', 'edit-address' => 'Edit address', 'payment-methods' => 'Payment methods', 'lost-password' => 'Lost password' ) ) ) );
	foreach ( array( 'addresses_description', 'address_type', 'address_title', 'address', 'address_has_address', 'address_edit_url', 'address_action_label', 'edit_address_title', 'edit_address_type', 'edit_address_type_label' ) as $key ) { $add( 'woo.account.' . $key, ucwords( str_replace( '_', ' ', $key ) ), 'WooCommerce · Account', 'address_edit_url' === $key ? 'url' : ( 'address_has_address' === $key ? 'number' : 'text' ), array( 'address' => lieve_dynamic_parameter( 'Address type', '', false, array( 'billing' => 'Billing', 'shipping' => 'Shipping' ) ) ), true, 'Current signed-in customer only.' ); }
	$order = array( 'id', 'number', 'date', 'status', 'total', 'payment_title', 'email', 'checkout_payment_url', 'again_url', 'user_id', 'billing_address', 'billing_phone', 'shipping_address', 'shipping_phone', 'item_name', 'item_title', 'item_quantity', 'item_price', 'item_line_subtotal', 'item_meta', 'total_label', 'total_value', 'view_url', 'view_aria_label', 'item_count', 'total_with_item_count', 'action_url', 'action_name', 'action_aria_label' );
	foreach ( $order as $key ) { $type = in_array( $key, array( 'id', 'user_id', 'total', 'item_quantity', 'item_price', 'item_line_subtotal', 'item_count' ), true ) ? 'number' : ( substr( $key, -4 ) === '_url' ? 'url' : 'text' ); $add( 'woo.order.' . $key, 'Order ' . str_replace( '_', ' ', $key ), 'WooCommerce · Order', $type, array( 'index' => lieve_dynamic_parameter( 'Item index', '0 (first item)' ), 'action' => lieve_dynamic_parameter( 'Action', '', false, array( 'view' => 'View', 'pay' => 'Pay', 'cancel' => 'Cancel' ) ) ), true, 'Requires an authorized order context; unrelated order IDs are never accepted.' ); }
	foreach ( array( 'product', 'name', 'url', 'remaining', 'access_expires' ) as $key ) { $add( 'woo.download.' . $key, 'Download ' . str_replace( '_', ' ', $key ), 'WooCommerce · Downloads', 'url' === $key ? 'url' : 'text', array( 'index' => lieve_dynamic_parameter( 'Download index', '0' ) ), true, 'Current customer downloads only.' ); }
	foreach ( array( 'date', 'comment' ) as $key ) { $add( 'woo.note.' . $key, 'Customer note ' . $key, 'WooCommerce · Notes', 'text', array( 'index' => lieve_dynamic_parameter( 'Note index', '0' ) ), true, 'Customer-visible notes of an authorized order only.' ); }
	if ( function_exists( 'lieve_commerce_withdrawal_available' ) && lieve_commerce_withdrawal_available() ) { foreach ( array( 'value', 'screen' ) as $key ) { $add( 'woo.withdrawal.' . $key, 'Order withdrawal ' . $key, 'WooCommerce · Order', 'text', array(), true ); } }
	foreach ( array( 'woo.account.address', 'woo.order.billing_address', 'woo.order.shipping_address', 'woo.order.item_meta', 'woo.order.total_value' ) as $id ) { $sources[ $id ]['type'] = 'html'; }
	return $sources;
}

function lieve_dynamic_woo_value( $id, $context ) {
	$options = $context['options'] ?? array(); $parts = explode( '.', $id ); $group = $parts[1]; $key = $parts[2] ?? ''; $wc = WC();
	if ( 'url' === $group ) { $dest = $options['endpoint'] ?? ''; return in_array( $dest, array( 'shop', 'cart', 'checkout', 'myaccount' ), true ) ? wc_get_page_permalink( $dest ) : wc_get_account_endpoint_url( $dest ); }
	if ( 'product' === $group ) {
		if ( $context['post'] && ! empty( $context['post']->post_password ) ) { return ''; }
		$product = wc_get_product( $context['postId'] ); if ( ! $product || ( 'publish' !== $product->get_status() && ! current_user_can( 'edit_post', $product->get_id() ) ) ) { return ''; }
		$methods = array( 'type' => 'get_type', 'price' => 'get_price', 'regular_price' => 'get_regular_price', 'sale_price' => 'get_sale_price', 'excerpt' => 'get_short_description', 'stock' => 'get_stock_quantity', 'sku' => 'get_sku', 'gtin' => 'get_global_unique_id', 'rating' => 'get_average_rating', 'on_sale' => 'is_on_sale', 'stock_status' => 'get_stock_status', 'add_to_cart' => 'add_to_cart_url' );
		if ( isset( $methods[ $key ] ) ) { return is_callable( array( $product, $methods[ $key ] ) ) ? $product->{$methods[ $key ]}() : ''; }
		if ( 'badge_new' === $key ) { $date = $product->get_date_created(); return $date && time() - $date->getTimestamp() < 30 * DAY_IN_SECONDS; }
		if ( 'images' === $key || 'gallery_images' === $key ) { $images = $product->get_gallery_image_ids(); if ( 'images' === $key && $product->get_image_id() ) { array_unshift( $images, $product->get_image_id() ); } return wp_get_attachment_image_url( $images[ max( 0, (int) ( $options['index'] ?? 0 ) ) ] ?? 0, 'full' ) ?: ''; }
		if ( 'cat_image' === $key ) { $terms = wp_get_post_terms( $product->get_id(), 'product_cat' ); return ! is_wp_error( $terms ) && $terms ? wp_get_attachment_image_url( (int) get_term_meta( $terms[0]->term_id, 'thumbnail_id', true ), 'full' ) : ''; }
	}
	if ( 'cart' === $group ) {
		$cart = $wc->cart ?? null; if ( ! $cart ) { return ''; } $item_context = $GLOBALS['lieve_cart_item'] ?? array(); $item = $item_context['item'] ?? null; $product = $item['data'] ?? null;
		if ( 'update' === $key ) { return wc_get_cart_url(); }
		if ( 'items_count' === $key ) { return $cart->get_cart_contents_count(); }
		$methods = array( 'order_subtotal' => 'get_subtotal', 'order_total' => 'get_total', 'shipping_total_amount' => 'get_shipping_total', 'applied_coupon_total_amount' => 'get_discount_total', 'applied_fee_total_amount' => 'get_fee_total', 'applied_tax_amount' => 'get_total_tax' );
		if ( isset( $methods[ $key ] ) ) { return 'order_total' === $key ? $cart->get_total( 'edit' ) : $cart->{$methods[ $key ]}(); }
		if ( 'applied_coupon' === $key ) { return implode( ', ', $cart->get_applied_coupons() ); }
		if ( 'applied_coupon_amount' === $key ) { return array_sum( $cart->get_coupon_discount_totals() ); }
		if ( 'applied_fee' === $key ) { return implode( ', ', array_map( static function( $fee ) { return $fee->name; }, $cart->get_fees() ) ); }
		if ( 'applied_fee_amount' === $key ) { return $cart->get_fee_total(); }
		if ( 'applied_tax_label' === $key ) { return implode( ', ', array_map( static function( $tax ) { return $tax->label; }, $cart->get_tax_totals() ) ); }
		if ( 'shipping_method' === $key ) { return implode( ', ', array_map( static function( $rate ) { return $rate->get_label(); }, $cart->get_shipping_methods() ) ); }
		if ( 0 === strpos( $key, 'free_shipping_' ) ) {
			$minimums = array(); foreach ( $cart->get_shipping_packages() as $package ) { $zone = WC_Shipping_Zones::get_zone_matching_package( $package ); foreach ( $zone->get_shipping_methods( true ) as $method ) { if ( 'free_shipping' === $method->id && (float) $method->get_option( 'min_amount' ) > 0 ) { $minimums[] = (float) $method->get_option( 'min_amount' ); } } }
			if ( ! $minimums ) { return ''; } $minimum = min( $minimums ); $subtotal = (float) $cart->get_displayed_subtotal(); return 'free_shipping_min_amount' === $key ? $minimum : ( 'free_shipping_remaining' === $key ? max( 0, $minimum - $subtotal ) : min( 100, 100 * $subtotal / $minimum ) );
		}
		if ( ! $item || ! $product ) { return ''; }
		if ( 'product_name' === $key || 'product_title' === $key ) { return $product->get_name(); } if ( 'quantity' === $key ) { return $item['quantity']; }
		if ( 'remove_link' === $key ) { return wc_get_cart_remove_url( $item_context['key'] ?? '' ); }
		if ( 'subtotal' === $key ) { return $item['line_total']; } if ( 'item_price' === $key ) { return $product->get_price(); }
		if ( 'item_save' === $key ) { return max( 0, (float) $product->get_regular_price() - (float) $product->get_price() ) * (float) $item['quantity']; }
	}
	if ( 'checkout' === $group ) { return (int) apply_filters( 'lieve_dynamic_checkout_step', 1 ); }
	if ( 'account' === $group ) {
		if ( ! get_current_user_id() || ! $wc->customer || $wc->customer->get_id() !== get_current_user_id() ) { return ''; }
		$type = $options['address'] ?? 'billing'; $label = 'shipping' === $type ? 'Shipping address' : 'Billing address';
		if ( in_array( $key, array( 'address_type', 'edit_address_type' ), true ) ) { return $type; } if ( in_array( $key, array( 'address_title', 'edit_address_title', 'edit_address_type_label' ), true ) ) { return $label; }
		if ( 'address_action_label' === $key ) { return 'Edit'; } if ( 'addresses_description' === $key ) { return 'Manage your billing and shipping addresses.'; }
		if ( 'address_edit_url' === $key ) { return wc_get_endpoint_url( 'edit-address', $type, wc_get_page_permalink( 'myaccount' ) ); }
		$address = WC()->countries->get_formatted_address( $wc->customer->{ 'get_' . $type }() );
		return 'address_has_address' === $key ? (int) ( '' !== $address ) : $address;
	}
	if ( 'download' === $group ) {
		if ( ! get_current_user_id() ) { return ''; } $rows = wc_get_customer_available_downloads( get_current_user_id() ); $item = $rows[ max( 0, (int) ( $options['index'] ?? 0 ) ) ] ?? array();
		$map = array( 'product' => 'product_name', 'name' => 'download_name', 'url' => 'download_url', 'remaining' => 'downloads_remaining', 'access_expires' => 'access_expires' ); $value = $item[ $map[ $key ] ?? '' ] ?? ''; return is_object( $value ) && is_callable( array( $value, 'date' ) ) ? $value->date( 'Y-m-d' ) : $value;
	}
	$order = function_exists( 'lieve_commerce_current_order' ) ? lieve_commerce_current_order() : false; if ( ! $order ) { return ''; }
	if ( 'note' === $group ) { $notes = wc_get_order_notes( array( 'order_id' => $order->get_id(), 'type' => 'customer', 'limit' => 100 ) ); $note = $notes[ max( 0, (int) ( $options['index'] ?? 0 ) ) ] ?? null; return ! $note ? '' : ( 'date' === $key ? $note->date_created->date( 'Y-m-d' ) : $note->content ); }
	if ( 'withdrawal' === $group ) { return apply_filters( 'lieve_dynamic_order_withdrawal_' . $key, '', $order ); }
	$methods = array( 'id' => 'get_id', 'number' => 'get_order_number', 'status' => 'get_status', 'total' => 'get_total', 'payment_title' => 'get_payment_method_title', 'email' => 'get_billing_email', 'checkout_payment_url' => 'get_checkout_payment_url', 'user_id' => 'get_customer_id', 'billing_address' => 'get_formatted_billing_address', 'billing_phone' => 'get_billing_phone', 'shipping_address' => 'get_formatted_shipping_address', 'shipping_phone' => 'get_shipping_phone', 'item_count' => 'get_item_count', 'view_url' => 'get_view_order_url' );
	if ( isset( $methods[ $key ] ) ) { return is_callable( array( $order, $methods[ $key ] ) ) ? $order->{$methods[ $key ]}() : ''; }
	if ( 'date' === $key ) { return $order->get_date_created() ? $order->get_date_created()->date( 'Y-m-d' ) : ''; }
	if ( 'view_aria_label' === $key ) { return 'View order ' . $order->get_order_number(); }
	if ( 'total_with_item_count' === $key ) { return wp_strip_all_tags( $order->get_formatted_order_total() ) . ' · ' . $order->get_item_count() . ' items'; }
	if ( 'again_url' === $key ) { return wp_nonce_url( add_query_arg( 'order_again', $order->get_id(), wc_get_cart_url() ), 'woocommerce-order_again' ); }
	if ( 0 === strpos( $key, 'action_' ) ) { $action = $options['action'] ?? 'view'; $actions = wc_get_account_orders_actions( $order ); $row = $actions[ $action ] ?? array(); return $row[ array( 'action_url' => 'url', 'action_name' => 'name', 'action_aria_label' => 'aria-label' )[ $key ] ?? '' ] ?? ''; }
	if ( 'total_label' === $key || 'total_value' === $key ) { $rows = array_values( $order->get_order_item_totals() ); $row = $rows[ max( 0, (int) ( $options['index'] ?? 0 ) ) ] ?? array(); return $row[ 'total_label' === $key ? 'label' : 'value' ] ?? ''; }
	$items = array_values( $order->get_items() ); $item = $items[ max( 0, (int) ( $options['index'] ?? 0 ) ) ] ?? null; if ( ! $item ) { return ''; }
	if ( 'item_name' === $key || 'item_title' === $key ) { return $item->get_name(); } if ( 'item_quantity' === $key ) { return $item->get_quantity(); }
	if ( 'item_price' === $key ) { return (float) $item->get_total() / max( 1, $item->get_quantity() ); } if ( 'item_line_subtotal' === $key ) { return $item->get_subtotal(); }
	if ( 'item_meta' === $key ) { return wc_display_item_meta( $item, array( 'echo' => false ) ); }
	return '';
}

/** Inspect styles as well as content. Unknown sources are conservative for caching. */
function lieve_dynamic_request_bound( $value ) {
	if ( is_array( $value ) && isset( $value['listing'] ) && function_exists( 'lieve_listing_request_bound' ) && lieve_listing_request_bound( $value['listing'] ) ) { return true; }
	if ( is_array( $value ) && array_key_exists( 'conditions', $value ) && function_exists( 'lieve_element_conditions_request_bound' ) && lieve_element_conditions_request_bound( $value['conditions'] ) ) { return true; }
	if ( is_array( $value ) ) { foreach ( $value as $item ) { if ( lieve_dynamic_request_bound( $item ) ) { return true; } } return false; }
	$reference = lieve_dynamic_reference( $value );
	if ( ! $reference ) { return false; }
	$source = lieve_dynamic_data_sources()[ $reference['source'] ] ?? null;
	return ! $source || ! empty( $source['requestBound'] );
}

/** Also protect late hook/shortcode output that was not discoverable before wp_head. */
function lieve_dynamic_mark_request_bound( $value, $force = false ) {
	if ( ! $force && ! lieve_dynamic_request_bound( $value ) ) { return false; }
	$GLOBALS['lieve_dynamic_request_bound'] = true;
	if ( ! defined( 'DONOTCACHEPAGE' ) ) { define( 'DONOTCACHEPAGE', true ); }
	if ( ! headers_sent() && function_exists( 'nocache_headers' ) ) { nocache_headers(); }
	return true;
}

function lieve_register_dynamic_data_route() {
	register_rest_route( 'lieve/v1', '/dynamic-data/(?P<id>\d+)', array( 'methods' => WP_REST_Server::CREATABLE, 'permission_callback' => 'lieve_rest_can_edit_post', 'callback' => static function( $request ) {
		$binding = lieve_dynamic_reference( $request['reference'] ); $source = $binding ? ( lieve_dynamic_data_sources()[ $binding['source'] ] ?? null ) : null;
		if ( ! $source || null === lieve_dynamic_options( $source, $binding['options'] ) || ! lieve_dynamic_accepts( $binding, $request['kind'] ) ) { return new WP_Error( 'lieve_invalid_dynamic_data', 'Choose a compatible source and complete its parameters.', array( 'status' => 400 ) ); }
		$value = lieve_dynamic_source_value( $binding['source'], get_post( (int) $request['id'] ), $binding['options'], $request['kind'] );
		$response = rest_ensure_response( array( 'value' => $value ) ); $response->header( 'Cache-Control', 'private, no-store' ); return $response;
	}, 'args' => array( 'id' => array( 'type' => 'integer', 'minimum' => 1 ), 'reference' => array( 'type' => 'string', 'required' => true, 'maxLength' => 1200 ), 'kind' => array( 'type' => 'string', 'required' => true, 'enum' => array( 'text', 'html', 'number', 'dimension', 'image', 'url', 'color' ) ) ) ) );
}
if ( function_exists( 'add_action' ) ) { add_action( 'rest_api_init', 'lieve_register_dynamic_data_route' ); }

function lieve_dynamic_protect_request_data() {
	if ( is_admin() || ! function_exists( 'lieve_frontend_asset_usage' ) ) { return; }
	$check = static function( $document, $visited = array(), $depth = 0 ) use ( &$check ) {
		if ( lieve_dynamic_request_bound( $document ) ) { return true; }
		foreach ( $document['children'] ?? array() as $node ) {
			if ( ! empty( $node['children'] ) && $check( array( 'children' => $node['children'] ), $visited, $depth ) ) { return true; }
			$id = 'template' === ( $node['type'] ?? '' ) ? (int) ( $node['props']['templateId'] ?? 0 ) : 0;
			if ( $id && $depth < 4 && ! in_array( $id, $visited, true ) && $check( lieve_get_document( $id ), array_merge( $visited, array( $id ) ), $depth + 1 ) ) { return true; }
		}
		return false;
	};
	foreach ( lieve_frontend_asset_usage()['documents'] ?? array() as $id ) {
		if ( $check( lieve_get_document( $id ), array( (int) $id ) ) ) { lieve_dynamic_mark_request_bound( null, true ); break; }
	}
}
if ( function_exists( 'add_action' ) ) { add_action( 'wp_enqueue_scripts', 'lieve_dynamic_protect_request_data', 1 ); }
