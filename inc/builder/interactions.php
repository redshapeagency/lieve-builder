<?php
/** Named, declarative element behaviors. No executable code or implicit wrappers. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_interaction_catalog() {
	static $catalog = null;
	if ( null === $catalog ) { $catalog = json_decode( file_get_contents( __DIR__ . '/interactions-catalog.json' ), true ); }
	return $catalog;
}

function lieve_interaction_defaults() {
	return array_map( static function( $field ) { return $field['default']; }, lieve_interaction_catalog()['fields'] );
}

/** Trusted site code opts in individual functions; content authors cannot add paths. */
function lieve_interaction_functions() {
	$registered = function_exists( 'apply_filters' ) ? apply_filters( 'lieve_interaction_functions', array() ) : array();
	$output = array();
	foreach ( is_array( $registered ) ? $registered : array() as $path => $label ) {
		if ( is_int( $path ) ) { $path = $label; }
		if ( ! is_string( $path ) || ! preg_match( '/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/D', $path ) || array_intersect( explode( '.', $path ), array( '__proto__', 'prototype', 'constructor', 'eval', 'Function', 'setTimeout', 'setInterval', 'document', 'location', 'fetch', 'open', 'globalEval' ) ) ) { continue; }
		$output[ $path ] = is_string( $label ) ? strip_tags( $label ) : $path;
	}
	return $output;
}

function lieve_interaction_attribute_allowed( $name ) {
	return preg_match( '/^[a-z_][a-z0-9_.:-]{0,99}$/iD', $name ) && ! preg_match( '/^(on|data-(lieve-|editor-|wp-|id$))/i', $name ) && ! in_array( strtolower( $name ), array( 'id', 'class', 'style', 'srcdoc', 'src', 'href', 'action', 'formaction', 'xlink:href', 'srcset', 'poster', 'data', 'codebase' ), true );
}

function lieve_interaction_json_error( $value, $action ) {
	$parsed = json_decode( $value );
	if ( JSON_ERROR_NONE !== json_last_error() ) { return 'Use valid JSON without unsafe keys, infinite numbers or excessive nesting.'; }
	if ( 'call' === $action && ! is_array( $parsed ) ) { return 'Function arguments must be a JSON array.'; }
	$count = 0;
	$walk = static function( $value, $depth ) use ( &$walk, &$count ) {
		if ( ++$count > 1000 || $depth > 16 || ( is_float( $value ) && ! is_finite( $value ) ) ) { return false; }
		if ( is_object( $value ) || is_array( $value ) ) { foreach ( $value as $key => $child ) { if ( in_array( $key, array( '__proto__', 'constructor', 'prototype' ), true ) || ! $walk( $child, $depth + 1 ) ) { return false; } } }
		return true;
	};
	return $walk( $parsed, 0 ) ? '' : 'Use valid JSON without unsafe keys, infinite numbers or excessive nesting.';
}

function lieve_interaction_errors( $raw ) {
	if ( ! is_array( $raw ) ) { return array( 'row' => 'Invalid interaction.' ); }
	$catalog = lieve_interaction_catalog(); $row = array_replace( lieve_interaction_defaults(), $raw ); $errors = array();
	foreach ( $catalog['fields'] as $key => $field ) {
		$value = $row[ $key ]; $type = $field['type'];
		$length = is_string( $value ) ? count( preg_split( '//u', $value, -1, PREG_SPLIT_NO_EMPTY ) ?: array() ) : 0;
		if ( ( 'boolean' === $type && ! is_bool( $value ) ) || ( 'number' === $type && ( ! is_int( $value ) && ! is_float( $value ) || ! is_finite( (float) $value ) || $value < $field['min'] || $value > $field['max'] ) ) || ( in_array( $type, array( 'string', 'select' ), true ) && ( ! is_string( $value ) || $length > ( $field['max'] ?? 2000 ) ) ) ) { $errors[ $key ] = 'Enter a valid ' . ( $field['label'] ?? $key ) . '.'; }
		if ( isset( $field['options'] ) && ( ! is_string( $value ) || ! array_key_exists( $value, $field['options'] ) ) ) { $errors[ $key ] = 'Choose a valid option.'; }
	}
	if ( ! is_string( $row['id'] ) || ! preg_match( '/^li_[a-f0-9]{12,24}$/D', $row['id'] ) ) { $errors['id'] = 'This interaction needs a unique ID.'; }
	foreach ( array( 'trigger' => 'triggers', 'action' => 'actions', 'targetMode' => 'targets' ) as $field => $choices ) { if ( ! is_string( $row[ $field ] ) || ! isset( $catalog[ $choices ][ $row[ $field ] ] ) ) { $errors[ $field ] = 'Choose a valid ' . $field . '.'; } }
	if ( $errors ) { return $errors; }
	if ( $row['enabled'] ) {
		if ( 0 === strpos( $row['action'], 'motion-' ) && ! preg_match( '/^lm_[a-f0-9]{12,24}$/D', $row['timelineId'] ) ) { $errors['timelineId'] = 'Choose a Motion timeline.'; }
		if ( empty( $catalog['actions'][ $row['action'] ]['noTarget'] ) && 'popup' === $row['targetMode'] ) {
			if ( ! in_array( $row['action'], array( 'open-dialog', 'close-dialog', 'toggle-dialog' ), true ) ) { $errors['targetMode'] = 'Pop Up targets require a dialog action.'; }
			if ( ! preg_match( '/^[1-9]\d{0,14}$/D', $row['targetValue'] ) ) { $errors['targetValue'] = 'Choose an active Pop Up template.'; }
		}
		if ( empty( $catalog['actions'][ $row['action'] ]['noTarget'] ) && in_array( $row['targetMode'], array( 'element', 'selector', 'children', 'closest' ), true ) && '' === trim( $row['targetValue'] ) ) { $errors['targetValue'] = 'Choose an element or enter a target selector.'; }
		if ( empty( $catalog['actions'][ $row['action'] ]['noTarget'] ) && 'element' === $row['targetMode'] && $row['targetValue'] && ! preg_match( '/^[A-Za-z0-9_-]{1,64}$/D', $row['targetValue'] ) ) { $errors['targetValue'] = 'Choose an element in this document.'; }
		if ( 'keydown' === $row['trigger'] && '' === trim( $row['key'] ) ) { $errors['key'] = 'Choose a keyboard key.'; }
		if ( 'custom' === $row['trigger'] || 'dispatch' === $row['action'] ) { if ( ! preg_match( '/^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/D', $row['eventName'] ) || preg_match( '/^lieve:interaction-(end|error)$/D', $row['eventName'] ) ) { $errors['eventName'] = 'Enter a custom event name; lifecycle event names are reserved.'; } }
		if ( 'interaction-end' === $row['trigger'] && ( ! preg_match( '/^li_[a-f0-9]{12,24}$/D', $row['afterId'] ) || $row['afterId'] === $row['id'] ) ) { $errors['afterId'] = 'Choose a different interaction ID.'; }
		if ( in_array( $row['trigger'], array( 'enter-view', 'leave-view' ), true ) && ! preg_match( '/^(?:-?\d+(?:\.\d+)?(?:px|%))(?:\s+-?\d+(?:\.\d+)?(?:px|%)){0,3}$/D', trim( $row['rootMargin'] ) ) ) { $errors['rootMargin'] = 'Use one to four px or % values.'; }
		if ( in_array( $row['action'], array( 'add-class', 'remove-class', 'toggle-class' ), true ) && ( '' === trim( $row['className'] ) || ! preg_match( '/^(?:--|[A-Za-z_]|-[A-Za-z_])[A-Za-z0-9_-]*(?:\s+(?:--|[A-Za-z_]|-[A-Za-z_])[A-Za-z0-9_-]*)*$/D', trim( $row['className'] ) ) ) ) { $errors['className'] = 'Enter CSS class names without dots.'; }
		if ( in_array( $row['action'], array( 'set-attribute', 'remove-attribute', 'toggle-attribute' ), true ) && ! lieve_interaction_attribute_allowed( $row['attribute'] ) ) { $errors['attribute'] = 'Use a safe attribute such as aria-expanded or data-state. IDs, classes, styles and executable/URL attributes have dedicated controls.'; }
		if ( in_array( $row['action'], array( 'set-style', 'remove-style' ), true ) && ( ! preg_match( '/^(--[a-zA-Z_][a-zA-Z0-9_-]*|[a-z][a-z-]*)$/D', $row['property'] ) || in_array( $row['property'], array( 'behavior', '-moz-binding' ), true ) ) ) { $errors['property'] = 'Enter a CSS property or custom property.'; }
		if ( 'set-style' === $row['action'] && ( '' === trim( $row['value'] ) || preg_match( '~[;{}<>@\\\\\x00-\x1f]|/\*|\*/|(?:expression|url|attr)\s*\(~i', $row['value'] ) ) ) { $errors['value'] = 'Enter a safe CSS value, without declarations or URL functions.'; }
		if ( 'navigate' === $row['action'] && ( '' === trim( $row['url'] ) || preg_match( '/[\x00-\x20\x7f\\\\]/', $row['url'] ) || ! ( preg_match( '~^https?://[^/\s]+~i', $row['url'] ) || preg_match( '~^[/#?]~', $row['url'] ) && 0 !== strpos( $row['url'], '//' ) ) ) ) { $errors['url'] = 'Use an HTTP(S) URL or a local /path, #anchor or ?query.'; }
		if ( 0 === strpos( $row['action'], 'storage-' ) && '' === trim( $row['storageKey'] ) ) { $errors['storageKey'] = 'Enter a storage key.'; }
		if ( 'checkout-step' === $row['action'] && '' === trim( $row['step'] ) ) { $errors['step'] = 'Enter a checkout step ID.'; }
		if ( 'call' === $row['action'] && ( ! preg_match( '/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/D', $row['functionName'] ) || array_intersect( explode( '.', $row['functionName'] ), array( '__proto__', 'prototype', 'constructor', 'eval', 'Function', 'setTimeout', 'setInterval', 'document', 'location', 'fetch', 'open' ) ) ) ) { $errors['functionName'] = 'Use a named site function, for example mySite.openPanel.'; }
		if ( in_array( $row['action'], array( 'call', 'dispatch' ), true ) ) { $error = lieve_interaction_json_error( $row['arguments'], $row['action'] ); if ( $error ) { $errors['arguments'] = $error; } }
	}
	foreach ( array( 'minWidth', 'maxWidth' ) as $field ) { if ( '' !== $row[ $field ] && ! preg_match( '/^\d{1,6}$/D', $row[ $field ] ) ) { $errors[ $field ] = 'Use a positive viewport width or leave blank.'; } }
	if ( '' !== $row['minWidth'] && '' !== $row['maxWidth'] && (int) $row['minWidth'] > (int) $row['maxWidth'] ) { $errors['maxWidth'] = 'Maximum width must be at least the minimum.'; }
	$conditions = $raw['conditions'] ?? array();
	if ( ! is_array( $conditions ) || count( $conditions ) > $catalog['conditionLimit'] ) { $errors['conditions'] = 'Use at most ' . $catalog['conditionLimit'] . ' conditions.'; return $errors; }
	foreach ( $conditions as $index => $item ) {
		if ( ! is_array( $item ) || ! in_array( $item['kind'] ?? null, array( 'storage', 'media', 'selector' ), true ) || ! in_array( $item['operator'] ?? null, array( 'exists', 'missing', 'equals', 'not-equals', 'contains', 'gt', 'gte', 'lt', 'lte' ), true ) || ! is_string( $item['key'] ?? null ) || strlen( $item['key'] ) > 500 || ! is_string( $item['value'] ?? null ) || strlen( $item['value'] ) > 2000 || ( 'storage' === ( $item['kind'] ?? '' ) && ! in_array( $item['storage'] ?? null, array( 'memory', 'local', 'session' ), true ) ) ) { $errors[ 'condition-' . $index ] = 'Choose valid condition fields.'; }
		elseif ( $row['enabled'] && '' === trim( $item['key'] ) ) { $errors[ 'condition-' . $index ] = 'Enter a storage key, media query or CSS selector.'; }
		elseif ( 'storage' !== $item['kind'] && ! in_array( $item['operator'], array( 'exists', 'missing' ), true ) ) { $errors[ 'condition-' . $index ] = 'Use matches or does not match for media and element conditions.'; }
		elseif ( $row['enabled'] && in_array( $item['operator'], array( 'gt', 'gte', 'lt', 'lte' ), true ) && ! is_numeric( $item['value'] ) ) { $errors[ 'condition-' . $index ] = 'Numeric comparisons need a numeric value.'; }
	}
	return $errors;
}

/** Reads are defensive; REST validates before writes, never silently executes malformed rows. */
function lieve_sanitize_interactions( $rows ) {
	if ( ! is_array( $rows ) ) { return array(); }
	$output = array(); $catalog = lieve_interaction_catalog();
	foreach ( array_slice( $rows, 0, $catalog['limit'] ) as $row ) {
		if ( ! is_array( $row ) || lieve_interaction_errors( $row ) ) { continue; }
		$clean = array_replace( lieve_interaction_defaults(), array_intersect_key( $row, $catalog['fields'] ) );
		$clean['conditions'] = array_map( static function( $item ) { return array_intersect_key( $item, array_flip( array( 'kind', 'storage', 'key', 'operator', 'value' ) ) ); }, $row['conditions'] ?? array() );
		$output[] = $clean;
	}
	return $output;
}

function lieve_validate_document_interactions( $document ) {
	$entries = array(); $node_ids = array(); $used = array(); $catalog = lieve_interaction_catalog(); $count = 0;
	$walk = static function( $nodes, $depth ) use ( &$walk, &$entries, &$node_ids, &$count ) {
		if ( ! is_array( $nodes ) || $depth > 12 ) { return; }
		foreach ( $nodes as $node ) {
			if ( ! is_array( $node ) || ++$count > 400 ) { break; }
			$node_ids[ (string) ( $node['id'] ?? '' ) ] = true;
			if ( isset( $node['props']['interactions'] ) ) { $entries[] = $node; }
			$walk( $node['children'] ?? array(), $depth + 1 );
		}
	};
	$walk( $document['children'] ?? array(), 0 ); $rule_ids = array();
	foreach ( $entries as $node ) { foreach ( is_array( $node['props']['interactions'] ) ? $node['props']['interactions'] : array() as $row ) { if ( is_array( $row ) && ! empty( $row['enabled'] ) && is_string( $row['id'] ?? null ) ) { $rule_ids[ $row['id'] ] = $row; } } }
	foreach ( $entries as $node ) {
		$rows = $node['props']['interactions']; $message = '';
		if ( ! is_array( $rows ) || count( $rows ) > $catalog['limit'] ) { $message = 'Use at most ' . $catalog['limit'] . ' interactions per element.'; }
		else { foreach ( $rows as $index => $row ) {
			$errors = lieve_interaction_errors( $row ); $id = is_array( $row ) ? ( $row['id'] ?? '' ) : '';
			if ( is_array( $row ) && ! empty( $row['enabled'] ) && 'call' === ( $row['action'] ?? '' ) && ! isset( lieve_interaction_functions()[ $row['functionName'] ?? '' ] ) ) { $errors['functionName'] = 'Choose a registered site function. Ask a code administrator to register this integration, or disable the interaction.'; }
			if ( is_array( $row ) && ! empty( $row['enabled'] ) && 'html' === ( $node['type'] ?? '' ) && function_exists( 'lieve_html_has_wrapper' ) && ! lieve_html_has_wrapper( $node['props'] ) ) { $errors['row'] = 'Raw HTML needs an explicit wrapper for interactions. Enable it in Style or disable these rules.'; }
			if ( is_string( $id ) && isset( $used[ $id ] ) ) { $errors['id'] = 'Interaction IDs must be unique in this document.'; } if ( is_string( $id ) ) { $used[ $id ] = true; }
			if ( is_array( $row ) && true === ( $row['enabled'] ?? true ) && empty( $catalog['actions'][ $row['action'] ?? '' ]['noTarget'] ) && 'element' === ( $row['targetMode'] ?? '' ) && ! isset( $node_ids[ $row['targetValue'] ?? '' ] ) ) { $errors['targetValue'] = 'The target was removed. Choose another element.'; }
			if ( is_array( $row ) && true === ( $row['enabled'] ?? true ) && empty( $catalog['actions'][ $row['action'] ?? '' ]['noTarget'] ) && 'popup' === ( $row['targetMode'] ?? '' ) && function_exists( 'lieve_popup_available' ) && ! lieve_popup_available( (int) ( $row['targetValue'] ?? 0 ) ) ) { $errors['targetValue'] = 'This Pop Up is inactive or unavailable. Activate it or choose another.'; }
			if ( is_array( $row ) && true === ( $row['enabled'] ?? true ) && 'interaction-end' === ( $row['trigger'] ?? '' ) && ! isset( $rule_ids[ $row['afterId'] ?? '' ] ) ) { $errors['afterId'] = 'Choose an enabled interaction in this document.'; }
			if ( $errors ) { $message = 'Interaction ' . ( $index + 1 ) . ': ' . reset( $errors ); break; }
		} }
		if ( $message ) { return new WP_Error( 'lieve_invalid_interactions', $message, array( 'status' => 400, 'elementId' => $node['id'] ?? '', 'fields' => $errors ?? array() ) ); }
	}
	return true;
}

function lieve_interaction_attributes( $node ) {
	if ( ! empty( $GLOBALS['lieve_element_preview'] ) ) { return ''; }
	$rows = array_values( array_filter( lieve_sanitize_interactions( $node['props']['interactions'] ?? array() ), static function( $row ) { return $row['enabled'] && ( 'call' !== $row['action'] || isset( lieve_interaction_functions()[ $row['functionName'] ] ) ); } ) );
	if ( ! $rows ) { return ''; }
	foreach ( $rows as &$row ) { if ( empty( lieve_interaction_catalog()['actions'][ $row['action'] ]['noTarget'] ) && 'element' === $row['targetMode'] && function_exists( 'lieve_element_target_id' ) ) { $row['targetValue'] = lieve_element_target_id( $row['targetValue'] ); } } unset( $row );
	if ( function_exists( 'wp_enqueue_script' ) && defined( 'LIEVE_URL' ) ) { $motion = (bool) array_filter( $rows, static function( $row ) { return 0 === strpos( $row['action'], 'motion-' ); } ); if ( $motion && function_exists( 'lieve_enqueue_motion' ) ) { lieve_enqueue_motion(); } lieve_enqueue_interactions( $motion ); }
	return ' data-lieve-interactions="' . esc_attr( wp_json_encode( $rows, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ) ) . '"';
}

function lieve_enqueue_interactions( $motion = false ) {
	static $localized = false;
	wp_enqueue_script( 'lieve-popup-controller', LIEVE_URL . 'assets/js/popup-controller.js', array(), lieve_asset_version( 'assets/js/popup-controller.js' ), true );
	wp_enqueue_script( 'lieve-interactions', LIEVE_URL . 'assets/js/interactions.js', $motion ? array( 'lieve-popup-controller', 'lieve-motion-runtime' ) : array( 'lieve-popup-controller' ), lieve_asset_version( 'assets/js/interactions.js' ), true );
	if ( ! $localized ) { wp_add_inline_script( 'lieve-interactions', 'window.LieveInteractionFunctions=' . wp_json_encode( (object) lieve_interaction_functions(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ) . ';', 'before' ); $localized = true; }
}
