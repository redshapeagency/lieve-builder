<?php
/** Conservative generated-CSS lifecycle; static snapshots always retain dependencies. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Fail closed if the snapshot inventory cannot be completely inspected. */
function lieve_static_css_dependencies() {
	$root = function_exists( 'lieve_static_directory' ) ? lieve_static_directory()['path'] . '/pages' : '';
	if ( ! $root || ! file_exists( $root ) ) { return array(); }
	if ( is_link( $root ) || ! is_readable( $root ) ) { return false; }
	$used = array(); $count = 0; $bytes = 0;
	try {
		$iterator = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $root, FilesystemIterator::SKIP_DOTS ) );
		foreach ( $iterator as $file ) {
			if ( $file->isLink() ) { return false; }
			if ( 'index.html' !== $file->getFilename() ) { continue; }
			if ( ++$count > 2000 || ! $file->isReadable() || $file->getSize() > 4000000 || ( $bytes += $file->getSize() ) > 64000000 ) { return false; }
			$html = file_get_contents( $file->getPathname() ); if ( false === $html ) { return false; }
			preg_match_all( '#lieve-builder-css/([a-f0-9]{64}\.css)#', $html, $matches );
			foreach ( $matches[1] as $name ) { $used[ $name ] = true; }
		}
	} catch ( Throwable $error ) { return false; }
	return $used;
}

/** Deletes only old, unreferenced content-hash files inside the exact cache directory. */
function lieve_prune_generated_css() {
	return lieve_with_template_lock( 'generated-css-retention', static function() {
		$uploads = wp_upload_dir( null, false );
		if ( ! empty( $uploads['error'] ) || empty( $uploads['basedir'] ) ) { return array( 'deleted' => 0, 'skipped' => 'uploads-unavailable' ); }
		$directory = trailingslashit( $uploads['basedir'] ) . 'lieve-builder-css';
		if ( ! is_dir( $directory ) || is_link( $directory ) ) { return array( 'deleted' => 0 ); }
		$used = lieve_static_css_dependencies();
		if ( false === $used ) { return array( 'deleted' => 0, 'skipped' => 'snapshot-inventory-incomplete' ); }
		$cutoff = time() - max( 30, min( 365, (int) apply_filters( 'lieve_generated_css_retention_days', 90 ) ) ) * DAY_IN_SECONDS;
		$deleted = 0;
		foreach ( new DirectoryIterator( $directory ) as $file ) {
			$name = $file->getFilename();
			if ( ! preg_match( '/^[a-f0-9]{64}\.css$/D', $name ) || isset( $used[ $name ] ) || ! $file->isFile() || $file->isLink() || $file->getMTime() >= $cutoff ) { continue; }
			$path = $file->getPathname(); clearstatcache( true, $path );
			if ( is_file( $path ) && ! is_link( $path ) && filemtime( $path ) < $cutoff ) { wp_delete_file( $path ); if ( ! file_exists( $path ) ) { $deleted++; } }
			if ( $deleted >= 200 ) { break; } // Bound work; the next weekly run continues.
		}
		return array( 'deleted' => $deleted );
	} );
}
add_action( 'lieve_generated_css_cleanup', 'lieve_prune_generated_css' );
add_action( 'init', static function() { if ( ! wp_next_scheduled( 'lieve_generated_css_cleanup' ) ) { wp_schedule_event( time() + DAY_IN_SECONDS, 'weekly', 'lieve_generated_css_cleanup' ); } } );
add_action( 'switch_theme', static function() { wp_clear_scheduled_hook( 'lieve_generated_css_cleanup' ); } );
