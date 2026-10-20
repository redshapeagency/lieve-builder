<?php
/** Load normalized design tokens and compute their stable library revision. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_design_system() {
	static $previous = null, $cache = null;
	$raw = get_option( LIEVE_DESIGN_OPTION, false );
	if ( false === $raw ) { return lieve_design_empty(); }
	if ( null !== $cache && $previous === $raw ) { return $cache; }
	$clean = lieve_normalize_design_system( $raw, true );
	$previous = $raw; $cache = is_wp_error( $clean ) ? lieve_design_empty() : $clean;
	return $cache;
}

function lieve_design_revision( $data = null ) { return hash( 'sha256', wp_json_encode( null === $data ? lieve_design_system() : $data ) ); }
