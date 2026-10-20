<?php
/** Page-shell identities. Sparse page overrides stay independent of widget identities. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
define( 'LIEVE_META_PAGE_MARKUP', '_lieve_page_markup' );

function lieve_page_id_defaults() { return array( 'body' => '', 'main' => 'main-content' ); }
function lieve_page_id_valid( $id ) { return is_string( $id ) && ( '' === $id || preg_match( '/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/D', $id ) ); }
function lieve_page_markup_normalize( $raw, $global = false ) {
	$out = array(); $raw = is_object( $raw ) ? (array) $raw : $raw;
	foreach ( lieve_page_id_defaults() as $target => $default ) {
		$row = is_array( $raw ) ? (array) ( $raw[$target] ?? array() ) : array(); $clean = array();
		if ( is_bool( $row['enabled'] ?? null ) ) { $clean['enabled'] = $row['enabled']; }
		if ( lieve_page_id_valid( $row['custom'] ?? null ) ) { $clean['custom'] = $row['custom']; }
		if ( $global ) { $clean += array( 'enabled' => true, 'custom' => '' ); }
		if ( $clean ) { $out[$target] = $clean; }
	}
	return $out;
}
function lieve_page_markup_global() {
	$settings = get_option( defined( 'LIEVE_SETTINGS_OPTION' ) ? LIEVE_SETTINGS_OPTION : 'lieve_theme_settings', array() );
	return lieve_page_markup_normalize( $settings['output_ids'] ?? array(), true );
}
function lieve_get_page_markup( $id ) { return lieve_page_markup_normalize( get_post_meta( $id, LIEVE_META_PAGE_MARKUP, true ) ); }
function lieve_page_markup_revision( $id, $value = null ) { return hash( 'sha256', wp_json_encode( null === $value ? lieve_get_page_markup( $id ) : $value ) ); }
function lieve_page_markup_ids( $page = array(), $global = null ) {
	$global = lieve_page_markup_normalize( null === $global ? lieve_page_markup_global() : $global, true ); $page = lieve_page_markup_normalize( $page ); $ids = array();
	foreach ( lieve_page_id_defaults() as $target => $default ) { $row = array_replace( $global[$target], $page[$target] ?? array() ); $ids[$target] = $row['enabled'] ? ( $row['custom'] ?: $default ) : ''; }
	return $ids;
}
function lieve_page_markup_validate( $raw, $global = null ) {
	if ( is_object( $raw ) ) { $raw = (array) $raw; }
	$error = static function( $message ) { return new WP_Error( 'lieve_invalid_page_markup', $message, array( 'status' => 400 ) ); };
	if ( ! is_array( $raw ) || array_diff( array_keys( $raw ), array_keys( lieve_page_id_defaults() ) ) ) { return $error( __( 'Page IDs must contain only Body and Main settings.', 'lieve-builder' ) ); }
	foreach ( $raw as $row ) {
		$row = is_object( $row ) ? (array) $row : $row;
		if ( ! is_array( $row ) || array_diff( array_keys( $row ), array( 'enabled', 'custom' ) ) || ( array_key_exists( 'enabled', $row ) && ! is_bool( $row['enabled'] ) ) || ( array_key_exists( 'custom', $row ) && ! lieve_page_id_valid( $row['custom'] ) ) ) { return $error( __( 'Use a true/false ID switch and one ID starting with a letter or underscore, followed by letters, digits, hyphens or underscores (up to 128 characters). Do not include #.', 'lieve-builder' ) ); }
	}
	$clean = lieve_page_markup_normalize( $raw ); $ids = lieve_page_markup_ids( $clean, $global );
	if ( $ids['body'] && $ids['body'] === $ids['main'] ) { return $error( __( 'Body and Main must use different HTML IDs.', 'lieve-builder' ) ); }
	return $clean;
}
function lieve_page_markup_schema() {
	$row = array( 'type' => 'object', 'additionalProperties' => false, 'properties' => array( 'enabled' => array( 'type' => 'boolean' ), 'custom' => array( 'type' => 'string', 'maxLength' => 128, 'pattern' => '^(?:[A-Za-z_][A-Za-z0-9_-]{0,127})?$' ) ) );
	return array( 'type' => 'object', 'additionalProperties' => false, 'properties' => array( 'body' => $row, 'main' => $row ) );
}
/** Only singular content owns overrides; reusable templates do not own the page shell. */
function lieve_page_shell_id( $target ) {
	$page = is_singular() && 'lieve_template' !== get_post_type() ? lieve_get_page_markup( get_queried_object_id() ) : array();
	$ids = lieve_page_markup_ids( $page ); return $ids[$target] ?? '';
}
function lieve_page_shell_id_attribute( $target ) { $id = lieve_page_shell_id( $target ); return '' === $id ? '' : ' id="' . esc_attr( $id ) . '"'; }

/** Same target picker, switches and custom-field rows as the class manager. */
function lieve_render_page_id_settings( $target, $settings ) {
	if ( ! array_key_exists( $target, lieve_page_id_defaults() ) ) { return; }
	$row = lieve_page_markup_normalize( $settings['output_ids'] ?? array(), true )[$target]; $id = 'lieve-page-id-' . $target; $name = LIEVE_SETTINGS_OPTION . '[output_ids][' . $target . ']';
	?>
	<fieldset class="lieve-settings-defaults lieve-settings-page-ids" data-page-id-settings>
		<legend><?php esc_html_e( 'HTML ID', 'lieve-builder' ); ?></legend>
		<p><?php esc_html_e( 'One ID per element. Pages inherit this setting and can override it in the builder’s left Markup panel.', 'lieve-builder' ); ?></p>
		<label class="lieve-settings-class-option"><span class="lieve-settings-class-label"><span><?php esc_html_e( 'Output HTML ID', 'lieve-builder' ); ?></span><small><?php echo esc_html( 'main' === $target ? __( 'Automatic ID: main-content', 'lieve-builder' ) : __( 'Body has no automatic ID. Enter a custom ID below to add one.', 'lieve-builder' ) ); ?></small></span><input type="hidden" name="<?php echo esc_attr( $name ); ?>[enabled]" value="0"><span class="lieve-settings-popup-switch"><input type="checkbox" role="switch" data-setting data-page-id-enabled aria-label="<?php echo esc_attr( ucfirst( $target ) . ': Output HTML ID' ); ?>" name="<?php echo esc_attr( $name ); ?>[enabled]" value="1" <?php checked( $row['enabled'] ); ?>><span class="lieve-template-toggle-track" aria-hidden="true"></span></span></label>
		<div class="lieve-settings-custom lieve-ds-field lieve-settings-value"><label for="<?php echo esc_attr( $id ); ?>"><?php esc_html_e( 'Custom HTML ID', 'lieve-builder' ); ?></label><input id="<?php echo esc_attr( $id ); ?>" type="text" data-setting data-page-id-custom name="<?php echo esc_attr( $name ); ?>[custom]" value="<?php echo esc_attr( $row['custom'] ); ?>" placeholder="<?php echo esc_attr( 'main' === $target ? 'main-content' : 'e.g. site-body' ); ?>" maxlength="128" pattern="[A-Za-z_][A-Za-z0-9_\-]{0,127}|" spellcheck="false" autocomplete="off"><p><?php esc_html_e( 'Without # or spaces. Leave empty to use the automatic ID, if any. This does not change widget IDs.', 'lieve-builder' ); ?></p></div>
	</fieldset>
	<?php
}
