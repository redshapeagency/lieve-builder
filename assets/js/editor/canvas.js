( function () {
	'use strict';
	/** Trusted renderer registrations only. Never infer identity from authored attributes. */
	function createCanvasIdentity( { root, readDocument } ) {
		let records = new WeakMap(), owners = new WeakMap(), model = readDocument();
		let generation = 0, sequence = 0, registrations = 0, destroyed = false;
		const validOwner = owner => {
			if ( destroyed || ! owner || ! owners.has( owner ) || owners.get( owner ).generation !== generation || model !== readDocument() ) { return false; }
			for ( let item = owner; item; item = owners.get( item ).parent ) { if ( ! owners.get( item ).active ) { return false; } }
			return true;
		};
		const result = ( status, reason, identity = null, via = null ) => Object.freeze( { status, reason, identity, via } );
		function owner( identity, parent = null ) {
			if ( destroyed || parent && ! validOwner( parent ) ) { throw new Error( 'Inactive canvas identity owner.' ); }
			const token = Object.freeze( {} );
			owners.set( token, { generation, active: true, parent, identity: Object.freeze( { ...identity, context: Object.freeze( { ...identity.context } ), instance: ++sequence } ) } ); return token;
		}
		function register( element, token, policy = 'self' ) {
			if ( ! validOwner( token ) || element?.nodeType !== 1 || ! [ 'self', 'descendants', 'opaque' ].includes( policy ) ) { throw new Error( 'Invalid canvas identity registration.' ); }
			records.set( element, { token, policy } ); registrations++; return element;
		}
		function resolve( node ) {
			if ( destroyed ) { return result( 'destroyed', 'canvas-destroyed' ); }
			if ( model !== readDocument() ) { return result( 'stale', 'document-changed' ); }
			if ( ! node || node.ownerDocument !== root.ownerDocument ) { return result( 'unmanaged', 'foreign-document' ); }
			if ( ! root.isConnected || ! root.contains( node ) ) { return result( 'unmanaged', 'outside-canvas' ); }
			if ( node === root ) { return result( 'canvas', 'canvas-background' ); }
			if ( [ 'IFRAME', 'OBJECT', 'EMBED' ].includes( node.nodeName ) ) { return result( 'unmanaged', 'browsing-context' ); }
			for ( let current = node; current && current !== root; current = current.parentNode ) {
				const record = records.get( current ); if ( ! record ) { continue; }
				if ( ! validOwner( record.token ) ) { return result( 'stale', 'replaced-render-owner' ); }
				const { identity } = owners.get( record.token );
				if ( current !== node && record.policy === 'self' ) { continue; }
				if ( ! identity.selectId ) { return result( 'unmanaged', identity.kind, identity, 'boundary' ); }
				return result( current !== node && record.policy === 'opaque' ? 'opaque' : 'resolved', record.policy === 'opaque' ? 'preview-contents-unmapped' : null, identity, current === node ? 'direct' : record.policy );
			}
			return result( 'unmanaged', 'unregistered-node' );
		}
		return Object.freeze( {
			owner, register, resolve,
			active( element ) { return validOwner( records.get( element )?.token ); },
			parent( element ) { return owners.get( records.get( element )?.token )?.parent || null; },
			invalidate( element ) { const token = owners.get( records.get( element )?.token ); if ( token ) { token.active = false; } },
			reset() { if ( destroyed ) { return; } generation++; model = readDocument(); },
			destroy() { destroyed = true; records = new WeakMap(); owners = new WeakMap(); root = model = readDocument = null; },
			stats() { return Object.freeze( { generation, registrations, instances: sequence, destroyed } ); },
		} );
	}
	window.LieveCanvasIdentity = Object.freeze( { create: createCanvasIdentity } );
	window.LieveEditorControllers ||= {};
	window.LieveEditorControllers[ 'canvas' ] = function create( lieveContext ) {
	let identityRegistry = null;
	function canvasIdentity() {
		identityRegistry ||= createCanvasIdentity( { root: lieveContext.canvas, readDocument: () => lieveContext.state.document } );
		return identityRegistry;
	}
	const previewVisual = ( node, owner, visual = document.createElement( 'div' ) ) => {
		visual.className = 'lieve-element-preview';
		canvasIdentity().register( visual, owner, 'opaque' );
		loadElementPreview( node, visual, lieveContext.canvasInitializing ); return visual;
	};
	function styleString( props, type ) {
		const styles = [];
		const map = {
			backgroundColor: 'background-color',
			color: 'color',
			paddingTop: 'padding-top',
			paddingRight: 'padding-right',
			paddingBottom: 'padding-bottom',
			paddingLeft: 'padding-left',
			marginTop: 'margin-top',
			marginBottom: 'margin-bottom',
			borderRadius: 'border-radius',
			fontSize: 'font-size',
			maxWidth: 'max-width',
			minHeight: 'min-height',
			gap: 'gap',
			textAlign: 'text-align',
			fontWeight: 'font-weight',
			alignItems: 'align-items',
			justifyContent: 'justify-content',
		};
		const pixels = [ 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'borderRadius', 'fontSize', 'maxWidth', 'minHeight', 'gap' ];

		Object.entries( map ).forEach( ( [ key, cssProperty ] ) => {
			if ( props[ key ] !== undefined && props[ key ] !== '' ) {
				const value = pixels.includes( key ) ? parseInt( props[ key ], 10 ) + 'px' : props[ key ];
				styles.push( cssProperty + ':' + value );
			}
		} );

		if ( lieveContext.canNest( type ) && props.direction ) {
			styles.push( 'display:flex' );
			styles.push( 'flex-direction:' + props.direction );
		}
		if ( type === 'image' && props.width !== undefined && props.width !== '' ) {
			styles.push( 'width:' + parseInt( props.width, 10 ) + '%' );
		}
		if ( type === 'spacer' && props.height !== undefined && props.height !== '' ) {
			styles.push( 'height:' + parseInt( props.height, 10 ) + 'px' );
		}

		return styles.join( ';' );
	}

	function createChildren( node, owner = null ) {
		const children = document.createElement( 'div' );
		children.className = 'lieve-editor-children';
		children.dataset.parentId = node.id;
		if ( node.type === 'section' && owner ) { canvasIdentity().register( children, owner ); } // Trusted inner section lane, including its empty hint.
		( node.children || [] ).forEach( ( child ) => children.appendChild( createNodeElement( child, owner ) ) );

		return children;
	}

	function createNodeElement( node, parentOwner = null ) {
		const wrapper = document.createElement( 'div' );
		wrapper.className = 'lieve-editor-frame';
		wrapper.dataset.id = node.id;
		const registry = canvasIdentity(), listing = Boolean( lieveContext.listingEditor?.enabled( node ) );
		const config = lieveContext.config;
		const context = { scope: config.componentMode ? 'component-document' : config.isTemplate ? 'template-document' : 'document', postId: config.postId };
		if ( node.type === 'component' ) { context.componentId = node.props?.componentId || null; }
		if ( node.type === 'template' ) { context.templateId = node.props?.templateId || null; }
		if ( listing || node.props?.savedQuery ) { context.queryId = listing ? node.props.listing.query || null : node.props.savedQuery; }
		if ( node.type === 'slot' ) { context.slotKey = node.props?.slotKey || node.id; }
		if ( listing || ! [ 'section', 'container', 'block', 'div', 'slot', 'heading', 'button', 'image', 'spacer' ].includes( node.type ) ) { context.contents = 'unmapped'; }
		const owner = registry.owner( { id: node.id, selectId: node.id, type: node.type, kind: listing ? 'listing' : node.type,
			context }, parentOwner );
		registry.register( wrapper, owner );

		let visual;
		const props = lieveContext.dynamicData?.resolveNode( node ).props || node.props || {};

		if ( listing ) { visual = previewVisual( node, owner ); }
		else switch ( node.type ) {
			case 'section':
				visual = document.createElement( 'section' );
				visual.className = 'lieve-editor-section';
				visual.appendChild( createChildren( node, owner ) );
				break;
			case 'container':
				visual = createChildren( node, owner );
				visual.classList.add( 'lieve-editor-container' );
				break;
			case 'heading':
				visual = document.createElement( 'h' + Math.min( 6, Math.max( 1, parseInt( props.level || 2, 10 ) ) ) );
				visual.className = 'lieve-editor-heading';
				visual.textContent = props.content ?? '';
				break;
			case 'button':
				visual = document.createElement( 'a' );
				visual.className = 'lieve-editor-button';
				visual.href = props.url || '#';
				visual.textContent = props.label ?? '';
				break;
			case 'image':
				visual = document.createElement( 'figure' );
				visual.className = 'lieve-editor-image';
				if ( props.attachmentId && props.imageSource !== 'url' || props.caption || props.imageLink || props.imageSizes || props.imageDecoding ) { visual = previewVisual( node, owner, visual ); break; }
				if ( props.url ) {
					const image = document.createElement( 'img' );
					image.src = props.url;
					image.alt = props.alt || '';
					visual.appendChild( image );
				} else {
					const placeholder = document.createElement( 'div' );
					placeholder.className = 'lieve-image-placeholder';
					placeholder.dataset.editorUi = '';
					placeholder.textContent = 'Choose image';
					visual.appendChild( placeholder );
				}
				break;
			case 'spacer':
				visual = document.createElement( 'div' );
				visual.className = 'lieve-editor-spacer';
				break;
			default:
				if ( [ 'block', 'div', 'slot' ].includes( node.type ) ) {
					visual = createChildren( node, owner );
					visual.classList.add( 'lieve-editor-container' );
				} else {
					visual = previewVisual( node, owner );
				}
		}

		visual.classList.add( 'lieve-editor-visual' );
		if ( ! visual.classList.contains( 'lieve-element-preview' ) ) { registry.register( visual, owner, lieveContext.canNest( node.type ) ? 'self' : 'descendants' ); }
		if ( ! visual.classList.contains( 'lieve-element-preview' ) ) { prepareEditorRoot( visual, node ); }
		// Explicit styles are compiled locally; no CSS presets are added to the node.
		if ( ! visual.classList.contains( 'lieve-element-preview' ) ) {
			if ( ! lieveContext.styles ) { visual.style.cssText += styleString( props, node.type ); }
		}
		wrapper.appendChild( visual );
		const eventTarget = ( event ) => {
			const root = event.target.closest( '[data-editor-root]' );
			const target = lieveContext.findNode( lieveContext.state.document.children, root?.dataset.editorRoot || node.id ) || node;
			return { root: root || visual, node: target };
		};

		wrapper.addEventListener( 'click', ( event ) => {
			event.preventDefault();
			event.stopPropagation();
			if ( event.target.closest( '[data-lieve-listing-controls]' ) ) { return; }
			lieveContext.selectedListingPosition = event.target.closest( '[data-lieve-listing-item]' )?.dataset.listingPosition || null;
			handlePreviewInteraction( event );
			selectElement( eventTarget( event ).node.id );
			if ( lieveContext.selectedListingPosition ) { updateSelectionOutline(); }
		} );

		return wrapper;
	}

	function prepareEditorRoot( root, node, rawHtml = false, instance = false ) {
		if ( ! rawHtml && ! instance ) { root.id = lieveContext.styles.elementHtmlId( node ); root.dataset.lieveId = lieveContext.styles.elementDataId( node ); }
		root.dataset.editorRoot = node.id; root.dataset.id = node.id;
		if ( node.type === 'html' ) { root.dataset.editorCode = 'true'; }
		if ( rawHtml ) { root.dataset.editorFragment = 'true'; }
		root.classList.add( 'lieve-editor-node' ); if ( ! rawHtml ) {
			lieveContext.elementMarkupClassOptions( node ).forEach( option => root.classList.toggle( option.name, node.props.markupClasses?.[ option.name ] ?? option.enabled ) );
		} root.classList.toggle( 'is-selected', lieveContext.state.selectedId === node.id );
		root.draggable = false; root.tabIndex = 0;
		root.setAttribute( 'aria-label', node.props?.editorLabel || lieveContext.labels[ node.type ] || node.type );
		if ( ! rawHtml && lieveContext.classWorkspace ) { root.classList.add( ...lieveContext.classWorkspace.names( node.props.classIds ) ); }
		if ( ! rawHtml && node.props.className ) { root.classList.add( ...node.props.className.split( /\s+/ ).filter( Boolean ) ); }
		if ( ! rawHtml ) { Object.entries( node.props.attributes || {} ).forEach( ( [ key, value ] ) => {
			// Public interaction/visibility attributes must not disable editor handles.
			if ( lieveContext.customAttributeNameAllowed( key ) && lieveContext.customAttributeValueAllowed( key, value ) && ! [ 'tabindex', 'draggable', 'contenteditable', 'hidden', 'inert', 'disabled', 'autofocus' ].includes( key ) ) { root.setAttribute( key, value ); }
		} ); }
	}

	function prepareHtmlFragment( host, node, start = null, end = null ) {
		const children = [];
		const visibleRoot = child => child.nodeType === 1 && ! [ 'STYLE', 'SCRIPT', 'LINK', 'META', 'TEMPLATE' ].includes( child.tagName );
		if ( start && end && start.parentNode !== end.parentNode ) { return; }
		if ( start && end && start.parentNode === end.parentNode ) { host = start.parentNode; for ( let child = start.nextSibling; child && child !== end; child = child.nextSibling ) { children.push( child ); } }
		else { children.push( ...host.childNodes ); }
		if ( ! children.some( ( child ) => visibleRoot( child ) || child.nodeType === 3 && child.textContent.trim() ) ) {
			const placeholder = document.createElement( 'span' ); placeholder.className = 'lieve-editor-preview-message'; placeholder.dataset.editorUi = ''; placeholder.textContent = node.props.content || node.props.customJs || node.props.customCss ? 'Custom Code · no visible output' : 'Add code in the Content panel.'; host.insertBefore( placeholder, end ); children.push( placeholder );
		}
		children.forEach( ( child ) => {
			if ( child.nodeType === 3 && child.textContent.trim() ) { const span = document.createElement( 'span' ); host.insertBefore( span, child ); span.appendChild( child ); child = span; }
			if ( visibleRoot( child ) ) { prepareEditorRoot( child, node, true ); }
		} );
	}

	function editorBounds( frame ) {
		return ( frame.querySelector( '[data-editor-root="' + window.CSS.escape( frame.dataset.id ) + '"]' ) || frame ).getBoundingClientRect();
	}

	function previewNodeData( node ) {
		const copy = lieveContext.clone( node ); const walk = ( item, listing = false ) => { listing ||= Boolean( window.LieveListingEditor?.enabled( item ) ); if ( item.type === 'html' && lieveContext.styles ) { item.props.wrapHtml = lieveContext.styles.htmlHasWrapper( item ); } if ( ! listing ) { delete item.props.styles; } ( item.children || [] ).forEach( child => walk( child, listing ) ); }; walk( copy ); return copy;
	}

	function previewKey( node ) { return JSON.stringify( previewNodeData( node ) ) + ( lieveContext.executeCodePreview( node ) ? '|run-php' : '' ) + ( node.type === 'component' ? '|components:' + ( lieveContext.componentEditor?.revision() || '' ) : '' ); }

	function seedElementPreviews() {
		const previews = lieveContext.config.initialPreviews;
		if ( ! previews || typeof previews !== 'object' || Array.isArray( previews ) ) { return; }
		lieveContext.walkNodes( lieveContext.state.document.children, node => {
			if ( lieveContext.elementPreviews.size >= 200 || ! Object.hasOwn( previews, node.id ) || typeof previews[ node.id ] !== 'string' ) { return; }
			lieveContext.elementPreviews.set( JSON.stringify( previewNodeData( node ) ) + ( node.type === 'component' ? '|components:' + ( lieveContext.componentEditor?.revision() || '' ) : '' ), previews[ node.id ] );
			lieveContext.latestPreviews.set( node.id, previews[ node.id ] );
		} );
	}

	function handlePreviewInteraction( event ) {
		const summary = event.target.closest( 'summary' );
		if ( summary?.parentElement.matches( 'details' ) ) { summary.parentElement.open = ! summary.parentElement.open; }
		const tab = event.target.closest( '[role="tab"][aria-controls]' );
		const tabs = tab?.closest( '[data-lieve-tabs]' );
		if ( tabs ) {
			tabs.querySelectorAll( ':scope > [role="tablist"] [role="tab"]' ).forEach( ( button ) => { const active = button === tab; button.setAttribute( 'aria-selected', String( active ) ); button.tabIndex = active ? 0 : -1; } );
			tabs.querySelectorAll( ':scope > [role="tabpanel"]' ).forEach( ( panel ) => { panel.hidden = panel.id !== tab.getAttribute( 'aria-controls' ); } );
		}
		const control = event.target.closest( '[data-lieve-slide-prev],[data-lieve-slide-next],[data-lieve-slide-index]' ); const slider = control?.closest( '[data-lieve-slider]' );
		if ( slider ) {
			const slides = Array.from( slider.querySelectorAll( ':scope > [data-lieve-slide]' ) ); const current = slides.findIndex( ( slide ) => ! slide.hidden );
			if ( !slides.length ) { return; } const index = control.hasAttribute('data-lieve-slide-index') ? Number(control.dataset.lieveSlideIndex) : current + ( control.hasAttribute( 'data-lieve-slide-next' ) ? 1 : -1 );
			const next = slider.dataset.sliderLoop === 'false' ? Math.min(slides.length-1,Math.max(0,index)) : (index+slides.length)%slides.length;
			slides.forEach( ( slide, index ) => { slide.hidden = index !== next; } ); const status = slider.querySelector( '[data-lieve-slide-status]' ); if ( status ) { status.textContent = ( next + 1 ) + ' / ' + slides.length; }
			slider.querySelectorAll('[data-lieve-slide-index]').forEach(dot=>{if(Number(dot.dataset.lieveSlideIndex)===next)dot.setAttribute('aria-current','true');else dot.removeAttribute('aria-current');});
		}
		const opener = event.target.closest( '[data-lieve-open]' ); if ( opener ) { lieveContext.canvas.querySelector( '#' + window.CSS.escape( opener.dataset.lieveOpen ) )?.setAttribute( 'open', '' ); }
		const closer = event.target.closest( '[data-lieve-dialog-close]' ); if ( closer ) { closer.closest( 'dialog' )?.removeAttribute( 'open' ); }
		window.requestAnimationFrame( updateSelectionOutline );
	}

	function revealSelectedPreview() {
		const selected = lieveContext.canvas.querySelector( '[data-editor-root="' + window.CSS.escape( lieveContext.state.selectedId || '' ) + '"]' );
		for ( let parent = selected; parent && parent !== lieveContext.canvas; parent = parent.parentElement ) {
			if ( parent.matches( 'details,dialog' ) ) { parent.setAttribute( 'open', '' ); }
			if ( parent.matches( '[role="tabpanel"]' ) ) {
				parent.parentElement.querySelectorAll( ':scope > [role="tabpanel"]' ).forEach( ( panel ) => { panel.hidden = panel !== parent; } );
				parent.parentElement.querySelectorAll( '[role="tab"][aria-controls]' ).forEach( ( tab ) => { tab.setAttribute( 'aria-selected', String( tab.getAttribute( 'aria-controls' ) === parent.id ) ); } );
			} else if ( parent.hidden ) { parent.hidden = false; }
		}
	}

	function clearDropIndicators( preserveTreeDrop = false ) {
		if ( ! preserveTreeDrop ) { lieveContext.clearTreeDragMotion(); lieveContext.clearTreeDropPlaceholder(); }
		[ ...document.querySelectorAll( '.is-drop-before, .is-drop-after, .is-drop-target' ), ...lieveContext.canvas.querySelectorAll( '.is-drop-before, .is-drop-after, .is-drop-target' ) ].forEach( ( item ) => {
			item.classList.remove( 'is-drop-before', 'is-drop-after', 'is-drop-target' );
		} );
	}

	async function loadElementPreview( node, visual, immediate = false ) {
		// CSS changes are applied locally, without a new REST request or preview flash.
		const previewNode = previewNodeData( node );
		const key = previewKey( node );
		const old = lieveContext.previewJobs.get( node.id );
		if ( old && old.key !== key ) { old.controller.abort(); window.clearTimeout( old.timer ); }
		let phpRecord = lieveContext.executeCodePreview( node ) ? lieveContext.phpPreviewSources.get( node.id ) : null;
		if ( lieveContext.executeCodePreview( node ) && ( ! phpRecord || phpRecord.source !== lieveContext.codeSource( node ) ) ) { phpRecord = { source: lieveContext.codeSource( node ), consumed: false }; lieveContext.phpPreviewSources.set( node.id, phpRecord ); }
		const isCurrent = () => { const current = lieveContext.findNode( lieveContext.state.document.children, node.id ); return current && previewKey( current ) === key; };
		function display( html ) {
			window.LieveListings?.destroy( visual );
			const rawHtml = node.type === 'html' && ! lieveContext.styles?.htmlHasWrapper( lieveContext.findNode( lieveContext.state.document.children, node.id ) || node );
			visual.innerHTML = rawHtml ? html || '' : html || '<div data-editor-ui class="lieve-editor-preview-message">Configure this element in the properties panel.</div>';
			const fragments = new Map(); const comments = document.createTreeWalker( visual, 128 );
			for ( let comment = comments.nextNode(); comment; comment = comments.nextNode() ) {
				const match = comment.data.match( /^lieve-html-(start|end):([a-zA-Z0-9_-]+)$/ ); if ( ! match ) { continue; }
				if ( ! fragments.has( match[2] ) ) { fragments.set( match[2], {} ); } fragments.get( match[2] )[ match[1] ] = comment;
			}
			lieveContext.walkNodes( [ lieveContext.findNode( lieveContext.state.document.children, node.id ) || node ], ( item ) => {
				const instances = visual.querySelectorAll( '[data-lieve-listing-source="' + window.CSS.escape( item.id ) + '"]' );
				if ( instances.length ) { instances.forEach( root => prepareEditorRoot( root, item, false, true ) ); return; }
				if ( item.type === 'html' && ! lieveContext.styles?.htmlHasWrapper( item ) ) {
					const fragment = fragments.get( item.id );
					if ( fragment?.start && fragment?.end ) { prepareHtmlFragment( visual, item, fragment.start, fragment.end ); }
					else if ( rawHtml && item.id === node.id ) { prepareHtmlFragment( visual, item ); }
					return;
				}
				// Cached previews may still carry the previous data value; their HTML ID is stable.
				visual.querySelectorAll( '[data-lieve-id="' + lieveContext.styles.elementDataId( item ) + '"], [id="' + lieveContext.styles.elementHtmlId( item ) + '"]' ).forEach( ( root ) => { prepareEditorRoot( root, item ); root.removeAttribute( 'style' ); if ( item.type === 'image' ) { root.querySelector( 'img' )?.removeAttribute( 'style' ); } } );
			} );
			// Preview CSS is managed by the shared editor compiler.
			const componentStyles = node.type === 'component' ? Array.from( visual.querySelectorAll( 'style[data-lieve-styles]' ), item => item.textContent ).join('\n') : '';
			if ( node.type === 'component' ) {
				const owner = lieveContext.canvas.ownerDocument || document; let sheet = owner.querySelector( 'style[data-component-preview="' + window.CSS.escape( node.id ) + '"]' );
				if ( ! sheet ) { sheet = owner.createElement('style'); sheet.dataset.componentPreview = node.id; owner.head.insertBefore(sheet, owner.getElementById('lieve-canvas-styles')); } sheet.textContent = componentStyles;
			}
			visual.querySelectorAll( 'style[data-lieve-styles]' ).forEach( ( item ) => item.remove() );
			window.LieveListings?.mount( visual, true );
			window.LieveCodePreview?.mount( visual, { select: id => { lieveContext.closeContextMenu(); if ( lieveContext.findNode( lieveContext.state.document.children, id ) ) selectElement( id ); }, contextMenu: ( id, x, y, origin ) => { if ( lieveContext.findNode( lieveContext.state.document.children, id ) ) { lieveContext.openContextMenu( id, x, y ); lieveContext.contextReturnFocus = origin; } }, resize: () => { updateSelectionOutline(); lieveContext.canvasDrag?.invalidate(); } } );
			revealSelectedPreview();
			if ( visual.isConnected ) { renderCanvasStyles(); }
		}
		// A PHP fragment with live PHP preview off is not a faithful rendered page.
		// Never display stripped PHP branches or raw CSS as if it were the result.
		if ( node.type === 'html' && /<\?(?:php\b|=)/i.test( node.props?.content || '' ) && ! phpRecord ) {
			const available = lieveContext.config.customCode?.phpEnabled && lieveContext.config.customCode?.canAuthor;
			display( '<div data-editor-ui class="lieve-code-preview-notice"><strong>PHP preview is off</strong><span>' + ( available ? 'Enable Live PHP preview in Content to keep this widget up to date.' : 'PHP execution is disabled or requires an authorized code administrator.' ) + '</span><small>Editor preview only · no server code has been executed</small></div>' );
			return;
		}
		if ( phpRecord && typeof phpRecord.html === 'string' ) { display( phpRecord.html ); return; }
		if ( lieveContext.elementPreviews.has( key ) ) { display( lieveContext.elementPreviews.get( key ) ); return; }
		if ( lieveContext.latestPreviews.has( node.id ) ) { display( lieveContext.latestPreviews.get( node.id ) ); }
		else if ( node.type === 'html' ) { visual.innerHTML = '<div data-editor-ui class="lieve-code-preview-loading" role="status" aria-label="Loading Custom Code preview"><span aria-hidden="true"></span></div>'; }
		else { visual.innerHTML = '<div data-editor-ui class="lieve-editor-preview-message">Loading ' + lieveContext.escapeHtml( lieveContext.labels[ node.type ] || node.type ) + '…</div>'; }
		if ( ! lieveContext.config.elementPreviewUrl ) { if ( ! lieveContext.latestPreviews.has( node.id ) ) { visual.innerHTML = '<div data-editor-ui class="lieve-editor-preview-message">The preview is unavailable. Reload the editor to try again.</div>'; } return; }
		let job = old && old.key === key && ! old.controller.signal.aborted ? old : null;
		if ( ! job ) {
			job = { key, controller: new AbortController() };
			lieveContext.previewJobs.set( node.id, job );
			job.promise = ( async () => {
				if ( ! immediate ) { await new Promise( ( resolve ) => { job.timer = window.setTimeout( resolve, node.type === 'html' ? 450 : 140 ); job.controller.signal.addEventListener( 'abort', resolve, { once: true } ); } ); }
				if ( job.controller.signal.aborted ) { return null; }
				// Successful results are reused above. An aborted/failed live request
				// must not silently fall back to a passive, PHP-stripped response.
				job.executePHP = Boolean( phpRecord ); if ( job.executePHP ) { phpRecord.consumed = true; }
				const response = await ( window.LieveTransport?.fetch || fetch )(  lieveContext.config.elementPreviewUrl, { method: 'POST', credentials: 'same-origin', signal: job.controller.signal, headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': lieveContext.config.nonce }, body: JSON.stringify( { node: previewNode, executeCustomCode: job.executePHP } ) } );
				const result = await response.json(); if ( ! response.ok ) { throw new Error( result.message || 'Preview unavailable.' ); } return result;
			} )();
		}
		try {
			const result = await job.promise;
			if ( ! result || job.controller.signal.aborted ) { return; }
			if ( job.executePHP && phpRecord === lieveContext.phpPreviewSources.get( node.id ) ) { phpRecord.html = result.html; }
			if ( lieveContext.elementPreviews.size >= 200 ) { lieveContext.elementPreviews.delete( lieveContext.elementPreviews.keys().next().value ); }
			lieveContext.elementPreviews.set( key, result.html );
			if ( ! isCurrent() ) { return; }
			if ( lieveContext.latestPreviews.size >= 400 ) { lieveContext.latestPreviews.delete( lieveContext.latestPreviews.keys().next().value ); }
			lieveContext.latestPreviews.set( node.id, result.html );
			if ( visual.isConnected ) { display( result.html ); }
		} catch ( error ) {
			if ( error.name === 'AbortError' || job.controller.signal.aborted || ! isCurrent() || ! visual.isConnected ) { return; }
			visual.innerHTML = '<div data-editor-ui class="lieve-editor-preview-message">' + lieveContext.escapeHtml( error.message ) + '</div>';
		} finally {
			if ( lieveContext.previewJobs.get( node.id ) === job ) { lieveContext.previewJobs.delete( node.id ); }
		}
	}

	function selectElement( id ) {
		lieveContext.richTextController?.flush(); lieveContext.codeFields?.flush();
		// Explicitly clicking even the auto-selected element chooses a new insertion context.
		lieveContext.catalogueInsertion = null;
		const wasPopup = lieveContext.popupPanelOpen; lieveContext.popupPanelOpen = false; document.getElementById( 'lieve-popup-settings' )?.setAttribute( 'aria-expanded', 'false' );
		if ( lieveContext.state.selectedId === id && ! wasPopup ) { return; }
		lieveContext.activeClassId = null; if ( lieveContext.styleState === 'disabled' ) { lieveContext.styleState = 'normal'; } lieveContext.classWorkspace?.breakGroup();
		lieveContext.liveEdit = null; lieveContext.state.selectedId = id;
		const type = lieveContext.findNode( lieveContext.state.document.children, id )?.type;
		if ( ! lieveContext.config.styleTargets?.[ type ]?.[ lieveContext.styleTarget ] ) { lieveContext.styleTarget = 'root'; }
		lieveContext.canvas.querySelectorAll( '.lieve-editor-node' ).forEach( ( item ) => item.classList.toggle( 'is-selected', item.dataset.id === id ) );
		revealSelectedPreview();
		lieveContext.renderStructure(); lieveContext.renderInspector(); renderCanvasStyles(); lieveContext.updateButtons();
		if ( wasPopup ) { lieveContext.renderTemplateSettings(); }
	}

	function renderCanvasStyles() {
		if ( ! lieveContext.styles ) { return; }
		lieveContext.styles.configureVariables( lieveContext.designSystem?.variables() || lieveContext.config.designSystem?.data?.variables || [] );
		const owner = lieveContext.canvas.ownerDocument || document;
		let sheet = owner.getElementById( 'lieve-canvas-styles' );
		if ( ! sheet ) { sheet = owner.createElement( 'style' ); sheet.id = 'lieve-canvas-styles'; owner.head.appendChild( sheet ); }
		let css = ( lieveContext.designSystem?.css( lieveContext.styleDevice ) || '' ) + ( lieveContext.classWorkspace?.css( lieveContext.styleDevice ) || '' ) + ( lieveContext.templateContext?.css( lieveContext.styleDevice ) || '' );
		if ( lieveContext.isPopupTemplate() ) {
			css += lieveContext.styles.editorCss( lieveContext.popupStyleNode(), lieveContext.config.styleTargets?.[ 'popup-shell' ], lieveContext.styleDevice, lieveContext.popupPanelOpen ? lieveContext.styleState : 'normal' );
			const shell = lieveContext.canvas.querySelector( '[data-editor-popup-shell]' );
			if ( shell ) {
				shell.dataset.lievePopupOverlay = lieveContext.state.popupSettings.overlay ? 'on' : 'off';
				let close = shell.querySelector( '[data-lieve-ui="popup-close"]' );
				if ( lieveContext.state.popupSettings.closeButton && ! close ) { close = owner.createElement( 'button' ); close.type = 'button'; close.dataset.lieveUi = 'popup-close'; close.dataset.editorUi = ''; close.setAttribute( 'aria-label', 'Edit close button' ); close.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'; close.addEventListener( 'click', event => { event.stopPropagation(); lieveContext.openPopupSettings( 'style', 'close' ); } ); shell.querySelector( '[data-lieve-ui="popup-dialog"]' ).prepend( close ); }
				if ( ! lieveContext.state.popupSettings.closeButton ) { close?.remove(); }
			}
		}
		const sharedClass = lieveContext.editingClass(); if ( sharedClass && lieveContext.classWorkspace.isActive( sharedClass.id ) ) { css += window.LieveClassStyles.preview( sharedClass, lieveContext.state.selectedId, lieveContext.styleDevice, lieveContext.styleState, lieveContext.config.breakpoints ); }
		lieveContext.walkNodes( lieveContext.state.document.children, ( node ) => { css += lieveContext.styles.editorCss( window.LieveListingEditor && lieveContext.listingAncestor( node ) ? window.LieveListingEditor.localStyleNode( node ) : node, lieveContext.config.styleTargets?.[ node.type ], lieveContext.styleDevice, lieveContext.state.selectedId === node.id ? lieveContext.styleState : 'normal' ); if ( window.LieveListingEditor?.enabled( node ) ) { css += window.LieveListingEditor.css( node, lieveContext.styleDevice, lieveContext.config.breakpoints ); } } );
		sheet.textContent = css;
		window.LieveCodePreview?.refresh( lieveContext.canvas );
		// Resolve swatches against the updated canvas CSS, including token drafts, rollback and breakpoint changes.
		// Refresh in place: keep variable references, field focus and inspector scroll untouched.
		lieveContext.inspector.querySelectorAll( '[data-style-library]' ).forEach( button => lieveContext.refreshStyleColorSwatch( button.dataset.styleLibrary ) );
		lieveContext.templateContext?.measure( lieveContext.canvas );
		window.cancelAnimationFrame( lieveContext.selectionFrame ); lieveContext.selectionFrame = window.requestAnimationFrame( updateSelectionOutline );
		lieveContext.canvasDrag?.invalidate();
	}

	function observeSelectionLayout( roots ) {
		if ( ! window.ResizeObserver ) { return; }
		const targets = roots.length ? [ lieveContext.canvas, lieveContext.viewport?.stage || lieveContext.canvas.closest( '.lieve-stage-scroll' ), ...roots ] : [];
		if ( targets.length === lieveContext.selectionObservedTargets.length && targets.every( ( target, index ) => target === lieveContext.selectionObservedTargets[ index ] ) ) { return; }
		if ( ! lieveContext.selectionResizeObserver ) { lieveContext.selectionResizeObserver = new window.ResizeObserver( updateSelectionOutline ); }
		lieveContext.selectionResizeObserver.disconnect();
		lieveContext.selectionObservedTargets = targets;
		// Measure after layout, before paint, including every frame of a breakpoint resize.
		targets.forEach( target => lieveContext.selectionResizeObserver.observe( target, { box: 'border-box' } ) );
	}

	function updateSelectionOutline() {
		if ( ! lieveContext.selectionOutline ) { lieveContext.selectionOutline = document.createElement( 'div' ); lieveContext.selectionOutline.className = 'lieve-selection-outline'; lieveContext.selectionOutline.setAttribute( 'aria-hidden', 'true' ); lieveContext.selectionOutline.innerHTML = '<span></span>'; lieveContext.app.appendChild( lieveContext.selectionOutline ); }
		let roots = lieveContext.state.selectedId ? Array.from( lieveContext.canvas.querySelectorAll( '[data-editor-root="' + window.CSS.escape( lieveContext.state.selectedId ) + '"]' ) ) : [];
		if ( roots.some( root => root.closest?.( '[data-lieve-listing-item][data-listing-position]' ) ) ) { const all = roots; const position = lieveContext.selectedListingPosition || roots[0]?.closest( '[data-lieve-listing-item]' )?.dataset.listingPosition; roots = roots.filter( root => root.closest( '[data-lieve-listing-item]' )?.dataset.listingPosition === position ); roots = [ roots[0] || all[0] ]; all.forEach( root => root.classList.toggle( 'is-selected', roots.includes( root ) ) ); }
		observeSelectionLayout( roots );
		const rects = roots.map( ( root ) => lieveContext.viewport ? lieveContext.viewport.toParent( root.getBoundingClientRect() ) : root.getBoundingClientRect() ).filter( ( rect ) => rect.width && rect.height );
		if ( ! rects.length ) { lieveContext.selectionOutline.hidden = true; return; }
		const rect = { left: Math.min( ...rects.map( ( item ) => item.left ) ), right: Math.max( ...rects.map( ( item ) => item.right ) ), top: Math.min( ...rects.map( ( item ) => item.top ) ), bottom: Math.max( ...rects.map( ( item ) => item.bottom ) ) }; const stage = lieveContext.viewport ? lieveContext.viewport.bounds() : lieveContext.canvas.closest( '.lieve-stage-scroll' ).getBoundingClientRect();
		const left = Math.max( rect.left, stage.left ); const right = Math.min( rect.right, stage.right ); const top = Math.max( rect.top, stage.top + ( lieveContext.viewport ? 0 : 20 ) ); const bottom = Math.min( rect.bottom, stage.bottom );
		lieveContext.selectionOutline.hidden = right <= left || bottom <= top;
		Object.assign( lieveContext.selectionOutline.style, { left: left + 'px', top: top + 'px', width: ( right - left ) + 'px', height: ( bottom - top ) + 'px' } );
		const node = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId ); lieveContext.selectionOutline.querySelector( 'span' ).textContent = node?.props.editorLabel || lieveContext.labels[ node?.type ] || '';
	}

	function renderCanvasElement( key ) {
		if ( identityRegistry?.stats().destroyed ) { return false; }
		const node = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId );
		if ( ! node || ! key.startsWith( node.id + ':prop:' ) || lieveContext.listingEditor?.enabled( node ) || lieveContext.listingAncestor( node ) || lieveContext.dynamicData?.parse( node.props?.url ) ) { return false; }
		const frames = lieveContext.canvas.querySelectorAll( '.lieve-editor-frame[data-id="' + window.CSS.escape( node.id ) + '"]' );
		if ( frames.length !== 1 ) { return false; }
		lieveContext.motionEditor?.stop(); window.LieveListings?.destroy( frames[0] );
		const parentOwner = canvasIdentity().parent( frames[0] ); canvasIdentity().invalidate( frames[0] );
		frames[0].replaceWith( createNodeElement( node, parentOwner ) );
		lieveContext.dynamicData?.hydrate( lieveContext.state.document, lieveContext.config.nonce, () => { renderCanvas(); renderCanvasStyles(); } );
		revealSelectedPreview(); renderCanvasStyles(); window.LieveCodePreview?.refresh?.( lieveContext.canvas ); lieveContext.canvasDrag?.invalidate(); return true;
	}

	function renderCanvas() {
		if ( identityRegistry?.stats().destroyed ) { return; }
		canvasIdentity().reset();
		lieveContext.motionEditor?.stop();
		window.LieveListings?.destroy( lieveContext.canvas );
		lieveContext.dynamicData?.hydrate( lieveContext.state.document, lieveContext.config.nonce, () => { renderCanvas(); renderCanvasStyles(); } );
		const previousShell = lieveContext.canvas.querySelector( '[data-editor-popup-shell]' ); if ( previousShell ) { window.LievePopups?.cancelPreview( previousShell ); }
		const activeIds = new Set(); lieveContext.walkNodes( lieveContext.state.document.children, ( node ) => activeIds.add( node.id ) );
		( lieveContext.canvas.ownerDocument || document ).querySelectorAll('style[data-component-preview]').forEach(sheet => { if(!activeIds.has(sheet.dataset.componentPreview))sheet.remove(); });
		lieveContext.phpPreviewSources.forEach( ( record, id ) => { if ( ! activeIds.has( id ) ) { lieveContext.phpPreviewSources.delete( id ); } } );
		lieveContext.previewJobs.forEach( ( job, id ) => { if ( ! activeIds.has( id ) ) { job.controller.abort(); window.clearTimeout( job.timer ); lieveContext.previewJobs.delete( id ); } } );
		lieveContext.canvas.innerHTML = '';
		void lieveContext.templateContext?.refresh( lieveContext.state.headerTemplateId, lieveContext.state.footerTemplateId );
		const inheritedIdentity = ( preview, placement ) => {
			const owner = canvasIdentity().owner( { id: null, selectId: null, type: 'template', kind: 'inherited-template', context: { key: placement.key, position: placement.position, contents: 'unmapped' } } );
			canvasIdentity().register( preview, owner, 'opaque' );
		};
		lieveContext.templateContext?.append( 'before', lieveContext.canvas, inheritedIdentity );
		let contentCanvas = lieveContext.canvas;
		if ( lieveContext.isPopupTemplate() ) {
			const shell = lieveContext.canvas.ownerDocument.createElement( 'div' ); shell.dataset.editorPopupShell = ''; shell.dataset.editorRoot = lieveContext.popupStyleId; shell.dataset.lieveUi = 'popup';
			canvasIdentity().register( shell, canvasIdentity().owner( { id: lieveContext.popupStyleId, selectId: null, type: 'popup-shell', kind: 'popup-shell', context: { contents: 'unmapped' } } ), 'opaque' );
			shell.innerHTML = '<div data-lieve-ui="popup-backdrop" aria-hidden="true"></div><div data-lieve-ui="popup-dialog" class="lieve-builder-content"></div>';
			shell.querySelector( '[data-lieve-ui="popup-backdrop"]' ).addEventListener( 'click', () => lieveContext.openPopupSettings() );
			lieveContext.canvas.appendChild( shell ); contentCanvas = shell.querySelector( '[data-lieve-ui="popup-dialog"]' );
		}

		if ( ! lieveContext.state.document.children.length ) {
			const empty = document.createElement( 'div' );
			empty.className = 'lieve-canvas-empty';
			empty.dataset.editorUi = '';
			empty.innerHTML = '<div class="lieve-empty-symbol">' + lieveContext.elementIcon( 'section' ) + '</div><strong>Your canvas. Your ideas.</strong><span>Start with a section, then add elements from the library. Everything stays unstyled until you make it yours.</span><button type="button" class="lieve-button-primary">Add your first section</button>';
			empty.querySelector( 'button' ).addEventListener( 'click', () => lieveContext.addBlock( 'section' ) );
			if ( lieveContext.isPopupTemplate() ) { empty.innerHTML = '<strong>Your pop up. Your ideas.</strong><span>Add content, then style the dialog in Pop Up Settings.</span><button type="button" class="lieve-button-secondary">+ Add Something</button>'; empty.querySelector( 'button' ).addEventListener( 'click', () => lieveContext.addBlock( 'section' ) ); }
			contentCanvas.appendChild( empty );
			lieveContext.templateContext?.append( 'after', lieveContext.canvas, inheritedIdentity );
			renderCanvasStyles();
			return;
		}

		lieveContext.state.document.children.forEach( ( node ) => contentCanvas.appendChild( createNodeElement( node ) ) );
		lieveContext.templateContext?.append( 'after', lieveContext.canvas, inheritedIdentity );
		revealSelectedPreview();
		renderCanvasStyles();
	}
	return { canvasIdentity, styleString, createChildren, createNodeElement, prepareEditorRoot, prepareHtmlFragment, editorBounds, previewNodeData, previewKey, seedElementPreviews, handlePreviewInteraction, revealSelectedPreview, clearDropIndicators, loadElementPreview, selectElement, renderCanvasStyles, observeSelectionLayout, updateSelectionOutline, renderCanvasElement, renderCanvas };
	};
} )();
