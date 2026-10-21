<?php
/** Explicitly approved Custom Code. Stored source is never authorization by itself. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** This is trusted server code, not a PHP sandbox. Respect the host's code-edit policy. */
function lieve_custom_code_policy_allows_php() {
	return ! ( defined( 'DISALLOW_FILE_EDIT' ) && DISALLOW_FILE_EDIT ) && ! ( defined( 'DISALLOW_FILE_MODS' ) && DISALLOW_FILE_MODS ) && ( ! function_exists( 'wp_is_file_mod_allowed' ) || wp_is_file_mod_allowed( 'lieve_custom_code' ) );
}
function lieve_can_author_custom_code() {
	return function_exists( 'current_user_can' ) && current_user_can( 'manage_options' ) && current_user_can( 'edit_themes' ) && current_user_can( 'unfiltered_html' ) && lieve_custom_code_policy_allows_php();
}
function lieve_custom_code_has_php( $source ) { return false !== strpos( $source, '<?' ); }
function lieve_custom_code_sources( $node ) {
	$props = $node['props'] ?? array();
	return array_map( static function( $key ) use ( $props ) { return is_string( $props[$key] ?? null ) ? $props[$key] : ''; }, array( 'content', 'customCss', 'customJs' ) );
}
function lieve_custom_code_signature( $node, $post_id ) {
	return hash_hmac( 'sha256', wp_json_encode( array( 'lieve-custom-code-v1', (int) $post_id, $node['_lieveListingSourceId'] ?? $node['id'], lieve_custom_code_sources( $node ) ) ), wp_salt( 'auth' ) );
}
function lieve_custom_code_is_approved( $node, $post_id ) {
	$post_id = (int) ( $node['_lieveComponentCodeOwner'] ?? $post_id );
	$node = $node['_lieveCustomCodeSource'] ?? $node;
	$signature = $node['props']['codeApproval'] ?? '';
	return $post_id > 0 && is_string( $signature ) && preg_match( '/^[a-f0-9]{64}$/D', $signature ) && hash_equals( lieve_custom_code_signature( $node, $post_id ), $signature );
}

/** Run only in authenticated content-write paths, never in read-time normalization/preview. */
function lieve_prepare_custom_code_document( $document, $post_id, $stored = array() ) {
	$previous = array();
	$index = static function( $nodes ) use ( &$index, &$previous ) { foreach ( $nodes as $node ) { if ( 'html' === ( $node['type'] ?? '' ) ) { $previous[$node['id']] = $node; } $index( $node['children'] ?? array() ); } };
	$index( $stored['children'] ?? array() );
	$can_author = lieve_can_author_custom_code();
	$walk = static function( &$nodes ) use ( &$walk, $can_author, $post_id, $previous ) {
		foreach ( $nodes as &$node ) {
			if ( 'html' === $node['type'] ) {
				unset( $node['props']['codeApproval'] ); // Never accept a signature supplied by the client.
				list( $html, $css, $js ) = lieve_custom_code_sources( $node );
				if ( lieve_custom_code_has_php( $html ) || '' !== trim( $css ) || '' !== trim( $js ) ) {
					if ( $can_author ) {
						try { token_get_all( $html, TOKEN_PARSE ); }
						catch ( ParseError $error ) { return new WP_Error( 'lieve_custom_code_syntax', __( 'Custom Code contains invalid PHP syntax. Correct it before saving; your draft is retained.', 'lieve-builder' ), array( 'status' => 400 ) ); }
						if ( preg_match( '/<\?(?!php\s|=)/i', $html ) ) { return new WP_Error( 'lieve_custom_code_tags', __( 'Use full <?php … ?> or <?= … ?> tags in HTML/PHP. Short PHP tags are not supported.', 'lieve-builder' ), array( 'status' => 400 ) ); }
						if ( '' !== trim( $js ) && function_exists( 'wp_get_inline_script_tag' ) && '' === wp_get_inline_script_tag( $js ) ) { return new WP_Error( 'lieve_custom_code_script', __( 'JavaScript contains an unsafe script-tag boundary. Enter JavaScript only, without script tags.', 'lieve-builder' ), array( 'status' => 400 ) ); }
						$node['props']['codeApproval'] = lieve_custom_code_signature( $node, $post_id );
					} else {
						$old = $previous[$node['id']] ?? null;
						if ( ! $old || lieve_custom_code_sources( $old ) !== lieve_custom_code_sources( $node ) || ! lieve_custom_code_is_approved( $old, $post_id ) ) { return new WP_Error( 'lieve_custom_code_forbidden', __( 'Only administrators allowed to edit theme code and unfiltered HTML can save PHP, CSS or JavaScript in Custom Code. Existing approved code can be preserved unchanged.', 'lieve-builder' ), array( 'status' => 403 ) ); }
						$node['props']['codeApproval'] = $old['props']['codeApproval'];
					}
				}
			}
			$result = $walk( $node['children'] ); if ( is_wp_error( $result ) ) { return $result; }
		}
		return true;
	};
	$result = $walk( $document['children'] );
	return is_wp_error( $result ) ? $result : $document;
}

/** Disabling PHP must hide its source, including quoted close-tags and incomplete blocks. */
function lieve_custom_code_html_only( $source ) {
	$output = '';
	foreach ( token_get_all( $source ) as $token ) { if ( is_array( $token ) && T_INLINE_HTML === $token[0] ) { $output .= explode( '<?', $token[1], 2 )[0]; } }
	return $output;
}

/** Capture output in an isolated local scope. Trusted PHP still has full WordPress/server access. */
function lieve_custom_code_evaluate( $source, $preview = false, $suppress = false ) {
	$level = ob_get_level(); ob_start();
	$diagnostic = false;
	set_error_handler( static function( $severity, $message ) use ( &$diagnostic ) {
		if ( error_reporting() & $severity ) {
			$diagnostic = true;
			error_log( 'Lieve Custom Code PHP diagnostic [' . (int) $severity . ']: ' . $message ); // Private server log, never rendered source/paths.
		}
		return true;
	} );
	try {
		( static function( $code ) { eval( '?>' . $code ); } )( $source ); // phpcs:ignore Squiz.PHP.Eval.Discouraged -- signed administrator-authored code, explicit site opt-in.
		while ( ob_get_level() > $level + 1 ) { ob_end_flush(); }
		$output = ob_get_level() > $level ? ob_get_clean() : '';
		return $output . ( $preview && $diagnostic && ! $suppress ? '<p>PHP reported a warning or notice. Check the PHP error log.</p>' : '' );
	} catch ( Throwable $error ) {
		// Never disclose source, server paths or partially rendered output to visitors.
		error_log( 'Lieve Custom Code PHP exception: ' . $error->getMessage() );
		return $suppress ? '' : ( $preview ? '<p>PHP preview unavailable. Check your code and try again.</p>' : '<!-- Lieve Custom Code: PHP output unavailable. -->' );
	} finally { restore_error_handler(); while ( ob_get_level() > $level ) { ob_end_clean(); } }
}

/** Dynamic data is presentation only: resolve AFTER PHP, never interpolate into eval.
 * JS references are standalone JSON values; CSS references are conservative values. */
function lieve_custom_code_dynamic( $source, $language ) {
	if ( ! function_exists( 'lieve_dynamic_reference' ) || ! function_exists( 'lieve_dynamic_source_value' ) ) { return $source; }
	$pattern = '/\{\{lieve:[^{}\r\n]{1,1190}\}\}/';
	$replace = static function( $match ) use ( $language ) {
		$reference = lieve_dynamic_reference( $match[0] );
		if ( ! $reference || ! lieve_dynamic_accepts( $reference, 'text' ) ) { return ''; }
		$value = lieve_dynamic_source_value( $reference['source'], null, $reference['options'], 'text' );
		if ( 'js' === $language ) {
			$json = wp_json_encode( (string) $value, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT );
			// Encode every ASCII character too. A token incorrectly placed inside
			// quotes may be invalid JS, but cannot turn data into executable syntax.
			return '"' . preg_replace_callback( '/\\\\(?:u[0-9a-fA-F]{4}|.)|[^\\\\]/s', static function( $char ) { return '\\' === $char[0][0] ? $char[0] : sprintf( '\\u%04x', ord( $char[0] ) ); }, substr( $json, 1, -1 ) ) . '"';
		}
		if ( 'css' === $language ) {
			return preg_match( '/^[a-zA-Z0-9#%.,_ ()+\/*-]{0,2000}$/D', $value ) && ! preg_match( '/(?:url|expression|image-set|attr|var)\s*\(/i', $value ) ? $value : '';
		}
		return esc_html( $value );
	};
	if ( 'html' !== $language ) { return preg_replace_callback( $pattern, $replace, $source ); }
	// Raw script/style bodies use their dedicated fields, never HTML interpolation.
	$parts = preg_split( '~(<script\b[^>]*>.*?</script\s*>|<style\b[^>]*>.*?</style\s*>|<!--.*?-->|<[^>]*>)~is', $source, -1, PREG_SPLIT_DELIM_CAPTURE );
	foreach ( $parts as &$part ) {
		if ( ! preg_match( $pattern, $part ) || preg_match( '~^<(?:script\b|style\b|!--)~i', $part ) ) { continue; }
		$part = preg_replace_callback( $pattern, $replace, $part );
		if ( isset( $part[0] ) && '<' === $part[0] ) { $part = function_exists( 'lieve_safe_html' ) ? lieve_safe_html( $part ) : wp_kses_post( $part ); } // Keep theme-supported inert tags, validating dynamic attributes too.
	}
	unset( $part ); return implode( '', $parts );
}

/** Executable previews have an opaque origin and cannot access the builder DOM. */
function lieve_custom_code_preview_frame( $node, $html, $css, $js ) {
	$channel = str_replace( '-', '', wp_generate_uuid4() );
	$bridge = ( defined( 'LIEVE_URL' ) ? LIEVE_URL : '' ) . 'assets/js/code-preview-bridge.js';
	if ( function_exists( 'lieve_asset_version' ) ) { $bridge .= '?ver=' . rawurlencode( lieve_asset_version( 'assets/js/code-preview-bridge.js' ) ); }
	$post_id = (int) ( $GLOBALS['lieve_document_source_id'] ?? 0 );
	$base = function_exists( 'get_permalink' ) && $post_id ? get_permalink( $post_id ) : '';
	$baseline = ':where(*,:before,:after){box-sizing:border-box}:where(body){margin:0}:where(h1,h2,h3,h4,h5,h6,p,div,section,ul,ol,li,figure,button){margin:0;padding:0;border:0;background:transparent}:where(h1){font-size:2em}:where(h2){font-size:1.5em}:where(h3){font-size:1.17em}:where(h4){font-size:1em}:where(h5){font-size:.83em}:where(h6){font-size:.67em}';
	$document = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' . ( $base ? '<base href="' . esc_url( $base ) . '">' : '' ) . '<style>' . $baseline . '</style><style id="lieve-code-inheritance"></style><script src="' . esc_url( $bridge ) . '" data-channel="' . esc_attr( $channel ) . '"></script></head><body>' . $html;
	if ( '' !== trim( $css ) ) { $document .= '<style>' . str_replace( '<', '\\3c ', $css ) . '</style>'; }
	if ( '' !== trim( $js ) ) { $document .= wp_get_inline_script_tag( $js ); }
	$document .= '</body></html>';
	return '<iframe data-lieve-code-preview data-lieve-code-channel="' . esc_attr( $channel ) . '" data-lieve-code-node="' . esc_attr( $node['_lieveListingSourceId'] ?? $node['id'] ) . '" title="' . esc_attr( __( 'Custom Code preview', 'lieve-builder' ) ) . '" sandbox="allow-scripts" referrerpolicy="no-referrer" data-lieve-code-source="' . esc_attr( $document ) . '"></iframe>';
}

function lieve_render_custom_code( $node ) {
	list( $source, $css, $js ) = lieve_custom_code_sources( $node['_lieveCustomCodeSource'] ?? $node );
	$plain_html = $node['props']['content'] ?? '';
	$preview = ! empty( $GLOBALS['lieve_element_preview'] );
	$approved = lieve_custom_code_is_approved( $node, (int) ( $GLOBALS['lieve_document_source_id'] ?? 0 ) );
	$preview_author = $preview && lieve_can_author_custom_code() && ( empty($node['_lieveComponentScope']) || $approved );
	$execute = ( ! $preview && $approved || $preview_author && ! empty( $GLOBALS['lieve_custom_code_preview'] ) ) && function_exists( 'lieve_theme_setting' ) && lieve_theme_setting( 'execute_php' ) && lieve_custom_code_policy_allows_php();
	$php = $execute && lieve_custom_code_has_php( $source );
	if ( $preview && ! empty($node['_lieveComponentScope']) && ( !$approved || empty($node['props']['phpPreview']) ) ) { $php=false; }
	$suppress = ! empty( $node['props']['suppressPhpErrors'] );
	if ( ! empty( $GLOBALS['lieve_disable_php_preview'] ) ) { $php = false; }
	if ( $preview && !empty($node['_lieveComponentScope']) && lieve_custom_code_has_php($source) && !$php ) { echo '<p data-editor-ui>' . esc_html__('Shared Custom Code: live PHP preview is off or the model code needs an authorized Save.','lieve-builder') . '</p>'; return; }
	if ( $php ) {
		try {
			token_get_all( $source, TOKEN_PARSE );
			$html = preg_match( '/<\?(?!php\s|=)/i', $source ) ? ( $suppress ? '' : '<p>Use full PHP tags to preview this code.</p>' ) : lieve_custom_code_evaluate( $source, $preview, $suppress );
		} catch ( ParseError $error ) { $html = $suppress ? '' : ( $preview ? '<p>PHP syntax error. Correct your code to update the preview.</p>' : '<!-- Lieve Custom Code: PHP output unavailable. -->' ); }
	} else {
		$html = lieve_custom_code_html_only( lieve_custom_code_has_php( $source ) ? $source : $plain_html );
	}
	if ( ! empty( $node['props']['dynamicCode'] ) ) {
		$html = lieve_custom_code_dynamic( $html, 'html' ); $css = lieve_custom_code_dynamic( $css, 'css' ); $js = lieve_custom_code_dynamic( $js, 'js' );
	}
	// Sanitize after resolving: URL placeholders must not be mistaken for an
	// authored protocol, and dynamic text never becomes executable markup.
	if ( ! $php ) { $html = function_exists( 'lieve_safe_html' ) ? lieve_safe_html( $html ) : wp_kses_post( $html ); }
	if ( function_exists( 'lieve_component_code_markup' ) ) { $html = lieve_component_code_markup( $html, $node, $css ); }
	if ( $preview && ( $php || '' !== trim( $js ) && ( $approved || $preview_author ) ) ) {
		echo lieve_custom_code_preview_frame( $node, $html, $approved || $preview_author ? $css : '', $approved || $preview_author ? $js : '' ); return;
	}
	echo $html;
	if ( $approved || $preview_author ) {
		if ( '' !== trim( $css ) ) { echo '<style>' . str_replace( '<', '\\3c ', $css ) . '</style>'; }
		if ( ! $preview && '' !== trim( $js ) ) { echo wp_get_inline_script_tag( $js ); }
	}
}
