( function ( root, factory ) {
	'use strict';
	if ( typeof module === 'object' && module.exports ) { module.exports = factory( require( '../../inc/builder/interactions-catalog.json' ) ); }
	else { root.LieveInteractions = factory( root.LieveInteractionCatalog ); }
}( typeof window !== 'undefined' ? window : this, function ( catalog ) {
	'use strict';
	if ( ! catalog ) { return null; }
	const copy = value => JSON.parse( JSON.stringify( value ) );
	const plain = value => value && typeof value === 'object' && ! Array.isArray( value );
	const id = () => 'li_' + ( typeof crypto !== 'undefined' && crypto.getRandomValues ? Array.from( crypto.getRandomValues( new Uint8Array( 10 ) ), n => n.toString( 16 ).padStart( 2, '0' ) ).join( '' ) : ( Date.now().toString( 16 ) + Math.random().toString( 16 ).slice( 2 ) ).slice( 0, 20 ) );
	const condition = () => ( { kind: 'storage', storage: 'session', key: '', operator: 'exists', value: '' } );
	const operators = { exists: 'Exists', missing: 'Does not exist', equals: 'Equals', 'not-equals': 'Does not equal', contains: 'Contains', gt: 'Greater than', gte: 'At least', lt: 'Less than', lte: 'At most' };
	const defaults = () => Object.fromEntries( Object.entries( catalog.fields ).map( ( [ key, field ] ) => [ key, field.default ] ) );
	function create() { return { ...defaults(), id: id(), conditions: [] }; }
	function normalize( row ) {
		const result = defaults();
		if ( ! plain( row ) ) { return { ...result, conditions: [] }; }
		Object.entries( catalog.fields ).forEach( ( [ key, field ] ) => {
			if ( field.type === 'boolean' && typeof row[ key ] === 'boolean' ) { result[ key ] = row[ key ]; }
			else if ( field.type === 'number' && typeof row[ key ] === 'number' && Number.isFinite( row[ key ] ) ) { result[ key ] = Math.min( field.max, Math.max( field.min, row[ key ] ) ); }
			else if ( [ 'string', 'select' ].includes( field.type ) && typeof row[ key ] === 'string' ) { result[ key ] = Array.from( row[ key ] ).slice( 0, field.max || 2000 ).join( '' ); }
		} );
		result.conditions = Array.isArray( row.conditions ) ? copy( row.conditions.slice( 0, catalog.conditionLimit ).filter( plain ) ) : [];
		return result;
	}
	const safeAttribute = name => /^[a-z_][a-z0-9_.:-]{0,99}$/i.test( name ) && ! /^(on|data-(lieve-|editor-|wp-|id$))/i.test( name ) && ! [ 'id', 'class', 'style', 'srcdoc', 'src', 'href', 'action', 'formaction', 'xlink:href', 'srcset', 'poster', 'data', 'codebase' ].includes( name.toLowerCase() );
	const safeProperty = name => /^(--[a-zA-Z_][a-zA-Z0-9_-]*|[a-z][a-z-]*)$/.test( name ) && ! /^(behavior|-moz-binding)$/i.test( name );
	const safeValue = value => typeof value === 'string' && ! /[;{}<>@\\\u0000-\u001f]|\/\*|\*\/|(?:expression|url|attr)\s*\(/i.test( value );
	const safeURL = value => typeof value === 'string' && value.trim() !== '' && ! /[\u0000-\u0020\u007f\\]/.test( value ) && ( /^https?:\/\/[^/\s]+/i.test( value ) || /^[/#?]/.test( value ) && ! /^\/\//.test( value ) );
	const safePath = value => /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test( value ) && ! value.split( '.' ).some( key => [ '__proto__', 'prototype', 'constructor', 'eval', 'Function', 'setTimeout', 'setInterval', 'document', 'location', 'fetch', 'open' ].includes( key ) );
	function jsonError( value, action ) {
		try {
			const parsed = JSON.parse( value );
			if ( action === 'call' && ! Array.isArray( parsed ) ) { return 'Function arguments must be a JSON array.'; }
			let count = 0;
			const walk = ( item, depth ) => { if ( ++count > 1000 || depth > 16 ) { throw new Error(); } if ( typeof item === 'number' && ! Number.isFinite( item ) ) { throw new Error(); } if ( item && typeof item === 'object' ) { Object.entries( item ).forEach( ( [ key, next ] ) => { if ( [ '__proto__', 'constructor', 'prototype' ].includes( key ) ) { throw new Error(); } walk( next, depth + 1 ); } ); } };
			walk( parsed, 0 ); return '';
		} catch ( error ) { return 'Use valid JSON without unsafe keys, infinite numbers or excessive nesting.'; }
	}
	function errors( raw ) {
		const output = {}; const put = ( key, text ) => { output[ key ] ||= text; };
		if ( ! plain( raw ) ) { return { row: 'Invalid interaction.' }; }
		const row = { ...defaults(), ...raw };
		Object.entries( catalog.fields ).forEach( ( [ key, field ] ) => {
			const value = row[ key ];
			if ( field.type === 'boolean' && typeof value !== 'boolean' || field.type === 'number' && ( typeof value !== 'number' || ! Number.isFinite( value ) || value < field.min || value > field.max ) || [ 'string', 'select' ].includes( field.type ) && ( typeof value !== 'string' || Array.from( value ).length > ( field.max || 2000 ) ) ) { put( key, 'Enter a valid ' + ( field.label || key ) + '.' ); }
			if ( field.options && ! Object.hasOwn( field.options, value ) ) { put( key, 'Choose a valid option.' ); }
		} );
		if ( ! /^li_[a-f0-9]{12,24}$/.test( row.id ) ) { put( 'id', 'This interaction needs a unique ID.' ); }
		for ( const [ field, choices ] of [ [ 'trigger', catalog.triggers ], [ 'action', catalog.actions ], [ 'targetMode', catalog.targets ] ] ) { if ( ! Object.hasOwn( choices, row[ field ] ) ) { put( field, 'Choose a valid ' + field + '.' ); } }
		if ( Object.keys( output ).length ) { return output; }
		if ( row.enabled ) {
			if ( row.action.startsWith( 'motion-' ) && ! /^lm_[a-f0-9]{12,24}$/.test( row.timelineId ) ) { put( 'timelineId', 'Choose a Motion timeline.' ); }
			const required = ( key, text ) => { if ( ! row[ key ].trim() ) { put( key, text ); } };
			if ( ! catalog.actions[ row.action ].noTarget && row.targetMode === 'popup' ) {
				if ( ! [ 'open-dialog', 'close-dialog', 'toggle-dialog' ].includes( row.action ) ) { put( 'targetMode', 'Pop Up targets require a dialog action.' ); }
				if ( ! /^[1-9]\d{0,14}$/.test( row.targetValue ) ) { put( 'targetValue', 'Choose an active Pop Up template.' ); }
			}
			if ( ! catalog.actions[ row.action ].noTarget && [ 'element', 'selector', 'children', 'closest' ].includes( row.targetMode ) ) { required( 'targetValue', 'Choose an element or enter a target selector.' ); }
			if ( ! catalog.actions[ row.action ].noTarget && row.targetMode === 'element' && row.targetValue && ! /^[A-Za-z0-9_-]{1,64}$/.test( row.targetValue ) ) { put( 'targetValue', 'Choose an element in this document.' ); }
			if ( [ 'keydown' ].includes( row.trigger ) ) { required( 'key', 'Choose a keyboard key.' ); }
			if ( row.trigger === 'custom' || row.action === 'dispatch' ) { if ( ! /^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/.test( row.eventName ) || /^lieve:interaction-(end|error)$/.test( row.eventName ) ) { put( 'eventName', 'Enter a custom event name; lifecycle event names are reserved.' ); } }
			if ( row.trigger === 'interaction-end' && ( ! /^li_[a-f0-9]{12,24}$/.test( row.afterId ) || row.afterId === row.id ) ) { put( 'afterId', 'Choose a different interaction ID.' ); }
			if ( [ 'enter-view', 'leave-view' ].includes( row.trigger ) && ! /^(?:-?\d+(?:\.\d+)?(?:px|%))(?:\s+-?\d+(?:\.\d+)?(?:px|%)){0,3}$/.test( row.rootMargin.trim() ) ) { put( 'rootMargin', 'Use one to four px or % values.' ); }
			if ( row.action.endsWith( '-class' ) && ( ! row.className.trim() || row.className.trim().split( /\s+/ ).some( name => ! /^(?:--|[A-Za-z_]|-[A-Za-z_])[A-Za-z0-9_-]*$/.test( name ) ) ) ) { put( 'className', 'Enter CSS class names without dots.' ); }
			if ( row.action.endsWith( '-attribute' ) && ! safeAttribute( row.attribute ) ) { put( 'attribute', 'Use a safe attribute such as aria-expanded or data-state. IDs, classes, styles and executable/URL attributes have dedicated controls.' ); }
			if ( row.action.endsWith( '-style' ) && ! safeProperty( row.property ) ) { put( 'property', 'Enter a CSS property or custom property.' ); }
			if ( row.action === 'set-style' && ( ! row.value.trim() || ! safeValue( row.value ) ) ) { put( 'value', 'Enter a safe CSS value, without declarations or URL functions.' ); }
			if ( row.action === 'navigate' && ! safeURL( row.url ) ) { put( 'url', 'Use an HTTP(S) URL or a local /path, #anchor or ?query.' ); }
			if ( row.action.startsWith( 'storage-' ) ) { required( 'storageKey', 'Enter a storage key.' ); }
			if ( row.action === 'checkout-step' ) { required( 'step', 'Enter a checkout step ID.' ); }
			if ( row.action === 'call' && ! safePath( row.functionName ) ) { put( 'functionName', 'Use a named site function, for example mySite.openPanel.' ); }
			if ( row.action === 'call' && typeof window !== 'undefined' && ! Object.hasOwn( window.LieveInteractionFunctions || {}, row.functionName ) ) { put( 'functionName', 'Choose a registered site function, or disable this interaction.' ); }
			if ( [ 'call', 'dispatch' ].includes( row.action ) ) { const message = jsonError( row.arguments, row.action ); if ( message ) { put( 'arguments', message ); } }
		}
		for ( const key of [ 'minWidth', 'maxWidth' ] ) { if ( row[ key ] !== '' && ! /^\d{1,6}$/.test( row[ key ] ) ) { put( key, 'Use a positive viewport width or leave blank.' ); } }
		if ( row.minWidth && row.maxWidth && Number( row.minWidth ) > Number( row.maxWidth ) ) { put( 'maxWidth', 'Maximum width must be at least the minimum.' ); }
		if ( raw.conditions !== undefined && ! Array.isArray( raw.conditions ) || ( raw.conditions || [] ).length > catalog.conditionLimit ) { put( 'conditions', 'Use at most ' + catalog.conditionLimit + ' conditions.' ); return output; }
		( raw.conditions || [] ).forEach( ( item, index ) => {
			if ( ! plain( item ) || ! [ 'storage', 'media', 'selector' ].includes( item.kind ) || ! Object.hasOwn( operators, item.operator ) || typeof item.key !== 'string' || item.key.length > 500 || typeof item.value !== 'string' || item.value.length > 2000 || item.kind === 'storage' && ! [ 'memory', 'local', 'session' ].includes( item.storage ) ) { put( 'condition-' + index, 'Choose valid condition fields.' ); }
			else if ( row.enabled && ! item.key.trim() ) { put( 'condition-' + index, 'Enter a storage key, media query or CSS selector.' ); }
			else if ( item.kind !== 'storage' && ! [ 'exists', 'missing' ].includes( item.operator ) ) { put( 'condition-' + index, 'Use matches or does not match for media and element conditions.' ); }
			else if ( row.enabled && [ 'gt', 'gte', 'lt', 'lte' ].includes( item.operator ) && ( ! item.value.trim() || ! Number.isFinite( Number( item.value ) ) ) ) { put( 'condition-' + index, 'Numeric comparisons need a numeric value.' ); }
		} );
		return output;
	}
	function validateDocument( document, selectorCheck, popupChoices ) {
		const ids = new Set(), nodeIds = new Set(), rows = [];
		const walk = nodes => ( nodes || [] ).forEach( node => { nodeIds.add( node.id ); if ( node.props?.interactions !== undefined ) { if ( ! Array.isArray( node.props.interactions ) || node.props.interactions.length > catalog.limit ) { rows.push( { node, errors: { row: 'Use at most ' + catalog.limit + ' interactions per element.' } } ); } else { node.props.interactions.forEach( ( row, index ) => rows.push( { node, row, index, errors: errors( row ) } ) ); } } walk( node.children ); } ); walk( document.children );
		for ( const entry of rows ) {
			const row = entry.row; if ( ! row ) { return entry; }
			if ( row.enabled && row.action === 'call' && typeof window !== 'undefined' && ! Object.hasOwn( window.LieveInteractionFunctions || {}, row.functionName ) ) { entry.errors.functionName = 'Choose a registered site function, or disable this interaction.'; }
			if ( row.enabled && entry.node.type === 'html' && ( entry.node.props.wrapHtml === false || entry.node.props.wrapHtml !== true && ! entry.node.props.styles && ! entry.node.props.className && ! entry.node.props.classIds?.length && ! entry.node.props.attributes ) ) { entry.errors.row = 'Raw HTML needs an explicit wrapper for interactions. Enable it in Style or disable these rules.'; }
			if ( ids.has( row.id ) ) { entry.errors.id = 'Interaction IDs must be unique in this document.'; } ids.add( row.id );
			if ( row.enabled && ! catalog.actions[ row.action ]?.noTarget && row.targetMode === 'element' && ! nodeIds.has( row.targetValue ) ) { entry.errors.targetValue = 'The target was removed. Choose another element.'; }
			if ( row.enabled && ! catalog.actions[ row.action ]?.noTarget && row.targetMode === 'popup' && popupChoices && ! Object.hasOwn( popupChoices, row.targetValue ) ) { entry.errors.targetValue = 'This Pop Up is inactive or unavailable. Activate it or choose another.'; }
			if ( row.enabled && row.trigger === 'interaction-end' && ! rows.some( other => other.row?.id === row.afterId && other.row.id !== row.id && other.row.enabled ) ) { entry.errors.afterId = 'Choose an enabled interaction in this document.'; }
			if ( row.enabled && ! catalog.actions[ row.action ]?.noTarget && selectorCheck && [ 'selector', 'children', 'closest' ].includes( row.targetMode ) && row.targetValue ) { try { selectorCheck( row.targetValue ); } catch ( error ) { entry.errors.targetValue = 'Enter a valid CSS selector.'; } }
			if ( row.enabled && selectorCheck ) { ( row.conditions || [] ).forEach( ( item, index ) => { if ( item.kind === 'selector' && item.key ) { try { selectorCheck( item.key ); } catch ( error ) { entry.errors[ 'condition-' + index ] = 'Enter a valid CSS selector.'; } } } ); }
			if ( Object.keys( entry.errors ).length ) { return entry; }
		}
		return null;
	}
	function cloneRows( rows, nodeIds = new Map(), interactionIds = new Map() ) {
		const result = copy( rows || [] );
		result.forEach( row => { const old = row.id; row.id = interactionIds.get( old ) || id(); interactionIds.set( old, row.id ); } );
		result.forEach( row => { if ( row.targetMode === 'element' && nodeIds.has( row.targetValue ) ) { row.targetValue = nodeIds.get( row.targetValue ); } if ( interactionIds.has( row.afterId ) ) { row.afterId = interactionIds.get( row.afterId ); } } );
		return result;
	}
	return { catalog, id, create, condition, operators, normalize, errors, validateDocument, cloneRows, safeAttribute, safeProperty, safeValue, safeURL, safePath, jsonError };
} ) );
