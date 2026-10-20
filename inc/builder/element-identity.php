<?php
/** Stable public identifiers, independent of the editor's internal node keys. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Lossless numeric encoding: no database migration, rounding or hash collisions. */
function lieve_element_number( $id ) {
	$id = substr( preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) $id ), 0, 64 );
	if ( preg_match( '/^lv-([a-f0-9]{8}|[a-f0-9]{16})$/D', $id, $match ) ) {
		$decimal = '0';
		foreach ( str_split( $match[1] ) as $digit ) {
			$carry = hexdec( $digit ); $next = '';
			for ( $index = strlen( $decimal ) - 1; $index >= 0; $index-- ) {
				$value = (int) $decimal[ $index ] * 16 + $carry;
				$next = (string) ( $value % 10 ) . $next; $carry = intdiv( $value, 10 );
			}
			$decimal = ( $carry ? (string) $carry : '' ) . $next;
		}
		return '1' . str_pad( (string) strlen( $match[1] ), 2, '0', STR_PAD_LEFT ) . ( ltrim( $decimal, '0' ) ?: '0' );
	}
	return '2' . implode( '', array_map( static function( $char ) { return str_pad( (string) ord( $char ), 3, '0', STR_PAD_LEFT ); }, str_split( $id ) ) );
}

function lieve_element_html_id( $node ) {
	$custom = $node['props']['htmlId'] ?? '';
	return is_string( $custom ) && preg_match( '/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/D', $custom ) ? $custom : 'lieve-' . lieve_element_number( $node['id'] );
}
function lieve_element_data_id( $node ) {
	$custom = $node['props']['dataLieveId'] ?? '';
	return is_string( $custom ) && preg_match( '/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/D', $custom ) ? $custom : 'lieve-data-' . lieve_element_number( $node['id'] );
}

/** Missing preferences inherit; existing strict booleans remain explicit overrides. */
function lieve_element_identity_defaults() {
	$settings = function_exists( 'get_option' ) ? get_option( defined( 'LIEVE_SETTINGS_OPTION' ) ? LIEVE_SETTINGS_OPTION : 'lieve_theme_settings', array() ) : array();
	$settings = is_array( $settings ) ? $settings : array();
	return array(
		'outputHtmlId' => is_bool( $settings['output_html_ids'] ?? null ) ? $settings['output_html_ids'] : true,
		'outputLieveId' => is_bool( $settings['output_data_ids'] ?? null ) ? $settings['output_data_ids'] : true,
	);
}

function lieve_element_output_enabled( $props, $flag ) {
	return is_bool( $props[ $flag ] ?? null ) ? $props[ $flag ] : ( lieve_element_identity_defaults()[ $flag ] ?? true );
}
