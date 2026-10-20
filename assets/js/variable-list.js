/* Variable rows: TheOneWP Content Custom Order's Sortable method, scoped to a draft. */
( function () {
	'use strict';
	function create( { root, list, visible, selected, canReorder, canSelect, commit, rowAttribute = 'data-ds-variable-row' } ) {
		let sortable = null; let dragging = false; let cancelling = false; let warmId = 0; let idleWarm = false; let anchor = null; let clicked = null;
		const rowSelector = '[' + rowAttribute + ']';
		const rowId = row => row.getAttribute( rowAttribute );
		const rows = () => Array.from( list.querySelectorAll( rowSelector ) );
		function cancelWarm() { if ( warmId ) { if ( idleWarm ) { window.cancelIdleCallback( warmId ); } else { window.clearTimeout( warmId ); } warmId = 0; } }
		function warm() {
			cancelWarm(); if ( ! sortable || dragging || ! canReorder() ) { return; }
			const run = () => { warmId = 0; if ( sortable && ! dragging && canReorder() ) { sortable.sortable( 'refreshPositions' ); } };
			idleWarm = typeof window.requestIdleCallback === 'function';
			warmId = idleWarm ? window.requestIdleCallback( run, { timeout: 500 } ) : window.setTimeout( run, 0 );
		}
		function refreshSelection() {
			const ids = visible().map( item => item.id ); const chosen = selected(); const count = ids.filter( id => chosen.has( id ) ).length;
			root.querySelector( '[data-ds-bulk]' ).hidden = chosen.size === 0;
			root.querySelector( '[data-ds-selection-count]' ).textContent = chosen.size + ' selected';
			const all = root.querySelector( '[data-ds-select-visible]' );
			if ( all ) { all.checked = ids.length > 0 && count === ids.length; all.indeterminate = count > 0 && count < ids.length; all.disabled = ! canSelect() || ! ids.length; }
			const currentRows = rows();
			currentRows.forEach( ( row, index ) => {
				const checked = chosen.has( rowId( row ) ); row.classList.toggle( 'is-selected', checked );
				if ( row.getAttribute( 'aria-posinset' ) !== String( index + 1 ) ) { row.setAttribute( 'aria-posinset', String( index + 1 ) ); }
				if ( row.getAttribute( 'aria-setsize' ) !== String( currentRows.length ) ) { row.setAttribute( 'aria-setsize', String( currentRows.length ) ); }
				const input = row.querySelector( '[data-ds-select]' ); if ( input.checked !== checked ) { input.checked = checked; } if ( input.disabled !== ! canSelect() ) { input.disabled = ! canSelect(); }
			} );
		}
		function applyOrder() {
			const order = rows().map( row => rowId( row ) ); const expected = visible().map( item => item.id );
			if ( order.length !== expected.length || new Set( order ).size !== order.length || order.some( id => ! expected.includes( id ) ) ) { return; }
			if ( order.some( ( id, index ) => id !== expected[ index ] ) ) { commit( order ); }
			refreshSelection(); warm();
		}
		function refresh( changed = true ) {
			refreshSelection(); if ( dragging ) { return; }
			const ready = canReorder() && rows().length > 1; const $ = window.jQuery; let created = false;
			if ( ! sortable && ready && $?.fn?.sortable ) {
				sortable = $( list ); sortable.sortable( {
					items: '> ' + rowSelector,
					// The whole row, including its editor button, is the grip. Native
					// checkboxes/labels are excluded so selection never starts a drag.
					cancel: 'input, textarea, select, option, .lieve-ds-selection, button:not(.lieve-ds-item-main)',
					placeholder: 'lieve-ds-item lieve-ds-variable-placeholder ui-sortable-placeholder',
					tolerance: 'pointer',
					start( event, ui ) { if ( ! canReorder() ) { return false; } cancelWarm(); dragging = true; ui.placeholder.outerHeight( ui.item.outerHeight() ); list.classList.add( 'is-reordering' ); },
					stop() { dragging = false; list.classList.remove( 'is-reordering' ); if ( ! cancelling && canReorder() ) { applyOrder(); } cancelling = false; },
				} );
				sortable.disableSelection(); created = true;
			}
			if ( sortable ) { if ( sortable.sortable( 'option', 'disabled' ) !== ! ready ) { sortable.sortable( 'option', 'disabled', ! ready ); } if ( changed && ! created ) { sortable.sortable( 'refresh' ); } if ( changed || created ) { warm(); } }
			list.classList.toggle( 'is-ready', Boolean( sortable && ready ) );
		}
		function cancelDrag() { cancelWarm(); if ( dragging && sortable ) { cancelling = true; sortable.sortable( 'cancel' ); dragging = false; cancelling = false; list.classList.remove( 'is-reordering' ); refreshSelection(); } }
		function rememberClick( event ) { const field = event.target; if ( field.hasAttribute( 'data-ds-select' ) && list.contains( field ) ) { clicked = { id: field.dataset.dsSelect, shift: event.shiftKey }; } }
		function changeSelection( field ) {
			if ( ! canSelect() ) { return; } const chosen = selected(); const ids = visible().map( item => item.id );
			if ( field.hasAttribute( 'data-ds-select-visible' ) ) { ids.forEach( id => field.checked ? chosen.add( id ) : chosen.delete( id ) ); anchor = null; }
			else {
				const id = field.dataset.dsSelect; const from = ids.indexOf( anchor ); const to = ids.indexOf( id );
				if ( to < 0 ) { return; }
				if ( clicked?.id === id && clicked.shift && from >= 0 ) { ids.slice( Math.min( from, to ), Math.max( from, to ) + 1 ).forEach( tokenId => field.checked ? chosen.add( tokenId ) : chosen.delete( tokenId ) ); }
				else { field.checked ? chosen.add( id ) : chosen.delete( id ); anchor = id; }
			}
			clicked = null; refreshSelection();
		}
		function escapeDrag( event ) { if ( ! dragging || event.key !== 'Escape' ) { return false; } event.preventDefault(); event.stopPropagation(); cancelDrag(); return true; }
		function keyboard( event ) {
			if ( escapeDrag( event ) ) { return; }
			const button = event.target.closest( '[data-ds-item]' ); if ( ! button || ! canReorder() || event.ctrlKey || event.metaKey || ! [ 'ArrowUp', 'ArrowDown', 'Home', 'End' ].includes( event.key ) ) { return; }
			const row = button.closest( rowSelector ); const items = rows(); const from = items.indexOf( row );
			const to = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : from + ( event.key === 'ArrowUp' ? -1 : 1 );
			event.preventDefault(); event.stopPropagation(); if ( from < 0 || to < 0 || to >= items.length || from === to ) { return; }
			list.insertBefore( row, to < from ? items[ to ] : items[ to ].nextSibling );
			button.focus( { preventScroll: true } ); row.scrollIntoView( { block: 'nearest' } ); applyOrder();
		}
		list.addEventListener( 'click', rememberClick, true ); list.addEventListener( 'keydown', keyboard );
		// Dragging a grip need not focus a row. Escape cancels that gesture before
		// the editor's dialog handler can dismiss the whole variables draft.
		const document = root.ownerDocument; document?.addEventListener( 'keydown', escapeDrag, true );
		const dialog = root.closest( '.lieve-conditions-dialog' ); dialog?.addEventListener( 'transitionend', warm );
		return { refresh, refreshSelection, changeSelection, cancel: cancelDrag, clearAnchor() { anchor = clicked = null; }, isDragging: () => dragging,
			destroy() { cancelDrag(); if ( sortable ) { sortable.sortable( 'destroy' ); sortable = null; } list.classList.remove( 'is-ready' ); list.removeEventListener( 'click', rememberClick, true ); list.removeEventListener( 'keydown', keyboard ); document?.removeEventListener( 'keydown', escapeDrag, true ); dialog?.removeEventListener( 'transitionend', warm ); } };
	}
	window.LieveVariableList = { create };
}() );
