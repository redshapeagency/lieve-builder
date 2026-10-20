<?php
/** Module facade: explicit loading, stable public functions and data keys. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'LIEVE_DESIGN_OPTION', 'lieve_design_system' );
define( 'LIEVE_VARIABLE_PAGE_SIZE', 100 );

require_once __DIR__ . '/token-schema.php';
require_once __DIR__ . '/token-storage.php';
require_once __DIR__ . '/token-css.php';
require_once __DIR__ . '/token-rest.php';
require_once __DIR__ . '/token-assets.php';
require_once __DIR__ . '/token-views.php';
require_once __DIR__ . '/hooks.php';
