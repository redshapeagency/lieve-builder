<?php
/** Hook registrations in their established order. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_head', 'lieve_print_design_css', 30 );
add_action( 'rest_api_init', 'lieve_register_design_routes' );
