<?php
/** Global, allowlisted output-class choices. @package LieveBuilder */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Classes introduced after the first catalogue stay enabled for older saved rules. */
function lieve_output_body_additional_defaults() {
	$theme = function_exists( 'get_template' ) ? sanitize_html_class( get_template() ) : 'lieve-builder';
	return array( 'wp-embed-responsive', 'theme-' . $theme );
}

/** One catalogue drives settings, validation and rendering. Dynamic WP classes use groups. */
function lieve_output_class_catalog() {
	static $catalog;
	if ( isset( $catalog ) ) { return $catalog; }
	$catalog = array();
	$add = static function( $id, $label, $group, $classes ) use ( &$catalog ) {
		$catalog[ $id ] = array( 'label' => $label, 'group' => $group, 'classes' => array_combine( $classes, $classes ) );
	};
	$add( 'body', 'Body', 'Page shell', array( 'lieve-canvas-page' ) );
	$catalog['body']['classes'] += array( 'wp:context' => 'WordPress · page / archive context', 'wp:template' => 'WordPress · template names', 'wp:id' => 'WordPress · content IDs', 'wp:terms' => 'WordPress · taxonomy / author', 'wp:pagination' => 'WordPress · pagination', 'wp:theme' => 'WordPress · theme names', 'wp:user' => 'WordPress · logged-in / logo markers' );
	foreach ( lieve_output_body_additional_defaults() as $class ) { $catalog['body']['classes'][ $class ] = $class; }
	$add( 'main', 'Main', 'Page shell', array( 'lieve-canvas-main', 'lieve-builder-content' ) );
	$add( 'header', 'Header', 'Page shell', array( 'lieve-template-area', 'lieve-template-header-area', 'lieve-builder-content' ) );
	$add( 'footer', 'Footer', 'Page shell', array( 'lieve-template-area', 'lieve-template-footer-area', 'lieve-builder-content' ) );
	$add( 'document', 'Standalone document scope', 'Page shell', array( 'lieve-builder-content' ) );
	$add( 'elements', 'All builder elements', 'Builder', array( 'lieve-element' ) );
	foreach ( array( 'standard-content' => 'Standard content', 'wide-content' => 'Archive / search container', 'entry-title' => 'Entry title', 'entry-content' => 'Entry content', 'entry-meta' => 'Entry metadata', 'featured-image' => 'Featured image container', 'post-card' => 'Post card', 'empty-state' => 'Error page', 'archive-heading' => 'Archive heading' ) as $key => $label ) {
		$classes = 'empty-state' === $key ? array( 'lieve-standard-content', 'lieve-empty-state' ) : array( 'lieve-' . $key );
		$add( $key, $label, 'Native content', $classes );
	}
	foreach ( array( 'popup' => 'Pop Up', 'popup-dialog' => 'Pop Up dialog', 'popup-backdrop' => 'Pop Up backdrop', 'popup-close' => 'Pop Up close button' ) as $key => $label ) {
		$add( $key, $label, 'Pop Ups', 'popup-dialog' === $key ? array( 'lieve-popup-dialog', 'lieve-builder-content' ) : array( 'lieve-' . $key ) );
	}
	$catalog['post']['label'] = 'WordPress posts'; $catalog['post']['group'] = 'WordPress';
	$catalog['post']['classes'] = array( 'wp:id' => 'WordPress · post IDs', 'wp:type' => 'WordPress · post type', 'wp:status' => 'WordPress · status', 'wp:format' => 'WordPress · format', 'wp:terms' => 'WordPress · taxonomy terms', 'wp:markers' => 'WordPress · hentry / sticky / thumbnail / password' );
	foreach ( array( 'menu' => 'Menu items', 'page-list' => 'Page list items', 'category-list' => 'Category list items', 'wp-image' => 'WordPress images' ) as $key => $label ) {
		$catalog[ $key ] = array( 'label' => $label, 'group' => 'WordPress', 'classes' => array( 'wp:metadata' => 'WordPress · automatic metadata' ) );
	}
	$registry = function_exists( 'lieve_element_registry' ) ? lieve_element_registry() : array();
	foreach ( $registry as $type => $definition ) {
		$add( 'element-' . $type, $definition['label'], 'Elements · ' . $definition['group'], 'template' === $type ? array( 'lieve-template', 'lieve-builder-content' ) : array( 'lieve-' . $type ) );
	}
	return $catalog;
}

/** Reject invalid CSS tokens instead of turning malformed names into different classes. */
function lieve_sanitize_output_custom_classes( $value ) {
	if ( ! is_string( $value ) ) { return ''; }
	$tokens = preg_split( '/[\s,]+/', substr( $value, 0, 4000 ), -1, PREG_SPLIT_NO_EMPTY );
	$tokens = array_filter( $tokens, static function( $token ) { return strlen( $token ) <= 100 && preg_match( '/^(?:--|[a-zA-Z_]|-[a-zA-Z_])[a-zA-Z0-9_-]*$/D', $token ); } );
	return implode( ' ', array_slice( array_unique( $tokens ), 0, 30 ) );
}

function lieve_sanitize_output_class_settings( $input ) {
	if ( ! is_array( $input ) ) { return array(); }
	$output = array();
	foreach ( lieve_output_class_catalog() as $target => $definition ) {
		if ( ! isset( $input[ $target ] ) || ! is_array( $input[ $target ] ) ) { continue; }
		$row = $input[ $target ];
		$selected = isset( $row['defaults'] ) && is_array( $row['defaults'] ) ? $row['defaults'] : array();
		if ( 'body' === $target && (int) ( $row['version'] ?? 1 ) < 2 ) { $selected = array_merge( $selected, lieve_output_body_additional_defaults() ); }
		$output[ $target ] = array( 'defaults' => array_values( array_filter( array_keys( $definition['classes'] ), static function( $class ) use ( $selected ) { return in_array( $class, $selected, true ); } ) ), 'custom' => lieve_sanitize_output_custom_classes( $row['custom'] ?? '' ) );
		if ( 'body' === $target ) { $output[ $target ]['version'] = 2; }
	}
	return $output;
}

/** Missing rows inherit the previous cleanup toggle without changing existing sites. */
function lieve_output_class_rule( $target, $settings = null ) {
	$catalog = lieve_output_class_catalog();
	if ( ! isset( $catalog[ $target ] ) ) { return array( 'defaults' => array(), 'custom' => '' ); }
	if ( null === $settings ) {
		$raw = get_option( 'lieve_theme_settings', array() );
		static $previous, $normalized;
		if ( ! isset( $normalized ) || $previous !== $raw ) { $previous = $raw; $normalized = is_array( $raw ) ? $raw : array(); $normalized['output_classes'] = lieve_sanitize_output_class_settings( $normalized['output_classes'] ?? array() ); }
		$settings = $normalized;
	}
	if ( isset( $settings['output_classes'][ $target ] ) ) { return $settings['output_classes'][ $target ]; }
	$defaults = array_keys( $catalog[ $target ]['classes'] );
	if ( ! empty( $settings['remove_wp_classes'] ) ) { $defaults = array_values( array_filter( $defaults, static function( $class ) { return 0 !== strpos( $class, 'wp:' ); } ) ); }
	return array( 'defaults' => $defaults, 'custom' => '' );
}

function lieve_output_class_enabled( $target, $class ) { return in_array( $class, lieve_output_class_rule( $target )['defaults'], true ); }

/** Only defaults actually emitted for this context are eligible; no wrappers are added. */
function lieve_output_classes( $target, $defaults, $custom = '' ) {
	$catalog = lieve_output_class_catalog(); $rule = lieve_output_class_rule( $target );
	$classes = is_array( $defaults ) ? $defaults : preg_split( '/\s+/', $defaults, -1, PREG_SPLIT_NO_EMPTY );
	$classes = array_values( array_filter( $classes, static function( $class ) use ( $catalog, $target, $rule ) { return ! isset( $catalog[ $target ]['classes'][ $class ] ) || in_array( $class, $rule['defaults'], true ); } ) );
	return implode( ' ', array_unique( array_merge( $classes, preg_split( '/\s+/', trim( $rule['custom'] . ' ' . $custom ), -1, PREG_SPLIT_NO_EMPTY ) ) ) );
}

/** Preserve required CSS scopes/Pop Up behavior with non-class technical hooks. */
function lieve_output_class_attributes( $target, $defaults ) {
	$classes = lieve_output_classes( $target, $defaults );
	$output = '' !== $classes ? ' class="' . esc_attr( $classes ) . '"' : '';
	if ( in_array( 'lieve-builder-content', preg_split( '/\s+/', $defaults ), true ) && ! in_array( 'lieve-builder-content', explode( ' ', $classes ), true ) ) { $output .= ' data-lieve-scope="builder"'; }
	if ( in_array( $target, array( 'popup', 'popup-dialog', 'popup-backdrop', 'popup-close' ), true ) && ! in_array( 'lieve-' . $target, explode( ' ', $classes ), true ) ) { $output .= ' data-lieve-ui="' . esc_attr( $target ) . '"'; }
	return $output;
}

function lieve_output_select_trigger( $label, $summary ) {
	return '<button type="button" class="lieve-ds-select-trigger" data-output-trigger aria-haspopup="listbox" aria-expanded="false" aria-label="' . esc_attr( $label ) . '"><span>' . esc_html( $summary ) . '</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>';
}

/** Explain dynamic WordPress groups without storing page-specific class names. */
function lieve_output_class_description( $target, $class ) {
	if ( 'wp-embed-responsive' === $class ) { return __( 'WordPress responsive embed sizing. Disable only if your own styles replace it.', 'lieve-builder' ); }
	if ( in_array( $class, lieve_output_body_additional_defaults(), true ) ) { return __( 'Theme marker added by WooCommerce when active.', 'lieve-builder' ); }
	$examples = array(
		'wp:context' => 'e.g. home, page, single, archive, search-results',
		'wp:template' => 'e.g. page-template-default, page-template-custom',
		'wp:id' => 'post' === $target ? 'e.g. post-123' : 'e.g. page-id-123, postid-123',
		'wp:terms' => 'post' === $target ? 'e.g. category-news, tag-featured' : 'e.g. category-news, author-name, term-example',
		'wp:pagination' => 'e.g. paged, page-paged-2',
		'wp:theme' => 'e.g. wp-theme-lieve-builder',
		'wp:user' => 'logged-in, wp-custom-logo',
		'wp:type' => 'e.g. post, type-post, type-page',
		'wp:status' => 'e.g. status-publish',
		'wp:format' => 'e.g. format-standard, format-gallery',
		'wp:markers' => 'e.g. hentry, sticky, has-post-thumbnail',
	);
	$metadata = array(
		'menu' => 'e.g. menu-item, menu-item-123, menu-item-type-post_type',
		'page-list' => 'e.g. page_item, page-item-123',
		'category-list' => 'e.g. cat-item, cat-item-123',
		'wp-image' => 'e.g. wp-image-123, size-full, attachment-full',
	);
	return 'wp:metadata' === $class ? ( $metadata[ $target ] ?? '' ) : ( $examples[ $class ] ?? '' );
}

/** Document functional classes instead of pretending every Inspector token is optional. */
function lieve_output_preserved_classes( $target ) {
	$classes = array(
		'body' => array( 'rtl' => 'Right-to-left layout', 'admin-bar' => 'WordPress toolbar spacing', 'custom-background' => 'WordPress custom background', 'customize-support / no-customize-support' => 'WordPress Customizer state' ),
		'menu' => array( 'menu-item-has-children' => 'Submenu behavior', 'current-menu-* / current_page_*' => 'Current navigation state' ),
		'page-list' => array( 'page_item_has_children / current_page_*' => 'Hierarchy and current navigation state' ),
		'category-list' => array( 'current-cat / current-cat-parent' => 'Current category state' ),
		'wp-image' => array( 'alignleft / alignright / aligncenter / alignwide / alignfull' => 'Authored alignment', 'wp-block-*' => 'Gutenberg block styles and behavior' ),
		'post' => array( 'product / instock / outofstock / sale / product-type-*' => 'WooCommerce product state, when active' ),
	);
	if ( 'body' === $target && function_exists( 'WC' ) ) {
		$classes['body']['woocommerce-no-js → woocommerce-js'] = 'WooCommerce replaces this class in the browser when JavaScript runs';
		$classes['body']['woocommerce / woocommerce-page / woocommerce-*'] = 'Store, cart, checkout and account behavior';
	}
	return $classes[ $target ] ?? array();
}

/** SSR controls: the selected target is visible immediately, all values submit together. */
function lieve_render_output_class_settings( $settings ) {
	$catalog = lieve_output_class_catalog();
	$rules = array(); $all_default = true;
	foreach ( $catalog as $target => $definition ) {
		$rules[ $target ] = lieve_output_class_rule( $target, $settings );
		$all_default = $all_default && count( $rules[ $target ]['defaults'] ) === count( $definition['classes'] ) && '' === $rules[ $target ]['custom'];
	}
	$page_ids = lieve_page_markup_normalize( $settings['output_ids'] ?? array(), true );
	$all_default = $all_default && $page_ids === lieve_page_markup_normalize( array(), true );
	?>
	<section class="lieve-settings-output" aria-labelledby="lieve-output-title" data-output-manager>
		<header class="lieve-settings-section-head lieve-settings-output-head">
			<div><h3 id="lieve-output-title"><?php esc_html_e( 'Output classes & IDs', 'lieve-builder' ); ?></h3><p><?php esc_html_e( 'Choose an element to manage its classes. Body and Main also include page-level HTML IDs. Save Settings applies your changes across the site.', 'lieve-builder' ); ?></p></div>
			<button type="button" class="lieve-conditions-cancel" data-output-reset-all title="<?php esc_attr_e( 'Restore default classes and page IDs for every element. Other Settings tabs are unchanged. Save Settings to apply, or Cancel to undo.', 'lieve-builder' ); ?>"<?php echo $all_default ? ' disabled' : ''; ?>><?php esc_html_e( 'Reset all to defaults', 'lieve-builder' ); ?></button>
		</header>
		<div class="lieve-settings-output-target lieve-ds-field"><label for="lieve-output-target"><?php esc_html_e( 'Element', 'lieve-builder' ); ?></label><select id="lieve-output-target" data-output-target aria-label="Element">
		<?php $group = ''; foreach ( $catalog as $target => $definition ) : if ( $group !== $definition['group'] ) : if ( '' !== $group ) { echo '</optgroup>'; } $group = $definition['group']; ?><optgroup label="<?php echo esc_attr( $group ); ?>"><?php endif; ?><option value="<?php echo esc_attr( $target ); ?>"><?php echo esc_html( $definition['label'] ); ?></option><?php endforeach; ?></optgroup></select><?php echo lieve_output_select_trigger( 'Element', 'Body' ); ?></div>
		<?php foreach ( $catalog as $target => $definition ) : $rule = $rules[ $target ]; $id = 'lieve-output-' . $target; $prefix = LIEVE_SETTINGS_OPTION . '[output_classes][' . $target . ']'; ?>
		<div data-output-row="<?php echo esc_attr( $target ); ?>" data-output-label="<?php echo esc_attr( $definition['label'] ); ?>"<?php echo 'body' !== $target ? ' hidden' : ''; ?>>
			<header class="lieve-settings-element-head">
				<h3><?php echo esc_html( $definition['label'] ); ?></h3>
				<button type="button" class="lieve-conditions-cancel" data-output-reset aria-label="<?php echo esc_attr( sprintf( __( 'Reset %s to defaults', 'lieve-builder' ), $definition['label'] ) ); ?>" title="<?php esc_attr_e( 'Restore default classes and the page ID for this element. Save Settings to apply.', 'lieve-builder' ); ?>"<?php echo count( $rule['defaults'] ) === count( $definition['classes'] ) && '' === $rule['custom'] && ( ! isset( $page_ids[$target] ) || $page_ids[$target] === array( 'enabled' => true, 'custom' => '' ) ) ? ' disabled' : ''; ?>><?php esc_html_e( 'Reset to defaults', 'lieve-builder' ); ?></button>
			</header>
			<?php lieve_render_page_id_settings( $target, $settings ); ?>
			<fieldset class="lieve-settings-defaults">
				<legend><?php esc_html_e( 'Default classes', 'lieve-builder' ); ?></legend>
				<p id="<?php echo esc_attr( $id . '-help' ); ?>"><?php esc_html_e( 'Enabled classes are included in the output. WordPress groups apply only when relevant to the current page.', 'lieve-builder' ); ?></p>
				<input type="hidden" name="<?php echo esc_attr( $prefix ); ?>[defaults][]" value="">
				<?php if ( 'body' === $target ) : ?><input type="hidden" name="<?php echo esc_attr( $prefix ); ?>[version]" value="2"><?php endif; ?>
				<select multiple data-setting data-output-defaults id="<?php echo esc_attr( $id . '-defaults' ); ?>" name="<?php echo esc_attr( $prefix ); ?>[defaults][]" aria-describedby="<?php echo esc_attr( $id . '-help' ); ?>" aria-label="<?php echo esc_attr( $definition['label'] . ' default classes' ); ?>">
					<?php foreach ( $definition['classes'] as $class => $label ) : ?><option value="<?php echo esc_attr( $class ); ?>"<?php echo in_array( $class, $rule['defaults'], true ) ? ' selected' : ''; ?>><?php echo esc_html( $label ); ?></option><?php endforeach; ?>
				</select>
				<div class="lieve-settings-class-list">
					<?php foreach ( $definition['classes'] as $class => $label ) : $description = lieve_output_class_description( $target, $class ); ?>
					<label class="lieve-settings-class-option">
						<span class="lieve-settings-class-label"><?php if ( 0 === strpos( $class, 'wp:' ) ) : ?><span><?php echo esc_html( $label ); ?></span><?php else : ?><code><?php echo esc_html( $class ); ?></code><?php endif; ?><?php if ( $description ) : ?><small><?php echo esc_html( $description ); ?></small><?php endif; ?></span>
						<span class="lieve-settings-popup-switch"><input type="checkbox" role="switch" data-output-toggle="<?php echo esc_attr( $class ); ?>" aria-label="<?php echo esc_attr( $definition['label'] . ': ' . $label ); ?>" <?php checked( in_array( $class, $rule['defaults'], true ) ); ?>><span class="lieve-template-toggle-track" aria-hidden="true"></span></span>
					</label>
					<?php endforeach; ?>
				</div>
			</fieldset>
			<div class="lieve-settings-custom lieve-ds-field lieve-settings-value">
				<label for="<?php echo esc_attr( $id . '-custom' ); ?>"><?php esc_html_e( 'Custom classes', 'lieve-builder' ); ?></label>
				<input type="text" data-setting data-output-custom id="<?php echo esc_attr( $id . '-custom' ); ?>" name="<?php echo esc_attr( $prefix ); ?>[custom]" value="<?php echo esc_attr( $rule['custom'] ); ?>" maxlength="3029" pattern="\s*(?:(?:--|[a-zA-Z_]|-[a-zA-Z_])[a-zA-Z0-9_\-]{0,98}(?:\s+(?:--|[a-zA-Z_]|-[a-zA-Z_])[a-zA-Z0-9_\-]{0,98}){0,29})?\s*" placeholder="<?php esc_attr_e( 'e.g. site-shell theme-light', 'lieve-builder' ); ?>" spellcheck="false" autocomplete="off" aria-label="<?php echo esc_attr( $definition['label'] . ' custom classes' ); ?>" aria-describedby="<?php echo esc_attr( $id . '-custom-help' ); ?>">
				<p id="<?php echo esc_attr( $id . '-custom-help' ); ?>"><?php esc_html_e( 'Add class names separated by spaces, without dots. Leave empty for no custom classes.', 'lieve-builder' ); ?></p>
			</div>
			<?php if ( 0 === strpos( $target, 'element-' ) ) : ?><p class="lieve-settings-output-note"><?php esc_html_e( 'Shared classes from “All builder elements” also apply. Classes set directly in the editor stay unchanged.', 'lieve-builder' ); ?></p><?php endif; ?>
			<?php $preserved = lieve_output_preserved_classes( $target ); if ( $preserved ) : ?>
			<details class="lieve-ds-color-section lieve-settings-preserved">
				<summary><strong><?php esc_html_e( 'System classes that may also appear in Inspector', 'lieve-builder' ); ?></strong><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></summary>
				<div class="lieve-ds-color-section-body">
					<p class="lieve-ds-help"><?php esc_html_e( 'These classes are preserved for functionality. Plugin-generated classes and classes authored directly on an element are not removed by this manager.', 'lieve-builder' ); ?></p>
					<ul><?php foreach ( $preserved as $class => $reason ) : ?><li><code><?php echo esc_html( $class ); ?></code><span><?php echo esc_html( $reason ); ?></span></li><?php endforeach; ?></ul>
				</div>
			</details>
			<?php endif; ?>
		</div>
		<?php endforeach; ?>
		<p class="lieve-settings-output-note"><?php esc_html_e( 'Functional plugin classes and accessibility hooks are preserved. Removing theme classes may change native layouts. Raw HTML without a wrapper is not modified.', 'lieve-builder' ); ?></p>
		<p class="screen-reader-text" role="status" data-output-status></p>
		<noscript><style>[data-output-manager] [data-output-row][hidden]{display:block!important}[data-output-manager] select{display:block!important}[data-output-manager] [data-output-trigger],[data-output-manager] [data-output-reset],[data-output-manager] [data-output-reset-all],[data-output-manager] .lieve-settings-class-list{display:none!important}</style><p><?php esc_html_e( 'JavaScript is disabled. All element controls are shown below.', 'lieve-builder' ); ?></p></noscript>
	</section>
	<?php
}
