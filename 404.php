<?php
/**
 * Not found template.
 *
 * @package LieveBuilder
 */

get_header();

if ( lieve_render_matching_template( 'error' ) ) {
	get_footer();
	return;
}
?>
<div<?php echo lieve_markup_classes( 'empty-state', 'lieve-standard-content lieve-empty-state' ); ?>>
	<h1<?php echo lieve_markup_classes( 'entry-title', 'lieve-entry-title' ); ?>>404</h1>
	<p><?php esc_html_e( 'The page you are looking for does not exist or has moved.', 'lieve-builder' ); ?></p>
	<p><a<?php echo lieve_markup_classes( 'element-button', 'lieve-button' ); ?> href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php esc_html_e( 'Back to Home', 'lieve-builder' ); ?></a></p>
</div>
<?php
get_footer();
