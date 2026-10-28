/* Native scroll-snap listings. No cloned slides, dependencies or background timers after teardown. */
( function () {
	'use strict';
	const instances = new Map(), rendererPreviews = new WeakSet(), rendererRoots = new WeakSet(), ownership = new WeakMap(), observedDocuments = new Map();
	const attached = ( root, doc, frame ) => root.isConnected && root.ownerDocument === doc && ( ! frame || frame.isConnected && frame.contentDocument === doc );
	function observeDocument( doc ) {
		if ( observedDocuments.has( doc ) || ! window.MutationObserver ) { return; }
		// A DOM operation may remove and reinsert a live root. Judge removal at
		// the mutation batch boundary, never during another Listing's mount.
		const frame = doc.defaultView?.frameElement;
		const sweep = () => {
			for ( const [ root, instance ] of instances ) {
				const owner = ownership.get( instance );
				if ( owner.doc === doc && ( ! attached( root, doc, frame ) || owner.track.parentElement !== root ) ) { instance.destroy(); }
			}
		};
		const observer = new window.MutationObserver( sweep ); observer.observe( doc, { childList: true, subtree: true } );
		if ( frame ) { observer.observe( frame.ownerDocument, { childList: true, subtree: true } ); frame.addEventListener( 'load', sweep ); }
		observedDocuments.set( doc, { observer, frame, sweep } );
	}
	function release( root, instance ) {
		if ( instances.get( root ) !== instance ) { return; }
		const doc = ownership.get( instance ).doc; instances.delete( root ); ownership.delete( instance );
		if ( ! Array.from( instances.values() ).some( item => ownership.get( item ).doc === doc ) ) { const scope = observedDocuments.get( doc ); scope?.observer.disconnect(); scope?.frame?.removeEventListener( 'load', scope.sweep ); observedDocuments.delete( doc ); }
	}
	function create( root, preview = false, binding = null ) {
		if ( ! binding && rendererRoots.has( root ) ) { return null; }
		// No controller, listeners or observers are retained for a pending host.
		// The renderer calls mount again after adopting its completed fragment.
		const ownerDocument = root.ownerDocument, ownerFrame = ownerDocument.defaultView?.frameElement;
		if ( ! ownerDocument.defaultView || ! attached( root, ownerDocument, ownerFrame ) ) { return null; }
		const previous = instances.get( root );
		if ( previous ) {
			// The public API must never return a renderer's private command engine.
			if ( rendererPreviews.has( previous ) ) { return null; }
			const owner = ownership.get( previous );
			if ( owner.doc === root.ownerDocument && owner.track === root.querySelector( ':scope > [data-lieve-listing-track]' ) && root.dataset.listingMode === 'slider' ) { return previous; }
			previous.destroy();
		}
		const track = binding ? binding.track : root.querySelector( ':scope > [data-lieve-listing-track]' );
		if ( ! track || ( binding ? binding.settings.mode : root.dataset.listingMode ) !== 'slider' ) { return null; }
		const items = binding ? binding.items.slice() : Array.from( track.children ).filter( item => item.hasAttribute( 'data-lieve-listing-item' ) );
		if ( ! items.length ) { return null; }
		const win = root.ownerDocument.defaultView || window, media = win.matchMedia( '(prefers-reduced-motion: reduce)' );
		const controls = binding ? binding.controls : root.querySelector( ':scope > [data-lieve-listing-controls]' ), prev = binding ? binding.prev : controls?.querySelector( '[data-listing-prev]' ), next = binding ? binding.next : controls?.querySelector( '[data-listing-next]' ), dots = binding ? binding.dots : controls?.querySelector( '[data-listing-dots]' ), pause = binding ? binding.pause : controls?.querySelector( '[data-listing-pause]' ), status = binding ? binding.status : controls?.querySelector( '[data-listing-status]' );
		// The script-disabled composition document cannot run its own rAF callbacks.
		// Only the renderer-owned preview uses the parent clock and verified DOM refs.
		const clock = preview ? window : win, setting = name => binding ? binding.settings[ name ] : root.dataset[ 'listing' + name[0].toUpperCase() + name.slice( 1 ) ];
		let dotRecords = [], dotSignature = null, revision = 0, navigationFrame = 0, navigationTicks = 0, lastState = '';
		const samples = [];
		let index = 0, destination = null, stopCache = null, stopKey = '', timer = 0, frame = 0, paused = preview, hovering = false, focusing = false, visible = true, dead = false, gesture = null, suppressClick = false;
		const cleanups = [];
		const listen = ( target, name, handler, options ) => { target?.addEventListener( name, handler, options ); cleanups.push( () => target?.removeEventListener( name, handler, options ) ); };
		const positions = () => { const bounds = track.getBoundingClientRect(); const rtl = win.getComputedStyle( track ).direction === 'rtl'; return items.map( item => { const rect = item.getBoundingClientRect(); return rtl ? bounds.right - rect.right : rect.left - bounds.left; } ); };
		const leading = () => { const bounds = track.getBoundingClientRect(), first = items[0].getBoundingClientRect(); return win.getComputedStyle( track ).direction === 'rtl' ? bounds.right - first.right : first.left - bounds.left; };
		const end = () => Math.max( 0, track.scrollWidth - track.clientWidth );
		const current = () => ! dead && attached( root, ownerDocument, ownerFrame ) && root.contains( track ) && ( binding ? binding.current() : root.querySelector( ':scope > [data-lieve-listing-track]' ) === track );
		const canMove = direction => current() && end() > 1 && ( setting( 'rewind' ) === 'true' || ( direction < 0 ? index > 0 : index < stops().length - 1 ) );
		// Include the terminal partial page exactly once. Dots and arrows share these stops.
		function stops() {
			const key = [ track.clientWidth, track.scrollWidth, setting( 'advance' ) ].join( ':' );
			if ( stopCache && stopKey === key ) { return stopCache; } stopKey = key;
			const offsets = positions().map( ( offset, current, all ) => offset - all[0] ), max = end();
			const terminalItem = offsets.reduce( ( best, offset, current ) => offset <= max + 1 ? current : best, 0 );
			const step = setting( 'advance' ) === 'page' ? Math.max( 1, offsets.filter( ( offset, current ) => offset + items[current].getBoundingClientRect().width <= track.clientWidth + 1 ).length ) : 1;
			const result = [ { item: 0, offset: 0 } ];
			for ( let current = step; current < items.length && max > 1; current += step ) { const offset = Math.min( max, offsets[current] ); if ( offset > result.at( -1 ).offset + 1 ) { result.push( { item: offset >= max - 1 ? terminalItem : current, offset } ); } if ( offset >= max - 1 ) { break; } }
			if ( max > result.at( -1 ).offset + 1 ) { result.push( { item: terminalItem, offset: max } ); }
			return ( stopCache = result );
		}
		function renderDots( points ) {
			if ( ! dots ) { return; } const signature = points.map( point => point.item ).join( ',' );
			if ( ( binding ? dotSignature : dots.dataset.positions ) === signature ) { return; }
			dotSignature = signature; dots.dataset.positions = signature; dots.replaceChildren(); dotRecords = [];
			points.forEach( ( point, current ) => { const button = root.ownerDocument.createElement( 'button' ); button.type = 'button'; button.dataset.listingIndex = String( current ); button.setAttribute( 'aria-label', 'Go to item ' + ( point.item + 1 ) ); dots.appendChild( button ); dotRecords.push( Object.freeze( { element: button, index: current, item: point.item } ) ); } );
			if ( binding ) { revision++; binding.onControls( Object.freeze( dotRecords.slice() ), revision ); }
		}
		function sync() {
			if ( binding && frame ) { clock.cancelAnimationFrame( frame ); } frame = 0; if ( ! current() ) { return; } const started = binding ? performance.now() : 0, points = stops(), position = -leading(); index = points.reduce( ( best, point, current ) => Math.abs( point.offset - position ) < Math.abs( points[best].offset - position ) ? current : best, 0 );
			if ( destination !== null && Math.abs( ( points[destination]?.offset ?? 0 ) - position ) < 1 ) { destination = null; }
			renderDots( points ); if ( controls ) { controls.hidden = end() <= 1; }
			if ( prev ) { prev.disabled = ! canMove( -1 ); } if ( next ) { next.disabled = ! canMove( 1 ); }
			if ( binding ) { dotRecords.forEach( dot => dot.element.setAttribute( 'aria-current', String( dot.index === index ) ) ); }
			else { dots?.querySelectorAll( 'button' ).forEach( button => button.setAttribute( 'aria-current', String( Number( button.dataset.listingIndex ) === index ) ) ); }
			if ( status && ( ! timer || paused ) ) { status.textContent = 'Item ' + ( points[index].item + 1 ) + ' of ' + items.length; }
			if ( binding ) { const state = [ index, points.length, canMove( -1 ), canMove( 1 ) ].join( ':' ); if ( lastState !== state ) { lastState = state; binding.onChange(); } if ( samples.length < 2000 ) { samples.push( { kind: 'sync', ms: performance.now() - started } ); } }
		}
		// Observe only an in-flight native smooth scroll, for at most 120 frames.
		// No continuous timer, alternate animation, or fabricated active position.
		function observeNavigation() {
			navigationFrame = 0; if ( ! current() ) { return; } sync();
			if ( destination !== null && ++navigationTicks < 120 ) { navigationFrame = clock.requestAnimationFrame( observeNavigation ); }
		}
		function go( target ) {
			if ( ! current() ) { return; }
			const points = stops(); target = Math.max( 0, Math.min( points.length - 1, target ) ); const rtl = win.getComputedStyle( track ).direction === 'rtl'; destination = target;
			track.scrollBy( { left: ( points[target].offset + leading() ) * ( rtl ? -1 : 1 ), behavior: media.matches || setting( 'motion' ) === 'instant' ? 'instant' : 'smooth' } );
			if ( binding ) { sync(); navigationTicks = 0; if ( destination !== null && ! navigationFrame ) { navigationFrame = clock.requestAnimationFrame( observeNavigation ); } }
		}
		function schedule() {
			win.clearTimeout( timer ); timer = 0;
			if ( ! current() || preview || root.dataset.listingAutoplay !== 'true' || paused || hovering || focusing || gesture || ! visible || media.matches || root.ownerDocument.hidden || end() <= 1 ) { return; }
			timer = win.setTimeout( () => { timer = 0; if ( ! current() ) { return; } go( index < stops().length - 1 ? index + 1 : 0 ); schedule(); }, Math.max( 2000, Math.min( 60000, Number( root.dataset.listingInterval ) || 5000 ) ) );
		}
		function userMove( direction ) { if ( ! canMove( direction ) ) { return; } const last = stops().length - 1, target = ( destination ?? index ) + direction; go( setting( 'rewind' ) === 'true' ? ( target + last + 1 ) % ( last + 1 ) : target ); schedule(); }
		if ( ! binding ) { listen( prev, 'click', () => userMove( -1 ) ); listen( next, 'click', () => userMove( 1 ) ); }
		listen( track, 'scroll', () => { if ( ! frame && current() ) { frame = clock.requestAnimationFrame( sync ); } }, { passive: true } );
		if ( ! binding ) { listen( track, 'keydown', event => {
			if ( ! current() || event.target !== track || ! [ 'ArrowLeft', 'ArrowRight', 'Home', 'End' ].includes( event.key ) ) { return; }
			event.preventDefault(); const rtl = win.getComputedStyle( track ).direction === 'rtl';
			if ( event.key === 'Home' ) { go( 0 ); } else if ( event.key === 'End' ) { go( stops().length - 1 ); } else { userMove( ( event.key === 'ArrowRight' ? 1 : -1 ) * ( rtl ? -1 : 1 ) ); } schedule();
		} );
		listen( dots, 'click', event => { const button = event.target.closest( '[data-listing-index]' ); if ( button && dots.contains( button ) ) { go( Number( button.dataset.listingIndex ) ); schedule(); } } ); }
		// Native touch/trackpad scrolling remains untouched; mouse dragging is public-only.
		function endDrag() {
			if ( ! gesture ) { return; } const active = gesture; gesture = null;
			track.classList.remove( 'is-listing-dragging' );
			if ( track.hasPointerCapture?.( active.id ) ) { track.releasePointerCapture( active.id ); }
			if ( active.moved ) { suppressClick = true; sync(); go( index ); } schedule();
		}
		if ( ! preview && root.dataset.listingDrag !== 'false' ) {
			listen( track, 'pointerdown', event => {
				suppressClick = false;
				if ( ! current() || event.pointerType !== 'mouse' || event.button !== 0 || end() <= 1 || event.target.closest( 'a,button,input,select,textarea,label,[contenteditable="true"]' ) ) { return; }
				destination = null; gesture = { id: event.pointerId, start: event.clientX, last: event.clientX, moved: false }; schedule();
			} );
			listen( track, 'pointermove', event => {
				if ( ! current() || ! gesture || event.pointerId !== gesture.id ) { return; }
				if ( ! gesture.moved && Math.abs( event.clientX - gesture.start ) < 6 ) { return; }
				if ( ! gesture.moved ) { gesture.moved = true; track.classList.add( 'is-listing-dragging' ); track.setPointerCapture?.( event.pointerId ); }
				event.preventDefault(); track.scrollBy( { left: gesture.last - event.clientX, behavior: 'instant' } ); gesture.last = event.clientX;
			} );
			listen( win, 'pointerup', endDrag ); listen( track, 'pointercancel', endDrag ); listen( track, 'lostpointercapture', endDrag );
			listen( track, 'dragstart', event => { if ( gesture ) { event.preventDefault(); } } );
			listen( track, 'click', event => { if ( suppressClick && event.detail !== 0 ) { suppressClick = false; event.preventDefault(); event.stopPropagation(); } }, true );
		}
		listen( track, 'wheel', () => { destination = null; }, { passive: true } );
		listen( track, 'pointerdown', () => { destination = null; }, { passive: true } );
		if ( ! binding ) { listen( pause, 'click', () => { paused = ! paused; pause.setAttribute( 'aria-pressed', String( paused ) ); pause.textContent = paused ? 'Start autoplay' : 'Pause autoplay'; schedule(); } ); }
		if ( pause && preview ) { pause.disabled = true; pause.textContent = 'Autoplay paused in editor'; }
		if ( ! binding ) { listen( root, 'pointerenter', () => { hovering = true; schedule(); } ); listen( root, 'pointerleave', () => { hovering = false; schedule(); } );
		listen( root, 'focusin', () => { focusing = true; schedule(); } ); listen( root, 'focusout', event => { focusing = root.contains( event.relatedTarget ); schedule(); } );
		listen( root.ownerDocument, 'visibilitychange', schedule ); listen( media, 'change', schedule ); }
		const resized = () => { destination = null; stopCache = null; sync(); schedule(); };
		listen( clock, 'resize', resized );
		const resize = clock.ResizeObserver ? new clock.ResizeObserver( resized ) : null; resize?.observe( track ); resize?.observe( items[0] ); if ( items.length > 1 ) { resize?.observe( items.at( -1 ) ); }
		const intersection = ! binding && win.IntersectionObserver ? new win.IntersectionObserver( entries => { visible = entries[0]?.isIntersecting !== false; schedule(); } ) : null; intersection?.observe( root );
		sync(); schedule();
		const instance = { destroy() { if ( dead ) { return; } dead = true; endDrag(); win.clearTimeout( timer ); clock.cancelAnimationFrame( frame ); clock.cancelAnimationFrame( navigationFrame ); frame = navigationFrame = timer = 0; resize?.disconnect(); intersection?.disconnect(); cleanups.splice( 0 ).forEach( cleanup => cleanup() ); dotRecords = []; release( root, instance ); binding?.onChange?.( 'destroy' ); } };
		if ( binding ) {
			Object.assign( instance, {
				current, canMove,
				selected: target => current() && index === target,
				controlCurrent: ( element, target, version ) => current() && version === revision && dotRecords[ target ]?.element === element && element.parentElement === dots,
				move( direction ) { if ( ! [ -1, 1 ].includes( direction ) || ! current() || ! binding.validate() || ! canMove( direction ) ) { return false; } const started = performance.now(); userMove( direction ); if ( samples.length < 2000 ) { samples.push( { kind: 'move', ms: performance.now() - started } ); } return true; },
				index( target ) { if ( ! Number.isSafeInteger( target ) || ! current() || ! binding.validate() || target < 0 || target >= stops().length ) { return false; } const started = performance.now(); go( target ); if ( samples.length < 2000 ) { samples.push( { kind: 'index', ms: performance.now() - started } ); } return true; },
				stats: () => ( { dead, items: items.length, index, stops: dead ? 0 : stops().length, controls: dotRecords.length, listeners: cleanups.length, observers: ! dead && resize ? 1 : 0, frames: Number( Boolean( frame ) ) + Number( Boolean( navigationFrame ) ), timers: Number( Boolean( timer ) ), samples: samples.slice() } ),
			} );
		}
		instances.set( root, instance ); ownership.set( instance, { doc: ownerDocument, track } ); observeDocument( ownerDocument );
		return instance;
	}
	function mount( scope = document, preview = false ) {
		const roots = [ ...( scope.matches?.( '[data-lieve-listing]' ) ? [ scope ] : [] ), ...scope.querySelectorAll( '[data-lieve-listing]' ) ];
		for ( const root of roots ) { create( root, preview ); }
	}
	function destroy( scope ) { for ( const [ root, instance ] of instances ) { if ( ! scope || root === scope || scope.contains( root ) ) { instance.destroy(); instances.delete( root ); } } }
	// Called only by the opted-in renderer with privately owned refs and guards.
	// The legacy/public mount path neither calls this API nor installs commands.
	function createPreview( root, binding ) {
		if ( ! binding || ! Array.isArray( binding.items ) || ! binding.items.length || binding.items.length > 20 || ! binding.current() || binding.track.parentElement !== root || binding.items.some( item => item.parentElement !== binding.track ) ) { return null; }
		instances.get( root )?.destroy(); instances.delete( root );
		const instance = create( root, true, binding ); if ( instance ) { instances.set( root, instance ); rendererPreviews.add( instance ); rendererRoots.add( root ); } return instance;
	}
	window.LieveListings = { mount, destroy, create, createPreview };
	if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', () => mount(), { once: true } ); } else { mount(); }
	window.addEventListener( 'pagehide', event => { for ( const [ root, instance ] of instances ) { if ( ! event.persisted || ! rendererPreviews.has( instance ) ) { instance.destroy(); instances.delete( root ); } } } ); window.addEventListener( 'pageshow', () => mount() );
} )();
