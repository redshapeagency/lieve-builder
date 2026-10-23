/* WordPress's local editor, scoped to one Rich Text property. No content preset CSS. */
( function () {
	'use strict';
	function mount( { root, textarea, app, dynamicData, canVisual = true, canUpload = false, onSave, onError, restore, isCurrent = () => true } ) {
		if ( ! root || ! textarea ) { return null; }
		const id = textarea.id, body = root.querySelector( '[data-rich-body]' ), bindingPanel = root.querySelector( '[data-rich-binding]' );
		const label = root.querySelector( '[data-rich-source]' ), status = root.querySelector( '[data-rich-status]' );
		const tokens = [ 'surface', 'surface-2', 'text', 'text-2', 'muted', 'border', 'gradient', 'gradient-soft', 'accent-text', 'violet', 'font-ui' ];
		const quickLabels = { strong: 'Bold', em: 'Italic', link: 'Insert link', block: 'Blockquote', del: 'Strikethrough', ins: 'Inserted text', img: 'Insert image', ul: 'Bulleted list', ol: 'Numbered list', li: 'List item', code: 'Code', close: 'Close tags' };
		const portalStyles = new Map( tokens.map( key => [ key, document.body.style.getPropertyValue( '--lieve-rich-' + key ) ] ) );
		let editor = null, modeTabs = null, destroyed = false, syncing = false, initialized = false, bound = null, lastWritten = textarea.value;
		function emit( value ) {
			if ( destroyed || ! isCurrent() || ! textarea.isConnected || value === lastWritten ) { return; }
			lastWritten = value; textarea.value = value; syncing = true;
			try { textarea.dispatchEvent( new Event( 'input', { bubbles: true } ) ); } finally { syncing = false; }
		}
		function writeVisual( event ) {
			if ( event?.isComposing || destroyed || ! isCurrent() || syncing || ! initialized || ! editor || editor.isHidden() || dynamicData?.parse( textarea.value ) ) { return; }
			emit( editor.getContent() );
		}
		function flush() {
			if ( destroyed || ! isCurrent() || syncing || ! textarea.isConnected || dynamicData?.parse( textarea.value ) ) { return; }
			if ( editor && ! editor.isHidden() ) { if ( editor.isDirty() ) { writeVisual(); } }
			else { emit( textarea.value ); }
		}
		function syncTheme() {
			if ( destroyed ) { return; }
			const theme = window.getComputedStyle( app );
			// Computed declarations are live. Read every token before writing styles,
			// otherwise each token forces another full inspector style recalculation.
			const values = tokens.map( key => [ '--lieve-rich-' + key, theme.getPropertyValue( '--lv-' + key ).trim() ] );
			const content = editor?.getDoc()?.documentElement;
			for ( const [ key, value ] of values ) {
				document.body.style.setProperty( key, value );
				content?.style.setProperty( key, value );
			}
		}
		function syncField() {
			if ( destroyed || syncing ) { return; }
			const next = dynamicData?.parse( textarea.value ) || null, wasBound = Boolean( bound ); bound = next;
			body.hidden = Boolean( bound ); bindingPanel.hidden = ! bound;
			root.classList.toggle( 'is-dynamic-bound', Boolean( bound ) );
			root.querySelectorAll( '.wp-switch-editor' ).forEach( button => { button.disabled = Boolean( bound ); } );
			if ( bound ) { label.textContent = dynamicData.source( bound.source )?.label || bound.source; }
			else if ( editor && ( wasBound || ! editor.isHidden() ) && textarea.value !== lastWritten ) {
				syncing = true;
				try { editor.setContent( textarea.value ); editor.setDirty( false ); if ( wasBound ) { editor.undoManager.clear(); } } finally { syncing = false; }
			}
			lastWritten = textarea.value;
		}
		function switchMode( mode ) {
			if ( ! initialized || ! editor || bound ) { return; }
			flush(); syncing = true;
			try {
				if ( mode === 'html' ) { editor.hide(); }
				else { window.QTags?.closeAllTags( id ); editor.setContent( textarea.value ); editor.show(); }
				// A view switch can normalize markup, but is not an authored content edit.
				lastWritten = textarea.value;
			} finally { syncing = false; }
			const wrap = root.querySelector( '.wp-editor-wrap' );
			wrap?.classList.toggle( 'html-active', mode === 'html' ); wrap?.classList.toggle( 'tmce-active', mode !== 'html' );
			root.querySelectorAll( '.wp-switch-editor' ).forEach( button => button.setAttribute( 'aria-pressed', String( button.classList.contains( mode === 'html' ? 'switch-html' : 'switch-tmce' ) ) ) );
			if ( mode === 'html' ) { textarea.removeAttribute( 'aria-hidden' ); textarea.setAttribute( 'aria-label', 'Rich Text HTML content' ); }
			enhanceQuicktags();
		}
		function enhanceQuicktags() {
			root.querySelectorAll( '.quicktags-toolbar input' ).forEach( button => { const key = button.id.slice( ( 'qt_' + id + '_' ).length ); if ( quickLabels[ key ] ) { const text = ( button.value.startsWith( '/' ) ? 'Close ' : '' ) + quickLabels[ key ]; button.title = text; button.setAttribute( 'aria-label', text ); if ( key === 'close' ) { button.value = 'Close tags'; } } } );
		}
		function switchClick( event ) {
			const button = event.target.closest?.( '.wp-switch-editor' ); if ( ! button ) { return; }
			event.preventDefault(); event.stopImmediatePropagation(); switchMode( button.classList.contains( 'switch-html' ) ? 'html' : 'visual' );
		}
		function capture() {
			const html = ! editor || editor.isHidden(), focused = html ? document.activeElement === textarea : document.activeElement === editor.iframeElement;
			let bookmark = null; try { if ( focused && ! html ) { bookmark = editor.selection.getBookmark( 2, true ); } } catch { /* An empty/removed selection needs no restoration. */ }
			return { mode: html ? 'html' : 'visual', focused, bookmark, start: textarea.selectionStart, end: textarea.selectionEnd, top: textarea.scrollTop };
		}
		function restoreView() {
			if ( ! restore || bound || ! isCurrent() ) { return; }
			if ( restore.mode === 'html' ) { switchMode( 'html' ); }
			if ( ! restore.focused || document.activeElement !== document.body && ! root.contains( document.activeElement ) ) { return; }
			const panel = root.closest( '[data-inspector-section]' ), top = panel?.scrollTop, left = panel?.scrollLeft;
			if ( restore.mode === 'html' ) { textarea.focus( { preventScroll: true } ); textarea.setSelectionRange( restore.start || 0, restore.end || 0 ); textarea.scrollTop = restore.top || 0; }
			else { editor.getBody().focus( { preventScroll: true } ); try { if ( restore.bookmark ) { editor.selection.moveToBookmark( restore.bookmark ); } } catch { /* Sanitized HTML may no longer contain an old bookmark. */ } }
			if ( panel ) { panel.scrollTop = top; panel.scrollLeft = left; }
		}
		// HTML Quicktags insert programmatically; they do not dispatch an input event.
		function quicktagClick( event ) {
			if ( event.target.closest?.( '.quicktags-toolbar' ) ) { queueMicrotask( () => { flush(); if ( ! destroyed ) { enhanceQuicktags(); } } ); }
		}
		const quicktagsEvent = 'quicktags-init.lieveRichText-' + id;
		function quicktagsReady( event, instance ) { if ( ! destroyed && instance?.id === id ) { enhanceQuicktags(); } }
		window.jQuery?.( document ).on( quicktagsEvent, quicktagsReady );
		// WordPress nests its editor container in the tools. Move the bare container
		// before TinyMCE creates its iframe: reparenting a live iframe reloads it.
		const beforeVisualEvent = 'wp-before-tinymce-init.lieveRichText-' + id;
		function arrangeContainer( event, settings ) {
			if ( settings?.selector !== '#' + id ) { return; }
			const wrap = root.querySelector( '.wp-editor-wrap' ), container = root.querySelector( '.wp-editor-container' );
			if ( wrap && container && container.parentElement !== wrap ) { wrap.appendChild( container ); }
		}
		window.jQuery?.( document ).on( beforeVisualEvent, arrangeContainer );
		textarea.addEventListener( 'input', syncField ); root.addEventListener( 'click', quicktagClick ); root.addEventListener( 'click', switchClick, true );
		const themeObserver = typeof MutationObserver === 'function' ? new MutationObserver( syncTheme ) : null;
		themeObserver?.observe( app, { attributes: true, attributeFilter: [ 'data-color-mode', 'style' ] } );
		syncField(); syncTheme();
		try {
			if ( ! window.wp?.editor?.initialize || ! window.wp.editor.getDefaultSettings ) { throw new Error( 'The visual editor is unavailable. You can still edit the HTML below.' ); }
			const visual = canVisual && Boolean( window.tinymce );
			window.wp.editor.initialize( id, {
				mediaButtons: false,
				quicktags: { buttons: 'strong,em,link,block,del,ins,img,ul,ol,li,code,close' },
				tinymce: visual ? {
					language: 'en', wpautop: false, height: 180, min_height: 160, resize: 'vertical',
					menubar: false, branding: false, elementpath: false, statusbar: true, wordpress_adv_hidden: false, z_index: 100150,
					toolbar1: 'formatselect bold italic underline strikethrough',
					toolbar2: 'bullist numlist blockquote alignleft aligncenter alignright alignjustify',
					toolbar3: 'link unlink hr charmap superscript subscript',
					toolbar4: ( canUpload ? 'wp_add_media ' : '' ) + 'forecolor backcolor removeformat pastetext outdent indent undo redo wp_help',
					block_formats: 'Paragraph=p;Heading 1=h1;Heading 2=h2;Heading 3=h3;Heading 4=h4;Heading 5=h5;Heading 6=h6;Preformatted=pre',
					content_css: false,
					content_style: 'html,body.mce-content-body{background:var(--lieve-rich-surface,#fff)}body{margin:12px;color:var(--lieve-rich-text,#262c38);font:13px/1.7 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-wrap:anywhere;caret-color:var(--lieve-rich-violet,#8044e3)}body::selection,body *::selection{background:#ece4fb}p{margin:0 0 .75em}a{color:var(--lieve-rich-accent-text,#6e36c9)}img{max-width:100%;height:auto}body[data-mce-placeholder]:empty:before{color:var(--lieve-rich-muted,#707681)}',
					setup( instance ) {
						editor = instance;
						instance.on( 'BeforeSetContent', event => { if ( dynamicData?.parse( event.content ) ) { event.content = ''; } } );
						instance.on( 'init', () => {
							if ( destroyed || ! isCurrent() || ! textarea.isConnected ) { instance.remove(); return; }
							if ( bound ) { textarea.value = lastWritten; }
							initialized = true; syncTheme(); syncField();
							enhanceQuicktags();
							instance.getBody().setAttribute( 'aria-label', 'Rich Text visual content' );
							instance.getBody().setAttribute( 'role', 'textbox' ); instance.getBody().setAttribute( 'aria-multiline', 'true' );
							// Override WordPress's post-form save shortcut, not its rich-text Undo.
							instance.addShortcut( 'meta+s', 'Save page', () => { if ( ! destroyed && isCurrent() ) { flush(); onSave?.(); } } );
							instance.addShortcut( 'ctrl+s', 'Save page', () => { if ( ! destroyed && isCurrent() ) { flush(); onSave?.(); } } );
							restoreView();
						} );
						instance.on( 'input change compositionend Undo Redo', writeVisual );
						instance.on( 'blur', flush );
						instance.on( 'focus', () => { window.wpActiveEditor = id; } );
					},
				} : false,
			} );
			// Keep view/data actions outside the hideable body, in one stable shared header.
			const tabsHost = root.querySelector( '[data-rich-tabs]' ); modeTabs = root.querySelector( '.wp-editor-tabs' );
			if ( tabsHost && modeTabs ) { tabsHost.appendChild( modeTabs ); const tools = root.querySelector( '.wp-editor-tools' ); if ( tools && ! tools.querySelector( '.wp-editor-container' ) ) { tools.remove(); } }
			const visualTab = document.getElementById( id + '-tmce' ), codeTab = document.getElementById( id + '-html' );
			if ( visualTab ) { visualTab.textContent = 'Visual'; } if ( codeTab ) { codeTab.textContent = 'HTML'; }
			const htmlMode = initialized && editor?.isHidden();
			visualTab?.setAttribute( 'aria-pressed', String( ! htmlMode ) ); codeTab?.setAttribute( 'aria-pressed', String( Boolean( htmlMode ) ) );
			syncField();
			enhanceQuicktags();
			// Editor-source keystrokes are already handled by the page's normal input/save path.
			if ( ! visual ) { status.textContent = 'Visual editing is disabled in your WordPress profile. HTML editing remains available.'; status.hidden = false; }
		} catch ( error ) { status.textContent = error.message; status.hidden = false; onError?.( error ); }
		finally { window.jQuery?.( document ).off( beforeVisualEvent, arrangeContainer ); }
		return {
			flush, sync: syncField, capture,
			destroy() {
				if ( destroyed ) { return; } destroyed = true;
				isCurrent = null;
				window.jQuery?.( document ).off( quicktagsEvent, quicktagsReady );
				themeObserver?.disconnect(); textarea.removeEventListener( 'input', syncField ); root.removeEventListener( 'click', quicktagClick ); root.removeEventListener( 'click', switchClick, true );
				const value = textarea.value;
				// remove() may save TinyMCE's old visual content over a dynamic reference.
				try { window.wp?.editor?.remove( id ); } finally { textarea.value = value; modeTabs?.remove(); }
				if ( window.wpActiveEditor === id ) { window.wpActiveEditor = ''; }
				for ( const [ key, value ] of portalStyles ) { if ( value ) { document.body.style.setProperty( '--lieve-rich-' + key, value ); } else { document.body.style.removeProperty( '--lieve-rich-' + key ); } }
			},
		};
	}
	window.LieveRichText = { mount };
}() );
