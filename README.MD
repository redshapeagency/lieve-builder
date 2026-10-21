# Lieve Builder

[![Version 1.0.1](https://img.shields.io/badge/version-1.0.1-8044E3?style=flat-square)](#changelog)
[![WordPress 6.5+](https://img.shields.io/badge/WordPress-6.5%2B-21759B?style=flat-square&logo=wordpress&logoColor=white)](https://wordpress.org/)
[![PHP 7.4+](https://img.shields.io/badge/PHP-7.4%2B-777BB4?style=flat-square&logo=php&logoColor=white)](https://www.php.net/)
[![Original code license: GPL-2.0-or-later](https://img.shields.io/badge/Original_code-GPL--2.0--or--later-16C6C0?style=flat-square)](LICENSE.txt)
[![By TheOneWP](https://img.shields.io/badge/by-TheOneWP-8044E3?style=flat-square)](https://www.theonewp.com)

A lightweight WordPress theme by TheOneWP with an integrated visual builder for pages, templates and linked components.

[Quick start](#quick-start) · [Builder](#the-builder) · [Templates](#templates-and-components) · [Libraries](#global-libraries) · [Settings](#settings) · [Licensing](#release-scope-and-licensing)

> [!IMPORTANT]
> Use a test site and keep backups before activation or updates. Distribution remains blocked pending the product-specific GSAP authorization review and release acceptance checks.

## Quick start

1. Install the theme through **Appearance → Themes → Add New → Upload Theme**, then activate **Lieve Builder**.
2. Create or edit a page and choose **Edit with Lieve**.
3. Add elements, configure content and styles, then **Save**. Use **Preview** to test the complete page.
4. Enable other content types in **LieveBuilder → Settings → Builder**. Only Pages is enabled by default; templates remain available independently.

Activation changes presentation. Builder headers/footers require matching templates or explicit assignments.

**LieveBuilder → Overview** reopens recent builder content and links to libraries and configuration, respecting editing permissions.

## The builder

- **Left panel:** Elements, Structure, SEO and Markup. Find and pin widgets, organize nested content, set page metadata and override page markup/head output.
- **Canvas:** live content and style previews, configurable breakpoints and Fit/manual zoom. Both sidebars can be resized.
- **Right panel:** Content, Style, Markup, Interact, Motion and Condition for the selected element.

Structure supports inline renaming, nested drag-and-drop and context menus. Copy/paste transfers elements, styles, classes or interactions; pasting classes adds assignments without duplicates.

Authored elements start without decorative styling, apart from heading-size hierarchy. Define spacing, typography, backgrounds and layout yourself. WordPress and integrations may retain their own styles.

Responsive values inherit from the selected base breakpoint: smaller contexts cascade downward and larger contexts upward. Blank fields show inherited values; clearing an override resumes inheritance.

## Templates and components

### Templates

Open **LieveBuilder → Templates → Create New Template**. Types: Header, Footer, Single, Section, Component, Pop Up, Archive, Search Results and Error Page.

New templates and duplicates start inactive. Activate them explicitly, including empty templates. Include conditions match with OR logic; a matching Exclude rule wins. Sections also support a hook name and priority. Components use linked instances rather than automatic placement.

Manage conditions from the library or editor. In the editor, **Done** applies the dialog draft to the document; **Save** persists it. Closing discards unapplied edits. Pages can also assign Header and Footer templates explicitly.

Pop Ups have responsive Style, Behavior and Motion settings. Their close button starts off; when enabled, it is a plain X until styled. **Automatic** opening requires matching conditions. **On interaction** starts hidden and can be targeted by Interact; with no conditions, it is available site-wide. The global Enable Pop Ups setting must be on.

### Linked components

1. Right-click an element or container, choose **Create linked component…**, then save the page.
2. Choose **Edit shared model** for dedicated model editing in the same builder.
3. On the model's single root, expose supported content properties. Add named Slot containers for instance-specific content.
4. Insert linked instances through the Library or Component widget. Pages edit exposed properties and slot contents, not model internals.

Saving a published model updates instances, preserving overrides. **Reset to model** restores a property; **Use model content** restores a slot. Empty overrides stay empty. Missing or inactive models render nothing but preserve instance data.

Code and repeater definitions remain model-owned. Internal IDs are instance-scoped; use reusable class/data selectors in custom JavaScript. Expansion has cycle, depth and node limits.

## Global libraries

Use the dedicated backend managers below. Responsive, Variables, Colors and Classes also have editor dialogs sharing the same saved definitions.

| Manager | Purpose |
| --- | --- |
| Responsive | Named breakpoints, viewport icons, base selection, defaults and removed-breakpoint recovery. Saved rows sort by descending width. |
| Variables | Categorized CSS variables, responsive overrides and linked scales. |
| Colors | Palettes, light/dark values, linked variants, scales and contrast checks. |
| Classes | Reusable CSS declarations, responsive/state rules and shared visual editing. |
| Fonts | Local Google Fonts installation and custom WOFF2, WOFF, TTF or OTF uploads. |

Variables, Colors and Classes include conditions, ordering, duplication, import/export and recoverable Trash. Save publishes the draft. Cancel restores the manager's starting state; the Classes dialog preserves shared edits already pending when opened. Export a backup before permanent deletion or Replace import. Font installation saves immediately; font metadata uses Save/Cancel separately. Contrast checks compare color definitions, not whole-page accessibility.

Assign a global class in an element's **Markup** tab. Click its chip or heading name to edit shared styles; click again or choose **Element styles** to return. Visual controls and class CSS stay synchronized. Saving shared CSS affects all matching instances.

## Queries, listings and dynamic data

**LieveBuilder → Query Builder** saves queries for posts/products, terms, authors, comments or the current WordPress query. Configure source, filters and sorting; inspect draft results in Preview. Native properties and custom meta keys are separate: use **Post ID** for a post's ID, not a custom field named `ID`. Manual meta keys are supported.

Enable **Content → Listing Builder** on a supported layout container and select a saved query. Its children define one repeated result. Bind child fields through the dynamic-data picker, then choose a responsive grid or slider. Grids support previous/next links or progressive Load more; enable query totals for exact final-page detection.

References such as `{{lieve:post.title}}` resolve in the page or listing context, using an empty value or configured fallback when unavailable. Sources depend on WordPress, plugins and adapters. TheOneWP requires an explicit adapter; provider schemas vary.

## Settings

Open **LieveBuilder → Settings**:

| Tab | Configuration |
| --- | --- |
| General | Native content widths and Pop Up defaults. |
| Builder | Enabled content types and the editor's WordPress return link. |
| Appearance | Interface accents and color reset; authored content colors are separate. |
| Markup | Element identifiers, default/custom classes and Body/Main IDs. |
| Head | Allow or suppress existing head tags, with explicit discovery scans. |
| Performance | CSS loading method and font preloading. |
| System | Trusted PHP execution, GitHub updates, installation details and Site Health. |

Save Settings applies all tabs without reloading. Cancel restores the saved configuration. Resets change the draft until saved.

**CSS loading** defaults to Internal CSS (`<style>` tags). Inline uses base `style` attributes, but states, breakpoints and global rules still need stylesheets. External Files uses reusable generated CSS and falls back to Internal CSS if storage is unavailable. Font preloading applies to up to two selected local faces.

**Markup** supports global defaults and per-page/per-element overrides. Automatic identifiers use `lieve-{number}` and `lieve-data-{number}`. Optional identifiers can be disabled; minimal functional hooks may remain for styles or interactions. Changing IDs or suppressing head assets can break selectors, links or plugins. Dependencies are not repaired automatically.

## Custom Code and integrations

Custom Code separates HTML/PHP, CSS and JavaScript, with syntax highlighting and an expanded editor. Raw HTML has no automatic wrapper; enable one explicitly for builder styling. Dynamic-data substitution is opt-in.

PHP execution is off in **Settings → System**. It requires code-administrator permissions, host approval and authorized saving of the exact code. **PHP is not sandboxed and has full server access.** The separate, default-off Live PHP preview may execute repeatedly. Suppress PHP errors hides rendered diagnostics, not permission or validation errors.

JavaScript previews are isolated; full-page draft Preview never executes PHP. Test visitor interactions in the frontend context. Call-function interactions accept only explicitly registered site functions with JSON arguments, not arbitrary code.

WooCommerce requires its plugin and correct page context. Other integrations may require configuration or plugins. The contact form emails the administrator; configure reliable mail. Uploads, CAPTCHA, CRM, submissions storage and payments need integrations. Catalogue coverage does not imply builder parity or import compatibility.

## Saving, preview and recovery

**Cmd/Ctrl+S** saves the active page or manager. Global libraries save separately; pending inline class edits save before the page, not as one transaction. A page-save failure does not undo a successful class save.

Conflicts and failed requests retain the draft. Preserve desired changes before reloading a newer saved version. Undo/Redo is bounded session history, not a backup. Private server recovery copies and WordPress Revisions provide additional recovery; server copies require an authenticated connection and cannot guarantee offline edits.

Full-page draft previews are account-private, expire after 15 minutes and do not publish changes. Save shared libraries separately before previewing them. SEO's **Output page metadata** starts off; Lieve defers output to recognized active SEO plugins by default. Rendering conditions are not access control.

## Static Delivery beta

**LieveBuilder → Static Delivery** captures eligible public builder pages as same-site HTML snapshots. CSS and JavaScript keep their original URLs; this is not a standalone export.

1. Enable Static mode for an eligible page and generate its snapshot.
2. Ask your host to install and test the generated Nginx or Apache 2.4 rules. The theme does not edit server configuration.
3. Enable delivery and run **Verify Server**. A ready snapshot alone does not prove PHP-free delivery.

Support is limited to single-site root installations with standard local `wp-content` and same-origin ASCII pretty permalinks ending in `/`. Only eligible anonymous GET/HEAD requests without query strings, cookies or authorization use snapshots. Forms, commerce system pages and unsupported dynamic output remain dynamic.

Changes invalidate snapshots; regeneration uses WP-Cron. Configure real scheduled cron when most requests bypass PHP, coordinate external caches and verify delivery on the actual host.

## GitHub updates

Install the updater-enabled version manually once. While Lieve or a child theme is active, WordPress checks stable releases from [redshapeagency/lieve-builder](https://github.com/redshapeagency/lieve-builder). **Settings → System → Check for updates** refreshes the check without installing anything.

Updates require attached `lieve-builder-VERSION.zip` and `.zip.manifest.json` assets, compatible WordPress/PHP versions and a matching SHA-256. Source-code archives and prereleases are excluded. The included GitHub workflow prepares assets only after distribution authorization and release acceptance. Back up before updating; theme-file customizations are replaced.

## Release scope and licensing

Cross-browser/device checks, checkout/payment flows, integrations and production-host delivery need acceptance testing. Automated checks do not certify product readiness. Motion provides timelines and ScrollTrigger playback, not the complete GSAP plugin suite.

Development tests and release tooling belong to the development source, not the installable theme. Public distribution remains blocked until the GSAP authorization review and release checks are completed.

Lieve's original code is licensed under [GPLv2 or later](LICENSE.txt). Bundled GSAP assets are separately licensed; see the [GSAP notice](assets/vendor/gsap/NOTICE.md). The theme license does not authorize their redistribution in this product.

## Changelog

### 1.0.1

- Fixed Custom Code preview initialization and dynamic data context after PHP queries.
- Improved draft recovery startup and consistent widget card sizing.
- Replaced the initial Overview with a permission-aware operational dashboard.
- Added verified GitHub release updates through WordPress.

### 1.0.0

- Initial commit.
