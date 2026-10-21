<?php
/** Load normalized design tokens and compute their stable library revision. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
require_once __DIR__ . '/../core/library-storage.php';

function lieve_design_snapshot( $fresh = false ) {
	return lieve_library_snapshot( LIEVE_DESIGN_OPTION, lieve_design_empty(), 'lieve_normalize_design_system', $fresh, true );
}

function lieve_design_system() {
	// Rendering may omit an unreadable library; this fallback is never a save baseline.
	$snapshot = lieve_design_snapshot();
	return $snapshot['data'] ?? lieve_design_empty();
}

function lieve_design_revision( $data = null ) { return null === $data ? lieve_design_snapshot()['revision'] : hash( 'sha256', wp_json_encode( $data ) ); }
