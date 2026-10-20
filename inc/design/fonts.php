<?php
/** Local font library. Remote providers are contacted only on explicit admin import. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'LIEVE_FONTS_OPTION', 'lieve_fonts_v1' );

function lieve_fonts_data() {
	$data = get_option( LIEVE_FONTS_OPTION, array( 'families' => array() ) );
	return is_array( $data ) && isset( $data['families'] ) && is_array( $data['families'] ) ? $data : array( 'families' => array() );
}
function lieve_fonts_revision( $data = null ) { return hash( 'sha256', wp_json_encode( null === $data ? lieve_fonts_data() : $data ) ); }
function lieve_fonts_error( $message, $status = 400 ) { return new WP_Error( 'lieve_fonts_error', $message, array( 'status' => $status ) ); }
function lieve_font_name_valid( $name ) { return is_string( $name ) && 1 === preg_match( '/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,99}$/u', $name ); }
function lieve_font_weight_valid( $weight ) {
	if ( ! is_string( $weight ) || ! preg_match( '/^(\d{1,4})(?: (\d{1,4}))?$/', $weight, $m ) ) { return false; }
	return (int) $m[1] >= 1 && (int) $m[1] <= 1000 && ( ! isset( $m[2] ) || ( (int) $m[2] >= (int) $m[1] && (int) $m[2] <= 1000 ) );
}
/** Resolve only this module's files, never a client-supplied path or attachment. */
function lieve_font_directory( $create = false ) {
	$base = function_exists( 'wp_font_dir' ) ? wp_font_dir( $create ) : wp_upload_dir( null, $create );
	if ( ! empty( $base['error'] ) ) { return lieve_fonts_error( 'The local font directory is not writable.', 500 ); }
	$path = trailingslashit( $base['basedir'] ) . 'lieve-builder-fonts';
	if ( $create && ! wp_mkdir_p( $path ) ) { return lieve_fonts_error( 'The local font directory could not be created.', 500 ); }
	return array( 'path' => $path, 'url' => trailingslashit( $base['baseurl'] ) . 'lieve-builder-fonts' );
}
function lieve_font_file_valid( $file ) { return is_string( $file ) && 1 === preg_match( '/^[a-f0-9]{32}\.(?:woff2?|ttf|otf)$/D', $file ); }
function lieve_font_url( $file ) {
	$dir = lieve_font_directory();
	return ! is_wp_error( $dir ) && lieve_font_file_valid( $file ) ? $dir['url'] . '/' . $file : '';
}
/** Check signatures, declared sizes and SFNT table boundaries before storing bytes. */
function lieve_font_format( $bytes ) {
	$size = strlen( $bytes );
	if ( $size < 48 || $size > 5 * 1024 * 1024 ) { return false; }
	$magic = substr( $bytes, 0, 4 );
	if ( 'wOF2' === $magic || 'wOFF' === $magic ) {
		$length = unpack( 'N', substr( $bytes, 8, 4 ) )[1];
		$tables = unpack( 'n', substr( $bytes, 12, 2 ) )[1];
		$expanded = unpack( 'N', substr( $bytes, 16, 4 ) )[1];
		return $length === $size && $tables > 0 && $tables <= 4096 && $expanded <= 64 * 1024 * 1024 ? ( 'wOF2' === $magic ? 'woff2' : 'woff' ) : false;
	}
	if ( "\x00\x01\x00\x00" !== $magic && 'OTTO' !== $magic && 'true' !== $magic ) { return false; }
	$tables = unpack( 'n', substr( $bytes, 4, 2 ) )[1];
	if ( ! $tables || $tables > 4096 || 12 + 16 * $tables > $size ) { return false; }
	for ( $i = 0; $i < $tables; $i++ ) {
		$entry = unpack( 'Noffset/Nlength', substr( $bytes, 12 + 16 * $i + 8, 8 ) );
		if ( $entry['offset'] > $size || $entry['length'] > $size - $entry['offset'] ) { return false; }
	}
	return 'OTTO' === $magic ? 'otf' : 'ttf';
}
function lieve_font_store( $bytes ) {
	$format = lieve_font_format( $bytes );
	if ( ! $format ) { return lieve_fonts_error( 'Invalid font file. Use a valid WOFF2, WOFF, TTF or OTF file, up to 5 MB.' ); }
	$dir = lieve_font_directory( true );
	if ( is_wp_error( $dir ) ) { return $dir; }
	$file = str_replace( '-', '', wp_generate_uuid4() ) . '.' . $format;
	if ( strlen( $bytes ) !== file_put_contents( $dir['path'] . '/' . $file, $bytes, LOCK_EX ) ) { wp_delete_file( $dir['path'] . '/' . $file ); return lieve_fonts_error( 'The font file could not be stored.', 500 ); }
	@chmod( $dir['path'] . '/' . $file, 0644 );
	return array( 'id' => wp_generate_uuid4(), 'file' => $file, 'format' => $format, 'size' => strlen( $bytes ), 'hash' => hash( 'sha256', $bytes ), 'preload' => false );
}
/** Roll back only files created by this failed import. Installed/archived files are retained. */
function lieve_font_rollback( $faces ) {
	$dir = lieve_font_directory();
	if ( is_wp_error( $dir ) ) { return; }
	foreach ( $faces as $face ) { if ( lieve_font_file_valid( $face['file'] ?? '' ) ) { wp_delete_file( $dir['path'] . '/' . $face['file'] ); } }
}
function lieve_fonts_response( $data = null ) {
	$data = null === $data ? lieve_fonts_data() : $data;
	return rest_ensure_response( array( 'data' => $data, 'revision' => lieve_fonts_revision( $data ), 'css' => lieve_fonts_css( $data ), 'previewCss' => lieve_fonts_css( $data, true ), 'choices' => lieve_font_choices( $data ) ) );
}
/** Compare-and-save under a short-lived unique lock; never silently overwrite another tab. */
function lieve_fonts_write( $revision, $callback ) {
	$lock = 'lieve_fonts_lock'; $token = wp_generate_uuid4(); $value = time() . ':' . $token;
	$old = get_option( $lock );
	if ( $old && time() - (int) $old > 120 ) {
		global $wpdb;
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s", $lock, $old ) );
		wp_cache_delete( $lock, 'options' ); wp_cache_delete( 'notoptions', 'options' );
	}
	if ( ! add_option( $lock, $value, '', false ) ) { return lieve_fonts_error( 'Another font operation is in progress. Try again in a moment.', 409 ); }
	try {
		$data = lieve_fonts_data();
		if ( ! is_string( $revision ) || ! hash_equals( lieve_fonts_revision( $data ), $revision ) ) { return lieve_fonts_error( 'Fonts changed in another tab. Reload before saving; your draft has not been overwritten.', 409 ); }
		$next = $callback( $data );
		if ( is_wp_error( $next ) ) { return $next; }
		if ( false === update_option( LIEVE_FONTS_OPTION, $next, false ) && lieve_fonts_revision() !== lieve_fonts_revision( $next ) ) { return lieve_fonts_error( 'Fonts could not be saved. Your changes are still available.', 500 ); }
		return lieve_fonts_response( $next );
	} finally { if ( get_option( $lock ) === $value ) { delete_option( $lock ); } }
}
/** Metadata may change; paths, hashes and face identity can only be assigned by imports. */
function lieve_fonts_normalize( $raw, $saved ) {
	if ( ! is_array( $raw ) || ! isset( $raw['families'] ) || ! is_array( $raw['families'] ) || count( $raw['families'] ) !== count( $saved['families'] ) ) { return lieve_fonts_error( 'The font library is incomplete. Reload before saving.' ); }
	$result = array( 'families' => array() ); $seen = array(); $preloads = 0;
	$families = array_column( $saved['families'], null, 'id' );
	foreach ( $raw['families'] as $item ) {
		if ( ! is_array( $item ) ) { return lieve_fonts_error( 'Invalid font family.' ); }
		$id = $item['id'] ?? '';
		if ( ! is_string( $id ) || isset( $seen[ $id ] ) || ! isset( $families[ $id ] ) ) { return lieve_fonts_error( 'Unknown or duplicated font family.' ); }
		$seen[ $id ] = true; $family = $families[ $id ];
		foreach ( array( 'enabled', 'archived' ) as $flag ) { if ( ! isset( $item[ $flag ] ) || ! is_bool( $item[ $flag ] ) ) { return lieve_fonts_error( 'Invalid font activation state.' ); } $family[ $flag ] = $item[ $flag ]; }
		$label = $item['label'] ?? ''; $notes = $item['notes'] ?? '';
		if ( ! is_string( $label ) || ! trim( $label ) || strlen( $label ) > 150 || ! is_string( $notes ) || strlen( $notes ) > 2000 ) { return lieve_fonts_error( 'Provide a font label (up to 150 characters) and notes up to 2,000 characters.' ); }
		$family['label'] = sanitize_text_field( $label ); $family['notes'] = sanitize_textarea_field( $notes );
		if ( ! in_array( $item['fallback'] ?? '', array( 'sans-serif', 'serif', 'monospace', 'cursive', 'system-ui' ), true ) || ! in_array( $item['display'] ?? '', array( 'swap', 'optional', 'fallback', 'block', 'auto' ), true ) ) { return lieve_fonts_error( 'Invalid fallback or font-display value.' ); }
		$family['fallback'] = $item['fallback']; $family['display'] = $item['display'];
		if ( ! isset( $item['faces'] ) || ! is_array( $item['faces'] ) || count( $item['faces'] ) !== count( $family['faces'] ) ) { return lieve_fonts_error( 'Font files cannot be removed through metadata changes.' ); }
		$faces = array_column( $family['faces'], null, 'id' ); $face_ids = array(); $family['faces'] = array();
		foreach ( $item['faces'] as $face ) {
			if ( ! is_array( $face ) ) { return lieve_fonts_error( 'Invalid font face.' ); }
			$fid = $face['id'] ?? '';
			if ( ! is_string( $fid ) || isset( $face_ids[ $fid ] ) || ! isset( $faces[ $fid ] ) || ! isset( $face['preload'] ) || ! is_bool( $face['preload'] ) ) { return lieve_fonts_error( 'Invalid font file metadata.' ); }
			$face_ids[ $fid ] = true; $original = $faces[ $fid ];
			if ( 'custom' === $family['source'] ) {
				if ( ! lieve_font_weight_valid( $face['weight'] ?? null ) || ! in_array( $face['style'] ?? '', array( 'normal', 'italic' ), true ) ) { return lieve_fonts_error( 'Use a weight from 1–1000, or a range such as 100 900, and a valid font style.' ); }
				$original['weight'] = $face['weight']; $original['style'] = $face['style'];
			}
			$original['preload'] = $face['preload'];
			if ( $family['enabled'] && ! $family['archived'] && $face['preload'] ) { $preloads++; }
			$family['faces'][] = $original;
		}
		$keys = array();
		foreach ( $family['faces'] as $face ) { $key = $face['weight'] . ':' . $face['style']; if ( isset( $keys[ $key ] ) ) { return lieve_fonts_error( 'A family cannot contain two files with the same weight and style.' ); } $keys[ $key ] = true; }
		$result['families'][] = $family;
	}
	return $preloads > 2 ? lieve_fonts_error( 'Preload at most two font files. Other faces load only when used.' ) : $result;
}
function lieve_font_choices( $data = null ) {
	$result = array();
	foreach ( ( null === $data ? lieve_fonts_data() : $data )['families'] as $family ) {
		if ( $family['enabled'] && ! $family['archived'] ) { $result[] = array( 'label' => $family['label'], 'value' => '"' . $family['name'] . '", ' . $family['fallback'] ); }
	}
	return $result;
}
function lieve_fonts_css( $data = null, $include_inactive = false ) {
	$css = ''; $formats = array( 'woff2' => 'woff2', 'woff' => 'woff', 'ttf' => 'truetype', 'otf' => 'opentype' );
	foreach ( ( null === $data ? lieve_fonts_data() : $data )['families'] as $family ) {
		if ( ( ! $include_inactive && ( ! $family['enabled'] || $family['archived'] ) ) || ! lieve_font_name_valid( $family['name'] ) ) { continue; }
		foreach ( $family['faces'] as $face ) {
			$url = lieve_font_url( $face['file'] );
			if ( ! $url || ! isset( $formats[ $face['format'] ] ) || ! lieve_font_weight_valid( $face['weight'] ) || ! in_array( $face['style'], array( 'normal', 'italic' ), true ) ) { continue; }
			$display = in_array( $family['display'], array( 'swap', 'optional', 'fallback', 'block', 'auto' ), true ) ? $family['display'] : 'swap';
			$css .= '@font-face{font-family:' . wp_json_encode( $family['name'] ) . ';src:url(' . wp_json_encode( $url ) . ') format("' . $formats[ $face['format'] ] . '");font-weight:' . $face['weight'] . ';font-style:' . $face['style'] . ';font-display:' . $display . ';}';
		}
	}
	return $css;
}
function lieve_enqueue_local_fonts() {
	$css = lieve_fonts_css();
	if ( function_exists( 'lieve_enqueue_generated_css' ) ) { lieve_enqueue_generated_css( 'lieve-generated-fonts', $css ); }
	elseif ( $css ) { wp_add_inline_style( 'lieve-style', $css ); }
}
add_action( 'wp_enqueue_scripts', 'lieve_enqueue_local_fonts', 25 );
function lieve_preload_local_fonts() {
	if ( function_exists( 'lieve_theme_setting' ) && ! lieve_theme_setting( 'preload_fonts' ) ) { return; }
	$seen = array();
	foreach ( lieve_fonts_data()['families'] as $family ) {
		if ( ! $family['enabled'] || $family['archived'] ) { continue; }
		foreach ( $family['faces'] as $face ) {
			$url = lieve_font_url( $face['file'] );
			if ( ! empty( $face['preload'] ) && $url && ! isset( $seen[ $url ] ) && count( $seen ) < 2 && in_array( $face['format'], array( 'woff2', 'woff', 'ttf', 'otf' ), true ) ) {
				$seen[ $url ] = true;
				echo '<link rel="preload" href="' . esc_url( $url ) . '" as="font" type="font/' . esc_attr( $face['format'] ) . '" crossorigin="anonymous">';
			}
		}
	}
}
add_action( 'wp_head', 'lieve_preload_local_fonts', 3 );

/** WordPress' official catalogue. No browser requests to Google and no API key. */
function lieve_google_font_catalog() {
	$cached = get_transient( 'lieve_google_fonts_catalog_v1' );
	if ( is_array( $cached ) && $cached ) { return $cached; }
	if ( function_exists( 'wp_get_font_collection' ) && wp_get_font_collection( 'google-fonts' ) ) { $data = wp_get_font_collection( 'google-fonts' )->get_data(); }
	else {
		$response = wp_safe_remote_get( 'https://s.w.org/images/fonts/wp-7.1/collections/google-fonts-with-preview.json', array( 'timeout' => 20, 'limit_response_size' => 8 * 1024 * 1024 ) );
		$data = ! is_wp_error( $response ) && 200 === wp_remote_retrieve_response_code( $response ) ? json_decode( wp_remote_retrieve_body( $response ), true ) : null;
	}
	if ( is_wp_error( $data ) || ! is_array( $data ) || empty( $data['font_families'] ) ) { return lieve_fonts_error( 'The Google Fonts catalogue is unavailable. Retry or upload font files instead.', 502 ); }
	$catalog = array();
	foreach ( $data['font_families'] as $entry ) {
		$settings = $entry['font_family_settings'] ?? array(); $name = $settings['name'] ?? '';
		if ( ! lieve_font_name_valid( $name ) ) { continue; }
		$faces = array();
		foreach ( $settings['fontFace'] ?? array() as $face ) {
			$src = $face['src'] ?? ''; $src = is_array( $src ) ? reset( $src ) : $src;
			$weight = (string) ( $face['fontWeight'] ?? '400' ); $style = $face['fontStyle'] ?? 'normal';
			if ( ! lieve_google_font_url_valid( $src ) || ! lieve_font_weight_valid( $weight ) || ! in_array( $style, array( 'normal', 'italic' ), true ) ) { continue; }
			$id = substr( hash( 'sha256', $src . $weight . $style ), 0, 16 );
			$faces[] = array( 'id' => $id, 'weight' => $weight, 'style' => $style, 'url' => $src );
		}
		if ( $faces ) { $catalog[] = array( 'id' => sanitize_title( $settings['slug'] ?? $name ), 'name' => $name, 'category' => $entry['categories'][0] ?? 'sans-serif', 'faces' => $faces ); }
	}
	if ( ! $catalog ) { return lieve_fonts_error( 'No compatible font files were found in the catalogue.', 502 ); }
	set_transient( 'lieve_google_fonts_catalog_v1', $catalog, DAY_IN_SECONDS );
	return $catalog;
}
function lieve_google_font_url_valid( $url ) {
	$p = is_string( $url ) ? wp_parse_url( $url ) : false;
	return $p && 'https' === ( $p['scheme'] ?? '' ) && 'fonts.gstatic.com' === ( $p['host'] ?? '' ) && ! isset( $p['user'] ) && ! isset( $p['pass'] ) && ! isset( $p['port'] ) && 0 === strpos( $p['path'] ?? '', '/s/' );
}
function lieve_font_import_family( $revision, $name, $source, $faces, $category = 'sans-serif' ) {
	$result = lieve_fonts_write( $revision, function( $data ) use ( $name, $source, $faces, $category ) {
		$index = null;
		foreach ( $data['families'] as $i => $existing ) { if ( strtolower( $existing['name'] ) === strtolower( $name ) ) { $index = $i; break; } }
		if ( null === $index ) {
			if ( count( $data['families'] ) >= 200 ) { return lieve_fonts_error( 'The library supports up to 200 families. Reuse an installed family.' ); }
			$data['families'][] = array( 'id' => wp_generate_uuid4(), 'name' => $name, 'label' => $name, 'source' => $source, 'enabled' => true, 'archived' => false, 'fallback' => in_array( $category, array( 'serif', 'monospace', 'cursive' ), true ) ? $category : 'sans-serif', 'display' => 'swap', 'notes' => '', 'faces' => array() );
			$index = count( $data['families'] ) - 1;
		}
		$family = &$data['families'][ $index ];
		if ( $family['source'] !== $source ) { return lieve_fonts_error( 'That CSS family name belongs to a different source. Use a different name.' ); }
		if ( count( $family['faces'] ) + count( $faces ) > 40 ) { return lieve_fonts_error( 'A family supports up to 40 font faces.' ); }
		foreach ( $faces as $face ) { foreach ( $family['faces'] as $existing ) { if ( $existing['hash'] === $face['hash'] || ( $existing['weight'] === $face['weight'] && $existing['style'] === $face['style'] ) ) { return lieve_fonts_error( 'This family already contains that font face. Your installed files were not changed.' ); } } $family['faces'][] = $face; }
		$family['archived'] = false;
		return $data;
	} );
	if ( is_wp_error( $result ) ) { lieve_font_rollback( $faces ); }
	return $result;
}
function lieve_register_font_routes() {
	$manage = function() { return current_user_can( 'manage_options' ) && current_user_can( 'upload_files' ); };
	register_rest_route( 'lieve/v1', '/fonts', array(
		array( 'methods' => WP_REST_Server::READABLE, 'callback' => function() { return current_user_can( 'manage_options' ) ? lieve_fonts_response() : rest_ensure_response( array( 'css' => lieve_fonts_css(), 'choices' => lieve_font_choices() ) ); }, 'permission_callback' => function() { return current_user_can( 'edit_posts' ); } ),
		array( 'methods' => WP_REST_Server::EDITABLE, 'callback' => function( $request ) { $body = $request->get_json_params(); return lieve_fonts_write( $body['revision'] ?? null, function( $data ) use ( $body ) { return lieve_fonts_normalize( $body['data'] ?? null, $data ); } ); }, 'permission_callback' => $manage ),
	) );
	register_rest_route( 'lieve/v1', '/fonts/catalog', array( 'methods' => WP_REST_Server::READABLE, 'permission_callback' => $manage, 'callback' => function() {
		$catalog = lieve_google_font_catalog(); if ( is_wp_error( $catalog ) ) { return $catalog; }
		foreach ( $catalog as &$family ) { foreach ( $family['faces'] as &$face ) { unset( $face['url'] ); } unset( $face ); } unset( $family );
		return rest_ensure_response( $catalog );
	} ) );
	register_rest_route( 'lieve/v1', '/fonts/google', array( 'methods' => WP_REST_Server::CREATABLE, 'permission_callback' => $manage, 'args' => array( 'family' => array( 'type' => 'string', 'required' => true ), 'faces' => array( 'type' => 'array', 'items' => array( 'type' => 'string' ), 'minItems' => 1, 'maxItems' => 12, 'required' => true ), 'revision' => array( 'type' => 'string', 'required' => true ) ), 'callback' => 'lieve_rest_install_google_font' ) );
	register_rest_route( 'lieve/v1', '/fonts/upload', array( 'methods' => WP_REST_Server::CREATABLE, 'permission_callback' => $manage, 'args' => array( 'family' => array( 'type' => 'string', 'required' => true ), 'weight' => array( 'type' => 'string', 'required' => true ), 'style' => array( 'type' => 'string', 'enum' => array( 'normal', 'italic' ), 'required' => true ), 'revision' => array( 'type' => 'string', 'required' => true ) ), 'callback' => 'lieve_rest_upload_font' ) );
}
add_action( 'rest_api_init', 'lieve_register_font_routes' );
function lieve_rest_install_google_font( $request ) {
	$catalog = lieve_google_font_catalog(); if ( is_wp_error( $catalog ) ) { return $catalog; }
	$family = null;
	foreach ( $catalog as $candidate ) { if ( $candidate['id'] === $request['family'] ) { $family = $candidate; break; } }
	$ids = $request['faces'];
	if ( ! $family || ! is_array( $ids ) || ! count( $ids ) || count( $ids ) > 12 || count( array_unique( $ids ) ) !== count( $ids ) ) { return lieve_fonts_error( 'Choose a Google family and 1–12 distinct faces.' ); }
	$choices = array_column( $family['faces'], null, 'id' );
	foreach ( $ids as $id ) { if ( ! isset( $choices[ $id ] ) ) { return lieve_fonts_error( 'An unknown font face was selected.' ); } }
	if ( ! hash_equals( lieve_fonts_revision(), (string) $request['revision'] ) ) { return lieve_fonts_error( 'Fonts changed in another tab. Reload before installing.', 409 ); }
	$faces = array(); $total = 0;
	foreach ( $ids as $id ) {
		$face = $choices[ $id ];
		$response = wp_safe_remote_get( $face['url'], array( 'timeout' => 20, 'redirection' => 0, 'limit_response_size' => 5 * 1024 * 1024 + 1 ) );
		if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) { lieve_font_rollback( $faces ); return lieve_fonts_error( 'A font file could not be downloaded. Nothing was installed; try fewer faces or retry.', 502 ); }
		$bytes = wp_remote_retrieve_body( $response ); $total += strlen( $bytes );
		if ( $total > 20 * 1024 * 1024 ) { lieve_font_rollback( $faces ); return lieve_fonts_error( 'The selected faces exceed 20 MB. Install fewer faces.' ); }
		$stored = lieve_font_store( $bytes );
		if ( is_wp_error( $stored ) ) { lieve_font_rollback( $faces ); return $stored; }
		$stored['weight'] = $face['weight']; $stored['style'] = $face['style']; $stored['original'] = $family['name'] . ' ' . $face['weight'] . ' ' . $face['style']; $faces[] = $stored;
	}
	return lieve_font_import_family( $request['revision'], $family['name'], 'google', $faces, $family['category'] );
}
function lieve_rest_upload_font( $request ) {
	$name = $request['family']; $weight = $request['weight']; $style = $request['style'];
	if ( ! hash_equals( lieve_fonts_revision(), (string) $request['revision'] ) ) { return lieve_fonts_error( 'Fonts changed in another tab. Reload before uploading.', 409 ); }
	if ( ! lieve_font_name_valid( $name ) || ! lieve_font_weight_valid( $weight ) || ! in_array( $style, array( 'normal', 'italic' ), true ) ) { return lieve_fonts_error( 'Enter a family name, a weight such as 400 or 100 900, and a valid style.' ); }
	$file = $request->get_file_params()['file'] ?? null;
	if ( ! is_array( $file ) || UPLOAD_ERR_OK !== ( $file['error'] ?? -1 ) || ! is_string( $file['tmp_name'] ?? null ) || ! is_uploaded_file( $file['tmp_name'] ) || filesize( $file['tmp_name'] ) > 5 * 1024 * 1024 ) { return lieve_fonts_error( 'Choose a font file up to 5 MB and retry the upload.' ); }
	if ( ! is_string( $file['name'] ?? null ) ) { return lieve_fonts_error( 'The uploaded font needs a valid file name.' ); }
	$extension = strtolower( pathinfo( $file['name'], PATHINFO_EXTENSION ) ); $bytes = file_get_contents( $file['tmp_name'] );
	if ( false === $bytes ) { return lieve_fonts_error( 'The uploaded font could not be read. Please retry.', 500 ); }
	if ( ! in_array( $extension, array( 'woff2', 'woff', 'ttf', 'otf' ), true ) || lieve_font_format( $bytes ) !== $extension ) { return lieve_fonts_error( 'The font file contents do not match its extension. SVG fonts and archives are not supported.' ); }
	$face = lieve_font_store( $bytes ); if ( is_wp_error( $face ) ) { return $face; }
	$face['weight'] = $weight; $face['style'] = $style; $face['original'] = sanitize_file_name( $file['name'] );
	return lieve_font_import_family( $request['revision'], $name, 'custom', array( $face ) );
}
