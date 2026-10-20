/* Visual controls edit CSS declaration lists directly. No parallel style map is stored. */
( function () {
	'use strict';
	const M = window.LieveClassModel;
	const stateName = state => state === 'focus' ? 'focus-visible' : state;
	const join = lists => lists.map( css => M.declarations( css || '' ) || '' ).filter( Boolean ).join( '\n' );
	const important = value => /\s*!important\s*$/i.test( value );
	const plain = value => value.replace( /\s*!important\s*$/i, '' ).trim();
	function split( value, separator = ';' ) {
		const result = []; let start = 0; let depth = 0; let quote = '';
		for ( let i = 0; i < value.length; i++ ) { const ch = value[ i ]; if ( quote ) { if ( ch === quote ) { quote = ''; } } else if ( ch === '"' || ch === "'" ) { quote = ch; } else if ( ch === '(' ) { depth++; } else if ( ch === ')' ) { depth--; } else if ( ch === separator && ! depth ) { result.push( value.slice( start, i ).trim() ); start = i + 1; } }
		result.push( value.slice( start ).trim() ); return result.filter( Boolean );
	}
	function parse( css ) {
		const safe = M.declarations( css || '' ); if ( safe === false ) { return []; }
		return split( safe ).map( value => { const index = value.indexOf( ':' ); const name = value.slice( 0, index ); return { property: name.startsWith( '--' ) ? name : name.toLowerCase(), value: plain( value.slice( index + 1 ) ), priority: important( value ) }; } );
	}
	const serialize = entries => entries.map( item => item.property + ': ' + item.value + ( item.priority ? ' !important' : '' ) + ';' ).join( '\n' );
	function winners( entries ) {
		const map = new Map(); for ( const item of entries ) { if ( ! map.get( item.property )?.priority || item.priority ) { map.set( item.property, item ); } } return map;
	}
	const sides = [ 'top', 'right', 'bottom', 'left' ];
	const boxes = Object.fromEntries( [ 'margin', 'padding', 'inset', 'border-width', 'border-style', 'border-color', 'scroll-margin', 'scroll-padding' ].map( name => [ name, sides.map( side => name === 'inset' ? side : name.startsWith( 'border-' ) ? 'border-' + side + '-' + name.slice( 7 ) : name + '-' + side ) ] ) );
	const shorthand = {
		...boxes, 'gap': [ 'row-gap', 'column-gap' ], 'overflow': [ 'overflow-x', 'overflow-y' ],
		'border-radius': [ 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius' ],
		'flex': [ 'flex-grow', 'flex-shrink', 'flex-basis' ], 'flex-flow': [ 'flex-direction', 'flex-wrap' ],
		'font': [ 'font-style', 'font-variant', 'font-weight', 'font-stretch', 'font-size', 'line-height', 'font-family' ],
		'background': [ 'background-color', 'background-image', 'background-position', 'background-size', 'background-repeat', 'background-origin', 'background-clip', 'background-attachment' ],
		'border': sides.flatMap( side => [ 'width', 'style', 'color' ].map( part => 'border-' + side + '-' + part ) ),
		...Object.fromEntries( sides.map( side => [ 'border-' + side, [ 'width', 'style', 'color' ].map( part => 'border-' + side + '-' + part ) ] ) ),
		'outline': [ 'outline-width', 'outline-style', 'outline-color' ],
		'transition': [ 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay' ],
		'animation': [ 'animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode', 'animation-play-state' ],
	};
	function words( value ) { return split( value.replace( /\s+(?![^()]*\))/g, ' ' ), ' ' ); }
	function expand( item ) {
		const keys = shorthand[ item.property ]; if ( ! keys ) { return [ item ]; }
		let values = {};
		const declaration = document.createElement?.( 'span' ).style;
		if ( declaration?.setProperty ) { declaration.setProperty( item.property, item.value ); for ( const key of keys ) { const value = declaration.getPropertyValue( key ); if ( value ) { values[ key ] = value; } } }
		// CSSOM cannot expand unresolved var()/env() shorthands safely: their value
		// may contain multiple components. Keep those original declarations intact.
		if ( ! Object.keys( values ).length && ( boxes[ item.property ] || [ 'gap', 'overflow', 'border-radius' ].includes( item.property ) ) ) {
			const parts = words( item.value );
			if ( parts.length && parts.length <= 4 && ! item.value.includes( '/' ) && ! parts.some( value => /^(?:var|env)\(/i.test( value ) ) ) {
				const expanded = keys.length === 2 ? [ parts[ 0 ], parts[ 1 ] || parts[ 0 ] ] : [ parts[ 0 ], parts[ 1 ] || parts[ 0 ], parts[ 2 ] || parts[ 0 ], parts[ 3 ] || parts[ 1 ] || parts[ 0 ] ];
				values = Object.fromEntries( keys.map( ( key, index ) => [ key, expanded[ index ] ] ) );
			}
		}
		return Object.keys( values ).length ? keys.filter( key => values[ key ] ).map( property => ( { property, value: values[ property ], priority: item.priority } ) ) : [ item ];
	}
	function read( css ) {
		const entries = parse( css ); const expanded = entries.flatMap( expand ); const map = winners( expanded );
		const values = Object.fromEntries( [ ...map ].map( ( [ property, item ] ) => [ property, item.value ] ) );
		values[ 'custom-css' ] = css || '';
		if ( values.content && /^(["']).*\1$/s.test( values.content ) ) { values.content = values.content.slice( 1, -1 ); }
		if ( values.transform ) { for ( const item of transformParts( values.transform ) ) { if ( /^(translate|rotate|scale|skew)[XYZ]$/.test( item.name ) ) { values[ item.name ] = item.value; } } }
		const layers = split( values[ 'background-image' ] || '', ',' );
		const image = layers.find( layer => /^url\(/i.test( layer ) ); if ( image ) { values[ 'background-image' ] = image.replace( /^url\(\s*(["']?)(.*?)\1\s*\)$/i, '$2' ); } else { delete values[ 'background-image' ]; }
		const overlay = map.get( '--lieve-gradient-overlay-image' )?.value;
		const gradient = /^(linear|radial|conic)-gradient\(/i.test( overlay || '' ) ? overlay : layers.find( layer => /^(linear|radial|conic)-gradient\(/i.test( layer ) );
		const apply = map.get( '--lieve-gradient-apply' )?.value || ( gradient && gradient === overlay ? 'overlay' : gradient && values[ 'background-clip' ] === 'text' ? 'text' : '' );
		if ( [ 'background', 'text', 'overlay' ].includes( apply ) ) { values[ 'gradient-apply' ] = apply; }
		if ( /^\d+$/.test( map.get( '--lieve-gradient-count' )?.value || '' ) ) { values[ 'gradient-count' ] = String( Math.max( 2, Math.min( 100, Number( map.get( '--lieve-gradient-count' ).value ) ) ) ); }
		if ( gradient ) {
			const match = gradient.match( /^(linear|radial|conic)-gradient\((.*)\)$/is ); const args = split( match[ 2 ], ',' ); values[ 'gradient-type' ] = match[ 1 ].toLowerCase();
			if ( /^(?:[-+.\d]+(?:deg|turn|rad)|to\s|circle|ellipse|at\s|from\s)/i.test( args[ 0 ] ) ) {
				const prefix = args.shift(); const angle = prefix.match( /(?:from\s+)?([-+.\d]+(?:deg|turn|rad))/i ); const position = prefix.match( /\bat\s+(.+)$/i ); if ( angle ) { values[ 'gradient-angle' ] = angle[ 1 ]; } if ( position ) { values[ 'gradient-position' ] = position[ 1 ]; }
			}
			// Keep empty repeater rows without storing a second copy of their CSS values.
			const indices = ( map.get( '--lieve-gradient-stop-indices' )?.value || '' ).split( /\s+/ ).map( Number );
			const sparse = indices.length === args.length && indices.every( ( n, i ) => Number.isInteger( n ) && n >= 1 && n <= 100 && ( ! i || n > indices[ i - 1 ] ) );
			args.slice( 0, 100 ).forEach( ( stop, index ) => { const number = sparse ? indices[ index ] : index + 1; const parts = words( stop ); const offset = parts.length > 1 && /^(?:[-+.\d]+%|(?:var|calc|min|max|clamp)\()/i.test( parts.at( -1 ) ) ? parts.pop() : ''; values[ 'gradient-color-' + number ] = parts.join( ' ' ); if ( offset ) { values[ 'gradient-stop-' + number ] = offset.endsWith( '%' ) ? offset.slice( 0, -1 ) : offset; } } );
		} else if ( [ 'none', 'inherit', 'initial', 'unset', 'revert' ].includes( map.get( 'background-image' )?.value ) ) { values[ 'gradient-type' ] = map.get( 'background-image' ).value; }
		return values;
	}
	function transformParts( value ) {
		const parts = []; let start = 0; let depth = 0;
		for ( let i = 0; i < value.length; i++ ) { if ( value[ i ] === '(' ) { depth++; } else if ( value[ i ] === ')' && --depth === 0 ) { const raw = value.slice( start, i + 1 ).trim(); const match = raw.match( /^([A-Za-z0-9]+)\((.*)\)$/s ); if ( match ) { const args = split( match[ 2 ], ',' ); const name = match[ 1 ]; if ( [ 'translate', 'scale', 'skew', 'translate3d', 'scale3d' ].includes( name ) ) { const base = name.replace( '3d', '' ); [ 'X', 'Y', 'Z' ].slice( 0, name.endsWith( '3d' ) ? 3 : 2 ).forEach( ( axis, index ) => { parts.push( { name: base + axis, value: args[ index ] || ( base === 'scale' ? args[ 0 ] : '0' ) } ); } ); } else { parts.push( { name: name === 'rotate' ? 'rotateZ' : name, value: match[ 2 ] } ); } } start = i + 1; } }
		return parts;
	}
	function context( item, device, state, breakpoints ) {
		const base = breakpoints.find( bp => bp.base )?.id; const key = stateName( state );
		if ( device === base ) { const value = key === 'normal' ? item.value || '' : item.states?.[ key ] || ''; const override = key === 'normal' ? item.values?.[ device ] || '' : item.responsiveStates?.[ device ]?.[ key ] || ''; return override ? join( [ value, override ] ) : value; }
		return key === 'normal' ? item.values?.[ device ] || '' : item.responsiveStates?.[ device ]?.[ key ] || '';
	}
	function setContext( item, device, state, breakpoints, css ) {
		const base = breakpoints.find( bp => bp.base )?.id; const key = stateName( state ); item.values ||= {}; item.states ||= {}; item.responsiveStates ||= {};
		if ( device === base ) {
			if ( key === 'normal' ) { item.value = css; delete item.values[ device ]; } else { if ( css ) { item.states[ key ] = css; } else { delete item.states[ key ]; } if ( item.responsiveStates[ device ] ) { delete item.responsiveStates[ device ][ key ]; } }
		} else if ( key === 'normal' ) { if ( css ) { item.values[ device ] = css; } else { delete item.values[ device ]; } }
		else { if ( ! item.responsiveStates[ device ] || Array.isArray( item.responsiveStates[ device ] ) ) { item.responsiveStates[ device ] = {}; } if ( css ) { item.responsiveStates[ device ][ key ] = css; } else { delete item.responsiveStates[ device ][ key ]; } }
		for ( const id of Object.keys( item.responsiveStates ) ) { if ( ! Object.keys( item.responsiveStates[ id ] ).length ) { delete item.responsiveStates[ id ]; } }
	}
	function effectiveCss( item, device, state, breakpoints ) {
		const cascade = window.LieveResponsive.cascade( breakpoints, device ); const key = stateName( state );
		const states = [ 'before', 'after' ].includes( key ) ? [ key ] : key === 'normal' ? [ 'normal' ] : [ 'normal', key ];
		return join( states.flatMap( name => cascade.map( bp => context( item, bp.id, name, breakpoints ) ) ) );
	}
	function write( item, device, state, breakpoints, property, input, gradientRows = null ) {
		let value = String( input ).trim(); const raw = context( item, device, state, breakpoints );
		if ( property === 'custom-css' ) { if ( M.declarations( value ) === false ) { throw new Error( 'Use CSS declarations only, without selectors or braces.' ); } setContext( item, device, state, breakpoints, value ); return; }
		let entries = parse( raw ); let mapped = property;
		if ( /^(translate|rotate|scale|skew)[XYZ]$/.test( property ) ) {
			mapped = 'transform'; const current = read( raw ).transform || read( effectiveCss( item, device, state, breakpoints ) ).transform || '';
			const parts = transformParts( current ); const index = parts.findIndex( part => part.name === property ); const replacement = { name: property, value: /^[-+.\d]+$/.test( value ) && /^(rotate|skew)/.test( property ) ? value + 'deg' : value };
			const next = parts.flatMap( ( part, position ) => part.name !== property ? [ part ] : value && position === index ? [ replacement ] : [] ); if ( value && index < 0 ) { next.push( replacement ); } value = next.map( part => part.name + '(' + part.value + ')' ).join( ' ' );
		} else if ( property.startsWith( 'gradient-' ) ) {
			mapped = 'background-image'; const inheritedCss = effectiveCss( item, device, state, breakpoints ); const current = read( raw ); const inherited = read( inheritedCss ); const fields = { ...inherited, ...current }; if ( value ) { fields[ property ] = value; } else { delete fields[ property ]; }
			if ( gradientRows ) {
				Object.keys( fields ).filter( key => /^gradient-(?:color|stop)-/.test( key ) ).forEach( key => delete fields[ key ] );
				gradientRows.forEach( ( row, i ) => { if ( row.color ) { fields[ 'gradient-color-' + ( i + 1 ) ] = row.color; } if ( row.stop ) { fields[ 'gradient-stop-' + ( i + 1 ) ] = row.stop; } } );
			}
			const layers = split( winners( parse( raw ) ).get( mapped )?.value || winners( parse( inheritedCss ) ).get( mapped )?.value || '', ',' ); const index = layers.findIndex( layer => /^(linear|radial|conic)-gradient\(/i.test( layer ) ); const type = fields[ 'gradient-type' ];
			const apply = fields[ 'gradient-apply' ] || 'background';
			if ( ! [ 'background', 'text', 'overlay' ].includes( apply ) || ( apply === 'overlay' && [ 'before', 'after' ].includes( state ) ) ) { throw new Error( 'Choose Background, Text or Overlay. Pseudo-elements cannot contain an overlay.' ); }
			const count = fields[ 'gradient-count' ] ? Math.max( 2, Math.min( 100, Number( fields[ 'gradient-count' ] ) || 2 ) ) : Math.min( 100, Math.max( 2, ...Object.keys( fields ).map( key => Number( key.match( /^gradient-(?:color|stop)-(\d+)$/ )?.[ 1 ] ) || 0 ) ) );
			let gradient = ''; let enabled = false; const indices = [];
			if ( [ 'inherit', 'initial', 'unset', 'revert' ].includes( type ) ) { value = type; }
			else if ( type ) {
				const stops = []; for ( let i = 1; i <= count; i++ ) { if ( fields[ 'gradient-color-' + i ] ) { const stop = fields[ 'gradient-stop-' + i ]; stops.push( fields[ 'gradient-color-' + i ] + ( stop !== undefined ? ' ' + ( /^[-+.\d]+$/.test( stop ) ? stop + '%' : stop ) : '' ) ); indices.push( i ); } }
				const angle = fields[ 'gradient-angle' ] || '180deg'; const position = fields[ 'gradient-position' ] || '50% 50%'; const degrees = /^[-+.\d]+$/.test( angle ) ? angle + 'deg' : angle;
				if ( type !== 'none' && stops.length >= 2 ) { gradient = type + '-gradient(' + ( type === 'linear' ? degrees : type === 'radial' ? 'circle at ' + position : 'from ' + degrees + ' at ' + position ) + ', ' + stops.join( ', ' ) + ')'; enabled = true; }
				else if ( value && property === 'gradient-type' && type !== 'none' ) { gradient = type + '-gradient(' + ( type === 'linear' ? '180deg' : type === 'radial' ? 'circle at 50% 50%' : 'from 180deg at 50% 50%' ) + ', currentColor, transparent)'; enabled = true; indices.splice( 0, indices.length, 1, 2 ); }
			}
			if ( ! [ 'inherit', 'initial', 'unset', 'revert' ].includes( type ) ) { if ( index >= 0 ) { layers.splice( index, 1, ...( gradient && apply !== 'overlay' ? [ gradient ] : [] ) ); } else if ( gradient && apply !== 'overlay' ) { layers.unshift( gradient ); } value = layers.filter( layer => ! [ 'none', 'inherit', 'initial', 'unset', 'revert' ].includes( layer ) ).join( ', ' ) || ( type === 'none' || apply === 'overlay' ? 'none' : '' ); }
			const managed = [ '--lieve-gradient-count', '--lieve-gradient-stop-indices', '--lieve-gradient-apply', '--lieve-gradient-overlay-image', '--lieve-gradient-overlay-content' ];
			if ( fields[ 'gradient-apply' ] || current[ 'gradient-apply' ] || inherited[ 'gradient-apply' ] ) {
				managed.push( 'background-clip', '-webkit-background-clip', '-webkit-text-fill-color' );
				entries = entries.filter( entry => ! managed.includes( entry.property ) );
				const text = apply === 'text' && enabled;
				entries.push( ...parse( '--lieve-gradient-apply:' + apply + ';background-clip:' + ( text ? 'text' : 'border-box' ) + ';-webkit-background-clip:' + ( text ? 'text' : 'border-box' ) + ';-webkit-text-fill-color:' + ( text ? 'transparent' : 'currentColor' ) + ';--lieve-gradient-overlay-image:' + ( apply === 'overlay' && enabled ? gradient : 'none' ) + ';--lieve-gradient-overlay-content:' + ( apply === 'overlay' && enabled ? '""' : 'none' ) + ';' ) );
			} else { entries = entries.filter( entry => ! [ '--lieve-gradient-count', '--lieve-gradient-stop-indices' ].includes( entry.property ) ); }
			entries.push( { property: '--lieve-gradient-count', value: String( count ), priority: false } );
			if ( enabled ) { entries.push( { property: '--lieve-gradient-stop-indices', value: indices.join( ' ' ), priority: false } ); }
		} else if ( property === 'background-image' ) {
			const layers = split( winners( parse( raw ) ).get( 'background-image' )?.value || winners( parse( effectiveCss( item, device, state, breakpoints ) ) ).get( 'background-image' )?.value || '', ',' ); const index = layers.findIndex( layer => /^url\(/i.test( layer ) );
			if ( value && ( ! /^(https?:\/\/|\/[^/])/i.test( value ) || /["'\\\r\n]/.test( value ) ) ) { throw new Error( 'Use an HTTP(S) or root-relative image URL.' ); } const image = value ? 'url("' + value + '")' : ''; if ( index >= 0 ) { layers.splice( index, 1, ...( image ? [ image ] : [] ) ); } else if ( image ) { layers.push( image ); } value = layers.filter( layer => ! [ 'none', 'inherit', 'initial', 'unset', 'revert' ].includes( layer ) ).join( ', ' );
		} else if ( property === 'content' && value ) { value = /^(["']).*\1$/s.test( value ) || /^(none|normal|var\()/i.test( value ) ? value : JSON.stringify( value ); }
		if ( value && ( M.declarations( mapped + ':' + value + ';' ) === false || parse( mapped + ':' + value + ';' ).length !== 1 || ( window.CSS?.supports && ! window.CSS.supports( mapped, plain( value ) ) ) ) ) { throw new Error( 'Enter a valid CSS value.' ); }
		// Expand only shorthands affected by this change. Keep unrelated syntax and
		// unknown declarations intact; clearing a longhand really removes it.
		entries = entries.flatMap( entry => shorthand[ entry.property ]?.includes( mapped ) ? expand( entry ) : [ entry ] );
		const winner = winners( entries ).get( mapped );
		// An unresolved important shorthand still controls every affected side.
		// Carry its priority into the explicit override so the visible edit applies.
		const priority = important( value ) || winner?.priority || entries.some( entry => entry.priority && shorthand[ entry.property ]?.includes( mapped ) );
		entries = entries.filter( entry => entry.property !== mapped ); if ( value ) { entries.push( { property: mapped, value: plain( value ), priority } ); }
		const css = serialize( entries ); if ( M.declarations( css ) === false ) { throw new Error( 'The CSS declaration list is invalid or too long.' ); } setContext( item, device, state, breakpoints, css );
	}
	function writeGradientRows( item, device, state, breakpoints, rows ) {
		if ( ! Array.isArray( rows ) || rows.length < 2 || rows.length > 100 ) { throw new Error( 'Use between 2 and 100 gradient colors.' ); }
		write( item, device, state, breakpoints, 'gradient-count', String( rows.length ), rows );
	}
	function preview( item, nodeId, device, state, breakpoints ) {
		const key = stateName( state ); if ( key === 'normal' || ! item.enabled || ! /^[A-Za-z0-9_-]+$/.test( nodeId || '' ) ) { return ''; }
		const rules = parse( join( window.LieveResponsive.cascade( breakpoints, device ).map( bp => context( item, bp.id, key, breakpoints ) ) ) );
		const suffix = [ 'before', 'after' ].includes( key ) ? '::' + key : ':is(:' + key + ',:not(:' + key + '))';
		const selector = '#lieve-canvas :is(' + [ item.name, ...item.aliases ].map( name => '.' + name ).join( ',' ) + ')[data-editor-root="' + nodeId + '"]' + suffix; const raw = serialize( rules ); const css = window.LieveStyles?.dimensionCss?.( raw ) || raw;
		return rules.length ? selector + '{' + css + '}' + ( ! [ 'before', 'after' ].includes( key ) ? window.LieveStyles?.overlayCss( selector, css ) || '' : '' ) : '';
	}
	window.LieveClassStyles = { parse, serialize, read, context, setContext, effectiveCss, write, writeGradientRows, preview };
}() );
