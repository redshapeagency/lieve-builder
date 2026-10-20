/* Expanded editing shares the page draft/history. PHP follows the widget's
 * explicit preview toggle; editing/search never changes execution permissions. */
( function() {
	'use strict';
	const modes = { 'HTML/PHP': 'application/x-httpd-php', CSS: 'css', JavaScript: 'javascript' };
	/** Enhance the existing fields, keeping their input events as the draft boundary. */
	function mount( { root, canEdit = () => true, restore = {} } ) {
		if ( ! window.wp?.CodeMirror?.fromTextArea ) { return null; }
		const entries = new Map(); let disposed = false, frame;
		const observer = window.ResizeObserver ? new window.ResizeObserver( () => { window.cancelAnimationFrame( frame ); frame = window.requestAnimationFrame( refresh ); } ) : null;
		function refresh() { if ( disposed ) { return; } entries.forEach( entry => { entry.sync(); if ( entry.wrapper.offsetWidth ) { entry.editor.refresh(); } } ); }
		root.querySelectorAll( '.lieve-custom-code-block textarea[data-prop]' ).forEach( field => {
			const property = field.dataset.prop, language = { content: 'HTML/PHP', customCss: 'CSS', customJs: 'JavaScript' }[property];
			if ( ! language ) { return; }
			let syncing = false, composing = false;
			const editable = () => ! disposed && ! field.readOnly && ! field.disabled && canEdit();
			const editor = window.wp.CodeMirror.fromTextArea( field, { mode: modes[language], lineNumbers: true, lineWrapping: false, tabSize: 2, indentUnit: 2, matchBrackets: true, viewportMargin: 10, readOnly: ! editable(), placeholder: field.getAttribute( 'placeholder' ) || '' } );
			const wrapper = editor.getWrapperElement(), input = editor.getInputField(), label = root.querySelector( 'label[for="' + field.id + '"]' );
			wrapper.classList.add( 'lieve-code-inline' );
			input.id = field.id + '-code'; input.setAttribute( 'aria-label', language + ' code' ); input.setAttribute( 'spellcheck', 'false' ); input.setAttribute( 'autocapitalize', 'off' );
			if ( label ) { label.setAttribute( 'for', input.id ); }
			function publish( force = false ) {
				if ( syncing || composing && ! force || ! editable() ) { return; }
				if ( field.value !== editor.getValue() ) { editor.save(); field.dispatchEvent( new Event( 'input', { bubbles: true } ) ); }
			}
			function sync() {
				const readOnly = ! editable(); if ( editor.getOption( 'readOnly' ) !== readOnly ) { editor.setOption( 'readOnly', readOnly ); }
				if ( composing ) { return; }
				if ( editor.getValue() === field.value ) { return; }
				const selection = editor.listSelections(), position = editor.getScrollInfo();
				syncing = true;
				try { editor.setValue( field.value ); editor.setSelections( selection ); editor.scrollTo( position.left, position.top ); } finally { syncing = false; }
			}
			const change = () => publish(), blur = () => { publish( true ); field.dispatchEvent( new Event( 'blur' ) ); };
			const compositionStart = () => { composing = true; }, compositionEnd = () => { composing = false; publish(); };
			editor.on( 'change', change ); editor.on( 'blur', blur ); field.addEventListener( 'input', sync );
			input.addEventListener( 'compositionstart', compositionStart ); input.addEventListener( 'compositionend', compositionEnd );
			const entry = { field, editor, wrapper, sync, flush: () => publish( true ), focus: () => input.focus( { preventScroll: true } ),
				selection: () => ( { start: editor.indexFromPos( editor.getCursor( 'from' ) ), end: editor.indexFromPos( editor.getCursor( 'to' ) ) } ),
				insert( text, selection = this.selection() ) { if ( editable() ) { editor.replaceRange( text, editor.posFromIndex( selection.start ), editor.posFromIndex( selection.end ), '+input' ); } },
				destroy() { editor.off( 'change', change ); editor.off( 'blur', blur ); field.removeEventListener( 'input', sync ); input.removeEventListener( 'compositionstart', compositionStart ); input.removeEventListener( 'compositionend', compositionEnd ); if ( label ) { label.setAttribute( 'for', field.id ); } editor.toTextArea(); },
			};
			entries.set( property, entry ); observer?.observe( wrapper );
			const previous = restore[property];
			if ( previous ) { if ( previous.selection ) { editor.setSelections( previous.selection ); } if ( previous.focused ) { entry.focus(); } if ( previous.scroll ) { editor.scrollTo( previous.scroll.left, previous.scroll.top ); } }
		} );
		refresh();
		return { get: property => entries.get( property ), sync: property => { if ( property ) { entries.get( property )?.sync(); } else { entries.forEach( entry => entry.sync() ); } }, refresh,
			flush: () => entries.forEach( entry => entry.flush() ),
			capture: () => Object.fromEntries( Array.from( entries, ( [ property, entry ] ) => [ property, { selection: entry.editor.listSelections(), scroll: entry.editor.getScrollInfo(), focused: entry.editor.hasFocus() } ] ) ),
			destroy() { disposed = true; observer?.disconnect(); if ( frame !== undefined ) { window.cancelAnimationFrame( frame ); } entries.forEach( entry => entry.destroy() ); entries.clear(); },
		};
	}
	const searchExpression = ( query, sensitive ) => new RegExp( query.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' ), sensitive ? 'g' : 'gi' );
	function matches( text, query, sensitive = false ) {
		if ( ! query ) { return []; }
		const expression = searchExpression( query, sensitive );
		const found = []; let result;
		while ( found.length < 10000 && ( result = expression.exec( text ) ) ) { found.push( { start: result.index, end: result.index + result[0].length } ); }
		return found;
	}
	window.LieveCodeEditor = { create( { app } ) {
		const root = document.createElement( 'div' );
		root.className = 'lieve-template-modal lieve-modal-skin lieve-code-editor-modal'; root.hidden = true;
		root.innerHTML = '<div class="lieve-template-backdrop" data-close-conditions></div><section class="lieve-template-dialog lieve-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="lieve-code-editor-title" tabindex="-1"><header class="lieve-template-header"><div><h2 id="lieve-code-editor-title">Code editor</h2><p>Changes update your page draft live. PHP follows the widget preview setting.</p></div><button type="button" class="lieve-template-close" data-close-conditions aria-label="Close code editor"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><div class="lieve-code-editor-toolbar" role="toolbar" aria-label="Code editing tools"><button type="button" class="lieve-conditions-cancel" data-code-clear>Clear</button><button type="button" class="lieve-conditions-cancel" data-code-dynamic aria-haspopup="dialog">Dynamic data</button><span class="lieve-code-editor-toolbar-space"></span><button type="button" class="lieve-conditions-cancel" data-code-search aria-expanded="false" aria-controls="lieve-code-search">Search</button><button type="button" class="lieve-conditions-cancel" data-code-replace aria-expanded="false" aria-controls="lieve-code-search">Find &amp; replace</button></div><div class="lieve-code-search" id="lieve-code-search" hidden><div class="lieve-code-search-row"><label><span>Find</span><input type="search" data-code-find autocomplete="off"></label><label class="lieve-code-match-case"><input type="checkbox" data-code-case>Match case</label><button type="button" class="lieve-conditions-cancel" data-code-prev aria-label="Previous match">Previous</button><button type="button" class="lieve-conditions-cancel" data-code-next aria-label="Next match">Next</button><button type="button" class="lieve-conditions-cancel" data-code-search-close aria-label="Close search">Close</button></div><div class="lieve-code-search-row" data-code-replace-row hidden><label><span>Replace with</span><input type="text" data-code-replacement autocomplete="off"></label><button type="button" class="lieve-conditions-cancel" data-code-replace-one>Replace</button><button type="button" class="lieve-conditions-cancel" data-code-replace-all>Replace all</button></div><p data-code-search-status role="status" aria-live="polite"></p></div><div class="lieve-code-editor-body"><label for="lieve-code-editor-input">Code</label><textarea id="lieve-code-editor-input" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-describedby="lieve-code-editor-help"></textarea></div><footer class="lieve-template-create"><span id="lieve-code-editor-help">Close keeps your draft. Use Save or ⌘S / Ctrl+S to save the page.</span></footer></section>';
		app.appendChild( root );
		const dialog = root.querySelector( '[role="dialog"]' ), title = root.querySelector( 'h2' ), label = root.querySelector( '[for="lieve-code-editor-input"]' ) || root.querySelector( 'label' ), field = root.querySelector( 'textarea' );
		const q = selector => root.querySelector( selector );
		const icons = { clear: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6m4-6v6"/>', dynamic: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', replace: '<path d="M4 6h12m-3-3 3 3-3 3M20 18H8m3-3-3 3 3 3M4 12h4m8 0h4"/>' };
		Object.entries( icons ).forEach( ( [ name, shape ] ) => q( '[data-code-' + name + ']' )?.insertAdjacentHTML?.( 'afterbegin', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + shape + '</svg>' ) );
		const find = q( '[data-code-find]' ), replacement = q( '[data-code-replacement]' ), search = q( '#lieve-code-search' ), replaceRow = q( '[data-code-replace-row]' ), status = q( '[data-code-search-status]' );
		const modal = window.LieveConditions.modal( root ); let active = null, editor = null, syncing = false, results = [], resultIndex = -1;
		if ( window.ResizeObserver ) { let frame; new window.ResizeObserver( () => { window.cancelAnimationFrame( frame ); frame = window.requestAnimationFrame( () => { if ( ! root.hidden && editor ) { editor.refresh(); } } ); } ).observe( dialog ); }
		const value = () => editor ? editor.getValue() : field.value;
		const editable = () => active && ! active.readOnly && ( ! active.canEdit || active.canEdit() );
		const range = () => editor ? { start: editor.indexFromPos( editor.getCursor( 'from' ) ), end: editor.indexFromPos( editor.getCursor( 'to' ) ) } : { start: field.selectionStart || 0, end: field.selectionEnd || 0 };
		const focus = () => editor ? editor.focus() : field.focus( { preventScroll: true } );
		function tools() { const clear = q( '[data-code-clear]' ), dynamic = q( '[data-code-dynamic]' ); if ( clear ) { clear.disabled = ! editable() || ! value(); } if ( dynamic ) { dynamic.disabled = ! editable() || ! active?.dynamic || ! active?.dynamicEnabled?.(); } [ '[data-code-replace-one]', '[data-code-replace-all]' ].forEach( selector => { const button = q( selector ); if ( button ) { button.disabled = ! editable() || ! results.length || selector === '[data-code-replace-one]' && resultIndex < 0; } } ); }
		const resultCount = () => results.length + ( results.length === 10000 ? '+' : '' );
		function refreshMatches() { if ( find ) { results = matches( value(), find.value, q( '[data-code-case]' ).checked ); resultIndex = -1; status.textContent = ! find.value ? 'Enter text to search.' : results.length ? resultCount() + ' matches' : 'No matches.'; } }
		function change( event = {} ) { if ( syncing || ! editable() || event.isComposing ) { return; } if ( editor ) { editor.save(); } active.change( value() ); refreshMatches(); tools(); }
		function select( start, end ) { if ( editor ) { editor.setSelection( editor.posFromIndex( start ), editor.posFromIndex( end ) ); editor.scrollIntoView( { from: editor.posFromIndex( start ), to: editor.posFromIndex( end ) }, 40 ); } else { field.setSelectionRange( start, end ); } }
		function replace( text, start = 0, end = value().length ) {
			if ( ! editable() ) { return; }
			if ( editor ) { editor.replaceRange( text, editor.posFromIndex( start ), editor.posFromIndex( end ), '+input' ); }
			else { const current = value(); field.value = current.slice( 0, start ) + text + current.slice( end ); select( start + text.length, start + text.length ); change(); }
		}
		function findMatch( direction = 1 ) {
			if ( ! find ) { return; } results = matches( value(), find.value, q( '[data-code-case]' ).checked );
			resultIndex = results.length ? resultIndex < 0 ? ( direction < 0 ? results.length - 1 : 0 ) : ( resultIndex + direction + results.length ) % results.length : -1;
			if ( resultIndex >= 0 ) { select( results[resultIndex].start, results[resultIndex].end ); }
			status.textContent = ! find.value ? 'Enter text to search.' : results.length ? ( resultIndex + 1 ) + ' of ' + resultCount() + ' matches' : 'No matches.'; tools();
		}
		function showSearch( replaceMode = false ) { if ( ! search ) { return; } search.hidden = false; replaceRow.hidden = ! replaceMode; q( '[data-code-search]' ).setAttribute( 'aria-expanded', 'true' ); q( '[data-code-replace]' ).setAttribute( 'aria-expanded', String( replaceMode ) ); find.focus(); find.select(); if ( editor ) { editor.refresh(); } }
		function closeSearch() { if ( ! search ) { return; } search.hidden = true; q( '[data-code-search]' ).setAttribute( 'aria-expanded', 'false' ); q( '[data-code-replace]' ).setAttribute( 'aria-expanded', 'false' ); focus(); if ( editor ) { editor.refresh(); } }
		field.addEventListener( 'input', change ); field.addEventListener( 'compositionend', change );
		q( '[data-code-clear]' )?.addEventListener( 'click', () => { if ( editable() ) { active.finish?.(); replace( '' ); active.finish?.(); focus(); } } );
		q( '[data-code-dynamic]' )?.addEventListener( 'click', event => { if ( ! editable() || ! active.dynamicEnabled?.() ) { return; } const selection = range(), owner = active; active.dynamic( { trigger: event.currentTarget, field, container: root, insert: text => { if ( active === owner ) { replace( text, selection.start, selection.end ); } }, focus, isCurrent: () => Boolean( active === owner && active.dynamicEnabled?.() ) } ); } );
		q( '[data-code-search]' )?.addEventListener( 'click', () => showSearch() ); q( '[data-code-replace]' )?.addEventListener( 'click', () => showSearch( true ) ); q( '[data-code-search-close]' )?.addEventListener( 'click', closeSearch );
		find?.addEventListener( 'input', () => { resultIndex = -1; findMatch(); } ); q( '[data-code-case]' )?.addEventListener( 'change', () => { resultIndex = -1; findMatch(); } );
		q( '[data-code-next]' )?.addEventListener( 'click', () => findMatch() ); q( '[data-code-prev]' )?.addEventListener( 'click', () => findMatch( -1 ) );
		q( '[data-code-replace-one]' )?.addEventListener( 'click', () => { const match = results[resultIndex]; if ( match && editable() ) { const next = match.start + replacement.value.length; replace( replacement.value, match.start, match.end ); results = matches( value(), find.value, q( '[data-code-case]' ).checked ); resultIndex = results.findIndex( item => item.start >= next ) - 1; if ( resultIndex < -1 ) { resultIndex = -1; } findMatch(); } } );
		q( '[data-code-replace-all]' )?.addEventListener( 'click', () => { if ( ! editable() || ! find.value ) { return; } const current = value(), text = current.replace( searchExpression( find.value, q( '[data-code-case]' ).checked ), () => replacement.value ); if ( text !== current ) { active.finish?.(); replace( text ); active.finish?.(); resultIndex = -1; findMatch(); } } );
		root.addEventListener( 'keydown', event => {
			if ( event.isComposing || event.target.closest?.( '.lieve-token-picker' ) ) { return; }
			if ( ( event.metaKey || event.ctrlKey ) && ( event.key.toLowerCase() === 'f' || event.ctrlKey && event.key.toLowerCase() === 'h' ) ) { event.preventDefault(); event.stopPropagation(); showSearch( event.altKey || event.key.toLowerCase() === 'h' ); }
			else if ( event.key === 'Escape' && search && ! search.hidden ) { event.preventDefault(); event.stopPropagation(); closeSearch(); }
			else if ( event.key === 'Enter' && event.target === find ) { event.preventDefault(); event.stopPropagation(); findMatch( event.shiftKey ? -1 : 1 ); }
		}, true );
		root.addEventListener( 'lieve:conditions-close', () => {
			if ( ! active ) { return; }
			// A click on Close can precede compositionend; retain the final draft text.
			if ( editable() && ( ! active.read || active.read() !== undefined ) ) { active.change( value() ); }
			active.finish?.(); active.closeDynamic?.(); active = null;
		} );
		return { open( options ) {
			active = options; title.textContent = options.label + ' editor'; label.textContent = options.label;
			field.value = options.value; field.readOnly = ! editable(); field.scrollTop = 0; field.scrollLeft = 0;
			if ( search ) { search.hidden = true; find.value = ''; replacement.value = ''; results = []; resultIndex = -1; q( '[data-code-search]' ).setAttribute( 'aria-expanded', 'false' ); q( '[data-code-replace]' ).setAttribute( 'aria-expanded', 'false' ); status.textContent = 'Enter text to search.'; }
			const mode = modes[ options.label ] || 'htmlmixed';
			syncing = true;
			if ( ! editor && window.wp?.CodeMirror?.fromTextArea ) { editor = window.wp.CodeMirror.fromTextArea( field, { mode, lineNumbers: true, lineWrapping: false, tabSize: 2, indentUnit: 2, matchBrackets: true, readOnly: field.readOnly, viewportMargin: 20 } ); editor.on( 'change', () => change() ); }
			if ( editor ) { editor.setOption( 'mode', mode ); editor.setOption( 'readOnly', field.readOnly ); editor.setValue( options.value ); editor.clearHistory(); editor.getInputField().setAttribute( 'aria-label', options.label + ' code' ); }
			syncing = false; tools();
			modal.open( options.trigger ); if ( editor ) { editor.refresh(); } focus();
		}, refresh() {
			if ( ! active?.read ) { return; } const value = active.read();
			if ( value === undefined ) { modal.close(); return; }
			field.readOnly = ! editable();
			if ( editor ) { editor.setOption( 'readOnly', ! editable() ); if ( editor.getValue() !== value ) { const selection = editor.listSelections(), position = editor.getScrollInfo(); syncing = true; editor.setValue( value ); editor.setSelections( selection ); editor.scrollTo( position.left, position.top ); editor.save(); syncing = false; refreshMatches(); } tools(); return; }
			if ( field.value !== value ) { const start = field.selectionStart, end = field.selectionEnd, top = field.scrollTop, left = field.scrollLeft; field.value = value; field.setSelectionRange( Math.min( start, value.length ), Math.min( end, value.length ) ); field.scrollTop = top; field.scrollLeft = left; refreshMatches(); }
			tools();
		}, close: modal.close };
	}, mount, matches };
} )();
