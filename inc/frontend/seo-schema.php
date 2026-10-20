<?php
/** Local JSON-LD guardrails. No remote contexts, crawlers or ranking promises. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_seo_schema_rules() {
	static $rules;
	if ( null === $rules ) { $rules = json_decode( file_get_contents( __DIR__ . '/seo-schema-rules.json' ), true ); }
	return $rules;
}
function lieve_seo_schema_types( $node ) {
	$types = isset( $node->{'@type'} ) ? $node->{'@type'} : array();
	return array_map( static function( $type ) { return is_string( $type ) ? preg_replace( '~^(?:https?://schema\.org/|schema:)~', '', $type ) : ''; }, is_array( $types ) ? $types : array( $types ) );
}
function lieve_seo_schema_date( $value ) {
	if ( ! is_string( $value ) || ! preg_match( '/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/', $value, $parts ) ) { return false; }
	if ( ! checkdate( (int) $parts[2], (int) $parts[3], (int) $parts[1] ) ) { return false; }
	if ( isset( $parts[4] ) && ( (int) $parts[4] > 23 || (int) $parts[5] > 59 || ( isset( $parts[6] ) && (int) $parts[6] > 59 ) ) ) { return false; }
	return empty( $parts[7] ) || 'Z' === $parts[7] || ( (int) substr( $parts[7], 1, 2 ) <= 23 && (int) substr( $parts[7], 4, 2 ) <= 59 );
}
function lieve_seo_schema_iri( $value ) {
	return is_string( $value ) && strlen( $value ) <= 2048 && ! preg_match( '/[\x00-\x20<>]/', $value ) && ( lieve_seo_url( $value ) || preg_match( '/^(?:#[^\s]+|_:[a-zA-Z0-9_-]+|urn:[a-zA-Z0-9][^\s]*)$/', $value ) );
}
function lieve_seo_schema_text( $value ) {
	return is_string( $value ) || ( is_object( $value ) && isset( $value->{'@value'} ) && is_string( $value->{'@value'} ) );
}
function lieve_seo_schema_literal( $value ) { return is_object( $value ) && property_exists( $value, '@value' ) ? $value->{'@value'} : $value; }
function lieve_seo_schema_label( $value ) { return preg_match( '/^(.{180})./us', $value, $match ) ? $match[1] . '…' : $value; }
/** Errors block malformed values; completeness advice never invents required fields. */
function lieve_seo_schema_report( $json ) {
	$rules = lieve_seo_schema_rules(); $errors = array(); $advice = array(); $nodes = 0;
	$error = static function( $path, $message ) use ( &$errors ) { if ( count( $errors ) < 12 ) { $errors[] = lieve_seo_schema_label( $path ) . ': ' . $message; } };
	$warn = static function( $message ) use ( &$advice ) { $message = lieve_seo_schema_label( $message ); if ( count( $advice ) < 12 && ! in_array( $message, $advice, true ) ) { $advice[] = $message; } };
	$walk = static function( $node, $path, $depth, $schema ) use ( &$walk, &$nodes, $rules, $error, $warn ) {
		if ( ++$nodes > 1500 || $depth > 30 ) { $error( $path, 'Use a smaller JSON-LD graph (up to 1500 values and 30 levels).' ); return; }
		if ( is_array( $node ) ) { foreach ( $node as $index => $item ) { $walk( $item, $path . '[' . $index . ']', $depth + 1, $schema ); } return; }
		if ( is_float( $node ) && ! is_finite( $node ) ) { $error( $path, 'JSON numbers must be finite.' ); return; }
		if ( ! is_object( $node ) ) { return; }
		if ( property_exists( $node, '@context' ) ) {
			$context = $node->{'@context'}; $contexts = is_array( $context ) ? $context : array( $context ); $schema = false;
			if ( ! $contexts ) { $error( $path . '.@context', 'Provide a context URL or an inline context object.' ); }
			foreach ( $contexts as $entry ) {
				if ( is_string( $entry ) ) { if ( ! lieve_seo_url( $entry ) ) { $error( $path . '.@context', 'Context URLs must use HTTP(S).' ); } if ( preg_match( '~^https?://schema\.org/?$~', $entry ) ) { $schema = true; } }
				elseif ( is_object( $entry ) ) { if ( isset( $entry->{'@vocab'} ) ) { if ( ! is_string( $entry->{'@vocab'} ) ) { $error( $path . '.@context.@vocab', 'Use a vocabulary URL.' ); } else { $schema = (bool) preg_match( '~^https?://schema\.org/?$~', $entry->{'@vocab'} ); } } }
				else { $error( $path . '.@context', 'Provide a context URL or an inline context object.' ); }
			}
			if ( ! $schema ) { $warn( 'Custom contexts are not resolved remotely; their vocabulary needs external validation.' ); }
		}
		if ( isset( $node->{'@id'} ) && ! lieve_seo_schema_iri( $node->{'@id'} ) ) { $error( $path . '.@id', 'Use an HTTP(S) URL, fragment, blank-node ID or URN.' ); }
		if ( property_exists( $node, '@value' ) ) {
			if ( isset( $node->{'@id'} ) || isset( $node->{'@graph'} ) ) { $error( $path, 'A value object cannot also be an identified node or graph.' ); }
			if ( isset( $node->{'@language'} ) && ( ! is_string( $node->{'@language'} ) || ! is_string( $node->{'@value'} ) ) ) { $error( $path, 'Language-tagged values need text and a language string.' ); }
			if ( isset( $node->{'@language'} ) && isset( $node->{'@type'} ) ) { $error( $path, 'Choose a language tag or an explicit value type, not both.' ); }
			if ( isset( $node->{'@type'} ) && ! is_string( $node->{'@type'} ) ) { $error( $path, 'Value-object types must be strings.' ); }
			if ( ( is_object( $node->{'@value'} ) || is_array( $node->{'@value'} ) ) && ( $node->{'@type'} ?? '' ) !== '@json' ) { $error( $path, 'Object/array values need the @json value type.' ); }
			if ( is_float( $node->{'@value'} ) && ! is_finite( $node->{'@value'} ) ) { $error( $path, 'JSON numbers must be finite.' ); }
			return;
		}
		if ( property_exists( $node, '@graph' ) ) {
			if ( ! is_array( $node->{'@graph'} ) || ! $node->{'@graph'} ) { $error( $path . '.@graph', 'Provide a non-empty array of node objects.' ); }
			else { foreach ( $node->{'@graph'} as $item ) { if ( ! is_object( $item ) || ( ! isset( $item->{'@type'} ) && ! isset( $item->{'@id'} ) && ! isset( $item->{'@graph'} ) ) ) { $error( $path . '.@graph', 'Each graph entry needs @type, @id or @graph.' ); } } }
		}
		$types = lieve_seo_schema_types( $node );
		if ( property_exists( $node, '@type' ) ) {
			$raw = $node->{'@type'}; $entries = is_array( $raw ) ? $raw : array( $raw );
			if ( ! $entries || count( $entries ) > 20 ) { $error( $path . '.@type', 'Provide one type or up to 20 type names.' ); }
			foreach ( $entries as $type ) { if ( ! is_string( $type ) || ! preg_match( '~^(?:[a-zA-Z][a-zA-Z0-9_-]*(?::[a-zA-Z][a-zA-Z0-9_-]*)?|https?://[^\s<>]+)$~', $type ) ) { $error( $path . '.@type', 'Types must be non-empty names or absolute HTTP(S) IRIs.' ); } }
		}
		if ( $schema ) {
			foreach ( $types as $type ) {
				if ( ! in_array( $type, $rules['types'], true ) ) { $warn( 'No built-in completeness profile for ' . $type . '; validate this type externally.' ); }
				$missing = array(); foreach ( $rules['recommended'][$type] ?? array() as $property ) { if ( ! isset( $node->$property ) || '' === $node->$property || array() === $node->$property ) { $missing[] = $property; } }
				if ( $missing ) { $warn( $type . ': consider adding ' . implode( ', ', $missing ) . ' where applicable.' ); }
			}
			foreach ( get_object_vars( $node ) as $property => $value ) {
				$values = is_array( $value ) ? $value : array( $value );
				foreach ( $values as $item ) {
					$literal = lieve_seo_schema_literal( $item );
					if ( in_array( $property, $rules['text'], true ) && ! lieve_seo_schema_text( $item ) ) { $error( $path . '.' . $property, 'Use text, not a number or an object.' ); }
					if ( in_array( $property, $rules['urls'], true ) && ! lieve_seo_url( $literal ) && ! ( is_object( $item ) && isset( $item->{'@id'} ) && lieve_seo_schema_iri( $item->{'@id'} ) ) ) { $error( $path . '.' . $property, 'Use an absolute HTTP(S) URL or an identified node.' ); }
					if ( in_array( $property, $rules['dates'], true ) && ! lieve_seo_schema_date( $literal ) ) { $error( $path . '.' . $property, 'Use a real ISO 8601 date or date/time.' ); }
					if ( in_array( $property, $rules['numbers'], true ) && ( ! is_numeric( $literal ) || ! is_finite( (float) $literal ) || ( in_array( $property, $rules['nonnegativeNumbers'], true ) && (float) $literal < 0 ) ) ) { $error( $path . '.' . $property, 'Use a finite number; prices cannot be negative.' ); }
					if ( in_array( $property, $rules['integers'], true ) && ( ! is_numeric( $literal ) || ( is_string( $literal ) && ! preg_match( '/^\d+$/', $literal ) ) || ! is_finite( (float) $literal ) || (float) $literal < 0 || floor( (float) $literal ) !== (float) $literal || ( 'position' === $property && (float) $literal < 1 ) ) ) { $error( $path . '.' . $property, 'Use a non-negative whole number (positions start at 1).' ); }
					if ( in_array( $property, $rules['images'], true ) && ! lieve_seo_url( $item ) && ! ( is_object( $item ) && ( isset( $item->{'@id'} ) || in_array( 'ImageObject', lieve_seo_schema_types( $item ), true ) ) ) ) { $error( $path . '.' . $property, 'Use an HTTP(S) image URL or ImageObject.' ); }
					if ( isset( $rules['relations'][$property] ) && ( ! is_object( $item ) || ( ! isset( $item->{'@id'} ) && ! array_intersect( $rules['relations'][$property], lieve_seo_schema_types( $item ) ) ) ) ) { $error( $path . '.' . $property, 'Use an identified node or ' . implode( ' / ', $rules['relations'][$property] ) . ' object.' ); }
					if ( in_array( $property, $rules['nodesOrUrls'], true ) && ! lieve_seo_url( $literal ) && ! ( is_object( $item ) && ( isset( $item->{'@id'} ) || isset( $item->{'@type'} ) ) ) ) { $error( $path . '.' . $property, 'Use an HTTP(S) URL, identified node or typed node.' ); }
				}
				if ( 'priceCurrency' === $property && ( ! is_string( $value ) || ! preg_match( '/^[A-Z]{3}$/', $value ) ) ) { $error( $path . '.' . $property, 'Use a three-letter uppercase currency code, such as EUR.' ); }
			}
			if ( in_array( 'BreadcrumbList', $types, true ) && isset( $node->itemListElement ) ) {
				$items = $node->itemListElement; $positions = array();
				if ( ! is_array( $items ) ) { $error( $path . '.itemListElement', 'Use an array of ListItem nodes.' ); }
				else { foreach ( $items as $item ) { if ( ! is_object( $item ) || ! in_array( 'ListItem', lieve_seo_schema_types( $item ), true ) ) { $error( $path . '.itemListElement', 'Each breadcrumb must be a ListItem.' ); continue; } if ( isset( $item->position ) && is_scalar( $item->position ) ) { if ( in_array( (string) $item->position, $positions, true ) ) { $error( $path . '.itemListElement', 'Breadcrumb positions must be unique.' ); } $positions[] = (string) $item->position; } } if ( count( $items ) < 2 ) { $warn( 'BreadcrumbList: Google breadcrumb results need at least two list items.' ); } }
			}
		}
		foreach ( get_object_vars( $node ) as $key => $value ) { if ( is_float( $value ) && ! is_finite( $value ) ) { $error( $path . '.' . $key, 'JSON numbers must be finite.' ); } if ( '@context' !== $key && ( is_object( $value ) || is_array( $value ) ) ) { $walk( $value, $path . '.' . $key, $depth + 1, $schema ); } }
	};
	if ( ! is_object( $json ) || ! isset( $json->{'@context'} ) || ( ! isset( $json->{'@type'} ) && ! isset( $json->{'@graph'} ) ) ) { $error( 'JSON-LD', 'Provide an object with @context and @type or @graph.' ); }
	else { $walk( $json, 'JSON-LD', 0, false ); }
	return array( 'errors' => array_values( array_unique( $errors ) ), 'advice' => $advice );
}
