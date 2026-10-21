<?php
/** Static Delivery management, using the existing Lieve admin components. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_static_admin_assets( $hook ) {
	if ( get_plugin_page_hookname( 'lieve-static-delivery', 'lieve-dashboard' ) !== $hook || ! current_user_can( 'manage_options' ) ) { return; }
	wp_enqueue_style( 'lieve-static-base', LIEVE_URL . 'assets/css/design-system.css', array( 'lieve-builder-conditions' ), lieve_asset_version( 'assets/css/design-system.css' ) );
	wp_enqueue_style( 'lieve-static', LIEVE_URL . 'assets/css/static-delivery.css', array( 'lieve-static-base' ), lieve_asset_version( 'assets/css/static-delivery.css' ) );
	wp_enqueue_script( 'lieve-static', LIEVE_URL . 'assets/js/static-delivery.js', array(), lieve_asset_version( 'assets/js/static-delivery.js' ), true );
	wp_localize_script( 'lieve-static', 'LieveStaticConfig', array( 'url' => esc_url_raw( rest_url( 'lieve/v1/static-delivery' ) ), 'nonce' => wp_create_nonce( 'wp_rest' ), 'data' => lieve_static_payload() ) );
}
add_action( 'admin_enqueue_scripts', 'lieve_static_admin_assets', 30 );

function lieve_static_status_label( $status ) {
	$labels = array( 'dynamic' => 'WordPress', 'stale' => 'Needs generation', 'blocked' => 'Not compatible', 'ready' => 'Snapshot ready', 'error' => 'Recovery required' );
	return $labels[ $status ] ?? 'Needs generation';
}
function lieve_static_admin_row( $page ) {
	?>
	<tr data-static-id="<?php echo (int) $page['id']; ?>" id="static-page-<?php echo (int) $page['id']; ?>">
		<td data-label="Static mode"><label class="lieve-static-switch"><input type="checkbox" data-static-select="<?php echo (int) $page['id']; ?>" aria-label="Static mode for <?php echo esc_attr( $page['title'] ); ?>" <?php checked( $page['selected'] ); ?>><span aria-hidden="true"></span></label></td>
		<td data-label="Page"><a class="lieve-static-title" href="<?php echo esc_url( $page['edit'] ); ?>"><?php echo esc_html( $page['title'] ); ?></a><a class="lieve-static-url" href="<?php echo esc_url( $page['url'] ); ?>" target="_blank" rel="noopener"><?php echo esc_html( wp_parse_url( $page['url'], PHP_URL_PATH ) ?: '/' ); ?></a></td>
		<td data-label="Status"><span class="lieve-static-status is-<?php echo esc_attr( $page['status'] ); ?>"><?php echo esc_html( lieve_static_status_label( $page['status'] ) ); ?></span><?php if ( $page['message'] && $page['selected'] ) : ?><span class="lieve-static-reason"><?php echo esc_html( $page['message'] ); ?></span><?php endif; ?></td>
		<td data-label="Generated"><span class="lieve-static-generated"><?php echo esc_html( $page['generated'] ?: '—' ); ?></span><?php if ( $page['bytes'] ) : ?><small><?php echo esc_html( size_format( $page['bytes'] ) . ' HTML' ); ?></small><?php endif; ?></td>
		<td data-label="Actions"><button type="button" class="lieve-conditions-cancel" data-static-generate="<?php echo (int) $page['id']; ?>" <?php disabled( ! $page['selected'] || ! empty( $page['issues'] ) ); ?>><?php echo 'ready' === $page['status'] ? 'Regenerate' : 'Generate'; ?></button></td>
	</tr>
	<?php
}
function lieve_render_static_page() {
	if ( ! current_user_can( 'manage_options' ) ) { wp_die( esc_html__( 'You do not have permission to manage static delivery.', 'lieve-builder' ) ); }
	$data = lieve_static_payload(); $settings = $data['settings'];
	$problem = 'ok' !== $settings['safety'];
	$label = $problem ? ( 'unsafe' === $settings['safety'] ? 'Unsafe delivery · host action required' : 'Delivery fenced · recovery required' ) : ( $settings['active'] ? 'Server delivery active' : ( $settings['verified'] ? 'Server verified · delivery paused' : 'Server setup required' ) );
	$note = $problem ? $settings['error'] . ' ' . $settings['recovery'] : ( $settings['active'] ? 'Verified requests are delivered by the web server, without running PHP.' : ( $settings['verified'] ? 'Routing is verified. Enable delivery and generate fresh snapshots to serve selected pages.' : 'You can generate snapshots now. PHP-free delivery needs the server rules below and a successful verification.' ) );
	?>
	<div class="wrap lieve-admin-page lieve-design-page lieve-token-page lieve-static-page">
		<?php lieve_render_admin_header( __( 'Static Delivery', 'lieve-builder' ), __( 'Publish public pages as HTML snapshots. Keep WordPress for everything dynamic.', 'lieve-builder' ) ); ?>
		<section class="lieve-settings-card lieve-ds-page-card">
			<div class="lieve-ds lieve-static" id="lieve-static">
				<div class="lieve-static-settings">
					<div><h2>Page delivery</h2><p>Snapshots include the final HTML, matching templates and existing CSS and JavaScript. Assets stay on their original URLs.</p></div>
					<div class="lieve-static-options"><label class="lieve-static-option"><span>Enable static delivery<small>Only selected, compatible pages</small></span><span class="lieve-static-switch"><input type="checkbox" data-static-setting="enabled" <?php checked( $settings['enabled'] ); ?>><span aria-hidden="true"></span></span></label><label class="lieve-static-option"><span>Automatic regeneration<small>Queue fresh copies after source changes</small></span><span class="lieve-static-switch"><input type="checkbox" data-static-setting="automatic" <?php checked( $settings['automatic'] ); ?>><span aria-hidden="true"></span></span></label></div>
				</div>
				<div class="lieve-static-server-state"><span class="lieve-static-status <?php echo $problem ? 'is-blocked' : ( $settings['active'] ? 'is-ready' : ( $settings['verified'] ? 'is-dynamic' : 'is-stale' ) ); ?>" data-static-server-status><?php echo esc_html( $label ); ?></span><p data-static-server-note><?php echo esc_html( $note ); ?></p><a href="#lieve-static-setup">Server setup</a></div>
				<div class="lieve-ds-toolbar"><label class="lieve-ds-search"><?php echo lieve_font_icon( 'search' ); ?><input type="search" data-static-search placeholder="Search pages…" aria-label="Search pages"></label><span class="lieve-static-toolbar-note">Static mode is opt-in for every page.</span><button type="button" class="lieve-conditions-save" data-static-generate-all>Generate Selected</button></div>
				<div class="lieve-static-table-wrap"><table class="lieve-static-table"><thead><tr><th scope="col">Static mode</th><th scope="col">Page</th><th scope="col">Status</th><th scope="col">Generated</th><th scope="col">Actions</th></tr></thead><tbody data-static-list><?php foreach ( $data['pages'] as $page ) { lieve_static_admin_row( $page ); } ?></tbody></table><div class="lieve-static-empty" data-static-empty <?php echo $data['pages'] ? 'hidden' : ''; ?>><h3><?php echo $data['pages'] ? 'No matching pages' : 'No pages yet'; ?></h3><p>Create a public page with LieveBuilder, then enable its static mode here.</p></div></div>
				<footer class="lieve-ds-footer"><span role="status" aria-live="polite" data-static-status>Changes are saved immediately. Incompatible pages always use WordPress.</span><button type="button" class="lieve-conditions-cancel" data-static-refresh>Refresh Status</button></footer>
			</div>
		</section>
		<details class="lieve-static-setup" id="lieve-static-setup">
			<summary><span>Server setup</span><span>Configuration &amp; verification</span><?php echo lieve_font_icon( 'chevron' ); ?></summary>
			<div class="lieve-static-setup-content lieve-ds">
				<div class="lieve-static-setup-intro">
					<div><h2>Let the server serve the HTML</h2><p id="lieve-static-verify-help">Ask your host to install the rules for your server. No server files are modified automatically. Test the configuration before reloading, enable static delivery above, then run verification here.</p></div>
					<button type="button" class="lieve-conditions-save" data-static-verify aria-describedby="lieve-static-verify-help" <?php disabled( ! $settings['enabled'] ); ?>>Verify Server</button>
				</div>
				<p class="lieve-static-setup-status" role="status" aria-live="polite" data-static-setup-status></p>
				<div class="lieve-static-instructions">
					<p><strong>Safety first.</strong> Only anonymous GET and HEAD requests without cookies, query parameters or authorization use snapshots. Missing files, forms, WooCommerce, protected pages and unsupported elements stay on WordPress.</p>
					<p><strong>Keep copies fresh.</strong> Source changes fence delivery before snapshot cleanup. Storage failures require recovery and are never reported as a successful disable. Automatic regeneration uses WP-Cron; configure a real scheduled cron for a site primarily served without PHP. External plugin data changes can call <code>lieve_static_invalidate()</code> and must check its result.</p>
					<p><strong>Emergency recovery.</strong> <?php echo esc_html( lieve_static_recovery_message() ); ?> Local revocation cannot recall an in-flight response or a copy already held by a browser, proxy or CDN. The generated rules send <code>Cache-Control: no-store</code>; independently configured caches still need their own purge.</p>
					<p><strong>Hosting requirements.</strong> This beta supports single-site root installations with a standard, local <code>wp-content</code> directory. Preserve your host’s security headers when installing the rules. Disable upstream HTML caching unless its invalidation and bypass rules are also configured.</p>
				</div>
				<div class="lieve-static-config-tabs" role="group" aria-label="Server configuration">
					<button type="button" class="lieve-conditions-cancel" data-static-server="nginx" aria-pressed="true">Nginx</button>
					<button type="button" class="lieve-conditions-cancel" data-static-server="apache" aria-pressed="false">Apache 2.4</button>
					<button type="button" class="lieve-conditions-cancel" data-static-copy><?php echo lieve_font_icon( 'copy' ); ?>Copy Configuration</button>
					<button type="button" class="lieve-conditions-cancel" data-static-download><?php echo lieve_font_icon( 'download' ); ?>Download</button>
				</div>
				<textarea class="lieve-static-code" data-static-code readonly aria-label="Server configuration" spellcheck="false"><?php echo esc_textarea( $data['config']['nginx'] ); ?></textarea>
				<p class="lieve-static-config-warning">Use only on this website’s virtual host. Custom routing and managed hosting may need host-specific adjustments. Verification must pass before delivery is marked active. This is same-site delivery, not a standalone ZIP export.</p>
			</div>
		</details>
	</div>
	<?php
}
/** A per-page entry point without adding another editor panel. */
function lieve_static_page_row_action( $actions, $post ) {
	if ( 'page' === $post->post_type && current_user_can( 'manage_options' ) ) { $actions['lieve_static'] = '<a href="' . esc_url( admin_url( 'admin.php?page=lieve-static-delivery#static-page-' . $post->ID ) ) . '">Static Delivery</a>'; }
	return $actions;
}
add_filter( 'page_row_actions', 'lieve_static_page_row_action', 10, 2 );

/** Visibility revocation may happen outside this screen. Alert administrators on their next request. */
function lieve_static_admin_notice() {
	if ( ! current_user_can( 'manage_options' ) ) { return; }
	$settings = lieve_static_settings(); $state = lieve_static_gate_state();
	if ( $state['inspectable'] && ! $settings['failure'] && ( ! $state['present'] || ( $settings['enabled'] && hash_equals( lieve_static_config_signature(), (string) $settings['verified'] ) ) ) ) { return; }
	echo '<div class="notice notice-error"><p><strong>Static Delivery: ' . esc_html( $state['fenced'] ? 'recovery required.' : 'delivery may still be active; host action required.' ) . '</strong> ' . esc_html( lieve_static_recovery_message() ) . ' <a href="' . esc_url( admin_url( 'admin.php?page=lieve-static-delivery' ) ) . '">Review Static Delivery</a></p></div>';
}
add_action( 'admin_notices', 'lieve_static_admin_notice' );
