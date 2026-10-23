( function () {
	'use strict';
	/** Trusted renderer registrations only. Never infer identity from authored attributes. */
	function createCanvasIdentity( { root, readDocument } ) {
		let records = new WeakMap(), owners = new WeakMap(), model = readDocument();
		let generation = 0, sequence = 0, registrations = 0, destroyed = false;
		const validOwner = owner => {
			if ( destroyed || ! owner || ! owners.has( owner ) || owners.get( owner ).generation !== generation || model !== readDocument() ) { return false; }
			for ( let item = owner; item; item = owners.get( item ).parent ) { if ( ! owners.get( item ).active ) { return false; } }
			return true;
		};
		const result = ( status, reason, identity = null, via = null ) => Object.freeze( { status, reason, identity, via } );
		function owner( identity, parent = null ) {
			if ( destroyed || parent && ! validOwner( parent ) ) { throw new Error( 'Inactive canvas identity owner.' ); }
			const token = Object.freeze( {} );
			owners.set( token, { generation, active: true, parent, identity: Object.freeze( { ...identity, context: Object.freeze( { ...identity.context } ), instance: ++sequence } ) } ); return token;
		}
		function register( element, token, policy = 'self' ) {
			if ( ! validOwner( token ) || element?.nodeType !== 1 || ! [ 'self', 'descendants', 'opaque' ].includes( policy ) ) { throw new Error( 'Invalid canvas identity registration.' ); }
			records.set( element, { token, policy } ); registrations++; return element;
		}
		function resolve( node ) {
			if ( destroyed ) { return result( 'destroyed', 'canvas-destroyed' ); }
			if ( model !== readDocument() ) { return result( 'stale', 'document-changed' ); }
			if ( ! node || node.ownerDocument !== root.ownerDocument ) { return result( 'unmanaged', 'foreign-document' ); }
			if ( ! root.isConnected || ! root.contains( node ) ) { return result( 'unmanaged', 'outside-canvas' ); }
			if ( node === root ) { return result( 'canvas', 'canvas-background' ); }
			if ( [ 'IFRAME', 'OBJECT', 'EMBED' ].includes( node.nodeName ) ) { return result( 'unmanaged', 'browsing-context' ); }
			for ( let current = node; current && current !== root; current = current.parentNode ) {
				const record = records.get( current ); if ( ! record ) { continue; }
				if ( ! validOwner( record.token ) ) { return result( 'stale', 'replaced-render-owner' ); }
				const { identity } = owners.get( record.token );
				if ( current !== node && record.policy === 'self' ) { continue; }
				if ( ! identity.selectId ) { return result( 'unmanaged', identity.kind, identity, 'boundary' ); }
				return result( current !== node && record.policy === 'opaque' ? 'opaque' : 'resolved', record.policy === 'opaque' ? 'preview-contents-unmapped' : null, identity, current === node ? 'direct' : record.policy );
			}
			return result( 'unmanaged', 'unregistered-node' );
		}
		return Object.freeze( {
			owner, register, resolve,
			active( element ) { return validOwner( records.get( element )?.token ); },
			parent( element ) { return owners.get( records.get( element )?.token )?.parent || null; },
			invalidate( element ) { const token = owners.get( records.get( element )?.token ); if ( token ) { token.active = false; } },
			reset() { if ( destroyed ) { return; } generation++; model = readDocument(); },
			destroy() { destroyed = true; records = new WeakMap(); owners = new WeakMap(); root = model = readDocument = null; },
			stats() { return Object.freeze( { generation, registrations, instances: sequence, destroyed } ); },
		} );
	}
	window.LieveCanvasIdentity = Object.freeze( { create: createCanvasIdentity } );
	window.LieveEditorControllers ||= {};
	window.LieveEditorControllers[ 'canvas' ] = function create( lieveContext ) {
	let identityRegistry = null;
	let controlRegistry = null;
	// Passive until a trusted host opts in. Only this renderer can register controls.
	function canvasControls() {
		if ( controlRegistry ) { return controlRegistry.api; }
		let records = new Map(), tickets = new WeakMap(), destroyed = false, scheduled = false;
		const subscribers = new Set(), allowed = new Set( [ 'empty-add', 'popup-backdrop', 'popup-close-settings', 'preview-details', 'preview-tab', 'preview-accordion', 'preview-slide-previous', 'preview-slide-next', 'preview-slide-index', 'preview-offcanvas-open', 'preview-offcanvas-close' ] );
		const builds = [], navigations = [], offcanvasOperations = [];
		function valid( record, checks = null ) {
			if ( destroyed || ! record || record.model !== lieveContext.state.document || record.generation !== canvasIdentity().stats().generation ||
				! record.element.isConnected || ! lieveContext.canvas.contains( record.element ) ) { return false; }
			const identity = canvasIdentity().resolve( record.anchor );
			if ( ! ( record.instance === null ? identity.status === 'canvas' : identity.identity?.instance === record.instance && ! [ 'stale', 'destroyed' ].includes( identity.status ) ) ) { return false; }
			if ( checks && ! checks.has( record.guard ) ) { checks.set( record.guard, record.guard() ); }
			if ( ! ( checks ? checks.get( record.guard ) : record.guard() ) ) { return false; }
			const item = record.detail;
			if ( item?.widget === 'offcanvas' ) {
				return item.controls[ item.index ] === record.element && item.controls[0].parentElement === item.root &&
					item.dialog.parentElement === item.root && item.controls[1].parentElement === item.dialog;
			}
			if ( item?.widget === 'slider' ) {
				return item.controls[ item.index ] === record.element && record.element.parentElement === item.parent &&
					( item.parent === item.root || item.parent.parentElement === item.root );
			}
			return ! item?.widget || item.controls[ item.index ] === record.element && record.element.parentElement === ( item.widget === 'tabs' ? item.tablist : item.details ) &&
				( item.widget === 'tabs' ? item.tablist.parentElement === item.root && item.panels[ item.index ].parentElement === item.root : item.details.parentElement === item.root && item.panel.parentElement === item.details );
		}
		function changed() {
			if ( scheduled || destroyed ) { return; } scheduled = true;
			queueMicrotask( () => { scheduled = false; if ( destroyed ) { return; } const checks = new Map(); for ( const [ key, record ] of records ) { if ( ! valid( record, checks ) ) { records.delete( key ); tickets.delete( record.ticket ); } } subscribers.forEach( callback => callback() ); } );
		}
		function register( element, kind, anchor, guard = () => true, detail = null ) {
			if ( destroyed || ! element || ! allowed.has( kind ) ) { return; }
			const previous = records.get( element ); if ( previous && valid( previous ) ) { return; }
			const identity = canvasIdentity().resolve( anchor ), ticket = Object.freeze( {} );
			const record = { element, kind, anchor, detail, guard, ticket, model: lieveContext.state.document,
				generation: canvasIdentity().stats().generation, instance: identity.identity?.instance ?? null };
			records.set( element, record ); tickets.set( ticket, record ); changed();
		}
		const labels = { 'empty-add': 'Add section', 'popup-backdrop': 'Edit popup settings', 'popup-close-settings': 'Edit popup close button', 'preview-details': 'Toggle details preview' };
		const disabled = record => Boolean( record.element.disabled || record.kind === 'preview-offcanvas-close' && ! record.detail.dialog.hasAttribute( 'open' ) );
		const api = Object.freeze( {
			resolve( element ) {
				if ( destroyed || element?.ownerDocument !== lieveContext.canvas.ownerDocument ) { return null; }
				for ( let current = element; current && current !== lieveContext.canvas; current = current.parentElement ) {
					const record = records.get( current ); if ( valid( record ) ) { return record.ticket; }
				}
				return null;
			},
			list() {
				const result = [], checks = new Map();
				for ( const [ element, record ] of records ) {
					if ( valid( record, checks ) ) { const item = record.detail; result.push( Object.freeze( { ticket: record.ticket, kind: record.kind, label: item?.widget ? item.label : labels[ record.kind ], element,
						expanded: record.kind === 'preview-offcanvas-open' ? item.dialog.hasAttribute( 'open' ) : record.kind === 'preview-details' ? Boolean( item.open ) : record.kind === 'preview-accordion' ? Boolean( item.details.open ) : null,
						selected: record.kind === 'preview-tab' ? item.controls[ item.index ].getAttribute( 'aria-selected' ) === 'true' : record.kind === 'preview-slide-index' ? item.slides.findIndex( slide => ! slide.hidden ) === item.slideIndex : null,
						disabled: disabled( record ), group: item?.widget === 'tabs' ? item.group : null } ) ); }
					else { records.delete( element ); tickets.delete( record.ticket ); }
				}
				return result;
			},
			current( ticket ) { const record = tickets.get( ticket ); return valid( record ) && ! disabled( record ); },
			execute( ticket ) {
				const record = tickets.get( ticket ); if ( ! valid( record ) || disabled( record ) ) { return false; }
				switch ( record.kind ) {
					case 'empty-add': lieveContext.addBlock( 'section' ); break;
					case 'popup-backdrop': lieveContext.openPopupSettings(); break;
					case 'popup-close-settings': lieveContext.openPopupSettings( 'style', 'close' ); break;
					case 'preview-offcanvas-open': case 'preview-offcanvas-close': {
						const start = performance.now(), item = record.detail, open = record.kind === 'preview-offcanvas-open';
						selectElement( canvasIdentity().resolve( record.anchor ).identity.selectId );
						const selected = performance.now(); if ( ! valid( record ) || disabled( record ) ) { return false; }
						setPreviewOffcanvasOpen( item.dialog, open );
						if ( offcanvasOperations.length < 2000 ) { offcanvasOperations.push( { open, selectionMs: selected - start, ms: performance.now() - selected } ); }
						updateSelectionOutline(); break;
					}
					case 'preview-slide-previous': case 'preview-slide-next': case 'preview-slide-index': {
						const item = record.detail, previous = item.slides.findIndex( slide => ! slide.hidden );
						selectElement( canvasIdentity().resolve( record.anchor ).identity.selectId );
						if ( ! valid( record ) || record.element.disabled ) { return false; }
						const index = record.kind === 'preview-slide-index' ? item.slideIndex : previous + ( record.kind === 'preview-slide-next' ? 1 : -1 ), start = performance.now();
						activatePreviewSlide( item.slides, index, item.loop, item.status, item.dots );
						if ( navigations.length < 2000 ) { navigations.push( { items: item.slides.length, ms: performance.now() - start } ); }
						// Instant legacy preview: no transition/timer or late child callback.
						updateSelectionOutline(); break;
					}
					case 'preview-details': { const previous = record.detail.open; selectElement( canvasIdentity().resolve( record.anchor ).identity.selectId ); if ( ! valid( record ) ) { return false; } togglePreviewDetails( record.detail, previous ); window.requestAnimationFrame( updateSelectionOutline ); break; }
					case 'preview-tab': case 'preview-accordion': {
						const item = record.detail, previous = item.details?.open;
						selectElement( canvasIdentity().resolve( record.anchor ).identity.selectId );
						if ( ! valid( record ) || record.element.disabled ) { return false; }
						if ( record.kind === 'preview-tab' ) { activatePreviewTab( item.controls, item.panels, record.element, item.panels[ item.index ] ); }
						else { togglePreviewDetails( item.details, previous ); record.element.setAttribute( 'aria-expanded', String( item.details.open ) ); }
						window.requestAnimationFrame( updateSelectionOutline ); break;
					}
					default: return false;
				}
				changed(); return true;
			},
			subscribe( callback ) { if ( destroyed ) { return () => {}; } subscribers.add( callback ); return () => subscribers.delete( callback ); },
			destroy() { destroyed = true; scheduled = false; records.clear(); tickets = new WeakMap(); subscribers.clear(); },
			stats() { return { destroyed, controls: records.size, subscribers: subscribers.size, scheduled, widgetBuilds: builds.slice(), sliderNavigations: navigations.slice(), offcanvasOperations: offcanvasOperations.slice() }; },
		} );
		controlRegistry = { api, register, changed, active: () => ! destroyed,
			forget( anchor ) { for ( const [ element, record ] of records ) { if ( record.anchor === anchor ) { records.delete( element ); tickets.delete( record.ticket ); } } changed(); },
			built( items, start ) { if ( builds.length < 2000 ) { builds.push( { items, ms: performance.now() - start } ); } },
			reset() { records.clear(); tickets = new WeakMap(); changed(); },
		};
		return api;
	}
	function togglePreviewDetails( details, previous = details.open ) { details.open = ! previous; }
	function setPreviewOffcanvasOpen( dialog, open ) {
		if ( ! dialog ) { return; }
		if ( open ) { dialog.setAttribute( 'open', '' ); } else { dialog.removeAttribute( 'open' ); }
	}
	function activatePreviewTab( controls, panels, tab, target ) {
		controls.forEach( button => { const active = button === tab; button.setAttribute( 'aria-selected', String( active ) ); button.tabIndex = active ? 0 : -1; } );
		panels.forEach( panel => { panel.hidden = panel !== target; } );
	}
	function activatePreviewSlide( slides, index, loop, status, dots ) {
		if ( ! slides.length ) { return; }
		const next = loop ? ( index + slides.length ) % slides.length : Math.min( slides.length - 1, Math.max( 0, index ) );
		slides.forEach( ( slide, position ) => { slide.hidden = position !== next; } );
		if ( status ) { status.textContent = ( next + 1 ) + ' / ' + slides.length; }
		dots.forEach( ( { element, index: position } ) => { if ( position === next ) { element.setAttribute( 'aria-current', 'true' ); } else { element.removeAttribute( 'aria-current' ); } } );
	}
	function registerPreviewControls( node, visual ) {
		if ( ! controlRegistry?.active() || ! [ 'dropdown', 'tabs', 'accordion', 'tabs-nested', 'accordion-nested', 'slider', 'offcanvas' ].includes( node.type ) || ! canvasIdentity().active( visual ) || lieveContext.listingEditor?.enabled( node ) ) { return; }
		if ( ! visual.isConnected ) { queueMicrotask( () => { if ( visual.isConnected ) { registerPreviewControls( node, visual ); } } ); return; }
		if ( lieveContext.findNode( lieveContext.state.document.children, node.id ) !== node ) { return; }
		if ( node.type === 'offcanvas' ) { registerPreviewOffcanvas( node, visual ); return; }
		if ( node.type === 'slider' ) { registerPreviewSlider( node, visual ); return; }
		if ( node.type !== 'dropdown' ) { registerPreviewItems( node, visual ); return; }
		// Replace only the built-in top-level summary. Authored descendants stay opaque.
		const details = visual.firstElementChild, old = details?.firstElementChild;
		if ( details?.nodeName !== 'DETAILS' || old?.nodeName !== 'SUMMARY' ) { return; }
		const summary = visual.ownerDocument.createElement( 'summary' ); summary.textContent = old.textContent; old.replaceWith( summary );
		controlRegistry.register( summary, 'preview-details', visual, () => summary.parentElement === details && details.parentElement === visual && lieveContext.findNode( lieveContext.state.document.children, node.id )?.type === 'dropdown', details );
	}
	function registerPreviewOffcanvas( node, visual ) {
		const start = performance.now(), root = visual.firstElementChild, source = node.props?.label;
		if ( source != null && typeof source !== 'string' || typeof lieveContext.styles?.elementNumber !== 'function' || visual.children.length !== 1 || root?.nodeName !== 'DIV' || root.children.length !== 2 ) { return; }
		const label = source && source !== '0' ? source : 'Open panel', id = 'lieve-' + lieveContext.styles.elementNumber( node.id ) + '-dialog';
		const oldOpen = root.children[0], oldDialog = root.children[1], oldClose = oldDialog.firstElementChild;
		if ( label.includes( '{{' ) || oldOpen.nodeName !== 'BUTTON' || oldOpen.children.length || oldOpen.textContent !== label ||
			oldDialog.nodeName !== 'DIALOG' || oldDialog.id !== id || oldOpen.getAttribute( 'data-lieve-open' ) !== id ||
			oldClose?.nodeName !== 'BUTTON' || oldClose.children.length || ! oldClose.hasAttribute( 'data-lieve-dialog-close' ) ) { return; }
		// This is a projection check, not HTML authentication. Create the entire fixed
		// control set from the canonical model; only the panel body remains opaque.
		const doc = visual.ownerDocument, opener = doc.createElement( 'button' ), dialog = doc.createElement( 'dialog' ), closer = doc.createElement( 'button' );
		opener.type = closer.type = 'button'; opener.textContent = label; closer.textContent = oldClose.textContent;
		dialog.id = id; opener.setAttribute( 'data-lieve-open', id ); closer.setAttribute( 'data-lieve-dialog-close', '' );
		dialog.appendChild( closer ); Array.from( oldDialog.childNodes ).forEach( child => { if ( child !== oldClose ) { dialog.appendChild( child ); } } );
		oldOpen.replaceWith( opener ); oldDialog.replaceWith( dialog );
		const definition = previewKey( node ), controls = [ opener, closer ];
		const current = () => root.parentElement === visual && root.children.length === 2 && root.children[0] === opener && root.children[1] === dialog && dialog.firstElementChild === closer &&
			lieveContext.findNode( lieveContext.state.document.children, node.id ) === node && previewKey( node ) === definition;
		controls.forEach( ( element, index ) => controlRegistry.register( element, index ? 'preview-offcanvas-close' : 'preview-offcanvas-open', visual, current, {
			widget: 'offcanvas', index, controls, root, dialog, label: ( node.props?.editorLabel || 'Offcanvas' ) + ' — ' + ( index ? 'Close panel' : 'Open panel' ),
		} ) );
		controlRegistry.built( controls.length, start );
	}
	function registerPreviewItems( node, visual ) {
		const start = performance.now(), nested = node.type.endsWith( '-nested' ), tabs = node.type.startsWith( 'tabs' ), root = visual.firstElementChild;
		// This projection grants no authority to a server/authored node. All controls
		// and panel shells below are newly created from canonical model positions.
		// Reject ambiguous projections rather than interpreting content as controls.
		if ( visual.children.length !== 1 || root?.nodeName !== 'DIV' ) { return; }
		let labels;
		if ( nested ) { labels = ( node.children || [] ).map( ( child, index ) => String( child.props?.label ?? ( tabs ? 'Tab ' : 'Item ' ) + ( index + 1 ) ) ); }
		else {
			const source = node.props?.items || '';
			try { const rows = JSON.parse( source ); if ( rows && typeof rows === 'object' && ( ! Array.isArray( rows ) || rows.some( row => ! Array.isArray( row ) || row.some( value => typeof value !== 'string' ) ) ) ) { return; } } catch ( error ) { if ( /^[\s]*[\[{]/.test( source ) ) { return; } }
			labels = lieveContext.parseItems( source ).map( row => String( row[0] || '' ).replace( /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, '' ) );
		}
		if ( ! labels.length || labels.some( label => label.includes( '{{' ) ) ) { return; }
		const oldList = tabs ? root.firstElementChild : null, oldItems = Array.from( tabs ? oldList?.children || [] : root.children ), oldPanels = tabs ? Array.from( root.children ).slice( 1 ) : oldItems;
		if ( oldItems.length !== labels.length || oldPanels.length !== labels.length || tabs && oldList?.nodeName !== 'DIV' ||
			oldItems.some( ( item, index ) => tabs ? item.nodeName !== 'BUTTON' || item.textContent !== labels[index] || oldPanels[index].nodeName !== 'DIV' : item.nodeName !== 'DETAILS' || item.firstElementChild?.nodeName !== 'SUMMARY' || item.firstElementChild.textContent !== labels[index] ) ) { return; }
		const definition = previewKey( node ), owner = canvasIdentity().resolve( visual ).identity, group = Object.freeze( {} ), controls = [], panels = [];
		const current = () => root.parentElement === visual && lieveContext.findNode( lieveContext.state.document.children, node.id ) === node && previewKey( node ) === definition;
		const doc = visual.ownerDocument, tablist = tabs ? doc.createElement( 'div' ) : null;
		if ( tabs ) { tablist.setAttribute( 'role', 'tablist' ); tablist.setAttribute( 'aria-label', String( node.props.label || 'Tabs' ) ); }
		labels.forEach( ( label, index ) => {
			const control = doc.createElement( tabs ? 'button' : 'summary' ), panel = doc.createElement( 'div' ), details = tabs ? null : doc.createElement( 'details' );
			const id = 'lieve-preview-' + canvasIdentity().stats().generation + '-' + owner.instance + '-' + index;
			control.id = id + '-control'; panel.id = id + '-panel'; control.textContent = label;
			control.setAttribute( 'aria-controls', panel.id ); panel.setAttribute( 'aria-labelledby', control.id ); panel.setAttribute( 'role', tabs ? 'tabpanel' : 'region' );
			// Move opaque contents only. Never register their descendants or copy a
			// server button/summary, event handler, command attribute or HTML ID.
			Array.from( oldPanels[index].childNodes ).forEach( child => { if ( tabs || child !== oldItems[index].firstElementChild ) { panel.appendChild( child ); } } );
			if ( tabs ) { control.type = 'button'; control.setAttribute( 'role', 'tab' ); panel.tabIndex = 0; tablist.appendChild( control ); oldPanels[index].replaceWith( panel ); }
			else { control.setAttribute( 'aria-expanded', 'false' ); details.append( control, panel ); oldItems[index].replaceWith( details ); }
			controls.push( control ); panels.push( panel );
			controlRegistry.register( control, tabs ? 'preview-tab' : 'preview-accordion', visual, current, {
				widget: tabs ? 'tabs' : 'accordion', group, index, controls, panels, root, tablist, details, panel,
				label: ( node.props.editorLabel || node.type ) + ' — ' + ( tabs ? 'Tab: ' : 'Item: ' ) + ( label || String( index + 1 ) ),
			} );
		} );
		if ( tabs ) { oldList.replaceWith( tablist ); activatePreviewTab( controls, panels, controls[0], panels[0] ); }
		controlRegistry.built( controls.length, start );
	}
	function registerPreviewSlider( node, visual ) {
		const start = performance.now(), root = visual.firstElementChild, props = node.props || {}, source = props.items || '';
		if ( visual.children.length !== 1 || root?.nodeName !== 'DIV' ) { return; }
		// Only canonical rows define the control set. Server attributes/DOM indices
		// are compatibility checks at most, never authority for an action or owner.
		try { const rows = JSON.parse( source ); if ( rows && typeof rows === 'object' && ( ! Array.isArray( rows ) || rows.some( row => ! Array.isArray( row ) || row.some( value => typeof value !== 'string' ) ) ) ) { return; } } catch ( error ) { if ( /^[\s]*[\[{]/.test( source ) ) { return; } }
		const count = lieveContext.parseItems( source ).length, multiple = count > 1, arrows = multiple && props.sliderArrows !== false, indicators = multiple && Boolean( props.sliderDots ), autoplay = multiple && Boolean( props.sliderAutoplay );
		const old = Array.from( root.children ), expected = [ ...Array( count ).fill( 'DIV' ), ...( arrows ? [ 'BUTTON', 'BUTTON' ] : [] ), ...( indicators ? [ 'DIV' ] : [] ), ...( autoplay ? [ 'BUTTON' ] : [] ), ...( multiple ? [ 'SPAN' ] : [] ) ];
		if ( old.length !== expected.length || old.some( ( element, index ) => element.nodeName !== expected[index] ) ) { return; }
		const oldDots = indicators ? old[ count + ( arrows ? 2 : 0 ) ] : null;
		if ( oldDots && ( oldDots.children.length !== count || Array.from( oldDots.children ).some( element => element.nodeName !== 'BUTTON' ) ) ) { return; }
		const definition = previewKey( node ), slides = [], controls = [], dots = [], topology = [], doc = visual.ownerDocument;
		const current = () => root.parentElement === visual && lieveContext.findNode( lieveContext.state.document.children, node.id ) === node && previewKey( node ) === definition &&
			root.children.length === topology.length && topology.every( ( element, index ) => root.children[index] === element );
		// Identical direct-child topology: no extra slide/body wrapper. Opaque body
		// nodes keep their original URLs, styles and owner-only selection policy.
		for ( let index = 0; index < count; index++ ) {
			const slide = doc.createElement( 'div' ); slide.setAttribute( 'data-lieve-slide', '' ); slide.setAttribute( 'role', 'group' ); slide.setAttribute( 'aria-roledescription', 'slide' ); slide.setAttribute( 'aria-label', ( index + 1 ) + ' / ' + count ); slide.hidden = index !== 0;
			Array.from( old[index].childNodes ).forEach( child => slide.appendChild( child ) ); old[index].replaceWith( slide ); slides.push( slide );
		}
		const status = multiple ? doc.createElement( 'span' ) : null;
		if ( status ) { status.setAttribute( 'data-lieve-slide-status', '' ); status.setAttribute( 'role', 'status' ); status.setAttribute( 'aria-live', 'polite' ); old.at( -1 ).replaceWith( status ); }
		const bind = ( element, kind, parent, slideIndex = null ) => {
			const index = controls.length; controls.push( element );
			controlRegistry.register( element, kind, visual, current, { widget: 'slider', index, slideIndex, controls, slides, dots, status, root, parent, loop: props.sliderLoop !== false,
				label: ( props.editorLabel || 'Slider' ) + ' — ' + ( kind === 'preview-slide-index' ? 'Slide ' + ( slideIndex + 1 ) : kind === 'preview-slide-next' ? 'Next slide' : 'Previous slide' ),
			} );
		};
		if ( arrows ) { [ 'previous', 'next' ].forEach( ( direction, index ) => {
			const button = doc.createElement( 'button' ); button.type = 'button'; button.setAttribute( 'data-lieve-slide-' + ( index ? 'next' : 'prev' ), '' ); button.setAttribute( 'aria-label', index ? 'Next slide' : 'Previous slide' );
			button.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + ( index ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6' ) + '"/></svg>';
			old[ count + index ].replaceWith( button ); bind( button, 'preview-slide-' + direction, root );
		} ); }
		if ( indicators ) {
			const group = doc.createElement( 'div' ); group.setAttribute( 'data-lieve-slide-dots', '' ); group.setAttribute( 'role', 'group' ); group.setAttribute( 'aria-label', 'Choose a slide' );
			for ( let index = 0; index < count; index++ ) { const button = doc.createElement( 'button' ); button.type = 'button'; button.setAttribute( 'data-lieve-slide-index', String( index ) ); button.setAttribute( 'aria-label', 'Go to slide ' + ( index + 1 ) ); button.textContent = String( index + 1 ); group.appendChild( button ); dots.push( { element: button, index } ); bind( button, 'preview-slide-index', group, index ); }
			oldDots.replaceWith( group );
		}
		topology.push( ...root.children ); activatePreviewSlide( slides, 0, props.sliderLoop !== false, status, dots ); controlRegistry.built( count, start );
	}
	function canvasIdentity() {
		identityRegistry ||= createCanvasIdentity( { root: lieveContext.canvas, readDocument: () => lieveContext.state.document } );
		return identityRegistry;
	}
	const previewVisual = ( node, owner, visual = document.createElement( 'div' ) ) => {
		visual.className = 'lieve-element-preview';
		canvasIdentity().register( visual, owner, 'opaque' );
		loadElementPreview( node, visual, lieveContext.canvasInitializing ); return visual;
	};
	function styleString( props, type ) {
		const styles = [];
		const map = {
			backgroundColor: 'background-color',
			color: 'color',
			paddingTop: 'padding-top',
			paddingRight: 'padding-right',
			paddingBottom: 'padding-bottom',
			paddingLeft: 'padding-left',
			marginTop: 'margin-top',
			marginBottom: 'margin-bottom',
			borderRadius: 'border-radius',
			fontSize: 'font-size',
			maxWidth: 'max-width',
			minHeight: 'min-height',
			gap: 'gap',
			textAlign: 'text-align',
			fontWeight: 'font-weight',
			alignItems: 'align-items',
			justifyContent: 'justify-content',
		};
		const pixels = [ 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'borderRadius', 'fontSize', 'maxWidth', 'minHeight', 'gap' ];

		Object.entries( map ).forEach( ( [ key, cssProperty ] ) => {
			if ( props[ key ] !== undefined && props[ key ] !== '' ) {
				const value = pixels.includes( key ) ? parseInt( props[ key ], 10 ) + 'px' : props[ key ];
				styles.push( cssProperty + ':' + value );
			}
		} );

		if ( lieveContext.canNest( type ) && props.direction ) {
			styles.push( 'display:flex' );
			styles.push( 'flex-direction:' + props.direction );
		}
		if ( type === 'image' && props.width !== undefined && props.width !== '' ) {
			styles.push( 'width:' + parseInt( props.width, 10 ) + '%' );
		}
		if ( type === 'spacer' && props.height !== undefined && props.height !== '' ) {
			styles.push( 'height:' + parseInt( props.height, 10 ) + 'px' );
		}

		return styles.join( ';' );
	}

	function createChildren( node, owner = null ) {
		const children = document.createElement( 'div' );
		children.className = 'lieve-editor-children';
		children.dataset.parentId = node.id;
		if ( node.type === 'section' && owner ) { canvasIdentity().register( children, owner ); } // Trusted inner section lane, including its empty hint.
		( node.children || [] ).forEach( ( child ) => children.appendChild( createNodeElement( child, owner ) ) );

		return children;
	}

	function createNodeElement( node, parentOwner = null ) {
		const wrapper = document.createElement( 'div' );
		wrapper.className = 'lieve-editor-frame';
		wrapper.dataset.id = node.id;
		const registry = canvasIdentity(), listing = Boolean( lieveContext.listingEditor?.enabled( node ) );
		const config = lieveContext.config;
		const context = { scope: config.componentMode ? 'component-document' : config.isTemplate ? 'template-document' : 'document', postId: config.postId };
		if ( node.type === 'component' ) { context.componentId = node.props?.componentId || null; }
		if ( node.type === 'template' ) { context.templateId = node.props?.templateId || null; }
		if ( listing || node.props?.savedQuery ) { context.queryId = listing ? node.props.listing.query || null : node.props.savedQuery; }
		if ( node.type === 'slot' ) { context.slotKey = node.props?.slotKey || node.id; }
		if ( listing || ! [ 'section', 'container', 'block', 'div', 'slot', 'heading', 'button', 'image', 'spacer' ].includes( node.type ) ) { context.contents = 'unmapped'; }
		const owner = registry.owner( { id: node.id, selectId: node.id, type: node.type, kind: listing ? 'listing' : node.type,
			context }, parentOwner );
		registry.register( wrapper, owner );

		let visual;
		const props = lieveContext.dynamicData?.resolveNode( node ).props || node.props || {};

		if ( listing ) { visual = previewVisual( node, owner ); }
		else switch ( node.type ) {
			case 'section':
				visual = document.createElement( 'section' );
				visual.className = 'lieve-editor-section';
				visual.appendChild( createChildren( node, owner ) );
				break;
			case 'container':
				visual = createChildren( node, owner );
				visual.classList.add( 'lieve-editor-container' );
				break;
			case 'heading':
				visual = document.createElement( 'h' + Math.min( 6, Math.max( 1, parseInt( props.level || 2, 10 ) ) ) );
				visual.className = 'lieve-editor-heading';
				visual.textContent = props.content ?? '';
				break;
			case 'button':
				visual = document.createElement( 'a' );
				visual.className = 'lieve-editor-button';
				visual.href = props.url || '#';
				visual.textContent = props.label ?? '';
				break;
			case 'image':
				visual = document.createElement( 'figure' );
				visual.className = 'lieve-editor-image';
				if ( props.attachmentId && props.imageSource !== 'url' || props.caption || props.imageLink || props.imageSizes || props.imageDecoding ) { visual = previewVisual( node, owner, visual ); break; }
				if ( props.url ) {
					const image = document.createElement( 'img' );
					image.src = props.url;
					image.alt = props.alt || '';
					visual.appendChild( image );
				} else {
					const placeholder = document.createElement( 'div' );
					placeholder.className = 'lieve-image-placeholder';
					placeholder.dataset.editorUi = '';
					placeholder.textContent = 'Choose image';
					visual.appendChild( placeholder );
				}
				break;
			case 'spacer':
				visual = document.createElement( 'div' );
				visual.className = 'lieve-editor-spacer';
				break;
			default:
				if ( [ 'block', 'div', 'slot' ].includes( node.type ) ) {
					visual = createChildren( node, owner );
					visual.classList.add( 'lieve-editor-container' );
				} else {
					visual = previewVisual( node, owner );
				}
		}

		visual.classList.add( 'lieve-editor-visual' );
		if ( ! visual.classList.contains( 'lieve-element-preview' ) ) { registry.register( visual, owner, lieveContext.canNest( node.type ) ? 'self' : 'descendants' ); }
		if ( ! visual.classList.contains( 'lieve-element-preview' ) ) { prepareEditorRoot( visual, node ); }
		// Explicit styles are compiled locally; no CSS presets are added to the node.
		if ( ! visual.classList.contains( 'lieve-element-preview' ) ) {
			if ( ! lieveContext.styles ) { visual.style.cssText += styleString( props, node.type ); }
		}
		wrapper.appendChild( visual );
		const eventTarget = ( event ) => {
			const root = event.target.closest( '[data-editor-root]' );
			const target = lieveContext.findNode( lieveContext.state.document.children, root?.dataset.editorRoot || node.id ) || node;
			return { root: root || visual, node: target };
		};

		wrapper.addEventListener( 'click', ( event ) => {
			event.preventDefault();
			event.stopPropagation();
			if ( event.target.closest( '[data-lieve-listing-controls]' ) ) { return; }
			lieveContext.selectedListingPosition = event.target.closest( '[data-lieve-listing-item]' )?.dataset.listingPosition || null;
			handlePreviewInteraction( event );
			selectElement( eventTarget( event ).node.id );
			if ( lieveContext.selectedListingPosition ) { updateSelectionOutline(); }
		} );

		return wrapper;
	}

	function prepareEditorRoot( root, node, rawHtml = false, instance = false ) {
		if ( ! rawHtml && ! instance ) { root.id = lieveContext.styles.elementHtmlId( node ); root.dataset.lieveId = lieveContext.styles.elementDataId( node ); }
		root.dataset.editorRoot = node.id; root.dataset.id = node.id;
		if ( node.type === 'html' ) { root.dataset.editorCode = 'true'; }
		if ( rawHtml ) { root.dataset.editorFragment = 'true'; }
		root.classList.add( 'lieve-editor-node' ); if ( ! rawHtml ) {
			lieveContext.elementMarkupClassOptions( node ).forEach( option => root.classList.toggle( option.name, node.props.markupClasses?.[ option.name ] ?? option.enabled ) );
		} root.classList.toggle( 'is-selected', lieveContext.state.selectedId === node.id );
		root.draggable = false; root.tabIndex = 0;
		root.setAttribute( 'aria-label', node.props?.editorLabel || lieveContext.labels[ node.type ] || node.type );
		if ( ! rawHtml && lieveContext.classWorkspace ) { root.classList.add( ...lieveContext.classWorkspace.names( node.props.classIds ) ); }
		if ( ! rawHtml && node.props.className ) { root.classList.add( ...node.props.className.split( /\s+/ ).filter( Boolean ) ); }
		if ( ! rawHtml ) { Object.entries( node.props.attributes || {} ).forEach( ( [ key, value ] ) => {
			// Public interaction/visibility attributes must not disable editor handles.
			if ( lieveContext.customAttributeNameAllowed( key ) && lieveContext.customAttributeValueAllowed( key, value ) && ! [ 'tabindex', 'draggable', 'contenteditable', 'hidden', 'inert', 'disabled', 'autofocus' ].includes( key ) ) { root.setAttribute( key, value ); }
		} ); }
	}

	function prepareHtmlFragment( host, node, start = null, end = null ) {
		const children = [];
		const visibleRoot = child => child.nodeType === 1 && ! [ 'STYLE', 'SCRIPT', 'LINK', 'META', 'TEMPLATE' ].includes( child.tagName );
		if ( start && end && start.parentNode !== end.parentNode ) { return; }
		if ( start && end && start.parentNode === end.parentNode ) { host = start.parentNode; for ( let child = start.nextSibling; child && child !== end; child = child.nextSibling ) { children.push( child ); } }
		else { children.push( ...host.childNodes ); }
		if ( ! children.some( ( child ) => visibleRoot( child ) || child.nodeType === 3 && child.textContent.trim() ) ) {
			const placeholder = document.createElement( 'span' ); placeholder.className = 'lieve-editor-preview-message'; placeholder.dataset.editorUi = ''; placeholder.textContent = node.props.content || node.props.customJs || node.props.customCss ? 'Custom Code · no visible output' : 'Add code in the Content panel.'; host.insertBefore( placeholder, end ); children.push( placeholder );
		}
		children.forEach( ( child ) => {
			if ( child.nodeType === 3 && child.textContent.trim() ) { const span = document.createElement( 'span' ); host.insertBefore( span, child ); span.appendChild( child ); child = span; }
			if ( visibleRoot( child ) ) { prepareEditorRoot( child, node, true ); }
		} );
	}

	function editorBounds( frame ) {
		return ( frame.querySelector( '[data-editor-root="' + window.CSS.escape( frame.dataset.id ) + '"]' ) || frame ).getBoundingClientRect();
	}

	function previewNodeData( node ) {
		const copy = lieveContext.clone( node ); const walk = ( item, listing = false ) => { listing ||= Boolean( window.LieveListingEditor?.enabled( item ) ); if ( item.type === 'html' && lieveContext.styles ) { item.props.wrapHtml = lieveContext.styles.htmlHasWrapper( item ); } if ( ! listing ) { delete item.props.styles; } ( item.children || [] ).forEach( child => walk( child, listing ) ); }; walk( copy ); return copy;
	}

	function previewKey( node ) { return JSON.stringify( previewNodeData( node ) ) + ( lieveContext.executeCodePreview( node ) ? '|run-php' : '' ) + ( node.type === 'component' ? '|components:' + ( lieveContext.componentEditor?.revision() || '' ) : '' ); }

	function seedElementPreviews() {
		const previews = lieveContext.config.initialPreviews;
		if ( ! previews || typeof previews !== 'object' || Array.isArray( previews ) ) { return; }
		lieveContext.walkNodes( lieveContext.state.document.children, node => {
			if ( lieveContext.elementPreviews.size >= 200 || ! Object.hasOwn( previews, node.id ) || typeof previews[ node.id ] !== 'string' ) { return; }
			lieveContext.elementPreviews.set( JSON.stringify( previewNodeData( node ) ) + ( node.type === 'component' ? '|components:' + ( lieveContext.componentEditor?.revision() || '' ) : '' ), previews[ node.id ] );
			lieveContext.latestPreviews.set( node.id, previews[ node.id ] );
		} );
	}

	function handlePreviewInteraction( event ) {
		const summary = event.target.closest( 'summary' );
		if ( summary?.parentElement.matches( 'details' ) ) { togglePreviewDetails( summary.parentElement ); }
		const tab = event.target.closest( '[role="tab"][aria-controls]' );
		const tabs = tab?.closest( '[data-lieve-tabs]' );
		if ( tabs ) {
			const panels = Array.from( tabs.querySelectorAll( ':scope > [role="tabpanel"]' ) );
			activatePreviewTab( Array.from( tabs.querySelectorAll( ':scope > [role="tablist"] [role="tab"]' ) ), panels, tab, panels.find( panel => panel.id === tab.getAttribute( 'aria-controls' ) ) );
		}
		const control = event.target.closest( '[data-lieve-slide-prev],[data-lieve-slide-next],[data-lieve-slide-index]' ); const slider = control?.closest( '[data-lieve-slider]' );
		if ( slider ) {
			const slides = Array.from( slider.querySelectorAll( ':scope > [data-lieve-slide]' ) ); const current = slides.findIndex( ( slide ) => ! slide.hidden );
			if ( !slides.length ) { return; } const index = control.hasAttribute('data-lieve-slide-index') ? Number(control.dataset.lieveSlideIndex) : current + ( control.hasAttribute( 'data-lieve-slide-next' ) ? 1 : -1 );
			activatePreviewSlide( slides, index, slider.dataset.sliderLoop !== 'false', slider.querySelector( '[data-lieve-slide-status]' ), Array.from( slider.querySelectorAll( '[data-lieve-slide-index]' ), element => ( { element, index: Number( element.dataset.lieveSlideIndex ) } ) ) );
		}
		const opener = event.target.closest( '[data-lieve-open]' ); if ( opener ) { setPreviewOffcanvasOpen( lieveContext.canvas.querySelector( '#' + window.CSS.escape( opener.dataset.lieveOpen ) ), true ); }
		const closer = event.target.closest( '[data-lieve-dialog-close]' ); if ( closer ) { setPreviewOffcanvasOpen( closer.closest( 'dialog' ), false ); }
		window.requestAnimationFrame( updateSelectionOutline );
	}

	function revealSelectedPreview() {
		const selected = lieveContext.canvas.querySelector( '[data-editor-root="' + window.CSS.escape( lieveContext.state.selectedId || '' ) + '"]' );
		for ( let parent = selected; parent && parent !== lieveContext.canvas; parent = parent.parentElement ) {
			if ( parent.matches( 'details,dialog' ) ) { parent.setAttribute( 'open', '' ); }
			if ( parent.matches( '[role="tabpanel"]' ) ) {
				parent.parentElement.querySelectorAll( ':scope > [role="tabpanel"]' ).forEach( ( panel ) => { panel.hidden = panel !== parent; } );
				parent.parentElement.querySelectorAll( '[role="tab"][aria-controls]' ).forEach( ( tab ) => { tab.setAttribute( 'aria-selected', String( tab.getAttribute( 'aria-controls' ) === parent.id ) ); } );
			} else if ( parent.hidden ) { parent.hidden = false; }
		}
	}

	function clearDropIndicators( preserveTreeDrop = false ) {
		if ( ! preserveTreeDrop ) { lieveContext.clearTreeDragMotion(); lieveContext.clearTreeDropPlaceholder(); }
		[ ...document.querySelectorAll( '.is-drop-before, .is-drop-after, .is-drop-target' ), ...lieveContext.canvas.querySelectorAll( '.is-drop-before, .is-drop-after, .is-drop-target' ) ].forEach( ( item ) => {
			item.classList.remove( 'is-drop-before', 'is-drop-after', 'is-drop-target' );
		} );
	}

	async function loadElementPreview( node, visual, immediate = false ) {
		// CSS changes are applied locally, without a new REST request or preview flash.
		const previewNode = previewNodeData( node );
		const key = previewKey( node );
		const old = lieveContext.previewJobs.get( node.id );
		if ( old && old.key !== key ) { old.controller.abort(); window.clearTimeout( old.timer ); }
		let phpRecord = lieveContext.executeCodePreview( node ) ? lieveContext.phpPreviewSources.get( node.id ) : null;
		if ( lieveContext.executeCodePreview( node ) && ( ! phpRecord || phpRecord.source !== lieveContext.codeSource( node ) ) ) { phpRecord = { source: lieveContext.codeSource( node ), consumed: false }; lieveContext.phpPreviewSources.set( node.id, phpRecord ); }
		const isCurrent = () => { const current = lieveContext.findNode( lieveContext.state.document.children, node.id ); return current && previewKey( current ) === key; };
		function display( html, exact = true ) {
			window.LieveListings?.destroy( visual );
			controlRegistry?.forget( visual );
			const rawHtml = node.type === 'html' && ! lieveContext.styles?.htmlHasWrapper( lieveContext.findNode( lieveContext.state.document.children, node.id ) || node );
			visual.innerHTML = rawHtml ? html || '' : html || '<div data-editor-ui class="lieve-editor-preview-message">Configure this element in the properties panel.</div>';
			const fragments = new Map(); const comments = document.createTreeWalker( visual, 128 );
			for ( let comment = comments.nextNode(); comment; comment = comments.nextNode() ) {
				const match = comment.data.match( /^lieve-html-(start|end):([a-zA-Z0-9_-]+)$/ ); if ( ! match ) { continue; }
				if ( ! fragments.has( match[2] ) ) { fragments.set( match[2], {} ); } fragments.get( match[2] )[ match[1] ] = comment;
			}
			lieveContext.walkNodes( [ lieveContext.findNode( lieveContext.state.document.children, node.id ) || node ], ( item ) => {
				const instances = visual.querySelectorAll( '[data-lieve-listing-source="' + window.CSS.escape( item.id ) + '"]' );
				if ( instances.length ) { instances.forEach( root => prepareEditorRoot( root, item, false, true ) ); return; }
				if ( item.type === 'html' && ! lieveContext.styles?.htmlHasWrapper( item ) ) {
					const fragment = fragments.get( item.id );
					if ( fragment?.start && fragment?.end ) { prepareHtmlFragment( visual, item, fragment.start, fragment.end ); }
					else if ( rawHtml && item.id === node.id ) { prepareHtmlFragment( visual, item ); }
					return;
				}
				// Cached previews may still carry the previous data value; their HTML ID is stable.
				visual.querySelectorAll( '[data-lieve-id="' + lieveContext.styles.elementDataId( item ) + '"], [id="' + lieveContext.styles.elementHtmlId( item ) + '"]' ).forEach( ( root ) => { prepareEditorRoot( root, item ); root.removeAttribute( 'style' ); if ( item.type === 'image' ) { root.querySelector( 'img' )?.removeAttribute( 'style' ); } } );
			} );
			// Preview CSS is managed by the shared editor compiler.
			const componentStyles = node.type === 'component' ? Array.from( visual.querySelectorAll( 'style[data-lieve-styles]' ), item => item.textContent ).join('\n') : '';
			if ( node.type === 'component' ) {
				const owner = lieveContext.canvas.ownerDocument || document; let sheet = owner.querySelector( 'style[data-component-preview="' + window.CSS.escape( node.id ) + '"]' );
				if ( ! sheet ) { sheet = owner.createElement('style'); sheet.dataset.componentPreview = node.id; owner.head.insertBefore(sheet, owner.getElementById('lieve-canvas-styles')); } sheet.textContent = componentStyles;
			}
			visual.querySelectorAll( 'style[data-lieve-styles]' ).forEach( ( item ) => item.remove() );
			if ( exact || node.type === 'dropdown' ) { registerPreviewControls( node, visual ); }
			window.LieveListings?.mount( visual, true );
			window.LieveCodePreview?.mount( visual, { select: id => { lieveContext.closeContextMenu(); if ( lieveContext.findNode( lieveContext.state.document.children, id ) ) selectElement( id ); }, contextMenu: ( id, x, y, origin ) => { if ( lieveContext.findNode( lieveContext.state.document.children, id ) ) { lieveContext.openContextMenu( id, x, y ); lieveContext.contextReturnFocus = origin; } }, resize: () => { updateSelectionOutline(); lieveContext.canvasDrag?.invalidate(); } } );
			revealSelectedPreview();
			if ( visual.isConnected ) { renderCanvasStyles(); }
		}
		// A PHP fragment with live PHP preview off is not a faithful rendered page.
		// Never display stripped PHP branches or raw CSS as if it were the result.
		if ( node.type === 'html' && /<\?(?:php\b|=)/i.test( node.props?.content || '' ) && ! phpRecord ) {
			const available = lieveContext.config.customCode?.phpEnabled && lieveContext.config.customCode?.canAuthor;
			display( '<div data-editor-ui class="lieve-code-preview-notice"><strong>PHP preview is off</strong><span>' + ( available ? 'Enable Live PHP preview in Content to keep this widget up to date.' : 'PHP execution is disabled or requires an authorized code administrator.' ) + '</span><small>Editor preview only · no server code has been executed</small></div>' );
			return;
		}
		if ( phpRecord && typeof phpRecord.html === 'string' ) { display( phpRecord.html ); return; }
		if ( lieveContext.elementPreviews.has( key ) ) { display( lieveContext.elementPreviews.get( key ) ); return; }
		if ( lieveContext.latestPreviews.has( node.id ) ) { display( lieveContext.latestPreviews.get( node.id ), false ); }
		else if ( node.type === 'html' ) { visual.innerHTML = '<div data-editor-ui class="lieve-code-preview-loading" role="status" aria-label="Loading Custom Code preview"><span aria-hidden="true"></span></div>'; }
		else { visual.innerHTML = '<div data-editor-ui class="lieve-editor-preview-message">Loading ' + lieveContext.escapeHtml( lieveContext.labels[ node.type ] || node.type ) + '…</div>'; }
		if ( ! lieveContext.config.elementPreviewUrl ) { if ( ! lieveContext.latestPreviews.has( node.id ) ) { visual.innerHTML = '<div data-editor-ui class="lieve-editor-preview-message">The preview is unavailable. Reload the editor to try again.</div>'; } return; }
		let job = old && old.key === key && ! old.controller.signal.aborted ? old : null;
		if ( ! job ) {
			job = { key, controller: new AbortController() };
			lieveContext.previewJobs.set( node.id, job );
			job.promise = ( async () => {
				if ( ! immediate ) { await new Promise( ( resolve ) => { job.timer = window.setTimeout( resolve, node.type === 'html' ? 450 : 140 ); job.controller.signal.addEventListener( 'abort', resolve, { once: true } ); } ); }
				if ( job.controller.signal.aborted ) { return null; }
				// Successful results are reused above. An aborted/failed live request
				// must not silently fall back to a passive, PHP-stripped response.
				job.executePHP = Boolean( phpRecord ); if ( job.executePHP ) { phpRecord.consumed = true; }
				const response = await ( window.LieveTransport?.fetch || fetch )(  lieveContext.config.elementPreviewUrl, { method: 'POST', credentials: 'same-origin', signal: job.controller.signal, headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': lieveContext.config.nonce }, body: JSON.stringify( { node: previewNode, executeCustomCode: job.executePHP } ) } );
				const result = await response.json(); if ( ! response.ok ) { throw new Error( result.message || 'Preview unavailable.' ); } return result;
			} )();
		}
		try {
			const result = await job.promise;
			if ( ! result || job.controller.signal.aborted ) { return; }
			if ( job.executePHP && phpRecord === lieveContext.phpPreviewSources.get( node.id ) ) { phpRecord.html = result.html; }
			if ( lieveContext.elementPreviews.size >= 200 ) { lieveContext.elementPreviews.delete( lieveContext.elementPreviews.keys().next().value ); }
			lieveContext.elementPreviews.set( key, result.html );
			if ( ! isCurrent() ) { return; }
			if ( lieveContext.latestPreviews.size >= 400 ) { lieveContext.latestPreviews.delete( lieveContext.latestPreviews.keys().next().value ); }
			lieveContext.latestPreviews.set( node.id, result.html );
			if ( visual.isConnected ) { display( result.html ); }
		} catch ( error ) {
			if ( error.name === 'AbortError' || job.controller.signal.aborted || ! isCurrent() || ! visual.isConnected ) { return; }
			visual.innerHTML = '<div data-editor-ui class="lieve-editor-preview-message">' + lieveContext.escapeHtml( error.message ) + '</div>';
		} finally {
			if ( lieveContext.previewJobs.get( node.id ) === job ) { lieveContext.previewJobs.delete( node.id ); }
		}
	}

	function selectElement( id ) {
		lieveContext.richTextController?.flush(); lieveContext.codeFields?.flush();
		// Explicitly clicking even the auto-selected element chooses a new insertion context.
		lieveContext.catalogueInsertion = null;
		const wasPopup = lieveContext.popupPanelOpen; lieveContext.popupPanelOpen = false; document.getElementById( 'lieve-popup-settings' )?.setAttribute( 'aria-expanded', 'false' );
		if ( lieveContext.state.selectedId === id && ! wasPopup ) { return; }
		lieveContext.activeClassId = null; if ( lieveContext.styleState === 'disabled' ) { lieveContext.styleState = 'normal'; } lieveContext.classWorkspace?.breakGroup();
		lieveContext.liveEdit = null; lieveContext.state.selectedId = id;
		const type = lieveContext.findNode( lieveContext.state.document.children, id )?.type;
		if ( ! lieveContext.config.styleTargets?.[ type ]?.[ lieveContext.styleTarget ] ) { lieveContext.styleTarget = 'root'; }
		lieveContext.canvas.querySelectorAll( '.lieve-editor-node' ).forEach( ( item ) => item.classList.toggle( 'is-selected', item.dataset.id === id ) );
		revealSelectedPreview();
		lieveContext.renderStructure(); lieveContext.renderInspector(); renderCanvasStyles(); lieveContext.updateButtons();
		if ( wasPopup ) { lieveContext.renderTemplateSettings(); }
	}

	function renderCanvasStyles() {
		if ( ! lieveContext.styles ) { return; }
		lieveContext.styles.configureVariables( lieveContext.designSystem?.variables() || lieveContext.config.designSystem?.data?.variables || [] );
		const owner = lieveContext.canvas.ownerDocument || document;
		let sheet = owner.getElementById( 'lieve-canvas-styles' );
		if ( ! sheet ) { sheet = owner.createElement( 'style' ); sheet.id = 'lieve-canvas-styles'; owner.head.appendChild( sheet ); }
		let css = ( lieveContext.designSystem?.css( lieveContext.styleDevice ) || '' ) + ( lieveContext.classWorkspace?.css( lieveContext.styleDevice ) || '' ) + ( lieveContext.templateContext?.css( lieveContext.styleDevice ) || '' );
		if ( lieveContext.isPopupTemplate() ) {
			css += lieveContext.styles.editorCss( lieveContext.popupStyleNode(), lieveContext.config.styleTargets?.[ 'popup-shell' ], lieveContext.styleDevice, lieveContext.popupPanelOpen ? lieveContext.styleState : 'normal' );
			const shell = lieveContext.canvas.querySelector( '[data-editor-popup-shell]' );
			if ( shell ) {
				shell.dataset.lievePopupOverlay = lieveContext.state.popupSettings.overlay ? 'on' : 'off';
				let close = shell.querySelector( '[data-lieve-ui="popup-close"]' );
				if ( lieveContext.state.popupSettings.closeButton && ! close ) { close = owner.createElement( 'button' ); close.type = 'button'; close.dataset.lieveUi = 'popup-close'; close.dataset.editorUi = ''; close.setAttribute( 'aria-label', 'Edit close button' ); close.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'; close.addEventListener( 'click', event => { event.stopPropagation(); lieveContext.openPopupSettings( 'style', 'close' ); } ); shell.querySelector( '[data-lieve-ui="popup-dialog"]' ).prepend( close ); controlRegistry?.register( close, 'popup-close-settings', shell, () => lieveContext.isPopupTemplate() && lieveContext.state.popupSettings.closeButton ); }
				if ( ! lieveContext.state.popupSettings.closeButton ) { close?.remove(); }
			}
		}
		const sharedClass = lieveContext.editingClass(); if ( sharedClass && lieveContext.classWorkspace.isActive( sharedClass.id ) ) { css += window.LieveClassStyles.preview( sharedClass, lieveContext.state.selectedId, lieveContext.styleDevice, lieveContext.styleState, lieveContext.config.breakpoints ); }
		lieveContext.walkNodes( lieveContext.state.document.children, ( node ) => { css += lieveContext.styles.editorCss( window.LieveListingEditor && lieveContext.listingAncestor( node ) ? window.LieveListingEditor.localStyleNode( node ) : node, lieveContext.config.styleTargets?.[ node.type ], lieveContext.styleDevice, lieveContext.state.selectedId === node.id ? lieveContext.styleState : 'normal' ); if ( window.LieveListingEditor?.enabled( node ) ) { css += window.LieveListingEditor.css( node, lieveContext.styleDevice, lieveContext.config.breakpoints ); } } );
		sheet.textContent = css;
		window.LieveCodePreview?.refresh( lieveContext.canvas );
		// Resolve swatches against the updated canvas CSS, including token drafts, rollback and breakpoint changes.
		// Refresh in place: keep variable references, field focus and inspector scroll untouched.
		lieveContext.inspector.querySelectorAll( '[data-style-library]' ).forEach( button => lieveContext.refreshStyleColorSwatch( button.dataset.styleLibrary ) );
		lieveContext.templateContext?.measure( lieveContext.canvas );
		window.cancelAnimationFrame( lieveContext.selectionFrame ); lieveContext.selectionFrame = window.requestAnimationFrame( updateSelectionOutline );
		lieveContext.canvasDrag?.invalidate();
		controlRegistry?.changed();
	}

	function observeSelectionLayout( roots ) {
		if ( ! window.ResizeObserver ) { return; }
		const targets = roots.length ? [ lieveContext.canvas, lieveContext.viewport?.stage || lieveContext.canvas.closest( '.lieve-stage-scroll' ), ...roots ] : [];
		if ( targets.length === lieveContext.selectionObservedTargets.length && targets.every( ( target, index ) => target === lieveContext.selectionObservedTargets[ index ] ) ) { return; }
		if ( ! lieveContext.selectionResizeObserver ) { lieveContext.selectionResizeObserver = new window.ResizeObserver( updateSelectionOutline ); }
		lieveContext.selectionResizeObserver.disconnect();
		lieveContext.selectionObservedTargets = targets;
		// Measure after layout, before paint, including every frame of a breakpoint resize.
		targets.forEach( target => lieveContext.selectionResizeObserver.observe( target, { box: 'border-box' } ) );
	}

	function updateSelectionOutline() {
		if ( ! lieveContext.selectionOutline ) { lieveContext.selectionOutline = document.createElement( 'div' ); lieveContext.selectionOutline.className = 'lieve-selection-outline'; lieveContext.selectionOutline.setAttribute( 'aria-hidden', 'true' ); lieveContext.selectionOutline.innerHTML = '<span></span>'; lieveContext.app.appendChild( lieveContext.selectionOutline ); }
		let roots = lieveContext.state.selectedId ? Array.from( lieveContext.canvas.querySelectorAll( '[data-editor-root="' + window.CSS.escape( lieveContext.state.selectedId ) + '"]' ) ) : [];
		if ( roots.some( root => root.closest?.( '[data-lieve-listing-item][data-listing-position]' ) ) ) { const all = roots; const position = lieveContext.selectedListingPosition || roots[0]?.closest( '[data-lieve-listing-item]' )?.dataset.listingPosition; roots = roots.filter( root => root.closest( '[data-lieve-listing-item]' )?.dataset.listingPosition === position ); roots = [ roots[0] || all[0] ]; all.forEach( root => root.classList.toggle( 'is-selected', roots.includes( root ) ) ); }
		observeSelectionLayout( roots );
		const rects = roots.map( ( root ) => lieveContext.viewport ? lieveContext.viewport.toParent( root.getBoundingClientRect() ) : root.getBoundingClientRect() ).filter( ( rect ) => rect.width && rect.height );
		if ( ! rects.length ) { lieveContext.selectionOutline.hidden = true; return; }
		const rect = { left: Math.min( ...rects.map( ( item ) => item.left ) ), right: Math.max( ...rects.map( ( item ) => item.right ) ), top: Math.min( ...rects.map( ( item ) => item.top ) ), bottom: Math.max( ...rects.map( ( item ) => item.bottom ) ) }; const stage = lieveContext.viewport ? lieveContext.viewport.bounds() : lieveContext.canvas.closest( '.lieve-stage-scroll' ).getBoundingClientRect();
		const left = Math.max( rect.left, stage.left ); const right = Math.min( rect.right, stage.right ); const top = Math.max( rect.top, stage.top + ( lieveContext.viewport ? 0 : 20 ) ); const bottom = Math.min( rect.bottom, stage.bottom );
		lieveContext.selectionOutline.hidden = right <= left || bottom <= top;
		Object.assign( lieveContext.selectionOutline.style, { left: left + 'px', top: top + 'px', width: ( right - left ) + 'px', height: ( bottom - top ) + 'px' } );
		const node = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId ); lieveContext.selectionOutline.querySelector( 'span' ).textContent = node?.props.editorLabel || lieveContext.labels[ node?.type ] || '';
	}

	function renderCanvasElement( key ) {
		if ( identityRegistry?.stats().destroyed ) { return false; }
		const node = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId );
		if ( ! node || ! key.startsWith( node.id + ':prop:' ) || lieveContext.listingEditor?.enabled( node ) || lieveContext.listingAncestor( node ) || lieveContext.dynamicData?.parse( node.props?.url ) ) { return false; }
		const frames = lieveContext.canvas.querySelectorAll( '.lieve-editor-frame[data-id="' + window.CSS.escape( node.id ) + '"]' );
		if ( frames.length !== 1 ) { return false; }
		lieveContext.motionEditor?.stop(); window.LieveListings?.destroy( frames[0] );
		const parentOwner = canvasIdentity().parent( frames[0] ); canvasIdentity().invalidate( frames[0] );
		frames[0].replaceWith( createNodeElement( node, parentOwner ) );
		lieveContext.dynamicData?.hydrate( lieveContext.state.document, lieveContext.config.nonce, () => { renderCanvas(); renderCanvasStyles(); } );
		revealSelectedPreview(); renderCanvasStyles(); window.LieveCodePreview?.refresh?.( lieveContext.canvas ); lieveContext.canvasDrag?.invalidate(); return true;
	}

	function renderCanvas() {
		if ( identityRegistry?.stats().destroyed ) { return; }
		canvasIdentity().reset();
		controlRegistry?.reset();
		lieveContext.motionEditor?.stop();
		window.LieveListings?.destroy( lieveContext.canvas );
		lieveContext.dynamicData?.hydrate( lieveContext.state.document, lieveContext.config.nonce, () => { renderCanvas(); renderCanvasStyles(); } );
		const previousShell = lieveContext.canvas.querySelector( '[data-editor-popup-shell]' ); if ( previousShell ) { window.LievePopups?.cancelPreview( previousShell ); }
		const activeIds = new Set(); lieveContext.walkNodes( lieveContext.state.document.children, ( node ) => activeIds.add( node.id ) );
		( lieveContext.canvas.ownerDocument || document ).querySelectorAll('style[data-component-preview]').forEach(sheet => { if(!activeIds.has(sheet.dataset.componentPreview))sheet.remove(); });
		lieveContext.phpPreviewSources.forEach( ( record, id ) => { if ( ! activeIds.has( id ) ) { lieveContext.phpPreviewSources.delete( id ); } } );
		lieveContext.previewJobs.forEach( ( job, id ) => { if ( ! activeIds.has( id ) ) { job.controller.abort(); window.clearTimeout( job.timer ); lieveContext.previewJobs.delete( id ); } } );
		lieveContext.canvas.innerHTML = '';
		void lieveContext.templateContext?.refresh( lieveContext.state.headerTemplateId, lieveContext.state.footerTemplateId );
		const inheritedIdentity = ( preview, placement ) => {
			const owner = canvasIdentity().owner( { id: null, selectId: null, type: 'template', kind: 'inherited-template', context: { key: placement.key, position: placement.position, contents: 'unmapped' } } );
			canvasIdentity().register( preview, owner, 'opaque' );
		};
		lieveContext.templateContext?.append( 'before', lieveContext.canvas, inheritedIdentity );
		let contentCanvas = lieveContext.canvas;
		if ( lieveContext.isPopupTemplate() ) {
			const shell = lieveContext.canvas.ownerDocument.createElement( 'div' ); shell.dataset.editorPopupShell = ''; shell.dataset.editorRoot = lieveContext.popupStyleId; shell.dataset.lieveUi = 'popup';
			canvasIdentity().register( shell, canvasIdentity().owner( { id: lieveContext.popupStyleId, selectId: null, type: 'popup-shell', kind: 'popup-shell', context: { contents: 'unmapped' } } ), 'opaque' );
			shell.innerHTML = '<div data-lieve-ui="popup-backdrop" aria-hidden="true"></div><div data-lieve-ui="popup-dialog" class="lieve-builder-content"></div>';
			shell.querySelector( '[data-lieve-ui="popup-backdrop"]' ).addEventListener( 'click', () => lieveContext.openPopupSettings() );
			lieveContext.canvas.appendChild( shell ); contentCanvas = shell.querySelector( '[data-lieve-ui="popup-dialog"]' );
			controlRegistry?.register( shell.firstElementChild, 'popup-backdrop', shell, () => lieveContext.isPopupTemplate() );
		}

		if ( ! lieveContext.state.document.children.length ) {
			const empty = document.createElement( 'div' );
			canvasIdentity().register( empty, canvasIdentity().owner( { id: null, selectId: null, type: 'empty-canvas', kind: 'empty-canvas' } ), 'descendants' );
			empty.className = 'lieve-canvas-empty';
			empty.dataset.editorUi = '';
			empty.innerHTML = '<div class="lieve-empty-symbol">' + lieveContext.elementIcon( 'section' ) + '</div><strong>Your canvas. Your ideas.</strong><span>Start with a section, then add elements from the library. Everything stays unstyled until you make it yours.</span><button type="button" class="lieve-button-primary">Add your first section</button>';
			empty.querySelector( 'button' ).addEventListener( 'click', () => lieveContext.addBlock( 'section' ) );
			if ( lieveContext.isPopupTemplate() ) { empty.innerHTML = '<strong>Your pop up. Your ideas.</strong><span>Add content, then style the dialog in Pop Up Settings.</span><button type="button" class="lieve-button-secondary">+ Add Something</button>'; empty.querySelector( 'button' ).addEventListener( 'click', () => lieveContext.addBlock( 'section' ) ); }
			contentCanvas.appendChild( empty );
			controlRegistry?.register( empty.querySelector( 'button' ), 'empty-add', lieveContext.canvas, () => ! lieveContext.state.document.children.length );
			lieveContext.templateContext?.append( 'after', lieveContext.canvas, inheritedIdentity );
			renderCanvasStyles();
			return;
		}

		lieveContext.state.document.children.forEach( ( node ) => contentCanvas.appendChild( createNodeElement( node ) ) );
		lieveContext.templateContext?.append( 'after', lieveContext.canvas, inheritedIdentity );
		revealSelectedPreview();
		renderCanvasStyles();
	}
	return { canvasIdentity, canvasControls, styleString, createChildren, createNodeElement, prepareEditorRoot, prepareHtmlFragment, editorBounds, previewNodeData, previewKey, seedElementPreviews, handlePreviewInteraction, revealSelectedPreview, clearDropIndicators, loadElementPreview, selectElement, renderCanvasStyles, observeSelectionLayout, updateSelectionOutline, renderCanvasElement, renderCanvas };
	};
} )();
