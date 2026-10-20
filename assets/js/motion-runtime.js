/* GSAP is an adapter: all authored data belongs to Lieve Motion. */
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
		if ( ! win.gsap?.context || ! model || Object.keys( model.errors( row ) ).length ) { throw new Error( 'This Motion timeline cannot be played. Check its settings and the GSAP asset.' ); }
		if ( ! row.enabled || ! inRange( row, width ) ) { throw new Error( 'This timeline is disabled at the current viewport width.' ); }
		const isReduced = reduced(); let timeline; let context; let destroyed = false;
		const handles = [];
		try {
			context = win.gsap.context( () => {}, source );
			context.add( () => {
				timeline = win.gsap.timeline( { paused: true, repeat: row.trigger === 'scroll' ? 0 : row.repeat, yoyo: row.yoyo, onUpdate: () => onUpdate( timeline?.time() || 0, Boolean( timeline?.isActive() ) ), onComplete: () => onUpdate( timeline.duration(), false ), onReverseComplete: () => onUpdate( 0, false ) } );
				row.steps.forEach( raw => {
					const step = model.effective( raw, breakpoints, width, device ); const targets = resolve( source, step, preview );
					if ( ! targets.length ) { throw new Error( 'No element matches the target of “' + ( step.name || 'Animation' ) + '”.' ); }
					const to = { ...step.to, duration: step.duration, stagger: step.stagger, ease: step.ease, immediateRender: false };
					if ( Object.keys( step.from ).length ) { timeline.fromTo( targets, { ...step.from }, to, step.start ); }
					else { timeline.to( targets, to, step.start ); }
				} );
			} );
		} catch ( error ) { if ( context ) { context.revert(); } else { timeline?.revert(); } throw error; }
		function command( action ) {
			if ( destroyed ) { return false; }
			if ( isReduced ) { if ( row.reduced === 'finish' ) { timeline.totalTime( timeline.duration(), true ).pause(); } return true; }
			if ( action === 'play' ) { timeline.play(); } else if ( action === 'pause' ) { timeline.pause(); } else if ( action === 'restart' ) { timeline.restart(); } else if ( action === 'reverse' ) { timeline.reverse(); } else if ( action === 'reset' ) { timeline.pause( 0, true ); } else { return false; } return true;
		}
		function seek( seconds ) { if ( ! destroyed && ! isReduced ) { timeline.pause().time( Math.max( 0, Math.min( timeline.duration(), seconds ) ), true ); onUpdate( timeline.time(), false ); } }
		function destroy() { if ( destroyed ) { return; } destroyed = true; handles.forEach( fn => fn() ); context.revert(); }
		if ( ! preview && ! isReduced ) {
			if ( row.trigger === 'scroll' && win.ScrollTrigger ) {
				win.gsap.registerPlugin( win.ScrollTrigger );
				const scroll = win.ScrollTrigger.create( { trigger: source, start: 'top ' + row.scrollStart + '%', end: 'bottom ' + row.scrollEnd + '%', animation: timeline, scrub: true, invalidateOnRefresh: true } ); handles.push( () => scroll.kill() );
			} else if ( resume?.started ) {
				timeline.totalTime( Math.min( resume.time, timeline.totalDuration() ), true ).reversed( Boolean( resume.reversed ) ); if ( resume.paused ) { timeline.pause(); } else if ( resume.reversed ) { timeline.reverse(); } else { timeline.play(); }
			} else if ( row.trigger === 'view' && win.IntersectionObserver ) {
				const view = new win.IntersectionObserver( entries => { if ( entries.some( item => item.isIntersecting ) ) { command( 'play' ); view.disconnect(); } }, { threshold: .05 } ); view.observe( source ); handles.push( () => view.disconnect() );
			} else if ( row.trigger !== 'manual' ) { command( 'play' ); }
		} else if ( ! preview && isReduced && row.reduced === 'finish' ) { command( 'play' ); }
		return { command, seek, destroy, duration: () => timeline.duration(), reduced: isReduced, timeline };
	}
	function unmount( source ) { mounted.get( source )?.handles.forEach( handle => handle.destroy() ); mounted.delete( source ); }
	function scan( force = false ) {
		if ( ! active ) { return; }
		mounted.forEach( ( value, source ) => {
			if ( ! source.isConnected || force || source.getAttribute( 'data-lieve-motion' ) !== value.signature ) {
				if ( source.isConnected && source.getAttribute( 'data-lieve-motion' ) === value.signature ) { playback.set( source, { signature: value.signature, states: new Map( value.handles.map( handle => [ handle.id, { time: handle.timeline.totalTime(), paused: handle.timeline.paused(), reversed: handle.timeline.reversed(), started: handle.timeline.totalTime() > 0 || ! handle.timeline.paused() || [ 'manual', 'load' ].includes( handle.trigger ) } ] ) ) } ); }
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
		if ( active || ! model || ! win.gsap ) { return; } active = true;
		if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', scan, { once: true } ); } else { scan(); }
		win.addEventListener( 'resize', schedule ); preference?.addEventListener?.( 'change', schedule );
		if ( win.MutationObserver ) { observer = new win.MutationObserver( schedule ); observer.observe( document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: [ 'data-lieve-motion' ] } ); }
	}
	function destroy() { active = false; win.clearTimeout( timer ); observer?.disconnect(); observer = null; win.removeEventListener( 'resize', schedule ); preference?.removeEventListener?.( 'change', schedule ); document.removeEventListener( 'DOMContentLoaded', scan ); Array.from( mounted.keys() ).forEach( unmount ); }
	return { compile, control, scan, start, destroy, resolve };
} ) );
