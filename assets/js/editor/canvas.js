( function () {
	'use strict';
	/** Trusted renderer registrations only. Never infer identity from authored attributes. */
	function createCanvasIdentity( { root, readDocument } ) {
		let records = new WeakMap(), owners = new WeakMap(), model = readDocument();
		const guarded = new Set();
		let generation = 0, sequence = 0, registrations = 0, destroyed = false;
		const validOwner = owner => {
			if ( destroyed || ! owner || ! owners.has( owner ) || owners.get( owner ).generation !== generation || model !== readDocument() ) { return false; }
			for ( let item = owner; item; item = owners.get( item ).parent ) { const record = owners.get( item ); if ( ! record.active || record.current && ! record.current() ) { return false; } }
			return true;
		};
		const result = ( status, reason, identity = null, via = null ) => Object.freeze( { status, reason, identity, via } );
		function owner( identity, parent = null, current = null ) {
			if ( destroyed || parent && ! validOwner( parent ) ) { throw new Error( 'Inactive canvas identity owner.' ); }
			const token = Object.freeze( {} );
			const record = { generation, active: true, parent, current, identity: Object.freeze( { ...identity, context: Object.freeze( { ...identity.context } ), instance: ++sequence } ) };
			owners.set( token, record ); if ( current ) { guarded.add( record ); } return token;
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
		function invalidateMany( elements ) {
			const revoked = new Set();
			for ( const element of elements ) { const record = owners.get( records.get( element )?.token ); if ( record ) { record.active = false; revoked.add( record ); } }
			if ( ! revoked.size ) { return; }
			// Release guards, which may capture model/DOM references, while preserving
			// weak stale tombstones. Cleanup is bounded, never part of pointer movement.
			for ( const record of guarded ) { for ( let ancestor = record; ancestor; ancestor = owners.get( ancestor.parent ) ) { if ( revoked.has( ancestor ) ) { record.current = null; guarded.delete( record ); break; } } }
		}
		return Object.freeze( {
			owner, register, resolve,
			ownerFor( element ) { const token = records.get( element )?.token; return validOwner( token ) ? token : null; },
			active( element ) { return validOwner( records.get( element )?.token ); },
			parent( element ) { return owners.get( records.get( element )?.token )?.parent || null; },
			invalidateMany, invalidate( element ) { invalidateMany( [ element ] ); },
			reset() { if ( destroyed ) { return; } guarded.forEach( record => { record.current = null; } ); guarded.clear(); generation++; model = readDocument(); },
			destroy() { destroyed = true; guarded.clear(); records = new WeakMap(); owners = new WeakMap(); root = model = readDocument = null; },
			stats() { return Object.freeze( { generation, registrations, instances: sequence, guards: guarded.size, destroyed } ); },
		} );
	}
	window.LieveCanvasIdentity = Object.freeze( { create: createCanvasIdentity } );
	window.LieveEditorControllers ||= {};
	window.LieveEditorControllers[ 'canvas' ] = function create( lieveContext ) {
	let identityRegistry = null;
	let controlRegistry = null;
	let listingProjection = null;
	function listingAuthorityKey( node ) {
		const value = previewNodeData( node );
		// These owner-only properties are compiled locally by the existing Style
		// and Listing controls. They cannot change query results or model edges.
		delete value.props.styles;
		if ( value.props.listing ) { delete value.props.listing.layout; }
		return JSON.stringify( value );
	}
	/** Passive renderer capability; only the guarded experimental coordinator opts in. */
	function canvasListingProjection() {
		if ( listingProjection ) { return listingProjection.api; }
		let records = new WeakMap(), leases = new WeakMap(), roots = new Map(), chosen = null, preference = null, dead = false;
		const cache = new Map(), pending = new Set(), hosts = new Map(), sliders = new Map();
		const counts = { mounts: 0, nodes: 0, denied: 0, buildMs: 0, selections: 0 };
		const containers = new Set( [ 'section', 'container', 'block', 'div', 'slot' ] );
		const signature = node => previewKey( node ) + '|query:' + ( lieveContext.config.queryRevision || '' );
		const sameResult = ( a, b ) => a && b && a.owner === b.owner && a.query === b.query && a.type === b.type && a.result === b.result;
		function current( record ) { return ! dead && record.live() && record.element.isConnected && record.element.parentElement === record.parent && canvasIdentity().active( record.element ); }
		function choose( record ) {
			if ( ! current( record ) ) { counts.denied++; return false; }
			chosen = record; preference = record.occurrence; lieveContext.selectedListingPosition = String( record.occurrence.position ); counts.selections++; return true;
		}
		function at( element ) {
			for ( let node = element; node && node !== lieveContext.canvas; node = node.parentElement ) {
				const record = records.get( node ); if ( record ) { return current( record ) ? record : null; }
			}
			return null;
		}
		function select( id, element ) {
			if ( element ) {
				const identity = canvasIdentity().resolve( element );
				if ( ! [ 'resolved', 'opaque', 'canvas' ].includes( identity.status ) ) { counts.denied++; return false; }
				if ( identity.identity?.context?.listingOccurrence ) {
					const record = at( element ); return record?.node.id === id && choose( record );
				}
			}
			const candidates = roots.get( id ) || [];
			const record = candidates.find( item => current( item ) && sameResult( item.occurrence, preference ) ) || candidates.find( current );
			if ( record ) { return choose( record ); }
			chosen = null; preference = null; lieveContext.selectedListingPosition = null; return true;
		}
		function outline() {
			const id = lieveContext.state.selectedId;
			if ( ! roots.has( id ) ) { return null; }
			if ( ! chosen || chosen.node.id !== id || ! current( chosen ) ) {
				const record = ( roots.get( id ) || [] ).find( item => current( item ) && ( ! preference || sameResult( item.occurrence, preference ) ) );
				if ( record ) { choose( record ); } else { chosen = null; lieveContext.selectedListingPosition = null; return []; }
			}
			return chosen.bounds.filter( element => element.isConnected && ( chosen.element.contains( element ) || records.get( element ) === chosen ) );
		}
		function releaseSlider( visual ) { const slider = sliders.get( visual ); if ( slider ) { slider.destroy(); sliders.delete( visual ); } controlRegistry?.forget( visual ); }
		function reset() { pending.forEach( job => job.abort() ); pending.clear(); sliders.forEach( ( slider, visual ) => releaseSlider( visual ) ); canvasIdentity().invalidateMany( hosts.values() ); hosts.clear(); records = new WeakMap(); leases = new WeakMap(); roots = new Map(); chosen = null; }
		function mountSlider( node, visual, root, track, rows, live, validChildren ) {
			// Flags come from the current canonical model, with the existing PHP
			// sanitizer's defaults. Authored HTML/datasets never supply command data.
			const source = node.props.listing;
			if ( source.mode !== 'slider' || ! rows.length || ! controlRegistry?.active() ) { return false; }
			const settings = Object.freeze( { mode: 'slider', advance: source.advance === 'page' ? 'page' : 'item', rewind: String( source.rewind === true ), motion: source.motion === 'instant' ? 'instant' : 'smooth' } );
			const doc = root.ownerDocument, controls = doc.createElement( 'div' ); controls.dataset.lieveListingControls = '';
			let prev = null, next = null, dots = null, pause = null, status = null, engine = null;
			const button = ( direction, label, path ) => { const element = doc.createElement( 'button' ); element.type = 'button'; element.setAttribute( 'data-listing-' + direction, '' ); element.setAttribute( 'aria-label', label ); element.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="' + path + '"/></svg>'; controls.appendChild( element ); return element; };
			if ( source.arrows !== false ) { prev = button( 'prev', 'Previous items', 'm14 6-6 6 6 6' ); next = button( 'next', 'Next items', 'm10 6 6 6-6 6' ); }
			if ( source.dots === true ) { dots = doc.createElement( 'div' ); dots.dataset.listingDots = ''; dots.setAttribute( 'aria-label', 'Go to item' ); controls.appendChild( dots ); }
			if ( source.autoplay === true ) { pause = doc.createElement( 'button' ); pause.type = 'button'; pause.dataset.listingPause = ''; pause.setAttribute( 'aria-pressed', 'false' ); controls.appendChild( pause ); }
			if ( prev || dots || pause ) { status = doc.createElement( 'span' ); status.dataset.listingStatus = ''; status.className = 'screen-reader-text'; status.setAttribute( 'aria-live', 'polite' ); status.setAttribute( 'aria-atomic', 'true' ); controls.appendChild( status ); root.appendChild( controls ); }
			root.setAttribute( 'aria-roledescription', 'carousel' ); track.tabIndex = 0; track.setAttribute( 'aria-label', typeof source.label === 'string' && source.label.trim() ? source.label.trim() : 'Listing items' );
			const topology = Array.from( controls.children );
			const current = () => live() && root.parentElement === visual && track.parentElement === root && canvasIdentity().active( visual ) && ( ! topology.length || controls.parentElement === root && topology.length === controls.children.length && topology.every( ( element, index ) => controls.children[index] === element ) );
			const validate = () => current() && track.children.length === rows.length && rows.every( ( row, index ) => track.children[index] === row ) && validChildren.every( valid => valid() );
			const changed = () => { controlRegistry?.changed(); updateSelectionOutline(); lieveContext.canvasDrag?.invalidate(); };
			const register = ( entries, revision ) => {
				controlRegistry.forget( visual ); const started = performance.now();
				const bind = ( element, kind, index = null ) => {
					if ( ! element ) { return; }
					controlRegistry.register( element, kind, visual, current, {
						widget: 'listing-slider', root, track, controls, parent: index === null ? controls : dots, element, index,
						label: ( node.props.editorLabel || 'Listing' ) + ' — ' + ( index === null ? kind.endsWith( '-next' ) ? 'Next items' : 'Previous items' : entries[index].element.getAttribute( 'aria-label' ) ),
						current: () => Boolean( engine?.current() && ( index === null || engine.controlCurrent( element, index, revision ) ) ),
						disabled: () => index === null ? ! engine?.canMove( kind.endsWith( '-next' ) ? 1 : -1 ) : false,
						selected: () => index !== null && Boolean( engine?.selected( index ) ),
						execute: () => index === null ? engine?.move( kind.endsWith( '-next' ) ? 1 : -1 ) : engine?.index( index ),
					} );
				};
				bind( prev, 'preview-listing-slide-previous' ); bind( next, 'preview-listing-slide-next' );
				entries.forEach( ( entry, index ) => bind( entry.element, 'preview-listing-slide-index', index ) ); controlRegistry.built( entries.length + Number( !! prev ) + Number( !! next ), started );
			};
			// No HTML listener/selector acquires this capability. The existing native
			// scroll-snap engine creates the dots and supplies their private ordinals.
			engine = window.LieveListings?.createPreview( root, { settings, track, items: Object.freeze( rows.slice() ), controls, prev, next, dots, pause, status, current, validate, onControls: register, onChange: changed } );
			if ( ! engine ) { controls.remove(); return false; }
			if ( ! dots ) { register( [], 0 ); }
			sliders.set( visual, engine ); controlRegistry.changed(); return true;
		}
		async function load( node, visual ) {
			if ( dead || canvasIdentity().stats().destroyed ) { return; }
			const model = lieveContext.state.document, key = signature( node ), generation = canvasIdentity().stats().generation;
			const authority = listingAuthorityKey( node ), queryRevision = lieveContext.config.queryRevision;
			const previous = hosts.get( node.id ); if ( previous ) { releaseSlider( previous ); } if ( previous && previous !== visual ) { canvasIdentity().invalidate( previous ); leases.delete( previous ); }
			hosts.set( node.id, visual );
			const lease = Object.freeze( {} ); leases.set( visual, lease );
			const obsolete = [];
			for ( const [ id, entries ] of roots ) { const retained = entries.filter( entry => { if ( entry.occurrence.owner !== node.id ) { return true; } obsolete.push( entry.element ); return false; } ); if ( retained.length ) { roots.set( id, retained ); } else { roots.delete( id ); } }
			canvasIdentity().invalidateMany( obsolete );
			const live = () => ! dead && leases.get( visual ) === lease && model === lieveContext.state.document && generation === canvasIdentity().stats().generation && lieveContext.findNode( model.children, node.id ) === node && listingAuthorityKey( node ) === authority && lieveContext.config.queryRevision === queryRevision;
			const controller = new AbortController(); pending.add( controller );
			try {
				let result = cache.get( key );
				if ( ! result ) {
					const response = await ( window.LieveTransport?.fetch || fetch )( lieveContext.config.elementPreviewUrl, { method: 'POST', credentials: 'same-origin', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': lieveContext.config.nonce }, body: JSON.stringify( { node: previewNodeData( node ), listingProjection: true } ) } );
					result = await response.json(); if ( ! response.ok ) { throw new Error( result.message || 'Preview unavailable.' ); }
					if ( ! live() || controller.signal.aborted ) { return; }
					if ( cache.size >= 20 ) { cache.delete( cache.keys().next().value ); } cache.set( key, result );
				}
				// Cache hits can run while their host is still a detached render fragment.
				// Adopt it before measuring the existing scroll-snap stops.
				if ( node.props.listing.mode === 'slider' ) { await Promise.resolve(); }
				if ( ! live() || controller.signal.aborted ) { return; }
				const started = performance.now(), data = result.listingProjection, registry = canvasIdentity(), parentOwner = registry.ownerFor( visual );
				if ( ! parentOwner ) { counts.denied++; return; }
				let budget = 3000;
				const validTree = ( projected, canonical ) => Array.isArray( projected ) && projected.length === ( canonical || [] ).length && projected.every( ( item, index ) => {
					const expected = canonical[ index ], container = containers.has( expected.type ) && ! lieveContext.listingEditor.enabled( expected );
					return --budget >= 0 && item.id === expected.id && item.type === expected.type && item.kind === ( container ? 'container' : 'opaque' ) && ( container ? item.shell && validTree( item.children, expected.children ) : typeof item.html === 'string' );
				} );
				const seen = new Set();
				if ( typeof result.html !== 'string' || ! data || data.version !== 1 || data.owner !== node.id || data.query !== node.props.listing.query || data.revision !== lieveContext.config.queryRevision || ! Array.isArray( data.items ) || data.items.length > 20 || JSON.stringify( data ).length > 1048576 || ! data.items.every( ( item, index ) => {
					const identity = item.type + ':' + item.result;
					if ( seen.has( identity ) ) { return false; } seen.add( identity );
					return [ 'posts', 'current', 'terms', 'users', 'comments' ].includes( item.type ) && /^[1-9][0-9]*$/.test( item.result ) && item.position === index + 1 && Number.isSafeInteger( item.count ) && item.count >= data.items.length && validTree( item.children, node.children );
				} ) ) { throw new Error( 'Listing preview provenance is unavailable. Refresh the query library and try again.' ); }
				const shell = ( type, attributes ) => {
					const element = document.createElement( type === 'section' ? 'section' : 'div' );
					for ( const key of [ 'id', 'class', 'style', 'data-lieve-id', 'data-lieve-node', 'data-lieve-listing-source', 'data-lieve-listing', 'data-listing-mode', 'data-listing-autoplay', 'data-listing-interval', 'data-listing-advance', 'data-listing-rewind', 'data-listing-drag', 'data-listing-scrollbar', 'data-listing-motion', 'role', 'aria-label' ] ) { if ( typeof attributes?.[ key ] === 'string' ) { element.setAttribute( key, attributes[ key ] ); } }
					return element;
				};
				const fragment = document.createDocumentFragment(), parsed = document.createElement( 'template' ); parsed.innerHTML = result.html || '';
				parsed.content.querySelectorAll( 'style' ).forEach( style => fragment.appendChild( style.cloneNode( true ) ) );
				const root = shell( node.type, data.shell ), track = document.createElement( 'div' ); track.dataset.lieveListingTrack = ''; root.appendChild( track ); fragment.appendChild( root );
				prepareEditorRoot( root, node, false, true ); // Presentation/compiler hooks; never identity authority.
				root.removeAttribute( 'style' ); // Owner styles follow the existing local editor compiler.
				window.LieveListings?.destroy( visual ); visual.replaceChildren( fragment );
				const rows = [], validChildren = [];
				const build = ( projected, canonical, parent, owner, occurrence, row, modelParent = node, lineage = [] ) => projected.forEach( ( item, index ) => {
					const child = canonical[ index ]; let elements, bounds;
					if ( item.kind === 'container' ) { elements = [ shell( child.type, item.shell ) ]; bounds = elements; parent.appendChild( elements[0] ); }
					else {
						// This complete field belongs to ONE verified canonical leaf. Its
						// roots receive only that leaf's opaque fallback, never identities
						// inferred from their tags/attributes or descendants. Keep ordinary
						// single-root widget markup intact for structural CSS selectors.
						const body = document.createElement( 'template' ); body.innerHTML = item.html;
						const visible = Array.from( body.content.children ).filter( element => ! [ 'STYLE', 'SCRIPT', 'LINK' ].includes( element.tagName ) );
						if ( visible.length && visible.length <= 16 && ! Array.from( body.content.childNodes ).some( node => node.nodeType === 3 && node.textContent.trim() ) ) { elements = visible; bounds = visible; parent.appendChild( body.content ); }
						else { const boundary = document.createElement( 'div' ); boundary.style.display = 'contents'; boundary.appendChild( body.content ); parent.appendChild( boundary ); elements = [ boundary ]; bounds = Array.from( boundary.children ).filter( element => ! [ 'STYLE', 'SCRIPT', 'LINK' ].includes( element.tagName ) ); }
					}
					const element = elements[0];
					const path = [ ...lineage, { parent: modelParent, children: canonical, index, node: child } ];
					const valid = () => live() && path.every( entry => entry.parent.children === entry.children && entry.children[ entry.index ] === entry.node ) && elements.every( element => element.parentElement === parent ) && row.parentElement === track && track.parentElement === root && root.parentElement === visual;
					validChildren.push( valid );
					const token = registry.owner( { id: child.id, selectId: child.id, type: child.type, kind: 'listing-child', context: { scope: 'listing-model', postId: lieveContext.config.postId, queryId: data.query, listingId: node.id, listingOccurrence: true, resultType: occurrence.type, resultId: occurrence.result, position: occurrence.position, contents: 'unmapped' } }, owner, valid );
					elements.forEach( element => registry.register( element, token, 'opaque' ) );
					if ( item.kind === 'container' ) { build( item.children, child.children || [], element, token, occurrence, row, child, path ); }
					bounds.forEach( bound => prepareEditorRoot( bound, child, false, true ) );
					const record = { node: child, element, parent, bounds, occurrence, live: valid }; elements.forEach( element => records.set( element, record ) );
					if ( ! roots.has( child.id ) ) { roots.set( child.id, [] ); } roots.get( child.id ).push( record ); counts.nodes++;
				} );
				data.items.forEach( item => {
					const row = document.createElement( 'div' ); row.dataset.lieveListingItem = ''; row.dataset.listingPosition = String( item.position ); track.appendChild( row ); rows.push( row );
					if ( node.props.listing.mode === 'slider' ) { row.setAttribute( 'role', 'group' ); row.setAttribute( 'aria-roledescription', 'slide' ); row.setAttribute( 'aria-label', item.position + ' of ' + item.count ); }
					const occurrence = Object.freeze( { owner: node.id, query: data.query, type: item.type, result: item.result, position: item.position } );
					build( item.children, node.children || [], row, parentOwner, occurrence, row );
				} );
				// Unmapped controls/empty state keep their old presentation and authority.
				const oldRoot = Array.from( parsed.content.children ).find( element => element.tagName !== 'STYLE' );
				if ( ! data.items.length ) { root.replaceChildren( ...Array.from( oldRoot?.childNodes || [] ) ); }
				else if ( node.props.listing.mode !== 'slider' ) { oldRoot?.querySelectorAll( ':scope > [data-lieve-listing-controls], :scope > [data-editor-ui]' ).forEach( element => root.appendChild( element ) ); }
				if ( node.props.listing.mode === 'slider' && visual.isConnected ) { renderCanvasStyles(); }
				if ( node.props.listing.mode === 'slider' && data.items.length ) { mountSlider( node, visual, root, track, rows, live, validChildren ); }
				window.LieveListings?.mount( visual, true );
				// Preserve the existing executable-portal contract for complex previews:
				// contents can address this Listing owner only, never infer a child ID.
				const portalBinding = Object.freeze( { id: node.id, node, model, root: visual, live, current: () => live() && registry.active( visual ) } );
				window.LieveCodePreview?.mount( visual, { binding: portalBinding, select: id => { if ( ! portalBinding.current() ) { return; } lieveContext.closeContextMenu(); selectElement( id ); }, contextMenu: ( id, x, y, origin ) => { if ( portalBinding.current() ) { lieveContext.openContextMenu( id, x, y ); lieveContext.contextReturnFocus = origin; } }, resize: () => { updateSelectionOutline(); lieveContext.canvasDrag?.invalidate(); } } );
				counts.mounts++; counts.buildMs += performance.now() - started; if ( visual.isConnected ) { renderCanvasStyles(); }
			} catch ( error ) {
				if ( ! live() || controller.signal.aborted ) { return; }
				cache.delete( key );
				visual.textContent = error.message; counts.denied++;
			} finally { pending.delete( controller ); }
		}
		const api = Object.freeze( { active: () => ! dead, reset, destroy() { reset(); cache.clear(); dead = true; preference = null; }, stats() { const engines = Array.from( sliders.values(), slider => slider.stats() ); return { ...counts, records: Array.from( roots.values() ).reduce( ( sum, entries ) => sum + entries.length, 0 ), hosts: hosts.size, sliders: engines, listeners: engines.reduce( ( sum, item ) => sum + item.listeners, 0 ), observers: engines.reduce( ( sum, item ) => sum + item.observers, 0 ), timers: engines.reduce( ( sum, item ) => sum + item.timers, 0 ), frames: engines.reduce( ( sum, item ) => sum + item.frames, 0 ), pending: pending.size, cache: cache.size, selected: chosen && current( chosen ) ? { ...chosen.occurrence, id: chosen.node.id } : null, dead }; } } );
		listingProjection = { api, load, select, outline }; return api;
	}
	let expandedProjection = null;
	/** Only a guarded host opts in. Expanded sources never become editable page nodes. */
	function canvasExpandedProjection() {
		if ( expandedProjection ) { return expandedProjection.api; }
		let dead = false, epoch = 0, serial = 0, revisionSequence = 0;
		const mounts = new Map(), cache = new Map(), revisions = new Map(), pending = new Set();
		// Expanded instances share the browser's connection budget with verified
		// child stylesheets. Limit their transports to preserve resource headroom.
		// This queue owns no authority: every dispatch still needs its owner's lease.
		const requests = []; let activeRequests = 0, draining = false;
		function drainRequests() {
			if ( draining ) { return; } draining = true;
			queueMicrotask( () => {
				draining = false;
				while ( activeRequests < 4 && requests.length ) {
					const job = requests.shift();
					if ( job.controller.signal.aborted || ! job.current() ) { job.cancel(); continue; }
					job.started = true; activeRequests++; job.controller.signal.removeEventListener( 'abort', job.cancel );
					let released = false;
					job.resolve( () => { if ( ! released ) { released = true; activeRequests--; drainRequests(); } } );
				}
			} );
		}
		function request( controller, current ) {
			return new Promise( resolve => {
				const job = { controller, current, resolve, started: false };
				job.cancel = () => {
					if ( job.started ) { return; } // The existing transport owns active cancellation.
					const index = requests.indexOf( job ); if ( index !== -1 ) { requests.splice( index, 1 ); }
					controller.signal.removeEventListener( 'abort', job.cancel ); resolve( null );
				};
				if ( controller.signal.aborted ) { resolve( null ); return; }
				controller.signal.addEventListener( 'abort', job.cancel, { once: true } ); requests.push( job ); drainRequests();
			} );
		}
		const identities = new WeakMap(); let nextIdentity = 0;
		const identity = value => { if ( ! value || typeof value !== 'object' ) { return 0; } if ( ! identities.has( value ) ) { identities.set( value, ++nextIdentity ); } return identities.get( value ); };
		const libraries = () => [ lieveContext.state.templates, lieveContext.componentEditor?.revision() || 0 ];
		const stamp = () => libraries().map( value => typeof value === 'object' ? identity( value ) : value ).join( ':' );
		const presentationAttribute = name => /^(?:id|class|style|role|title|lang|dir|itemprop|itemscope|itemtype|aria-[a-z0-9_-]+|data-(?!editor|lieve)[a-z0-9_-]+|data-lieve-(?:id|node|scope|tabs))$/i.test( name );
		const counts = { mounts: 0, denied: 0, buildMs: 0, refreshes: 0 };
		function revoke( record ) { record.active = false; record.controller?.abort(); record.anchors.forEach( anchor => controlRegistry?.forget( anchor ) ); canvasIdentity().invalidateMany( record.anchors ); record.anchors.length = 0; }
		function reset() { pending.forEach( controller => controller.abort() ); pending.clear(); mounts.forEach( revoke ); mounts.clear(); }
		function refresh() {
			if ( dead ) { return; } const active = [ ...mounts.values() ]; epoch++; counts.refreshes++; reset(); cache.clear();
			active.forEach( record => { if ( record.visual.isConnected && lieveContext.findNode( lieveContext.state.document.children, record.node.id ) === record.node ) { load( record.node, record.visual ); } } );
		}
		let away = false;
		const onBlur = () => queueMicrotask( () => { if ( ! dead && ! document.hasFocus() ) { away = true; } } );
		const onFocus = event => { if ( away && event.target === window && document.visibilityState === 'visible' ) { away = false; refresh(); } };
		const onVisibility = () => { if ( document.visibilityState === 'hidden' ) { away = true; } else if ( away ) { away = false; refresh(); } };
		window.addEventListener( 'blur', onBlur ); window.addEventListener( 'focus', onFocus ); document.addEventListener( 'visibilitychange', onVisibility );
		// Existing successful library reads notify this optional experimental layer.
		lieveContext.config.expandedPreviewRefresh = refresh;
		async function load( node, visual ) {
			if ( dead || canvasIdentity().stats().destroyed ) { return; }
			const previous = mounts.get( node.id ); if ( previous ) { revoke( previous ); }
			const model = lieveContext.state.document, generation = canvasIdentity().stats().generation, key = previewKey( node ), library = stamp(), operation = ++serial, ownEpoch = epoch;
			const edges = [], modelChildren = model.children;
			lieveContext.walkNodes( [ node ], item => edges.push( { node: item, props: item.props, children: item.children, items: [ ...( item.children || [] ) ] } ) );
			const readClock = revisionSequence;
			const record = { node, visual, active: true, anchors: [], dependencies: [] }; mounts.set( node.id, record );
			const live = () => ! dead && visual.isConnected && lieveContext.canvas.contains( visual ) && record.active && mounts.get( node.id ) === record && ownEpoch === epoch && model === lieveContext.state.document && generation === canvasIdentity().stats().generation &&
				model.children === modelChildren && lieveContext.findNode( model.children, node.id ) === node && edges.every( edge => edge.node.props === edge.props && edge.node.children === edge.children && Array.isArray( edge.node.children ) && edge.items.length === edge.node.children.length && edge.items.every( ( item, index ) => edge.node.children[index] === item ) ) && previewKey( node ) === key && stamp() === library && canvasIdentity().active( visual );
			const dependenciesCurrent = () => record.dependencies.every( dependency => { const known = revisions.get( dependency.id ); return known?.revision === dependency.revision && known.version === dependency.version; } );
			const controller = new AbortController(); record.controller = controller; pending.add( controller );
			try {
				const cacheKey = key + '|libraries:' + library + '|epoch:' + epoch;
				let result = cache.get( cacheKey );
				if ( result && ! result.expandedControls?.dependencies.every( dependency => ! revisions.has( dependency.id ) || revisions.get( dependency.id ).revision === dependency.revision ) ) { result = null; }
				if ( ! result ) {
					const release = await request( controller, live ); if ( ! release ) { return; }
					try {
						if ( controller.signal.aborted || ! live() ) { return; }
						const response = await ( window.LieveTransport?.fetch || fetch )( lieveContext.config.elementPreviewUrl, { method: 'POST', credentials: 'same-origin', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': lieveContext.config.nonce }, body: JSON.stringify( { node: previewNodeData( node ), expandedControls: true } ) } );
						result = await response.json(); if ( ! response.ok ) { throw new Error( result.message || 'Preview unavailable.' ); }
					} finally { release(); }
				}
				await Promise.resolve(); // Cached HTML must be adopted before Task 16 resolves its real anchor.
				if ( ! live() || controller.signal.aborted ) { return; }
				const data = result.expandedControls, definition = Number( node.props[ node.type === 'component' ? 'componentId' : 'templateId' ] );
				if ( ! data || data.version !== 1 || data.owner !== node.id || data.type !== node.type || data.definition !== definition || data.tree?.id !== node.id || typeof result.html !== 'string' || JSON.stringify( data ).length > 1048576 ||
					! Array.isArray( data.dependencies ) || data.dependencies.length > 1600 || ! data.dependencies.some( item => item.id === definition ) ) { throw new Error( 'Reusable preview provenance is unavailable.' ); }
				const dependencies = new Map();
				for ( const dependency of data.dependencies ) {
					if ( ! Number.isSafeInteger( dependency.id ) || dependency.id < 1 || ! [ 'template', 'component' ].includes( dependency.kind ) || ! /^[a-f0-9]{64}$/.test( dependency.revision ) || dependencies.has( dependency.id ) ||
						( revisions.get( dependency.id )?.clock > readClock && revisions.get( dependency.id ).revision !== dependency.revision ) ) { throw new Error( 'Reusable preview revision is obsolete.' ); }
					dependencies.set( dependency.id, dependency );
				}
				let budget = 2000;
				const valid = item => {
					if ( ! item || --budget < 0 || ! [ 'container', 'tabs', 'opaque' ].includes( item.kind ) || typeof item.id !== 'string' || typeof item.type !== 'string' ) { return false; }
					if ( item.source && ( ! dependencies.has( item.source.definition ) || dependencies.get( item.source.definition ).revision !== item.source.revision || ! [ 'template', 'component' ].includes( item.source.kind ) || typeof item.source.node !== 'string' || typeof item.source.instance !== 'string' ) ) { return false; }
					if ( item.kind === 'opaque' ) { return typeof item.html === 'string'; }
					if ( ! item.shell || ! [ 'div', 'section' ].includes( item.shell.tag ) || ! Object.entries( item.shell ).every( ( [ name, value ] ) => name === 'tag' || presentationAttribute( name ) && typeof value === 'string' ) ) { return false; }
					if ( item.kind === 'tabs' ) { return item.type === 'tabs' && item.source && typeof item.items === 'string' && typeof item.html === 'string' && typeof item.presentationId === 'string' && /^lieve-[0-9]+$/.test( item.presentationId ); }
					return Array.isArray( item.children ) && item.children.every( valid );
				};
				if ( ! valid( data.tree ) ) { throw new Error( 'Reusable preview structure is ambiguous.' ); }
				if ( revisions.size + [ ...dependencies.keys() ].filter( id => ! revisions.has( id ) ).length > 1600 ) { throw new Error( 'Reusable preview revision budget exceeded. Reload the editor.' ); }
				record.dependencies = [ ...dependencies.values() ].map( dependency => {
					const previous = revisions.get( dependency.id ), changed = previous?.revision !== dependency.revision;
					const version = changed ? ( previous?.version || 0 ) + 1 : previous.version;
					const clock = changed ? ++revisionSequence : previous.clock;
					revisions.set( dependency.id, { revision: dependency.revision, version, clock, operation: Math.max( previous?.operation || 0, operation ) } );
					return { ...dependency, version };
				} );
				if ( cache.size >= 20 ) { cache.delete( cache.keys().next().value ); } cache.set( cacheKey, result );
				const started = performance.now(), registry = canvasIdentity(), parentOwner = registry.ownerFor( visual ), widgets = [], doc = visual.ownerDocument;
				if ( ! parentOwner ) { throw new Error( 'Reusable preview owner is obsolete.' ); }
				const fragment = doc.createDocumentFragment(), parsed = doc.createElement( 'template' ); parsed.innerHTML = result.html;
				parsed.content.querySelectorAll( 'style[data-lieve-styles]' ).forEach( style => fragment.appendChild( style.cloneNode( true ) ) );
				function build( item, parent, lineage = [] ) {
					let root;
					if ( item.kind === 'container' ) {
						root = doc.createElement( item.shell.tag );
						for ( const [ name, value ] of Object.entries( item.shell ) ) { if ( presentationAttribute( name ) ) { root.setAttribute( name, value ); } }
						parent.appendChild( root ); const path = [ ...lineage, { element: root, parent } ]; item.children.forEach( child => build( child, root, path ) );
					} else {
						const body = doc.createElement( 'template' ); body.innerHTML = item.html; body.content.querySelectorAll( 'style[data-lieve-styles]' ).forEach( style => style.remove() );
						const roots = Array.from( body.content.children ).filter( element => ! [ 'STYLE', 'SCRIPT', 'LINK' ].includes( element.tagName ) ); root = roots[0];
						if ( item.kind === 'tabs' && ( roots.length !== 1 || root.tagName !== 'DIV' || Array.from( body.content.childNodes ).some( element => element.nodeType === 3 && element.textContent.trim() ) ) ) { throw new Error( 'Reusable Tabs projection is ambiguous.' ); }
						parent.appendChild( body.content );
						if ( item.kind === 'tabs' ) { widgets.push( { item, root, path: [ ...lineage, { element: root, parent } ] } ); }
					}
					return root;
				}
				const root = build( data.tree, fragment ); window.LieveListings?.destroy( visual ); visual.replaceChildren( fragment );
				if ( root ) { prepareEditorRoot( root, node ); root.removeAttribute( 'style' ); }
				// Preserve existing UI/style hooks for actual page-owned Slots/content.
				// These selectors confer NO identity or control capability; only the
				// private renderer-call records below may register expanded controls.
				lieveContext.walkNodes( node.children || [], item => visual.querySelectorAll( '[data-lieve-id="' + lieveContext.styles.elementDataId( item ) + '"], [id="' + lieveContext.styles.elementHtmlId( item ) + '"]' ).forEach( element => { prepareEditorRoot( element, item ); element.removeAttribute( 'style' ); } ) );
				const styles = Array.from( visual.querySelectorAll( 'style[data-lieve-styles]' ), style => style.textContent ).join( '\n' );
				if ( node.type === 'component' ) { let sheet = doc.querySelector( 'style[data-component-preview="' + window.CSS.escape( node.id ) + '"]' ); if ( ! sheet ) { sheet = doc.createElement( 'style' ); sheet.dataset.componentPreview = node.id; doc.head.insertBefore( sheet, doc.getElementById( 'lieve-canvas-styles' ) ); } sheet.textContent = styles; }
				visual.querySelectorAll( 'style[data-lieve-styles]' ).forEach( style => style.remove() );
				for ( const widget of widgets ) {
					// The fragment's first parent becomes the actual canonical host on adoption.
					const path = widget.path.map( edge => ( { ...edge, parent: edge.parent === fragment ? visual : edge.parent } ) );
					const current = () => live() && dependenciesCurrent() && path.every( edge => edge.element.parentElement === edge.parent );
					const source = Object.freeze( { ...widget.item.source } );
					const owner = registry.owner( { id: node.id, selectId: node.id, type: node.type, kind: 'expanded-preview', context: { scope: 'expanded-preview', contents: 'unmapped', ...source } }, parentOwner, current );
					registry.register( widget.root, owner, 'opaque' ); record.anchors.push( widget.root );
					registerPreviewItems( { id: widget.item.id, type: 'tabs', props: { items: widget.item.items, label: widget.item.label || '', editorLabel: node.props.editorLabel || lieveContext.labels[ node.type ] || node.type }, children: [] }, widget.root,
						{ root: widget.root, current, presentationId: widget.item.presentationId } );
				}
				const binding = Object.freeze( { id: node.id, node, model, root: visual, live, current: () => live() && dependenciesCurrent() } );
				window.LieveListings?.mount( visual, true );
				window.LieveCodePreview?.mount( visual, { binding, select: () => { if ( binding.current() ) { lieveContext.closeContextMenu(); selectElement( node.id ); } }, contextMenu: ( id, x, y, origin ) => { if ( binding.current() ) { lieveContext.openContextMenu( node.id, x, y ); lieveContext.contextReturnFocus = origin; } }, resize: () => { updateSelectionOutline(); lieveContext.canvasDrag?.invalidate(); } } );
				counts.mounts++; counts.buildMs += performance.now() - started; if ( visual.isConnected ) { renderCanvasStyles(); }
			} catch ( error ) { if ( ! live() || controller.signal.aborted ) { return; } revoke( record ); counts.denied++; visual.textContent = error.message; }
			finally { pending.delete( controller ); }
		}
		const api = Object.freeze( { active: () => ! dead, refresh, reset, destroy() { if ( dead ) { return; } reset(); dead = true; cache.clear(); revisions.clear(); window.removeEventListener( 'focus', onFocus ); window.removeEventListener( 'blur', onBlur ); document.removeEventListener( 'visibilitychange', onVisibility ); if ( lieveContext.config.expandedPreviewRefresh === refresh ) { delete lieveContext.config.expandedPreviewRefresh; } }, stats() { return { ...counts, hosts: mounts.size, cache: cache.size, revisions: revisions.size, pending: pending.size, queued: requests.length, activeRequests, anchors: [ ...mounts.values() ].reduce( ( sum, item ) => sum + item.anchors.length, 0 ), listeners: dead ? 0 : 3, observers: 0, dead }; } } );
		expandedProjection = { api, load }; return api;
	}

	// Passive until a trusted host opts in. Only this renderer can register controls.
	function canvasControls() {
		if ( controlRegistry ) { return controlRegistry.api; }
		let records = new Map(), tickets = new WeakMap(), destroyed = false, scheduled = false;
		const subscribers = new Set(), allowed = new Set( [ 'empty-add', 'popup-backdrop', 'popup-close-settings', 'preview-details', 'preview-tab', 'preview-accordion', 'preview-slide-previous', 'preview-slide-next', 'preview-slide-index', 'preview-listing-slide-previous', 'preview-listing-slide-next', 'preview-listing-slide-index', 'preview-offcanvas-open', 'preview-offcanvas-close' ] );
		const builds = [], navigations = [], offcanvasOperations = [], listingOperations = [];
		function valid( record, checks = null ) {
			if ( destroyed || ! record || record.model !== lieveContext.state.document || record.generation !== canvasIdentity().stats().generation ||
				! record.element.isConnected || ! lieveContext.canvas.contains( record.element ) ) { return false; }
			const identity = canvasIdentity().resolve( record.anchor );
			if ( ! ( record.instance === null ? identity.status === 'canvas' : identity.identity?.instance === record.instance && ! [ 'stale', 'destroyed' ].includes( identity.status ) ) ) { return false; }
			if ( checks && ! checks.has( record.guard ) ) { checks.set( record.guard, record.guard() ); }
			if ( ! ( checks ? checks.get( record.guard ) : record.guard() ) ) { return false; }
			const item = record.detail;
			if ( item?.widget === 'listing-slider' ) { return record.element === item.element && record.element.parentElement === item.parent && item.current(); }
			if ( item?.widget === 'offcanvas' ) {
				return item.controls[ item.index ] === record.element && item.controls[0].parentElement === item.root &&
					item.dialog.parentElement === item.root && item.controls[1].parentElement === item.dialog;
			}
			if ( item?.widget === 'slider' ) {
				return item.controls[ item.index ] === record.element && record.element.parentElement === item.parent &&
					( item.parent === item.root || item.parent.parentElement === item.root );
			}
			return ! item?.widget || item.controls[ item.index ] === record.element && record.element.parentElement === ( item.widget === 'tabs' ? item.tablist : item.details ) &&
				( item.widget === 'tabs' ? item.tablist.parentElement === item.root && item.panels[ item.index ].parentElement === item.root : item.details.parentElement === item.root && item.panel.parentElement === item.details );
		}
		function changed() {
			if ( scheduled || destroyed ) { return; } scheduled = true;
			queueMicrotask( () => { scheduled = false; if ( destroyed ) { return; } const checks = new Map(); for ( const [ key, record ] of records ) { if ( ! valid( record, checks ) ) { records.delete( key ); tickets.delete( record.ticket ); } } subscribers.forEach( callback => callback() ); } );
		}
		function register( element, kind, anchor, guard = () => true, detail = null ) {
			if ( destroyed || ! element || ! allowed.has( kind ) ) { return; }
			const previous = records.get( element ); if ( previous && valid( previous ) ) { return; }
			const identity = canvasIdentity().resolve( anchor ), ticket = Object.freeze( {} );
			const record = { element, kind, anchor, detail, guard, ticket, model: lieveContext.state.document,
				generation: canvasIdentity().stats().generation, instance: identity.identity?.instance ?? null };
			records.set( element, record ); tickets.set( ticket, record ); changed();
		}
		const labels = { 'empty-add': 'Add section', 'popup-backdrop': 'Edit popup settings', 'popup-close-settings': 'Edit popup close button', 'preview-details': 'Toggle details preview' };
		const disabled = record => record.detail?.widget === 'listing-slider' ? Boolean( record.element.disabled || record.detail.disabled() ) : Boolean( record.element.disabled || record.kind === 'preview-offcanvas-close' && ! record.detail.dialog.hasAttribute( 'open' ) );
		const api = Object.freeze( {
			resolve( element ) {
				if ( destroyed || element?.ownerDocument !== lieveContext.canvas.ownerDocument ) { return null; }
				for ( let current = element; current && current !== lieveContext.canvas; current = current.parentElement ) {
					const record = records.get( current ); if ( valid( record ) ) { return record.ticket; }
				}
				return null;
			},
			list() {
				const result = [], checks = new Map();
				for ( const [ element, record ] of records ) {
					if ( valid( record, checks ) ) { const item = record.detail; result.push( Object.freeze( { ticket: record.ticket, kind: record.kind, label: item?.widget ? item.label : labels[ record.kind ], element,
						expanded: record.kind === 'preview-offcanvas-open' ? item.dialog.hasAttribute( 'open' ) : record.kind === 'preview-details' ? Boolean( item.open ) : record.kind === 'preview-accordion' ? Boolean( item.details.open ) : null,
						selected: record.kind === 'preview-tab' ? item.controls[ item.index ].getAttribute( 'aria-selected' ) === 'true' : record.kind === 'preview-slide-index' ? item.slides.findIndex( slide => ! slide.hidden ) === item.slideIndex : record.kind === 'preview-listing-slide-index' ? item.selected() : null,
						disabled: disabled( record ), group: item?.widget === 'tabs' ? item.group : null } ) ); }
					else { records.delete( element ); tickets.delete( record.ticket ); }
				}
				return result;
			},
			current( ticket ) { const record = tickets.get( ticket ); return valid( record ) && ! disabled( record ); },
			execute( ticket ) {
				const record = tickets.get( ticket ); if ( ! valid( record ) || disabled( record ) ) { return false; }
				switch ( record.kind ) {
					case 'empty-add': lieveContext.addBlock( 'section' ); break;
					case 'popup-backdrop': lieveContext.openPopupSettings(); break;
					case 'popup-close-settings': lieveContext.openPopupSettings( 'style', 'close' ); break;
					case 'preview-listing-slide-previous': case 'preview-listing-slide-next': case 'preview-listing-slide-index': {
						const start = performance.now(), item = record.detail;
						// Listing navigation preserves the existing selection, as in the legacy
						// preview. Authority still comes from the live private owner/ticket.
						if ( ! valid( record ) || disabled( record ) ) { return false; }
						const validated = performance.now(); if ( ! item.execute() ) { return false; }
						if ( listingOperations.length < 2000 ) { listingOperations.push( { kind: record.kind, selectionMs: 0, validationMs: validated - start, ms: performance.now() - validated } ); }
						updateSelectionOutline(); break;
					}
					case 'preview-offcanvas-open': case 'preview-offcanvas-close': {
						const start = performance.now(), item = record.detail, open = record.kind === 'preview-offcanvas-open';
						selectElement( canvasIdentity().resolve( record.anchor ).identity.selectId );
						const selected = performance.now(); if ( ! valid( record ) || disabled( record ) ) { return false; }
						setPreviewOffcanvasOpen( item.dialog, open );
						if ( offcanvasOperations.length < 2000 ) { offcanvasOperations.push( { open, selectionMs: selected - start, ms: performance.now() - selected } ); }
						updateSelectionOutline(); break;
					}
					case 'preview-slide-previous': case 'preview-slide-next': case 'preview-slide-index': {
						const item = record.detail, previous = item.slides.findIndex( slide => ! slide.hidden );
						selectElement( canvasIdentity().resolve( record.anchor ).identity.selectId );
						if ( ! valid( record ) || record.element.disabled ) { return false; }
						const index = record.kind === 'preview-slide-index' ? item.slideIndex : previous + ( record.kind === 'preview-slide-next' ? 1 : -1 ), start = performance.now();
						activatePreviewSlide( item.slides, index, item.loop, item.status, item.dots );
						if ( navigations.length < 2000 ) { navigations.push( { items: item.slides.length, ms: performance.now() - start } ); }
						// Instant legacy preview: no transition/timer or late child callback.
						updateSelectionOutline(); break;
					}
					case 'preview-details': { const previous = record.detail.open; selectElement( canvasIdentity().resolve( record.anchor ).identity.selectId ); if ( ! valid( record ) ) { return false; } togglePreviewDetails( record.detail, previous ); window.requestAnimationFrame( updateSelectionOutline ); break; }
					case 'preview-tab': case 'preview-accordion': {
						const item = record.detail, previous = item.details?.open;
						selectElement( canvasIdentity().resolve( record.anchor ).identity.selectId );
						if ( ! valid( record ) || record.element.disabled ) { return false; }
						if ( record.kind === 'preview-tab' ) { activatePreviewTab( item.controls, item.panels, record.element, item.panels[ item.index ] ); }
						else { togglePreviewDetails( item.details, previous ); record.element.setAttribute( 'aria-expanded', String( item.details.open ) ); }
						window.requestAnimationFrame( updateSelectionOutline ); break;
					}
					default: return false;
				}
				changed(); return true;
			},
			subscribe( callback ) { if ( destroyed ) { return () => {}; } subscribers.add( callback ); return () => subscribers.delete( callback ); },
			destroy() { destroyed = true; scheduled = false; records.clear(); tickets = new WeakMap(); subscribers.clear(); },
			stats() { return { destroyed, controls: records.size, subscribers: subscribers.size, scheduled, widgetBuilds: builds.slice(), sliderNavigations: navigations.slice(), listingOperations: listingOperations.slice(), offcanvasOperations: offcanvasOperations.slice() }; },
		} );
		controlRegistry = { api, register, changed, active: () => ! destroyed,
			forget( anchor ) { for ( const [ element, record ] of records ) { if ( record.anchor === anchor ) { records.delete( element ); tickets.delete( record.ticket ); } } changed(); },
			built( items, start ) { if ( builds.length < 2000 ) { builds.push( { items, ms: performance.now() - start } ); } },
			reset() { records.clear(); tickets = new WeakMap(); changed(); },
		};
		return api;
	}
	function togglePreviewDetails( details, previous = details.open ) { details.open = ! previous; }
	function setPreviewOffcanvasOpen( dialog, open ) {
		if ( ! dialog ) { return; }
		if ( open ) { dialog.setAttribute( 'open', '' ); } else { dialog.removeAttribute( 'open' ); }
	}
	function activatePreviewTab( controls, panels, tab, target ) {
		controls.forEach( button => { const active = button === tab; button.setAttribute( 'aria-selected', String( active ) ); button.tabIndex = active ? 0 : -1; } );
		panels.forEach( panel => { panel.hidden = panel !== target; } );
	}
	function activatePreviewSlide( slides, index, loop, status, dots ) {
		if ( ! slides.length ) { return; }
		const next = loop ? ( index + slides.length ) % slides.length : Math.min( slides.length - 1, Math.max( 0, index ) );
		slides.forEach( ( slide, position ) => { slide.hidden = position !== next; } );
		if ( status ) { status.textContent = ( next + 1 ) + ' / ' + slides.length; }
		dots.forEach( ( { element, index: position } ) => { if ( position === next ) { element.setAttribute( 'aria-current', 'true' ); } else { element.removeAttribute( 'aria-current' ); } } );
	}
	function registerPreviewControls( node, visual ) {
		if ( ! controlRegistry?.active() || ! [ 'dropdown', 'tabs', 'accordion', 'tabs-nested', 'accordion-nested', 'slider', 'offcanvas' ].includes( node.type ) || ! canvasIdentity().active( visual ) || lieveContext.listingEditor?.enabled( node ) ) { return; }
		if ( ! visual.isConnected ) { queueMicrotask( () => { if ( visual.isConnected ) { registerPreviewControls( node, visual ); } } ); return; }
		if ( lieveContext.findNode( lieveContext.state.document.children, node.id ) !== node ) { return; }
		if ( node.type === 'offcanvas' ) { registerPreviewOffcanvas( node, visual ); return; }
		if ( node.type === 'slider' ) { registerPreviewSlider( node, visual ); return; }
		if ( node.type !== 'dropdown' ) { registerPreviewItems( node, visual ); return; }
		// Replace only the built-in top-level summary. Authored descendants stay opaque.
		const details = visual.firstElementChild, old = details?.firstElementChild;
		if ( details?.nodeName !== 'DETAILS' || old?.nodeName !== 'SUMMARY' ) { return; }
		const summary = visual.ownerDocument.createElement( 'summary' ); summary.textContent = old.textContent; old.replaceWith( summary );
		controlRegistry.register( summary, 'preview-details', visual, () => summary.parentElement === details && details.parentElement === visual && lieveContext.findNode( lieveContext.state.document.children, node.id )?.type === 'dropdown', details );
	}
	function registerPreviewOffcanvas( node, visual ) {
		const start = performance.now(), root = visual.firstElementChild, source = node.props?.label;
		if ( source != null && typeof source !== 'string' || typeof lieveContext.styles?.elementNumber !== 'function' || visual.children.length !== 1 || root?.nodeName !== 'DIV' || root.children.length !== 2 ) { return; }
		const label = source && source !== '0' ? source : 'Open panel', id = 'lieve-' + lieveContext.styles.elementNumber( node.id ) + '-dialog';
		const oldOpen = root.children[0], oldDialog = root.children[1], oldClose = oldDialog.firstElementChild;
		if ( label.includes( '{{' ) || oldOpen.nodeName !== 'BUTTON' || oldOpen.children.length || oldOpen.textContent !== label ||
			oldDialog.nodeName !== 'DIALOG' || oldDialog.id !== id || oldOpen.getAttribute( 'data-lieve-open' ) !== id ||
			oldClose?.nodeName !== 'BUTTON' || oldClose.children.length || ! oldClose.hasAttribute( 'data-lieve-dialog-close' ) ) { return; }
		// This is a projection check, not HTML authentication. Create the entire fixed
		// control set from the canonical model; only the panel body remains opaque.
		const doc = visual.ownerDocument, opener = doc.createElement( 'button' ), dialog = doc.createElement( 'dialog' ), closer = doc.createElement( 'button' );
		opener.type = closer.type = 'button'; opener.textContent = label; closer.textContent = oldClose.textContent;
		dialog.id = id; opener.setAttribute( 'data-lieve-open', id ); closer.setAttribute( 'data-lieve-dialog-close', '' );
		dialog.appendChild( closer ); Array.from( oldDialog.childNodes ).forEach( child => { if ( child !== oldClose ) { dialog.appendChild( child ); } } );
		oldOpen.replaceWith( opener ); oldDialog.replaceWith( dialog );
		const definition = previewKey( node ), controls = [ opener, closer ];
		const current = () => root.parentElement === visual && root.children.length === 2 && root.children[0] === opener && root.children[1] === dialog && dialog.firstElementChild === closer &&
			lieveContext.findNode( lieveContext.state.document.children, node.id ) === node && previewKey( node ) === definition;
		controls.forEach( ( element, index ) => controlRegistry.register( element, index ? 'preview-offcanvas-close' : 'preview-offcanvas-open', visual, current, {
			widget: 'offcanvas', index, controls, root, dialog, label: ( node.props?.editorLabel || 'Offcanvas' ) + ' — ' + ( index ? 'Close panel' : 'Open panel' ),
		} ) );
		controlRegistry.built( controls.length, start );
	}
	function registerPreviewItems( node, visual, expanded = null ) {
		const start = performance.now(), nested = node.type.endsWith( '-nested' ), tabs = node.type.startsWith( 'tabs' ), root = expanded ? expanded.root : visual.firstElementChild;
		// This projection grants no authority to a server/authored node. All controls
		// and panel shells below are newly created from canonical model positions.
		// Reject ambiguous projections rather than interpreting content as controls.
		if ( ! expanded && visual.children.length !== 1 || root?.nodeName !== 'DIV' ) { return; }
		let labels;
		if ( nested ) { labels = ( node.children || [] ).map( ( child, index ) => String( child.props?.label ?? ( tabs ? 'Tab ' : 'Item ' ) + ( index + 1 ) ) ); }
		else {
			const source = node.props?.items || '';
			try { const rows = JSON.parse( source ); if ( rows && typeof rows === 'object' && ( ! Array.isArray( rows ) || rows.some( row => ! Array.isArray( row ) || row.some( value => typeof value !== 'string' ) ) ) ) { return; } } catch ( error ) {
				// A line-format reference starts with '{{', not a JSON object. Keep
				// malformed JSON rejected and still require the exact model/shell below.
				if ( /^[\s]*[\[{]/.test( source ) && ! ( node.type === 'tabs' && /^\s*\{\{lieve:/.test( source ) ) ) { return; }
			}
			labels = lieveContext.parseItems( source ).map( row => String( row[0] || '' ).replace( /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, '' ) );
		}
		// The current PHP items renderer displays references literally. Their syntax
		// is presentation data, not authority: require the complete exact model/shell
		// match below and create fresh controls with textContent. Do not resolve a
		// binding here or accept a different server label as a model item.
		if ( ! labels.length || node.type !== 'tabs' && labels.some( label => label.includes( '{{' ) ) ) { return; }
		const oldList = tabs ? root.firstElementChild : null, oldItems = Array.from( tabs ? oldList?.children || [] : root.children ), oldPanels = tabs ? Array.from( root.children ).slice( 1 ) : oldItems;
		if ( oldItems.length !== labels.length || oldPanels.length !== labels.length || tabs && oldList?.nodeName !== 'DIV' ||
			oldItems.some( ( item, index ) => tabs ? item.nodeName !== 'BUTTON' || item.textContent !== labels[index] || oldPanels[index].nodeName !== 'DIV' : item.nodeName !== 'DETAILS' || item.firstElementChild?.nodeName !== 'SUMMARY' || item.firstElementChild.textContent !== labels[index] ) ) { return; }
		const definition = previewKey( node ), owner = canvasIdentity().resolve( visual ).identity, group = Object.freeze( {} ), controls = [], panels = [];
		const current = expanded ? expanded.current : () => root.parentElement === visual && lieveContext.findNode( lieveContext.state.document.children, node.id ) === node && previewKey( node ) === definition;
		const doc = visual.ownerDocument, tablist = tabs ? doc.createElement( 'div' ) : null;
		if ( tabs ) { tablist.setAttribute( 'role', 'tablist' ); tablist.setAttribute( 'aria-label', String( node.props.label || 'Tabs' ) ); }
		labels.forEach( ( label, index ) => {
			const control = doc.createElement( tabs ? 'button' : 'summary' ), panel = doc.createElement( 'div' ), details = tabs ? null : doc.createElement( 'details' );
			const id = 'lieve-preview-' + canvasIdentity().stats().generation + '-' + owner.instance + '-' + index;
			control.id = expanded ? expanded.presentationId + '-tab-' + index : id + '-control'; panel.id = expanded ? expanded.presentationId + '-panel-' + index : id + '-panel'; control.textContent = label;
			control.setAttribute( 'aria-controls', panel.id ); panel.setAttribute( 'aria-labelledby', control.id ); panel.setAttribute( 'role', tabs ? 'tabpanel' : 'region' );
			// Move opaque contents only. Never register their descendants or copy a
			// server button/summary, event handler, command attribute or HTML ID.
			Array.from( oldPanels[index].childNodes ).forEach( child => { if ( tabs || child !== oldItems[index].firstElementChild ) { panel.appendChild( child ); } } );
			if ( tabs ) { control.type = 'button'; control.setAttribute( 'role', 'tab' ); panel.tabIndex = 0; tablist.appendChild( control ); oldPanels[index].replaceWith( panel ); }
			else { control.setAttribute( 'aria-expanded', 'false' ); details.append( control, panel ); oldItems[index].replaceWith( details ); }
			controls.push( control ); panels.push( panel );
			controlRegistry.register( control, tabs ? 'preview-tab' : 'preview-accordion', visual, current, {
				widget: tabs ? 'tabs' : 'accordion', group, index, controls, panels, root, tablist, details, panel,
				label: ( node.props.editorLabel || node.type ) + ' — ' + ( tabs ? 'Tab: ' : 'Item: ' ) + ( label || String( index + 1 ) ),
			} );
		} );
		if ( tabs ) { oldList.replaceWith( tablist ); activatePreviewTab( controls, panels, controls[0], panels[0] ); }
		controlRegistry.built( controls.length, start );
	}
	function registerPreviewSlider( node, visual ) {
		const start = performance.now(), root = visual.firstElementChild, props = node.props || {}, source = props.items || '';
		if ( visual.children.length !== 1 || root?.nodeName !== 'DIV' ) { return; }
		// Only canonical rows define the control set. Server attributes/DOM indices
		// are compatibility checks at most, never authority for an action or owner.
		try { const rows = JSON.parse( source ); if ( rows && typeof rows === 'object' && ( ! Array.isArray( rows ) || rows.some( row => ! Array.isArray( row ) || row.some( value => typeof value !== 'string' ) ) ) ) { return; } } catch ( error ) { if ( /^[\s]*[\[{]/.test( source ) ) { return; } }
		const count = lieveContext.parseItems( source ).length, multiple = count > 1, arrows = multiple && props.sliderArrows !== false, indicators = multiple && Boolean( props.sliderDots ), autoplay = multiple && Boolean( props.sliderAutoplay );
		const old = Array.from( root.children ), expected = [ ...Array( count ).fill( 'DIV' ), ...( arrows ? [ 'BUTTON', 'BUTTON' ] : [] ), ...( indicators ? [ 'DIV' ] : [] ), ...( autoplay ? [ 'BUTTON' ] : [] ), ...( multiple ? [ 'SPAN' ] : [] ) ];
		if ( old.length !== expected.length || old.some( ( element, index ) => element.nodeName !== expected[index] ) ) { return; }
		const oldDots = indicators ? old[ count + ( arrows ? 2 : 0 ) ] : null;
		if ( oldDots && ( oldDots.children.length !== count || Array.from( oldDots.children ).some( element => element.nodeName !== 'BUTTON' ) ) ) { return; }
		const definition = previewKey( node ), slides = [], controls = [], dots = [], topology = [], doc = visual.ownerDocument;
		const current = () => root.parentElement === visual && lieveContext.findNode( lieveContext.state.document.children, node.id ) === node && previewKey( node ) === definition &&
			root.children.length === topology.length && topology.every( ( element, index ) => root.children[index] === element );
		// Identical direct-child topology: no extra slide/body wrapper. Opaque body
		// nodes keep their original URLs, styles and owner-only selection policy.
		for ( let index = 0; index < count; index++ ) {
			const slide = doc.createElement( 'div' ); slide.setAttribute( 'data-lieve-slide', '' ); slide.setAttribute( 'role', 'group' ); slide.setAttribute( 'aria-roledescription', 'slide' ); slide.setAttribute( 'aria-label', ( index + 1 ) + ' / ' + count ); slide.hidden = index !== 0;
			Array.from( old[index].childNodes ).forEach( child => slide.appendChild( child ) ); old[index].replaceWith( slide ); slides.push( slide );
		}
		const status = multiple ? doc.createElement( 'span' ) : null;
		if ( status ) { status.setAttribute( 'data-lieve-slide-status', '' ); status.setAttribute( 'role', 'status' ); status.setAttribute( 'aria-live', 'polite' ); old.at( -1 ).replaceWith( status ); }
		const bind = ( element, kind, parent, slideIndex = null ) => {
			const index = controls.length; controls.push( element );
			controlRegistry.register( element, kind, visual, current, { widget: 'slider', index, slideIndex, controls, slides, dots, status, root, parent, loop: props.sliderLoop !== false,
				label: ( props.editorLabel || 'Slider' ) + ' — ' + ( kind === 'preview-slide-index' ? 'Slide ' + ( slideIndex + 1 ) : kind === 'preview-slide-next' ? 'Next slide' : 'Previous slide' ),
			} );
		};
		if ( arrows ) { [ 'previous', 'next' ].forEach( ( direction, index ) => {
			const button = doc.createElement( 'button' ); button.type = 'button'; button.setAttribute( 'data-lieve-slide-' + ( index ? 'next' : 'prev' ), '' ); button.setAttribute( 'aria-label', index ? 'Next slide' : 'Previous slide' );
			button.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + ( index ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6' ) + '"/></svg>';
			old[ count + index ].replaceWith( button ); bind( button, 'preview-slide-' + direction, root );
		} ); }
		if ( indicators ) {
			const group = doc.createElement( 'div' ); group.setAttribute( 'data-lieve-slide-dots', '' ); group.setAttribute( 'role', 'group' ); group.setAttribute( 'aria-label', 'Choose a slide' );
			for ( let index = 0; index < count; index++ ) { const button = doc.createElement( 'button' ); button.type = 'button'; button.setAttribute( 'data-lieve-slide-index', String( index ) ); button.setAttribute( 'aria-label', 'Go to slide ' + ( index + 1 ) ); button.textContent = String( index + 1 ); group.appendChild( button ); dots.push( { element: button, index } ); bind( button, 'preview-slide-index', group, index ); }
			oldDots.replaceWith( group );
		}
		topology.push( ...root.children ); activatePreviewSlide( slides, 0, props.sliderLoop !== false, status, dots ); controlRegistry.built( count, start );
	}
	function canvasIdentity() {
		identityRegistry ||= createCanvasIdentity( { root: lieveContext.canvas, readDocument: () => lieveContext.state.document } );
		return identityRegistry;
	}
	function canvasSelectionElement() { return listingProjection?.outline()?.[0] || null; }
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
		const listingModel = listingProjection?.api.active() && listing ? lieveContext.state.document : null;
		const listingKey = listingModel ? listingAuthorityKey( node ) : null, queryRevision = config.queryRevision;
		const owner = registry.owner( { id: node.id, selectId: node.id, type: node.type, kind: listing ? 'listing' : node.type,
			context }, parentOwner, listingModel ? () => listingModel === lieveContext.state.document && lieveContext.findNode( listingModel.children, node.id ) === node && listingAuthorityKey( node ) === listingKey && config.queryRevision === queryRevision : null );
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
		if ( summary?.parentElement.matches( 'details' ) ) { togglePreviewDetails( summary.parentElement ); }
		const tab = event.target.closest( '[role="tab"][aria-controls]' );
		const tabs = tab?.closest( '[data-lieve-tabs]' );
		if ( tabs ) {
			const panels = Array.from( tabs.querySelectorAll( ':scope > [role="tabpanel"]' ) );
			activatePreviewTab( Array.from( tabs.querySelectorAll( ':scope > [role="tablist"] [role="tab"]' ) ), panels, tab, panels.find( panel => panel.id === tab.getAttribute( 'aria-controls' ) ) );
		}
		const control = event.target.closest( '[data-lieve-slide-prev],[data-lieve-slide-next],[data-lieve-slide-index]' ); const slider = control?.closest( '[data-lieve-slider]' );
		if ( slider ) {
			const slides = Array.from( slider.querySelectorAll( ':scope > [data-lieve-slide]' ) ); const current = slides.findIndex( ( slide ) => ! slide.hidden );
			if ( !slides.length ) { return; } const index = control.hasAttribute('data-lieve-slide-index') ? Number(control.dataset.lieveSlideIndex) : current + ( control.hasAttribute( 'data-lieve-slide-next' ) ? 1 : -1 );
			activatePreviewSlide( slides, index, slider.dataset.sliderLoop !== 'false', slider.querySelector( '[data-lieve-slide-status]' ), Array.from( slider.querySelectorAll( '[data-lieve-slide-index]' ), element => ( { element, index: Number( element.dataset.lieveSlideIndex ) } ) ) );
		}
		const opener = event.target.closest( '[data-lieve-open]' ); if ( opener ) { setPreviewOffcanvasOpen( lieveContext.canvas.querySelector( '#' + window.CSS.escape( opener.dataset.lieveOpen ) ), true ); }
		const closer = event.target.closest( '[data-lieve-dialog-close]' ); if ( closer ) { setPreviewOffcanvasOpen( closer.closest( 'dialog' ), false ); }
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
		if ( listingProjection && lieveContext.listingEditor?.enabled( node ) ) { return listingProjection.load( node, visual ); }
		if ( expandedProjection && [ 'template', 'component' ].includes( node.type ) ) { return expandedProjection.load( node, visual ); }
		// CSS changes are applied locally, without a new REST request or preview flash.
		const previewNode = previewNodeData( node );
		const key = previewKey( node );
		const previewModel = lieveContext.state.document;
		const livePortalOwner = () => previewModel === lieveContext.state.document && lieveContext.findNode( lieveContext.state.document.children, node.id ) === node && previewKey( node ) === key;
		const portalBinding = Object.freeze( { id: node.id, node, model: previewModel, root: visual, live: livePortalOwner, current: () => livePortalOwner() && canvasIdentity().active( visual ) } );
		const old = lieveContext.previewJobs.get( node.id );
		if ( old && old.key !== key ) { old.controller.abort(); window.clearTimeout( old.timer ); }
		let phpRecord = lieveContext.executeCodePreview( node ) ? lieveContext.phpPreviewSources.get( node.id ) : null;
		if ( lieveContext.executeCodePreview( node ) && ( ! phpRecord || phpRecord.source !== lieveContext.codeSource( node ) ) ) { phpRecord = { source: lieveContext.codeSource( node ), consumed: false }; lieveContext.phpPreviewSources.set( node.id, phpRecord ); }
		const isCurrent = () => { const current = lieveContext.findNode( lieveContext.state.document.children, node.id ); return current && previewKey( current ) === key; };
		function display( html, exact = true ) {
			window.LieveListings?.destroy( visual );
			controlRegistry?.forget( visual );
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
			if ( exact || node.type === 'dropdown' ) { registerPreviewControls( node, visual ); }
			window.LieveListings?.mount( visual, true );
			if ( exact ) { window.LieveCodePreview?.mount( visual, { binding: portalBinding, select: id => { if ( ! portalBinding.current() ) return; lieveContext.closeContextMenu(); selectElement( id ); }, contextMenu: ( id, x, y, origin ) => { if ( portalBinding.current() ) { lieveContext.openContextMenu( id, x, y ); lieveContext.contextReturnFocus = origin; } }, resize: () => { updateSelectionOutline(); lieveContext.canvasDrag?.invalidate(); } } ); }
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
		if ( lieveContext.latestPreviews.has( node.id ) ) { display( lieveContext.latestPreviews.get( node.id ), false ); }
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
			if ( job.controller.signal.aborted || ! isCurrent() || ! visual.isConnected ) { return; }
			// The transport owns its deadline signal. An AbortError without an owner
			// cancellation is terminal; keeping the busy placeholder would never settle.
			const message = error.name === 'AbortError' ? 'Preview request timed out. Edit this element to try again.' : error.message;
			visual.innerHTML = '<div data-editor-ui class="lieve-editor-preview-message">' + lieveContext.escapeHtml( message ) + '</div>';
		} finally {
			if ( lieveContext.previewJobs.get( node.id ) === job ) { lieveContext.previewJobs.delete( node.id ); }
		}
	}

	function selectElement( id, origin = null ) {
		if ( listingProjection && ! listingProjection.select( id, origin ) ) { return; }
		lieveContext.richTextController?.flush(); lieveContext.codeFields?.flush();
		// Explicitly clicking even the auto-selected element chooses a new insertion context.
		lieveContext.catalogueInsertion = null;
		const wasPopup = lieveContext.popupPanelOpen; lieveContext.popupPanelOpen = false; document.getElementById( 'lieve-popup-settings' )?.setAttribute( 'aria-expanded', 'false' );
		if ( lieveContext.state.selectedId === id && ! wasPopup ) { if ( listingProjection ) { updateSelectionOutline(); } return; }
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
				if ( lieveContext.state.popupSettings.closeButton && ! close ) { close = owner.createElement( 'button' ); close.type = 'button'; close.dataset.lieveUi = 'popup-close'; close.dataset.editorUi = ''; close.setAttribute( 'aria-label', 'Edit close button' ); close.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'; close.addEventListener( 'click', event => { event.stopPropagation(); lieveContext.openPopupSettings( 'style', 'close' ); } ); shell.querySelector( '[data-lieve-ui="popup-dialog"]' ).prepend( close ); controlRegistry?.register( close, 'popup-close-settings', shell, () => lieveContext.isPopupTemplate() && lieveContext.state.popupSettings.closeButton ); }
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
		controlRegistry?.changed();
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
		const projected = listingProjection?.outline();
		if ( projected ) { roots = projected; }
		else if ( roots.some( root => root.closest?.( '[data-lieve-listing-item][data-listing-position]' ) ) ) { const all = roots; const position = lieveContext.selectedListingPosition || roots[0]?.closest( '[data-lieve-listing-item]' )?.dataset.listingPosition; roots = roots.filter( root => root.closest( '[data-lieve-listing-item]' )?.dataset.listingPosition === position ); roots = [ roots[0] || all[0] ]; all.forEach( root => root.classList.toggle( 'is-selected', roots.includes( root ) ) ); }
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
		listingProjection?.api.reset();
		expandedProjection?.api.reset();
		controlRegistry?.reset();
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
			controlRegistry?.register( shell.firstElementChild, 'popup-backdrop', shell, () => lieveContext.isPopupTemplate() );
		}

		if ( ! lieveContext.state.document.children.length ) {
			const empty = document.createElement( 'div' );
			canvasIdentity().register( empty, canvasIdentity().owner( { id: null, selectId: null, type: 'empty-canvas', kind: 'empty-canvas' } ), 'descendants' );
			empty.className = 'lieve-canvas-empty';
			empty.dataset.editorUi = '';
			empty.innerHTML = '<div class="lieve-empty-symbol">' + lieveContext.elementIcon( 'section' ) + '</div><strong>Your canvas. Your ideas.</strong><span>Start with a section, then add elements from the library. Everything stays unstyled until you make it yours.</span><button type="button" class="lieve-button-primary">Add your first section</button>';
			empty.querySelector( 'button' ).addEventListener( 'click', () => lieveContext.addBlock( 'section' ) );
			if ( lieveContext.isPopupTemplate() ) { empty.innerHTML = '<strong>Your pop up. Your ideas.</strong><span>Add content, then style the dialog in Pop Up Settings.</span><button type="button" class="lieve-button-secondary">+ Add Something</button>'; empty.querySelector( 'button' ).addEventListener( 'click', () => lieveContext.addBlock( 'section' ) ); }
			contentCanvas.appendChild( empty );
			controlRegistry?.register( empty.querySelector( 'button' ), 'empty-add', lieveContext.canvas, () => ! lieveContext.state.document.children.length );
			lieveContext.templateContext?.append( 'after', lieveContext.canvas, inheritedIdentity );
			renderCanvasStyles();
			return;
		}

		lieveContext.state.document.children.forEach( ( node ) => contentCanvas.appendChild( createNodeElement( node ) ) );
		lieveContext.templateContext?.append( 'after', lieveContext.canvas, inheritedIdentity );
		revealSelectedPreview();
		renderCanvasStyles();
	}
	return { canvasIdentity, canvasControls, canvasListingProjection, canvasExpandedProjection, canvasSelectionElement, styleString, createChildren, createNodeElement, prepareEditorRoot, prepareHtmlFragment, editorBounds, previewNodeData, previewKey, seedElementPreviews, handlePreviewInteraction, revealSelectedPreview, clearDropIndicators, loadElementPreview, selectElement, renderCanvasStyles, observeSelectionLayout, updateSelectionOutline, renderCanvasElement, renderCanvas };
	};
} )();
