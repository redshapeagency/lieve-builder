/* Lieve-owned, versioned animation data. No executable engine configuration. */
( function( root, factory ) {
	'use strict';
	if ( typeof module === 'object' && module.exports ) { module.exports = factory( require( '../../inc/builder/motion-catalog.json' ) ); }
	else { root.LieveMotion = factory( root.LieveMotionCatalog ); }
}( typeof window !== 'undefined' ? window : this, function( catalog ) {
	'use strict';
	const copy = value => JSON.parse( JSON.stringify( value ) );
	const plain = value => value && typeof value === 'object' && ! Array.isArray( value );
	const map = value => plain( value ) || Array.isArray( value ) && ! value.length;
	const validId = value => typeof value === 'string' && /^l[ms]_[a-f0-9]{12,24}$/.test( value );
	const id = ( kind = 'm' ) => 'l' + kind + '_' + ( typeof crypto !== 'undefined' && crypto.getRandomValues ? Array.from( crypto.getRandomValues( new Uint8Array( 10 ) ), n => n.toString( 16 ).padStart( 2, '0' ) ).join( '' ) : ( Date.now().toString( 16 ) + Math.random().toString( 16 ).slice( 2 ) ).slice( 0, 20 ) );
	const nameOK = value => typeof value === 'string' && [ ...value ].length <= 120 && ! /[<>\x00-\x1f\x7f]/.test( value );
	const numberOK = ( value, min, max ) => typeof value === 'number' && Number.isFinite( value ) && value >= min && value <= max;
	const deviceOK = value => /^(desktop|tablet|mobile|bp_[a-z0-9]{8,24})$/.test( value );
	function valueOK( key, value ) {
		if ( ! Object.hasOwn( catalog.properties, key ) ) { return false; } const spec = catalog.properties[ key ];
		if ( spec.type === 'number' ) { return numberOK( value, spec.min, spec.max ); }
		if ( typeof value !== 'string' || ! value.trim() || value.length > 150 ) { return false; }
		if ( spec.type === 'length' ) { return /^(?:\d+(?:\.\d+)?(?:px|em|rem|%|vw|vh)?|var\(--[A-Za-z_][\w-]*\))$/.test( value ); }
		return /^(?:#[a-f0-9]{3,8}|[a-z]+|(?:rgb|rgba|hsl|hsla)\([\d\s.,%/+-]+\)|var\(--[A-Za-z_][\w-]*\))$/i.test( value );
	}
	function valueErrors( values, prefix, errors ) {
		if ( ! map( values ) || Object.keys( values ).length > Object.keys( catalog.properties ).length ) { errors[ prefix ] = 'Use supported animation properties.'; return; }
		Object.entries( values ).forEach( ( [ key, value ] ) => { if ( ! valueOK( key, value ) ) { errors[ prefix + '.' + key ] = 'Enter a valid ' + ( catalog.properties[ key ]?.label || 'animation property' ) + '.'; } } );
	}
	function errors( row ) {
		const out = {};
		if ( ! plain( row ) || row.version !== 1 || ! validId( row.id ) || ! row.id.startsWith( 'lm_' ) ) { return { timeline: 'Invalid Motion timeline or version.' }; }
		if ( ! nameOK( row.name ) ) { out.name = 'Use a plain-text timeline name, up to 120 characters.'; }
		if ( typeof row.enabled !== 'boolean' || typeof row.yoyo !== 'boolean' || ! [ 'skip', 'finish' ].includes( row.reduced ) || ! Object.hasOwn( catalog.triggers, row.trigger ) ) { out.settings = 'Choose valid timeline settings.'; }
		if ( ! Number.isInteger( row.repeat ) || ! numberOK( row.repeat, -1, 100 ) ) { out.repeat = 'Repeat must be a whole number from -1 to 100.'; }
		for ( const key of [ 'minWidth', 'maxWidth' ] ) { if ( row[ key ] !== '' && ( ! Number.isInteger( row[ key ] ) || ! numberOK( row[ key ], 0, 7680 ) ) ) { out[ key ] = 'Enter a whole viewport width from 0 to 7680, or leave blank.'; } }
		if ( row.minWidth !== '' && row.maxWidth !== '' && row.minWidth > row.maxWidth ) { out.maxWidth = 'Maximum width must not be smaller than minimum width.'; }
		if ( ! numberOK( row.scrollStart, 0, 100 ) || ! numberOK( row.scrollEnd, 0, 100 ) || row.scrollStart <= row.scrollEnd ) { out.scrollEnd = 'Scroll start must be greater than scroll end (viewport %).'; }
		if ( ! Array.isArray( row.steps ) || ! row.steps.length || row.steps.length > catalog.stepLimit ) { out.steps = 'Use between 1 and ' + catalog.stepLimit + ' animation steps.'; return out; }
		const used = new Set();
		row.steps.forEach( step => {
			if ( ! plain( step ) || ! validId( step.id ) || ! step.id.startsWith( 'ls_' ) || used.has( step.id ) ) { out.steps = 'Each animation step needs a unique ID.'; return; } used.add( step.id );
			const prefix = step.id + '.';
			if ( ! nameOK( step.name ) || ! [ 'self', 'children', 'element' ].includes( step.target ) || typeof step.selector !== 'string' || step.selector.length > 300 || /[<>\x00-\x1f\x7f]/.test( step.selector ) || step.target !== 'self' && ! step.selector.trim() || step.target === 'element' && ! /^[\w-]{1,220}$/.test( step.selector ) ) { out[ prefix + 'target' ] = 'Choose an element or a valid child selector.'; }
			if ( ! Object.hasOwn( catalog.eases, step.ease ) ) { out[ prefix + 'ease' ] = 'Choose a supported easing.'; }
			const timing = ( values, pre ) => { for ( const [ key, min, max ] of [ [ 'start', 0, 300 ], [ 'duration', .01, 120 ], [ 'stagger', 0, 10 ] ] ) { if ( Object.hasOwn( values, key ) && ! numberOK( values[ key ], min, max ) ) { out[ pre + key ] = 'Enter ' + key + ' between ' + min + ' and ' + max + ' seconds.'; } } };
			for ( const key of [ 'start', 'duration', 'stagger' ] ) { if ( ! Object.hasOwn( step, key ) ) { out[ prefix + key ] = 'Enter animation timing.'; } } timing( step, prefix );
			valueErrors( step.from, prefix + 'from', out ); valueErrors( step.to, prefix + 'to', out );
			if ( ! Object.keys( step.to || {} ).length ) { out[ prefix + 'to' ] = 'Add at least one destination property.'; }
			if ( ! map( step.overrides ) || Object.keys( step.overrides ).length > 40 ) { out[ prefix + 'overrides' ] = 'Invalid responsive animation overrides.'; return; }
			Object.entries( step.overrides ).forEach( ( [ device, values ] ) => {
				const pre = prefix + device + '.';
				if ( ! deviceOK( device ) || ! map( values ) || Object.keys( values ).some( key => ! [ 'start', 'duration', 'stagger', 'from', 'to' ].includes( key ) ) ) { out[ pre ] = 'Invalid responsive animation override.'; return; }
				timing( values, pre ); for ( const key of [ 'from', 'to' ] ) { if ( values[ key ] !== undefined ) { valueErrors( values[ key ], pre + key, out ); } }
			} );
		} ); return out;
	}
	function step( preset = 'rise' ) { return { id: id( 's' ), name: preset === 'fade' ? 'Fade in' : 'Rise in', target: 'self', selector: '', start: 0, duration: .6, stagger: 0, ease: 'power2.out', from: { opacity: 0, ...( preset === 'rise' ? { y: 24 } : {} ) }, to: { opacity: 1, ...( preset === 'rise' ? { y: 0 } : {} ) }, overrides: {} }; }
	function create() { return { version: 1, id: id(), name: 'New timeline', enabled: true, trigger: 'load', repeat: 0, yoyo: false, reduced: 'skip', minWidth: '', maxWidth: '', scrollStart: 90, scrollEnd: 10, steps: [ step() ] }; }
	function cascade( breakpoints, width, device = null ) {
		const base = breakpoints.find( bp => bp.base ); if ( ! base ) { return []; }
		const selected = device ? breakpoints.find( bp => bp.id === device ) : null;
		if ( selected?.base ) { return []; } const target = selected ? selected.width : width;
		return breakpoints.filter( bp => ! bp.base && ( target > base.width ? bp.width > base.width && bp.width <= target : bp.width < base.width && bp.width >= target ) ).sort( ( a, b ) => target > base.width ? a.width - b.width : b.width - a.width );
	}
	function effective( step, breakpoints, width, device = null ) {
		const result = { ...step, from: { ...step.from }, to: { ...step.to } };
		cascade( breakpoints, width, device ).forEach( bp => { const values = step.overrides?.[ bp.id ]; if ( ! values ) { return; } for ( const key of [ 'start', 'duration', 'stagger' ] ) { if ( values[ key ] !== undefined ) { result[ key ] = values[ key ]; } } for ( const key of [ 'from', 'to' ] ) { Object.assign( result[ key ], values[ key ] || {} ); } } ); return result;
	}
	function cloneRows( rows, elements = new Map(), timelineIds = new Map() ) { return copy( rows ).map( row => { row.id = timelineIds.get( row.id ) || id(); row.steps.forEach( item => { item.id = id( 's' ); if ( item.target === 'element' && elements.has( item.selector ) ) { item.selector = elements.get( item.selector ); } } ); return row; } ); }
	return { catalog, copy, id, errors, create, step, valueOK, effective, cascade, cloneRows };
} ) );
