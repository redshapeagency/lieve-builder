<?php
/** Optional field-provider discovery. No vendor code is copied or installed. @package LieveBuilder */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** A missing/malformed vendor schema must not break the editor or other providers. */
function lieve_dynamic_provider_call( $callback, $fallback = array() ) {
	try { return call_user_func( $callback ); } catch ( Throwable $error ) { return $fallback; }
}

function lieve_dynamic_plugin_sources( $sources ) {
	$register = static function( $vendor, $group, $name, $type, $getter, $request = false, $label = '', $default_path = '', $schema = array(), $depth = 0 ) use ( &$sources, &$register ) {
		if ( ! lieve_dynamic_meta_key_allowed( $name ) || ! is_callable( $getter ) || count( $sources ) >= 2000 ) { return; }
		$id = strtolower( preg_replace( '/[^a-z0-9]+/i', '-', $vendor ) ) . '.' . substr( hash( 'sha256', $group . ':' . $name ), 0, 24 );
		$kinds = array( 'number' => 'number', 'range' => 'number', 'integer' => 'number', 'decimal' => 'number', 'text_money' => 'number', 'true_false' => 'number', 'switcher' => 'number', 'checkbox' => 'text', 'color' => 'color', 'color_picker' => 'color', 'colorpicker' => 'color', 'image' => 'image', 'media' => 'image', 'single_image' => 'image', 'image_advanced' => 'image', 'gallery' => 'image', 'file' => 'image', 'file_list' => 'image', 'url' => 'url', 'text_url' => 'url', 'oembed' => 'url', 'wysiwyg' => 'html' );
		$kind = $kinds[ $type ] ?? 'text';
		$sources[ $id ] = array( 'label' => $label ?: $name, 'group' => $vendor . ' · ' . $group, 'type' => $kind, 'requestBound' => true, 'hint' => $default_path ? 'Default path: ' . $default_path . '. Requires matching plugin data.' : 'Requires the plugin and matching data context.', 'parameters' => array( 'path' => lieve_dynamic_parameter( 'Path from root (optional)', $default_path ?: '0.title · url' ) ), 'resolve' => static function( $context ) use ( $getter, $kind, $request, $default_path ) {
			if ( $request && ! get_current_user_id() || $context['post'] && ! empty( $context['post']->post_password ) ) { return ''; }
			$value = lieve_dynamic_normalize_field_value( call_user_func( $getter, $context ) ); $path = $context['options']['path'] ?? $default_path;
			if ( $path ) { $value = lieve_dynamic_path_value( $value, $path, true ); }
			if ( 'image' === $kind ) { for ( $i = 0; is_array( $value ) && $i < 3; $i++ ) { $value = $value['url'] ?? $value['full_url'] ?? $value['ID'] ?? $value['id'] ?? ( $value ? reset( $value ) : '' ); } if ( is_numeric( $value ) ) { return wp_get_attachment_image_url( (int) $value, 'full' ) ?: ''; } }
			if ( is_array( $value ) ) { $value = array_filter( $value, 'is_scalar' ); return implode( ', ', $value ); }
			return is_scalar( $value ) ? $value : '';
		} );
		if ( $depth < 5 ) {
			$children = $schema['sub_fields'] ?? $schema['fields'] ?? $schema['repeater-fields'] ?? array();
			$repeat = in_array( $type, array( 'repeater', 'flexible_content' ), true ) || ! empty( $schema['repeatable'] ) || ! empty( $schema['clone'] );
			foreach ( is_array( $children ) ? array_slice( $children, 0, 1000 ) : array() as $child ) {
				if ( ! is_array( $child ) ) { continue; } $key = $child['id'] ?? $child['name'] ?? ''; if ( ! lieve_dynamic_meta_key_allowed( $key ) ) { continue; }
				$path = ( $default_path ? $default_path . '.' : '' ) . ( $repeat ? '0.' : '' ) . $key;
				$register( $vendor, $group, $name . '.' . $key, $child['type'] ?? 'text', $getter, $request, ( $label ?: $name ) . ' · ' . ( $child['label'] ?? $child['title'] ?? $child['name'] ?? $key ), $path, $child, $depth + 1 );
			}
		}
	};
	if ( function_exists( 'acf_get_field_groups' ) && function_exists( 'acf_get_fields' ) && function_exists( 'get_field' ) ) {
		foreach ( (array) lieve_dynamic_provider_call( 'acf_get_field_groups' ) as $group ) {
			if ( ! is_array( $group ) ) { continue; }
			$options_page = false; $user_group = false; $term_group = false;
			foreach ( $group['location'] ?? array() as $rules ) { foreach ( $rules as $rule ) { $param = $rule['param'] ?? ''; if ( 'options_page' === $param ) { $options_page = true; } if ( in_array( $param, array( 'user_form', 'user_role' ), true ) ) { $user_group = true; } if ( 'taxonomy' === $param ) { $term_group = true; } } }
			foreach ( (array) lieve_dynamic_provider_call( static function() use ( $group ) { return acf_get_fields( $group ); } ) as $field ) {
				if ( ! is_array( $field ) ) { continue; } $name = $field['name'] ?? '';
				$register( 'ACF', $group['title'] ?? 'Fields', $name, $field['type'] ?? 'text', static function( $context ) use ( $name, $options_page, $user_group, $term_group ) {
					if ( $options_page ) { return get_field( $name, 'option' ); }
					if ( $user_group ) { return get_current_user_id() ? get_field( $name, 'user_' . get_current_user_id() ) : ''; }
					if ( $term_group ) { $term = get_queried_object(); return $term && isset( $term->term_id, $term->taxonomy ) ? get_field( $name, 'term_' . $term->term_id ) : ''; }
					return $context['postId'] ? get_field( $name, $context['postId'] ) : '';
				}, $user_group && ! $options_page, $field['label'] ?? $name, '', $field );
			}
		}
	}
	if ( function_exists( 'rwmb_get_registry' ) && function_exists( 'rwmb_meta' ) ) {
		$registry = lieve_dynamic_provider_call( static function() { return rwmb_get_registry( 'field' ); }, null );
		if ( $registry && is_callable( array( $registry, 'get_by_object_type' ) ) ) {
			foreach ( array( 'post', 'term', 'user', 'setting' ) as $object_type ) {
				foreach ( (array) lieve_dynamic_provider_call( static function() use ( $registry, $object_type ) { return $registry->get_by_object_type( $object_type ); } ) as $group => $fields ) {
					foreach ( (array) $fields as $field ) { if ( ! is_array( $field ) ) { continue; } $name = $field['id'] ?? '';
						$register( 'Meta Box', ucfirst( $object_type ) . ' · ' . $group, $name, $field['type'] ?? 'text', static function( $context ) use ( $name, $object_type, $group ) {
							if ( 'post' === $object_type && ( ! $context['post'] || $context['post']->post_type !== $group ) ) { return ''; }
							$term = 'term' === $object_type ? get_queried_object() : null;
							$id = 'user' === $object_type ? get_current_user_id() : ( 'setting' === $object_type ? $group : ( 'term' === $object_type ? ( $term && ( $term->taxonomy ?? '' ) === $group ? $term->term_id : 0 ) : $context['postId'] ) );
							return $id ? rwmb_meta( $name, array( 'object_type' => $object_type ), $id ) : '';
						}, 'user' === $object_type, $field['name'] ?? $name, '', $field );
					}
				}
			}
		} else {
			$registry = lieve_dynamic_provider_call( static function() { return rwmb_get_registry( 'meta_box' ); }, null );
			foreach ( $registry && is_callable( array( $registry, 'all' ) ) ? (array) lieve_dynamic_provider_call( array( $registry, 'all' ) ) : array() as $box ) {
				foreach ( $box->meta_box['fields'] ?? array() as $field ) { $name = $field['id'] ?? ''; $register( 'Meta Box', $box->meta_box['title'] ?? 'Fields', $name, $field['type'] ?? 'text', static function( $context ) use ( $name ) { return rwmb_meta( $name, array(), $context['postId'] ); }, false, $field['name'] ?? $name ); }
			}
		}
	}
	if ( function_exists( 'jet_engine' ) ) {
		$engine = lieve_dynamic_provider_call( 'jet_engine', null ); $boxes = $engine->meta_boxes ?? null;
		$woo_contexts = array(); foreach ( array( 'woocommerce_product_data' => 'product', 'woocommerce_product_variation' => 'product_variation' ) as $context => $slug ) { foreach ( $boxes && is_callable( array( $boxes, 'get_fields_for_context' ) ) ? (array) lieve_dynamic_provider_call( static function() use ( $boxes, $context ) { return $boxes->get_fields_for_context( $context ); } ) : array() as $group => $fields ) { $woo_contexts[ $group ] = $slug; } }
		foreach ( $boxes && is_callable( array( $boxes, 'get_registered_fields' ) ) ? (array) lieve_dynamic_provider_call( array( $boxes, 'get_registered_fields' ) ) : array() as $object => $fields ) {
			$group_label = $object; $object = $woo_contexts[ $object ] ?? $object;
			$is_post = function_exists( 'post_type_exists' ) && post_type_exists( $object ); $is_term = function_exists( 'taxonomy_exists' ) && taxonomy_exists( $object ); $users = $boxes && is_callable( array( $boxes, 'get_fields_for_context' ) ) ? lieve_dynamic_provider_call( static function() use ( $boxes ) { return $boxes->get_fields_for_context( 'user' ); } ) : array(); $is_user = isset( $users[ $object ] );
			if ( ! $is_post && ! $is_term && ! $is_user ) { continue; }
			foreach ( $fields as $field ) { $name = $field['name'] ?? ''; $register( 'JetEngine', $group_label, $name, $field['type'] ?? 'text', static function( $context ) use ( $name, $object, $is_term, $is_user ) {
				if ( $is_user ) { return get_user_meta( get_current_user_id(), $name, true ); }
				if ( $is_term ) { $term = get_queried_object(); return $term && isset( $term->taxonomy ) && $term->taxonomy === $object ? get_term_meta( $term->term_id, $name, true ) : ''; }
				return $context['post'] && $context['post']->post_type === $object ? get_post_meta( $context['postId'], $name, true ) : '';
			}, $is_user, $field['title'] ?? $name, '', $field ); }
		}
		$pages = $engine->options_pages->data ?? null; $option_data = $engine->listings->data ?? null;
		foreach ( $pages && is_callable( array( $pages, 'get_items' ) ) ? (array) lieve_dynamic_provider_call( array( $pages, 'get_items' ) ) : array() as $page ) {
			$slug = $page['slug'] ?? ''; $fields = function_exists( 'maybe_unserialize' ) ? maybe_unserialize( $page['meta_fields'] ?? array() ) : ( $page['meta_fields'] ?? array() );
			if ( ! $slug || ! is_array( $fields ) || ! $option_data || ! is_callable( array( $option_data, 'get_option' ) ) ) { continue; }
			foreach ( $fields as $field ) { $name = $field['name'] ?? ''; $register( 'JetEngine', 'Options · ' . $slug, $name, $field['type'] ?? 'text', static function() use ( $option_data, $slug, $name ) { return $option_data->get_option( $slug . '::' . $name ); }, false, $field['title'] ?? $name, '', $field ); }
		}
	}
	if ( function_exists( 'pods_api' ) && function_exists( 'pods' ) ) {
		foreach ( (array) lieve_dynamic_provider_call( static function() { return pods_api()->load_pods(); } ) as $pod ) { foreach ( $pod['fields'] ?? array() as $field ) {
			$name = $field['name'] ?? ''; $object = $pod['name'] ?? ''; $user = 'user' === ( $pod['type'] ?? '' ); $taxonomy = 'taxonomy' === ( $pod['type'] ?? '' );
			$register( 'Pods', $pod['label'] ?? $object, $name, $field['type'] ?? 'text', static function( $context ) use ( $object, $name, $user, $taxonomy ) { $term = $taxonomy ? get_queried_object() : null; $id = $user ? get_current_user_id() : ( $taxonomy ? ( $term->term_id ?? 0 ) : $context['postId'] ); return $id ? pods( $object, $id )->field( $name ) : ''; }, $user );
		} }
	}
	if ( is_callable( array( 'CMB2_Boxes', 'get_all' ) ) || function_exists( 'cmb2_get_metaboxes' ) ) {
		$boxes = lieve_dynamic_provider_call( is_callable( array( 'CMB2_Boxes', 'get_all' ) ) ? array( 'CMB2_Boxes', 'get_all' ) : 'cmb2_get_metaboxes' );
		foreach ( (array) $boxes as $box ) {
			$fields = is_callable( array( $box, 'prop' ) ) ? lieve_dynamic_provider_call( static function() use ( $box ) { return $box->prop( 'fields' ); } ) : ( $box->meta_box['fields'] ?? array() );
			$title = is_callable( array( $box, 'prop' ) ) ? lieve_dynamic_provider_call( static function() use ( $box ) { return $box->prop( 'title' ); }, 'Fields' ) : ( $box->meta_box['title'] ?? 'Fields' );
			foreach ( (array) $fields as $field ) { if ( ! is_array( $field ) ) { continue; } $name = $field['id'] ?? ''; $register( 'CMB2', $title ?: 'Fields', $name, $field['type'] ?? 'text', static function( $context ) use ( $name ) { return get_post_meta( $context['postId'], $name, true ); }, false, $field['name'] ?? $name, '', $field ); }
		}
	}
	if ( function_exists( 'wpcf_admin_fields_get_fields' ) ) {
		foreach ( (array) lieve_dynamic_provider_call( 'wpcf_admin_fields_get_fields' ) as $name => $field ) { $register( 'Toolset', 'Post fields', $name, $field['type'] ?? 'text', static function( $context ) use ( $name ) { return get_post_meta( $context['postId'], 'wpcf-' . $name, true ); }, false, $field['name'] ?? $name ); }
	}
	return $sources;
}

/** Collections expose only safe scalar/array data, never arbitrary objects or system fields. */
function lieve_dynamic_normalize_field_value( $value, $depth = 0 ) {
	if ( $depth > 6 ) { return ''; }
	if ( is_scalar( $value ) || null === $value ) { return $value; }
	if ( is_array( $value ) ) { $result = array(); foreach ( array_slice( $value, 0, 1000, true ) as $key => $item ) { if ( is_int( $key ) || ctype_digit( (string) $key ) || lieve_dynamic_meta_key_allowed( (string) $key ) ) { $result[ $key ] = lieve_dynamic_normalize_field_value( $item, $depth + 1 ); } } return $result; }
	if ( $value instanceof WP_Post && function_exists( 'is_post_publicly_viewable' ) && is_post_publicly_viewable( $value ) && ! $value->post_password ) { return array( 'ID' => $value->ID, 'title' => $value->post_title, 'url' => get_permalink( $value ) ); }
	if ( $value instanceof WP_Term ) { return array( 'term_id' => $value->term_id, 'name' => $value->name, 'slug' => $value->slug ); }
	return '';
}
