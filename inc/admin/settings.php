<?php
/**
 * Theme settings and their frontend output.
 *
 * @package LieveBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'LIEVE_SETTINGS_OPTION', 'lieve_theme_settings' );
require_once __DIR__ . '/../frontend/head.php';
require_once __DIR__ . '/../frontend/page-markup.php';
require_once __DIR__ . '/output-class-settings.php';
require_once __DIR__ . '/settings-rest.php';
require_once __DIR__ . '/../builder/custom-code.php';

/**
 * Default theme settings.
 *
 * @return array
 */
function lieve_theme_settings_defaults() {
	return array(
		'accent_start'  => '#16c6c0',
		'accent_end'    => '#8044e3',
		'content_width' => 760,
		'wide_width'    => 1180,
		'popup_width'   => 720,
		'enable_popups' => true,
		'execute_php' => false,
		'builder_post_types' => array( 'page' ),
		'css_loading_method' => 'internal',
		'preload_fonts' => true,
		'editor_exit_destination' => 'default',
		'editor_exit_new_tab' => false,
		'remove_wp_classes' => false,
		'output_html_ids' => true,
		'output_data_ids' => true,
		'output_classes' => array(),
		'output_ids' => lieve_page_markup_normalize( array(), true ),
		'head_items' => array(),
		'breakpoint_tablet' => 991,
		'breakpoint_mobile' => 767,
	);
}

/** Editable content types, excluding media and WordPress's internal documents. */
function lieve_builder_post_type_options() {
	$options = array();
	$internal = array( 'attachment', 'revision', 'nav_menu_item', 'custom_css', 'customize_changeset', 'oembed_cache', 'user_request', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation', 'wp_font_family', 'wp_font_face', 'lieve_template' );
	foreach ( get_post_types( array( 'show_ui' => true ), 'objects' ) as $name => $object ) {
		if ( in_array( $name, $internal, true ) || ( ! empty( $object->_builtin ) && ! in_array( $name, array( 'post', 'page' ), true ) ) ) { continue; }
		$options[ $name ] = $object->labels->name ?? $object->labels->singular_name ?? $name;
	}
	natcasesort( $options );
	// Pages leads the list because it is the only default-enabled content type.
	if ( isset( $options['page'] ) ) { $options = array( 'page' => $options['page'] ) + $options; }
	return $options;
}

/** Content-type availability controls editing, not existing frontend layouts. */
function lieve_builder_supports_post_type( $post_type ) {
	if ( 'lieve_template' === $post_type ) { return true; }
	return is_string( $post_type ) && array_key_exists( $post_type, lieve_builder_post_type_options() ) && in_array( $post_type, lieve_theme_setting( 'builder_post_types' ), true );
}

/** Supported same-site destinations for the editor's WordPress link. */
function lieve_editor_exit_destinations() {
	return array(
		'default' => __( 'Default destination', 'lieve-builder' ),
		'edit' => __( 'WordPress edit screen', 'lieve-builder' ),
		'list' => __( 'Current content list', 'lieve-builder' ),
		'dashboard' => __( 'WordPress Dashboard', 'lieve-builder' ),
		'overview' => __( 'LieveBuilder Overview', 'lieve-builder' ),
	);
}

/**
 * Return all normalized theme settings.
 *
 * @return array
 */
function lieve_theme_settings() {
	$saved = get_option( LIEVE_SETTINGS_OPTION, array() );
	return lieve_sanitize_theme_settings( wp_parse_args( is_array( $saved ) ? $saved : array(), lieve_theme_settings_defaults() ) );
}

/**
 * Return one theme setting.
 *
 * @param string $key Setting key.
 * @return mixed
 */
function lieve_theme_setting( $key ) {
	$settings = lieve_theme_settings();
	return array_key_exists( $key, $settings ) ? $settings[ $key ] : null;
}

/**
 * Sanitize settings submitted from the theme settings page.
 *
 * @param mixed $input Raw settings.
 * @return array
 */
function lieve_sanitize_theme_settings( $input ) {
	$input    = is_array( $input ) ? $input : array();
	$defaults = lieve_theme_settings_defaults();
	$output   = array();

	$output['accent_start'] = isset( $input['accent_start'] ) ? sanitize_hex_color( $input['accent_start'] ) : '';
	$output['accent_end']   = isset( $input['accent_end'] ) ? sanitize_hex_color( $input['accent_end'] ) : '';
	$output['accent_start'] = $output['accent_start'] ?: $defaults['accent_start'];
	$output['accent_end']   = $output['accent_end'] ?: $defaults['accent_end'];

	$output['content_width'] = isset( $input['content_width'] ) ? min( 1200, max( 480, absint( $input['content_width'] ) ) ) : $defaults['content_width'];
	$output['wide_width']    = isset( $input['wide_width'] ) ? min( 1920, max( 720, absint( $input['wide_width'] ) ) ) : $defaults['wide_width'];
	$output['popup_width']   = isset( $input['popup_width'] ) ? min( 1200, max( 320, absint( $input['popup_width'] ) ) ) : $defaults['popup_width'];
	$output['enable_popups'] = ! empty( $input['enable_popups'] );
	$output['execute_php'] = in_array( $input['execute_php'] ?? false, array( true, 1, '1' ), true );
	$types = array_key_exists( 'builder_post_types', $input ) ? $input['builder_post_types'] : $defaults['builder_post_types'];
	$types = is_array( $types ) ? $types : $defaults['builder_post_types'];
	$allowed_types = lieve_builder_post_type_options();
	$output['builder_post_types'] = array_values( array_unique( array_filter( $types, static function( $type ) use ( $allowed_types ) { return is_string( $type ) && array_key_exists( $type, $allowed_types ); } ) ) );
	sort( $output['builder_post_types'], SORT_STRING );
	$output['css_loading_method'] = in_array( $input['css_loading_method'] ?? '', array( 'inline', 'external', 'internal' ), true ) ? $input['css_loading_method'] : $defaults['css_loading_method'];
	$output['preload_fonts'] = ! empty( $input['preload_fonts'] );
	$destination = $input['editor_exit_destination'] ?? '';
	$output['editor_exit_destination'] = is_string( $destination ) && array_key_exists( $destination, lieve_editor_exit_destinations() ) ? $destination : $defaults['editor_exit_destination'];
	$output['editor_exit_new_tab'] = in_array( $input['editor_exit_new_tab'] ?? false, array( true, 1, '1' ), true );
	$output['remove_wp_classes'] = ! empty( $input['remove_wp_classes'] );
	foreach ( array( 'output_html_ids', 'output_data_ids' ) as $key ) { $output[ $key ] = array_key_exists( $key, $input ) ? ! empty( $input[ $key ] ) : true; }
	$output['output_classes'] = lieve_sanitize_output_class_settings( $input['output_classes'] ?? array() );
	$raw_ids = $input['output_ids'] ?? array();
	if ( is_array( $raw_ids ) ) { foreach ( $raw_ids as &$row ) { if ( is_array( $row ) && array_key_exists( 'enabled', $row ) && in_array( $row['enabled'], array( '0', '1', 0, 1 ), true ) ) { $row['enabled'] = in_array( $row['enabled'], array( '1', 1 ), true ); } } unset( $row ); }
	$ids = lieve_page_markup_normalize( $raw_ids, true );
	// Native Settings submissions cannot publish duplicate shell IDs either.
	$effective_ids = lieve_page_markup_ids( array(), $ids );
	if ( $effective_ids['body'] && $effective_ids['body'] === $effective_ids['main'] ) { $ids = lieve_page_markup_normalize( array(), true ); }
	$output['output_ids'] = $ids;
	$output['head_items'] = lieve_head_normalize( $input['head_items'] ?? array(), true );
	$breakpoints = array( 'tablet' => $input['breakpoint_tablet'] ?? 991, 'mobile' => $input['breakpoint_mobile'] ?? 767 );
	if ( ! lieve_valid_breakpoints( $breakpoints ) ) { $breakpoints = array( 'tablet' => 991, 'mobile' => 767 ); }
	$output['breakpoint_tablet'] = (int) $breakpoints['tablet'];
	$output['breakpoint_mobile'] = (int) $breakpoints['mobile'];

	return $output;
}

/** Keep the same validated device groups in the editor and published CSS. */
function lieve_valid_breakpoints( $value ) {
	if ( ! is_array( $value ) ) { return false; }
	foreach ( array( 'tablet', 'mobile' ) as $key ) {
		if ( ! isset( $value[ $key ] ) || ! ( is_int( $value[ $key ] ) || ( is_string( $value[ $key ] ) && ctype_digit( $value[ $key ] ) ) ) ) { return false; }
	}
	return $value['tablet'] >= 320 && $value['tablet'] <= 2560 && $value['mobile'] >= 240 && $value['mobile'] < $value['tablet'];
}

function lieve_responsive_breakpoints() {
	if ( function_exists( 'lieve_breakpoint_definitions' ) ) {
		$output = array(); foreach ( lieve_breakpoint_order() as $item ) { $output[ $item['id'] ] = $item['base'] ? 0 : $item['width']; } return $output;
	}
	$settings = lieve_theme_settings();
	return array( 'desktop' => 0, 'tablet' => $settings['breakpoint_tablet'], 'mobile' => $settings['breakpoint_mobile'] );
}

/**
 * Register theme settings with WordPress.
 */
function lieve_register_theme_settings() {
	register_setting(
		'lieve_theme_settings_group',
		LIEVE_SETTINGS_OPTION,
		array(
			'type'              => 'array',
			'sanitize_callback' => 'lieve_sanitize_theme_settings',
			'default'           => lieve_theme_settings_defaults(),
		)
	);
}
add_action( 'admin_init', 'lieve_register_theme_settings' );

/** Native options.php and REST must both respect the site's code-authoring permissions. */
function lieve_custom_code_settings_guard( $value, $old ) {
	if ( is_array( $value ) && ! empty( $value['execute_php'] ) && empty( $old['execute_php'] ) && ! lieve_can_author_custom_code() ) { $value['execute_php'] = false; }
	return $value;
}
add_filter( 'pre_update_option_' . LIEVE_SETTINGS_OPTION, 'lieve_custom_code_settings_guard', 10, 2 );

/** The same tab whitelist is used for server rendering and progressive navigation. */
function lieve_settings_tabs() {
	return array(
		'general' => __( 'General', 'lieve-builder' ),
		'builder' => __( 'Builder', 'lieve-builder' ),
		'appearance' => __( 'Appearance', 'lieve-builder' ),
		'markup' => __( 'Markup', 'lieve-builder' ),
		'head' => __( 'Head', 'lieve-builder' ),
		'performance' => __( 'Performance', 'lieve-builder' ),
		'system' => __( 'System', 'lieve-builder' ),
	);
}

function lieve_settings_active_tab( $requested ) {
	return is_string( $requested ) && array_key_exists( $requested, lieve_settings_tabs() ) ? $requested : 'general';
}

/** Load the established workspace controls only on Settings. */
function lieve_settings_admin_assets( $hook ) {
	if ( get_plugin_page_hookname( 'lieve-settings', 'lieve-dashboard' ) !== $hook ) { return; }
	wp_enqueue_style( 'lieve-settings-base', LIEVE_URL . 'assets/css/design-system.css', array( 'lieve-builder-conditions' ), lieve_asset_version( 'assets/css/design-system.css' ) );
	wp_enqueue_style( 'lieve-colour-picker', LIEVE_URL . 'assets/css/colour-picker.css', array( 'lieve-settings-base' ), lieve_asset_version( 'assets/css/colour-picker.css' ) );
	wp_enqueue_style( 'lieve-settings', LIEVE_URL . 'assets/css/settings.css', array( 'lieve-settings-base', 'lieve-colour-picker' ), lieve_asset_version( 'assets/css/settings.css' ) );
	wp_enqueue_script( 'lieve-colour-picker', LIEVE_URL . 'assets/js/colour-picker.js', array(), lieve_asset_version( 'assets/js/colour-picker.js' ), true );
	wp_enqueue_script( 'lieve-settings-classes', LIEVE_URL . 'assets/js/settings-classes.js', array(), lieve_asset_version( 'assets/js/settings-classes.js' ), true );
	wp_enqueue_style( 'lieve-head-controls', LIEVE_URL . 'assets/css/head-controls.css', array( 'lieve-settings' ), lieve_asset_version( 'assets/css/head-controls.css' ) );
	wp_enqueue_script( 'lieve-head-controls', LIEVE_URL . 'assets/js/head-controls.js', array(), lieve_asset_version( 'assets/js/head-controls.js' ), true );
	wp_enqueue_script( 'lieve-settings', LIEVE_URL . 'assets/js/settings.js', array( 'lieve-colour-picker', 'lieve-settings-classes', 'lieve-head-controls' ), lieve_asset_version( 'assets/js/settings.js' ), true );
	wp_localize_script( 'lieve-head-controls', 'LieveHeadSettings', lieve_head_control_config() );
	wp_localize_script( 'lieve-settings', 'LieveSettingsConfig', array( 'url' => esc_url_raw( rest_url( 'lieve/v1/settings' ) ), 'updatesUrl' => esc_url_raw( rest_url( 'lieve/v1/theme-updates/check' ) ), 'nonce' => wp_create_nonce( 'wp_rest' ), 'revision' => lieve_settings_revision(), 'data' => lieve_theme_settings() ) );
	wp_enqueue_script( 'lieve-theme-updates', LIEVE_URL . 'assets/js/theme-updates.js', array( 'lieve-settings' ), lieve_asset_version( 'assets/js/theme-updates.js' ), true );
}
add_action( 'admin_enqueue_scripts', 'lieve_settings_admin_assets', 30 );

/**
 * Render the Lieve theme settings page.
 */
function lieve_render_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You do not have permission to manage these settings.', 'lieve-builder' ) );
	}

	$settings = lieve_theme_settings();
	$tabs     = lieve_settings_tabs();
	$active   = lieve_settings_active_tab( isset( $_GET['tab'] ) ? wp_unslash( $_GET['tab'] ) : '' );
	?>
	<div class="wrap lieve-admin-page lieve-design-page lieve-token-page lieve-settings-page">
		<?php lieve_render_admin_header( __( 'Settings', 'lieve-builder' ), __( 'Configure your theme, shape the interface, and access your site tools.', 'lieve-builder' ) ); ?>
		<?php settings_errors( LIEVE_SETTINGS_OPTION ); ?>

		<form class="lieve-settings-form lieve-settings-card lieve-ds-page-card" action="options.php" method="post" data-theme-settings>
			<?php settings_fields( 'lieve_theme_settings_group' ); ?>
			<input type="hidden" name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION ); ?>[breakpoint_tablet]" value="<?php echo esc_attr( $settings['breakpoint_tablet'] ); ?>">
			<input type="hidden" name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION ); ?>[breakpoint_mobile]" value="<?php echo esc_attr( $settings['breakpoint_mobile'] ); ?>">
			<input type="hidden" name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION ); ?>[remove_wp_classes]" value="<?php echo ! empty( $settings['remove_wp_classes'] ) ? '1' : '0'; ?>">
			<div class="lieve-ds lieve-settings-workspace">
				<nav class="lieve-settings-tabs" role="tablist" aria-label="<?php esc_attr_e( 'Settings sections', 'lieve-builder' ); ?>">
					<?php foreach ( $tabs as $id => $label ) : ?>
						<a href="<?php echo esc_url( admin_url( 'admin.php?page=lieve-settings&tab=' . $id ) ); ?>" role="tab" id="lieve-settings-tab-<?php echo esc_attr( $id ); ?>" aria-controls="lieve-settings-panel-<?php echo esc_attr( $id ); ?>" aria-selected="<?php echo $active === $id ? 'true' : 'false'; ?>" tabindex="<?php echo $active === $id ? '0' : '-1'; ?>" data-settings-tab="<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $label ); ?></a>
					<?php endforeach; ?>
				</nav>
				<section class="lieve-settings-panel" role="tabpanel" id="lieve-settings-panel-general" aria-labelledby="lieve-settings-tab-general" tabindex="0"<?php echo 'general' !== $active ? ' hidden' : ''; ?>>
					
					<header class="lieve-settings-section-head"><h2 id="lieve-settings-general-title"><?php esc_html_e( 'Website defaults', 'lieve-builder' ); ?></h2><p><?php esc_html_e( 'Set the defaults for theme-generated content. Builder elements keep the properties you define in the editor.', 'lieve-builder' ); ?></p></header>
					<section class="lieve-settings-group" aria-labelledby="lieve-settings-layout-title"><header class="lieve-settings-section-head"><h3 id="lieve-settings-layout-title"><?php esc_html_e( 'Theme layout', 'lieve-builder' ); ?></h3></header>
					<?php foreach ( array(
						'content_width' => array( __( 'Content width', 'lieve-builder' ), __( 'Reading width for standard posts and pages without a builder layout.', 'lieve-builder' ), 480, 1200 ),
						'wide_width' => array( __( 'Wide width', 'lieve-builder' ), __( 'Maximum width for the standard theme archive layout.', 'lieve-builder' ), 720, 1920 ),
					) as $key => $field ) : ?>
						<div class="lieve-settings-row"><div><label for="lieve-setting-<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $field[0] ); ?></label><p id="lieve-setting-<?php echo esc_attr( $key ); ?>-help"><?php echo esc_html( $field[1] ); ?></p></div><div class="lieve-ds-field lieve-settings-value"><div class="lieve-settings-unit"><input id="lieve-setting-<?php echo esc_attr( $key ); ?>" data-setting name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION . '[' . $key . ']' ); ?>" type="number" min="<?php echo (int) $field[2]; ?>" max="<?php echo (int) $field[3]; ?>" step="1" required value="<?php echo esc_attr( $settings[ $key ] ); ?>" aria-describedby="lieve-setting-<?php echo esc_attr( $key ); ?>-help"><span aria-hidden="true">px</span></div></div></div>
					<?php endforeach; ?>
					</section>
					<section class="lieve-settings-group" aria-labelledby="lieve-settings-popups-title"><header class="lieve-settings-section-head"><h3 id="lieve-settings-popups-title"><?php esc_html_e( 'Pop Up defaults', 'lieve-builder' ); ?></h3></header><div class="lieve-settings-row"><div><label for="lieve-setting-enable_popups"><?php esc_html_e( 'Conditional Pop Ups', 'lieve-builder' ); ?></label><p id="lieve-setting-popups-help"><?php esc_html_e( 'Allow active Pop Up templates to appear when their display conditions match. Disabling this does not change the templates.', 'lieve-builder' ); ?></p></div><label class="lieve-settings-popup-control lieve-settings-value"><span class="lieve-settings-popup-switch"><input id="lieve-setting-enable_popups" data-setting name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION ); ?>[enable_popups]" type="checkbox" role="switch" value="1" aria-describedby="lieve-setting-popups-help" <?php checked( ! empty( $settings['enable_popups'] ) ); ?>><span class="lieve-template-toggle-track" aria-hidden="true"></span></span><span><?php esc_html_e( 'Enable Pop Ups', 'lieve-builder' ); ?></span></label></div>
					<div class="lieve-settings-row"><div><label for="lieve-setting-popup_width"><?php esc_html_e( 'Pop Up width', 'lieve-builder' ); ?></label><p id="lieve-setting-popup-width-help"><?php esc_html_e( 'Fallback shell width when a Pop Up has no template-specific width. Individual Pop Ups can override this in the builder.', 'lieve-builder' ); ?></p></div><div class="lieve-ds-field lieve-settings-value"><div class="lieve-settings-unit"><input id="lieve-setting-popup_width" data-setting name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION ); ?>[popup_width]" type="number" min="320" max="1200" step="1" required value="<?php echo esc_attr( $settings['popup_width'] ); ?>" aria-describedby="lieve-setting-popup-width-help"><span aria-hidden="true">px</span></div></div></div>

				</section>
				</section>
				<section class="lieve-settings-panel" role="tabpanel" id="lieve-settings-panel-builder" aria-labelledby="lieve-settings-tab-builder" tabindex="0"<?php echo 'builder' !== $active ? ' hidden' : ''; ?>>
					<header class="lieve-settings-section-head"><h2 id="lieve-settings-builder-title"><?php esc_html_e( 'Builder preferences', 'lieve-builder' ); ?></h2><p><?php esc_html_e( 'Choose which content types can use LieveBuilder and how the WordPress return link behaves.', 'lieve-builder' ); ?></p></header>
					<section class="lieve-settings-group" aria-labelledby="lieve-settings-content-types-title"><fieldset class="lieve-settings-defaults lieve-settings-post-types" aria-describedby="lieve-setting-post-types-help">
						<legend id="lieve-settings-content-types-title"><?php esc_html_e( 'Enable LieveBuilder for', 'lieve-builder' ); ?></legend>
						<p id="lieve-setting-post-types-help"><?php esc_html_e( 'Choose which content types can use the visual editor. Only Pages are enabled by default. Existing saved layouts keep rendering when a type is disabled. Lieve templates are always available.', 'lieve-builder' ); ?></p>
						<input type="hidden" name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION ); ?>[builder_post_types][]" value="">
						<div class="lieve-settings-class-list">
							<?php foreach ( lieve_builder_post_type_options() as $type => $label ) : ?>
								<label class="lieve-settings-class-option" for="lieve-setting-post-type-<?php echo esc_attr( $type ); ?>"><span class="lieve-settings-class-label"><span><?php echo esc_html( $label ); ?></span><small><?php echo esc_html( $type ); ?></small></span><span class="lieve-settings-popup-switch"><input id="lieve-setting-post-type-<?php echo esc_attr( $type ); ?>" data-setting data-setting-post-type="<?php echo esc_attr( $type ); ?>" name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION ); ?>[builder_post_types][]" type="checkbox" role="switch" value="<?php echo esc_attr( $type ); ?>" aria-describedby="lieve-setting-post-types-help" <?php checked( in_array( $type, $settings['builder_post_types'], true ) ); ?>><span class="lieve-template-toggle-track" aria-hidden="true"></span></span></label>
							<?php endforeach; ?>
						</div>
					</fieldset></section>
					<section class="lieve-settings-group" aria-labelledby="lieve-settings-navigation-title"><header class="lieve-settings-section-head"><h3 id="lieve-settings-navigation-title"><?php esc_html_e( 'Editor navigation', 'lieve-builder' ); ?></h3><p><?php esc_html_e( 'Choose where the WordPress icon takes you when leaving the visual editor.', 'lieve-builder' ); ?></p></header>
					<div class="lieve-settings-row"><div><label id="lieve-setting-editor-exit-label" for="lieve-setting-editor_exit_destination"><?php esc_html_e( 'WordPress link destination', 'lieve-builder' ); ?></label><p id="lieve-setting-editor-exit-help"><?php esc_html_e( 'Default opens the WordPress edit screen for pages and posts, or the template list for templates. Save Settings, then reload an already-open editor to use your choice.', 'lieve-builder' ); ?></p></div><div class="lieve-ds-field lieve-settings-value lieve-settings-select">
						<noscript><style>.lieve-settings-select select{display:block!important}.lieve-settings-select .lieve-ds-select-trigger{display:none!important}</style></noscript>
						<select id="lieve-setting-editor_exit_destination" data-setting data-settings-select data-settings-search="<?php esc_attr_e( 'Search destinations', 'lieve-builder' ); ?>" name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION ); ?>[editor_exit_destination]" aria-label="<?php esc_attr_e( 'WordPress link destination', 'lieve-builder' ); ?>" aria-describedby="lieve-setting-editor-exit-help">
							<?php $destinations = lieve_editor_exit_destinations(); foreach ( $destinations as $value => $label ) : ?><option value="<?php echo esc_attr( $value ); ?>"<?php echo $settings['editor_exit_destination'] === $value ? ' selected' : ''; ?>><?php echo esc_html( $label ); ?></option><?php endforeach; ?>
						</select><button type="button" class="lieve-ds-select-trigger" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="lieve-setting-editor-exit-label lieve-setting-editor-exit-value"><span id="lieve-setting-editor-exit-value"><?php echo esc_html( $destinations[ $settings['editor_exit_destination'] ] ); ?></span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
					</div></div>
					<div class="lieve-settings-row"><div><label for="lieve-setting-editor_exit_new_tab"><?php esc_html_e( 'Open WordPress in a new tab', 'lieve-builder' ); ?></label><p id="lieve-setting-editor-exit-new-tab-help"><?php esc_html_e( 'Keep the visual editor open while visiting the selected WordPress destination. Off opens the link in the current tab. Save Settings, then reload an already-open editor to apply this choice.', 'lieve-builder' ); ?></p></div><div class="lieve-settings-value"><input type="hidden" name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION ); ?>[editor_exit_new_tab]" value="0"><label class="lieve-settings-popup-control"><span class="lieve-settings-popup-switch"><input id="lieve-setting-editor_exit_new_tab" data-setting name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION ); ?>[editor_exit_new_tab]" type="checkbox" role="switch" value="1" aria-describedby="lieve-setting-editor-exit-new-tab-help" <?php checked( $settings['editor_exit_new_tab'] ); ?>><span class="lieve-template-toggle-track" aria-hidden="true"></span></span><span><?php esc_html_e( 'Open in a new tab', 'lieve-builder' ); ?></span></label></div></div>
				</section>
				</section>
				<section class="lieve-settings-panel" role="tabpanel" id="lieve-settings-panel-appearance" aria-labelledby="lieve-settings-tab-appearance" tabindex="0"<?php echo 'appearance' !== $active ? ' hidden' : ''; ?>>
					<noscript><style>[data-settings-colors-reset],[data-setting-swatch]{display:none!important}</style></noscript>
					<header class="lieve-settings-section-head lieve-settings-appearance-head"><div><h2><?php esc_html_e( 'Interface appearance', 'lieve-builder' ); ?></h2><p><?php esc_html_e( 'Customize the interface gradient, hover states, focus rings and accent variants. This does not add styles to builder elements.', 'lieve-builder' ); ?></p></div><button type="button" class="lieve-conditions-cancel" data-settings-colors-reset title="<?php esc_attr_e( 'Restore both interface colors. Save Settings to apply, or Cancel to undo. Other settings are unchanged.', 'lieve-builder' ); ?>"<?php echo strtolower( $settings['accent_start'] ) === lieve_theme_settings_defaults()['accent_start'] && strtolower( $settings['accent_end'] ) === lieve_theme_settings_defaults()['accent_end'] ? ' disabled' : ''; ?>><?php esc_html_e( 'Reset colors to defaults', 'lieve-builder' ); ?></button></header>
					<?php foreach ( array( 'accent_start' => __( 'Gradient start', 'lieve-builder' ), 'accent_end' => __( 'Gradient end', 'lieve-builder' ) ) as $key => $label ) : ?>
						<div class="lieve-settings-row"><label for="lieve-setting-<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $label ); ?></label><div class="lieve-ds-field lieve-settings-value lieve-settings-color"><button type="button" data-setting-swatch="<?php echo esc_attr( $key ); ?>" aria-label="<?php echo esc_attr( sprintf( __( 'Choose %s color', 'lieve-builder' ), strtolower( $label ) ) ); ?>"></button><input id="lieve-setting-<?php echo esc_attr( $key ); ?>" data-setting data-setting-color="<?php echo esc_attr( $key ); ?>" data-setting-default="<?php echo esc_attr( lieve_theme_settings_defaults()[ $key ] ); ?>" name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION . '[' . $key . ']' ); ?>" type="text" required pattern="#[a-fA-F0-9]{3}([a-fA-F0-9]{3})?" maxlength="7" spellcheck="false" autocomplete="off" placeholder="<?php echo esc_attr( lieve_theme_settings_defaults()[ $key ] ); ?>" value="<?php echo esc_attr( $settings[ $key ] ); ?>"></div></div>
					<?php endforeach; ?>
					<div class="lieve-settings-row"><div><strong><?php esc_html_e( 'Gradient preview', 'lieve-builder' ); ?></strong><p><?php esc_html_e( 'Preview changes here before saving them to your site.', 'lieve-builder' ); ?></p></div><div class="lieve-settings-value lieve-settings-gradient" data-setting-gradient aria-label="<?php esc_attr_e( 'Interface gradient preview', 'lieve-builder' ); ?>" style="background:<?php echo esc_attr( 'linear-gradient(90deg,' . $settings['accent_start'] . ',' . $settings['accent_end'] . ')' ); ?>"></div></div>
				</section>
				<section class="lieve-settings-panel" role="tabpanel" id="lieve-settings-panel-markup" aria-labelledby="lieve-settings-tab-markup" tabindex="0"<?php echo 'markup' !== $active ? ' hidden' : ''; ?>>
					<header class="lieve-settings-section-head"><h2 id="lieve-settings-markup-title"><?php esc_html_e( 'Markup defaults', 'lieve-builder' ); ?></h2><p><?php esc_html_e( 'Control the published attributes of builder elements and the page shell. Page and element overrides remain available in the builder.', 'lieve-builder' ); ?></p></header>
					<section class="lieve-settings-group" aria-labelledby="lieve-settings-identifiers-title"><header class="lieve-settings-section-head"><h3 id="lieve-settings-identifiers-title"><?php esc_html_e( 'Element identifiers', 'lieve-builder' ); ?></h3><p><?php esc_html_e( 'Set the default output for builder elements site-wide. Each element can override these choices in its Markup tab or reset to the global setting. Raw HTML without a wrapper stays unchanged.', 'lieve-builder' ); ?></p></header>
					<?php foreach ( array( 'output_html_ids' => array( 'Output HTML IDs', 'Publish automatic IDs as lieve-{number}, or the custom ID defined on an element.' ), 'output_data_ids' => array( 'Output data-lieve-id', 'Publish data-lieve-id="lieve-data-{number}". Required styling and interactive hooks remain available when identifiers are disabled.' ) ) as $key => $copy ) : ?>
					<div class="lieve-settings-row"><div class="lieve-settings-row-copy"><label for="lieve-setting-<?php echo esc_attr( $key ); ?>"><?php echo esc_html( __( $copy[0], 'lieve-builder' ) ); ?></label><p id="lieve-setting-<?php echo esc_attr( $key ); ?>-help"><?php echo esc_html( __( $copy[1], 'lieve-builder' ) ); ?></p></div><div class="lieve-settings-value"><input type="hidden" name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION . '[' . $key . ']' ); ?>" value="0"><label class="lieve-settings-popup-control"><span class="lieve-settings-popup-switch"><input type="checkbox" role="switch" data-setting id="lieve-setting-<?php echo esc_attr( $key ); ?>" name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION . '[' . $key . ']' ); ?>" value="1" aria-describedby="lieve-setting-<?php echo esc_attr( $key ); ?>-help" <?php checked( $settings[ $key ] ); ?>><span class="lieve-template-toggle-track" aria-hidden="true"></span></span><span><?php esc_html_e( 'Enabled by default', 'lieve-builder' ); ?></span></label></div></div>
					<?php endforeach; ?>
					</section>
					<?php lieve_render_output_class_settings( $settings ); ?>
				</section>
				<section class="lieve-settings-panel" role="tabpanel" id="lieve-settings-panel-head" aria-labelledby="lieve-settings-tab-head" tabindex="0"<?php echo 'head' !== $active ? ' hidden' : ''; ?>><?php lieve_head_settings_panel( $settings ); ?></section>
				<section class="lieve-settings-panel" role="tabpanel" id="lieve-settings-panel-performance" aria-labelledby="lieve-settings-tab-performance" tabindex="0"<?php echo 'performance' !== $active ? ' hidden' : ''; ?>>
					<header class="lieve-settings-section-head"><h2><?php esc_html_e( 'Asset loading', 'lieve-builder' ); ?></h2><p><?php esc_html_e( 'Choose how generated styles and local fonts reach your visitors. Your editor and authored styles stay unchanged.', 'lieve-builder' ); ?></p></header>
					<section class="lieve-settings-group" aria-labelledby="lieve-settings-css-title"><header class="lieve-settings-section-head"><h3 id="lieve-settings-css-title"><?php esc_html_e( 'Generated CSS', 'lieve-builder' ); ?></h3></header>
					<div class="lieve-settings-row"><div><label id="lieve-setting-css-label" for="lieve-setting-css_loading_method"><?php esc_html_e( 'CSS loading method', 'lieve-builder' ); ?></label><p id="lieve-setting-css-help"><?php esc_html_e( 'Choose how generated element styles are delivered on the frontend.', 'lieve-builder' ); ?></p></div><div class="lieve-ds-field lieve-settings-value lieve-settings-select">
						<noscript><style>.lieve-settings-select select{display:block!important}.lieve-settings-select .lieve-ds-select-trigger{display:none!important}</style></noscript>
						<select id="lieve-setting-css_loading_method" data-setting data-settings-select name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION ); ?>[css_loading_method]" aria-label="<?php esc_attr_e( 'CSS loading method', 'lieve-builder' ); ?>" aria-describedby="lieve-setting-css-help">
							<?php $css_methods = array( 'inline' => 'Inline', 'external' => 'External Files', 'internal' => 'Internal CSS' ); foreach ( $css_methods as $value => $label ) : ?><option value="<?php echo esc_attr( $value ); ?>"<?php echo $settings['css_loading_method'] === $value ? ' selected' : ''; ?>><?php echo esc_html( $label ); ?></option><?php endforeach; ?>
						</select><button type="button" class="lieve-ds-select-trigger" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="lieve-setting-css-label lieve-setting-css-value"><span id="lieve-setting-css-value"><?php echo esc_html( $css_methods[ $settings['css_loading_method'] ] ); ?></span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
					</div></div>
					<details class="lieve-ds-color-section lieve-settings-explanation"><summary><strong><?php esc_html_e( 'Compare CSS loading methods', 'lieve-builder' ); ?></strong><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></summary><div class="lieve-ds-color-section-body"><dl class="lieve-settings-methods"><div><dt><?php esc_html_e( 'Inline', 'lieve-builder' ); ?></dt><dd><?php esc_html_e( 'Writes base element styles directly into HTML style attributes.', 'lieve-builder' ); ?></dd></div><div><dt><?php esc_html_e( 'Internal CSS', 'lieve-builder' ); ?></dt><dd><?php esc_html_e( 'Embeds generated styles in style tags.', 'lieve-builder' ); ?></dd></div><div><dt><?php esc_html_e( 'External Files', 'lieve-builder' ); ?></dt><dd><?php esc_html_e( 'Uses reusable, versioned CSS files.', 'lieve-builder' ); ?></dd></div></dl><p class="lieve-ds-help"><?php esc_html_e( 'Inline still needs internal CSS for breakpoints, states, pseudo-elements, widget sub-elements and global declarations such as variables and font faces. Theme/plugin asset files and editor previews are unaffected.', 'lieve-builder' ); ?></p></div></details></section>
					<section class="lieve-settings-group" aria-labelledby="lieve-settings-fonts-title"><header class="lieve-settings-section-head"><h3 id="lieve-settings-fonts-title"><?php esc_html_e( 'Local fonts', 'lieve-builder' ); ?></h3></header>
					<input type="hidden" name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION ); ?>[preload_fonts]" value="0">
					<div class="lieve-settings-row"><div><label for="lieve-setting-preload_fonts"><?php esc_html_e( 'Preload Fonts', 'lieve-builder' ); ?></label><p id="lieve-setting-fonts-help"><?php esc_html_e( 'Start loading up to two font files marked for preload in Fonts. This can reduce FOUT (a flash of fallback text), but does not change font-display or guarantee its removal.', 'lieve-builder' ); ?> <a href="<?php echo esc_url( admin_url( 'admin.php?page=lieve-fonts' ) ); ?>"><?php esc_html_e( 'Choose files in Fonts', 'lieve-builder' ); ?></a></p></div><label class="lieve-settings-popup-control lieve-settings-value"><span class="lieve-settings-popup-switch"><input id="lieve-setting-preload_fonts" data-setting name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION ); ?>[preload_fonts]" type="checkbox" role="switch" value="1" aria-describedby="lieve-setting-fonts-help" <?php checked( $settings['preload_fonts'] ); ?>><span class="lieve-template-toggle-track" aria-hidden="true"></span></span><span><?php esc_html_e( 'Preload selected font files', 'lieve-builder' ); ?></span></label></div>
				</section>
				</section>
				<section class="lieve-settings-panel" role="tabpanel" id="lieve-settings-panel-system" aria-labelledby="lieve-settings-tab-system" tabindex="0"<?php echo 'system' !== $active ? ' hidden' : ''; ?>>
					<header class="lieve-settings-section-head"><h2 id="lieve-settings-system-title"><?php esc_html_e( 'System & security', 'lieve-builder' ); ?></h2><p><?php esc_html_e( 'Manage trusted code execution and review this installation. These controls do not change editor content.', 'lieve-builder' ); ?></p></header>
					<section class="lieve-settings-group" aria-labelledby="lieve-settings-code-title"><header class="lieve-settings-section-head"><h3 id="lieve-settings-code-title"><?php esc_html_e( 'Custom Code', 'lieve-builder' ); ?></h3></header>
					<div class="lieve-settings-row lieve-settings-code-row"><div class="lieve-settings-row-copy"><label for="lieve-setting-execute_php"><?php esc_html_e( 'PHP execution', 'lieve-builder' ); ?></label><p id="lieve-setting-php-help"><?php esc_html_e( 'Enable PHP in Custom Code on the site and in live canvas previews. Trusted code has full server access and may execute repeatedly while editing. Off by default; code-administrator permissions and host policy are required.', 'lieve-builder' ); ?></p></div><div class="lieve-settings-value"><input type="hidden" name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION ); ?>[execute_php]" value="<?php echo ! lieve_can_author_custom_code() && ! empty( $settings['execute_php'] ) ? '1' : '0'; ?>"><label class="lieve-settings-popup-control"><span class="lieve-settings-popup-switch"><input id="lieve-setting-execute_php" data-setting name="<?php echo esc_attr( LIEVE_SETTINGS_OPTION ); ?>[execute_php]" type="checkbox" role="switch" value="1" aria-describedby="lieve-setting-php-help" <?php checked( ! empty( $settings['execute_php'] ) ); ?><?php disabled( ! lieve_can_author_custom_code() ); ?>><span class="lieve-template-toggle-track" aria-hidden="true"></span></span><span><?php esc_html_e( 'Execute PHP', 'lieve-builder' ); ?></span></label></div></div></section>
					<section class="lieve-settings-group" aria-labelledby="lieve-settings-installation-title"><header class="lieve-settings-section-head"><h3 id="lieve-settings-installation-title"><?php esc_html_e( 'Installation details', 'lieve-builder' ); ?></h3></header><p class="lieve-settings-group-help"><?php esc_html_e( 'Read-only details about this installation. Use Site Health for diagnostics and recommendations.', 'lieve-builder' ); ?></p>
					<dl class="lieve-settings-system"><?php foreach ( array( __( 'LieveBuilder', 'lieve-builder' ) => LIEVE_VERSION, __( 'WordPress', 'lieve-builder' ) => get_bloginfo( 'version' ), 'PHP' => PHP_VERSION, __( 'Environment', 'lieve-builder' ) => wp_get_environment_type() ) as $label => $value ) : ?><div><dt><?php echo esc_html( $label ); ?></dt><dd><?php echo esc_html( $value ); ?></dd></div><?php endforeach; ?></dl>
					<a class="lieve-conditions-cancel" href="<?php echo esc_url( admin_url( 'site-health.php' ) ); ?>"><?php esc_html_e( 'Open Site Health', 'lieve-builder' ); ?></a>
				</section>
					<?php if ( function_exists( 'lieve_render_theme_updates_settings' ) ) { lieve_render_theme_updates_settings(); } ?>
				</section>
				<footer class="lieve-ds-footer"><span role="status" aria-live="polite" data-settings-status><?php esc_html_e( 'All changes saved.', 'lieve-builder' ); ?></span><button type="button" class="lieve-conditions-cancel" data-settings-cancel hidden><?php esc_html_e( 'Cancel', 'lieve-builder' ); ?></button><div class="lieve-save-control"><button class="lieve-conditions-save" type="submit" data-settings-save aria-keyshortcuts="Control+s Meta+s" aria-describedby="lieve-settings-shortcut"><?php esc_html_e( 'Save Settings', 'lieve-builder' ); ?></button><span class="lieve-save-shortcut" id="lieve-settings-shortcut"><kbd>⌘S</kbd><span aria-hidden="true"> / </span><kbd>Ctrl+S</kbd></span></div></footer>
			</div>
		</form>
	</div>
	<?php
}

/**
 * Build the saved public-theme settings independently of their delivery method.
 */
function lieve_theme_settings_css() {
	$settings = lieve_theme_settings();
	$css      = sprintf(
		':root{--lieve-content:%1$dpx;--lieve-wide:%2$dpx;--lieve-accent:%3$s;--lieve-gradient:linear-gradient(90deg,%3$s 0%%,%4$s 100%%);%6$s}:is(.lieve-popup-dialog,[data-lieve-ui="popup-dialog"]){width:min(%5$dpx,100%%)}',
		(int) $settings['content_width'],
		(int) $settings['wide_width'],
		$settings['accent_start'],
		$settings['accent_end'],
		(int) $settings['popup_width'],
		lieve_interface_color_tokens( $settings )
	);
	return $css;
}

function lieve_output_theme_settings_css() {
	if ( function_exists( 'lieve_enqueue_generated_css' ) ) { lieve_enqueue_generated_css( 'lieve-generated-settings', lieve_theme_settings_css() ); }
	else { wp_add_inline_style( 'lieve-style', lieve_theme_settings_css() ); }
}
add_action( 'wp_enqueue_scripts', 'lieve_output_theme_settings_css', 20 );

/** Opaque HEX primitives plus RGB channels preserve every UI state's original opacity. */
function lieve_interface_color_tokens( $settings = null ) {
	$settings = null === $settings ? lieve_theme_settings() : $settings;
	$defaults = lieve_theme_settings_defaults(); $tokens = array();
	foreach ( array( 'start', 'end' ) as $stop ) {
		$value = $settings[ 'accent_' . $stop ] ?? '';
		$hex = ( is_string( $value ) ? sanitize_hex_color( $value ) : '' ) ?: $defaults[ 'accent_' . $stop ];
		$full = substr( $hex, 1 ); if ( 3 === strlen( $full ) ) { $full = preg_replace( '/(.)/', '$1$1', $full ); }
		$rgb = array_map( 'hexdec', str_split( $full, 2 ) );
		$tokens[] = '--lieve-accent-' . $stop . ':' . strtolower( $hex );
		$tokens[] = '--lieve-accent-' . $stop . '-rgb:' . implode( ',', $rgb );
	}
	return implode( ';', $tokens );
}

/** Only namespaced variables are global; existing Lieve controls consume them locally. */
function lieve_output_interface_settings_css() {
	wp_add_inline_style( 'lieve-brand', ':root{' . lieve_interface_color_tokens() . '}' );
}
add_action( 'admin_enqueue_scripts', 'lieve_output_interface_settings_css', 20 );
