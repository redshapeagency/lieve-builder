/* Canvas-only direct manipulation. Geometry, not DOM drag targets, owns a slot. */
( function () {
	'use strict';
	const inside = ( rect, point ) => rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
	const distance = ( rect, point ) => Math.hypot( Math.max( rect.left - point.x, 0, point.x - rect.right ), Math.max( rect.top - point.y, 0, point.y - rect.bottom ) );
	/** One canonical parent + next sibling, including flex/grid and empty containers. */
	function resolve( nodes, point, { bounds, source, previous = null, painted = null } ) {
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
			const target = painted?.size && visible.find( node => painted.has( node.id ) ) || [ ...visible ].reverse().find( node => inside( node.rect, point ) ) || visible.reduce( ( nearest, node ) => distance( node.rect, point ) < distance( nearest.rect, point ) ? node : nearest );
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
	/* Passive parent transport. The legacy resolver and Structure mutation core are shared. */
	function createParent( { viewport, controller, structure, document: documents, context, onError = () => {} } ) {
		let surface = null, hitAt = null, session = null, state = 'created', phase = 'idle', frame = 0, epoch = 0;
		let overlay = null, marker = null, caption = null, ghost = null, intent = null, geometry = null, dirtyGeometry = true;
		let mutation = null, resize = null, lastTime = 0, suppressClick = false;
		let canvas = viewport.canvas, doc = viewport.document, owner = viewport.frame.ownerDocument, win = owner.defaultView, app = context.app;
		const guards = [], listeners = [], data = { acquisitions: [], activations: [], moves: [], zones: [], commits: [], errors: [], starts: 0, completed: 0, cancelled: 0, scans: 0, measurements: 0, validations: 0, pointermoves: 0 };
		const sample = ( key, value ) => { if ( data[ key ].length < 2000 ) { data[ key ].push( value ); } };
		const listen = ( list, target, type, callback, options ) => { target.addEventListener( type, callback, options ); list.push( () => target.removeEventListener( type, callback, options ) ); };
		const clear = list => list.splice( 0 ).forEach( remove => remove() );
		const registry = () => controller.canvasIdentity();
		const opaque = value => value?.reason === 'preview-contents-unmapped' || value?.identity?.context?.contents === 'unmapped';
		const selectable = value => value?.status === 'resolved' && ! opaque( value ) && typeof value.identity?.selectId === 'string';
		function report( code ) { sample( 'errors', { code } ); try { onError( Object.assign( new Error( 'Canvas drag unavailable (' + code + ').' ), { code } ) ); } catch ( error ) { /* Cleanup cannot be vetoed by diagnostics. */ } }
		function validSession() {
			if ( ! session || state !== 'mounted' || session.model !== context.state.document || viewport.frame.contentDocument !== doc || ! viewport.frame.isConnected || ! surface?.isConnected || ! canvas.isConnected || viewport.canvas !== canvas || surface.parentElement !== viewport.frame.parentElement || ! surface.hasPointerCapture( session.pointerId ) ) { return false; }
			const stats = registry().stats(), source = registry().resolve( session.element );
			return ! stats.destroyed && stats.generation === session.generation && stats.registrations === session.registrations && selectable( source ) && source.identity.instance === session.instance && source.identity.selectId === session.id && context.state.draggingId === ( phase === 'pending' ? null : session.id );
		}
		function indexGeometry() {
			const elements = new Map(), models = new Map(), parents = new Map();
			const walk = ( nodes, parent = null ) => nodes.forEach( node => { models.set( node.id, node ); parents.set( node.id, parent ); walk( node.children || [], node.id ); } ); walk( context.state.document.children );
			// One bounded traversal at acquisition. Prune opaque previews and leaf contents;
			// attributes never provide identities. Registered visuals replace their wrappers.
			function visit( element ) {
				const result = registry().resolve( element ), identity = result.identity;
				if ( result.via === 'direct' && identity?.selectId && models.has( identity.selectId ) ) {
					const rect = element.getBoundingClientRect();
					if ( ! elements.has( identity.selectId ) || rect.width > 0 && rect.height > 0 ) { elements.set( identity.selectId, element ); }
				}
				if ( opaque( result ) || result.status === 'opaque' || result.via === 'direct' && identity && ! context.canNest( identity.type ) && element.children.length === 0 ) { return; }
				for ( const child of element.children ) { visit( child ); }
			}
			visit( canvas ); data.scans++; return { elements, models, parents, nodes: [], layout: new Map() };
		}
		function measure() {
			geometry.layout.clear();
			const walk = nodes => nodes.map( node => {
				const element = geometry.elements.get( node.id ), value = element && registry().resolve( element );
				if ( ! element || ! value?.identity ) { return { id: node.id, children: [] }; }
				const rect = viewport.toParent( element.getBoundingClientRect() ), css = doc.defaultView.getComputedStyle( element );
				const matrix = new win.DOMMatrixReadOnly( css.transform === 'none' ? undefined : css.transform );
				const unsupported = ! matrix.is2D || matrix.b || matrix.c || matrix.a <= 0 || matrix.d <= 0 || css.perspective && css.perspective !== 'none' || css.rotate && css.rotate !== 'none' && css.rotate !== '0deg' || css.scale && css.scale !== 'none' && ! /^(?:1|1 1)$/.test( css.scale ) || css.translate && css.translate !== 'none' && css.translate.split( /\s+/ ).length > 2 || css.position === 'fixed' || css.position === 'absolute' || css.order && css.order !== '0' || css.gridColumnStart && css.gridColumnStart !== 'auto' || css.gridRowStart && css.gridRowStart !== 'auto' || css.gridAutoFlow?.includes( 'dense' ) || css.writingMode && css.writingMode !== 'horizontal-tb' || css.direction === 'rtl';
				const blocked = opaque( value ) || unsupported;
				const result = { id: node.id, element, blocked, rect: rect.width > 0 && rect.height > 0 ? rect : null,
					nestable: ! blocked && node.type !== 'component' && context.canNest( node.type ),
					axis: css.display.includes( 'flex' ) && css.flexDirection.startsWith( 'row' ) || css.display.includes( 'grid' ) && ! css.gridAutoFlow?.startsWith( 'column' ) ? 'x' : 'y',
					grid: css.display.includes( 'grid' ), reverse: css.display.includes( 'flex' ) && css.flexDirection.endsWith( 'reverse' ),
					children: blocked || node.id === session.id ? [] : walk( node.children || [] ) }; geometry.layout.set( node.id, result ); return result;
			} );
			geometry.nodes = walk( context.state.document.children ); dirtyGeometry = false; data.measurements++;
		}
		function hide() { intent = null; if ( overlay ) { overlay.hidden = true; } if ( surface ) { surface.style.cursor = phase === 'dragging' ? 'not-allowed' : ''; } }
		function feedback() {
			overlay = owner.createElement( 'div' ); overlay.className = 'lieve-canvas-drop-overlay'; overlay.dataset.lieveParentDrop = ''; overlay.hidden = true; overlay.setAttribute( 'aria-hidden', 'true' );
			marker = owner.createElement( 'div' ); marker.className = 'lieve-canvas-drop-marker'; caption = owner.createElement( 'span' ); caption.className = 'lieve-canvas-drop-caption'; marker.appendChild( caption ); overlay.appendChild( marker ); app.appendChild( overlay );
			ghost = owner.createElement( 'div' ); ghost.className = 'lieve-canvas-drag-ghost'; ghost.setAttribute( 'aria-hidden', 'true' );
			const grip = owner.createElement( 'span' ); grip.className = 'lieve-canvas-drag-grip'; grip.textContent = '⠿'; ghost.appendChild( grip );
			const name = owner.createElement( 'span' ); name.textContent = geometry.models.get( session.id )?.props?.editorLabel || context.labels[ geometry.models.get( session.id )?.type ] || 'Element'; ghost.appendChild( name ); app.appendChild( ghost ); app.classList.add( 'is-dragging-canvas' );
		}
		function refresh( force = false ) {
			if ( ! validSession() ) { cancel( 'stale' ); return null; }
			const started = performance.now(), point = session.point, hit = hitAt( point.x, point.y );
			if ( hit.status !== 'canvas' && ( ! selectable( hit.identity ) || ! geometry.elements.has( hit.identity.identity.selectId ) || context.containsId( geometry.models.get( session.id ), hit.identity.identity.selectId ) ) ) { hide(); return null; }
			// Current paint target plus frame/scroll changes invalidate cached measurements.
			const frameRect = viewport.frame.getBoundingClientRect(), root = doc.scrollingElement;
			// Legacy toParent() owns the viewport scale, but not an extra parent CSS
			// scale or frame border. Never project a slot with a mismatched basis.
			const basis = viewport.toParent( { left: 0, top: 0, width: 1, height: 1 } );
			if ( viewport.frame.clientLeft || viewport.frame.clientTop || Math.abs( basis.width - frameRect.width / viewport.frame.offsetWidth ) > .001 || Math.abs( basis.height - frameRect.height / viewport.frame.offsetHeight ) > .001 ) { hide(); return null; }
			const signature = [ frameRect.left, frameRect.top, frameRect.width, frameRect.height, root?.scrollTop, root?.scrollLeft, viewport.stage.scrollTop, viewport.stage.scrollLeft ].join( ':' );
			if ( signature !== session.signature ) { dirtyGeometry = true; session.signature = signature; }
			const paintedId = hit.identity?.identity?.selectId, paintedElement = geometry.elements.get( paintedId ), cached = geometry.layout.get( paintedId )?.rect;
			if ( paintedElement && cached ) { const current = viewport.toParent( paintedElement.getBoundingClientRect() ); if ( [ 'left', 'top', 'width', 'height' ].some( key => current[ key ] !== cached[ key ] ) ) { dirtyGeometry = true; } }
			if ( force || dirtyGeometry ) { measure(); }
			const bounds = viewport.bounds(), targetId = hit.identity?.identity?.selectId;
			if ( targetId && ( ! geometry.layout.has( targetId ) || geometry.layout.get( targetId ).blocked ) ) { hide(); return null; }
			const painted = new Set(); for ( let id = targetId; id; id = geometry.parents.get( id ) ) { painted.add( id ); }
			const destination = resolve( geometry.nodes, point, { bounds, source: session.id, previous: intent, painted } );
			if ( ! destination ) { hide(); return null; }
			let validation = session.validation;
			if ( force || ! validation || validation.parentId !== destination.parentId || validation.beforeId !== destination.beforeId ) {
				const candidate = structure.treeDropDestination( destination.parentId, destination.beforeId ); data.validations++;
				validation = session.validation = { parentId: destination.parentId, beforeId: destination.beforeId, candidate, accepted: structure.treeDropChangesPosition( candidate ) };
			}
			const candidate = validation.candidate; if ( ! validation.accepted ) { hide(); return null; }
			if ( context.config.componentMode && ! candidate.parentId && context.findParent( context.state.document.children, session.id ) ) { hide(); return null; }
			intent = { ...destination, ...candidate };
			const rect = destination.rect, left = Math.max( bounds.left, rect.left ), top = Math.max( bounds.top, rect.top );
			Object.assign( overlay.style, { left: bounds.left + 'px', top: bounds.top + 'px', width: bounds.width + 'px', height: bounds.height + 'px' } );
			Object.assign( marker.style, { left: left - bounds.left + 'px', top: top - bounds.top + 'px', width: Math.max( destination.axis === 'x' ? 2 : 0, Math.min( bounds.right, rect.left + rect.width ) - left ) + 'px', height: Math.max( destination.axis === 'y' ? 2 : 0, Math.min( bounds.bottom, rect.top + rect.height ) - top ) + 'px' } );
			marker.dataset.mode = destination.area ? 'inside' : destination.axis; caption.textContent = candidate.label; caption.style.top = top - bounds.top < 30 ? '6px' : ''; overlay.hidden = false; surface.style.cursor = 'grabbing';
			sample( 'zones', { ms: performance.now() - started, parentId: candidate.parentId, beforeId: candidate.beforeId } ); return hit;
		}
		function tick( time ) {
			frame = 0; if ( phase !== 'dragging' ) { return; }
			try {
				const hit = refresh(); if ( ! session ) { return; }
				ghost.style.transform = 'translate3d(' + ( session.point.x - 14 ) + 'px,' + ( session.point.y - 14 ) + 'px,0)';
				const elapsed = lastTime ? Math.max( 0, Math.min( 32, time - lastTime ) ) / 1000 : 1 / 60; lastTime = time;
				let bounds = viewport.bounds();
				for ( let target = hit?.element; target && canvas.contains( target ); target = target.parentElement ) {
					if ( target.scrollHeight <= target.clientHeight || ! /^(auto|scroll)$/.test( doc.defaultView.getComputedStyle( target ).overflowY ) ) { continue; }
					const rect = viewport.toParent( target.getBoundingClientRect() ), top = Math.max( bounds.top, rect.top ), bottom = Math.min( bounds.bottom, rect.bottom ); bounds = { ...bounds, top, bottom, height: bottom - top }; break;
				}
				const velocity = scrollVelocity( session.point, bounds );
				if ( hit?.element && velocity && window.LieveViewport.scrollFrom( doc, { deltaX: 0, deltaY: velocity * elapsed, deltaMode: 0 }, hit.element ) ) { dirtyGeometry = true; schedule(); }
			} catch ( error ) { cancel( 'error' ); report( 'DRAG_UPDATE_FAILED' ); }
		}
		function schedule() { if ( frame || phase !== 'dragging' ) { return; } const generation = epoch; frame = win.requestAnimationFrame( time => { if ( generation === epoch ) { tick( time ); } } ); }
		function invalidate() { dirtyGeometry = true; if ( phase === 'dragging' ) { schedule(); } }
		function cleanup() {
			epoch++; win.cancelAnimationFrame( frame ); frame = 0; clear( listeners ); mutation?.disconnect(); resize?.disconnect(); mutation = resize = null;
			const pointer = session?.pointerId; session = null; geometry = intent = null; lastTime = 0;
			if ( pointer !== undefined && surface?.hasPointerCapture?.( pointer ) ) { try { surface.releasePointerCapture( pointer ); } catch ( error ) { report( 'CAPTURE_RELEASE_FAILED' ); } }
			overlay?.remove(); ghost?.remove(); overlay = marker = caption = ghost = null; app?.classList.remove( 'is-dragging-canvas' ); if ( surface ) { surface.style.cursor = ''; }
			if ( context && context.state.draggingId === data.lastSource ) { context.state.draggingId = null; }
		}
		function cancel( reason = 'cancelled' ) { if ( ! session ) { return false; } const active = phase === 'dragging'; phase = 'cancelled'; data.cancelled++; data.lastReason = reason; suppressClick ||= active; cleanup(); return true; }
		function transactionalMove( destination ) {
			// The existing commit pushes history before mutation/rendering and cannot roll
			// back an exception. Protect this transport only, using its real snapshot API.
			const state = context.state, before = documents.snapshot(), history = [ ...state.history ], future = [ ...state.future ];
			const selectedId = state.selectedId, collapsed = new Set( state.collapsedIds ), dirty = state.dirty, liveEdit = context.liveEdit;
			try { return structure.moveTreeElement( destination ); }
			catch ( error ) {
				documents.restoreSnapshot( before ); state.history = history; state.future = future; state.selectedId = selectedId; state.collapsedIds = collapsed; state.dirty = dirty; context.liveEdit = liveEdit;
				try { context.renderAll(); } catch ( renderError ) { report( 'ROLLBACK_RENDER_FAILED' ); }
				throw error;
			}
		}
		function pointerUp( event ) {
			if ( ! event.isTrusted || session?.pointerId !== event.pointerId ) { return; }
			if ( event.button !== 0 || event.buttons !== 0 || event.pointerType !== 'mouse' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ) { cancel( 'invalid-release' ); return; }
			if ( phase === 'pending' ) { phase = 'completed'; cleanup(); return; }
			try {
				session.point = { x: event.clientX, y: event.clientY }; refresh( true ); if ( ! session ) { return; }
				if ( ! intent || ! validSession() ) { cancel( 'invalid-drop' ); return; }
				const destination = intent, started = performance.now(); phase = 'dropping'; suppressClick = true;
				const moved = transactionalMove( destination ); sample( 'commits', { ms: performance.now() - started, moved } );
				phase = moved ? 'completed' : 'cancelled'; if ( moved ) { data.completed++; } else { data.cancelled++; } cleanup();
			} catch ( error ) { cancel( 'error' ); report( 'DROP_FAILED' ); }
		}
		function pointerMove( event ) {
			if ( ! event.isTrusted || session?.pointerId !== event.pointerId ) { return; }
			const started = performance.now(); data.pointermoves++;
			try {
				if ( ! validSession() || event.buttons !== 1 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ) { cancel( 'pointer-lost' ); return; }
				session.point = { x: event.clientX, y: event.clientY };
				if ( phase === 'pending' && Math.hypot( session.point.x - session.origin.x, session.point.y - session.origin.y ) >= 5 ) {
					const activation = performance.now(); phase = 'dragging'; context.state.draggingId = session.id; geometry = indexGeometry(); for ( const element of geometry.elements.values() ) { resize?.observe( element ); } dirtyGeometry = true; feedback(); data.starts++; sample( 'activations', { ms: performance.now() - activation } );
				}
				if ( phase === 'dragging' ) { event.preventDefault(); schedule(); }
				sample( 'moves', { at: started, ms: performance.now() - started } );
			} catch ( error ) { cancel( 'error' ); report( 'DRAG_START_FAILED' ); }
		}
		function pointerDown( event, hit ) {
			if ( state !== 'mounted' || session || ! event.isTrusted || event.pointerType !== 'mouse' || event.button !== 0 || ! event.isPrimary || ! selectable( hit.identity ) || context.state.draggingId || context.state.saving ) { return; }
			const started = performance.now(), resolved = registry().resolve( hit.element ); if ( ! selectable( resolved ) || resolved.identity.instance !== hit.identity.identity.instance ) { return; }
			try {
				const stats = registry().stats(), id = resolved.identity.selectId;
				if ( ! context.findNode( context.state.document.children, id ) ) { return; }
				session = { id, element: hit.element, instance: resolved.identity.instance, generation: stats.generation, registrations: stats.registrations, model: context.state.document, origin: { x: event.clientX, y: event.clientY }, point: { x: event.clientX, y: event.clientY }, pointerId: event.pointerId };
				phase = 'pending'; data.lastSource = id; suppressClick = false;
				listen( listeners, owner, 'pointermove', pointerMove, { capture: true, passive: false } ); listen( listeners, owner, 'pointerup', pointerUp, true );
				listen( listeners, owner, 'pointercancel', e => { if ( e.pointerId === session?.pointerId ) { cancel( 'pointercancel' ); } }, true );
				listen( listeners, surface, 'lostpointercapture', () => cancel( 'capture-lost' ) );
				listen( listeners, owner, 'keydown', e => { if ( e.key === 'Escape' ) { e.preventDefault(); e.stopPropagation(); cancel( 'escape' ); } }, true );
				listen( listeners, owner, 'scroll', invalidate, true ); listen( listeners, win, 'resize', invalidate ); listen( listeners, win, 'blur', () => cancel( 'blur' ) );
				listen( listeners, viewport.frame, 'load', () => cancel( 'viewport-navigated' ) );
				listen( listeners, owner, 'visibilitychange', () => { if ( owner.hidden ) { cancel( 'hidden' ); } } );
				mutation = new win.MutationObserver( () => { if ( session && ! validSession() ) { cancel( 'rendered' ); } else { invalidate(); } } ); mutation.observe( canvas, { childList: true, subtree: true } ); mutation.observe( viewport.frame.parentElement, { childList: true } ); mutation.observe( viewport.stage, { childList: true } );
				if ( win.ResizeObserver ) { resize = new win.ResizeObserver( invalidate ); resize.observe( canvas ); resize.observe( viewport.frame ); }
				surface.setPointerCapture( event.pointerId ); sample( 'acquisitions', { ms: performance.now() - started } );
			} catch ( error ) { cancel( 'capture-failed' ); report( 'DRAG_ACQUIRE_FAILED' ); }
		}
		return Object.freeze( {
			mount( target, resolver ) { if ( state === 'destroyed' || ! target?.isConnected || target.ownerDocument !== owner || target.parentElement !== viewport.frame.parentElement || typeof resolver !== 'function' ) { return false; } if ( surface ) { return surface === target; } surface = target; hitAt = resolver; state = 'mounted';
				for ( const type of [ 'dragover', 'drop', 'dragstart' ] ) { listen( guards, surface, type, event => { event.preventDefault(); event.stopPropagation(); if ( event.dataTransfer ) { event.dataTransfer.dropEffect = 'none'; } } ); } return true; },
			pointerDown, invalidate, cancel,
			click( event ) { if ( suppressClick ) { suppressClick = false; event.preventDefault(); event.stopImmediatePropagation(); return true; } return false; },
			suspend() { cancel( 'suspended' ); if ( state !== 'destroyed' ) { state = 'suspended'; } },
			resume() { if ( state === 'suspended' ) { state = 'mounted'; } },
			destroy() { if ( state === 'destroyed' ) { return; } cancel( 'destroyed' ); clear( guards ); state = 'destroyed'; surface = hitAt = viewport = controller = structure = documents = context = onError = canvas = doc = owner = win = app = null; },
			stats() { return JSON.parse( JSON.stringify( { ...data, state, phase, listeners: listeners.length + guards.length, operationListeners: listeners.length, framesActive: frame ? 1 : 0, observers: Number( Boolean( mutation ) ) + Number( Boolean( resize ) ), overlays: overlay ? 2 : 0, capture: Boolean( session && surface?.hasPointerCapture?.( session.pointerId ) ) } ) ); },
		} );
	}
	window.LieveCanvasDrag = { resolve, scrollVelocity, create, createParent };
}() );
