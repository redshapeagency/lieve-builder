<?php
/**
 * Explicit module loading in dependency order.
 *
 * @package LieveBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Preserve initialization order: domain folders do not imply independent modules.
require_once __DIR__ . '/core/setup.php';
require_once __DIR__ . '/builder/elements.php';
require_once __DIR__ . '/design/styles.php';
require_once __DIR__ . '/dynamic/dynamic-data.php';
require_once __DIR__ . '/core/data.php';
require_once __DIR__ . '/query/query-builder.php';
require_once __DIR__ . '/query/listing.php';
require_once __DIR__ . '/frontend/render.php';
require_once __DIR__ . '/frontend/render-elements.php';
require_once __DIR__ . '/integrations/forms.php';
require_once __DIR__ . '/integrations/commerce.php';
require_once __DIR__ . '/templates/templates.php';
require_once __DIR__ . '/templates/components.php';
require_once __DIR__ . '/frontend/head.php';
require_once __DIR__ . '/admin/settings.php';
require_once __DIR__ . '/frontend/output-classes.php';
require_once __DIR__ . '/design/responsive.php';
require_once __DIR__ . '/design/design-system.php';
require_once __DIR__ . '/design/classes.php';
require_once __DIR__ . '/design/fonts.php';
require_once __DIR__ . '/design/fonts-admin.php';
require_once __DIR__ . '/admin/overview.php';
require_once __DIR__ . '/frontend/frontend-assets.php';
require_once __DIR__ . '/frontend/css-loading.php';
require_once __DIR__ . '/frontend/css-retention.php';
require_once __DIR__ . '/frontend/static-delivery.php';
require_once __DIR__ . '/admin/static-admin.php';
require_once __DIR__ . '/frontend/seo.php';
require_once __DIR__ . '/builder/editor-previews.php';
require_once __DIR__ . '/core/rest.php';
require_once __DIR__ . '/core/document-recovery.php';
require_once __DIR__ . '/core/content-bridge.php';
require_once __DIR__ . '/builder/editor-context.php';
require_once __DIR__ . '/builder/editor-full-preview.php';
require_once __DIR__ . '/builder/editor-workspace.php';
require_once __DIR__ . '/builder/editor.php';
