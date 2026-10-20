<?php
/** Linked components: template-owned models, explicit instance properties and slots. */
defined( 'ABSPATH' ) || exit;

function lieve_is_component( $id ) {
	return LIEVE_TEMPLATE_POST_TYPE === get_post_type( $id ) && 'component' === lieve_get_template_type( $id );
}

/** Only inert widget fields may be exposed; never turn instance values into code. */
function lieve_component_bindable_fields( $node ) {
	if ( in_array( $node['type'] ?? '', array( 'html', 'code', 'shortcode', 'template', 'component', 'slot', 'form' ), true ) ) { return array(); }
	$fields = lieve_element_registry()[ $node['type'] ?? '' ]['fields'] ?? array();
	return array_filter( $fields, static function( $field, $key ) {
		return in_array( $field['type'], array( 'text', 'textarea', 'url', 'number', 'checkbox', 'select' ), true ) && ! in_array( $key, array( 'items', 'shortcode', 'recipient', 'redirectUrl' ), true );
	}, ARRAY_FILTER_USE_BOTH );
}

function lieve_component_properties( $document ) {
	$out = array(); $paths = array(); $root = $document['children'][0] ?? array();
	foreach ( array_slice( $root['props']['componentProperties'] ?? array(), 0, 50 ) as $row ) {
		if ( ! is_array( $row ) || ! is_string( $row['id'] ?? null ) || ! preg_match( '/^cp_[a-zA-Z0-9_-]{1,60}$/D', $row['id'] ) || isset( $out[$row['id']] ) || ! is_string( $row['nodeId'] ?? null ) || ! is_string( $row['field'] ?? null ) || ! is_string( $row['label'] ?? null ) ) { continue; }
		$node = lieve_find_document_node( $document['children'] ?? array(), $row['nodeId'] );
		$field = $node ? ( lieve_component_bindable_fields( $node )[$row['field']] ?? null ) : null;
		$path = $row['nodeId'] . ':' . $row['field'];
		if ( ! $field || isset( $paths[$path] ) || '' === trim( $row['label'] ) ) { continue; } $paths[$path] = true;
		$label = implode( '', array_slice( preg_split( '//u', sanitize_text_field($row['label']), -1, PREG_SPLIT_NO_EMPTY ) ?: array(), 0, 120 ) );
		$out[$row['id']] = array( 'id' => $row['id'], 'label' => $label, 'nodeId' => $row['nodeId'], 'field' => $row['field'], 'type' => $field['type'], 'options' => $field['options'] ?? array(), 'default' => $node['props'][$row['field']] ?? ( lieve_element_registry()[$node['type']]['defaults'][$row['field']] ?? '' ) );
	}
	return array_values( $out );
}

function lieve_component_slots( $document ) {
	$slots = array();
	$walk = static function( $nodes ) use ( &$walk, &$slots ) { foreach ( $nodes as $node ) {
		if ( 'slot' === ( $node['type'] ?? '' ) ) { $key = ( $node['props']['slotKey'] ?? '' ) ?: $node['id']; $slots[$key] = array( 'key' => $key, 'label' => $node['props']['label'] ?? 'Content', 'id' => $node['id'] ); }
		if ( 'component' !== ( $node['type'] ?? '' ) ) { $walk( $node['children'] ?? array() ); }
	} };
	$walk( $document['children'] ?? array() ); return array_values( $slots );
}

/** Runtime provenance is generated here and never accepted from stored/client nodes. */
function lieve_component_expand( $instance, $seen = array(), &$budget = null ) {
	if ( null === $budget ) { $budget = 2000; }
	if ( --$budget < 0 ) { return null; }
	if ( 'component' !== ( $instance['type'] ?? '' ) ) {
		$children = array(); foreach ( $instance['children'] ?? array() as $child ) { $resolved = lieve_component_expand( $child, $seen, $budget ); if ( $resolved ) { $children[] = $resolved; } } $instance['children'] = $children; return $instance;
	}
	$id = absint( $instance['props']['componentId'] ?? 0 ); $post = $id ? get_post( $id ) : null;
	$available = $post && lieve_is_component( $id ) && ( 'publish' === $post->post_status || ! empty( $GLOBALS['lieve_element_preview'] ) && current_user_can( 'edit_post', $id ) );
	if ( ! $available || in_array( $id, $seen, true ) || count( $seen ) >= 8 ) {
		return array( 'id' => $instance['id'], 'type' => 'div', 'props' => array( 'editorLabel' => 'Unavailable component' ), 'children' => array() );
	}
	$document = lieve_get_document( $id ); $model = $document['children'][0] ?? null;
	if ( ! $model ) { return array( 'id' => $instance['id'], 'type' => 'div', 'props' => array(), 'children' => array() ); }
	$bindings = array(); foreach ( lieve_component_properties( $document ) as $property ) { if ( array_key_exists( $property['id'], $instance['props']['componentValues'] ?? array() ) ) { $bindings[$property['nodeId']][$property['field']] = $instance['props']['componentValues'][$property['id']]; } }
	$overrides = array(); foreach ( $instance['children'] ?? array() as $slot ) { if ( 'slot' === ( $slot['type'] ?? '' ) ) { $overrides[( $slot['props']['slotKey'] ?? '' ) ?: $slot['id']] = $slot; } }
	$aliases = array(); $internal_ids = array(); $locals = array();
	$prepare = static function( $node ) use ( &$prepare, &$aliases, &$internal_ids, &$locals, $instance, $id, $bindings, $overrides, $model ) {
		$original = $node; $source = $node['id']; $root = $source === $model['id'];
		$node['props'] = lieve_sanitize_props( $node['type'], array_replace( $node['props'] ?? array(), $bindings[$source] ?? array() ) );
		if ( 'html' === $node['type'] ) { $node['_lieveCustomCodeSource'] = $original; $node['_lieveComponentCodeOwner'] = $id; }
		$node['_lieveComponentOriginalId'] = $source; $node['_lieveComponentPostId'] = $id; $node['_lieveComponentScope'] = $instance['id'];
		$node['id'] = $root ? $instance['id'] : 'lvc-' . substr( hash( 'sha256', $instance['id'] . ':' . $source ), 0, 24 );
		unset( $node['props']['htmlId'], $node['props']['dataLieveId'], $node['props']['componentProperties'] );
		$slot = 'slot' === $node['type'] ? ( $overrides[( $original['props']['slotKey'] ?? '' ) ?: $source] ?? null ) : null;
		if ( $slot ) { $node['id'] = $slot['id']; $node['props'] = array_replace_recursive( $node['props'], $slot['props'] ?? array() ); }
		$internal_ids[$source] = $node['id'];
		if ( $root ) {
			$own = $instance['props'] ?? array(); unset( $own['componentId'], $own['componentValues'], $own['componentProperties'] );
			foreach ( array( 'styles', 'attributes', 'markupClasses' ) as $key ) { if ( isset( $own[$key] ) ) { $own[$key] = array_replace_recursive( $node['props'][$key] ?? array(), $own[$key] ); } }
			$own['classIds'] = array_values( array_unique( array_merge( $node['props']['classIds'] ?? array(), $own['classIds'] ?? array() ) ) );
			$own['className'] = trim( ( $node['props']['className'] ?? '' ) . ' ' . ( $own['className'] ?? '' ) );
			$node['props'] = array_replace( $node['props'], $own );
		}
		$target = lieve_element_output_enabled( $node['props'], 'outputHtmlId' ) ? lieve_element_html_id( $node ) : ( lieve_element_output_enabled( $node['props'], 'outputLieveId' ) ? lieve_element_data_id( $node ) : $node['id'] );
		foreach ( array( $source, lieve_element_html_id( $original ), lieve_element_data_id( $original ) ) as $alias ) { $aliases[$alias] = $target; }
		if ( 'html' === $node['type'] && class_exists( 'WP_HTML_Tag_Processor' ) ) { $processor = new WP_HTML_Tag_Processor( $node['props']['content'] ?? '' ); while ( $processor->next_tag() ) { $raw = $processor->get_attribute( 'id' ); if ( is_string( $raw ) && '' !== $raw ) { $aliases[$raw] = substr( $raw, 0, 100 ) . '--c-' . substr( hash( 'sha256', $instance['id'] . ':' . $raw ), 0, 16 ); } } }
		if ( 'slot' === $node['type'] ) {
			if ( $slot && ( ! empty( $slot['children'] ) || ! empty( $slot['props']['slotOverride'] ) ) ) { $locals[$node['id']] = true; $node['children'] = $slot['children']; return $node; }
		}
		$node['children'] = array_map( $prepare, $node['children'] ?? array() ); return $node;
	};
	$resolved = $prepare( $model ); $timelines = array(); $interaction_ids = array();
	$index_motion = static function( $node ) use ( &$index_motion, &$timelines, &$interaction_ids, $instance, $locals ) { foreach ( $node['props']['motion'] ?? array() as $row ) { $timelines[$row['id']] = 'lm_' . substr( hash( 'sha256', $instance['id'] . ':' . $row['id'] ), 0, 20 ); } foreach ( $node['props']['interactions'] ?? array() as $row ) { $interaction_ids[$row['id']] = 'li_' . substr( hash( 'sha256', $instance['id'] . ':' . $row['id'] ), 0, 20 ); } if ( ! isset( $locals[$node['id']] ) ) { foreach ( $node['children'] as $child ) { $index_motion( $child ); } } }; $index_motion( $resolved );
	$references = static function( $node ) use ( &$references, $aliases, $internal_ids, $timelines, $interaction_ids, $locals ) {
		$node['_lieveComponentAliases'] = $aliases;
		if ( isset($aliases[$node['props']['targetId']??'']) ) { $node['props']['targetId']=$aliases[$node['props']['targetId']]; }
		if ( isset($internal_ids[$node['props']['queryId']??'']) ) { $node['props']['queryId']=$internal_ids[$node['props']['queryId']]; }
		foreach ( $node['props']['interactions'] ?? array() as $i => $rule ) { if ( 'element' === ( $rule['targetMode'] ?? '' ) && isset( $internal_ids[$rule['targetValue'] ?? ''] ) ) { $node['props']['interactions'][$i]['targetValue'] = $internal_ids[$rule['targetValue']]; } if ( isset( $timelines[$rule['timelineId'] ?? ''] ) ) { $node['props']['interactions'][$i]['timelineId'] = $timelines[$rule['timelineId']]; } }
		foreach ( $node['props']['interactions'] ?? array() as $i => $rule ) { $node['props']['interactions'][$i]['id'] = $interaction_ids[$rule['id']]; if ( isset($interaction_ids[$rule['afterId']??'']) ) { $node['props']['interactions'][$i]['afterId'] = $interaction_ids[$rule['afterId']]; } }
		foreach ( $node['props']['motion'] ?? array() as $i => $row ) { $node['props']['motion'][$i]['id'] = $timelines[$row['id']]; foreach ( $row['steps'] as $j => $step ) { if ( 'element' === $step['target'] && isset( $aliases[$step['selector']] ) ) { $node['props']['motion'][$i]['steps'][$j]['selector'] = $aliases[$step['selector']]; } } }
		if ( ! isset( $locals[$node['id']] ) ) { $node['children'] = array_map( $references, $node['children'] ); } return $node;
	}; $resolved = $references( $resolved );
	if ( function_exists( 'lieve_listing_remap_references' ) ) {
		// Local slot subtrees belong to the page, not the component model's ID namespace.
		$remap = static function( $node ) use ( &$remap, $aliases, $locals ) { $children = $node['children']; $node['children'] = array(); $node = lieve_listing_remap_references( array( $node ), $aliases )[0]; $node['children'] = isset( $locals[$node['id']] ) ? $children : array_map( $remap, $children ); return $node; };
		$resolved = $remap( $resolved );
	}
	return lieve_component_expand( $resolved, array_merge( $seen, array( $id ) ), $budget );
}

function lieve_components_runtime_document( $document ) {
	$budget = 2000; $children = array(); foreach ( $document['children'] ?? array() as $node ) { $resolved = lieve_component_expand( $node, array(), $budget ); if ( $resolved ) { $children[] = $resolved; } } $document['children'] = $children; return $document;
}

/** Namespace rendered code too, including IDs produced by trusted PHP. Never rewrite JavaScript. */
function lieve_component_code_markup( $html, $node, &$css ) {
	if ( empty( $node['_lieveComponentScope'] ) || ! class_exists( 'WP_HTML_Tag_Processor' ) ) { return $html; }
	$aliases = $node['_lieveComponentAliases'] ?? array(); $processor = new WP_HTML_Tag_Processor( $html );
	while ( $processor->next_tag() ) { $id = $processor->get_attribute( 'id' ); if ( is_string( $id ) && '' !== $id && ! in_array( $id, $aliases, true ) ) { $aliases[$id] = $aliases[$id] ?? substr( $id, 0, 100 ) . '--c-' . substr( hash( 'sha256', $node['_lieveComponentScope'] . ':' . $id ), 0, 16 ); } }
	$proxy = array( 'id' => $node['id'], 'type' => 'html', 'props' => array( 'content' => $html ), 'children' => array() );
	$html = lieve_listing_remap_references( array( $proxy ), $aliases )[0]['props']['content'];
	// Restrict CSS replacement to rule preludes: a color such as #fff is not an ID reference.
	$css = preg_replace_callback( '/([^{}]+)\{/', static function( $match ) use ( $aliases ) { return preg_replace_callback( '/#([a-zA-Z_][a-zA-Z0-9_-]*)/', static function( $id ) use ( $aliases ) { return '#' . ( $aliases[$id[1]] ?? $id[1] ); }, $match[1] ) . '{'; }, $css );
	return $html;
}

function lieve_component_sanitize_props( $props, $clean ) {
	if ( isset( $clean['componentId'] ) && is_numeric( $props['componentId'] ?? null ) ) { $clean['componentId'] = (int) min( 9007199254740991, max( 0, (float) $props['componentId'] ) ); }
	if ( isset( $props['componentValues'] ) && is_array( $props['componentValues'] ) ) { $clean['componentValues'] = array(); foreach ( array_slice( $props['componentValues'], 0, 100, true ) as $key => $value ) { if ( is_string( $key ) && preg_match( '/^cp_[a-zA-Z0-9_-]{1,60}$/D', $key ) && is_scalar( $value ) && strlen( (string) $value ) <= 20000 ) { $clean['componentValues'][$key] = is_bool( $value ) || is_numeric( $value ) ? $value : wp_check_invalid_utf8( $value ); } } }
	if ( isset( $props['componentProperties'] ) && is_array( $props['componentProperties'] ) ) { $clean['componentProperties'] = array(); foreach ( array_slice( $props['componentProperties'], 0, 50 ) as $row ) { if ( ! is_array( $row ) ) { continue; } $item = array(); foreach ( array( 'id', 'label', 'nodeId', 'field' ) as $key ) { if ( is_string( $row[$key] ?? null ) ) { $item[$key] = implode( '', array_slice( preg_split( '//u', sanitize_text_field($row[$key]), -1, PREG_SPLIT_NO_EMPTY ) ?: array(), 0, 'label' === $key ? 120 : 64 ) ); } } if ( count( $item ) === 4 ) { $clean['componentProperties'][] = $item; } } }
	return $clean;
}

/** Discover descriptors, not every model's full tree, in the editor bootstrap. */
function lieve_component_choices() {
	$posts = get_posts( array( 'post_type' => LIEVE_TEMPLATE_POST_TYPE, 'post_status' => 'publish', 'posts_per_page' => 200, 'meta_key' => LIEVE_TEMPLATE_TYPE_META, 'meta_value' => 'component', 'orderby' => 'title', 'order' => 'ASC' ) ); $items = array();
	foreach ( $posts as $post ) { if ( ! current_user_can( 'edit_post', $post->ID ) ) { continue; } $document = lieve_get_document( $post->ID ); $items[] = array( 'id' => $post->ID, 'title' => get_the_title( $post->ID ), 'revision' => lieve_template_revision( $post->ID ), 'properties' => lieve_component_properties( $document ), 'slots' => lieve_component_slots( $document ), 'editUrl' => function_exists( 'lieve_builder_url' ) ? lieve_builder_url( $post->ID ) : '' ); }
	return $items;
}

function lieve_validate_component_document( $document, $owner = 0 ) {
	$error = static function( $message ) { return new WP_Error( 'lieve_invalid_component', $message, array( 'status' => 400 ) ); };
	if ( $owner && lieve_is_component( $owner ) && count( $document['children'] ?? array() ) !== 1 ) { return $error( 'A component model needs exactly one root element. Put the model inside one container before saving.' ); }
	$slot_keys = array(); $slots = static function( $nodes ) use ( &$slots, &$slot_keys, $error ) { foreach ( $nodes as $node ) { if ( 'component' === $node['type'] ) { continue; } if ( 'slot' === $node['type'] ) { $key = ( $node['props']['slotKey'] ?? '' ) ?: $node['id']; if ( ! is_string( $key ) || ! preg_match( '/^[A-Za-z0-9_-]{1,64}$/D', $key ) || isset( $slot_keys[$key] ) ) { return $error( 'Named Slots need unique keys (letters, numbers, hyphens or underscores).' ); } $slot_keys[$key] = true; } $valid = $slots( $node['children'] ?? array() ); if ( is_wp_error( $valid ) ) { return $valid; } } return true; };
	$result = $slots( $document['children'] ?? array() ); if ( is_wp_error( $result ) ) { return $result; }
	$remaining = 2000; $models = array();
	$walk = static function( $nodes, $seen = array() ) use ( &$walk, &$remaining, &$models, $owner, $error ) { foreach ( $nodes as $node ) {
		if ( --$remaining < 0 ) { return $error( 'The expanded component graph exceeds 2,000 nodes. Simplify repeated/nested components before saving; your draft is retained.' ); }
		if ( isset( $node['props']['componentValues'] ) ) { $values = $node['props']['componentValues']; if ( ! is_array( $values ) || count( $values ) > 100 ) { return $error( 'Component values must be a map of at most 100 scalar overrides.' ); } foreach ( $values as $key => $value ) { if ( ! is_string( $key ) || ! preg_match( '/^cp_[a-zA-Z0-9_-]{1,60}$/D', $key ) || ! is_scalar( $value ) || strlen( (string) $value ) > 20000 ) { return $error( 'A component property is invalid or exceeds 20,000 bytes. Your draft was not changed.' ); } } }
		if ( 'component' === ( $node['type'] ?? '' ) ) {
			$id = $node['props']['componentId'] ?? 0;
			if ( ! is_numeric( $id ) || $id < 1 || $id > 9007199254740991 || (float)(int)$id !== (float)$id || $id == $owner || in_array( (int) $id, $seen, true ) || count( $seen ) >= 8 ) { return $error( 'Choose a component without a circular or excessively nested reference.' ); }
			$keys = array(); foreach ( $node['children'] ?? array() as $slot ) { $key = ( $slot['props']['slotKey'] ?? '' ) ?: $slot['id']; if ( 'slot' !== ( $slot['type'] ?? '' ) || ! is_string($key) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/D',$key) || isset($keys[$key]) ) { return $error( 'Put local component content inside uniquely named Slot containers.' ); } $keys[$key]=true; }
			if ( lieve_is_component( (int) $id ) ) { if(!isset($models[(int)$id]))$models[(int)$id]=lieve_get_document((int)$id); $result = $walk( $models[(int)$id]['children'], array_merge( $seen, array( (int) $id ) ) ); if ( is_wp_error( $result ) ) { return $result; } }
		}
		$result = $walk( $node['children'] ?? array(), $seen ); if ( is_wp_error( $result ) ) { return $result; }
	} return true; };
	$result = $walk( $document['children'] ?? array() ); if ( is_wp_error( $result ) ) { return $result; }
	foreach ( $document['children'] ?? array() as $root ) {
		if ( ! isset( $root['props']['componentProperties'] ) ) { continue; }
		$rows = $root['props']['componentProperties']; if ( ! is_array( $rows ) || array_values( $rows ) !== $rows || count( $rows ) > 50 || count( lieve_component_properties( array( 'children' => array( $root ) ) ) ) !== count( $rows ) ) { return $error( 'Component properties need unique IDs, labels and valid non-code field bindings.' ); }
	}
	return $result;
}

class Lieve_Components_Controller extends WP_REST_Controller {
	public function register_routes() {
		register_rest_route( 'lieve/v1', '/components', array(
			array( 'methods' => WP_REST_Server::READABLE, 'callback' => array( $this, 'get_items' ), 'permission_callback' => static function() { return current_user_can( 'edit_posts' ); } ),
			array( 'methods' => WP_REST_Server::CREATABLE, 'callback' => array( $this, 'create_item' ), 'permission_callback' => static function() { return current_user_can( 'publish_posts' ); }, 'args' => array( 'requestId' => array( 'type' => 'string', 'required' => true, 'pattern' => '^[a-zA-Z0-9_-]{16,80}$' ), 'name' => array( 'type' => 'string', 'required' => true, 'minLength' => 1, 'maxLength' => 160 ), 'document' => array( 'type' => 'object', 'required' => true, 'properties' => array( 'version' => array( 'type' => 'integer', 'enum' => array( 1 ) ), 'children' => array( 'type' => 'array', 'maxItems' => 1, 'minItems' => 1, 'items' => array( 'type' => 'object' ) ) ) ) ) ),
		) );
	}
	public function get_items( $request ) { return rest_ensure_response( array( 'items' => lieve_component_choices() ) ); }
	public function create_item( $request ) {
		$document = $request->get_param( 'document' ); $valid = lieve_validate_document( $document ); if ( is_wp_error( $valid ) ) { return $valid; }
		$valid = lieve_validate_component_document( $document ); if ( is_wp_error( $valid ) ) { return $valid; }
		$clean = lieve_sanitize_document( $document );
		// Creation never approves copied executable code. Its model needs an authorized Save.
		$strip = static function( &$nodes ) use ( &$strip ) { foreach ( $nodes as &$node ) { unset( $node['props']['codeApproval'] ); $strip( $node['children'] ); } }; $strip( $clean['children'] );
		$id = lieve_create_inactive_template( $request['name'], 'component', array(), $clean, $request->get_param( 'requestId' ) ); if ( is_wp_error( $id ) ) { return $id; }
		if ( 'publish' !== get_post_status( $id ) ) { $published = wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ), true ); if ( is_wp_error( $published ) ) { return $published; } if ( 'publish' !== get_post_status( $id ) ) { return new WP_Error( 'lieve_component_publish', 'The model is saved in Library but could not be activated. Activate it there before inserting an instance.', array( 'status' => 500 ) ); } }
		do_action( 'lieve_builder_saved', $id, $clean );
		return rest_ensure_response( array( 'id' => $id, 'items' => lieve_component_choices() ) );
	}
}
add_action( 'rest_api_init', static function() { ( new Lieve_Components_Controller() )->register_routes(); } );
