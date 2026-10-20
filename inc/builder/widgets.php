<?php
/** Functional widget settings. No decorative element defaults. */
defined( 'ABSPATH' ) || exit;

function lieve_complete_widget_registry( $registry ) {
	$field = static function( $label, $type = 'text', $options = array() ) { return compact( 'label', 'type', 'options' ); };
	$registry['image']['fields'] += array(
		'caption' => $field( 'Caption' ),
		'imageLink' => $field( 'Link image', 'select', array( '' => 'No link', 'media' => 'Full-size image', 'custom' => 'Custom URL', 'lightbox' => 'Lightbox' ) ),
		'linkUrl' => $field( 'Custom link URL', 'url' ), 'linkNewTab' => $field( 'Open link in a new tab', 'checkbox' ),
		'imageSizes' => $field( 'Responsive sizes attribute' ),
		'imageDecoding' => $field( 'Image decoding', 'select', array( '' => 'Browser default', 'async' => 'Asynchronous', 'sync' => 'Synchronous', 'auto' => 'Automatic' ) ),
	);
	foreach ( array( 'image-gallery', 'carousel', 'slider' ) as $type ) {
		$registry[$type]['fields']['items']['itemFields'] = array( 'Image URL', 'Caption', 'Alternative text', 'Link URL', 'Attachment ID' );
		$registry[$type]['fields'] += array( 'galleryLink' => $field( 'Image links', 'select', array( '' => 'No link', 'media' => 'Full-size image', 'custom' => 'Item link URL', 'lightbox' => 'Lightbox' ) ), 'galleryCaptions' => $field( 'Show captions', 'select', array( '' => 'Show captions', 'hide' => 'Hide captions' ) ), 'gallerySize' => $field( 'Image size', 'text' ) );
	}
	foreach ( array( 'slider', 'carousel', 'slider-nested' ) as $type ) {
		$registry[$type]['fields'] += array(
			'sliderArrows' => $field( 'Show arrows', 'checkbox' ), 'sliderDots' => $field( 'Show slide selectors', 'checkbox' ),
			'sliderAutoplay' => $field( 'Autoplay', 'checkbox' ), 'sliderInterval' => $field( 'Autoplay interval (ms)', 'number' ),
			'sliderLoop' => $field( 'Loop at the first and last slide', 'checkbox' ), 'sliderSwipe' => $field( 'Swipe / drag navigation', 'checkbox' ),
			'sliderKeyboard' => $field( 'Keyboard arrow navigation', 'checkbox' ),
			'sliderEffect' => $field( 'Transition', 'select', array( '' => 'Instant', 'fade' => 'Fade' ) ), 'sliderDuration' => $field( 'Transition duration (ms)', 'number' ),
		);
		$registry[$type]['defaults'] += array( 'sliderArrows' => true, 'sliderLoop' => true, 'sliderSwipe' => true, 'sliderKeyboard' => true );
	}
	$registry['nav-menu']['fields'] += array( 'label' => $field( 'Accessible navigation label' ), 'menuLocation' => $field( 'Registered menu location' ), 'menuDepth' => $field( 'Maximum menu depth (0 = all)', 'number' ) );
	foreach ( array( 'nav-menu', 'nav-nested' ) as $type ) { $registry[$type]['fields'] += array( 'menuMobile' => $field( 'Collapsible mobile navigation', 'checkbox' ), 'menuBreakpoint' => $field( 'Mobile navigation width (px)', 'number' ), 'menuToggleLabel' => $field( 'Mobile toggle label' ), 'menuCloseOnLink' => $field( 'Close mobile navigation after following a link', 'checkbox' ), 'menuSubmenus' => $field( 'Accessible submenu toggle buttons', 'checkbox' ) ); }
	$registry['form']['fields']['items']['itemFields'] = array( 'Label', 'Field type', 'Required', 'Options (comma separated)', 'Placeholder', 'Default value' );
	$registry['form']['fields'] += array( 'subject' => $field( 'Email subject (empty = form title)' ), 'redirectUrl' => $field( 'After success: same-site redirect URL', 'url' ), 'resetOnSuccess' => $field( 'Reset fields after successful submission', 'checkbox' ) );
	$registry['form']['defaults']['resetOnSuccess'] = true;
	$registry['form']['description'] = 'Validated contact form with server-owned field definitions. Email goes to the WordPress administration address. Select/radio options and hidden values are checked on the server. Configure SMTP delivery separately.';
	return $registry;
}

function lieve_widget_assets() {
	if ( ! empty( $GLOBALS['lieve_element_preview'] ) || ! defined( 'LIEVE_URL' ) || ! function_exists( 'wp_enqueue_script' ) ) { return; }
	wp_enqueue_script( 'lieve-widget-runtime', LIEVE_URL . 'assets/js/widget-runtime.js', array(), lieve_asset_version( 'assets/js/widget-runtime.js' ), true );
	wp_enqueue_style( 'lieve-widgets', LIEVE_URL . 'assets/css/widgets.css', array(), lieve_asset_version( 'assets/css/widgets.css' ) );
}

function lieve_widget_image_link( $html, $props, $url, $group = '' ) {
	$mode = $props['imageLink'] ?? ''; if ( ! $mode ) { return $html; }
	$href = 'custom' === $mode ? ( $props['linkUrl'] ?? '' ) : $url;
	if ( ! $href ) { return $html; }
	$extra = ! empty( $props['linkNewTab'] ) && 'lightbox' !== $mode ? ' target="_blank" rel="noopener noreferrer"' : '';
	if ( 'lightbox' === $mode ) { lieve_widget_assets(); $extra .= ' data-lieve-lightbox data-lightbox-group="' . esc_attr( $group ) . '" data-lightbox-caption="' . esc_attr( $props['caption'] ?? '' ) . '"'; }
	return '<a href="' . esc_url( $href ) . '"' . $extra . '>' . $html . '</a>';
}

function lieve_render_gallery_widget( $node, $attributes ) {
	$type = $node['type']; $props = $node['props'] ?? array(); $slide = 'image-gallery' !== $type; $nested = 'slider-nested' === $type;
	$items = $nested ? ( $node['children'] ?? array() ) : lieve_element_items( $props['items'] ?? '', 5 ); $extra = '';
	if ( $slide ) {
		lieve_widget_assets();
		$extra = ' data-lieve-slider role="region" aria-roledescription="carousel" aria-label="' . esc_attr( $props['label'] ?? 'Slideshow' ) . '" tabindex="0"';
		foreach ( array( 'Autoplay' => false, 'Loop' => true, 'Swipe' => true, 'Keyboard' => true ) as $key => $default ) { $extra .= ' data-slider-' . strtolower( $key ) . '="' . ( ( $props['slider' . $key] ?? $default ) ? 'true' : 'false' ) . '"'; }
		$extra .= ' data-slider-interval="' . min( 60000, max( 2000, (int) ( $props['sliderInterval'] ?? 5000 ) ) ) . '" data-slider-duration="' . min( 2000, max( 0, (int) ( $props['sliderDuration'] ?? 200 ) ) ) . '" data-slider-effect="' . ( 'fade' === ( $props['sliderEffect'] ?? '' ) ? 'fade' : 'instant' ) . '"';
	}
	echo '<div' . $attributes . $extra . '>';
	foreach ( $items as $index => $item ) {
		echo '<div data-lieve-slide' . ( $slide ? ' role="group" aria-roledescription="slide" aria-label="' . ( $index + 1 ) . ' / ' . count( $items ) . '"' : '' ) . ( $slide && $index ? ' hidden' : '' ) . '>';
		if ( $nested ) { lieve_render_node( $item ); }
		else {
			$caption = $item[1] ?? ''; $alt = $item[2] ?? $caption; $attachment = absint( $item[4] ?? 0 ); $url = $item[0];
			$image = $attachment && function_exists( 'wp_get_attachment_image' ) ? wp_get_attachment_image( $attachment, sanitize_key( $props['gallerySize'] ?? 'full' ) ?: 'full', false, array( 'alt' => $alt, 'loading' => 'lazy' ) ) : '<img src="' . esc_url( $url ) . '" alt="' . esc_attr( $alt ) . '" loading="lazy">';
			if ( $attachment && function_exists( 'wp_get_attachment_image_url' ) ) { $url = wp_get_attachment_image_url( $attachment, 'full' ) ?: $url; }
			echo '<figure>' . lieve_widget_image_link( $image, array( 'imageLink' => $props['galleryLink'] ?? '', 'linkUrl' => $item[3] ?? '', 'caption' => $caption ), $url, $node['id'] );
			if ( 'hide' !== ( $props['galleryCaptions'] ?? '' ) && '' !== $caption ) { echo '<figcaption>' . esc_html( $caption ) . '</figcaption>'; } echo '</figure>';
		}
		echo '</div>';
	}
	if ( $slide && count( $items ) > 1 ) {
		$icon = static function( $direction ) { return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' . ( 'prev' === $direction ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6' ) . '"/></svg>'; };
		if ( false !== ( $props['sliderArrows'] ?? true ) ) { echo '<button type="button" data-lieve-slide-prev aria-label="Previous slide">' . $icon('prev') . '</button><button type="button" data-lieve-slide-next aria-label="Next slide">' . $icon('next') . '</button>'; }
		if ( ! empty( $props['sliderDots'] ) ) { echo '<div data-lieve-slide-dots role="group" aria-label="Choose a slide">'; foreach ( $items as $index => $item ) { echo '<button type="button" data-lieve-slide-index="' . $index . '" aria-label="Go to slide ' . ( $index + 1 ) . '"' . ( $index ? '' : ' aria-current="true"' ) . '>' . ( $index + 1 ) . '</button>'; } echo '</div>'; }
		if ( ! empty( $props['sliderAutoplay'] ) ) { echo '<button type="button" data-lieve-slide-pause aria-pressed="false">Pause autoplay</button>'; }
		echo '<span data-lieve-slide-status role="status" aria-live="polite">1 / ' . count( $items ) . '</span>';
	}
	echo '</div>';
}

function lieve_render_menu_widget( $node, $attributes ) {
	$props = $node['props'] ?? array(); $id = 'lieve-menu-' . lieve_element_number( $node['id'] );
	$mobile = ! empty( $props['menuMobile'] ); if ( $mobile || ! empty( $props['menuSubmenus'] ) ) { lieve_widget_assets(); }
	$extra = $mobile || ! empty( $props['menuSubmenus'] ) ? ' data-lieve-navigation data-menu-mobile="' . ( $mobile ? 'true' : 'false' ) . '" data-menu-breakpoint="' . min( 2000, max( 320, (int) ( $props['menuBreakpoint'] ?? 991 ) ) ) . '" data-menu-close="' . ( false !== ( $props['menuCloseOnLink'] ?? true ) ? 'true' : 'false' ) . '" data-menu-submenus="' . ( ! empty( $props['menuSubmenus'] ) ? 'true' : 'false' ) . '"' : '';
	echo '<nav' . $attributes . ' aria-label="' . esc_attr( $props['label'] ?? 'Navigation' ) . '"' . $extra . '>';
	if ( $mobile ) { echo '<button type="button" data-menu-toggle aria-controls="' . esc_attr($id) . '" aria-expanded="false" hidden>' . esc_html( $props['menuToggleLabel'] ?? 'Menu' ) . '</button>'; }
	if ( $mobile ) { echo '<div id="' . esc_attr($id) . '" data-menu-panel>'; }
	if ( 'nav-menu' === $node['type'] ) { wp_nav_menu( array( 'menu' => absint( $props['menuId'] ?? 0 ), 'theme_location' => sanitize_key( $props['menuLocation'] ?? '' ), 'depth' => min( 10, max( 0, (int) ( $props['menuDepth'] ?? 0 ) ) ), 'container' => false, 'fallback_cb' => false ) ); }
	else { lieve_render_element_children( $node ); }
	if ( $mobile ) { echo '</div>'; } echo '</nav>';
}
