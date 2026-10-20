/* Server-rendered element visibility. No browser expression or code evaluation. */
( function () {
	'use strict';
	const catalog = window.LieveElementConditionCatalog;
	const id = () => 'lc_' + Array.from( crypto.getRandomValues( new Uint8Array( 8 ) ), b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );
	const rule = () => ( { id: id(), source: 'user.logged_in', parameter: '', operator: 'eq', value: '1' } );
	const group = () => ( { id: id(), name: '', relation: 'all', rules: [ rule() ] } );
	const create = () => ( { version: 1, enabled: false, relation: 'any', groups: [] } );
	const text = ( value, max ) => typeof value === 'string' && Array.from( value ).length <= max && ! /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test( value );
	const isId = value => typeof value === 'string' && /^lc_[a-f0-9]{16}$/.test( value );
	function orderValue( value ) {
		if ( /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test( value ) ) { return Number.isFinite( Number( value ) ); }
		const date = value.match( /^(\d{4})-(\d{2})-(\d{2})$/ );
		if ( date ) { const year = +date[1], month = +date[2], day = +date[3], leap = year % 4 === 0 && ( year % 100 !== 0 || year % 400 === 0 ); return year > 0 && month > 0 && month <= 12 && day > 0 && day <= [ 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ][ month - 1 ]; }
		return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test( value );
	}
	function errors( value ) {
		const errors = {}, seen = new Set();
		if ( ! value || value.version !== 1 || typeof value.enabled !== 'boolean' || ! [ 'all', 'any' ].includes( value.relation ) || ! Array.isArray( value.groups ) || value.groups.length > catalog.groupLimit ) { return { settings: 'Invalid visibility settings. Reset conditions and try again.' }; }
		if ( value.enabled && ! value.groups.length ) { errors.settings = 'Add a rule group or turn off conditions.'; }
		for ( const group of value.groups ) {
			if ( ! group || ! isId( group.id ) || seen.has( group.id ) || ! text( group.name, 120 ) || ! [ 'all', 'any' ].includes( group.relation ) || ! Array.isArray( group.rules ) || ! group.rules.length || group.rules.length > catalog.ruleLimit ) { errors.groups = 'Each group needs a unique ID, a name up to 120 characters and 1–16 rules.'; continue; }
			seen.add( group.id );
			for ( const rule of group.rules ) {
				const spec = Object.hasOwn( catalog.sources, rule?.source ) ? catalog.sources[ rule.source ] : null;
				if ( ! rule || ! isId( rule.id ) || seen.has( rule.id ) || ! spec || ! Object.hasOwn( catalog.operators, rule.operator ) || ! text( rule.parameter, 1200 ) || ! text( rule.value, 1200 ) ) { errors[ typeof rule?.id === 'string' ? rule.id : group.id ] = 'Choose a valid source, comparison and text values.'; continue; }
				seen.add( rule.id );
				if ( spec.parameter && ( ! rule.parameter.trim() || ( rule.source === 'dynamic' ? ! window.LieveDynamicData?.parse( rule.parameter ) : ! /^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test( rule.parameter ) ) ) ) { errors[ rule.id ] = rule.source === 'dynamic' ? 'Choose a dynamic value to check.' : 'Enter a valid ' + spec.parameter.toLowerCase() + '.'; }
				for ( const operand of [ rule.parameter, rule.value ] ) { if ( operand.includes( '{{lieve:' ) && ! window.LieveDynamicData?.parse( operand ) ) { errors[ rule.id ] = 'Use one complete dynamic binding, not mixed text.'; } }
				if ( [ 'gt', 'gte', 'lt', 'lte' ].includes( rule.operator ) && ! window.LieveDynamicData?.parse( rule.value ) && ! orderValue( rule.value ) ) { errors[ rule.id ] = 'Enter a number, valid YYYY-MM-DD date, HH:MM time or dynamic value.'; }
			}
		}
		return errors;
	}
	function clone( value ) { const copy = JSON.parse( JSON.stringify( value ) ); copy.groups.forEach( group => { group.id = id(); group.rules.forEach( rule => { rule.id = id(); } ); } ); return copy; }
	function validateDocument( document ) {
		let invalid = null;
		const walk = ( nodes, depth = 0 ) => { if ( depth > 12 || ! Array.isArray( nodes ) ) { return; } for ( const node of nodes ) { if ( node.props && Object.hasOwn( node.props, 'conditions' ) ) { const issues = errors( node.props.conditions ); if ( Object.keys( issues ).length ) { invalid = { node, errors: issues }; return; } } walk( node.children, depth + 1 ); if ( invalid ) { return; } } };
		walk( document.children ); return invalid;
	}
	window.LieveElementConditions = { catalog, id, rule, group, create, errors, clone, validateDocument };
}() );
