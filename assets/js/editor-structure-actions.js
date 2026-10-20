/* Whole-content transfer. External HTML import is intentionally not implemented. */
( function () {
	'use strict';
	const format = 'lieve-builder-content', maxLength = 2 * 1024 * 1024;
	const record = value => value !== null && typeof value === 'object' && ! Array.isArray( value );
	function validate( document, elements ) {
		if ( ! record( document ) || document.version !== 1 || ! Array.isArray( document.children ) || ! document.children.length ) { throw new Error( 'Copy content from LieveBuilder before pasting.' ); }
		let count = 0; const ids = new Set();
		function json( value, depth = 0 ) {
			if ( depth > 48 ) { throw new Error( 'The copied settings are nested too deeply.' ); }
			if ( value === null || typeof value !== 'object' ) { if ( typeof value === 'number' && ! Number.isFinite( value ) ) { throw new Error( 'The copied content contains an invalid number.' ); } return; }
			for ( const [ key, child ] of Object.entries( value ) ) { if ( [ '__proto__', 'prototype', 'constructor' ].includes( key ) ) { throw new Error( 'The copied content contains an unsupported setting.' ); } json( child, depth + 1 ); }
		}
		function styles( value, depth = 0 ) {
			if ( ! record( value ) && ! ( Array.isArray( value ) && ! value.length ) ) { throw new Error( 'The copied style settings are invalid.' ); }
			for ( const child of Object.values( value ) ) { if ( depth < 3 ) { styles( child, depth + 1 ); } else if ( child !== null && ! [ 'string', 'number', 'boolean' ].includes( typeof child ) ) { throw new Error( 'The copied style values are invalid.' ); } }
		}
		function walk( nodes, depth ) {
			for ( const node of nodes ) {
				if ( ++count > 400 || depth > 12 ) { throw new Error( 'Copied content exceeds 400 elements or 12 nesting levels.' ); }
				if ( ! record( node ) || typeof node.id !== 'string' || ! /^[a-zA-Z0-9_-]{1,64}$/.test( node.id ) || ids.has( node.id ) || ! Object.hasOwn( elements, node.type ) || ! record( node.props ) || ! Array.isArray( node.children ) ) { throw new Error( 'The clipboard does not contain valid LieveBuilder elements.' ); }
				ids.add( node.id );
				for ( const key of [ 'classIds', 'interactions', 'motion', 'attributeRows' ] ) { if ( node.props[key] !== undefined && ! Array.isArray( node.props[key] ) ) { throw new Error( 'The copied element settings are invalid.' ); } }
				for ( const key of [ 'interactions', 'motion', 'attributeRows' ] ) { if ( node.props[key]?.some( row => ! record( row ) ) ) { throw new Error( 'The copied element rows are invalid.' ); } }
				if ( node.props.styles !== undefined ) { styles( node.props.styles ); }
				walk( node.children, depth + 1 );
			}
		}
		json( document ); walk( document.children, 0 ); return document;
	}
	function parse( text, elements ) {
		if ( typeof text !== 'string' || text.length > maxLength ) { throw new Error( 'Copied content is empty or too large (maximum 2 MB).' ); }
		let data; try { data = JSON.parse( text ); } catch ( error ) { throw new Error( 'Copy content from LieveBuilder before pasting. External HTML import is not available yet.' ); }
		if ( ! record( data ) || data.type !== format || data.version !== 1 ) { throw new Error( 'Copy content from LieveBuilder before pasting. External HTML import is not available yet.' ); }
		return validate( data.document, elements );
	}
	function encode( document, elements ) {
		// Copy only authored elements, never SEO, Head, template assignments or editor credentials.
		const text = JSON.stringify( { type: format, version: 1, document: { version: 1, children: document.children } } );
		parse( text, elements ); return text;
	}
	function create( { root, read, flush, elements, canEdit, paste, clear, notice, clipboard = window.navigator?.clipboard } ) {
		if ( ! root ) { return null; }
		let memory = '', busy = false, destroyed = false;
		const buttons = Object.fromEntries( Array.from( root.querySelectorAll( '[data-structure-action]' ), button => [ button.dataset.structureAction, button ] ) );
		async function clipboardTask( task ) {
			let timer;
			try { return await Promise.race( [ task(), new Promise( ( resolve, reject ) => { timer = window.setTimeout( () => reject( new Error( 'Clipboard access timed out.' ) ), 5000 ); } ) ] ); }
			finally { window.clearTimeout( timer ); }
		}
		function sync() {
			const locked = busy || ! canEdit(), empty = ! read().children.length;
			buttons.copy.disabled = locked || empty; buttons.clear.disabled = locked || empty;
			buttons.paste.disabled = locked || ! ( memory || clipboard?.readText );
			buttons.html.disabled = true;
			root.setAttribute( 'aria-busy', String( busy ) );
		}
		async function act( event ) {
			const button = event.target.closest( '[data-structure-action]' );
			if ( ! button || ! root.contains( button ) || button.disabled || busy || ! canEdit() ) { return; }
			const action = button.dataset.structureAction; if ( action === 'html' ) { return; }
			busy = true; sync();
			try {
				if ( action === 'copy' ) {
					flush?.(); memory = encode( read(), elements ); let system = false;
					try { if ( clipboard?.writeText ) { await clipboardTask( () => clipboard.writeText( memory ) ); system = true; } } catch ( error ) { /* Same-tab copy/paste remains usable without clipboard permission. */ }
					if ( ! destroyed ) { notice( system ? 'All content copied.' : 'Content copied for this editor tab. System clipboard access is unavailable.' ); }
				} else if ( action === 'paste' ) {
					let text = memory;
					try { if ( clipboard?.readText ) { text = await clipboardTask( () => clipboard.readText() ); } } catch ( error ) { if ( ! memory ) { throw new Error( 'Allow clipboard access, or copy content in this editor tab first.' ); } }
					if ( destroyed || ! canEdit() ) { return; }
					const document = parse( text, elements ); paste( document );
				} else if ( action === 'clear' ) { clear(); }
			} catch ( error ) { if ( ! destroyed ) { notice( error.message || 'The content could not be transferred.', true ); } }
			finally { busy = false; if ( ! destroyed ) { sync(); } }
		}
		root.addEventListener( 'click', act ); sync();
		return { sync, destroy() { destroyed = true; root.removeEventListener( 'click', act ); memory = ''; } };
	}
	window.LieveStructureActions = { encode, parse, create };
} )();
