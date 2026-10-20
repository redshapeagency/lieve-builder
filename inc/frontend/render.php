<?php
/**
 * Secure server-side rendering for builder documents.
 *
 * @package LieveBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
require_once __DIR__ . '/../builder/element-identity.php';
require_once __DIR__ . '/../builder/interactions.php';
require_once __DIR__ . '/../builder/motion.php';
require_once __DIR__ . '/../builder/element-conditions.php';

/** Class settings are optional for isolated renderers and early integrations. */
function lieve_markup_classes( $target, $defaults ) {
	return function_exists( 'lieve_output_class_attributes' ) ? lieve_output_class_attributes( $target, $defaults ) : ' class="' . esc_attr( $defaults ) . '"';
}

/** Raw HTML has no implicit root. Keep existing, explicitly styled HTML compatible. */
function lieve_html_has_wrapper( $props ) {
	if ( array_key_exists( 'wrapHtml', $props ) ) { return ! empty( $props['wrapHtml'] ); }
	return ! empty( $props['styles'] ) || ! empty( $props['className'] ) || ! empty( $props['classIds'] ) || ! empty( $props['attributes'] ) || '' !== lieve_node_style( $props, 'html' );
}

/** Resolve internal references to real HTML IDs, including reusable templates. */
function lieve_document_element_ids( $document, $seen = array() ) {
	$ids = array(); $html_ids = array(); $data_ids = array();
	$walk = static function( $nodes, $seen ) use ( &$walk, &$ids, &$html_ids, &$data_ids ) {
		foreach ( $nodes as $node ) {
			$props = $node['props'] ?? array();
			if ( 'html' !== $node['type'] || lieve_html_has_wrapper( $props ) ) {
				$html_id = lieve_element_html_id( $node );
				$target = lieve_element_output_enabled( $props, 'outputHtmlId' ) ? $html_id : ( lieve_element_output_enabled( $props, 'outputLieveId' ) ? lieve_element_data_id( $node ) : $node['id'] );
				$ids[ $node['id'] ] = $target;
				$ids[ 'lieve-' . $node['id'] ] = $target;
				$ids[ 'lieve-' . lieve_element_number( $node['id'] ) ] = $target;
				$ids[ 'lieve-data-' . lieve_element_number( $node['id'] ) ] = $target;
				$data_ids[ lieve_element_data_id( $node ) ] = $target;
				$html_ids[ $html_id ] = $target;
			}
			$walk( $node['children'] ?? array(), $seen );
			$template_id = 'template' === $node['type'] ? (int) ( $props['templateId'] ?? 0 ) : 0;
			if ( $template_id && count( $seen ) < 4 && ! in_array( $template_id, $seen, true ) ) {
				$template = get_post( $template_id );
				if ( $template && LIEVE_TEMPLATE_POST_TYPE === $template->post_type && 'publish' === $template->post_status ) {
					$walk( lieve_get_document( $template_id )['children'], array_merge( $seen, array( $template_id ) ) );
				}
			}
		}
	};
	$walk( $document['children'] ?? array(), $seen );
	// Explicit HTML IDs win over coincidentally identical internal aliases.
	return array_replace( $ids, $data_ids, $html_ids );
}

/** Only referenced roots need an interactive hook when both public IDs are off. */
function lieve_document_target_references( $document, $seen = array() ) {
	$references = array();
	$walk = static function( $nodes, $seen ) use ( &$walk, &$references ) {
		foreach ( $nodes as $node ) {
			$props = $node['props'] ?? array();
			if ( in_array( $node['type'] ?? '', array( 'toggle', 'map-connector' ), true ) && ! empty( $props['targetId'] ) && is_string( $props['targetId'] ) ) { $references[ $props['targetId'] ] = true; }
			foreach ( $props['interactions'] ?? array() as $rule ) { if ( ! empty( $rule['enabled'] ) && empty( lieve_interaction_catalog()['actions'][ $rule['action'] ?? '' ]['noTarget'] ) && 'element' === ( $rule['targetMode'] ?? '' ) && ! empty( $rule['targetValue'] ) ) { $references[ $rule['targetValue'] ] = true; } }
			foreach ( $props['motion'] ?? array() as $timeline ) { if ( ! empty( $timeline['enabled'] ) ) { foreach ( $timeline['steps'] ?? array() as $step ) { if ( 'element' === ( $step['target'] ?? '' ) && ! empty( $step['selector'] ) ) { $references[ $step['selector'] ] = true; } } } }
			$walk( $node['children'] ?? array(), $seen );
			$template_id = 'template' === ( $node['type'] ?? '' ) ? (int) ( $props['templateId'] ?? 0 ) : 0;
			if ( $template_id && count( $seen ) < 4 && ! in_array( $template_id, $seen, true ) ) {
				$template = get_post( $template_id );
				if ( $template && LIEVE_TEMPLATE_POST_TYPE === $template->post_type && 'publish' === $template->post_status ) { $walk( lieve_get_document( $template_id )['children'], array_merge( $seen, array( $template_id ) ) ); }
			}
		}
	};
	$walk( $document['children'] ?? array(), $seen );
	return $references;
}

function lieve_node_needs_identity_hook( $node ) {
	$props = $node['props'] ?? array();
	if ( lieve_element_output_enabled( $props, 'outputHtmlId' ) || lieve_element_output_enabled( $props, 'outputLieveId' ) ) { return false; }
	if ( ! empty( $props['styles'] ) || '' !== lieve_node_style( $props, $node['type'] ) ) { return true; }
	$references = $GLOBALS['lieve_document_target_references'] ?? array();
	if ( ! empty( $node['_lieveListingSourceId'] ) && isset( $references[ $node['_lieveListingSourceId'] ] ) ) { return true; }
	if ( empty( $GLOBALS['lieve_element_preview'] ) && function_exists( 'lieve_frontend_asset_usage' ) ) {
		static $page_references = null;
		if ( null === $page_references ) {
			$page_references = array();
			foreach ( lieve_frontend_asset_usage()['documents'] ?? array() as $post_id ) { $page_references += lieve_document_target_references( lieve_get_document( $post_id ) ); }
		}
		$references += $page_references;
	}
	return isset( $references[ $node['id'] ] ) || isset( $references[ 'lieve-' . $node['id'] ] ) || isset( $references[ 'lieve-' . lieve_element_number( $node['id'] ) ] ) || isset( $references[ 'lieve-data-' . lieve_element_number( $node['id'] ) ] ) || isset( $references[ lieve_element_html_id( $node ) ] ) || isset( $references[ lieve_element_data_id( $node ) ] );
}

/** Keep Toggle/map links working without publishing an internal data attribute. */
function lieve_element_target_id( $target ) {
	if ( '' === $target ) { return ''; }
	$ids = $GLOBALS['lieve_document_element_ids'] ?? array();
	if ( isset( $ids[ $target ] ) ) { return $ids[ $target ]; }
	// Header/footer, popups and hook sections may target another rendered document.
	if ( empty( $GLOBALS['lieve_element_preview'] ) && function_exists( 'lieve_frontend_asset_usage' ) ) {
		static $page_ids = null;
		if ( null === $page_ids ) {
			$page_ids = array();
			foreach ( lieve_frontend_asset_usage()['documents'] ?? array() as $post_id ) {
				$page_ids = array_replace( $page_ids, lieve_document_element_ids( lieve_get_document( $post_id ) ) );
			}
		}
		return $page_ids[ $target ] ?? $target;
	}
	return $target;
}

/**
 * Render a complete builder document.
 *
 * @param array $document Sanitized document.
 * @param bool  $wrap Explicit scope wrapper for standalone hook output.
 * @return bool Whether the document contains elements.
 */
function lieve_render_document( $document, $wrap = false ) {
	if ( function_exists( 'lieve_components_runtime_document' ) ) { $document = lieve_components_runtime_document( $document ); }
	$children = isset( $document['children'] ) && is_array( $document['children'] ) ? $document['children'] : array();
	if ( ! $children ) { return false; }
	$listing_aliases = array();
	if ( ! empty( $GLOBALS['lieve_listing_instance_scope'] ) && function_exists( 'lieve_listing_instances' ) ) { $children = lieve_listing_instances( $children, $GLOBALS['lieve_listing_instance_scope'], $listing_aliases ); $children = lieve_listing_remap_references( $children, $listing_aliases ); $document['children'] = $children; }
	$previous_source = $GLOBALS['lieve_document_source_id'] ?? null;
	$previous_ids = $GLOBALS['lieve_document_element_ids'] ?? null;
	$previous_references = $GLOBALS['lieve_document_target_references'] ?? null;
	$previous_runtime = $GLOBALS['lieve_runtime_document'] ?? null;
	$GLOBALS['lieve_runtime_document'] = $document;
	$GLOBALS['lieve_document_element_ids'] = array_replace( $previous_ids ?? array(), lieve_document_element_ids( $document ), $listing_aliases );
	$GLOBALS['lieve_document_target_references'] = ( $previous_references ?? array() ) + lieve_document_target_references( $document );
	if ( ! empty( $document['sourcePostId'] ) ) {
		$GLOBALS['lieve_document_source_id'] = (int) $document['sourcePostId'];
	}
	try {
		if ( $wrap ) { echo '<div' . lieve_markup_classes( 'document', 'lieve-builder-content' ) . ">\n"; }
		lieve_render_nodes( $children );
		if ( $wrap ) { echo "\n</div>\n"; }
	} finally {
		if (null===$previous_runtime) { unset($GLOBALS['lieve_runtime_document']); } else { $GLOBALS['lieve_runtime_document']=$previous_runtime; }
		if ( null === $previous_references ) { unset( $GLOBALS['lieve_document_target_references'] ); }
		else { $GLOBALS['lieve_document_target_references'] = $previous_references; }
		if ( null === $previous_ids ) { unset( $GLOBALS['lieve_document_element_ids'] ); }
		else { $GLOBALS['lieve_document_element_ids'] = $previous_ids; }
		if ( null === $previous_source ) { unset( $GLOBALS['lieve_document_source_id'] ); }
		else { $GLOBALS['lieve_document_source_id'] = $previous_source; }
	}
	return true;
}

/** Landmarks own the content scope; do not add a second wrapper inside them. */
function lieve_render_template_area( $template_id, $area ) {
	if ( ! $template_id || ! in_array( $area, array( 'header', 'footer' ), true ) ) { return false; }
	$document = lieve_get_document( $template_id );
	if ( empty( $document['children'] ) ) { return false; }
	echo '<' . $area . lieve_markup_classes( $area, 'lieve-template-area lieve-template-' . $area . '-area lieve-builder-content' ) . '>' . "\n";
	lieve_render_document( $document, false );
	echo "\n</" . $area . ">\n";
	return true;
}

/** Add structural line breaks without inserting spaces between inline elements. */
function lieve_render_nodes( $nodes ) {
	$inline = array( 'button', 'text-link', 'file', 'icon', 'logo', 'svg', 'video', 'audio', 'toggle', 'toggle-mode', 'map-connector', 'animated-typing', 'counter', 'rating', 'back-to-top', 'post-reading-time', 'post-reading-progress-bar', 'form-checkbox', 'progress-bar' );
	$previous_inline = null;
	foreach ( $nodes as $node ) {
		$is_inline = in_array( $node['type'] ?? '', $inline, true );
		if ( null !== $previous_inline && ( ! $previous_inline || ! $is_inline ) ) { echo "\n"; }
		lieve_render_node( $node );
		$previous_inline = $is_inline;
	}
}

/**
 * Convert approved properties to inline CSS.
 *
 * @param array  $props Node properties.
 * @param string $type  Node type.
 * @return string
 */
function lieve_node_style( $props, $type ) {
	$styles = array();
	$map    = array(
		'backgroundColor' => 'background-color',
		'color'           => 'color',
		'paddingTop'      => 'padding-top',
		'paddingRight'    => 'padding-right',
		'paddingBottom'   => 'padding-bottom',
		'paddingLeft'     => 'padding-left',
		'marginTop'       => 'margin-top',
		'marginBottom'    => 'margin-bottom',
		'borderRadius'    => 'border-radius',
		'fontSize'        => 'font-size',
		'maxWidth'        => 'max-width',
		'minHeight'       => 'min-height',
		'gap'             => 'gap',
		'textAlign'       => 'text-align',
		'fontWeight'      => 'font-weight',
		'alignItems'      => 'align-items',
		'justifyContent'  => 'justify-content',
	);

	$pixel_values = array( 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'borderRadius', 'fontSize', 'maxWidth', 'minHeight', 'gap' );

	foreach ( $map as $key => $property ) {
		if ( ! isset( $props[ $key ] ) || '' === $props[ $key ] ) {
			continue;
		}

		$value = $props[ $key ];
		if ( in_array( $key, $pixel_values, true ) ) {
			$value = (int) $value . 'px';
		}

		$styles[] = $property . ':' . $value;
	}

	if ( ( 'container' === $type || ( function_exists( 'lieve_element_can_nest' ) && lieve_element_can_nest( $type ) ) ) && ! empty( $props['direction'] ) ) {
		$styles[] = 'display:flex';
		$styles[] = 'flex-direction:' . $props['direction'];
	}

	if ( 'image' === $type && isset( $props['width'] ) ) {
		$styles[] = 'width:' . (int) $props['width'] . '%';
	}

	if ( 'spacer' === $type && isset( $props['height'] ) ) {
		$styles[] = 'height:' . (int) $props['height'] . 'px';
	}

	return implode( ';', $styles );
}

/**
 * Return safe classes for a node.
 *
 * @param array  $node Node data.
 * @param string $base Base class.
 * @return string
 */
function lieve_node_classes( $node, $base ) {
	$classes = array( 'lieve-element', $base );
	$overrides = $node['props']['markupClasses'] ?? array();
	if ( 'template' === ( $node['type'] ?? '' ) ) { $classes[] = 'lieve-builder-content'; }
	if ( function_exists( 'lieve_output_classes' ) ) {
		$global = lieve_output_class_rule( 'elements' ); $specific = lieve_output_class_rule( 'element-' . $node['type'] );
		$classes = array_values( array_filter( $classes, static function( $class ) use ( $global, $specific, $overrides ) { return $overrides[ $class ] ?? ( 'lieve-element' === $class ? in_array( $class, $global['defaults'], true ) : in_array( $class, $specific['defaults'], true ) ); } ) );
		$classes = array_merge( $classes, preg_split( '/\s+/', trim( $global['custom'] . ' ' . $specific['custom'] ), -1, PREG_SPLIT_NO_EMPTY ) );
	}
	$classes = array_values( array_filter( $classes, static function( $class ) use ( $overrides ) { return false !== ( $overrides[ $class ] ?? true ); } ) );
	if ( ! empty( $node['props']['classIds'] ) && function_exists( 'lieve_class_names' ) ) { $classes = array_merge( $classes, lieve_class_names( $node['props']['classIds'] ) ); }
	if ( ! empty( $node['props']['className'] ) ) {
		$classes = array_merge( $classes, preg_split( '/\s+/', $node['props']['className'] ) );
	}
	return implode( ' ', array_unique( array_filter( array_map( 'sanitize_html_class', $classes ) ) ) );
}

function lieve_node_class_attributes( $node, $base ) {
	$classes = lieve_node_classes( $node, $base );
	return ( '' !== $classes ? ' class="' . esc_attr( $classes ) . '"' : '' ) . ( 'template' === $node['type'] && ! in_array( 'lieve-builder-content', explode( ' ', $classes ), true ) ? ' data-lieve-scope="builder"' : '' );
}

/**
 * Render one node and its descendants.
 *
 * @param array $node Sanitized node.
 */
function lieve_render_node( $node ) {
	if ( 'component' === ( $node['type'] ?? '' ) && function_exists( 'lieve_component_expand' ) ) { $node = lieve_component_expand( $node ); if ( ! $node ) { return; } }
	if ( isset( $GLOBALS['lieve_listing_remaining'] ) && --$GLOBALS['lieve_listing_remaining'] < 0 ) { return; }
	if ( array_key_exists( 'conditions', $node['props'] ?? array() ) && empty( $GLOBALS['lieve_element_preview'] ) ) {
		if ( lieve_element_conditions_request_bound( $node['props']['conditions'] ) && function_exists( 'lieve_dynamic_mark_request_bound' ) ) { lieve_dynamic_mark_request_bound( null, true ); }
		if ( ! lieve_evaluate_element_conditions( $node['props']['conditions'] )['matches'] ) { return; }
	}
	if ( function_exists( 'lieve_dynamic_mark_request_bound' ) && function_exists( 'lieve_css_frontend_context' ) && lieve_css_frontend_context() ) { lieve_dynamic_mark_request_bound( $node ); }
	if ( function_exists( 'lieve_resolve_dynamic_node' ) ) { $node = lieve_resolve_dynamic_node( $node ); }
	if ( empty( $node['props']['attributes'] ) || ! class_exists( 'WP_HTML_Tag_Processor' ) || ( 'html' === ( $node['type'] ?? '' ) && ! lieve_html_has_wrapper( $node['props'] ?? array() ) ) ) { lieve_render_node_markup( $node ); return; }
	ob_start();
	try { lieve_render_node_markup( $node ); $html = ob_get_clean(); }
	finally { if ( ! isset( $html ) ) { ob_end_clean(); } }
	$processor = new WP_HTML_Tag_Processor( $html );
	$html_id = lieve_element_html_id( $node );
	while ( $processor->next_tag() ) {
		if ( ! lieve_element_output_enabled( $node['props'] ?? array(), 'outputHtmlId' ) && empty( $GLOBALS['lieve_element_preview'] ) ) {
			if ( in_array( $processor->get_tag(), array( 'STYLE', 'SCRIPT', 'LINK' ), true ) ) { continue; }
		} elseif ( $processor->get_attribute( 'id' ) !== $html_id ) { continue; }
		foreach ( $node['props']['attributes'] as $key => $value ) {
			// Public attributes must not hide/disable the root or its editor-only handles.
			if ( ! empty( $GLOBALS['lieve_element_preview'] ) && in_array( $key, array( 'tabindex', 'draggable', 'contenteditable', 'hidden', 'inert', 'disabled', 'autofocus' ), true ) ) { continue; }
			$processor->set_attribute( $key, $value );
		}
		break;
	}
	echo $processor->get_updated_html();
}

function lieve_render_node_markup( $node ) {
	if ( empty( $node['type'] ) || empty( $node['id'] ) ) {
		return;
	}

	$type     = $node['type'];
	if ( function_exists( 'lieve_enqueue_element_controller' ) ) { lieve_enqueue_element_controller( $type ); }
	$props    = isset( $node['props'] ) ? $node['props'] : array();
	$children = isset( $node['children'] ) ? $node['children'] : array();
	if ( 'html' === $type && ! lieve_html_has_wrapper( $props ) ) {
		// Comment boundaries identify fragments in the editor, never on the frontend.
		if ( ! empty( $GLOBALS['lieve_element_preview'] ) ) { echo '<!--lieve-html-start:' . esc_attr( $node['id'] ) . '-->'; }
		if ( function_exists( 'lieve_render_custom_code' ) ) { lieve_render_custom_code( $node ); }
		else { echo function_exists( 'lieve_safe_html' ) ? lieve_safe_html( $props['content'] ?? '' ) : wp_kses_post( $props['content'] ?? '' ); }
		if ( ! empty( $GLOBALS['lieve_element_preview'] ) ) { echo '<!--lieve-html-end:' . esc_attr( $node['id'] ) . '-->'; }
		return;
	}
	$style    = lieve_node_style( $props, $type );
	$legacy_inline = ! function_exists( 'lieve_style_breakpoints' ) || 'desktop' === lieve_style_breakpoints()[0]['id'];
	$style_at = $style && empty( $props['styles'] ) && $legacy_inline ? ' style="' . esc_attr( $style ) . '"' : '';
	$id_at    = lieve_element_output_enabled( $props, 'outputHtmlId' ) || ! empty( $GLOBALS['lieve_element_preview'] ) ? ' id="' . esc_attr( lieve_element_html_id( $node ) ) . '"' : '';
	$id_at   .= lieve_interaction_attributes( $node );
	$id_at   .= lieve_motion_attributes( $node );
	if ( ! empty( $GLOBALS['lieve_element_preview'] ) && ! empty( $node['_lieveListingSourceId'] ) ) { $id_at .= ' data-lieve-listing-source="' . esc_attr( $node['_lieveListingSourceId'] ) . '"'; }
	if ( lieve_node_needs_identity_hook( $node ) ) { $id_at .= ' data-lieve-node="' . esc_attr( $node['id'] ) . '"'; }
	if ( lieve_element_output_enabled( $props, 'outputLieveId' ) || ! empty( $GLOBALS['lieve_element_preview'] ) ) {
		$id_at .= ' data-lieve-id="' . esc_attr( lieve_element_data_id( $node ) ) . '"';
	}
	if ( function_exists( 'lieve_generated_node_styles' ) && lieve_generated_node_styles( $node, $style_at ) ) {
		$legacy_inline = false;
	} elseif ( function_exists( 'lieve_node_style_css' ) ) {
		$css = lieve_node_style_css( $node );
		if ( $css ) { if ( isset( $GLOBALS['lieve_listing_css_rules'] ) ) { $GLOBALS['lieve_listing_css_rules'][] = $css; } else { echo '<style data-lieve-styles="' . esc_attr( $node['id'] ) . '">' . $css . '</style>'; } }
	}
	if ( function_exists( 'lieve_listing_enabled' ) && lieve_listing_enabled( $node ) ) { lieve_render_listing( $node, $id_at . $style_at ); return; }

	switch ( $type ) {
		case 'section':
			echo '<section' . lieve_node_class_attributes( $node, 'lieve-section' ) . $id_at . $style_at . '>';
			lieve_render_nodes( $children );
			echo '</section>';
			break;

		case 'container':
			echo '<div' . lieve_node_class_attributes( $node, 'lieve-container' ) . $id_at . $style_at . '>';
			lieve_render_nodes( $children );
			echo '</div>';
			break;

		case 'heading':
			$level = isset( $props['level'] ) ? min( 6, max( 1, (int) $props['level'] ) ) : 2;
			echo '<h' . $level . lieve_node_class_attributes( $node, 'lieve-heading' ) . $id_at . $style_at . '>' . esc_html( $props['content'] ?? '' ) . '</h' . $level . '>';
			break;

		case 'text':
			$content = ! empty( $node['_lieveDynamicHtml'] ) && function_exists( 'lieve_safe_html' ) ? lieve_safe_html( $props['content'] ?? '' ) : wp_kses_post( wpautop( $props['content'] ?? '' ) );
			echo '<div' . lieve_node_class_attributes( $node, 'lieve-text' ) . $id_at . $style_at . ( ! empty( $node['_lieveDynamicNativeContent'] ) ? ' data-lieve-native-content' : '' ) . '>' . $content . '</div>';
			break;

		case 'button':
			$target = ! empty( $props['target'] ) ? ' target="_blank" rel="noopener noreferrer"' : '';
			echo '<a' . lieve_node_class_attributes( $node, 'lieve-button' ) . ' href="' . esc_url( $props['url'] ?? '#' ) . '"' . $target . $id_at . $style_at . '>' . esc_html( $props['label'] ?? '' ) . '</a>';
			break;

		case 'image':
			$image_styles = array();
			if ( isset( $props['width'] ) || isset( $props['maxWidth'] ) ) {
				$image_styles[] = 'max-width:100%';
				$image_styles[] = 'height:auto';
			}
			if ( isset( $props['width'] ) ) { $image_styles[] = 'width:100%'; }
			if ( isset( $props['borderRadius'] ) ) { $image_styles[] = 'border-radius:inherit'; }
			$image_style = empty( $props['styles'] ) && $legacy_inline ? implode( ';', $image_styles ) : '';
			echo '<figure' . lieve_node_class_attributes( $node, 'lieve-image' ) . $id_at . $style_at . '>';
			$attributes = array( 'alt' => $props['alt'] ?? '' );
			if ( ! empty( $props['imageSizes'] ) ) { $attributes['sizes'] = $props['imageSizes']; }
			if ( in_array( $props['imageDecoding'] ?? '', array( 'async', 'sync', 'auto' ), true ) ) { $attributes['decoding'] = $props['imageDecoding']; }
			if ( in_array( $props['imageLoading'] ?? 'auto', array( 'lazy', 'eager' ), true ) ) { $attributes['loading'] = $props['imageLoading']; }
			if ( in_array( $props['imagePriority'] ?? 'auto', array( 'high', 'low' ), true ) ) { $attributes['fetchpriority'] = $props['imagePriority']; }
			if ( 'high' === ( $attributes['fetchpriority'] ?? '' ) && 'lazy' === ( $attributes['loading'] ?? '' ) ) { unset( $attributes['loading'] ); }
			ob_start();
			if ( ! empty( $props['attachmentId'] ) && 'url' !== ( $props['imageSource'] ?? '' ) ) {
				if ( $image_style ) { $attributes['style'] = $image_style; }
				$size = $props['imageSize'] ?? 'full';
				if ( function_exists( 'get_intermediate_image_sizes' ) && ! in_array( $size, array_merge( array( 'full' ), get_intermediate_image_sizes() ), true ) ) { $size = 'full'; }
				echo wp_get_attachment_image( (int) $props['attachmentId'], $size, false, $attributes );
			} elseif ( ! empty( $props['url'] ) ) {
				echo '<img src="' . esc_url( $props['url'] ) . '"';
				foreach ( $attributes as $name => $value ) { echo ' ' . $name . '="' . esc_attr( $value ) . '"'; }
				echo ( $image_style ? ' style="' . esc_attr( $image_style ) . '"' : '' ) . '>';
			}
			$image_markup = ob_get_clean();
			$full_url = ! empty( $props['attachmentId'] ) && function_exists( 'wp_get_attachment_image_url' ) ? wp_get_attachment_image_url( (int) $props['attachmentId'], 'full' ) : ( $props['url'] ?? '' );
			echo function_exists( 'lieve_widget_image_link' ) ? lieve_widget_image_link( $image_markup, $props, $full_url ?: '', $node['id'] ) : $image_markup;
			if ( ! empty( $props['caption'] ) ) { echo '<figcaption>' . esc_html( $props['caption'] ) . '</figcaption>'; }
			echo '</figure>';
			break;

		case 'spacer':
			echo '<div' . lieve_node_class_attributes( $node, 'lieve-spacer' ) . ' aria-hidden="true"' . $id_at . $style_at . '></div>';
			break;

		default:
			if ( function_exists( 'lieve_render_registered_element' ) ) {
				lieve_render_registered_element( $node, lieve_node_class_attributes( $node, 'lieve-' . $type ) . $id_at . $style_at );
			}
	}
}
