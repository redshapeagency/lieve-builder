<?php
/** Shared design-token schema, value validation and persisted-data normalization. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_design_empty() { return array( 'version' => 1, 'categories' => array(), 'variables' => array(), 'palettes' => array(), 'colors' => array(), 'darkMode' => 'auto' ); }

function lieve_design_id( $id ) { return is_string( $id ) && preg_match( '/^ds_[a-z0-9]{8,24}$/D', $id ); }

function lieve_design_name( $name ) { return is_string( $name ) && preg_match( '/^[a-zA-Z_][a-zA-Z0-9_-]{0,79}$/D', $name ); }

function lieve_design_suffix( $name ) { return is_string( $name ) && preg_match( '/^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,59}$/D', $name ); }

function lieve_design_error( $message ) { return new WP_Error( 'lieve_invalid_design_system', $message, array( 'status' => 400 ) ); }

/** Trash retains validated definitions and their identities; it never bypasses CSS validation. */
function lieve_design_trash_metadata( $item ) {
	if ( array_key_exists( 'trashed', $item ) && ! is_bool( $item['trashed'] ) ) { return false; }
	if ( array_key_exists( 'trashedAt', $item ) && ( ! is_int( $item['trashedAt'] ) || $item['trashedAt'] < 0 || $item['trashedAt'] > 4102444800 ) ) { return false; }
	if ( empty( $item['trashed'] ) ) { return array(); }
	return array_merge( array( 'trashed' => true ), isset( $item['trashedAt'] ) ? array( 'trashedAt' => $item['trashedAt'] ) : array() );
}

function lieve_design_value( $value ) {
	if ( ! is_string( $value ) || strlen( $value ) > 1200 ) { return false; }
	$clean = lieve_style_value( 'font-family', $value );
	return '' !== $clean ? $clean : false;
}

function lieve_design_color( $value ) {
	$clean = lieve_design_value( $value );
	if ( false === $clean ) { return false; }
	$named = 'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent currentcolor inherit initial unset revert canvas canvastext linktext visitedtext activetext buttonface buttontext field fieldtext highlight highlighttext mark marktext graytext';
	if ( in_array( strtolower( $clean ), explode( ' ', $named ), true ) || preg_match( '/^#(?:[a-f0-9]{3}|[a-f0-9]{4}|[a-f0-9]{6}|[a-f0-9]{8})$/iD', $clean ) ) { return $clean; }
	if ( ! preg_match( '/^(?:var|rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\(.+\)$/isD', $clean ) ) { return false; }
	$depth = 0;
	foreach ( str_split( $clean ) as $char ) { if ( '(' === $char ) { ++$depth; } elseif ( ')' === $char && --$depth < 0 ) { return false; } }
	return 0 === $depth ? $clean : false;
}

/** Never turn malformed selective rules into an unrestricted definition. */
function lieve_design_conditions( $raw, $stored = true ) {
	if ( ! is_array( $raw ) || count( $raw ) > 30 ) { return false; }
	foreach ( $raw as $row ) {
		if ( ! is_array( $row ) || ! is_string( $row['type'] ?? null ) || ! isset( lieve_condition_types()[ $row['type'] ] ) || ! in_array( $row['action'] ?? '', array( 'include', 'exclude' ), true ) ) { return false; }
		if ( isset( $row['values'] ) && ! is_array( $row['values'] ) ) { return false; }
		if ( isset( $row['includeChildren'] ) && ! is_bool( $row['includeChildren'] ) ) { return false; }
	}
	$clean = lieve_sanitize_template_conditions( $raw );
	if ( count( $clean ) !== count( $raw ) ) { return false; }
	foreach ( $raw as $index => $row ) {
		foreach ( array( 'values', 'archivePostTypes', 'archiveTerms', 'archiveTypes' ) as $key ) {
			if ( ! isset( $row[ $key ] ) ) { continue; }
			if ( ! is_array( $row[ $key ] ) || count( $row[ $key ] ) > 100 ) { return false; }
			foreach ( $row[ $key ] as $value ) {
				if ( ! is_scalar( $value ) ) { return false; }
				// Inactive plugin post types retain their conditions, never becoming "all types".
				$post_type_value = 'archivePostTypes' === $key || ( 'values' === $key && ( 'post_type' === $row['type'] || ( 'archive' === $row['type'] && 'post_type' === ( $row['archiveType'] ?? '' ) ) ) );
				if ( $stored && $post_type_value && preg_match( '/^[a-z0-9_-]{1,32}$/D', (string) $value ) ) { $clean[ $index ][ $key ][] = (string) $value; $clean[ $index ][ $key ] = array_values( array_unique( $clean[ $index ][ $key ] ) ); continue; }
				if ( ! in_array( (string) $value, $clean[ $index ][ $key ] ?? array(), true ) ) { return false; }
			}
		}
	}
	return $clean;
}

/** Strict, bounded, all-or-nothing validation for both REST saves and JSON imports. */
function lieve_normalize_design_system( $raw, $stored = true ) {
	if ( ! is_array( $raw ) || 1 !== ( $raw['version'] ?? null ) || strlen( wp_json_encode( $raw ) ) > 1500000 ) { return lieve_design_error( 'Invalid design system format or file size (maximum 1.5 MB).' ); }
	$clean = lieve_design_empty(); $ids = array(); $names = array(); $groups = array();
	$limits = array( 'categories' => 100, 'palettes' => 100, 'variables' => 1000, 'colors' => 500 );
	foreach ( $limits as $key => $limit ) {
		if ( ! isset( $raw[ $key ] ) || ! is_array( $raw[ $key ] ) || count( $raw[ $key ] ) > $limit || ( $raw[ $key ] && array_keys( $raw[ $key ] ) !== range( 0, count( $raw[ $key ] ) - 1 ) ) ) { return lieve_design_error( 'Invalid or oversized ' . $key . ' list.' ); }
	}
	if ( ! in_array( $raw['darkMode'] ?? '', array( 'auto', 'manual', 'off' ), true ) ) { return lieve_design_error( 'Choose a valid dark color mode.' ); }
	$clean['darkMode'] = $raw['darkMode'];
	$claim_id = function( $id ) use ( &$ids ) { if ( ! lieve_design_id( $id ) || isset( $ids[ $id ] ) ) { return false; } $ids[ $id ] = true; return true; };
	$claim_name = function( $name ) use ( &$names ) { if ( ! lieve_design_name( $name ) || isset( $names[ $name ] ) || count( $names ) >= 3000 ) { return false; } $names[ $name ] = true; return true; };
	foreach ( array( 'categories', 'palettes' ) as $key ) {
		$labels = array(); $groups[ $key ] = array();
		foreach ( $raw[ $key ] as $item ) {
			if ( ! is_array( $item ) || ! $claim_id( $item['id'] ?? null ) || ! is_string( $item['name'] ?? null ) ) { return lieve_design_error( 'Invalid or duplicate category/palette ID.' ); }
			$name = trim( $item['name'] ); $label_key = function_exists( 'mb_strtolower' ) ? mb_strtolower( $name, 'UTF-8' ) : strtolower( $name );
			if ( '' === $name || strlen( $name ) > 100 || preg_match( '/[<>\x00-\x1f\x7f]/u', $name ) || isset( $labels[ $label_key ] ) ) { return lieve_design_error( 'Category and palette names must be unique, plain text (1–100 characters).' ); }
			$labels[ $label_key ] = true; $groups[ $key ][ $item['id'] ] = true;
			$clean[ $key ][] = array( 'id' => $item['id'], 'name' => $name );
			if ( array_key_exists( 'iconColor', $item ) ) {
				if ( ! is_string( $item['iconColor'] ) || ( '' !== $item['iconColor'] && ! preg_match( '/^#[a-f0-9]{6}(?:[a-f0-9]{2})?$/iD', $item['iconColor'] ) ) ) { return lieve_design_error( 'Folder background colors must be six- or eight-digit hex colors, such as #8044e3 or #8044e380, or empty for Automatic.' ); }
				if ( '' !== $item['iconColor'] ) { $clean[ $key ][ count( $clean[ $key ] ) - 1 ]['iconColor'] = strtolower( $item['iconColor'] ); }
			}
		}
	}
	$aliases = function( $raw_aliases, $prefix = '' ) use ( $claim_name ) {
		if ( ! is_array( $raw_aliases ) || count( $raw_aliases ) > 20 ) { return false; }
		foreach ( $raw_aliases as $alias ) { if ( ! $claim_name( $prefix . $alias ) ) { return false; } }
		return array_values( $raw_aliases );
	};
	foreach ( array( 'variables', 'colors' ) as $key ) {
		$group_key = 'variables' === $key ? 'categoryId' : 'paletteId'; $group_list = 'variables' === $key ? 'categories' : 'palettes';
		foreach ( $raw[ $key ] as $item ) {
			if ( ! is_array( $item ) || ! $claim_id( $item['id'] ?? null ) || ! $claim_name( $item['name'] ?? null ) || ! is_bool( $item['enabled'] ?? null ) ) { return lieve_design_error( 'Every token needs a unique ID and CSS name (letters, digits, hyphens or underscores), and an enabled flag.' ); }
			$group = $item[ $group_key ] ?? null;
			if ( ! is_string( $group ) || ( '' !== $group && ! isset( $groups[ $group_list ][ $group ] ) ) ) { return lieve_design_error( 'A token references a missing category or palette.' ); }
			$conditions = lieve_design_conditions( $item['conditions'] ?? null, $stored ); $old_names = $aliases( $item['aliases'] ?? array() );
			if ( false === $conditions || false === $old_names ) { return lieve_design_error( 'Invalid conditions or conflicting previous CSS names.' ); }
			$description = $item['description'] ?? '';
			if ( ! is_string( $description ) || strlen( $description ) > 1000 ) { return lieve_design_error( 'Descriptions must be plain text, up to 1000 characters.' ); }
			$token = array( 'id' => $item['id'], 'name' => $item['name'], $group_key => $group, 'enabled' => $item['enabled'], 'description' => sanitize_textarea_field( $description ), 'conditions' => $conditions, 'aliases' => $old_names );
			$trash = lieve_design_trash_metadata( $item ); if ( false === $trash ) { return lieve_design_error( 'Invalid Trash metadata.' ); } $token = array_merge( $token, $trash );
			if ( 'variables' === $key ) {
				$value = lieve_design_value( $item['value'] ?? null ); $values = $item['values'] ?? null;
				if ( false === $value || ! is_array( $values ) || count( $values ) > 50 ) { return lieve_design_error( 'Every variable needs a safe CSS value and valid responsive overrides.' ); }
				$token['value'] = $value; $token['values'] = array();
				foreach ( $values as $id => $override ) {
					$override = lieve_design_value( $override );
					if ( ! lieve_valid_breakpoint_id( $id ) || false === $override ) { return lieve_design_error( 'Invalid responsive variable override.' ); }
					$token['values'][ $id ] = $override;
				}
			} else {
				$light = lieve_design_color( $item['light'] ?? null ); $dark = '' === ( $item['dark'] ?? null ) ? '' : lieve_design_color( $item['dark'] ?? null );
				if ( false === $light || false === $dark || ! is_array( $item['variants'] ?? null ) || count( $item['variants'] ) > 50 ) { return lieve_design_error( 'Every color needs a safe light value, an optional dark value and at most 50 variants.' ); }
				$token['light'] = $light; $token['dark'] = $dark; $token['variants'] = array();
				foreach ( $item['variants'] as $variant ) {
					$suffix = $variant['suffix'] ?? null;
					if ( ! is_array( $variant ) || ! $claim_id( $variant['id'] ?? null ) || ! lieve_design_suffix( $suffix ) || ! $claim_name( $item['name'] . '-' . $suffix ) || ! in_array( $variant['type'] ?? '', array( 'custom', 'tint', 'shade', 'alpha' ), true ) ) { return lieve_design_error( 'Variants need unique IDs, valid suffixes and a supported type.' ); }
					$variant_aliases = $aliases( $variant['aliases'] ?? array() ); $variant_conditions = lieve_design_conditions( $variant['conditions'] ?? array(), $stored );
					if ( false === $variant_aliases || false === $variant_conditions ) { return lieve_design_error( 'Invalid variant conditions or previous names.' ); }
					// Renaming a parent also preserves its derived names, without rewriting saved pages.
					foreach ( $old_names as $old_name ) { if ( ! $claim_name( $old_name . '-' . $suffix ) ) { return lieve_design_error( 'A previous color name conflicts with another variant.' ); } }
					$v = array( 'id' => $variant['id'], 'suffix' => $suffix, 'type' => $variant['type'], 'conditions' => $variant_conditions, 'aliases' => $variant_aliases );
					$trash = lieve_design_trash_metadata( $variant ); if ( false === $trash ) { return lieve_design_error( 'Invalid variant Trash metadata.' ); } $v = array_merge( $v, $trash );
					if ( 'custom' === $v['type'] ) {
						$v['light'] = lieve_design_color( $variant['light'] ?? null ); $v['dark'] = '' === ( $variant['dark'] ?? null ) ? '' : lieve_design_color( $variant['dark'] ?? null );
						if ( false === $v['light'] || false === $v['dark'] ) { return lieve_design_error( 'Custom variants need a safe light value and an optional dark value.' ); }
					} else {
						$amount = $variant['amount'] ?? null;
						if ( ! is_numeric( $amount ) || ! is_finite( (float) $amount ) || $amount < 0 || $amount > 100 ) { return lieve_design_error( 'Variant percentages must be between 0 and 100.' ); }
						$v['amount'] = (float) $amount;
					}
					$token['variants'][] = $v;
				}
			}
			$clean[ $key ][] = $token;
		}
	}
	return $clean;
}
