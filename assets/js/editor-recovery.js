/* Private server recovery. Never publishes or restores automatically. */
( function() {
	'use strict';
	window.LieveRecovery = { create( { app, config, read, restore, dirty, saving, notify, onLayout = () => {} } ) {
		if ( ! config.recoveryUrl ) { return null; }
		const newSession = () => 'lr_' + ( window.crypto?.randomUUID ? window.crypto.randomUUID().replaceAll( '-', '' ) : Date.now().toString( 36 ) + Math.random().toString( 36 ).slice( 2 ) + Math.random().toString( 36 ).slice( 2 ) );
		let session = newSession(), previous = '', running = null, clearing = null, phase = 'active', interval = null, authBlocked = false;
		let writeEpoch = 0, restoredSession = null, noticeEpoch = 0, dismissNotice = () => {}, resumeNotice = () => {};
		const requests = new Map();
		const base = () => config.isTemplate ? config.templateRevision : config.documentRevision;
		async function request( method, payload = {} ) {
			if ( phase === 'stopped' ) { throw new Error( 'Recovery controller has stopped.' ); }
			const controller = new AbortController(); const timer = setTimeout( () => controller.abort(), 20000 ); requests.set( controller, method );
			let cancelled;
			const aborted = new Promise( ( resolve, reject ) => { cancelled = () => { const error = new Error( 'Recovery request interrupted. Your draft is retained.' ); error.name = 'AbortError'; reject( error ); }; controller.signal.addEventListener( 'abort', cancelled, { once: true } ); } );
			try { return await Promise.race( [ aborted, ( async () => {
				const response = await ( window.LieveTransport?.fetch || fetch )( config.recoveryUrl, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': config.nonce }, ...( method === 'GET' ? {} : { body: JSON.stringify( payload ) } ), signal: controller.signal } );
				const result = await response.json();
				if ( ! response.ok ) { const error = new Error( result.message || 'Recovery copy could not be stored.' ); error.status = response.status; throw error; }
				if ( method !== 'GET' && result.success !== true ) { throw new Error( 'Recovery copy could not be confirmed. Your draft is retained.' ); }
				return result;
			} )() ] ); } finally { clearTimeout( timer ); controller.signal.removeEventListener( 'abort', cancelled ); requests.delete( controller ); }
		}
		async function flush( force = false ) {
			if ( phase !== 'active' || authBlocked && ! force || ! dirty() || ( saving() && ! force ) ) { return; }
			if ( clearing ) { await clearing; return flush( force ); }
			if ( running ) { await running; return flush( force ); }
			const snapshot = read(); if ( snapshot === previous ) { return; }
			const owner = session, epoch = writeEpoch;
			const job = request( 'POST', { session: owner, snapshot: JSON.parse( snapshot ), baseRevision: base() } ).then( () => {
				if ( phase !== 'stopped' && epoch === writeEpoch ) { previous = snapshot; authBlocked = false; }
			} ).catch( error => {
				if ( phase !== 'stopped' ) {
					if ( error.status === 401 || error.status === 403 ) { authBlocked = true; }
					// An interrupted POST may still commit server-side. Preserve it under its old key;
					// a later checkpoint uses a new existing session slot, never blindly overwrites it.
					else if ( session === owner ) { session = newSession(); previous = ''; }
				}
				throw error;
			} ).finally( () => { if ( running === job ) { running = null; } } );
			running = job; await job;
		}
		function background() { flush().catch( error => { if ( phase === 'active' ) notify( error.message, true ); } ); }
		function clear() {
			if ( phase === 'stopped' ) { return Promise.resolve(); }
			if ( clearing ) { return clearing; }
			noticeEpoch++; writeEpoch++; dismissNotice( false );
			const snapshot = read(), owner = session, restored = restoredSession;
			const job = ( async () => {
				if ( running ) { try { await running; } catch ( error ) {} }
				if ( phase !== 'active' || read() !== snapshot ) { return; }
				await request( 'DELETE', { session: owner } );
				previous = '';
				if ( phase !== 'active' || read() !== snapshot ) { return; }
				if ( restored ) { await request( 'DELETE', { session: restored } ); if ( restoredSession === restored ) restoredSession = null; }
			} )().catch( error => {
				if ( phase !== 'stopped' ) {
					if ( error.status === 401 || error.status === 403 ) authBlocked = true;
					// A timed-out DELETE may still execute. A new checkpoint must not use
					// the key that this unconfirmed cleanup could subsequently remove.
					else if ( session === owner ) { session = newSession(); previous = ''; }
				}
				throw error;
			} ).finally( () => { if ( clearing === job ) clearing = null; if ( phase === 'active' && read() !== snapshot ) background(); } );
			clearing = job; return job;
		}
		function startTimer() { if ( phase === 'active' && interval === null ) interval = setInterval( background, 15000 ); }
		function suspend() { if ( phase !== 'active' ) return; phase = 'suspended'; noticeEpoch++; clearInterval( interval ); interval = null; }
		function resume() { if ( phase !== 'suspended' ) return; phase = 'active'; authBlocked = false; startTimer(); resumeNotice(); background(); }
		function destroy() {
			if ( phase === 'stopped' ) return; phase = 'stopped'; noticeEpoch++; writeEpoch++; clearInterval( interval ); interval = null;
			window.removeEventListener?.( 'pagehide', onPageHide ); window.removeEventListener?.( 'pageshow', onPageShow ); window.removeEventListener?.( 'online', onOnline );
			document.removeEventListener?.( 'visibilitychange', onVisibility ); document.removeEventListener?.( 'freeze', suspend ); document.removeEventListener?.( 'resume', resume );
			requests.forEach( ( method, controller ) => controller.abort() ); dismissNotice( false );
		}
		function onPageHide( event ) { if ( event.persisted ) suspend(); else destroy(); }
		function onPageShow() { resume(); }
		function onOnline() { if ( phase === 'active' ) { authBlocked = false; background(); } }
		function onVisibility() { if ( phase !== 'active' ) return; if ( ! document.hidden ) authBlocked = false; background(); }
		startTimer();
		window.addEventListener( 'pagehide', onPageHide ); window.addEventListener( 'pageshow', onPageShow ); window.addEventListener( 'online', onOnline );
		document.addEventListener( 'visibilitychange', onVisibility ); document.addEventListener( 'freeze', suspend ); document.addEventListener( 'resume', resume );
		const requestedEpoch = noticeEpoch;
		function showDrafts( result ) {
			if ( phase !== 'active' || requestedEpoch !== noticeEpoch ) return;
			const drafts = ( result.drafts || [] ).filter( entry => entry.session !== session ).reverse(); if ( ! drafts.length ) { return; }
			const notice = document.createElement( 'div' ); notice.className = 'lieve-recovery-notice'; notice.setAttribute( 'role', 'region' ); notice.setAttribute( 'aria-label', 'Draft recovery' );
			const summary = document.createElement( 'span' ); summary.textContent = 'Unsaved recovery copy available';
			const review = document.createElement( 'button' ); review.type = 'button'; review.className = 'lieve-button-secondary'; review.textContent = 'Review Draft'; review.setAttribute( 'aria-haspopup', 'dialog' );
			const dismiss = document.createElement( 'button' ); dismiss.type = 'button'; dismiss.className = 'lieve-button-secondary lieve-recovery-dismiss'; dismiss.setAttribute( 'aria-label', 'Dismiss draft notice' ); dismiss.title = 'Dismiss notice · recovery copies are kept';
			dismiss.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
			notice.append( summary, review, dismiss );
			const modalRoot = document.createElement( 'div' ); modalRoot.className = 'lieve-conditions-popup lieve-editor-manager-modal lieve-recovery-modal'; modalRoot.hidden = true;
			const backdrop = document.createElement( 'div' ); backdrop.className = 'lieve-conditions-backdrop'; backdrop.setAttribute( 'data-close-conditions', '' );
			const dialog = document.createElement( 'section' ); dialog.className = 'lieve-conditions-dialog'; dialog.setAttribute( 'role', 'dialog' ); dialog.setAttribute( 'aria-modal', 'true' ); dialog.setAttribute( 'aria-labelledby', 'lieve-recovery-title' ); dialog.tabIndex = -1;
			const header = document.createElement( 'header' ); header.className = 'lieve-conditions-header';
			const heading = document.createElement( 'div' ); heading.className = 'lieve-conditions-heading';
			const title = document.createElement( 'h2' ); title.id = 'lieve-recovery-title'; title.textContent = 'Recover unsaved work'; heading.appendChild( title );
			const close = document.createElement( 'button' ); close.type = 'button'; close.className = 'lieve-conditions-close'; close.setAttribute( 'aria-label', 'Close draft recovery' ); close.setAttribute( 'data-close-conditions', '' );
			close.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
			header.append( heading, close );
			const banner = document.createElement( 'div' ); banner.className = 'lieve-conditions-body lieve-recovery lieve-ds';
			const text = document.createElement( 'p' );
			const select = document.createElement( 'select' ); select.id = 'lieve-recovery-copy'; select.setAttribute( 'aria-label', 'Recovery copy' );
			drafts.forEach( ( draft, index ) => { const option = document.createElement( 'option' ); option.value = index; option.textContent = new Date( draft.updated * 1000 ).toLocaleString(); select.appendChild( option ); } );
			const label = document.createElement( 'label' ); label.htmlFor = select.id; label.textContent = 'Recovery copy';
			const actions = document.createElement( 'footer' ); actions.className = 'lieve-conditions-footer';
			const apply = document.createElement( 'button' ); const discard = document.createElement( 'button' ); const cancel = document.createElement( 'button' );
			apply.type = discard.type = cancel.type = 'button'; apply.className = 'lieve-conditions-save'; discard.className = cancel.className = 'lieve-conditions-cancel'; apply.textContent = 'Restore Draft'; discard.textContent = 'Discard'; cancel.textContent = 'Cancel'; cancel.setAttribute( 'data-close-conditions', '' );
			let picker = null; const layer = document.createElement( 'div' ); layer.className = 'lieve-ds lieve-editor-select-layer';
			let busy = false;
			actions.append( discard, cancel, apply ); banner.append( text, label, select ); dialog.append( header, banner, actions ); modalRoot.append( backdrop, dialog, layer );
			app.appendChild( modalRoot );
			const modal = window.LieveConditions.modal( modalRoot, () => ! busy );
			review.addEventListener( 'click', () => modal.open( review ) );
			modalRoot.addEventListener( 'lieve:conditions-close', () => picker?.close() );
			function remove( restoreFocus = true ) {
				busy = false; modal.close(); picker?.destroy(); modalRoot.remove(); notice.remove();
				dismissNotice = resumeNotice = () => {}; onLayout();
				if ( ! restoreFocus ) return;
				const target = app.querySelector( '[data-toggle-drawer="elements"]' );
				( target?.getClientRects().length ? target : app.querySelector( '#lieve-elements-tab' ) )?.focus( { preventScroll: true } );
			}
			dismissNotice = remove;
			dismiss.addEventListener( 'click', () => remove() );
			function update() { text.textContent = drafts[ Number( select.value ) ]?.baseRevision === base() ? 'A private recovery copy is available. Restoring does not publish it.' : 'The saved page has changed since this copy. Restore only to review and merge your unsaved work before saving.'; }
			select.addEventListener( 'change', update ); update();
			function setBusy( value ) { busy = value; apply.disabled = discard.disabled = cancel.disabled = close.disabled = value; picker?.setDisabled( value ); select.disabled = value; dialog.setAttribute( 'aria-busy', String( value ) ); }
			resumeNotice = () => { if ( ! busy ) setBusy( false ); };
			apply.addEventListener( 'click', async () => {
				if ( phase !== 'active' || busy || dirty() && ! window.confirm( 'Replace the current unsaved page draft with this recovery copy?' ) ) { return; }
				let draft = drafts[ Number( select.value ) ]; const restoreEpoch = noticeEpoch, restoreSnapshot = read();
				setBusy( true );
				try {
					// Bootstrap contains summaries, not up to 8 MB of private snapshots.
					// Retrieve the selected current copy only after an explicit Restore.
					if ( ! draft.snapshot ) { const result = await request( 'GET' ); if ( phase !== 'active' || restoreEpoch !== noticeEpoch ) return; draft = ( result.drafts || [] ).find( entry => entry.session === draft.session ); }
					if ( read() !== restoreSnapshot ) { throw new Error( 'The local draft changed while recovery was loading. Your newer edits are retained; review the copy again.' ); }
					if ( ! draft?.snapshot?.document ) { throw new Error( 'This recovery copy is no longer available. Close this dialog and reload the editor to refresh the available copies.' ); }
					restore( JSON.stringify( draft.snapshot ) ); restoredSession = draft.session; remove(); notify( 'Draft restored for review. Save when ready.' );
				} catch ( error ) { if ( phase === 'active' && restoreEpoch === noticeEpoch ) notify( 'Draft could not be restored: ' + error.message, true ); }
				finally { if ( phase === 'active' && modalRoot.parentElement ) setBusy( false ); else busy = false; }
			} );
			discard.addEventListener( 'click', async () => {
				if ( phase !== 'active' || busy ) return; const discardEpoch = noticeEpoch; setBusy( true );
				try { await request( 'DELETE', { session: drafts[ Number( select.value ) ].session } ); if ( phase !== 'active' || discardEpoch !== noticeEpoch ) return; drafts.splice( Number( select.value ), 1 ); if ( ! drafts.length ) { remove(); } else { select.replaceChildren(); drafts.forEach( ( entry, index ) => { const option = document.createElement( 'option' ); option.value = index; option.textContent = new Date( entry.updated * 1000 ).toLocaleString(); select.appendChild( option ); } ); picker?.refresh(); update(); } }
				catch ( error ) { if ( phase === 'active' && discardEpoch === noticeEpoch ) notify( error.message, true ); }
				finally { if ( phase === 'active' && modalRoot.parentElement ) setBusy( false ); else busy = false; }
			} );
			( app.querySelector( '.lieve-stage-wrap' ) || app ).prepend( notice );
			onLayout();
			picker = window.LieveDesignSystem?.createSelect( select, app, layer, { lazy: true } );
			if ( picker ) { label.htmlFor = select.id + '-trigger'; }
		}
		// Resolve presence before the workspace's first paint. Older bootstraps
		// retain their asynchronous fallback, without delaying the current editor.
		if ( Array.isArray( config.recoveryDrafts ) ) { showDrafts( { drafts: config.recoveryDrafts } ); }
		else { request( 'GET' ).then( showDrafts ).catch( error => { if ( phase === 'active' && requestedEpoch === noticeEpoch ) notify( 'Recovery is unavailable: ' + error.message, true ); } ); }
		return { flush, clear, suspend, resume, destroy };
	} };
} )();
