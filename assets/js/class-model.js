/* Stable class identities and declaration-only CSS, shared by both manager surfaces. */
( function () {
	'use strict';
	const base = window.LieveDesignModel;
	const empty = () => ( { ...base.empty(), classes: [] } );
	function normalize( raw ) { const data = base.normalize( raw ); for ( const item of data.classes ) { item.aliases ||= []; item.description ||= ''; item.conditions ||= []; if ( item.trashed === false || item.trashed === undefined ) { delete item.trashed; delete item.trashedAt; } for ( const key of [ 'values', 'states', 'responsiveStates' ] ) { if ( ! item[ key ] || Array.isArray( item[ key ] ) ) { item[ key ] = {}; } } } return data; }
	function declarations( input ) {
		if ( typeof input !== 'string' || input.length > 12000 ) { return false; }
		const value = input.replace( /\/\*[\s\S]*?\*\//g, '' ).trim();
		if ( value.includes( '/*' ) || value.includes( '*/' ) ) { return false; }
		if ( /[{}<>@\\\x00-\x08\x0b\x0c\x0e-\x1f]|expression\s*\(|(?:javascript|vbscript|data)\s*:|(?:behavior|-moz-binding)\s*:/i.test( value ) ) { return false; }
		const parts = []; let start = 0; let depth = 0; let quote = '';
		for ( let i = 0; i < value.length; i++ ) {
			const char = value[ i ]; if ( quote ) { if ( char === quote ) { quote = ''; } continue; }
			if ( char === '"' || char === "'" ) { quote = char; } else if ( char === '(' ) { depth++; } else if ( char === ')' ) { if ( --depth < 0 ) { return false; } } else if ( char === ';' && ! depth ) { parts.push( value.slice( start, i ) ); start = i + 1; }
		}
		if ( quote || depth ) { return false; } parts.push( value.slice( start ) ); const clean = [];
		for ( const part of parts ) { if ( ! part.trim() ) { continue; } const match = part.match( /^\s*((?:--[a-zA-Z_][a-zA-Z0-9_-]*|-?[a-zA-Z][a-zA-Z0-9-]*))\s*:\s*(\S[\s\S]*)$/ ); if ( ! match ) { return false; } clean.push( match[1] + ':' + match[2].trim() + ';' ); }
		return clean.join( '' );
	}
	function validate( data ) {
		if ( ! data || ! Array.isArray( data.classes ) || data.classes.length > 1000 || JSON.stringify( data ).length > 1500000 ) { return 'Invalid classes library (maximum 1000 classes / 1.5 MB).'; }
		const proxy = { ...data, variables: data.classes.map( item => ( { ...item, value: '0', values: {} } ) ), colors: [], palettes: [] };
		const error = base.validate( proxy ); if ( error ) { return error.replace( /token/g, 'class' ); }
		for ( const item of data.classes ) {
			if ( declarations( item.value ) === false ) { return 'Use valid CSS declarations, e.g. display: flex; gap: var(--space-md); — without selectors or braces.'; }
			for ( const key of [ 'values', 'states' ] ) {
				const values = item[ key ] || {}; if ( typeof values !== 'object' || ( Array.isArray( values ) && values.length ) || Object.keys( values ).length > ( key === 'states' ? 6 : 30 ) || ! Object.entries( values ).every( ( [ name, css ] ) => ( key === 'states' ? [ 'hover', 'focus-visible', 'active', 'disabled', 'before', 'after' ].includes( name ) : window.LieveResponsive.validId( name ) ) && declarations( css ) !== false ) ) { return 'Invalid class state or responsive declarations.'; }
			}
			const responsive = item.responsiveStates || {};
			if ( typeof responsive !== 'object' || ( Array.isArray( responsive ) && responsive.length ) || Object.keys( responsive ).length > 30 || ! Object.entries( responsive ).every( ( [ id, states ] ) => window.LieveResponsive.validId( id ) && states && typeof states === 'object' && ! ( Array.isArray( states ) && states.length ) && Object.keys( states ).length <= 6 && Object.entries( states ).every( ( [ name, value ] ) => [ 'hover', 'focus-visible', 'active', 'disabled', 'before', 'after' ].includes( name ) && declarations( value ) !== false ) ) ) { return 'Invalid responsive class state declarations.'; }
		}
		return '';
	}
	const names = data => new Set( data.classes.flatMap( item => [ item.name, ...( item.aliases || [] ) ] ) );
	function uniqueName( data, requested ) { const used = names( data ); if ( base.validName( requested ) && ! used.has( requested ) ) { return requested; } for ( let i = 2; i < 4000; i++ ) { const name = requested.slice( 0, 68 ) + '-' + i; if ( base.validName( name ) && ! used.has( name ) ) { return name; } } throw new Error( 'Could not create a unique class name.' ); }
	function reorderTokens( data, ids ) { const next = base.clone( data ); const visible = new Set( ids ); if ( ids.length !== visible.size || ids.some( id => ! data.classes.some( item => item.id === id ) ) ) { throw new Error( 'Invalid class order.' ); } const byId = new Map( next.classes.map( item => [ item.id, item ] ) ); let index = 0; next.classes = next.classes.map( item => visible.has( item.id ) ? byId.get( ids[ index++ ] ) : item ); return next; }
	function duplicate( data, kind, ids, { find = '', replace = '', prefix = '', suffix = '-copy', groupId = null } = {} ) {
		const next = base.clone( data ); const created = [];
		for ( const original of data.classes.filter( item => ! item.trashed && ids.includes( item.id ) ) ) { const item = base.clone( original ); item.id = base.newId(); item.aliases = []; const requested = prefix + ( find ? item.name.split( find ).join( replace ) : item.name ) + suffix; if ( ! base.validName( requested ) ) { throw new Error( 'Enter a valid duplicated class name.' ); } item.name = uniqueName( next, requested ); if ( groupId !== null ) { item.categoryId = groupId; } next.classes.push( item ); created.push( item.id ); }
		const error = validate( next ); if ( error ) { throw new Error( error ); } return { data: next, ids: created };
	}
	function merge( data, imported ) { const next = base.clone( data ); const groups = new Map(); for ( const category of imported.categories ) { const existing = next.categories.find( item => item.name.toLowerCase() === category.name.toLowerCase() ); const id = existing?.id || base.newId(); groups.set( category.id, id ); if ( ! existing ) { next.categories.push( { ...category, id } ); } } for ( const original of imported.classes ) { const item = base.clone( original ); item.id = base.newId(); item.name = uniqueName( next, item.name ); item.aliases = []; item.categoryId = groups.get( item.categoryId ) || ''; next.classes.push( item ); } const error = validate( next ); if ( error ) { throw new Error( error ); } return next; }
	function css( data, activeIds, device, breakpoints ) {
		const active = new Set( activeIds ); const cascade = window.LieveResponsive.cascade( breakpoints, device );
		// Outrank the canvas reset, but keep every direct element style dominant.
		const rule = ( item, value, state = '' ) => { const raw = declarations( value ); const content = raw ? window.LieveStyles?.dimensionCss?.( raw ) || raw : raw; const selector = '#lieve-canvas :is(' + [ item.name, ...item.aliases ].map( name => '.' + name ).join( ',' ) + ')' + ( state ? ( [ 'before', 'after' ].includes( state ) ? '::' : ':' ) + state : '' ); return content ? selector + '{' + content + '}' + ( ! [ 'before', 'after' ].includes( state ) ? window.LieveStyles?.overlayCss( selector, content ) || '' : '' ) : ''; };
		const items = data.classes.filter( item => ! item.trashed && item.enabled && active.has( item.id ) );
		let output = items.map( item => rule( item, item.value ) + Object.entries( item.states ).map( ( [ state, value ] ) => rule( item, value, state ) ).join( '' ) ).join( '' );
		for ( const bp of cascade ) { output += items.map( item => rule( item, item.values[ bp.id ] || '' ) + Object.entries( item.responsiveStates?.[ bp.id ] || {} ).map( ( [ state, value ] ) => rule( item, value, state ) ).join( '' ) ).join( '' ); } return output;
	}
	window.LieveClassModel = { ...base, empty, normalize, validate, declarations, names, uniqueName, reorderTokens, duplicate, merge, css, tokens: data => data.classes.filter( item => ! item.trashed ), dependencyReport: () => [] };
}() );
