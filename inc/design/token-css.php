<?php
/** Context-aware token availability, variants and generated CSS declarations. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_design_matches( $conditions, $post_id = 0 ) {
	if ( ! $conditions ) { return true; }
	$rows = array(); $has_include = false; $live_include = false; $known = array_keys( lieve_condition_post_type_options() );
	foreach ( $conditions as $row ) {
		$has_include = $has_include || 'include' === $row['action'];
		if ( 'post_type' === $row['type'] && $row['values'] ) { $row['values'] = array_values( array_intersect( $known, $row['values'] ) ); if ( ! $row['values'] ) { continue; } }
		if ( 'archive' === $row['type'] && ! empty( $row['archivePostTypes'] ) && in_array( 'post_type', $row['archiveTypes'], true ) ) {
			$row['archivePostTypes'] = array_values( array_intersect( $known, $row['archivePostTypes'] ) );
			if ( ! $row['archivePostTypes'] ) { $row['archiveTypes'] = array_values( array_diff( $row['archiveTypes'], array( 'post_type' ) ) ); if ( ! $row['archiveTypes'] ) { continue; } $row['archiveType'] = $row['archiveTypes'][0]; }
		}
		$live_include = $live_include || 'include' === $row['action']; $rows[] = $row;
	}
	if ( $has_include && ! $live_include ) { return false; }
	return ! $rows || lieve_evaluate_template_conditions( $rows, $post_id )['matches'];
}

function lieve_design_active_ids( $data, $post_id = 0 ) {
	$ids = array();
	foreach ( array_merge( $data['variables'], $data['colors'] ) as $item ) {
		if ( ! empty( $item['trashed'] ) || ! $item['enabled'] || ! lieve_design_matches( $item['conditions'], $post_id ) ) { continue; }
		$ids[] = $item['id'];
		foreach ( $item['variants'] ?? array() as $variant ) { if ( empty( $variant['trashed'] ) && lieve_design_matches( $variant['conditions'], $post_id ) ) { $ids[] = $variant['id']; } }
	}
	return $ids;
}

function lieve_design_context_ids( $data, $post_id ) {
	$post = $post_id ? get_post( $post_id ) : null;
	return $post ? lieve_with_editor_page_context( $post, function() use ( $data, $post_id ) { return lieve_design_active_ids( $data, $post_id ); } ) : lieve_design_active_ids( $data );
}

function lieve_design_variant_value( $color, $variant, $dark = false ) {
	if ( 'custom' === $variant['type'] ) { return $dark && $variant['dark'] ? $variant['dark'] : $variant['light']; }
	$amount = $variant['amount']; $mix = 'tint' === $variant['type'] ? 'white' : ( 'shade' === $variant['type'] ? 'black' : 'transparent' );
	return 'color-mix(in srgb,var(--' . $color['name'] . ') ' . ( 'alpha' === $variant['type'] ? $amount : 100 - $amount ) . '%,' . $mix . ')';
}

/** Identify unitless numbers and number-only variable math without evaluating CSS. */
function lieve_design_numeric_value( $value, $values, $seen = array() ) {
	if ( count( $seen ) >= 32 ) { return false; }
	$value = preg_replace_callback( '/var\(\s*--([A-Za-z_][A-Za-z0-9_-]*)\s*(?:,\s*([^()]+))?\)/', static function( $match ) use ( $values, $seen ) {
		$name = $match[1]; if ( isset( $seen[ $name ] ) ) { return 'invalid'; }
		$seen[ $name ] = true;
		return lieve_design_numeric_value( $values[ $name ] ?? $match[2] ?? 'invalid', $values, $seen ) ? '0' : 'invalid';
	}, trim( $value ) );
	if ( preg_match( '/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/iD', $value ) ) { return true; }
	return preg_match( '/^(?:calc|min|max|clamp)\(/i', $value ) && preg_match( '/\d/', $value ) && preg_match( '/^[\d.eE+*\/(),\s-]+$/D', preg_replace( '/\b(?:calc|min|max|clamp)\(/i', '(', $value ) );
}

/** One helper per variable preserves unitful values; numeric values use the field fallback. */
function lieve_design_dimension_declarations( $items ) {
	$values = array(); $css = '';
	foreach ( $items as $item ) { $values[ $item['name'] ] = $item['value']; foreach ( $item['aliases'] as $alias ) { $values[ $alias ] = 'var(--' . $item['name'] . ')'; } }
	foreach ( $items as $item ) {
		$css .= '--lieve-dimension--' . $item['name'] . ':' . ( lieve_design_numeric_value( $item['value'], $values ) ? 'initial' : 'var(--' . $item['name'] . ')' ) . ';';
		foreach ( $item['aliases'] as $alias ) { $css .= '--lieve-dimension--' . $alias . ':var(--lieve-dimension--' . $item['name'] . ');'; }
	}
	return $css;
}

function lieve_design_declaration( $item, $value ) {
	$css = '--' . $item['name'] . ':' . $value . ';';
	foreach ( $item['aliases'] ?? array() as $alias ) { $css .= '--' . $alias . ':var(--' . $item['name'] . ');'; }
	return $css;
}

/** Selective tokens are absent on unmatched requests, including aliases and variants. */
function lieve_design_css( $data = null, $active = null ) {
	$data = null === $data ? lieve_design_system() : $data; $active = array_flip( null === $active ? lieve_design_active_ids( $data, get_queried_object_id() ) : $active );
	// A stale or explicit preview-ID list must never resurrect trashed definitions.
	foreach ( array_merge( $data['variables'], $data['colors'] ) as $item ) { if ( ! empty( $item['trashed'] ) ) { unset( $active[ $item['id'] ] ); } foreach ( $item['variants'] ?? array() as $variant ) { if ( ! empty( $item['trashed'] ) || ! empty( $variant['trashed'] ) ) { unset( $active[ $variant['id'] ] ); } } }
	$base = ''; $dark = ''; $responsive = ''; $order = lieve_breakpoint_order(); $dimensions = array();
	foreach ( $data['variables'] as $item ) { if ( isset( $active[ $item['id'] ] ) ) { $value = $item['values'][ $order[0]['id'] ] ?? $item['value']; $base .= lieve_design_declaration( $item, $value ); $dimensions[ $item['id'] ] = array( 'name' => $item['name'], 'value' => $value, 'aliases' => $item['aliases'] ); } }
	$base .= lieve_design_dimension_declarations( $dimensions );
	foreach ( array_slice( $order, 1 ) as $bp ) {
		$declarations = '';
		foreach ( $data['variables'] as $item ) { if ( isset( $active[ $item['id'] ], $item['values'][ $bp['id'] ] ) ) { $declarations .= '--' . $item['name'] . ':' . $item['values'][ $bp['id'] ] . ';'; $dimensions[ $item['id'] ]['value'] = $item['values'][ $bp['id'] ]; } }
		if ( $declarations ) { $responsive .= '@media(' . lieve_breakpoint_media( $bp, $order[0] ) . '){:root{' . $declarations . lieve_design_dimension_declarations( $dimensions ) . '}}'; }
	}
	foreach ( $data['colors'] as $color ) {
		if ( ! isset( $active[ $color['id'] ] ) ) { continue; }
		$base .= lieve_design_declaration( $color, $color['light'] );
		if ( $color['dark'] ) { $dark .= '--' . $color['name'] . ':' . $color['dark'] . ';'; }
		foreach ( $color['variants'] as $variant ) {
			if ( ! isset( $active[ $variant['id'] ] ) ) { continue; }
			$token = array( 'name' => $color['name'] . '-' . $variant['suffix'], 'aliases' => $variant['aliases'] );
			foreach ( $color['aliases'] as $alias ) { $token['aliases'][] = $alias . '-' . $variant['suffix']; }
			$base .= lieve_design_declaration( $token, lieve_design_variant_value( $color, $variant ) );
			if ( 'custom' === $variant['type'] && $variant['dark'] ) { $dark .= '--' . $token['name'] . ':' . $variant['dark'] . ';'; }
		}
	}
	$css = $base ? ':root{' . $base . '}' . $responsive : '';
	if ( $dark && 'off' !== $data['darkMode'] ) {
		if ( 'auto' === $data['darkMode'] ) { $css .= '@media(prefers-color-scheme:dark){:root:not([data-color-mode="light"]){' . $dark . '}}'; }
		$css .= ':root[data-color-mode="dark"]{' . $dark . '}';
	}
	return $css;
}

function lieve_print_design_css() {
	$css = lieve_design_css();
	if ( function_exists( 'lieve_print_generated_css' ) ) { lieve_print_generated_css( $css, 'id', 'lieve-design-tokens' ); }
	elseif ( $css ) { echo '<style id="lieve-design-tokens">' . $css . '</style>'; /* Validated declarations only; never raw HTML. */ }
}
