/* Runs inside an opaque-origin Custom Code preview, never in the editor itself. */
( function() {
	'use strict';
	const channel = document.currentScript?.dataset.channel;
	if ( ! channel ) return;
	const send = ( type, data = {} ) => window.parent.postMessage( { lieveCodePreview: channel, type, ...data }, '*' );
	let pending = false, variables = [];
	const measure = () => {
		if ( pending ) return;
		pending = true;
		requestAnimationFrame( () => {
			pending = false;
			if ( document.body ) send( 'size', { height: Math.max( 24, document.body.scrollHeight, Math.ceil( document.body.getBoundingClientRect().height ) ) } );
		} );
	};
	window.addEventListener( 'message', event => {
		const data = event.data;
		if ( event.source !== window.parent || ! data || data.lieveCodePreview !== channel || data.type !== 'context' ) return;
		variables.forEach( name => document.documentElement.style.removeProperty( name ) ); variables = [];
		Object.entries( data.variables || {} ).slice( 0, 300 ).forEach( ( [ name, value ] ) => {
			if ( /^--[a-zA-Z0-9_-]{1,100}$/.test( name ) && typeof value === 'string' && value.length <= 2000 ) { document.documentElement.style.setProperty( name, value ); variables.push( name ); }
		} );
		if ( typeof data.inherited === 'string' && data.inherited.length <= 4000 ) document.getElementById( 'lieve-code-inheritance' ).textContent = ':where(html){' + data.inherited + '}';
		measure();
	} );
	document.addEventListener( 'DOMContentLoaded', () => {
		send( 'ready' ); measure();
		new ResizeObserver( measure ).observe( document.body );
		new MutationObserver( measure ).observe( document.body, { subtree: true, childList: true, characterData: true, attributes: true } );
		document.fonts?.ready.then( measure );
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
