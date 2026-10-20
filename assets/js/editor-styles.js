/* Shared editor style model. Every declaration is opt-in and server-validated. */
( function () {
	'use strict';
	/** Mirrors PHP's lossless encoding, including UUIDs larger than JS safe integers. */
	function elementNumber( id ) {
		id = String( id ).replace( /[^a-zA-Z0-9_-]/g, '' ).slice( 0, 64 );
		const hex = id.match( /^lv-([a-f0-9]{8}|[a-f0-9]{16})$/ );
		if ( hex ) {
			let decimal = '0';
			for ( const digit of hex[ 1 ] ) {
				let carry = parseInt( digit, 16 ), next = '';
				for ( let index = decimal.length - 1; index >= 0; index-- ) { const value = Number( decimal[ index ] ) * 16 + carry; next = ( value % 10 ) + next; carry = Math.floor( value / 10 ); }
				decimal = ( carry ? String( carry ) : '' ) + next;
			}
			return '1' + String( hex[ 1 ].length ).padStart( 2, '0' ) + ( decimal.replace( /^0+/, '' ) || '0' );
		}
		return '2' + Array.from( id, char => String( char.charCodeAt( 0 ) ).padStart( 3, '0' ) ).join( '' );
	}
	function elementHtmlId( node ) { return node.props?.htmlId || 'lieve-' + elementNumber( node.id ); }
	function elementDataId( node ) { return node.props?.dataLieveId || 'lieve-data-' + elementNumber( node.id ); }
	const legacy = { backgroundColor: 'background-color', color: 'color', paddingTop: 'padding-top', paddingRight: 'padding-right', paddingBottom: 'padding-bottom', paddingLeft: 'padding-left', marginTop: 'margin-top', marginBottom: 'margin-bottom', borderRadius: 'border-radius', fontSize: 'font-size', maxWidth: 'max-width', minHeight: 'min-height', gap: 'gap', textAlign: 'text-align', fontWeight: 'font-weight', alignItems: 'align-items', justifyContent: 'justify-content' };
	let schema = {};
	let breakpoints = null;
	let variableNames = new Set();
	const dimensionUnits = 'px % rem em vh vw dvh svh vmin vmax ch'.split( ' ' );
	function configureVariables( items ) { variableNames = new Set( ( items || [] ).flatMap( item => [ item.name, ...( item.aliases || [] ) ] ) ); }
	function dimensionParts( input ) {
		const text = String( input ?? '' ).trim();
		const variable = text.match( /^var\(--lieve-dimension--([A-Za-z_][A-Za-z0-9_-]*),\s*calc\(var\(--\1\)\s*\*\s*1(px|%|rem|em|vh|vw|dvh|svh|vmin|vmax|ch)\)\)$/ );
		if ( variable ) { return { value: 'var(--' + variable[ 1 ] + ')', unit: variable[ 2 ] }; }
		const match = text.match( /^([-+]?(?:\d+\.?\d*|\.\d+))(px|%|rem|em|vh|vw|dvh|svh|vmin|vmax|ch|fr)?$/i );
		return { value: match ? match[ 1 ] : String( input ?? '' ), unit: match?.[ 2 ]?.toLowerCase() || '' };
	}
	function dimensionValue( input, unit = 'px' ) {
		const value = dimensionParts( input ).value.trim(); const match = value.match( /^var\(\s*--([A-Za-z_][A-Za-z0-9_-]*)\s*\)$/ );
		return match && variableNames.has( match[ 1 ] ) && dimensionUnits.includes( unit ) ? 'var(--lieve-dimension--' + match[ 1 ] + ',calc(var(--' + match[ 1 ] + ') * 1' + unit + '))' : String( input ?? '' );
	}
	function dimensionCss( css ) { return String( css ).replace( /(^|;)\s*([a-z-]+)\s*:\s*(var\(\s*--[A-Za-z_][A-Za-z0-9_-]*\s*\))(\s*!important)?(?=;|$)/gi, ( original, separator, property, value, priority = '' ) => { const next = styleField( property.toLowerCase() )?.type === 'dimension' ? dimensionValue( value ) : value; return next === value ? original : separator + property + ':' + next + priority; } ); }
	function configureBreakpoints( items ) { breakpoints = window.LieveResponsive?.normalize( items ) || null; }
	function devices( device ) {
		if ( breakpoints ) { return window.LieveResponsive.cascade( breakpoints, device ).map( item => item.id ); }
		const defaults = [ 'desktop', 'tablet', 'mobile' ]; return defaults.slice( 0, defaults.indexOf( device ) + 1 );
	}
	function configure( definitions ) { schema = definitions || {}; }
	function styleField( property ) { const match = property.match( /^gradient-(color|stop)-([1-9][0-9]{0,2})$/ ); return schema[ property ] || ( match && Number( match[ 2 ] ) <= 100 ? schema[ 'gradient-' + match[ 1 ] + '-1' ] : null ); }
	function safeValue( property, input ) {
		const definition = styleField( property ); if ( ! definition || input === undefined || input === null || typeof input === 'object' ) { return ''; }
		const field = definition;
		let value = String( input ).trim(); if ( ! value || value.length > ( property === 'custom-css' ? 6000 : 1200 ) ) { return ''; }
		const binding = window.LieveDynamicData?.parse( value );
		if ( binding ) { return window.LieveDynamicData.accepts( binding, window.LieveDynamicData.styleKind( property, field ) ) ? value : ''; }
		if ( property === 'gradient-count' ) { return /^\d+$/.test( value ) ? String( Math.max( 2, Math.min( 100, Number( value ) ) ) ) : ''; }
		if ( field.type === 'image' ) { return /^(https?:\/\/|\/[^/])/i.test( value ) && ! /[<>"\\\r\n]/.test( value ) ? value : ''; }
		if ( field.type === 'content' ) { return value.replace( /<[^>]*>/g, '' ).slice( 0, 500 ); }
		if ( property === 'custom-css' ) { return customDeclarations( value ); }
		if ( field.type === 'select' ) { return Object.prototype.hasOwnProperty.call( field.options, value ) ? value : ''; }
		if ( field.type === 'number' ) {
			if ( ! /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test( value ) ) {
				if ( ! /^(?:var|calc|min|max|clamp)\(/i.test( value ) ) { return ''; }
			} else {
				let number = Math.max( -1000000, Math.min( 1000000, Number( value ) ) );
				if ( property === 'opacity' ) { number = Math.max( 0, Math.min( 1, number ) ); }
				if ( property.startsWith( 'gradient-stop-' ) ) { number = Math.max( 0, Math.min( 100, number ) ); }
				return String( number );
			}
		}
		if ( /[;{}<>@\\]|\/\*|\*\/|[\x00-\x1f]|(?:expression|url|attr)\s*\(/i.test( value ) ) { return ''; }
		const allowed = [ 'var', 'calc', 'min', 'max', 'clamp', 'repeat', 'minmax', 'fit-content', 'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix', 'linear-gradient', 'radial-gradient', 'conic-gradient', 'translate', 'translatex', 'translatey', 'translatez', 'translate3d', 'rotate', 'rotatex', 'rotatey', 'rotatez', 'rotate3d', 'scale', 'scalex', 'scaley', 'scalez', 'scale3d', 'skew', 'skewx', 'skewy', 'matrix', 'matrix3d', 'perspective', 'blur', 'brightness', 'contrast', 'drop-shadow', 'grayscale', 'hue-rotate', 'invert', 'opacity', 'saturate', 'sepia', 'polygon', 'circle', 'ellipse', 'inset', 'cubic-bezier', 'steps' ];
		for ( const match of value.matchAll( /([a-zA-Z][a-zA-Z0-9-]*)\s*\(/g ) ) { if ( ! allowed.includes( match[ 1 ].toLowerCase() ) ) { return ''; } }
		if ( field.type === 'dimension' && /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test( value ) ) { value += 'px'; }
		return value;
	}
	function customDeclarations( value ) {
		if ( /[{}<>@\\]|\/\*|\*\//.test( value ) ) { return ''; }
		return value.split( ';' ).slice( 0, 80 ).map( ( declaration ) => {
			const index = declaration.indexOf( ':' ); if ( index < 0 ) { return ''; }
			const property = declaration.slice( 0, index ).trim(); const raw = declaration.slice( index + 1 ).trim();
			if ( [ 'custom-css', 'content', 'background-image' ].includes( property ) || property.startsWith( 'gradient-' ) ) { return ''; }
			const clean = safeValue( /^--[a-zA-Z0-9_-]{1,64}$/.test( property ) ? 'color' : property, raw );
			return clean ? property + ':' + clean : '';
		} ).filter( Boolean ).join( ';' );
	}
	function legacyValues( node ) {
		const props = node.props || {}; const values = {};
		Object.entries( legacy ).forEach( ( [ key, property ] ) => { if ( props[ key ] !== undefined && props[ key ] !== '' ) { values[ property ] = safeValue( property, props[ key ] ); } } );
		if ( props.direction ) { values.display = 'flex'; values[ 'flex-direction' ] = props.direction; }
		if ( node.type === 'image' && props.width !== undefined ) { values.width = props.width + '%'; }
		if ( node.type === 'spacer' && props.height !== undefined ) { values.height = props.height + 'px'; }
		return values;
	}
	function htmlHasWrapper( node ) {
		const props = node.props || {};
		if ( props.wrapHtml !== undefined ) { return Boolean( props.wrapHtml ); }
		return Boolean( Object.keys( props.styles || {} ).length || props.className || props.classIds?.length || Object.keys( props.attributes || {} ).length || Object.keys( legacyValues( node ) ).length );
	}
	function migrate( node ) {
		const values = legacyValues( node ); const current = node.props.styles?.root?.desktop?.normal || {};
		if ( Object.keys( values ).length ) { node.props.styles ||= {}; node.props.styles.root ||= {}; node.props.styles.root.desktop ||= {}; node.props.styles.root.desktop.normal = { ...values, ...current }; }
		Object.keys( legacy ).forEach( ( key ) => delete node.props[ key ] ); delete node.props.direction;
		if ( node.type === 'image' ) { delete node.props.width; } if ( node.type === 'spacer' ) { delete node.props.height; }
	}
	function ownValues( node, target, device, state ) { return node.props.styles?.[ target ]?.[ device ]?.[ state ] || {}; }
	function effectiveValues( node, target, device, state, origins = null ) {
		const states = [ 'hover', 'focus', 'active' ].includes( state ) ? [ 'normal', state ] : [ state ];
		const sizes = devices( device );
		const values = target === 'root' && states.includes( 'normal' ) && sizes.includes( 'desktop' ) ? legacyValues( node ) : {};
		if ( origins ) { Object.keys( values ).forEach( key => { origins[ key ] = { device: 'desktop', state: 'normal' }; } ); }
		for ( const context of states ) { for ( const size of sizes ) {
			const current = ownValues( node, target, size, context );
			if ( current[ 'gradient-local-stops' ] === '1' ) { Object.keys( values ).filter( key => /^gradient-(?:color|stop)-\d+$/.test( key ) ).forEach( key => { delete values[ key ]; if ( origins ) { delete origins[ key ]; } } ); }
			Object.assign( values, current );
			if ( origins ) { Object.keys( current ).forEach( key => { origins[ key ] = { device: size, state: context }; } ); }
		} }
		return values;
	}
	function valueOrigins( node, target, device, state ) { const origins = {}; effectiveValues( node, target, device, state, origins ); return origins; }
	function contextValues( node, target, device, state ) {
		const values = { ...ownValues( node, target, device, state ) };
		const keys = Object.keys( values );
		const gradient = keys.some( ( key ) => key.startsWith( 'gradient-' ) || key === 'background-image' );
		const transform = keys.some( ( key ) => /^(translate|rotate|scale|skew)[XYZ]$/.test( key ) );
		Object.entries( effectiveValues( node, target, device, state ) ).forEach( ( [ key, value ] ) => {
			if ( ( gradient && ( key.startsWith( 'gradient-' ) || key === 'background-image' ) ) || ( transform && /^(translate|rotate|scale|skew)[XYZ]$/.test( key ) ) ) { values[ key ] = value; }
		} );
		return values;
	}
	function write( node, target, device, state, property, value ) {
		migrate( node ); node.props.styles ||= {}; node.props.styles[ target ] ||= {}; node.props.styles[ target ][ device ] ||= {}; node.props.styles[ target ][ device ][ state ] ||= {};
		if ( value === '' ) { delete node.props.styles[ target ][ device ][ state ][ property ]; }
		else { node.props.styles[ target ][ device ][ state ][ property ] = value; }
		prune( node );
	}
	function prune( node ) {
		function clean( object ) { Object.keys( object ).forEach( ( key ) => { if ( object[ key ] && typeof object[ key ] === 'object' ) { clean( object[ key ] ); if ( ! Object.keys( object[ key ] ).length ) { delete object[ key ]; } } } ); }
		if ( node.props.styles ) { clean( node.props.styles ); if ( ! Object.keys( node.props.styles ).length ) { if ( node.type === 'popup-shell' ) { node.props.styles = {}; } else { delete node.props.styles; } } }
	}
	const numericUnit = ( value, unit ) => /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test( String( value ) ) ? value + unit : value;
	function gradientCount( values ) {
		if ( /^\d+$/.test( String( values[ 'gradient-count' ] ?? '' ) ) ) { return Math.max( 2, Math.min( 100, Number( values[ 'gradient-count' ] ) ) ); }
		return Math.min( 100, Math.max( 2, ...Object.keys( values ).map( key => Number( key.match( /^gradient-(?:color|stop)-([1-9][0-9]{0,2})$/ )?.[ 1 ] ) || 0 ) ) );
	}
	function overlayCss( selector, css ) {
		if ( ! /(?:^|;)\s*--lieve-gradient-overlay-image\s*:\s*(?:linear|radial|conic)-gradient\(/i.test( css ) ) { return ''; }
		return ':where(' + selector + '){position:relative;isolation:isolate}' + selector + '::before{content:var(--lieve-gradient-overlay-content,none);position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;background-image:var(--lieve-gradient-overlay-image,none)}';
	}
	function declarations( raw ) {
		const values = {}; Object.entries( raw ).forEach( ( [ key, value ] ) => { const resolved = window.LieveDynamicData?.resolve( value, window.LieveDynamicData.styleKind( key, styleField( key ) ) ) ?? value; const clean = safeValue( key, resolved ); if ( clean && ! window.LieveDynamicData?.parse( clean ) ) { values[ key ] = clean; } } );
		const output = []; const transforms = {};
		Object.entries( values ).forEach( ( [ key, value ] ) => {
			if ( styleField( key )?.type === 'dimension' && ! dimensionParts( value ).unit ) { value = dimensionValue( value ); }
			if ( key === 'custom-css' ) { output.push( dimensionCss( value ) ); return; }
			if ( key.startsWith( 'gradient-' ) ) { return; }
			if ( /^(translate|rotate|scale|skew)[XYZ]$/.test( key ) ) { transforms[ key ] = key + '(' + numericUnit( value, /^(rotate|skew)/.test( key ) ? 'deg' : '' ) + ')'; return; }
			if ( key === 'background-image' ) { value = 'url("' + value.replace( /["\\\r\n]/g, '' ) + '")'; }
			if ( key === 'content' ) { value = JSON.stringify( value ); }
			output.push( key + ':' + value );
		} );
		if ( Object.keys( transforms ).length ) { output.push( 'transform:' + Object.keys( schema ).filter( ( key ) => transforms[ key ] ).map( ( key ) => transforms[ key ] ).join( ' ' ) ); }
		let gradient = ''; const stops = [];
		if ( [ 'inherit', 'initial', 'unset', 'revert', 'none' ].includes( values[ 'gradient-type' ] ) ) { gradient = values[ 'gradient-type' ]; }
		else if ( values[ 'gradient-type' ] ) {
			for ( let index = 1; index <= gradientCount( values ); index++ ) { if ( values[ 'gradient-color-' + index ] ) { stops.push( values[ 'gradient-color-' + index ] + ( values[ 'gradient-stop-' + index ] !== undefined ? ' ' + numericUnit( values[ 'gradient-stop-' + index ], '%' ) : '' ) ); } }
			const type = values[ 'gradient-type' ]; const angle = values[ 'gradient-angle' ] ?? 180; const position = values[ 'gradient-position' ] || '50% 50%';
			const prefix = type === 'linear' ? numericUnit( angle, 'deg' ) : type === 'radial' ? 'circle at ' + position : 'from ' + numericUnit( angle, 'deg' ) + ' at ' + position;
			if ( stops.length >= 2 ) { gradient = type + '-gradient(' + prefix + ',' + stops.join( ',' ) + ')'; }
		}
		const apply = values[ 'gradient-apply' ] || 'background'; const image = values[ 'background-image' ] ? 'url("' + values[ 'background-image' ].replace( /["\\]/g, '' ) + '")' : '';
		if ( gradient ) {
			const layer = gradient === 'none' ? image || 'none' : [ 'inherit', 'initial', 'unset', 'revert' ].includes( gradient ) ? gradient : gradient + ( image ? ',' + image : '' );
			output.push( 'background-image:' + ( apply === 'overlay' ? image || 'none' : layer ) );
		}
		if ( values[ 'gradient-apply' ] ) {
			const text = apply === 'text' && stops.length >= 2;
			output.push( '--lieve-gradient-apply:' + apply, 'background-clip:' + ( text ? 'text' : 'border-box' ), '-webkit-background-clip:' + ( text ? 'text' : 'border-box' ), '-webkit-text-fill-color:' + ( text ? 'transparent' : 'currentColor' ), '--lieve-gradient-overlay-image:' + ( apply === 'overlay' && stops.length >= 2 ? gradient : 'none' ), '--lieve-gradient-overlay-content:' + ( apply === 'overlay' && stops.length >= 2 ? '""' : 'none' ) );
		}
		return output.filter( Boolean ).join( ';' );
	}
	function editorCss( node, targets, device, previewState, templateKey = '' ) {
		if ( node.type === 'html' && ! htmlHasWrapper( node ) ) { return ''; }
		const scope = templateKey ? '[data-inherited-key="' + templateKey.replace( /[^a-zA-Z0-9_-]/g, '' ) + '"] [data-lieve-id="' + elementDataId( node ) : '[data-editor-root="' + node.id.replace( /[^a-zA-Z0-9_-]/g, '' );
		const root = '#lieve-canvas#lieve-canvas ' + scope + '"]'; let css = '';
		for ( const size of devices( device ) ) {
		Object.entries( targets || { root: { selector: '' } } ).forEach( ( [ target, definition ] ) => {
			const selector = root + definition.selector;
			for ( const state of [ 'normal', 'hover', 'focus', 'active', 'before', 'after' ] ) {
				let values = contextValues( node, target, size, state );
				if ( target === 'root' && size === 'desktop' && state === 'normal' ) { values = { ...legacyValues( node ), ...values }; }
				const rules = declarations( values ); if ( ! rules ) { continue; }
				// Force state previews only on the selected node, never on every canvas element.
				const forced = previewState === state && ! [ 'normal', 'before', 'after' ].includes( state );
				const pseudo = state === 'focus' ? 'focus-visible' : state;
				// An always-matching pseudo-class preserves frontend state specificity.
				const suffix = state === 'normal' ? '' : forced ? ':is(:' + pseudo + ',:not(:' + pseudo + '))' : ( [ 'before', 'after' ].includes( state ) ? '::' : ':' ) + pseudo;
				css += selector + suffix + '{' + rules + '}';
				if ( ! [ 'before', 'after' ].includes( state ) ) { css += overlayCss( selector + suffix, rules ); }
				if ( node.type === 'image' && target === 'root' && ! [ 'before', 'after' ].includes( state ) ) {
					let imageCss = [ 'width', 'max-width', 'height', 'max-height' ].some( ( key ) => values[ key ] !== undefined ) ? 'max-width:100%;height:auto' + ( values.width !== undefined ? ';width:100%' : '' ) : '';
					if ( values[ 'border-radius' ] !== undefined ) { imageCss += ';border-radius:inherit'; }
					if ( imageCss ) { css += selector + suffix + ' > img,' + selector + suffix + ' > a > img{' + imageCss.replace( /^;/, '' ) + '}'; }
				}
			}
		} );
		}
		return css;
	}
	window.LieveStyles = { elementNumber, elementHtmlId, elementDataId, configure, configureBreakpoints, configureVariables, dimensionParts, dimensionValue, dimensionCss, field: styleField, safeValue, gradientCount, overlayCss, customDeclarations, legacyValues, htmlHasWrapper, migrate, ownValues, effectiveValues, valueOrigins, contextValues, write, prune, declarations, editorCss, legacy };
}() );
