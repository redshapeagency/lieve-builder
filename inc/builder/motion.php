<?php
/** Lieve Motion: versioned timelines, strict input validation and conditional assets. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_motion_catalog() {
	static $catalog;
	if ( null === $catalog ) { $catalog = json_decode( file_get_contents( __DIR__ . '/motion-catalog.json' ), true ); }
	return $catalog;
}

function lieve_motion_number( $value, $min, $max ) {
	return ( is_int( $value ) || is_float( $value ) ) && is_finite( (float) $value ) && $value >= $min && $value <= $max;
}

function lieve_motion_name( $value ) {
	return is_string( $value ) && count( preg_split( '//u', $value, -1, PREG_SPLIT_NO_EMPTY ) ?: array() ) <= 120 && ! preg_match( '/[<>\x00-\x1f\x7f]/', $value );
}

function lieve_motion_value_allowed( $key, $value ) {
	$spec = lieve_motion_catalog()['properties'][ $key ] ?? null;
	if ( ! $spec ) { return false; }
	if ( 'number' === $spec['type'] ) { return lieve_motion_number( $value, $spec['min'], $spec['max'] ); }
	if ( ! is_string( $value ) || ! trim( $value ) || strlen( $value ) > 150 ) { return false; }
	if ( 'length' === $spec['type'] ) { return (bool) preg_match( '/^(?:\d+(?:\.\d+)?(?:px|em|rem|%|vw|vh)?|var\(--[A-Za-z_][\w-]*\))$/D', $value ); }
	return (bool) preg_match( '/^(?:#[a-f0-9]{3,8}|[a-z]+|(?:rgb|rgba|hsl|hsla)\([\d\s.,%\/+\-]+\)|var\(--[A-Za-z_][\w-]*\))$/iD', $value );
}

function lieve_motion_errors( $row ) {
	$errors = array(); $catalog = lieve_motion_catalog();
	if ( ! is_array( $row ) || 1 !== ( $row['version'] ?? null ) || ! is_string( $row['id'] ?? null ) || ! preg_match( '/^lm_[a-f0-9]{12,24}$/D', $row['id'] ) ) { return array( 'timeline' => 'Invalid Motion timeline or version.' ); }
	if ( ! lieve_motion_name( $row['name'] ?? null ) ) { $errors['name'] = 'Use a plain-text timeline name, up to 120 characters.'; }
	if ( ! is_bool( $row['enabled'] ?? null ) || ! is_bool( $row['yoyo'] ?? null ) || ! in_array( $row['reduced'] ?? null, array( 'skip', 'finish' ), true ) || ! is_string( $row['trigger'] ?? null ) || ! isset( $catalog['triggers'][ $row['trigger'] ] ) ) { $errors['settings'] = 'Choose valid timeline settings.'; }
	if ( ! is_int( $row['repeat'] ?? null ) || ! lieve_motion_number( $row['repeat'], -1, 100 ) ) { $errors['repeat'] = 'Repeat must be a whole number from -1 to 100.'; }
	foreach ( array( 'minWidth', 'maxWidth' ) as $key ) { if ( '' !== ( $row[ $key ] ?? null ) && ( ! is_int( $row[ $key ] ?? null ) || ! lieve_motion_number( $row[ $key ], 0, 7680 ) ) ) { $errors[ $key ] = 'Enter a whole viewport width from 0 to 7680, or leave blank.'; } }
	if ( is_numeric( $row['minWidth'] ?? null ) && is_numeric( $row['maxWidth'] ?? null ) && $row['minWidth'] > $row['maxWidth'] ) { $errors['maxWidth'] = 'Maximum width must not be smaller than minimum width.'; }
	if ( ! lieve_motion_number( $row['scrollStart'] ?? null, 0, 100 ) || ! lieve_motion_number( $row['scrollEnd'] ?? null, 0, 100 ) || $row['scrollStart'] <= $row['scrollEnd'] ) { $errors['scrollEnd'] = 'Scroll start must be greater than scroll end (viewport %).'; }
	if ( ! is_array( $row['steps'] ?? null ) || ! $row['steps'] || count( $row['steps'] ) > $catalog['stepLimit'] || array_values( $row['steps'] ) !== $row['steps'] ) { $errors['steps'] = 'Use between 1 and ' . $catalog['stepLimit'] . ' animation steps.'; return $errors; }
	$values = static function( $map, $prefix ) use ( &$errors, $catalog ) {
		if ( ! is_array( $map ) || count( $map ) > count( $catalog['properties'] ) ) { $errors[ $prefix ] = 'Use supported animation properties.'; return; }
		foreach ( $map as $key => $value ) { if ( ! lieve_motion_value_allowed( $key, $value ) ) { $errors[ $prefix . '.' . $key ] = 'Enter a valid ' . ( $catalog['properties'][ $key ]['label'] ?? 'animation property' ) . '.'; } }
	};
	$timing = static function( $values, $prefix ) use ( &$errors ) {
		foreach ( array( 'start' => array( 0, 300 ), 'duration' => array( .01, 120 ), 'stagger' => array( 0, 10 ) ) as $key => $range ) {
			if ( array_key_exists( $key, $values ) && ! lieve_motion_number( $values[ $key ], $range[0], $range[1] ) ) { $errors[ $prefix . $key ] = 'Enter ' . $key . ' between ' . $range[0] . ' and ' . $range[1] . ' seconds.'; }
		}
	};
	$used = array();
	foreach ( $row['steps'] as $step ) {
		if ( ! is_array( $step ) || ! is_string( $step['id'] ?? null ) || ! preg_match( '/^ls_[a-f0-9]{12,24}$/D', $step['id'] ) || isset( $used[ $step['id'] ] ) ) { $errors['steps'] = 'Each animation step needs a unique ID.'; continue; }
		$used[ $step['id'] ] = true; $prefix = $step['id'] . '.';
		if ( ! lieve_motion_name( $step['name'] ?? null ) || ! in_array( $step['target'] ?? null, array( 'self', 'children', 'element' ), true ) || ! is_string( $step['selector'] ?? null ) || strlen( $step['selector'] ) > 300 || preg_match( '/[<>\x00-\x1f\x7f]/', $step['selector'] ) || ( 'self' !== $step['target'] && ! trim( $step['selector'] ) ) || ( 'element' === $step['target'] && ! preg_match( '/^[\w-]{1,220}$/D', $step['selector'] ) ) ) { $errors[ $prefix . 'target' ] = 'Choose an element or a valid child selector.'; }
		if ( ! is_string( $step['ease'] ?? null ) || ! isset( $catalog['eases'][ $step['ease'] ] ) ) { $errors[ $prefix . 'ease' ] = 'Choose a supported easing.'; }
		foreach ( array( 'start', 'duration', 'stagger' ) as $key ) { if ( ! array_key_exists( $key, $step ) ) { $errors[ $prefix . $key ] = 'Enter animation timing.'; } } $timing( $step, $prefix );
		$values( $step['from'] ?? null, $prefix . 'from' ); $values( $step['to'] ?? null, $prefix . 'to' );
		if ( empty( $step['to'] ) ) { $errors[ $prefix . 'to' ] = 'Add at least one destination property.'; }
		if ( ! is_array( $step['overrides'] ?? null ) || count( $step['overrides'] ) > 40 ) { $errors[ $prefix . 'overrides' ] = 'Invalid responsive animation overrides.'; continue; }
		foreach ( $step['overrides'] as $device => $override ) {
			$pre = $prefix . $device . '.';
			if ( ! preg_match( '/^(desktop|tablet|mobile|bp_[a-z0-9]{8,24})$/D', (string) $device ) || ! is_array( $override ) || array_diff( array_keys( $override ), array( 'start', 'duration', 'stagger', 'from', 'to' ) ) ) { $errors[ $pre ] = 'Invalid responsive animation override.'; continue; }
			$timing( $override, $pre ); foreach ( array( 'from', 'to' ) as $key ) { if ( isset( $override[ $key ] ) ) { $values( $override[ $key ], $pre . $key ); } }
		}
	}
	return $errors;
}

/** Keep only the public schema: GSAP callbacks, plugins, arbitrary properties and URLs never pass. */
function lieve_sanitize_motion( $rows ) {
	if ( ! is_array( $rows ) ) { return array(); }
	$clean = array(); $keys = array( 'version', 'id', 'name', 'enabled', 'trigger', 'repeat', 'yoyo', 'reduced', 'minWidth', 'maxWidth', 'scrollStart', 'scrollEnd', 'steps' );
	foreach ( array_slice( $rows, 0, lieve_motion_catalog()['limit'] ) as $row ) {
		if ( lieve_motion_errors( $row ) ) { continue; }
		$row = array_intersect_key( $row, array_flip( $keys ) );
		foreach ( $row['steps'] as &$step ) { $step = array_intersect_key( $step, array_flip( array( 'id', 'name', 'target', 'selector', 'start', 'duration', 'stagger', 'ease', 'from', 'to', 'overrides' ) ) ); } unset( $step );
		$clean[] = $row;
	}
	return $clean;
}

function lieve_validate_document_motion( $document ) {
	$ids = array(); $nodes = array(); $rows = array(); $timeline_ids = array(); $steps = array();
	$walk = static function( $children, $depth = 0 ) use ( &$walk, &$ids, &$nodes ) { if ( ! is_array( $children ) || $depth > 12 ) { return; } foreach ( $children as $node ) { if ( ! is_array( $node ) ) { continue; } $nodes[] = $node; if ( is_string( $node['id'] ?? null ) ) { $ids[ $node['id'] ] = true; } $walk( $node['children'] ?? array(), $depth + 1 ); } };
	$walk( $document['children'] ?? array() );
	foreach ( $nodes as $node ) {
		$rows = $node['props']['motion'] ?? array(); $error = '';
		if ( ! is_array( $rows ) || count( $rows ) > lieve_motion_catalog()['limit'] || array_values( $rows ) !== $rows ) { $error = 'Use at most 8 Motion timelines per element.'; }
		else { foreach ( $rows as $row ) {
			$issues = lieve_motion_errors( $row ); if ( $issues ) { $error = reset( $issues ); break; }
			if ( isset( $timeline_ids[ $row['id'] ] ) ) { $error = 'Motion timeline IDs must be unique in this document.'; break; } $timeline_ids[ $row['id'] ] = $row['enabled'];
			if ( $row['enabled'] && 'html' === ( $node['type'] ?? '' ) && function_exists( 'lieve_html_has_wrapper' ) && ! lieve_html_has_wrapper( $node['props'] ) ) { $error = 'Enable an explicit HTML wrapper before adding Motion.'; break; }
			foreach ( $row['steps'] as $step ) {
				if ( isset( $steps[ $step['id'] ] ) ) { $error = 'Motion step IDs must be unique in this document.'; break; } $steps[ $step['id'] ] = true;
				if ( $row['enabled'] && 'element' === $step['target'] && ! isset( $ids[ $step['selector'] ] ) ) { $error = 'A Motion target no longer exists. Choose another element.'; break; }
			}
		} }
		if ( $error ) { return new WP_Error( 'lieve_invalid_motion', $error, array( 'status' => 400, 'elementId' => $node['id'] ?? '' ) ); }
	}
	foreach ( $nodes as $node ) { foreach ( $node['props']['interactions'] ?? array() as $rule ) { if ( is_array( $rule ) && ! empty( $rule['enabled'] ) && 0 === strpos( $rule['action'] ?? '', 'motion-' ) && empty( $timeline_ids[ $rule['timelineId'] ?? '' ] ) ) { return new WP_Error( 'lieve_invalid_motion', 'Choose an enabled Motion timeline in Interact.', array( 'status' => 400, 'elementId' => $node['id'] ?? '' ) ); } } }
	return true;
}

function lieve_enqueue_motion( $editor = false ) {
	wp_enqueue_script( 'lieve-gsap', LIEVE_URL . 'assets/vendor/gsap/gsap.min.js', array(), '3.15.0', ! $editor );
	wp_enqueue_script( 'lieve-gsap-scroll', LIEVE_URL . 'assets/vendor/gsap/ScrollTrigger.min.js', array( 'lieve-gsap' ), '3.15.0', ! $editor );
	wp_enqueue_script( 'lieve-motion-model', LIEVE_URL . 'assets/js/motion-model.js', array(), lieve_asset_version( 'assets/js/motion-model.js' ), ! $editor );
	wp_localize_script( 'lieve-motion-model', 'LieveMotionCatalog', lieve_motion_catalog() );
	wp_enqueue_script( 'lieve-motion-runtime', LIEVE_URL . 'assets/js/motion-runtime.js', array( 'lieve-motion-model', 'lieve-gsap-scroll' ), lieve_asset_version( 'assets/js/motion-runtime.js' ), ! $editor );
}

/** Template duplication remaps Motion and Interact links together with element IDs. */
function lieve_reidentify_motion( &$nodes, $element_ids ) {
	$ids = array();
	$walk = static function( &$children, $apply ) use ( &$walk, &$ids, $element_ids ) {
		foreach ( $children as &$node ) {
			foreach ( $node['props']['motion'] ?? array() as $index => $row ) {
				if ( ! $apply ) { $ids[ $row['id'] ] = 'lm_' . substr( str_replace( '-', '', wp_generate_uuid4() ), 0, 20 ); continue; }
				$row['id'] = $ids[ $row['id'] ];
				foreach ( $row['steps'] as &$step ) { $step['id'] = 'ls_' . substr( str_replace( '-', '', wp_generate_uuid4() ), 0, 20 ); if ( 'element' === $step['target'] && isset( $element_ids[ $step['selector'] ] ) ) { $step['selector'] = $element_ids[ $step['selector'] ]; } } unset( $step );
				$node['props']['motion'][ $index ] = $row;
			}
			if ( $apply ) { foreach ( $node['props']['interactions'] ?? array() as $index => $rule ) { if ( isset( $ids[ $rule['timelineId'] ?? '' ] ) ) { $node['props']['interactions'][ $index ]['timelineId'] = $ids[ $rule['timelineId'] ]; } } }
			$walk( $node['children'], $apply );
		} unset( $node );
	};
	$walk( $nodes, false ); $walk( $nodes, true );
}

function lieve_motion_attributes( $node ) {
	if ( ! empty( $GLOBALS['lieve_element_preview'] ) ) { return ''; }
	$rows = array_values( array_filter( lieve_sanitize_motion( $node['props']['motion'] ?? array() ), static function( $row ) { return $row['enabled']; } ) );
	if ( ! $rows ) { return ''; }
	foreach ( $rows as &$row ) { foreach ( $row['steps'] as &$step ) { if ( 'element' === $step['target'] && function_exists( 'lieve_element_target_id' ) ) { $step['selector'] = lieve_element_target_id( $step['selector'] ); } } unset( $step ); } unset( $row );
	if ( function_exists( 'wp_enqueue_script' ) && defined( 'LIEVE_URL' ) ) { lieve_enqueue_motion(); }
	$data = array( 'timelines' => $rows, 'breakpoints' => function_exists( 'lieve_breakpoint_definitions' ) ? lieve_breakpoint_definitions() : array() );
	return ' data-lieve-motion="' . esc_attr( wp_json_encode( $data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ) ) . '"';
}
