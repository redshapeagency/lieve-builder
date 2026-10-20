/* Editor chrome preferences are separate from page content and its undo history. */
( function () {
	'use strict';
	/* Release field focus on blank chrome, including the empty area of a wrapping
	 * field label. Never intercept actual controls, captions or keyboard focus.
	 * Delegation also covers fields created later in repeaters and manager modals. */
	function createFieldFocus( { app, documents = [] } ) {
		const owner = app.ownerDocument || document;
		const roots = [ ...new Set( [ owner, ...documents ] ) ].filter( root => root?.addEventListener );
		const interactive = 'input, textarea, select, button, a[href], summary, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"]), [role="button"], [role="combobox"], [role="option"], [role="menuitem"], [draggable="true"]';
		const fieldLabel = 'label.lieve-control, label.lieve-ds-field, label.lieve-ds-override';
		function outside( event ) {
			if ( event.defaultPrevented || event.button !== 0 || event.isPrimary === false || ( event.type === 'click' && event.detail === 0 ) ) { return; }
			const target = event.target?.closest ? event.target : event.target?.parentElement;
			if ( ! target ) { return; }
			// A caption remains a real label. Only the wrapping label's own blank
			// surface stops acting as a second, oversized input hit area.
			const bareLabel = app.contains( target ) && target.matches( fieldLabel );
			// Pointerdown owns outside-focus release. Click only cancels the label's
			// later native activation, never a focus return performed by modal close.
			if ( event.type === 'click' && ! bareLabel ) { return; }
			if ( ! bareLabel && ( target.closest( interactive ) || target.closest( 'label, .CodeMirror' ) ) ) { return; }
			if ( bareLabel && event.type === 'click' ) { event.preventDefault(); }
			const active = owner.activeElement;
			if ( ! active || active === target || ! app.contains( active ) ) { return; }
			const field = active.matches( 'input, textarea, select, .lieve-ds-select-trigger, [role="combobox"]' );
			const compoundAction = active.matches( 'button, a[href]' ) && active.closest( '.lieve-style-input, .lieve-element-search, .lieve-ds-search, .lieve-widget-category-picker' );
			if ( field || compoundAction ) { active.blur(); }
		}
		roots.forEach( root => { root.addEventListener( 'pointerdown', outside ); root.addEventListener( 'click', outside ); } );
		return { destroy() { roots.forEach( root => { root.removeEventListener( 'pointerdown', outside ); root.removeEventListener( 'click', outside ); } ); } };
	}
	/* Visual-grid navigation shared by the two sidebars and filtered style tabs.
	 * Vertical movement stays in its column, including incomplete final rows. */
	function gridTabIndex( key, index, count, columns = 1 ) {
		if ( ! Number.isInteger( count ) || count < 1 || ! Number.isInteger( index ) || index < 0 || index >= count ) { return null; }
		if ( key === 'Home' ) { return 0; }
		if ( key === 'End' ) { return count - 1; }
		if ( key === 'ArrowLeft' || key === 'ArrowRight' ) { return ( index + ( key === 'ArrowLeft' ? -1 : 1 ) + count ) % count; }
		if ( key !== 'ArrowUp' && key !== 'ArrowDown' ) { return null; }
		columns = Math.max( 1, Math.min( count, Math.floor( Number( columns ) ) || 1 ) );
		const column = index % columns; const columnRows = Math.floor( ( count - 1 - column ) / columns ) + 1;
		const row = Math.floor( index / columns );
		return ( ( row + ( key === 'ArrowUp' ? -1 : 1 ) + columnRows ) % columnRows ) * columns + column;
	}
	function sanitizePins( value, elements ) {
		return Array.isArray( value ) ? [ ...new Set( value.filter( type => typeof type === 'string' && Object.hasOwn( elements, type ) ) ) ] : [];
	}
	function validBreakpoints( value ) {
		return Boolean( value && Number.isInteger( value.tablet ) && Number.isInteger( value.mobile ) && value.tablet >= 320 && value.tablet <= 2560 && value.mobile >= 240 && value.mobile < value.tablet );
	}
	const panelLayout = window.LievePanelLayout;
	const panelLimits = panelLayout?.limits, panelDefaults = panelLayout?.defaults, sanitizePanelWidths = panelLayout?.sanitize, fitPanelWidths = panelLayout?.fit;
	function createPanelResize( { app, storageKey } ) {
		const workspace = app.querySelector( '.lieve-editor-workspace' );
		const handles = [ ...app.querySelectorAll( '[data-resize-panel]' ) ];
		if ( ! panelLayout || ! workspace || handles.length !== 2 ) { return null; }
		let preferences = panelLayout.read( storageKey );
		let current = panelDefaults( workspace.clientWidth ); let drag = null; let pendingFrame = 0;
		function persist() { try { if ( storageKey ) { window.localStorage.setItem( storageKey, JSON.stringify( preferences ) ); } } catch ( error ) { /* Restricted/quota-full storage must not block the editor. */ } }
		function render() {
			const width = workspace.clientWidth; const compact = window.innerWidth <= 900;
			current = fitPanelWidths( preferences, width );
			for ( const side of Object.keys( panelLimits ) ) {
				if ( compact ) { app.style.removeProperty( '--lv-' + side ); } else { app.style.setProperty( '--lv-' + side, current[ side ] + 'px' ); }
			}
			handles.forEach( handle => {
				const side = handle.dataset.resizePanel; const other = side === 'left' ? 'right' : 'left';
				handle.hidden = compact; handle.tabIndex = compact ? -1 : 0;
				handle.setAttribute( 'aria-valuemin', String( panelLimits[ side ].min ) );
				handle.setAttribute( 'aria-valuemax', String( Math.max( panelLimits[ side ].min, Math.min( panelLimits[ side ].max, width - current[ other ] - 320 ) ) ) );
				handle.setAttribute( 'aria-valuenow', String( current[ side ] ) );
				handle.setAttribute( 'aria-valuetext', current[ side ] + ' pixels' );
			} );
		}
		function change( side, value ) {
			const other = side === 'left' ? 'right' : 'left';
			const max = Math.max( panelLimits[ side ].min, Math.min( panelLimits[ side ].max, workspace.clientWidth - current[ other ] - 320 ) );
			// Once the user adjusts a fitted layout, keep the opposite panel still
			// instead of refitting an oversized preference behind the pointer.
			if ( preferences[ other ] !== null && preferences[ other ] !== current[ other ] ) { preferences[ other ] = current[ other ]; }
			preferences[ side ] = Math.round( Math.max( panelLimits[ side ].min, Math.min( max, value ) ) ); render();
		}
		function flush() {
			window.cancelAnimationFrame( pendingFrame ); pendingFrame = 0;
			if ( drag?.next !== undefined ) { change( drag.side, drag.next ); delete drag.next; }
		}
		function finish( accept ) {
			if ( ! drag ) { return; }
			flush(); const previous = drag; drag = null;
			if ( ! accept ) { preferences = previous.preferences; render(); } else { persist(); }
			app.classList.remove( 'is-resizing-panels' ); previous.handle.blur();
			if ( previous.handle.hasPointerCapture( previous.pointerId ) ) { previous.handle.releasePointerCapture( previous.pointerId ); }
		}
		handles.forEach( handle => {
			const side = handle.dataset.resizePanel;
			handle.addEventListener( 'pointerdown', event => {
				if ( event.button !== 0 || ! event.isPrimary || window.innerWidth <= 900 || drag ) { return; }
				event.preventDefault(); handle.focus( { preventScroll: true } );
				drag = { side, handle, pointerId: event.pointerId, start: event.clientX, width: current[ side ], preferences: { ...preferences } };
				handle.setPointerCapture( event.pointerId ); app.classList.add( 'is-resizing-panels' );
			} );
			handle.addEventListener( 'pointermove', event => {
				if ( ! drag || drag.handle !== handle || drag.pointerId !== event.pointerId ) { return; }
				drag.next = drag.width + ( event.clientX - drag.start ) * ( side === 'left' ? 1 : -1 );
				if ( ! pendingFrame ) { pendingFrame = window.requestAnimationFrame( flush ); }
			} );
			handle.addEventListener( 'pointerup', event => { if ( drag?.pointerId === event.pointerId ) { finish( true ); } } );
			handle.addEventListener( 'pointercancel', () => finish( false ) );
			handle.addEventListener( 'lostpointercapture', () => finish( false ) );
			handle.addEventListener( 'dblclick', () => { preferences[ side ] = null; render(); persist(); } );
			handle.addEventListener( 'keydown', event => {
				if ( window.innerWidth <= 900 || drag || ! [ 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter' ].includes( event.key ) ) { return; }
				event.preventDefault();
				if ( event.key === 'Enter' ) { preferences[ side ] = null; render(); }
				else { const value = event.key === 'Home' ? panelLimits[ side ].min : event.key === 'End' ? panelLimits[ side ].max : current[ side ] + ( event.key === 'ArrowRight' ? 1 : -1 ) * ( side === 'left' ? 1 : -1 ) * ( event.shiftKey ? 40 : 10 ); change( side, value ); }
				persist();
			} );
		} );
		const resize = () => { if ( drag ) { finish( false ); } render(); };
		const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver( resize ) : null; observer?.observe( workspace );
		window.addEventListener( 'resize', resize ); window.addEventListener( 'blur', () => finish( false ) );
		app.addEventListener( 'keydown', event => { if ( drag && event.key === 'Escape' ) { event.preventDefault(); finish( false ); } } );
		function reset() { finish( false ); preferences = sanitizePanelWidths( null ); render(); persist(); }
		app.querySelector( '[data-reset-panel-widths]' )?.addEventListener( 'click', reset );
		render();
		return { reset };
	}
	function create( { app, config, onAddBlock, onCatalogueChange, onBreakpointsChange, onError } ) {
		const catalogue = app.querySelector( '#lieve-element-catalogue' );
		const pinnedLibrary = app.querySelector( '#lieve-pinned-library' );
		const search = app.querySelector( '#lieve-element-search' );
		const originals = new Map( [ ...catalogue.querySelectorAll( '.lieve-element-tile' ) ].map( tile => [ tile.dataset.elementType, tile ] ) );
		let pinned = sanitizePins( config.pinnedElements, config.elements || {} );
		let savedPins = [ ...pinned ];
		let savingPins = false;
		const samePins = ( a, b ) => JSON.stringify( a ) === JSON.stringify( b );

		async function request( url, value ) {
			const response = await ( window.LieveTransport?.fetch || window.fetch.bind( window ) )(  url, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': config.nonce }, body: JSON.stringify( value ) } );
			const result = await response.json();
			if ( ! response.ok ) { throw new Error( result.message || 'Unable to save editor settings.' ); }
			return result;
		}

		const appearance = app.querySelector( '#lieve-appearance-toggle' );
		let colorMode = config.colorMode === 'dark' ? 'dark' : 'light';
		let savedColorMode = colorMode;
		let savingAppearance = false;
		function renderAppearance() {
			app.dataset.colorMode = colorMode;
			const label = colorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
			appearance.setAttribute( 'aria-label', label ); appearance.dataset.tooltip = label;
			appearance.setAttribute( 'aria-pressed', String( colorMode === 'dark' ) );
			appearance.querySelectorAll( '[data-appearance-icon]' ).forEach( icon => { icon.hidden = icon.dataset.appearanceIcon !== colorMode; } );
		}
		async function persistAppearance() {
			if ( savingAppearance ) { return; }
			savingAppearance = true;
			try {
				while ( colorMode !== savedColorMode ) {
					const sent = colorMode;
					const result = await request( config.appearanceUrl, { colorMode: sent } );
					if ( ! [ 'light', 'dark' ].includes( result.colorMode ) ) { throw new Error( 'Invalid editor-appearance response.' ); }
					savedColorMode = result.colorMode; config.colorMode = savedColorMode;
					if ( colorMode === sent ) { colorMode = savedColorMode; renderAppearance(); }
				}
			} catch ( error ) {
				colorMode = savedColorMode; renderAppearance();
				onError( error.message || 'Editor appearance could not be saved.' );
			} finally { savingAppearance = false; }
		}
		appearance.addEventListener( 'click', () => { colorMode = colorMode === 'dark' ? 'light' : 'dark'; renderAppearance(); void persistAppearance(); } );
		renderAppearance();

		function renderPinned() {
			pinnedLibrary.replaceChildren( ...pinned.filter( type => originals.has( type ) ).map( type => {
				const tile = originals.get( type ).cloneNode( true );
				tile.hidden = false;
				const insert = tile.querySelector( '[data-add-block]' );
				insert.hidden = false;
				insert.dataset.elementSearch += ' pinned';
				return tile;
			} ) );
			catalogue.querySelectorAll( '[data-pin-element]' ).forEach( button => {
				const type = button.dataset.pinElement;
				const active = pinned.includes( type );
				const label = ( active ? 'Unpin ' : 'Pin ' ) + ( config.elements[ type ]?.label || type );
				button.setAttribute( 'aria-pressed', String( active ) );
				button.setAttribute( 'aria-label', label ); button.title = label;
			} );
			onCatalogueChange();
		}

		async function persistPins() {
			if ( savingPins ) { return; }
			savingPins = true;
			try {
				// Serialize requests so a slower earlier response cannot overwrite a newer pin list.
				while ( ! samePins( pinned, savedPins ) ) {
					const sent = [ ...pinned ];
					const result = await request( config.pinsUrl, { pinnedElements: sent } );
					if ( ! Array.isArray( result.pinnedElements ) ) { throw new Error( 'Invalid pinned-elements response.' ); }
					savedPins = sanitizePins( result.pinnedElements, config.elements || {} );
					if ( samePins( pinned, sent ) && ! samePins( pinned, savedPins ) ) { pinned = [ ...savedPins ]; renderPinned(); }
				}
			} catch ( error ) {
				pinned = [ ...savedPins ]; renderPinned();
				onError( error.message || 'Pinned elements could not be saved.' );
			} finally { savingPins = false; }
		}

		catalogue.addEventListener( 'click', event => {
			const pin = event.target.closest( '[data-pin-element]' );
			if ( pin ) {
				event.preventDefault(); event.stopPropagation();
				const type = pin.dataset.pinElement;
				if ( ! originals.has( type ) ) { return; }
				const wasPinnedCard = Boolean( pin.closest( '#lieve-pinned-category' ) );
				pinned = pinned.includes( type ) ? pinned.filter( item => item !== type ) : [ ...pinned, type ];
				renderPinned();
				if ( wasPinnedCard ) {
					const next = [ ...pinnedLibrary.querySelectorAll( '[data-pin-element]' ) ].find( button => button.dataset.pinElement === type ) || originals.get( type ).querySelector( '[data-pin-element]' );
					if ( next.getClientRects().length ) { next.focus(); } else { search.focus(); }
				}
				void persistPins(); return;
			}
			const insert = event.target.closest( '[data-add-block]' );
			if ( insert && ! insert.disabled ) { onAddBlock( insert.dataset.addBlock ); }
		} );
		renderPinned();

		const toolbar = app.querySelector( '.lieve-workspace-tools' );
		const tools = [ ...toolbar.querySelectorAll( 'a, button' ) ];
		tools.forEach( ( tool, index ) => { tool.tabIndex = index ? -1 : 0; } );
		toolbar.addEventListener( 'focusin', event => tools.forEach( tool => { tool.tabIndex = tool === event.target ? 0 : -1; } ) );
		toolbar.addEventListener( 'keydown', event => {
			if ( event.isComposing || ! [ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End' ].includes( event.key ) ) { return; }
			event.preventDefault();
			const index = tools.indexOf( document.activeElement );
			const columns = window.getComputedStyle( toolbar ).gridTemplateColumns.split( /\s+/ ).length;
			const next = gridTabIndex( event.key, index, tools.length, columns );
			if ( next !== null ) { tools[ next ].focus( { preventScroll: true } ); }
		} );

		const modal = app.querySelector( '#lieve-breakpoints-modal' );
		const form = modal.querySelector( 'form' );
		const open = app.querySelector( '#lieve-breakpoints-open' );
		const responsive = window.LieveResponsive.createManager( { form, config, modal, open, onChange: onBreakpointsChange, onError } );
		return { submitBreakpoints: responsive.submit, refreshBreakpoints: responsive.refresh };
	}
	window.LieveWorkspace = { create, sanitizePins, validBreakpoints, createPanelResize, sanitizePanelWidths, fitPanelWidths, gridTabIndex, createFieldFocus };
}() );
