( function () {
	'use strict';
	window.LieveEditorControllers ||= {};
	window.LieveEditorControllers[ 'document' ] = function create( lieveContext ) {
	function canNest( type ) {
		return typeof lieveContext.config !== 'undefined' && lieveContext.config.elements?.[ type ] ? Boolean( lieveContext.config.elements[ type ].children ) : [ 'section', 'container' ].includes( type );
	}

	function clone( value ) {
		return JSON.parse( JSON.stringify( value ) );
	}

	function normalizeDocument( value ) {
		const result = clone( value || { version: 1, children: [] } );
		delete result.sourcePostId;
		function normalize( node ) {
			node.props = node.props && typeof node.props === 'object' && ! Array.isArray( node.props ) ? node.props : {};
			if ( node.props.listing && lieveContext.listingEditor ) { node.props.listing = lieveContext.listingEditor.normalize( node.props.listing ); }
			node.children = Array.isArray( node.children ) ? node.children : [];
			node.children.forEach( normalize );
		}
		result.children = Array.isArray( result.children ) ? result.children : []; result.children.forEach( normalize );
		return result;
	}

	function uid() {
		if ( window.crypto && typeof window.crypto.randomUUID === 'function' ) {
			return 'lv-' + window.crypto.randomUUID().slice( 0, 8 );
		}
		return 'lv-' + Date.now().toString( 36 ) + Math.random().toString( 36 ).slice( 2, 7 );
	}

	function escapeHtml( value ) {
		return String( value ?? '' )
			.replace( /&/g, '&amp;' )
			.replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' )
			.replace( /"/g, '&quot;' )
			.replace( /'/g, '&#039;' );
	}

	function makeBlock( type ) {
		const block = { id: uid(), type, props: {}, children: [] };
		if ( typeof lieveContext.config !== 'undefined' && lieveContext.config.elements?.[ type ] ) {
			const defaults = lieveContext.config.elements[ type ].defaults;
			block.props = defaults && ! Array.isArray( defaults ) ? clone( defaults ) : {};
			return block;
		}

		switch ( type ) {
			case 'heading':
				block.props = { content: 'Your heading', level: 2 };
				break;
			case 'text':
				block.props = { content: 'Write your text here. You can edit it from the panel on the right.' };
				break;
			case 'button':
				block.props = { label: 'Learn More', url: '#', target: false };
				break;
			case 'image':
				block.props = { attachmentId: 0, url: '', alt: '' };
				break;
		}

		return block;
	}

	function findNode( nodes, id ) {
		for ( const node of nodes ) {
			if ( node.id === id ) {
				return node;
			}
			const found = findNode( node.children || [], id );
			if ( found ) {
				return found;
			}
		}
		return null;
	}

	function findParent( nodes, id, parent = null ) {
		for ( const node of nodes ) {
			if ( node.id === id ) {
				return parent;
			}
			const found = findParent( node.children || [], id, node );
			if ( found ) {
				return found;
			}
		}
		return null;
	}

	function containsId( node, id ) {
		if ( ! node ) {
			return false;
		}
		if ( node.id === id ) {
			return true;
		}
		return ( node.children || [] ).some( ( child ) => containsId( child, id ) );
	}

	function nodeDepth( id, nodes = lieveContext.state.document.children, depth = 0 ) {
		for ( const node of nodes ) {
			if ( node.id === id ) {
				return depth;
			}
			const found = nodeDepth( id, node.children || [], depth + 1 );
			if ( found !== -1 ) {
				return found;
			}
		}
		return -1;
	}

	function subtreeDepth( node ) {
		return node.children?.length ? 1 + Math.max( ...node.children.map( subtreeDepth ) ) : 0;
	}

	function nodeCount( nodes ) {
		return nodes.reduce( ( count, node ) => count + 1 + nodeCount( node.children || [] ), 0 );
	}

	function canDrop( draggingId, targetId, inside = false ) {
		const dragging = findNode( lieveContext.state.document.children, draggingId );
		const target = findNode( lieveContext.state.document.children, targetId );
		if ( ! dragging || ! target || containsId( dragging, targetId ) ) {
			return false;
		}
		if ( inside && ! canNest( target.type ) ) {
			return false;
		}
		const parent = inside ? target : findParent( lieveContext.state.document.children, targetId );
		if ( parent?.type === 'component' || findParent( lieveContext.state.document.children, draggingId )?.type === 'component' ) { return false; }
		return nodeDepth( targetId ) + ( inside ? 1 : 0 ) + subtreeDepth( dragging ) <= 12;
	}

	function removeNode( nodes, id ) {
		for ( let index = 0; index < nodes.length; index++ ) {
			if ( nodes[ index ].id === id ) {
				return nodes.splice( index, 1 )[ 0 ];
			}
			const removed = removeNode( nodes[ index ].children || [], id );
			if ( removed ) {
				return removed;
			}
		}
		return null;
	}

	function insertRelative( nodes, targetId, node, after ) {
		for ( let index = 0; index < nodes.length; index++ ) {
			if ( nodes[ index ].id === targetId ) {
				nodes.splice( index + ( after ? 1 : 0 ), 0, node );
				return true;
			}
			if ( insertRelative( nodes[ index ].children || [], targetId, node, after ) ) {
				return true;
			}
		}
		return false;
	}

	function cloneWithNewIds( node ) {
		const copy = clone( node );
		const ids = new Map(), targets = new Map(), interactionIds = new Map(), motionIds = new Map();
		function refresh( item ) {
			const previous = item.id; item.id = uid(); ids.set( previous, item.id );
			targets.set( lieveContext.automaticDataId( { id: previous } ), lieveContext.automaticDataId( item ) );
			if ( item.props?.dataLieveId ) { targets.set( item.props.dataLieveId, lieveContext.automaticDataId( item ) ); }
			if ( item.props ) { delete item.props.htmlId; delete item.props.dataLieveId; }
			( item.props?.interactions || [] ).forEach( rule => interactionIds.set( rule.id, window.LieveInteractions?.id() || rule.id ) );
			( item.props?.motion || [] ).forEach( row => motionIds.set( row.id, window.LieveMotion?.id() || row.id ) );
			( item.children || [] ).forEach( refresh );
		}
		const roots = Array.isArray( copy ) ? copy : [ copy ];
		roots.forEach( refresh );
		function remap( item ) {
			(item.props?.componentProperties||[]).forEach(row=>{if(ids.has(row.nodeId))row.nodeId=ids.get(row.nodeId);});
			if ( item.props?.interactions && window.LieveInteractions ) { item.props.interactions = window.LieveInteractions.cloneRows( item.props.interactions, ids, interactionIds ); }
			if ( item.props?.motion && window.LieveMotion ) { item.props.motion = window.LieveMotion.cloneRows( item.props.motion, ids, motionIds ); }
			if ( item.props?.conditions && window.LieveElementConditions ) { item.props.conditions = window.LieveElementConditions.clone( item.props.conditions ); }
			( item.props?.interactions || [] ).forEach( rule => { if ( motionIds.has( rule.timelineId ) ) { rule.timelineId = motionIds.get( rule.timelineId ); } } );
			for ( const key of [ 'targetId', 'queryId' ] ) {
				const map = key === 'targetId' && targets.has( item.props?.[ key ] ) ? targets : ids;
				if ( map.has( item.props?.[ key ] ) ) { item.props[ key ] = map.get( item.props[ key ] ); }
			}
			( item.children || [] ).forEach( remap );
		}
		roots.forEach( remap );
		return copy;
	}

	function documentWithNewIds( documentData ) {
		const copy = normalizeDocument( documentData || { version: 1, children: [] } );
		copy.version = 1;
		copy.children = cloneWithNewIds( copy.children || [] );
		return copy;
	}

	function serializeSnapshot( data ) {
		function sorted( value ) {
			if ( Array.isArray( value ) ) { return value.map( sorted ); }
			if ( value && typeof value === 'object' ) { return Object.fromEntries( Object.keys( value ).sort().map( ( key ) => [ key, sorted( value[ key ] ) ] ) ); }
			return value;
		}
		return JSON.stringify( sorted( data ) );
	}

	function snapshot() {
		return serializeSnapshot( {
				document: lieveContext.state.document,
				headerTemplateId: lieveContext.state.headerTemplateId,
				footerTemplateId: lieveContext.state.footerTemplateId,
				templateType: lieveContext.state.templateType,
				popupOpening: lieveContext.state.popupOpening || 'automatic',
				popupSettings: lieveContext.config.isTemplate ? lieveContext.state.popupSettings : undefined,
				templateConditions: lieveContext.state.templateConditions,
				seo: lieveContext.state.seo,
				headOverrides: lieveContext.state.headOverrides,
				pageMarkup: lieveContext.state.pageMarkup,
			} );
	}

	function restoreSnapshot( serialized ) {
		const restored = JSON.parse( serialized );
		lieveContext.state.document = normalizeDocument( restored.document || { version: 1, children: [] } );
		lieveContext.state.headerTemplateId = parseInt( restored.headerTemplateId || 0, 10 );
		lieveContext.state.footerTemplateId = parseInt( restored.footerTemplateId || 0, 10 );
		lieveContext.state.templateType = restored.templateType || 'section';
		lieveContext.state.popupOpening = restored.popupOpening || 'automatic';
		lieveContext.state.popupSettings = window.LievePopupSettings?.normalize( restored.popupSettings ) || {};
		lieveContext.state.templateConditions = clone( restored.templateConditions || [] );
		if ( window.LieveSEO && ! lieveContext.config.isTemplate ) { lieveContext.state.seo = window.LieveSEO.normalize( restored.seo || {} ); }
		if ( ! lieveContext.config.isTemplate ) { lieveContext.state.headOverrides = window.LieveHead.normalize( restored.headOverrides ); }
		if ( ! lieveContext.config.isTemplate ) { lieveContext.state.pageMarkup = window.LievePageMarkup.normalize( restored.pageMarkup ); }
		lieveContext.conditionsBuilder?.setConditions( lieveContext.state.templateConditions, false, lieveContext.state.templateType, lieveContext.state.popupOpening );
		lieveContext.conditionsBuilder?.setTemplateType( lieveContext.state.templateType );
	}

	function commit( change, preserveInspector = false ) {
		lieveContext.richTextController?.flush(); lieveContext.codeFields?.flush();
		lieveContext.liveEdit = null;
		lieveContext.closeContextMenu();
		lieveContext.state.future = [];
		window.LieveHistory.push( lieveContext.state.history, snapshot(), lieveContext.state.future );
		change();
		lieveContext.state.dirty = snapshot() !== lieveContext.state.savedSnapshot;
		lieveContext.renderAll( preserveInspector );
	}

	function liveChange( key, change, styleOnly = false ) {
		const before = snapshot();
		change();
		const after = snapshot();
		if ( after === before ) { return; }
		if ( ! lieveContext.liveEdit || lieveContext.liveEdit.key !== key || Date.now() - lieveContext.liveEdit.time > 1600 ) {
			window.LieveHistory.push( lieveContext.state.history, before );
		}
		lieveContext.liveEdit = { key, time: Date.now() }; lieveContext.state.future = []; lieveContext.state.dirty = after !== lieveContext.state.savedSnapshot;
		if ( styleOnly === 'metadata' ) { lieveContext.seoEditor?.sync(); lieveContext.headEditor?.sync(); lieveContext.pageMarkupEditor?.sync(); lieveContext.updateButtons(); return; }
		let contentPatched = false;
		if ( styleOnly ) { lieveContext.renderCanvasStyles(); if ( ! key.startsWith( 'listing:' ) && lieveContext.listingAncestor( findNode( lieveContext.state.document.children, lieveContext.state.selectedId ) || { id: '' } ) ) { lieveContext.renderCanvas(); } }
		else { contentPatched = lieveContext.renderCanvasElement( key ); if ( ! contentPatched ) { lieveContext.renderCanvas(); } }
		// Styling cannot change tree topology, names or nesting. Keep its DOM/focus intact.
		if ( ! styleOnly && ( ! contentPatched || key.endsWith( ':prop:editorLabel' ) ) ) { lieveContext.renderStructure(); } lieveContext.updateButtons();
	}

	function undo() {
		lieveContext.richTextController?.flush(); lieveContext.codeFields?.flush();
		if ( lieveContext.activeClassId && lieveContext.classWorkspace ) { lieveContext.classWorkspace.undo(); lieveContext.renderInspector(); lieveContext.updateButtons(); return; }
		lieveContext.liveEdit = null;
		if ( ! lieveContext.state.history.length ) {
			return;
		}
		window.LieveHistory.push( lieveContext.state.future, snapshot(), lieveContext.state.history );
		restoreSnapshot( lieveContext.state.history.pop() );
		if ( lieveContext.state.selectedId && ! findNode( lieveContext.state.document.children, lieveContext.state.selectedId ) ) {
			lieveContext.state.selectedId = null;
		}
		lieveContext.state.dirty = snapshot() !== lieveContext.state.savedSnapshot;
		lieveContext.renderAll();
	}

	function redo() {
		lieveContext.richTextController?.flush(); lieveContext.codeFields?.flush();
		if ( lieveContext.activeClassId && lieveContext.classWorkspace ) { lieveContext.classWorkspace.redo(); lieveContext.renderInspector(); lieveContext.updateButtons(); return; }
		lieveContext.liveEdit = null;
		if ( ! lieveContext.state.future.length ) {
			return;
		}
		window.LieveHistory.push( lieveContext.state.history, snapshot(), lieveContext.state.future );
		restoreSnapshot( lieveContext.state.future.pop() );
		lieveContext.state.dirty = snapshot() !== lieveContext.state.savedSnapshot;
		lieveContext.renderAll();
	}

	// Optional explicit destination for trusted catalogue handoff. The ordinary
	// click path keeps its original insertion context and uses the same commit.
	function canInsertBlockAt( type, destination ) {
		if ( ! destination || ! Object.hasOwn( lieveContext.config.elements || {}, type ) || lieveContext.config.elements[ type ].dependency || nodeCount( lieveContext.state.document.children ) >= 400 ) { return false; }
		const parent = destination.parentId ? findNode( lieveContext.state.document.children, destination.parentId ) : null;
		if ( destination.parentId && ( ! parent || parent.type === 'component' || ! canNest( parent.type ) ) || lieveContext.config.componentMode && ! parent && lieveContext.state.document.children.length ) { return false; }
		const siblings = parent ? parent.children || [] : lieveContext.state.document.children;
		return ( ! parent || nodeDepth( parent.id ) + 1 <= 12 ) && ( ! destination.beforeId || siblings.some( node => node.id === destination.beforeId ) );
	}
	function addBlock( type, destination = null ) {
		if ( destination && ! canInsertBlockAt( type, destination ) ) { return false; }
		if ( lieveContext.config.elements?.[ type ]?.dependency ) { return; }
		const block = makeBlock( type );
		if ( nodeCount( lieveContext.state.document.children ) >= 400 ) {
			lieveContext.showToast( 'A document can contain up to 400 elements.', true );
			return;
		}
		const selected = findNode( lieveContext.state.document.children, lieveContext.state.selectedId );
		const selectedParent = findParent( lieveContext.state.document.children, lieveContext.state.selectedId );
		const repeatedInsertion = lieveContext.catalogueInsertion && selected?.id === lieveContext.catalogueInsertion.lastAddedId &&
			( selectedParent?.id ?? null ) === lieveContext.catalogueInsertion.parentId;
		const parent = destination ? destination.parentId ? findNode( lieveContext.state.document.children, destination.parentId ) : null : repeatedInsertion ? selectedParent : selected && canNest( selected.type ) ? selected : selectedParent;
		if ( parent?.type === 'component' ) { lieveContext.showToast( 'Choose a named Slot to add local component content.' ); return; }
		if ( lieveContext.config.componentMode && ! parent && lieveContext.state.document.children.length ) { lieveContext.showToast( 'A component has one model root. Select its container to add content inside it.' ); return; }
		if ( parent && nodeDepth( parent.id ) + 1 + subtreeDepth( block ) > 12 ) {
			lieveContext.showToast( 'The maximum nesting depth is 12.', true );
			return;
		}

		commit( () => {
			if ( destination ) {
				const siblings = parent ? parent.children : lieveContext.state.document.children;
				siblings.splice( destination.beforeId ? siblings.findIndex( node => node.id === destination.beforeId ) : siblings.length, 0, block );
				if ( parent ) { lieveContext.state.collapsedIds.delete( parent.id ); }
			} else {
				if ( parent ) {
					parent.children.push( block );
					lieveContext.state.collapsedIds.delete( parent.id );
				} else {
					lieveContext.state.document.children.push( block );
				}
			}
			lieveContext.state.selectedId = block.id;
			lieveContext.catalogueInsertion = { parentId: parent?.id ?? null, lastAddedId: block.id };
		} );
		return true;
	}

	function deleteSelected() {
		if ( ! lieveContext.state.selectedId ) {
			return;
		}
		if ( findParent( lieveContext.state.document.children, lieveContext.state.selectedId )?.type === 'component' ) { lieveContext.showToast( 'Named Slots belong to the shared model. Edit or remove their contents instead.' ); return; }
		commit( () => {
			removeNode( lieveContext.state.document.children, lieveContext.state.selectedId );
			lieveContext.state.selectedId = null;
		} );
	}

	function pasteAllContent( documentData ) {
		if ( lieveContext.state.saving ) { return; }
		const incoming = documentWithNewIds( documentData ), roots = incoming.children;
		if ( ! roots.length ) { return; }
		if ( nodeCount( lieveContext.state.document.children ) + nodeCount( roots ) > 400 || roots.some( root => subtreeDepth( root ) > 12 ) ) { throw new Error( 'Pasting would exceed 400 elements or 12 nesting levels.' ); }
		const ids = new Set(); walkNodes( lieveContext.state.document.children, item => ids.add( item.id ) );
		walkNodes( roots, item => { if ( ids.has( item.id ) ) { throw new Error( 'A new element ID could not be generated. Try pasting again.' ); } ids.add( item.id ); } );
		lieveContext.activeClassId = null; lieveContext.classWorkspace?.breakGroup(); lieveContext.catalogueInsertion = null;
		commit( () => { lieveContext.state.document.children.push( ...roots ); lieveContext.state.selectedId = roots[0].id; } );
		lieveContext.showToast( 'Content added at the page root. Undo restores the previous content.' );
	}

	function clearAllContent() {
		if ( lieveContext.state.saving || ! lieveContext.state.document.children.length ) { return; }
		lieveContext.treeRename?.finish( true ); lieveContext.activeClassId = null; lieveContext.classWorkspace?.breakGroup(); lieveContext.catalogueInsertion = null;
		commit( () => { lieveContext.state.document.children = []; lieveContext.state.selectedId = null; lieveContext.state.collapsedIds.clear(); } );
		lieveContext.showToast( 'Content cleared. Undo restores it.' );
	}

	function duplicateSelected() {
		const selected = findNode( lieveContext.state.document.children, lieveContext.state.selectedId );
		if ( selected && findParent(lieveContext.state.document.children,selected.id)?.type === 'component' ) { lieveContext.showToast('Named Slots are defined by the model. Duplicate their contents instead.'); return; }
		if ( ! selected ) {
			return;
		}
		if ( nodeCount( lieveContext.state.document.children ) + nodeCount( [ selected ] ) > 400 ) {
			lieveContext.showToast( 'Duplicating this branch would exceed 400 elements.', true );
			return;
		}
		commit( () => {
			const copy = cloneWithNewIds( selected );
			insertRelative( lieveContext.state.document.children, selected.id, copy, true );
			lieveContext.state.selectedId = copy.id;
		} );
	}

	function moveSelected( direction ) {
		if ( ! lieveContext.state.selectedId ) {
			return;
		}
		commit( () => {
			const parent = findParent( lieveContext.state.document.children, lieveContext.state.selectedId );
			const siblings = parent ? parent.children : lieveContext.state.document.children;
			const index = siblings.findIndex( ( item ) => item.id === lieveContext.state.selectedId );
			const next = index + direction;
			if ( index < 0 || next < 0 || next >= siblings.length ) {
				return;
			}
			[ siblings[ index ], siblings[ next ] ] = [ siblings[ next ], siblings[ index ] ];
		} );
	}

	function moveRelative( draggingId, targetId, after ) {
		if ( ! canDrop( draggingId, targetId ) ) {
			return;
		}
		commit( () => {
			const removed = removeNode( lieveContext.state.document.children, draggingId );
			if ( removed ) {
				insertRelative( lieveContext.state.document.children, targetId, removed, after );
				lieveContext.state.selectedId = removed.id;
			}
		} );
	}

	function moveInside( draggingId, parentId ) {
		if ( ! canDrop( draggingId, parentId, true ) ) {
			return;
		}

		commit( () => {
			const removed = removeNode( lieveContext.state.document.children, draggingId );
			const freshParent = findNode( lieveContext.state.document.children, parentId );
			if ( removed && freshParent ) {
				freshParent.children.push( removed );
				lieveContext.state.collapsedIds.delete( parentId );
				lieveContext.state.selectedId = removed.id;
			}
		} );
	}

	function moveToRoot( draggingId ) {
		if ( ! findNode( lieveContext.state.document.children, draggingId ) ) {
			return;
		}
		commit( () => {
			const removed = removeNode( lieveContext.state.document.children, draggingId );
			lieveContext.state.document.children.push( removed );
			lieveContext.state.selectedId = removed.id;
		} );
	}

	function pasteElement( inside = false ) {
		const selected = findNode( lieveContext.state.document.children, lieveContext.state.selectedId );
		if ( ! lieveContext.copiedElement || ! selected || ( inside && ! canNest( selected.type ) ) ) { return; }
		if ( ( inside ? selected : findParent( lieveContext.state.document.children, selected.id ) )?.type === 'component' ) { lieveContext.showToast( 'Paste local content inside a named Slot.' ); return; }
		if ( nodeCount( lieveContext.state.document.children ) + nodeCount( [ lieveContext.copiedElement ] ) > 400 || nodeDepth( selected.id ) + ( inside ? 1 : 0 ) + subtreeDepth( lieveContext.copiedElement ) > 12 ) { lieveContext.showToast( 'Pasting would exceed the document size or nesting limit.', true ); return; }
		commit( () => { const copy = cloneWithNewIds( lieveContext.copiedElement ); if ( inside ) { selected.children.push( copy ); lieveContext.state.collapsedIds.delete( selected.id ); } else { insertRelative( lieveContext.state.document.children, selected.id, copy, true ); } lieveContext.state.selectedId = copy.id; } );
	}

	function wrapSelected() {
		const selected = findNode( lieveContext.state.document.children, lieveContext.state.selectedId );
		if ( selected && findParent( lieveContext.state.document.children, selected.id )?.type === 'component' ) { lieveContext.showToast( 'Wrap the content inside this Slot, not the Slot itself.' ); return; }
		if ( ! selected || nodeCount( lieveContext.state.document.children ) >= 400 || nodeDepth( selected.id ) + subtreeDepth( selected ) >= 12 ) { lieveContext.showToast( 'Wrapping would exceed the document limit.', true ); return; }
		commit( () => { const container = makeBlock( 'container' ); insertRelative( lieveContext.state.document.children, selected.id, container, false ); removeNode( lieveContext.state.document.children, selected.id ); container.children.push( selected ); lieveContext.state.selectedId = container.id; } );
	}

	function walkNodes( nodes, visit ) {
		nodes.forEach( ( node ) => { visit( node ); walkNodes( node.children || [], visit ); } );
	}
	return { canInsertBlockAt, canNest, clone, normalizeDocument, uid, escapeHtml, makeBlock, findNode, findParent, containsId, nodeDepth, subtreeDepth, nodeCount, canDrop, removeNode, insertRelative, cloneWithNewIds, documentWithNewIds, serializeSnapshot, snapshot, restoreSnapshot, commit, liveChange, undo, redo, addBlock, deleteSelected, pasteAllContent, clearAllContent, duplicateSelected, moveSelected, moveRelative, moveInside, moveToRoot, pasteElement, wrapSelected, walkNodes };
	};
} )();
