( function () {
	'use strict';
	window.LieveEditorControllers ||= {};
	window.LieveEditorControllers[ 'structure' ] = function create( lieveContext ) {
	let canvasDragHandoff = null, treeGeneration = 0;
	// Application-lifetime presentation cache. Only renderer-created rows enter
	// this map; a full render drops the previous model, paths and row references.
	// Neither the map nor its selected-row projection is document authority.
	let treeRows = null, treeProjection = null, structureDisposed = false;
	// Passive creation seam: only closures installed on actual renderer-created rows
	// can offer a source. Copied attributes/rows and native payloads cannot mint one.
	function bindCanvasDrag( start ) {
		if ( structureDisposed || typeof start !== 'function' || canvasDragHandoff ) { return null; }
		canvasDragHandoff = start;
		return () => { if ( canvasDragHandoff === start ) { canvasDragHandoff = null; } };
	}
	// Terminal application teardown only. Persisted pagehide retains its current
	// projection; a later render still verifies every exact model/path reference.
	function destroyStructure() {
		if ( structureDisposed ) { return; } structureDisposed = true; treeGeneration++;
		treeProjection = null; treeRows = null; canvasDragHandoff = null;
		lieveContext.treeRename?.deactivate(); lieveContext.treeRename = null;
		clearTreeDragMotion(); clearTreeDragPreview(); clearTreeDropPlaceholder();
	}
	function renameElement( id, value ) {
		const node = lieveContext.findNode( lieveContext.state.document.children, id ); if ( ! node ) { return false; }
		const name = Array.from( String( value ).replace( /<[^>]*>/g, '' ).trim() ).slice( 0, 120 ).join( '' );
		const label = name === ( lieveContext.labels[ node.type ] || node.type ) ? '' : name;
		if ( ( node.props.editorLabel || '' ) === label ) { return false; }
		lieveContext.commit( () => { if ( label ) { node.props.editorLabel = label; } else { delete node.props.editorLabel; } } ); return true;
	}

	function beginTreeRename( id ) {
		if ( lieveContext.treeRename?.id === id && lieveContext.treeRename.input.isConnected && lieveContext.treeRename.current?.() !== false ) { lieveContext.treeRename.input.focus(); return; }
		lieveContext.treeRename?.finish( true );
		lieveContext.selectElement( id ); lieveContext.showWorkspacePanel( 'structure' );
		if ( window.matchMedia( '(max-width: 900px)' ).matches ) { lieveContext.closeDrawers(); lieveContext.app.dataset.drawer = 'elements'; document.querySelector( '[data-toggle-drawer="elements"]' )?.setAttribute( 'aria-expanded', 'true' ); }
		const node = lieveContext.findNode( lieveContext.state.document.children, id ); const row = lieveContext.structure.querySelector( '.lieve-tree-row[data-id="' + window.CSS.escape( id ) + '"]' );
		if ( ! node || ! row ) { return; }
		const model = lieveContext.state.document, current = () => lieveContext.state.document === model && lieveContext.findNode( model.children, id ) === node;
		const select = row.querySelector( '.lieve-tree-select' ); const input = document.createElement( 'input' );
		input.type = 'text'; input.className = 'lieve-tree-rename'; input.maxLength = 120; input.setAttribute( 'aria-label', 'Rename element' ); input.value = node.props.editorLabel || lieveContext.labels[ node.type ] || node.type;
		row.classList.add( 'is-renaming' ); row.draggable = false; select.draggable = false; select.setAttribute( 'aria-label', 'Select ' + input.value );
		row.insertBefore( input, select.nextSibling ); let finished = false;
		const finish = ( apply, focus = false ) => {
			if ( finished ) { return; } finished = true; lieveContext.treeRename = null;
			const owned = current(), changed = apply && owned && renameElement( id, input.value ); if ( ! changed ) { renderStructure( true ); }
			if ( focus && owned ) { lieveContext.structure.querySelector( '.lieve-tree-row[data-id="' + window.CSS.escape( id ) + '"] .lieve-tree-select' )?.focus(); }
		};
		lieveContext.treeRename = { id, input, finish, current, deactivate: () => { finished = true; } };
		input.addEventListener( 'click', ( event ) => event.stopPropagation() ); input.addEventListener( 'dragstart', ( event ) => { event.preventDefault(); event.stopPropagation(); } );
		input.addEventListener( 'blur', () => finish( true ) );
		input.addEventListener( 'keydown', ( event ) => { if ( event.defaultPrevented || event.isComposing || event.keyCode === 229 ) { return; } if ( event.key === 'Enter' || event.key === 'Escape' ) { event.preventDefault(); event.stopPropagation(); finish( event.key === 'Enter', true ); } } );
		input.focus(); input.select();
	}

	function clearTreeDragPreview() {
		lieveContext.treeDragPreview?.remove(); lieveContext.treeDragPreview = null;
	}

	function setTreeDragPreview( row, event ) {
		clearTreeDragPreview();
		// Like Bricks' 24px ghost, only the element icon follows the pointer.
		// Never snapshot the full row, guides, controls or surrounding panel.
		const preview = document.createElement( 'div' ); preview.className = 'lieve-tree-drag-preview';
		preview.innerHTML = lieveContext.elementIcon( lieveContext.findNode( lieveContext.state.document.children, row.dataset.id )?.type || '' );
		preview.inert = true; preview.setAttribute( 'aria-hidden', 'true' );
		Object.assign( preview.style, { left: event.clientX - 12 + 'px', top: event.clientY - 12 + 'px' } );
		lieveContext.structure.appendChild( preview ); lieveContext.treeDragPreview = preview;
		event.dataTransfer.setDragImage( preview, 12, 12 );
		// Native drag images are captured after dragstart, before the next task.
		window.setTimeout( () => {
			preview.remove();
			if ( lieveContext.treeDragPreview === preview ) { lieveContext.treeDragPreview = null; }
		}, 0 );
	}

	function clearTreeDropPlaceholder() {
		lieveContext.treeDropTargetRow?.classList.remove( 'is-drop-inside' ); lieveContext.treeDropTargetRow = null;
		lieveContext.treeDropPlaceholder?.remove(); lieveContext.treeDropPlaceholder = null; lieveContext.treeDropIntent = null;
	}

	function treeDropDestination( parentId, beforeId, mode = 'insert' ) {
		const parent = parentId ? lieveContext.findNode( lieveContext.state.document.children, parentId ) : null;
		const siblings = parent ? parent.children || [] : lieveContext.state.document.children;
		// Canonical parent + next sibling: "after A" and "before B" are one slot.
		if ( beforeId === lieveContext.state.draggingId ) { beforeId = siblings[ siblings.findIndex( ( node ) => node.id === beforeId ) + 1 ]?.id || null; }
		const name = parent ? parent.props?.editorLabel || lieveContext.labels[ parent.type ] || parent.type : 'Root';
		return { draggingId: lieveContext.state.draggingId, parentId, beforeId, mode, depth: parentId ? lieveContext.nodeDepth( parentId ) + 1 : 0, label: mode === 'inside' ? 'Inside ' + name : name };
	}

	function validTreeDrop( intent ) {
		if ( ! intent || intent.draggingId !== lieveContext.state.draggingId ) { return false; }
		const dragging = lieveContext.findNode( lieveContext.state.document.children, intent.draggingId );
		const parent = intent.parentId ? lieveContext.findNode( lieveContext.state.document.children, intent.parentId ) : null;
		if ( ! dragging || lieveContext.findParent( lieveContext.state.document.children, dragging.id )?.type === 'component' || intent.parentId && ( ! parent || parent.type === 'component' || ! lieveContext.canNest( parent.type ) || lieveContext.containsId( dragging, parent.id ) ) ) { return false; }
		const siblings = parent ? parent.children || [] : lieveContext.state.document.children;
		const depth = parent ? lieveContext.nodeDepth( parent.id ) + 1 : 0;
		return depth + lieveContext.subtreeDepth( dragging ) <= 12 && ( ! intent.beforeId || intent.beforeId !== dragging.id && siblings.some( ( node ) => node.id === intent.beforeId ) );
	}

	function treeDropChangesPosition( intent ) {
		if ( ! validTreeDrop( intent ) ) { return false; }
		const oldParent = lieveContext.findParent( lieveContext.state.document.children, intent.draggingId );
		if ( ( oldParent?.id || null ) !== intent.parentId ) { return true; }
		const siblings = oldParent ? oldParent.children || [] : lieveContext.state.document.children;
		const from = siblings.findIndex( ( node ) => node.id === intent.draggingId );
		const to = intent.beforeId ? siblings.findIndex( ( node ) => node.id === intent.beforeId ) : siblings.length;
		return to - ( from < to ? 1 : 0 ) !== from;
	}

	function treeDropPosition( event, bounds, nestable ) {
		// Bricks structure draggable: bound=10, directions=[top,bottom]. Its
		// proximity ranking compares all four edge distances to that bound,
		// including the signed right-edge distance, before choosing a direction.
		const distances = [ event.clientY - bounds.top, bounds.bottom - event.clientY, event.clientX - bounds.left, event.clientX - bounds.right ];
		const edge = [ ...distances ].sort( ( a, b ) => Math.abs( a - 10 ) - Math.abs( b - 10 ) )[0];
		if ( edge > 20 || ! nestable && edge > 10 ) { return undefined; }
		if ( nestable && edge > 10 ) { return 'inside'; }
		return edge === distances[0] ? 'before' : 'after';
	}

	function treeRowDropPosition( event, bounds, nestable, previous = '', expanded = false ) {
		// Same before/inside/after model, but no dead strip in a visible row.
		// A small hysteresis keeps an intentional slot stable at zone boundaries.
		const y = event.clientY - bounds.top; const height = bounds.bottom - bounds.top;
		const edge = Math.min( 10, height / 3 ); const tolerance = Math.min( 3, height / 12 );
		if ( ! nestable ) {
			if ( previous === 'before' && y <= height / 2 + tolerance ) { return 'before'; }
			if ( previous === 'after' && y >= height / 2 - tolerance ) { return 'after'; }
			return y < height / 2 ? 'before' : 'after';
		}
		// The bottom of an open header leads to its first child, not to the end
		// of the complete subtree. Outdent in its gutter or after its last row.
		if ( expanded ) {
			if ( previous === 'before' && y <= edge + tolerance ) { return 'before'; }
			if ( previous === 'inside' && y >= edge - tolerance ) { return 'inside'; }
			return y <= edge ? 'before' : 'inside';
		}
		if ( previous === 'before' && y <= edge + tolerance ) { return 'before'; }
		if ( previous === 'after' && y >= height - edge - tolerance ) { return 'after'; }
		if ( previous === 'inside' && y > edge - tolerance && y < height - edge + tolerance ) { return 'inside'; }
		return y <= edge ? 'before' : y >= height - edge ? 'after' : 'inside';
	}

	function resolveTreeDrop( event ) {
		let target = event.target.closest( '.lieve-tree-branch[data-id]' );
		if ( ! target || ! lieveContext.structure.contains( target ) ) {
			// Whitespace below the list is its one real root append slot, not an
			// extra rendered magnet. Unknown gaps never reuse a stale destination.
			const roots = Array.from( lieveContext.structure.querySelectorAll( ':scope > .lieve-tree-branch[data-id]' ) );
			const first = roots[0]; const last = roots[ roots.length - 1 ];
			const bounds = lieveContext.structure.getBoundingClientRect(); const panel = lieveContext.structure.parentElement.getBoundingClientRect();
			if ( ! first || event.clientX < bounds.left || event.clientX >= panel.right || event.clientY < bounds.top || event.clientY >= panel.bottom ) { return null; }
			const position = event.clientY <= first.getBoundingClientRect().top ? 'before' : event.clientY >= last.getBoundingClientRect().bottom ? 'after' : null;
			if ( ! position ) { return null; }
			const anchor = position === 'before' ? first : last;
			const intent = treeDropDestination( null, position === 'before' ? first.dataset.id : null );
			return treeDropChangesPosition( intent ) ? { ...intent, targetId: anchor.dataset.id, position } : null;
		}
		const dragging = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.draggingId );
		if ( ! dragging ) { return null; }
		const source = lieveContext.structure.querySelector( '.lieve-tree-branch[data-id="' + window.CSS.escape( dragging.id ) + '"]' );
		const sourceBounds = source?.getBoundingClientRect();
		if ( sourceBounds && event.clientX >= sourceBounds.left && event.clientX < sourceBounds.right && event.clientY >= sourceBounds.top && event.clientY < sourceBounds.bottom ) { return null; }
		let node; let position;
		while ( target ) {
			node = lieveContext.findNode( lieveContext.state.document.children, target.dataset.id );
			if ( ! node || lieveContext.containsId( dragging, node.id ) ) { return null; }
			const row = target.querySelector( ':scope > .lieve-tree-row[data-id]' );
			if ( ! row ) { return null; }
			const rowBounds = row.getBoundingClientRect();
			const children = Array.from( target.querySelectorAll( ':scope > .lieve-tree-children > .lieve-tree-branch[data-id]' ) );
			// Native hit testing rounds painted edges to device pixels, whereas
			// DOMRect retains fractions. The next row can receive dragenter/over
			// just ABOVE its top. This is its before slot, never an "after" fallback
			// (which briefly projected the end of the enclosing container).
			if ( event.clientY < rowBounds.top ) { position = 'before'; break; }
			if ( event.clientY >= rowBounds.top && event.clientY <= rowBounds.bottom ) {
				const previous = lieveContext.treeDropIntent?.parentId === node.id && lieveContext.treeDropIntent.beforeId === node.children?.[0]?.id ? 'inside' : lieveContext.treeDropIntent?.targetId === node.id ? lieveContext.treeDropIntent.position : '';
				position = treeRowDropPosition( event, rowBounds, lieveContext.canNest( node.type ) && node.type !== 'component', previous, children.length > 0 ); break;
			}
			// Row margins belong to the enclosing branch. In the child lane, a
			// header/child or sibling gap must resolve at that nested level, never
			// fall back to "after" the whole ancestor and jump to its end/root.
			const laneTolerance = lieveContext.treeDropIntent?.parentId && lieveContext.containsId( node, lieveContext.treeDropIntent.parentId ) ? -4 : lieveContext.treeDropIntent?.targetId === node.id ? 4 : 0;
			if ( children.length && event.clientX >= children[0].getBoundingClientRect().left + laneTolerance ) {
				const child = children.find( ( branch ) => event.clientY < branch.getBoundingClientRect().bottom );
				if ( ! child ) { target = children.at( -1 ); node = lieveContext.findNode( lieveContext.state.document.children, target.dataset.id ); position = 'after'; break; }
				target = child;
				if ( event.clientY < child.getBoundingClientRect().top ) { node = lieveContext.findNode( lieveContext.state.document.children, child.dataset.id ); position = 'before'; break; }
				continue;
			}
			// The deliberate outer gutter has one outdent destination. Horizontal
			// proximity must not alternate between append-inside and after-parent.
			position = children.length ? treeDropPosition( event, target.getBoundingClientRect(), false ) || 'after' : 'after'; break;
		}
		if ( ! node || ! position || lieveContext.containsId( dragging, node.id ) ) { return null; }
		const parent = lieveContext.findParent( lieveContext.state.document.children, node.id );
		const siblings = parent ? parent.children || [] : lieveContext.state.document.children;
		const next = siblings[ siblings.findIndex( ( sibling ) => sibling.id === node.id ) + 1 ];
		const intent = position === 'inside' ? treeDropDestination( node.id, node.children?.[0]?.id || null, 'inside' ) : treeDropDestination( parent?.id || null, position === 'before' ? node.id : next?.id || null );
		if ( ! treeDropChangesPosition( intent ) ) { return null; }
		return { ...intent, targetId: node.id, position };
	}

	function showTreeDropPlaceholder( intent ) {
		if ( ! treeDropChangesPosition( intent ) ) { clearTreeDropPlaceholder(); return false; }
		const parent = intent.parentId ? lieveContext.structure.querySelector( '.lieve-tree-branch[data-id="' + window.CSS.escape( intent.parentId ) + '"]' ) : null;
		const before = intent.beforeId ? lieveContext.structure.querySelector( '.lieve-tree-branch[data-id="' + window.CSS.escape( intent.beforeId ) + '"]' ) : null;
		const lastId = lieveContext.state.document.children.at( -1 )?.id;
		const anchor = before || parent || ( lastId ? lieveContext.structure.querySelector( '.lieve-tree-branch[data-id="' + window.CSS.escape( lastId ) + '"]' ) : null );
		if ( ! anchor ) { clearTreeDropPlaceholder(); return false; }
		if ( ! lieveContext.treeDropPlaceholder ) {
			lieveContext.treeDropPlaceholder = document.createElement( 'div' );
			lieveContext.treeDropPlaceholder.className = 'lieve-tree-drop-placeholder';
			lieveContext.treeDropPlaceholder.setAttribute( 'role', 'status' ); lieveContext.treeDropPlaceholder.setAttribute( 'aria-live', 'polite' );
		}
		// Project the real nested destination without moving any hit boxes.
		// An in-flow gap used to change the result under a stationary pointer.
		if ( lieveContext.treeDropPlaceholder.parentNode !== lieveContext.structure ) { lieveContext.structure.appendChild( lieveContext.treeDropPlaceholder ); }
		// Paint the canonical parent/next-sibling slot, not the hovered branch.
		// "Inside A" and "before its first child" are the same physical marker.
		const bounds = anchor.getBoundingClientRect(); const origin = lieveContext.structure.getBoundingClientRect();
		const chrome = window.getComputedStyle( lieveContext.structure ); const step = parseFloat( chrome.getPropertyValue( '--lv-tree-step' ) ) || 18;
		const gap = parseFloat( chrome.getPropertyValue( '--lv-tree-gap' ) ) || 3; const inset = ! before && parent ? step : 0;
		const parentRow = parent?.querySelector( ':scope > .lieve-tree-row[data-id]' );
		const edge = before ? bounds.top : intent.beforeId && parentRow ? parentRow.getBoundingClientRect().bottom + gap : bounds.bottom;
		Object.assign( lieveContext.treeDropPlaceholder.style, { left: bounds.left - origin.left + inset + 'px', top: edge - origin.top - gap / 2 - 2 + 'px', width: Math.max( 24, bounds.width - inset ) + 'px' } );
		const row = intent.mode === 'inside' ? parentRow : null;
		if ( lieveContext.treeDropTargetRow !== row ) { lieveContext.treeDropTargetRow?.classList.remove( 'is-drop-inside' ); row?.classList.add( 'is-drop-inside' ); lieveContext.treeDropTargetRow = row; }
		lieveContext.treeDropIntent = intent;
		lieveContext.treeDropPlaceholder.classList.toggle( 'is-inside', intent.mode === 'inside' );
		lieveContext.treeDropPlaceholder.dataset.mode = intent.mode;
		lieveContext.treeDropPlaceholder.setAttribute( 'aria-label', intent.label );
		return true;
	}

	function clearTreeDragMotion() {
		window.cancelAnimationFrame( lieveContext.treeScrollFrame ); lieveContext.treeScrollFrame = 0; lieveContext.treeScrollTime = 0; lieveContext.treeDragPointer = null;
		window.clearTimeout( lieveContext.treeHoverTimer ); lieveContext.treeHoverTimer = 0; lieveContext.treeHoverId = null;
	}

	function updateTreeHover( intent ) {
		const id = intent?.mode === 'inside' && lieveContext.state.collapsedIds.has( intent.parentId ) ? intent.parentId : null;
		if ( id === lieveContext.treeHoverId ) { return; }
		window.clearTimeout( lieveContext.treeHoverTimer ); lieveContext.treeHoverTimer = 0; lieveContext.treeHoverId = id;
		if ( ! id ) { return; }
		lieveContext.treeHoverTimer = window.setTimeout( () => {
			lieveContext.treeHoverTimer = 0;
			if ( ! lieveContext.state.draggingId || lieveContext.treeHoverId !== id || lieveContext.treeDropIntent?.parentId !== id || lieveContext.treeDropIntent.mode !== 'inside' ) { return; }
			const node = lieveContext.findNode( lieveContext.state.document.children, id ); const branch = lieveContext.structure.querySelector( '.lieve-tree-branch[data-id="' + window.CSS.escape( id ) + '"]' );
			if ( ! branch || ! node?.children?.length ) { return; }
			const owner = treeRows?.get( id ); if ( owner && ! owner.current() ) { return; }
			// Hover expansion keeps the drag source alive, but changes the visible
			// projection. The next normal render must rebuild the complete cache.
			treeProjection = null;
			lieveContext.state.collapsedIds.delete( id ); lieveContext.treeHoverId = null;
			const children = document.createElement( 'div' ); children.className = 'lieve-tree-children'; children.setAttribute( 'role', 'group' );
			branch.appendChild( children );
			const ancestors = []; let current = node;
			while ( current ) { const parent = lieveContext.findParent( lieveContext.state.document.children, current.id ); const siblings = parent ? parent.children : lieveContext.state.document.children; ancestors.unshift( siblings.at( -1 )?.id !== current.id ); current = parent; }
			renderTreeBranch( node.children, lieveContext.nodeDepth( id ) + 1, children, ancestors, id, owner?.path || [] );
			branch.querySelector( '.lieve-tree-toggle' )?.setAttribute( 'aria-expanded', 'true' );
			branch.querySelector( ':scope > .lieve-tree-row[data-id]' )?.setAttribute( 'aria-expanded', 'true' );
			showTreeDropPlaceholder( lieveContext.treeDropIntent );
		}, 550 );
	}

	function treeScrollVelocity( point, bounds ) {
		if ( ! point || point.clientX < bounds.left || point.clientX >= bounds.right || point.clientY < bounds.top || point.clientY >= bounds.bottom ) { return 0; }
		const edge = Math.min( 48, ( bounds.bottom - bounds.top ) / 4 );
		if ( point.clientY < bounds.top + edge ) { return -12 * ( 1 - ( point.clientY - bounds.top ) / edge ); }
		if ( point.clientY > bounds.bottom - edge ) { return 12 * ( 1 - ( bounds.bottom - point.clientY ) / edge ); }
		return 0;
	}

	function scrollTreeDrag( time ) {
		lieveContext.treeScrollFrame = 0;
		if ( ! lieveContext.state.draggingId || ! lieveContext.treeDragPointer ) { return; }
		const panel = lieveContext.structure.parentElement; const velocity = treeScrollVelocity( lieveContext.treeDragPointer, panel.getBoundingClientRect() );
		const elapsed = lieveContext.treeScrollTime ? Math.min( 32, Math.max( 8, time - lieveContext.treeScrollTime ) ) : 16; lieveContext.treeScrollTime = time;
		const next = Math.min( Math.max( 0, panel.scrollHeight - panel.clientHeight ), Math.max( 0, panel.scrollTop + velocity * elapsed / 16 ) );
		if ( ! velocity || next === panel.scrollTop ) { lieveContext.treeScrollTime = 0; return; }
		panel.scrollTop = next;
		const target = document.elementFromPoint( lieveContext.treeDragPointer.clientX, lieveContext.treeDragPointer.clientY );
		const intent = target ? resolveTreeDrop( { ...lieveContext.treeDragPointer, target } ) : null;
		showTreeDropPlaceholder( intent ); updateTreeHover( intent );
		lieveContext.treeScrollFrame = window.requestAnimationFrame( scrollTreeDrag );
	}

	function moveTreeElement( intent ) {
		if ( ! treeDropChangesPosition( intent ) ) { return false; }
		lieveContext.commit( () => {
			const removed = lieveContext.removeNode( lieveContext.state.document.children, intent.draggingId );
			const freshParent = intent.parentId ? lieveContext.findNode( lieveContext.state.document.children, intent.parentId ) : null;
			const destination = freshParent ? ( freshParent.children ||= [] ) : lieveContext.state.document.children;
			const index = intent.beforeId ? destination.findIndex( ( node ) => node.id === intent.beforeId ) : destination.length;
			destination.splice( index, 0, removed ); lieveContext.state.selectedId = removed.id;
			if ( freshParent ) { lieveContext.state.collapsedIds.delete( freshParent.id ); }
		} );
		return true;
	}

	function applyTreeDrop() {
		clearTreeDragMotion();
		if ( validTreeDrop( lieveContext.treeDropIntent ) ) { moveTreeElement( lieveContext.treeDropIntent ); }
		lieveContext.state.draggingId = null; lieveContext.structure.classList.remove( 'is-dragging' );
		lieveContext.structure.querySelectorAll( '.lieve-tree-branch.is-dragging' ).forEach( ( branch ) => branch.classList.remove( 'is-dragging' ) );
		clearTreeDragPreview(); lieveContext.clearDropIndicators();
	}

	function handleTreeDragOver( event ) {
		if ( ! lieveContext.state.draggingId ) { return; }
		event.stopPropagation(); lieveContext.clearDropIndicators( true );
		const intent = resolveTreeDrop( event );
		const accepted = showTreeDropPlaceholder( intent );
		updateTreeHover( accepted ? intent : null );
		lieveContext.treeDragPointer = { clientX: event.clientX, clientY: event.clientY };
		if ( ! lieveContext.treeScrollFrame && treeScrollVelocity( lieveContext.treeDragPointer, lieveContext.structure.parentElement.getBoundingClientRect() ) ) { lieveContext.treeScrollFrame = window.requestAnimationFrame( scrollTreeDrag ); }
		if ( accepted ) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }
		else { event.dataTransfer.dropEffect = 'none'; }
	}

	function handleTreeDrop( event ) {
		if ( ! lieveContext.state.draggingId ) { return; }
		event.preventDefault(); event.stopPropagation();
		showTreeDropPlaceholder( resolveTreeDrop( event ) ); applyTreeDrop();
	}

	function cancelTreeDrag( event ) {
		if ( event.key !== 'Escape' || ! lieveContext.state.draggingId || ! lieveContext.structure.classList.contains( 'is-dragging' ) ) { return; }
		event.preventDefault(); event.stopPropagation();
		clearTreeDropPlaceholder(); applyTreeDrop();
	}

	function handleTreeKeyDown( event, node ) {
		if ( event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.target.matches( 'input, textarea' ) || event.altKey || event.ctrlKey || event.metaKey ) { return; }
		if ( event.key === 'F2' ) { event.preventDefault(); event.stopPropagation(); beginTreeRename( node.id ); return; }
		if ( ! [ 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End' ].includes( event.key ) ) { return; }
		event.preventDefault(); event.stopPropagation();
		const rows = Array.from( lieveContext.structure.querySelectorAll( '.lieve-tree-row[data-id]' ) ); const index = rows.findIndex( row => row.dataset.id === node.id );
		let next = node.id;
		if ( event.key === 'ArrowUp' || event.key === 'ArrowDown' ) { next = rows[ Math.max( 0, Math.min( rows.length - 1, index + ( event.key === 'ArrowDown' ? 1 : -1 ) ) ) ]?.dataset.id || next; }
		else if ( event.key === 'Home' || event.key === 'End' ) { next = rows[ event.key === 'Home' ? 0 : rows.length - 1 ]?.dataset.id || next; }
		else if ( event.key === 'ArrowRight' && lieveContext.canNest( node.type ) ) {
			if ( lieveContext.state.collapsedIds.has( node.id ) ) { lieveContext.state.collapsedIds.delete( node.id ); renderStructure(); }
			else { next = node.children?.[0]?.id || next; }
		} else if ( event.key === 'ArrowLeft' ) {
			if ( node.children?.length && ! lieveContext.state.collapsedIds.has( node.id ) ) { lieveContext.state.collapsedIds.add( node.id ); renderStructure(); }
			else { next = lieveContext.findParent( lieveContext.state.document.children, node.id )?.id || next; }
		}
		lieveContext.selectElement( next );
		lieveContext.structure.querySelector( '.lieve-tree-row[data-id="' + window.CSS.escape( next ) + '"]' )?.focus( { preventScroll: true } );
		lieveContext.structure.querySelector( '.lieve-tree-row[data-id="' + window.CSS.escape( next ) + '"]' )?.scrollIntoView( { block: 'nearest' } );
	}

	function renderTreeBranch( nodes, depth, fragment, ancestors = [], parentId = null, dragPath = [] ) {
		if ( structureDisposed ) { return; }
		nodes.forEach( ( node, index ) => {
			const branch = document.createElement( 'div' ); branch.className = 'lieve-tree-branch';
			branch.dataset.id = node.id; branch.dataset.parentId = parentId || ''; branch.dataset.depth = depth;
			const row = document.createElement( 'div' );
			let toggleCurrent = null;
			const sourceModel = lieveContext.state.document, sourceGeneration = treeGeneration, sourceId = node.id, sourcePath = [ ...dragPath, { nodes, node, index } ];
			const currentRow = () => ! structureDisposed && sourceModel === lieveContext.state.document && sourceGeneration === treeGeneration && node.id === sourceId && row.isConnected && lieveContext.structure.contains( row ) && row.parentNode === branch && sourceModel.children === sourcePath[0].nodes && sourcePath.every( ( link, at ) => link.nodes[ link.index ] === link.node && ( ! at || sourcePath[ at - 1 ].node.children === link.nodes ) );
			const rejectStaleRow = event => { if ( currentRow() ) { return false; } if ( event.key !== 'Tab' ) { event.preventDefault(); } event.stopPropagation(); return true; };
			row.className = 'lieve-tree-row' + ( depth === 0 ? ' is-root' : '' ) + ( lieveContext.state.selectedId === node.id ? ' is-selected' : '' );
			row.dataset.id = node.id;
			row.dataset.depth = depth;
			row.style.setProperty( '--lv-tree-depth', depth );
			row.draggable = true;
			row.tabIndex = 0;
			row.setAttribute( 'role', 'treeitem' ); row.setAttribute( 'aria-level', depth + 1 );
			row.setAttribute( 'aria-selected', String( lieveContext.state.selectedId === node.id ) );
			row.setAttribute( 'aria-posinset', index + 1 ); row.setAttribute( 'aria-setsize', nodes.length );
			// A fixed gutter and disclosure slot keep leaves and parents aligned.
			const guides = document.createElement( 'span' );
			guides.className = 'lieve-tree-guides'; guides.setAttribute( 'aria-hidden', 'true' );
			for ( let level = 0; level < depth; level++ ) {
				const guide = document.createElement( 'span' );
				guide.className = 'lieve-tree-guide' + ( level === depth - 1 ? ' is-branch' + ( index === nodes.length - 1 ? ' is-last' : '' ) : ancestors[ level + 1 ] ? ' is-continuation' : '' );
				guides.appendChild( guide );
			}
			row.appendChild( guides );
			const isParent = lieveContext.canNest( node.type );
			const name = node.props?.editorLabel || lieveContext.labels[ node.type ] || node.type;
			row.setAttribute( 'aria-label', name );
			const childCount = ( node.children || [] ).length;
			if ( isParent ) { row.setAttribute( 'aria-expanded', String( ! lieveContext.state.collapsedIds.has( node.id ) ) ); }
			if ( childCount ) { row.classList.add( 'has-children' ); }
			if ( isParent ) {
				const toggle = document.createElement( 'button' );
				toggle.type = 'button';
				toggle.className = 'lieve-tree-toggle';
				toggle.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>';
				toggle.setAttribute( 'aria-label', 'Toggle ' + name + ' children' );
				toggle.setAttribute( 'aria-expanded', String( ! lieveContext.state.collapsedIds.has( node.id ) ) );
				const toggleBranch = () => {
					if ( ! currentRow() ) { return; }
					if ( lieveContext.state.collapsedIds.has( node.id ) ) {
						lieveContext.state.collapsedIds.delete( node.id );
					} else {
						lieveContext.state.collapsedIds.add( node.id );
					}
					renderStructure();
					lieveContext.structure.querySelector( '.lieve-tree-row[data-id="' + window.CSS.escape( node.id ) + '"] .lieve-tree-toggle' )?.focus();
				};
				toggleCurrent = toggleBranch;
				toggle.addEventListener( 'click', toggleBranch );
				toggle.addEventListener( 'pointerdown', ( event ) => {
					if ( rejectStaleRow( event ) ) { return; }
					if ( ! lieveContext.treeRename || event.button !== 0 ) { return; }
					event.preventDefault(); lieveContext.treeRename.finish( true );
					if ( currentRow() ) { toggleBranch(); }
					else {
						// Confirming rename synchronously rebuilt this same model. Use
						// its freshly created disclosure, never revive the old callback
						// or hand an identically named replacement model its authority.
						const fresh = treeRows?.get( sourceId );
						if ( sourceModel === lieveContext.state.document && fresh?.node === node && fresh.current() ) { fresh.toggle?.(); }
					}
				} );
				row.appendChild( toggle );
			} else {
				const slot = document.createElement( 'span' ); slot.className = 'lieve-tree-toggle-slot'; slot.setAttribute( 'aria-hidden', 'true' ); row.appendChild( slot );
			}
			const select = document.createElement( 'button' );
			select.type = 'button';
			select.className = 'lieve-tree-select';
			select.draggable = true;
			select.setAttribute( 'aria-label', 'Select ' + name );
			select.innerHTML = '<span class="lieve-tree-icon" aria-hidden="true">' + lieveContext.elementIcon( node.type ) + '</span><span class="lieve-tree-label" title="' + lieveContext.escapeHtml( name + ' · Click to rename' ) + '">' + lieveContext.escapeHtml( name ) + '</span>';
			select.addEventListener( 'pointerdown', ( event ) => {
				if ( rejectStaleRow( event ) ) { return; }
				// Confirm before blur rebuilds the tree and removes the clicked row.
				if ( ! lieveContext.treeRename || event.button !== 0 ) { return; }
				event.preventDefault();
				if ( event.target.closest( '.lieve-tree-label' ) ) { beginTreeRename( node.id ); }
				else { lieveContext.treeRename.finish( true ); lieveContext.selectElement( node.id ); }
			} );
			select.addEventListener( 'click', ( event ) => {
				if ( rejectStaleRow( event ) ) { return; }
				if ( event.target.closest( '.lieve-tree-label' ) ) { beginTreeRename( node.id ); return; }
				lieveContext.selectElement( node.id );
				lieveContext.canvas.querySelector( '.lieve-editor-node[data-id="' + window.CSS.escape( node.id ) + '"]' )?.scrollIntoView( { block: 'center' } );
			} );
			row.appendChild( select );
			if ( isParent && childCount ) {
				const count = document.createElement( 'span' ); count.className = 'lieve-tree-count'; count.textContent = childCount; count.title = childCount + ( childCount === 1 ? ' child element' : ' child elements' ); count.setAttribute( 'aria-hidden', 'true' ); row.appendChild( count );
			}
			const actions = document.createElement( 'button' ); actions.type = 'button'; actions.className = 'lieve-tree-actions';
			actions.setAttribute( 'aria-label', 'Actions for ' + name ); actions.setAttribute( 'aria-haspopup', 'menu' );
			actions.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="13" cy="8" r="1.2"/></svg>';
			actions.addEventListener( 'pointerdown', ( event ) => { if ( rejectStaleRow( event ) ) { return; } if ( lieveContext.treeRename && event.button === 0 ) { event.preventDefault(); } } );
			actions.addEventListener( 'click', ( event ) => {
				if ( rejectStaleRow( event ) ) { return; }
				event.stopPropagation(); const bounds = actions.getBoundingClientRect(); lieveContext.openContextMenu( node.id, bounds.right, bounds.bottom );
				lieveContext.contextReturnFocus = lieveContext.structure.querySelector( '.lieve-tree-row[data-id="' + window.CSS.escape( node.id ) + '"] .lieve-tree-actions' );
			} );
			row.appendChild( actions );
			row.addEventListener( 'contextmenu', rejectStaleRow, true );
			row.addEventListener( 'keydown', event => {
				if ( rejectStaleRow( event ) ) { return; }
				handleTreeKeyDown( event, node );
			}, true );
			row.addEventListener( 'dragstart', ( event ) => {
				if ( rejectStaleRow( event ) ) { return; }
				if ( event.target.closest( '.lieve-tree-toggle, .lieve-tree-actions, .lieve-tree-rename' ) ) { event.preventDefault(); return; }
				if ( canvasDragHandoff ) {
					if ( canvasDragHandoff( event, Object.freeze( { kind: 'move', id: sourceId, node, element: row,
					current: () => currentRow() && sourcePath.at( -2 )?.node.type !== 'component',
					} ) ) ) { if ( ! event.defaultPrevented && event.dataTransfer?.setDragImage ) { setTreeDragPreview( row, event ); } event.stopPropagation(); return; }
				}
				event.stopPropagation();
				clearTreeDragMotion(); clearTreeDropPlaceholder();
				setTreeDragPreview( row, event );
				lieveContext.structure.classList.add( 'is-dragging' );
				lieveContext.state.draggingId = node.id;
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData( 'text/plain', node.id );
				// Bricks defers pointer-events:none until the native drag has started.
				// Applying it during dragstart can cancel Chrome's drag session.
				window.setTimeout( () => { if ( lieveContext.state.draggingId === node.id && lieveContext.structure.contains( branch ) ) { branch.classList.add( 'is-dragging' ); } }, 0 );
			} );
			row.addEventListener( 'dragend', () => {
				if ( ! currentRow() ) { return; }
				lieveContext.state.draggingId = null;
				clearTreeDragMotion();
				clearTreeDragPreview();
				branch.classList.remove( 'is-dragging' ); lieveContext.structure.classList.remove( 'is-dragging' );
				lieveContext.clearDropIndicators();
			} );
			branch.appendChild( row ); fragment.appendChild( branch );
			treeRows?.set( sourceId, { row, branch, node, path: sourcePath, current: currentRow, toggle: toggleCurrent } );
			if ( childCount && ! lieveContext.state.collapsedIds.has( node.id ) ) {
				const children = document.createElement( 'div' ); children.className = 'lieve-tree-children'; children.setAttribute( 'role', 'group' ); branch.appendChild( children );
				renderTreeBranch( node.children, depth + 1, children, [ ...ancestors, index < nodes.length - 1 ], node.id, sourcePath );
			}
		} );
	}

	function renderStructure( force = false ) {
		if ( structureDisposed ) { return; }
		// Compare exact canonical references and the complete presentation shape,
		// including hidden descendants. No JSON snapshot, DOM identity inference,
		// recursive findNode per row, or mutation of document/history is needed.
		const sameTree = treeProjection && treeProjection.model === lieveContext.state.document && treeProjection.roots === lieveContext.state.document.children && treeProjection.shape.every( item =>
			item.nodes.length === item.length && item.nodes[ item.index ] === item.node && item.node.id === item.id && item.node.type === item.type && item.node.children === item.children && ( item.children?.length || 0 ) === item.count &&
			( item.node.props?.editorLabel || lieveContext.labels[ item.node.type ] || item.node.type ) === item.name && lieveContext.canNest( item.node.type ) === item.nestable && lieveContext.state.collapsedIds.has( item.id ) === item.collapsed
		) && Array.from( treeRows.values() ).every( item => item.current() && item.branch.parentNode === item.parent );
		// Legacy child-document callbacks can leave Firefox's native focus scope
		// stuck in the composition frame when its active parent controls survive.
		// Preserve the existing full-render/focus contract for that exact owned
		// frame; parent-owned input and Structure keyboard keep the delta path.
		if ( ! force && sameTree && document.activeElement !== lieveContext.viewport?.frame && ! lieveContext.treeRename && ! lieveContext.state.draggingId && ! lieveContext.treeDragPreview && ! lieveContext.treeDropPlaceholder && ! lieveContext.treeScrollFrame && ! lieveContext.treeHoverTimer && ! lieveContext.treeDragPointer && ! lieveContext.structure.classList.contains( 'is-dragging' ) ) {
			// Selection-only projection: canonical state remains the single source.
			// Keep the actual focused control/caret, geometry and scroll untouched.
			const selected = treeRows.get( lieveContext.state.selectedId )?.row || null;
			if ( treeProjection.selected !== selected ) {
				if ( treeProjection.selected ) { treeProjection.selected.classList.remove( 'is-selected' ); treeProjection.selected.setAttribute( 'aria-selected', 'false' ); }
				if ( selected ) { selected.classList.add( 'is-selected' ); selected.setAttribute( 'aria-selected', 'true' ); }
				treeProjection.selected = selected;
			}
			const entry = selected || treeRows.values().next().value?.row;
			if ( treeProjection.entry !== entry ) { if ( treeProjection.entry ) { treeProjection.entry.tabIndex = -1; } if ( entry ) { entry.tabIndex = 0; } treeProjection.entry = entry; }
			return;
		}
		treeProjection = null; treeRows = new Map();
		treeGeneration++;
		const panel = lieveContext.structure.parentElement; const scrollTop = panel.scrollTop; const scrollLeft = panel.scrollLeft;
		const active = lieveContext.structure.contains( document.activeElement ) ? document.activeElement : null;
		const focusId = active?.closest( '.lieve-tree-row[data-id]' )?.dataset.id;
		const focusClass = active?.classList.contains( 'lieve-tree-actions' ) ? '.lieve-tree-actions' : active?.classList.contains( 'lieve-tree-toggle' ) ? '.lieve-tree-toggle' : '.lieve-tree-select';
		lieveContext.treeRename?.deactivate(); lieveContext.treeRename = null;
		clearTreeDragMotion();
		clearTreeDragPreview();
		clearTreeDropPlaceholder();
		lieveContext.structure.classList.remove( 'is-dragging' );
		lieveContext.structure.innerHTML = '';
		if ( ! lieveContext.state.document.children.length ) {
			lieveContext.structure.innerHTML = '<div class="lieve-empty-tree">No elements</div>';
			return;
		}
		const fragment = document.createDocumentFragment();
		renderTreeBranch( lieveContext.state.document.children, 0, fragment );
		lieveContext.structure.appendChild( fragment );
		const rows = Array.from( lieveContext.structure.querySelectorAll( '.lieve-tree-row[data-id]' ) );
		const entry = rows.find( row => row.dataset.id === lieveContext.state.selectedId ) || rows[0];
		rows.forEach( row => { row.tabIndex = row === entry ? 0 : -1; } );
		panel.scrollTop = scrollTop; panel.scrollLeft = scrollLeft;
		if ( focusId && ! active.matches( 'input' ) ) { lieveContext.structure.querySelector( '.lieve-tree-row[data-id="' + window.CSS.escape( focusId ) + '"] ' + focusClass )?.focus( { preventScroll: true } ); }
		const shape = [];
		const capture = nodes => nodes.forEach( ( node, index ) => { shape.push( { node, nodes, index, length: nodes.length, id: node.id, type: node.type, children: node.children, count: node.children?.length || 0, name: node.props?.editorLabel || lieveContext.labels[ node.type ] || node.type, nestable: lieveContext.canNest( node.type ), collapsed: lieveContext.state.collapsedIds.has( node.id ) } ); if ( node.children?.length ) { capture( node.children ); } } );
		capture( lieveContext.state.document.children );
		treeRows.forEach( item => { item.parent = item.branch.parentNode; } );
		treeProjection = { model: lieveContext.state.document, roots: lieveContext.state.document.children, shape, selected: treeRows.get( lieveContext.state.selectedId )?.row || null, entry };
	}
	return { bindCanvasDrag, destroy: destroyStructure, renameElement, beginTreeRename, clearTreeDragPreview, setTreeDragPreview, clearTreeDropPlaceholder, treeDropDestination, validTreeDrop, treeDropChangesPosition, treeDropPosition, treeRowDropPosition, resolveTreeDrop, showTreeDropPlaceholder, clearTreeDragMotion, updateTreeHover, treeScrollVelocity, scrollTreeDrag, moveTreeElement, applyTreeDrop, handleTreeDragOver, handleTreeDrop, cancelTreeDrag, handleTreeKeyDown, renderTreeBranch, renderStructure };
	};
} )();
