<?php
/** Template admin navigation, assets, creation handlers and list-table behavior. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Add the template-type selector to template edit screens.
 */
function lieve_add_template_type_meta_box() {
	add_meta_box(
		'lieve-template-type',
		__( 'Template Type', 'lieve-builder' ),
		'lieve_render_template_type_meta_box',
		LIEVE_TEMPLATE_POST_TYPE,
		'side',
		'high'
	);
}

/**
 * Save the template type selected in WordPress.
 *
 * @param int $post_id Template post ID.
 */
function lieve_save_template_type( $post_id ) {
	if (
		! isset( $_POST['lieve_template_type_nonce'] ) ||
		! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['lieve_template_type_nonce'] ) ), 'lieve_save_template_type' ) ||
		! current_user_can( 'edit_post', $post_id ) ||
		wp_is_post_autosave( $post_id ) ||
		wp_is_post_revision( $post_id )
	) {
		return;
	}

	$type = isset( $_POST['lieve_template_type'] ) ? sanitize_key( wp_unslash( $_POST['lieve_template_type'] ) ) : 'section';
	if ( ! array_key_exists( $type, lieve_template_types() ) ) {
		$type = 'section';
	}

	update_post_meta( $post_id, LIEVE_TEMPLATE_TYPE_META, $type );
}

/**
 * Register the main Lieve admin menu.
 */
function lieve_register_dashboard_menu() {
	add_menu_page(
		__( 'Lieve Builder', 'lieve-builder' ),
		__( 'LieveBuilder', 'lieve-builder' ),
		'edit_posts',
		'lieve-dashboard',
		'lieve_render_dashboard_page',
		LIEVE_LOGO_URL,
		58
	);

	add_submenu_page(
		'lieve-dashboard',
		__( 'Overview', 'lieve-builder' ),
		__( 'Overview', 'lieve-builder' ),
		'edit_posts',
		'lieve-dashboard',
		'lieve_render_dashboard_page'
	);

	// Register a hidden page; creation remains accessible from the template library.
	add_submenu_page(
		null,
		__( 'New Template', 'lieve-builder' ),
		__( 'New Template', 'lieve-builder' ),
		'publish_posts',
		'lieve-new-template',
		'lieve_render_new_template_page'
	);
	remove_submenu_page( '', 'lieve-new-template' );

}

/** Register Settings after WordPress adds the Template post-type submenu. */
function lieve_register_settings_submenu() {
	add_submenu_page( 'lieve-dashboard', __( 'Responsive', 'lieve-builder' ), __( 'Responsive', 'lieve-builder' ), 'manage_options', 'lieve-responsive', 'lieve_render_responsive_page' );
	add_submenu_page( 'lieve-dashboard', __( 'Variables', 'lieve-builder' ), __( 'Variables', 'lieve-builder' ), 'manage_options', 'lieve-variables', 'lieve_render_variables_page' );
	add_submenu_page( 'lieve-dashboard', __( 'Colors', 'lieve-builder' ), __( 'Colors', 'lieve-builder' ), 'manage_options', 'lieve-colors', 'lieve_render_colors_page' );
	add_submenu_page( 'lieve-dashboard', __( 'Classes', 'lieve-builder' ), __( 'Classes', 'lieve-builder' ), 'manage_options', 'lieve-classes', 'lieve_render_classes_page' );
	add_submenu_page( 'lieve-dashboard', __( 'Fonts', 'lieve-builder' ), __( 'Fonts', 'lieve-builder' ), 'manage_options', 'lieve-fonts', 'lieve_render_fonts_page' );
	add_submenu_page( 'lieve-dashboard', __( 'Static Delivery', 'lieve-builder' ), __( 'Static Delivery', 'lieve-builder' ), 'manage_options', 'lieve-static-delivery', 'lieve_render_static_page' );
	add_submenu_page( 'lieve-dashboard', __( 'Query Builder', 'lieve-builder' ), __( 'Query Builder', 'lieve-builder' ), 'manage_options', 'lieve-query-builder', 'lieve_render_query_builder_page' );
	add_submenu_page(
		'lieve-dashboard',
		__( 'Settings', 'lieve-builder' ),
		__( 'Settings', 'lieve-builder' ),
		'manage_options',
		'lieve-settings',
		'lieve_render_settings_page'
	);
}

/**
 * Set the title and keep the library selected on the hidden creation page.
 */
function lieve_load_new_template_page() {
	global $title, $parent_file, $submenu_file;
	$title        = __( 'New Template', 'lieve-builder' );
	$parent_file  = 'lieve-dashboard';
	$submenu_file = 'edit.php?post_type=' . LIEVE_TEMPLATE_POST_TYPE;
}

/**
 * Give Lieve management screens the same browser-title format as the builder.
 *
 * @param string $admin_title Default WordPress admin title.
 * @return string
 */
function lieve_management_admin_title( $admin_title ) {
	$screen = get_current_screen();
	if ( ! $screen ) {
		return $admin_title;
	}

	$titles = array(
		'toplevel_page_lieve-dashboard'    => __( 'Overview', 'lieve-builder' ),
		'admin_page_lieve-new-template'    => __( 'New Template', 'lieve-builder' ),
		'edit-' . LIEVE_TEMPLATE_POST_TYPE => __( 'Templates', 'lieve-builder' ),
	);
	// Submenu screen IDs depend on the translated parent menu label.
	foreach ( array(
		'lieve-responsive'      => __( 'Responsive', 'lieve-builder' ),
		'lieve-variables'       => __( 'Variables', 'lieve-builder' ),
		'lieve-colors'          => __( 'Colors', 'lieve-builder' ),
		'lieve-classes'         => __( 'Classes', 'lieve-builder' ),
		'lieve-fonts'           => __( 'Fonts', 'lieve-builder' ),
		'lieve-static-delivery' => __( 'Static Delivery', 'lieve-builder' ),
		'lieve-query-builder'   => __( 'Query Builder', 'lieve-builder' ),
		'lieve-settings'        => __( 'Settings', 'lieve-builder' ),
	) as $page => $label ) {
		$titles[ get_plugin_page_hookname( $page, 'lieve-dashboard' ) ] = $label;
	}

	return isset( $titles[ $screen->id ] ) ? $titles[ $screen->id ] . ' | Lieve Page Builder' : $admin_title;
}

/**
 * Return the dedicated template creation URL.
 *
 * @return string
 */
function lieve_new_template_url() {
	return admin_url( 'admin.php?page=lieve-new-template' );
}

/**
 * Keep every dashboard entry point on the guided creation flow.
 */
function lieve_redirect_native_template_creation() {
	$post_type = isset( $_GET['post_type'] ) ? sanitize_key( wp_unslash( $_GET['post_type'] ) ) : 'post';
	if ( LIEVE_TEMPLATE_POST_TYPE === $post_type ) {
		wp_safe_redirect( lieve_new_template_url() );
		exit;
	}
}

/**
 * Load the small admin design layer on Lieve management screens.
 *
 * @param string $hook_suffix Current admin hook.
 */
function lieve_template_admin_assets( $hook_suffix ) {
	$screen = get_current_screen();
	// WordPress derives submenu hooks from the translated parent menu label.
	$management_hooks = array(
		'toplevel_page_lieve-dashboard',
		'admin_page_lieve-new-template',
		get_plugin_page_hookname( 'lieve-settings', 'lieve-dashboard' ),
		get_plugin_page_hookname( 'lieve-responsive', 'lieve-dashboard' ),
		get_plugin_page_hookname( 'lieve-variables', 'lieve-dashboard' ),
		get_plugin_page_hookname( 'lieve-colors', 'lieve-dashboard' ),
		get_plugin_page_hookname( 'lieve-classes', 'lieve-dashboard' ),
		get_plugin_page_hookname( 'lieve-fonts', 'lieve-dashboard' ),
		get_plugin_page_hookname( 'lieve-static-delivery', 'lieve-dashboard' ),
		get_plugin_page_hookname( 'lieve-query-builder', 'lieve-dashboard' ),
	);
	if (
		! in_array( $hook_suffix, $management_hooks, true ) &&
		( ! $screen || LIEVE_TEMPLATE_POST_TYPE !== $screen->post_type )
	) {
		return;
	}

	wp_enqueue_style( 'lieve-builder-admin', LIEVE_URL . 'assets/css/admin.css', array( 'lieve-brand' ), lieve_asset_version( 'assets/css/admin.css' ) );
	wp_enqueue_style( 'lieve-builder-conditions', LIEVE_URL . 'assets/css/conditions.css', array( 'lieve-builder-admin' ), lieve_asset_version( 'assets/css/conditions.css' ) );
	if ( 'edit.php' === $hook_suffix && $screen && LIEVE_TEMPLATE_POST_TYPE === $screen->post_type ) {
		// Loaded in the document head: native list markup needs no client-side reparenting.
		wp_enqueue_style( 'lieve-template-library', LIEVE_URL . 'assets/css/template-library.css', array( 'lieve-builder-conditions' ), lieve_asset_version( 'assets/css/template-library.css' ) );
		wp_enqueue_style( 'lieve-modal-controls', LIEVE_URL . 'assets/css/modal-controls.css', array( 'lieve-template-library' ), lieve_asset_version( 'assets/css/modal-controls.css' ) );
	}
	if ( 'admin_page_lieve-new-template' === $hook_suffix ) {
		wp_enqueue_style( 'lieve-template-create', LIEVE_URL . 'assets/css/template-create.css', array( 'lieve-builder-conditions' ), lieve_asset_version( 'assets/css/template-create.css' ) );
	}
	wp_enqueue_script( 'lieve-builder-conditions', LIEVE_URL . 'assets/js/conditions.js', array( 'jquery-ui-sortable' ), lieve_asset_version( 'assets/js/conditions.js' ), true );
	$admin_dependencies = array( 'lieve-builder-conditions' );
	if ( 'admin_page_lieve-new-template' === $hook_suffix || ( $screen && LIEVE_TEMPLATE_POST_TYPE === $screen->post_type ) ) {
		lieve_enqueue_design_system( false );
		$admin_dependencies[] = 'lieve-design-system';
	}
	wp_enqueue_script( 'lieve-builder-admin', LIEVE_URL . 'assets/js/admin.js', $admin_dependencies, lieve_asset_version( 'assets/js/admin.js' ), true );
	if ( in_array( $hook_suffix, array( get_plugin_page_hookname( 'lieve-variables', 'lieve-dashboard' ), get_plugin_page_hookname( 'lieve-colors', 'lieve-dashboard' ), get_plugin_page_hookname( 'lieve-classes', 'lieve-dashboard' ) ), true ) ) { lieve_enqueue_design_system( false ); }
	if ( get_plugin_page_hookname( 'lieve-responsive', 'lieve-dashboard' ) === $hook_suffix ) {
		wp_enqueue_style( 'lieve-responsive', LIEVE_URL . 'assets/css/responsive.css', array( 'lieve-builder-conditions' ), lieve_asset_version( 'assets/css/responsive.css' ) );
		wp_enqueue_script( 'lieve-responsive', LIEVE_URL . 'assets/js/responsive.js', array( 'lieve-builder-conditions' ), lieve_asset_version( 'assets/js/responsive.js' ), true );
		wp_localize_script( 'lieve-responsive', 'LieveResponsiveConfig', lieve_responsive_config() );
	}
	wp_localize_script(
		'lieve-builder-admin',
		'LieveAdminConfig',
		array(
			'restUrl'          => esc_url_raw( rest_url( 'lieve/v1/' ) ),
			'nonce'            => wp_create_nonce( 'wp_rest' ),
			'newTemplateUrl'   => lieve_new_template_url(),
			'emptyTitle'       => __( 'Your library is ready', 'lieve-builder' ),
			'emptyDescription' => __( 'Create your first template and define its type and display conditions.', 'lieve-builder' ),
			'emptyAction'      => __( 'Create Your First Template', 'lieve-builder' ),
			'conditionConfig'  => lieve_condition_editor_config(),
			'templateTypes'    => array_keys(lieve_template_types()),
		)
	);
}

/**
 * Create a blank template from the guided admin form.
 */
function lieve_handle_create_template() {
	if ( ! current_user_can( 'publish_posts' ) ) {
		wp_die( esc_html__( 'Operation not allowed.', 'lieve-builder' ) );
	}

	check_admin_referer( 'lieve_create_template', 'lieve_create_template_nonce' );

	$title = isset( $_POST['template_title'] ) && is_string( $_POST['template_title'] ) ? sanitize_text_field( wp_unslash( $_POST['template_title'] ) ) : '';
	$type = isset( $_POST['template_type'] ) && is_string( $_POST['template_type'] ) ? sanitize_key( wp_unslash( $_POST['template_type'] ) ) : 'header';
	$conditions = isset( $_POST['template_conditions'] ) && is_string( $_POST['template_conditions'] ) ? json_decode( wp_unslash( $_POST['template_conditions'] ), true ) : array();
	$request_id = isset( $_POST['template_request_id'] ) && is_string( $_POST['template_request_id'] ) ? wp_unslash( $_POST['template_request_id'] ) : '';
	$popup_opening = isset( $_POST['popup_opening'] ) ? wp_unslash( $_POST['popup_opening'] ) : 'automatic';
	$error = '' === $title ? __( 'Enter a name for the template.', 'lieve-builder' ) : ( ! array_key_exists( $type, lieve_template_types() ) ? __( 'Choose a valid template type.', 'lieve-builder' ) : lieve_validate_template_conditions( $conditions ) );
	$post_id = $error ? new WP_Error( 'lieve_invalid_template', $error ) : lieve_create_inactive_template( $title, $type, lieve_sanitize_template_conditions( $conditions ), lieve_empty_document(), $request_id, 0, $popup_opening );
	if ( is_wp_error( $post_id ) ) {
		$token = str_replace( '-', '', wp_generate_uuid4() );
		set_transient( 'lieve_template_form_' . get_current_user_id() . '_' . $token, array( 'title' => $title, 'type' => $type, 'popupOpening' => is_string( $popup_opening ) ? $popup_opening : 'automatic', 'conditions' => is_array( $conditions ) ? $conditions : array(), 'requestId' => preg_match( '/^[a-zA-Z0-9_-]{16,80}$/', $request_id ) ? $request_id : wp_generate_uuid4(), 'error' => $post_id->get_error_message() ), 15 * MINUTE_IN_SECONDS );
		wp_safe_redirect( add_query_arg( 'draft', $token, lieve_new_template_url() ) ); exit;
	}

	wp_safe_redirect( add_query_arg( 'created', $post_id, lieve_new_template_url() ) );
	exit;
}

/**
 * Add Bricks-style type and condition columns to the template library.
 *
 * @param array $columns Existing columns.
 * @return array
 */
function lieve_template_admin_columns( $columns ) {
	$output = array( 'lieve_template_active' => __( 'Active', 'lieve-builder' ) );
	foreach ( $columns as $key => $label ) {
		$output[ $key ] = $label;
		if ( 'title' === $key ) {
			$output['lieve_template_type']      = __( 'Type', 'lieve-builder' );
			$output['lieve_template_state']     = __( 'State', 'lieve-builder' );
			$output['lieve_template_condition'] = __( 'Display', 'lieve-builder' );
		}
	}
	return $output;
}

/**
 * Apply the template type filter to the native list query.
 *
 * @param WP_Query $query Admin query.
 */
function lieve_template_type_filter_query( $query ) {
	if ( ! is_admin() || ! $query->is_main_query() ) {
		return;
	}

	$post_type = $query->get( 'post_type' );
	$type      = isset( $_GET['lieve_template_type'] ) ? sanitize_key( wp_unslash( $_GET['lieve_template_type'] ) ) : '';
	if ( LIEVE_TEMPLATE_POST_TYPE !== $post_type || ! array_key_exists( $type, lieve_template_types() ) ) {
		return;
	}

	if ( 'section' === $type ) {
		$query->set(
			'meta_query',
			array(
				'relation' => 'OR',
				array( 'key' => LIEVE_TEMPLATE_TYPE_META, 'compare' => 'NOT EXISTS' ),
				array( 'key' => LIEVE_TEMPLATE_TYPE_META, 'value' => array_values( array_diff( array_keys( lieve_template_types() ), array( 'section' ) ) ), 'compare' => 'NOT IN' ),
			)
		);
	} else {
		$query->set( 'meta_key', LIEVE_TEMPLATE_TYPE_META );
		$query->set( 'meta_value', $type );
	}
}

/**
 * Open template edit links directly in the visual editor.
 *
 * @param string $link    Native edit link.
 * @param int    $post_id Post ID.
 * @return string
 */
function lieve_template_visual_edit_link( $link, $post_id ) {
	return LIEVE_TEMPLATE_POST_TYPE === get_post_type( $post_id ) ? lieve_builder_url( $post_id ) : $link;
}

/**
 * Keep a single, explicit edit action for template rows.
 *
 * @param array   $actions Row actions.
 * @param WP_Post $post    Current post.
 * @return array
 */
function lieve_template_visual_row_actions( $actions, $post ) {
	if ( LIEVE_TEMPLATE_POST_TYPE !== $post->post_type ) {
		return $actions;
	}

	if ( ! current_user_can( 'edit_post', $post->ID ) || 'trash' === ( $post->post_status ?? get_post_status( $post->ID ) ) ) {
		return $actions;
	}
	$actions['edit'] = '<a href="' . esc_url( lieve_builder_url( $post->ID ) ) . '">' . esc_html__( 'Open Visual Editor', 'lieve-builder' ) . '</a>';
	unset( $actions['lieve-builder'] );
	$output = array();
	foreach ( $actions as $key => $action ) {
		$output[ $key ] = $action;
		if ( 'edit' === $key ) {
			// This permission-checked snapshot lets the popup render before any REST round trip.
			$snapshot = lieve_template_library_snapshot( $post->ID );
			if ( 'component' !== lieve_get_template_type( $post->ID ) ) { $output['lieve-conditions'] = '<button type="button" class="button-link lieve-row-conditions" data-template-id="' . esc_attr( $post->ID ) . '" data-template-conditions="' . esc_attr( wp_json_encode( $snapshot ) ) . '">' . esc_html__( 'Conditions', 'lieve-builder' ) . '</button>'; }
			if ( current_user_can( 'publish_posts' ) ) {
				$output['lieve-duplicate'] = '<button type="button" class="button-link lieve-row-template-action" data-template-action="duplicate" data-template-id="' . esc_attr( $post->ID ) . '" data-template-revision="' . esc_attr( $snapshot['templateRevision'] ) . '">' . esc_html__( 'Duplicate', 'lieve-builder' ) . '</button>';
			}
		}
	}
	return $output;
}
