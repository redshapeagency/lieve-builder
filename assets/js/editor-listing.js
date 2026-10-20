/* Listing inspector: joins the existing control/select/breakpoint system. */
( function () {
	'use strict';
	const supports = type => [ 'section', 'container', 'block', 'div', 'slot' ].includes( type );
	const enabled = node => supports( node?.type ) && node.props?.listing?.enabled === true;
	const defaults = { columns: 3, columnGap: '24px', rowGap: '24px', padding: '0px', align: 'stretch', equalHeight: true, controlsAlign: 'center', controlsGap: '8px', controlsOffset: '12px', arrowSize: '20px', dotSize: '6px', dotGap: '2px' };
	const dimensions = [ 'columnGap', 'rowGap', 'padding', 'controlsGap', 'controlsOffset', 'arrowSize', 'dotSize', 'dotGap' ];
	const escape = value => String( value ?? '' ).replace( /[&<>"']/g, char => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' } )[char] );
	const copy = value => JSON.parse( JSON.stringify( value ) );
	/** PHP serializes empty associative maps as []; named Array properties never enter snapshots. */
	function normalize( value ) {
		const record = item => item && typeof item === 'object' && ! Array.isArray( item );
		const listing = record( value ) ? value : {};
		return { ...listing, layout: Object.fromEntries( Object.entries( record( listing.layout ) ? listing.layout : {} ).filter( ( [ , rules ] ) => record( rules ) && Object.keys( rules ).length ).map( ( [id, rules] ) => [ id, { ...rules } ] ) ) };
	}
	function effective( node, device, points ) { const ids = window.LieveResponsive.cascade( points, device ).map( point => point.id ); return Object.assign( {}, defaults, ...ids.map( id => node.props?.listing?.layout?.[id] || {} ) ); }
	function css( node, device, points ) {
		if ( ! enabled( node ) ) { return ''; } const values = effective( node, device, points );
		const map = { columns: 'columns', columnGap: 'gap-x', rowGap: 'gap-y', padding: 'padding', align: 'align', equalHeight: 'height', controlsAlign: 'controls-align', controlsGap: 'controls-gap', controlsOffset: 'controls-offset', arrowSize: 'arrow-size', dotSize: 'dot-size', dotGap: 'dot-gap' };
		return '#lieve-canvas [data-editor-root="' + node.id + '"]{' + Object.entries( values ).filter( ( [key] ) => Object.hasOwn( map, key ) ).map( ( [key, value] ) => '--lieve-listing-' + map[key] + ':' + ( key === 'equalHeight' ? value ? '1fr' : 'auto' : key === 'columns' ? Math.max( 1, Math.min( 12, Number( value ) || 3 ) ) : dimensions.includes( key ) ? window.LieveStyles.dimensionValue( window.LieveStyles.safeValue( 'padding-top', value ) ) : ( key === 'controlsAlign' ? [ 'start', 'center', 'end', 'space-between' ] : [ 'start', 'center', 'end', 'stretch' ] ).includes( value ) ? value : key === 'controlsAlign' ? 'center' : 'stretch' ) ).join( ';' ) + ';--lieve-listing-item-align:' + ( values.equalHeight ? 'auto' : 'start' ) + '}';
	}
	function markup( node, options ) {
		if ( ! supports( node.type ) ) { return ''; }
		const value = node.props?.listing || {}, active = enabled( node ), own = value.layout?.[options.device] || {}, inherited = effective( node, options.device, options.points );
		const toggle = ( label, key, checked, responsive = false ) => '<label class="lieve-checkbox lieve-listing-switch"><span>' + label + '</span><input type="checkbox" role="switch" data-listing-' + ( responsive ? 'layout' : 'setting' ) + '="' + key + '" aria-label="' + label + '"' + ( checked ? ' checked' : '' ) + '></label>';
		const field = ( label, key, type = 'text', placeholder = '', responsive = false ) => { const current = responsive ? own[key] : value[key]; return '<div class="lieve-control"><label for="lieve-listing-' + key + '">' + label + '</label><input id="lieve-listing-' + key + '" data-listing-' + ( responsive ? 'layout' : 'setting' ) + '="' + key + '" type="' + type + '" value="' + escape( current ?? '' ) + '" placeholder="' + escape( responsive ? inherited[key] : placeholder ) + '"' + ( responsive && current === undefined ? ' class="is-inherited"' : '' ) + ( key === 'columns' ? ' min="1" max="12" step="1"' : key === 'interval' ? ' min="2000" max="60000" step="500"' : '' ) + '></div>'; };
		// Use the Style inspector's field shell as well as its shared custom picker.
		const select = ( label, key, choices, current, responsive = false ) => '<div class="lieve-style-control"><div class="lieve-style-label lieve-field-heading"><label for="lieve-listing-' + key + '">' + label + '</label></div><div class="lieve-style-input"><select id="lieve-listing-' + key + '" data-listing-' + ( responsive ? 'layout' : 'setting' ) + '="' + key + '">' + Object.entries( choices ).map( ( [id, text] ) => '<option value="' + escape( id ) + '"' + ( String( current ?? '' ) === id ? ' selected' : '' ) + '>' + escape( text ) + '</option>' ).join( '' ) + '</select></div></div>';
		let body = '<p class="lieve-element-help">Repeat this container’s children for every query result. Edit one model in Structure; use dynamic data inside it.</p>' + toggle( 'Enable Listing Builder', 'enabled', active );
		if ( active ) {
			const queries = { '': 'Choose a saved query', ...options.queries }; queries[''] = 'Choose a saved query'; if ( value.query && ! Object.hasOwn( queries, value.query ) ) { queries[value.query] = 'Unavailable query · ' + value.query; }
			body += select( 'Saved query', 'query', queries, value.query );
			body += '<p class="lieve-element-help">Filters, sorting and result count come from the saved query.' + ( options.manageUrl ? ' <a href="' + escape( options.manageUrl ) + '" target="_blank" rel="noopener noreferrer">Manage queries</a>' : '' ) + '</p>';
			if ( ! value.query || ! Object.hasOwn( options.queries, value.query ) ) { body += '<p class="lieve-listing-notice" role="status">' + ( value.query ? 'This query is unavailable. Choose an enabled query.' : 'Choose a query to preview real items. Your model remains editable.' ) + '</p>'; }
			body += select( 'Display', 'mode', { grid: 'Grid', slider: 'Slider' }, value.mode || 'grid' );
			if ( value.mode !== 'slider' ) { body += select( 'Result navigation', 'pagination', { none: 'None', links: 'Previous / next pages', 'load-more': 'Load more' }, value.pagination || 'none' ) + '<p class="lieve-element-help">Each listing has independent pages. Enable Calculate total in its query for exact page counts. Paginated listings bypass static delivery.</p>'; }
			body += '<div class="lieve-listing-layout-heading"><strong>Item layout</strong><span>' + escape( options.points.find( point => point.id === options.device )?.name || options.device ) + '</span>' + options.reset( 'data-listing-reset', 'Reset listing layout for this viewport', ! Object.keys( own ).length ) + '</div><p class="lieve-element-help">Blank fields inherit the previous viewport. Style the container and model elements in Style.</p>';
			body += field( value.mode === 'slider' ? 'Visible items' : 'Columns', 'columns', 'number', '', true ) + field( 'Column gap', 'columnGap', 'text', '', true ) + field( 'Row gap', 'rowGap', 'text', '', true ) + field( 'Item padding', 'padding', 'text', '', true );
			body += select( 'Item alignment', 'align', { '': 'Inherit · ' + inherited.align, start: 'Start', center: 'Center', end: 'End', stretch: 'Stretch' }, own.align, true );
			body += select( 'Equal item heights', 'equalHeight', { '': 'Inherit · ' + ( inherited.equalHeight ? 'On' : 'Off' ), true: 'On', false: 'Off' }, own.equalHeight, true );
			if ( value.mode === 'slider' ) {
				body += '<div class="lieve-listing-layout-heading"><strong>Slider behavior</strong></div>';
				body += select( 'Advance by', 'advance', { item: 'One item', page: 'Visible items' }, value.advance || 'item' ) + select( 'Scroll animation', 'motion', { smooth: 'Smooth', instant: 'Instant' }, value.motion || 'smooth' );
				body += toggle( 'Rewind at the edges', 'rewind', value.rewind ) + toggle( 'Drag with mouse', 'drag', value.drag !== false ) + toggle( 'Show scrollbar', 'scrollbar', value.scrollbar );
				body += '<p class="lieve-element-help">Touch swipe and keyboard navigation stay available. Mouse dragging is disabled while editing the canvas.</p>';
				body += '<div class="lieve-listing-layout-heading"><strong>Slider controls</strong></div>' + field( 'Accessible label', 'label', 'text', 'Content listing' ) + toggle( 'Navigation arrows', 'arrows', value.arrows !== false ) + toggle( 'Pagination dots', 'dots', value.dots ) + toggle( 'Autoplay', 'autoplay', value.autoplay );
				if ( value.autoplay ) { body += field( 'Autoplay interval (ms)', 'interval', 'number', '5000' ) + '<p class="lieve-element-help">Pauses on hover, keyboard focus and reduced motion. Autoplay is paused in the editor.</p>'; }
				body += '<div class="lieve-listing-layout-heading"><strong>Navigation appearance</strong><span>' + escape( options.points.find( point => point.id === options.device )?.name || options.device ) + '</span></div>';
				body += select( 'Controls alignment', 'controlsAlign', { '': 'Inherit · ' + inherited.controlsAlign, start: 'Start', center: 'Center', end: 'End', 'space-between': 'Space between' }, own.controlsAlign, true );
				for ( const [key, label] of Object.entries( { controlsGap: 'Controls gap', controlsOffset: 'Distance from items', arrowSize: 'Arrow icon size', dotSize: 'Dot size', dotGap: 'Pagination gap' } ) ) { body += field( label, key, 'text', '', true ); }
				body += '<p class="lieve-element-help">In Style → Target, customize the track, items, navigation, arrows, dots and active dot with the full responsive style controls.</p>';
			}
			body += '<div class="lieve-listing-layout-heading"><strong>Empty results</strong></div>' + field( 'Empty message', 'emptyText', 'text', 'No results found.' ) + toggle( 'Hide listing when empty', 'hideEmpty', value.hideEmpty );
		}
		return options.group( 'Listing Builder', body, 'lieve-listing-inspector' );
	}
	function bind( options ) {
		const { root, node, device } = options; if ( ! supports( node.type ) ) { return; }
		root.querySelectorAll( '[data-listing-setting], [data-listing-layout]' ).forEach( field => {
			const responsive = field.hasAttribute( 'data-listing-layout' ), key = responsive ? field.dataset.listingLayout : field.dataset.listingSetting;
			const update = event => {
				if ( event.isComposing || field.validity?.badInput ) { return; }
				let value = field.type === 'checkbox' ? field.checked : field.value;
				if ( key === 'columns' && value !== '' ) { value = Math.max( 1, Math.min( 12, Number( value ) || 1 ) ); }
				if ( key === 'interval' && value !== '' ) { value = Math.max( 2000, Math.min( 60000, Number( value ) || 5000 ) ); }
				if ( key === 'equalHeight' && value !== '' ) { value = value === 'true'; }
				if ( responsive && dimensions.includes( key ) && value !== '' && ! window.LieveStyles.safeValue( 'padding-top', value ) ) { field.setAttribute( 'aria-invalid', 'true' ); return; }
				field.removeAttribute( 'aria-invalid' );
				options.change( 'listing:' + node.id + ':' + key + ':' + device, () => { const current = options.read(); if ( ! current ) { return; } const listing = normalize( current.props.listing || { enabled: false, mode: 'grid' } ); current.props.listing = listing; if ( responsive ) { listing.layout[device] ||= {}; if ( value === '' ) { delete listing.layout[device][key]; if ( ! Object.keys( listing.layout[device] ).length ) { delete listing.layout[device]; } } else { listing.layout[device][key] = value; } } else { listing[key] = value; } }, responsive );
				if ( [ 'enabled', 'query', 'mode', 'autoplay' ].includes( key ) ) { options.refresh(); }
				if ( responsive ) { const reset = root.querySelector( '[data-listing-reset]' ); if ( reset ) { reset.disabled = ! Object.keys( options.read()?.props.listing?.layout?.[device] || {} ).length; } field.classList.toggle( 'is-inherited', value === '' ); }
			};
			field.addEventListener( field.matches( 'select,[type="checkbox"]' ) ? 'change' : 'input', update ); field.addEventListener( 'compositionend', update );
		} );
		root.querySelector( '[data-listing-reset]' )?.addEventListener( 'click', () => { options.change( 'listing:' + node.id + ':reset:' + device, () => { const current = options.read(); if ( current?.props.listing?.layout ) { delete current.props.listing.layout[device]; } }, true ); options.refresh(); } );
	}
	/** Keep page-resolved dynamic style values out of repeated items. The server owns item bindings. */
	function localStyleNode( node ) {
		const result = copy( node );
		for ( const [target, devices] of Object.entries( result.props?.styles || {} ) ) {
			const blocked = new Set(); let gradient = false, transform = false;
			for ( const states of Object.values( devices ) ) { for ( const values of Object.values( states ) ) { for ( const [key, value] of Object.entries( values ) ) { if ( window.LieveDynamicData?.parse( value ) ) { blocked.add( key ); gradient ||= key.startsWith( 'gradient-' ); transform ||= /^(translate|rotate|scale|skew)[XYZ]$/.test( key ); } } } }
			// A local base rule must not outrank a per-item responsive/state binding.
			// Gradients and transforms compile as one declaration, so keep their whole compound server-owned.
			for ( const states of Object.values( devices ) ) { for ( const values of Object.values( states ) ) { for ( const key of Object.keys( values ) ) { if ( blocked.has( key ) || gradient && ( key.startsWith( 'gradient-' ) || key === 'background-image' ) || transform && /^(translate|rotate|scale|skew)[XYZ]$/.test( key ) ) { delete values[key]; } } } }
			if ( target === 'root' ) { for ( const [key, property] of Object.entries( window.LieveStyles.legacy || {} ) ) { if ( blocked.has( property ) ) { delete result.props[key]; } } }
		}
		return result;
	}
	window.LieveListingEditor = { supports, enabled, normalize, defaults, effective, css, markup, bind, localStyleNode };
} )();
