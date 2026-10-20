/* Native scroll-snap listings. No cloned slides, dependencies or background timers after teardown. */
( function () {
	'use strict';
	const instances = new Map();
	function create( root, preview = false ) {
		const track = root.querySelector( ':scope > [data-lieve-listing-track]' );
		if ( ! track || root.dataset.listingMode !== 'slider' ) { return null; }
		const items = Array.from( track.children ).filter( item => item.hasAttribute( 'data-lieve-listing-item' ) );
		if ( ! items.length ) { return null; }
		const win = root.ownerDocument.defaultView || window, media = win.matchMedia( '(prefers-reduced-motion: reduce)' );
		const controls = root.querySelector( ':scope > [data-lieve-listing-controls]' ), prev = controls?.querySelector( '[data-listing-prev]' ), next = controls?.querySelector( '[data-listing-next]' ), dots = controls?.querySelector( '[data-listing-dots]' ), pause = controls?.querySelector( '[data-listing-pause]' ), status = controls?.querySelector( '[data-listing-status]' );
		let index = 0, destination = null, stopCache = null, stopKey = '', timer = 0, frame = 0, paused = preview, hovering = false, focusing = false, visible = true, dead = false, gesture = null, suppressClick = false;
		const cleanups = [];
		const listen = ( target, name, handler, options ) => { target?.addEventListener( name, handler, options ); cleanups.push( () => target?.removeEventListener( name, handler, options ) ); };
		const positions = () => { const bounds = track.getBoundingClientRect(); const rtl = win.getComputedStyle( track ).direction === 'rtl'; return items.map( item => { const rect = item.getBoundingClientRect(); return rtl ? bounds.right - rect.right : rect.left - bounds.left; } ); };
		const leading = () => { const bounds = track.getBoundingClientRect(), first = items[0].getBoundingClientRect(); return win.getComputedStyle( track ).direction === 'rtl' ? bounds.right - first.right : first.left - bounds.left; };
		const end = () => Math.max( 0, track.scrollWidth - track.clientWidth );
		const canMove = direction => end() > 1 && ( root.dataset.listingRewind === 'true' || ( direction < 0 ? index > 0 : index < stops().length - 1 ) );
		// Include the terminal partial page exactly once. Dots and arrows share these stops.
		function stops() {
			const key = [ track.clientWidth, track.scrollWidth, root.dataset.listingAdvance ].join( ':' );
			if ( stopCache && stopKey === key ) { return stopCache; } stopKey = key;
			const offsets = positions().map( ( offset, current, all ) => offset - all[0] ), max = end();
			const terminalItem = offsets.reduce( ( best, offset, current ) => offset <= max + 1 ? current : best, 0 );
			const step = root.dataset.listingAdvance === 'page' ? Math.max( 1, offsets.filter( ( offset, current ) => offset + items[current].getBoundingClientRect().width <= track.clientWidth + 1 ).length ) : 1;
			const result = [ { item: 0, offset: 0 } ];
			for ( let current = step; current < items.length && max > 1; current += step ) { const offset = Math.min( max, offsets[current] ); if ( offset > result.at( -1 ).offset + 1 ) { result.push( { item: offset >= max - 1 ? terminalItem : current, offset } ); } if ( offset >= max - 1 ) { break; } }
			if ( max > result.at( -1 ).offset + 1 ) { result.push( { item: terminalItem, offset: max } ); }
			return ( stopCache = result );
		}
		function renderDots( points ) { if ( ! dots ) { return; } const signature = points.map( point => point.item ).join( ',' ); if ( dots.dataset.positions === signature ) { return; } dots.dataset.positions = signature; dots.replaceChildren(); points.forEach( ( point, current ) => { const button = root.ownerDocument.createElement( 'button' ); button.type = 'button'; button.dataset.listingIndex = String( current ); button.setAttribute( 'aria-label', 'Go to item ' + ( point.item + 1 ) ); dots.appendChild( button ); } ); }
		function sync() {
			frame = 0; const points = stops(), position = -leading(); index = points.reduce( ( best, point, current ) => Math.abs( point.offset - position ) < Math.abs( points[best].offset - position ) ? current : best, 0 );
			if ( destination !== null && Math.abs( ( points[destination]?.offset ?? 0 ) - position ) < 1 ) { destination = null; }
			renderDots( points ); if ( controls ) { controls.hidden = end() <= 1; }
			if ( prev ) { prev.disabled = ! canMove( -1 ); } if ( next ) { next.disabled = ! canMove( 1 ); }
			dots?.querySelectorAll( 'button' ).forEach( button => button.setAttribute( 'aria-current', String( Number( button.dataset.listingIndex ) === index ) ) );
			if ( status && ( ! timer || paused ) ) { status.textContent = 'Item ' + ( points[index].item + 1 ) + ' of ' + items.length; }
		}
		function go( target ) {
			const points = stops(); target = Math.max( 0, Math.min( points.length - 1, target ) ); const rtl = win.getComputedStyle( track ).direction === 'rtl'; destination = target;
			track.scrollBy( { left: ( points[target].offset + leading() ) * ( rtl ? -1 : 1 ), behavior: media.matches || root.dataset.listingMotion === 'instant' ? 'instant' : 'smooth' } );
		}
		function schedule() {
			win.clearTimeout( timer ); timer = 0;
			if ( ! root.isConnected ) { instances.get( root )?.destroy(); instances.delete( root ); return; }
			if ( dead || preview || root.dataset.listingAutoplay !== 'true' || paused || hovering || focusing || gesture || ! visible || media.matches || root.ownerDocument.hidden || end() <= 1 ) { return; }
			timer = win.setTimeout( () => { timer = 0; go( index < stops().length - 1 ? index + 1 : 0 ); schedule(); }, Math.max( 2000, Math.min( 60000, Number( root.dataset.listingInterval ) || 5000 ) ) );
		}
		function userMove( direction ) { if ( ! canMove( direction ) ) { return; } const last = stops().length - 1, target = ( destination ?? index ) + direction; go( root.dataset.listingRewind === 'true' ? ( target + last + 1 ) % ( last + 1 ) : target ); schedule(); }
		listen( prev, 'click', () => userMove( -1 ) ); listen( next, 'click', () => userMove( 1 ) );
		listen( track, 'scroll', () => { if ( ! frame ) { frame = win.requestAnimationFrame( sync ); } }, { passive: true } );
		listen( track, 'keydown', event => {
			if ( event.target !== track || ! [ 'ArrowLeft', 'ArrowRight', 'Home', 'End' ].includes( event.key ) ) { return; }
			event.preventDefault(); const rtl = win.getComputedStyle( track ).direction === 'rtl';
			if ( event.key === 'Home' ) { go( 0 ); } else if ( event.key === 'End' ) { go( stops().length - 1 ); } else { userMove( ( event.key === 'ArrowRight' ? 1 : -1 ) * ( rtl ? -1 : 1 ) ); } schedule();
		} );
		listen( dots, 'click', event => { const button = event.target.closest( '[data-listing-index]' ); if ( button && dots.contains( button ) ) { go( Number( button.dataset.listingIndex ) ); schedule(); } } );
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
				if ( event.pointerType !== 'mouse' || event.button !== 0 || end() <= 1 || event.target.closest( 'a,button,input,select,textarea,label,[contenteditable="true"]' ) ) { return; }
				destination = null; gesture = { id: event.pointerId, start: event.clientX, last: event.clientX, moved: false }; schedule();
			} );
			listen( track, 'pointermove', event => {
				if ( ! gesture || event.pointerId !== gesture.id ) { return; }
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
		listen( pause, 'click', () => { paused = ! paused; pause.setAttribute( 'aria-pressed', String( paused ) ); pause.textContent = paused ? 'Start autoplay' : 'Pause autoplay'; schedule(); } );
		if ( pause && preview ) { pause.disabled = true; pause.textContent = 'Autoplay paused in editor'; }
		listen( root, 'pointerenter', () => { hovering = true; schedule(); } ); listen( root, 'pointerleave', () => { hovering = false; schedule(); } );
		listen( root, 'focusin', () => { focusing = true; schedule(); } ); listen( root, 'focusout', event => { focusing = root.contains( event.relatedTarget ); schedule(); } );
		listen( root.ownerDocument, 'visibilitychange', schedule ); listen( media, 'change', schedule );
		const resized = () => { destination = null; stopCache = null; sync(); schedule(); };
		listen( win, 'resize', resized );
		const resize = win.ResizeObserver ? new win.ResizeObserver( resized ) : null; resize?.observe( track ); resize?.observe( items[0] ); if ( items.length > 1 ) { resize?.observe( items.at( -1 ) ); }
		const intersection = win.IntersectionObserver ? new win.IntersectionObserver( entries => { visible = entries[0]?.isIntersecting !== false; schedule(); } ) : null; intersection?.observe( root );
		sync(); schedule();
		return { destroy() { dead = true; endDrag(); win.clearTimeout( timer ); win.cancelAnimationFrame( frame ); resize?.disconnect(); intersection?.disconnect(); cleanups.forEach( cleanup => cleanup() ); } };
	}
	function mount( scope = document, preview = false ) {
		for ( const [ root, instance ] of instances ) { if ( ! root.isConnected ) { instance.destroy(); instances.delete( root ); } }
		const roots = [ ...( scope.matches?.( '[data-lieve-listing]' ) ? [ scope ] : [] ), ...scope.querySelectorAll( '[data-lieve-listing]' ) ];
		for ( const root of roots ) { if ( ! instances.has( root ) ) { const instance = create( root, preview ); if ( instance ) { instances.set( root, instance ); } } }
	}
	function destroy( scope ) { for ( const [ root, instance ] of instances ) { if ( ! scope || root === scope || scope.contains( root ) ) { instance.destroy(); instances.delete( root ); } } }
	window.LieveListings = { mount, destroy, create };
	if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', () => mount(), { once: true } ); } else { mount(); }
	window.addEventListener( 'pagehide', () => destroy() ); window.addEventListener( 'pageshow', () => mount() );
} )();
