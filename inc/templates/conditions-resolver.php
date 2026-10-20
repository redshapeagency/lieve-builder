<?php
/** Match conditions, resolve effective templates and detect competing assignments. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Check whether a template condition matches the current request.
 *
 * @param string $condition Display condition.
 * @param int    $post_id   Current singular post ID, when available.
 * @return bool
 */
function lieve_template_condition_matches( $condition, $post_id = 0 ) {
	$post_id   = absint( $post_id );
	$post_type = $post_id ? get_post_type( $post_id ) : '';

	switch ( $condition ) {
		case 'entire_site':
			return true;
		case 'front_page':
			return is_front_page() || ( $post_id && $post_id === (int) get_option( 'page_on_front' ) );
		case 'blog_index':
			return is_home();
		case 'pages':
			return 'page' === $post_type;
		case 'posts':
			return 'post' === $post_type;
		case 'archives':
			return is_archive() || is_home();
		case 'search':
			return is_search();
		case 'not_found':
			return is_404();
		default:
			return false;
	}
}

/**
 * Check a single Bricks-style condition row against the current request.
 *
 * @param array $condition Sanitized condition row.
 * @param int   $post_id  Current singular post ID, when available.
 * @return bool
 */
function lieve_template_condition_row_matches( $condition, $post_id = 0 ) {
	$post_id   = absint( $post_id );
	$post_type = $post_id ? get_post_type( $post_id ) : '';
	$values    = isset( $condition['values'] ) ? (array) $condition['values'] : array();
	$type      = isset( $condition['type'] ) ? $condition['type'] : '';
	if ( 'archive' === $type && isset( $condition['archiveTypes'] ) ) {
		foreach ( $condition['archiveTypes'] as $archive_type ) {
			$row = $condition;
			unset( $row['archiveTypes'] );
			$row['archiveType'] = $archive_type;
			$row['values'] = 'post_type' === $archive_type ? ( $condition['archivePostTypes'] ?? array() ) : ( 'term' === $archive_type ? ( $condition['archiveTerms'] ?? array() ) : array() );
			if ( lieve_template_condition_row_matches( $row, $post_id ) ) {
				return true;
			}
		}
		return false;
	}

	switch ( $type ) {
		case 'entire_site':
			return true;

		case 'front_page':
			return is_front_page() || ( $post_id && $post_id === (int) get_option( 'page_on_front' ) );

		case 'post_type':
			return $post_id && is_singular() && in_array( $post_type, $values, true );

		case 'archive':
			$archive_type = isset( $condition['archiveType'] ) ? $condition['archiveType'] : 'all';
			if ( 'all' === $archive_type ) {
				return is_archive() || is_home();
			}
			if ( 'author' === $archive_type ) {
				return is_author();
			}
			if ( 'date' === $archive_type ) {
				return is_date();
			}
			if ( 'post_type' === $archive_type ) {
				if ( is_home() ) {
					return ! $values || in_array( 'post', $values, true );
				}
				if ( ! is_post_type_archive() ) {
					return false;
				}
				if ( ! $values ) {
					return true;
				}
				$query_type = get_query_var( 'post_type' );
				$query_types = is_array( $query_type ) ? $query_type : array( $query_type );
				return (bool) array_intersect( $values, array_filter( $query_types ) );
			}
			if ( 'term' === $archive_type ) {
				if ( ! ( is_category() || is_tag() || is_tax() ) ) {
					return false;
				}
				if ( ! $values ) {
					return true;
				}
				$queried = get_queried_object();
				if ( ! $queried || empty( $queried->taxonomy ) || empty( $queried->term_id ) ) {
					return false;
				}
				foreach ( $values as $value ) {
					$parts = explode( '::', $value );
					if ( 2 !== count( $parts ) || $parts[0] !== $queried->taxonomy ) {
						continue;
					}
					if ( 'all' === $parts[1] ) {
						return true;
					}
					$term_id = absint( $parts[1] );
					if ( $term_id === (int) $queried->term_id || ( ! empty( $condition['includeChildren'] ) && term_is_ancestor_of( $term_id, (int) $queried->term_id, $queried->taxonomy ) ) ) {
						return true;
					}
				}
			}
			return false;

		case 'search':
			return is_search();

		case 'error_page':
			return is_404();

		case 'terms':
			if ( ! $post_id || ! is_singular() || ! $values ) {
				return false;
			}
			foreach ( $values as $value ) {
				$parts = explode( '::', $value );
				if ( 2 !== count( $parts ) ) {
					continue;
				}
				$taxonomy = $parts[0];
				$term_id  = absint( $parts[1] );
				$post_terms = wp_get_post_terms( $post_id, $taxonomy, array( 'fields' => 'ids' ) );
				if ( is_wp_error( $post_terms ) ) {
					continue;
				}
				if ( 'all' === $parts[1] && $post_terms ) {
					return true;
				}
				foreach ( $post_terms as $post_term_id ) {
					if ( $term_id === (int) $post_term_id || ( ! empty( $condition['includeChildren'] ) && term_is_ancestor_of( $term_id, (int) $post_term_id, $taxonomy ) ) ) {
						return true;
					}
				}
			}
			return false;

		case 'individual':
			if ( ! $post_id || ! is_singular() ) {
				return false;
			}
			$ids = array_map( 'absint', $values );
			if ( in_array( $post_id, $ids, true ) ) {
				return true;
			}
			return ! empty( $condition['includeChildren'] ) && (bool) array_intersect( $ids, get_post_ancestors( $post_id ) );
	}

	return false;
}

/**
 * Return a specificity score for a matching row.
 *
 * @param array $condition Condition row.
 * @return int
 */
function lieve_template_condition_score( $condition ) {
	$scores = array(
		'entire_site' => 10,
		'archive'     => 40,
		'search'      => 50,
		'error_page'  => 50,
		'post_type'   => 60,
		'front_page'  => 70,
		'terms'       => 80,
		'individual'  => 90,
	);
	return isset( $scores[ $condition['type'] ] ) ? $scores[ $condition['type'] ] : 0;
}

/**
 * Evaluate include/exclude rows using the same precedence as Bricks.
 *
 * Include rows use OR logic. Any matching exclude row vetoes the template.
 * A condition set containing only exclusions applies everywhere else.
 *
 * @param array $conditions Condition rows.
 * @param int   $post_id   Current singular post ID, when available.
 * @return array
 */
function lieve_evaluate_template_conditions( $conditions, $post_id = 0 ) {
	$conditions = lieve_sanitize_template_conditions( $conditions );
	if ( ! $conditions ) {
		return array( 'matches' => false, 'score' => 0 );
	}

	$has_include     = false;
	$include_matches = false;
	$score           = 0;

	foreach ( $conditions as $condition ) {
		$matches = lieve_template_condition_row_matches( $condition, $post_id );
		if ( 'exclude' === $condition['action'] ) {
			if ( $matches ) {
				return array( 'matches' => false, 'score' => 0 );
			}
			continue;
		}

		$has_include = true;
		if ( $matches ) {
			$include_matches = true;
			$score = max( $score, lieve_template_condition_score( $condition ) );
		}
	}

	return array(
		'matches' => $has_include ? $include_matches : true,
		'score'   => $has_include ? $score : 1,
	);
}

/**
 * Find the most specific automatic template of a given type for this request.
 *
 * @param string $type    Template type.
 * @param int    $post_id Current singular post ID, when available.
 * @return int
 */
function lieve_get_matching_template_id( $type, $post_id = 0 ) {
	$type = sanitize_key( $type );
	if ( ! array_key_exists( $type, lieve_template_types() ) || 'section' === $type ) {
		return 0;
	}

	$templates = get_posts(
		array(
			'post_type'      => LIEVE_TEMPLATE_POST_TYPE,
			'post_status'    => 'publish',
			'posts_per_page' => -1,
			'orderby'        => 'modified',
			'order'          => 'DESC',
			'fields'         => 'ids',
			'meta_key'       => LIEVE_TEMPLATE_TYPE_META,
			'meta_value'     => $type,
		)
	);

	$best_id    = 0;
	$best_score = 0;

	foreach ( $templates as $template_id ) {
		$result = lieve_evaluate_template_conditions( lieve_get_template_conditions( $template_id ), $post_id );

		if ( $result['matches'] && $result['score'] > $best_score ) {
			$best_id    = (int) $template_id;
			$best_score = $result['score'];
		}
	}

	return $best_id;
}

/**
 * Compatibility wrapper for header and footer lookups.
 *
 * @param string $area    Header or footer.
 * @param int    $post_id Current singular post ID, when available.
 * @return int
 */
function lieve_get_matching_area_template_id( $area, $post_id = 0 ) {
	$area = sanitize_key( $area );
	return in_array( $area, array( 'header', 'footer' ), true ) ? lieve_get_matching_template_id( $area, $post_id ) : 0;
}

/**
 * Render the matching automatic template when one exists.
 *
 * @param string $type    Template type.
 * @param int    $post_id Current singular post ID, when available.
 * @return bool
 */
function lieve_render_matching_template( $type, $post_id = 0 ) {
	$template_id = lieve_get_matching_template_id( $type, $post_id );
	if ( ! $template_id ) {
		return false;
	}

	lieve_render_document( lieve_get_document( $template_id ) );
	return true;
}

/**
 * Resolve an explicit page assignment first, then the automatic condition.
 *
 * @param int    $post_id Current singular post ID, when available.
 * @param string $area    Header or footer.
 * @return int
 */
function lieve_get_effective_area_template_id( $post_id, $area ) {
	$assigned = $post_id ? lieve_get_assigned_template_id( $post_id, $area ) : 0;
	$id = $assigned ?: lieve_get_matching_area_template_id( $area, $post_id );
	return function_exists( 'apply_filters' ) ? (int) apply_filters( 'lieve_effective_area_template_id', $id, $area, $post_id ) : $id;
}

/** Evaluate Section conditions independently for each hook and priority, as Bricks does. */
function lieve_conditional_section_hook_groups( $conditions, $post_id = 0 ) {
	$groups = array();
	foreach ( lieve_sanitize_template_conditions( $conditions ) as $condition ) {
		if ( ! $condition['hookName'] ) { continue; }
		$key = $condition['hookName'] . '|' . $condition['hookPriority'];
		$groups[ $key ][] = $condition;
	}
	$hooks = array();
	foreach ( $groups as $rows ) {
		if ( lieve_evaluate_template_conditions( $rows, $post_id )['matches'] ) {
			$hooks[] = array( 'name' => $rows[0]['hookName'], 'priority' => $rows[0]['hookPriority'] );
		}
	}
	return $hooks;
}

/** Register conditional Section placement after the frontend query is available. */
function lieve_register_conditional_section_hooks() {
	if ( is_admin() || wp_doing_ajax() || is_feed() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
		return;
	}
	$post_id = is_singular() ? get_queried_object_id() : 0;
	$templates = get_posts( array( 'post_type' => LIEVE_TEMPLATE_POST_TYPE, 'post_status' => 'publish', 'posts_per_page' => -1, 'fields' => 'ids', 'meta_key' => LIEVE_TEMPLATE_TYPE_META, 'meta_value' => 'section' ) );
	foreach ( $templates as $template_id ) {
		if ( $post_id === (int) $template_id ) { continue; }
		foreach ( lieve_conditional_section_hook_groups( lieve_get_template_conditions( $template_id ), $post_id ) as $hook ) {
			add_action( $hook['name'], function() use ( $template_id ) {
				// Hook output can be outside every page landmark and needs its own scope.
				lieve_render_document( lieve_get_document( $template_id ), true );
			}, $hook['priority'], 0 );
		}
	}
}

/** A conservative overlap advisory, never a substitute for the frontend resolver. */
function lieve_template_rule_overlap( $a, $b ) {
	if ( 'entire_site' === $a['type'] || 'entire_site' === $b['type'] ) { return true; }
	if ( $a['type'] === $b['type'] ) {
		if ( in_array( $a['type'], array( 'front_page', 'search', 'error_page' ), true ) ) { return true; }
		if ( 'archive' === $a['type'] ) {
			$common = array_intersect( $a['archiveTypes'], $b['archiveTypes'] );
			if ( in_array( 'all', $a['archiveTypes'], true ) || in_array( 'all', $b['archiveTypes'], true ) || array_intersect( $common, array( 'author', 'date' ) ) ) { return true; }
			if ( in_array( 'post_type', $common, true ) && array_intersect( $a['archivePostTypes'], $b['archivePostTypes'] ) ) { return true; }
			if ( in_array( 'term', $common, true ) ) { $a['values'] = $a['archiveTerms']; $b['values'] = $b['archiveTerms']; $a['type'] = $b['type'] = 'terms'; } else { return false; }
		}
		if ( array_intersect( $a['values'], $b['values'] ) ) { return true; }
		if ( 'individual' === $a['type'] ) { foreach ( $a['values'] as $left ) { foreach ( $b['values'] as $right ) {
			if ( $a['includeChildren'] && in_array( (int) $left, get_post_ancestors( (int) $right ), true ) || $b['includeChildren'] && in_array( (int) $right, get_post_ancestors( (int) $left ), true ) ) { return true; }
		} } }
		if ( 'terms' === $a['type'] ) { foreach ( $a['values'] as $left ) { foreach ( $b['values'] as $right ) {
			list( $lt, $li ) = explode( '::', $left ); list( $rt, $ri ) = explode( '::', $right );
			if ( $lt === $rt && ( 'all' === $li || 'all' === $ri || $a['includeChildren'] && term_is_ancestor_of( (int) $li, (int) $ri, $lt ) || $b['includeChildren'] && term_is_ancestor_of( (int) $ri, (int) $li, $lt ) ) ) { return true; }
		} } }
		return false;
	}
	if ( 'post_type' === $b['type'] && 'individual' === $a['type'] ) { return lieve_template_rule_overlap( $b, $a ); }
	if ( 'post_type' === $a['type'] && 'individual' === $b['type'] ) { foreach ( $b['values'] as $id ) { if ( in_array( get_post_type( (int) $id ), $a['values'], true ) ) { return true; } } }
	if ( 'front_page' === $b['type'] ) { return lieve_template_rule_overlap( $b, $a ); }
	if ( 'front_page' === $a['type'] && get_option( 'page_on_front' ) ) { $a['type'] = 'individual'; $a['values'] = array( (string) get_option( 'page_on_front' ) ); return lieve_template_rule_overlap( $a, $b ); }
	return in_array( $a['type'], array( 'terms', 'post_type', 'individual' ), true ) && in_array( $b['type'], array( 'terms', 'post_type', 'individual' ), true ) && ( 'terms' === $a['type'] || 'terms' === $b['type'] );
}

function lieve_template_rule_covers( $exclude, $include ) {
	if ( 'entire_site' === $exclude['type'] ) { return true; }
	if ( $exclude['type'] !== $include['type'] ) { return false; }
	if ( in_array( $include['type'], array( 'front_page', 'search', 'error_page' ), true ) ) { return true; }
	if ( 'archive' === $include['type'] ) { return in_array( 'all', $exclude['archiveTypes'], true ); }
	return $include['values'] && ! array_diff( $include['values'], $exclude['values'] ) && ( ! $include['includeChildren'] || $exclude['includeChildren'] );
}

function lieve_template_conditions_overlap( $left, $right, $section = false ) {
	if ( ! $left || ! $right ) { return false; }
	if ( $section ) {
		$hooks = array_unique( array_column( $left, 'hookName' ) );
		foreach ( $hooks as $hook ) {
			if ( ! $hook ) { continue; }
			$filter = function( $rows ) use ( $hook ) { return array_values( array_filter( $rows, function( $r ) use ( $hook ) { return $r['hookName'] === $hook; } ) ); };
			if ( lieve_template_conditions_overlap( $filter( $left ), $filter( $right ) ) ) { return true; }
		}
		return false;
	}
	$includes = function( $rows ) { $positive = array_values( array_filter( $rows, function( $r ) { return 'include' === $r['action']; } ) ); return $positive ?: lieve_sanitize_template_conditions( array( array( 'type' => 'entire_site' ) ) ); };
	foreach ( $includes( $left ) as $a ) { foreach ( $includes( $right ) as $b ) {
		if ( $section && ( ! $a['hookName'] || $a['hookName'] !== $b['hookName'] ) ) { continue; }
		if ( ! lieve_template_rule_overlap( $a, $b ) ) { continue; }
		$veto = false;
		foreach ( array_merge( $left, $right ) as $rule ) { if ( 'exclude' === $rule['action'] && ( ! $section || $rule['hookName'] === $a['hookName'] ) && ( lieve_template_rule_covers( $rule, $a ) || lieve_template_rule_covers( $rule, $b ) ) ) { $veto = true; break; } }
		if ( ! $veto ) { return true; }
	} }
	return false;
}

function lieve_template_competition( $id ) {
	if ( 'publish' !== get_post_status( $id ) || ! lieve_template_is_automatic( $id ) ) { return array(); }
	$type = lieve_get_template_type( $id ); $rows = lieve_get_template_conditions( $id ); $result = array();
	if ( 'popup' === $type && 'interaction' === lieve_get_popup_opening( $id ) ) { return $result; }
	$inventory = get_posts( array( 'post_type' => LIEVE_TEMPLATE_POST_TYPE, 'post_status' => 'publish', 'posts_per_page' => -1, 'orderby' => 'title', 'order' => 'ASC' ) );
	foreach ( $inventory as $post ) {
		if ( 'popup' === $type && 'interaction' === lieve_get_popup_opening( $post->ID ) ) { continue; }
		if ( (int) $post->ID === (int) $id || 'publish' !== get_post_status( $post->ID ) || lieve_get_template_type( $post->ID ) !== $type || ! lieve_template_is_automatic( $post->ID ) ) { continue; }
		if ( lieve_template_conditions_overlap( $rows, lieve_get_template_conditions( $post->ID ), 'section' === $type ) ) { $result[] = array( 'id' => (int) $post->ID, 'title' => get_the_title( $post ), 'editUrl' => current_user_can( 'edit_post', $post->ID ) ? lieve_builder_url( $post->ID ) : '' ); }
	}
	return $result;
}
