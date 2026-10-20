<?php
/**
 * WordPress admin integration for the visual builder.
 *
 * @package LieveBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Build the editor URL for a post.
 *
 * @param int $post_id Post ID.
 * @return string
 */
function lieve_builder_url( $post_id ) {
	return add_query_arg(
		array(
			'page' => 'lieve-builder',
			'post' => (int) $post_id,
		),
		admin_url( 'admin.php' )
	);
}

/**
 * Register a hidden admin page for the full-screen editor.
 */
function lieve_register_editor_page() {
	add_submenu_page(
		null,
		__( 'Lieve Builder', 'lieve-builder' ),
		__( 'Lieve Builder', 'lieve-builder' ),
		'edit_posts',
		'lieve-builder',
		'lieve_render_editor_page'
	);
}
add_action( 'admin_menu', 'lieve_register_editor_page' );

/**
 * Use the edited document's title in the browser tab from the first paint.
 *
 * @param string $admin_title Default WordPress admin title.
 * @return string
 */
function lieve_editor_admin_title( $admin_title ) {
	$screen = get_current_screen();
	if ( ! $screen || 'admin_page_lieve-builder' !== $screen->id ) {
		return $admin_title;
	}
	$post_id = isset( $_GET['post'] ) && is_scalar( $_GET['post'] ) ? absint( $_GET['post'] ) : 0;
	if ( ! $post_id || ! get_post( $post_id ) || ! current_user_can( 'edit_post', $post_id ) ) {
		return $admin_title;
	}
	$post_title = trim( wp_strip_all_tags( get_the_title( $post_id ) ) );
	return ( '' !== $post_title ? $post_title : __( 'Untitled', 'lieve-builder' ) ) . ' | Lieve Page Builder';
}
add_filter( 'admin_title', 'lieve_editor_admin_title' );

/**
 * Add an entry point to supported post edit screens.
 */
function lieve_add_builder_meta_box() {
	$post_types = array_merge( array_keys( lieve_builder_post_type_options() ), array( LIEVE_TEMPLATE_POST_TYPE ) );

	foreach ( $post_types as $post_type ) {
		if ( lieve_builder_supports_post_type( $post_type ) ) {
			add_meta_box(
				'lieve-builder-launcher',
				__( 'Lieve Builder', 'lieve-builder' ),
				'lieve_render_builder_meta_box',
				$post_type,
				'side',
				'high'
			);
		}
	}
}
add_action( 'add_meta_boxes', 'lieve_add_builder_meta_box' );

/**
 * Render the builder launcher meta box.
 *
 * @param WP_Post $post Current post.
 */
function lieve_render_builder_meta_box( $post ) {
	if ( ! lieve_builder_supports_post_type( $post->post_type ) || ! current_user_can( 'edit_post', $post->ID ) ) { return; }
	$enabled = lieve_builder_is_enabled( $post->ID );
	$status  = $enabled ? __( 'Active', 'lieve-builder' ) : __( 'Not active yet', 'lieve-builder' );
	?>
	<p><?php echo esc_html( sprintf( __( 'Visual editor: %s', 'lieve-builder' ), $status ) ); ?></p>
	<p><a class="button button-primary button-large" style="width:100%;text-align:center" href="<?php echo esc_url( lieve_builder_url( $post->ID ) ); ?>"><?php esc_html_e( 'Edit with Lieve', 'lieve-builder' ); ?></a></p>
	<?php if ( $enabled ) : ?>
		<p><a href="<?php echo esc_url( wp_nonce_url( add_query_arg( array( 'action' => 'lieve_disable_builder', 'post' => $post->ID ), admin_url( 'admin-post.php' ) ), 'lieve_disable_builder_' . $post->ID ) ); ?>"><?php esc_html_e( 'Use WordPress Content', 'lieve-builder' ); ?></a></p>
	<?php endif; ?>
	<?php
}

/**
 * Disable builder rendering while preserving its document for later reuse.
 */
function lieve_disable_builder() {
	$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0;

	if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
		wp_die( esc_html__( 'Operation not allowed.', 'lieve-builder' ) );
	}

	check_admin_referer( 'lieve_disable_builder_' . $post_id );
	delete_post_meta( $post_id, LIEVE_META_ENABLED );

	wp_safe_redirect( get_edit_post_link( $post_id, 'raw' ) );
	exit;
}
add_action( 'admin_post_lieve_disable_builder', 'lieve_disable_builder' );

/**
 * Add a builder action to post list rows.
 *
 * @param array   $actions Row actions.
 * @param WP_Post $post    Post object.
 * @return array
 */
function lieve_add_row_action( $actions, $post ) {
	if ( current_user_can( 'edit_post', $post->ID ) && lieve_builder_supports_post_type( $post->post_type ) ) {
		$actions['lieve-builder'] = '<a href="' . esc_url( lieve_builder_url( $post->ID ) ) . '">' . esc_html__( 'Edit with Lieve', 'lieve-builder' ) . '</a>';
	}

	return $actions;
}
add_filter( 'page_row_actions', 'lieve_add_row_action', 10, 2 );
add_filter( 'post_row_actions', 'lieve_add_row_action', 10, 2 );

/**
 * Add a frontend admin-bar shortcut.
 *
 * @param WP_Admin_Bar $admin_bar Admin bar object.
 */
function lieve_admin_bar_link( $admin_bar ) {
	if ( is_admin() || ! is_singular() ) {
		return;
	}

	$post_id = get_queried_object_id();
	if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) || ! lieve_builder_supports_post_type( get_post_type( $post_id ) ) ) {
		return;
	}

	$admin_bar->add_node(
		array(
			'id'    => 'lieve-builder',
			'title' => __( 'Edit with Lieve', 'lieve-builder' ),
			'href'  => lieve_builder_url( $post_id ),
		)
	);
}
add_action( 'admin_bar_menu', 'lieve_admin_bar_link', 90 );

/**
 * Load builder assets only on its own screen.
 *
 * @param string $hook_suffix Current admin hook.
 */
function lieve_editor_catalogue() {
	$registry = lieve_element_registry();
	$types = array(); $taxonomies = array(); $menus = array( 0 => 'Select a menu' ); $sidebars = array( '' => 'Select a sidebar' );
	foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $name => $object ) { $types[ $name ] = $object->labels->singular_name; }
	foreach ( get_taxonomies( array( 'public' => true ), 'objects' ) as $name => $object ) { $taxonomies[ $name ] = $object->labels->singular_name; }
	foreach ( wp_get_nav_menus() as $menu ) { $menus[ $menu->term_id ] = $menu->name; }
	foreach ( $GLOBALS['wp_registered_sidebars'] ?? array() as $sidebar ) { $sidebars[ $sidebar['id'] ] = $sidebar['name']; }
	$options = array( 'postType' => $types, 'taxonomy' => $taxonomies, 'menuId' => $menus, 'sidebarId' => $sidebars );
	foreach ( $registry as &$definition ) {
		foreach ( $options as $key => $choices ) { if ( isset( $definition['fields'][ $key ] ) ) { $definition['fields'][ $key ]['type'] = 'select'; $definition['fields'][ $key ]['options'] = $choices; } }
	}
	unset( $definition );
	return $registry;
}

/** Explicit canvas assets only: never import WordPress admin CSS into authored content. */
function lieve_editor_viewport_styles() {
	$files = array( 'style.css', 'assets/css/brand.css', 'assets/css/builder.css', 'assets/css/workspace.css', 'assets/css/elements-base.css', 'assets/css/widgets.css', 'assets/css/editor-appearance.css', 'assets/css/editor-context.css', 'assets/css/editor-viewport.css' );
	$urls = array_map( function( $file ) { return add_query_arg( 'ver', lieve_asset_version( $file ), LIEVE_URL . $file ); }, $files );
	return array_values( array_filter( array_map( 'esc_url_raw', apply_filters( 'lieve_editor_viewport_styles', $urls ) ) ) );
}

/** The frontend base sheet is not loaded into WordPress admin chrome. */
function lieve_editor_viewport_style_texts() {
	$file = LIEVE_PATH . 'style.css';
	$css = is_readable( $file ) ? file_get_contents( $file ) : false;
	return false === $css ? array() : array( add_query_arg( 'ver', lieve_asset_version( 'style.css' ), LIEVE_URL . 'style.css' ) => $css );
}

function lieve_editor_assets( $hook_suffix ) {
	if ( 'admin_page_lieve-builder' !== $hook_suffix ) {
		return;
	}

	$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0;
	$post    = get_post( $post_id );

	if ( ! $post || ! current_user_can( 'edit_post', $post_id ) || ! lieve_builder_supports_post_type( $post->post_type ) ) {
		return;
	}

	$layout_storage_key = 'lieve-builder:panels:' . admin_url() . ':' . get_current_user_id();
	wp_enqueue_script( 'lieve-builder-history', LIEVE_URL . 'assets/js/editor-history.js', array(), lieve_asset_version( 'assets/js/editor-history.js' ), false );
	wp_enqueue_script( 'lieve-builder-full-preview', LIEVE_URL . 'assets/js/editor-full-preview.js', array( 'lieve-builder-conditions' ), lieve_asset_version( 'assets/js/editor-full-preview.js' ), false );
	wp_enqueue_style( 'lieve-builder-full-preview', LIEVE_URL . 'assets/css/editor-full-preview.css', array( 'lieve-builder-appearance' ), lieve_asset_version( 'assets/css/editor-full-preview.css' ) );
	wp_enqueue_script( 'lieve-builder-panel-layout', LIEVE_URL . 'assets/js/editor-panel-layout.js', array(), lieve_asset_version( 'assets/js/editor-panel-layout.js' ), false );
	wp_add_inline_script( 'lieve-builder-panel-layout', 'window.LievePanelLayoutConfig=' . wp_json_encode( array( 'storageKey' => $layout_storage_key ), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ) . ';', 'before' );
	wp_enqueue_media( array( 'post' => $post_id ) );
	wp_enqueue_script( 'lieve-editor-components', LIEVE_URL . 'assets/js/editor-components.js', array(), lieve_asset_version( 'assets/js/editor-components.js' ), false );
	wp_enqueue_editor();
	wp_enqueue_script( 'lieve-builder-rich-text', LIEVE_URL . 'assets/js/editor-rich-text.js', array( 'editor', 'quicktags' ), lieve_asset_version( 'assets/js/editor-rich-text.js' ), false );
	wp_enqueue_style( 'lieve-builder-editor', LIEVE_URL . 'assets/css/builder.css', array( 'lieve-brand' ), lieve_asset_version( 'assets/css/builder.css' ) );
	wp_enqueue_style( 'lieve-builder-conditions', LIEVE_URL . 'assets/css/conditions.css', array( 'lieve-builder-editor' ), lieve_asset_version( 'assets/css/conditions.css' ) );
	wp_enqueue_script( 'lieve-builder-conditions', LIEVE_URL . 'assets/js/conditions.js', array( 'jquery-ui-sortable' ), lieve_asset_version( 'assets/js/conditions.js' ), true );
	wp_enqueue_style( 'lieve-builder-workspace', LIEVE_URL . 'assets/css/workspace.css', array( 'lieve-builder-editor' ), lieve_asset_version( 'assets/css/workspace.css' ) );
	wp_enqueue_style( 'lieve-builder-seo', LIEVE_URL . 'assets/css/editor-seo.css', array( 'lieve-builder-workspace' ), lieve_asset_version( 'assets/css/editor-seo.css' ) );
	wp_enqueue_style( 'lieve-head-controls', LIEVE_URL . 'assets/css/head-controls.css', array( 'lieve-builder-seo' ), lieve_asset_version( 'assets/css/head-controls.css' ) );
	wp_enqueue_script( 'lieve-head-controls', LIEVE_URL . 'assets/js/head-controls.js', array(), lieve_asset_version( 'assets/js/head-controls.js' ), true );
	wp_enqueue_script( 'lieve-page-markup', LIEVE_URL . 'assets/js/editor-page-markup.js', array(), lieve_asset_version( 'assets/js/editor-page-markup.js' ), true );
	wp_enqueue_script( 'lieve-builder-seo', LIEVE_URL . 'assets/js/editor-seo.js', array( 'lieve-head-controls', 'lieve-page-markup' ), lieve_asset_version( 'assets/js/editor-seo.js' ), true );
	wp_enqueue_script( 'lieve-interaction-model', LIEVE_URL . 'assets/js/interaction-model.js', array(), lieve_asset_version( 'assets/js/interaction-model.js' ), true );
	wp_localize_script( 'lieve-interaction-model', 'LieveInteractionCatalog', lieve_interaction_catalog() );
	wp_add_inline_script( 'lieve-interaction-model', 'window.LieveInteractionFunctions=' . wp_json_encode( (object) lieve_interaction_functions(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ) . ';', 'before' );
	wp_enqueue_script( 'lieve-builder-interact', LIEVE_URL . 'assets/js/editor-interact.js', array( 'lieve-interaction-model', 'jquery-ui-sortable' ), lieve_asset_version( 'assets/js/editor-interact.js' ), true );
	lieve_enqueue_motion( true );
	wp_add_inline_script( 'lieve-motion-runtime', 'window.LieveMotionEditorMode=true;', 'before' );
	wp_enqueue_script( 'lieve-builder-motion', LIEVE_URL . 'assets/js/editor-motion.js', array( 'lieve-motion-runtime' ), lieve_asset_version( 'assets/js/editor-motion.js' ), false );
	wp_enqueue_script( 'lieve-element-condition-model', LIEVE_URL . 'assets/js/element-condition-model.js', array( 'lieve-dynamic-data' ), lieve_asset_version( 'assets/js/element-condition-model.js' ), false );
	wp_localize_script( 'lieve-element-condition-model', 'LieveElementConditionCatalog', lieve_element_condition_catalog() );
	wp_enqueue_script( 'lieve-element-condition-editor', LIEVE_URL . 'assets/js/editor-element-conditions.js', array( 'lieve-element-condition-model', 'lieve-builder-interact' ), lieve_asset_version( 'assets/js/editor-element-conditions.js' ), false );
	wp_enqueue_style( 'lieve-element-base', LIEVE_URL . 'assets/css/elements-base.css', array( 'lieve-builder-workspace' ), lieve_asset_version( 'assets/css/elements-base.css' ) );
	wp_enqueue_style( 'lieve-builder-appearance', LIEVE_URL . 'assets/css/editor-appearance.css', array( 'lieve-builder-workspace', 'lieve-builder-conditions', 'lieve-element-base' ), lieve_asset_version( 'assets/css/editor-appearance.css' ) );
	wp_enqueue_style( 'lieve-builder-rich-text', LIEVE_URL . 'assets/css/editor-rich-text.css', array( 'editor-buttons', 'lieve-builder-appearance' ), lieve_asset_version( 'assets/css/editor-rich-text.css' ) );
	wp_enqueue_style( 'lieve-builder-context', LIEVE_URL . 'assets/css/editor-context.css', array( 'lieve-builder-appearance' ), lieve_asset_version( 'assets/css/editor-context.css' ) );
	wp_enqueue_style( 'lieve-responsive', LIEVE_URL . 'assets/css/responsive.css', array( 'lieve-builder-appearance' ), lieve_asset_version( 'assets/css/responsive.css' ) );
	wp_enqueue_script( 'lieve-responsive', LIEVE_URL . 'assets/js/responsive.js', array( 'lieve-builder-conditions' ), lieve_asset_version( 'assets/js/responsive.js' ), true );
	wp_enqueue_script( 'lieve-builder-styles', LIEVE_URL . 'assets/js/editor-styles.js', array( 'lieve-responsive' ), lieve_asset_version( 'assets/js/editor-styles.js' ), true );
	wp_enqueue_script( 'lieve-listing', LIEVE_URL . 'assets/js/listing.js', array(), lieve_asset_version( 'assets/js/listing.js' ), true );
	wp_enqueue_script( 'lieve-editor-listing', LIEVE_URL . 'assets/js/editor-listing.js', array( 'lieve-builder-styles', 'lieve-listing' ), lieve_asset_version( 'assets/js/editor-listing.js' ), true );
	wp_enqueue_style( 'lieve-editor-listing', LIEVE_URL . 'assets/css/editor-listing.css', array( 'lieve-builder-appearance' ), lieve_asset_version( 'assets/css/editor-listing.css' ) );
	wp_enqueue_script( 'lieve-dynamic-data', LIEVE_URL . 'assets/js/dynamic-data.js', array( 'lieve-builder-styles' ), lieve_asset_version( 'assets/js/dynamic-data.js' ), false );
	wp_enqueue_script( 'lieve-builder-context', LIEVE_URL . 'assets/js/editor-context.js', array( 'lieve-builder-styles' ), lieve_asset_version( 'assets/js/editor-context.js' ), true );
	wp_enqueue_script( 'lieve-builder-workspace', LIEVE_URL . 'assets/js/editor-workspace.js', array( 'lieve-builder-panel-layout', 'lieve-builder-conditions', 'lieve-responsive' ), lieve_asset_version( 'assets/js/editor-workspace.js' ), true );
	wp_enqueue_style( 'lieve-builder-viewport', LIEVE_URL . 'assets/css/editor-viewport.css', array( 'lieve-responsive' ), lieve_asset_version( 'assets/css/editor-viewport.css' ) );
	wp_enqueue_script( 'lieve-builder-viewport', LIEVE_URL . 'assets/js/editor-viewport.js', array(), lieve_asset_version( 'assets/js/editor-viewport.js' ), true );
	wp_enqueue_script( 'lieve-builder-canvas-dnd', LIEVE_URL . 'assets/js/editor-canvas-dnd.js', array(), lieve_asset_version( 'assets/js/editor-canvas-dnd.js' ), true );
	wp_enqueue_script( 'lieve-builder-structure-actions', LIEVE_URL . 'assets/js/editor-structure-actions.js', array(), lieve_asset_version( 'assets/js/editor-structure-actions.js' ), false );
	lieve_enqueue_design_system( true );
	wp_enqueue_script( 'lieve-class-styles', LIEVE_URL . 'assets/js/class-styles.js', array( 'lieve-class-model', 'lieve-builder-styles' ), lieve_asset_version( 'assets/js/class-styles.js' ), true );
	wp_enqueue_script( 'lieve-classes', LIEVE_URL . 'assets/js/classes.js', array( 'lieve-design-system', 'lieve-class-styles', 'jquery-ui-sortable' ), lieve_asset_version( 'assets/js/classes.js' ), true );
	wp_enqueue_style( 'lieve-modal-controls', LIEVE_URL . 'assets/css/modal-controls.css', array( 'lieve-builder-appearance', 'lieve-design-system' ), lieve_asset_version( 'assets/css/modal-controls.css' ) );
	wp_enqueue_style( 'lieve-builder-dialogs', LIEVE_URL . 'assets/css/editor-dialogs.css', array( 'lieve-builder-appearance', 'lieve-responsive', 'lieve-design-system', 'lieve-modal-controls' ), lieve_asset_version( 'assets/css/editor-dialogs.css' ) );
	wp_enqueue_style( 'lieve-builder-interact', LIEVE_URL . 'assets/css/editor-interact.css', array( 'lieve-builder-appearance', 'lieve-builder-workspace' ), lieve_asset_version( 'assets/css/editor-interact.css' ) );
	wp_enqueue_style( 'lieve-builder-motion', LIEVE_URL . 'assets/css/editor-motion.css', array( 'lieve-builder-interact' ), lieve_asset_version( 'assets/css/editor-motion.css' ) );
	wp_enqueue_style( 'lieve-element-condition-editor', LIEVE_URL . 'assets/css/editor-element-conditions.css', array( 'lieve-builder-motion' ), lieve_asset_version( 'assets/css/editor-element-conditions.css' ) );
	wp_enqueue_script( 'lieve-popup-settings', LIEVE_URL . 'assets/js/popup-settings.js', array( 'lieve-builder-styles' ), lieve_asset_version( 'assets/js/popup-settings.js' ), false );
	wp_enqueue_script( 'lieve-popup-controller', LIEVE_URL . 'assets/js/popup-controller.js', array(), lieve_asset_version( 'assets/js/popup-controller.js' ), false );
	wp_enqueue_style( 'lieve-builder-popup', LIEVE_URL . 'assets/css/editor-popup.css', array( 'lieve-builder-appearance' ), lieve_asset_version( 'assets/css/editor-popup.css' ) );
	// Load the dependency graph before markup; initialize as soon as the editor exists.
	$controller_handles = array();
	foreach ( array( 'document', 'context-menu', 'canvas', 'structure', 'controls', 'inspector-style', 'inspector-markup', 'inspector', 'pickers', 'library', 'save' ) as $controller ) {
		$handle = 'lieve-editor-controller-' . $controller;
		$asset = 'assets/js/editor/' . $controller . '.js';
		wp_enqueue_script( $handle, LIEVE_URL . $asset, array(), lieve_asset_version( $asset ), false );
		$controller_handles[] = $handle;
	}
	wp_enqueue_script( 'lieve-builder-editor', LIEVE_URL . 'assets/js/builder.js', array_merge( $controller_handles, array( 'lieve-editor-components', 'lieve-document-validation', 'lieve-editor-recovery', 'lieve-editor-code-preview', 'lieve-editor-code-editor', 'media-editor', 'lieve-builder-rich-text', 'lieve-builder-conditions', 'lieve-builder-styles', 'lieve-dynamic-data', 'lieve-builder-workspace', 'lieve-builder-context', 'lieve-builder-viewport', 'lieve-builder-canvas-dnd', 'lieve-builder-structure-actions', 'lieve-design-system', 'lieve-classes', 'lieve-builder-seo', 'lieve-builder-interact', 'lieve-builder-motion', 'lieve-element-condition-editor', 'lieve-popup-settings', 'lieve-popup-controller', 'lieve-editor-listing' ) ), lieve_asset_version( 'assets/js/builder.js' ), false );
	$is_template = LIEVE_TEMPLATE_POST_TYPE === $post->post_type;
	$template_data = $is_template ? lieve_with_template_lock( $post_id, function() use ( $post_id ) { return lieve_template_editor_data( $post_id ); } ) : array();
	if ( is_wp_error( $template_data ) ) { wp_die( esc_html( $template_data->get_error_message() ) ); }
	$seo_snapshot = $is_template ? array() : lieve_with_seo_lock( $post_id, static function() use ( $post_id ) { if ( function_exists( 'clean_post_cache' ) ) { clean_post_cache( $post_id ); } return lieve_page_editor_snapshot( $post_id ); } );
	if ( is_wp_error( $seo_snapshot ) ) { wp_die( esc_html( $seo_snapshot->get_error_message() ) ); }
	$editor_document = $is_template ? $template_data['document'] : $seo_snapshot['document'];

	wp_enqueue_script( 'lieve-editor-recovery', LIEVE_URL . 'assets/js/editor-recovery.js', array(), lieve_asset_version( 'assets/js/editor-recovery.js' ), false );
	wp_enqueue_script( 'lieve-editor-code-preview', LIEVE_URL . 'assets/js/editor-code-preview.js', array(), lieve_asset_version( 'assets/js/editor-code-preview.js' ), false );
	wp_enqueue_script( 'lieve-editor-code-editor', LIEVE_URL . 'assets/js/editor-code-editor.js', array( 'lieve-builder-conditions', 'wp-codemirror' ), lieve_asset_version( 'assets/js/editor-code-editor.js' ), false );
	wp_enqueue_style( 'lieve-editor-code-editor', LIEVE_URL . 'assets/css/editor-code-editor.css', array( 'lieve-modal-controls', 'lieve-builder-appearance', 'wp-codemirror' ), lieve_asset_version( 'assets/css/editor-code-editor.css' ) );
	wp_enqueue_script( 'lieve-document-validation', LIEVE_URL . 'assets/js/document-validation.js', array(), lieve_asset_version( 'assets/js/document-validation.js' ), false );
	wp_enqueue_style( 'lieve-editor-recovery', LIEVE_URL . 'assets/css/editor-recovery.css', array( 'lieve-builder-appearance' ), lieve_asset_version( 'assets/css/editor-recovery.css' ) );
	// One final, editor-only component contract, available before the shell paints.
	wp_enqueue_style( 'lieve-editor-ui', LIEVE_URL . 'assets/css/editor-ui.css', array( 'lieve-builder-dialogs', 'lieve-element-condition-editor', 'lieve-builder-rich-text', 'lieve-builder-context', 'lieve-builder-seo', 'lieve-head-controls', 'lieve-builder-popup', 'lieve-editor-listing', 'lieve-editor-recovery' ), lieve_asset_version( 'assets/css/editor-ui.css' ) );
	wp_localize_script(
		'lieve-builder-editor',
		'LieveBuilderConfig',
		array(
			'postId'                    => $post_id,
			'components'                => function_exists( 'lieve_component_choices' ) ? lieve_component_choices() : array(),
			'componentsUrl'             => rest_url( 'lieve/v1/components' ),
			'componentMode'             => function_exists( 'lieve_is_component' ) && lieve_is_component( $post_id ),
			'canCreateComponents'       => current_user_can( 'publish_posts' ),
			'navMenus'                  => array_reduce( wp_get_nav_menus(), static function( $out, $menu ) { $out[$menu->term_id] = $menu->name; return $out; }, array() ),
			'navLocations'              => get_registered_nav_menus(),
			'documentRevision'          => $is_template ? '' : $seo_snapshot['documentRevision'],
			'layoutStorageKey'          => $layout_storage_key,
			'postTitle'                 => html_entity_decode( get_the_title( $post_id ), ENT_QUOTES, get_bloginfo( 'charset' ) ),
			'customCode'                => array( 'phpEnabled' => (bool) lieve_theme_setting( 'execute_php' ) && lieve_custom_code_policy_allows_php(), 'canAuthor' => lieve_can_author_custom_code() ),
			'seo'                       => $is_template ? null : $seo_snapshot['seo'],
			'seoRevision'               => $is_template ? '' : $seo_snapshot['seoRevision'],
			'headOverrides'             => $is_template ? null : $seo_snapshot['headOverrides'],
			'headRevision'              => $is_template ? '' : $seo_snapshot['headRevision'],
			'headConfig'                => lieve_head_control_config( $post_id, $is_template ),
			'pageMarkup'                => $is_template ? null : $seo_snapshot['pageMarkup'],
			'markupRevision'            => $is_template ? '' : $seo_snapshot['markupRevision'],
			'pageMarkupGlobal'          => lieve_page_markup_global(),
			'seoSchemaRules'            => lieve_seo_schema_rules(),
			'seoContext'                => $is_template ? array() : lieve_seo_context( $post_id ),
			'restUrl'                   => esc_url_raw( rest_url( 'lieve/v1/page/' . $post_id ) ),
			'recoveryUrl'               => esc_url_raw( rest_url( 'lieve/v1/recovery/' . $post_id ) ),
			'templatesUrl'              => esc_url_raw( rest_url( 'lieve/v1/templates' ) ),
			'queryChoicesUrl'           => esc_url_raw( add_query_arg( 'postId', $post_id, rest_url( 'lieve/v1/queries/choices' ) ) ),
			'queryBuilderUrl'           => current_user_can( 'manage_options' ) ? admin_url( 'admin.php?page=lieve-query-builder' ) : '',
			'queryRevision'             => lieve_queries_revision(),
			'listingQueries'            => lieve_query_choices(),
			'newTemplateUrl'            => lieve_new_template_url(),
			'nonce'                     => wp_create_nonce( 'wp_rest' ),
			'document'                  => $editor_document,
			'initialPreviews'           => lieve_editor_initial_previews( $post_id, $editor_document ),
			'headerTemplateId'          => $is_template ? $template_data['headerTemplateId'] : $seo_snapshot['headerTemplateId'],
			'footerTemplateId'          => $is_template ? $template_data['footerTemplateId'] : $seo_snapshot['footerTemplateId'],
			'templateContext'           => lieve_editor_template_context( $post_id ),
			'templateContextUrl'        => esc_url_raw( rest_url( 'lieve/v1/editor/context/' . $post_id ) ),
			'previewUrl'                => get_permalink( $post_id ),
			'fullPreviewUrl'            => rest_url( 'lieve/v1/editor/full-preview/' . $post_id ),
			'previewPostTypes'          => array_map( static function( $object ) { return $object->labels->name; }, get_post_types( array( 'public' => true ), 'objects' ) ),
			'viewportStyles'            => lieve_editor_viewport_styles(),
			'viewportStyleTexts'        => lieve_editor_viewport_style_texts(),
			'viewportInlineCss'         => lieve_theme_settings_css() . wp_get_custom_css(),
			'outputClasses'             => array_map( static function( $definition, $target ) { return array( 'target' => $target, 'label' => $definition['label'], 'classes' => array_keys( $definition['classes'] ), 'rule' => lieve_output_class_rule( $target ) ); }, lieve_output_class_catalog(), array_keys( lieve_output_class_catalog() ) ),
			'attributeProtocols'        => wp_allowed_protocols(),
			'identityDefaults'          => lieve_element_identity_defaults(),
			'fontChoices'               => lieve_font_choices(),
			'localFontsCss'             => lieve_fonts_css(),
			'fontLibraryUrl'            => esc_url_raw( rest_url( 'lieve/v1/fonts' ) ),
			'fontLibraryPage'           => admin_url( 'admin.php?page=lieve-fonts' ),
			'canManageFonts'            => current_user_can( 'manage_options' ),
			'editPostUrl'               => get_edit_post_link( $post_id, 'raw' ),
			'homeUrl'                   => admin_url( 'edit.php?post_type=' . ( 'post' === $post->post_type ? 'post' : $post->post_type ) ),
			'isTemplate'                => $is_template,
			'templateType'              => $is_template ? $template_data['templateType'] : '',
			'popupOpening'              => $is_template ? $template_data['popupOpening'] : 'automatic',
			'popupSettings'             => $is_template ? $template_data['popupSettings'] : lieve_popup_settings_defaults(),
			'popupChoices'              => lieve_editor_popup_choices(),
			'popupChoicesUrl'           => esc_url_raw( rest_url( 'lieve/v1/popup-options' ) ),
			'templateConditions'        => $is_template ? $template_data['templateConditions'] : array(),
			'templateRevision'          => $is_template ? $template_data['templateRevision'] : '',
			'templateStatus'            => $is_template ? $template_data['templateStatus'] : '',
			'templateState'             => $is_template ? $template_data['state'] : null,
			'conditionConfig'           => lieve_condition_editor_config(),
			'elements'                  => lieve_editor_catalogue(),
			'imageSizes'                => array_combine( array_merge( array( 'full' ), get_intermediate_image_sizes() ), array_merge( array( 'Full size' ), get_intermediate_image_sizes() ) ),
			'styleSchema'               => lieve_style_schema(),
			'dynamicData'               => lieve_editor_dynamic_data( $post_id ),
			'elementConditionUrl'       => rest_url( 'lieve/v1/element-conditions/' . $post_id ),
			'richText'                  => array( 'canVisual' => user_can_richedit(), 'canUpload' => current_user_can( 'upload_files' ) ),
			'styleTargets'              => array_merge( array_combine( array_keys( lieve_element_registry() ), array_map( 'lieve_style_targets', array_keys( lieve_element_registry() ) ) ), array( 'popup-shell' => lieve_style_targets( 'popup-shell' ) ) ),
			'elementIcons'              => lieve_element_icons(),
			'elementPreviewUrl'         => esc_url_raw( rest_url( 'lieve/v1/preview/' . $post_id ) ),
			'pinnedElements'            => lieve_pinned_elements(),
			'pinsUrl'                   => esc_url_raw( rest_url( 'lieve/v1/editor/pins' ) ),
			'colorMode'                 => lieve_editor_color_mode(),
			'appearanceUrl'             => esc_url_raw( rest_url( 'lieve/v1/editor/appearance' ) ),
			'breakpoints'               => lieve_breakpoint_definitions(),
			'archivedBreakpoints'       => lieve_breakpoint_archive(),
			'defaultBreakpoints'        => lieve_default_breakpoints(),
			'breakpointIcons'           => lieve_breakpoint_icon_config(),
			'breakpointRevision'        => lieve_breakpoint_revision(),
			'breakpointsUrl'            => esc_url_raw( rest_url( 'lieve/v1/editor/breakpoints' ) ),
			'canManageBreakpoints'      => current_user_can( 'manage_options' ),
			'designSystem'              => lieve_design_config( $post_id ),
			'classes'                   => lieve_classes_config( $post_id ),
		)
	);
}
add_action( 'admin_enqueue_scripts', 'lieve_editor_assets' );

/** Resolve the configured WordPress link without accepting external URLs. */
function lieve_editor_exit_url( $post_id ) {
	$post = get_post( $post_id );
	if ( ! $post || ! current_user_can( 'edit_post', $post_id ) ) { return admin_url( 'index.php' ); }
	$list_url = 'post' === $post->post_type ? admin_url( 'edit.php' ) : add_query_arg( 'post_type', $post->post_type, admin_url( 'edit.php' ) );
	$edit_url = get_edit_post_link( $post_id, 'raw' ) ?: $list_url;
	switch ( lieve_theme_setting( 'editor_exit_destination' ) ) {
		case 'edit': return $edit_url;
		case 'list': return $list_url;
		case 'dashboard': return admin_url( 'index.php' );
		case 'overview': return current_user_can( 'edit_posts' ) ? admin_url( 'admin.php?page=lieve-dashboard' ) : $edit_url;
		default: return LIEVE_TEMPLATE_POST_TYPE === $post->post_type ? $list_url : $edit_url;
	}
}

/** Native link attributes for the WordPress destination, including the no-script fallback. */
function lieve_editor_exit_link_attributes() {
	return lieve_theme_setting( 'editor_exit_new_tab' ) ? ' target="_blank" rel="noopener noreferrer"' : '';
}

/** Announce the changed browsing context in the tooltip and accessible link name. */
function lieve_editor_exit_link_label() {
	return lieve_theme_setting( 'editor_exit_new_tab' ) ? __( 'Back to WordPress (opens in a new tab)', 'lieve-builder' ) : __( 'Back to WordPress', 'lieve-builder' );
}

/**
 * Render the editor shell. JavaScript supplies the interactive UI.
 */
function lieve_render_editor_page() {
	$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0;
	$post    = get_post( $post_id );

	if ( ! $post || ! current_user_can( 'edit_post', $post_id ) ) {
		wp_die( esc_html__( 'You do not have permission to edit this content.', 'lieve-builder' ) );
	}
	if ( ! lieve_builder_supports_post_type( $post->post_type ) ) {
		wp_die( esc_html__( 'LieveBuilder is disabled for this content type. Enable it in Settings → General to use the visual editor.', 'lieve-builder' ) );
	}
	$is_template = LIEVE_TEMPLATE_POST_TYPE === $post->post_type;
	$exit_url    = lieve_editor_exit_url( $post_id );
	$color_mode  = lieve_editor_color_mode();
	$preview_breakpoints = lieve_breakpoint_definitions();
	usort( $preview_breakpoints, function( $a, $b ) { return $b['width'] <=> $a['width']; } );
	?>
	<template id="lieve-builder-shell">
	<div id="lieve-builder-app" class="lieve-builder-app lieve-workspace" data-post-id="<?php echo esc_attr( $post_id ); ?>" data-component-mode="<?php echo lieve_is_component($post_id) ? 'true' : 'false'; ?>" data-color-mode="<?php echo esc_attr( $color_mode ); ?>">
		<header class="lieve-editor-header">
			<div class="lieve-editor-brand"><span class="lieve-mark" aria-hidden="true"><?php echo lieve_brand_logo(); ?></span><strong class="lieve-brand-name">Lieve<span>Builder</span></strong></div>
			<div class="lieve-document-context">
				<div class="lieve-document-title"><span title="<?php echo esc_attr( get_the_title( $post_id ) ?: __( 'Untitled', 'lieve-builder' ) ); ?>"><?php echo esc_html( get_the_title( $post_id ) ?: __( 'Untitled', 'lieve-builder' ) ); ?></span><?php if ( $is_template ) : ?><small><?php echo esc_html( lieve_is_component( $post_id ) ? __( 'Component model', 'lieve-builder' ) : __( 'Template', 'lieve-builder' ) ); ?></small><?php endif; ?></div>
				<?php if ( $is_template ) : ?>
					<div class="lieve-template-settings" aria-label="<?php esc_attr_e( 'Template Settings', 'lieve-builder' ); ?>">
						<label<?php echo lieve_is_component($post_id) ? ' hidden' : ''; ?>><span><?php esc_html_e( 'Type', 'lieve-builder' ); ?></span><select id="lieve-editor-template-type">
							<?php foreach ( lieve_template_types() as $value => $label ) : ?>
								<option value="<?php echo esc_attr( $value ); ?>" <?php selected( lieve_get_template_type( $post_id ), $value ); ?><?php echo 'component' === $value && !lieve_is_component($post_id) ? ' disabled hidden' : ''; ?>><?php echo esc_html( $label ); ?></option>
							<?php endforeach; ?>
						</select></label>
						<?php $template_state = lieve_template_state( $post_id ); ?>
						<span id="lieve-editor-template-state" class="lieve-template-state" data-template-state="<?php echo esc_attr( $template_state['key'] ); ?>"><?php echo esc_html( $template_state['label'] ); ?></span>
						<?php if ( current_user_can( 'publish_posts' ) ) : ?><button type="button" class="lieve-button-secondary" id="lieve-template-activation"><?php echo esc_html( 'publish' === get_post_status( $post_id ) ? __( 'Deactivate', 'lieve-builder' ) : __( 'Activate', 'lieve-builder' ) ); ?></button><?php endif; ?>
					</div>
				<?php endif; ?>
			</div>
			<div class="lieve-header-actions">
				<?php if ( $is_template ) : ?><button type="button" class="lieve-button-secondary lieve-document-toggle" data-toggle-document aria-expanded="false"><?php esc_html_e( 'Document', 'lieve-builder' ); ?></button><?php endif; ?>
				<button type="button" class="lieve-icon-button" id="lieve-undo" title="<?php esc_attr_e( 'Undo', 'lieve-builder' ); ?>" aria-label="<?php esc_attr_e( 'Undo', 'lieve-builder' ); ?>" disabled><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m9 4-5 5 5 5M4 9h9a7 7 0 0 1 7 7v4"/></svg></button>
				<button type="button" class="lieve-icon-button" id="lieve-redo" title="<?php esc_attr_e( 'Redo', 'lieve-builder' ); ?>" aria-label="<?php esc_attr_e( 'Redo', 'lieve-builder' ); ?>" disabled><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m15 4 5 5-5 5M20 9h-9a7 7 0 0 0-7 7v4"/></svg></button>
				<button type="button" class="lieve-button-secondary" id="lieve-templates-open"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg><?php esc_html_e( 'Library', 'lieve-builder' ); ?></button>
					<a class="lieve-button-secondary" id="lieve-preview-link" href="<?php echo esc_url( get_permalink( $post_id ) ); ?>" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><?php esc_html_e( 'Preview', 'lieve-builder' ); ?></a>
				<button type="button" class="lieve-button-primary" id="lieve-save"><?php esc_html_e( 'Save', 'lieve-builder' ); ?></button>
				<span class="lieve-save-shortcut" title="<?php esc_attr_e( 'Save with Command+S or Ctrl+S', 'lieve-builder' ); ?>">⌘S / Ctrl+S</span>
			</div>
		</header>

		<div class="lieve-editor-workspace">
			<aside id="lieve-left-panel" class="lieve-left-panel" aria-label="<?php esc_attr_e( 'Page workspace', 'lieve-builder' ); ?>">
				<div class="lieve-workspace-tools" role="toolbar" aria-label="<?php esc_attr_e( 'Workspace tools', 'lieve-builder' ); ?>">
					<a class="lieve-workspace-tool" href="<?php echo esc_url( $exit_url ); ?>"<?php echo lieve_editor_exit_link_attributes(); ?> aria-label="<?php echo esc_attr( lieve_editor_exit_link_label() ); ?>" data-tooltip="<?php echo esc_attr( lieve_editor_exit_link_label() ); ?>"><?php echo lieve_workspace_icon( 'wordpress' ); ?></a>
					<?php if ( $is_template ) : ?><button type="button" class="lieve-workspace-tool" id="lieve-editor-conditions-open" aria-label="<?php esc_attr_e( 'Template conditions', 'lieve-builder' ); ?>" aria-haspopup="dialog" aria-controls="lieve-conditions-modal" data-tooltip="<?php esc_attr_e( 'Template conditions', 'lieve-builder' ); ?>"><?php echo lieve_workspace_icon( 'conditions' ); ?><span class="lieve-workspace-tool-badge" id="lieve-editor-condition-count" aria-hidden="true"<?php if ( ! count( lieve_get_template_conditions( $post_id ) ) ) { echo ' hidden'; } ?>><?php echo esc_html( count( lieve_get_template_conditions( $post_id ) ) ); ?></span></button><?php endif; ?>
					<button type="button" class="lieve-workspace-tool" id="lieve-breakpoints-open" aria-label="<?php esc_attr_e( 'Responsive breakpoints', 'lieve-builder' ); ?>" aria-haspopup="dialog" aria-controls="lieve-breakpoints-modal" data-tooltip="<?php esc_attr_e( 'Responsive breakpoints', 'lieve-builder' ); ?>"><?php echo lieve_workspace_icon( 'breakpoints' ); ?></button>
					<button type="button" class="lieve-workspace-tool" id="lieve-variables-open" aria-haspopup="dialog" aria-controls="lieve-variables-modal" aria-label="<?php esc_attr_e( 'System variables', 'lieve-builder' ); ?>" data-tooltip="<?php esc_attr_e( 'System variables', 'lieve-builder' ); ?>"><?php echo lieve_workspace_icon( 'variables' ); ?></button>
					<button type="button" class="lieve-workspace-tool" id="lieve-classes-open" aria-haspopup="dialog" aria-controls="lieve-classes-modal" aria-label="Classes" data-tooltip="Classes"><?php echo lieve_workspace_icon( 'classes' ); ?></button>
					<button type="button" class="lieve-workspace-tool" id="lieve-colors-open" aria-haspopup="dialog" aria-controls="lieve-colors-modal" aria-label="<?php esc_attr_e( 'Colors and palettes', 'lieve-builder' ); ?>" data-tooltip="<?php esc_attr_e( 'Colors and palettes', 'lieve-builder' ); ?>"><?php echo lieve_workspace_icon( 'colors' ); ?></button>
					<button type="button" class="lieve-workspace-tool" id="lieve-appearance-toggle" aria-pressed="<?php echo 'dark' === $color_mode ? 'true' : 'false'; ?>" aria-label="<?php echo esc_attr( 'dark' === $color_mode ? __( 'Switch to light mode', 'lieve-builder' ) : __( 'Switch to dark mode', 'lieve-builder' ) ); ?>" data-tooltip="<?php echo esc_attr( 'dark' === $color_mode ? __( 'Switch to light mode', 'lieve-builder' ) : __( 'Switch to dark mode', 'lieve-builder' ) ); ?>"><span data-appearance-icon="light"<?php if ( 'dark' === $color_mode ) { echo ' hidden'; } ?>><?php echo lieve_workspace_icon( 'moon' ); ?></span><span data-appearance-icon="dark"<?php if ( 'light' === $color_mode ) { echo ' hidden'; } ?>><?php echo lieve_workspace_icon( 'sun' ); ?></span></button>
				</div>
				<div class="lieve-workspace-tabs" role="tablist" aria-label="<?php esc_attr_e( 'Workspace panels', 'lieve-builder' ); ?>">
					<button type="button" role="tab" id="lieve-elements-tab" aria-selected="true" aria-controls="lieve-elements-panel" data-panel-tab="elements"><?php esc_html_e( 'Elements', 'lieve-builder' ); ?></button>
					<button type="button" role="tab" id="lieve-structure-tab" aria-selected="false" tabindex="-1" aria-controls="lieve-structure-panel" data-panel-tab="structure"><?php esc_html_e( 'Structure', 'lieve-builder' ); ?></button>
					<button type="button" role="tab" id="lieve-seo-tab" aria-selected="false" tabindex="-1" aria-controls="lieve-seo-panel" data-panel-tab="seo"><?php esc_html_e( 'SEO', 'lieve-builder' ); ?></button>
					<button type="button" role="tab" id="lieve-page-markup-tab" aria-selected="false" tabindex="-1" aria-controls="lieve-page-markup-panel" data-panel-tab="page-markup"><?php esc_html_e( 'Markup', 'lieve-builder' ); ?></button>
				</div>
				<section id="lieve-elements-panel" class="lieve-workspace-panel" role="tabpanel" aria-labelledby="lieve-elements-tab">
					<?php
					$element_registry = lieve_element_registry();
					$group_counts = array_count_values( array_column( $element_registry, 'group' ) );
					$element_groups = array_keys( $group_counts );
					?>
					<div class="lieve-element-toolbar">
						<div class="lieve-element-search lieve-search-field" data-lieve-search-field>
							<?php echo lieve_element_icon( 'search' ); ?>
							<input type="search" class="lieve-search-input" id="lieve-element-search" aria-label="<?php esc_attr_e( 'Search elements', 'lieve-builder' ); ?>" placeholder="<?php esc_attr_e( 'Search elements…', 'lieve-builder' ); ?>" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="search">
							<kbd aria-hidden="true">/</kbd>
							<button type="button" class="lieve-search-clear" data-lieve-search-clear aria-label="<?php esc_attr_e( 'Clear search', 'lieve-builder' ); ?>" data-tooltip="<?php esc_attr_e( 'Clear search', 'lieve-builder' ); ?>" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m7 7 10 10M17 7 7 17"/></svg></button>
						</div>
						<div class="lieve-element-filter-row">
							<div class="lieve-widget-category-picker"><select id="lieve-widget-category" data-ds-select-kind="categories" aria-label="<?php esc_attr_e( 'Widget category', 'lieve-builder' ); ?>"><option value="all"><?php esc_html_e( 'All categories', 'lieve-builder' ); ?></option><option value="pinned"><?php esc_html_e( 'Pinned elements', 'lieve-builder' ); ?></option><?php foreach ( $element_groups as $group ) : ?><option value="<?php echo esc_attr( $group ); ?>"><?php echo esc_html( $group . ' · ' . $group_counts[ $group ] ); ?></option><?php endforeach; ?></select></div>
							<div class="lieve-widget-categories" role="group" aria-label="<?php esc_attr_e( 'Widget filters', 'lieve-builder' ); ?>">
								<button type="button" data-element-category-tab="pinned" data-tooltip="<?php esc_attr_e( 'Pinned elements', 'lieve-builder' ); ?>" aria-label="<?php esc_attr_e( 'Pinned elements', 'lieve-builder' ); ?>" aria-controls="lieve-element-catalogue" aria-pressed="false"><?php echo lieve_element_category_icon( 'pinned' ); ?></button>
							</div>
						</div>
					</div>
					<div class="lieve-element-catalogue" id="lieve-element-catalogue" role="region" aria-label="<?php esc_attr_e( 'Elements', 'lieve-builder' ); ?>" data-category="all" tabindex="0">
						<section class="lieve-element-category lieve-pinned-category" id="lieve-pinned-category" data-element-group="pinned" aria-labelledby="lieve-pinned-heading" hidden><div class="lieve-element-category-heading"><h3 class="lieve-element-category-name" id="lieve-pinned-heading"><?php esc_html_e( 'Pinned', 'lieve-builder' ); ?></h3><span class="lieve-element-category-count" aria-hidden="true">0</span></div><div class="lieve-block-library" id="lieve-pinned-library"></div></section>
					<?php
					$previous_group   = '';
					foreach ( $element_registry as $type => $definition ) :
					?>
						<?php if ( $previous_group !== $definition['group'] ) : ?>
							<?php if ( $previous_group ) { echo '</div></section>'; } ?>
							<section class="lieve-element-category" data-element-group="<?php echo esc_attr( $definition['group'] ); ?>" aria-labelledby="lieve-category-heading-<?php echo esc_attr( sanitize_title( $definition['group'] ) ); ?>"><div class="lieve-element-category-heading"><h3 class="lieve-element-category-name" id="lieve-category-heading-<?php echo esc_attr( sanitize_title( $definition['group'] ) ); ?>"><?php echo esc_html( $definition['group'] ); ?></h3><span class="lieve-element-category-count" aria-hidden="true"><?php echo esc_html( $group_counts[ $definition['group'] ] ); ?></span></div><div class="lieve-block-library">
							<?php $previous_group = $definition['group']; ?>
						<?php endif; ?>
						<div class="lieve-element-tile" data-element-type="<?php echo esc_attr( $type ); ?>">
						<button type="button" data-add-block="<?php echo esc_attr( $type ); ?>" data-element-search="<?php echo esc_attr( strtolower( $definition['label'] . ' ' . $definition['group'] . ' ' . $type ) ); ?>"<?php if ( ! empty( $definition['dependency'] ) ) { echo ' disabled title="' . esc_attr( $definition['dependency'] ) . '"'; } ?>>
							<span class="lieve-element-tile-icon" aria-hidden="true"><?php echo lieve_element_icon( $definition['icon'] ); ?></span>
							<span class="lieve-element-tile-label"><?php echo esc_html( $definition['label'] ); ?></span>
							<?php if ( ! empty( $definition['dependency'] ) ) : ?><small class="lieve-element-tile-dependency"><?php echo esc_html( $definition['dependency'] ); ?></small><?php endif; ?>
						</button>
						<button type="button" class="lieve-element-pin" data-pin-element="<?php echo esc_attr( $type ); ?>" aria-pressed="false" aria-label="<?php echo esc_attr( sprintf( __( 'Pin %s', 'lieve-builder' ), $definition['label'] ) ); ?>" title="<?php echo esc_attr( sprintf( __( 'Pin %s', 'lieve-builder' ), $definition['label'] ) ); ?>"><?php echo lieve_workspace_icon( 'pin' ); ?></button>
						</div>
					<?php endforeach; echo '</div></section>'; ?>
						<p class="lieve-element-search-empty" role="status" hidden><?php esc_html_e( 'No matching elements. Try a different search.', 'lieve-builder' ); ?></p>
					</div>
				</section>
				<section id="lieve-structure-panel" class="lieve-workspace-panel" role="tabpanel" aria-labelledby="lieve-structure-tab" hidden>
					<div class="lieve-structure-toolbar">
					<div class="lieve-structure-actions" data-structure-actions role="group" aria-label="<?php esc_attr_e( 'Content actions', 'lieve-builder' ); ?>">
						<?php foreach ( array( 'copy' => array( 'copy', __( 'Copy all content', 'lieve-builder' ) ), 'paste' => array( 'paste', __( 'Paste content at page root', 'lieve-builder' ) ), 'clear' => array( 'trash', __( 'Clear all content', 'lieve-builder' ) ), 'html' => array( 'html', __( 'Paste external HTML (coming soon)', 'lieve-builder' ) ) ) as $action => $control ) : ?>
							<button type="button" class="lieve-button-secondary" data-structure-action="<?php echo esc_attr( $action ); ?>" aria-label="<?php echo esc_attr( $control[1] ); ?>" data-tooltip="<?php echo esc_attr( $control[1] ); ?>"<?php disabled( 'html' === $action ); ?>><?php echo lieve_workspace_icon( $control[0] ); ?></button>
						<?php endforeach; ?>
					</div>
						<button type="button" class="lieve-button-secondary lieve-structure-help" aria-label="<?php esc_attr_e( 'Structure help', 'lieve-builder' ); ?>" aria-describedby="lieve-structure-instructions" data-tooltip="<?php esc_attr_e( 'Click a name to rename. Drag above or below to reorder, or inside a layout element to nest. Use the context menu for keyboard move actions.', 'lieve-builder' ); ?>"><?php echo lieve_element_icon( 'help' ); ?></button>
					</div>
					<p id="lieve-structure-instructions" class="screen-reader-text"><?php esc_html_e( 'Click a name to rename. Drag above or below to reorder, or inside a layout element to nest. Use the context menu for keyboard move actions.', 'lieve-builder' ); ?></p>
						<div id="lieve-structure" class="lieve-structure" role="tree" aria-describedby="lieve-structure-instructions" aria-label="<?php esc_attr_e( 'Content structure', 'lieve-builder' ); ?>"></div>
				</section>
				<section id="lieve-seo-panel" class="lieve-workspace-panel lieve-page-settings-panel" role="tabpanel" aria-labelledby="lieve-seo-tab" hidden></section>
				<section id="lieve-page-markup-panel" class="lieve-workspace-panel lieve-head-controls lieve-page-settings-panel" role="tabpanel" aria-labelledby="lieve-page-markup-tab" hidden>
					<div class="lieve-head-intro lieve-page-settings-intro"><div class="lieve-page-settings-title-row"><h2><?php esc_html_e( 'Page markup', 'lieve-builder' ); ?></h2></div><p><?php echo esc_html( $is_template ? __( 'Body, Main and the document head belong to individual pages, not reusable templates. Open a page to override its markup.', 'lieve-builder' ) : __( 'Manage page IDs and head output in one place. Inherited values follow your site Settings; overrides apply only to this page.', 'lieve-builder' ) ); ?></p></div>
					<?php if ( ! $is_template ) : ?>
					<details class="lieve-seo-section lieve-page-markup-section" data-page-markup-section="ids">
						<summary><strong><?php esc_html_e( 'Page IDs', 'lieve-builder' ); ?></strong><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg></summary>
						<div id="lieve-page-ids-controls" class="lieve-seo-section-body"></div>
					</details>
					<details class="lieve-seo-section lieve-page-markup-section" data-page-markup-section="head">
						<summary><strong><?php esc_html_e( 'Head output', 'lieve-builder' ); ?></strong><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg></summary>
						<div id="lieve-head-panel" class="lieve-seo-section-body"></div>
					</details>
					<?php endif; ?>
				</section>
			</aside>

			<main class="lieve-stage-wrap">
				<div class="lieve-device-bar" role="group" aria-label="<?php esc_attr_e( 'Preview Size', 'lieve-builder' ); ?>">
					<button type="button" class="lieve-drawer-toggle" data-toggle-drawer="elements" aria-expanded="false"><?php esc_html_e( 'Elements', 'lieve-builder' ); ?></button>
					<button type="button" class="lieve-button-secondary lieve-panels-reset" data-reset-panel-widths aria-label="<?php esc_attr_e( 'Reset panel widths', 'lieve-builder' ); ?>" data-tooltip="<?php esc_attr_e( 'Reset both panel widths', 'lieve-builder' ); ?>"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2.7 8M3 4v6h6"/></svg></button>
					<div class="lieve-editor-zoom-control" data-viewport-pending><select id="lieve-editor-zoom" data-editor-zoom aria-label="<?php esc_attr_e( 'Canvas zoom', 'lieve-builder' ); ?>" hidden><option value="fit"><?php esc_html_e( 'Fit', 'lieve-builder' ); ?></option><?php foreach ( array( 25, 50, 75, 100, 150, 200 ) as $zoom ) : ?><option value="<?php echo esc_attr( $zoom ); ?>"><?php echo esc_html( $zoom . '%' ); ?></option><?php endforeach; ?></select><button type="button" class="lieve-ds-select-trigger" aria-label="<?php esc_attr_e( 'Canvas zoom', 'lieve-builder' ); ?>" aria-haspopup="listbox" aria-expanded="false"><?php esc_html_e( 'Fit', 'lieve-builder' ); ?></button></div>
					<div class="lieve-device-choices" role="group" aria-label="<?php esc_attr_e( 'Responsive style contexts', 'lieve-builder' ); ?>">
					<?php foreach ( $preview_breakpoints as $breakpoint ) : ?><button type="button" data-device="<?php echo esc_attr( $breakpoint['id'] ); ?>" data-device-icon="<?php echo esc_attr( $breakpoint['icon'] ); ?>" aria-label="<?php echo esc_attr( $breakpoint['name'] . ' · ' . $breakpoint['width'] . 'px' . ( $breakpoint['base'] ? ' · Base styles' : '' ) ); ?>" title="<?php echo esc_attr( $breakpoint['name'] . ' · ' . $breakpoint['width'] . 'px' . ( $breakpoint['base'] ? ' · Base styles' : '' ) ); ?>" aria-pressed="<?php echo $breakpoint['base'] ? 'true' : 'false'; ?>"<?php echo $breakpoint['base'] ? ' class="is-active"' : ''; ?>><?php echo lieve_breakpoint_icon( $breakpoint['icon'] ); ?></button><?php endforeach; ?>
					</div>
					<span id="lieve-viewport-label" class="lieve-viewport-label"><?php esc_html_e( 'Responsive preview', 'lieve-builder' ); ?></span>
					<button type="button" class="lieve-drawer-toggle" data-toggle-drawer="properties" aria-expanded="false"><?php esc_html_e( 'Properties', 'lieve-builder' ); ?></button>
				</div>
				<div class="lieve-stage-scroll" data-viewport-pending aria-busy="true">
					<div id="lieve-canvas" class="lieve-canvas is-desktop" aria-label="<?php esc_attr_e( 'Composition Area', 'lieve-builder' ); ?>"></div>
				</div>
			</main>

			<aside id="lieve-right-panel" class="lieve-inspector" aria-label="<?php esc_attr_e( 'Element Properties', 'lieve-builder' ); ?>">
				<?php if ( $is_template ) : ?>
					<div id="lieve-popup-inspector-tools" class="lieve-popup-inspector-tools"<?php echo 'popup' === lieve_get_template_type( $post_id ) ? '' : ' hidden'; ?>>
						<button type="button" class="lieve-button-secondary" id="lieve-popup-settings" aria-controls="lieve-inspector-content" aria-expanded="false"<?php echo 'popup' === lieve_get_template_type( $post_id ) ? '' : ' hidden'; ?>><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M7 6h.01M10 6h.01"/></svg><span><?php esc_html_e( 'Pop Up Settings', 'lieve-builder' ); ?></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>
					</div>
				<?php endif; ?>
				<div id="lieve-inspector-content"></div>
			</aside>
			<div class="lieve-panel-resizer" data-resize-panel="left" role="separator" aria-orientation="vertical" aria-label="<?php esc_attr_e( 'Resize Elements and Structure panel', 'lieve-builder' ); ?>" aria-controls="lieve-left-panel" aria-valuemin="210" aria-valuemax="480" aria-valuenow="260" tabindex="0" title="<?php esc_attr_e( 'Drag to resize · double-click to reset · arrow keys to adjust', 'lieve-builder' ); ?>"></div>
			<div class="lieve-panel-resizer" data-resize-panel="right" role="separator" aria-orientation="vertical" aria-label="<?php esc_attr_e( 'Resize Element Properties panel', 'lieve-builder' ); ?>" aria-controls="lieve-right-panel" aria-valuemin="320" aria-valuemax="560" aria-valuenow="360" tabindex="0" title="<?php esc_attr_e( 'Drag to resize · double-click to reset · arrow keys to adjust', 'lieve-builder' ); ?>"></div>
		</div>
		<footer class="lieve-workspace-footer"><span id="lieve-save-status" role="status"><?php esc_html_e( 'All changes saved', 'lieve-builder' ); ?></span><nav id="lieve-element-breadcrumb" aria-label="<?php esc_attr_e( 'Selected element path', 'lieve-builder' ); ?>"></nav><span id="lieve-element-total">0 elements</span></footer>
		<div id="lieve-toast" class="lieve-toast" role="status" aria-live="polite" aria-atomic="true" hidden><div><strong data-toast-title hidden><?php esc_html_e( 'Action needed', 'lieve-builder' ); ?></strong><span data-toast-message></span></div><button type="button" data-toast-dismiss aria-label="<?php esc_attr_e( 'Dismiss message', 'lieve-builder' ); ?>" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>

		<?php if ( $is_template ) { lieve_render_conditions_modal( true ); } ?>
		<?php lieve_render_breakpoint_modal(); ?>
		<?php lieve_render_design_modal( 'variables' ); lieve_render_design_modal( 'colors' ); lieve_render_design_modal( 'classes' ); ?>

		<div id="lieve-template-modal" class="lieve-template-modal lieve-modal-skin" hidden>
			<div class="lieve-template-backdrop" data-close-templates></div>
			<section class="lieve-template-dialog lieve-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="lieve-template-title" tabindex="-1">
				<header class="lieve-template-header">
						<div>
							<h2 id="lieve-template-title"><?php esc_html_e( 'Template Library', 'lieve-builder' ); ?></h2>
							<p><?php esc_html_e( 'Browse the available layouts and apply them to the page.', 'lieve-builder' ); ?></p>
					</div>
					<button type="button" class="lieve-template-close" data-close-templates aria-label="<?php esc_attr_e( 'Close', 'lieve-builder' ); ?>"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
				</header>
				<div id="lieve-template-assignments" class="lieve-template-assignments"></div>
				<div class="lieve-template-content">
					<aside class="lieve-template-categories">
						<div class="lieve-template-label"><?php esc_html_e( 'Template Types', 'lieve-builder' ); ?></div>
						<div id="lieve-template-filters"></div>
					</aside>
					<div class="lieve-template-main">
						<div id="lieve-template-loading" class="lieve-template-message"><?php esc_html_e( 'Loading templates…', 'lieve-builder' ); ?></div>
						<div id="lieve-template-grid" class="lieve-template-grid"></div>
					</div>
				</div>
				<footer class="lieve-template-create">
					<div>
						<strong><?php esc_html_e( 'Need a new template?', 'lieve-builder' ); ?></strong>
						<span><?php esc_html_e( 'Use the guided flow to choose its name, type, and display conditions.', 'lieve-builder' ); ?></span>
					</div>
					<a class="lieve-button-primary" href="<?php echo esc_url( lieve_new_template_url() ); ?>"><?php esc_html_e( 'Create Template', 'lieve-builder' ); ?><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></a>
				</footer>
			</section>
		</div>
	</div>
	</template>
	<noscript><div class="wrap"><p><?php esc_html_e( 'JavaScript is required to load the visual editor.', 'lieve-builder' ); ?></p><a href="<?php echo esc_url( $exit_url ); ?>"<?php echo lieve_editor_exit_link_attributes(); ?>><?php echo esc_html( lieve_editor_exit_link_label() ); ?></a></div></noscript>
	<?php
	wp_print_inline_script_tag( 'window.LieveBuilder?.initialize();' );
}
