/* One ID-stable breakpoint model and manager for the editor and admin page. */
( function () {
	'use strict';
	const iconNames = [ 'desktop-wide', 'desktop-curved', 'desktop', 'laptop', 'tablet-landscape', 'tablet-portrait', 'phone-landscape', 'phone-portrait' ];
	const defaultIcon = item => ( { desktop: 'laptop', tablet: 'tablet-portrait', mobile: 'phone-portrait' } )[item.id] || ( item.width >= 1280 ? 'desktop-wide' : item.width >= 992 ? 'laptop' : item.width >= 768 ? 'tablet-portrait' : 'phone-portrait' );
	const iconSvg = ( name, catalogue ) => iconNames.includes( name ) ? catalogue?.[name]?.svg || '' : '';
	const defaults = [ { id: 'desktop', name: 'Desktop', width: 1279, base: true, icon: 'laptop' }, { id: 'tablet', name: 'Tablet', width: 991, base: false, icon: 'tablet-portrait' }, { id: 'mobile', name: 'Mobile', width: 767, base: false, icon: 'phone-portrait' } ];
	const copy = items => items.map( item => ( { ...item } ) );
	const sort = items => copy( items ).sort( ( a, b ) => b.width - a.width );
	const validId = id => typeof id === 'string' && ( [ 'desktop', 'tablet', 'mobile' ].includes( id ) || /^bp_[a-z0-9]{8,24}$/.test( id ) );
	function validate( items ) {
		if ( ! Array.isArray( items ) || ! items.length || items.length > 20 ) { return 'Use between 1 and 20 breakpoints.'; }
		const ids = new Set(); const names = new Set(); const widths = new Set(); let bases = 0;
		for ( const item of items ) {
			if ( ! item || ! validId( item.id ) || ids.has( item.id ) || typeof item.base !== 'boolean' ) { return 'Invalid or duplicate breakpoint ID. Reload the manager.'; }
			if ( typeof item.name !== 'string' || ! item.name.trim() || [ ...item.name.trim() ].length > 40 || /[<>\x00-\x1f\x7f]/.test( item.name ) ) { return 'Each breakpoint needs a plain-text name of 1–40 characters.'; }
			if ( names.has( item.name.trim().toLowerCase() ) ) { return 'Breakpoint names must be unique.'; }
			if ( ! Number.isInteger( item.width ) || item.width < 240 || item.width > 7680 ) { return 'Use whole pixel widths between 240 and 7680.'; }
			if ( widths.has( item.width ) ) { return 'Breakpoint widths must be unique.'; }
			if ( Object.hasOwn( item, 'icon' ) && ! iconNames.includes( item.icon ) ) { return 'Choose a supported viewport icon.'; }
			ids.add( item.id ); names.add( item.name.trim().toLowerCase() ); widths.add( item.width ); bases += Number( item.base );
		}
		return bases === 1 ? '' : 'Choose exactly one base breakpoint.';
	}
	function normalize( value ) {
		if ( Array.isArray( value ) && ! validate( value ) ) { return value.map( item => ( { id: item.id, name: item.name.trim(), width: item.width, base: item.base, icon: item.icon || defaultIcon( item ) } ) ); }
		const items = copy( defaults );
		if ( value && Number.isInteger( value.tablet ) && Number.isInteger( value.mobile ) && value.tablet >= 320 && value.tablet <= 2560 && value.mobile >= 240 && value.mobile < value.tablet ) {
			items[0].width = Math.max( 1279, value.tablet + 1 ); items[1].width = value.tablet; items[2].width = value.mobile;
		}
		return items;
	}
	function fieldErrors( items ) {
		const errors = new Map(); const names = new Map(); const widths = new Map();
		const put = ( id, field, text ) => { const row = errors.get( id ) || {}; row[field] = text; errors.set( id, row ); };
		for ( const item of items ) {
			const name = item.name.trim(); const key = name.toLowerCase();
			if ( ! name || [ ...name ].length > 40 || /[<>\x00-\x1f\x7f]/.test( name ) ) { put( item.id, 'name', 'Enter a plain-text name of 1–40 characters.' ); }
			else if ( names.has( key ) ) { put( item.id, 'name', 'This name is already used.' ); put( names.get( key ), 'name', 'This name is already used.' ); }
			names.set( key, item.id );
			if ( ! Number.isInteger( item.width ) || item.width < 240 || item.width > 7680 ) { put( item.id, 'width', 'Enter a whole pixel width between 240 and 7680.' ); }
			else if ( widths.has( item.width ) ) { put( item.id, 'width', 'This width is already used.' ); put( widths.get( item.width ), 'width', 'This width is already used.' ); }
			widths.set( item.width, item.id );
		}
		return errors;
	}
	function order( items ) {
		const base = items.find( item => item.base );
		return [ base, ...sort( items.filter( item => item.width > base.width ) ).reverse(), ...sort( items.filter( item => item.width < base.width ) ) ];
	}
	function cascade( items, id ) {
		const ordered = order( items ); const base = ordered[0]; const selected = items.find( item => item.id === id );
		if ( ! selected ) { return []; }
		return ordered.filter( item => item.base || ( selected.width > base.width ? item.width > base.width && item.width <= selected.width : item.width < base.width && item.width >= selected.width ) );
	}
	function rule( item, items ) { return item.base ? '' : ( item.width > items.find( value => value.base ).width ? 'min-width:' : 'max-width:' ) + item.width + 'px'; }
	function strategy( items ) {
		const base = items.find( item => item.base );
		return base.width === Math.max( ...items.map( item => item.width ) ) ? 'Desktop-first' : base.width === Math.min( ...items.map( item => item.width ) ) ? 'Mobile-first' : 'Bidirectional cascade';
	}
	let idCounter = 0;
	function newId() {
		const bytes = new Uint8Array( 8 );
		if ( window.crypto?.getRandomValues ) { window.crypto.getRandomValues( bytes ); return 'bp_' + Array.from( bytes, value => value.toString( 16 ).padStart( 2, '0' ) ).join( '' ); }
		return 'bp_' + Date.now().toString( 36 ) + ( ++idCounter ).toString( 36 ).padStart( 4, '0' );
	}
	function createManager( { form, config, modal = null, open = null, onChange = () => {}, onError = () => {} } ) {
		const manager = form.querySelector( '[data-responsive-manager]' ); const list = manager.querySelector( '[data-responsive-list]' );
		const template = manager.querySelector( '[data-responsive-template]' ); const status = form.querySelector( '[data-responsive-status]' );
		const save = form.querySelector( '[data-responsive-save]' ); const add = manager.querySelector( '[data-breakpoint-add]' );
		const cancel = form.querySelector( '[data-responsive-cancel]' );
		let saved = normalize( config.breakpoints ); let draft = copy( saved ); let revision = config.breakpointRevision || '';
		let archived = copy( config.archivedBreakpoints || [] ); let saving = false; let refreshing = null; let refreshGeneration = -1; let generation = 0; let opening = 0;
		const dialog = modal ? window.LieveConditions.modal( modal, () => ! saving ) : null;
		const dirty = () => JSON.stringify( normalizeDraft() ) !== JSON.stringify( saved );
		const needsSorting = () => draft.some( ( item, index ) => index > 0 && draft[index - 1].width < item.width );
		function normalizeDraft() { return draft.map( item => ( { ...item, name: item.name.trim() } ) ); }
		function message( text = '', error = false ) { status.textContent = text; status.classList.toggle( 'is-error', error ); }
		function closePickers( except = null ) {
			list.querySelectorAll( '[data-breakpoint-row]' ).forEach( row => {
				if ( row === except ) { return; }
				row.querySelector( '[data-breakpoint-icon-menu]' ).hidden = true;
				row.querySelector( '[data-breakpoint-icon]' ).setAttribute( 'aria-expanded', 'false' );
			} );
		}
		function openPicker( row ) {
			closePickers( row );
			const menu = row.querySelector( '[data-breakpoint-icon-menu]' );
			menu.classList.remove( 'opens-up' ); menu.hidden = false;
			row.querySelector( '[data-breakpoint-icon]' ).setAttribute( 'aria-expanded', 'true' );
			// Keep the last row's choices inside the scrollable editor dialog/viewport.
			const bounds = menu.getBoundingClientRect?.();
			if ( bounds ) {
				const body = row.closest( '.lieve-breakpoints-body' );
				const bottom = Math.min( window.innerHeight, body?.getBoundingClientRect().bottom ?? window.innerHeight );
				menu.classList.toggle( 'opens-up', bounds.bottom > bottom - 12 );
			}
		}
		function meta() {
			const base = draft.find( item => item.base );
			const savedBase = saved.find( item => item.base );
			const errors = fieldErrors( draft );
			manager.querySelector( '[data-responsive-strategy]' ).textContent = strategy( draft );
			const crossesBase = draft.some( item => { const previous = saved.find( value => value.id === item.id ); return previous && ! item.base && ! previous.base && Number.isInteger( item.width ) && ( item.width > base.width ) !== ( previous.width > savedBase.width ); } );
			manager.querySelector( '[data-responsive-base-warning]' ).hidden = base.id === savedBase.id && ! crossesBase;
			list.querySelectorAll( '[data-breakpoint-row]' ).forEach( row => {
				const item = draft.find( value => value.id === row.dataset.breakpointId );
				const rowErrors = errors.get( item.id ) || {}; const error = row.querySelector( '[data-breakpoint-error]' );
				row.classList.toggle( 'has-error', Boolean( Object.keys( rowErrors ).length ) );
				if ( error ) { error.id = 'lieve-breakpoint-error-' + item.id; error.textContent = [ ...new Set( Object.values( rowErrors ) ) ].join( ' ' ); error.hidden = ! error.textContent; }
				for ( const field of [ 'name', 'width' ] ) {
					const input = row.querySelector( '[data-breakpoint-' + field + ']' );
					input.setAttribute( 'aria-invalid', String( Boolean( rowErrors[field] ) ) ); input.setCustomValidity?.( rowErrors[field] || '' );
					if ( rowErrors[field] && error ) { input.setAttribute( 'aria-describedby', error.id ); } else { input.removeAttribute?.( 'aria-describedby' ); }
				}
				row.classList.toggle( 'is-base', item.base );
				const icon = row.querySelector( '[data-breakpoint-icon]' );
				if ( icon.dataset.breakpointIcon !== item.icon ) { icon.innerHTML = iconSvg( item.icon, config.breakpointIcons ); icon.dataset.breakpointIcon = item.icon; }
				icon.setAttribute( 'aria-label', 'Choose icon for ' + ( item.name || 'breakpoint' ) );
				icon.title = ( config.breakpointIcons?.[item.icon]?.label || item.icon ) + ' · Change viewport icon';
				row.querySelectorAll( '[data-breakpoint-icon-option]' ).forEach( option => option.setAttribute( 'aria-pressed', String( option.dataset.breakpointIconOption === item.icon ) ) );
				row.querySelector( '[data-breakpoint-rule]' ).textContent = item.base ? 'All widths · Base' : ( item.width > base.width ? '≥ ' : '≤ ' ) + ( Number.isInteger( item.width ) ? item.width : '—' ) + ' px';
				const toggle = row.querySelector( '[data-breakpoint-base]' );
				toggle.setAttribute( 'aria-checked', String( item.base ) ); toggle.setAttribute( 'aria-label', 'Use ' + ( item.name || 'breakpoint' ) + ' as base breakpoint' );
				const remove = row.querySelector( '[data-breakpoint-remove]' ); remove.disabled = ! config.canManageBreakpoints || item.base || saving;
				remove.setAttribute( 'aria-label', 'Remove ' + ( item.name || 'breakpoint' ) + ' breakpoint' ); remove.title = item.base ? 'Choose another base before removing this breakpoint.' : 'Remove breakpoint';
			} );
			if ( add ) { add.disabled = saving || draft.length >= 20; }
			manager.querySelectorAll( '[data-breakpoint-restore]' ).forEach( button => { button.disabled = saving || ! config.canManageBreakpoints || draft.length >= 20; } );
			if ( save ) { save.disabled = saving || ! config.canManageBreakpoints || ! ( dirty() || needsSorting() ) || Boolean( validate( normalizeDraft() ) ); }
			if ( ! modal ) {
				if ( cancel ) { cancel.hidden = ! dirty(); cancel.disabled = saving; }
			}
		}
		function removed() {
			const active = new Set( draft.map( item => item.id ) ); const result = new Map();
			for ( const item of [ ...archived, ...saved ] ) { if ( ! active.has( item.id ) ) { result.set( item.id, { ...item, base: false } ); } }
			return [ ...result.values() ];
		}
		function renderArchive() {
			const section = manager.querySelector( '[data-responsive-archive]' ); if ( ! section ) { return; }
			const items = removed(); section.hidden = ! items.length;
			section.querySelector( '[data-responsive-archive-count]' ).textContent = String( items.length );
			section.querySelector( '[data-responsive-archive-list]' ).replaceChildren( ...items.map( item => {
				const row = document.createElement( 'div' ); row.className = 'lieve-responsive-archived-row';
				const description = document.createElement( 'span' ); const glyph = document.createElement( 'span' ); glyph.innerHTML = iconSvg( item.icon, config.breakpointIcons );
				const name = document.createElement( 'strong' ); name.textContent = item.name; const width = document.createElement( 'small' ); width.textContent = item.width + ' px';
				description.append( glyph, name, width ); row.appendChild( description );
				if ( config.canManageBreakpoints ) { const button = document.createElement( 'button' ); button.type = 'button'; button.className = 'lieve-conditions-cancel'; button.dataset.breakpointRestore = item.id; button.textContent = 'Restore'; button.disabled = saving || draft.length >= 20; row.appendChild( button ); }
				return row;
			} ) );
		}
		function render() {
			// Draft additions/width edits stay put. Only a successful save accepts
			// the server's descending-width order; CSS inheritance stays independent.
			list.replaceChildren( ...draft.map( item => {
				const row = template.content.firstElementChild.cloneNode( true ); row.dataset.breakpointId = item.id;
				row.querySelector( '[data-breakpoint-name]' ).value = item.name; row.querySelector( '[data-breakpoint-width]' ).value = String( item.width );
				row.querySelector( '[data-breakpoint-name]' ).setAttribute( 'aria-label', item.name + ' name' );
				row.querySelector( '[data-breakpoint-width]' ).setAttribute( 'aria-label', item.name + ' width' );
				return row;
			} ) ); meta(); renderArchive();
		}
		function hydrate() {
			const rows = Array.from( list.querySelectorAll( '[data-breakpoint-row]' ) );
			// Saved rows already occupy their final layout before the footer scripts load.
			// Only rebuild if a stale/different server snapshot cannot match the config.
			const matches = rows.length === saved.length && rows.every( ( row, index ) => {
				const item = saved[index]; const name = row.querySelector( '[data-breakpoint-name]' ); const width = row.querySelector( '[data-breakpoint-width]' );
				return row.dataset.breakpointId === item.id && name?.defaultValue === item.name && width?.defaultValue === String( item.width ) && row.querySelector( '[data-breakpoint-icon]' )?.dataset.breakpointIcon === item.icon;
			} );
			if ( ! matches ) { render(); return; }
			// Keep focus, browser-restored values and any edits made before initialization.
			if ( config.canManageBreakpoints ) { rows.forEach( ( row, index ) => {
				draft[index].name = row.querySelector( '[data-breakpoint-name]' ).value;
				const value = row.querySelector( '[data-breakpoint-width]' ).value; draft[index].width = value === '' ? NaN : Number( value );
			} ); }
			meta(); renderArchive();
		}
		function discard() { if ( saving ) { return; } ++generation; draft = copy( saved ); render(); message(); }
		function setBusy( value ) {
			saving = value; form.setAttribute( 'aria-busy', String( value ) );
			if ( value ) { closePickers(); }
			form.querySelectorAll( 'input, button' ).forEach( control => { if ( control.matches( '[data-close-conditions], [data-responsive-cancel]' ) ) { control.disabled = value; } else { control.disabled = value || ! config.canManageBreakpoints; } } ); meta();
		}
		async function fetchSettings( payload ) {
			const response = await ( window.LieveTransport?.fetch || window.fetch.bind( window ) )(  config.breakpointsUrl, { method: payload ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': config.nonce }, ...( payload ? { body: JSON.stringify( payload ) } : {} ) } );
			let result; try { result = await response.json(); } catch ( error ) { throw new Error( 'The server returned an unreadable response. Your draft is retained.' ); }
			if ( ! response.ok ) { throw new Error( result.message || 'Responsive settings could not be saved.' ); }
			if ( validate( result.breakpoints ) || typeof result.breakpointRevision !== 'string' || ! /^[a-f0-9]{64}$/.test( result.breakpointRevision ) ) { throw new Error( 'Invalid responsive settings response. Reload the manager.' ); }
			if ( result.archivedBreakpoints !== undefined && ( ! Array.isArray( result.archivedBreakpoints ) || result.archivedBreakpoints.some( item => validate( [ { ...item, base: true } ] ) ) ) ) { throw new Error( 'Invalid removed breakpoints response.' ); }
			return result;
		}
		function accept( result ) {
			saved = normalize( result.breakpoints ); revision = result.breakpointRevision; config.breakpoints = copy( saved ); config.breakpointRevision = revision;
			archived = copy( result.archivedBreakpoints || [] ); config.archivedBreakpoints = copy( archived );
			draft = copy( saved ); render(); onChange( copy( saved ) );
		}
		async function refresh( allowOpen = false ) {
			if ( saving || dirty() || modal && ! modal.hidden && ! allowOpen ) { return; }
			if ( refreshing ) { const pending = refreshing; const stale = refreshGeneration !== generation; const result = await pending; return stale && allowOpen ? refresh( true ) : result; }
			const token = ++generation;
			refreshGeneration = token;
			refreshing = ( async () => { try {
				const result = await fetchSettings();
				if ( token === generation && ! saving && ! dirty() && ( ! modal || modal.hidden || allowOpen ) && revision !== result.breakpointRevision ) { accept( result ); }
				return true;
			} catch ( error ) { if ( allowOpen && modal && ! modal.hidden && token === generation && ! dirty() ) { message( error.message, true ); } onError( error.message ); return false; } finally { refreshing = null; } } )();
			return refreshing;
		}
		form.addEventListener( 'input', event => {
			const row = event.target.closest( '[data-breakpoint-row]' ); if ( ! row || saving || ! config.canManageBreakpoints ) { return; }
			const item = draft.find( value => value.id === row.dataset.breakpointId );
			if ( ! item ) { return; }
			if ( event.target.matches( '[data-breakpoint-name]' ) ) { item.name = event.target.value; }
			if ( event.target.matches( '[data-breakpoint-width]' ) ) { item.width = event.target.value === '' ? NaN : Number( event.target.value ); }
			message(); meta();
			const error = validate( normalizeDraft() ); if ( error ) { message( error, true ); }
		} );
		form.addEventListener( 'focusout', event => {
			const picker = event.target.closest( '[data-breakpoint-picker]' );
			if ( picker && ! picker.contains( event.relatedTarget ) ) { closePickers(); }
			const row = event.target.closest( '[data-breakpoint-row]' ); if ( ! row ) { return; }
			const item = draft.find( value => value.id === row.dataset.breakpointId );
			// Replacing/removing a focused draft row can emit focusout for its old ID.
			if ( ! item ) { return; }
			row.querySelector( '[data-breakpoint-name]' ).setAttribute( 'aria-label', ( item.name || 'Breakpoint' ) + ' name' );
			row.querySelector( '[data-breakpoint-width]' ).setAttribute( 'aria-label', ( item.name || 'Breakpoint' ) + ' width' );
		} );
		form.addEventListener( 'click', event => {
			if ( ! config.canManageBreakpoints || saving ) { return; }
			const restore = event.target.closest( '[data-breakpoint-restore]' );
			if ( restore && draft.length < 20 ) {
				const item = removed().find( value => value.id === restore.dataset.breakpointRestore );
				if ( item ) { draft.push( { ...item, base: false } ); render(); message( 'Breakpoint restored in this draft. Save to reactivate its styles.' ); const input = list.querySelector( '[data-breakpoint-id="' + item.id + '"] [data-breakpoint-name]' ); input?.focus(); }
				return;
			}
			const row = event.target.closest( '[data-breakpoint-row]' );
			const id = row?.dataset.breakpointId;
			const trigger = event.target.closest( '[data-breakpoint-icon]' );
			if ( trigger ) {
				const menu = row.querySelector( '[data-breakpoint-icon-menu]' );
				if ( menu.hidden ) { openPicker( row ); } else { closePickers(); }
				return;
			}
			const option = event.target.closest( '[data-breakpoint-icon-option]' );
			if ( option && iconNames.includes( option.dataset.breakpointIconOption ) ) {
				const item = draft.find( value => value.id === id ); if ( ! item ) { return; }
				item.icon = option.dataset.breakpointIconOption; meta(); message(); closePickers(); row.querySelector( '[data-breakpoint-icon]' ).focus(); return;
			}
			if ( event.target.closest( '[data-breakpoint-base]' ) ) {
				draft.forEach( item => { item.base = item.id === id; } ); meta(); message(); return;
			}
			if ( event.target.closest( '[data-breakpoint-remove]' ) && ! draft.find( item => item.id === id )?.base ) {
				draft = draft.filter( item => item.id !== id ); render(); message( 'Breakpoint removed from this draft. Save to apply.' ); add?.focus(); return;
			}
			if ( event.target.closest( '[data-breakpoint-add]' ) && draft.length < 20 ) {
				let width = 1024; while ( draft.some( item => item.width === width ) && width < 7680 ) { width++; }
				let index = 1; while ( draft.some( item => item.name.toLowerCase() === 'breakpoint ' + index ) ) { index++; }
				const item = { id: newId(), name: 'Breakpoint ' + index, width, base: false, icon: defaultIcon( { width } ) }; draft.push( item ); render(); message();
				const input = list.querySelector( '[data-breakpoint-id="' + item.id + '"] [data-breakpoint-name]' ); input.focus(); input.select(); return;
			}
			if ( event.target.closest( '[data-breakpoint-reset]' ) ) { draft = normalize( config.defaultBreakpoints || defaults ); render(); message( 'Defaults restored in this draft. Save to apply.' ); return; }
			if ( event.target.closest( '[data-responsive-cancel]' ) ) { discard(); if ( ! modal ) { add?.focus(); } }
		} );
		form.addEventListener( 'keydown', event => {
			const row = event.target.closest( '[data-breakpoint-row]' );
			if ( ! row || ! event.target.closest( '[data-breakpoint-picker]' ) || saving || ! config.canManageBreakpoints ) { return; }
			const menu = row.querySelector( '[data-breakpoint-icon-menu]' );
			const trigger = row.querySelector( '[data-breakpoint-icon]' );
			if ( event.key === 'Escape' && ! menu.hidden ) { event.preventDefault(); event.stopPropagation(); closePickers(); trigger.focus(); return; }
			const options = Array.from( menu.querySelectorAll( '[data-breakpoint-icon-option]' ) );
			if ( event.target === trigger && event.key === 'ArrowDown' ) { event.preventDefault(); openPicker( row ); ( options.find( option => option.getAttribute( 'aria-pressed' ) === 'true' ) || options[0] ).focus(); return; }
			if ( menu.hidden || ! [ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End' ].includes( event.key ) ) { return; }
			event.preventDefault();
			const index = options.indexOf( event.target.closest( '[data-breakpoint-icon-option]' ) );
			const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[event.key];
			options[ event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : ( index + step + options.length ) % options.length ].focus();
		} );
		if ( typeof document !== 'undefined' ) { document.addEventListener?.( 'pointerdown', event => { if ( ! event.target.closest( '[data-breakpoint-picker]' ) ) { closePickers(); } } ); }
		function saveShortcut( event ) {
			if ( event.defaultPrevented || event.altKey || ! ( event.metaKey || event.ctrlKey ) || event.key.toLowerCase() !== 's' ) { return; }
			event.preventDefault(); event.stopPropagation();
			if ( ! event.repeat && config.canManageBreakpoints && ! saving && ( dirty() || needsSorting() ) ) { form.requestSubmit(); }
		}
		form.addEventListener( 'keydown', saveShortcut );
		if ( ! modal && typeof document !== 'undefined' ) { document.addEventListener?.( 'keydown', saveShortcut ); }
		form.addEventListener( 'submit', async event => {
			event.preventDefault(); if ( saving || ! config.canManageBreakpoints ) { return; }
			const next = normalizeDraft(); const error = validate( next ); if ( error ) { message( error, true ); form.reportValidity(); return; }
			if ( ! dirty() && ! needsSorting() ) { message( 'No breakpoint changes to save.' ); dialog?.close(); return; }
			++generation; setBusy( true ); message( 'Saving…' );
			try {
				const result = await fetchSettings( { breakpoints: sort( next ), breakpointRevision: revision } ); accept( result );
				setBusy( false ); message( 'Breakpoints saved. Ordered by width, largest first.' ); dialog?.close();
			} catch ( error ) { message( error.message, true ); } finally { setBusy( false ); }
		} );
		if ( open && dialog ) {
			open.setAttribute( 'aria-expanded', 'false' );
			open.addEventListener( 'click', async () => {
				if ( ! modal.hidden ) { return; }
				discard(); open.setAttribute( 'aria-expanded', 'true' ); dialog.open( open );
				const ticket = ++opening; message( 'Checking for updates…' ); const fresh = await refresh( true );
				if ( fresh && ticket === opening && ! modal.hidden && ! dirty() && ! saving ) { message(); }
			} );
			modal.addEventListener( 'lieve:conditions-close', () => { ++opening; discard(); open.setAttribute( 'aria-expanded', 'false' ); } );
		}
		if ( ! modal ) {
			window.addEventListener?.( 'beforeunload', event => { if ( dirty() || saving ) { event.preventDefault(); event.returnValue = ''; } } );
			window.addEventListener?.( 'focus', () => { void refresh(); } );
		}
		hydrate(); onChange( copy( saved ) );
		return { refresh, submit() { if ( config.canManageBreakpoints ) { form.requestSubmit(); } }, discard, isDirty: dirty };
	}
	window.LieveResponsive = { defaults, iconNames, defaultIcon, iconSvg, validId, validate, fieldErrors, normalize, order, cascade, rule, strategy, createManager };
	const page = typeof document !== 'undefined' ? document.getElementById( 'lieve-responsive-form' ) : null;
	if ( page && window.LieveResponsiveConfig ) { createManager( { form: page, config: window.LieveResponsiveConfig, onError: message => { const status = page.querySelector( '[data-responsive-status]' ); status.textContent = message; status.classList.add( 'is-error' ); } } ); }
}() );
