/* Typed references shared by the field picker and live preview. No code evaluation. */
( function () {
	'use strict';
	let catalogue = { sources: [], fields: {} };
	const values = new Map(), pending = new Map();
	const units = 'px % rem em vh vw dvh svh vmin vmax ch fr'.split( ' ' );
	function configure( config ) { catalogue = { sources: config?.sources || [], fields: config?.fields || {}, resolveUrl: config?.resolveUrl || '' }; values.clear(); pending.clear(); }
	function parse( value ) {
		const match = typeof value === 'string' && value.length <= 1200 && value.trim().match( /^\{\{lieve:([a-z][a-z0-9_.-]{0,79})(?:\|(px|%|rem|em|vh|vw|dvh|svh|vmin|vmax|ch|fr))?(?:@([^{}\s]+))?\}\}$/ );
		if ( ! match ) { return null; }
		let options; try { options = match[ 3 ] ? JSON.parse( decodeURIComponent( match[ 3 ] ) ) : {}; } catch { return null; }
		if ( ! options || typeof options !== 'object' || Array.isArray( options ) || Object.keys( options ).length > 12 || Object.entries( options ).some( ( [ key, item ] ) => ! /^[a-z_]{1,30}$/.test( key ) || ! [ 'string', 'number', 'boolean' ].includes( typeof item ) || String( item ).length > 240 ) ) { return null; }
		return { source: match[ 1 ], unit: match[ 2 ] || '', options };
	}
	function reference( id, unit = '', options = {} ) { return '{{lieve:' + id + ( units.includes( unit ) ? '|' + unit : '' ) + ( Object.keys( options ).length ? '@' + encodeURIComponent( JSON.stringify( options ) ) : '' ) + '}}'; }
	function source( id ) { return catalogue.sources.find( item => item.id === id ); }
	function accepts( binding, kind ) {
		if ( ! binding || ! kind ) { return false; }
		const source = catalogue.sources.find( item => item.id === binding.source );
		if ( ! source ) { return true; } // Preserve an unavailable integration reference.
		if ( source.flexible ) { return [ 'text', 'html', 'url', 'image', 'number', 'dimension', 'color' ].includes( kind ) && ( ! binding.unit || kind === 'dimension' ); }
		return ( { html: [ 'text', 'html', 'number', 'url', 'image', 'color' ], text: [ 'text', 'html', 'number', 'url', 'image', 'color' ], url: [ 'url', 'image' ], image: [ 'image' ], number: [ 'number' ], dimension: [ 'number' ], color: [ 'color' ] }[ kind ] || [] ).includes( source.type ) && ( ! binding.unit || kind === 'dimension' );
	}
	function sources( kind ) { return catalogue.sources.filter( item => accepts( { source: item.id, unit: '' }, kind ) ); }
	function propKind( type, property ) { return catalogue.fields[ type ]?.[ property ] || ''; }
	function styleKind( property, field ) { return [ 'custom-css', 'gradient-count', 'gradient-local-stops' ].includes( property ) ? '' : ( { text: 'text', content: 'text', image: 'image', number: 'number', dimension: 'dimension', color: 'color' }[ field?.type ] || '' ); }
	function resolve( value, kind ) {
		const binding = parse( value ); if ( ! binding ) { return value; }
		if ( ! accepts( binding, kind ) ) { return ''; }
		const source = catalogue.sources.find( item => item.id === binding.source ); const key = reference( binding.source, '', binding.options ) + ':' + kind;
		const result = values.has( key ) ? values.get( key ) : source?.value;
		if ( result === undefined || result === null || result === '' || parse( result ) ) { return ''; }
		return String( result ) + binding.unit;
	}
	async function load( binding, kind, nonce ) {
		const key = reference( binding.source, '', binding.options ) + ':' + kind;
		if ( values.has( key ) ) { return values.get( key ); }
		if ( pending.has( key ) ) { return pending.get( key ); }
		if ( ! catalogue.resolveUrl ) { const value = resolve( reference( binding.source, '', binding.options ), kind ); values.set( key, value ); return value; }
		const job = ( async () => {
			const response = await ( window.LieveTransport?.fetch || window.fetch.bind( window ) )(  catalogue.resolveUrl, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce }, body: JSON.stringify( { reference: reference( binding.source, '', binding.options ), kind } ) } );
			const result = await response.json(); if ( ! response.ok ) { throw new Error( result.message || 'Dynamic data could not be resolved. Review its parameters and try again.' ); }
			values.set( key, result.value ); return result.value;
		} )(); pending.set( key, job );
		try { return await job; } finally { pending.delete( key ); }
	}
	function hydrate( document, nonce, onChange ) {
		const refs = new Map();
		function walk( nodes ) { ( nodes || [] ).forEach( node => {
			if ( window.LieveListingEditor?.enabled( node ) ) { return; } // Server resolves each result, not the context page.
			Object.entries( node.props || {} ).forEach( ( [ key, value ] ) => { const binding = parse( value ), kind = propKind( node.type, key ); if ( binding && kind ) { refs.set( reference( binding.source, '', binding.options ) + ':' + kind, { binding, kind } ); } } );
			Object.values( node.props?.styles || {} ).forEach( devices => Object.values( devices ).forEach( states => Object.values( states ).forEach( properties => Object.entries( properties ).forEach( ( [ key, value ] ) => { const binding = parse( value ), kind = styleKind( key, window.LieveStyles?.field( key ) ); if ( binding && kind ) { refs.set( reference( binding.source, '', binding.options ) + ':' + kind, { binding, kind } ); } } ) ) ) ); walk( node.children );
		} ); } walk( document.children );
		const jobs = Array.from( refs ).filter( ( [ key ] ) => ! values.has( key ) && ! pending.has( key ) );
		if ( ! jobs.length ) { return; }
		// Bound concurrent requests, including persisted documents with many references.
		let next = 0; Promise.all( Array.from( { length: Math.min( 4, jobs.length ) }, async () => { while ( next < jobs.length ) { const [ key, item ] = jobs[ next++ ]; try { await load( item.binding, item.kind, nonce ); } catch { values.set( key, '' ); } } } ) ).then( onChange );
	}
	function resolveNode( node ) {
		const props = { ...node.props };
		Object.entries( props ).forEach( ( [ key, value ] ) => { const kind = propKind( node.type, key ); if ( kind && parse( value ) ) { props[ key ] = resolve( value, kind ); if ( key === 'url' && kind === 'image' ) { props.attachmentId = 0; } } } );
		return { ...node, props };
	}
	window.LieveDynamicData = { configure, parse, reference, accepts, sources, source, propKind, styleKind, resolve, resolveNode, load, hydrate };
}() );
