<?php
/**
 * Archive template.
 *
 * @package LieveBuilder
 */

get_header();

if ( lieve_render_matching_template( 'archive' ) ) {
	get_footer();
	return;
}
?>
<div<?php echo lieve_markup_classes( 'wide-content', 'lieve-wide-content' ); ?>>
	<div<?php echo lieve_markup_classes( 'archive-heading', 'lieve-archive-heading' ); ?>>
		<?php the_archive_title( '<h1' . lieve_markup_classes( 'entry-title', 'lieve-entry-title' ) . '>', '</h1>' ); ?>
		<?php the_archive_description( '<div' . lieve_markup_classes( 'entry-content', 'lieve-entry-content' ) . '>', '</div>' ); ?>
	</div>

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
