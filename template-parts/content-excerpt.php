<?php
/**
 * Post card used by archives and the posts index.
 *
 * @package LieveBuilder
 */
?>
<article <?php post_class( lieve_output_classes( 'post-card', 'lieve-post-card' ) ); ?>>
	<h2><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
	<div<?php echo lieve_markup_classes( 'entry-meta', 'lieve-entry-meta' ); ?>><?php echo esc_html( get_the_date() ); ?></div>
	<div><?php the_excerpt(); ?></div>
</article>
