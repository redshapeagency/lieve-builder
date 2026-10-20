<?php
/** Font management presentation, isolated from frontend and editor UI typography. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_font_icon( $name ) {
	$paths = array(
		'font' => '<path d="m3 18 5-12 5 12M5 14h6m4-2c2-2 6-1 6 2v4m0-3c-6-2-7 4-2 3l2-1"/>',
		'search' => '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
		'upload' => '<path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5"/>',
		'download' => '<path d="M12 3v13m-4-4 4 4 4-4M4 17v4h16v-4"/>',
		'plus' => '<path d="M12 5v14M5 12h14"/>',
		'close' => '<path d="m6 6 12 12M6 18 18 6"/>',
		'chevron' => '<path d="m7 10 5 5 5-5"/>',
		'copy' => '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
		'archive' => '<path d="M4 8h16v12H4zM3 4h18v4H3zM9 12h6"/>',
		'restore' => '<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/>',
	);
	return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . ( $paths[ $name ] ?? $paths['font'] ) . '</svg>';
}
function lieve_font_library_item( $family ) {
	return '<button type="button" class="lieve-font-family" data-font-select="' . esc_attr( $family['id'] ) . '" aria-pressed="false"><span class="lieve-font-glyph">' . lieve_font_icon( 'font' ) . '</span><span><strong>' . esc_html( $family['label'] ) . '</strong><small>' . esc_html( ( 'google' === $family['source'] ? 'Google Fonts' : 'Custom font' ) . ' · ' . count( $family['faces'] ) . ' face' . ( 1 === count( $family['faces'] ) ? '' : 's' ) ) . '</small></span><span class="lieve-font-state">' . esc_html( $family['enabled'] ? 'Active' : 'Inactive' ) . '</span></button>';
}
function lieve_font_admin_assets( $hook ) {
	if ( get_plugin_page_hookname( 'lieve-fonts', 'lieve-dashboard' ) !== $hook ) { return; }
	wp_enqueue_style( 'lieve-font-workspace-base', LIEVE_URL . 'assets/css/design-system.css', array( 'lieve-builder-conditions' ), lieve_asset_version( 'assets/css/design-system.css' ) );
	wp_enqueue_style( 'lieve-fonts', LIEVE_URL . 'assets/css/fonts.css', array( 'lieve-font-workspace-base' ), lieve_asset_version( 'assets/css/fonts.css' ) );
	wp_enqueue_script( 'lieve-fonts', LIEVE_URL . 'assets/js/fonts.js', array(), lieve_asset_version( 'assets/js/fonts.js' ), true );
	$data = lieve_fonts_data();
	wp_localize_script( 'lieve-fonts', 'LieveFontsConfig', array( 'data' => $data, 'revision' => lieve_fonts_revision( $data ), 'url' => esc_url_raw( rest_url( 'lieve/v1/fonts' ) ), 'nonce' => wp_create_nonce( 'wp_rest' ), 'icons' => array_combine( array( 'font', 'search', 'upload', 'download', 'plus', 'close', 'chevron', 'copy', 'archive', 'restore' ), array_map( 'lieve_font_icon', array( 'font', 'search', 'upload', 'download', 'plus', 'close', 'chevron', 'copy', 'archive', 'restore' ) ) ) ) );
	$css = lieve_fonts_css( $data, true );
	if ( $css ) { wp_add_inline_style( 'lieve-fonts', $css ); }
}
add_action( 'admin_enqueue_scripts', 'lieve_font_admin_assets', 30 );

function lieve_render_fonts_page() {
	if ( ! current_user_can( 'manage_options' ) ) { wp_die( esc_html__( 'You do not have permission to manage fonts.', 'lieve-builder' ) ); }
	$families = array_filter( lieve_fonts_data()['families'], function( $family ) { return ! $family['archived']; } );
	usort( $families, function( $a, $b ) { return strnatcasecmp( $a['label'], $b['label'] ); } );
	?>
	<div class="wrap lieve-admin-page lieve-design-page lieve-token-page lieve-fonts-page">
		<?php lieve_render_admin_header( __( 'Fonts', 'lieve-builder' ), __( 'Your type library. Google Fonts and custom files, hosted on your website.', 'lieve-builder' ) ); ?>
		<section class="lieve-settings-card lieve-ds-page-card">
			<div class="lieve-ds lieve-fonts" id="lieve-fonts">
				<div class="lieve-ds-toolbar">
					<label class="lieve-ds-search"><?php echo lieve_font_icon( 'search' ); ?><input type="search" data-font-search placeholder="Search fonts…" aria-label="Search installed fonts"></label>
					<span class="lieve-font-toolbar-note">Local files. No visitor requests to Google.</span>
					<button type="button" class="lieve-conditions-cancel" data-font-open="upload"><?php echo lieve_font_icon( 'upload' ); ?>Upload Font</button>
					<button type="button" class="lieve-conditions-save" data-font-open="google"><?php echo lieve_font_icon( 'plus' ); ?>Google Fonts</button>
				</div>
				<div class="lieve-ds-workspace lieve-font-workspace">
					<aside class="lieve-ds-sidebar"><div class="lieve-ds-section-title"><span>Library</span></div><nav aria-label="Font sources">
						<?php foreach ( array( 'all' => 'All Fonts', 'google' => 'Google Fonts', 'custom' => 'Custom Fonts', 'archived' => 'Archived' ) as $key => $label ) : ?><button type="button" data-font-filter="<?php echo esc_attr( $key ); ?>" aria-pressed="<?php echo 'all' === $key ? 'true' : 'false'; ?>"<?php echo 'all' === $key ? ' class="is-active"' : ''; ?>><?php echo lieve_font_icon( 'archived' === $key ? 'archive' : 'font' ); ?><span><?php echo esc_html( $label ); ?></span></button><?php endforeach; ?>
					</nav><p class="lieve-ds-sidebar-note">Install only the faces you need. Fonts load when your content uses them.</p></aside>
					<section class="lieve-ds-library" aria-label="Installed font families"><div class="lieve-ds-library-head"><div><h3 data-font-list-title>Installed fonts</h3><span data-font-count><?php echo count( $families ); ?> families</span></div><button type="button" class="lieve-ds-icon" data-font-sort aria-label="Reverse font sort order" title="Sort A–Z">A–Z</button></div>
						<div class="lieve-ds-list" data-font-list><?php if ( $families ) { foreach ( $families as $family ) { echo lieve_font_library_item( $family ); } } else { echo '<div class="lieve-font-list-empty"><h3>No fonts installed yet</h3><p>Download a Google family or upload a font you own.</p></div>'; } ?></div>
					</section>
					<aside class="lieve-ds-details" data-font-details aria-label="Font preview and settings"><div class="lieve-font-empty"><span class="lieve-font-empty-glyph" aria-hidden="true"><?php echo lieve_font_icon( 'font' ); ?></span><h2><?php echo $families ? 'Select a font to explore it' : 'Make room for your typography'; ?></h2><p>Preview every face, choose its fallback and control how it loads. Your existing pages stay exactly as they are.</p><div><button type="button" class="lieve-conditions-save" data-font-open="google">Browse Google Fonts</button><button type="button" class="lieve-conditions-cancel" data-font-open="upload">Upload Custom Font</button></div></div></aside>
				</div>
				<footer class="lieve-ds-footer"><span role="status" aria-live="polite" data-font-status>Fonts are served locally. Installations are saved immediately.</span><button type="button" class="lieve-conditions-cancel" data-font-cancel hidden>Cancel</button><div class="lieve-save-control"><button type="button" class="lieve-conditions-save" data-font-save disabled aria-keyshortcuts="Control+s Meta+s" aria-describedby="lieve-font-shortcut">Save Fonts</button><span class="lieve-save-shortcut" id="lieve-font-shortcut"><kbd>⌘S</kbd><span aria-hidden="true"> / </span><kbd>Ctrl+S</kbd></span></div></footer>
				<div class="lieve-ds-action-layer" data-font-modal hidden><section class="lieve-ds-action-dialog" role="dialog" aria-modal="true" aria-labelledby="lieve-font-dialog-title" tabindex="-1" data-font-dialog></section></div>
			</div>
		</section>
	</div>
	<?php
}
