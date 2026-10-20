<?php
/** Popup shell styling and behavior, separate from the authored document. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
define( 'LIEVE_POPUP_SETTINGS_META', '_lieve_popup_settings' );

function lieve_popup_settings_defaults() {
	return array( 'closeButton' => false, 'closeOnEscape' => true, 'closeOnBackdrop' => true, 'lockScroll' => true, 'overlay' => true, 'label' => '', 'entrance' => 'fade', 'exit' => 'fade', 'duration' => 250, 'delay' => 0, 'easing' => 'ease-out', 'styles' => array() );
}

/** Strict request validation; a bad field cannot silently broaden behavior or discard styling. */
function lieve_validate_popup_settings( $input ) {
	if ( ! is_array( $input ) || strlen( json_encode( $input ) ) > 70000 ) { return 'Enter valid Pop Up settings (up to 70 KB).'; }
	$defaults = lieve_popup_settings_defaults();
	foreach ( $input as $key => $value ) {
		if ( ! array_key_exists( $key, $defaults ) ) { return 'Unknown Pop Up setting: ' . $key; }
		if ( is_bool( $defaults[ $key ] ) && ! is_bool( $value ) ) { return 'Pop Up switches must be On or Off.'; }
	}
	foreach ( array( 'entrance', 'exit' ) as $key ) { if ( array_key_exists( $key, $input ) && ! in_array( $input[ $key ], array( 'none', 'fade', 'zoom', 'slide-up', 'slide-down', 'slide-left', 'slide-right' ), true ) ) { return 'Choose a valid Pop Up animation.'; } }
	if ( array_key_exists( 'easing', $input ) && ! in_array( $input['easing'], array( 'ease-out', 'ease-in-out', 'linear' ), true ) ) { return 'Choose a valid animation easing.'; }
	foreach ( array( 'duration' => 2000, 'delay' => 5000 ) as $key => $max ) { if ( array_key_exists( $key, $input ) && ( ! is_int( $input[ $key ] ) || $input[ $key ] < 0 || $input[ $key ] > $max ) ) { return 'Animation ' . $key . ' must be a whole number from 0 to ' . $max . ' ms.'; } }
	if ( array_key_exists( 'label', $input ) && ( ! is_string( $input['label'] ) || strlen( $input['label'] ) > 600 || preg_match( '/[<>]/', $input['label'] ) ) ) { return 'Use a plain-text accessible name (up to 600 bytes).'; }
	$styles = $input['styles'] ?? array();
	if ( ! is_array( $styles ) ) { return 'Enter valid Pop Up styles.'; }
	if ( ! $styles ) { return ''; }
	$clean = lieve_sanitize_styles( $styles, 'popup-shell' );
	foreach ( $styles as $target => $devices ) {
		if ( ! array_key_exists( $target, lieve_style_targets( 'popup-shell' ) ) ) { return 'Choose a valid Pop Up style target.'; }
		if ( ! is_array( $devices ) ) { return 'Enter valid Pop Up style contexts.'; }
		foreach ( $devices as $device => $states ) {
			if ( function_exists( 'lieve_valid_breakpoint_id' ) ? ! lieve_valid_breakpoint_id( $device ) : ! in_array( $device, array( 'desktop', 'tablet', 'mobile' ), true ) ) { return 'Choose a valid Pop Up breakpoint.'; }
			if ( ! is_array( $states ) ) { return 'Enter valid Pop Up style states.'; }
			foreach ( $states as $state => $values ) {
				if ( ! in_array( $state, array( 'normal', 'hover', 'focus', 'active', 'before', 'after' ), true ) ) { return 'Choose a valid Pop Up style state.'; }
				if ( ! is_array( $values ) ) { return 'Enter valid Pop Up style declarations.'; }
				foreach ( $values as $property => $value ) { if ( ! is_string( $value ) || ! isset( $clean[ $target ][ $device ][ $state ][ $property ] ) || $clean[ $target ][ $device ][ $state ][ $property ] !== trim( $value ) ) { return 'Invalid Pop Up style: ' . $property . '. Review its value before saving.'; } }
			}
		}
	}
	return '';
}

function lieve_normalize_popup_settings( $input ) {
	$defaults = lieve_popup_settings_defaults();
	if ( ! is_array( $input ) ) { return $defaults; }
	foreach ( $input as $key => $value ) {
		if ( 'styles' === $key ) { $defaults['styles'] = $value ? lieve_sanitize_styles( $value, 'popup-shell' ) : array(); }
		elseif ( array_key_exists( $key, $defaults ) && ! lieve_validate_popup_settings( array( $key => $value ) ) ) { $defaults[ $key ] = $value; }
	}
	return $defaults;
}

function lieve_get_popup_settings( $id ) { return lieve_normalize_popup_settings( get_post_meta( $id, LIEVE_POPUP_SETTINGS_META, true ) ); }

function lieve_popup_style_node( $id, $settings ) { return array( 'id' => 'popup-' . (int) $id, 'type' => 'popup-shell', 'props' => $settings, 'children' => array() ); }

/** Style/runtime hooks must exist whether optional presentation classes are kept or removed. */
function lieve_popup_markup_classes( $target, $defaults ) {
	$output = lieve_markup_classes( $target, $defaults );
	return false === strpos( $output, ' data-lieve-ui=' ) ? $output . ' data-lieve-ui="' . esc_attr( $target ) . '"' : $output;
}

function lieve_popup_style_css( $id, $settings, $inline = false ) {
	if ( empty( $settings['styles'] ) ) { return ''; }
	return lieve_node_style_css( lieve_popup_style_node( $id, $settings ), true, $inline, '[data-lieve-popup-id="' . (int) $id . '"]' );
}

function lieve_popup_inline_attribute( $settings, $target ) {
	if ( 'inline' !== lieve_css_loading_method() ) { return ''; }
	$base = lieve_style_breakpoints()[0]['id'];
	$values = lieve_style_context_values( $settings['styles'], $target, $base, 'normal' );
	// The visibility wrapper must never carry inline display (even !important).
	// Viewport display/custom CSS stay in scoped rules, below lifecycle [hidden].
	if ( 'frame' === $target ) { unset( $values['display'], $values['custom-css'] ); }
	$css = lieve_style_declarations( $values );
	return $css ? ' style="' . esc_attr( $css ) . '"' : '';
}
