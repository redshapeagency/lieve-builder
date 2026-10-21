/* The Classes manager reuses the Colors/Variables workspace without a second UI system. */
( function () {
	'use strict';
	const esc = value => String( value ?? '' ).replace( /[&<>"']/g, char => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' } )[ char ] );
	const glyph = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 8 8-5 8 5-8 5-8-5Zm0 5 8 5 8-5M4 18l8 5 8-5"/></svg>';
	const grip = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>';
	const manualNames = value => [ ...new Set( String( value || '' ).split( /\s+/ ).filter( Boolean ) ) ];
	function names( ids, items ) { const byId = new Map( items.filter( item => ! item.trashed ).map( item => [ item.id, item.name ] ) ); return [ ...new Set( ids || [] ) ].map( id => byId.get( id ) ).filter( Boolean ); }
	function assignmentNames( props, items ) { return [ ...new Set( [ ...names( props?.classIds, items ), ...manualNames( props?.className ) ] ) ]; }
	function assignedClass( props, id, items ) { const item = items.find( item => item.id === id && ! item.trashed ); return item && ( props?.classIds?.includes( id ) || manualNames( props?.className ).some( name => [ item.name, ...( item.aliases || [] ) ].includes( name ) ) ) ? item : null; }
	function summaryMarkup( props, items, editing = null, canManage = false ) {
		const assigned = assignmentNames( props, items );
		return assigned.length ? assigned.map( name => {
			const item = items.find( item => ! item.trashed && [ item.name, ...( item.aliases || [] ) ].includes( name ) );
			return item && canManage ? '<button type="button" data-summary-class-edit="' + esc( item.id ) + '" aria-pressed="' + ( editing === item.id ) + '" aria-label="' + ( editing === item.id ? 'Return to element styles from ' : 'Edit shared styles for ' ) + esc( '.' + name ) + '">' + esc( '.' + name ) + '</button>' : esc( '.' + name );
		} ).join( ', ' ) : 'No class';
	}
	const reorderGrip = ( key, name, disabled ) => '<button type="button" class="lieve-class-grip" data-class-grip="' + esc( key ) + '" aria-label="Reorder ' + esc( name ) + '" aria-describedby="lieve-class-reorder-help" data-tooltip="Drag to reorder · Arrow keys, Home or End"' + ( disabled ? ' disabled' : '' ) + '>' + grip + '</button>';
	function manualMarkup() { return '<div class="lieve-class-chips" data-manual-class-chips role="list" aria-label="Manual class order"></div>'; }
	/** Same grip-only Sortable behavior as Lieve's existing order editors. */
	function bindOrder( { list, read, write, refresh, announce } ) {
		if ( ! list ) { return null; }
		let sortable = null, dragging = false, disposed = false, cancelled = false, baseline = [], touch = null, dragSize = null;
		const key = item => item.dataset.classOrder;
		function focus( id ) { list.querySelector( '[data-class-grip="' + window.CSS.escape( id ) + '"]' )?.focus( { preventScroll: true } ); }
		function apply( ids, id ) { if ( disposed || ! list.isConnected || ids.length !== read().length || new Set( ids ).size !== ids.length || ids.some( item => ! read().includes( item ) ) ) { return; } if ( ids.some( ( item, index ) => item !== read()[ index ] ) ) { write( ids ); refresh(); announce( 'Class moved to position ' + ( ids.indexOf( id ) + 1 ) + '.' ); } focus( id ); }
		function keyboard( event ) { const button = event.target.closest( '[data-class-grip]' ); if ( ! button || ! [ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End' ].includes( event.key ) ) { return; } event.preventDefault(); event.stopPropagation(); const ids = [ ...read() ], from = ids.indexOf( button.dataset.classGrip ), to = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : Math.max( 0, Math.min( ids.length - 1, from + ( [ 'ArrowLeft', 'ArrowUp' ].includes( event.key ) ? -1 : 1 ) ) ); if ( from >= 0 ) { ids.splice( to, 0, ids.splice( from, 1 )[0] ); apply( ids, button.dataset.classGrip ); } }
		function escape( event ) { if ( event.key === 'Escape' && dragging && sortable ) { event.preventDefault(); event.stopPropagation(); cancelled = true; sortable.sortable( 'cancel' ); dragging = false; announce( 'Class reordering cancelled.' ); } }
		// Pointer capture supplies touch/pen tracking to the existing mouse-based sorter.
		function mouse( event, type, target ) { target.dispatchEvent( new MouseEvent( type, { bubbles: true, cancelable: true, view: window, clientX: event.clientX, clientY: event.clientY, button: 0, buttons: type === 'mouseup' ? 0 : 1 } ) ); }
		function pointerDown( event ) { const handle = event.target.closest( '[data-class-grip]' ); if ( disposed || ! sortable || touch || event.pointerType === 'mouse' || ! event.isPrimary || ! handle || handle.disabled ) { return; } event.preventDefault(); touch = { handle, id: event.pointerId }; handle.setPointerCapture( event.pointerId ); mouse( event, 'mousedown', handle ); }
		function pointerMove( event ) { if ( touch?.id !== event.pointerId ) { return; } event.preventDefault(); mouse( event, 'mousemove', document ); }
		function pointerUp( event ) { if ( touch?.id !== event.pointerId ) { return; } if ( event.type === 'pointercancel' && sortable ) { cancelled = true; sortable.sortable( 'cancel' ); } const previous = touch; touch = null; mouse( event, 'mouseup', document ); if ( previous.handle.hasPointerCapture( previous.id ) ) { previous.handle.releasePointerCapture( previous.id ); } }
		list.addEventListener( 'keydown', keyboard ); document.addEventListener( 'keydown', escape, true );
		list.addEventListener( 'pointerdown', pointerDown ); document.addEventListener( 'pointermove', pointerMove, { passive: false } ); document.addEventListener( 'pointerup', pointerUp ); document.addEventListener( 'pointercancel', pointerUp );
		function reset() {
			if ( sortable ) { if ( dragging ) { cancelled = true; sortable.sortable( 'cancel' ); dragging = false; } sortable.sortable( 'destroy' ); sortable = null; }
			if ( touch ) { const previous = touch; touch = null; if ( previous.handle.hasPointerCapture( previous.id ) ) { previous.handle.releasePointerCapture( previous.id ); } }
		}
		function mount() {
			if ( disposed || dragging ) { return; } reset(); const $ = window.jQuery; if ( read().length < 2 || ! $?.fn?.sortable ) { return; }
			sortable = $( list ); sortable.sortable( {
				items: '> [data-class-order]', handle: '[data-class-grip]', cancel: '[data-class-edit], [data-class-remove]', tolerance: 'pointer', distance: 5, scrollSensitivity: 30, scrollSpeed: 12, placeholder: 'lieve-class-sort-placeholder', forcePlaceholderSize: true,
				helper( event, item ) { dragSize = { width: item.outerWidth(), height: item.outerHeight() }; const helper = item.clone(); helper.attr( 'aria-hidden', 'true' ).addClass( 'lieve-class-sort-helper' ); helper.find( 'button' ).attr( 'tabindex', '-1' ); helper.css( { width: dragSize.width + 'px', height: dragSize.height + 'px', boxSizing: 'border-box' } ); return helper; },
				start( event, ui ) { baseline = [ ...read() ]; cancelled = false; dragging = true; ui.placeholder.css( { width: dragSize.width + 'px', height: dragSize.height + 'px', boxSizing: 'border-box' } ); },
				stop( event, ui ) { dragging = false; const id = key( ui.item[0] ); queueMicrotask( () => { if ( disposed ) { return; } if ( cancelled || JSON.stringify( baseline ) !== JSON.stringify( read() ) ) { refresh(); focus( id ); return; } const ids = Array.from( list.querySelectorAll( ':scope > [data-class-order]:not(.ui-sortable-helper)' ), key ); apply( ids, id ); } ); }
			} );
		}
		return { mount, reset, dragging: () => dragging, destroy() { disposed = true; reset(); list.removeEventListener( 'keydown', keyboard ); document.removeEventListener( 'keydown', escape, true ); list.removeEventListener( 'pointerdown', pointerDown ); document.removeEventListener( 'pointermove', pointerMove ); document.removeEventListener( 'pointerup', pointerUp ); document.removeEventListener( 'pointercancel', pointerUp ); } };
	}
	function createWorkspace( { config, onChange, onError } ) {
		if ( ! config ) { return null; }
		const service = window.LieveDesignSystem.createService( { ...config, model: window.LieveClassModel }, onChange, onError );
		const modal = document.getElementById( 'lieve-classes-modal' );
		const manager = window.LieveDesignSystem.createManager( { root: modal.querySelector( '[data-design-manager]' ), service, modal, embedded: true, openButton: document.getElementById( 'lieve-classes-open' ) } );
		return { storageError: service.storageError, css: service.css, current: manager.data, isActive: service.isActive, refresh: manager.refresh, breakpoints: service.breakpoints, open: manager.open, isOpen: manager.isOpen, submit: manager.submit,
			get canManage() { return Boolean( config.canManage ) && ! service.storageError(); }, isDirty: manager.isDirty, isSaving: manager.isSaving, save: async () => { await manager.saveDraft(); onChange?.(); }, undo: manager.undo, redo: manager.redo, canUndo: manager.canUndo, canRedo: manager.canRedo, breakGroup: manager.breakGroup,
			edit: ( change, group ) => manager.edit( change, group ),
			names: ids => names( ids, manager.data().classes ),
		};
	}
	function markup() {
		return '<div class="lieve-control lieve-element-classes" data-class-selector role="group" aria-labelledby="lieve-global-classes-label"><div class="lieve-inspector-group-heading"><div id="lieve-global-classes-label" class="lieve-control-group-title">Global classes</div></div><div class="lieve-class-selector-head"><button type="button" class="lieve-button-secondary lieve-class-trigger" data-class-choose aria-haspopup="dialog" aria-expanded="false">' + glyph + '<span>Add classes…</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><button type="button" class="lieve-button-secondary lieve-class-manage" data-class-manage aria-label="Open Classes manager" data-tooltip="Open Classes manager" aria-haspopup="dialog" aria-controls="lieve-classes-modal">' + glyph + '</button></div><div class="lieve-class-chips" data-class-chips role="list" aria-label="Assigned global classes"></div><span id="lieve-class-reorder-help" class="screen-reader-text">Use the grip to drag classes or press Arrow keys, Home or End. Global classes precede manual classes.</span><span class="screen-reader-text" data-class-order-status role="status"></span><div class="lieve-class-edit-context" data-class-edit-context></div></div>';
	}
	function bind( { root, workspace, read, change, app, editing = () => null, edit = () => {}, readManual = () => '', changeManual = () => {} } ) {
		const host = root.querySelector( '[data-class-selector]' ); if ( ! host || ! workspace ) { return null; }
		const trigger = host.querySelector( '[data-class-choose]' ); const chips = host.querySelector( '[data-class-chips]' ); let popup = null; let cleanup = null;
		const manual = root.querySelector( '[data-manual-class-chips]' ); let disposed = false, chipsSnapshot = '', manualSnapshot = '';
		const announce = message => { host.querySelector( '[data-class-order-status]' ).textContent = message; };
		const globalOrder = bindOrder( { list: chips, read, write: change, refresh, announce } );
		const manualOrder = bindOrder( { list: manual, read: () => manualNames( readManual() ), write: ids => changeManual( ids.join( ' ' ) ), refresh, announce } );
		function close( focus = false ) { cleanup?.(); cleanup = null; popup?.remove(); popup = null; trigger.setAttribute( 'aria-expanded', 'false' ); if ( focus && trigger.isConnected ) { trigger.focus( { preventScroll: true } ); } }
		function refresh() {
			if ( disposed || globalOrder?.dragging() || manualOrder?.dragging() ) { return; }
			trigger.disabled = Boolean( workspace.storageError?.() );
			const items = workspace.current().classes; const ids = read();
			const next = JSON.stringify( [ ids, items.map( item => [ item.id, item.name, item.trashed, item.enabled ] ), editing(), workspace.canManage ] );
			if ( next !== chipsSnapshot ) { globalOrder?.reset(); chipsSnapshot = next;
			chips.innerHTML = ids.map( id => { const item = items.find( token => token.id === id ); const active = id === editing(); return '<span role="listitem" data-class-order="' + esc( id ) + '" class="lieve-class-chip' + ( active ? ' is-editing' : '' ) + ( ! item || item.trashed || ! item.enabled ? ' is-disabled' : '' ) + '">' + reorderGrip( id, item?.name || 'missing class', ids.length < 2 ) + '<button type="button" class="lieve-class-edit" data-class-edit="' + esc( id ) + '" aria-pressed="' + active + '" aria-label="' + ( active ? 'Return to element styles from ' : 'Edit shared styles for ' ) + esc( item ? '.' + item.name : 'missing class' ) + '"' + ( ! item || item.trashed || ! workspace.canManage ? ' disabled' : '' ) + '>' + esc( item ? '.' + item.name + ( item.trashed ? ' · In Trash' : '' ) : 'Missing class' ) + '</button><button type="button" data-class-remove="' + esc( id ) + '" aria-label="Remove ' + esc( item?.name || 'missing class' ) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></span>'; } ).join( '' );
			globalOrder?.mount(); }
			const manualValues = manualNames( readManual() ), nextManual = JSON.stringify( manualValues );
			if ( manual && nextManual !== manualSnapshot ) { manualOrder?.reset(); manualSnapshot = nextManual; manual.innerHTML = manualValues.map( name => '<span class="lieve-class-chip" role="listitem" data-class-order="' + esc( name ) + '">' + reorderGrip( name, name, manualValues.length < 2 ) + '<span>' + esc( name ) + '</span></span>' ).join( '' ); manualOrder?.mount(); }
			const current = items.find( item => ! item.trashed && item.id === editing() && ids.includes( item.id ) );
			host.querySelector( '[data-class-edit-context]' ).innerHTML = current ? '<div><strong>Editing .' + esc( current.name ) + '</strong><span>' + ( ! current.enabled ? 'Disabled class · CSS is not applied' : ! workspace.isActive( current.id ) ? 'Not active on this page · display conditions' : 'Shared CSS · all assigned elements' ) + '</span></div><button type="button" class="lieve-button-secondary" data-class-exit>Element</button>' : '<p class="lieve-element-id-help">' + ( workspace.canManage ? 'Click an assigned class to edit its shared CSS.' : 'Element styles · shared classes are read only.' ) + '</p>';
			if ( workspace.storageError?.() ) { host.querySelector( '[data-class-edit-context]' ).textContent = workspace.storageError().message; }
		}
		function toggle( id ) { const ids = read(); if ( ids.includes( id ) ) { change( ids.filter( item => item !== id ) ); } else if ( ids.length < 30 ) { change( [ ...ids, id ] ); } refresh(); }
		function open() {
			close(); popup = document.createElement( 'div' ); popup.id = 'lieve-global-class-picker'; popup.className = 'lieve-ds lieve-token-picker lieve-ds-select-menu lieve-class-picker'; popup.setAttribute( 'role', 'dialog' ); popup.setAttribute( 'aria-label', 'Choose global classes' );
			popup.innerHTML = '<div class="lieve-ds-select-find"><input type="search" aria-label="Search classes" placeholder="Search classes…" autocomplete="off"></div><div class="lieve-ds-select-list" role="listbox" aria-label="Global classes" aria-multiselectable="true"></div><p class="lieve-ds-select-empty" role="status" hidden>No matching classes. Create one in the Classes manager.</p><div class="lieve-token-footer"><button type="button" class="lieve-button-secondary lieve-token-manage" data-class-manager>' + glyph + 'Open Classes manager</button></div>';
			const search = popup.querySelector( 'input' ); const list = popup.querySelector( '[role="listbox"]' ); let options = [];
			function filter() {
				const data = workspace.current(); const ids = read(); const query = search.value.trim().toLowerCase();
				const groups = [ ...data.categories, { id: '', name: 'Uncategorized' } ];
				list.innerHTML = groups.map( group => { const items = data.classes.filter( item => ! item.trashed && item.categoryId === group.id && ( item.name + ' ' + item.description + ' ' + group.name ).toLowerCase().includes( query ) ); return items.length ? '<div class="lieve-class-picker-group" role="group" aria-label="' + esc( group.name ) + '"><span>' + esc( group.name ) + '</span>' + items.map( item => '<button type="button" class="lieve-ds-select-option' + ( ids.includes( item.id ) ? ' is-chosen' : '' ) + '" role="option" aria-selected="' + ids.includes( item.id ) + '" tabindex="-1" data-class-choice="' + item.id + '"><span>.' + esc( item.name ) + '</span><small>' + ( ! item.enabled ? 'Disabled' : item.conditions.length ? 'Selective' : 'Site-wide' ) + '</small></button>' ).join( '' ) + '</div>' : ''; } ).join( '' );
				options = Array.from( list.querySelectorAll( '[role="option"]' ) ); popup.querySelector( '[role="status"]' ).hidden = Boolean( options.length );
			}
			function position() { if ( ! trigger.isConnected ) { close(); return; } const rect = trigger.getBoundingClientRect(); const width = Math.min( 340, window.innerWidth - 24 ); const below = window.innerHeight - rect.bottom - 12; const above = rect.top - 12; const height = Math.min( 380, Math.max( below, above ) - 6 ); popup.style.width = width + 'px'; popup.style.height = popup.style.maxHeight = Math.max( 100, height ) + 'px'; popup.style.left = Math.max( 12, Math.min( rect.left, window.innerWidth - width - 12 ) ) + 'px'; popup.style.top = ( below < height && above > below ? Math.max( 12, rect.top - height - 6 ) : rect.bottom + 6 ) + 'px'; }
			search.addEventListener( 'input', filter );
			popup.addEventListener( 'click', event => { const choice = event.target.closest( '[data-class-choice]' ); if ( choice ) { toggle( choice.dataset.classChoice ); filter(); list.querySelector( '[data-class-choice="' + choice.dataset.classChoice + '"]' )?.focus( { preventScroll: true } ); } if ( event.target.closest( '[data-class-manager]' ) ) { close(); void workspace.open( trigger ); } } );
			popup.addEventListener( 'keydown', event => {
				if ( event.key === 'Escape' ) { event.preventDefault(); event.stopPropagation(); close( true ); }
				else if ( [ 'ArrowDown', 'ArrowUp', 'Home', 'End' ].includes( event.key ) && ( event.target !== search || event.key.startsWith( 'Arrow' ) ) ) { event.preventDefault(); event.stopPropagation(); const index = options.indexOf( event.target ); const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : ( index + ( event.key === 'ArrowDown' ? 1 : -1 ) + options.length ) % options.length; options[ next ]?.focus(); }
				else if ( event.key === 'Enter' && event.target === search ) { event.preventDefault(); event.stopPropagation(); options[0]?.click(); }
				else if ( event.key === 'Tab' ) { close( true ); }
			} );
			const outside = event => { if ( ! popup?.contains( event.target ) && ! host.contains( event.target ) ) { close(); } }; const scroll = event => { if ( ! popup?.contains( event.target ) ) { close(); } };
			app.appendChild( popup ); filter(); position(); popup.classList.add( 'is-open' ); trigger.setAttribute( 'aria-expanded', 'true' ); trigger.setAttribute( 'aria-controls', popup.id ); search.focus( { preventScroll: true } );
			document.addEventListener( 'pointerdown', outside ); window.addEventListener( 'resize', position ); window.addEventListener( 'scroll', scroll, true ); cleanup = () => { document.removeEventListener( 'pointerdown', outside ); window.removeEventListener( 'resize', position ); window.removeEventListener( 'scroll', scroll, true ); };
		}
		trigger.addEventListener( 'click', () => { if ( popup ) { close( true ); } else { open(); } } );
		host.querySelector( '[data-class-manage]' ).addEventListener( 'click', event => { close(); void workspace.open( event.currentTarget, editing() ); } );
		host.addEventListener( 'click', event => { const exit = event.target.closest( '[data-class-exit]' ); const target = event.target.closest( '[data-class-edit]' ); if ( exit || target ) { close(); edit( exit ? null : target.dataset.classEdit === editing() ? null : target.dataset.classEdit ); } } );
		chips.addEventListener( 'click', event => { const button = event.target.closest( '[data-class-remove]' ); if ( button ) { if ( button.dataset.classRemove === editing() ) { edit( null ); } toggle( button.dataset.classRemove ); trigger.focus( { preventScroll: true } ); } } );
		refresh(); return { destroy() { disposed = true; globalOrder?.destroy(); manualOrder?.destroy(); close(); }, close, refresh };
	}
	window.LieveClasses = { createWorkspace, markup, manualMarkup, bind, names, assignmentNames, assignedClass, summaryMarkup, manualNames, bindOrder };
}() );
