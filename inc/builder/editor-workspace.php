<?php
/** Workspace tools and per-user catalogue preferences. @package LieveBuilder */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Hand-drawn workspace glyphs on the existing 24-unit grid; chrome only. */
function lieve_workspace_icon( $name ) {
	$paths = array(
		'classes' => '<path d="m4 8 8-5 8 5-8 5-8-5Zm0 5 8 5 8-5M4 18l8 5 8-5"/>',
		'wordpress' => '<circle cx="12" cy="12" r="9"/><path fill="currentColor" stroke="none" d="M5.7 7.5h4.2v.8H8.85l2.25 6.65 1.65-4.8-.62-1.85h-1.05v-.8h4.1v.8h-1.03l2.22 6.55 1.12-3.32c.32-.95.39-1.55-.04-2.32-.31-.53-.69-1.05-.69-1.68 0-.8.56-1.36 1.24-1.36 1.11 0 1.49 1.16 1.28 2.46-.16.95-.69 2.15-1.12 3.37l-2.28 6.59h-.78l-2.41-6.86-2.44 6.86h-.78L6.78 8.3H5.7Z"/>',
		'conditions' => '<rect x="8.5" y="3" width="7" height="5" rx="1.7"/><path d="M12 8v3M6 15v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><rect x="3" y="15" width="6" height="6" rx="1.7"/><rect x="15" y="15" width="6" height="6" rx="1.7"/>',
		'breakpoints' => '<rect x="3" y="4" width="18" height="12" rx="2.2"/><path d="M8 20h4m-2-4v4"/><rect x="14" y="9" width="7" height="12" rx="1.8" fill="var(--lv-tool-surface, #fff)"/><path d="M16.7 11.4h1.6"/><circle cx="17.5" cy="18.7" r=".45" fill="currentColor" stroke="none"/>',
		'variables' => '<path d="M8 3.5H6.9c-1.4 0-2.2.9-2.2 2.3v3.1c0 1.5-.6 2.5-2.2 3.1 1.6.6 2.2 1.6 2.2 3.1v3.1c0 1.4.8 2.3 2.2 2.3H8m8-17h1.1c1.4 0 2.2.9 2.2 2.3v3.1c0 1.5.6 2.5 2.2 3.1-1.6.6-2.2 1.6-2.2 3.1v3.1c0 1.4-.8 2.3-2.2 2.3H16M10 9.2l4 5.6m0-5.6-4 5.6"/>',
		'colors' => '<g fill="var(--lv-tool-surface, #fff)"><rect x="12.5" y="3" width="6.5" height="16" rx="1.7" transform="rotate(-45 15.75 18)"/><rect x="12.5" y="3" width="6.5" height="16" rx="1.7" transform="rotate(-22.5 15.75 18)"/><rect x="12.5" y="3" width="6.5" height="16" rx="1.7"/></g><path d="M12.5 8h6.5m-6.5 5h6.5"/><circle cx="15.75" cy="16.3" r=".55" fill="currentColor" stroke="none"/>',
		'moon' => '<path d="M20.6 13.2A8.7 8.7 0 1 1 10.8 3.4a7 7 0 0 0 9.8 9.8Z"/><path d="m18.1 2.8.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7Z"/>',
		'sun' => '<circle cx="12" cy="12" r="4"/><path d="M12 2v1.9m5-.56-.95 1.65M20.66 7l-1.65.95M22 12h-1.9m.56 5-1.65-.95M17 20.66l-.95-1.65M12 22v-1.9m-5 .56.95-1.65M3.34 17l1.65-.95M2 12h1.9m-.56-5 1.65.95M7 3.34l.95 1.65"/>',
		'pin' => '<path d="M9 3h6M10 3v6l-3 3v2h10v-2l-3-3V3M12 14v7"/>',
		'close' => '<path d="m6 6 12 12M18 6 6 18"/>',
		'copy' => '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
		'paste' => '<rect x="8" y="3" width="8" height="4" rx="1.5"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 12h8m-8 4h5"/>',
		'trash' => '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
		'html' => '<path d="m8 8-4 4 4 4m8-8 4 4-4 4M14 4l-4 16"/>',
		'widgets' => '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
		'components' => '<rect x="3" y="3" width="7" height="7" rx="1.5"/><circle cx="17.5" cy="6.5" r="3.5"/><path d="m6.5 14 4 7h-8Z"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
		'interactive' => '<path d="m8 8 4.5 12 2.2-5.3 5.3-2.2Z M8 2v2M2 8h2m.5-3.5 1.4 1.4M14 4l-1.4 1.4M4 14l1.4-1.4"/>',
		'product' => '<path d="m12 3 9 5v9l-9 5-9-5V8Z M3 8l9 5 9-5M12 13v9M7.5 5.5l9 5"/>',
		'account' => '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/>',
		'checkout' => '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18m-14 5h3m4 2 2 2 4-4"/>',
	);
	return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . ( $paths[ $name ] ?? '' ) . '</svg>';
}

/** Category navigation uses the same SVG family as the editor controls. */
function lieve_element_category_icon( $group ) {
	$workspace = array( 'all' => 'widgets', 'pinned' => 'pin', 'General' => 'components', 'Interactive' => 'interactive', 'WordPress' => 'wordpress', 'WooCommerce · Product' => 'product', 'WooCommerce · Checkout' => 'checkout', 'WooCommerce · Account' => 'account' );
	if ( isset( $workspace[ $group ] ) ) { return lieve_workspace_icon( $workspace[ $group ] ); }
	$elements = array( 'Layout' => 'layout', 'Basic' => 'heading', 'Navigation' => 'menu', 'Media' => 'image', 'Forms' => 'form', 'Single' => 'file', 'Query' => 'filter', 'Advanced' => 'code', 'Integrations' => 'globe', 'WooCommerce · Store' => 'commerce' );
	return lieve_element_icon( $elements[ $group ] ?? 'layout' );
}

function lieve_sanitize_pinned_elements( $value ) {
	if ( ! is_array( $value ) ) { return array(); }
	$registry = lieve_element_registry(); $clean = array();
	foreach ( $value as $type ) {
		if ( is_string( $type ) && isset( $registry[ $type ] ) && ! in_array( $type, $clean, true ) ) { $clean[] = $type; }
	}
	return $clean;
}

function lieve_pinned_elements() {
	return lieve_sanitize_pinned_elements( get_user_meta( get_current_user_id(), '_lieve_pinned_elements', true ) );
}

/** Appearance belongs to the editor user, never to authored page content. */
function lieve_editor_color_mode() {
	return 'dark' === get_user_meta( get_current_user_id(), '_lieve_editor_color_mode', true ) ? 'dark' : 'light';
}

function lieve_rest_workspace_permissions() { return current_user_can( 'edit_posts' ); }
function lieve_rest_breakpoint_permissions() { return current_user_can( 'manage_options' ); }

function lieve_register_workspace_routes() {
	register_rest_route( 'lieve/v1', '/editor/pins', array( 'methods' => WP_REST_Server::EDITABLE, 'callback' => 'lieve_rest_save_pins', 'permission_callback' => 'lieve_rest_workspace_permissions' ) );
	register_rest_route( 'lieve/v1', '/editor/appearance', array( 'methods' => WP_REST_Server::EDITABLE, 'callback' => 'lieve_rest_save_appearance', 'permission_callback' => 'lieve_rest_workspace_permissions' ) );
	register_rest_route( 'lieve/v1', '/editor/breakpoints', array(
		array( 'methods' => WP_REST_Server::READABLE, 'callback' => 'lieve_rest_get_breakpoints', 'permission_callback' => 'lieve_rest_workspace_permissions' ),
		array( 'methods' => WP_REST_Server::EDITABLE, 'callback' => 'lieve_rest_save_breakpoints', 'permission_callback' => 'lieve_rest_breakpoint_permissions' ),
	) );
}
add_action( 'rest_api_init', 'lieve_register_workspace_routes' );

function lieve_rest_save_appearance( $request ) {
	$mode = $request->get_param( 'colorMode' );
	if ( ! in_array( $mode, array( 'light', 'dark' ), true ) ) { return new WP_Error( 'lieve_invalid_appearance', __( 'Choose light or dark editor appearance.', 'lieve-builder' ), array( 'status' => 400 ) ); }
	update_user_meta( get_current_user_id(), '_lieve_editor_color_mode', $mode );
	if ( $mode !== lieve_editor_color_mode() ) { return new WP_Error( 'lieve_appearance_not_saved', __( 'Editor appearance could not be saved. Please try again.', 'lieve-builder' ), array( 'status' => 500 ) ); }
	return rest_ensure_response( array( 'colorMode' => $mode ) );
}

function lieve_rest_save_pins( $request ) {
	$pins = $request->get_param( 'pinnedElements' );
	if ( ! is_array( $pins ) || count( $pins ) > count( lieve_element_registry() ) ) { return new WP_Error( 'lieve_invalid_pins', __( 'Invalid pinned elements.', 'lieve-builder' ), array( 'status' => 400 ) ); }
	$clean = lieve_sanitize_pinned_elements( $pins );
	update_user_meta( get_current_user_id(), '_lieve_pinned_elements', $clean );
	if ( $clean !== lieve_pinned_elements() ) { return new WP_Error( 'lieve_pins_not_saved', __( 'Pinned elements could not be saved. Please try again.', 'lieve-builder' ), array( 'status' => 500 ) ); }
	return rest_ensure_response( array( 'pinnedElements' => $clean ) );
}

function lieve_rest_get_breakpoints() {
	return rest_ensure_response( array( 'breakpoints' => lieve_breakpoint_definitions(), 'archivedBreakpoints' => lieve_breakpoint_archive(), 'breakpointRevision' => lieve_breakpoint_revision() ) );
}

/** Delete only the observed lock, never a replacement acquired by another writer. */
function lieve_release_breakpoint_lock( $value ) {
	global $wpdb;
	if ( isset( $wpdb ) ) {
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s", 'lieve_breakpoints_lock', $value ) );
		wp_cache_delete( 'lieve_breakpoints_lock', 'options' ); wp_cache_delete( 'notoptions', 'options' );
	} elseif ( get_option( 'lieve_breakpoints_lock', false ) === $value ) { delete_option( 'lieve_breakpoints_lock' ); }
}

function lieve_rest_save_breakpoints( $request ) {
	$lock = 'lieve_breakpoints_lock'; $previous = get_option( $lock, false );
	if ( $previous && time() - (int) explode( ':', (string) $previous )[0] > 120 ) { lieve_release_breakpoint_lock( $previous ); }
	$owner = time() . ':' . bin2hex( random_bytes( 16 ) );
	if ( ! add_option( $lock, $owner, '', false ) ) { return new WP_Error( 'lieve_breakpoints_busy', __( 'Another breakpoint save is in progress. Your draft is retained; try again in a moment.', 'lieve-builder' ), array( 'status' => 409 ) ); }
	try {
		// A writer may have completed after this request first read its options.
		if ( function_exists( 'wp_cache_delete' ) ) { wp_cache_delete( LIEVE_RESPONSIVE_OPTION, 'options' ); wp_cache_delete( 'alloptions', 'options' ); }
		return lieve_rest_save_breakpoints_locked( $request );
	} finally { lieve_release_breakpoint_lock( $owner ); }
}

function lieve_rest_save_breakpoints_locked( $request ) {
	$value = $request->get_param( 'breakpoints' );
	$current = lieve_breakpoint_definitions();
	$legacy = is_array( $value ) && isset( $value['tablet'] );
	if ( $legacy ) {
		// Older editor clients may update the two original widths, never replace custom contexts.
		if ( ! lieve_valid_breakpoints( $value ) || array_column( $current, 'id' ) !== array( 'desktop', 'tablet', 'mobile' ) || ! $current[0]['base'] ) { return new WP_Error( 'lieve_invalid_breakpoints', __( 'Reload the editor to manage the current responsive configuration.', 'lieve-builder' ), array( 'status' => 400 ) ); }
		$current[0]['width'] = max( $current[0]['width'], (int) $value['tablet'] + 1 );
		$current[1]['width'] = (int) $value['tablet']; $current[2]['width'] = (int) $value['mobile']; $value = $current;
	} else {
		$revision = $request->get_param( 'breakpointRevision' );
		if ( ! is_string( $revision ) || ! hash_equals( lieve_breakpoint_revision(), $revision ) ) { return new WP_Error( 'lieve_breakpoints_conflict', __( 'Breakpoints changed in another tab. Close and reopen this manager, or reload the Responsive page, before saving.', 'lieve-builder' ), array( 'status' => 409 ) ); }
	}
	// Older clients that omit the new optional field must not reset an existing icon.
	if ( is_array( $value ) ) {
		foreach ( $value as &$item ) {
			if ( is_array( $item ) && ! array_key_exists( 'icon', $item ) ) {
				foreach ( $current as $previous ) { if ( ( $item['id'] ?? null ) === $previous['id'] ) { $item['icon'] = $previous['icon']; break; } }
			}
		} unset( $item );
	}
	$clean = lieve_normalize_breakpoint_definitions( $value );
	if ( false === $clean ) { return new WP_Error( 'lieve_invalid_breakpoints', __( 'Use unique names, supported viewport icons and whole pixel widths (240–7680), with exactly one base breakpoint. A maximum of 20 breakpoints is supported.', 'lieve-builder' ), array( 'status' => 400 ) ); }
	// Canonical storage order is largest viewport first, regardless of the base.
	// Sort only at the validated save boundary, never during draft editing/reads.
	usort( $clean, function( $a, $b ) { return $b['width'] <=> $a['width']; } );
	$active_ids = array_flip( array_column( $clean, 'id' ) ); $archive = array();
	foreach ( array_merge( lieve_breakpoint_archive(), $current ) as $item ) {
		if ( isset( $active_ids[ $item['id'] ] ) ) { continue; }
		$item['base'] = false; $archive[ $item['id'] ] = $item;
	}
	$archive = array_values( $archive );
	update_option( LIEVE_RESPONSIVE_OPTION, array( 'version' => 2, 'items' => $clean, 'archived' => $archive ), false );
	if ( $clean !== lieve_breakpoint_definitions() || $archive !== lieve_breakpoint_archive() ) { return new WP_Error( 'lieve_breakpoints_not_saved', __( 'Breakpoints could not be saved. Please try again.', 'lieve-builder' ), array( 'status' => 500 ) ); }
	return rest_ensure_response( array( 'breakpoints' => $legacy ? lieve_responsive_breakpoints() : $clean, 'archivedBreakpoints' => $archive, 'breakpointRevision' => lieve_breakpoint_revision( $clean, $archive ) ) );
}

function lieve_render_breakpoint_modal() {
	$editable = current_user_can( 'manage_options' );
	?>
	<div id="lieve-breakpoints-modal" class="lieve-conditions-popup lieve-breakpoints-popup lieve-editor-manager-modal" hidden>
		<div class="lieve-conditions-backdrop" data-close-conditions></div>
		<form class="lieve-conditions-dialog lieve-breakpoints-dialog" role="dialog" aria-modal="true" aria-labelledby="lieve-breakpoints-title" aria-describedby="lieve-breakpoints-description" tabindex="-1">
			<header class="lieve-conditions-header">
				<div class="lieve-conditions-heading"><h2 id="lieve-breakpoints-title"><?php esc_html_e( 'Responsive Breakpoints', 'lieve-builder' ); ?></h2><p id="lieve-breakpoints-description"><?php esc_html_e( 'Names, widths, and style inheritance across the entire website.', 'lieve-builder' ); ?></p></div>
				<button type="button" class="lieve-conditions-close" data-close-conditions aria-label="<?php esc_attr_e( 'Close breakpoints', 'lieve-builder' ); ?>"><?php echo lieve_workspace_icon( 'close' ); ?></button>
			</header>
			<div class="lieve-conditions-body lieve-breakpoints-body">
				<?php lieve_render_responsive_controls(); ?>
			</div>
			<footer class="lieve-conditions-footer"><span data-responsive-status class="lieve-conditions-status" role="status" aria-live="polite"></span><button type="button" class="lieve-conditions-cancel" data-close-conditions><?php esc_html_e( 'Cancel', 'lieve-builder' ); ?></button><?php if ( $editable ) : ?><button type="submit" class="lieve-conditions-save" data-responsive-save><?php esc_html_e( 'Save Breakpoints', 'lieve-builder' ); ?></button><?php endif; ?></footer>
		</form>
	</div>
	<?php
}
