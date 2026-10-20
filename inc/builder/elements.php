<?php
/** Element definitions shared by the editor, storage and renderer. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
require_once __DIR__ . '/widgets.php';

/** Content defaults only: new elements never receive decorative styles. */
function lieve_element_registry() {
	static $cached = null;
	if ( null !== $cached ) { return $cached; }
	$registry = array();
	$add = function( $type, $label, $group, $icon, $fields = array(), $defaults = array(), $children = false, $dependency = '' ) use ( &$registry ) {
		$registry[ $type ] = compact( 'label', 'group', 'icon', 'fields', 'defaults', 'children', 'dependency' );
	};
	$text = function( $label, $type = 'text', $options = array() ) { return array( 'label' => $label, 'type' => $type, 'options' => $options ); };
	$url = $text( 'URL', 'url' );
	$content = $text( 'Content', 'textarea' );
	$items = $text( 'Items (one per line: title | content or URL)', 'textarea' );
	$link = array( 'label' => $text( 'Label' ), 'url' => $url, 'target' => $text( 'Open in a new tab', 'checkbox' ) );
	$media = array( 'url' => $url, 'alt' => $text( 'Alternative text' ) );
	$nestable = array( 'section' => 'Section', 'container' => 'Container', 'block' => 'Block', 'div' => 'Div', 'slot' => 'Slot' );
	foreach ( $nestable as $type => $label ) { $add( $type, $label, 'Layout', 'layout-' . $type, array(), array(), true ); }
	$registry['slot']['fields'] = array( 'slotKey' => $text( 'Slot key' ), 'label' => $text( 'Slot label' ), 'slotOverride' => $text( 'Use local slot content (including an empty slot)', 'checkbox' ) );
	$add( 'component', 'Component', 'Layout', 'layout-block', array( 'componentId' => $text( 'Component model', 'number' ) ), array(), true );
	$add( 'heading', 'Heading', 'Basic', 'heading', array( 'content' => $content, 'level' => $text( 'HTML level', 'select', array( 1 => 'H1', 2 => 'H2', 3 => 'H3', 4 => 'H4', 5 => 'H5', 6 => 'H6' ) ) ), array( 'content' => 'Your heading', 'level' => 2 ) );
	$add( 'text-basic', 'Basic Text', 'Basic', 'text', array( 'content' => $content ), array( 'content' => 'Write your text here.' ) );
	$add( 'text', 'Rich Text', 'Basic', 'text', array( 'content' => $content ), array( 'content' => 'Write your text here.' ) );
	$add( 'text-link', 'Text Link', 'Basic', 'link', $link, array( 'label' => 'Learn more', 'url' => '#' ) );
	$add( 'button', 'Button', 'Basic', 'button', $link, array( 'label' => 'Learn more', 'url' => '#' ) );
	$add( 'icon', 'Icon', 'Basic', 'star', array( 'symbol' => $text( 'Symbol' ), 'label' => $text( 'Accessible label' ) ), array( 'symbol' => '★', 'label' => 'Star' ) );
	$add( 'image', 'Image', 'Basic', 'image', $media );
	$add( 'video', 'Video', 'Basic', 'play', array( 'url' => $url, 'poster' => $text( 'Poster URL', 'url' ), 'loop' => $text( 'Loop', 'checkbox' ), 'muted' => $text( 'Muted', 'checkbox' ) ) );
	$add( 'spacer', 'Spacer', 'Layout', 'spacing', array( 'height' => $text( 'Height (px)', 'number' ) ) );
	$add( 'nav-nested', 'Nav (Nestable)', 'Navigation', 'menu', array( 'label' => $text( 'Accessible label' ) ), array( 'label' => 'Main navigation' ), true );
	$add( 'dropdown', 'Dropdown', 'Navigation', 'menu', array( 'label' => $text( 'Label' ) ), array( 'label' => 'Menu' ), true );
	$add( 'offcanvas', 'Offcanvas', 'Navigation', 'panel', array( 'label' => $text( 'Open label' ) ), array( 'label' => 'Open panel' ), true );
	$add( 'toggle', 'Toggle', 'Navigation', 'panel', array( 'label' => $text( 'Label' ), 'targetId' => $text( 'Target element ID' ) ), array( 'label' => 'Toggle' ) );
	$add( 'toggle-mode', 'Toggle Mode', 'Navigation', 'sun', array( 'label' => $text( 'Label' ) ), array( 'label' => 'Switch color mode' ) );
	$add( 'divider', 'Divider', 'General', 'spacing' );
	$add( 'icon-box', 'Icon Box', 'General', 'star', array( 'symbol' => $text( 'Symbol' ), 'title' => $text( 'Title' ), 'content' => $content ), array( 'symbol' => '★', 'title' => 'Feature', 'content' => 'Describe your feature.' ) );
	foreach ( array( 'social-icons' => 'Social Icons', 'list' => 'List', 'pricing-tables' => 'Pricing Tables', 'team-members' => 'Team Members', 'testimonials' => 'Testimonials' ) as $type => $label ) {
		$add( $type, $label, 'General', 'list', array( 'items' => $items ), array( 'items' => "First item | Description\nSecond item | Description" ) );
	}
	foreach ( array( 'accordion' => 'Accordion', 'tabs' => 'Tabs' ) as $type => $label ) { $add( $type, $label, 'Interactive', 'list', array( 'items' => $items ), array( 'items' => "First item | Content\nSecond item | Content" ) ); }
	foreach ( array( 'accordion-nested' => 'Accordion (Nestable)', 'tabs-nested' => 'Tabs (Nestable)', 'slider-nested' => 'Slider (Nestable)' ) as $type => $label ) { $add( $type, $label, 'Interactive', 'list', array( 'label' => $text( 'Label' ) ), array( 'label' => $label ), true ); }
	$add( 'alert', 'Alert', 'General', 'alert', array( 'content' => $content, 'dismissible' => $text( 'Dismissible', 'checkbox' ) ), array( 'content' => 'Your notification', 'dismissible' => true ) );
	$add( 'animated-typing', 'Animated Typing', 'Interactive', 'text', array( 'items' => $text( 'Phrases (one per line)', 'textarea' ), 'interval' => $text( 'Interval (ms)', 'number' ) ), array( 'items' => "Create\nBuild\nPublish", 'interval' => 2400 ) );
	$add( 'countdown', 'Countdown', 'Interactive', 'clock', array( 'date' => $text( 'End date', 'datetime-local' ), 'label' => $text( 'Completed message' ) ), array( 'label' => 'The countdown has ended.' ) );
	$add( 'counter', 'Counter', 'Interactive', 'hash', array( 'value' => $text( 'Value', 'number' ), 'prefix' => $text( 'Prefix' ), 'suffix' => $text( 'Suffix' ) ), array( 'value' => 100 ) );
	foreach ( array( 'progress-bar' => 'Progress Bar', 'pie-chart' => 'Pie Chart', 'rating' => 'Rating' ) as $type => $label ) { $add( $type, $label, 'General', 'chart', array( 'value' => $text( 'Value', 'number' ), 'maximum' => $text( 'Maximum', 'number' ), 'label' => $text( 'Label' ) ), array( 'value' => 3, 'maximum' => 5, 'label' => $label ) ); }
	$add( 'html', 'Custom Code', 'Advanced', 'code', array( 'content' => $text( 'HTML/PHP', 'textarea' ), 'customCss' => $text( 'CSS', 'textarea' ), 'customJs' => $text( 'JavaScript', 'textarea' ), 'phpPreview' => $text( 'Live PHP preview', 'checkbox' ), 'suppressPhpErrors' => $text( 'Suppress PHP errors', 'checkbox' ), 'dynamicCode' => $text( 'Dynamic data', 'checkbox' ), 'wrapHtml' => $text( 'Add a wrapper for builder styles', 'checkbox' ) ), array( 'wrapHtml' => false, 'phpPreview' => false, 'suppressPhpErrors' => false, 'dynamicCode' => false ) );
	$add( 'code', 'Code', 'Advanced', 'code', array( 'content' => $text( 'Code to display (no PHP execution)', 'textarea' ) ), array( 'content' => '<p>Hello world</p>' ) );
	$add( 'template', 'Template', 'Advanced', 'layout', array( 'templateId' => $text( 'Template ID', 'number' ) ) );
	$add( 'logo', 'Logo', 'Basic', 'image', $media + array( 'linkUrl' => $text( 'Link URL', 'url' ) ) );
	$add( 'breadcrumbs', 'Breadcrumbs', 'Navigation', 'link' );
	$add( 'back-to-top', 'Back to Top', 'Navigation', 'arrow', array( 'label' => $text( 'Label' ) ), array( 'label' => 'Back to top' ) );
	foreach ( array( 'image-gallery' => 'Image Gallery', 'carousel' => 'Carousel', 'slider' => 'Slider' ) as $type => $label ) { $add( $type, $label, 'Media', 'image', array( 'items' => $text( 'Images (one per line: image URL | caption)', 'textarea' ) ) ); }
	$add( 'audio', 'Audio', 'Media', 'audio', array( 'url' => $url, 'loop' => $text( 'Loop', 'checkbox' ) ) );
	$add( 'file', 'File', 'Media', 'file', $link, array( 'label' => 'Download file' ) );
	$add( 'svg', 'SVG', 'Media', 'code', $media );
	$add( 'form', 'Form', 'Forms', 'form', array( 'title' => $text( 'Form title' ), 'items' => $text( 'Fields (one per line: label | text, email, textarea, number or checkbox | required)', 'textarea' ), 'label' => $text( 'Submit label' ), 'successMessage' => $text( 'Success message' ) ), array( 'title' => 'Contact', 'items' => "Name | text | required\nEmail | email | required\nMessage | textarea | required", 'label' => 'Send message', 'successMessage' => 'Thank you. Your message has been sent.' ) );
	$add( 'form-checkbox', 'Form Checkbox', 'Forms', 'form', array( 'label' => $text( 'Label' ), 'fieldName' => $text( 'Field name' ), 'required' => $text( 'Required', 'checkbox' ) ), array( 'label' => 'I agree', 'fieldName' => 'consent' ) );
	foreach ( array( 'map' => 'Map (Google)', 'map-leaflet' => 'Map (OpenStreetMap)', 'facebook-page' => 'Facebook Page', 'instagram-feed' => 'Instagram Feed' ) as $type => $label ) {
		$add( $type, $label, 'Integrations', 'globe', array( 'embedUrl' => $text( 'Embed URL', 'url' ), 'label' => $text( 'Load button label' ) ), array( 'label' => 'Load external content' ) );
	}
	$add( 'map-connector', 'Map Connector', 'Integrations', 'globe', array( 'targetId' => $text( 'Map element ID' ), 'embedUrl' => $text( 'Location embed URL', 'url' ), 'label' => $text( 'Label' ) ), array( 'label' => 'Show on map' ) );
	$saved_queries = function_exists( 'lieve_query_choices' ) ? lieve_query_choices( true ) : array( '' => 'Use element settings' );
	$query = array( 'savedQuery' => $text( 'Saved query', 'saved-query', $saved_queries ), 'postType' => $text( 'Post type' ), 'count' => $text( 'Items per page', 'number' ), 'taxonomy' => $text( 'Taxonomy' ), 'termId' => $text( 'Term ID', 'number' ) );
	foreach ( array( 'posts' => 'Posts', 'related-posts' => 'Related Posts' ) as $type => $label ) { $add( $type, $label, 'WordPress', 'wordpress', $query, array( 'postType' => 'post', 'count' => 6, 'taxonomy' => 'category' ) ); }
	$add( 'query-results', 'Query Results', 'Query', 'filter', array( 'savedQuery' => $text( 'Saved query', 'saved-query', function_exists( 'lieve_query_choices' ) ? lieve_query_choices() : array( '' => 'Select a saved query' ) ), 'emptyText' => $text( 'Empty result message' ), 'showDescription' => $text( 'Show description', 'checkbox' ) ), array( 'emptyText' => 'No results found.', 'showDescription' => true ) );
	$add( 'nav-menu', 'Nav Menu', 'WordPress', 'menu', array( 'menuId' => $text( 'Menu ID', 'number' ) ) );
	$add( 'sidebar', 'Sidebar', 'WordPress', 'panel', array( 'sidebarId' => $text( 'Sidebar ID' ) ) );
	$add( 'search', 'Search', 'WordPress', 'search', array( 'label' => $text( 'Button label' ), 'placeholder' => $text( 'Placeholder' ) ), array( 'label' => 'Search', 'placeholder' => 'Search this site…' ) );
	$add( 'shortcode', 'Shortcode', 'WordPress', 'code', array( 'content' => $text( 'Shortcode', 'textarea' ) ) );
	$add( 'wordpress', 'WordPress', 'WordPress', 'wordpress', array( 'mode' => $text( 'Widget', 'select', array( 'calendar' => 'Calendar', 'archives' => 'Archives', 'categories' => 'Categories', 'pages' => 'Pages' ) ) ), array( 'mode' => 'calendar' ) );
	foreach ( array( 'post-title' => 'Post Title', 'post-excerpt' => 'Post Excerpt', 'post-meta' => 'Post Meta', 'post-content' => 'Post Content', 'post-sharing' => 'Post Sharing', 'post-author' => 'Post Author', 'post-comments' => 'Post Comments', 'post-taxonomy' => 'Post Taxonomy', 'post-navigation' => 'Post Navigation', 'post-reading-time' => 'Post Reading Time', 'post-reading-progress-bar' => 'Post Reading Progress', 'post-toc' => 'Table of Contents' ) as $type => $label ) {
		$add( $type, $label, 'Single', 'wordpress', array( 'label' => $text( 'Label' ), 'taxonomy' => $text( 'Taxonomy' ) ), array( 'taxonomy' => 'category' ) );
	}
	foreach ( array( 'pagination' => 'Pagination', 'query-results-summary' => 'Query Results Summary', 'filter-checkbox' => 'Filter — Checkbox', 'filter-datepicker' => 'Filter — Datepicker', 'filter-radio' => 'Filter — Radio', 'filter-range' => 'Filter — Range', 'filter-search' => 'Filter — Search', 'filter-select' => 'Filter — Select', 'filter-submit' => 'Filter — Submit', 'filter-active-filters' => 'Active Filters' ) as $type => $label ) {
		$add( $type, $label, 'Query', 'filter', array( 'queryId' => $text( 'Posts element ID' ), 'label' => $text( 'Label' ), 'taxonomy' => $text( 'Taxonomy' ), 'minimum' => $text( 'Minimum', 'number' ), 'maximum' => $text( 'Maximum', 'number' ) ), array( 'label' => $label, 'taxonomy' => 'category', 'minimum' => 0, 'maximum' => 100 ) );
	}
	$registry = apply_filters( 'lieve_element_registry', $registry );
	$repeaters = array(
		'accordion' => array( 'Title', 'Content' ), 'tabs' => array( 'Title', 'Content' ),
		'list' => array( 'Title', 'Description' ), 'social-icons' => array( 'Network', 'URL' ),
		'pricing-tables' => array( 'Plan', 'Price', 'Description', 'Link URL' ),
		'team-members' => array( 'Name', 'Role', 'Image URL', 'Link URL' ),
		'testimonials' => array( 'Author', 'Quote', 'Image URL' ),
		'image-gallery' => array( 'Image URL', 'Caption' ), 'carousel' => array( 'Image URL', 'Caption' ), 'slider' => array( 'Image URL', 'Caption' ),
		'animated-typing' => array( 'Phrase' ), 'form' => array( 'Label', 'Field type', 'Required' ),
	);
	foreach ( $repeaters as $type => $columns ) { $registry[ $type ]['fields']['items']['itemFields'] = $columns; }
	foreach ( array( 'map', 'map-leaflet', 'facebook-page', 'instagram-feed' ) as $type ) {
		$registry[ $type ]['fields']['shortcode'] = $text( 'Integration plugin shortcode (optional)', 'textarea' );
		$registry[ $type ]['description'] = 'Use a provider embed URL or a configured integration plugin shortcode. API feeds and credentials are managed by that plugin. External embeds load only after visitor consent.';
	}
	$registry['instagram-feed']['description'] = 'For an Instagram feed, use a configured integration plugin shortcode. Without a plugin, a single public post or reel can use its HTTPS /embed/ URL. Credentials stay in the integration plugin.';
	$registry['map']['description'] = 'Use a Google Maps HTTPS /maps/embed URL or a configured map plugin shortcode. The external map loads only when the visitor presses Load external content.';
	$registry['map-leaflet']['description'] = 'Use an OpenStreetMap HTTPS /export/embed.html URL or a configured map plugin shortcode. This native adapter uses an embedded map, not the complete Leaflet API control set.';
	$registry['facebook-page']['description'] = 'Use Facebook’s HTTPS /plugins/page.php embed URL or a configured integration plugin shortcode. External content loads after the visitor presses the load button.';
	$registry['code']['description'] = 'Displays code as text. Server-side PHP execution is intentionally unavailable.';
	$registry['html']['description'] = 'Add markup, styles and scripts without an extra wrapper. See the result in the canvas; executable previews stay isolated from the editor.';
	$registry['form']['description'] = 'Messages are validated and sent to the WordPress administration email. SMTP delivery must be configured on the site.';
	foreach ( array( 'heading', 'text-basic', 'text', 'html' ) as $type ) { $registry[ $type ]['seoTextFields'] = array( 'content' ); }
	$registry['filter-range']['description'] = 'Maximum price filter for a Posts query using the product post type. Match the Posts element ID and include a Filter — Submit element.';
	foreach ( $registry as $type => &$definition ) {
		if ( 0 === strpos( $type, 'filter-' ) && empty( $definition['description'] ) ) { $definition['description'] = 'Enter the target Posts element ID. Term filters must use the same taxonomy as that Posts element. Add Filter — Submit to apply the selection.'; }
	}
	unset( $definition );
	$registry = lieve_complete_widget_registry( $registry );
	$groups = array_flip( array( 'Layout', 'Basic', 'General', 'Interactive', 'Navigation', 'Media', 'Forms', 'WordPress', 'Single', 'Query', 'Advanced', 'Integrations', 'WooCommerce · Product', 'WooCommerce · Store', 'WooCommerce · Checkout', 'WooCommerce · Account' ) );
	uasort( $registry, function( $a, $b ) use ( $groups ) { return ( $groups[ $a['group'] ] ?? 99 ) <=> ( $groups[ $b['group'] ] ?? 99 ); } );
	$cached = $registry;
	return $cached;
}

function lieve_element_can_nest( $type ) {
	$registry = lieve_element_registry();
	return ! empty( $registry[ $type ]['children'] );
}

/** SVG paths belong to Lieve; reference products contribute no runtime assets. */
function lieve_element_icons() {
	return array(
		'layout' => '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
		'layout-section' => '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18M3 16h18M7 12h10"/>',
		'layout-container' => '<path d="M7 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h3M17 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3"/><rect x="7" y="7" width="10" height="10" rx="1"/>',
		'layout-block' => '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
		'layout-div' => '<path d="m7 7-5 5 5 5m10-10 5 5-5 5M14 5l-4 14"/>',
		'layout-slot' => '<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3M8 12h8m-4-4v8"/>',
		'heading' => '<path d="M5 4v16M19 4v16M5 12h14"/>',
		'text' => '<path d="M4 5h16M4 10h16M4 15h11M4 20h8"/>',
		'link' => '<path d="m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>',
		'button' => '<rect x="2" y="6" width="20" height="12" rx="3"/><path d="M7 12h10m-3-3 3 3-3 3"/>',
		'star' => '<path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.5l6.2-.9Z"/>',
		'image' => '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m21 16-5-5L5 21"/>',
		'play' => '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m10 8 6 4-6 4Z"/>',
		'spacing' => '<path d="M3 5h18M3 19h18M12 8v8m-3-5 3-3 3 3m-6 2 3 3 3-3"/>',
		'menu' => '<path d="M4 6h16M4 12h16M4 18h16"/>',
		'panel' => '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M14 3v18m-7-9h4"/>',
		'sun' => '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
		'list' => '<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',
		'alert' => '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',
		'help' => '<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4.5m0 3h.01"/>',
		'clock' => '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
		'hash' => '<path d="M9 3 7 21M17 3l-2 18M4 8h17M3 16h17"/>',
		'chart' => '<path d="M3 3v18h18M7 16V9m5 7V5m5 11v-5"/>',
		'code' => '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16"/>',
		'arrow' => '<path d="M12 20V4m-6 6 6-6 6 6"/>',
		'audio' => '<path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="16" rx="3" ry="2"/>',
		'file' => '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
		'form' => '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h10M7 12h10M7 17h4"/>',
		'globe' => '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
		'wordpress' => '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h10M7 11h10M7 15h6M7 18h3"/>',
		'search' => '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
		'filter' => '<path d="M3 4h18l-7 8v7l-4 2v-9Z"/>',
		'commerce' => '<path d="M2 3h3l3 12h11l3-8H6M9 20h.01M18 20h.01"/>',
	);
}

function lieve_element_icon( $name ) {
	$icons = lieve_element_icons();
	return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . ( $icons[ $name ] ?? $icons['layout'] ) . '</svg>';
}
