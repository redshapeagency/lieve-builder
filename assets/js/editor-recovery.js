/* Private server recovery. Never publishes or restores automatically. */
( function() {
	'use strict';
	window.LieveRecovery = { create( { app, config, read, restore, dirty, saving, notify, onLayout = () => {} } ) {
		if ( ! config.recoveryUrl ) { return null; }
		const session = 'lr_' + ( window.crypto?.randomUUID ? window.crypto.randomUUID().replaceAll( '-', '' ) : Date.now().toString( 36 ) + Math.random().toString( 36 ).slice( 2 ) + Math.random().toString( 36 ).slice( 2 ) );
		let previous = '', running = null, stopped = false, restoredSession = null, noticeEpoch = 0, dismissNotice = () => {};
		const base = () => config.isTemplate ? config.templateRevision : config.documentRevision;
		async function request( method, payload = {} ) {
			const controller = new AbortController(); const timer = setTimeout( () => controller.abort(), 20000 );
			try { const response = await ( window.LieveTransport?.fetch || fetch )(  config.recoveryUrl, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': config.nonce }, ...( method === 'GET' ? {} : { body: JSON.stringify( payload ) } ), signal: controller.signal } );
				const result = await response.json(); if ( ! response.ok ) { throw new Error( result.message || 'Recovery copy could not be stored.' ); } return result;
			} finally { clearTimeout( timer ); }
		}
		async function flush( force = false ) {
			if ( stopped || ! dirty() || ( saving() && ! force ) ) { return; }
			if ( running ) { await running; return flush( force ); }
			const snapshot = read(); if ( snapshot === previous ) { return; }
			running = request( 'POST', { session, snapshot: JSON.parse( snapshot ), baseRevision: base() } ).then( () => { previous = snapshot; } );
			try { await running; } finally { running = null; }
		}
		async function clear() { noticeEpoch++; dismissNotice( false ); if ( running ) { try { await running; } catch ( error ) {} } await request( 'DELETE', { session } ); if ( restoredSession ) { await request( 'DELETE', { session: restoredSession } ); restoredSession = null; } previous = ''; }
		const interval = setInterval( () => flush().catch( error => notify( error.message, true ) ), 15000 );
		document.addEventListener( 'visibilitychange', () => { if ( document.hidden ) { flush().catch( () => {} ); } } );
		const requestedEpoch = noticeEpoch;
		request( 'GET' ).then( result => {
			if ( stopped || requestedEpoch !== noticeEpoch ) return;
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
				dismissNotice = () => {}; onLayout();
				if ( ! restoreFocus ) return;
				const target = app.querySelector( '[data-toggle-drawer="elements"]' );
				( target?.getClientRects().length ? target : app.querySelector( '#lieve-elements-tab' ) )?.focus( { preventScroll: true } );
			}
			dismissNotice = remove;
			dismiss.addEventListener( 'click', () => remove() );
			function update() { text.textContent = drafts[ Number( select.value ) ]?.baseRevision === base() ? 'A private recovery copy is available. Restoring does not publish it.' : 'The saved page has changed since this copy. Restore only to review and merge your unsaved work before saving.'; }
			select.addEventListener( 'change', update ); update();
			apply.addEventListener( 'click', () => { if ( dirty() && ! window.confirm( 'Replace the current unsaved page draft with this recovery copy?' ) ) { return; } const draft = drafts[ Number( select.value ) ]; restore( JSON.stringify( draft.snapshot ) ); restoredSession = draft.session; remove(); notify( 'Draft restored for review. Save when ready.' ); } );
			discard.addEventListener( 'click', async () => {
				busy = true; apply.disabled = discard.disabled = cancel.disabled = close.disabled = true; picker?.setDisabled( true ); select.disabled = true;
				try { await request( 'DELETE', { session: drafts[ Number( select.value ) ].session } ); drafts.splice( Number( select.value ), 1 ); if ( ! drafts.length ) { remove(); } else { select.replaceChildren(); drafts.forEach( ( entry, index ) => { const option = document.createElement( 'option' ); option.value = index; option.textContent = new Date( entry.updated * 1000 ).toLocaleString(); select.appendChild( option ); } ); picker?.refresh(); update(); } }
				catch ( error ) { notify( error.message, true ); }
				finally { busy = false; apply.disabled = discard.disabled = cancel.disabled = close.disabled = false; select.disabled = false; picker?.setDisabled( false ); }
			} );
			( app.querySelector( '.lieve-stage-wrap' ) || app ).prepend( notice );
			onLayout();
			picker = window.LieveDesignSystem?.createSelect( select, app, layer, { lazy: true } );
			if ( picker ) { label.htmlFor = select.id + '-trigger'; }
		} ).catch( error => notify( 'Recovery is unavailable: ' + error.message, true ) );
		window.addEventListener( 'pagehide', () => { stopped = true; clearInterval( interval ); } );
		return { flush, clear };
	} };
} )();
