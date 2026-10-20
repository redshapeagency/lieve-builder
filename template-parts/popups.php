<?php
/**
 * Conditional Pop Up shells, kept outside the page main landmark.
 *
 * @package LieveBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$lieve_current_id = (int) ( $args['post_id'] ?? 0 );

$lieve_popup_ids = lieve_theme_setting( 'enable_popups' ) ? lieve_get_available_popup_ids( $lieve_current_id ) : array();
if ( ! empty( $GLOBALS['lieve_full_preview'] ) && 'popup' === ( $GLOBALS['lieve_full_preview']['snapshot']['templateType'] ?? '' ) ) { $lieve_popup_ids[] = $GLOBALS['lieve_full_preview']['postId']; $lieve_popup_ids = array_unique( $lieve_popup_ids ); }
foreach ( $lieve_popup_ids as $lieve_popup_id ) {
$lieve_popup_document = lieve_get_document( $lieve_popup_id );
if ( ! empty( $lieve_popup_document['children'] ) ) {
	$lieve_popup_settings = lieve_get_popup_settings( $lieve_popup_id );
	$lieve_popup_runtime = $lieve_popup_settings; unset( $lieve_popup_runtime['styles'] );
	$lieve_popup_css = lieve_popup_style_css( $lieve_popup_id, $lieve_popup_settings, 'inline' === lieve_css_loading_method() );
	if ( $lieve_popup_css && empty( $GLOBALS['lieve_document_css_rules'][ hash( 'sha256', $lieve_popup_css ) ] ) ) { lieve_print_generated_css( $lieve_popup_css, 'data-lieve-popup-styles', $lieve_popup_id ); }
	?>
	<div<?php echo lieve_popup_markup_classes( 'popup', 'lieve-popup' ) . lieve_popup_inline_attribute( $lieve_popup_settings, 'frame' ); ?> data-lieve-popup data-lieve-popup-id="<?php echo esc_attr( $lieve_popup_id ); ?>" data-lieve-popup-overlay="<?php echo $lieve_popup_settings['overlay'] ? 'on' : 'off'; ?>" data-lieve-popup-settings="<?php echo esc_attr( wp_json_encode( $lieve_popup_runtime ) ); ?>"<?php echo 'interaction' === lieve_get_popup_opening( $lieve_popup_id ) ? ' hidden' : ''; ?> role="dialog" aria-modal="true" tabindex="-1" aria-label="<?php echo esc_attr( $lieve_popup_settings['label'] ?: get_the_title( $lieve_popup_id ) ?: __( 'Pop Up', 'lieve-builder' ) ); ?>">
		<div<?php echo lieve_popup_markup_classes( 'popup-backdrop', 'lieve-popup-backdrop' ) . lieve_popup_inline_attribute( $lieve_popup_settings, 'overlay' ); ?><?php echo $lieve_popup_settings['closeOnBackdrop'] ? ' data-lieve-popup-close' : ''; ?> aria-hidden="true"></div>
		<div<?php echo lieve_popup_markup_classes( 'popup-dialog', 'lieve-popup-dialog lieve-builder-content' ) . lieve_popup_inline_attribute( $lieve_popup_settings, 'root' ); ?>>
			<?php if ( $lieve_popup_settings['closeButton'] ) : ?><button<?php echo lieve_popup_markup_classes( 'popup-close', 'lieve-popup-close' ) . lieve_popup_inline_attribute( $lieve_popup_settings, 'close' ); ?> type="button" data-lieve-popup-close aria-label="<?php esc_attr_e( 'Close pop up', 'lieve-builder' ); ?>"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button><?php endif; ?>
				<?php lieve_render_document( $lieve_popup_document ); ?>
		</div>
	</div>
	<?php
}
}
