<?php
/**
 * Minimal document shell. Visible footers are rendered only from templates.
 *
 * @package LieveBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$lieve_current_id = is_singular() ? get_queried_object_id() : 0;
$lieve_footer_id  = lieve_get_effective_area_template_id( $lieve_current_id, 'footer' );

do_action( 'lieve_after_content' );
echo "\n</main>\n";
do_action( 'lieve_before_footer' );

lieve_render_template_area( $lieve_footer_id, 'footer' );

do_action( 'lieve_after_footer' );

get_template_part( 'template-parts/popups', null, array( 'post_id' => $lieve_current_id ) );

require get_template_directory() . '/footer-canvas.php';
