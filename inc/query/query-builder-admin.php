<?php
/** Query library presentation and page-scoped assets. */
defined( 'ABSPATH' ) || exit;
function lieve_query_icon( $name ) {
	$paths = array( 'query' => '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>', 'search' => '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>', 'plus' => '<path d="M12 5v14M5 12h14"/>', 'copy' => '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>', 'trash' => '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>', 'restore' => '<path d="M3 10a9 9 0 1 1 2.7 8M3 4v6h6"/>', 'download' => '<path d="M12 3v13m-4-4 4 4 4-4M4 17v4h16v-4"/>', 'upload' => '<path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5"/>', 'play' => '<path d="m8 4 12 8-12 8Z"/>' );
	return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' . ( 'trash' === $name ? '2' : '1.6' ) . '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . ( $paths[ $name ] ?? $paths['query'] ) . '</svg>';
}
function lieve_query_library_item( $q ) {
	return '<button type="button" class="lieve-query-item" data-query-select="' . esc_attr( $q['id'] ) . '" aria-pressed="false">' . lieve_query_icon( 'query' ) . '<span><strong>' . esc_html( $q['name'] ) . '</strong><small>' . esc_html( $q['slug'] . ' · ' . lieve_query_types()[ $q['type'] ] ) . '</small></span><span class="lieve-query-state">' . esc_html( $q['enabled'] ? 'Active' : 'Inactive' ) . '</span></button>';
}
function lieve_query_admin_assets( $hook ) {
	if ( get_plugin_page_hookname( 'lieve-query-builder', 'lieve-dashboard' ) !== $hook ) { return; }
	wp_enqueue_style( 'lieve-query-base', LIEVE_URL . 'assets/css/design-system.css', array( 'lieve-builder-conditions' ), lieve_asset_version( 'assets/css/design-system.css' ) );
	wp_enqueue_style( 'lieve-query-modals', LIEVE_URL . 'assets/css/modal-controls.css', array( 'lieve-query-base' ), lieve_asset_version( 'assets/css/modal-controls.css' ) );
	wp_enqueue_style( 'lieve-query-builder', LIEVE_URL . 'assets/css/query-builder.css', array( 'lieve-query-modals' ), lieve_asset_version( 'assets/css/query-builder.css' ) );
	wp_enqueue_script( 'lieve-query-selects', LIEVE_URL . 'assets/js/design-system.js', array(), lieve_asset_version( 'assets/js/design-system.js' ), true );
	wp_enqueue_script( 'lieve-query-model', LIEVE_URL . 'assets/js/query-model.js', array(), lieve_asset_version( 'assets/js/query-model.js' ), true );
	wp_enqueue_script( 'lieve-query-builder', LIEVE_URL . 'assets/js/query-builder.js', array( 'lieve-query-selects', 'lieve-query-model' ), lieve_asset_version( 'assets/js/query-builder.js' ), true );
	$types = array(); foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $key => $type ) { if ( 'attachment' !== $key ) { $types[ $key ] = $type->labels->name; } }
	$taxonomies = array(); foreach ( get_taxonomies( array( 'public' => true ), 'objects' ) as $key => $tax ) { $taxonomies[ $key ] = $tax->labels->name; }
	$roles = array( '' => 'Any published author' ); foreach ( wp_roles()->roles as $key => $role ) { $roles[ $key ] = translate_user_role( $role['name'] ); }
	$sort = array(); foreach ( lieve_query_types() as $key => $label ) { $sort[ $key ] = lieve_query_order_fields( $key ); }
	$core_fields = array(); $meta_fields = array(); foreach ( lieve_query_types() as $key => $label ) { $core_fields[ $key ] = lieve_query_core_fields( $key ); $meta_fields[ $key ] = 'current' === $key ? $meta_fields['posts'] : lieve_query_meta_fields( $key ); }
	$icons = array(); foreach ( array( 'query', 'search', 'plus', 'copy', 'trash', 'restore', 'download', 'upload', 'play' ) as $name ) { $icons[ $name ] = lieve_query_icon( $name ); }
	wp_localize_script( 'lieve-query-builder', 'LieveQueriesConfig', lieve_queries_response() + array( 'url' => esc_url_raw( rest_url( 'lieve/v1/queries' ) ), 'nonce' => wp_create_nonce( 'wp_rest' ), 'defaults' => lieve_query_defaults(), 'types' => lieve_query_types(), 'postTypes' => $types, 'taxonomies' => $taxonomies, 'roles' => $roles, 'sort' => $sort, 'coreFields' => $core_fields, 'metaFields' => $meta_fields, 'icons' => $icons, 'persistentCache' => wp_using_ext_object_cache() ) );
}
add_action( 'admin_enqueue_scripts', 'lieve_query_admin_assets', 30 );
function lieve_render_query_builder_page() {
	if ( ! lieve_queries_can_manage() ) { wp_die( esc_html__( 'You cannot manage queries.', 'lieve-builder' ) ); }
	$queries = array_filter( lieve_queries_data()['queries'], static function( $q ) { return ! $q['trashed']; } );
	?>
	<div class="wrap lieve-admin-page lieve-design-page lieve-token-page lieve-query-page">
		<?php lieve_render_admin_header( __( 'Query Builder', 'lieve-builder' ), __( 'Build once. Reuse across your website. Native queries, clear results.', 'lieve-builder' ) ); ?>
		<section class="lieve-settings-card lieve-ds-page-card"><div class="lieve-ds lieve-queries" id="lieve-query-builder">
			<div class="lieve-ds-toolbar"><label class="lieve-ds-search"><?php echo lieve_query_icon( 'search' ); ?><input type="search" data-query-search placeholder="Search queries…" aria-label="Search queries"></label><div class="lieve-query-toolbar-actions"><button type="button" class="lieve-conditions-cancel" data-query-import><?php echo lieve_query_icon( 'upload' ); ?>Import</button><button type="button" class="lieve-conditions-cancel" data-query-export><?php echo lieve_query_icon( 'download' ); ?>Export</button><button type="button" class="lieve-conditions-save" data-query-create><?php echo lieve_query_icon( 'plus' ); ?>Create Query</button></div><input type="file" accept="application/json,.json" data-query-file hidden></div>
			<div class="lieve-query-workspace">
				<aside class="lieve-query-library" aria-label="Saved queries"><div class="lieve-query-library-inner"><div class="lieve-query-filter"><label class="lieve-ds-field"><span>Library</span><select id="lieve-query-filter" data-query-filter aria-label="Filter query library" hidden><option value="all">All queries</option><?php foreach ( lieve_query_types() as $type => $label ) { echo '<option value="' . esc_attr( $type ) . '">' . esc_html( $label ) . '</option>'; } ?><option value="trash">Trash</option></select><button type="button" class="lieve-ds-select-trigger" aria-label="Filter query library" aria-haspopup="listbox" aria-expanded="false"><span>All queries</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></label></div><div data-query-list><?php if ( $queries ) { foreach ( $queries as $q ) { echo lieve_query_library_item( $q ); } } else { echo '<div class="lieve-query-list-empty"><strong>No saved queries yet</strong><p>Create a query to define the content your website needs.</p></div>'; } ?></div></div></aside>
				<section class="lieve-query-editor" data-query-editor aria-label="Query editor"><div class="lieve-query-empty"><?php echo lieve_query_icon( 'query' ); ?><h2><?php echo $queries ? 'Select a query' : 'Your content, precisely selected.'; ?></h2><p><?php echo $queries ? 'Choose a saved query from the library to edit its filters and preview the results, or create a new one.' : 'Create a reusable query for posts, products, terms, authors or comments. Check real results before connecting it to your pages.'; ?></p><button type="button" class="lieve-conditions-save" data-query-create><?php echo $queries ? 'Create Query' : 'Create Your First Query'; ?></button><small>Native WordPress engines. No additional plugin required.</small></div></section>
			</div>
			<footer class="lieve-ds-footer"><span role="status" aria-live="polite" data-query-status>All changes saved</span><button type="button" class="lieve-conditions-cancel" data-query-cancel hidden>Cancel</button><div class="lieve-save-control"><button type="button" class="lieve-conditions-save" data-query-save disabled aria-keyshortcuts="Control+s Meta+s">Save Queries</button><span class="lieve-save-shortcut"><kbd>⌘S</kbd> / <kbd>Ctrl+S</kbd></span></div></footer>
		</div></section>
	</div>
	<?php
}
