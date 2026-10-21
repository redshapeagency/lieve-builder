=== Lieve Builder ===
Contributors: lieve-builder
Requires at least: 6.5
Requires PHP: 7.4
Stable tag: 1.0.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

WordPress theme by TheOneWP with an integrated visual builder for pages, templates and linked components.

== Description ==

Lieve Builder combines a live visual canvas, nested Structure tree and responsive element inspector. Content starts without decorative styling; native WordPress and integration content can retain its own styles.

Main features:

* Operational Overview with recent builder content, library links and current configuration.
* Responsive styling, configurable breakpoints, states and reusable CSS classes.
* Variables, light/dark color palettes, linked scales and locally hosted fonts.
* Conditional templates, Pop Ups and linked components with exposed properties and named slots.
* Saved queries, dynamic fields and grid/slider listings, including grid pagination and Load more.
* Element interactions, Motion timelines and server-side rendering conditions.
* Page SEO, head-output controls and global/page/element markup overrides.
* Custom Code with HTML/PHP, CSS and JavaScript editors.
* Private draft previews, recovery copies and WordPress Revisions.
* Optional Static Delivery snapshots with verified server routing.

Use a test site and keep backups. Public distribution remains blocked pending product-specific GSAP authorization and release acceptance checks.

See README.MD for usage, defaults and limitations.

== Installation ==

1. Upload the theme ZIP through Appearance > Themes > Add New > Upload Theme.
2. Activate Lieve Builder.
3. Create or edit a page and choose Edit with Lieve.
4. Add content, Save and use Preview to verify the page.

Only Pages is enabled by default. Enable other content types in LieveBuilder > Settings > Builder. Templates remain available independently. Theme activation changes the site's presentation.

== Frequently Asked Questions ==

= Where are templates and shared libraries? =

Use the LieveBuilder menu for Templates, Responsive, Variables, Colors, Classes, Fonts, Static Delivery, Query Builder and Settings. New templates start inactive. Component models use a dedicated mode of the same builder.

= Does saving a page save every global library? =

No. Managers save independently. Pending inline class edits save before the page; these are not one transaction. Cmd/Ctrl+S saves the active page or manager. Closing a manager discards its unapplied dialog draft.

= Is PHP enabled by default? =

No. Settings > System controls execution, with code-administrator permissions and a separate Live PHP preview switch. PHP has full server access and is not sandboxed. Full-page draft previews never execute PHP.

= Do integrations require plugins? =

WooCommerce elements require WooCommerce. Other providers depend on their integrations. The contact form emails the WordPress administrator; uploads, CAPTCHA, CRM actions, submissions storage and payments require an integration.

= Does Static Delivery bypass PHP immediately? =

No. Your host must install the supplied Nginx/Apache rules and Verify Server must pass. Only eligible anonymous requests use snapshots; unsupported dynamic output remains on WordPress. This is not an offline export.

= Is SEO output enabled automatically? =

No. Output page metadata starts off. Lieve defers output to recognized active SEO plugins by default. Rendering conditions are not access control.

= How do GitHub updates work? =

Install the updater-enabled version manually once. WordPress then checks stable GitHub releases with attached installable ZIP and verification manifest. Settings > System offers Check for updates. Back up before updating.

== License and Third-Party Assets ==

Lieve's original code is GPLv2 or later; see LICENSE.txt. Bundled GSAP assets have a separate license and distribution gate; see assets/vendor/gsap/NOTICE.md. The theme license does not authorize their redistribution in this product.

== Changelog ==

= 1.0.1 =
* Fixed Custom Code preview initialization and dynamic data context after PHP queries.
* Improved draft recovery startup and consistent widget card sizing.
* Replaced the initial Overview with a permission-aware operational dashboard.
* Added verified GitHub release updates through WordPress.

= 1.0.0 =
* Initial commit.
