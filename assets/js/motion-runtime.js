/* Lieve Motion runtime: validated documents, local animation adapter and scoped lifecycle. */
( function( root, factory ) {
	'use strict';
	if ( typeof module === 'object' && module.exports ) { module.exports = factory; }
	else { root.LieveMotionRuntime = factory( root.document, root, root.LieveMotion ); if ( ! root.LieveMotionEditorMode ) { root.LieveMotionRuntime.start(); } }
}( typeof window !== 'undefined' ? window : this, function( document, win, model ) {
	'use strict';
	const mounted = new Map(), playback = new WeakMap(); let observer = null, timer = null, active = false;
	const reduced = () => Boolean( win.matchMedia?.( '(prefers-reduced-motion: reduce)' ).matches );
	const inRange = ( row, width ) => ( row.minWidth === '' || width >= row.minWidth ) && ( row.maxWidth === '' || width <= row.maxWidth );
	function resolve( source, step, preview ) {
		if ( step.target === 'self' ) { return [ source ]; }
		if ( step.target === 'children' ) {
			let targets; try { targets = Array.from( source.querySelectorAll( step.selector ) ).filter( target => ! target.closest( '[data-editor-ui]' ) ); } catch ( error ) { throw new Error( 'Enter a valid child selector.' ); }
			if ( targets.length > model.catalog.targetLimit ) { throw new Error( 'This step matches ' + targets.length + ' children. Narrow the selector to at most ' + model.catalog.targetLimit + '; no partial animation was applied.' ); }
			return targets;
		}
		const owner = source.ownerDocument || document;
		if ( preview ) { return Array.from( owner.querySelectorAll( '[data-editor-root]' ) ).filter( target => target.dataset.editorRoot === step.selector ); }
		const target = owner.getElementById( step.selector ) || Array.from( owner.querySelectorAll( '[data-lieve-id],[data-lieve-node]' ) ).find( node => node.getAttribute( 'data-lieve-id' ) === step.selector || node.getAttribute( 'data-lieve-node' ) === step.selector );
		return target ? [ target ] : [];
	}
	function compile( { source, row, breakpoints = [], device = null, width = win.innerWidth, preview = false, resume = null, onUpdate = () => {} } ) {
		if ( ! win.LieveMotionEngine?.create || ! model || Object.keys( model.errors( row ) ).length ) { throw new Error( 'This Motion timeline cannot be played. Check its settings and the local animation asset.' ); }
		if ( ! row.enabled || ! inRange( row, width ) ) { throw new Error( 'This timeline is disabled at the current viewport width.' ); }
		const isReduced = reduced(); let engine; let destroyed = false;
		const handles = [];
		try {
			const steps = row.steps.map( raw => {
				const step = model.effective( raw, breakpoints, width, device ), targets = resolve( source, step, preview );
				if ( ! targets.length ) { throw new Error( 'No element matches the target of “' + ( step.name || 'Animation' ) + '”.' ); }
				return { step, targets };
			} );
			engine = win.LieveMotionEngine.create( { row, steps, onUpdate } );
		} catch ( error ) { engine?.destroy(); throw error; }
		function command( action ) {
			if ( destroyed ) { return false; }
			if ( ! [ 'play', 'pause', 'restart', 'reverse', 'reset' ].includes( action ) ) { return false; }
			if ( isReduced ) { if ( row.reduced === 'finish' ) { engine.seek( engine.duration() ); } return true; }
			return engine.command( action );
		}
		function seek( seconds ) { if ( ! destroyed && ! isReduced ) { engine.seek( seconds ); } }
		function destroy() { if ( destroyed ) { return; } destroyed = true; handles.forEach( fn => fn() ); engine.destroy(); }
		try { if ( ! preview && ! isReduced ) {
			if ( row.trigger === 'scroll' ) {
				handles.push( engine.scroll( source, row.scrollStart, row.scrollEnd ) );
			} else if ( resume?.initialized ) {
				engine.restore( resume );
			} else if ( row.trigger === 'view' && win.IntersectionObserver ) {
				const view = new win.IntersectionObserver( entries => { if ( entries.some( item => item.isIntersecting ) ) { command( 'play' ); view.disconnect(); } }, { threshold: .05 } ); view.observe( source ); handles.push( () => view.disconnect() );
			} else if ( row.trigger !== 'manual' ) { command( 'play' ); }
		} else if ( ! preview && isReduced && row.reduced === 'finish' ) { command( 'play' ); } }
		catch ( error ) { destroy(); throw error; }
		return { command, seek, destroy, duration: engine.duration, time: engine.time, snapshot: engine.snapshot, reduced: isReduced };
	}
	function unmount( source ) { mounted.get( source )?.handles.slice().reverse().forEach( handle => handle.destroy() ); mounted.delete( source ); }
	function scan( force = false ) {
		if ( ! active ) { return; }
		mounted.forEach( ( value, source ) => {
			if ( ! source.isConnected || force || source.getAttribute( 'data-lieve-motion' ) !== value.signature ) {
				if ( source.isConnected && source.getAttribute( 'data-lieve-motion' ) === value.signature ) { playback.set( source, { signature: value.signature, states: new Map( value.handles.map( handle => [ handle.id, handle.snapshot() ] ) ) } ); }
				unmount( source );
			}
		} );
		document.querySelectorAll( '[data-lieve-motion]' ).forEach( source => {
			if ( mounted.has( source ) ) { return; }
			const signature = source.getAttribute( 'data-lieve-motion' ); const entry = { signature, handles: [] }; mounted.set( source, entry );
			try {
				if ( signature.length > 250000 ) { throw new Error( 'Motion data exceeds the runtime limit.' ); }
				const data = JSON.parse( signature ); if ( ! Array.isArray( data.timelines ) || data.timelines.length > model.catalog.limit ) { throw new Error( 'Invalid Motion payload.' ); }
				data.timelines.forEach( row => { if ( ! row.enabled || ! inRange( row, win.innerWidth ) ) { return; } try { const saved = playback.get( source ); const handle = compile( { source, row, breakpoints: data.breakpoints || [], resume: saved?.signature === signature ? saved.states.get( row.id ) : null } ); handle.id = row.id; handle.trigger = row.trigger; entry.handles.push( handle ); } catch ( error ) { source.dispatchEvent( new win.CustomEvent( 'lieve:motion-error', { bubbles: true, detail: { id: row.id, message: error.message } } ) ); } } );
			} catch ( error ) { /* A malformed animation must never hide or break page content. */ }
		} );
	}
	function schedule() { win.clearTimeout( timer ); timer = win.setTimeout( () => scan( true ), 120 ); }
	function control( id, action ) { let found = false; mounted.forEach( entry => entry.handles.forEach( handle => { if ( handle.id === id ) { found = handle.command( action ) || found; } } ) ); if ( ! found ) { throw new Error( 'The Motion timeline is unavailable at this viewport.' ); } return true; }
	const preference = win.matchMedia?.( '(prefers-reduced-motion: reduce)' );
	function start() {
		if ( active || ! model || ! win.LieveMotionEngine ) { return; } active = true;
		if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', scan, { once: true } ); } else { scan(); }
		win.addEventListener( 'resize', schedule ); preference?.addEventListener?.( 'change', schedule );
		if ( win.MutationObserver ) { observer = new win.MutationObserver( schedule ); observer.observe( document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: [ 'data-lieve-motion' ] } ); }
	}
	function destroy() { active = false; win.clearTimeout( timer ); observer?.disconnect(); observer = null; win.removeEventListener( 'resize', schedule ); preference?.removeEventListener?.( 'change', schedule ); document.removeEventListener( 'DOMContentLoaded', scan ); Array.from( mounted.keys() ).forEach( unmount ); }
	return { compile, control, scan, start, destroy, resolve };
} ) );
