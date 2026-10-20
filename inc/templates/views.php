<?php
/** Template management pages, list cells, notices and Conditions dialog markup. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Decorative, consistently drawn icons for the creation flow. */
function lieve_template_creation_icon( $name ) {
	$shapes = array(
		'header'  => '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M7 7h4m6 0h.01"/>',
		'footer'  => '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M3.5 14h17M7 17h4m6 0h.01"/>',
		'content' => '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 8h7m-7 4h7m-7 4h4"/>',
		'section' => '<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M9.5 6v12M13 10h4m-4 4h4"/>',
		'component' => '<rect x="3.5" y="3.5" width="11" height="11" rx="2"/><rect x="9.5" y="9.5" width="11" height="11" rx="2"/><path d="M7 9h4m4 6h2"/>',
		'popup'   => '<path d="M20.5 11V6.5A2.5 2.5 0 0 0 18 4H6a2.5 2.5 0 0 0-2.5 2.5V18A2.5 2.5 0 0 0 6 20.5h4.5"/><rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="m15 11 3 3m0-3-3 3M11.5 17h6"/>',
		'archive' => '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
		'search'  => '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M8 10.5h5"/>',
		'error'   => '<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10Z"/><path d="M14 3.5v5h5M12 12v3m0 2h.01"/>',
		'check'   => '<path d="m6.5 12 3.5 3.5 7.5-7.5"/>',
		'info'    => '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5m0-8h.01"/>',
	);
	// Only fixed artwork from this allowlist is emitted, never caller-supplied SVG.
	return isset( $shapes[ $name ] ) ? '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' . $shapes[ $name ] . '</svg>' : '';
}

/**
 * Return a compact condition summary for lists and template cards.
 *
 * @param int $template_id Template post ID.
 * @return string
 */
function lieve_template_conditions_summary( $template_id ) {
	$conditions = lieve_get_template_conditions( $template_id );
	$count      = count( $conditions );
	if ( ! $count ) {
		return __( 'Manual', 'lieve-builder' );
	}
	$labels = array_map( 'lieve_template_rule_description', array_slice( $conditions, 0, 2 ) );
	return implode( ' · ', $labels ) . ( $count > 2 ? sprintf( __( ' +%d rules', 'lieve-builder' ), $count - 2 ) : '' );
}

/**
 * Render the template-type selector.
 *
 * @param WP_Post $post Current template.
 */
function lieve_render_template_type_meta_box( $post ) {
	wp_nonce_field( 'lieve_save_template_type', 'lieve_template_type_nonce' );
	$current_type = lieve_get_template_type( $post->ID );
	?>
	<p><label for="lieve-template-type-select"><?php esc_html_e( 'This template represents:', 'lieve-builder' ); ?></label></p>
	<select id="lieve-template-type-select" name="lieve_template_type" style="width:100%">
		<?php foreach ( lieve_template_types() as $value => $label ) : ?>
			<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $current_type, $value ); ?>><?php echo esc_html( $label ); ?></option>
		<?php endforeach; ?>
	</select>
	<p class="description"><?php esc_html_e( 'Open the visual editor to manage all Include and Exclude conditions.', 'lieve-builder' ); ?></p>
	<?php
}

/** Render the library header inside WordPress' main content flow. */
function lieve_render_template_library_header() {
	$screen = get_current_screen();
	if ( ! $screen || 'edit' !== $screen->base || LIEVE_TEMPLATE_POST_TYPE !== $screen->post_type ) {
		return;
	}
	$actions = current_user_can( 'publish_posts' ) ? array(
		array( 'label' => __( 'Create a New Template', 'lieve-builder' ), 'url' => lieve_new_template_url() ),
	) : array();
	echo '<div class="wrap lieve-admin-page lieve-template-library-heading">';
	lieve_render_admin_header( __( 'Template', 'lieve-builder' ), __( 'Library of reusable layouts and their display conditions.', 'lieve-builder' ), $actions );
	echo '</div>';
}

/**
 * Render a small dashboard with direct template actions.
 */
function lieve_render_dashboard_page() {
	?>
	<div class="wrap lieve-admin-page">
		<header class="lieve-admin-header">
			<div class="lieve-admin-logo" aria-hidden="true"><?php echo lieve_brand_logo(); ?></div>
			<div class="lieve-admin-title-wrap">
				<h1>Lieve<span>Builder</span></h1>
				<p><?php esc_html_e( 'Visual design, templates, and conditions in one workspace.', 'lieve-builder' ); ?></p>
			</div>
		</header>
		<section class="lieve-admin-hero">
			<div>
				<span class="lieve-admin-eyebrow"><?php esc_html_e( 'Overview', 'lieve-builder' ); ?></span>
				<h2><?php esc_html_e( 'Design once, reuse everywhere.', 'lieve-builder' ); ?></h2>
				<p><?php esc_html_e( 'Create visual layouts, organize templates, and control where each one appears.', 'lieve-builder' ); ?></p>
			</div>
			<div class="lieve-admin-hero-mark" aria-hidden="true"><?php echo lieve_brand_logo(); ?></div>
		</section>
		<div class="lieve-admin-feature-grid">
			<article><span>01</span><h2><?php esc_html_e( 'Create', 'lieve-builder' ); ?></h2><p><?php esc_html_e( 'Choose the template name and type on a dedicated screen.', 'lieve-builder' ); ?></p></article>
			<article><span>02</span><h2><?php esc_html_e( 'Design', 'lieve-builder' ); ?></h2><p><?php esc_html_e( 'Open the visual builder and compose the layout on the canvas.', 'lieve-builder' ); ?></p></article>
			<article><span>03</span><h2><?php esc_html_e( 'Publish', 'lieve-builder' ); ?></h2><p><?php esc_html_e( 'Apply a layout manually or use a display condition.', 'lieve-builder' ); ?></p></article>
		</div>
	</div>
	<?php
}

/**
 * Render the dedicated template creation and completion screens.
 */
function lieve_render_new_template_page() {
	if ( ! current_user_can( 'publish_posts' ) ) {
		wp_die( esc_html__( 'You do not have permission to create templates.', 'lieve-builder' ) );
	}

	$draft_key = isset( $_GET['draft'] ) && is_string( $_GET['draft'] ) ? sanitize_key( wp_unslash( $_GET['draft'] ) ) : '';
	$draft = $draft_key ? get_transient( 'lieve_template_form_' . get_current_user_id() . '_' . $draft_key ) : array();
	$draft = is_array( $draft ) ? $draft : array();
	$initial_type = isset( $draft['type'] ) && array_key_exists( $draft['type'], lieve_template_types() ) ? $draft['type'] : 'header';
	$request_id = $draft['requestId'] ?? wp_generate_uuid4();
	$initial_conditions = $draft['conditions'] ?? array();
	$initial_opening = 'interaction' === ( $draft['popupOpening'] ?? '' ) ? 'interaction' : 'automatic';
	$created_id = isset( $_GET['created'] ) ? absint( $_GET['created'] ) : 0;
	$created    = $created_id ? get_post( $created_id ) : null;

	if ( $created && LIEVE_TEMPLATE_POST_TYPE === $created->post_type && current_user_can( 'edit_post', $created_id ) ) {
		$condition_label = lieve_template_conditions_summary( $created_id );
		$type_label      = lieve_template_types()[ lieve_get_template_type( $created_id ) ];
		?>
		<div class="wrap lieve-admin-page lieve-template-complete-page">
			<?php lieve_render_admin_header( __( 'New Template', 'lieve-builder' ), __( 'Your template is ready for the visual editor.', 'lieve-builder' ) ); ?>
			<section class="lieve-template-complete" aria-labelledby="lieve-created-title">
				<div class="lieve-complete-icon"><?php echo lieve_template_creation_icon( 'check' ); ?></div>
				<div class="lieve-complete-copy">
					<p class="lieve-complete-label"><?php esc_html_e( 'Template created', 'lieve-builder' ); ?></p>
					<h2 id="lieve-created-title"><?php echo esc_html( get_the_title( $created_id ) ); ?></h2>
					<p><?php esc_html_e( 'Your template is inactive and does not affect the site. Add content in the visual editor, then activate it when ready.', 'lieve-builder' ); ?></p>
					<dl class="lieve-complete-meta">
						<div><dt><?php esc_html_e( 'Type', 'lieve-builder' ); ?></dt><dd><?php echo esc_html( $type_label ); ?></dd></div>
						<div><dt><?php esc_html_e( 'Display', 'lieve-builder' ); ?></dt><dd><?php echo esc_html( $condition_label ); ?></dd></div>
					</dl>
					<div class="lieve-admin-actions">
						<a class="lieve-admin-button lieve-admin-button-primary" href="<?php echo esc_url( lieve_builder_url( $created_id ) ); ?>"><?php esc_html_e( 'Open Visual Editor', 'lieve-builder' ); ?></a>
						<a class="lieve-admin-button lieve-create-secondary" href="<?php echo esc_url( admin_url( 'edit.php?post_type=' . LIEVE_TEMPLATE_POST_TYPE ) ); ?>"><?php esc_html_e( 'Back to Templates', 'lieve-builder' ); ?></a>
					</div>
				</div>
			</section>
		</div>
		<?php
		return;
	}

	$error = isset( $_GET['lieve_error'] ) ? sanitize_key( wp_unslash( $_GET['lieve_error'] ) ) : '';
	?>
	<div class="wrap lieve-admin-page lieve-template-create-page">
		<?php lieve_render_admin_header( __( 'New Template', 'lieve-builder' ), __( 'Define the name, type, and display conditions before entering the editor.', 'lieve-builder' ) ); ?>

			<?php if ( 'missing_title' === $error ) : ?>
			<div class="notice notice-error inline"><p><?php esc_html_e( 'Enter a name for the template.', 'lieve-builder' ); ?></p></div>
			<?php endif; ?>
			<?php if ( ! empty( $draft['error'] ) ) : ?><div class="notice notice-error inline" role="alert"><p><?php echo esc_html( $draft['error'] ); ?></p></div><?php endif; ?>

			<form class="lieve-create-form" id="lieve-create-template-form" data-has-draft="<?php echo $draft ? 'true' : 'false'; ?>" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post">
				<input type="hidden" name="action" value="lieve_create_template">
				<input type="hidden" name="template_request_id" value="<?php echo esc_attr( $request_id ); ?>">
			<?php wp_nonce_field( 'lieve_create_template', 'lieve_create_template_nonce' ); ?>

			<section class="lieve-form-card lieve-template-details-card" aria-labelledby="lieve-template-details-title">
				<div class="lieve-form-card-heading"><h2 id="lieve-template-details-title"><?php esc_html_e( 'Template details', 'lieve-builder' ); ?></h2><p><?php esc_html_e( 'Start with a name you will recognize in your library.', 'lieve-builder' ); ?></p></div>
				<div class="lieve-template-name-field">
					<label for="lieve-template-title"><?php esc_html_e( 'Template name', 'lieve-builder' ); ?> <span class="lieve-required-mark" aria-hidden="true">*</span></label>
					<input class="lieve-title-input" id="lieve-template-title" name="template_title" type="text" required maxlength="200" aria-describedby="lieve-template-name-help" value="<?php echo esc_attr( $draft['title'] ?? '' ); ?>" placeholder="<?php esc_attr_e( 'e.g. Main Header', 'lieve-builder' ); ?>">
					<p id="lieve-template-name-help"><?php esc_html_e( 'Only used in your library. You can rename it later.', 'lieve-builder' ); ?></p>
				</div>
			</section>

			<section class="lieve-form-card" aria-labelledby="lieve-template-type-title">
				<div class="lieve-form-card-heading"><h2 id="lieve-template-type-title"><?php esc_html_e( 'Template type', 'lieve-builder' ); ?></h2><p id="lieve-template-type-help"><?php esc_html_e( 'Choose the role this layout will have on your site.', 'lieve-builder' ); ?></p></div>
				<div class="lieve-type-grid" role="radiogroup" aria-labelledby="lieve-template-type-title" aria-describedby="lieve-template-type-help">
					<?php
					$type_descriptions = lieve_template_type_descriptions();
					foreach ( lieve_template_types() as $value => $label ) :
						?>
						<label class="lieve-type-card">
							<input type="radio" name="template_type" value="<?php echo esc_attr( $value ); ?>" <?php checked( $initial_type, $value ); ?>>
							<span class="lieve-type-card-body">
								<span class="lieve-type-icon"><?php echo lieve_template_creation_icon( $value ); ?></span>
								<span class="lieve-type-copy"><strong><?php echo esc_html( $label ); ?></strong><small><?php echo esc_html( $type_descriptions[ $value ] ); ?></small></span>
								<span class="lieve-type-check" aria-hidden="true"><span class="lieve-type-point"></span></span>
							</span>
						</label>
					<?php endforeach; ?>
				</div>
			</section>

			<section class="lieve-form-card lieve-condition-card" aria-labelledby="lieve-template-conditions-title">
				<div class="lieve-form-card-heading"><h2 id="lieve-template-conditions-title"><?php esc_html_e( 'Display conditions', 'lieve-builder' ); ?></h2><p><?php esc_html_e( 'Choose where this template appears. Leave the rules empty to use it manually.', 'lieve-builder' ); ?></p></div>
				<div id="lieve-create-conditions"></div>
					<input id="lieve-template-conditions" name="template_conditions" type="hidden" value="<?php echo esc_attr( wp_json_encode( $initial_conditions ) ); ?>">
					<input id="lieve-popup-opening" name="popup_opening" type="hidden" value="<?php echo esc_attr( $initial_opening ); ?>">
				<p class="description"><?php esc_html_e( 'Any matching Include rule applies. Exclude rules always take priority; with only exclusions, the template appears everywhere else.', 'lieve-builder' ); ?></p>
			</section>

				<div class="lieve-create-submit">
					<div class="lieve-create-status"><?php echo lieve_template_creation_icon( 'info' ); ?><span data-create-status role="status" aria-live="polite"><?php esc_html_e( 'Created inactive. Activate it from the editor when ready.', 'lieve-builder' ); ?></span></div>
					<a class="lieve-conditions-cancel lieve-create-secondary" href="<?php echo esc_url( admin_url( 'edit.php?post_type=' . LIEVE_TEMPLATE_POST_TYPE ) ); ?>"><?php esc_html_e( 'Cancel', 'lieve-builder' ); ?></a>
					<div class="lieve-save-control"><button class="lieve-admin-button lieve-admin-button-primary" type="submit" aria-keyshortcuts="Control+s Meta+s" aria-describedby="lieve-create-shortcut"><?php esc_html_e( 'Create Template', 'lieve-builder' ); ?></button><span class="lieve-save-shortcut" id="lieve-create-shortcut"><kbd>⌘S</kbd><span aria-hidden="true"> / </span><kbd>Ctrl+S</kbd></span></div>
			</div>
		</form>
	</div>
	<?php
}

/**
 * Add a useful type filter to the template list without exposing a taxonomy.
 */
function lieve_template_type_filter_dropdown() {
	global $typenow;
	if ( LIEVE_TEMPLATE_POST_TYPE !== $typenow ) {
		return;
	}

	$selected = isset( $_GET['lieve_template_type'] ) ? sanitize_key( wp_unslash( $_GET['lieve_template_type'] ) ) : '';
	?>
	<label class="screen-reader-text" for="lieve-template-type-filter"><?php esc_html_e( 'Filter by template type', 'lieve-builder' ); ?></label>
	<select id="lieve-template-type-filter" name="lieve_template_type">
		<option value=""><?php esc_html_e( 'All Template Types', 'lieve-builder' ); ?></option>
		<?php foreach ( lieve_template_types() as $value => $label ) : ?>
			<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $selected, $value ); ?>><?php echo esc_html( $label ); ?></option>
		<?php endforeach; ?>
	</select>
	<?php
}

/**
 * Render custom template-library columns.
 *
 * @param string $column  Column key.
 * @param int    $post_id Template post ID.
 */
function lieve_template_admin_column_content( $column, $post_id ) {
	if ( 'lieve_template_active' === $column ) {
		$status  = get_post_status( $post_id );
		$active  = 'publish' === $status;
		$allowed = current_user_can( 'edit_post', $post_id ) && current_user_can( 'publish_posts' ) && ! in_array( $status, array( 'trash', 'auto-draft' ), true );
		$title   = get_post( $post_id )->post_title;
		$label   = sprintf( __( 'Enable template: %s', 'lieve-builder' ), $title );
		$hint    = $allowed ? ( $active ? __( 'Deactivate template', 'lieve-builder' ) : __( 'Activate template', 'lieve-builder' ) ) : __( 'Activation is unavailable for this template.', 'lieve-builder' );
		echo '<button type="button" class="lieve-template-toggle" role="switch" aria-checked="' . ( $active ? 'true' : 'false' ) . '" aria-label="' . esc_attr( $label ) . '" title="' . esc_attr( $hint ) . '"';
		if ( $allowed ) {
			echo ' data-template-action="status" data-template-status="' . ( $active ? 'draft' : 'publish' ) . '" data-template-id="' . esc_attr( $post_id ) . '" data-template-revision="' . esc_attr( lieve_template_revision( $post_id ) ) . '"';
		} else {
			echo ' disabled';
		}
		echo '><span class="lieve-template-toggle-track" aria-hidden="true"></span></button>';
	}
	if ( 'lieve_template_type' === $column ) {
		$type = lieve_get_template_type( $post_id );
		echo '<span class="lieve-list-badge">' . lieve_template_creation_icon( $type ) . '<span>' . esc_html( lieve_template_types()[ $type ] ) . '</span></span>';
	}
	if ( 'lieve_template_condition' === $column ) {
		$snapshot = lieve_template_library_snapshot( $post_id );
		lieve_render_template_display( $snapshot );
	}
	if ( 'lieve_template_state' === $column ) {
		$state = lieve_template_state( $post_id );
		echo '<span class="lieve-template-state" data-template-state="' . esc_attr( $state['key'] ) . '">' . esc_html( $state['label'] ) . '</span>';
	}
}

/**
 * Shared conditions popup for the editor and template library.
 *
 * @param bool $editor Whether conditions are saved with the builder document.
 */
function lieve_render_conditions_modal( $editor = false ) {
	?>
	<div id="lieve-conditions-modal" class="lieve-conditions-popup lieve-modal-skin" hidden>
		<div class="lieve-conditions-backdrop" data-close-conditions></div>
		<section class="lieve-conditions-dialog lieve-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="lieve-conditions-title" aria-describedby="lieve-conditions-description" tabindex="-1">
			<header class="lieve-conditions-header">
				<div class="lieve-conditions-heading">
					<h2 id="lieve-conditions-title"><?php esc_html_e( 'Template Conditions', 'lieve-builder' ); ?></h2>
					<p id="lieve-conditions-description"><?php esc_html_e( 'Include rules use OR logic. Any matching Exclude rule takes precedence.', 'lieve-builder' ); ?></p>
				</div>
				<button type="button" class="lieve-conditions-close" data-close-conditions aria-label="<?php esc_attr_e( 'Close', 'lieve-builder' ); ?>"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
			</header>
			<div class="lieve-conditions-body"><div id="<?php echo $editor ? 'lieve-editor-conditions' : 'lieve-admin-conditions'; ?>"></div></div>
			<footer class="lieve-conditions-footer">
				<span id="lieve-conditions-status" role="status" aria-live="polite"><?php if ( $editor ) { esc_html_e( 'Changes are saved together with the template.', 'lieve-builder' ); } ?></span>
				<?php if ( $editor ) : ?>
					<button type="button" class="lieve-conditions-cancel" data-close-conditions><?php esc_html_e( 'Cancel', 'lieve-builder' ); ?></button>
					<button type="button" class="lieve-conditions-save" data-apply-conditions><?php esc_html_e( 'Done', 'lieve-builder' ); ?></button>
				<?php else : ?>
					<button type="button" class="lieve-conditions-cancel" id="lieve-cancel-conditions" hidden><?php esc_html_e( 'Cancel', 'lieve-builder' ); ?></button>
					<div class="lieve-save-control">
						<button type="button" class="lieve-conditions-save" id="lieve-save-conditions" aria-keyshortcuts="Control+s Meta+s" disabled aria-describedby="lieve-conditions-save-shortcut"><?php esc_html_e( 'Save Conditions', 'lieve-builder' ); ?></button>
						<span class="lieve-save-shortcut" id="lieve-conditions-save-shortcut"><kbd>⌘S</kbd><span aria-hidden="true"> / </span><kbd>Ctrl+S</kbd></span>
					</div>
				<?php endif; ?>
			</footer>
		</section>
	</div>
	<?php
}

/** Output the popup only on the template list. */
function lieve_template_list_conditions_modal() {
	$screen = get_current_screen();
	if ( $screen && 'edit' === $screen->base && LIEVE_TEMPLATE_POST_TYPE === $screen->post_type ) {
		lieve_render_conditions_modal();
	}
}

/** Presentation data shared by the first paint and live library updates. */
function lieve_template_rule_display( $row ) {
	$targets = array();
	if ( 'archive' === $row['type'] ) { foreach ( $row['archiveTypes'] as $type ) { $targets[] = lieve_archive_condition_types()[ $type ] ?? $type; } }
	foreach ( array_merge( $row['values'], $row['archivePostTypes'], $row['archiveTerms'] ) as $value ) {
		if ( 'individual' === $row['type'] ) { $targets[] = ( get_the_title( (int) $value ) ?: __( 'Untitled', 'lieve-builder' ) ) . ' #' . $value; }
		elseif ( false !== strpos( $value, '::' ) ) {
			list( $tax, $term ) = explode( '::', $value, 2 ); $object = 'all' !== $term ? get_term( (int) $term, $tax ) : null;
			$targets[] = $tax . ': ' . ( $object && ! is_wp_error( $object ) ? $object->name : ( 'all' === $term ? __( 'All terms', 'lieve-builder' ) : '#' . $term ) );
		} else { $object = get_post_type_object( $value ); $targets[] = $object ? $object->labels->name : $value; }
	}
	$description = $targets ? array( implode( ', ', array_unique( $targets ) ) ) : array();
	if ( $row['includeChildren'] ) { $description[] = __( 'including children', 'lieve-builder' ); }
	if ( $row['hookName'] ) { $description[] = $row['hookName'] . ' (' . $row['hookPriority'] . ')'; }
	return array(
		'action'      => $row['action'],
		'actionLabel' => 'exclude' === $row['action'] ? __( 'Exclude', 'lieve-builder' ) : __( 'Include', 'lieve-builder' ),
		'title'       => lieve_condition_types()[ $row['type'] ] ?? __( 'Condition', 'lieve-builder' ),
		'description' => implode( ' · ', $description ),
	);
}

function lieve_template_rule_description( $row ) {
	$display = lieve_template_rule_display( $row );
	return $display['actionLabel'] . ': ' . $display['title'] . ( $display['description'] ? ' · ' . $display['description'] : '' );
}

/** Small, consistent line icons; never dependent on an icon font loading. */
function lieve_template_display_icon( $name ) {
	$paths = array(
		'scope'   => '<circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="3.5" ry="8.5"/><path d="M3.5 12h17"/>',
		'manual'  => '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9h17M9 9v10.5"/>',
		'chevron' => '<path d="m9 5 7 7-7 7"/>',
		'warning' => '<path d="m10.3 4.6-7 12.2a2 2 0 0 0 1.7 3h14a2 2 0 0 0 1.7-3l-7-12.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/>',
	);
	return '<svg class="lieve-display-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' . ( $paths[ $name ] ?? $paths['scope'] ) . '</svg>';
}

function lieve_render_template_display_rule( $rule ) {
	echo '<div class="lieve-display-rule"><span class="lieve-display-action" data-rule-action="' . esc_attr( $rule['action'] ) . '">' . esc_html( $rule['actionLabel'] ) . '</span><div class="lieve-display-rule-copy"><span class="lieve-display-scope">' . esc_html( $rule['title'] ) . '</span>';
	if ( $rule['description'] ) { echo '<p class="lieve-display-target">' . esc_html( $rule['description'] ) . '</p>'; }
	echo '</div></div>';
}

function lieve_template_display_heading( $rules ) {
	$includes = array_values( array_filter( $rules, function( $rule ) { return 'include' === $rule['action']; } ) );
	$excluded = count( $rules ) - count( $includes );
	if ( ! $rules ) { return array( 'title' => __( 'Manual placement', 'lieve-builder' ), 'caption' => __( 'No automatic display rules', 'lieve-builder' ) ); }
	$title = $includes ? $includes[0]['title'] . ( $includes[0]['description'] ? ' · ' . $includes[0]['description'] : '' ) : __( 'Entire Website', 'lieve-builder' );
	if ( count( $includes ) > 1 ) { $title .= sprintf( _n( ' +%d more rule', ' +%d more rules', count( $includes ) - 1, 'lieve-builder' ), count( $includes ) - 1 ); }
	$caption = array();
	if ( $includes ) { $caption[] = sprintf( _n( '%d include rule', '%d include rules', count( $includes ), 'lieve-builder' ), count( $includes ) ); }
	if ( $excluded ) { $caption[] = sprintf( _n( '%d exclusion rule', '%d exclusion rules', $excluded, 'lieve-builder' ), $excluded ); }
	return array( 'title' => $title, 'caption' => implode( ' · ', $caption ) );
}

function lieve_render_template_display( $snapshot ) {
	$rules = $snapshot['displayRules']; $count = count( $rules ); $heading = lieve_template_display_heading( $rules );
	if ( 'component' === ($snapshot['templateType']??'') ) { $heading = array('title'=>__('Linked component','lieve-builder'),'caption'=>__('Shared model for linked instances','lieve-builder')); }
	echo '<div class="lieve-template-display" data-template-display>';
	echo $count ? '<details class="lieve-template-rule-details lieve-display-card"><summary class="lieve-display-overview">' : '<div class="lieve-display-card is-manual"><div class="lieve-display-overview">';
	echo '<span class="lieve-display-icon">' . lieve_template_display_icon( $count ? 'scope' : 'manual' ) . '</span><span class="lieve-display-copy"><span class="lieve-display-title" title="' . esc_attr( $heading['title'] ) . '">' . esc_html( $heading['title'] ) . '</span><span class="lieve-display-caption">' . esc_html( $heading['caption'] );
	if ( $snapshot['competition'] ) { echo '<span class="lieve-display-overlap-hint"> · ' . esc_html( sprintf( _n( '%d overlap', '%d overlaps', count( $snapshot['competition'] ), 'lieve-builder' ), count( $snapshot['competition'] ) ) ) . '</span>'; }
	echo '</span></span>';
	if ( $count ) { echo lieve_template_display_icon( 'chevron' ); }
	echo $count ? '</summary>' : '</div>';
	if ( $count ) {
		echo '<div class="lieve-display-panel"><ol class="lieve-display-rules">';
		foreach ( $rules as $rule ) { echo '<li>'; lieve_render_template_display_rule( $rule ); echo '</li>'; }
		echo '</ol><p class="lieve-display-note">' . esc_html__( 'Includes use OR logic. Exclusions take precedence.', 'lieve-builder' ) . '</p>';
		lieve_render_template_competition( $snapshot['competition'] );
		echo '</div></details>';
	} else {
		lieve_render_template_competition( $snapshot['competition'] );
		echo '</div>';
	}
	echo '</div>';
}

function lieve_render_template_competition( $items ) {
	if ( ! $items ) { return; }
	echo '<details class="lieve-template-competition"><summary>' . lieve_template_display_icon( 'warning' ) . '<span>' . esc_html__( 'Potential overlap', 'lieve-builder' ) . '</span><span class="lieve-display-count">' . esc_html( count( $items ) ) . '</span>' . lieve_template_display_icon( 'chevron' ) . '</summary><div class="lieve-display-panel"><p class="lieve-display-note">' . esc_html__( 'These published templates may target the same location. This is advisory; exclusions and frontend specificity still determine the result.', 'lieve-builder' ) . '</p><ul class="lieve-display-peers">';
	foreach ( $items as $item ) { echo '<li>'; if ( $item['editUrl'] ) { echo '<a href="' . esc_url( $item['editUrl'] ) . '">' . esc_html( $item['title'] ) . '</a>'; } else { echo esc_html( $item['title'] ); } echo '</li>'; }
	echo '</ul></div></details>';
}

function lieve_template_library_notices() {
	$screen = get_current_screen(); if ( ! $screen || 'edit' !== $screen->base || LIEVE_TEMPLATE_POST_TYPE !== $screen->post_type ) { return; }
	$id = isset( $_GET['lieve_duplicated'] ) && is_scalar( $_GET['lieve_duplicated'] ) ? absint( $_GET['lieve_duplicated'] ) : 0;
	if ( $id && LIEVE_TEMPLATE_POST_TYPE === get_post_type( $id ) && current_user_can( 'edit_post', $id ) ) { echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__( 'Template duplicated as an inactive copy.', 'lieve-builder' ) . ' <a href="' . esc_url( lieve_builder_url( $id ) ) . '">' . esc_html__( 'Open Visual Editor', 'lieve-builder' ) . '</a></p></div>'; }
	echo '<div id="lieve-template-list-status" class="lieve-template-list-status" role="status" aria-live="polite" hidden></div>';
}

/** First-paint empty state: no client-side replacement or misleading first-template CTA. */
function lieve_template_empty_messages( $labels ) {
	if ( ! is_admin() ) { return $labels; }
	$filtered = ! empty( $_GET['s'] ) || ! empty( $_GET['lieve_template_type'] );
	$labels->not_found = esc_html( $filtered ? __( 'No templates match the current search or filters.', 'lieve-builder' ) : __( 'No templates in this view. Use Create New Template to add an inactive template.', 'lieve-builder' ) );
	$labels->not_found_in_trash = esc_html__( 'Trash is empty.', 'lieve-builder' );
	return $labels;
}
