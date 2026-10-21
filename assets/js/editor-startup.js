/* Independent of the editor dependency graph: a failed module must not leave an endless loader. */
( function () {
	'use strict';
	const minimumVisibleMs = 900;
	let complete = false, failed = false, watchdog = null, startedAt = null;
	const root = () => document.getElementById( 'lieve-editor-startup' );
	function fail() {
		if ( complete ) { return; }
		failed = true; window.clearTimeout( watchdog ); watchdog = null;
		const loader = root();
		if ( loader ) { loader.dataset.state = 'error'; loader.setAttribute( 'aria-busy', 'false' ); }
	}
	function start() {
		if ( complete || ! root() ) { return; }
		if ( failed ) { fail(); return; }
		if ( startedAt === null ) { startedAt = window.performance.now(); }
		if ( watchdog === null ) { watchdog = window.setTimeout( fail, 20000 ); }
	}
	function onError( event ) {
		const script = event.target;
		const ownScript = script?.tagName === 'SCRIPT' && script.id?.startsWith( 'lieve-' );
		const ownRuntime = event.filename && Array.from( document.scripts ).some( item => item.id?.startsWith( 'lieve-' ) && item.src === event.filename );
		// A synchronous mount error can originate in the page's inline initializer.
		const mountError = event.error && root() && document.getElementById( 'lieve-builder-app' );
		if ( ownScript || ownRuntime || mountError ) { fail(); }
	}
	function ready() {
		if ( complete ) { return; }
		start();
		complete = true; window.clearTimeout( watchdog ); watchdog = null;
		window.removeEventListener( 'error', onError, true );
		document.removeEventListener( 'DOMContentLoaded', start );
		// Count from entry, not from readiness: slower loads never pay an extra delay.
		const remaining = failed || startedAt === null ? 0 : Math.max( 0, minimumVisibleMs - ( window.performance.now() - startedAt ) );
		if ( remaining > 0 ) { window.setTimeout( reveal, remaining ); }
		else { reveal(); }
	}
	function reveal() {
		const app = document.getElementById( 'lieve-builder-app' ), loader = root();
		if ( app ) { app.removeAttribute( 'inert' ); app.setAttribute( 'aria-busy', 'false' ); }
		if ( ! loader ) { return; }
		if ( loader.contains( document.activeElement ) ) { document.getElementById( 'lieve-save' )?.focus( { preventScroll: true } ); }
		loader.setAttribute( 'aria-busy', 'false' ); loader.setAttribute( 'aria-hidden', 'true' ); loader.setAttribute( 'inert', '' );
		loader.dataset.state = 'ready';
		if ( window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches ) { loader.remove(); return; }
		let exitTimer;
		const remove = event => {
			if ( event && ( event.target !== loader || event.propertyName !== 'opacity' ) ) { return; }
			window.clearTimeout( exitTimer ); loader.removeEventListener( 'transitionend', remove ); loader.remove();
		};
		loader.addEventListener( 'transitionend', remove );
		exitTimer = window.setTimeout( remove, 180 ); // Cleanup also works when there was no intermediate paint.
	}
	window.LieveEditorStartup = { start, ready, fail };
	window.addEventListener( 'error', onError, true );
	document.addEventListener( 'DOMContentLoaded', start, { once: true } );
}() );
