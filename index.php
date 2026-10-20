<?php
/**
 * Main posts template.
 *
 * @package LieveBuilder
 */

get_header();

if ( is_home() && lieve_render_matching_template( 'archive' ) ) {
	get_footer();
	return;
}
?>
<div<?php echo lieve_markup_classes( 'wide-content', 'lieve-wide-content' ); ?>>
	<?php if ( is_home() && ! is_front_page() ) : ?>
		<h1<?php echo lieve_markup_classes( 'entry-title', 'lieve-entry-title' ); ?>><?php single_post_title(); ?></h1>
	<?php endif; ?>

	<?php if ( have_posts() ) : ?>
		<?php while ( have_posts() ) : ?>
			<?php the_post(); ?>
			<?php get_template_part( 'template-parts/content', 'excerpt' ); ?>
		<?php endwhile; ?>

		<?php the_posts_pagination(); ?>
	<?php else : ?>
		<p><?php esc_html_e( 'No content found.', 'lieve-builder' ); ?></p>
	<?php endif; ?>
</div>
<?php
get_footer();
