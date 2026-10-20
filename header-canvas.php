<?php
/**
 * Minimal page header: a true blank canvas with WordPress hooks intact.
 *
 * @package LieveBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
	<?php lieve_render_site_head(); ?>
</head>
<body<?php echo lieve_page_shell_id_attribute( 'body' ); ?> <?php body_class( 'lieve-canvas-page' ); ?>>
<?php wp_body_open(); ?>
