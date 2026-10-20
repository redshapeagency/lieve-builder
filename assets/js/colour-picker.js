/* Standalone colour control, adapted from the supplied TheOneWP colour selector.
 * Keeps its checkerboard swatch, HSV field, alpha bar and HEX/RGB/HSL modes. */
( function () {
	'use strict';
	const clamp = ( value, min, max ) => Math.max( min, Math.min( max, value ) );
	function rgb( h, s, v ) {
		h = ( h % 360 + 360 ) % 360; s = clamp( s, 0, 100 ) / 100; v = clamp( v, 0, 100 ) / 100;
		const c = v * s, x = c * ( 1 - Math.abs( h / 60 % 2 - 1 ) ), m = v - c;
		return [ [ c, x, 0 ], [ x, c, 0 ], [ 0, c, x ], [ 0, x, c ], [ x, 0, c ], [ c, 0, x ] ][ Math.floor( h / 60 ) ].map( n => Math.round( ( n + m ) * 255 ) );
	}
	function hsv( r, g, b ) {
		r /= 255; g /= 255; b /= 255; const max = Math.max( r, g, b ), min = Math.min( r, g, b ), d = max - min;
		const h = ! d ? 0 : max === r ? 60 * ( ( g - b ) / d % 6 ) : max === g ? 60 * ( ( b - r ) / d + 2 ) : 60 * ( ( r - g ) / d + 4 );
		return { h: ( h % 360 + 360 ) % 360, s: max ? d / max * 100 : 0, v: max * 100, a: 1 };
	}
	function parse( value ) {
		value = String( value || '' ).trim().toLowerCase(); const hex = value.match( /^#([a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/ );
		if ( hex ) { let n = hex[ 1 ]; if ( n.length < 5 ) { n = [ ...n ].map( digit => digit + digit ).join( '' ); } return { ...hsv( parseInt( n.slice( 0, 2 ), 16 ), parseInt( n.slice( 2, 4 ), 16 ), parseInt( n.slice( 4, 6 ), 16 ) ), a: n.length === 8 ? parseInt( n.slice( 6 ), 16 ) / 255 : 1 }; }
		const match = value.match( /^(rgba?|hsla?)\(\s*([-+\d.%\s,/]+)\s*\)$/ ); if ( ! match ) { return null; }
		const parts = match[ 2 ].trim().split( /[,/\s]+/ ); if ( parts.length < 3 || parts.length > 4 || parts.some( part => ! /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)%?$/.test( part ) ) ) { return null; }
		const n = parts.map( parseFloat ), alpha = parts[ 3 ] ? n[ 3 ] / ( parts[ 3 ].endsWith( '%' ) ? 100 : 1 ) : 1;
		if ( alpha < 0 || alpha > 1 ) { return null; }
		if ( match[ 1 ].startsWith( 'rgb' ) ) { const channels = n.slice( 0, 3 ).map( ( number, i ) => number * ( parts[ i ].endsWith( '%' ) ? 255 / 100 : 1 ) ); if ( channels.some( number => number < 0 || number > 255 ) ) { return null; } return { ...hsv( ...channels ), a: alpha }; }
		if ( parts[ 0 ].endsWith( '%' ) || ! parts[ 1 ].endsWith( '%' ) || ! parts[ 2 ].endsWith( '%' ) || n[ 1 ] < 0 || n[ 1 ] > 100 || n[ 2 ] < 0 || n[ 2 ] > 100 ) { return null; }
		const s = n[ 1 ] / 100, l = n[ 2 ] / 100, v = l + s * Math.min( l, 1 - l );
		return { h: ( n[ 0 ] % 360 + 360 ) % 360, s: v ? 2 * ( 1 - l / v ) * 100 : 0, v: v * 100, a: alpha };
	}
	function format( color, mode = 'hex' ) {
		const channels = rgb( color.h, color.s, color.v ), opaque = color.a >= 1, alpha = Math.round( color.a * 1000 ) / 1000;
		if ( mode === 'rgb' ) { return ( opaque ? 'rgb(' : 'rgba(' ) + channels.join( ', ' ) + ( opaque ? ')' : ', ' + alpha + ')' ); }
		if ( mode === 'hsl' ) { const v = color.v / 100, s = color.s / 100, l = v * ( 1 - s / 2 ), saturation = l === 0 || l === 1 ? 0 : ( v - l ) / Math.min( l, 1 - l ); return ( opaque ? 'hsl(' : 'hsla(' ) + Math.round( color.h ) + ', ' + Math.round( saturation * 100 ) + '%, ' + Math.round( l * 100 ) + '%' + ( opaque ? ')' : ', ' + alpha + ')' ); }
		return '#' + [ ...channels, ...( opaque ? [] : [ Math.round( color.a * 255 ) ] ) ].map( n => n.toString( 16 ).padStart( 2, '0' ) ).join( '' );
	}
	let active = null;
	function create( input, { trigger, container = input.closest( '[role="dialog"]' ) || input.closest( '.lieve-ds' ), allowAlpha = true } ) {
		function readColor( value ) { const parsed = parse( value ); return parsed && ! allowAlpha ? { ...parsed, a: 1 } : parsed; }
		let color = readColor( input.value ) || { h: 0, s: 80, v: 90, a: 1 }, mode = 'hex', writing = false, drag = null, panel = null;
		trigger.classList.add( 'lieve-colour-swatch' ); trigger.setAttribute( 'aria-haspopup', 'dialog' ); trigger.setAttribute( 'aria-expanded', 'false' );
		function swatch() { const parsed = readColor( input.value ); trigger.classList.toggle( 'is-empty', ! parsed ); trigger.style.setProperty( '--lieve-colour', parsed ? format( parsed ) : 'transparent' ); }
		function position() {
			if ( ! panel || panel.hidden ) { return; }
			const anchor = trigger.getBoundingClientRect(), bounds = container.getBoundingClientRect();
			// The manager can be narrower than the viewport and sit inside a clipped card.
			const leftEdge = Math.max( 8, bounds.left + container.clientLeft + 8 ), rightEdge = Math.min( window.innerWidth - 8, bounds.right - container.clientLeft - 8 );
			panel.style.maxWidth = Math.max( 0, rightEdge - leftEdge ) + 'px';
			const left = Math.max( leftEdge, Math.min( anchor.left, rightEdge - panel.offsetWidth ) );
			const above = window.innerHeight - anchor.bottom < panel.offsetHeight + 12 && anchor.top > panel.offsetHeight + 12;
			panel.style.left = left - bounds.left - container.clientLeft + container.scrollLeft + 'px';
			panel.style.top = clamp( above ? anchor.top - panel.offsetHeight - 6 : anchor.bottom + 6, 8, Math.max( 8, window.innerHeight - panel.offsetHeight - 8 ) ) - bounds.top - container.clientTop + container.scrollTop + 'px';
		}
		function draw() {
			if ( ! panel ) { return; }
			const field = panel.querySelector( '.lieve-colour-field' ), hue = panel.querySelector( '.lieve-colour-hue' ), alpha = panel.querySelector( '.lieve-colour-alpha' );
			field.style.setProperty( '--lieve-colour-hue', format( { h: color.h, s: 100, v: 100, a: 1 } ) );
			const dot = field.querySelector( 'span' ); dot.style.left = color.s + '%'; dot.style.top = 100 - color.v + '%'; field.setAttribute( 'aria-label', 'Saturation ' + Math.round( color.s ) + '%, brightness ' + Math.round( color.v ) + '% · use arrow keys' );
			hue.querySelector( 'span' ).style.left = color.h / 360 * 100 + '%'; hue.setAttribute( 'aria-valuenow', String( Math.round( color.h ) ) );
			alpha.style.setProperty( '--lieve-colour-solid', format( { ...color, a: 1 } ) ); alpha.querySelector( 'span' ).style.left = color.a * 100 + '%'; alpha.setAttribute( 'aria-valuenow', String( Math.round( color.a * 100 ) ) );
			panel.querySelectorAll( '[data-colour-mode]' ).forEach( button => { button.classList.toggle( 'is-on', button.dataset.colourMode === mode ); button.setAttribute( 'aria-pressed', String( button.dataset.colourMode === mode ) ); } );
			const text = panel.querySelector( '.lieve-colour-write' ); if ( document.activeElement !== text ) { text.value = format( color, mode ); } text.removeAttribute( 'aria-invalid' );
		}
		function commit() { if ( ! allowAlpha ) { color.a = 1; } writing = true; input.value = format( color ); input.dispatchEvent( new Event( 'input', { bubbles: true } ) ); input.dispatchEvent( new Event( 'change', { bubbles: true } ) ); writing = false; swatch(); draw(); }
		function close( restore = false ) { if ( panel ) { panel.hidden = true; } drag = null; trigger.setAttribute( 'aria-expanded', 'false' ); if ( active === api ) { active = null; } if ( restore && trigger.isConnected ) { trigger.focus( { preventScroll: true } ); } }
		function open() {
			if ( trigger.disabled || input.disabled ) { return; } if ( panel && ! panel.hidden ) { close( true ); return; }
			active?.close(); color = readColor( input.value ) || { h: 0, s: 80, v: 90, a: 1 }; mode = 'hex';
			if ( ! panel ) {
				panel = document.createElement( 'div' ); panel.className = 'lieve-colour-panel'; panel.setAttribute( 'role', 'dialog' ); panel.setAttribute( 'aria-label', 'Color picker' );
				panel.innerHTML = '<div class="lieve-colour-field" tabindex="0" role="group"><span class="lieve-colour-dot"></span></div><div class="lieve-colour-sliders"><div class="lieve-colour-bar lieve-colour-hue" tabindex="0" role="slider" aria-label="Hue" aria-valuemin="0" aria-valuemax="360"><span class="lieve-colour-grab"></span></div><div class="lieve-colour-bar lieve-colour-alpha" tabindex="0" role="slider" aria-label="Opacity" aria-valuemin="0" aria-valuemax="100"><span class="lieve-colour-grab"></span></div></div><div class="lieve-colour-foot"><div class="lieve-colour-modes" role="group" aria-label="Color format"><button type="button" class="lieve-colour-mode" data-colour-mode="hex">HEX</button><button type="button" class="lieve-colour-mode" data-colour-mode="rgb">RGB</button><button type="button" class="lieve-colour-mode" data-colour-mode="hsl">HSL</button></div><input type="text" class="lieve-colour-write" aria-label="Color value" spellcheck="false" autocomplete="off"></div>';
				container.appendChild( panel );
				panel.querySelector( '.lieve-colour-alpha' ).hidden = ! allowAlpha;
				panel.addEventListener( 'click', event => { const button = event.target.closest( '[data-colour-mode]' ); if ( button ) { mode = button.dataset.colourMode; panel.querySelector( '.lieve-colour-write' ).value = format( color, mode ); draw(); } } );
				panel.querySelector( '.lieve-colour-write' ).addEventListener( 'input', event => { const parsed = readColor( event.target.value ); if ( parsed ) { color = parsed; const text = event.target.value.trim().toLowerCase(); mode = text.startsWith( 'hsl' ) ? 'hsl' : text.startsWith( 'rgb' ) ? 'rgb' : 'hex'; commit(); } else { event.target.setAttribute( 'aria-invalid', 'true' ); } } );
				panel.addEventListener( 'pointerdown', event => { const target = event.target.closest( '.lieve-colour-field,.lieve-colour-bar' ); if ( ! target || event.button !== 0 ) { return; } event.preventDefault(); target.focus( { preventScroll: true } ); drag = target; target.setPointerCapture( event.pointerId ); move( event ); } );
				panel.addEventListener( 'pointermove', move ); panel.addEventListener( 'pointerup', () => { drag = null; } ); panel.addEventListener( 'pointercancel', () => { drag = null; } );
				panel.addEventListener( 'keydown', keyboard );
			}
			panel.hidden = false; active = api; trigger.setAttribute( 'aria-expanded', 'true' ); swatch(); draw(); position(); panel.querySelector( '.lieve-colour-write' ).focus( { preventScroll: true } );
		}
		function move( event ) {
			if ( ! drag ) { return; } const box = drag.getBoundingClientRect(); if ( ! box.width || ! box.height ) { return; }
			const x = clamp( ( event.clientX - box.left ) / box.width, 0, 1 ), y = clamp( ( event.clientY - box.top ) / box.height, 0, 1 );
			if ( drag.classList.contains( 'lieve-colour-field' ) ) { color.s = x * 100; color.v = ( 1 - y ) * 100; }
			else if ( drag.classList.contains( 'lieve-colour-hue' ) ) { color.h = x * 360; }
			else { color.a = Math.round( x * 100 ) / 100; } commit();
		}
		function keyboard( event ) {
			if ( event.key === 'Enter' && event.target.matches( 'input' ) ) { event.preventDefault(); event.stopPropagation(); if ( parse( event.target.value ) ) { close( true ); } return; }
			if ( ! [ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End' ].includes( event.key ) || ! event.target.matches( '.lieve-colour-field,.lieve-colour-bar' ) ) { return; }
			event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? 10 : 1, direction = [ 'ArrowRight', 'ArrowUp' ].includes( event.key ) ? 1 : -1;
			if ( event.target.classList.contains( 'lieve-colour-field' ) ) { const axis = [ 'ArrowUp', 'ArrowDown' ].includes( event.key ) ? 'v' : 's'; color[ axis ] = event.key === 'Home' ? 0 : event.key === 'End' ? 100 : clamp( color[ axis ] + direction * step, 0, 100 ); }
			else { const hue = event.target.classList.contains( 'lieve-colour-hue' ), key = hue ? 'h' : 'a', max = hue ? 360 : 1; color[ key ] = event.key === 'Home' ? 0 : event.key === 'End' ? max : clamp( color[ key ] + direction * step * ( hue ? 1 : .01 ), 0, max ); } commit();
		}
		function inputChanged() { swatch(); if ( ! writing && panel && ! panel.hidden ) { const parsed = readColor( input.value ); if ( parsed ) { color = parsed; draw(); } } }
		function outside( event ) { if ( panel && ! panel.hidden && ! panel.contains( event.target ) && ! trigger.contains( event.target ) && event.target !== input ) { close(); } }
		function escape( event ) { if ( panel && ! panel.hidden && event.key === 'Escape' ) { event.preventDefault(); event.stopImmediatePropagation(); close( true ); } }
		function scroll( event ) { if ( ! panel?.contains( event.target ) ) { position(); } }
		function click( event ) { event.preventDefault(); open(); }
		trigger.addEventListener( 'click', click ); input.addEventListener( 'input', inputChanged );
		document.addEventListener( 'pointerdown', outside, true ); document.addEventListener( 'keydown', escape, true ); window.addEventListener( 'resize', position ); window.addEventListener( 'scroll', scroll, true ); swatch();
		const api = { close, refresh: inputChanged, destroy() { close(); panel?.remove(); trigger.removeEventListener( 'click', click ); input.removeEventListener( 'input', inputChanged ); document.removeEventListener( 'pointerdown', outside, true ); document.removeEventListener( 'keydown', escape, true ); window.removeEventListener( 'resize', position ); window.removeEventListener( 'scroll', scroll, true ); } };
		return api;
	}
	window.LieveColour = { parse, format, create };
}() );
