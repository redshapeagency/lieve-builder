<?php
/** Display-condition definitions, normalization, legacy conversion and validation. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Available frontend display conditions.
 *
 * @return array
 */
function lieve_template_conditions() {
	return array(
		'manual'      => __( 'Manual', 'lieve-builder' ),
		'entire_site' => __( 'Entire Website', 'lieve-builder' ),
		'front_page'  => __( 'Front Page Only', 'lieve-builder' ),
		'blog_index'  => __( 'Blog Index', 'lieve-builder' ),
		'pages'       => __( 'All Pages', 'lieve-builder' ),
		'posts'       => __( 'All Posts', 'lieve-builder' ),
		'archives'    => __( 'All Archives', 'lieve-builder' ),
		'search'      => __( 'Search Results', 'lieve-builder' ),
		'not_found'   => __( '404 Page', 'lieve-builder' ),
	);
}

/**
 * Return the display conditions that make sense for a template type.
 *
 * @param string $type Template type.
 * @return array
 */
function lieve_template_conditions_for_type( $type ) {
	$conditions = lieve_template_conditions();
	$keys       = array( 'manual' );

	switch ( $type ) {
		case 'header':
		case 'footer':
		case 'popup':
			$keys = array_keys( $conditions );
			break;
		case 'content':
			$keys = array( 'manual', 'entire_site', 'front_page', 'pages', 'posts' );
			break;
		case 'archive':
			$keys = array( 'manual', 'blog_index', 'archives' );
			break;
		case 'search':
			$keys = array( 'manual', 'search' );
			break;
		case 'error':
			$keys = array( 'manual', 'not_found' );
			break;
	}

	return array_intersect_key( $conditions, array_flip( $keys ) );
}

/**
 * Return the initial display condition for a template type.
 *
 * @param string $type Template type.
 * @return string
 */
function lieve_template_default_condition( $type ) {
	switch ( $type ) {
		case 'header':
		case 'footer':
		case 'popup':
			return 'entire_site';
		case 'archive':
			return 'archives';
		case 'search':
			return 'search';
		case 'error':
			return 'not_found';
		default:
			return 'manual';
	}
}

/**
 * Keep a display condition valid for its template type.
 *
 * @param string $condition Requested condition.
 * @param string $type      Template type.
 * @return string
 */
function lieve_normalize_template_condition( $condition, $type ) {
	$allowed = lieve_template_conditions_for_type( $type );
	return array_key_exists( $condition, $allowed ) ? $condition : lieve_template_default_condition( $type );
}

/**
 * Bricks-style condition targets available to every automatic template.
 *
 * @return array
 */
function lieve_condition_types() {
	return array(
		'entire_site' => __( 'Entire Website', 'lieve-builder' ),
		'front_page'  => __( 'Front Page', 'lieve-builder' ),
		'post_type'   => __( 'Post Type', 'lieve-builder' ),
		'archive'     => __( 'Archive', 'lieve-builder' ),
		'search'      => __( 'Search Results', 'lieve-builder' ),
		'error_page'  => __( 'Error Page', 'lieve-builder' ),
		'terms'       => __( 'Terms', 'lieve-builder' ),
		'individual'  => __( 'Individual', 'lieve-builder' ),
	);
}

/**
 * Archive subtypes modelled after Bricks template conditions.
 *
 * @return array
 */
function lieve_archive_condition_types() {
	return array(
		'all'       => __( 'All Archives', 'lieve-builder' ),
		'post_type' => __( 'Post Type Archive', 'lieve-builder' ),
		'author'    => __( 'Author Archive', 'lieve-builder' ),
		'date'      => __( 'Date Archive', 'lieve-builder' ),
		'term'      => __( 'Categories & Tags', 'lieve-builder' ),
	);
}

/**
 * Default condition rows for a template type.
 *
 * @param string $type Template type.
 * @return array
 */
function lieve_default_template_conditions( $type ) {
	$include = array(
		'action'          => 'include',
		'type'            => 'entire_site',
		'values'          => array(),
		'archiveType'     => 'all',
		'includeChildren' => false,
	);

	switch ( $type ) {
		case 'header':
		case 'footer':
		case 'popup':
			return array( $include );
		case 'content':
			$include['type']   = 'post_type';
			$include['values'] = array( 'post', 'page' );
			return array( $include );
		case 'archive':
			$include['type'] = 'archive';
			return array( $include );
		case 'search':
			$include['type'] = 'search';
			return array( $include );
		case 'error':
			$include['type'] = 'error_page';
			return array( $include );
		default:
			return array();
	}
}

/**
 * Sanitize repeatable template conditions.
 *
 * @param mixed $conditions Raw conditions or a JSON string.
 * @return array
 */
function lieve_sanitize_template_conditions( $conditions ) {
	if ( is_string( $conditions ) ) {
		$decoded    = json_decode( $conditions, true );
		$conditions = is_array( $decoded ) ? $decoded : array();
	}
	if ( ! is_array( $conditions ) ) {
		return array();
	}

	$clean            = array();
	$allowed_types    = lieve_condition_types();
	$archive_types    = lieve_archive_condition_types();
	$allowed_posttypes = lieve_condition_post_type_options();

	foreach ( array_slice( $conditions, 0, 30 ) as $condition ) {
		if ( ! is_array( $condition ) ) {
			continue;
		}

		$type = isset( $condition['type'] ) ? sanitize_key( $condition['type'] ) : '';
		if ( ! array_key_exists( $type, $allowed_types ) ) {
			continue;
		}

		$action       = isset( $condition['action'] ) && 'exclude' === sanitize_key( $condition['action'] ) ? 'exclude' : 'include';
		$archive_type = isset( $condition['archiveType'] ) ? sanitize_key( $condition['archiveType'] ) : 'all';
		if ( ! array_key_exists( $archive_type, $archive_types ) ) {
			$archive_type = 'all';
		}
		$selected_archives = isset( $condition['archiveTypes'] ) && is_array( $condition['archiveTypes'] ) ? $condition['archiveTypes'] : array( $archive_type );
		$selected_archives = array_values( array_intersect( array_keys( $archive_types ), array_map( 'sanitize_key', array_filter( $selected_archives, 'is_scalar' ) ) ) );
		if ( ! $selected_archives ) {
			$selected_archives = array( 'all' );
		}
		$archive_posttypes = isset( $condition['archivePostTypes'] ) && is_array( $condition['archivePostTypes'] ) ? $condition['archivePostTypes'] : ( 'post_type' === $archive_type ? ( $condition['values'] ?? array() ) : array() );
		$archive_terms = isset( $condition['archiveTerms'] ) && is_array( $condition['archiveTerms'] ) ? $condition['archiveTerms'] : ( 'term' === $archive_type ? ( $condition['values'] ?? array() ) : array() );
		$archive_posttypes = is_array( $archive_posttypes ) ? array_values( array_intersect( array_keys( $allowed_posttypes ), array_filter( $archive_posttypes, 'is_string' ) ) ) : array();
		$archive_terms = is_array( $archive_terms ) ? array_values( array_filter( $archive_terms, function( $value ) { return is_string( $value ) && preg_match( '/^[a-z0-9_-]+::(?:[1-9][0-9]*|all)$/', $value ); } ) ) : array();

		$values = isset( $condition['values'] ) && is_array( $condition['values'] ) ? array_slice( $condition['values'], 0, 100 ) : array();
		$values = array_values(
			array_unique(
				array_filter(
					array_map(
						function( $value ) use ( $type, $archive_type, $allowed_posttypes ) {
							if ( ! is_scalar( $value ) ) { return ''; }
							if ( 'individual' === $type ) {
								$value = absint( $value );
								return $value ? (string) $value : '';
							}
							if ( 'post_type' === $type || ( 'archive' === $type && 'post_type' === $archive_type ) ) {
								$value = sanitize_key( $value );
								return array_key_exists( $value, $allowed_posttypes ) ? $value : '';
							}
							if ( 'terms' === $type || ( 'archive' === $type && 'term' === $archive_type ) ) {
								$value = sanitize_text_field( $value );
								return preg_match( '/^[a-z0-9_-]+::(?:[1-9][0-9]*|all)$/', $value ) ? $value : '';
							}
							return '';
						},
						$values
					)
				)
			)
		);

		$clean[] = array(
			'action'          => $action,
			'type'            => $type,
			'values'          => $values,
			'archiveType'     => $archive_type,
			'archiveTypes'    => $selected_archives,
			'archivePostTypes' => array_slice( $archive_posttypes, 0, 100 ),
			'archiveTerms'    => array_slice( $archive_terms, 0, 100 ),
			'includeChildren' => ! empty( $condition['includeChildren'] ),
			'hookName'        => isset( $condition['hookName'] ) && is_string( $condition['hookName'] ) ? substr( preg_replace( '/[^a-zA-Z0-9_.:\/-]/', '', $condition['hookName'] ), 0, 150 ) : '',
			'hookPriority'    => isset( $condition['hookPriority'] ) && is_numeric( $condition['hookPriority'] ) ? min( 1000, max( -1000, (int) $condition['hookPriority'] ) ) : 10,
		);
	}

	return $clean;
}

/**
 * Convert a legacy single condition into the repeatable condition format.
 *
 * @param string $condition Legacy condition.
 * @return array
 */
function lieve_legacy_condition_to_rows( $condition ) {
	$row = array(
		'action'          => 'include',
		'type'            => 'entire_site',
		'values'          => array(),
		'archiveType'     => 'all',
		'includeChildren' => false,
	);

	switch ( $condition ) {
		case 'entire_site':
			break;
		case 'front_page':
			$row['type'] = 'front_page';
			break;
		case 'pages':
			$row['type']   = 'post_type';
			$row['values'] = array( 'page' );
			break;
		case 'posts':
			$row['type']   = 'post_type';
			$row['values'] = array( 'post' );
			break;
		case 'blog_index':
			$row['type']        = 'archive';
			$row['archiveType'] = 'post_type';
			$row['values']      = array( 'post' );
			break;
		case 'archives':
			$row['type'] = 'archive';
			break;
		case 'search':
			$row['type'] = 'search';
			break;
		case 'not_found':
			$row['type'] = 'error_page';
			break;
		default:
			return array();
	}

	return array( $row );
}

/** Reject incomplete/invalid rules instead of silently broadening or dropping them. */
function lieve_validate_template_conditions( $rows ) {
	if ( ! is_array( $rows ) || count( $rows ) > 30 ) { return __( 'Enter a valid list of up to 30 conditions.', 'lieve-builder' ); }
	$clean = lieve_sanitize_template_conditions( $rows );
	if ( count( $clean ) !== count( $rows ) ) { return __( 'A condition is invalid. Please review the rules.', 'lieve-builder' ); }
	foreach ( array_values( $rows ) as $index => $row ) {
		$item = $clean[ $index ]; $error = '';
		if ( ! in_array( $row['action'] ?? 'include', array( 'include', 'exclude' ), true ) ) { $error = __( 'Choose Include or Exclude.', 'lieve-builder' ); }
		if ( in_array( $item['type'], array( 'post_type', 'individual', 'terms' ), true ) && ! $item['values'] ) { $error = __( 'Select at least one target.', 'lieve-builder' ); }
		foreach ( array( 'values', 'archivePostTypes', 'archiveTerms' ) as $key ) { if ( isset( $row[ $key ] ) && ( ! is_array( $row[ $key ] ) || count( $row[ $key ] ) > 100 ) ) { $error = __( 'Select up to 100 valid targets per rule.', 'lieve-builder' ); } }
		foreach ( array( 'values', 'archivePostTypes', 'archiveTerms' ) as $key ) {
			if ( ! isset( $row[ $key ] ) || ! is_array( $row[ $key ] ) ) { continue; }
			$relevant = 'values' !== $key || in_array( $item['type'], array( 'individual', 'post_type', 'terms' ), true );
			if ( $relevant ) { foreach ( $row[ $key ] as $value ) { if ( ! is_scalar( $value ) || ! in_array( (string) $value, $item[ $key ], true ) ) { $error = __( 'A selected target is invalid or no longer available. Review the targets before saving.', 'lieve-builder' ); } } }
		}
		if ( 'archive' === $item['type'] ) {
			$archives = $row['archiveTypes'] ?? array( $row['archiveType'] ?? 'all' );
			if ( ! is_array( $archives ) || ! $archives || count( $archives ) > 5 || array_filter( $archives, function( $value ) { return ! is_string( $value ) || ! array_key_exists( $value, lieve_archive_condition_types() ); } ) ) { $error = __( 'Choose valid archive types.', 'lieve-builder' ); }
		}
		if ( 'archive' === $item['type'] && ! in_array( 'all', $item['archiveTypes'], true ) ) {
			if ( in_array( 'post_type', $item['archiveTypes'], true ) && ! $item['archivePostTypes'] ) { $error = __( 'Select at least one archive post type.', 'lieve-builder' ); }
			if ( in_array( 'term', $item['archiveTypes'], true ) && ! $item['archiveTerms'] ) { $error = __( 'Select at least one archive term.', 'lieve-builder' ); }
		}
		if ( isset( $row['hookName'] ) && ( ! is_string( $row['hookName'] ) || $item['hookName'] !== $row['hookName'] ) ) { $error = __( 'Use a valid hook name of up to 150 characters.', 'lieve-builder' ); }
		if ( isset( $row['hookPriority'] ) && ( ! is_numeric( $row['hookPriority'] ) || (float) $row['hookPriority'] !== (float) $item['hookPriority'] ) ) { $error = __( 'Hook priority must be a whole number between -1000 and 1000.', 'lieve-builder' ); }
		if ( $error ) { return sprintf( __( 'Rule %1$d: %2$s', 'lieve-builder' ), $index + 1, $error ); }
	}
	return '';
}
