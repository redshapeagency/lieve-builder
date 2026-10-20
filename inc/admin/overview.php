<?php
/** Read-only starting point for the builder. No documents or libraries are rendered here. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Return only configured content types the current user can actually edit. */
function lieve_overview_content_types() {
	$enabled = (array) lieve_theme_setting( 'builder_post_types' );
	$names   = array_intersect( array_keys( lieve_builder_post_type_options() ), $enabled );
	$names[] = LIEVE_TEMPLATE_POST_TYPE;
	$types   = array();
	foreach ( array_unique( $names ) as $name ) {
		$type = get_post_type_object( $name );
		if ( $type && current_user_can( $type->cap->edit_posts ) ) { $types[ $name ] = $type; }
	}
	return $types;
}

/**
 * Bounded native queries: real builder pages plus templates, never all site content.
 * Keep queries split where ownership permissions differ; do not let inaccessible
 * recent posts crowd an author's own work out of the result set.
 */
function lieve_overview_recent_work( $limit = 6, $types = null ) {
	$limit  = min( 12, max( 1, (int) $limit ) );
	$types  = null === $types ? lieve_overview_content_types() : $types;
	$groups = array();
	foreach ( $types as $name => $type ) {
		$template = LIEVE_TEMPLATE_POST_TYPE === $name;
		$own      = ! current_user_can( $type->cap->edit_others_posts );
		$key      = (int) $template . ':' . (int) $own;
		if ( ! isset( $groups[ $key ] ) ) { $groups[ $key ] = array( 'types' => array(), 'template' => $template, 'own' => $own ); }
		$groups[ $key ]['types'][] = $name;
	}
	$posts    = array();
	$statuses = array( 'publish', 'draft', 'pending', 'private', 'future' );
	foreach ( $groups as $group ) {
		$args = array(
			'post_type'              => $group['types'],
			'post_status'            => $statuses,
			'posts_per_page'         => $limit * 2,
			'orderby'                => array( 'modified' => 'DESC', 'ID' => 'DESC' ),
			'fields'                 => 'ids',
			'no_found_rows'          => true,
			'ignore_sticky_posts'    => true,
			'update_post_meta_cache' => false,
			'update_post_term_cache' => false,
			'suppress_filters'      => false,
		);
		if ( $group['own'] ) { $args['author'] = get_current_user_id(); }
		if ( ! $group['template'] ) { $args['meta_key'] = LIEVE_META_ENABLED; $args['meta_value'] = '1'; }
		foreach ( get_posts( $args ) as $id ) {
			$post = get_post( $id );
			// Check the object, not just the menu capability, including filtered results.
			if ( ! $post || ! in_array( $post->post_type, $group['types'], true ) || ! in_array( $post->post_status, $statuses, true ) || ! current_user_can( 'edit_post', $post->ID ) ) { continue; }
			$posts[ $post->ID ] = $post;
		}
	}
	usort( $posts, static function( $a, $b ) {
		return strcmp( $b->post_modified_gmt, $a->post_modified_gmt ) ?: ( $b->ID <=> $a->ID );
	} );
	return array_slice( $posts, 0, $limit );
}

/** Real settings, not a score or a promise about performance. */
function lieve_overview_configuration( $types ) {
	$settings = lieve_theme_settings();
	$labels   = array();
	foreach ( $types as $name => $type ) { if ( LIEVE_TEMPLATE_POST_TYPE !== $name ) { $labels[] = $type->labels->name; } }
	$methods = array( 'inline' => __( 'Inline', 'lieve-builder' ), 'external' => __( 'External Files', 'lieve-builder' ), 'internal' => __( 'Internal CSS', 'lieve-builder' ) );
	return array(
		__( 'Builder content', 'lieve-builder' ) => $labels ? implode( ', ', $labels ) : __( 'Templates only', 'lieve-builder' ),
		__( 'CSS delivery', 'lieve-builder' )    => $methods[ $settings['css_loading_method'] ],
		__( 'Font preloading', 'lieve-builder' ) => $settings['preload_fonts'] ? __( 'Enabled', 'lieve-builder' ) : __( 'Disabled', 'lieve-builder' ),
		__( 'PHP execution', 'lieve-builder' )   => $settings['execute_php'] ? __( 'Enabled', 'lieve-builder' ) : __( 'Disabled', 'lieve-builder' ),
		__( 'Version', 'lieve-builder' )         => LIEVE_VERSION,
	);
}

/** Existing, fixed glyphs; no separate icon family for the dashboard. */
function lieve_overview_icon( $name ) {
	if ( in_array( $name, array( 'variables', 'colors', 'classes', 'breakpoints' ), true ) ) { return lieve_workspace_icon( $name ); }
	return lieve_element_icon( $name );
}

/** Render the operational dashboard entirely in the initial server response. */
function lieve_render_dashboard_page() {
	if ( ! current_user_can( 'edit_posts' ) ) { wp_die( esc_html__( 'You do not have permission to access this page.', 'lieve-builder' ) ); }
	$types  = lieve_overview_content_types();
	$recent = lieve_overview_recent_work( 6, $types );
	$manage = current_user_can( 'manage_options' );
	$arrow  = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';
	?>
	<div class="wrap lieve-admin-page lieve-overview-page">
		<?php lieve_render_admin_header( __( 'Overview', 'lieve-builder' ), __( 'Pick up where you left off. Keep your content and design tools close.', 'lieve-builder' ) ); ?>
		<div class="lieve-overview-workspace<?php echo $manage ? ' has-support' : ''; ?>">
			<section class="lieve-overview-recent" aria-labelledby="lieve-overview-recent-title">
				<div class="lieve-overview-section-head">
					<div><h2 id="lieve-overview-recent-title"><?php esc_html_e( 'Recent work', 'lieve-builder' ); ?></h2><p><?php esc_html_e( 'Recently updated builder content, across your site.', 'lieve-builder' ); ?></p></div>
					<?php if ( $recent ) : ?><a class="lieve-admin-button lieve-overview-resume" href="<?php echo esc_url( lieve_builder_url( $recent[0]->ID ) ); ?>"><?php esc_html_e( 'Resume latest', 'lieve-builder' ); ?><?php echo $arrow; ?></a><?php endif; ?>
				</div>
				<?php if ( $recent ) : ?>
					<ul class="lieve-overview-documents">
						<?php foreach ( $recent as $post ) :
							$title    = trim( wp_strip_all_tags( $post->post_title ) );
							$title    = '' !== $title ? $title : __( 'Untitled', 'lieve-builder' );
							$template = LIEVE_TEMPLATE_POST_TYPE === $post->post_type;
							$status   = get_post_status_object( $post->post_status );
							$label    = $status ? $status->label : $post->post_status;
							if ( $template && in_array( $post->post_status, array( 'publish', 'draft' ), true ) ) { $label = 'publish' === $post->post_status ? __( 'Active', 'lieve-builder' ) : __( 'Inactive', 'lieve-builder' ); }
							$date = get_post_datetime( $post, 'modified', 'gmt' );
							if ( ! $date ) { $date = get_post_datetime( $post, 'modified' ); }
							?>
							<li><a class="lieve-overview-document" href="<?php echo esc_url( lieve_builder_url( $post->ID ) ); ?>">
								<span class="lieve-overview-document-icon" aria-hidden="true"><?php echo lieve_overview_icon( $template ? 'layout' : 'file' ); ?></span>
								<span class="lieve-overview-document-copy"><strong><?php echo esc_html( $title ); ?></strong><span><?php echo esc_html( $types[ $post->post_type ]->labels->singular_name ); ?><?php if ( $date ) : ?><span class="lieve-overview-meta-separator" aria-hidden="true">·</span><time datetime="<?php echo esc_attr( $date->format( DATE_W3C ) ); ?>" title="<?php echo esc_attr( wp_date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), $date->getTimestamp() ) ); ?>"><?php printf( esc_html__( 'Updated %s ago', 'lieve-builder' ), esc_html( human_time_diff( min( time(), $date->getTimestamp() ), time() ) ) ); ?></time><?php endif; ?></span></span>
								<span class="lieve-template-state" data-template-state="<?php echo 'publish' === $post->post_status ? 'active' : 'inactive'; ?>"><?php echo esc_html( $label ); ?></span>
								<span class="lieve-overview-document-arrow" aria-hidden="true"><?php echo $arrow; ?></span><span class="screen-reader-text"><?php esc_html_e( 'Open in builder', 'lieve-builder' ); ?></span>
							</a></li>
						<?php endforeach; ?>
					</ul>
				<?php else : ?>
					<div class="lieve-overview-empty"><span aria-hidden="true"><?php echo lieve_overview_icon( 'layout' ); ?></span><h3><?php esc_html_e( 'Nothing to resume yet', 'lieve-builder' ); ?></h3><p><?php esc_html_e( 'Content you edit with LieveBuilder and templates you create will appear here. Choose a content list below to get started.', 'lieve-builder' ); ?></p></div>
				<?php endif; ?>
				<?php if ( $types ) : ?>
					<nav class="lieve-overview-content" aria-label="<?php esc_attr_e( 'Browse builder content', 'lieve-builder' ); ?>"><h3><?php esc_html_e( 'Browse content', 'lieve-builder' ); ?></h3><div class="lieve-overview-content-links">
						<?php foreach ( $types as $name => $type ) : ?><a class="lieve-admin-button" href="<?php echo esc_url( add_query_arg( 'post_type', $name, admin_url( 'edit.php' ) ) ); ?>"><?php echo esc_html( LIEVE_TEMPLATE_POST_TYPE === $name ? __( 'Templates', 'lieve-builder' ) : $type->labels->name ); ?><?php echo $arrow; ?></a><?php endforeach; ?>
						<?php if ( ! $manage ) : ?><a class="lieve-admin-button" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php esc_html_e( 'View site', 'lieve-builder' ); ?><?php echo $arrow; ?></a><?php endif; ?>
					</div></nav>
				<?php endif; ?>
			</section>
			<?php if ( $manage ) : ?>
				<aside class="lieve-overview-support" aria-label="<?php esc_attr_e( 'Design tools and configuration', 'lieve-builder' ); ?>">
					<section class="lieve-overview-libraries" aria-labelledby="lieve-overview-libraries-title"><div class="lieve-overview-section-head"><div><h2 id="lieve-overview-libraries-title"><?php esc_html_e( 'Design libraries', 'lieve-builder' ); ?></h2><p><?php esc_html_e( 'Shared foundations for every layout.', 'lieve-builder' ); ?></p></div></div>
						<nav aria-label="<?php esc_attr_e( 'Design libraries', 'lieve-builder' ); ?>"><ul>
						<?php foreach ( array(
							array( 'variables', __( 'Variables', 'lieve-builder' ), __( 'Reusable CSS values', 'lieve-builder' ) ),
							array( 'colors', __( 'Colors', 'lieve-builder' ), __( 'Palettes and variants', 'lieve-builder' ) ),
							array( 'classes', __( 'Classes', 'lieve-builder' ), __( 'Shared element styling', 'lieve-builder' ) ),
							array( 'fonts', __( 'Fonts', 'lieve-builder' ), __( 'Locally hosted typefaces', 'lieve-builder' ) ),
							array( 'responsive', __( 'Responsive', 'lieve-builder' ), __( 'Viewports and inheritance', 'lieve-builder' ) ),
						) as $library ) : $icon = array( 'fonts' => 'heading', 'responsive' => 'breakpoints' )[ $library[0] ] ?? $library[0]; ?>
							<li><a class="lieve-overview-library" href="<?php echo esc_url( admin_url( 'admin.php?page=lieve-' . $library[0] ) ); ?>"><span class="lieve-overview-library-icon" aria-hidden="true"><?php echo lieve_overview_icon( $icon ); ?></span><span><strong><?php echo esc_html( $library[1] ); ?></strong><small><?php echo esc_html( $library[2] ); ?></small></span><?php echo $arrow; ?></a></li>
						<?php endforeach; ?>
						</ul></nav>
					</section>
					<section class="lieve-overview-configuration" aria-labelledby="lieve-overview-configuration-title"><div class="lieve-overview-section-head"><div><h2 id="lieve-overview-configuration-title"><?php esc_html_e( 'Configuration', 'lieve-builder' ); ?></h2></div><a class="lieve-admin-button" href="<?php echo esc_url( admin_url( 'admin.php?page=lieve-settings' ) ); ?>"><?php esc_html_e( 'Settings', 'lieve-builder' ); ?></a></div>
						<dl><?php foreach ( lieve_overview_configuration( $types ) as $label => $value ) : ?><div><dt><?php echo esc_html( $label ); ?></dt><dd><?php echo esc_html( $value ); ?></dd></div><?php endforeach; ?></dl>
						<nav class="lieve-overview-tools" aria-label="<?php esc_attr_e( 'More tools', 'lieve-builder' ); ?>">
							<a class="lieve-admin-button" href="<?php echo esc_url( admin_url( 'admin.php?page=lieve-query-builder' ) ); ?>"><?php esc_html_e( 'Query Builder', 'lieve-builder' ); ?></a>
							<a class="lieve-admin-button" href="<?php echo esc_url( admin_url( 'admin.php?page=lieve-static-delivery' ) ); ?>"><?php esc_html_e( 'Static Delivery', 'lieve-builder' ); ?></a>
							<a class="lieve-admin-button" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php esc_html_e( 'View site', 'lieve-builder' ); ?></a>
						</nav>
					</section>
				</aside>
			<?php endif; ?>
		</div>
	</div>
	<?php
}
