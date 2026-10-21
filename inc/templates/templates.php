<?php
/** Module facade: explicit loading, stable public functions and data keys. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'LIEVE_TEMPLATE_POST_TYPE', 'lieve_template' );
define( 'LIEVE_TEMPLATE_TYPE_META', '_lieve_template_type' );
define( 'LIEVE_TEMPLATE_CONDITION_META', '_lieve_template_condition' );
define( 'LIEVE_TEMPLATE_CONDITIONS_META', '_lieve_template_conditions' );
require_once __DIR__ . '/expansion.php';
require_once __DIR__ . '/popups.php';

require_once __DIR__ . '/types.php';
require_once __DIR__ . '/conditions-schema.php';
require_once __DIR__ . '/condition-options.php';
require_once __DIR__ . '/repository.php';
require_once __DIR__ . '/conditions-resolver.php';
require_once __DIR__ . '/template-library.php';
require_once __DIR__ . '/admin.php';
require_once __DIR__ . '/views.php';
require_once __DIR__ . '/rest.php';
require_once __DIR__ . '/hooks.php';
