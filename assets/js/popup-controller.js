/* One interruptible popup lifecycle, shared by automatic and interaction opening. */
( function () {
	'use strict';
	const records = new WeakMap(); const stack = []; const mounted = new WeakSet();
	const easing = { 'ease-out': 'cubic-bezier(0.23,1,0.32,1)', 'ease-in-out': 'cubic-bezier(0.65,0,0.35,1)', linear: 'linear' };
	function settings( popup ) {
		let data = {}; try { data = JSON.parse( popup.dataset.lievePopupSettings || '{}' ); } catch ( error ) { /* Safe legacy defaults. */ }
		return { closeOnEscape: data.closeOnEscape !== false, closeOnBackdrop: data.closeOnBackdrop !== false, lockScroll: data.lockScroll !== false, entrance: data.entrance || 'fade', exit: data.exit || 'fade', duration: Number.isFinite( data.duration ) ? Math.max( 0, Math.min( 2000, data.duration ) ) : 250, delay: Number.isFinite( data.delay ) ? Math.max( 0, Math.min( 5000, data.delay ) ) : 0, easing: easing[ data.easing ] || easing[ 'ease-out' ] };
	}
	function sync() { document.documentElement.classList.toggle( 'lieve-popup-open', stack.some( popup => ! popup.hidden && settings( popup ).lockScroll ) ); }
	function record( popup ) { if ( ! records.has( popup ) ) { records.set( popup, { open: ! popup.hidden, generation: 0, animations: [], opener: null } ); } return records.get( popup ); }
	function cancel( item ) { item.animations.forEach( animation => animation.cancel() ); item.animations = []; }
	function offset( name ) { return { zoom: 'scale(.96)', 'slide-up': 'translateY(24px)', 'slide-down': 'translateY(-24px)', 'slide-left': 'translateX(24px)', 'slide-right': 'translateX(-24px)' }[ name ] || ''; }
	/** Capture the current frame before canceling: reversing never jumps to a fresh start. */
	function animate( popup, data, opening, immediate = false, preview = false ) {
		const item = record( popup ); const view = popup.ownerDocument.defaultView || window;
		const dialog = popup.querySelector( '[data-lieve-ui="popup-dialog"]' ); const backdrop = popup.querySelector( '[data-lieve-ui="popup-backdrop"]' );
		const current = item.animations.length && dialog ? { opacity: view.getComputedStyle( dialog ).opacity, transform: view.getComputedStyle( dialog ).transform } : null;
		const currentBackdrop = item.animations.length && backdrop ? view.getComputedStyle( backdrop ).opacity : null;
		cancel( item );
		let name = opening ? data.entrance : data.exit;
		if ( immediate || name === 'none' || ! data.duration || ! dialog?.animate ) { return Promise.resolve(); }
		const reduced = view.matchMedia?.( '(prefers-reduced-motion: reduce)' ).matches;
		if ( reduced ) { name = 'fade'; }
		const baseline = view.getComputedStyle( dialog ); const transform = baseline.transform === 'none' ? '' : baseline.transform;
		const displaced = ( offset( name ) + ' ' + transform ).trim() || 'none';
		const visible = { opacity: baseline.opacity, transform: transform || 'none' }; const invisible = { opacity: 0, transform: displaced };
		const timing = { duration: reduced ? Math.min( data.duration, 150 ) : data.duration, delay: opening && ! current && ! preview ? data.delay : 0, easing: data.easing, fill: 'both' };
		item.animations.push( dialog.animate( [ current || ( opening ? invisible : visible ), opening ? visible : invisible ], timing ) );
		if ( backdrop?.animate ) { const opacity = view.getComputedStyle( backdrop ).opacity; item.animations.push( backdrop.animate( [ { opacity: currentBackdrop ?? ( opening ? 0 : opacity ) }, { opacity: opening ? opacity : 0 } ], timing ) ); }
		return Promise.all( item.animations.map( animation => animation.finished.catch( () => {} ) ) );
	}
	function emit( popup, opening, source, options ) { if ( options.emit ) { options.emit( opening ); } else { popup.dispatchEvent( new CustomEvent( opening ? 'lieve:popup-open' : 'lieve:popup-close', { bubbles: true, detail: { source } } ) ); } }
	function focusable( popup ) { return Array.from( popup.querySelectorAll( 'button,a[href],input,select,textarea,[tabindex]' ) ).filter( node => ! node.disabled && node.tabIndex !== -1 && node.getClientRects().length ); }
	async function setOpen( popup, opening, source = null, options = {} ) {
		const item = record( popup ); if ( item.open === opening && ! ( ! opening && options.immediate && ! popup.hidden ) ) { return; }
		const generation = ++item.generation; item.open = opening;
		if ( opening ) {
			item.opener = source || popup.ownerDocument.activeElement; popup.hidden = false;
			const index = stack.indexOf( popup ); if ( index >= 0 ) { stack.splice( index, 1 ); } stack.push( popup ); sync();
			emit( popup, true, source, options ); ( focusable( popup )[0] || popup ).focus( { preventScroll: true } );
		}
		await animate( popup, settings( popup ), opening, options.immediate );
		if ( generation !== item.generation ) { return; }
		cancel( item );
		if ( ! opening ) {
			popup.hidden = true; const index = stack.indexOf( popup ); if ( index >= 0 ) { stack.splice( index, 1 ); } sync(); emit( popup, false, source, options );
			const top = stack.at( -1 ); const opener = item.opener; item.opener = null;
			if ( top && ( ! opener?.isConnected || ! top.contains( opener ) ) ) { ( focusable( top )[0] || top ).focus( { preventScroll: true } ); }
			else if ( opener?.isConnected ) { opener.focus( { preventScroll: true } ); }
		}
	}
	function mount() {
		document.querySelectorAll( '[data-lieve-popup]' ).forEach( popup => {
			if ( mounted.has( popup ) ) { return; } mounted.add( popup ); const item = record( popup );
			popup.querySelectorAll( '[data-lieve-popup-close]' ).forEach( button => button.addEventListener( 'click', event => { if ( button.dataset.lieveUi === 'popup-backdrop' && ! settings( popup ).closeOnBackdrop ) { return; } void setOpen( popup, false, event.currentTarget, { immediate: event.detail === 0 } ); } ) );
			if ( item.open ) { item.open = false; void setOpen( popup, true ); }
		} ); sync();
	}
	if ( typeof document !== 'undefined' ) { document.addEventListener( 'keydown', event => {
		const popup = stack.at( -1 ); if ( ! popup || popup.hidden ) { return; }
		if ( event.key === 'Escape' && settings( popup ).closeOnEscape ) { event.preventDefault(); void setOpen( popup, false, null, { immediate: true } ); }
		if ( event.key === 'Tab' ) {
			const nodes = focusable( popup ); const first = nodes[0], last = nodes.at( -1 );
			if ( ! first ) { event.preventDefault(); popup.focus( { preventScroll: true } ); }
			else if ( ! popup.contains( document.activeElement ) || event.shiftKey && document.activeElement === first ) { event.preventDefault(); ( event.shiftKey ? last : first ).focus( { preventScroll: true } ); }
			else if ( ! event.shiftKey && document.activeElement === last ) { event.preventDefault(); first.focus( { preventScroll: true } ); }
		}
	} ); }
	window.LievePopups = { mount, isOpen: popup => record( popup ).open, open: ( popup, source, options ) => setOpen( popup, true, source, options ), close: ( popup, source, options ) => setOpen( popup, false, source, options ), preview: async ( popup, data, opening = true ) => { const item = record( popup ); const generation = ++item.generation; await animate( popup, { ...settings( popup ), ...data, easing: easing[ data.easing ] || easing[ 'ease-out' ] }, opening, false, true ); if ( item.generation === generation ) { cancel( item ); } }, cancelPreview: popup => { const item = record( popup ); ++item.generation; cancel( item ); } };
}() );
