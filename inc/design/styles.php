<?php
/** Shared, opt-in style controls and safe responsive CSS compilation. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
require_once __DIR__ . '/../builder/element-identity.php';

function lieve_style_schema() {
	static $schema;
	if ( $schema ) { return $schema; }
	$schema = array();
	$add = function( $group, $property, $label, $type = 'text', $options = array(), $placeholder = '' ) use ( &$schema ) {
		$schema[ $property ] = compact( 'group', 'label', 'type', 'options', 'placeholder' );
	};
	$select = function( $group, $property, $label, $choices ) use ( $add ) {
		$options = array( '' => 'Default' );
		foreach ( $choices as $choice ) { $options[ $choice ] = ucwords( str_replace( '-', ' ', $choice ) ); }
		foreach ( array( 'inherit', 'initial', 'unset', 'revert' ) as $choice ) { $options[ $choice ] = ucfirst( $choice ); }
		$add( $group, $property, $label, 'select', $options );
	};
	$select( 'Layout', 'display', 'Display', array( 'block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'contents', 'none' ) );
	$select( 'Layout', 'box-sizing', 'Box sizing', array( 'content-box', 'border-box' ) );
	$select( 'Layout', 'visibility', 'Visibility', array( 'visible', 'hidden', 'collapse' ) );
	foreach ( array( 'width' => 'Width', 'min-width' => 'Min. width', 'max-width' => 'Max. width', 'height' => 'Height', 'min-height' => 'Min. height', 'max-height' => 'Max. height' ) as $key => $label ) { $add( 'Sizing', $key, $label, 'dimension', array(), 'auto' ); }
	$add( 'Sizing', 'aspect-ratio', 'Aspect ratio', 'text', array(), '16 / 9' );
	$select( 'Sizing', 'object-fit', 'Object fit', array( 'fill', 'contain', 'cover', 'none', 'scale-down' ) );
	$add( 'Sizing', 'object-position', 'Object position', 'text', array(), '50% 50%' );
	foreach ( array( 'padding' => 'Padding', 'margin' => 'Margin' ) as $prefix => $label ) {
		foreach ( array( 'top', 'right', 'bottom', 'left' ) as $side ) { $add( 'Spacing', $prefix . '-' . $side, $label . ' ' . $side, 'dimension' ); }
	}
	$select( 'Flex & Grid', 'flex-direction', 'Direction', array( 'row', 'row-reverse', 'column', 'column-reverse' ) );
	$select( 'Flex & Grid', 'flex-wrap', 'Wrap', array( 'nowrap', 'wrap', 'wrap-reverse' ) );
	$align = array( 'normal', 'stretch', 'start', 'end', 'center', 'flex-start', 'flex-end', 'baseline', 'space-between', 'space-around', 'space-evenly' );
	foreach ( array( 'align-items' => 'Align items', 'align-content' => 'Align content', 'justify-content' => 'Justify content', 'justify-items' => 'Justify items', 'align-self' => 'Align self', 'justify-self' => 'Justify self' ) as $key => $label ) { $select( 'Flex & Grid', $key, $label, $align ); }
	foreach ( array( 'gap' => 'Gap', 'row-gap' => 'Row gap', 'column-gap' => 'Column gap', 'flex-basis' => 'Flex basis' ) as $key => $label ) { $add( 'Flex & Grid', $key, $label, 'dimension' ); }
	foreach ( array( 'flex-grow' => 'Grow', 'flex-shrink' => 'Shrink', 'order' => 'Order' ) as $key => $label ) { $add( 'Flex & Grid', $key, $label, 'number' ); }
	foreach ( array( 'grid-template-columns' => 'Columns', 'grid-template-rows' => 'Rows', 'grid-auto-columns' => 'Auto columns', 'grid-auto-rows' => 'Auto rows', 'grid-column' => 'Column start / end', 'grid-row' => 'Row start / end', 'grid-area' => 'Grid area' ) as $key => $label ) { $add( 'Flex & Grid', $key, $label, 'text', array(), 'grid-template-columns' === $key ? 'repeat(3, minmax(0, 1fr))' : '' ); }
	$select( 'Flex & Grid', 'grid-auto-flow', 'Auto flow', array( 'row', 'column', 'dense', 'row dense', 'column dense' ) );
	$select( 'Position', 'position', 'Position', array( 'static', 'relative', 'absolute', 'fixed', 'sticky' ) );
	foreach ( array( 'top', 'right', 'bottom', 'left' ) as $key ) { $add( 'Position', $key, ucfirst( $key ), 'dimension', array(), 'auto' ); }
	$add( 'Position', 'z-index', 'Z-index', 'number' );
	foreach ( array( 'overflow', 'overflow-x', 'overflow-y' ) as $key ) { $select( 'Position', $key, ucwords( str_replace( '-', ' ', $key ) ), array( 'visible', 'hidden', 'clip', 'scroll', 'auto' ) ); }
	$add( 'Typography', 'font-family', 'Font family', 'text', array(), 'Arial, sans-serif' );
	$add( 'Typography', 'font-size', 'Font size', 'dimension', array(), '1rem' );
	$select( 'Typography', 'font-weight', 'Weight', array( '100', '200', '300', '400', '500', '600', '700', '800', '900', 'normal', 'bold' ) );
	$select( 'Typography', 'font-style', 'Font style', array( 'normal', 'italic', 'oblique' ) );
	$add( 'Typography', 'line-height', 'Line height', 'text', array(), '1.5' );
	foreach ( array( 'letter-spacing' => 'Letter spacing', 'word-spacing' => 'Word spacing', 'text-indent' => 'Text indent' ) as $key => $label ) { $add( 'Typography', $key, $label, 'dimension' ); }
	$select( 'Typography', 'text-align', 'Alignment', array( 'left', 'center', 'right', 'justify', 'start', 'end' ) );
	$select( 'Typography', 'text-transform', 'Text transform', array( 'none', 'uppercase', 'lowercase', 'capitalize' ) );
	$select( 'Typography', 'text-decoration-line', 'Decoration', array( 'none', 'underline', 'overline', 'line-through' ) );
	$select( 'Typography', 'text-decoration-style', 'Decoration style', array( 'solid', 'double', 'dotted', 'dashed', 'wavy' ) );
	$add( 'Typography', 'text-decoration-color', 'Decoration color', 'color' );
	$add( 'Typography', 'text-decoration-thickness', 'Decoration thickness', 'dimension' );
	$add( 'Typography', 'text-underline-offset', 'Underline offset', 'dimension' );
	$select( 'Typography', 'white-space', 'White space', array( 'normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces' ) );
	$select( 'Typography', 'word-break', 'Word break', array( 'normal', 'break-all', 'keep-all' ) );
	$select( 'Typography', 'overflow-wrap', 'Overflow wrap', array( 'normal', 'break-word', 'anywhere' ) );
	$select( 'Typography', 'text-overflow', 'Text overflow', array( 'clip', 'ellipsis' ) );
	$add( 'Typography', 'color', 'Text color', 'color' );
	$add( 'Typography', 'text-shadow', 'Text shadow', 'text', array(), '0 2px 8px rgba(0,0,0,.15)' );
	$add( 'Background', 'background-color', 'Color', 'color' );
	$add( 'Background', 'background-image', 'Image URL', 'image' );
	$add( 'Background', 'background-size', 'Size', 'text', array(), 'cover' );
	$add( 'Background', 'background-position', 'Position', 'text', array(), 'center center' );
	$select( 'Background', 'background-repeat', 'Repeat', array( 'no-repeat', 'repeat', 'repeat-x', 'repeat-y', 'space', 'round' ) );
	$select( 'Background', 'background-attachment', 'Attachment', array( 'scroll', 'fixed', 'local' ) );
	$select( 'Background', 'background-clip', 'Clip', array( 'border-box', 'padding-box', 'content-box', 'text' ) );
	$select( 'Background', 'background-origin', 'Origin', array( 'border-box', 'padding-box', 'content-box' ) );
	$blend = array( 'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity' );
	$select( 'Background', 'background-blend-mode', 'Blend mode', $blend );
	$add( 'Gradient', 'gradient-apply', 'Apply to', 'select', array( '' => 'Default (background)', 'background' => 'Background', 'text' => 'Text', 'overlay' => 'Overlay' ) );
	$select( 'Gradient', 'gradient-type', 'Type', array( 'linear', 'radial', 'conic', 'none' ) );
	$add( 'Gradient', 'gradient-count', 'Color stops', 'number' );
	$add( 'Gradient', 'gradient-local-stops', 'Local color stops', 'select', array( '1' => 'Local color stops' ) );
	$add( 'Gradient', 'gradient-angle', 'Angle (deg)', 'number' );
	$add( 'Gradient', 'gradient-position', 'Center', 'text', array(), '50% 50%' );
	for ( $index = 1; $index <= 4; $index++ ) { $add( 'Gradient', 'gradient-color-' . $index, 'Stop ' . $index . ' color', 'color' ); $add( 'Gradient', 'gradient-stop-' . $index, 'Stop ' . $index . ' (%)', 'number' ); }
	$add( 'Border & Shadow', 'border-width', 'Width', 'dimension' );
	$select( 'Border & Shadow', 'border-style', 'Style', array( 'none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset' ) );
	$add( 'Border & Shadow', 'border-color', 'Color', 'color' );
	foreach ( array( 'top', 'right', 'bottom', 'left' ) as $side ) {
		$add( 'Border & Shadow', 'border-' . $side . '-width', ucfirst( $side ) . ' width', 'dimension' );
		$add( 'Border & Shadow', 'border-' . $side . '-color', ucfirst( $side ) . ' color', 'color' );
	}
	$add( 'Border & Shadow', 'border-radius', 'Radius', 'dimension' );
	foreach ( array( 'top-left', 'top-right', 'bottom-right', 'bottom-left' ) as $corner ) { $add( 'Border & Shadow', 'border-' . $corner . '-radius', ucwords( str_replace( '-', ' ', $corner ) ), 'dimension' ); }
	$add( 'Border & Shadow', 'box-shadow', 'Box shadow', 'text', array(), '0 8px 24px rgba(0,0,0,.12)' );
	$add( 'Border & Shadow', 'outline-width', 'Outline width', 'dimension' );
	$select( 'Border & Shadow', 'outline-style', 'Outline style', array( 'none', 'solid', 'dashed', 'dotted', 'double' ) );
	$add( 'Border & Shadow', 'outline-color', 'Outline color', 'color' );
	$add( 'Border & Shadow', 'outline-offset', 'Outline offset', 'dimension' );
	foreach ( array( 'translateX', 'translateY', 'translateZ' ) as $key ) { $add( 'Transform', $key, 'Translate ' . substr( $key, -1 ), 'dimension' ); }
	foreach ( array( 'rotateX', 'rotateY', 'rotateZ', 'skewX', 'skewY' ) as $key ) { $add( 'Transform', $key, $key . ' (deg)', 'number' ); }
	foreach ( array( 'scaleX', 'scaleY' ) as $key ) { $add( 'Transform', $key, $key, 'number' ); }
	$add( 'Transform', 'transform', 'Custom transform', 'text', array(), 'rotate(5deg) scale(1.05)' );
	$add( 'Transform', 'transform-origin', 'Origin', 'text', array(), 'center center' );
	$select( 'Transform', 'transform-style', '3D rendering', array( 'flat', 'preserve-3d' ) );
	$select( 'Transform', 'backface-visibility', 'Backface', array( 'visible', 'hidden' ) );
	$add( 'Transform', 'perspective', 'Perspective', 'dimension' );
	$add( 'Transform', 'perspective-origin', 'Perspective origin', 'text', array(), '50% 50%' );
	$add( 'Effects', 'opacity', 'Opacity (0–1)', 'number' );
	$add( 'Effects', 'filter', 'CSS filters', 'text', array(), 'blur(2px) grayscale(50%)' );
	$add( 'Effects', 'backdrop-filter', 'Backdrop filters', 'text', array(), 'blur(12px)' );
	$select( 'Effects', 'mix-blend-mode', 'Blend mode', $blend );
	$select( 'Effects', 'isolation', 'Isolation', array( 'auto', 'isolate' ) );
	$add( 'Effects', 'clip-path', 'Clip / shape', 'text', array(), 'polygon(0 0, 100% 0, 100% 85%, 0 100%)' );
	$select( 'Interaction', 'cursor', 'Cursor', array( 'auto', 'default', 'pointer', 'text', 'move', 'grab', 'grabbing', 'not-allowed', 'help', 'wait', 'crosshair', 'zoom-in', 'zoom-out' ) );
	$select( 'Interaction', 'pointer-events', 'Pointer events', array( 'auto', 'none' ) );
	$select( 'Interaction', 'user-select', 'Text selection', array( 'auto', 'none', 'text', 'all' ) );
	$add( 'Interaction', 'transition-property', 'Transition properties', 'text', array(), 'opacity, transform' );
	$add( 'Interaction', 'transition-duration', 'Duration', 'text', array(), '200ms' );
	$add( 'Interaction', 'transition-delay', 'Delay', 'text', array(), '0ms' );
	$add( 'Interaction', 'transition-timing-function', 'Easing', 'text', array(), 'ease-in-out' );
	$add( 'Interaction', 'animation', 'CSS animation', 'text', array(), 'existing-keyframe-name 1s ease infinite' );
	$select( 'Scroll', 'scroll-behavior', 'Scroll behavior', array( 'auto', 'smooth' ) );
	$select( 'Scroll', 'scroll-snap-type', 'Snap type', array( 'none', 'x mandatory', 'y mandatory', 'both mandatory', 'x proximity', 'y proximity' ) );
	$select( 'Scroll', 'scroll-snap-align', 'Snap alignment', array( 'none', 'start', 'center', 'end' ) );
	$select( 'Scroll', 'scroll-snap-stop', 'Snap stop', array( 'normal', 'always' ) );
	$add( 'Scroll', 'scroll-margin', 'Scroll margin', 'dimension' );
	$add( 'Scroll', 'scroll-padding', 'Scroll padding', 'dimension' );
	$add( 'CSS', 'content', 'Pseudo-element content', 'content' );
	$add( 'CSS', 'custom-css', 'Custom declarations', 'textarea', array(), "color: var(--brand-color);\n--local-gap: 1rem;" );
	return $schema;
}

/** Internal selectors only; arbitrary selectors can never escape the element. */
function lieve_style_targets( $type ) {
	if ( 'popup-shell' === $type ) { return array( 'root' => array( 'label' => 'Dialog', 'selector' => ' > [data-lieve-ui="popup-dialog"]' ), 'overlay' => array( 'label' => 'Overlay', 'selector' => ' > [data-lieve-ui="popup-backdrop"]' ), 'close' => array( 'label' => 'Close button', 'selector' => ' > [data-lieve-ui="popup-dialog"] > [data-lieve-ui="popup-close"]' ), 'frame' => array( 'label' => 'Viewport', 'selector' => '' ) ); }
	$targets = array( 'root' => array( 'label' => 'Element', 'selector' => '' ) );
	$add = function( $key, $label, $selector ) use ( &$targets ) { $targets[ $key ] = compact( 'label', 'selector' ); };
	if ( in_array( $type, array( 'section', 'container', 'block', 'div', 'slot' ), true ) ) {
		$add( 'listing-track', 'Listing track', ' > [data-lieve-listing-track]' );
		$add( 'listing-item', 'Listing items', ' > [data-lieve-listing-track] > [data-lieve-listing-item]' );
		$add( 'listing-controls', 'Listing navigation', ' > [data-lieve-listing-controls]' );
		$add( 'listing-arrows', 'Listing arrows', ' > [data-lieve-listing-controls] > :is([data-listing-prev],[data-listing-next])' );
		$add( 'listing-dots', 'Listing dots', ' > [data-lieve-listing-controls] > [data-listing-dots] > button' );
		$add( 'listing-active-dot', 'Listing active dot', ' > [data-lieve-listing-controls] > [data-listing-dots] > button[aria-current="true"]' );
		$add( 'listing-pause', 'Listing autoplay button', ' > [data-lieve-listing-controls] > [data-listing-pause]' );
	}
	if ( in_array( $type, array( 'image', 'logo', 'product-gallery', 'image-gallery', 'slider', 'carousel', 'team-members', 'testimonials', 'posts', 'related-posts', 'woocommerce-products' ), true ) ) { $add( 'image', 'Images', ' img' ); }
	if ( in_array( $type, array( 'icon-box', 'posts', 'related-posts', 'pricing-tables', 'team-members' ), true ) ) { $add( 'title', 'Titles', ' :is(h1,h2,h3,h4,h5,h6)' ); $add( 'text', 'Text', ' p' ); }
	if ( in_array( $type, array( 'accordion', 'accordion-nested', 'dropdown' ), true ) ) { $add( 'title', 'Titles', ' summary' ); $add( 'panel', 'Panels', ' details' ); }
	if ( in_array( $type, array( 'tabs', 'tabs-nested' ), true ) ) { $add( 'tabs', 'Tab buttons', ' [role="tab"]' ); $add( 'active-tab', 'Active tab', ' [role="tab"][aria-selected="true"]' ); $add( 'panel', 'Panels', ' [role="tabpanel"]' ); }
	if ( in_array( $type, array( 'image-gallery', 'slider', 'carousel', 'slider-nested' ), true ) ) { $add( 'slide', 'Slides', ' [data-lieve-slide]' ); $add( 'caption', 'Captions', ' figcaption' ); }
	if ( 'image' === $type ) { $add( 'caption', 'Caption', ' > figcaption' ); }
	if ( in_array( $type, array( 'slider', 'carousel', 'slider-nested' ), true ) ) { $add( 'arrows', 'Slider arrows', ' > :is([data-lieve-slide-prev],[data-lieve-slide-next])' ); $add( 'dots', 'Slide selectors', ' > [data-lieve-slide-dots] > button' ); $add( 'active-dot', 'Active slide selector', ' > [data-lieve-slide-dots] > button[aria-current="true"]' ); $add( 'pause', 'Autoplay button', ' > [data-lieve-slide-pause]' ); }
	if ( in_array( $type, array( 'nav-menu', 'nav-nested' ), true ) ) { $add( 'mobile-toggle', 'Mobile menu toggle', ' > [data-menu-toggle]' ); $add( 'submenus', 'Submenus', ' ul ul' ); $add( 'submenu-toggle', 'Submenu toggles', ' [data-submenu-toggle]' ); }
	if ( in_array( $type, array( 'form', 'search', 'form-checkbox' ), true ) || 0 === strpos( $type, 'filter-' ) || 0 === strpos( $type, 'woocommerce-' ) || 0 === strpos( $type, 'product-' ) ) {
		$add( 'fields', 'Fields', ' :is(input,select,textarea)' ); $add( 'labels', 'Labels', ' label' ); $add( 'buttons', 'Buttons', ' :is(button,.button,input[type="submit"])' ); $add( 'links', 'Links', ' a' );
	}
	if ( in_array( $type, array( 'list', 'social-icons', 'posts', 'related-posts', 'nav-menu', 'nav-nested' ), true ) ) { $add( 'items', 'Items', ' li' ); $add( 'links', 'Links', ' a' ); }
	if ( in_array( $type, array( 'html', 'text', 'post-content' ), true ) ) {
		$add( 'headings', 'Headings', ' :is(h1,h2,h3,h4,h5,h6)' ); $add( 'text', 'Paragraphs', ' p' ); $add( 'links', 'Links', ' a' ); $add( 'image', 'Images', ' img' ); $add( 'buttons', 'Buttons', ' button' );
	}
	return $targets;
}

/** Repeater fields are validated lazily, without shipping 200 unused controls. */
function lieve_style_field( $property ) {
	$schema = lieve_style_schema();
	if ( isset( $schema[ $property ] ) ) { return $schema[ $property ]; }
	if ( preg_match( '/^gradient-(color|stop)-([1-9][0-9]{0,2})$/D', $property, $match ) && (int) $match[2] <= 100 ) { return $schema[ 'gradient-' . $match[1] . '-1' ]; }
	return null;
}

function lieve_style_value( $property, $value ) {
	$field = lieve_style_field( $property );
	if ( ! $field || ! is_scalar( $value ) ) { return ''; }
	$value = trim( (string) $value );
	if ( '' === $value || strlen( $value ) > ( 'custom-css' === $property ? 6000 : 1200 ) ) { return ''; }
	if ( function_exists( 'lieve_dynamic_reference' ) && lieve_dynamic_reference( $value ) ) { return lieve_dynamic_accepts( lieve_dynamic_reference( $value ), lieve_dynamic_style_kind( $property ) ) ? $value : ''; }
	if ( 'gradient-count' === $property ) { return preg_match( '/^[0-9]+$/D', $value ) ? (string) max( 2, min( 100, (int) $value ) ) : ''; }
	if ( 'image' === $field['type'] ) {
		return preg_match( '~^(https?://|/[^/])~i', $value ) ? esc_url_raw( $value, array( 'http', 'https' ) ) : '';
	}
	if ( 'content' === $field['type'] ) { return substr( sanitize_text_field( $value ), 0, 500 ); }
	if ( 'custom-css' === $property ) { return lieve_safe_css_declarations( $value ); }
	if ( 'select' === $field['type'] ) { return array_key_exists( $value, $field['options'] ) ? $value : ''; }
	if ( 'number' === $field['type'] ) {
		if ( ! is_numeric( $value ) ) {
			if ( ! preg_match( '/^(?:var|calc|min|max|clamp)\(/i', $value ) ) { return ''; }
		} else {
			$number = max( -1000000, min( 1000000, (float) $value ) );
			if ( 'opacity' === $property ) { $number = max( 0, min( 1, $number ) ); }
			if ( 0 === strpos( $property, 'gradient-stop-' ) ) { $number = max( 0, min( 100, $number ) ); }
			return (string) $number;
		}
	}
	// No CSS/HTML breakout, imports, executable functions, URL tricks or escapes.
	if ( preg_match( '~[;{}<>@\\\\]|/\*|\*/|[\x00-\x1f]|(?:expression|url|attr)\s*\(~i', $value ) ) { return ''; }
	preg_match_all( '/([a-zA-Z][a-zA-Z0-9-]*)\s*\(/', $value, $functions );
	$allowed = array( 'var', 'calc', 'min', 'max', 'clamp', 'repeat', 'minmax', 'fit-content', 'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix', 'linear-gradient', 'radial-gradient', 'conic-gradient', 'translate', 'translatex', 'translatey', 'translatez', 'translate3d', 'rotate', 'rotatex', 'rotatey', 'rotatez', 'rotate3d', 'scale', 'scalex', 'scaley', 'scalez', 'scale3d', 'skew', 'skewx', 'skewy', 'matrix', 'matrix3d', 'perspective', 'blur', 'brightness', 'contrast', 'drop-shadow', 'grayscale', 'hue-rotate', 'invert', 'opacity', 'saturate', 'sepia', 'polygon', 'circle', 'ellipse', 'inset', 'cubic-bezier', 'steps' );
	foreach ( $functions[1] as $function ) { if ( ! in_array( strtolower( $function ), $allowed, true ) ) { return ''; } }
	if ( 'dimension' === $field['type'] && is_numeric( $value ) ) { $value .= 'px'; }
	return $value;
}

/** Custom CSS is declaration-only; selectors and at-rules are not accepted. */
function lieve_safe_css_declarations( $value ) {
	if ( preg_match( '~[{}<>@\\\\]|/\*|\*/~', $value ) ) { return ''; }
	$output = array();
	foreach ( array_slice( explode( ';', $value ), 0, 80 ) as $declaration ) {
		$pair = explode( ':', $declaration, 2 ); if ( count( $pair ) < 2 ) { continue; }
		$key = trim( $pair[0] ); $raw = trim( $pair[1] );
		if ( in_array( $key, array( 'custom-css', 'content', 'background-image' ), true ) || 0 === strpos( $key, 'gradient-' ) ) { continue; }
		$clean = preg_match( '/^--[a-zA-Z0-9_-]{1,64}$/', $key ) ? lieve_style_value( 'color', $raw ) : lieve_style_value( $key, $raw );
		if ( '' !== $clean ) { $output[] = $key . ':' . $clean; }
	}
	return implode( ';', $output );
}

function lieve_sanitize_styles( $styles, $type ) {
	if ( ! is_array( $styles ) ) { return array(); }
	$output = array(); $bytes = 0;
	foreach ( lieve_style_targets( $type ) as $target => $definition ) {
		// Keep safe inactive contexts too, so deleting/resetting a breakpoint never
		// destroys element styles when the page is next saved. Only active IDs emit CSS.
		$contexts = is_array( $styles[ $target ] ?? null ) ? $styles[ $target ] : array();
		// Historical contexts must never consume the active contexts' budget. There
		// is no arbitrary 50-ID truncation; the existing declaration-byte limit stays.
		$active = array_flip( array_column( lieve_style_breakpoints(), 'id' ) );
		$devices = array_keys( array_intersect_key( $contexts, $active ) + array_diff_key( $contexts, $active ) );
		foreach ( $devices as $device ) {
			if ( function_exists( 'lieve_valid_breakpoint_id' ) ? ! lieve_valid_breakpoint_id( $device ) : ! in_array( $device, array( 'desktop', 'tablet', 'mobile' ), true ) ) { continue; }
			foreach ( array( 'normal', 'hover', 'focus', 'active', 'before', 'after' ) as $state ) {
				$values = $styles[ $target ][ $device ][ $state ] ?? array(); if ( ! is_array( $values ) ) { continue; }
				foreach ( array_slice( $values, 0, count( lieve_style_schema() ) + 200, true ) as $property => $raw ) {
					$clean = lieve_style_value( $property, $raw );
					$bytes += strlen( $clean ); if ( $bytes > 60000 ) { return $output; }
					if ( '' !== $clean ) { $output[ $target ][ $device ][ $state ][ $property ] = $clean; }
				}
			}
		}
	}
	return $output;
}

function lieve_style_breakpoints() {
	if ( function_exists( 'lieve_breakpoint_order' ) ) { return lieve_breakpoint_order(); }
	return array( array( 'id' => 'desktop', 'width' => 1279, 'base' => true ), array( 'id' => 'tablet', 'width' => 991, 'base' => false ), array( 'id' => 'mobile', 'width' => 767, 'base' => false ) );
}

function lieve_style_devices( $device ) {
	if ( function_exists( 'lieve_breakpoint_cascade' ) ) { return array_column( lieve_breakpoint_cascade( $device ), 'id' ); }
	$devices = array( 'desktop', 'tablet', 'mobile' ); $index = array_search( $device, $devices, true );
	return false === $index ? array() : array_slice( $devices, 0, $index + 1 );
}

/** Resolve a context without flattening the responsive/state cascade. */
function lieve_style_context_values( $styles, $target, $device, $state ) {
	$values = $styles[ $target ][ $device ][ $state ] ?? array();
	$effective = array();
	$states = in_array( $state, array( 'hover', 'focus', 'active' ), true ) ? array( 'normal', $state ) : array( $state );
	foreach ( $states as $context ) {
		foreach ( lieve_style_devices( $device ) as $size ) {
			$current = $styles[ $target ][ $size ][ $context ] ?? array();
			// Structural repeater edits replace the stop list, not its inherited blank cells.
			if ( '1' === ( $current['gradient-local-stops'] ?? '' ) ) { foreach ( array_keys( $effective ) as $key ) { if ( preg_match( '/^gradient-(?:color|stop)-[0-9]+$/D', $key ) ) { unset( $effective[ $key ] ); } } }
			$effective = array_merge( $effective, $current );
		}
	}
	$has_gradient = false; $has_transform = false;
	foreach ( array_keys( $values ) as $key ) {
		$has_gradient = $has_gradient || 'background-image' === $key || 0 === strpos( $key, 'gradient-' );
		$has_transform = $has_transform || (bool) preg_match( '/^(translate|rotate|scale|skew)[XYZ]$/', $key );
	}
	// Composite declarations need the inherited components when only one part changes.
	foreach ( $effective as $key => $value ) {
		if ( ( $has_gradient && ( 'background-image' === $key || 0 === strpos( $key, 'gradient-' ) ) ) || ( $has_transform && preg_match( '/^(translate|rotate|scale|skew)[XYZ]$/', $key ) ) ) { $values[ $key ] = $value; }
	}
	return $values;
}

function lieve_style_numeric_unit( $value, $unit ) { return is_numeric( $value ) ? $value . $unit : $value; }

function lieve_gradient_count( $values ) {
	if ( isset( $values['gradient-count'] ) && ctype_digit( (string) $values['gradient-count'] ) ) { return max( 2, min( 100, (int) $values['gradient-count'] ) ); }
	$count = 2;
	foreach ( array_keys( $values ) as $key ) { if ( preg_match( '/^gradient-(?:color|stop)-([1-9][0-9]{0,2})$/D', $key, $match ) ) { $count = max( $count, min( 100, (int) $match[1] ) ); } }
	return $count;
}

/** Opt-in overlay, above backgrounds and below content; no extra DOM wrapper. */
function lieve_gradient_overlay_css( $selector, $declarations ) {
	if ( ! preg_match( '/(?:^|;)\s*--lieve-gradient-overlay-image\s*:\s*(?:linear|radial|conic)-gradient\(/i', $declarations ) ) { return ''; }
	return ':where(' . $selector . '){position:relative;isolation:isolate}' . $selector . '::before{content:var(--lieve-gradient-overlay-content,none);position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;background-image:var(--lieve-gradient-overlay-image,none)}';
}

/** Preserve live variable references while supplying the dimension field's unit. */
function lieve_dimension_variable_value( $property, $value, $unit = 'px' ) {
	if ( 'dimension' !== ( lieve_style_field( $property )['type'] ?? '' ) || ! preg_match( '/^var\(\s*--([A-Za-z_][A-Za-z0-9_-]*)\s*\)$/D', $value, $match ) || ! function_exists( 'lieve_design_system' ) || ! in_array( $unit, array( 'px', '%', 'rem', 'em', 'vh', 'vw', 'dvh', 'svh', 'vmin', 'vmax', 'ch' ), true ) ) { return $value; }
	static $previous = null, $names = array();
	$variables = lieve_design_system()['variables'];
	if ( $previous !== $variables ) { $previous = $variables; $names = array(); foreach ( $variables as $item ) { foreach ( array_merge( array( $item['name'] ), $item['aliases'] ) as $name ) { $names[ $name ] = true; } } }
	return isset( $names[ $match[1] ] ) ? 'var(--lieve-dimension--' . $match[1] . ',calc(var(--' . $match[1] . ') * 1' . $unit . '))' : $value;
}

/** Existing declaration-only class/custom CSS also gains the default px unit. */
function lieve_dimension_css( $css ) {
	return preg_replace_callback( '/(^|;)\s*([a-z-]+)\s*:\s*(var\(\s*--[A-Za-z_][A-Za-z0-9_-]*\s*\))(\s*!important)?(?=;|$)/i', static function( $match ) { $value = lieve_dimension_variable_value( strtolower( $match[2] ), $match[3] ); return $value === $match[3] ? $match[0] : $match[1] . $match[2] . ':' . $value . ( $match[4] ?? '' ); }, $css );
}

function lieve_style_declarations( $values, $important = false ) {
	if ( function_exists( 'lieve_dynamic_style_value' ) ) {
		foreach ( $values as $key => $value ) { $resolved = lieve_dynamic_style_value( $key, $value ); if ( '' === $resolved ) { unset( $values[ $key ] ); } else { $values[ $key ] = $resolved; } }
	}
	$output = array(); $transforms = array();
	foreach ( $values as $key => $value ) {
		if ( 'custom-css' === $key ) { $output = array_merge( $output, explode( ';', lieve_dimension_css( $value ) ) ); continue; }
		if ( 0 === strpos( $key, 'gradient-' ) ) { continue; }
		$value = lieve_dimension_variable_value( $key, $value );
		if ( preg_match( '/^(translate|rotate|scale|skew)[XYZ]$/', $key ) ) {
			$unit = 0 === strpos( $key, 'rotate' ) || 0 === strpos( $key, 'skew' ) ? 'deg' : '';
			$transforms[ $key ] = $key . '(' . lieve_style_numeric_unit( $value, $unit ) . ')'; continue;
		}
		if ( 'background-image' === $key ) { $value = 'url("' . str_replace( array( '"', '\\', "\n", "\r" ), '', $value ) . '")'; }
		if ( 'content' === $key ) { $value = '"' . addcslashes( $value, "\\\"\n\r" ) . '"'; }
		$output[] = $key . ':' . $value;
	}
	if ( $transforms ) { $ordered = array(); foreach ( array_keys( lieve_style_schema() ) as $key ) { if ( isset( $transforms[ $key ] ) ) { $ordered[] = $transforms[ $key ]; } } $output[] = 'transform:' . implode( ' ', $ordered ); }
	$gradient = ''; $colors = array();
	if ( isset( $values['gradient-type'] ) && in_array( $values['gradient-type'], array( 'inherit', 'initial', 'unset', 'revert', 'none' ), true ) ) { $gradient = $values['gradient-type']; }
	elseif ( ! empty( $values['gradient-type'] ) ) {
		for ( $index = 1; $index <= lieve_gradient_count( $values ); $index++ ) {
			if ( ! empty( $values[ 'gradient-color-' . $index ] ) ) { $colors[] = $values[ 'gradient-color-' . $index ] . ( isset( $values[ 'gradient-stop-' . $index ] ) ? ' ' . lieve_style_numeric_unit( $values[ 'gradient-stop-' . $index ], '%' ) : '' ); }
		}
		$type = $values['gradient-type']; $angle = $values['gradient-angle'] ?? 180; $position = $values['gradient-position'] ?? '50% 50%';
		$prefix = 'linear' === $type ? lieve_style_numeric_unit( $angle, 'deg' ) : ( 'radial' === $type ? 'circle at ' . $position : 'from ' . lieve_style_numeric_unit( $angle, 'deg' ) . ' at ' . $position );
		if ( count( $colors ) >= 2 ) { $gradient = $type . '-gradient(' . $prefix . ',' . implode( ',', $colors ) . ')'; }
	}
	$apply = $values['gradient-apply'] ?? 'background';
	$image = ! empty( $values['background-image'] ) ? 'url("' . str_replace( array( '"', '\\' ), '', $values['background-image'] ) . '")' : '';
	if ( $gradient ) {
		$layer = 'none' === $gradient ? $image ?: 'none' : ( in_array( $gradient, array( 'inherit', 'initial', 'unset', 'revert' ), true ) ? $gradient : $gradient . ( $image ? ',' . $image : '' ) );
		$output[] = 'background-image:' . ( 'overlay' === $apply ? $image ?: 'none' : $layer );
	}
	if ( isset( $values['gradient-apply'] ) ) {
		$text = 'text' === $apply && count( $colors ) >= 2;
		$output[] = '--lieve-gradient-apply:' . $apply;
		$output[] = 'background-clip:' . ( $text ? 'text' : 'border-box' );
		$output[] = '-webkit-background-clip:' . ( $text ? 'text' : 'border-box' );
		$output[] = '-webkit-text-fill-color:' . ( $text ? 'transparent' : 'currentColor' );
		$output[] = '--lieve-gradient-overlay-image:' . ( 'overlay' === $apply && count( $colors ) >= 2 ? $gradient : 'none' );
		$output[] = '--lieve-gradient-overlay-content:' . ( 'overlay' === $apply && count( $colors ) >= 2 ? '""' : 'none' );
	}
	$output = array_filter( $output );
	if ( $important ) { $output = array_map( static function( $declaration ) { return preg_match( '/!important\s*$/i', $declaration ) ? $declaration : $declaration . '!important'; }, $output ); }
	return implode( ';', $output );
}

/** Base element declarations for a real HTML style attribute. */
function lieve_node_inline_style( $node ) {
	if ( 'html' === $node['type'] && function_exists( 'lieve_html_has_wrapper' ) && ! lieve_html_has_wrapper( $node['props'] ?? array() ) ) { return ''; }
	$styles = lieve_sanitize_styles( $node['props']['styles'] ?? array(), $node['type'] );
	$base = lieve_style_breakpoints()[0]['id'];
	$legacy = 'desktop' === $base && function_exists( 'lieve_node_style' ) ? lieve_node_style( $node['props'] ?? array(), $node['type'] ) : '';
	return trim( $legacy . ';' . lieve_style_declarations( lieve_style_context_values( $styles, 'root', $base, 'normal' ) ), ';' );
}

function lieve_node_style_css( $node, $include_inline = false, $inline_base = false, $root_selector = '' ) {
	if ( 'html' === $node['type'] && function_exists( 'lieve_html_has_wrapper' ) && ! lieve_html_has_wrapper( $node['props'] ?? array() ) ) { return ''; }
	$styles = lieve_sanitize_styles( $node['props']['styles'] ?? array(), $node['type'] );
	$breakpoints = lieve_style_breakpoints(); $base = $breakpoints[0];
	$legacy = function_exists( 'lieve_node_style' ) ? lieve_node_style( $node['props'] ?? array(), $node['type'] ) : '';
	if ( ! $styles && ( ! $legacy || ( ! $include_inline && 'desktop' === $base['id'] ) ) ) { return ''; }
	$id = '#' . lieve_element_html_id( $node );
	// Keep element styles at ID specificity, above global classes, without publishing an ID.
	if ( ! lieve_element_output_enabled( $node['props'] ?? array(), 'outputHtmlId' ) ) {
		$id = '#lieve-' . lieve_element_number( $node['id'] );
		$hook = lieve_element_output_enabled( $node['props'] ?? array(), 'outputLieveId' ) ? 'data-lieve-id="' . lieve_element_data_id( $node ) : 'data-lieve-node="' . preg_replace( '/[^a-zA-Z0-9_-]/', '', $node['id'] );
		$id = ':is(' . $id . ',[' . $hook . '"])';
	}
	if ( $root_selector ) { $id = $root_selector; }
	$output = '';
	foreach ( $breakpoints as $breakpoint ) {
		$device = $breakpoint['id'];
		$rules = '';
		foreach ( lieve_style_targets( $node['type'] ) as $target => $definition ) {
			foreach ( array( 'normal', 'hover', 'focus', 'active', 'before', 'after' ) as $state ) {
				$values = lieve_style_context_values( $styles, $target, $device, $state );
				$inline_target = 'root' === $target || 'popup-shell' === $node['type'];
				$priority = $inline_base && $inline_target && ! ( $breakpoint['base'] && 'normal' === $state ) && ! in_array( $state, array( 'before', 'after' ), true );
				$declarations = lieve_style_declarations( $values, $priority );
				if ( 'root' === $target && 'desktop' === $device && 'normal' === $state && function_exists( 'lieve_node_style' ) ) {
					$legacy_css = lieve_style_declarations( array( 'custom-css' => lieve_node_style( $node['props'], $node['type'] ) ), $priority );
					$declarations = trim( $legacy_css . ';' . $declarations, ';' );
				}
				if ( ! $declarations ) { continue; }
				$suffix = 'normal' === $state ? '' : ( in_array( $state, array( 'before', 'after' ), true ) ? '::' : ':' ) . ( 'focus' === $state ? 'focus-visible' : $state );
				$overlay_declarations = $declarations;
				$attribute_rule = $inline_base && $inline_target && $breakpoint['base'] && 'normal' === $state;
				if ( $attribute_rule && 'popup-shell' === $node['type'] && 'frame' === $target ) {
					// Keep lifecycle-sensitive layout below the popup's hidden safeguard.
					// Custom declarations keep their precedence over other base inline fields.
					$declarations = lieve_style_declarations( array_intersect_key( $values, array( 'display' => true, 'custom-css' => true ) ), true );
					$attribute_rule = ! $declarations;
				}
				if ( ! $attribute_rule ) {
					// Media queries and interactive states must be able to override base inline styles.
					$rules .= $id . $definition['selector'] . $suffix . '{' . $declarations . '}';
				}
				if ( ! in_array( $state, array( 'before', 'after' ), true ) ) { $rules .= lieve_gradient_overlay_css( $id . $definition['selector'] . $suffix, $overlay_declarations ); }
				if ( 'image' === $node['type'] && 'root' === $target && ! in_array( $state, array( 'before', 'after' ), true ) ) {
					$legacy_image = 'desktop' === $device && 'normal' === $state;
					$sized = array_intersect( array( 'width', 'max-width', 'height', 'max-height' ), array_keys( $values ) ) || ( $legacy_image && ( isset( $node['props']['width'] ) || isset( $node['props']['maxWidth'] ) ) );
					$image_css = $sized ? 'max-width:100%;height:auto' . ( isset( $values['width'] ) || ( $legacy_image && isset( $node['props']['width'] ) ) ? ';width:100%' : '' ) : '';
					if ( isset( $values['border-radius'] ) || ( $legacy_image && isset( $node['props']['borderRadius'] ) ) ) { $image_css .= ';border-radius:inherit'; }
					if ( $image_css ) { $rules .= $id . $suffix . ' > img,' . $id . $suffix . ' > a > img{' . trim( $image_css, ';' ) . '}'; }
				}
			}
		}
		$media = $breakpoint['base'] ? '' : ( $breakpoint['width'] > $base['width'] ? 'min-width:' : 'max-width:' ) . $breakpoint['width'] . 'px';
		if ( $rules ) { $output .= $media ? '@media(' . $media . '){' . $rules . '}' : $rules; }
	}
	return $output;
}

/** Supplement only safe, inert HTML tags absent from the WordPress post allowlist. */
function lieve_safe_html( $html ) {
	$allowed = wp_kses_allowed_html( 'post' );
	$common = array( 'class' => true, 'id' => true, 'style' => true, 'title' => true, 'role' => true, 'aria-*' => true, 'data-*' => true );
	foreach ( array( 'section', 'article', 'main', 'header', 'footer', 'nav', 'aside', 'details', 'summary', 'dialog', 'button', 'label', 'input', 'select', 'option', 'textarea', 'fieldset', 'legend', 'progress', 'meter' ) as $tag ) { $allowed[ $tag ] = ( $allowed[ $tag ] ?? array() ) + $common; }
	foreach ( array( 'type', 'name', 'value', 'placeholder', 'checked', 'disabled', 'required', 'min', 'max', 'step' ) as $attribute ) { $allowed['input'][ $attribute ] = true; }
	foreach ( array( 'name', 'disabled', 'required', 'multiple' ) as $attribute ) { $allowed['select'][ $attribute ] = true; }
	$allowed['option'] += array( 'value' => true, 'selected' => true, 'disabled' => true );
	$allowed['textarea'] += array( 'name' => true, 'rows' => true, 'cols' => true, 'placeholder' => true );
	$allowed['button'] += array( 'type' => true, 'disabled' => true );
	$allowed['label']['for'] = true; $allowed['details']['open'] = true;
	$allowed['progress'] += array( 'value' => true, 'max' => true ); $allowed['meter'] += array( 'value' => true, 'min' => true, 'max' => true );
	// Scripts, event handlers, iframes, document tags and arbitrary form actions stay blocked.
	return wp_kses( $html, $allowed );
}
