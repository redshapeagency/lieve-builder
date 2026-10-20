/* Runs inside an opaque-origin Custom Code preview, never in the editor itself. */
( function() {
	'use strict';
	const channel = document.currentScript?.dataset.channel;
	if ( ! channel ) return;
	const send = ( type, data = {} ) => window.parent.postMessage( { lieveCodePreview: channel, type, ...data }, '*' );
	let pending = null, variables = [], revision = 0, parsed = false;
	const measure = () => {
		if ( pending ) return;
		const scheduled = pending = {};
		const flush = () => {
			if ( pending !== scheduled ) return;
			pending = null; window.clearTimeout( scheduled.timer ); cancelAnimationFrame( scheduled.frame );
			if ( document.body ) send( 'size', { height: Math.max( 24, document.body.scrollHeight, Math.ceil( document.body.getBoundingClientRect().height ) ), revision, ready: parsed && revision > 0 } );
		};
		// Hidden iframes may not receive animation frames. Their first measured
		// paint must still complete, otherwise visibility and sizing deadlock.
		scheduled.timer = window.setTimeout( flush, 100 );
		scheduled.frame = requestAnimationFrame( flush );
	};
	window.addEventListener( 'message', event => {
		const data = event.data;
		if ( event.source !== window.parent || ! data || data.lieveCodePreview !== channel || data.type !== 'context' || ! Number.isSafeInteger( data.revision ) || data.revision <= revision ) return;
		revision = data.revision;
		variables.forEach( name => document.documentElement.style.removeProperty( name ) ); variables = [];
		Object.entries( data.variables || {} ).slice( 0, 300 ).forEach( ( [ name, value ] ) => {
			if ( /^--[a-zA-Z0-9_-]{1,100}$/.test( name ) && typeof value === 'string' && value.length <= 2000 ) { document.documentElement.style.setProperty( name, value ); variables.push( name ); }
		} );
		if ( typeof data.inherited === 'string' && data.inherited.length <= 4000 ) document.getElementById( 'lieve-code-inheritance' ).textContent = ':where(html){' + data.inherited + '}';
		// Font/resource completion can refine geometry later, but must not block
		// already-parsed content after its current inherited styles are applied.
		document.body?.getBoundingClientRect();
		Promise.resolve( document.fonts?.ready ).then( measure, () => {} );
		measure();
	} );
	document.addEventListener( 'DOMContentLoaded', () => {
		parsed = true;
		send( 'ready' ); measure();
		new ResizeObserver( measure ).observe( document.body );
		new MutationObserver( measure ).observe( document.body, { subtree: true, childList: true, characterData: true, attributes: true } );
		Promise.resolve( document.fonts?.ready ).then( measure, () => {} );
	} );
	window.addEventListener( 'load', measure );
	// Keep native controls and authored handlers interactive, but never navigate
	// this live preview away from its code (including keyboard/middle clicks).
	const preventLinkNavigation = event => {
		const link = event.target?.closest?.( 'a[href], area[href]' ) || event.composedPath?.().find( item => item.matches?.( 'a[href], area[href]' ) );
		if ( link ) event.preventDefault();
	};
	document.addEventListener( 'click', preventLinkNavigation, true );
	document.addEventListener( 'auxclick', preventLinkNavigation, true );
	document.addEventListener( 'pointerdown', () => send( 'select' ), true );
	document.addEventListener( 'focusin', () => send( 'select' ) );
	window.addEventListener( 'error', event => send( 'error', { message: String( event.message || 'JavaScript preview error.' ).slice( 0, 240 ) } ) );
	window.addEventListener( 'unhandledrejection', () => send( 'error', { message: 'An asynchronous script failed in this preview.' } ) );
} )();
