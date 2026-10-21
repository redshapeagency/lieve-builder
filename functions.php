<?php
/**
 * Lieve Builder bootstrap.
 *
 * @package LieveBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'LIEVE_VERSION', '1.0.3' );
define( 'LIEVE_PATH', trailingslashit( get_template_directory() ) );
define( 'LIEVE_URL', trailingslashit( get_template_directory_uri() ) );
define( 'LIEVE_LOGO_URL', LIEVE_URL . 'assets/images/lieve-logo.webp' );

require_once LIEVE_PATH . 'inc/bootstrap.php';
