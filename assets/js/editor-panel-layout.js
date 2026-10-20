/* Small head bootstrap: saved columns are resolved before editor markup paints. */
( function () {
	'use strict';
	const limits = { left: { min: 210, max: 480 }, right: { min: 320, max: 560 } };
	function defaults( width ) { return width <= 1000 ? { left: 210, right: 320 } : width <= 1280 ? { left: 230, right: 340 } : { left: 260, right: 360 }; }
	function sanitize( value ) {
		return Object.fromEntries( Object.entries( limits ).map( ( [ side, range ] ) => [ side, typeof value?.[ side ] === 'number' && Number.isFinite( value[ side ] ) ? Math.round( Math.max( range.min, Math.min( range.max, value[ side ] ) ) ) : null ] ) );
	}
	function fit( preferences, width ) {
		const base = defaults( width ); const result = sanitize( preferences );
		for ( const side of Object.keys( result ) ) { result[ side ] ??= base[ side ]; }
		const excess = Math.max( 0, result.left + result.right + 320 - width );
		const spare = result.left - limits.left.min + result.right - limits.right.min;
		if ( excess && spare ) {
			const reduction = Math.min( excess, spare );
			const left = Math.min( result.left - limits.left.min, Math.round( reduction * ( result.left - limits.left.min ) / spare ) );
			result.left -= left; result.right -= reduction - left;
		}
		return result;
	}
	function read( key ) { try { return sanitize( key ? JSON.parse( window.localStorage.getItem( key ) ) : null ); } catch ( error ) { return sanitize( null ); } }
	function bootstrap( key, root, width ) {
		const widths = fit( read( key ), width );
		for ( const side of Object.keys( limits ) ) {
			if ( width <= 900 ) { root.style.removeProperty( '--lv-panel-' + side ); }
			else { root.style.setProperty( '--lv-panel-' + side, widths[ side ] + 'px' ); }
		}
		return widths;
	}
	window.LievePanelLayout = { limits, defaults, sanitize, fit, read, bootstrap };
	if ( window.LievePanelLayoutConfig ) { bootstrap( window.LievePanelLayoutConfig.storageKey, document.documentElement, window.innerWidth ); }
}() );
