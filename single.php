<?php
/**
 * Single post template.
 *
 * @package LieveBuilder
 */

get_header();

while ( have_posts() ) :
	the_post();
	$post_id = get_the_ID();

	if ( lieve_builder_is_enabled( $post_id ) ) {
		lieve_render_document( lieve_get_document( $post_id ) );
	} elseif ( ! lieve_render_matching_template( 'content', $post_id ) ) {
		?>
		<article <?php post_class( lieve_output_classes( 'standard-content', 'lieve-standard-content' ) ); ?>>
			<h1<?php echo lieve_markup_classes( 'entry-title', 'lieve-entry-title' ); ?>><?php the_title(); ?></h1>
			<div<?php echo lieve_markup_classes( 'entry-meta', 'lieve-entry-meta' ); ?>>
				<?php echo esc_html( get_the_date() ); ?> · <?php echo esc_html( get_the_author() ); ?>
			</div>
			<?php if ( has_post_thumbnail() ) : ?>
				<div<?php echo lieve_markup_classes( 'featured-image', 'lieve-featured-image' ); ?>><?php the_post_thumbnail( 'large' ); ?></div>
			<?php endif; ?>
			<div<?php echo lieve_markup_classes( 'entry-content', 'lieve-entry-content' ); ?>><?php the_content(); ?></div>
		</article>
		<?php
	}
endwhile;

get_footer();
