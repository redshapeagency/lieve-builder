<?php
/**
 * Minimal document shell. Visible headers are rendered only from templates.
 *
 * @package LieveBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require get_template_directory() . '/header-canvas.php';

$lieve_current_id = is_singular() ? get_queried_object_id() : 0;
$lieve_header_id  = lieve_get_effective_area_template_id( $lieve_current_id, 'header' );

do_action( 'lieve_before_header' );

lieve_render_template_area( $lieve_header_id, 'header' );

do_action( 'lieve_after_header' );
$lieve_main_is_builder = function_exists( 'lieve_frontend_asset_usage' ) && lieve_frontend_asset_usage()['controlled'];
echo '<main' . lieve_page_shell_id_attribute( 'main' ) . lieve_markup_classes( 'main', 'lieve-canvas-main' . ( $lieve_main_is_builder ? ' lieve-builder-content' : '' ) ) . '>' . "\n";
do_action( 'lieve_before_content' );
