/* Consistent search clearing for Lieve chrome only; authored page fields stay native. */
( function () {
	'use strict';
	const scope = '.lieve-admin-page, .lieve-ds, .lieve-conditions-builder, .lieve-condition-picker-menu, #lieve-builder-app, body.post-type-lieve_template #posts-filter';
	const fields = new WeakMap();
	function enhance( input ) {
		if ( fields.has( input ) || ! input.closest( scope ) || input.closest( '#lieve-canvas, [data-editor-root]' ) ) { return; }
		// Composite search fields can render their complete shell on the server.
		// Adopt it without nesting another flex wrapper or changing its geometry.
		const existing = input.parentElement?.hasAttribute( 'data-lieve-search-field' ) ? input.parentElement : null;
		const wrapper = existing || document.createElement( 'span' ); wrapper.classList.add( 'lieve-search-field' );
		let button = existing?.querySelector( '[data-lieve-search-clear]' );
		if ( ! button ) {
			button = document.createElement( 'button' ); button.type = 'button'; button.className = 'lieve-search-clear';
			button.setAttribute( 'aria-label', 'Clear search' ); button.setAttribute( 'title', 'Clear search' );
			button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m7 7 10 10M17 7 7 17"/></svg>';
			if ( ! existing ) { input.before( wrapper ); wrapper.append( input ); }
			wrapper.append( button );
		}
		input.classList.add( 'lieve-search-input' );
		const sync = () => { button.hidden = ! input.value || input.disabled || input.readOnly; };
		fields.set( input, sync ); sync();
		[ 'input', 'change', 'search', 'focus' ].forEach( event => input.addEventListener( event, sync ) );
		input.addEventListener( 'keydown', event => {
			// The picker normally closes on Tab. Let its visible clear button be reached first.
			if ( event.key === 'Tab' && ! event.shiftKey && ! button.hidden && input.closest( '.lieve-ds-select-menu, .lieve-condition-picker-menu' ) ) { event.stopPropagation(); }
		} );
		button.addEventListener( 'keydown', event => {
			// Native button activation must clear the filter, never choose the highlighted option.
			if ( [ 'Enter', ' ' ].includes( event.key ) || ( event.key === 'Tab' && event.shiftKey ) ) { event.stopPropagation(); }
		} );
		button.addEventListener( 'click', () => {
			if ( input.disabled || input.readOnly ) { return; }
			input.value = ''; sync(); input.focus( { preventScroll: true } );
			// Existing managers keep ownership of filtering, pagination and remote requests.
			input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
			input.dispatchEvent( new Event( 'search', { bubbles: true } ) );
		} );
	}
	function scan( root ) {
		if ( root.matches?.( 'input[type="search"]' ) ) { enhance( root ); }
		root.querySelectorAll?.( 'input[type="search"]' ).forEach( enhance );
	}
	// Managers occasionally reset a search value without emitting a filter event.
	// Refresh only the chrome, without issuing another request or changing selection.
	window.LieveSearchControls = { refresh( input ) { fields.get( input )?.(); } };
	scan( document );
	new MutationObserver( records => records.forEach( record => {
		if ( record.type === 'attributes' ) { fields.get( record.target )?.(); }
		else { record.addedNodes.forEach( scan ); }
	} ) ).observe( document.body, { childList: true, subtree: true, attributes: true, attributeFilter: [ 'disabled', 'readonly', 'value' ] } );
	// Form resets and programmatic filter resets finish after the native reset event.
	document.addEventListener( 'reset', event => window.setTimeout( () => event.target.querySelectorAll( 'input[type="search"]' ).forEach( input => fields.get( input )?.() ), 0 ), true );
	window.addEventListener( 'pageshow', () => document.querySelectorAll( 'input[type="search"]' ).forEach( input => fields.get( input )?.() ) );
} )();
