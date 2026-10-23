( function () {
	'use strict';
	window.LieveEditorControllers ||= {};
	window.LieveEditorControllers[ 'context-menu' ] = function create( lieveContext ) {
	let menuOwner = null;
	function currentMenuOwner() {
		return Boolean( menuOwner && menuOwner.model === lieveContext.state.document && lieveContext.state.selectedId === menuOwner.node.id && lieveContext.findNode( menuOwner.model.children, menuOwner.node.id ) === menuOwner.node );
	}
	function closeContextMenu( restoreFocus = false ) {
		if ( ! lieveContext.contextMenu || lieveContext.contextMenu.hidden ) { return; }
		const current = currentMenuOwner() || window.LieveViewport?.keyboardContext?.( lieveContext.contextReturnFocus, true ) === true; menuOwner = null;
		lieveContext.contextMenu.hidden = true;
		if ( restoreFocus && current && lieveContext.contextReturnFocus?.isConnected ) { lieveContext.contextReturnFocus.focus( { preventScroll: true } ); }
	}

	function copyElementStyles( node ) {
		const copy = lieveContext.clone( node ); lieveContext.styles?.migrate( copy ); lieveContext.copiedStyles = lieveContext.clone( copy.props.styles || {} ); lieveContext.showToast( 'Styles copied.' );
	}

	function elementClassAssignments( node ) {
		const props = node.props || {};
		return { classIds: [ ...new Set( ( Array.isArray( props.classIds ) ? props.classIds : [] ).filter( id => typeof id === 'string' && /^ds_[a-z0-9]{8,24}$/.test( id ) ) ) ], classNames: [ ...new Set( String( props.className || '' ).split( /\s+/ ).filter( Boolean ) ) ] };
	}

	function elementClassSummary( node ) {
		return window.LieveClasses?.summaryMarkup( node?.props || {}, lieveContext.classWorkspace?.current().classes || [], lieveContext.activeClassId, lieveContext.classWorkspace?.canManage ) || 'No class';
	}

	function syncElementClassSummary() {
		const node = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId ), label = lieveContext.inspector.querySelector( '[data-element-class-list]' );
		if ( node && label ) { label.innerHTML = elementClassSummary( node ); }
	}

	function canTransferElementClasses( node ) {
		return node.type !== 'html' || Boolean( lieveContext.styles?.htmlHasWrapper( node ) );
	}

	function copyElementClasses( node ) {
		if ( ! canTransferElementClasses( node ) ) { return; }
		lieveContext.copiedClasses = elementClassAssignments( node );
		lieveContext.showToast( lieveContext.copiedClasses.classIds.length || lieveContext.copiedClasses.classNames.length ? 'Classes copied.' : 'No classes on this element.' );
	}

	function pasteElementClasses( node ) {
		if ( ! lieveContext.copiedClasses || ! canTransferElementClasses( node ) ) { return; }
		const current = elementClassAssignments( node );
		const classIds = [ ...new Set( [ ...current.classIds, ...lieveContext.copiedClasses.classIds ] ) ];
		const classNames = [ ...new Set( [ ...current.classNames, ...lieveContext.copiedClasses.classNames ] ) ];
		if ( classIds.length > 30 || classNames.length > 8 ) { lieveContext.showToast( 'Pasting would exceed the limit of 30 global classes or 8 custom CSS classes. No classes were changed.', true ); return; }
		if ( classIds.length === current.classIds.length && classNames.length === current.classNames.length ) { lieveContext.showToast( 'These classes are already assigned.' ); return; }
		lieveContext.activeClassId = null; lieveContext.classWorkspace?.breakGroup();
		lieveContext.commit( () => { if ( classIds.length ) { node.props.classIds = classIds; } if ( classNames.length ) { node.props.className = classNames.join( ' ' ); } } );
		lieveContext.showToast( 'Classes added.' );
	}

	function canTransferElementInteractions( node ) {
		return Boolean( window.LieveInteractions && canTransferElementClasses( node ) );
	}

	function copyElementInteractions( node ) {
		if ( ! canTransferElementInteractions( node ) ) { return; }
		const rows = Array.isArray( node.props.interactions ) ? lieveContext.clone( node.props.interactions ) : [];
		if ( rows.some( row => ! row || typeof row !== 'object' || ! /^li_[a-f0-9]{12,24}$/.test( row.id ) ) || new Set( rows.map( row => row.id ) ).size !== rows.length ) { lieveContext.copiedInteractions = null; lieveContext.showToast( 'Interactions could not be copied. Review their IDs and try again.', true ); return; }
		lieveContext.copiedInteractions = { sourceId: node.id, rows };
		lieveContext.showToast( rows.length ? 'Interactions copied.' : 'No interactions on this element.' );
	}

	function pasteElementInteractions( node ) {
		if ( ! lieveContext.copiedInteractions?.rows.length || ! canTransferElementInteractions( node ) ) { return; }
		const model = window.LieveInteractions;
		const current = Array.isArray( node.props.interactions ) ? node.props.interactions : [];
		if ( current.length + lieveContext.copiedInteractions.rows.length > model.catalog.limit ) { lieveContext.showToast( 'Pasting would exceed the limit of ' + model.catalog.limit + ' interactions per element. No rules were changed.', true ); return; }
		const used = new Set(); lieveContext.walkNodes( lieveContext.state.document.children, item => { ( Array.isArray( item.props.interactions ) ? item.props.interactions : [] ).forEach( row => used.add( row.id ) ); } );
		const interactionIds = new Map();
		for ( const row of lieveContext.copiedInteractions.rows ) {
			let fresh = null;
			for ( let attempt = 0; attempt < 64; attempt++ ) { const next = model.id(); if ( /^li_[a-f0-9]{12,24}$/.test( next ) && ! used.has( next ) ) { fresh = next; break; } }
			if ( ! fresh ) { lieveContext.showToast( 'Unique interaction IDs could not be created. No rules were changed.', true ); return; }
			used.add( fresh ); interactionIds.set( row.id, fresh );
		}
		const rows = model.cloneRows( lieveContext.copiedInteractions.rows, new Map( [ [ lieveContext.copiedInteractions.sourceId, node.id ] ] ), interactionIds );
		lieveContext.activeClassId = null; lieveContext.classWorkspace?.breakGroup();
		lieveContext.commit( () => { node.props.interactions = [ ...current, ...rows ]; } );
		lieveContext.showToast( 'Interactions added.' );
	}

	function contextTransferRow( verb, classesAllowed, interactionsAllowed = false ) {
		const paths = { styles: '<rect x="3" y="3" width="14" height="6" rx="2"/><path d="M17 6h3v6H10v3"/><rect x="8" y="15" width="4" height="6" rx="1"/>', classes: '<path d="m4 8 8-5 8 5-8 5-8-5Zm0 5 8 5 8-5M4 18l8 5 8-5"/>', interactions: '<path d="m13 3-8 11h6l-1 7 9-12h-6z"/>' };
		const labels = { styles: 'Styles', classes: 'Classes', interactions: 'Interact' };
		const copying = verb === 'copy', label = copying ? 'Copy' : 'Paste';
		return '<div class="lieve-context-transfer" role="presentation"><span class="lieve-context-transfer-label" aria-hidden="true">' + label + '</span>' + [ 'styles', 'classes', 'interactions' ].map( kind => {
			const disabled = kind === 'classes' ? ! classesAllowed || ! copying && ( ! lieveContext.copiedClasses || ! ( lieveContext.copiedClasses.classIds.length || lieveContext.copiedClasses.classNames.length ) ) : kind === 'interactions' ? ! interactionsAllowed || ! copying && ! lieveContext.copiedInteractions?.rows.length : ! copying && lieveContext.copiedStyles === null;
			const title = kind === 'classes' && ! classesAllowed ? 'Enable the HTML wrapper to assign classes' : kind === 'interactions' && ! interactionsAllowed ? ( classesAllowed ? 'Interactions are unavailable' : 'Enable the HTML wrapper to use interactions' ) : label + ' ' + kind + ( ! copying && kind === 'classes' ? ' · Add without duplicates' : ! copying && kind === 'interactions' ? ' · Add rules with new IDs' : '' );
			return '<button type="button" class="lieve-context-transfer-action" role="menuitem" data-context-action="' + verb + '-' + kind + '" aria-label="' + label + ' ' + kind + '" title="' + title + '"' + ( disabled ? ' disabled' : '' ) + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[ kind ] + '</svg><span>' + labels[ kind ] + '</span></button>';
		} ).join( '' ) + '</div>';
	}

	function runContextAction( action ) {
		const node = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId ); if ( ! node ) { return; }
		closeContextMenu();
		switch ( action ) {
			case 'content': case 'style': lieveContext.inspectorTab = action; lieveContext.renderInspector(); lieveContext.inspector.querySelector( '[data-inspector-tab="' + action + '"]' )?.focus(); break;
			case 'rename': lieveContext.beginTreeRename( node.id ); break;
			case 'create-component': lieveContext.inspectorTab='content';lieveContext.componentEditor?.beginCreate(node.id); break;
			case 'duplicate': lieveContext.duplicateSelected(); break;
			case 'copy': lieveContext.copiedElement = lieveContext.clone( node ); lieveContext.showToast( 'Element copied.' ); break;
			case 'cut': lieveContext.copiedElement = lieveContext.clone( node ); lieveContext.deleteSelected(); lieveContext.showToast( 'Element cut. Paste it from another element’s menu.' ); break;
			case 'paste': lieveContext.pasteElement(); break;
			case 'paste-inside': lieveContext.pasteElement( true ); break;
			case 'copy-styles': copyElementStyles( node ); break;
			case 'copy-classes': copyElementClasses( node ); break;
			case 'paste-classes': pasteElementClasses( node ); break;
			case 'copy-interactions': copyElementInteractions( node ); break;
			case 'paste-interactions': pasteElementInteractions( node ); break;
			case 'paste-styles': if ( lieveContext.copiedStyles ) { lieveContext.commit( () => { lieveContext.styles?.migrate( node ); const targets = lieveContext.config.styleTargets?.[ node.type ] || { root: {} }; node.props.styles = Object.fromEntries( Object.entries( lieveContext.clone( lieveContext.copiedStyles ) ).filter( ( [ key ] ) => targets[ key ] ) ); lieveContext.styles?.prune( node ); } ); } break;
			case 'reset-styles': lieveContext.commit( () => { lieveContext.styles?.migrate( node ); delete node.props.styles; } ); break;
			case 'up': lieveContext.moveSelected( -1 ); break;
			case 'down': lieveContext.moveSelected( 1 ); break;
			case 'root': lieveContext.moveToRoot( node.id ); break;
			case 'wrap': lieveContext.wrapSelected(); break;
			case 'parent': { const parent = lieveContext.findParent( lieveContext.state.document.children, node.id ); if ( parent ) { lieveContext.selectElement( parent.id ); } break; }
			case 'collapse': if ( lieveContext.state.collapsedIds.has( node.id ) ) { lieveContext.state.collapsedIds.delete( node.id ); } else { lieveContext.state.collapsedIds.add( node.id ); } lieveContext.renderStructure(); break;
			case 'add': lieveContext.showWorkspacePanel( 'elements' ); document.getElementById( 'lieve-element-search' )?.focus(); break;
			case 'delete': lieveContext.deleteSelected(); break;
		}
	}

	function openContextMenu( id, x, y ) {
		lieveContext.treeRename?.finish( true );
		lieveContext.selectElement( id ); const node = lieveContext.findNode( lieveContext.state.document.children, id ); if ( ! node ) { return; }
		menuOwner = { model: lieveContext.state.document, node };
		lieveContext.contextReturnFocus = lieveContext.canvas.querySelector( '.lieve-editor-node[data-id="' + window.CSS.escape( id ) + '"]' );
		if ( ! lieveContext.contextMenu ) {
			lieveContext.contextMenu = document.createElement( 'div' ); lieveContext.contextMenu.className = 'lieve-context-menu'; lieveContext.contextMenu.setAttribute( 'role', 'presentation' ); lieveContext.app.appendChild( lieveContext.contextMenu );
			lieveContext.contextMenu.addEventListener( 'click', ( event ) => { if ( ! currentMenuOwner() ) { event.preventDefault(); event.stopImmediatePropagation(); closeContextMenu(); return; } const button = event.target.closest( '[data-context-action]' ); if ( button && ! button.disabled ) { runContextAction( button.dataset.contextAction ); } } );
			lieveContext.contextMenu.addEventListener( 'keydown', ( event ) => {
				if ( ! currentMenuOwner() ) { if ( event.key !== 'Tab' ) { event.preventDefault(); } event.stopImmediatePropagation(); closeContextMenu(); return; }
				if ( event.defaultPrevented || event.isComposing || event.keyCode === 229 ) { return; }
				const buttons = Array.from( lieveContext.contextMenu.querySelectorAll( '[data-context-action]:not(:disabled)' ) ); const index = buttons.indexOf( document.activeElement );
				if ( [ 'ArrowDown', 'ArrowUp', 'Home', 'End' ].includes( event.key ) ) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index < 0 ? ( event.key === 'ArrowDown' ? 0 : buttons.length - 1 ) : ( index + ( event.key === 'ArrowDown' ? 1 : -1 ) + buttons.length ) % buttons.length; buttons[ next ]?.focus(); }
				if ( [ 'ArrowLeft', 'ArrowRight' ].includes( event.key ) ) { const row = event.target.closest( '.lieve-context-transfer' ); if ( row ) { event.preventDefault(); const actions = Array.from( row.querySelectorAll( 'button:not(:disabled)' ) ); const at = actions.indexOf( document.activeElement ); actions[ ( at + ( event.key === 'ArrowRight' ? 1 : -1 ) + actions.length ) % actions.length ]?.focus(); } }
				if ( event.key === 'Escape' ) { event.preventDefault(); event.stopPropagation(); closeContextMenu( true ); }
				if ( event.key === 'Tab' ) { closeContextMenu(); }
			} );
		}
		const parent = lieveContext.findParent( lieveContext.state.document.children, id ); const siblings = parent ? parent.children : lieveContext.state.document.children; const index = siblings.findIndex( ( item ) => item.id === id );
		const button = ( action, label, shortcut = '', disabled = false, danger = false ) => '<button type="button" role="menuitem" data-context-action="' + action + '"' + ( disabled ? ' disabled' : '' ) + ( danger ? ' class="is-danger"' : '' ) + '><span>' + label + '</span>' + ( shortcut ? '<kbd>' + shortcut + '</kbd>' : '' ) + '</button>';
		const divider = '<div role="separator"></div>';
		lieveContext.contextMenu.innerHTML = '<div class="lieve-context-title">' + lieveContext.elementIcon( node.type ) + '<span>' + lieveContext.escapeHtml( node.props.editorLabel || lieveContext.labels[ node.type ] || node.type ) + '</span></div><div class="lieve-context-scroll" role="menu" aria-label="Element actions">' +
			button( 'content', 'Edit content' ) + button( 'style', 'Edit style' ) + button( 'rename', 'Rename in Structure' ) + ( lieveContext.config.canCreateComponents && !lieveContext.config.componentMode && node.type!=='component' ? button('create-component','Create linked component…') : '' ) + divider +
			button( 'duplicate', 'Duplicate', '⌘/Ctrl D' ) + button( 'copy', 'Copy element' ) + button( 'cut', 'Cut element' ) + button( 'paste', 'Paste after', '', ! lieveContext.copiedElement ) + ( lieveContext.canNest( node.type ) ? button( 'paste-inside', 'Paste inside', '', ! lieveContext.copiedElement ) : '' ) + divider +
			contextTransferRow( 'copy', canTransferElementClasses( node ), canTransferElementInteractions( node ) ) + contextTransferRow( 'paste', canTransferElementClasses( node ), canTransferElementInteractions( node ) ) + button( 'reset-styles', 'Reset all styles' ) + divider +
			button( 'up', 'Move up', '', index === 0 ) + button( 'down', 'Move down', '', index === siblings.length - 1 ) + button( 'parent', 'Select parent', '', ! parent ) + button( 'root', 'Move to root', '', ! parent ) + button( 'wrap', 'Wrap in Container' ) +
			( lieveContext.canNest( node.type ) ? button( 'collapse', lieveContext.state.collapsedIds.has( id ) ? 'Expand children' : 'Collapse children' ) : '' ) + button( 'add', 'Add element…' ) + divider + button( 'delete', 'Delete', 'Del', false, true ) + '</div><div class="lieve-context-overflow" hidden><button type="button" class="lieve-context-scroll-control" aria-label="Show more element actions"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg><span>More actions</span></button></div>';
		lieveContext.contextMenu.hidden = false; lieveContext.contextMenu.style.left = '0px'; lieveContext.contextMenu.style.top = '0px';
		const scroll = lieveContext.contextMenu.querySelector( '.lieve-context-scroll' ), overflow = lieveContext.contextMenu.querySelector( '.lieve-context-overflow' ), scrollControl = overflow.querySelector( 'button' );
		scroll.scrollTop = 0;
		overflow.hidden = scroll.scrollHeight <= scroll.clientHeight + 1;
		const updateScrollControl = () => {
			const atEnd = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= 1;
			scrollControl.classList.toggle( 'is-at-end', atEnd );
			scrollControl.querySelector( 'span' ).textContent = atEnd ? 'Back to top' : 'More actions';
			scrollControl.setAttribute( 'aria-label', atEnd ? 'Scroll to the first element action' : 'Show more element actions' );
		};
		scroll.addEventListener( 'scroll', updateScrollControl, { passive: true } );
		scrollControl.addEventListener( 'click', () => {
			const atEnd = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= 1;
			scroll.scrollTo( { top: atEnd ? 0 : Math.min( scroll.scrollHeight - scroll.clientHeight, scroll.scrollTop + scroll.clientHeight * .75 ), behavior: window.matchMedia?.( '(prefers-reduced-motion: reduce)' ).matches ? 'instant' : 'smooth' } );
		} );
		updateScrollControl();
		const rect = lieveContext.contextMenu.getBoundingClientRect(); lieveContext.contextMenu.style.left = Math.max( 8, Math.min( x, window.innerWidth - rect.width - 8 ) ) + 'px'; lieveContext.contextMenu.style.top = Math.max( 8, Math.min( y, window.innerHeight - rect.height - 8 ) ) + 'px';
		scroll.querySelector( '[data-context-action]:not(:disabled)' )?.focus( { preventScroll: true } );
	}
	return { closeContextMenu, copyElementStyles, elementClassAssignments, elementClassSummary, syncElementClassSummary, canTransferElementClasses, copyElementClasses, pasteElementClasses, canTransferElementInteractions, copyElementInteractions, pasteElementInteractions, contextTransferRow, runContextAction, openContextMenu };
	};
} )();
