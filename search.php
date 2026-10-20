<?php
/**
 * Search results template.
 *
 * @package LieveBuilder
 */

get_header();

if ( lieve_render_matching_template( 'search' ) ) {
	get_footer();
	return;
}
?>
<div<?php echo lieve_markup_classes( 'wide-content', 'lieve-wide-content' ); ?>>
	<h1<?php echo lieve_markup_classes( 'entry-title', 'lieve-entry-title' ); ?>>
		<?php echo esc_html( sprintf( __( 'Search Results for “%s”', 'lieve-builder' ), get_search_query() ) ); ?>
	</h1>
	<?php if ( have_posts() ) : ?>
		<?php while ( have_posts() ) : ?>
			<?php the_post(); ?>
			<?php get_template_part( 'template-parts/content', 'excerpt' ); ?>
		<?php endwhile; ?>
		<?php the_posts_pagination(); ?>
	<?php else : ?>
		<p><?php esc_html_e( 'No results found.', 'lieve-builder' ); ?></p>
	<?php endif; ?>
</div>
<?php
get_footer();
