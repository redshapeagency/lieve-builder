<?php
/**
 * Page template.
 *
 * @package LieveBuilder
 */

get_header();

while ( have_posts() ) :
	the_post();
	$post_id = get_the_ID();

	// Static revocation falls back here: builder output must honor WordPress password visibility too.
	if ( post_password_required( $post_id ) ) {
		echo get_the_password_form( $post_id );
	} elseif ( lieve_builder_is_enabled( $post_id ) ) {
		lieve_render_document( lieve_get_document( $post_id ) );
	} elseif ( ! lieve_render_matching_template( 'content', $post_id ) ) {
		?>
		<article <?php post_class( lieve_output_classes( 'standard-content', 'lieve-standard-content' ) ); ?>>
			<h1<?php echo lieve_markup_classes( 'entry-title', 'lieve-entry-title' ); ?>><?php the_title(); ?></h1>
			<div<?php echo lieve_markup_classes( 'entry-content', 'lieve-entry-content' ); ?>><?php the_content(); ?></div>
		</article>
		<?php
	}
endwhile;

get_footer();
