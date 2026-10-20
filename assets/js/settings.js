/* Progressive enhancement: all settings and the active panel are server-rendered. */
( function () {
	'use strict';
	const form = document.querySelector( '[data-theme-settings]' );
	if ( ! form ) { return; }
	const workspace = form.querySelector( '.lieve-settings-workspace' );
	const tabs = [ ...form.querySelectorAll( '[data-settings-tab]' ) ];
	const panels = [ ...form.querySelectorAll( '[role="tabpanel"]' ) ];
	const fields = [ ...form.querySelectorAll( '[data-setting]' ) ];
	const postTypes = fields.filter( field => field.dataset.settingPostType );
	const save = form.querySelector( '[data-settings-save]' ), cancel = form.querySelector( '[data-settings-cancel]' ), status = form.querySelector( '[data-settings-status]' );
	const preview = form.querySelector( '[data-setting-gradient]' );
	const colors = fields.filter( field => field.dataset.settingColor );
	const resetColors = form.querySelector( '[data-settings-colors-reset]' );
	const value = field => field.type === 'checkbox' ? field.checked : field.multiple ? JSON.stringify( [ ...field.selectedOptions ].map( option => option.value ) ) : field.value;
	let original = fields.map( value );
	const config = window.LieveSettingsConfig;
	const headField = form.querySelector( '[data-setting-head]' );
	const headControls = window.LieveHead?.create( { root: form.querySelector( '[data-head-settings]' ), config: window.LieveHeadSettings, globalMode: true, read: () => JSON.parse( headField.value || '{}' ), change: next => { headField.value = JSON.stringify( next ); headField.dispatchEvent( new Event( 'input', { bubbles: true } ) ); } } );
	const pickers = [];
	let dirty = false, submitting = false;
	form.noValidate = true;
	function activate( tab, focus = false ) {
		if ( submitting || ! tabs.includes( tab ) ) { return; }
		pickers.forEach( picker => picker.close() );
		window.LieveSettingsClasses?.close();
		tabs.forEach( item => { const selected = item === tab; item.setAttribute( 'aria-selected', String( selected ) ); item.tabIndex = selected ? 0 : -1; } );
		panels.forEach( panel => { panel.hidden = panel.id !== tab.getAttribute( 'aria-controls' ); } );
		const url = new URL( window.location.href ); url.searchParams.set( 'tab', tab.dataset.settingsTab );
		window.history.replaceState( null, '', url.pathname + url.search );
		const referer = form.querySelector( '[name="_wp_http_referer"]' );
		if ( referer ) { referer.value = url.pathname + url.search; }
		if ( focus ) { tab.focus(); }
	}
	function refresh() {
		dirty = fields.some( ( field, index ) => value( field ) !== original[ index ] );
		tabs.forEach( tab => {
			const changed = fields.some( ( field, index ) => field.closest( '[role="tabpanel"]' )?.id === tab.getAttribute( 'aria-controls' ) && value( field ) !== original[index] );
			tab.setAttribute( 'data-settings-dirty', String( changed ) );
			if ( changed ) { tab.setAttribute( 'aria-description', 'Unsaved changes in this section.' ); } else { tab.removeAttribute( 'aria-description' ); }
		} );
		workspace.classList.toggle( 'has-changes', dirty );
		cancel.hidden = ! dirty; save.disabled = ! dirty || submitting;
		status.textContent = submitting ? 'Saving settings…' : dirty ? 'You have unsaved changes.' : 'All changes saved.';
		status.classList.remove( 'is-error' );
		fields.forEach( field => { if ( field.checkValidity() ) { field.removeAttribute( 'aria-invalid' ); } } );
		resetColors.disabled = submitting || colors.every( field => field.value.toLowerCase() === field.dataset.settingDefault );
		if ( colors.length === 2 && colors.every( field => /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test( field.value ) ) ) { preview.style.background = 'linear-gradient(90deg,' + colors[ 0 ].value + ',' + colors[ 1 ].value + ')'; }
	}
	tabs.forEach( ( tab, index ) => {
		tab.addEventListener( 'click', event => { if ( event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ) { return; } event.preventDefault(); activate( tab ); } );
		tab.addEventListener( 'keydown', event => {
			let next;
			if ( event.key === 'ArrowRight' ) { next = ( index + 1 ) % tabs.length; }
			if ( event.key === 'ArrowLeft' ) { next = ( index + tabs.length - 1 ) % tabs.length; }
			if ( event.key === 'Home' ) { next = 0; }
			if ( event.key === 'End' ) { next = tabs.length - 1; }
			if ( next !== undefined ) { event.preventDefault(); activate( tabs[ next ], true ); }
		} );
	} );
	colors.forEach( input => {
		const trigger = form.querySelector( '[data-setting-swatch="' + input.dataset.settingColor + '"]' );
		if ( window.LieveColour ) { pickers.push( window.LieveColour.create( input, { trigger, container: workspace, allowAlpha: false } ) ); }
		else { trigger.hidden = true; }
	} );
	form.addEventListener( 'input', refresh ); form.addEventListener( 'change', refresh );
	resetColors.addEventListener( 'click', () => {
		if ( submitting ) { return; }
		pickers.forEach( picker => picker.close() );
		colors.forEach( field => { field.value = field.dataset.settingDefault; field.removeAttribute( 'aria-invalid' ); } );
		pickers.forEach( picker => picker.refresh() ); refresh();
	} );
	cancel.addEventListener( 'click', () => {
		if ( submitting ) { return; }
		pickers.forEach( picker => picker.close() );
		fields.forEach( ( field, index ) => { if ( field.type === 'checkbox' ) { field.checked = original[ index ]; } else if ( field.multiple ) { const selected = JSON.parse( original[ index ] ); [ ...field.options ].forEach( option => { option.selected = selected.includes( option.value ); } ); } else { field.value = original[ index ]; } field.removeAttribute( 'aria-invalid' ); } );
		window.LieveSettingsClasses?.refresh();
		headControls?.sync();
		pickers.forEach( picker => picker.refresh() ); refresh();
		tabs.find( tab => tab.getAttribute( 'aria-selected' ) === 'true' )?.focus( { preventScroll: true } );
	} );
	function path( field ) {
		return field.name?.match( /^lieve_theme_settings\[([a-z_]+)\](?:\[([a-zA-Z0-9_-]+)\]\[(defaults|custom|enabled)\](?:\[\])?)?$/ );
	}
	function read( data, field ) {
		if ( field.dataset.settingHead !== undefined ) { return JSON.stringify( window.LieveHead.normalize( data.head_items ) ); }
		if ( field.dataset.settingPostType ) { return ( data.builder_post_types || [] ).includes( field.dataset.settingPostType ); }
		const parts = path( field ); if ( ! parts ) { return value( field ); }
		const raw = parts[2] ? data[parts[1]]?.[parts[2]]?.[parts[3]] : data[parts[1]];
		return field.multiple ? JSON.stringify( raw || [] ) : field.type === 'checkbox' ? Boolean( raw ) : String( raw ?? '' );
	}
	function restore( field, saved ) {
		if ( field.type === 'checkbox' ) { field.checked = saved; }
		else if ( field.multiple ) { const selected = JSON.parse( saved ); [ ...field.options ].forEach( option => { option.selected = selected.includes( option.value ); } ); }
		else { field.value = saved; }
	}
	function payload() {
		const data = JSON.parse( JSON.stringify( config.data ) ); data.output_classes = { ...data.output_classes };
		data.output_ids = { ...data.output_ids };
		if ( postTypes.length ) { data.builder_post_types = postTypes.filter( field => field.checked ).map( field => field.dataset.settingPostType ); }
		fields.forEach( field => {
			if ( field.dataset.settingHead !== undefined ) { data.head_items = JSON.parse( field.value || '{}' ); return; }
			const parts = path( field ); if ( ! parts ) { return; }
			const next = field.multiple ? JSON.parse( value( field ) ) : field.type === 'checkbox' ? field.checked : field.type === 'number' ? Number( field.value ) : field.value;
			if ( parts[2] ) { data[parts[1]][parts[2]] ||= {}; data[parts[1]][parts[2]][parts[3]] = next; if ( parts[1] === 'output_classes' && parts[2] === 'body' ) { data.output_classes.body.version = 2; } }
			else { data[parts[1]] = next; }
		} );
		return data;
	}
	form.addEventListener( 'submit', async event => {
		if ( submitting || ! dirty ) { event.preventDefault(); return; }
		const invalid = fields.find( field => ! field.checkValidity() );
		if ( invalid ) {
			event.preventDefault(); const panel = invalid.closest( '[role="tabpanel"]' );
			activate( tabs.find( tab => tab.getAttribute( 'aria-controls' ) === panel.id ) );
			window.LieveSettingsClasses?.reveal( invalid ); invalid.setAttribute( 'aria-invalid', 'true' ); status.textContent = 'Check the highlighted field before saving.'; status.classList.add( 'is-error' ); invalid.focus(); invalid.reportValidity(); return;
		}
		if ( ! config ) { dirty = false; return; } // The native Settings API remains the no-script fallback.
		event.preventDefault();
		const sent = fields.map( value );
		pickers.forEach( picker => picker.close() ); submitting = true; save.disabled = true; cancel.disabled = true;
		window.LieveSettingsClasses?.close(); workspace.inert = true;
		form.setAttribute( 'aria-busy', 'true' ); status.textContent = 'Saving settings…'; status.classList.remove( 'is-error' );
		const controller = window.AbortController ? new window.AbortController() : null;
		const timeout = controller ? window.setTimeout( () => controller.abort(), 30000 ) : null;
		try {
			const response = await ( window.LieveTransport?.fetch || window.fetch.bind( window ) )(  config.url, { method: 'POST', credentials: 'same-origin', ...( controller ? { signal: controller.signal } : {} ), headers: { 'X-WP-Nonce': config.nonce, 'Content-Type': 'application/json' }, body: JSON.stringify( { data: payload(), revision: config.revision } ) } );
			const result = await response.json();
			if ( ! response.ok ) { throw new Error( result.message || 'Settings could not be saved. Your draft is still available.' ); }
			if ( ! result.data || typeof result.revision !== 'string' ) { throw new Error( 'Invalid Settings response. Your draft is still available.' ); }
			original = fields.map( field => read( result.data, field ) );
			fields.forEach( ( field, index ) => { if ( value( field ) === sent[index] ) { restore( field, original[index] ); } } );
			config.data = result.data; config.revision = result.revision;
			headControls?.sync();
			window.LieveSettingsClasses?.refresh(); pickers.forEach( picker => picker.refresh() );
			for ( const stop of [ 'start', 'end' ] ) {
				const hex = result.data[ 'accent_' + stop ];
				if ( ! /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test( hex ) ) { continue; }
				const full = hex.length === 4 ? hex.slice(1).split('').map( digit => digit + digit ).join('') : hex.slice(1);
				document.documentElement.style.setProperty( '--lieve-accent-' + stop, hex );
				document.documentElement.style.setProperty( '--lieve-accent-' + stop + '-rgb', full.match(/../g).map( channel => parseInt(channel,16) ).join(',') );
			}
		} catch ( error ) {
			status.textContent = error.name === 'AbortError' ? 'Saving timed out. Your draft is still available. Check your connection and try again.' : error.message || 'Connection failed. Your draft is still available.'; status.classList.add( 'is-error' );
		} finally {
			if ( timeout !== null ) { window.clearTimeout( timeout ); }
			const failed = status.classList.contains( 'is-error' ), message = status.textContent;
			submitting = false; workspace.inert = false; cancel.disabled = false; form.removeAttribute( 'aria-busy' ); refresh();
			if ( failed ) { status.textContent = message; status.classList.add( 'is-error' ); }
		}
	} );
	document.addEventListener( 'keydown', event => {
		if ( ( event.metaKey || event.ctrlKey ) && ! event.altKey && ! event.shiftKey && event.key.toLowerCase() === 's' ) {
			event.preventDefault(); if ( dirty && ! submitting ) { form.requestSubmit(); }
		}
	} );
	window.addEventListener( 'beforeunload', event => { if ( dirty ) { event.preventDefault(); event.returnValue = ''; } } );
	// A restored back/forward page must not retain the previous submission lock.
	window.addEventListener( 'pageshow', event => { if ( event.persisted ) { submitting = false; workspace.inert = false; cancel.disabled = false; form.removeAttribute( 'aria-busy' ); refresh(); } } );
	refresh();
}() );
