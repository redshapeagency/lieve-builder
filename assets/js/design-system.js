/* Full token management on admin pages and extended builder dialogs. */
( function () {
	'use strict';
	const model = window.LieveDesignModel;
	const esc = value => String( value ?? '' ).replace( /[&<>"']/g, char => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' } )[ char ] );
	const icons = {
		restore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4 3 9l5 5M3 9h10a7 7 0 0 1 7 7v4"/></svg>',
		trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
		copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="3"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/></svg>',
		grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
		folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M3 8V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z"/></svg>',
		uncategorized: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16l2 10v6H2v-6L4 4Z"/><path d="M2 14h6l2 3h4l2-3h6"/></svg>',
		color: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/></svg>',
		variable: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4H6v5l-2 3 2 3v5h2m8-16h2v5l2 3-2 3v5h-2M11 8h2m-2 4h2m-2 4h2"/></svg>',
		dependencies: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="6" rx="2"/><rect x="2" y="16" width="6" height="6" rx="2"/><rect x="16" y="16" width="6" height="6" rx="2"/><path d="M12 8v4H5v4m7-4h7v4"/></svg>',
		plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
		close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
		responsive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="15" height="11" rx="2"/><path d="M9.5 15v4M6 19h7"/><rect x="16" y="10" width="6" height="11" rx="1.5"/><path d="M18.5 18.5h1"/></svg>',
		chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
		grip: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>',
		scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="14" width="4" height="6" rx="1"/><rect x="10" y="9" width="4" height="11" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/><path d="M3 5h7m-3-3 3 3-3 3"/></svg>',
	};
	function groupIcon( group ) {
		const name = group.id === '__trash' ? 'trash' : group.id === '*' ? 'grid' : group.id === '' ? 'uncategorized' : 'folder';
		const color = name === 'folder' && model.validIconColor( group.iconColor ) ? group.iconColor : '';
		return icons[ name ].replace( '<svg ', '<svg class="lieve-ds-group-glyph"' + ( color ? ' style="fill:' + esc( color ) + '"' : '' ) + ' ' );
	}
	function groupColorField( color = '' ) {
		return '<div class="lieve-ds-field"><span>Folder background color</span><div class="lieve-ds-category-color-control"><span class="lieve-ds-category-color-preview" data-ds-group-icon-preview>' + groupIcon( { id: 'preview', iconColor: color } ) + '</span><button type="button" class="lieve-colour-swatch" data-ds-group-icon-picker aria-label="Choose folder background color"></button><input name="iconColor" aria-label="Folder background color" value="' + esc( color ) + '" placeholder="Automatic · e.g. #8044e3" maxlength="9" pattern="#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?" autocomplete="off" spellcheck="false"><button type="button" class="lieve-conditions-cancel" data-ds-group-color-reset>Reset</button></div><p class="lieve-ds-help">Leave empty to use the automatic folder background. The picker supports transparency.</p></div>';
	}
	function bindGroupColor( form ) {
		const field = form.querySelector( '[name="iconColor"]' ); if ( ! field ) { return; }
		const trigger = form.querySelector( '[data-ds-group-icon-picker]' ); const glyph = form.querySelector( '[data-ds-group-icon-preview] svg' );
		const picker = window.LieveColour.create( field, { trigger } );
		function preview() { const color = field.value.trim().toLowerCase(); glyph.style.fill = model.validIconColor( color ) ? color : ''; picker.refresh(); }
		field.addEventListener( 'input', preview );
		form.querySelector( '[data-ds-group-color-reset]' ).addEventListener( 'click', () => { picker.close(); field.value = ''; preview(); field.focus(); } );
		preview();
		return picker;
	}
	function conditionPresentation( token, parent = null ) {
		const count = ( token.conditions || [] ).length;
		const disabled = token.enabled === false || parent?.enabled === false;
		const inherited = Boolean( parent && ( parent.conditions || [] ).length );
		return {
			count: count + ( count === 1 ? ' rule' : ' rules' ),
			scope: disabled ? 'disabled' : count || inherited ? 'selective' : 'global',
			label: disabled ? 'Disabled' : count ? 'Selective' : inherited ? 'Parent scope' : 'Site-wide',
			summary: disabled ? ( parent ? 'The parent color is disabled. These rules are retained until it is enabled again.' : 'This definition is disabled. Its rules are retained until it is enabled again.' ) : parent ? ( count ? 'These rules narrow the parent color’s scope. The parent and this variant must both match.' : 'Available wherever the parent color is active. Add rules to narrow this variant’s scope.' ) : count ? 'These rules control where this definition is available. Exclusions always take priority.' : 'Available throughout your website. Add a rule to limit where this definition applies.',
		};
	}
	function createService( config, onChange = () => {}, onError = () => {} ) {
		const model = config.model || window.LieveDesignModel;
		config = { ...config, postId: Number( config.postId ) || 0, canManage: config.canManage === true || config.canManage === 1 || config.canManage === '1' };
		let storageError = config.storageError || null;
		// Empty is only an inert rendering placeholder when quarantined, never a save baseline.
		let saved = storageError ? model.empty() : model.normalize( config.data ); let revision = config.revision; let active = config.activeIds || []; let preview = null; let previewActive = null; let previewOwner = null; let timer = 0; let generation = 0; let dark = null; let refreshing = null;
		async function request( url, payload ) {
			const response = await ( window.LieveTransport?.fetch || window.fetch.bind( window ) )(  url, { method: payload ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'X-WP-Nonce': config.nonce, ...( payload ? { 'Content-Type': 'application/json' } : {} ) }, ...( payload ? { body: JSON.stringify( payload ) } : {} ) } );
			let result; try { result = await response.json(); } catch ( error ) { throw new Error( 'The server returned an unreadable response. Your draft has not been discarded.' ); }
			if ( ! response.ok ) { if ( result.code === 'lieve_library_unavailable' ) { storageError = { code: result.code, message: result.message }; } throw new Error( result.message || 'The design system could not be loaded or saved.' ); }
			if ( ! result.data || model.validate( result.data ) || typeof result.revision !== 'string' || ! Array.isArray( result.activeIds ) ) { throw new Error( 'Invalid design system response.' ); }
			return { ...result, data: model.normalize( result.data ) };
		}
		return {
			config, model, storageError: () => storageError,
			data: () => model.clone( saved ),
			current: () => model.clone( preview || saved ),
			variables: () => ( preview || saved ).variables.filter( item => ! item.trashed ).map( item => ( { name: item.name, aliases: [ ...( item.aliases || [] ) ] } ) ),
			isActive: id => ( previewActive || active ).includes( id ),
			css: device => { const data = preview || saved; const manual = document.documentElement?.dataset.colorMode; const websiteDark = data.darkMode !== 'off' && ( manual === 'dark' || ( manual !== 'light' && data.darkMode === 'auto' && window.matchMedia?.( '(prefers-color-scheme: dark)' ).matches ) ); return model.css( data, previewActive || active, device, config.breakpoints, dark === null ? Boolean( websiteDark ) : dark ); },
			mode( value ) { dark = value === 'dark'; onChange(); },
			breakpoints( items ) { config.breakpoints = model.clone( items ); onChange(); },
			preview( data, owner ) {
				if ( storageError ) { return storageError.message; }
				const error = model.validate( data ); if ( error ) { return error; }
				window.clearTimeout( timer ); const ticket = ++generation; previewOwner = owner; preview = model.clone( data );
				// Do not reuse a match if its rules changed or if it is a new selective token.
				const old = new Map( [ ...model.tokens( saved ) ].map( token => [ token.id, JSON.stringify( token.conditions || [] ) ] ) );
				previewActive = model.tokens( preview ).filter( token => token.enabled && ( !( token.conditions || [] ).length || ( active.includes( token.id ) && old.get( token.id ) === JSON.stringify( token.conditions ) ) ) ).map( token => token.id );
				for ( const color of preview.colors ) { if ( ! previewActive.includes( color.id ) ) { previewActive = previewActive.filter( id => ! color.variants.some( variant => variant.id === id ) ); } }
				onChange();
				if ( config.previewUrl ) { timer = window.setTimeout( async () => {
					try { const result = await request( config.previewUrl, { data } ); if ( ticket === generation && previewOwner === owner ) { previewActive = result.activeIds; onChange(); owner.previewResult?.( result.activeIds ); } }
					catch ( error ) { if ( ticket === generation ) { owner.previewError?.( error.message ); } }
				}, 240 ); }
				return '';
			},
			discard( owner ) { if ( previewOwner && previewOwner !== owner ) { return; } ++generation; window.clearTimeout( timer ); preview = previewActive = previewOwner = null; dark = null; onChange(); },
			async save( data ) {
				if ( storageError ) { throw new Error( storageError.message ); }
				const error = model.validate( data ); if ( error ) { throw new Error( error ); }
				const result = await request( config.url, { data, revision, postId: config.postId || 0 } ); ++generation; window.clearTimeout( timer ); saved = result.data; revision = result.revision; active = result.activeIds; preview = previewActive = previewOwner = null; onChange(); return model.clone( saved );
			},
			async refresh( shouldApply = () => true, owner = null ) {
				if ( previewOwner && previewOwner !== owner ) { return false; }
				const ticket = generation;
				if ( ! refreshing ) { refreshing = request( config.url + ( config.postId ? '?postId=' + config.postId : '' ) ).catch( error => { onError( error.message ); return null; } ).finally( () => { refreshing = null; } ); }
				const result = await refreshing;
				if ( result && ticket === generation && ( ! previewOwner || previewOwner === owner ) && shouldApply() ) { saved = result.data; revision = result.revision; active = result.activeIds; storageError = null; onChange(); return true; }
				return false;
			},
		};
	}

	/** Quarantine this manager only; never offer an empty-library export or reset. */
	function showStorageError( root, error ) {
		let notice = root.querySelector( '[data-library-error]' );
		if ( ! notice ) {
			notice = document.createElement( 'div' ); notice.className = 'lieve-ds-guide'; notice.setAttribute( 'data-library-error', '' ); notice.setAttribute( 'role', 'alert' );
			const title = document.createElement( 'h3' ); title.textContent = 'Library unavailable';
			const message = document.createElement( 'p' ); notice.append( title, message ); root.prepend( notice );
		}
		notice.querySelector( 'p' ).textContent = error.message;
		Array.from( root.children ).forEach( child => { if ( child !== notice ) { child.hidden = true; child.inert = true; } } );
	}

	function createBlockedManager( { root, service, modal, openButton } ) {
		showStorageError( root, service.storageError() ); let opened = ! modal;
		const dialog = modal ? window.LieveConditions.modal( modal ) : null;
		const open = async ( trigger = openButton ) => { opened = true; dialog?.open( trigger ); openButton?.setAttribute( 'aria-expanded', 'true' ); };
		modal?.addEventListener( 'lieve:conditions-close', () => { opened = false; openButton?.setAttribute( 'aria-expanded', 'false' ); } );
		openButton?.addEventListener( 'click', () => { void open(); } );
		const none = () => false;
		return { open, isOpen: () => opened, data: service.data, isDirty: none, isSaving: none, canUndo: none, canRedo: none, undo: none, redo: none, edit: none, breakGroup() {}, submit() {}, discard() {}, refresh: none, async saveDraft() { throw new Error( service.storageError().message ); } };
	}

	/* TheOneWP's custom single-choice dropdown; the native value still owns FormData. */
	function createActionSelect( select, layer, container = select.closest( '[role="dialog"]' ) || layer, { lazy = false, editableInput = null, anchor = null, outsideDocuments = [] } = {} ) {
		// Canvas events belong to a different document and do not bubble to the editor.
		const outsideRoots = [ ...new Set( [ select.ownerDocument || document, ...outsideDocuments ] ) ].filter( root => typeof root?.addEventListener === 'function' );
		const initialTrigger = select.nextElementSibling?.matches( '.lieve-ds-select-trigger' ) ? select.nextElementSibling : null;
		const trigger = initialTrigger || document.createElement( 'button' ); trigger.type = 'button'; trigger.className = 'lieve-ds-select-trigger';
		trigger.id = select.id + '-trigger';
		if ( initialTrigger ) { trigger.textContent = ''; }
		const label = select.getAttribute( 'aria-label' ) || 'Category';
		trigger.setAttribute( 'aria-label', label ); trigger.setAttribute( 'aria-haspopup', 'listbox' ); trigger.setAttribute( 'aria-expanded', 'false' );
		const summary = document.createElement( 'span' ); summary.id = select.id + '-value'; trigger.setAttribute( 'aria-describedby', summary.id ); trigger.appendChild( summary ); trigger.insertAdjacentHTML( 'beforeend', icons.chevron );
		const menu = document.createElement( 'div' ); menu.className = 'lieve-ds-select-menu'; menu.hidden = true;
		const find = document.createElement( 'div' ); find.className = 'lieve-ds-select-find';
		const choices = select.dataset?.dsSelectKind || 'categories';
		const search = document.createElement( 'input' ); search.type = 'search'; search.placeholder = 'Search ' + choices + '…'; search.setAttribute( 'aria-label', 'Search ' + choices ); search.autocomplete = 'off'; find.appendChild( search );
		const list = document.createElement( 'div' ); list.className = 'lieve-ds-select-list'; list.id = select.id + '-options'; list.setAttribute( 'role', 'listbox' ); list.setAttribute( 'aria-label', label ); trigger.setAttribute( 'aria-controls', list.id );
		const empty = document.createElement( 'p' ); empty.className = 'lieve-ds-select-empty'; empty.textContent = 'No ' + choices + ' found.'; empty.setAttribute( 'role', 'status' ); empty.hidden = true;
		let entries = [];
		function populate() {
			const options = Array.from( select.options );
			if ( entries.length === options.length && entries.every( ( entry, index ) => entry.option === options[ index ] ) ) { return false; }
			const previous = new Map( entries.map( entry => [ entry.option, entry ] ) );
			entries = options.map( ( option, index ) => {
			if ( previous.has( option ) ) { return { ...previous.get( option ), index }; }
			const button = document.createElement( 'button' ); button.type = 'button'; button.className = 'lieve-ds-select-option'; button.tabIndex = -1; button.textContent = option.textContent; button.disabled = option.disabled;
			button.setAttribute( 'role', 'option' ); button.addEventListener( 'click', () => choose( option ) ); return { option, button, index };
			} );
			list.textContent = ''; entries.forEach( entry => list.appendChild( entry.button ) );
			return true;
		}
		if ( ! lazy ) { populate(); }
		find.hidden = ! editableInput && select.options.length < 8; menu.append( find, list, empty ); container.appendChild( menu );
		select.hidden = true; select.tabIndex = -1; select.setAttribute( 'aria-hidden', 'true' ); select.after( trigger );
		let active = -1; let visible = [];
		function update() {
			const focused = entries.find( entry => entry.button === document.activeElement );
			const changed = ( ! lazy || entries.length || ! menu.hidden ) && populate();
			summary.textContent = editableInput ? editableInput.value || editableInput.placeholder || 'Default / inherited' : select.selectedOptions[ 0 ]?.textContent || 'Select category…'; trigger.disabled = select.disabled || Boolean( editableInput?.disabled || editableInput?.readOnly );
			find.hidden = ! editableInput && select.options.length < 8;
			// Dynamic labels (for example canvas Fit) must also update cached choices.
			entries.forEach( entry => { if ( entry.button.textContent !== entry.option.textContent ) { entry.button.textContent = entry.option.textContent; } entry.button.disabled = entry.option.disabled; } );
			if ( ! menu.hidden ) {
				render( true ); position();
				if ( changed && focused ) { if ( visible.length ) { highlight( Math.max( 0, visible.findIndex( entry => entry.option === focused.option ) ) ); } else { search.focus( { preventScroll: true } ); find.hidden = false; } }
			}
		}
		function highlight( index, focus = true ) {
			active = index; entries.forEach( entry => entry.button.classList.toggle( 'is-over', visible[ active ] === entry ) );
			if ( focus && visible[ active ] ) { visible[ active ].button.focus(); visible[ active ].button.scrollIntoView( { block: 'nearest' } ); }
		}
		function render( preserveFocus = false ) {
			const term = search.value.trim().toLocaleLowerCase();
			entries.forEach( entry => { const chosen = editableInput ? entry.option.value === editableInput.value : entry.option.selected; entry.button.hidden = entry.option.hidden || ! entry.option.textContent.toLocaleLowerCase().includes( term ); entry.button.setAttribute( 'aria-selected', String( chosen ) ); entry.button.classList.toggle( 'is-chosen', chosen ); } );
			visible = entries.filter( entry => ! entry.button.hidden && ! entry.button.disabled ); empty.hidden = entries.some( entry => ! entry.button.hidden );
			const focused = preserveFocus ? visible.findIndex( entry => entry.button === document.activeElement ) : -1;
			highlight( focused >= 0 ? focused : Math.max( 0, visible.findIndex( entry => editableInput ? entry.option.value === editableInput.value : entry.option.selected ) ), false );
		}
		function position() {
			if ( menu.hidden ) { return; }
			const anchorRect = ( anchor || trigger ).getBoundingClientRect(); const bounds = container.getBoundingClientRect(); const clip = layer.getBoundingClientRect();
			const left = Math.max( 8, clip.left + 8 ); const right = Math.min( window.innerWidth - 8, clip.right - 8 ); const top = Math.max( 8, clip.top + 8 ); const bottom = Math.min( window.innerHeight - 8, clip.bottom - 8 );
			menu.style.width = Math.min( anchorRect.width, right - left ) + 'px'; menu.style.maxHeight = '340px';
			const below = bottom - anchorRect.bottom - 4; const above = anchorRect.top - top - 4; const upwards = below < menu.offsetHeight && above > below;
			menu.style.maxHeight = Math.max( 0, Math.min( 340, upwards ? above : below ) ) + 'px';
			menu.style.left = Math.max( left, Math.min( anchorRect.left, right - menu.offsetWidth ) ) - bounds.left - container.clientLeft + 'px';
			menu.style.top = ( upwards ? anchorRect.top - menu.offsetHeight - 4 : anchorRect.bottom + 4 ) - bounds.top - container.clientTop + 'px';
		}
		function close( restore = false, focusTarget = editableInput || trigger ) { menu.hidden = true; menu.classList.remove( 'is-open' ); trigger.setAttribute( 'aria-expanded', 'false' ); if ( restore ) { focusTarget.focus( { preventScroll: true } ); } }
		function open() {
			update(); if ( trigger.disabled ) { return; }
			// Options can be added, removed or reordered while this control stays mounted.
			populate();
			search.value = ''; render(); menu.hidden = false; position(); void menu.offsetWidth; menu.classList.add( 'is-open' ); trigger.setAttribute( 'aria-expanded', 'true' );
			if ( ! find.hidden ) { search.focus(); } else { highlight( active ); }
		}
		function choose( option ) {
			const index = Array.from( select.options ).indexOf( option );
			if ( index < 0 ) { update(); return; }
			if ( menu.hidden || trigger.disabled || select.disabled || editableInput?.disabled || editableInput?.readOnly || option.disabled || option.hidden ) { return; }
			select.selectedIndex = index;
			if ( editableInput ) { editableInput.value = select.value; editableInput.dispatchEvent( new Event( 'input', { bubbles: true } ) ); editableInput.dispatchEvent( new Event( 'change', { bubbles: true } ) ); }
			update(); select.dispatchEvent( new Event( 'input', { bubbles: true } ) ); select.dispatchEvent( new Event( 'change', { bubbles: true } ) ); close( true );
		}
		// Re-clicking the chevron closes the list, not starts editing its text field.
		// Keep a real focus target for subsequent Tab/keyboard use; never blur to body.
		function click() { if ( menu.hidden ) { open(); } else { close( true, trigger ); } }
		function triggerKey( event ) { if ( menu.hidden && [ 'ArrowDown', 'ArrowUp' ].includes( event.key ) ) { event.preventDefault(); event.stopPropagation(); open(); } }
		function menuKey( event ) {
			if ( event.key === 'Escape' ) { event.preventDefault(); event.stopPropagation(); close( true ); }
			else if ( event.key === 'Tab' ) { close( true ); }
			else if ( [ 'ArrowDown', 'ArrowUp', 'Home', 'End' ].includes( event.key ) ) {
				if ( event.target === search && [ 'Home', 'End' ].includes( event.key ) ) { return; }
				event.preventDefault(); event.stopPropagation(); if ( ! visible.length ) { return; }
				highlight( event.key === 'Home' || ( event.target === search && event.key === 'ArrowDown' ) ? 0 : event.key === 'End' || ( event.target === search && event.key === 'ArrowUp' ) ? visible.length - 1 : ( active + ( event.key === 'ArrowDown' ? 1 : -1 ) + visible.length ) % visible.length );
			} else if ( event.key === 'Enter' || ( event.key === ' ' && event.target !== search ) ) { event.preventDefault(); event.stopPropagation(); if ( visible[ active ] ) { choose( visible[ active ].option ); } }
		}
		function filter() { render(); position(); }
		function outside( event ) { if ( ! menu.hidden && ! menu.contains( event.target ) && ! trigger.contains( event.target ) ) { close(); } }
		function blur() { close(); }
		function scroll( event ) { if ( ! menu.contains( event.target ) ) { position(); } }
		trigger.addEventListener( 'click', click ); trigger.addEventListener( 'keydown', triggerKey ); menu.addEventListener( 'keydown', menuKey ); search.addEventListener( 'input', filter ); select.addEventListener( 'change', update );
		outsideRoots.forEach( root => { root.addEventListener( 'pointerdown', outside, true ); root.addEventListener( 'click', outside, true ); } );
		window.addEventListener( 'blur', blur ); window.addEventListener( 'resize', position ); window.addEventListener( 'scroll', scroll, true ); layer.addEventListener( 'scroll', scroll, true ); update();
		return {
			close,
			refresh: update,
			setDisabled( disabled ) { select.disabled = disabled; update(); if ( disabled ) { close(); } },
			destroy() { close(); menu.remove(); trigger.removeEventListener( 'click', click ); trigger.removeEventListener( 'keydown', triggerKey ); select.removeEventListener( 'change', update ); outsideRoots.forEach( root => { root.removeEventListener( 'pointerdown', outside, true ); root.removeEventListener( 'click', outside, true ); } ); window.removeEventListener( 'blur', blur ); window.removeEventListener( 'resize', position ); window.removeEventListener( 'scroll', scroll, true ); layer.removeEventListener( 'scroll', scroll, true ); },
		};
	}

	function categoryDraft( data, categories, kind = 'variables' ) {
		const groupsKey = kind === 'colors' ? 'palettes' : 'categories'; const groupKey = kind === 'colors' ? 'paletteId' : 'categoryId';
		const original = new Set( data[ groupsKey ].map( item => item.id ) ); const next = model.clone( data );
		if ( ! Array.isArray( categories ) || categories.some( item => ! item || ! original.has( item.id ) || typeof item.name !== 'string' ) ) { throw new Error( 'Only custom categories or palettes can be edited.' ); }
		next[ groupsKey ] = categories.map( item => ( { id: item.id, name: item.name.trim(), ...( item.iconColor !== undefined && item.iconColor !== '' ? { iconColor: typeof item.iconColor === 'string' ? item.iconColor.toLowerCase() : item.iconColor } : {} ) } ) );
		const error = model.validateGroups( next );
		if ( error ) { throw new Error( error ); }
		const kept = new Set( next[ groupsKey ].map( item => item.id ) );
		next[ kind ].forEach( item => { if ( original.has( item[ groupKey ] ) && ! kept.has( item[ groupKey ] ) ) { item[ groupKey ] = ''; } } );
		return next;
	}

	function createCategoryEditor( { root, read, canBegin, apply, cancel, changed, kind = 'variables' } ) {
		const colors = kind === 'colors'; const groupsKey = colors ? 'palettes' : 'categories'; const groupKey = colors ? 'paletteId' : 'categoryId'; const noun = colors ? 'Palette' : 'Category';
		const sidebar = root.querySelector( '.lieve-ds-sidebar' ); const nav = sidebar.querySelector( '[data-ds-groups]' );
		const edit = sidebar.querySelector( '[data-ds-categories-edit]' ); const confirm = sidebar.querySelector( '[data-ds-categories-apply]' ); const abort = sidebar.querySelector( '[data-ds-categories-cancel]' ); const add = sidebar.querySelector( '[data-ds-group-add]' ); const note = sidebar.querySelector( '[data-ds-category-note]' );
		let items = null; let sortable = null; let list = null; let colorPickers = [];
		const help = 'Drag handles to reorder (Alt + ↑ / ↓). Removing a ' + noun.toLowerCase() + ' keeps its ' + kind + ' in Uncategorized. Apply updates the draft; Save ' + ( kind === 'classes' ? 'Classes' : colors ? 'Colors' : 'Variables' ) + ' publishes it.';
		function refresh() { edit.disabled = ! canBegin() || ! read()[ groupsKey ].length; edit.hidden = Boolean( items ); add.hidden = Boolean( items ); confirm.hidden = abort.hidden = ! items; }
		function destroySort() { colorPickers.forEach( picker => picker.destroy() ); colorPickers = []; if ( sortable ) { sortable.sortable( 'destroy' ); sortable = null; } }
		function feedback() {
			let error = ''; try { categoryDraft( read(), items, kind ); } catch ( failure ) { error = failure.message; }
			confirm.disabled = Boolean( error ); note.textContent = error || help; note.classList.toggle( 'is-error', Boolean( error ) );
		}
		function move( id, step ) {
			if ( ! items ) { return; } const index = items.findIndex( item => item.id === id ); const target = index + step;
			if ( index < 0 || target < 0 || target >= items.length ) { return; }
			items.splice( target, 0, items.splice( index, 1 )[ 0 ] ); render(); list.querySelector( '[data-ds-category-handle="' + id + '"]' )?.focus();
		}
		function bindSort() {
			const $ = window.jQuery; if ( ! $?.fn?.sortable || items.length < 2 ) { return; }
			sortable = $( list ); sortable.sortable( {
				items: '> [data-ds-category-row]', handle: '[data-ds-category-handle]', cancel: 'input, textarea, select, [data-ds-category-remove]',
				tolerance: 'pointer', placeholder: 'lieve-ds-category-row lieve-ds-category-placeholder',
				start( event, ui ) { ui.placeholder.outerHeight( ui.item.outerHeight() ); ui.helper.css( 'width', ui.item.outerWidth() ); },
				stop() {
					const order = Array.from( list.querySelectorAll( '[data-ds-category-row]' ), row => row.dataset.dsCategoryRow ); const byId = new Map( items.map( item => [ item.id, item ] ) );
					if ( order.length === items.length && new Set( order ).size === items.length && order.every( id => byId.has( id ) ) ) { items = order.map( id => byId.get( id ) ); }
					// Keep the dropped DOM rows in place; no replacement or flashing after a drag.
					list.querySelectorAll( '[data-ds-category-name]' ).forEach( ( input, index ) => input.setAttribute( 'aria-label', noun + ' ' + ( index + 1 ) + ' name' ) ); feedback();
				},
			} );
		}
		function render() {
			destroySort(); const data = read(); const count = id => id === '__trash' ? model.trashEntries( data, kind ).length : data[ kind ].filter( token => ! token.trashed && ( id === '*' || token[ groupKey ] === id ) ).length;
			const fixed = ( id, name ) => '<button type="button" data-ds-group="' + id + '" class="lieve-ds-category-fixed" disabled>' + groupIcon( { id } ) + '<span>' + name + '</span><small>' + count( id ) + '</small></button>';
			nav.innerHTML = fixed( '*', 'All ' + kind ) + '<div class="lieve-ds-category-list" data-ds-category-list role="list" aria-label="Editable groups">' + items.map( ( item, index ) => '<div class="lieve-ds-category-row" data-ds-category-row="' + item.id + '" role="listitem"><button type="button" class="lieve-ds-icon lieve-ds-category-handle" data-ds-category-handle="' + item.id + '" aria-label="Reorder ' + esc( item.name ) + '" title="Drag to reorder · Alt + ↑ / ↓">' + icons.grip + '</button><input type="text" data-ds-category-name="' + item.id + '" aria-label="' + noun + ' ' + ( index + 1 ) + ' name" value="' + esc( item.name ) + '" maxlength="100" autocomplete="off" spellcheck="false"><span class="lieve-ds-category-icon-color"><button type="button" class="lieve-colour-swatch" data-ds-category-color-trigger aria-label="Folder background color for ' + esc( item.name ) + '" title="Choose folder background color"></button><input type="hidden" data-ds-category-color="' + item.id + '" value="' + esc( item.iconColor || '' ) + '"></span><button type="button" class="lieve-ds-icon is-danger" data-ds-category-remove="' + item.id + '" aria-label="Remove ' + noun.toLowerCase() + ' ' + esc( item.name ) + '" title="Remove group; keep its definitions">' + icons.trash + '</button></div>' ).join( '' ) + ( items.length ? '' : '<p class="lieve-ds-category-empty">No custom groups remain. Apply to move their definitions to Uncategorized.</p>' ) + '</div>' + fixed( '', 'Uncategorized' ) + fixed( '__trash', 'Trash' );
			list = nav.querySelector( '[data-ds-category-list]' );
			if ( window.LieveColour ) { colorPickers = Array.from( list.querySelectorAll( '[data-ds-category-row]' ), row => window.LieveColour.create( row.querySelector( '[data-ds-category-color]' ), { trigger: row.querySelector( '[data-ds-category-color-trigger]' ), container: root } ) ); }
			feedback(); bindSort();
		}
		function lock( value ) { root.classList.toggle( 'is-editing-categories', value ); root.querySelectorAll( '.lieve-ds-toolbar, .lieve-ds-library, .lieve-ds-details, .lieve-ds-footer, .lieve-ds-dark-setting' ).forEach( section => { section.inert = value; } ); }
		function finish() { destroySort(); items = null; list = null; note.hidden = true; note.classList.remove( 'is-error' ); lock( false ); refresh(); }
		function begin() { if ( items || ! canBegin() || ! read()[ groupsKey ].length ) { return; } items = model.clone( read()[ groupsKey ] ); note.hidden = false; lock( true ); render(); refresh(); changed(); nav.querySelector( '[data-ds-category-name]' )?.focus(); }
		function cancelEdit( silent = false ) { if ( ! items ) { return; } finish(); if ( ! silent ) { cancel(); edit.focus(); } }
		function confirmEdit() { if ( ! items ) { return; } let next; try { next = categoryDraft( read(), items, kind ); } catch ( failure ) { feedback(); return; } finish(); apply( next ); ( edit.disabled ? add : edit ).focus(); }
		sidebar.addEventListener( 'input', event => {
			const field = event.target; const isColor = field.hasAttribute( 'data-ds-category-color' );
			if ( ! items || ( ! isColor && ! field.hasAttribute( 'data-ds-category-name' ) ) ) { return; }
			event.stopPropagation(); const item = items.find( item => item.id === ( isColor ? field.dataset.dsCategoryColor : field.dataset.dsCategoryName ) );
			if ( ! item ) { return; } const row = field.closest( '[data-ds-category-row]' );
			if ( isColor ) { item.iconColor = field.value.toLowerCase(); }
			else { item.name = field.value; row.querySelector( '[data-ds-category-handle]' ).setAttribute( 'aria-label', 'Reorder ' + item.name ); row.querySelector( '[data-ds-category-remove]' ).setAttribute( 'aria-label', 'Remove ' + noun.toLowerCase() + ' ' + item.name ); row.querySelector( '[data-ds-category-color-trigger]' ).setAttribute( 'aria-label', 'Folder background color for ' + item.name ); }
			feedback();
		} );
		sidebar.addEventListener( 'click', event => {
			const button = event.target.closest( 'button' ); if ( ! button ) { return; }
			if ( button === edit ) { event.stopPropagation(); begin(); }
			else if ( button === abort ) { event.stopPropagation(); cancelEdit(); }
			else if ( button === confirm ) { event.stopPropagation(); confirmEdit(); }
			else if ( items && button.hasAttribute( 'data-ds-category-remove' ) ) { event.stopPropagation(); const index = items.findIndex( item => item.id === button.dataset.dsCategoryRemove ); if ( index < 0 ) { return; } items.splice( index, 1 ); render(); ( list.querySelectorAll( '[data-ds-category-name]' )[ Math.min( index, items.length - 1 ) ] || confirm ).focus(); }
		} );
		sidebar.addEventListener( 'keydown', event => { if ( ! items ) { return; } if ( event.key === 'Escape' ) { event.preventDefault(); event.stopPropagation(); cancelEdit(); } else if ( event.altKey && [ 'ArrowUp', 'ArrowDown' ].includes( event.key ) && event.target.hasAttribute( 'data-ds-category-handle' ) ) { event.preventDefault(); event.stopPropagation(); move( event.target.dataset.dsCategoryHandle, event.key === 'ArrowUp' ? -1 : 1 ); } } );
		refresh(); return { isEditing: () => Boolean( items ), isDirty: () => Boolean( items && JSON.stringify( items ) !== JSON.stringify( read()[ groupsKey ] ) ), refresh, cancel: cancelEdit, warn( message ) { if ( items ) { note.textContent = message; } } };
	}

	function createManager( { root, service, modal = null, openButton = null, embedded = false } ) {
		if ( service.storageError?.() ) { return createBlockedManager( { root, service, modal, openButton } ); }
		const model = service.model || window.LieveDesignModel;
		const kind = root.dataset.designManager; const classes = kind === 'classes'; const prefix = classes ? '.' : '--'; const singular = classes ? 'Class' : ( kind === 'colors' ? 'Color' : 'Variable' ); const plural = classes ? 'Classes' : ( kind === 'colors' ? 'Colors' : 'Variables' ); const colors = kind === 'colors'; const groupsKey = colors ? 'palettes' : 'categories'; const groupKey = colors ? 'paletteId' : 'categoryId';
		const variablesPage = root.classList.contains( 'lieve-ds-token-page' );
		const q = selector => root.querySelector( selector ); const list = q( '[data-ds-list]' ); const detail = q( '[data-ds-detail]' ); const status = q( '[data-ds-status]' ); const actionLayer = q( '[data-ds-action-layer]' ); const actionContent = q( '[data-ds-action-content]' ); const conditionPanel = q( '[data-ds-condition-panel]' );
		let draft = service.data(); let groupId = '*'; let selectedId = null; let selectedVariant = null; let selected = new Set(); let mode = 'light'; let detailTab = 'details'; let saving = false; let opened = ! modal; let actionCommit = null; let actionTrigger = null; let conditions = null;
		let actionCloseTimer = 0; let actionOpenFrame = 0; let actionClosing = false; let actionSelect = null; let actionColour = null; let detailSelect = null; let policySelect = null; let detailColours = []; let categoryEditor = null; let variableList = null;
		let dependencySnapshot = ''; let dependencyIssues = []; let importGeneration = 0;
		let history = model.createHistory( draft ); let embeddedCheckpoint = null;
		const saveFields = new Map(); let saveFocus = null;
		const colorSections = new Map(); const contrastBackgrounds = { light: '#ffffff', dark: '#111827' }; let analysisColours = []; let colorProbe = null; let colorCanvas = null;
		const variablePageSize = Number( service.config.variablePageSize ) || 100; let variablePage = 0;
		const renameOrigins = new Map();
		const editable = service.config.canManage;
		const previewScope = 'lieve-ds-preview-' + model.newId(); root.id ||= previewScope;
		const previewSheet = document.createElement( 'style' ); root.appendChild( previewSheet );
		q( '[data-ds-conditions]' ).id = root.id + '-conditions';
		root.addEventListener( 'toggle', event => { const section = event.target; if ( section.dataset?.dsSection ) { colorSections.set( section.dataset.dsSection, section.open ); if ( section.open && section.dataset.dsSection === 'contrast' ) { refreshColorAnalysis(); } } }, true );
		const api = { previewResult( ids ) { if ( selectedId ) { const matches = ids.includes( selectedVariant || selectedId ); q( '[data-ds-match]' )?.replaceChildren( document.createTextNode( matches ? 'Available on this preview page' : 'Not active on this preview page' ) ); } }, previewError( message ) { messageStatus( 'Preview: ' + message, true ); } };
		let openGeneration = 0;
		const dialog = modal ? window.LieveConditions.modal( modal, () => { if ( ! actionLayer.hidden ) { closeAction(); return false; } return ! saving; } ) : null;
		const current = () => draft[ kind ].find( item => item.id === selectedId );
		const currentVariant = () => current()?.variants?.find( variant => variant.id === selectedVariant );
		const inTrash = () => groupId === '__trash';
		const listingSelectedId = () => inTrash() ? selectedVariant || selectedId : selectedId;
		const activeDefinitions = () => draft[ kind ].filter( item => ! item.trashed );
		function messageStatus( text, error = false ) { status.textContent = text; status.classList.toggle( 'is-error', error ); }
		function dirty() { return JSON.stringify( draft ) !== JSON.stringify( service.data() ); }
		function updateSavingState() {
			if ( saving ) {
				if ( ! saveFields.size ) { saveFocus = root.contains( document.activeElement ) ? document.activeElement : null; }
				root.querySelectorAll( '.lieve-ds-toolbar input,.lieve-ds-workspace input,.lieve-ds-workspace textarea,.lieve-ds-workspace select' ).forEach( field => { if ( ! saveFields.has( field ) ) { saveFields.set( field, field.disabled ); } field.disabled = true; } );
			} else if ( saveFields.size ) {
				saveFields.forEach( ( disabled, field ) => { if ( field.isConnected ) { field.disabled = disabled; } } ); saveFields.clear();
			}
			q( '.lieve-ds-toolbar' ).inert = saving || ! actionLayer.hidden || actionClosing || Boolean( categoryEditor?.isEditing() );
			q( '.lieve-ds-workspace' ).inert = saving || ! actionLayer.hidden || actionClosing;
			root.setAttribute( 'aria-busy', String( saving ) );
			if ( ! saving && saveFocus ) { if ( saveFocus.isConnected && ! saveFocus.disabled && document.activeElement === document.body ) { saveFocus.focus( { preventScroll: true } ); } saveFocus = null; }
		}
		function validateRenameDraft( data ) {
			// Blank new fields are valid while editing, never for previewing or saving.
			// Temporary validation values stay in this copy and cannot enter the draft.
			const next = model.clone( data ); const savedIds = new Set( service.data()[ classes ? 'classes' : 'variables' ].map( item => item.id ) );
			for ( const item of next[ classes ? 'classes' : 'variables' ] ) {
				if ( savedIds.has( item.id ) ) { continue; }
				if ( ! item.name.trim() ) { item.name = model.uniqueName( next, '_draft-' + item.id ); }
				if ( ! item.value.trim() && ! classes ) { item.value = '0'; }
			}
			return model.validate( next );
		}
		function updateToolbar( error = model.validate( draft ) ) {
			updateSavingState();
			history?.record( draft ); refreshHistoryControls();
			const count = activeDefinitions().length;
			const hasChanges = dirty();
			const countText = count + ( colors ? count === 1 ? ' color' : ' colors' : count === 1 ? ' variable' : ' variables' );
			const counter = q( '[data-ds-count]' );
			if ( counter && counter.textContent !== countText ) { counter.textContent = countText; }
			q( '[data-ds-save]' ).disabled = ! editable || saving || Boolean( error ) || ! hasChanges || Boolean( categoryEditor?.isEditing() );
			if ( ! modal ) { q( '[data-ds-cancel]' ).hidden = ! hasChanges; }
			q( '[data-ds-cancel]' ).disabled = saving;
			q( '[data-ds-add]' ).disabled = ! editable || saving || inTrash() || draft[ kind ].length >= ( colors ? 500 : 1000 );
			const emptyTrash = q( '[data-ds-empty-trash]' ); if ( emptyTrash ) { emptyTrash.hidden = ! inTrash(); emptyTrash.disabled = ! editable || saving || ! model.trashEntries( draft, kind ).length; }
			const scale = q( '[data-ds-variable-scale]' ); if ( scale ) { scale.disabled = ! editable || saving || inTrash(); }
			root.classList.toggle( 'is-saving', saving );
			root.classList.toggle( 'has-changes', hasChanges );
			detailSelect?.setDisabled( ! editable || saving );
			variableList?.refresh( false );
			root.querySelectorAll( '[data-ds-color-picker]' ).forEach( button => { button.disabled = ! editable || saving; } );
			if ( saving ) { detailColours.forEach( picker => picker.close() ); analysisColours.forEach( picker => picker.close() ); }
		}
		function sync( updateDetail = false, historyGroup = '' ) {
			history?.record( draft, historyGroup );
			const error = model.validate( draft ); updateToolbar( error );
			if ( error ) { const incomplete = ! colors && ! validateRenameDraft( draft ); messageStatus( incomplete ? ( classes ? 'Enter a unique CSS class name before saving.' : 'Enter a CSS name and base value for each new variable before saving.' ) : error, ! incomplete ); } else { messageStatus( ! editable ? 'Read only · administrators manage global definitions. You can browse and copy references.' : dirty() ? 'Unsaved changes · preview updated, website unchanged.' : 'Changes apply across the website only after saving.' ); if ( modal && ( opened || ( embedded && dirty() ) ) ) { service.preview( draft, api ); } else if ( embedded ) { service.discard( api ); } }
			renderGroups(); renderList(); if ( updateDetail ) { renderDetail(); } else { refreshDetailValues(); }
		}
		function refreshDetailValues() {
			if ( inTrash() ) { return; }
			const item = current(); const variant = currentVariant(); if ( ! item ) { return; }
			// Keep the switch node (and keyboard focus) while changing its state,
			// rather than replacing the inspector and interrupting the thumb motion.
			const enabled = detail.querySelector( '[data-ds-enabled]' ); if ( enabled ) { enabled.setAttribute( 'aria-checked', String( item.enabled ) ); }
			const token = variant || item; const name = variant ? item.name + '-' + variant.suffix : item.name;
			const heading = detail.querySelector( '.lieve-ds-detail-title h3' ); if ( heading ) { heading.textContent = ! colors && ! name ? 'New ' + singular.toLowerCase() : prefix + name; }
			const reference = detail.querySelector( '[data-ds-copy]' ); if ( reference ) { reference.dataset.dsCopy = classes ? '.' + name : 'var(--' + name + ')'; reference.disabled = ! model.validName( name ); }
			const aliases = detail.querySelector( '[data-ds-aliases]' );
			if ( aliases ) {
				aliases.hidden = ! token.aliases.length;
				aliases.querySelectorAll( '[data-ds-remove-alias]' ).forEach( button => { if ( ! token.aliases.includes( button.dataset.dsRemoveAlias ) ) { button.remove(); } } );
				for ( const alias of token.aliases ) {
					if ( Array.from( aliases.querySelectorAll( '[data-ds-remove-alias]' ) ).some( button => button.dataset.dsRemoveAlias === alias ) ) { continue; }
					const button = document.createElement( 'button' ); button.type = 'button'; button.dataset.dsRemoveAlias = alias; button.disabled = ! editable; button.title = 'Remove compatibility alias'; button.textContent = prefix + alias + ' ×'; aliases.appendChild( button );
				}
			}
			const conditionsTab = detail.querySelector( '[data-ds-tab="conditions"]' ); if ( conditionsTab ) { conditionsTab.textContent = 'Conditions' + ( token.conditions.length ? ' · ' + token.conditions.length : '' ); }
			if ( detailTab === 'conditions' ) { updateConditionIntro( token, variant ? item : null ); }
			if ( ! colors && ! classes ) { updateResponsiveOverrides( item ); }
			if ( classes ) { const responsive = detail.querySelector( '[data-ds-class-responsive-count]' ); const states = detail.querySelector( '[data-ds-class-states-count]' ); if ( responsive ) { responsive.textContent = Object.keys( item.values ).length; } if ( states ) { states.textContent = Object.keys( item.states || {} ).length + Object.values( item.responsiveStates || {} ).reduce( ( count, context ) => count + Object.keys( context ).length, 0 ); } detail.querySelectorAll( '[data-ds-class-bp-states-count]' ).forEach( badge => { badge.textContent = Object.keys( item.responsiveStates?.[ badge.dataset.dsClassBpStatesCount ] || {} ).length; } ); }
			const titleSwatch = detail.querySelector( '.lieve-ds-detail-title [data-ds-swatch]' ); if ( titleSwatch ) { titleSwatch.dataset.dsSwatch = 'var(--' + name + ')'; }
			const contrastName = detail.querySelector( '[data-ds-contrast-name]' ); if ( contrastName ) { contrastName.textContent = prefix + name; }
			detail.querySelectorAll( '.lieve-ds-color-field [data-ds-field]' ).forEach( input => { input.setAttribute( 'aria-invalid', String( Boolean( input.value ) && ! model.validColor( input.value ) ) ); } );
			const code = detail.querySelector( '.lieve-ds-code' ); if ( code && variant && variant.type !== 'custom' ) { code.textContent = model.variantValue( item, variant, mode === 'dark' ); }
			detailColours.forEach( picker => picker.refresh() );
			paintSwatches();
			if ( colors ) { refreshColorAnalysis(); }
			renderDependencyWarnings();
		}
		function refreshHistoryControls() {
			if ( ! history ) { return; }
			const locked = ! editable || saving || ! actionLayer.hidden || actionClosing || categoryEditor?.isEditing() || variableList?.isDragging();
			q( '[data-ds-undo]' ).disabled = Boolean( locked || ! history.canUndo() ); q( '[data-ds-redo]' ).disabled = Boolean( locked || ! history.canRedo() );
		}
		function travelHistory( redo = false ) {
			if ( ! history || ! editable || saving || ! actionLayer.hidden || actionClosing || categoryEditor?.isEditing() || variableList?.isDragging() ) { return; }
			const next = redo ? history.redo() : history.undo(); if ( ! next ) { return; }
			draft = next; renameOrigins.clear();
			const available = new Set( draft[ kind ].map( item => item.id ) ); selected = new Set( [ ...selected ].filter( id => available.has( id ) ) );
			if ( ! available.has( selectedId ) ) { selectedId = selectedVariant = null; }
			else if ( selectedVariant && ! currentVariant() ) { selectedVariant = null; }
			if ( groupId !== '*' && groupId !== '__trash' && groupId && ! draft[ groupsKey ].some( item => item.id === groupId ) ) { groupId = '*'; }
			variableList?.clearAnchor(); sync( true ); messageStatus( ( redo ? 'Redo' : 'Undo' ) + ' applied to the draft. Save ' + ( plural ) + ' to update the website.' );
		}
		function dependencyReport() {
			const snapshot = JSON.stringify( [ draft.variables.map( item => [ item.id, item.name, item.value, item.values, item.aliases, item.enabled ] ), draft.colors, draft.darkMode, service.config.breakpoints ] );
			if ( snapshot !== dependencySnapshot ) { dependencyIssues = model.dependencyReport( draft, service.config.breakpoints ); dependencySnapshot = snapshot; }
			return dependencyIssues;
		}
		function dependencyMessage( issue ) {
			if ( issue.type === 'external' ) { return 'References --' + issue.references[ 0 ] + ', not defined in this design system. It may be supplied by external CSS or a fallback.'; }
			if ( issue.type === 'disabled' ) { return 'References --' + issue.references[ 0 ] + ', which is disabled and is not output by this design system.'; }
			if ( issue.type === 'self' ) { return 'References itself, directly or through a previous name. This value cannot resolve while this definition is active.'; }
			return 'Potential circular reference involving ' + issue.references.slice( 0, 8 ).map( name => prefix + name ).join( ', ' ) + ( issue.references.length > 8 ? ' and ' + ( issue.references.length - 8 ) + ' more' : '' ) + '. Review these definitions where their conditions overlap.';
		}
		function dependencyMarkup( issues ) {
			return '<ul class="lieve-ds-dependency-list">' + issues.map( issue => '<li data-dependency-type="' + issue.type + '"><span class="lieve-ds-dependency-label">' + ( issue.type === 'external' ? 'External reference' : issue.type === 'disabled' ? 'Disabled reference' : issue.type === 'self' ? 'Self-reference' : 'Potential cycle' ) + '</span><strong>--' + esc( issue.name ) + '</strong><p>' + esc( dependencyMessage( issue ) ) + '</p><small>' + esc( issue.contexts.join( ' · ' ) ) + '</small></li>' ).join( '' ) + '</ul>';
		}
		function renderDependencyWarnings() {
			const panel = detail.querySelector( '[data-ds-dependencies]' ); if ( ! panel ) { return; }
			const issues = dependencyReport().filter( issue => issue.id === ( selectedVariant || selectedId ) );
			panel.hidden = ! issues.length;
			const html = issues.length ? '<h4>Dependency review</h4>' + dependencyMarkup( issues.slice( 0, 4 ) ) + '<button type="button" class="lieve-conditions-cancel" data-ds-check-dependencies>Review all dependencies</button><p class="lieve-ds-help">Advisory only. External definitions are allowed; these checks do not block saving.</p>' : '';
			if ( panel.innerHTML !== html ) { panel.innerHTML = html; }
		}
		function reviewDependencies() {
			const issues = dependencyReport(); const internal = issues.filter( issue => issue.type !== 'external' ).length;
			const heading = issues.length ? issues.length + ( issues.length === 1 ? ' advisory' : ' advisories' ) : 'No dependency issues detected';
			const content = '<div class="lieve-ds-dependency-summary">' + icons.dependencies + '<div><h4>' + heading + '</h4><p>' + internal + ' internal · ' + ( issues.length - internal ) + ' external</p></div></div><p class="lieve-ds-help">Checks cover enabled definitions, previous names, responsive cascades and light/dark values. Conditions are page-specific, so cycles are potential where those definitions overlap. External references and fallbacks are allowed; nothing here blocks saving.</p>' + ( issues.length ? dependencyMarkup( issues.slice( 0, 50 ) ) + ( issues.length > 50 ? '<p class="lieve-ds-help">Showing the first 50 of ' + issues.length + ' advisories. Select a definition to see its own checks.</p>' : '' ) : '<p class="lieve-ds-help">Disabled definitions are not checked until enabled. Dependencies supplied by external stylesheets cannot be verified here.</p>' );
			action( 'Dependency Review', content, '', null, null, { type: 'dependencies', icon: icons.dependencies, description: 'Review the current draft without changing your website.', readOnly: true } );
		}
		function updateConditionIntro( token, parent = null ) {
			const state = conditionPresentation( token, parent ); const intro = conditionPanel.querySelector( '[data-ds-condition-intro]' );
			if ( ! intro ) { return; } intro.dataset.scope = state.scope;
			intro.querySelector( '[data-ds-rule-scope]' ).textContent = state.label;
			intro.querySelector( '[data-ds-rule-count]' ).textContent = state.count;
			intro.querySelector( '[data-ds-rule-summary]' ).textContent = state.summary;
		}
		function groupOptions( selectedValue, includeAll = false ) { return ( includeAll ? '<option value="*">Keep existing group</option>' : '' ) + '<option value=""' + ( selectedValue === '' ? ' selected' : '' ) + '>Uncategorized</option>' + draft[ groupsKey ].map( item => '<option value="' + item.id + '"' + ( selectedValue === item.id ? ' selected' : '' ) + '>' + esc( item.name ) + '</option>' ).join( '' ); }
		function renderGroups() {
			if ( categoryEditor?.isEditing() ) { return; }
			const items = [ { id: '*', name: 'All ' + kind }, ...draft[ groupsKey ], { id: '', name: 'Uncategorized' }, { id: '__trash', name: 'Trash' } ];
			q( '[data-ds-groups]' ).innerHTML = items.map( item => '<button type="button" data-ds-group="' + esc( item.id ) + '"' + ( item.id === groupId ? ' class="is-active' + ( item.id === '__trash' ? ' lieve-ds-trash-nav' : '' ) + '" aria-current="true"' : item.id === '__trash' ? ' class="lieve-ds-trash-nav"' : '' ) + '>' + groupIcon( item ) + '<span>' + esc( item.name ) + '</span><small>' + ( item.id === '__trash' ? model.trashEntries( draft, kind ).length : activeDefinitions().filter( token => item.id === '*' || token[ groupKey ] === item.id ).length ) + '</small></button>' ).join( '' );
			q( '[data-ds-group-add]' ).disabled = ! editable || saving || draft[ groupsKey ].length >= 100;
			categoryEditor?.refresh();
			if ( colors ) { q( '[data-ds-dark-policy]' ).value = draft.darkMode; q( '[data-ds-dark-policy]' ).disabled = ! editable || saving; policySelect?.setDisabled( ! editable || saving ); }
		}
		function filteredItems() { const query = q( '[data-ds-search]' ).value.toLowerCase().trim(); return ( inTrash() ? model.trashEntries( draft, kind ) : activeDefinitions() ).filter( item => ( inTrash() || groupId === '*' || item[ groupKey ] === groupId ) && ( prefix + item.name + ' ' + item.description + ' ' + ( item.value || item.light ) + ' ' + ( item.dark || '' ) + ' ' + ( item.variants || [] ).filter( variant => ! variant.trashed ).map( variant => variant.suffix + ' ' + ( variant.light || '' ) + ' ' + ( variant.dark || '' ) ).join( ' ' ) ).toLowerCase().includes( query ) ); }
		function visibleItems() { const items = filteredItems(); return items.slice( variablePage * variablePageSize, ( variablePage + 1 ) * variablePageSize ); }
		function rowPresentation( item ) {
			const variants = ( item.variants || [] ).filter( variant => inTrash() || ! variant.trashed ).length;
			const value = colors ? ( mode === 'dark' && item.dark ? item.dark : item.light ) : item.value;
			return { value, label: ! item.name ? 'New ' + singular.toLowerCase() : prefix + item.name,
				valueLabel: ( value || ( classes ? 'Add CSS declarations' : 'Set a base value' ) ) + ( colors && variants ? ' · ' + variants + ( variants === 1 ? ' variant' : ' variants' ) : '' ),
				state: inTrash() ? 'trash' : ! item.enabled ? 'off' : item.conditions.length ? 'selective' : 'global' };
		}
		const stateLabel = state => state === 'trash' ? 'In Trash' : state === 'off' ? 'Off' : state === 'selective' ? 'Selective' : 'Global';
		function swatch( value, large = false ) { return '<span class="lieve-ds-swatch' + ( large ? ' is-large' : '' ) + '" data-ds-swatch="' + esc( value ) + '" aria-hidden="true"><i></i></span>'; }
		function paintSwatches() {
			const swatches = root.querySelectorAll( '[data-ds-swatch]' );
			if ( ! swatches.length ) { if ( previewSheet.textContent ) { previewSheet.textContent = ''; } return; }
			// Token definitions are scoped to this manager, never to the WordPress UI.
			const declarations = model.tokens( colors ? { ...draft, darkMode: 'manual' } : draft, null, mode === 'dark' ).filter( item => model.validName( item.name ) && model.safeValue( item.value ) ).flatMap( item => [ prefix + item.name + ':' + item.value + ';', ...( item.aliases || [] ).filter( model.validName ).map( alias => prefix + alias + ':var(--' + item.name + ');' ) ] ).join( '' );
			previewSheet.textContent = '#' + root.id + ' .lieve-ds-swatch{' + declarations + '}';
			swatches.forEach( item => { const value = item.dataset.dsSwatch; item.querySelector( 'i' ).style.backgroundColor = model.safeValue( value ) ? value : ''; } );
		}
		function renderList() {
			const filtered = filteredItems(); { variablePage = Math.min( variablePage, Math.max( 0, Math.ceil( filtered.length / variablePageSize ) - 1 ) ); }
			const items = visibleItems(); const group = draft[ groupsKey ].find( item => item.id === groupId );
			q( '[data-ds-group-title]' ).textContent = inTrash() ? 'Trash' : group?.name || ( groupId === '*' ? 'All ' + kind : 'Uncategorized' );
			root.classList.toggle( 'is-trash-view', inTrash() );
			for ( const name of [ 'duplicate', 'move' ] ) { const control = q( '[data-ds-' + name + ']' ); if ( control ) { control.hidden = inTrash(); } }
			const restore = q( '[data-ds-restore]' ); if ( restore ) { restore.hidden = ! inTrash(); }
			const remove = q( '[data-ds-delete]' ); if ( remove ) { remove.innerHTML = icons.trash + ( inTrash() ? 'Delete permanently' : 'Move to Trash' ); }
			const dependencies = q( '[data-ds-check-dependencies]' ); if ( dependencies ) { dependencies.hidden = classes || inTrash(); }
			q( '[data-ds-group-count]' ).textContent = inTrash() ? filtered.length + ( filtered.length === 1 ? ' entry' : ' entries' ) + ' · Restore or permanently delete' : filtered.length + ( variablesPage ? ( classes ? ( filtered.length === 1 ? ' class' : ' classes' ) : ( colors ? ( filtered.length === 1 ? ' color' : ' colors' ) : ( filtered.length === 1 ? ' variable' : ' variables' ) ) ) + ' · Select to edit values and conditions' : ' shown' ); q( '[data-ds-group-edit]' ).hidden = ! group || ! editable;
			const pager = q( '[data-ds-pagination]' );
			if ( pager ) { pager.hidden = filtered.length <= variablePageSize; q( '[data-ds-page-label]' ).textContent = ( variablePage * variablePageSize + 1 ) + '–' + ( variablePage * variablePageSize + items.length ) + ' of ' + filtered.length; q( '[data-ds-page-prev]' ).disabled = variablePage === 0; q( '[data-ds-page-next]' ).disabled = ( variablePage + 1 ) * variablePageSize >= filtered.length; }
			q( '[data-ds-bulk]' ).hidden = selected.size === 0; q( '[data-ds-selection-count]' ).textContent = selected.size + ' selected';
			if ( refreshVariableRows( items ) ) { variableList?.refresh( false ); return; }
			list.innerHTML = items.length ? items.map( item => {
				const { value, label, valueLabel, state } = rowPresentation( item );
				return '<div class="lieve-ds-item' + ( item.id === listingSelectedId() ? ' is-active' : '' ) + ( selected.has( item.id ) ? ' is-selected' : '' ) + ( ! item.enabled && ! inTrash() ? ' is-disabled' : '' ) + '"' + ( ' data-ds-' + ( colors ? 'color' : 'variable' ) + '-row="' + item.id + '" role="listitem"' ) + '>'
					+ ( editable && ! inTrash() ? '<span class="lieve-ds-item-grip" aria-hidden="true" title="Drag a row to reorder">' + icons.grip + '</span>' : '' )
					+ '<label class="lieve-ds-selection"><input type="checkbox" data-ds-select="' + item.id + '" aria-label="Select ' + esc( label ) + '"' + ( selected.has( item.id ) ? ' checked' : '' ) + ( ! editable ? ' disabled' : '' ) + '>' + '<span class="lieve-ds-selection-box" aria-hidden="true"></span>' + '</label><button type="button" class="lieve-ds-item-main" data-ds-item="' + item.id + '" aria-pressed="' + ( item.id === listingSelectedId() ) + '"' + ( editable && ! inTrash() ? ' title="Drag row to reorder · Arrow keys, Home or End"' : '' ) + '>' + ( colors ? swatch( inTrash() ? value : 'var(--' + item.name + ')' ) : '<span class="lieve-ds-var-icon" aria-hidden="true">' + icons.variable + '</span>' ) + '<span class="lieve-ds-item-text"><strong title="' + esc( label ) + '">' + esc( label ) + '</strong><small title="' + esc( valueLabel ) + '">' + esc( valueLabel ) + '</small></span><span class="lieve-ds-item-badge" data-state="' + state + '">' + stateLabel( state ) + '</span></button></div>';
			} ).join( '' ) : ( inTrash() || variablesPage || colors || classes ) ? variablesEmpty() : '<div class="lieve-ds-empty"><span aria-hidden="true">' + ( colors ? '◉' : '{ }' ) + '</span><h3>' + ( q( '[data-ds-search]' ).value ? 'No matching tokens' : 'Make this your system' ) + '</h3><p>' + ( q( '[data-ds-search]' ).value ? 'Try another name or value.' : colors ? 'Create a palette and add your first color. Its variants will stay linked automatically.' : 'Add your first variable. Reuse it as var(--name) anywhere in your design.' ) + '</p></div>';
			paintSwatches(); variableList?.refresh();
		}
		/** Value edits and selection keep original rows, scroll and Sortable intact. */
		function refreshVariableRows( items ) {
			if ( ! items.length ) { return false; }
			const rows = Array.from( list.querySelectorAll( colors ? '[data-ds-color-row]' : '[data-ds-variable-row]' ) );
			if ( rows.length !== items.length || rows.some( ( row, index ) => ( colors ? row.dataset.dsColorRow : row.dataset.dsVariableRow ) !== items[ index ].id ) ) { return false; }
			rows.forEach( ( row, index ) => {
				const item = items[ index ]; const { label, valueLabel: value, state } = rowPresentation( item );
				row.classList.toggle( 'is-active', item.id === listingSelectedId() ); row.classList.toggle( 'is-disabled', ! item.enabled && ! inTrash() ); row.classList.toggle( 'is-selected', selected.has( item.id ) );
				const button = row.querySelector( '[data-ds-item]' ); const input = row.querySelector( '[data-ds-select]' ); const name = row.querySelector( 'strong' ); const text = row.querySelector( '.lieve-ds-item-text small' ); const badge = row.querySelector( '.lieve-ds-item-badge' );
				const pressed = String( item.id === listingSelectedId() ); if ( button.getAttribute( 'aria-pressed' ) !== pressed ) { button.setAttribute( 'aria-pressed', pressed ); }
				if ( input.getAttribute( 'aria-label' ) !== 'Select ' + label ) { input.setAttribute( 'aria-label', 'Select ' + label ); }
				if ( input.checked !== selected.has( item.id ) ) { input.checked = selected.has( item.id ); }
				if ( name.textContent !== label ) { name.textContent = label; name.title = label; }
				if ( text.textContent !== value ) { text.textContent = value; text.title = value; }
				if ( colors ) { const sample = row.querySelector( '[data-ds-swatch]' ); if ( sample ) { sample.dataset.dsSwatch = inTrash() ? rowPresentation( item ).value : 'var(--' + item.name + ')'; } }
				if ( badge.dataset.state !== state ) { badge.dataset.state = state; badge.textContent = stateLabel( state ); }
			} );
			if ( colors ) { paintSwatches(); }
			return true;
		}
		function variablesEmpty() {
			if ( inTrash() ) { const searching = Boolean( q( '[data-ds-search]' ).value.trim() ); return '<div class="lieve-ds-empty"><span aria-hidden="true">' + icons.trash + '</span><h3>' + ( searching ? 'No matching deleted definitions' : 'Trash is empty' ) + '</h3><p>' + ( searching ? 'Try another name or clear the search.' : 'Deleted definitions stay here until you restore or permanently delete them. Nothing is removed from your website until Save.' ) + '</p></div>'; }
			if ( classes ) { const searching = Boolean( q( '[data-ds-search]' ).value.trim() ); return '<div class="lieve-ds-empty"><span aria-hidden="true">' + icons.variable + '</span><h3>' + ( searching ? 'No matching classes' : draft.classes.length ? 'This category is empty' : 'Build your class library' ) + '</h3><p>' + ( searching ? 'Try another class name, CSS declaration or category.' : 'Create reusable CSS classes, organize categories and assign them to elements in the editor.' ) + '</p>' + ( ! searching && editable ? '<button type="button" class="lieve-conditions-save" data-ds-add>' + icons.plus + 'Add Class</button>' : '' ) + '</div>'; }
			const searching = Boolean( q( '[data-ds-search]' ).value.trim() );
			const title = searching ? 'No matching ' + kind : draft[ kind ].length ? ( colors ? 'This palette is empty' : 'This category is empty' ) : ( colors ? 'Build your color library' : 'Build your design system' );
			const description = searching ? 'Try another name or CSS value, or choose a different group.' : colors ? 'Create reusable colors, organize palettes and build linked variants. Use <code>var(--name)</code> throughout your design.' : 'Create reusable spacing, typography and layout values. Use <code>var(--name)</code> wherever you need them.';
			return '<div class="lieve-ds-empty"><span aria-hidden="true">' + ( colors ? icons.color : icons.variable ) + '</span><h3>' + title + '</h3><p>' + description + '</p>' + ( ! searching && editable ? '<button type="button" class="lieve-conditions-save" data-ds-add' + ( saving || draft[ kind ].length >= ( colors ? 500 : 1000 ) ? ' disabled' : '' ) + '>' + icons.plus + ( colors ? 'Add Color' : 'Add Variable' ) + '</button>' : '' ) + '</div>';
		}
		function colorInspectorEmpty() {
			return '<div class="lieve-ds-detail-empty"><span class="lieve-ds-kicker">COLOR INSPECTOR</span><h3>One palette.<br>A consistent website.</h3><p>Select a color to manage every part of its definition.</p><ol class="lieve-ds-guide"><li><strong>Values & organization</strong><span>Define light and dark colors, and keep them in palettes.</span></li><li><strong>Linked variants</strong><span>Create tints, shades, transparency and color harmonies.</span></li><li><strong>Display conditions</strong><span>Apply it across the website or only where it is needed.</span></li></ol><div class="lieve-ds-safe-note">Your website stays unchanged until you save.</div></div>';
		}
		function classInspectorEmpty() {
			return '<div class="lieve-ds-detail-empty"><span class="lieve-ds-kicker">CLASS INSPECTOR</span><h3>One class.<br>A consistent website.</h3><p>Select a class to manage its reusable styles.</p><ol class="lieve-ds-guide"><li><strong>CSS & organization</strong><span>Write declarations and organize classes by category.</span></li><li><strong>Responsive styles & states</strong><span>Adapt styles at any breakpoint and define hover or focus.</span></li><li><strong>Display conditions</strong><span>Apply styles across the website or only where needed.</span></li></ol><div class="lieve-ds-safe-note">Your website stays unchanged until you save.</div></div>';
		}
		function classDeclarationsMarkup( item ) {
			const textarea = ( label, value, attribute, placeholder ) => '<label class="lieve-ds-field"><span>' + esc( label ) + '</span><textarea class="lieve-class-code" ' + attribute + ' rows="5" maxlength="12000" placeholder="' + esc( placeholder ) + '" autocomplete="off" spellcheck="false"' + ( ! editable ? ' disabled' : '' ) + '>' + esc( value || '' ) + '</textarea></label>';
			let html = textarea( 'CSS declarations · all widths', item.value, 'data-ds-field="value"', 'display: flex;\ngap: var(--space-md);\ncolor: var(--primary);' ) + '<p class="lieve-ds-help">Write declarations only, without a selector or braces. Variables and colors work with var(--name). Empty classes are allowed.</p>';
			const responsive = service.config.breakpoints.map( bp => textarea( bp.name + ( bp.base ? ' · Base' : ' · ' + window.LieveResponsive.rule( bp, service.config.breakpoints ) ), item.values[ bp.id ], 'data-ds-override="' + esc( bp.id ) + '"', 'Leave empty to inherit.\ne.g. gap: 12px;' ) ).join( '' );
			html += colorSection( 'class-responsive:' + item.id, 'Responsive Overrides', '<p class="lieve-ds-help">Declarations cascade from the base through matching breakpoints. Only changed properties override earlier styles.</p>' + responsive, Object.keys( item.values ).length ).replace( '<small>', '<small data-ds-class-responsive-count>' );
			const states = [ [ 'hover', 'Hover' ], [ 'focus-visible', 'Keyboard focus' ], [ 'active', 'Active' ], [ 'disabled', 'Disabled' ], [ 'before', '::before' ], [ 'after', '::after' ] ];
			const stateFields = ( values, bp = '' ) => states.map( ( [ key, label ] ) => textarea( label, values?.[ key ], 'data-ds-class-state="' + key + '"' + ( bp ? ' data-ds-state-breakpoint="' + esc( bp ) + '"' : '' ), key === 'before' || key === 'after' ? 'content: "";\ndisplay: block;' : 'e.g. opacity: .85;' ) ).join( '' );
			const responsiveStates = service.config.breakpoints.map( bp => colorSection( 'class-state-bp:' + item.id + ':' + bp.id, bp.name + ( bp.base ? ' · Base override' : ' · ' + window.LieveResponsive.rule( bp, service.config.breakpoints ) ), stateFields( item.responsiveStates?.[ bp.id ], bp.id ), Object.keys( item.responsiveStates?.[ bp.id ] || {} ).length ).replace( '<small>', '<small data-ds-class-bp-states-count="' + esc( bp.id ) + '">' ) ).join( '' );
			const stateCount = Object.keys( item.states || {} ).length + Object.values( item.responsiveStates || {} ).reduce( ( count, context ) => count + Object.keys( context ).length, 0 );
			html += colorSection( 'class-states:' + item.id, 'States & pseudo-elements', '<p class="lieve-ds-help">Base state CSS applies at all widths. Breakpoint states below override only matching widths.</p>' + stateFields( item.states ) + responsiveStates, stateCount ).replace( '<small>', '<small data-ds-class-states-count>' );
			return html;
		}

		function hydrateInitialView() {
			if ( ! variablesPage || modal || root.dataset.dsInitialRevision !== service.config.revision || q( '[data-ds-search]' ).value.trim() ) { return false; }
			const groups = [ '*', ...draft[ groupsKey ].map( group => group.id ), '', '__trash' ];
			const renderedGroups = Array.from( q( '[data-ds-groups]' ).querySelectorAll( '[data-ds-group]' ), button => button.dataset.dsGroup );
			const renderedItems = Array.from( list.querySelectorAll( '[data-ds-item]' ), button => button.dataset.dsItem );
			return JSON.stringify( renderedGroups ) === JSON.stringify( groups ) && JSON.stringify( renderedItems ) === JSON.stringify( activeDefinitions().slice( 0, variablePageSize ).map( item => item.id ) ) && Boolean( detail.querySelector( '.lieve-ds-guide' ) ) && ( activeDefinitions().length > 0 || Boolean( list.querySelector( '.lieve-ds-empty' ) ) );
		}
		function field( label, property, value, extra = '', type = 'text' ) { return '<label class="lieve-ds-field"><span>' + esc( label ) + '</span><input type="' + type + '" data-ds-field="' + property + '" value="' + esc( value ) + '" autocomplete="off" spellcheck="false"' + extra + ( ! editable ? ' disabled' : '' ) + '></label>'; }
		function colorSection( name, title, content, count = '', defaultOpen = false ) {
			const open = colorSections.has( name ) ? colorSections.get( name ) : defaultOpen;
			return '<details class="lieve-ds-color-section" data-ds-section="' + name + '"' + ( open ? ' open' : '' ) + '><summary><strong>' + title + '</strong>' + ( count !== '' ? '<small>' + count + '</small>' : '' ) + '<span>' + icons.chevron + '</span></summary><div class="lieve-ds-color-section-body">' + content + '</div></details>';
		}
		function colorAnalysisMarkup( name ) {
			const compare = '<section class="lieve-ds-color-comparison" aria-label="Light and dark comparison">' + [ 'light', 'dark' ].map( value => '<div><span>' + ( value === 'light' ? 'Light' : 'Dark' ) + '</span><div class="lieve-ds-mode-sample" data-ds-compare-mode="' + value + '"><span>Aa</span></div><code data-ds-compare-value="' + value + '"></code></div>' ).join( '' ) + '</section>';
			const contrast = '<p class="lieve-ds-help">Text uses <code data-ds-contrast-name>--' + esc( name ) + '</code>. Choose opaque backgrounds for each mode. This checks the definition, not its display conditions or the whole page.</p><div class="lieve-ds-contrast-grid">' + [ 'light', 'dark' ].map( value => '<div class="lieve-ds-contrast-column"><div class="lieve-ds-color-field"><label class="lieve-ds-field"><span>' + ( value === 'light' ? 'Light' : 'Dark' ) + ' background</span><input data-ds-contrast-background="' + value + '" aria-label="' + ( value === 'light' ? 'Light' : 'Dark' ) + ' contrast background" value="' + esc( contrastBackgrounds[ value ] ) + '" placeholder="e.g. #ffffff or var(--surface)" autocomplete="off" spellcheck="false"></label><button type="button" data-ds-contrast-picker="' + value + '" aria-label="Choose ' + value + ' contrast background"></button></div><div class="lieve-ds-contrast-result" data-ds-contrast-result="' + value + '" aria-live="polite"></div></div>' ).join( '' ) + '</div><p class="lieve-ds-help">sRGB · AA normal 4.5:1 / large 3:1 · AAA normal 7:1 / large 4.5:1. Large text: at least 24px, or 18.67px bold. Alpha text is composited on its background. Wide-gamut colors are converted to sRGB.</p>';
			return compare + colorSection( 'contrast', 'Contrast check', contrast );
		}
		/** Browser CSS resolution supports modern colors, aliases and linked variants without guessing. */
		function contextualColor( value ) {
			// CSS Color 4 system colors (including deprecated mappings) depend on the UI environment.
			return /(?:^|[\s,(])(?:currentcolor|inherit|initial|unset|revert(?:-layer)?|accentcolor(?:text)?|activetext|buttonborder|buttonface|buttontext|canvas(?:text)?|field(?:text)?|graytext|highlight(?:text)?|linktext|mark(?:text)?|selecteditem(?:text)?|visitedtext|activeborder|activecaption|appworkspace|background|buttonhighlight|buttonshadow|captiontext|inactiveborder|inactivecaption(?:text)?|infobackground|infotext|menu(?:text)?|scrollbar|threeddarkshadow|threedface|threedhighlight|threedlightshadow|threedshadow|window(?:frame|text)?)(?=$|[\s,)])/i.test( value );
		}
		function resolveAnalysisColor( value, dark ) {
			if ( ! model.validColor( value ) ) { return null; }
			colorProbe ||= document.createElement( 'span' ); colorProbe.hidden = true; if ( ! colorProbe.parentNode ) { root.appendChild( colorProbe ); }
			const definitions = model.tokens( { ...draft, darkMode: 'manual' }, null, dark ).filter( item => model.validName( item.name ) && model.safeValue( item.value ) );
			const defined = new Set( definitions.flatMap( item => [ item.name, ...( item.aliases || [] ) ] ) );
			colorProbe.style.cssText = '';
			for ( const item of definitions ) { colorProbe.style.setProperty( prefix + item.name, item.value ); for ( const alias of item.aliases || [] ) { if ( model.validName( alias ) ) { colorProbe.style.setProperty( prefix + alias, 'var(--' + item.name + ')' ); } } }
			// Unknown names must not accidentally resolve against WordPress admin CSS.
			for ( const expression of [ value, ...definitions.map( item => item.value ) ] ) { for ( const match of expression.matchAll( /var\(\s*--([a-zA-Z_][a-zA-Z0-9_-]*)/g ) ) { if ( ! defined.has( match[ 1 ] ) ) { colorProbe.style.setProperty( prefix + match[ 1 ], 'initial' ); } } }
			const probeName = '--lieve-probe-' + root.id; colorProbe.style.setProperty( probeName, value );
			const resolved = window.getComputedStyle( colorProbe ).getPropertyValue( probeName ).trim();
			if ( ! resolved || ! model.validColor( resolved ) || contextualColor( resolved ) ) { return null; }
			colorProbe.style.color = resolved; const computed = window.getComputedStyle( colorProbe ).color;
			const srgb = model.computedSrgb( computed ); if ( srgb ) { return srgb; }
			colorCanvas ||= document.createElement( 'canvas' ); colorCanvas.width = colorCanvas.height = 1; const context = colorCanvas.getContext( '2d', { willReadFrequently: true } ); if ( ! context ) { return null; }
			context.clearRect( 0, 0, 1, 1 ); context.fillStyle = computed; context.fillRect( 0, 0, 1, 1 ); const rgba = Array.from( context.getImageData( 0, 0, 1, 1 ).data );
			const alpha = computed.match( /\/\s*([\d.]+)(%)?\s*\)$/ ); rgba[ 3 ] = alpha ? Math.min( 1, Number( alpha[ 1 ] ) / ( alpha[ 2 ] ? 100 : 1 ) ) : rgba[ 3 ] / 255; return rgba;
		}
		function refreshColorAnalysis() {
			const parent = current(); if ( ! colors || ! parent || detailTab === 'conditions' ) { return; }
			const variant = currentVariant();
			for ( const modeName of [ 'light', 'dark' ] ) {
				const dark = modeName === 'dark'; const value = variant ? model.variantValue( parent, variant, dark ) : dark && parent.dark ? parent.dark : parent.light;
				const foreground = resolveAnalysisColor( value, dark ); const background = resolveAnalysisColor( contrastBackgrounds[ modeName ], dark );
				const sample = detail.querySelector( '[data-ds-compare-mode="' + modeName + '"]' ); const code = detail.querySelector( '[data-ds-compare-value="' + modeName + '"]' );
				if ( sample ) { sample.style.backgroundColor = foreground ? 'rgba(' + foreground.join( ',' ) + ')' : ''; sample.dataset.unresolved = String( ! foreground ); const report = foreground && model.contrastReport( foreground, [ 255, 255, 255, 1 ] ); sample.style.color = report && report.ratio >= 4.5 ? '#ffffff' : '#000000'; }
				if ( code ) { code.textContent = foreground ? value : 'Cannot resolve this color'; code.title = value; }
				const result = detail.querySelector( '[data-ds-contrast-result="' + modeName + '"]' ); if ( ! result ) { continue; }
				const report = foreground && background && model.contrastReport( foreground, background );
				if ( ! report ) { result.innerHTML = '<p class="lieve-ds-help">' + ( ! foreground || ! background ? 'Cannot resolve these colors. Check references, CSS values and browser support.' : 'Choose an opaque background to calculate contrast accurately.' ) + '</p>'; continue; }
				result.innerHTML = '<div class="lieve-ds-contrast-sample" style="color:rgb(' + report.text.join( ',' ) + ');background-color:rgb(' + report.background.join( ',' ) + ')"><span>Readable design</span><strong>Aa</strong></div><div class="lieve-ds-contrast-ratio"><strong>' + ( Math.floor( report.ratio * 100 ) / 100 ).toFixed( 2 ) + ':1</strong><span>Contrast ratio</span></div><ul class="lieve-ds-contrast-checks">' + [ [ 'AA normal', report.aa ], [ 'AA large', report.aaLarge ], [ 'AAA normal', report.aaa ], [ 'AAA large', report.aaaLarge ] ].map( ( [ label, pass ] ) => '<li data-pass="' + pass + '"><span>' + label + '</span><strong>' + ( pass ? 'Pass' : 'Fail' ) + '</strong></li>' ).join( '' ) + '</ul>';
			}
		}
		function colorField( label, property, value, placeholder = '' ) { return '<div class="lieve-ds-color-field">' + field( label, property, value, ' placeholder="' + esc( placeholder || 'e.g. #16c6c0, oklch(70% 0.15 180) or var(--brand)' ) + '"' ) + '<button type="button" data-ds-color-picker="' + property + '" aria-label="Choose ' + esc( label.toLowerCase() ) + '" title="Choose ' + esc( label.toLowerCase() ) + '"' + ( ! editable || saving ? ' disabled' : '' ) + '></button></div>'; }
		function renderDetail() {
			detailSelect?.destroy(); detailSelect = null; detailColours.forEach( picker => picker.destroy() ); detailColours = [];
			analysisColours.forEach( picker => picker.destroy() ); analysisColours = [];
			const item = current(); const variant = currentVariant(); conditionPanel.hidden = true;
			if ( inTrash() ) { renderTrashDetail( item, variant ); return; }
			if ( ! item ) { detail.innerHTML = classes ? classInspectorEmpty() : colors ? colorInspectorEmpty() : variablesPage ? '<div class="lieve-ds-detail-empty"><span class="lieve-ds-kicker">VARIABLE INSPECTOR</span><h3>One value.<br>A consistent website.</h3><p>Select a variable to manage every part of its definition.</p><ol class="lieve-ds-guide"><li><strong>Values & organization</strong><span>Set a CSS value and keep related variables in categories.</span></li><li><strong>Responsive overrides</strong><span>Adapt a value at any breakpoint. Blank fields inherit.</span></li><li><strong>Display conditions</strong><span>Apply it across the website or only where it is needed.</span></li></ol><div class="lieve-ds-safe-note">Your website stays unchanged until you save.</div></div>' : '<div class="lieve-ds-detail-empty"><span class="lieve-ds-kicker">DESIGN SYSTEM</span><h3>Small definitions.<br>Consistent design.</h3><p>Select a token to manage its values, responsive settings and display conditions.</p><p>Website defaults stay untouched until you define and save your own tokens.</p></div>'; return; }
			const token = variant || item; const tokenName = variant ? item.name + '-' + variant.suffix : item.name;
			let html = '<div class="lieve-ds-detail-heading"><span class="lieve-ds-kicker">' + ( variant ? 'LINKED VARIANT' : classes ? 'GLOBAL CLASS' : colors ? 'COLOR VARIABLE' : 'SYSTEM VARIABLE' ) + '</span><div class="lieve-ds-detail-title">' + ( colors ? swatch( 'var(--' + tokenName + ')', true ) : '' ) + '<div><h3>' + ( ! colors && ! tokenName ? 'New ' + singular.toLowerCase() : prefix + esc( tokenName ) ) + '</h3><button type="button" class="lieve-ds-copy-ref" data-ds-copy="' + esc( classes ? '.' + tokenName : 'var(--' + tokenName + ')' ) + '"' + ( ! model.validName( tokenName ) ? ' disabled' : '' ) + '>' + icons.copy + 'Copy CSS reference</button></div></div><div class="lieve-ds-detail-actions">' + ( variant ? '<button type="button" data-ds-back-parent>← Parent color</button>' : '<label class="lieve-ds-enabled"><span>Enabled</span><button type="button" class="lieve-ds-toggle" data-ds-enabled role="switch" aria-label="Enabled" aria-checked="' + item.enabled + '"' + ( ! editable ? ' disabled' : '' ) + '><span aria-hidden="true"></span></button></label><button type="button" class="lieve-ds-icon" data-ds-copy-one aria-label="Duplicate token" title="Duplicate token">' + icons.copy + '</button>' ) + '<button type="button" class="lieve-ds-icon is-danger" data-ds-delete-one aria-label="Move to Trash · ' + ( variant ? 'variant' : 'token' ) + '" title="Move to Trash · ' + ( variant ? 'variant' : 'token' ) + '"' + ( ! editable ? ' disabled' : '' ) + '>' + icons.trash + '</button></div></div>';
			html += '<div class="lieve-ds-tabs" role="tablist" aria-label="Token settings">' + [ 'details', 'conditions' ].map( tab => '<button type="button" role="tab" id="' + root.id + '-tab-' + tab + '" aria-controls="' + root.id + '-' + tab + '-panel" tabindex="' + ( detailTab === tab ? '0' : '-1' ) + '" data-ds-tab="' + tab + '" aria-selected="' + ( detailTab === tab ) + '">' + ( tab === 'details' ? 'Values & Settings' : 'Conditions' + ( token.conditions.length ? ' · ' + token.conditions.length : '' ) ) + '</button>' ).join( '' ) + '</div>';
			conditionPanel.id = root.id + '-conditions-panel'; conditionPanel.setAttribute( 'role', 'tabpanel' ); conditionPanel.setAttribute( 'aria-labelledby', root.id + '-tab-conditions' );
			if ( detailTab !== 'conditions' ) {
				html += '<div class="lieve-ds-fields" role="tabpanel" id="' + root.id + '-details-panel" aria-labelledby="' + root.id + '-tab-details">' + ( colors ? '<div class="lieve-ds-color-identity">' : '' ) + field( variant ? 'Variant suffix' : classes ? 'CSS class name (without .)' : 'CSS variable name (without --)', variant ? 'suffix' : 'name', variant ? variant.suffix : item.name, ' maxlength="80"' + ( ! colors ? ' placeholder="' + ( classes ? 'e.g. card-primary' : 'e.g. space-md' ) + '"' : '' ) );
				if ( ! variant ) {
					if ( colors ) { html += '<div class="lieve-ds-field"><span>Palette</span><select id="' + root.id + '-token-palette" aria-label="Palette" data-ds-custom-select data-ds-select-kind="palettes" data-ds-field="' + groupKey + '"' + ( ! editable || saving ? ' disabled' : '' ) + '>' + groupOptions( item[ groupKey ] ) + '</select></div>'; }
					else { html += '<div class="lieve-ds-field"><span>Category</span><select id="' + root.id + '-token-category" aria-label="Category" data-ds-custom-select data-ds-field="' + groupKey + '"' + ( ! editable || saving ? ' disabled' : '' ) + '>' + groupOptions( item[ groupKey ] ) + '</select></div>'; }
				}
				if ( colors ) { html += '</div>'; }
				if ( classes ) { html += classDeclarationsMarkup( item ); } else if ( ! colors ) {
					const section = 'responsive:' + item.id; const expanded = colorSections.has( section ) ? colorSections.get( section ) : Object.values( item.values ).some( Boolean );
					html += field( 'Base value · all widths', 'value', item.value, ' placeholder="e.g. 16px, 1rem or clamp(1rem, 2vw, 2rem)"' ) + '<details class="lieve-ds-disclosure lieve-ds-responsive" data-ds-section="' + section + '"' + ( expanded ? ' open' : '' ) + '><summary><span class="lieve-ds-responsive-icon">' + icons.responsive + '</span><span class="lieve-ds-responsive-heading"><strong>Responsive Overrides</strong><span>Fine-tune values by breakpoint</span></span><small class="lieve-ds-override-count" data-ds-override-count></small><span class="lieve-ds-responsive-chevron">' + icons.chevron + '</span></summary><div class="lieve-ds-responsive-body"><p class="lieve-ds-help">Leave a field empty to inherit its value. Your breakpoint cascade stays in sync.</p><div class="lieve-ds-override-list">';
					const base = service.config.breakpoints.find( bp => bp.base );
					for ( const bp of service.config.breakpoints ) {
						const icon = window.LieveResponsive.iconSvg( bp.icon || window.LieveResponsive.defaultIcon( bp ), service.config.breakpointIcons ) || icons.responsive;
						const range = bp.base ? 'All widths' : ( bp.width > base.width ? '≥ ' : '≤ ' ) + bp.width + ' px';
						html += '<label class="lieve-ds-field lieve-ds-override-row" data-ds-override-row="' + esc( bp.id ) + '"><span class="lieve-ds-override-icon" aria-hidden="true">' + icon + '</span><span class="lieve-ds-override-label"><strong>' + esc( bp.name ) + ( bp.base ? '<span class="lieve-ds-override-base">Base</span>' : '' ) + '</strong><small>' + esc( range ) + '</small></span><span class="lieve-ds-override-control"><input data-ds-override="' + esc( bp.id ) + '" aria-label="' + esc( bp.name ) + ' override" value="' + esc( item.values[ bp.id ] || '' ) + '" placeholder="Inherit base value" autocomplete="off" spellcheck="false"' + ( ! editable ? ' disabled' : '' ) + '><small data-ds-override-status></small></span></label>';
					}
					html += '</div><p class="lieve-ds-override-retained" data-ds-override-retained hidden></p></div></details>';
				} else if ( variant ) {
					html += '<label class="lieve-ds-field"><span>Variant type</span><select id="' + root.id + '-variant-type" aria-label="Variant type" data-ds-custom-select data-ds-select-kind="types" data-ds-field="type"' + ( ! editable ? ' disabled' : '' ) + '>' + [ [ 'custom', 'Custom color' ], [ 'tint', 'Tint · mix with white' ], [ 'shade', 'Shade · mix with black' ], [ 'alpha', 'Transparency · opacity' ] ].map( ( [ key, label ] ) => '<option value="' + key + '"' + ( variant.type === key ? ' selected' : '' ) + '>' + label + '</option>' ).join( '' ) + '</select></label>';
					html += variant.type === 'custom' ? '<div class="lieve-ds-color-values">' + colorField( 'Light color', 'light', variant.light ) + colorField( 'Dark color', 'dark', variant.dark, 'Use the light value' ) + '</div>' : field( variant.type === 'alpha' ? 'Opacity (%)' : 'Mix amount (%)', 'amount', variant.amount, ' min="0" max="100" step="1"', 'number' ) + '<p class="lieve-ds-help">Generated with color-mix(). Changing the parent or its dark value updates this variant automatically.</p><code class="lieve-ds-code">' + esc( model.variantValue( item, variant, mode === 'dark' ) ) + '</code>';
				} else { html += '<div class="lieve-ds-color-values">' + colorField( 'Light color', 'light', item.light ) + colorField( 'Dark color', 'dark', item.dark, 'Use the light value' ) + '</div>'; }
				const description = ! variant ? '<label class="lieve-ds-field"><span>Description</span><textarea data-ds-field="description" rows="2" maxlength="1000" placeholder="Optional note about how to use this ' + ( singular.toLowerCase() ) + '"' + ( ! editable ? ' disabled' : '' ) + '>' + esc( item.description ) + '</textarea></label>' : '';
				const aliases = '<div class="lieve-ds-aliases" data-ds-aliases' + ( token.aliases.length ? '' : ' hidden' ) + '><span>Previous names keep working</span>' + token.aliases.map( alias => '<button type="button" data-ds-remove-alias="' + esc( alias ) + '"' + ( ! editable ? ' disabled' : '' ) + ' title="Remove compatibility alias">' + prefix + esc( alias ) + ' ×</button>' ).join( '' ) + '</div>';
				if ( colors ) { html += colorAnalysisMarkup( tokenName ); }
				html += colors ? colorSection( 'notes', 'Notes & compatibility', description + aliases, token.aliases.length || '' ) : description + aliases;
				html += '<section class="lieve-ds-dependencies" data-ds-dependencies aria-label="Dependency advisories" aria-live="polite" hidden></section>';
				if ( colors && ! variant ) { html += colorSection( 'variants', 'Linked variants', '<div class="lieve-ds-section-title"><button type="button" class="lieve-conditions-cancel" data-ds-add-variant' + ( ! editable || item.variants.length >= 50 ? ' disabled' : '' ) + '>' + icons.plus + 'Add</button><button type="button" class="lieve-conditions-cancel" data-ds-generate' + ( ! editable ? ' disabled' : '' ) + '>' + icons.scale + 'Generate Scale</button></div><div class="lieve-ds-variant-list">' + item.variants.filter( v => ! v.trashed ).map( v => '<button type="button" class="lieve-ds-variant" data-ds-variant="' + v.id + '">' + swatch( 'var(--' + item.name + '-' + v.suffix + ')' ) + '<span><strong>' + esc( v.suffix ) + '</strong><small>' + esc( v.type === 'custom' ? 'Custom color' : v.type + ' · ' + v.amount + '%' ) + '</small></span><code>--' + esc( item.name + '-' + v.suffix ) + '</code></button>' ).join( '' ) + '</div>' + ( ! item.variants.some( v => ! v.trashed ) ? '<p class="lieve-ds-help">Create custom, tint, shade or transparency variants (up to 50 per color).</p>' : '' ), item.variants.filter( v => ! v.trashed ).length, true ).replace( 'lieve-ds-color-section"', 'lieve-ds-color-section lieve-ds-variants"' ); }
				html += '</div>';
			} else { html += '<div role="tabpanel" id="' + root.id + '-details-panel" aria-labelledby="' + root.id + '-tab-details" hidden></div>'; }
			detail.innerHTML = html;
			const customSelect = detail.querySelector( '[data-ds-custom-select]' );
			if ( customSelect ) { detailSelect = createActionSelect( customSelect, root, root ); }
			detailColours = Array.from( detail.querySelectorAll( '[data-ds-color-picker]' ), trigger => window.LieveColour.create( detail.querySelector( '[data-ds-field="' + trigger.dataset.dsColorPicker + '"]' ), { trigger, container: root } ) );
			analysisColours = Array.from( detail.querySelectorAll( '[data-ds-contrast-picker]' ), trigger => window.LieveColour.create( detail.querySelector( '[data-ds-contrast-background="' + trigger.dataset.dsContrastPicker + '"]' ), { trigger, container: root } ) );
			if ( ! editable ) { const copy = detail.querySelector( '[data-ds-copy-one]' ); if ( copy ) { copy.disabled = true; } }
			const variantsHeading = detail.querySelector( '.lieve-ds-variants .lieve-ds-section-title' );
			if ( variantsHeading ) { const harmony = document.createElement( 'button' ); harmony.type = 'button'; harmony.dataset.dsHarmony = ''; harmony.className = 'lieve-conditions-cancel'; harmony.innerHTML = icons.color + 'Harmonies'; harmony.disabled = ! editable || item.variants.length >= 50; variantsHeading.appendChild( harmony ); }
			paintSwatches();
			if ( colors ) { refreshColorAnalysis(); }
			renderDependencyWarnings();
			if ( ! colors && ! classes ) { updateResponsiveOverrides( item ); }
			if ( detailTab === 'conditions' ) {
				conditionPanel.hidden = false;
				updateConditionIntro( token, variant ? item : null );
				const match = q( '[data-ds-match]' ); if ( match ) { match.textContent = service.config.postId ? 'Evaluated against the page being edited.' : 'Evaluated on each frontend page.'; }
				if ( ! conditions ) { conditions = window.LieveConditions.create( { root: q( '[data-ds-conditions]' ), config: service.config.conditions, conditions: token.conditions, onChange: rows => { const record = currentVariant() || current(); if ( ! record || ! editable || saving ) { return; } record.conditions = rows; sync(); } } ); }
				else { conditions.setConditions( token.conditions ); }
				const conditionRoot = q( '[data-ds-conditions]' ); conditionRoot.inert = saving;
				if ( ! editable ) { conditionRoot.querySelectorAll( 'button,input,select,textarea' ).forEach( input => { input.disabled = true; } ); conditionRoot.querySelectorAll( '[tabindex]' ).forEach( row => { row.tabIndex = -1; } ); conditionRoot.style.pointerEvents = 'none'; }
			}
		}
		function updateResponsiveOverrides( item ) {
			const breakpoints = service.config.breakpoints; const activeIds = new Set( breakpoints.map( bp => bp.id ) );
			const count = breakpoints.filter( bp => Boolean( item.values[ bp.id ] ) ).length;
			const badge = detail.querySelector( '[data-ds-override-count]' );
			if ( badge ) { badge.textContent = count + ( count === 1 ? ' override' : ' overrides' ); badge.dataset.active = String( count > 0 ); }
			for ( const row of detail.querySelectorAll( '[data-ds-override-row]' ) ) {
				const bp = breakpoints.find( value => value.id === row.dataset.dsOverrideRow ); if ( ! bp ) { continue; }
				const overridden = Boolean( item.values[ bp.id ] ); let inherited = item.value; let source = 'Base value';
				for ( const parent of window.LieveResponsive.cascade( breakpoints, bp.id ) ) {
					if ( parent.id !== bp.id && item.values[ parent.id ] ) { inherited = item.values[ parent.id ]; source = parent.name; }
				}
				row.dataset.state = overridden ? 'custom' : 'inherited';
				const input = row.querySelector( '[data-ds-override]' ); input.placeholder = inherited || 'Inherit base value';
				const status = row.querySelector( '[data-ds-override-status]' ); status.textContent = overridden ? 'Custom value' : 'Inherited · ' + source; status.title = overridden ? 'Applies at this breakpoint and follows its cascade.' : 'Inherited from ' + source + ( inherited ? ': ' + inherited : '. Set the base value first.' );
			}
			const retained = detail.querySelector( '[data-ds-override-retained]' );
			if ( retained ) { const count = Object.keys( item.values ).filter( id => ! activeIds.has( id ) ).length; retained.hidden = ! count; retained.textContent = count + ( count === 1 ? ' inactive breakpoint value is retained.' : ' inactive breakpoint values are retained.' ); }
		}
		function renderTrashDetail( item, variant ) {
			if ( ! item ) { detail.innerHTML = '<div class="lieve-ds-detail-empty"><h3>Recover your definitions</h3><p>Select an entry to review its saved values, restore it or permanently delete it.</p><div class="lieve-ds-safe-note">IDs, names, conditions and variants are retained. Save publishes Trash changes.</div></div>'; return; }
			const token = variant || item; const name = variant ? item.name + '-' + variant.suffix : item.name;
			const group = draft[ groupsKey ].find( group => group.id === item[ groupKey ] );
			const values = colors ? [ [ 'Light color', variant ? model.variantValue( item, variant ) : item.light ], [ 'Dark color', variant ? model.variantValue( item, variant, true ) : item.dark || item.light ] ] : [ [ classes ? 'CSS declarations' : 'Base value', item.value ], ...Object.entries( item.values ).map( ( [ id, value ] ) => [ service.config.breakpoints.find( bp => bp.id === id )?.name || id, value ] ), ...( classes ? Object.entries( item.states || {} ).map( ( [ state, value ] ) => [ state, value ] ) : [] ) ];
			const actions = '<div class="lieve-ds-trash-actions"><button type="button" class="lieve-conditions-save" data-ds-restore-one' + ( ! editable ? ' disabled' : '' ) + '>' + icons.restore + 'Restore</button><button type="button" class="lieve-conditions-cancel" data-ds-purge-one' + ( ! editable ? ' disabled' : '' ) + '>' + icons.trash + 'Delete permanently</button></div>';
			detail.innerHTML = '<div class="lieve-ds-trash-detail"><div class="lieve-ds-detail-title"><div><h3>' + prefix + esc( name ) + '</h3><span class="lieve-ds-item-badge" data-state="trash">In Trash</span></div></div><p class="lieve-ds-help">Restore to use this definition again. Its name stays reserved until permanent deletion.</p>' + actions + '<dl class="lieve-ds-trash-facts"><div><dt>' + ( colors ? 'Palette' : 'Category' ) + '</dt><dd>' + esc( group?.name || 'Uncategorized' ) + '</dd></div><div><dt>Moved to Trash</dt><dd>' + esc( token.trashedAt ? new Date( token.trashedAt * 1000 ).toLocaleDateString() : 'Date not recorded' ) + '</dd></div><div><dt>Conditions</dt><dd>' + token.conditions.length + ( variant ? ' · parent conditions retained' : '' ) + '</dd></div>' + ( ! variant ? '<div><dt>Previous state</dt><dd>' + ( item.enabled ? 'Enabled' : 'Disabled' ) + '</dd></div>' : '' ) + ( colors && ! variant ? '<div><dt>Retained variants</dt><dd>' + item.variants.length + '</dd></div>' : '' ) + '</dl>' + ( item.description && ! variant ? '<p class="lieve-ds-help">' + esc( item.description ) + '</p>' : '' ) + '<div class="lieve-ds-trash-values">' + values.filter( ( [ , value ] ) => value ).map( ( [ label, value ] ) => '<div><strong>' + esc( label ) + '</strong><pre><code>' + esc( value ) + '</code></pre></div>' ).join( '' ) + '</div><p class="lieve-ds-help">Changes apply to the website only after Save.</p></div>';
		}
		function selectItem( id, variantId = null ) { history?.breakGroup(); const entry = inTrash() && model.trashEntries( draft, kind ).find( item => item.id === id ); selectedId = entry?._parentId || id; selectedVariant = entry?._parentId ? id : variantId; detailTab = 'details'; revealVariable( listingSelectedId() ); renderList(); renderDetail(); }
		function reconcileInspector() {
			if ( selectedId && ! visibleItems().some( item => item.id === listingSelectedId() ) ) { selectedId = selectedVariant = null; detailTab = 'details'; }
			renderDetail();
		}
		function switchDetailTab( tab ) {
			if ( ! [ 'details', 'conditions' ].includes( tab ) || saving ) { return; }
			detailTab = tab; renderDetail(); detail.querySelector( '[data-ds-tab="' + tab + '"]' )?.focus( { preventScroll: true } );
		}
		function revealVariable( id ) {
			if ( ! id ) { return; }
			let index = filteredItems().findIndex( item => item.id === id );
			if ( index < 0 ) { q( '[data-ds-search]' ).value = ''; window.LieveSearchControls?.refresh( q( '[data-ds-search]' ) ); index = filteredItems().findIndex( item => item.id === id ); }
			if ( index < 0 ) { groupId = model.trashEntries( draft, kind ).some( item => item.id === id ) ? '__trash' : '*'; index = filteredItems().findIndex( item => item.id === id ); }
			variablePage = index < 0 ? 0 : Math.floor( index / variablePageSize ); variableList?.clearAnchor();
		}
		function closeAction( immediate = false ) {
			if ( actionClosing && ! immediate ) { return; }
			actionSelect?.destroy(); actionSelect = null;
			actionColour?.destroy(); actionColour = null;
			window.clearTimeout( actionCloseTimer ); window.cancelAnimationFrame( actionOpenFrame ); actionOpenFrame = 0;
			const wasOpen = ! actionLayer.hidden; const trigger = actionTrigger;
			actionCommit = null; actionClosing = wasOpen; actionContent.inert = wasOpen; actionLayer.classList.remove( 'is-visible' );
			const finish = () => {
				actionCloseTimer = 0; actionClosing = false; actionLayer.hidden = true; actionContent.inert = false; actionTrigger = null; refreshHistoryControls();
				root.querySelectorAll( '.lieve-ds-toolbar, .lieve-ds-workspace, .lieve-ds-footer' ).forEach( item => { item.inert = false; } );
				categoryEditor?.refresh();
				variableList?.refresh();
				if ( wasOpen && trigger?.isConnected ) { trigger.focus(); }
			};
			if ( ! wasOpen || immediate || window.matchMedia?.( '(prefers-reduced-motion: reduce)' ).matches ) { finish(); }
			else { actionCloseTimer = window.setTimeout( finish, 220 ); }
		}
		function action( heading, content, label, callback, onInput = null, presentation = {} ) {
			detailSelect?.close(); detailColours.forEach( picker => picker.close() ); analysisColours.forEach( picker => picker.close() ); policySelect?.close(); history?.breakGroup();
			actionSelect?.destroy(); actionSelect = null;
			actionColour?.destroy(); actionColour = null;
			window.clearTimeout( actionCloseTimer ); window.cancelAnimationFrame( actionOpenFrame ); actionCloseTimer = actionOpenFrame = 0;
			actionTrigger = ! actionLayer.hidden && actionTrigger ? actionTrigger : document.activeElement; actionCommit = callback; actionClosing = false;
			actionContent.inert = false; actionLayer.classList.remove( 'is-visible' ); actionLayer.dataset.dsAction = presentation.type || 'tokens';
			actionLayer.querySelector( '[role="dialog"]' ).setAttribute( 'aria-label', heading );
			actionContent.innerHTML = '<form data-ds-action-form><header>' + ( presentation.icon ? '<span class="lieve-ds-action-heading-icon">' + presentation.icon + '</span>' : '' ) + '<div class="lieve-ds-action-heading"><h3>' + esc( heading ) + '</h3>' + ( presentation.description ? '<p>' + esc( presentation.description ) + '</p>' : '' ) + '</div><button type="button" class="lieve-ds-icon" data-ds-action-close aria-label="Close">' + icons.close + '</button></header><div class="lieve-ds-action-body">' + content + '<p data-ds-action-error role="alert"></p></div><footer><button type="button" class="lieve-conditions-cancel" data-ds-action-close>' + ( presentation.readOnly ? 'Close' : 'Cancel' ) + '</button>' + ( presentation.readOnly ? '' : '<button type="submit" class="lieve-conditions-save">' + esc( label ) + '</button>' ) + '</footer></form>';
			actionLayer.hidden = false; root.querySelectorAll( '.lieve-ds-toolbar, .lieve-ds-workspace, .lieve-ds-footer' ).forEach( item => { item.inert = true; } );
			refreshHistoryControls();
			variableList?.refresh( false );
			if ( window.matchMedia?.( '(prefers-reduced-motion: reduce)' ).matches ) { actionLayer.classList.add( 'is-visible' ); }
			else { void actionLayer.offsetWidth; actionOpenFrame = window.requestAnimationFrame( () => { actionOpenFrame = 0; if ( ! actionLayer.hidden && ! actionClosing ) { actionLayer.classList.add( 'is-visible' ); } } ); }
			actionContent.querySelectorAll( '[data-ds-action-close]' ).forEach( button => button.addEventListener( 'click', () => closeAction() ) );
			const form = actionContent.querySelector( 'form' ); const customSelect = form.querySelector( '[data-ds-custom-select]' ); if ( customSelect ) { actionSelect = createActionSelect( customSelect, actionLayer ); }
			form.addEventListener( 'submit', event => { event.preventDefault(); if ( actionClosing || actionLayer.hidden || ! actionCommit ) { return; } try { actionCommit( new FormData( form ) ); closeAction(); sync( true ); } catch ( error ) { actionContent.querySelector( '[data-ds-action-error]' ).textContent = error.message; } } );
			if ( onInput ) { form.addEventListener( 'input', () => onInput( new FormData( form ), form ) ); onInput( new FormData( form ), form ); }
			( form.querySelector( 'input,select,textarea' ) || actionLayer.querySelector( '[role="dialog"]' ) ).focus();
		}
		const actionField = ( label, name, value = '', extra = '' ) => '<label class="lieve-ds-field"><span>' + esc( label ) + '</span><input name="' + name + '" value="' + esc( value ) + '"' + extra + '></label>';
		function deleteItems( ids ) {
			if ( inTrash() ) { purgeItems( ids ); return; }
			const chosen = new Set( ids ); const saved = service.data(); let discarded = 0; let reverted = 0;
			const validRecord = item => { const probe = model.empty(); probe[ groupsKey ] = model.clone( draft[ groupsKey ] ); probe[ kind ] = [ model.clone( item ) ]; return ! model.validate( probe ); };
			draft[ kind ] = draft[ kind ].filter( item => {
				if ( chosen.has( item.id ) && ! item.trashed && ! validRecord( item ) ) {
					const original = saved[ kind ].find( token => token.id === item.id );
					if ( ! original ) { discarded++; chosen.delete( item.id ); return false; }
					const replacement = model.clone( original ); if ( ! draft[ groupsKey ].some( group => group.id === replacement[ groupKey ] ) ) { replacement[ groupKey ] = ''; }
					Object.keys( item ).forEach( key => delete item[ key ] ); Object.assign( item, replacement ); reverted++;
				}
				if ( colors && ! item.trashed && ! chosen.has( item.id ) ) { item.variants = item.variants.filter( variant => {
					if ( ! chosen.has( variant.id ) || variant.trashed || validRecord( { ...item, variants: [ variant ] } ) ) { return true; }
					const original = saved.colors.find( token => token.id === item.id )?.variants.find( token => token.id === variant.id );
					if ( ! original ) { discarded++; chosen.delete( variant.id ); return false; }
					Object.keys( variant ).forEach( key => delete variant[ key ] ); Object.assign( variant, model.clone( original ) ); reverted++; return true;
				} ); }
				return true;
			} );
			draft = model.updateTrash( draft, kind, [ ...chosen ], 'trash' ); selected.clear(); selectedId = selectedVariant = null; variableList?.clearAnchor(); sync( true );
			messageStatus( ( chosen.size ? 'Moved to Trash in this draft. Restore from Trash or Undo; Save publishes the change.' : 'Incomplete new definitions discarded from this draft. Undo can recover them.' ) + ( reverted ? ' Invalid edits were replaced with the last saved definition.' : '' ) + ( discarded && chosen.size ? ' Incomplete new definitions were discarded.' : '' ) );
		}
		function restoreItems( ids ) {
			draft = model.updateTrash( draft, kind, ids, 'restore' ); selected.clear(); selectedId = selectedVariant = null; variableList?.clearAnchor(); sync( true ); messageStatus( 'Restored in this draft with original IDs, values and conditions. Save to publish.' );
		}
		function purgeItems( ids, empty = false ) {
			const items = model.trashEntries( draft, kind ).filter( item => ids.includes( item.id ) ); if ( ! items.length ) { return; }
			const title = empty ? 'Empty Trash' : 'Delete Permanently';
			const content = '<p>Permanently delete ' + items.length + ( items.length === 1 ? ' entry' : ' entries' ) + ( colors ? ' and any retained child variants' : '' ) + '? Existing page references are not rewritten. Export first if you need a backup.</p><ul class="lieve-ds-purge-list">' + items.slice( 0, 12 ).map( item => '<li><code>' + prefix + esc( item.name ) + '</code></li>' ).join( '' ) + '</ul>' + ( items.length > 12 ? '<p class="lieve-ds-help">And ' + ( items.length - 12 ) + ' more entries.</p>' : '' ) + '<label class="lieve-ds-duplicate-option"><span class="lieve-ds-duplicate-switch"><input type="checkbox" name="confirm" role="switch" aria-label="Confirm permanent deletion" required><span aria-hidden="true"></span></span><span><strong>I understand this cannot be restored after Save</strong><small>Cancel or Undo still recovers this draft before saving.</small></span></label>';
			action( title, content, title, form => { if ( ! form.has( 'confirm' ) ) { throw new Error( 'Confirm permanent deletion to continue.' ); } draft = model.updateTrash( draft, kind, items.map( item => item.id ), 'purge' ); selected.clear(); selectedId = selectedVariant = null; variableList?.clearAnchor(); }, ( values, form ) => { form.querySelector( '[type="submit"]' ).disabled = ! values.has( 'confirm' ); }, { type: 'trash', icon: icons.trash, description: 'Permanent deletion applies only when you save this library.' } );
		}
		function duplication( ids, cloneGroup = false ) {
			const group = draft[ groupsKey ].find( item => item.id === groupId ); const source = draft[ kind ].filter( item => ! item.trashed && ids.includes( item.id ) ); ids = source.map( item => item.id );
			const noun = singular; const title = cloneGroup ? 'Duplicate ' + ( colors ? 'Palette' : 'Category' ) : 'Duplicate ' + ( source.length === 1 ? noun : plural );
			const content = '<div class="lieve-ds-scale-fields">'
				+ ( cloneGroup ? actionField( 'New ' + ( colors ? 'palette' : 'category' ) + ' name', 'groupName', group.name + ' copy', ' required maxlength="100"' ) : '' )
				+ '<div class="lieve-ds-scale-grid">'
				+ actionField( 'Find text', 'find', '', ' placeholder="e.g. space"' )
				+ actionField( 'Replace with', 'replace', '', ' placeholder="e.g. gap"' )
				+ actionField( 'Name prefix', 'prefix', '', ' placeholder="Optional · e.g. new-"' )
				+ actionField( 'Name suffix', 'suffix', '-copy', ' placeholder="Optional · e.g. -copy"' ) + '</div>'
				+ ( cloneGroup ? '' : '<div class="lieve-ds-field"><span>Destination</span><select name="group" id="' + root.id + '-duplicate-destination" aria-label="Destination" data-ds-custom-select data-ds-select-kind="' + ( colors ? 'palettes' : 'categories' ) + '">' + groupOptions( '*', true ) + '</select></div><label class="lieve-ds-duplicate-option"><span class="lieve-ds-duplicate-switch"><input type="checkbox" name="rename" role="switch" aria-label="Rename originals"><span aria-hidden="true"></span></span><span><strong>Rename originals</strong><small>Update existing names instead of creating copies. Previous CSS names keep working.</small></span></label>' )
				+ '</div><section class="lieve-ds-scale-preview" aria-label="Name changes preview"><header><span>' + icons.copy + 'Name preview</span><small data-ds-duplicate-count></small></header><div class="lieve-ds-scale-preview-list lieve-ds-duplicate-preview-list" data-ds-duplicate-preview></div><p data-ds-duplicate-note></p></section>'
				+ '<p class="lieve-ds-scale-note">Only the draft changes. Save ' + ( plural ) + ' to publish it on your website.</p>';
			const options = form => ( { find: String( form.get( 'find' ) || '' ), replace: String( form.get( 'replace' ) || '' ), prefix: String( form.get( 'prefix' ) || '' ), suffix: String( form.get( 'suffix' ) || '' ), groupId: form.get( 'group' ) === '*' || cloneGroup ? null : String( form.get( 'group' ) || '' ) } );
			function build( form ) {
				let next = model.clone( draft ); const opt = options( form );
				if ( cloneGroup ) { const name = String( form.get( 'groupName' ) ).trim(); const id = model.newId(); next[ groupsKey ].push( { id, name, ...( group.iconColor ? { iconColor: group.iconColor } : {} ) } ); opt.groupId = id; }
				if ( form.has( 'rename' ) ) {
					if ( cloneGroup ) { throw new Error( 'Duplicating a group cannot rename the originals.' ); }
					for ( const item of next[ kind ].filter( token => ids.includes( token.id ) ) ) {
						const name = opt.prefix + ( opt.find ? item.name.split( opt.find ).join( opt.replace ) : item.name ) + opt.suffix;
						if ( name !== item.name ) { item.aliases.push( item.name ); item.name = name; } if ( opt.groupId !== null ) { item[ groupKey ] = opt.groupId; }
					}
					const error = model.validate( next ); if ( error ) { throw new Error( error ); } return { data: next, ids };
				}
				return model.duplicate( next, kind, ids, opt );
			}
			action( title, content, 'Apply to Draft', form => { const result = build( form ); draft = result.data; selected = new Set( result.ids ); selectedId = result.ids[ 0 ] || null; selectedVariant = null; if ( cloneGroup || options( form ).groupId !== null ) { groupId = draft[ kind ].find( item => item.id === selectedId )?.[ groupKey ] || ( cloneGroup ? draft[ groupsKey ].at( -1 ).id : '' ); } revealVariable( selectedId ); }, ( form, element ) => {
				const target = element.querySelector( '[data-ds-duplicate-preview]' ); const count = element.querySelector( '[data-ds-duplicate-count]' ); const submit = element.querySelector( '[type="submit"]' ); const error = element.querySelector( '[data-ds-action-error]' );
				element.querySelector( '[data-ds-duplicate-note]' ).textContent = form.has( 'rename' ) ? 'Renaming keeps IDs, values and conditions. Previous CSS names remain available as aliases.' : ( classes ? 'Copies keep CSS declarations, responsive overrides, states and conditions.' : 'Copies keep their conditions and values. References inside the copied batch follow the new names.' );
				try {
					const result = build( form );
					target.innerHTML = source.map( ( item, index ) => '<div class="lieve-ds-duplicate-preview-row"><code>' + prefix + esc( item.name ) + '</code><span aria-hidden="true">→</span><code>' + prefix + esc( result.data[ kind ].find( token => token.id === result.ids[ index ] )?.name ) + '</code></div>' ).join( '' ) || '<p class="lieve-ds-help">This group is empty. Its name and organization will be copied without creating definitions.</p>';
					count.textContent = source.length + ( source.length === 1 ? ' definition' : ' definitions' ); error.textContent = ''; submit.disabled = false;
				}
				catch ( failure ) { target.innerHTML = '<p class="lieve-ds-help">Review the naming settings to see the changes.</p>'; count.textContent = 'Not ready'; error.textContent = failure.message; submit.disabled = true; }
			}, { type: 'duplicate', icon: icons.copy, description: 'Create independent copies or safely rename your definitions.' } );
		}
		function manageGroup( create = false ) {
			const group = draft[ groupsKey ].find( item => item.id === groupId ); const title = colors ? 'Palette' : 'Category';
			if ( ! create && ! group ) { return; }
			const content = actionField( title + ' name', 'name', create ? '' : group.name, ' required maxlength="100"' ) + groupColorField( create ? '' : group.iconColor || '' ) + ( create ? '' : '<div class="lieve-ds-action-buttons"><button type="button" data-ds-group-duplicate>Duplicate with its definitions</button><button type="button" data-ds-group-delete>Delete ' + title.toLowerCase() + '</button></div>' );
			action( ( create ? 'Create ' : 'Manage ' ) + title, content, create ? 'Create ' + title : 'Apply Changes', form => {
				const next = model.clone( draft ); const name = String( form.get( 'name' ) ).trim(); const id = create ? model.newId() : group.id;
				if ( create ) { next[ groupsKey ].push( { id, name } ); }
				const target = next[ groupsKey ].find( item => item.id === id ); target.name = name;
				{ const color = String( form.get( 'iconColor' ) || '' ).trim().toLowerCase(); if ( color ) { target.iconColor = color; } else { delete target.iconColor; } }
				// Organization must remain editable even when a new CSS definition is unfinished.
				// Full token validation still owns preview and Save Variables / Colors.
				const error = model.validateGroups( next ); if ( error ) { throw new Error( error ); }
				draft = next; if ( create ) { groupId = id; variablePage = 0; }
			}, null, { type: 'category' } );
			actionColour = bindGroupColor( actionContent.querySelector( 'form' ) );
			if ( ! create ) {
				actionContent.querySelector( '[data-ds-group-duplicate]' ).addEventListener( 'click', () => { closeAction(); duplication( draft[ kind ].filter( item => item[ groupKey ] === group.id ).map( item => item.id ), true ); } );
				actionContent.querySelector( '[data-ds-group-delete]' ).addEventListener( 'click', () => { closeAction(); const count = draft[ kind ].filter( item => item[ groupKey ] === group.id ).length; action( 'Delete ' + title, '<p>' + esc( group.name ) + ' contains ' + count + ' definitions.</p><label class="lieve-ds-field"><span>Definitions in this group</span><select id="' + root.id + '-group-disposition" name="disposition" aria-label="Definitions in this group" data-ds-custom-select data-ds-select-kind="actions"><option value="keep">Keep them in Uncategorized</option><option value="delete">Move definitions to Trash</option></select></label><p class="lieve-ds-help">Nothing is removed from the website until you save.</p>', 'Delete ' + title, form => { draft[ groupsKey ] = draft[ groupsKey ].filter( item => item.id !== group.id ); if ( form.get( 'disposition' ) === 'delete' ) { const removed = draft[ kind ].filter( item => item[ groupKey ] === group.id ).map( item => item.id ); draft[ kind ].forEach( item => { if ( item[ groupKey ] === group.id ) { item[ groupKey ] = ''; } } ); groupId = '*'; deleteItems( removed ); removed.forEach( id => selected.delete( id ) ); if ( removed.includes( selectedId ) ) { selectedId = selectedVariant = null; } } draft[ kind ].forEach( item => { if ( item[ groupKey ] === group.id ) { item[ groupKey ] = ''; } } ); groupId = '*'; } ); } );
			}
		}
		function variantPreview( build, parent ) {
			return ( values, form ) => {
				const preview = form.querySelector( '[data-ds-scale-preview]' ); const count = form.querySelector( '[data-ds-scale-count]' ); const submit = form.querySelector( '[type="submit"]' ); const error = form.querySelector( '[data-ds-action-error]' );
				try {
					const result = build( values );
					preview.innerHTML = result.created.map( variant => '<div class="lieve-ds-color-preview-row">' + swatch( model.variantValue( parent, variant, mode === 'dark' ) ) + '<code>--' + esc( parent.name + '-' + variant.suffix ) + '</code><small>' + esc( variant.type === 'custom' ? 'Linked harmony' : variant.type + ' · ' + variant.amount + '%' ) + '</small></div>' ).join( '' );
					count.textContent = result.created.length + ( result.created.length === 1 ? ' variant' : ' variants' ); submit.disabled = false; error.textContent = ''; paintSwatches();
				} catch ( failure ) { preview.innerHTML = '<p class="lieve-ds-help">Review the settings to preview your variants.</p>'; count.textContent = 'Not ready'; submit.disabled = true; error.textContent = failure.message; }
			};
		}
		function generateScale() {
			const color = current(); const build = form => model.generateVariants( draft, color.id, { type: String( form.get( 'type' ) ), amounts: String( form.get( 'amounts' ) ), prefix: String( form.get( 'prefix' ) ) } );
			const content = '<div class="lieve-ds-scale-fields"><div class="lieve-ds-scale-grid"><div class="lieve-ds-field"><span>Variant type</span><select id="' + root.id + '-color-scale-type" name="type" aria-label="Variant type" data-ds-custom-select data-ds-select-kind="types"><option value="tint">Tint · lighter</option><option value="shade">Shade · darker</option><option value="alpha">Transparency</option></select></div>' + actionField( 'Suffix prefix', 'prefix', 'tint', ' required maxlength="40" placeholder="e.g. tint, shade, alpha"' ) + '</div>' + actionField( 'Percentages', 'amounts', '10, 25, 50, 75, 90', ' required placeholder="e.g. 10, 25, 50, 75, 90"' ) + '<p class="lieve-ds-help">Separate percentages with commas. Up to 50 variants per parent color, including existing variants.</p></div><section class="lieve-ds-scale-preview" aria-label="Generated colors preview"><header><span>' + icons.color + 'Generated variants</span><small data-ds-scale-count></small></header><div class="lieve-ds-scale-preview-list" data-ds-scale-preview></div><p>Linked to <code>--' + esc( color.name ) + '</code> with color-mix(). Parent light and dark changes update the whole scale.</p></section><p class="lieve-ds-scale-note">Generate updates the draft. Save Colors to publish it on your website.</p>';
			action( 'Generate Color Scale', content, 'Generate Variants', form => { draft = build( form ).data; }, variantPreview( build, color ), { type: 'color-scale', icon: icons.scale, description: 'Preview linked tints, shades and transparency before adding them.' } );
		}
		function generateHarmony() {
			const color = current(); const build = form => model.generateVariants( draft, color.id, { harmony: String( form.get( 'harmony' ) ) } );
			const content = '<div class="lieve-ds-scale-fields"><div class="lieve-ds-field"><span>Harmony</span><select id="' + root.id + '-color-harmony" name="harmony" aria-label="Harmony" data-ds-custom-select data-ds-select-kind="harmonies"><option value="analogous">Analogous</option><option value="complementary">Complementary</option><option value="split">Split complementary</option><option value="triadic">Triadic</option><option value="tetradic">Tetradic</option></select></div><p class="lieve-ds-help">Relative HSL colors follow their parent, including its dark value. A browser with relative color support is required.</p></div><section class="lieve-ds-scale-preview" aria-label="Generated harmony preview"><header><span>' + icons.color + 'Generated variants</span><small data-ds-scale-count></small></header><div class="lieve-ds-scale-preview-list" data-ds-scale-preview></div><p>Linked to <code>--' + esc( color.name ) + '</code>. Choose a harmony to preview its colors.</p></section><p class="lieve-ds-scale-note">Generate updates the draft. Save Colors to publish it on your website.</p>';
			action( 'Generate Color Harmonies', content, 'Generate Harmonies', form => { draft = build( form ).data; }, variantPreview( build, color ), { type: 'color-scale', icon: icons.color, description: 'Create a coordinated set of colors linked to the parent.' } );
		}

		function generateVariableScale() {
			function build( form ) {
				const next = model.clone( draft ); const prefix = String( form.get( 'prefix' ) ).trim(); const value = String( form.get( 'value' ) ).trim(); const factors = String( form.get( 'factors' ) ).split( ',' ).map( text => text.trim() );
				if ( ! model.validName( prefix ) || ! model.safeValue( value ) || factors.length > 40 || factors.some( text => ! text || ! Number.isFinite( Number( text ) ) || Number( text ) < 0 || Number( text ) > 100 ) ) { throw new Error( 'Use a valid name, a safe CSS value and up to 40 multipliers between 0 and 100.' ); }
				const baseName = model.uniqueName( next, prefix + '-base' ); const template = { enabled: true, aliases: [], conditions: [], values: {}, categoryId: String( form.get( 'group' ) ), description: '' };
				next.variables.push( { ...model.clone( template ), id: model.newId(), name: baseName, value } );
				factors.forEach( ( factor, index ) => next.variables.push( { ...model.clone( template ), id: model.newId(), name: model.uniqueName( next, prefix + '-' + ( index + 1 ) ), value: 'calc(var(--' + baseName + ') * ' + Number( factor ) + ')' } ) );
				const error = model.validate( next ); if ( error ) { throw new Error( error ); }
				return { data: next, categoryId: template.categoryId, created: next.variables.slice( -factors.length - 1 ) };
			}
			const content = '<div class="lieve-ds-scale-fields"><div class="lieve-ds-scale-grid">' + actionField( 'CSS name prefix', 'prefix', '', ' required maxlength="50" placeholder="e.g. space, text, radius"' ) + '<div class="lieve-ds-field"><span>Category</span><select name="group" id="' + root.id + '-scale-category" aria-label="Category" data-ds-custom-select>' + groupOptions( groupId === '*' ? '' : groupId ) + '</select></div></div>' + actionField( 'Base CSS value', 'value', '', ' required placeholder="e.g. 16px, 1rem or clamp(1rem, 2vw, 2rem)"' ) + '<div>' + actionField( 'Multipliers', 'factors', '', ' required aria-describedby="' + root.id + '-scale-help" placeholder="e.g. 0.5, 1, 1.5, 2"' ) + '<p class="lieve-ds-help" id="' + root.id + '-scale-help">Separate values with commas. Up to 40 multipliers, from 0 to 100.</p></div></div><section class="lieve-ds-scale-preview" aria-label="Generated variables preview"><header><span>' + icons.variable + 'Generated variables</span><small data-ds-scale-count></small></header><div class="lieve-ds-scale-preview-list" data-ds-scale-preview></div><p>Linked with <code>calc()</code>. Change the base to update the whole scale.</p></section><p class="lieve-ds-scale-note">Generate adds variables to this draft. Your website stays unchanged until you save.</p>';
			action( 'Generate Variable Scale', content, 'Generate Variables', form => {
				const result = build( form ); draft = result.data; groupId = result.categoryId; selectedId = result.created[ 0 ].id; selectedVariant = null;
				revealVariable( selectedId );
			}, ( values, form ) => {
				const preview = form.querySelector( '[data-ds-scale-preview]' ); const count = form.querySelector( '[data-ds-scale-count]' ); const submit = form.querySelector( '[type="submit"]' ); const error = form.querySelector( '[data-ds-action-error]' );
				if ( [ 'prefix', 'value', 'factors' ].some( name => ! String( values.get( name ) || '' ).trim() ) ) {
					preview.innerHTML = '<p class="lieve-ds-help">Complete the scale settings to see the generated variables.</p>'; count.textContent = 'Not ready'; error.textContent = ''; submit.disabled = true; return;
				}
				try {
					const result = build( values ); preview.innerHTML = result.created.map( item => '<div><code>--' + esc( item.name ) + '</code><code>' + esc( item.value ) + '</code></div>' ).join( '' );
					count.textContent = result.created.length + ' variables'; error.textContent = ''; submit.disabled = false;
				} catch ( failure ) { preview.innerHTML = '<p class="lieve-ds-help">Complete the scale settings to see the generated variables.</p>'; count.textContent = 'Not ready'; error.textContent = failure.message; submit.disabled = true; }
			}, { type: 'variable-scale', icon: icons.scale, description: 'Create a linked set of reusable CSS values.' } );
		}
		function rename( token, property, name ) {
			name = name.replace( classes ? /^\./ : /^--/, '' ).trim(); const old = token[ property ]; if ( old === name ) { return; }
			const next = model.clone( draft ); const parent = next[ kind ].find( item => item.id === selectedId ); const target = selectedVariant ? parent.variants.find( item => item.id === selectedVariant ) : parent;
			if ( ! renameOrigins.has( target.id ) ) { renameOrigins.set( target.id, { name: old, aliases: [ ...target.aliases ] } ); }
			const origin = renameOrigins.get( target.id );
			const newFullName = property === 'suffix' ? parent.name + '-' + name : name;
			target.aliases = origin.aliases.filter( alias => alias !== newFullName );
			const oldNames = property === 'suffix' ? [ parent.name + '-' + origin.name, ...parent.aliases.map( alias => alias + '-' + origin.name ) ] : [ origin.name ];
			const rawValues = [ ...draft.variables.flatMap( item => [ item.value, ...Object.values( item.values ) ] ), ...draft.colors.flatMap( item => [ item.light, item.dark, ...item.variants.filter( variant => variant.type === 'custom' ).flatMap( variant => [ variant.light, variant.dark ] ) ] ) ];
			const savedNames = model.names( service.data() );
			for ( const oldFullName of oldNames ) {
				const referenced = rawValues.some( value => Array.from( value.matchAll( /var\(\s*--([a-zA-Z_][a-zA-Z0-9_-]*)/g ) ).some( match => match[1] === oldFullName ) );
				if ( origin.name !== name && model.validName( oldFullName ) && ( savedNames.has( oldFullName ) || referenced ) && ! target.aliases.includes( oldFullName ) ) { target.aliases.push( oldFullName ); }
			}
			target[ property ] = name; const error = validateRenameDraft( next ); if ( error ) { throw new Error( error ); } draft = next;
		}
		root.addEventListener( 'input', event => {
			const field = event.target; if ( field.matches( '[data-ds-search]' ) ) { variablePage = 0; variableList?.clearAnchor(); renderList(); reconcileInspector(); return; }
			if ( field.hasAttribute( 'data-ds-contrast-background' ) ) { contrastBackgrounds[ field.dataset.dsContrastBackground ] = field.value; refreshColorAnalysis(); analysisColours.forEach( picker => picker.refresh() ); return; }
			if ( ! editable || saving ) { return; }
			const token = currentVariant() || current(); if ( ! token ) { return; }
			const historyGroup = token.id + ':' + ( field.dataset.dsField || field.dataset.dsOverride || field.dataset.dsClassState );
			if ( field.hasAttribute( 'data-ds-class-state' ) ) { const value = field.value.trim(); const bp = field.dataset.dsStateBreakpoint; token.states ||= {}; token.responsiveStates ||= {}; const values = bp ? ( token.responsiveStates[ bp ] ||= {} ) : token.states; if ( value ) { values[ field.dataset.dsClassState ] = value; } else { delete values[ field.dataset.dsClassState ]; if ( bp && ! Object.keys( values ).length ) { delete token.responsiveStates[ bp ]; } } sync( false, historyGroup + ':' + ( bp || 'base' ) ); return; }
			if ( [ 'name', 'suffix' ].includes( field.dataset.dsField ) ) { try { rename( token, field.dataset.dsField, field.value ); field.removeAttribute( 'aria-invalid' ); sync( false, historyGroup ); } catch ( error ) { token[ field.dataset.dsField ] = field.value.replace( classes ? /^\./ : /^--/, '' ).trim(); field.setAttribute( 'aria-invalid', 'true' ); sync( false, historyGroup ); messageStatus( error.message, true ); } }
			else if ( field.hasAttribute( 'data-ds-override' ) ) { const value = field.value.trim(); if ( value ) { token.values[ field.dataset.dsOverride ] = value; } else { delete token.values[ field.dataset.dsOverride ]; } sync( false, historyGroup ); }
			else if ( field.hasAttribute( 'data-ds-field' ) && ! [ 'name', 'suffix', 'type', groupKey ].includes( field.dataset.dsField ) ) { token[ field.dataset.dsField ] = field.dataset.dsField === 'amount' ? Number( field.value ) : field.value; sync( false, historyGroup ); }
		} );
		root.addEventListener( 'change', event => {
			history?.breakGroup();
			const field = event.target; if ( ! editable || saving ) { return; }
			if ( ( field.hasAttribute( 'data-ds-select' ) || field.hasAttribute( 'data-ds-select-visible' ) ) ) { variableList?.changeSelection( field ); return; }
			if ( field.hasAttribute( 'data-ds-select' ) ) { if ( field.checked ) { selected.add( field.dataset.dsSelect ); } else { selected.delete( field.dataset.dsSelect ); } renderList(); return; }
			if ( field.hasAttribute( 'data-ds-dark-policy' ) ) { draft.darkMode = field.value; sync(); return; }
			const token = currentVariant() || current(); const property = field.dataset.dsField; if ( inTrash() || ! token || ! property ) { return; }
			try {
				// Input already updated the draft. Do not replace the pending click target
				// on blur: change fires between mousedown and mouseup on the next control.
				if ( [ 'name', 'suffix' ].includes( property ) ) { rename( token, property, field.value ); renameOrigins.delete( token.id ); refreshDetailValues(); }
				else if ( property === 'type' ) { token.type = field.value; if ( token.type === 'custom' ) { token.light = token.light || current().light; token.dark ||= ''; delete token.amount; } else { token.amount ??= 20; delete token.light; delete token.dark; } sync( true ); }
				else if ( property === groupKey ) { token[ property ] = field.value; sync(); }
			} catch ( error ) { field.value = token[ property ]; field.setAttribute( 'aria-invalid', 'true' ); messageStatus( error.message, true ); }
		} );
		root.addEventListener( 'click', async event => {
			const button = event.target.closest( 'button' ); if ( ! button || actionLayer.contains( button ) ) { return; }
			if ( categoryEditor?.isEditing() ) { return; }
			if ( button.hasAttribute( 'data-ds-undo' ) || button.hasAttribute( 'data-ds-redo' ) ) { travelHistory( button.hasAttribute( 'data-ds-redo' ) ); return; }
			if ( button.hasAttribute( 'data-ds-check-dependencies' ) ) { reviewDependencies(); return; }
			if ( button.hasAttribute( 'data-ds-page-prev' ) || button.hasAttribute( 'data-ds-page-next' ) ) { if ( saving || variableList?.isDragging() ) { return; } variablePage += button.hasAttribute( 'data-ds-page-next' ) ? 1 : -1; variablePage = Math.max( 0, variablePage ); variableList?.clearAnchor(); renderList(); reconcileInspector(); list.scrollTop = 0; return; }
			if ( button.hasAttribute( 'data-ds-group' ) ) { groupId = button.dataset.dsGroup; variablePage = 0; selected.clear(); variableList?.clearAnchor(); updateToolbar(); renderGroups(); renderList(); reconcileInspector(); return; }
			if ( button.hasAttribute( 'data-ds-item' ) ) { selectItem( button.dataset.dsItem ); return; }
			if ( button.hasAttribute( 'data-ds-variant' ) ) { selectItem( selectedId, button.dataset.dsVariant ); return; }
			if ( button.hasAttribute( 'data-ds-back-parent' ) ) { selectItem( selectedId ); return; }
			if ( button.hasAttribute( 'data-ds-tab' ) ) { switchDetailTab( button.dataset.dsTab ); return; }
			if ( button.hasAttribute( 'data-ds-mode' ) ) { mode = button.dataset.dsMode; root.querySelectorAll( '[data-ds-mode]' ).forEach( item => item.setAttribute( 'aria-pressed', String( item.dataset.dsMode === mode ) ) ); service.mode( mode ); renderList(); renderDetail(); return; }
			if ( button.hasAttribute( 'data-ds-copy' ) ) { try { await window.navigator.clipboard.writeText( button.dataset.dsCopy ); messageStatus( 'CSS reference copied.' ); } catch ( error ) { messageStatus( 'CSS reference: ' + button.dataset.dsCopy ); } return; }
			if ( button.hasAttribute( 'data-ds-export' ) ) { const blob = new Blob( [ JSON.stringify( draft, null, 2 ) ], { type: 'application/json' } ); const url = URL.createObjectURL( blob ); const anchor = document.createElement( 'a' ); anchor.href = url; anchor.download = classes ? 'lieve-classes.json' : 'lieve-design-system.json'; anchor.click(); window.setTimeout( () => URL.revokeObjectURL( url ), 1000 ); messageStatus( 'Complete design system exported, including this draft.' ); return; }
			if ( button.hasAttribute( 'data-ds-cancel' ) ) { if ( saving ) { return; } discard(); if ( dialog ) { dialog.close(); } else { q( '[data-ds-search]' )?.focus(); } return; }
			if ( ! editable || saving ) { return; }
			if ( button.hasAttribute( 'data-ds-restore' ) || button.hasAttribute( 'data-ds-restore-one' ) ) { restoreItems( button.hasAttribute( 'data-ds-restore-one' ) ? [ listingSelectedId() ] : [ ...selected ] ); return; }
			if ( button.hasAttribute( 'data-ds-purge-one' ) || button.hasAttribute( 'data-ds-empty-trash' ) ) { purgeItems( button.hasAttribute( 'data-ds-purge-one' ) ? [ listingSelectedId() ] : model.trashEntries( draft, kind ).map( item => item.id ), button.hasAttribute( 'data-ds-empty-trash' ) ); return; }
			if ( button.hasAttribute( 'data-ds-group-add' ) ) { manageGroup( true ); }
			else if ( button.hasAttribute( 'data-ds-group-edit' ) ) { manageGroup(); }
			else if ( button.hasAttribute( 'data-ds-add' ) ) {
				if ( inTrash() || draft[ kind ].length >= ( colors ? 500 : 1000 ) ) { return; }
				const item = { id: model.newId(), name: colors ? model.uniqueName( draft, 'color' ) : '', [ groupKey ]: groupId === '*' ? '' : groupId, enabled: true, description: '', conditions: [], aliases: [], ...( colors ? { light: '#16c6c0', dark: '', variants: [] } : { value: '', values: {}, ...( classes ? { states: {} } : {} ) } ) };
				draft[ kind ].push( item ); selectedId = item.id; selectedVariant = null; detailTab = 'details'; revealVariable( selectedId ); sync( true ); q( '[data-ds-field="name"]' )?.focus();
			} else if ( button.hasAttribute( 'data-ds-enabled' ) ) { current().enabled = ! current().enabled; sync(); }
			else if ( button.hasAttribute( 'data-ds-select-all' ) ) { visibleItems().forEach( item => selected.add( item.id ) ); if ( variableList ) { variableList.refreshSelection(); } else { renderList(); } }
			else if ( button.hasAttribute( 'data-ds-clear-selection' ) ) { selected.clear(); variableList?.clearAnchor(); if ( variableList ) { variableList.refreshSelection(); } else { renderList(); } }
			else if ( button.hasAttribute( 'data-ds-duplicate' ) || button.hasAttribute( 'data-ds-copy-one' ) ) { duplication( button.hasAttribute( 'data-ds-copy-one' ) ? [ selectedId ] : [ ...selected ] ); }
			else if ( button.hasAttribute( 'data-ds-delete' ) ) { deleteItems( [ ...selected ] ); }
			else if ( button.hasAttribute( 'data-ds-delete-one' ) ) { deleteItems( [ selectedVariant || selectedId ] ); }
			else if ( button.hasAttribute( 'data-ds-remove-alias' ) ) { const alias = button.dataset.dsRemoveAlias; action( 'Remove Previous Name', '<p>Existing references to <code>' + prefix + esc( alias ) + '</code> will stop working after saving. Remove its compatibility alias?</p>', 'Remove Alias', () => { const token = currentVariant() || current(); token.aliases = token.aliases.filter( name => name !== alias ); } ); }
			else if ( button.hasAttribute( 'data-ds-move' ) ) { action( 'Move Selected Definitions', '<label class="lieve-ds-field"><span>Destination</span><select id="' + root.id + '-move-group" name="group" aria-label="Destination" data-ds-custom-select data-ds-select-kind="' + ( colors ? 'palettes' : 'categories' ) + '">' + groupOptions( groupId === '*' ? '' : groupId ) + '</select></label>', 'Move', form => { draft[ kind ].forEach( item => { if ( selected.has( item.id ) ) { item[ groupKey ] = String( form.get( 'group' ) ); } } ); } ); }
			else if ( button.hasAttribute( 'data-ds-add-variant' ) ) { const parent = current(); const used = model.names( draft ); let suffix = 'variant'; for ( let index = 2; used.has( parent.name + '-' + suffix ); index++ ) { suffix = 'variant-' + index; } const variant = { id: model.newId(), suffix, type: 'tint', amount: 20, conditions: [], aliases: [] }; parent.variants.push( variant ); selectedVariant = variant.id; sync( true ); }
			else if ( button.hasAttribute( 'data-ds-generate' ) ) { generateScale(); }
			else if ( button.hasAttribute( 'data-ds-harmony' ) ) { generateHarmony(); }
			else if ( button.hasAttribute( 'data-ds-variable-scale' ) ) { generateVariableScale(); }
			else if ( button.hasAttribute( 'data-ds-import' ) ) { q( '[data-ds-file]' ).click(); }
			else if ( button.hasAttribute( 'data-ds-save' ) ) {
				if ( ! dirty() ) { return; }
				try { await api.saveDraft(); messageStatus( 'Design system saved.' ); if ( dialog ) { dialog.close(); } }
				catch ( error ) { messageStatus( error.message, true ); }
			}
		} );
		q( '[data-ds-file]' ).addEventListener( 'change', async event => {
			const file = event.target.files?.[ 0 ]; event.target.value = ''; if ( ! file || ! editable || saving ) { return; }
			const ticket = ++importGeneration; const snapshot = JSON.stringify( draft );
			try {
				if ( file.size > 1500000 ) { throw new Error( 'Import files are limited to 1.5 MB.' ); }
				const text = await file.text();
				if ( ticket !== importGeneration || ! opened ) { return; }
				if ( saving || categoryEditor?.isEditing() || snapshot !== JSON.stringify( draft ) ) { messageStatus( 'The draft changed while reading the import. Select the file again.', true ); return; }
				const raw = JSON.parse( text ); const error = model.validate( raw ); if ( error ) { throw new Error( error ); }
				const imported = model.normalize( raw );
				action( 'Import Design System', '<p>Import ' + ( classes ? imported.classes.length + ' classes and ' + imported.categories.length + ' categories' : imported.variables.length + ' variables, ' + imported.colors.length + ' colors, ' + imported.categories.length + ' categories and ' + imported.palettes.length + ' palettes' ) + '?</p><label class="lieve-ds-field"><span>Import behavior</span><select id="' + root.id + '-import-behavior" name="behavior" aria-label="Import behavior" data-ds-custom-select data-ds-select-kind="actions"><option value="merge">Merge · keep existing definitions and Trash</option><option value="replace">Replace the entire draft</option></select></label><p class="lieve-ds-help">Merge creates independent IDs, resolves CSS-name conflicts and updates references within the imported definitions. Replace removes the entire current draft, including Trash. Export a backup first. ' + ( classes ? 'The Classes library is imported independently; ' : 'Both managers are imported together; ' ) + 'the website is unchanged until saving.</p>', 'Import to Draft', form => { draft = form.get( 'behavior' ) === 'replace' ? imported : model.merge( draft, imported ); groupId = '*'; selectedId = selectedVariant = null; selected.clear(); variablePage = 0; q( '[data-ds-search]' ).value = ''; window.LieveSearchControls?.refresh( q( '[data-ds-search]' ) ); } );
			} catch ( error ) { if ( ticket === importGeneration && opened ) { messageStatus( error.message, true ); } }
		} );
		actionLayer.addEventListener( 'click', event => { if ( event.target === actionLayer ) { closeAction(); } } );
		function saveShortcut( event ) {
			const tab = event.target?.closest?.( '[data-ds-tab]' );
			if ( tab && ! event.defaultPrevented && ! event.altKey && ! event.metaKey && ! event.ctrlKey && [ 'ArrowLeft', 'ArrowRight', 'Home', 'End' ].includes( event.key ) ) {
				event.preventDefault(); event.stopPropagation(); switchDetailTab( event.key === 'Home' ? 'details' : event.key === 'End' ? 'conditions' : tab.dataset.dsTab === 'details' ? 'conditions' : 'details' ); return;
			}
			const key = event.key.toLowerCase();
			if ( history && ! event.defaultPrevented && ! event.altKey && ( event.metaKey || event.ctrlKey ) && ( key === 'z' || ( key === 'y' && event.ctrlKey && ! event.metaKey ) ) ) {
				// Native text-field Undo remains native. Page-builder Undo must never receive this shortcut.
				if ( event.target?.closest?.( 'input,textarea,select,[contenteditable="true"]' ) ) { return; }
				event.preventDefault(); event.stopPropagation(); if ( ! event.repeat ) { travelHistory( key === 'y' || event.shiftKey ); } return;
			}
			if ( event.defaultPrevented || event.altKey || ! ( event.metaKey || event.ctrlKey ) || event.key.toLowerCase() !== 's' ) { return; }
			event.preventDefault(); event.stopPropagation();
			if ( ! event.repeat ) { api.submit(); }
		}
		root.addEventListener( 'keydown', saveShortcut );
		// The backend shortcut also works when focus is on WordPress navigation.
		if ( ! modal ) {
			document.addEventListener( 'keydown', saveShortcut );
			window.addEventListener( 'beforeunload', event => { if ( dirty() || saving || categoryEditor?.isDirty?.() ) { event.preventDefault(); event.returnValue = ''; } } );
		}
		actionLayer.addEventListener( 'keydown', event => {
			if ( event.key === 'Escape' ) { event.preventDefault(); event.stopPropagation(); closeAction(); }
			if ( event.key === 'Tab' ) { event.stopPropagation(); const items = Array.from( actionContent.querySelectorAll( 'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)' ) ).filter( item => item.getClientRects().length ); if ( event.shiftKey && document.activeElement === items[ 0 ] ) { event.preventDefault(); items.at( -1 )?.focus(); } else if ( ! event.shiftKey && document.activeElement === items.at( -1 ) ) { event.preventDefault(); items[ 0 ]?.focus(); } }
		} );
		function discard() { if ( saving ) { return; } ++importGeneration; variableList?.cancel(); variableList?.clearAnchor(); categoryEditor?.cancel( true ); closeAction( true ); renameOrigins.clear(); draft = embeddedCheckpoint ? model.clone( embeddedCheckpoint.data ) : service.data(); if ( embeddedCheckpoint ) { history = embeddedCheckpoint.history; } else { history?.reset( draft ); } variablePage = 0; if ( ! modal && groupId !== '*' && groupId !== '__trash' && groupId && ! draft[ groupsKey ].some( item => item.id === groupId ) ) { groupId = '*'; } selected.clear(); selectedId = selectedVariant = null; mode = 'light'; root.querySelectorAll( '[data-ds-mode]' ).forEach( item => item.setAttribute( 'aria-pressed', String( item.dataset.dsMode === mode ) ) ); if ( embedded && dirty() ) { service.preview( draft, api ); } else { service.discard( api ); } updateToolbar(); renderGroups(); renderList(); renderDetail(); messageStatus( 'Draft discarded. Website definitions unchanged.' ); }
		if ( modal ) {
			modal.addEventListener( 'lieve:conditions-close', () => { opened = false; ++openGeneration; discard(); embeddedCheckpoint = null; openButton?.setAttribute( 'aria-expanded', 'false' ); } );
			openButton?.setAttribute( 'aria-expanded', 'false' ); openButton?.addEventListener( 'click', () => { void api.open(); } );
		}
		api.open = async ( trigger = openButton, itemId = null ) => {
			if ( saving || opened ) { return; }
			if ( embedded ) { embeddedCheckpoint = { data: model.clone( draft ), history }; history = model.createHistory( draft ); } else { discard(); }
			opened = true; const ticket = ++openGeneration;
			if ( itemId && draft[ kind ].some( item => item.id === itemId ) ) { selectedId = itemId; selectedVariant = null; if ( current().trashed ) { groupId = '__trash'; } revealVariable( itemId ); }
			if ( colors ) { service.mode( mode ); } openButton?.setAttribute( 'aria-expanded', 'true' ); dialog?.open( trigger ); sync( true );
			if ( dirty() ) { return; }
			const checking = 'Checking saved definitions… Your draft stays editable.'; messageStatus( checking );
			const checked = await api.refresh();
			if ( opened && ticket === openGeneration && status.textContent === checking ) { messageStatus( checked === false ? 'Saved definitions could not be checked. Your draft is retained. Close and reopen to check again.' : 'Site-wide library · Save publishes these definitions across the website.', checked === false ); }
		};
		api.isOpen = () => opened; api.isDirty = dirty; api.discard = discard;
		api.refresh = async () => {
			if ( dirty() || categoryEditor?.isEditing() || variableList?.isDragging() ) { return; }
			const snapshot = JSON.stringify( draft ), ticket = openGeneration, wasOpen = opened;
			const intact = () => ticket === openGeneration && opened === wasOpen && ! saving && ! categoryEditor?.isEditing() && ! variableList?.isDragging() && actionLayer.hidden && ! actionClosing && JSON.stringify( draft ) === snapshot;
			const checked = await service.refresh( intact, opened ? api : null );
			if ( service.storageError?.() ) { showStorageError( root, service.storageError() ); return false; }
			const next = service.data();
			// A focus refresh must neither repaint identical content nor erase an early edit.
			if ( ! intact() || JSON.stringify( next ) === snapshot ) { return checked; }
			draft = next; history?.reset( draft );
			if ( embeddedCheckpoint ) { embeddedCheckpoint.data = model.clone( draft ); embeddedCheckpoint.history?.reset( draft ); }
			sync( true ); return checked;
		};
		api.submit = () => { if ( variableList?.isDragging() ) { messageStatus( 'Finish reordering before saving the design system.' ); return; } if ( categoryEditor?.isEditing() ) { categoryEditor.warn( 'Apply or cancel your group changes before saving the design system.' ); return; } if ( ! actionLayer.hidden ) { actionContent.querySelector( '[data-ds-action-error]' ).textContent = 'Finish or cancel this action before saving the design system.'; return; } if ( editable && ! saving && ! q( '[data-ds-save]' ).disabled ) { q( '[data-ds-save]' ).click(); } };
		api.saveDraft = async () => {
			if ( service.storageError?.() ) { throw new Error( service.storageError().message ); }
			if ( saving ) { throw new Error( plural + ' are already being saved. Wait for the save to finish.' ); }
			if ( ! dirty() ) { return; } if ( ! editable ) { throw new Error( 'Only administrators can save global definitions.' ); }
			const error = model.validate( draft ); if ( error ) { throw new Error( error ); } saving = true; updateToolbar(); messageStatus( 'Saving design system…' );
			try { draft = await service.save( model.clone( draft ) ); history.reset( draft ); if ( embeddedCheckpoint ) { embeddedCheckpoint = { data: model.clone( draft ), history }; } }
			finally { saving = false; updateToolbar(); q( '[data-ds-group-add]' ).disabled = ! editable || draft[ groupsKey ].length >= 100; categoryEditor?.refresh(); if ( service.storageError?.() ) { showStorageError( root, service.storageError() ); } }
		};
		api.data = () => model.clone( draft ); api.isSaving = () => saving;
		api.canUndo = () => history.canUndo(); api.canRedo = () => history.canRedo(); api.undo = () => travelHistory(); api.redo = () => travelHistory( true ); api.breakGroup = () => history.breakGroup();
		api.edit = ( change, group = '' ) => { if ( service.storageError?.() || ! embedded || ! editable || saving || opened ) { return false; } const next = model.clone( draft ); change( next ); const error = model.validate( next ); if ( error ) { throw new Error( error ); } if ( JSON.stringify( next ) === JSON.stringify( draft ) ) { return false; } draft = next; history.record( draft, group ); if ( dirty() ) { service.preview( draft, api ); } else { service.discard( api ); } return true; };
		if ( hydrateInitialView() ) { updateToolbar(); paintSwatches(); }
		else { renderGroups(); renderList(); renderDetail(); updateToolbar(); }
		if ( colors ) { policySelect = createActionSelect( q( '[data-ds-dark-policy]' ), root, root ); }
		{ categoryEditor = createCategoryEditor( { root, kind, read: () => draft, canBegin: () => editable && ! saving && actionLayer.hidden, changed: updateToolbar, cancel: () => { renderGroups(); updateToolbar(); }, apply: next => { draft = next; if ( groupId !== '*' && groupId !== '__trash' && groupId && ! draft[ groupsKey ].some( item => item.id === groupId ) ) { groupId = ''; } sync( true ); messageStatus( ( colors ? 'Palette' : 'Category' ) + ' changes applied to the draft. Save ' + ( plural ) + ' to update the website.' ); } } ); }
		{
			variableList = window.LieveVariableList.create( { root, list, rowAttribute: colors ? 'data-ds-color-row' : 'data-ds-variable-row', visible: visibleItems, selected: () => selected,
				canSelect: () => editable && ! saving,
				canReorder: () => opened && ! inTrash() && editable && ! saving && actionLayer.hidden && ! categoryEditor?.isEditing(),
				commit( order ) {
					draft = model.reorderTokens( draft, order, kind ); updateToolbar();
					if ( modal && opened && ! model.validate( draft ) ) { service.preview( draft, api ); }
					messageStatus( ( singular ) + ' order updated in the draft. Save ' + ( plural ) + ' to publish it.' );
				},
			} ); variableList.refresh();
		}
		if ( ! editable ) { root.querySelectorAll( '[data-ds-import],[data-ds-add],[data-ds-variable-scale]' ).forEach( button => { button.disabled = true; } ); messageStatus( 'Only administrators can change global definitions. You can browse and copy CSS references.' ); }
		return api;
	}

	function editorTokenChoices( data, colorsOnly = false ) {
		const variables = new Map( data.variables.map( item => [ item.id, item ] ) );
		const colors = new Map(); data.colors.forEach( color => { colors.set( color.id, color ); color.variants.forEach( variant => colors.set( variant.id, color ) ); } );
		return model.tokens( data ).filter( token => token.enabled && ( ! colorsOnly || colors.has( token.id ) ) ).map( token => {
			const color = colors.get( token.id ); const item = color || variables.get( token.id ); const groups = color ? data.palettes : data.categories;
			const groupId = item?.[ color ? 'paletteId' : 'categoryId' ] || ''; const index = groups.findIndex( group => group.id === groupId ); const group = groups[ index ];
			const conditions = color && color.id !== token.id ? [ ...( color.conditions || [] ), ...( token.conditions || [] ) ] : token.conditions || [];
			return { ...token, kind: color ? 'colors' : 'variables', groupId, groupName: group?.name || 'Uncategorized', groupOrder: index < 0 ? groups.length : index, groupColor: group?.iconColor || '', conditions };
		} );
	}

	function createWorkspace( { config, onChange, onError } ) {
		if ( ! config ) { return null; }
		const service = createService( config, onChange, onError ); const managers = {};
		window.matchMedia?.( '(prefers-color-scheme: dark)' ).addEventListener?.( 'change', () => onChange?.() );
		for ( const kind of [ 'variables', 'colors' ] ) { const modal = document.getElementById( 'lieve-' + kind + '-modal' ); if ( modal ) { managers[ kind ] = createManager( { root: modal.querySelector( '[data-design-manager]' ), service, modal, openButton: document.getElementById( 'lieve-' + kind + '-open' ) } ); } }
		return { storageError: service.storageError, variables: service.variables, css: service.css, refresh: service.refresh, breakpoints: service.breakpoints, open: kind => managers[ kind ]?.open(), isOpen: () => Object.values( managers ).some( manager => manager.isOpen() ), submit: () => Object.values( managers ).find( manager => manager.isOpen() )?.submit(), tokens: ( colorsOnly = false ) => editorTokenChoices( service.current(), colorsOnly ) };
	}
	window.LieveDesignSystem = { createService, createManager, createWorkspace, createSelect: createActionSelect };
	if ( window.LieveDesignConfig ) { document.querySelectorAll( '.lieve-design-page [data-design-manager]' ).forEach( root => { const service = createService( root.dataset.designManager === 'classes' ? { ...window.LieveClassesConfig, model: window.LieveClassModel } : window.LieveDesignConfig ); const manager = createManager( { root, service } ); window.addEventListener( 'focus', () => { void manager.refresh(); } ); } ); }
}() );
