<?php
/** Global, ID-stable responsive contexts shared by admin, editor and frontend. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'LIEVE_RESPONSIVE_OPTION', 'lieve_responsive_settings' );

function lieve_default_breakpoints() {
	return array(
		array( 'id' => 'desktop', 'name' => 'Desktop', 'width' => 1279, 'base' => true, 'icon' => 'laptop' ),
		array( 'id' => 'tablet', 'name' => 'Tablet', 'width' => 991, 'base' => false, 'icon' => 'tablet-portrait' ),
		array( 'id' => 'mobile', 'name' => 'Mobile', 'width' => 767, 'base' => false, 'icon' => 'phone-portrait' ),
	);
}

/** Shared, authored SVG catalogue: stored definitions contain only an allowlisted key. */
function lieve_breakpoint_icons() {
	return array(
		'desktop-wide' => array( 'label' => 'Wide desktop', 'paths' => '<rect x="1.5" y="4" width="21" height="13" rx="1.8"/><path d="M12 17v3m-4 0h8"/>' ),
		'desktop-curved' => array( 'label' => 'Curved desktop', 'paths' => '<path d="M3 4.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1c6-1 12-1 18 0a1 1 0 0 0 1-1v-10a1 1 0 0 0-1-1c-6 1-12 1-18 0ZM12 16v4m-4 0h8"/>' ),
		'desktop' => array( 'label' => 'Desktop', 'paths' => '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8m-4-4v4"/>' ),
		'laptop' => array( 'label' => 'Laptop', 'paths' => '<rect x="4" y="4" width="16" height="12" rx="1.5"/><path d="m4 16-2 4h20l-2-4M10 18h4"/>' ),
		'tablet-landscape' => array( 'label' => 'Tablet landscape', 'paths' => '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M5 11v2M19 9v6"/>' ),
		'tablet-portrait' => array( 'label' => 'Tablet portrait', 'paths' => '<rect x="5" y="2" width="14" height="20" rx="2.5"/><path d="M10 5h4M11 19h2"/>' ),
		'phone-landscape' => array( 'label' => 'Phone landscape', 'paths' => '<rect x="2" y="7" width="20" height="10" rx="2.5"/><path d="M5 11v2M19 11v2"/>' ),
		'phone-portrait' => array( 'label' => 'Phone portrait', 'paths' => '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 5h2M11 19h2"/>' ),
	);
}

function lieve_breakpoint_icon( $name ) {
	$icons = lieve_breakpoint_icons();
	return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . ( $icons[ $name ]['paths'] ?? $icons['desktop']['paths'] ) . '</svg>';
}

/** Older definitions gain suitable icons without a database write or ID migration. */
function lieve_default_breakpoint_icon( $item ) {
	$defaults = array( 'desktop' => 'laptop', 'tablet' => 'tablet-portrait', 'mobile' => 'phone-portrait' );
	return $defaults[ $item['id'] ] ?? ( $item['width'] >= 1280 ? 'desktop-wide' : ( $item['width'] >= 992 ? 'laptop' : ( $item['width'] >= 768 ? 'tablet-portrait' : 'phone-portrait' ) ) );
}

function lieve_breakpoint_icon_config() {
	$icons = array();
	foreach ( lieve_breakpoint_icons() as $key => $icon ) { $icons[ $key ] = array( 'label' => $icon['label'], 'svg' => lieve_breakpoint_icon( $key ) ); }
	return $icons;
}

/** Names never become storage keys or CSS selectors. Inactive IDs remain safe to store. */
function lieve_valid_breakpoint_id( $id ) {
	return is_string( $id ) && ( in_array( $id, array( 'desktop', 'tablet', 'mobile' ), true ) || preg_match( '/^bp_[a-z0-9]{8,24}$/D', $id ) );
}

function lieve_normalize_breakpoint_definitions( $items ) {
	if ( ! is_array( $items ) || ! $items || count( $items ) > 20 || array_keys( $items ) !== range( 0, count( $items ) - 1 ) ) { return false; }
	$clean = array(); $ids = array(); $widths = array(); $names = array(); $bases = 0;
	foreach ( $items as $item ) {
		if ( ! is_array( $item ) || ! lieve_valid_breakpoint_id( $item['id'] ?? null ) || ! is_string( $item['name'] ?? null ) || ! is_bool( $item['base'] ?? null ) ) { return false; }
		$name = trim( $item['name'] ); $width = $item['width'] ?? null;
		if ( ! preg_match( '/^.{1,40}$/usD', $name ) || preg_match( '/[<>\x00-\x1f\x7f]/u', $name ) || ! ( is_int( $width ) || ( is_string( $width ) && ctype_digit( $width ) ) ) || $width < 240 || $width > 7680 ) { return false; }
		if ( array_key_exists( 'icon', $item ) && ( ! is_string( $item['icon'] ) || ! isset( lieve_breakpoint_icons()[ $item['icon'] ] ) ) ) { return false; }
		$name_key = function_exists( 'mb_strtolower' ) ? mb_strtolower( $name, 'UTF-8' ) : strtolower( $name );
		if ( isset( $ids[ $item['id'] ] ) || isset( $widths[ (int) $width ] ) || isset( $names[ $name_key ] ) ) { return false; }
		$ids[ $item['id'] ] = true; $widths[ (int) $width ] = true; $names[ $name_key ] = true; $bases += $item['base'] ? 1 : 0;
		$clean[] = array( 'id' => $item['id'], 'name' => $name, 'width' => (int) $width, 'base' => $item['base'], 'icon' => $item['icon'] ?? lieve_default_breakpoint_icon( $item ) );
	}
	if ( 1 !== $bases ) { return false; }
	// Reads preserve stored order. REST saves sort by descending width after validation.
	return $clean;
}

/** Lazy migration: old Tablet/Mobile widths keep their original context IDs. */
function lieve_breakpoint_definitions() {
	$saved = get_option( LIEVE_RESPONSIVE_OPTION, false );
	$items = lieve_normalize_breakpoint_definitions( is_array( $saved ) ? ( $saved['items'] ?? null ) : null );
	if ( false !== $items ) { return $items; }
	$items = lieve_default_breakpoints();
	$legacy = function_exists( 'lieve_theme_settings' ) ? lieve_theme_settings() : array();
	$items[0]['width'] = max( 1279, (int) ( $legacy['breakpoint_tablet'] ?? 991 ) + 1 );
	$items[1]['width'] = (int) ( $legacy['breakpoint_tablet'] ?? 991 );
	$items[2]['width'] = (int) ( $legacy['breakpoint_mobile'] ?? 767 );
	return $items;
}

/** Removed definitions keep their IDs, so restoring them reactivates authored styles. */
function lieve_breakpoint_archive() {
	$saved = get_option( LIEVE_RESPONSIVE_OPTION, array() ); $archive = array();
	$active = array_flip( array_column( lieve_breakpoint_definitions(), 'id' ) );
	foreach ( is_array( $saved['archived'] ?? null ) ? $saved['archived'] : array() as $item ) {
		if ( ! is_array( $item ) ) { continue; }
		$item['base'] = true; $clean = lieve_normalize_breakpoint_definitions( array( $item ) );
		if ( false === $clean ) { continue; }
		if ( isset( $active[ $clean[0]['id'] ] ) || isset( $archive[ $clean[0]['id'] ] ) ) { continue; }
		$clean[0]['base'] = false; $archive[ $clean[0]['id'] ] = $clean[0];
	}
	return array_values( $archive );
}

function lieve_breakpoint_revision( $items = null, $archive = null ) {
	return hash( 'sha256', json_encode( array( 'items' => null === $items ? lieve_breakpoint_definitions() : $items, 'archived' => null === $archive ? lieve_breakpoint_archive() : $archive ) ) );
}

/** Base first, then outward on either side: ascending min-width, descending max-width. */
function lieve_breakpoint_order( $items = null ) {
	$items = null === $items ? lieve_breakpoint_definitions() : $items;
	$base = current( array_filter( $items, function( $item ) { return $item['base']; } ) );
	$larger = array_values( array_filter( $items, function( $item ) use ( $base ) { return $item['width'] > $base['width']; } ) );
	$smaller = array_values( array_filter( $items, function( $item ) use ( $base ) { return $item['width'] < $base['width']; } ) );
	usort( $larger, function( $a, $b ) { return $a['width'] <=> $b['width']; } );
	usort( $smaller, function( $a, $b ) { return $b['width'] <=> $a['width']; } );
	return array_merge( array( $base ), $larger, $smaller );
}

function lieve_breakpoint_cascade( $device, $items = null ) {
	$order = lieve_breakpoint_order( $items ); $base = $order[0]; $selected = null;
	foreach ( $order as $item ) { if ( $item['id'] === $device ) { $selected = $item; break; } }
	if ( ! $selected ) { return array(); }
	return array_values( array_filter( $order, function( $item ) use ( $base, $selected ) {
		return $item['base'] || ( $selected['width'] > $base['width'] ? $item['width'] > $base['width'] && $item['width'] <= $selected['width'] : $item['width'] < $base['width'] && $item['width'] >= $selected['width'] );
	} ) );
}

function lieve_breakpoint_media( $item, $base ) {
	return $item['base'] ? '' : ( $item['width'] > $base['width'] ? 'min-width:' : 'max-width:' ) . $item['width'] . 'px';
}

function lieve_responsive_config() {
	return array( 'breakpoints' => lieve_breakpoint_definitions(), 'archivedBreakpoints' => lieve_breakpoint_archive(), 'defaultBreakpoints' => lieve_default_breakpoints(), 'breakpointIcons' => lieve_breakpoint_icon_config(), 'breakpointRevision' => lieve_breakpoint_revision(), 'breakpointsUrl' => esc_url_raw( rest_url( 'lieve/v1/editor/breakpoints' ) ), 'canManageBreakpoints' => current_user_can( 'manage_options' ), 'nonce' => wp_create_nonce( 'wp_rest' ) );
}

/** Render both saved rows and the inert cloning template with identical markup. */
function lieve_render_responsive_row( $item, $base, $editable ) {
	$name = $item['name'] ?? '';
	$is_base = ! empty( $item['base'] );
	$icon = $item['icon'] ?? 'laptop';
	$icons = lieve_breakpoint_icons();
	$rule = $item ? ( $is_base ? 'All widths · Base' : ( $item['width'] > $base['width'] ? '≥ ' : '≤ ' ) . $item['width'] . ' px' ) : '';
	?>
	<div class="lieve-responsive-row<?php echo $is_base ? ' is-base' : ''; ?>" data-breakpoint-row<?php if ( $item ) : ?> data-breakpoint-id="<?php echo esc_attr( $item['id'] ); ?>"<?php endif; ?>>
		<div class="lieve-responsive-name">
			<div class="lieve-responsive-icon-picker" data-breakpoint-picker>
				<button type="button" class="lieve-responsive-icon-trigger" data-breakpoint-icon="<?php echo esc_attr( $icon ); ?>" aria-expanded="false" aria-haspopup="true" aria-label="<?php echo esc_attr( 'Choose icon for ' . ( $name ?: 'breakpoint' ) ); ?>" title="<?php echo esc_attr( $icons[ $icon ]['label'] . ' · Change viewport icon' ); ?>"<?php disabled( ! $editable ); ?>><?php echo lieve_breakpoint_icon( $icon ); ?></button>
				<div class="lieve-responsive-icon-menu" data-breakpoint-icon-menu role="group" aria-label="<?php esc_attr_e( 'Viewport icon', 'lieve-builder' ); ?>" hidden>
					<?php foreach ( $icons as $key => $choice ) : ?><button type="button" class="lieve-responsive-icon-option" data-breakpoint-icon-option="<?php echo esc_attr( $key ); ?>" aria-pressed="<?php echo $key === $icon ? 'true' : 'false'; ?>"<?php disabled( ! $editable ); ?>><?php echo lieve_breakpoint_icon( $key ); ?><span><?php echo esc_html( $choice['label'] ); ?></span></button><?php endforeach; ?>
				</div>
			</div>
			<input data-breakpoint-name type="text" value="<?php echo esc_attr( $name ); ?>" maxlength="40" required aria-label="<?php echo esc_attr( $item ? $name . ' name' : __( 'Breakpoint name', 'lieve-builder' ) ); ?>" autocomplete="off"<?php disabled( ! $editable ); ?>>
		</div>
		<label class="lieve-responsive-width"><input data-breakpoint-width type="number" value="<?php echo esc_attr( $item['width'] ?? '' ); ?>" min="240" max="7680" step="1" required aria-label="<?php echo esc_attr( $item ? $name . ' width' : __( 'Breakpoint width', 'lieve-builder' ) ); ?>"<?php disabled( ! $editable ); ?>><span>px</span></label>
		<output class="lieve-responsive-rule" data-breakpoint-rule><?php echo esc_html( $rule ); ?></output>
		<button type="button" class="lieve-responsive-base-toggle" data-breakpoint-base role="switch" aria-checked="<?php echo $is_base ? 'true' : 'false'; ?>" aria-label="<?php echo esc_attr( $item ? 'Use ' . $name . ' as base breakpoint' : __( 'Use as base breakpoint', 'lieve-builder' ) ); ?>"<?php disabled( ! $editable ); ?>><span></span></button>
		<button type="button" class="lieve-responsive-remove" data-breakpoint-remove aria-label="<?php echo esc_attr( $item ? 'Remove ' . $name . ' breakpoint' : __( 'Remove breakpoint', 'lieve-builder' ) ); ?>" title="<?php echo esc_attr( $is_base ? 'Choose another base before removing this breakpoint.' : 'Remove breakpoint' ); ?>"<?php disabled( ! $editable || $is_base ); ?>><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-10 0 1 14h12l1-14M10 10v6m4-6v6"/></svg></button>
		<p class="lieve-responsive-field-error" data-breakpoint-error role="status" hidden></p>
	</div>
	<?php
}

/** One management form, reused in the builder modal and the admin page. */
function lieve_render_responsive_controls() {
	$editable = current_user_can( 'manage_options' );
	$items = lieve_breakpoint_definitions();
	$base = current( array_filter( $items, function( $item ) { return $item['base']; } ) );
	$widths = array_column( $items, 'width' );
	$strategy = $base['width'] === max( $widths ) ? 'Desktop-first' : ( $base['width'] === min( $widths ) ? 'Mobile-first' : 'Bidirectional cascade' );
	?>
	<div class="lieve-responsive-manager" data-responsive-manager>
		<div class="lieve-responsive-summary"><span data-responsive-strategy><?php echo esc_html( $strategy ); ?></span><p><?php esc_html_e( 'Base styles apply everywhere. Smaller widths inherit down; larger widths inherit up. Explicit overrides win.', 'lieve-builder' ); ?></p></div>
		<div class="lieve-responsive-table">
			<div class="lieve-responsive-columns" aria-hidden="true"><span><?php esc_html_e( 'Name', 'lieve-builder' ); ?></span><span><?php esc_html_e( 'Viewport', 'lieve-builder' ); ?></span><span><?php esc_html_e( 'CSS rule', 'lieve-builder' ); ?></span><span><?php esc_html_e( 'Base', 'lieve-builder' ); ?></span><span></span></div>
			<div class="lieve-responsive-list" data-responsive-list><?php foreach ( $items as $item ) { lieve_render_responsive_row( $item, $base, $editable ); } ?></div>
		</div>
		<template data-responsive-template><?php lieve_render_responsive_row( null, $base, $editable ); ?></template>
		<?php if ( $editable ) : ?><div class="lieve-responsive-actions"><button type="button" class="lieve-conditions-cancel" data-breakpoint-add<?php disabled( count( $items ) >= 20 ); ?>><?php esc_html_e( 'Add Breakpoint', 'lieve-builder' ); ?></button><button type="button" class="lieve-conditions-cancel" data-breakpoint-reset><?php esc_html_e( 'Reset Defaults', 'lieve-builder' ); ?></button></div><?php endif; ?>
		<?php $archive = lieve_breakpoint_archive(); ?>
		<details class="lieve-responsive-archive" data-responsive-archive<?php echo $archive ? '' : ' hidden'; ?>>
			<summary><?php esc_html_e( 'Removed breakpoints', 'lieve-builder' ); ?> <span data-responsive-archive-count><?php echo count( $archive ); ?></span></summary>
			<p><?php esc_html_e( 'Restore the original ID to reactivate retained element styles and variable overrides. Resolve any name or width conflicts before saving.', 'lieve-builder' ); ?></p>
			<div data-responsive-archive-list><?php foreach ( $archive as $item ) : ?><div class="lieve-responsive-archived-row"><span><?php echo lieve_breakpoint_icon( $item['icon'] ); ?><strong><?php echo esc_html( $item['name'] ); ?></strong><small><?php echo (int) $item['width']; ?> px</small></span><?php if ( $editable ) : ?><button type="button" class="lieve-conditions-cancel" data-breakpoint-restore="<?php echo esc_attr( $item['id'] ); ?>"<?php disabled( count( $items ) >= 20 ); ?>><?php esc_html_e( 'Restore', 'lieve-builder' ); ?></button><?php endif; ?></div><?php endforeach; ?></div>
		</details>
		<p class="lieve-responsive-note"><?php esc_html_e( 'Choose exactly one base. Widths must be unique, whole pixels (240–7680). Names and widths can change without moving styles. Removing a breakpoint stops its CSS output but preserves its saved element styles.', 'lieve-builder' ); ?></p>
		<p class="lieve-responsive-base-warning" data-responsive-base-warning hidden><?php esc_html_e( 'Changing the base or moving a breakpoint across it changes the cascade across the website. Existing styles stay attached to their original breakpoint IDs; they are not copied or moved.', 'lieve-builder' ); ?></p>
		<?php if ( ! $editable ) : ?><p class="lieve-responsive-note"><?php esc_html_e( 'Only administrators can change global breakpoints.', 'lieve-builder' ); ?></p><?php endif; ?>
	</div>
	<?php
}

function lieve_render_responsive_page() {
	if ( ! current_user_can( 'manage_options' ) ) { wp_die( esc_html__( 'You do not have permission to manage responsive settings.', 'lieve-builder' ) ); }
	?>
	<div class="wrap lieve-admin-page lieve-responsive-page">
		<?php lieve_render_admin_header( __( 'Responsive', 'lieve-builder' ), __( 'Manage the breakpoints and style inheritance shared by your entire website.', 'lieve-builder' ) ); ?>
		<form id="lieve-responsive-form" class="lieve-settings-card lieve-responsive-form">
			<div class="lieve-settings-card-heading"><h2><?php esc_html_e( 'Breakpoints', 'lieve-builder' ); ?></h2><p><?php esc_html_e( 'The same configuration is available in the visual editor.', 'lieve-builder' ); ?></p></div>
			<?php lieve_render_responsive_controls(); ?>
			<footer class="lieve-responsive-footer">
				<span data-responsive-status role="status" aria-live="polite"></span>
				<button type="button" class="lieve-conditions-cancel" data-responsive-cancel hidden><?php esc_html_e( 'Cancel', 'lieve-builder' ); ?></button>
				<div class="lieve-save-control">
					<button type="submit" class="lieve-conditions-save" data-responsive-save disabled aria-keyshortcuts="Control+s Meta+s" aria-describedby="lieve-responsive-save-shortcut"><?php esc_html_e( 'Save Breakpoints', 'lieve-builder' ); ?></button>
					<span class="lieve-save-shortcut" id="lieve-responsive-save-shortcut"><kbd>⌘S</kbd><span aria-hidden="true"> / </span><kbd>Ctrl+S</kbd></span>
				</div>
			</footer>
		</form>
	</div>
	<?php
}
