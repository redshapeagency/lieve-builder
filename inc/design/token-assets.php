<?php
/** Shared design-manager scripts, styles and localized configuration. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_enqueue_design_system( $editor = false ) {
	wp_enqueue_style( 'lieve-colour-picker', LIEVE_URL . 'assets/css/colour-picker.css', array( $editor ? 'lieve-builder-appearance' : 'lieve-builder-conditions' ), lieve_asset_version( 'assets/css/colour-picker.css' ) );
	wp_enqueue_style( 'lieve-design-system', LIEVE_URL . 'assets/css/design-system.css', array( 'lieve-colour-picker' ), lieve_asset_version( 'assets/css/design-system.css' ) );
	if ( ! $editor ) { wp_enqueue_style( 'lieve-modal-controls', LIEVE_URL . 'assets/css/modal-controls.css', array( 'lieve-design-system', 'lieve-builder-conditions' ), lieve_asset_version( 'assets/css/modal-controls.css' ) ); }
	wp_enqueue_script( 'lieve-responsive', LIEVE_URL . 'assets/js/responsive.js', array( 'lieve-builder-conditions' ), lieve_asset_version( 'assets/js/responsive.js' ), true );
	wp_enqueue_script( 'lieve-design-model', LIEVE_URL . 'assets/js/design-model.js', array( 'lieve-responsive' ), lieve_asset_version( 'assets/js/design-model.js' ), true );
	wp_enqueue_script( 'lieve-class-model', LIEVE_URL . 'assets/js/class-model.js', array( 'lieve-design-model' ), lieve_asset_version( 'assets/js/class-model.js' ), true );
	wp_enqueue_script( 'lieve-colour-picker', LIEVE_URL . 'assets/js/colour-picker.js', array(), lieve_asset_version( 'assets/js/colour-picker.js' ), true );
	wp_enqueue_script( 'lieve-variable-list', LIEVE_URL . 'assets/js/variable-list.js', array( 'lieve-design-model', 'jquery-ui-sortable' ), lieve_asset_version( 'assets/js/variable-list.js' ), true );
	wp_enqueue_script( 'lieve-design-system', LIEVE_URL . 'assets/js/design-system.js', array( 'lieve-design-model', 'lieve-class-model', 'lieve-builder-conditions', 'lieve-colour-picker', 'lieve-variable-list' ), lieve_asset_version( 'assets/js/design-system.js' ), true );
	if ( ! $editor ) { wp_localize_script( 'lieve-design-system', 'LieveDesignConfig', lieve_design_config() ); }
	if ( ! $editor ) { wp_localize_script( 'lieve-design-system', 'LieveClassesConfig', lieve_classes_config() ); }
}
