/* Searchable element picker and explicit class switches. Native selects own submission. */
( function () {
	'use strict';
	const root = document.querySelector( '[data-output-manager]' );
	if ( ! root ) { return; }
	const target = root.querySelector( '[data-output-target]' );
	const rows = [ ...root.querySelectorAll( '[data-output-row]' ) ];
	const pickers = [];
	const status = root.querySelector( '[data-output-status]' );
	const resetAll = root.querySelector( '[data-output-reset-all]' );
	const controls = rows.map( row => {
		const select = row.querySelector( '[data-output-defaults]' ), custom = row.querySelector( '[data-output-custom]' ), reset = row.querySelector( '[data-output-reset]' );
		const toggles = [ ...row.querySelectorAll( '[data-output-toggle]' ) ];
		const idEnabled = row.querySelector( '[data-page-id-enabled]' ), idCustom = row.querySelector( '[data-page-id-custom]' );
		const isDefault = () => [ ...select.options ].every( option => option.selected ) && custom.value === '' && ( ! idEnabled || idEnabled.checked && idCustom.value === '' );
		function refresh() {
			toggles.forEach( toggle => { toggle.checked = [ ...select.options ].some( option => option.value === toggle.dataset.outputToggle && option.selected ); } );
			reset.disabled = isDefault();
		}
		function resetDefaults() {
			[ ...select.options ].forEach( option => { option.selected = true; } ); custom.value = ''; custom.removeAttribute( 'aria-invalid' ); refresh();
			if ( idEnabled ) { idEnabled.checked = true; idCustom.value = ''; idCustom.removeAttribute( 'aria-invalid' ); refresh(); }
		}
		toggles.forEach( toggle => toggle.addEventListener( 'change', () => {
			const option = [ ...select.options ].find( item => item.value === toggle.dataset.outputToggle );
			if ( option ) { option.selected = toggle.checked; select.dispatchEvent( new Event( 'change', { bubbles: true } ) ); }
		} ) );
		function changed() { refresh(); refreshAll(); }
		select.addEventListener( 'change', changed ); custom.addEventListener( 'input', changed ); custom.addEventListener( 'change', changed );
		idEnabled?.addEventListener( 'change', changed ); idCustom?.addEventListener( 'input', changed );
		reset.addEventListener( 'click', () => {
			resetDefaults();
			select.dispatchEvent( new Event( 'change', { bubbles: true } ) );
			status.textContent = row.dataset.outputLabel + ' reset to defaults. Save Settings to apply.';
		} );
		refresh(); return { refresh, isDefault, resetDefaults };
	} );
	function refreshAll() { resetAll.disabled = controls.every( item => item.isDefault() ); }
	resetAll.addEventListener( 'click', () => {
		close(); controls.forEach( item => item.resetDefaults() ); refreshAll();
		root.dispatchEvent( new Event( 'change', { bubbles: true } ) );
		status.textContent = 'All output classes and page IDs reset to defaults. Other Settings tabs are unchanged. Save Settings to apply, or Cancel to undo.';
	} );
	function close() { pickers.forEach( picker => picker.close() ); }
	function show() { close(); rows.forEach( row => { row.hidden = row.dataset.outputRow !== target.value; } ); }
	function picker( select, mount = root, searchLabel = 'Search elements' ) {
		const trigger = select.nextElementSibling, summary = trigger.querySelector( 'span' );
		const label = select.getAttribute( 'aria-label' );
		const menu = document.createElement( 'div' ); menu.className = 'lieve-ds-select-menu lieve-settings-class-menu'; menu.hidden = true;
		const find = document.createElement( 'div' ); find.className = 'lieve-ds-select-find';
		const search = document.createElement( 'input' ); search.type = 'search'; search.placeholder = searchLabel + '…'; search.setAttribute( 'aria-label', searchLabel ); search.autocomplete = 'off'; find.append( search );
		const list = document.createElement( 'div' ); list.className = 'lieve-ds-select-list'; list.id = select.id + '-options'; list.setAttribute( 'role', 'listbox' ); list.setAttribute( 'aria-label', label );
		const empty = document.createElement( 'p' ); empty.className = 'lieve-ds-select-empty'; empty.textContent = 'No matches found.'; empty.hidden = true; empty.setAttribute( 'role', 'status' );
		const entries = [ ...select.options ].map( option => {
			const button = document.createElement( 'button' ); button.type = 'button'; button.className = 'lieve-ds-select-option'; button.tabIndex = -1; button.setAttribute( 'role', 'option' );
			const text = document.createElement( 'span' ); text.textContent = option.textContent;
			button.append( text );
			const group = document.createElement( 'small' ); group.textContent = option.parentElement.label || ''; if ( group.textContent ) { button.append( group ); }
			button.addEventListener( 'click', () => choose( option, button ) ); list.append( button ); return { option, button, group: option.parentElement.label || '' };
		} );
		menu.append( find, list, empty ); mount.append( menu );
		select.tabIndex = -1; select.setAttribute( 'aria-hidden', 'true' ); trigger.setAttribute( 'aria-controls', list.id );
		if ( select.getAttribute( 'aria-describedby' ) ) { trigger.setAttribute( 'aria-describedby', select.getAttribute( 'aria-describedby' ) ); }
		let visible = entries, active = 0;
		function update() {
			const selected = entries.filter( entry => entry.option.selected );
			summary.textContent = selected[0]?.option.textContent || 'Select element';
			entries.forEach( entry => { entry.button.setAttribute( 'aria-selected', String( entry.option.selected ) ); entry.button.classList.toggle( 'is-chosen', entry.option.selected ); } );
		}
		function filter() {
			const term = search.value.trim().toLocaleLowerCase();
			entries.forEach( entry => { entry.button.hidden = ! ( entry.group + ' ' + entry.option.textContent ).toLocaleLowerCase().includes( term ); } );
			visible = entries.filter( entry => ! entry.button.hidden ); empty.hidden = visible.length > 0; active = Math.max( 0, visible.findIndex( entry => entry.option.selected ) );
		}
		function position() {
			if ( menu.hidden ) { return; }
			const anchor = trigger.getBoundingClientRect(), width = Math.max( 0, Math.min( anchor.width, window.innerWidth - 16 ) );
			menu.style.width = width + 'px'; menu.style.left = Math.max( 8, Math.min( anchor.left, window.innerWidth - width - 8 ) ) + 'px';
			const below = window.innerHeight - anchor.bottom - 12, above = anchor.top - 12, upwards = below < 220 && above > below;
			menu.style.maxHeight = Math.max( 0, Math.min( 340, window.innerHeight - 16, upwards ? above : below ) ) + 'px';
			menu.style.top = Math.max( 8, Math.min( upwards ? anchor.top - menu.offsetHeight - 4 : anchor.bottom + 4, window.innerHeight - menu.offsetHeight - 8 ) ) + 'px';
		}
		function shut( focus = false ) { if ( ! menu.hidden ) { menu.hidden = true; menu.classList.remove( 'is-open' ); trigger.setAttribute( 'aria-expanded', 'false' ); } if ( focus ) { trigger.focus(); } }
		function highlight( index ) { if ( ! visible.length ) { return; } active = ( index + visible.length ) % visible.length; entries.forEach( entry => entry.button.classList.toggle( 'is-over', entry === visible[ active ] ) ); visible[ active ].button.focus(); visible[ active ].button.scrollIntoView( { block: 'nearest' } ); }
		function open() { close(); search.value = ''; filter(); update(); entries.forEach( entry => entry.button.classList.remove( 'is-over' ) ); menu.hidden = false; position(); void menu.offsetWidth; menu.classList.add( 'is-open' ); trigger.setAttribute( 'aria-expanded', 'true' ); search.focus(); }
		function choose( option, button ) {
			if ( select.disabled ) { return; }
			select.value = option.value;
			update(); select.dispatchEvent( new Event( 'input', { bubbles: true } ) ); select.dispatchEvent( new Event( 'change', { bubbles: true } ) );
			shut( true );
		}
		trigger.addEventListener( 'click', () => menu.hidden ? open() : shut( true ) );
		trigger.addEventListener( 'keydown', event => { if ( [ 'ArrowDown', 'ArrowUp' ].includes( event.key ) ) { event.preventDefault(); open(); } } );
		menu.addEventListener( 'keydown', event => {
			if ( event.key === 'Escape' ) { event.preventDefault(); event.stopPropagation(); shut( true ); }
			else if ( event.key === 'Tab' ) { shut( true ); }
			else if ( [ 'ArrowDown', 'ArrowUp', 'Home', 'End' ].includes( event.key ) ) {
				if ( event.target === search && [ 'Home', 'End' ].includes( event.key ) ) { return; }
				event.preventDefault(); highlight( event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : event.target === search ? ( event.key === 'ArrowDown' ? 0 : visible.length - 1 ) : active + ( event.key === 'ArrowDown' ? 1 : -1 ) );
			} else if ( event.key === 'Enter' || event.key === ' ' && event.target !== search ) { event.preventDefault(); if ( visible[ active ] ) { choose( visible[ active ].option, visible[ active ].button ); } }
		} );
		search.addEventListener( 'input', () => { filter(); position(); } ); select.addEventListener( 'change', update );
		document.addEventListener( 'pointerdown', event => { if ( ! menu.contains( event.target ) && ! trigger.contains( event.target ) ) { shut(); } }, true );
		window.addEventListener( 'resize', position ); window.addEventListener( 'scroll', event => { if ( ! menu.contains( event.target ) ) { position(); } }, true ); update();
		return { close: shut, refresh: update };
	}
	pickers.push( picker( target ) ); target.addEventListener( 'change', show );
	document.querySelectorAll( '[data-settings-select]' ).forEach( select => { pickers.push( picker( select, select.parentElement, select.dataset.settingsSearch || 'Search loading methods' ) ); } );
	window.LieveSettingsClasses = { close, refresh() { close(); controls.forEach( item => item.refresh() ); refreshAll(); pickers.forEach( item => item.refresh() ); status.textContent = ''; }, reveal( field ) { const row = field.closest( '[data-output-row]' ); if ( row ) { target.value = row.dataset.outputRow; show(); pickers[0].refresh(); } } };
	show(); refreshAll();
}() );
