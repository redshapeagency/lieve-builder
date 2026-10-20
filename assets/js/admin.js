( function () {
	'use strict';

	const config = window.LieveAdminConfig || {};
	function templateRequestId() {
		if ( typeof window.crypto?.randomUUID === 'function' ) { return window.crypto.randomUUID(); }
		// randomUUID is HTTPS-only; local/custom HTTP WordPress domains still support getRandomValues.
		if ( typeof window.crypto?.getRandomValues === 'function' ) { return Array.from( window.crypto.getRandomValues( new Uint8Array( 16 ) ), value => value.toString( 16 ).padStart( 2, '0' ) ).join( '' ); }
		return Date.now().toString( 36 ) + '-' + Math.random().toString( 36 ).slice( 2 ) + Math.random().toString( 36 ).slice( 2 );
	}
	const addNewLink = document.querySelector( '.post-type-lieve_template .page-title-action' );
	if ( addNewLink && config.newTemplateUrl ) {
		addNewLink.href = config.newTemplateUrl;
	}

	// Empty states are server-rendered, including search/filter/Trash views.
	const typeInputs = document.querySelectorAll( 'input[name="template_type"]' );
	const conditionsRoot = document.getElementById( 'lieve-create-conditions' );
	const conditionsInput = document.getElementById( 'lieve-template-conditions' );
	if ( typeInputs.length && conditionsRoot && conditionsInput && window.LieveConditions ) {
		let initialConditions = [];
		try {
			initialConditions = JSON.parse( conditionsInput.value || '[]' );
		} catch ( error ) {
			initialConditions = [];
		}

		const form = document.getElementById( 'lieve-create-template-form' );
		const initialType = document.querySelector( 'input[name="template_type"]:checked' )?.value || 'header';
		let submitting = false;
		const conditionsBuilder = window.LieveConditions.create( {
			root: conditionsRoot,
			input: conditionsInput,
			popupInput: document.getElementById( 'lieve-popup-opening' ),
			popupOpening: document.getElementById( 'lieve-popup-opening' )?.value || 'automatic',
			config: config.conditionConfig || {},
			templateType: initialType,
			conditions: initialConditions,
		} );
		const conditionCard = conditionsRoot.closest( '.lieve-condition-card' );
		if ( conditionCard ) { conditionCard.hidden = initialType === 'component'; }

		typeInputs.forEach( ( input ) => input.addEventListener( 'change', () => {
			if ( ! input.checked || submitting ) { return; }
			// Change available controls (such as Section hooks), never the authored rules.
			conditionsBuilder.setTemplateType( input.value );
			if ( conditionCard ) { conditionCard.hidden = input.value === 'component'; }
		} ) );
		if ( form ) {
			const submit = form.querySelector( '[type="submit"]' );
			const hint = form.querySelector( '.lieve-save-shortcut' ); if ( hint ) { hint.textContent = /Mac|iPhone|iPad/.test( window.navigator?.platform || '' ) ? '⌘ S' : 'Ctrl S'; }
			form.addEventListener( 'submit', event => {
				const component = document.querySelector('input[name="template_type"]:checked')?.value === 'component';
				if ( submitting || ! component && ! conditionsBuilder.reportValidity() ) { event.preventDefault(); return; }
				submitting = true; submit.disabled = true; submit.textContent = 'Creating…';
				// Keep successful form controls enabled until the native POST is serialized.
				form.setAttribute( 'aria-busy', 'true' );
			} );
			form.addEventListener( 'keydown', event => {
				if ( ! event.defaultPrevented && ! event.altKey && ( event.metaKey || event.ctrlKey ) && event.key.toLowerCase() === 's' ) { event.preventDefault(); if ( ! event.repeat && ! submitting ) { form.requestSubmit(); } }
			} );
			window.addEventListener( 'pageshow', event => {
				if ( event.persisted && submitting ) { const key = form.querySelector( '[name="template_request_id"]' ); if ( key ) { key.value = templateRequestId(); } }
				submitting = false; submit.disabled = false; submit.textContent = 'Create Template'; form.removeAttribute( 'aria-busy' );
			} );
		}
	}

	const modalRoot = document.getElementById( 'lieve-conditions-modal' );
	const popupRoot = document.getElementById( 'lieve-admin-conditions' );
	if ( ! modalRoot || ! popupRoot || ! window.LieveConditions ) {
		return;
	}
	const status = document.getElementById( 'lieve-conditions-status' );
	const save = document.getElementById( 'lieve-save-conditions' );
	const cancel = document.getElementById( 'lieve-cancel-conditions' );
	let activeId = null;
	let loading = false;
	let saving = false;
	let changed = false;
	let original = '[]';
	let originalOpening = 'automatic';
	let revision = '';
	let requestId = 0;
	const snapshots = new Map();
	const listStatus = document.getElementById( 'lieve-template-list-status' );
	const templateTypeInventory = Array.isArray(config.templateTypes) ? config.templateTypes : ['header','footer','content','section','component','popup','archive','search','error'];
	function validSnapshot( result ) {
		if ( result?.displayRules !== undefined && ( ! Array.isArray( result.displayRules ) || result.displayRules.length !== result.conditions?.length || ! result.displayRules.every( rule => rule && [ 'include', 'exclude' ].includes( rule.action ) && [ rule.actionLabel, rule.title, rule.description ].every( value => typeof value === 'string' ) ) ) ) { return false; }
		return result && Array.isArray( result.conditions ) && result.conditions.every( row => row && typeof row.type === 'string' && [ 'include', 'exclude' ].includes( row.action ) && Array.isArray( row.values ) ) && templateTypeInventory.includes( result.templateType ) && /^[a-f0-9]{64}$/.test( result.templateRevision || '' ) && [ 'draft', 'publish', 'pending', 'private', 'future', 'trash', 'auto-draft' ].includes( result.templateStatus ) && typeof result.summary === 'string' && Array.isArray( result.details ) && Array.isArray( result.competition ) && result.state && typeof result.state.label === 'string';
	}
	function displayElement( tag, className, text ) {
		const element = document.createElement( tag ); element.className = className;
		if ( text !== undefined ) { element.textContent = text; }
		return element;
	}
	function displayIcon( name ) {
		const shapes = {
			scope: [ [ 'circle', { cx: 12, cy: 12, r: 8.5 } ], [ 'ellipse', { cx: 12, cy: 12, rx: 3.5, ry: 8.5 } ], [ 'path', { d: 'M3.5 12h17' } ] ],
			manual: [ [ 'rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2.5 } ], [ 'path', { d: 'M3.5 9h17M9 9v10.5' } ] ],
			chevron: [ [ 'path', { d: 'm9 5 7 7-7 7' } ] ],
			warning: [ [ 'path', { d: 'm10.3 4.6-7 12.2a2 2 0 0 0 1.7 3h14a2 2 0 0 0 1.7-3l-7-12.2a2 2 0 0 0-3.4 0Z' } ], [ 'path', { d: 'M12 9v4m0 3h.01' } ] ],
		};
		const svg = document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' );
		Object.entries( { class: 'lieve-display-svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' } ).forEach( ( [ key, value ] ) => svg.setAttribute( key, value ) );
		shapes[ name ].forEach( ( [ tag, attributes ] ) => { const shape = document.createElementNS( 'http://www.w3.org/2000/svg', tag ); Object.entries( attributes ).forEach( ( [ key, value ] ) => shape.setAttribute( key, value ) ); svg.append( shape ); } );
		return svg;
	}
	function displayRule( rule ) {
		const node = displayElement( 'div', 'lieve-display-rule' ), copy = displayElement( 'div', 'lieve-display-rule-copy' );
		const action = displayElement( 'span', 'lieve-display-action', rule.actionLabel ); action.dataset.ruleAction = rule.action;
		copy.append( displayElement( 'span', 'lieve-display-scope', rule.title ) );
		if ( rule.description ) { copy.append( displayElement( 'p', 'lieve-display-target', rule.description ) ); }
		node.append( action, copy );
		return node;
	}
	function renderDisplay( display, result ) {
		const expandedRules = !! display.querySelector( '.lieve-template-rule-details[open]' ), expandedPeers = !! display.querySelector( '.lieve-template-competition[open]' );
		// Older snapshots remain readable while an already-open admin page updates.
		const rules = Array.isArray( result.displayRules ) ? result.displayRules : result.conditions.map( ( row, index ) => {
			const actionLabel = row.action === 'exclude' ? 'Exclude' : 'Include', title = config.conditionConfig?.types?.[ row.type ] || row.type.replace( /_/g, ' ' );
			let description = result.details[ index ] || '';
			if ( description.startsWith( actionLabel + ': ' ) ) { description = description.slice( actionLabel.length + 2 ); }
			if ( description === title ) { description = ''; } else if ( description.startsWith( title + ' · ' ) ) { description = description.slice( title.length + 3 ); }
			return { action: row.action, actionLabel, title, description };
		} );
		const includes = rules.filter( rule => rule.action === 'include' ), excluded = rules.length - includes.length;
		const plural = ( count, singular, multiple ) => count + ' ' + ( count === 1 ? singular : multiple );
		let title = ! rules.length ? 'Manual placement' : includes.length ? includes[0].title + ( includes[0].description ? ' · ' + includes[0].description : '' ) : 'Entire Website';
		if ( includes.length > 1 ) { title += ' +' + plural( includes.length - 1, 'more rule', 'more rules' ); }
		if ( result.templateType === 'component' ) { title = 'Linked component'; }
		const captions = []; if ( includes.length ) { captions.push( plural( includes.length, 'include rule', 'include rules' ) ); } if ( excluded ) { captions.push( plural( excluded, 'exclusion rule', 'exclusion rules' ) ); }
		const card = displayElement( rules.length ? 'details' : 'div', rules.length ? 'lieve-template-rule-details lieve-display-card' : 'lieve-display-card is-manual' );
		const overview = displayElement( rules.length ? 'summary' : 'div', 'lieve-display-overview' ), icon = displayElement( 'span', 'lieve-display-icon' ), copy = displayElement( 'span', 'lieve-display-copy' );
		const heading = displayElement( 'span', 'lieve-display-title', title ); heading.setAttribute( 'title', title );
		const caption = displayElement( 'span', 'lieve-display-caption', result.templateType === 'component' ? 'Shared model for linked instances' : rules.length ? captions.join( ' · ' ) : 'No automatic display rules' );
		if ( result.competition.length ) { caption.append( displayElement( 'span', 'lieve-display-overlap-hint', ' · ' + plural( result.competition.length, 'overlap', 'overlaps' ) ) ); }
		copy.append( heading, caption ); icon.append( displayIcon( rules.length ? 'scope' : 'manual' ) ); overview.append( icon, copy );
		if ( rules.length ) { overview.append( displayIcon( 'chevron' ) ); }
		card.append( overview ); display.replaceChildren( card );
		let panel = card;
		if ( rules.length ) {
			panel = displayElement( 'div', 'lieve-display-panel' ); const list = displayElement( 'ol', 'lieve-display-rules' );
			rules.forEach( rule => { const item = displayElement( 'li', '' ); item.append( displayRule( rule ) ); list.append( item ); } );
			panel.append( list, displayElement( 'p', 'lieve-display-note', 'Includes use OR logic. Exclusions take precedence.' ) ); card.append( panel ); card.open = expandedRules;
		}
		if ( result.competition.length ) {
			const node = displayElement( 'details', 'lieve-template-competition' ), summary = displayElement( 'summary', '' ), peerPanel = displayElement( 'div', 'lieve-display-panel' ), list = displayElement( 'ul', 'lieve-display-peers' );
			summary.append( displayIcon( 'warning' ), displayElement( 'span', '', 'Potential overlap' ), displayElement( 'span', 'lieve-display-count', String( result.competition.length ) ), displayIcon( 'chevron' ) ); node.append( summary );
			peerPanel.append( displayElement( 'p', 'lieve-display-note', 'These published templates may target the same location. This is advisory; exclusions and frontend specificity still determine the result.' ) );
			result.competition.forEach( peer => { const item = displayElement( 'li', '' ); if ( peer.editUrl ) { const link = displayElement( 'a', '', peer.title ); link.href = peer.editUrl; item.append( link ); } else { item.textContent = peer.title; } list.append( item ); } ); peerPanel.append( list ); node.append( peerPanel ); node.open = expandedPeers; panel.append( node );
		}
	}
	function updateRow( id, result ) {
		snapshots.set( id, result );
		const row = document.getElementById( 'post-' + id );
		row?.querySelectorAll( '[data-template-revision]' ).forEach( button => { button.dataset.templateRevision = result.templateRevision; } );
		const trigger = row?.querySelector( '.lieve-row-conditions' ); if ( trigger ) { trigger.dataset.templateConditions = JSON.stringify( result ); }
		const badge = row?.querySelector( '[data-template-state]' ); if ( badge && result.state ) { badge.dataset.templateState = result.state.key; badge.textContent = result.state.label; }
		const toggle = row?.querySelector( '.lieve-template-toggle' );
		if ( toggle ) {
			const active = result.templateStatus === 'publish';
			toggle.setAttribute( 'aria-checked', String( active ) );
			toggle.dataset.templateStatus = active ? 'draft' : 'publish';
			toggle.title = active ? 'Deactivate template' : 'Activate template';
		}
		const display = row?.querySelector( '[data-template-display]' );
		if ( ! display ) { return; }
		renderDisplay( display, result );
	}
	async function api( id, action, body ) {
		const response = await ( window.LieveTransport?.fetch || fetch )(  config.restUrl + 'templates/' + id + '/' + action, {
			method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin', headers: { 'X-WP-Nonce': config.nonce, 'Content-Type': 'application/json' }, ...( body ? { body: JSON.stringify( body ) } : {} ),
		} );
		let result; try { result = await response.json(); } catch ( error ) { throw new Error( 'The server returned an unreadable response. Your draft is retained; try again.' ); }
		if ( ! response.ok ) { throw new Error( result.message || 'Unable to update the template. Your draft is retained.' ); }
		return result;
	}
	let libraryBusy = false;
	// Keep native status counts, dates, filters and Quick Edit data server-authored.
	// The old list stays visible until the populated replacement is ready.
	async function refreshLibrary( id, restoreFocus ) {
		const list = document.getElementById( 'the-list' );
		if ( ! list ) { return; }
		const response = await ( window.LieveTransport?.fetch || fetch )(  window.location.href, { credentials: 'same-origin', cache: 'no-store' } );
		if ( ! response.ok ) { throw new Error( 'The library could not refresh. Reload the page to update its counts.' ); }
		const fresh = new DOMParser().parseFromString( await response.text(), 'text/html' );
		const next = fresh.getElementById( 'the-list' );
		if ( ! next || ! fresh.querySelector( '.post-type-lieve_template' ) ) { throw new Error( 'The library could not refresh. Reload the page to update its counts.' ); }
		// Never discard a native Quick Edit draft started while the request was pending.
		if ( list.querySelector( '.inline-editor' ) ) { throw new Error( 'Finish Quick Edit, then reload the library to update its counts.' ); }
		const selected = Array.from( list.querySelectorAll( '.check-column input:checked' ), input => input.id );
		const expandedRows = Array.from( list.querySelectorAll( '.is-expanded' ), row => row.id );
		const expanded = Array.from( list.querySelectorAll( 'details[open]' ), detail => [ detail.closest( 'tr' ).id, detail.classList.contains( 'lieve-template-competition' ) ? '.lieve-template-competition' : '.lieve-template-rule-details' ] );
		const focused = restoreFocus && ( ! document.activeElement || document.activeElement === document.body || document.activeElement.dataset?.templateAction === 'status' && document.activeElement.dataset.templateId === String( id ) );
		list.replaceChildren( ...next.children );
		selected.forEach( key => { const input = document.getElementById( key ); if ( input ) { input.checked = true; } } );
		expandedRows.forEach( key => document.getElementById( key )?.classList.add( 'is-expanded' ) );
		const checkboxes = Array.from( list.querySelectorAll( '.check-column input[type="checkbox"]' ) );
		document.querySelectorAll( '#cb-select-all-1, #cb-select-all-2' ).forEach( input => { input.checked = checkboxes.length > 0 && checkboxes.every( checkbox => checkbox.checked ); } );
		expanded.forEach( ( [ key, selector ] ) => { const detail = document.getElementById( key )?.querySelector( selector ); if ( detail ) { detail.open = true; } } );
		[ '.subsubsub', '.tablenav.top .tablenav-pages', '.tablenav.bottom .tablenav-pages' ].forEach( selector => {
			const current = document.querySelector( selector ), replacement = fresh.querySelector( selector );
			if ( current && replacement ) { current.replaceChildren( ...replacement.childNodes ); }
		} );
		snapshots.clear();
		bindLibraryRows( list );
		if ( focused ) {
			const target = document.getElementById( 'post-' + id )?.querySelector( '.lieve-template-toggle' );
			if ( target ) { target.focus( { preventScroll: true } ); }
			else if ( listStatus ) { listStatus.tabIndex = -1; listStatus.focus( { preventScroll: true } ); }
		}
	}
	async function templateAction( button ) {
		if ( button.disabled || libraryBusy || saving || ! modalRoot.hidden ) { return; }
		const restoreFocus = document.activeElement === button;
		libraryBusy = true; button.disabled = true; button.setAttribute( 'aria-busy', 'true' );
		const id = Number( button.dataset.templateId ), action = button.dataset.templateAction;
		try {
			const body = { templateRevision: button.dataset.templateRevision };
			if ( action === 'duplicate' ) { body.requestId = button.dataset.requestId ||= templateRequestId(); }
			else { body.templateStatus = button.dataset.templateStatus; }
			const result = await api( id, action, body );
			if ( action === 'duplicate' ? ! Number.isInteger( result.id ) || ! result.listUrl : ! validSnapshot( result ) ) { throw new Error( 'The operation could not be verified. Refresh the library before trying again.' ); }
			if ( listStatus ) { listStatus.hidden = false; listStatus.classList.remove( 'is-error' ); listStatus.textContent = action === 'duplicate' ? 'Inactive copy created.' : 'Template state updated.'; }
			if ( action === 'duplicate' ) { window.location.assign( result.listUrl ); }
			else {
				updateRow( id, result );
				const message = result.templateStatus === 'publish' ? 'Template activated.' : 'Template deactivated.';
				if ( listStatus ) { listStatus.textContent = message; }
				try { await refreshLibrary( id, restoreFocus ); }
				catch ( error ) { if ( listStatus ) { listStatus.classList.add( 'is-error' ); listStatus.textContent = message + ' ' + error.message; } }
			}
		} catch ( error ) { if ( listStatus ) { listStatus.hidden = false; listStatus.classList.add( 'is-error' ); listStatus.textContent = error.message; listStatus.scrollIntoView( { block: 'nearest' } ); } }
		finally { libraryBusy = false; button.disabled = false; button.removeAttribute( 'aria-busy' ); }
	}
	const snapshotKey = result => JSON.stringify( { templateType: result.templateType, conditions: result.conditions || [], popupOpening: result.popupOpening || 'automatic' } );
	function updateActions() {
		save.disabled = loading || saving || ! changed;
		cancel.hidden = ! changed;
		cancel.disabled = saving;
	}
	const dialog = window.LieveConditions.modal( modalRoot, () => ! saving );
	const editor = window.LieveConditions.create( {
		root: popupRoot,
		config: config.conditionConfig || {},
		onChange( rows, opening = originalOpening ) {
			changed = JSON.stringify( rows ) !== original || opening !== originalOpening;
			status.classList.remove( 'is-error' );
			status.textContent = changed ? 'Unsaved changes' : '';
			updateActions();
		},
	} );
	modalRoot.addEventListener( 'lieve:conditions-close', () => {
		requestId++;
		activeId = null;
		loading = false;
		changed = false;
		editor.setConditions( JSON.parse( original ), false, undefined, originalOpening );
		updateActions();
		status.classList.remove( 'is-error' );
		status.textContent = '';
	} );
	async function request( id, method = 'GET', conditions ) {
		const visibleIds = Array.from( document.querySelectorAll( '.lieve-row-conditions' ), button => Number( button.dataset.templateId ) );
		const result = await api( id, 'conditions', method === 'POST' ? { conditions, popupOpening: editor.getPopupOpening(), templateRevision: revision, visibleIds } : null );
		if ( ! validSnapshot( result ) ) { throw new Error( 'The saved conditions could not be verified. Your draft is retained; reload before saving again.' ); }
		return result;
	}
	function showConditions( result ) {
		editor.setConditions( result.conditions || [], false, result.templateType, result.popupOpening );
		original = JSON.stringify( editor.getConditions() );
		originalOpening = result.popupOpening || 'automatic';
		revision = result.templateRevision;
		changed = false;
		popupRoot.hidden = false;
		updateActions();
		status.textContent = '';
	}
	async function openConditions( button ) {
		if ( saving || libraryBusy ) { return; }
		activeId = parseInt( button.dataset.templateId, 10 );
		const id = activeId;
		const ticket = ++requestId;
		if ( ! snapshots.has( id ) ) {
			try {
				const snapshot = JSON.parse( button.dataset.templateConditions || 'null' );
				if ( validSnapshot( snapshot ) ) { snapshots.set( id, snapshot ); }
			} catch ( error ) { /* Older/dynamically inserted rows use the REST fallback. */ }
		}
		const initial = snapshots.get( id );
		loading = ! initial;
		changed = false;
		updateActions();
		status.classList.remove( 'is-error' );
		if ( initial ) {
			showConditions( initial );
			dialog.open( button );
		} else {
			// Never expose an empty modal while waiting for an unbootstrapped row.
			button.setAttribute( 'aria-busy', 'true' );
		}
		try {
			const result = await request( id );
			if ( ticket !== requestId ) {
				return;
			}
			snapshots.set( id, result );
			// A fresh but unchanged response must not rebuild rows or steal focus.
			// If the user has started editing, keep that draft intact until Cancel/Save.
			if ( ! initial || ! changed && snapshotKey( initial ) !== snapshotKey( result ) ) { showConditions( result ); }
			else if ( ! changed ) { revision = result.templateRevision; }
			if ( ! initial ) { dialog.open( button ); }
		} catch ( error ) {
			if ( ticket === requestId ) {
					if ( ! initial ) {
					editor.setConditions( [] ); original = '[]'; popupRoot.hidden = true;
					dialog.open( button ); status.classList.add( 'is-error' ); status.textContent = error.message;
					}
					status.classList.add( 'is-error' ); status.textContent = ( initial ? 'Refresh failed. ' : '' ) + error.message;
			}
		} finally {
			button.removeAttribute( 'aria-busy' );
			if ( ticket === requestId ) {
				loading = false;
				updateActions();
			}
		}
	}
	function bindLibraryRows( root ) {
		root.querySelectorAll( '[data-template-action]' ).forEach( button => button.addEventListener( 'click', () => templateAction( button ) ) );
		root.querySelectorAll( '.lieve-row-conditions' ).forEach( button => button.addEventListener( 'click', () => openConditions( button ) ) );
	}
	bindLibraryRows( document );
	cancel.addEventListener( 'click', () => {
		if ( saving || ! changed ) { return; }
		++requestId; // A pending refresh cannot replace the restored snapshot.
		loading = false;
		editor.setConditions( JSON.parse( original ), false, undefined, originalOpening );
		changed = false;
		status.classList.remove( 'is-error' );
		status.textContent = '';
		updateActions();
		modalRoot.querySelector( '[role="dialog"]' )?.focus();
	} );
	document.addEventListener( 'keydown', event => {
		if ( modalRoot.hidden || ! activeId || event.defaultPrevented || event.altKey || ! ( event.metaKey || event.ctrlKey ) || event.key.toLowerCase() !== 's' ) { return; }
		event.preventDefault();
		event.stopPropagation();
		if ( ! event.repeat && ! save.disabled ) { save.click(); }
	} );
	save.addEventListener( 'click', async () => {
		if ( loading || saving || ! activeId || ! changed ) {
			return;
		}
		if ( ! editor.reportValidity() ) { status.classList.add( 'is-error' ); status.textContent = 'Review the highlighted conditions before saving.'; return; }
		saving = true;
		++requestId; // A pending refresh must not overwrite a newer save or its UI.
		const id = activeId;
		updateActions();
		status.classList.remove( 'is-error' );
		status.textContent = 'Saving…';
		editor.setBusy( true );
		try {
			const result = await request( id, 'POST', editor.getConditions() );
			updateRow( id, result );
			( result.related || [] ).forEach( peer => { if ( validSnapshot( peer ) ) { updateRow( peer.id, peer ); } } );
			editor.setConditions( result.conditions, false, result.templateType, result.popupOpening );
			original = JSON.stringify( editor.getConditions() );
			originalOpening = result.popupOpening || 'automatic';
			revision = result.templateRevision;
			changed = false;
			status.textContent = 'Conditions saved.';
		} catch ( error ) {
			status.classList.add( 'is-error' );
			status.textContent = error.message;
		} finally {
			saving = false;
			updateActions();
			editor.setBusy( false );
		}
	} );
}() );
