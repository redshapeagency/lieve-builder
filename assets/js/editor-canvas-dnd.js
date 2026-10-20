/* Canvas-only direct manipulation. Geometry, not DOM drag targets, owns a slot. */
( function () {
	'use strict';
	const inside = ( rect, point ) => rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
	const distance = ( rect, point ) => Math.hypot( Math.max( rect.left - point.x, 0, point.x - rect.right ), Math.max( rect.top - point.y, 0, point.y - rect.bottom ) );
	/** One canonical parent + next sibling, including flex/grid and empty containers. */
	function resolve( nodes, point, { bounds, source, previous = null } ) {
		if ( ! inside( bounds, point ) ) { return null; }
		function slot( parent, siblings, target, before, area = false, axis = parent?.axis || 'y' ) {
			const index = siblings.indexOf( target );
			const next = before ? target : siblings.slice( index + 1 ).find( node => node.id !== source );
			const rect = area ? parent.rect : target?.rect || parent?.rect || bounds;
			const edge = ( before !== Boolean( parent?.reverse ) ) ? ( axis === 'x' ? rect.left : rect.top ) : ( axis === 'x' ? rect.right : rect.bottom );
			return { parentId: parent?.id || null, beforeId: next?.id || null, targetId: target?.id || parent?.id || null, area, axis, rect: area ? rect : axis === 'x' ? { left: edge, top: rect.top, width: 0, height: rect.height } : { left: parent?.rect.left ?? bounds.left, top: edge, width: parent?.rect.width ?? bounds.width, height: 0 } };
		}
		function visit( parent, siblings ) {
			const visible = siblings.filter( node => node.rect && node.id !== source );
			if ( ! visible.length ) { return parent ? slot( parent, [], null, false, true ) : { parentId: null, beforeId: null, targetId: null, area: true, axis: 'y', rect: bounds }; }
			const target = [ ...visible ].reverse().find( node => inside( node.rect, point ) ) || visible.reduce( ( nearest, node ) => distance( node.rect, point ) < distance( nearest.rect, point ) ? node : nearest );
			// Between grid rows, use the row boundary, not a column's midpoint.
			if ( parent?.grid && parent.axis === 'x' && ( point.y < target.rect.top || point.y > target.rect.bottom ) ) {
				const row = visible.filter( node => node.rect.top < target.rect.bottom && node.rect.bottom > target.rect.top );
				const before = point.y < target.rect.top;
				return slot( parent, siblings, before ? row[0] : row.at( -1 ), before, false, 'y' );
			}
			const axis = parent?.axis || 'y', coordinate = axis === 'x' ? point.x : point.y;
			const start = axis === 'x' ? target.rect.left : target.rect.top, size = axis === 'x' ? target.rect.width : target.rect.height;
			const edge = Math.min( 10, size * .18 );
			// Populated layouts retain child slots across first/last gaps. Only
			// their narrow outer-left boundary deliberately targets the ancestor.
			const childHit = target.children?.some( child => child.id !== source && inside( child.rect, point ) );
			const populated = target.children?.some( child => child.id !== source && child.rect );
			const lane = previous?.parentId === target.id ? 4 : previous?.parentId === ( parent?.id || null ) ? 8 : 6;
			const outerEdge = point.x <= target.rect.left + lane && ( coordinate <= start + edge || coordinate >= start + size - edge );
			if ( target.nestable && inside( target.rect, point ) && ! outerEdge && ( childHit || populated || coordinate > start + edge && coordinate < start + size - edge ) ) { return visit( target, target.children ); }
			let middle = start + size / 2;
			if ( previous?.parentId === ( parent?.id || null ) ) {
				const after = siblings.slice( siblings.indexOf( target ) + 1 ).find( node => node.id !== source )?.id || null;
				if ( previous.beforeId === target.id ) { middle += parent?.reverse ? -3 : 3; }
				else if ( previous.beforeId === after ) { middle += parent?.reverse ? 3 : -3; }
			}
			return slot( parent, siblings, target, ( coordinate < middle ) !== Boolean( parent?.reverse ), false, axis );
		}
		return visit( null, nodes );
	}
	function scrollVelocity( point, bounds ) {
		if ( ! inside( bounds, point ) ) { return 0; }
		const edge = Math.min( 48, bounds.height / 4 );
		if ( point.y < bounds.top + edge ) { return -560 * ( 1 - ( point.y - bounds.top ) / edge ); }
		if ( point.y > bounds.bottom - edge ) { return 560 * ( 1 - ( bounds.bottom - point.y ) / edge ); }
		return 0;
	}
	function create( { canvas, app, viewport, read, nestable, label, icon, dragging, begin, canonical, valid, move, finish } ) {
		const doc = canvas.ownerDocument, owner = app.ownerDocument, win = owner.defaultView;
		const overlay = owner.createElement( 'div' ); overlay.className = 'lieve-canvas-drop-overlay'; overlay.hidden = true; overlay.setAttribute( 'aria-hidden', 'true' );
		const marker = owner.createElement( 'div' ); marker.className = 'lieve-canvas-drop-marker';
		const caption = owner.createElement( 'span' ); caption.className = 'lieve-canvas-drop-caption'; marker.appendChild( caption ); overlay.appendChild( marker ); app.appendChild( overlay );
		const ghost = owner.createElement( 'div' ); ghost.className = 'lieve-canvas-drag-ghost'; ghost.hidden = true; ghost.setAttribute( 'aria-hidden', 'true' ); app.appendChild( ghost );
		let session = null, frame = 0, intent = null, geometry = null, lastTime = 0, suppressClick = false;
		const observed = new Set();
		const observer = win.ResizeObserver ? new win.ResizeObserver( () => { geometry = null; if ( session?.active ) { schedule(); } } ) : null;
		const pointOf = event => event.target?.ownerDocument === doc && viewport ? viewport.point( event.clientX, event.clientY ) : { x: event.clientX, y: event.clientY };
		function measure() {
			const roots = new Map();
			const elements = Array.from( canvas.querySelectorAll( '[data-editor-root]' ) );
			if ( observer ) { const current = new Set( [ canvas, ...elements ] ); observed.forEach( root => { if ( ! current.has( root ) ) { observer.unobserve( root ); observed.delete( root ); } } ); current.forEach( root => { if ( ! observed.has( root ) ) { observer.observe( root ); observed.add( root ); } } ); }
			elements.forEach( root => {
				const rect = viewport ? viewport.toParent( root.getBoundingClientRect() ) : root.getBoundingClientRect();
				if ( ! rect.width || ! rect.height ) { return; }
				const old = roots.get( root.dataset.editorRoot );
				if ( old ) { const left = Math.min( old.rect.left, rect.left ), top = Math.min( old.rect.top, rect.top ), right = Math.max( old.rect.right, rect.right ), bottom = Math.max( old.rect.bottom, rect.bottom ); old.rect = { left, top, right, bottom, width: right - left, height: bottom - top }; }
				else { const css = doc.defaultView.getComputedStyle( root ); roots.set( root.dataset.editorRoot, { rect, axis: css.display.includes( 'flex' ) && css.flexDirection.startsWith( 'row' ) || css.display.includes( 'grid' ) && ! css.gridAutoFlow?.startsWith( 'column' ) ? 'x' : 'y', grid: css.display.includes( 'grid' ), reverse: css.display.includes( 'flex' ) && css.flexDirection.endsWith( 'reverse' ) } ); }
			} );
			const walk = nodes => nodes.map( node => ( { id: node.id, nestable: nestable( node.type ), ...roots.get( node.id ), children: node.id === dragging() ? [] : walk( node.children || [] ) } ) );
			return { nodes: walk( read() ), blocked: Array.from( canvas.querySelectorAll( '[data-inherited-key]' ), root => viewport ? viewport.toParent( root.getBoundingClientRect() ) : root.getBoundingClientRect() ) };
		}
		function hide() { overlay.hidden = true; intent = null; }
		function refresh() {
			if ( ! session?.active || ! dragging() ) { hide(); return; }
			geometry ||= measure();
			const bounds = viewport ? viewport.bounds() : canvas.getBoundingClientRect();
			const destination = geometry.blocked.some( rect => inside( rect, session.point ) ) ? null : resolve( geometry.nodes, session.point, { bounds, source: dragging(), previous: intent } );
			const candidate = destination && canonical( destination.parentId, destination.beforeId );
			if ( ! candidate || ! valid( candidate ) ) { hide(); return; }
			intent = { ...destination, ...candidate };
			const rect = destination.rect, left = Math.max( bounds.left, rect.left ), top = Math.max( bounds.top, rect.top );
			const right = Math.min( bounds.right, rect.left + rect.width ), bottom = Math.min( bounds.bottom, rect.top + rect.height );
			Object.assign( overlay.style, { left: bounds.left + 'px', top: bounds.top + 'px', width: bounds.width + 'px', height: bounds.height + 'px' } );
			Object.assign( marker.style, { left: left - bounds.left + 'px', top: top - bounds.top + 'px', width: Math.max( destination.axis === 'x' ? 2 : 0, right - left ) + 'px', height: Math.max( destination.axis === 'y' ? 2 : 0, bottom - top ) + 'px' } );
			marker.dataset.mode = destination.area ? 'inside' : destination.axis;
			caption.textContent = ( candidate.parentId ? label( candidate.parentId ) : 'Page' ) + ( destination.area ? ' · Inside' : candidate.beforeId ? ' · Before ' + label( candidate.beforeId ) : ' · Last position' );
			caption.style.top = top - bounds.top < 30 ? '6px' : ''; overlay.hidden = false;
		}
		function tick( time ) {
			frame = 0; if ( ! session?.active ) { return; }
			const elapsed = lastTime ? Math.min( 32, time - lastTime ) / 1000 : 1 / 60; lastTime = time;
			const bounds = viewport ? viewport.bounds() : canvas.getBoundingClientRect(), velocity = scrollVelocity( session.point, bounds );
			const scale = Number( viewport?.frame.dataset.previewScale ) || 1, frameRect = viewport?.frame.getBoundingClientRect();
			let target = doc.elementFromPoint?.( frameRect ? ( session.point.x - frameRect.left ) / scale : session.point.x, frameRect ? ( session.point.y - frameRect.top ) / scale : session.point.y );
			let scrolled = false;
			for ( ; target && canvas.contains( target ); target = target.parentElement ) {
				if ( target.scrollHeight <= target.clientHeight || ! /^(auto|scroll)$/.test( doc.defaultView.getComputedStyle( target ).overflowY ) ) { continue; }
				const rect = viewport ? viewport.toParent( target.getBoundingClientRect() ) : target.getBoundingClientRect();
				const clipped = { left: Math.max( bounds.left, rect.left ), right: Math.min( bounds.right, rect.right ), top: Math.max( bounds.top, rect.top ), bottom: Math.min( bounds.bottom, rect.bottom ) }; clipped.height = clipped.bottom - clipped.top;
				const speed = scrollVelocity( session.point, clipped ), before = target.scrollTop; target.scrollTop += speed * elapsed / scale;
				if ( before !== target.scrollTop ) { scrolled = true; break; }
			}
			const scroller = doc.scrollingElement;
			if ( ! scrolled && scroller && velocity ) { const before = scroller.scrollTop; scroller.scrollTop += velocity * elapsed / scale; scrolled = before !== scroller.scrollTop; }
			if ( scrolled ) { geometry = null; frame = win.requestAnimationFrame( tick ); }
			if ( session.pointerId !== undefined ) { ghost.style.transform = 'translate3d(' + ( session.point.x - 14 ) + 'px,' + ( session.point.y - 14 ) + 'px,0)'; }
			refresh();
		}
		function schedule() { if ( ! frame ) { frame = win.requestAnimationFrame( tick ); } }
		function stop( commit = false ) {
			const current = session, destination = intent; session = null; intent = null; geometry = null; lastTime = 0;
			if ( current?.hold ) { win.clearTimeout( current.hold ); }
			win.cancelAnimationFrame( frame ); frame = 0; overlay.hidden = true; ghost.hidden = true;
			observer?.disconnect(); observed.clear();
			app.classList.remove( 'is-dragging-canvas' ); doc.body.classList.remove( 'is-dragging-canvas' );
			canvas.querySelectorAll( '.is-canvas-source' ).forEach( root => root.classList.remove( 'is-canvas-source' ) );
			if ( current?.pointerId !== undefined && canvas.hasPointerCapture?.( current.pointerId ) ) { canvas.releasePointerCapture( current.pointerId ); }
			if ( current?.active ) { suppressClick = current.pointerId !== undefined; if ( commit && destination && valid( destination ) ) { move( destination ); } finish(); }
		}
		function start( id ) {
			begin( id ); session.active = true; geometry = null; app.classList.add( 'is-dragging-canvas' ); doc.body.classList.add( 'is-dragging-canvas' );
			canvas.querySelectorAll( '[data-editor-root]' ).forEach( root => { if ( root.dataset.editorRoot === id ) { root.classList.add( 'is-canvas-source' ); } } );
			if ( session.pointerId !== undefined ) {
				const selection = doc.getSelection?.(); if ( selection?.rangeCount && canvas.contains( selection.anchorNode?.parentElement || selection.anchorNode ) ) { selection.removeAllRanges(); }
				ghost.innerHTML = '<span class="lieve-canvas-drag-grip">' + icon( id ) + '</span><span></span>'; ghost.lastElementChild.textContent = label( id ); ghost.hidden = false;
				ghost.style.transform = 'translate3d(' + ( session.point.x - 14 ) + 'px,' + ( session.point.y - 14 ) + 'px,0)'; canvas.setPointerCapture( session.pointerId );
			}
		}
		canvas.addEventListener( 'pointerdown', event => {
			if ( session && session.pointerId !== event.pointerId && event.pointerType === 'touch' ) { stop(); return; }
			if ( event.button !== 0 || event.isPrimary === false || session ) { return; }
			const root = event.target.closest?.( '[data-editor-root]' ); if ( ! root || event.target.closest( '[data-editor-ui]' ) && event.target.closest( 'button,a,input,select,textarea' ) ) { return; }
			if ( root.hasAttribute?.( 'data-editor-popup-shell' ) ) { return; }
			const point = pointOf( event ); session = { id: root.dataset.editorRoot, point, origin: point, pointerId: event.pointerId, active: false, touch: event.pointerType === 'touch' }; suppressClick = false;
			if ( session.touch ) { const current = session; current.hold = win.setTimeout( () => { if ( session === current ) { current.hold = null; start( current.id ); schedule(); } }, 450 ); }
		} );
		function pointerMove( event ) {
			if ( session?.pointerId !== event.pointerId ) { return; }
			session.point = pointOf( event );
			if ( session.touch && ! session.active ) { if ( Math.hypot( session.point.x - session.origin.x, session.point.y - session.origin.y ) >= 8 ) { stop(); } return; }
			if ( ! session.active && Math.hypot( session.point.x - session.origin.x, session.point.y - session.origin.y ) >= 5 ) { start( session.id ); }
			if ( session.active ) { event.preventDefault(); schedule(); }
		}
		function pointerUp( event ) { if ( session?.pointerId === event.pointerId ) { if ( session.active ) { session.point = pointOf( event ); refresh(); } stop( true ); } }
		canvas.addEventListener( 'pointercancel', event => { if ( session?.pointerId === event.pointerId ) { stop(); } } );
		canvas.addEventListener( 'contextmenu', event => { if ( session?.touch && session.active ) { event.preventDefault(); } } );
		canvas.addEventListener( 'lostpointercapture', () => { if ( session ) { stop(); } } );
		canvas.addEventListener( 'click', event => { if ( suppressClick ) { suppressClick = false; event.preventDefault(); event.stopImmediatePropagation(); } }, true );
		canvas.addEventListener( 'dragstart', event => event.preventDefault(), true );
		function nativeOver( event ) {
			if ( ! dragging() || session?.pointerId !== undefined ) { return; }
			if ( ! session ) { session = { active: false, point: pointOf( event ) }; start( dragging() ); }
			session.point = pointOf( event ); refresh(); schedule();
			event.stopPropagation(); if ( intent ) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } else { event.dataTransfer.dropEffect = 'none'; }
		}
		canvas.addEventListener( 'dragenter', nativeOver ); canvas.addEventListener( 'dragover', nativeOver );
		canvas.addEventListener( 'drop', event => { if ( ! session || session.pointerId !== undefined ) { return; } event.preventDefault(); event.stopPropagation(); session.point = pointOf( event ); refresh(); stop( true ); } );
		[ ...new Set( [ owner, doc ] ) ].forEach( target => {
			target.addEventListener( 'touchmove', event => { if ( session?.touch && session.active ) { event.preventDefault(); } }, { passive: false } );
			target.addEventListener( 'touchstart', event => { if ( session?.touch && event.touches?.length > 1 ) { stop(); } }, { passive: true } );
			target.addEventListener( 'pointermove', pointerMove );
			target.addEventListener( 'pointerup', pointerUp );
			target.addEventListener( 'keydown', event => { if ( session?.active && event.key === 'Escape' ) { event.preventDefault(); event.stopPropagation(); stop(); } }, true );
			target.addEventListener( 'dragend', () => { if ( session?.pointerId === undefined ) { stop(); } }, true );
			target.addEventListener( 'scroll', () => { if ( session?.active ) { geometry = null; schedule(); } }, true );
			target.addEventListener( 'dragover', event => { if ( session?.active && session.pointerId === undefined && ! canvas.contains( event.target ) ) { session.point = pointOf( event ); hide(); win.cancelAnimationFrame( frame ); frame = 0; } }, true );
			target.addEventListener( 'visibilitychange', () => { if ( target.hidden ) { stop(); } } );
		} );
		win.addEventListener( 'resize', () => { geometry = null; if ( session?.active ) { schedule(); } } );
		// Moving focus into the iframe is not leaving the editor window.
		win.addEventListener( 'blur', () => win.requestAnimationFrame( () => { if ( session?.pointerId !== undefined && ! owner.hasFocus() ) { stop(); } } ) );
		return { cancel: () => stop(), invalidate() { geometry = null; if ( session?.active ) { schedule(); } } };
	}
	window.LieveCanvasDrag = { resolve, scrollVelocity, create };
}() );
