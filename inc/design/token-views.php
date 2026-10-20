<?php
/** Shared Variables, Colors and Classes management pages, controls and dialogs. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Decorative, code-native icons for the variables workspace. */
function lieve_design_control_icon( $name ) {
	$paths = array(
		'plus' => '<path d="M12 5v14M5 12h14"/>',
		'minus' => '<path d="M5 12h14"/>',
		'scope' => '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
		'preview' => '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4m-4 0h8"/>',
		'grip' => '<g fill="currentColor" stroke="none"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></g>',
		'copy' => '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
		'trash' => '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
		'export' => '<path d="M12 15V3m-4 4 4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
		'import' => '<path d="M12 3v12m-4-4 4 4 4-4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
		'scale' => '<path d="M4 19h16M6 14v5m6-10v10m6-15v15"/>',
		'more' => '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
		'grid' => '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
		'folder' => '<path d="M3 8V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z"/>',
		'uncategorized' => '<path d="M4 4h16l2 10v6H2v-6L4 4Z"/><path d="M2 14h6l2 3h4l2-3h6"/>',
		'variable' => '<path d="M8 4H6v5l-2 3 2 3v5h2m8-16h2v5l2 3-2 3v5h-2M11 8h2m-2 4h2m-2 4h2"/>',
		'dependencies' => '<rect x="9" y="2" width="6" height="6" rx="2"/><rect x="2" y="16" width="6" height="6" rx="2"/><rect x="16" y="16" width="6" height="6" rx="2"/><path d="M12 8v4H5v4m7-4h7v4"/>',
		'edit' => '<path d="m14 5 5 5M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15v5Z"/>',
		'check' => '<path d="m5 12 4 4L19 6"/>',
		'close' => '<path d="m6 6 12 12M18 6 6 18"/>',
		'color' => '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/>',
		'undo' => '<path d="M8 4 3 9l5 5M3 9h10a7 7 0 0 1 7 7v4"/>',
		'redo' => '<path d="m16 4 5 5-5 5m5-5H11a7 7 0 0 0-7 7v4"/>',
		'restore' => '<path d="M8 4 3 9l5 5M3 9h10a7 7 0 0 1 7 7v4"/>',
	);
	return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . ( $paths[ $name ] ?? '' ) . '</svg>';
}

function lieve_design_group_icon( $group ) {
	$name = '__trash' === $group['id'] ? 'trash' : ( '*' === $group['id'] ? 'grid' : ( '' === $group['id'] ? 'uncategorized' : 'folder' ) );
	$color = 'folder' === $name && is_string( $group['iconColor'] ?? null ) && preg_match( '/^#[a-f0-9]{6}(?:[a-f0-9]{2})?$/iD', $group['iconColor'] ) ? $group['iconColor'] : '';
	return str_replace( '<svg ', '<svg class="lieve-ds-group-glyph"' . ( $color ? ' style="fill:' . esc_attr( $color ) . '"' : '' ) . ' ', lieve_design_control_icon( $name ) );
}

/** Complete first paint, including populated libraries; no JavaScript/network wait. */
function lieve_design_initial_markup( $data, $editable, $kind = 'variables' ) {
	$colors = 'colors' === $kind; $group_key = $colors ? 'paletteId' : 'categoryId';
	$classes = 'classes' === $kind; $prefix = $classes ? '.' : '--';
	$variables = array_values( array_filter( $data[ $kind ], static function( $item ) { return empty( $item['trashed'] ); } ) ); $count = count( $variables ); $groups = ''; $list = '';
	$category_counts = array_count_values( array_column( $variables, $group_key ) );
	$categories = array_merge( array( array( 'id' => '*', 'name' => 'All ' . $kind ) ), $data[ $colors ? 'palettes' : 'categories' ], array( array( 'id' => '', 'name' => 'Uncategorized' ) ) );
	foreach ( $categories as $category ) {
		$group_count = '*' === $category['id'] ? $count : ( $category_counts[ $category['id'] ] ?? 0 );
		$groups .= '<button type="button" data-ds-group="' . esc_attr( $category['id'] ) . '"' . ( '*' === $category['id'] ? ' class="is-active" aria-current="true"' : '' ) . '>' . lieve_design_group_icon( $category ) . '<span>' . esc_html( $category['name'] ) . '</span><small>' . $group_count . '</small></button>';
	}
	$trash_count = count( $data[ $kind ] ) - $count;
	if ( $colors ) { foreach ( $variables as $color ) { $trash_count += count( array_filter( $color['variants'], static function( $variant ) { return ! empty( $variant['trashed'] ); } ) ); } }
	$groups .= '<button type="button" class="lieve-ds-trash-nav" data-ds-group="__trash">' . lieve_design_group_icon( array( 'id' => '__trash' ) ) . '<span>Trash</span><small>' . $trash_count . '</small></button>';
	foreach ( array_slice( $variables, 0, LIEVE_VARIABLE_PAGE_SIZE ) as $item ) {
		$state = ! $item['enabled'] ? 'off' : ( $item['conditions'] ? 'selective' : 'global' );
		$value = $colors ? $item['light'] : $item['value'];
		$symbol = $colors ? '<span class="lieve-ds-swatch" data-ds-swatch="var(--' . esc_attr( $item['name'] ) . ')" aria-hidden="true"><i style="background-color:' . esc_attr( lieve_design_color( $value ) ?: 'transparent' ) . '"></i></span>' : '<span class="lieve-ds-var-icon" aria-hidden="true">' . lieve_design_control_icon( 'variable' ) . '</span>';
		$variant_count = count( array_filter( $item['variants'] ?? array(), static function( $variant ) { return empty( $variant['trashed'] ); } ) );
		if ( $colors && $variant_count ) { $value .= ' · ' . $variant_count . ( 1 === $variant_count ? ' variant' : ' variants' ); }
		$list .= '<div class="lieve-ds-item' . ( ! $item['enabled'] ? ' is-disabled' : '' ) . '" data-ds-' . ( $colors ? 'color' : 'variable' ) . '-row="' . esc_attr( $item['id'] ) . '" role="listitem">'
			. ( $editable ? '<span class="lieve-ds-item-grip" aria-hidden="true" title="Drag a row to reorder">' . lieve_design_control_icon( 'grip' ) . '</span>' : '' )
			. '<label class="lieve-ds-selection"><input type="checkbox" data-ds-select="' . esc_attr( $item['id'] ) . '" aria-label="Select --' . esc_attr( $item['name'] ) . '"' . ( ! $editable ? ' disabled' : '' ) . '><span class="lieve-ds-selection-box" aria-hidden="true"></span></label><button type="button" class="lieve-ds-item-main" data-ds-item="' . esc_attr( $item['id'] ) . '" aria-pressed="false"' . ( $editable ? ' title="Drag row to reorder · Arrow keys, Home or End"' : '' ) . '>' . $symbol . '<span class="lieve-ds-item-text"><strong title="--' . esc_attr( $item['name'] ) . '">--' . esc_html( $item['name'] ) . '</strong><small title="' . esc_attr( $value ) . '">' . esc_html( $value ) . '</small></span><span class="lieve-ds-item-badge" data-state="' . $state . '">' . ( 'off' === $state ? 'Off' : ( 'selective' === $state ? 'Selective' : 'Global' ) ) . '</span></button></div>';
	}
	if ( ! $count ) {
		$list = '<div class="lieve-ds-empty"><span aria-hidden="true">' . lieve_design_control_icon( $colors ? 'color' : 'variable' ) . '</span><h3>' . ( $colors ? 'Build your color library' : 'Build your design system' ) . '</h3><p>' . ( $colors ? 'Create reusable colors, organize palettes and build linked variants. Use <code>var(--name)</code> throughout your design.' : 'Create reusable spacing, typography and layout values. Use <code>var(--name)</code> wherever you need them.' ) . '</p>' . ( $editable ? '<button type="button" class="lieve-conditions-save" data-ds-add>' . lieve_design_control_icon( 'plus' ) . ( $colors ? 'Add Color' : 'Add Variable' ) . '</button>' : '' ) . '</div>';
	}
	if ( $classes ) { $list = str_replace( array( 'Select --', 'title="--', '">--', 'Build your design system', 'Create reusable spacing, typography and layout values. Use <code>var(--name)</code> wherever you need them.', 'Add Variable' ), array( 'Select .', 'title=".', '">.', 'Build your class library', 'Create reusable CSS classes, organize categories and assign them to elements in the editor.', 'Add Class' ), $list ); }
	return array(
		'groups' => $groups,
		'list' => $list,
		'detail' => $classes ? lieve_classes_empty_detail() : '<div class="lieve-ds-detail-empty"><span class="lieve-ds-kicker">' . ( $colors ? 'COLOR' : 'VARIABLE' ) . ' INSPECTOR</span><h3>' . ( $colors ? 'One palette.<br>A consistent website.' : 'One value.<br>A consistent website.' ) . '</h3><p>Select a ' . ( $colors ? 'color' : 'variable' ) . ' to manage every part of its definition.</p><ol class="lieve-ds-guide"><li><strong>Values & organization</strong><span>' . ( $colors ? 'Define light and dark colors, and keep them in palettes.' : 'Set a CSS value and keep related variables in categories.' ) . '</span></li><li><strong>' . ( $colors ? 'Linked variants' : 'Responsive overrides' ) . '</strong><span>' . ( $colors ? 'Create tints, shades, transparency and color harmonies.' : 'Adapt a value at any breakpoint. Blank fields inherit.' ) . '</span></li><li><strong>Display conditions</strong><span>Apply it across the website or only where it is needed.</span></li></ol><div class="lieve-ds-safe-note">Your website stays unchanged until you save.</div></div>',
		'count' => $count . ( $classes ? ( 1 === $count ? ' class' : ' classes' ) : ( $colors ? ( 1 === $count ? ' color' : ' colors' ) : ( 1 === $count ? ' variable' : ' variables' ) ) ),
		'groupCount' => $count . ' ' . ( $classes ? ( 1 === $count ? 'class' : 'classes' ) : ( $colors ? 'colors' : 'variables' ) ) . ' · Select to edit values and conditions',
	);
}

function lieve_variables_initial_markup( $data, $editable ) { return lieve_design_initial_markup( $data, $editable ); }

/** Both surfaces share draft-only editing; backend polish is explicitly scoped. */
function lieve_render_design_controls( $kind, $backend = false ) {
	$colors = 'colors' === $kind;
	$classes = 'classes' === $kind;
	$manager_page = $backend;
	$singular = $classes ? 'Class' : ( $colors ? 'Color' : 'Variable' );
	$plural = $classes ? 'Classes' : ( $colors ? 'Colors' : 'Variables' );
	$initial_data = $manager_page ? ( $classes ? lieve_classes() : lieve_design_system() ) : null;
	$initial_live_count = $manager_page ? count( array_filter( $initial_data[ $kind ], static function( $item ) { return empty( $item['trashed'] ); } ) ) : 0;
	$editable = current_user_can( 'manage_options' );
	$initial = $manager_page ? lieve_design_initial_markup( $initial_data, $editable, $kind ) : array( 'groups' => '', 'list' => '', 'detail' => '', 'count' => '', 'groupCount' => '' );
	?>
	<div class="lieve-ds<?php echo $classes ? ' lieve-ds-classes' : ''; ?><?php echo $manager_page ? ' lieve-ds-token-page' . ( $colors ? ' lieve-ds-colors-page' : ( $classes ? ' lieve-ds-classes-page' : ' lieve-ds-variables-page' ) ) : ''; ?>" data-design-manager="<?php echo esc_attr( $kind ); ?>"<?php if ( $manager_page ) : ?> data-ds-initial-revision="<?php echo esc_attr( $classes ? lieve_classes_revision( $initial_data ) : lieve_design_revision( $initial_data ) ); ?>"<?php endif; ?>>
		<?php if ( $manager_page ) : ?><div class="lieve-ds-page-layout"><?php endif; ?>
		<div class="lieve-ds-toolbar">
			<label class="lieve-ds-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input type="search" data-ds-search placeholder="<?php echo $classes ? 'Search classes…' : ( $colors ? 'Search colors and variants…' : 'Search variables…' ); ?>" aria-label="Search design tokens"></label>

			<?php if ( $colors ) : ?><div class="lieve-ds-mode" role="group" aria-label="Color preview"><button type="button" data-ds-mode="light" aria-pressed="true">Light</button><button type="button" data-ds-mode="dark" aria-pressed="false">Dark</button></div><?php endif; ?>
			<div class="lieve-ds-history" role="group" aria-label="<?php echo $singular; ?> draft history"><button type="button" class="lieve-conditions-cancel" data-ds-undo aria-label="Undo <?php echo strtolower( $singular ); ?> change" title="Undo <?php echo strtolower( $singular ); ?> change · ⌘/Ctrl+Z outside text fields" aria-keyshortcuts="Control+z Meta+z" disabled><?php echo lieve_design_control_icon( 'undo' ); ?></button><button type="button" class="lieve-conditions-cancel" data-ds-redo aria-label="Redo <?php echo strtolower( $singular ); ?> change" title="Redo <?php echo strtolower( $singular ); ?> change · ⌘/Ctrl+Shift+Z" aria-keyshortcuts="Control+Shift+z Meta+Shift+z Control+y" disabled><?php echo lieve_design_control_icon( 'redo' ); ?></button></div>
			<button type="button" class="lieve-conditions-cancel" data-ds-export><?php echo lieve_design_control_icon( 'export' ); ?>Export</button><button type="button" class="lieve-conditions-cancel" data-ds-import<?php if ( $manager_page && ! $editable ) { echo ' disabled'; } ?>><?php echo lieve_design_control_icon( 'import' ); ?>Import</button><input type="file" data-ds-file accept="application/json,.json" hidden>
			<?php if ( ! $colors && ! $classes ) : ?><button type="button" class="lieve-conditions-cancel" data-ds-variable-scale<?php if ( $manager_page && ! $editable ) { echo ' disabled'; } ?>><?php echo lieve_design_control_icon( 'scale' ); ?>Generate Scale</button><?php endif; ?>
			<button type="button" class="lieve-conditions-save" data-ds-add<?php if ( $manager_page && ( ! $editable || count( $initial_data[ $kind ] ) >= ( $colors ? 500 : 1000 ) ) ) { echo ' disabled'; } ?>><?php echo lieve_design_control_icon( 'plus' ); ?><?php echo 'Add ' . $singular; ?></button>
		</div>
		<div class="lieve-ds-workspace">
			<aside class="lieve-ds-sidebar" aria-label="<?php echo $colors ? 'Palettes' : $singular . ' categories'; ?>">
				<div class="lieve-ds-section-title"><span><?php echo $colors ? 'Palettes' : 'Categories'; ?></span>
					<div class="lieve-ds-group-tools">
					<button type="button" class="lieve-ds-icon" data-ds-group-add aria-label="<?php echo $colors ? 'Add palette' : 'Add category'; ?>" title="<?php echo $colors ? 'Add palette' : 'Add category'; ?>"<?php if ( ! $editable || ( $manager_page && count( $initial_data[ $colors ? 'palettes' : 'categories' ] ) >= 100 ) ) { echo ' disabled'; } ?>><?php echo lieve_design_control_icon( 'plus' ); ?></button>
					<button type="button" class="lieve-ds-icon" data-ds-categories-edit aria-label="<?php echo $colors ? 'Edit palettes' : 'Edit categories'; ?>" title="<?php echo $colors ? 'Edit palettes' : 'Edit categories'; ?>"<?php if ( ! $editable || ( $manager_page && ! $initial_data[ $colors ? 'palettes' : 'categories' ] ) ) { echo ' disabled'; } ?>><?php echo lieve_design_control_icon( 'edit' ); ?></button>
					<button type="button" class="lieve-ds-icon" data-ds-categories-apply aria-label="Apply category changes" title="Apply category changes to draft" hidden><?php echo lieve_design_control_icon( 'check' ); ?></button>
					<button type="button" class="lieve-ds-icon" data-ds-categories-cancel aria-label="Cancel category changes" title="Cancel category changes" hidden><?php echo lieve_design_control_icon( 'close' ); ?></button>
					</div>
				</div>
				<nav data-ds-groups><?php echo $initial['groups']; /* Escaped when generated. */ ?></nav>
				<p class="lieve-ds-category-note" data-ds-category-note role="status" aria-live="polite" hidden></p>
				<div class="lieve-ds-sidebar-note"><?php if ( $manager_page ) : ?><strong>Define once. Reuse anywhere.</strong><span><?php echo $classes ? 'Categories keep your classes organized. Display conditions control where their CSS applies.' : ( $colors ? 'Palettes keep your colors organized. Variants follow their parent color and conditions.' : 'Categories keep your variables organized. Display conditions control where they apply.' ); ?></span><?php else : ?><?php echo $classes ? 'Reusable CSS classes, organized by category. No conditions means the entire website.' : ( $colors ? 'Palette colors are CSS variables. Variants follow their parent color and conditions.' : 'Reusable CSS values, organized by category. No conditions means the entire website.' ); ?><?php endif; ?></div>
				<?php if ( $colors ) : ?><label class="lieve-ds-field lieve-ds-dark-setting"><span>Website dark mode</span><select id="lieve-<?php echo esc_attr( $kind ); ?>-<?php echo $backend ? 'page' : 'modal'; ?>-dark-policy" aria-label="Website dark mode" data-ds-custom-select data-ds-select-kind="modes" data-ds-dark-policy hidden title="Auto follows the operating system unless a website toggle overrides it. Manual uses the website toggle only."><option value="auto"<?php selected( $initial_data['darkMode'] ?? 'auto', 'auto' ); ?>>Auto + toggle</option><option value="manual"<?php selected( $initial_data['darkMode'] ?? 'auto', 'manual' ); ?>>Manual toggle</option><option value="off"<?php selected( $initial_data['darkMode'] ?? 'auto', 'off' ); ?>>Light only</option></select><button type="button" class="lieve-ds-select-trigger" aria-label="Website dark mode" aria-haspopup="listbox" aria-expanded="false"<?php if ( ! $editable ) { echo ' disabled'; } ?>><span><?php echo esc_html( array( 'auto' => 'Auto + toggle', 'manual' => 'Manual toggle', 'off' => 'Light only' )[ $initial_data['darkMode'] ?? 'auto' ] ); ?></span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></label><?php endif; ?>
			</aside>
			<section class="lieve-ds-library" aria-label="<?php echo $plural; ?>">
				<div class="lieve-ds-library-head">
					<div><h3 data-ds-group-title>All <?php echo $kind; ?></h3><span data-ds-group-count><?php echo esc_html( $initial['groupCount'] ); ?></span></div>
					<div class="lieve-ds-library-tools">
						<button type="button" class="lieve-conditions-cancel" data-ds-empty-trash hidden<?php if ( ! $editable ) { echo ' disabled'; } ?>><?php echo lieve_design_control_icon( 'trash' ); ?>Empty Trash</button>
						<button type="button" class="lieve-ds-icon" data-ds-check-dependencies<?php if ( $classes ) { echo ' hidden'; } ?> aria-label="Check dependencies" title="Check dependencies"><?php echo lieve_design_control_icon( 'dependencies' ); ?></button>
						<label class="lieve-ds-selection lieve-ds-select-visible" title="Select all visible <?php echo esc_attr( $kind ); ?>"><input type="checkbox" data-ds-select-visible aria-label="Select all visible <?php echo esc_attr( $kind ); ?>"<?php if ( ! $editable || ( $manager_page && ! $initial_live_count ) ) { echo ' disabled'; } ?>><span class="lieve-ds-selection-box" aria-hidden="true"></span></label>
						<button type="button" class="lieve-ds-icon" data-ds-group-edit aria-label="Manage selected group" title="Manage selected group" hidden><?php echo lieve_design_control_icon( 'more' ); ?></button>
					</div>
				</div>
				<div class="lieve-ds-bulk" data-ds-bulk hidden>
					<span class="lieve-ds-bulk-count"><?php echo lieve_design_control_icon( 'check' ); ?><span data-ds-selection-count></span></span><div class="lieve-ds-bulk-actions">
					<button type="button" class="lieve-ds-quiet" data-ds-duplicate><?php echo lieve_design_control_icon( 'copy' ); ?>Duplicate / Rename</button>
					<button type="button" class="lieve-ds-quiet" data-ds-move><?php echo lieve_design_control_icon( 'folder' ); ?>Move</button>
					<button type="button" class="lieve-ds-quiet" data-ds-restore hidden><?php echo lieve_design_control_icon( 'restore' ); ?>Restore</button>
					<button type="button" class="lieve-ds-quiet" data-ds-delete><?php echo lieve_design_control_icon( 'trash' ); ?>Move to Trash</button>
					</div>
					<button type="button" class="lieve-ds-icon" data-ds-clear-selection aria-label="Clear selection" title="Clear selection"><?php echo lieve_design_control_icon( 'close' ); ?></button>
				</div>
				<nav class="lieve-ds-pagination" data-ds-pagination aria-label="<?php echo $singular; ?> pages"<?php if ( ! $manager_page || $initial_live_count <= LIEVE_VARIABLE_PAGE_SIZE ) { echo ' hidden'; } ?>>
					<span data-ds-page-label aria-live="polite"><?php if ( $manager_page ) { echo '1–' . min( $initial_live_count, LIEVE_VARIABLE_PAGE_SIZE ) . ' of ' . $initial_live_count; } ?></span>
					<button type="button" class="lieve-conditions-cancel" data-ds-page-prev disabled aria-label="Previous page">Previous</button>
					<button type="button" class="lieve-conditions-cancel" data-ds-page-next aria-label="Next page">Next</button>
				</nav>
				<div class="lieve-ds-list" data-ds-list role="list" aria-label="<?php echo $plural; ?>"><?php echo $initial['list']; /* Escaped when generated. */ ?></div>
			</section>
			<aside class="lieve-ds-details" aria-label="Token settings">
				<div data-ds-detail><?php echo $initial['detail']; /* Static presentation only. */ ?></div>
				<section data-ds-condition-panel hidden>
					<div class="lieve-ds-condition-intro" data-ds-condition-intro data-scope="global">
						<div class="lieve-ds-condition-heading">
							<span class="lieve-ds-condition-icon" aria-hidden="true"><?php echo lieve_design_control_icon( 'scope' ); ?></span>
							<div><span class="lieve-ds-kicker">Availability</span><h3>Display Conditions</h3></div>
							<span class="lieve-ds-condition-scope" data-ds-rule-scope>Site-wide</span>
						</div>
						<p class="lieve-ds-condition-summary" data-ds-rule-summary>Available throughout your website. Add a rule to limit where this definition applies.</p>
						<div class="lieve-ds-condition-legend">
							<span><?php echo lieve_design_control_icon( 'plus' ); ?><strong>Include</strong><small>Any rule can match</small></span>
							<span><?php echo lieve_design_control_icon( 'minus' ); ?><strong>Exclude</strong><small>Always takes priority</small></span>
						</div>
						<div class="lieve-ds-condition-context"><?php echo lieve_design_control_icon( 'preview' ); ?><span data-ds-match>Evaluated on each frontend page.</span><small data-ds-rule-count>0 rules</small></div>
					</div>
					<div data-ds-conditions></div>
				</section>
			</aside>
		</div>
		<footer class="lieve-ds-footer">
			<span data-ds-status role="status" aria-live="polite">Changes apply across the website only after saving.</span>
			<button type="button" class="lieve-conditions-cancel" data-ds-cancel<?php if ( $backend ) { echo ' hidden'; } ?>>Cancel</button>
			<?php if ( $backend ) : ?><div class="lieve-save-control"><?php endif; ?>
			<button type="button" class="lieve-conditions-save" data-ds-save<?php if ( $backend ) { echo ' disabled'; } ?> aria-keyshortcuts="Control+s Meta+s"<?php if ( $backend ) { echo ' aria-describedby="lieve-' . esc_attr( $kind ) . '-save-shortcut"'; } ?>><?php echo 'Save ' . $plural; ?></button>
			<?php if ( $backend ) : ?>
				<span class="lieve-save-shortcut" id="lieve-<?php echo esc_attr( $kind ); ?>-save-shortcut"><kbd>⌘S</kbd><span aria-hidden="true"> / </span><kbd>Ctrl+S</kbd></span>
			</div><?php endif; ?>
		</footer>
		<?php if ( $manager_page ) : ?></div><?php endif; ?>
		<div class="lieve-ds-action-layer lieve-modal-skin" data-ds-action-layer hidden><section class="lieve-ds-action-dialog lieve-modal-dialog" role="dialog" aria-modal="true" aria-label="Manage design tokens" tabindex="-1"><div data-ds-action-content></div></section></div>
	</div>
	<?php
}

function lieve_render_design_page( $kind ) {
	if ( ! current_user_can( 'manage_options' ) ) { wp_die( esc_html__( 'You do not have permission to manage the design system.', 'lieve-builder' ) ); }
	$colors = 'colors' === $kind;
	$classes = 'classes' === $kind;
	echo '<div class="wrap lieve-admin-page lieve-design-page lieve-token-page' . ( $colors ? ' lieve-colors-page' : ' lieve-variables-page' ) . '">';
	lieve_render_admin_header( $classes ? __( 'Classes', 'lieve-builder' ) : ( $colors ? __( 'Colors', 'lieve-builder' ) : __( 'Variables', 'lieve-builder' ) ), $classes ? __( 'Manage reusable CSS classes, categories, responsive styles and display conditions.', 'lieve-builder' ) : ( $colors ? __( 'Create palettes, linked color variants and selective color definitions.', 'lieve-builder' ) : __( 'Manage reusable CSS variables, categories and their display conditions.', 'lieve-builder' ) ) );
	echo '<div class="lieve-settings-card lieve-ds-page-card">'; lieve_render_design_controls( $kind, true ); echo '</div></div>';
}

function lieve_render_variables_page() { lieve_render_design_page( 'variables' ); }

function lieve_render_colors_page() { lieve_render_design_page( 'colors' ); }

function lieve_render_design_modal( $kind ) {
	$colors = 'colors' === $kind; $id = 'lieve-' . $kind;
	$classes = 'classes' === $kind;
	?>
	<div id="<?php echo esc_attr( $id ); ?>-modal" class="lieve-conditions-popup lieve-ds-modal lieve-editor-manager-modal" hidden>
		<div class="lieve-conditions-backdrop" data-close-conditions></div>
		<section class="lieve-conditions-dialog" role="dialog" aria-modal="true" aria-labelledby="<?php echo esc_attr( $id ); ?>-title" tabindex="-1">
			<header class="lieve-conditions-header"><div class="lieve-conditions-heading"><h2 id="<?php echo esc_attr( $id ); ?>-title"><?php echo $classes ? 'Classes' : ( $colors ? 'Colors & Palettes' : 'System Variables' ); ?></h2><p><?php echo $classes ? 'Reusable CSS classes, responsive styles, states and display conditions.' : ( $colors ? 'Palettes, light and dark values, linked variants and display conditions.' : 'Reusable values, responsive overrides, categories and display conditions.' ); ?></p></div><button type="button" class="lieve-conditions-close" data-close-conditions aria-label="Close"><?php echo lieve_design_control_icon( 'close' ); ?></button></header>
			<?php lieve_render_design_controls( $kind ); ?>
		</section>
	</div>
	<?php
}
