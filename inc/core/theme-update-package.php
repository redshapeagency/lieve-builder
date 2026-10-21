<?php
/** Read-only inspection of a GitHub-digest-verified ZIP; no external manifest. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_update_validate_headers( $css, $version, $functions = null ) {
	$h = lieve_update_headers( $css );
	if ( ! $version || $h['Theme Name'] !== 'Lieve Builder' || $h['Version'] !== $version || $h['Update URI'] !== LIEVE_UPDATE_URI || $h['Text Domain'] !== 'lieve-builder' || $h['Template'] !== '' || ( null !== $functions && ! preg_match( '/define\s*\(\s*[\'\"]LIEVE_VERSION[\'\"]\s*,\s*[\'\"]' . preg_quote( $version, '/' ) . '[\'\"]\s*\)/', $functions ) ) ) { return new WP_Error( 'lieve_update_identity', __( 'The theme identity or version does not match the verified release.', 'lieve-builder' ) ); }
	foreach ( array( 'Requires at least', 'Requires PHP' ) as $key ) { if ( ! preg_match( '/^[0-9]+(?:\.[0-9]+){1,3}$/D', $h[ $key ] ) ) { return new WP_Error( 'lieve_update_requirements', __( 'The theme compatibility requirements are invalid.', 'lieve-builder' ) ); } }
	return array( 'version' => $version, 'requires' => $h['Requires at least'], 'requires_php' => $h['Requires PHP'] );
}

/** ZIP32 regular files, stored/deflated, no encryption, descriptors or traversal.
 * This is the format emitted by our packager. Validate local AND central records,
 * expanded sizes/CRC before WordPress unpacks anything. Works without ext-zip.
 */
function lieve_update_zip_inventory( $file, $version ) {
	$bad = new WP_Error( 'lieve_update_zip', __( 'The ZIP structure, paths or contents could not be verified. Nothing has been installed.', 'lieve-builder' ) );
	if ( is_string( $file ) ) { clearstatcache( true, $file ); }
	$size = is_string( $file ) && is_file( $file ) ? filesize( $file ) : 0;
	if ( $size < 22 || $size > LIEVE_UPDATE_MAX_BYTES || ! function_exists( 'gzinflate' ) ) { return $bad; }
	$stream = @fopen( $file, 'rb' ); if ( ! $stream ) { return $bad; }
	$read = static function( $offset, $length ) use ( $stream, $size ) {
		if ( $offset < 0 || $length < 0 || $offset + $length > $size || fseek( $stream, $offset ) !== 0 ) { return false; }
		if ( ! $length ) { return ''; }
		$data = fread( $stream, $length ); return is_string( $data ) && strlen( $data ) === $length ? $data : false;
	};
	$u16 = static function( $s, $at ) { return unpack( 'v', substr( $s, $at, 2 ) )[1]; };
	$u32 = static function( $s, $at ) { return unpack( 'V', substr( $s, $at, 4 ) )[1]; };
	try {
		$end = $read( $size - 22, 22 );
		if ( ! $end || substr( $end, 0, 4 ) !== "PK\x05\x06" || $u16( $end, 4 ) || $u16( $end, 6 ) || $u16( $end, 20 ) ) { return $bad; }
		$count = $u16( $end, 10 ); $start = $u32( $end, 16 );
		if ( ! $count || $count > 10000 || $u16( $end, 8 ) !== $count || $start + $u32( $end, 12 ) !== $size - 22 ) { return $bad; }
		$cursor = $start; $local = 0; $total = 0; $directories = 0; $inventory = array(); $listed = array(); $paths = array(); $css = ''; $functions = '';
		for ( $i = 0; $i < $count; $i++ ) {
			$central = $read( $cursor, 46 );
			if ( ! $central || substr( $central, 0, 4 ) !== "PK\x01\x02" ) { return $bad; }
			$n = $u16( $central, 28 ); $extra = $u16( $central, 30 ); $comment = $u16( $central, 32 ); $flags = $u16( $central, 8 ); $method = $u16( $central, 10 );
			$compressed = $u32( $central, 20 ); $expanded = $u32( $central, 24 ); $crc = $u32( $central, 16 ); $offset = $u32( $central, 42 );
			$name = $read( $cursor + 46, $n ); $cursor += 46 + $n + $extra + $comment;
			if ( ! $name || $extra || $comment || $cursor > $size - 22 || $u16( $central, 34 ) || ( $flags & ~0x806 ) || ! in_array( $method, array( 0, 8 ), true ) || $offset !== $local || $expanded > LIEVE_UPDATE_MAX_BYTES - $total || substr( $name, 0, 14 ) !== 'lieve-builder/' || preg_match( '//u', $name ) !== 1 ) { return $bad; }
			$directory = substr( $name, -1 ) === '/'; $relative = substr( $name, 14 ); $key = strtolower( rtrim( $name, '/' ) );
			$mode = ( $u32( $central, 38 ) >> 16 ) & 0170000;
			if ( isset( $listed[ $key ] ) || ( $mode && $mode !== ( $directory ? 0040000 : 0100000 ) ) || ( $relative !== '' && ! lieve_update_file_path( rtrim( $relative, '/' ) ) ) || ( ! $directory && ( $relative === '' || $relative === 'DEVELOPMENT-ONLY.txt' ) ) || ( $directory && $expanded !== 0 ) ) { return $bad; }
			$listed[ $key ] = true;
			$parts = explode( '/', rtrim( $name, '/' ) );
			if ( count( $parts ) > 22 ) { return $bad; }
			$prefix = ''; foreach ( $parts as $j => $part ) { $prefix .= ( $prefix ? '/' : '' ) . strtolower( $part ); $type = $j === count( $parts ) - 1 && ! $directory ? 'f' : 'd'; if ( isset( $paths[ $prefix ] ) && $paths[ $prefix ] !== $type ) { return $bad; } if ( ! isset( $paths[ $prefix ] ) && $type === 'd' && ++$directories > 5000 ) { return $bad; } $paths[ $prefix ] = $type; }
			$header = $read( $local, 30 );
			if ( ! $header || substr( $header, 0, 4 ) !== "PK\x03\x04" || $u16( $header, 6 ) !== $flags || $u16( $header, 8 ) !== $method || $u32( $header, 14 ) !== $crc || $u32( $header, 18 ) !== $compressed || $u32( $header, 22 ) !== $expanded || $u16( $header, 26 ) !== $n || $u16( $header, 28 ) || $read( $local + 30, $n ) !== $name ) { return $bad; }
			$data_start = $local + 30 + $n + $u16( $header, 28 ); $local = $data_start + $compressed;
			if ( $local > $start ) { return $bad; }
			$data = $read( $data_start, $compressed ); if ( false === $data ) { return $bad; }
			$content = $method === 8 ? @gzinflate( $data, max( 1, $expanded + 1 ) ) : $data;
			if ( ! is_string( $content ) || strlen( $content ) !== $expanded || hash( 'crc32b', $content ) !== bin2hex( pack( 'N', $crc ) ) ) { return $bad; }
			$total += $expanded;
			if ( $directory ) { continue; }
			if ( count( $inventory ) >= 5000 ) { return $bad; }
			$inventory[] = array( 'file' => $relative, 'sha256' => hash( 'sha256', $content ), 'size' => $expanded );
			if ( $relative === 'style.css' ) { $css = substr( $content, 0, 8192 ); } elseif ( $relative === 'functions.php' ) { $functions = $content; }
		}
		if ( $cursor !== $size - 22 || $local !== $start || ! $css || ! $functions ) { return $bad; }
		$headers = lieve_update_validate_headers( $css, $version, $functions );
		if ( is_wp_error( $headers ) ) { return $headers; }
		if ( ! lieve_update_compatible( $headers ) ) { return new WP_Error( 'lieve_update_incompatible', __( 'The ZIP requires a newer WordPress or PHP version.', 'lieve-builder' ) ); }
		return array_merge( $headers, array( 'files' => $inventory ) );
	} finally { fclose( $stream ); }
}
