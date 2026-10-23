/* Connect sandboxed code previews to canvas sizing, design tokens and selection. */
( function() {
	'use strict';
	const managers = new WeakMap();
	const generation = () => Array.from( window.crypto.getRandomValues( new Uint32Array( 4 ) ), value => value.toString( 16 ).padStart( 8, '0' ) ).join( '' );
	function manager( owner ) {
		if ( managers.has( owner ) ) return managers.get( owner );
		const frames = new Map(), top = document, listeners = [], mutations = [];
		let outer = owner.defaultView.frameElement, stage = outer?.closest( '.lieve-stage-scroll' );
		let destroyed = false, arbiter = null;
		const counters = { accepted: 0, denied: 0, created: 0, removed: 0, transferred: 0, messages: [], selections: [], routing: [], layouts: [] };
		const sample = ( key, start ) => { if ( counters[key].length < 2000 ) counters[key].push( performance.now() - start ); };
		const listen = ( target, type, callback, options ) => { target.addEventListener( type, callback, options ); listeners.push( () => target.removeEventListener( type, callback, options ) ); };
		const current = record => ! destroyed && record.binding?.current() === true && record.frame?.isConnected && record.frame.ownerDocument === owner && record.portal.isConnected && outer?.isConnected && outer.contentDocument === owner && record.portal.getAttribute( 'sandbox' ) === 'allow-scripts';
		function remove( record ) {
			arbiter?.release( record ); observer?.unobserve( record.frame ); frames.delete( record.frame );
			window.clearTimeout( record.timeout ); record.timeout = 0; record.portal.removeEventListener( 'load', record.load ); record.pending?.remove(); record.error?.remove(); record.portal.remove();
			record.binding = record.select = record.contextMenu = record.resize = record.source = null; counters.removed++;
		}
		// Script restrictions are inherited by nested frames. Portal ONLY the opaque-origin
		// executable frame outside the inert canvas; keep its real layout handle in place.
		let layer = top.createElement( 'div' ); layer.className = 'lieve-code-preview-layer'; layer.setAttribute( 'aria-label', 'Custom Code previews' );
		( top.getElementById( 'lieve-builder-app' ) || top.body ).appendChild( layer );
		function bindFrame( frame, record ) {
			frame.removeAttribute( 'data-lieve-code-source' ); frame.style.visibility = 'hidden'; frame.setAttribute( 'aria-hidden', 'true' ); frame.tabIndex = -1;
			frame.style.height = record.height || 'calc(32px * var(--lv-canvas-ui-scale, 1))';
			record.frame = frame; frames.set( frame, record ); observer?.observe( frame );
			if ( record.error ) frame.after( record.error );
		}
		function prune() {
			// Transfers happen only in an actual renderer mount, with its fresh binding.
			// Never discover replacement authority by scanning authored attributes.
			for ( const record of Array.from( frames.values() ) ) {
				if ( current( record ) ) continue;
				if ( record.binding?.live() && ! record.pruning ) {
					record.pruning = true; window.queueMicrotask( () => { record.pruning = false; if ( frames.get( record.frame ) === record && ! current( record ) ) remove( record ); } );
				} else if ( ! record.pruning ) remove( record );
			}
		}
		function layout() {
			if ( destroyed ) return;
			const start = performance.now();
			prune();
			const bounds = stage?.getBoundingClientRect();
			if ( bounds ) layer.style.clipPath = 'inset(' + Math.max( 0, bounds.top ) + 'px ' + Math.max( 0, window.innerWidth - bounds.right ) + 'px ' + Math.max( 0, window.innerHeight - bounds.bottom ) + 'px ' + Math.max( 0, bounds.left ) + 'px)';
			layer.hidden = ! frames.size || ! outer?.isConnected || ! outer.classList.contains( 'is-ready' ) || !! top.querySelector( '.lieve-workspace.is-dragging-canvas' ) || arbiter?.active() === false;
			if ( layer.hidden ) return;
			const viewport = outer.getBoundingClientRect(), sx = viewport.width / outer.clientWidth, sy = viewport.height / outer.clientHeight;
			frames.forEach( ( record, frame ) => {
				const rect = frame.getBoundingClientRect(), projected = arbiter?.project( rect );
				const left = ( projected ? projected.left : viewport.left + rect.left * sx ) + 'px', top = ( projected ? projected.top : viewport.top + rect.top * sy ) + 'px';
				Object.assign( record.portal.style, { left, top, width: frame.offsetWidth + 'px', height: frame.offsetHeight + 'px', transform: 'scale(' + sx + ',' + sy + ')' } );
				if ( record.pending ) Object.assign( record.pending.style, { left, top, width: frame.offsetWidth * sx + 'px', height: frame.offsetHeight * sy + 'px' } );
			} );
			sample( 'layouts', start );
		}
		let observer = typeof ResizeObserver === 'function' ? new ResizeObserver( layout ) : null;
		if ( outer ) observer?.observe( outer ); if ( stage ) observer?.observe( stage );
		listen( window, 'resize', layout ); listen( top, 'scroll', layout, true ); listen( owner, 'scroll', layout, true );
		listen( outer, 'load', layout );
		if ( outer && typeof MutationObserver === 'function' ) {
			const observe = ( target, options ) => { const item = new MutationObserver( layout ); item.observe( target, options ); mutations.push( item ); };
			observe( outer, { attributes: true, attributeFilter: [ 'style', 'class', 'sandbox' ] } );
			const content = new MutationObserver( layout ); content.observe( owner.body, { childList: true, subtree: true } ); content.observe( layer, { childList: true } ); mutations.push( content );
			const app = top.querySelector( '.lieve-workspace' ); if ( app ) observe( app, { attributes: true, attributeFilter: [ 'class' ] } );
			if ( stage?.parentElement ) observe( stage.parentElement, { childList: true, subtree: true } );
		}
		const context = ( frame, force = false ) => {
			const record = frames.get( frame ); if ( ! record || ! current( record ) ) return;
			const style = owner.defaultView.getComputedStyle( frame ), variables = {};
			for ( const name of style ) { if ( name.startsWith( '--' ) && Object.keys( variables ).length < 300 ) { const value = style.getPropertyValue( name ); if ( value.length <= 2000 ) variables[ name ] = value; } }
			const inherited = [ 'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'direction' ].map( name => name + ':' + style.getPropertyValue( name ) + ';' ).join( '' );
			const signature = JSON.stringify( { variables, inherited } );
			if ( ! force && record.context === signature ) return;
			record.context = signature;
			record.revision++;
			record.portal.contentWindow?.postMessage( { lieveCodePreview: record.channel, generation: record.generation, type: 'context', variables, inherited, revision: record.revision }, '*' );
		};
		function reportError( frame, record, message ) {
			if ( ! record.error ) { record.error = owner.createElement( 'p' ); record.error.className = 'lieve-code-preview-error'; record.error.dataset.editorUi = ''; record.error.setAttribute( 'role', 'status' ); frame.after( record.error ); }
			record.error.textContent = String( message || 'JavaScript preview error.' ).slice( 0, 240 ); record.resize?.();
			return record.error;
		}
		function watch( record ) {
			window.clearTimeout( record.timeout );
			record.timeout = window.setTimeout( () => { record.timeout = 0; if ( current( record ) && ! record.shown ) { record.pending?.remove(); record.pending = null; record.initializationError = reportError( record.frame, record, 'Custom Code preview could not initialize. Check its scripts or resources and try again.' ); } }, 15000 );
		}
		listen( window, 'message', event => {
			const start = performance.now(), data = event.data;
			if ( destroyed || event.isTrusted !== true || event.origin !== 'null' || ! data || typeof data !== 'object' || Array.isArray( data ) ) { counters.denied++; return; }
			prune();
			for ( const [ frame, record ] of frames ) {
				if ( event.source !== record.portal.contentWindow || data.lieveCodePreview !== record.channel ) continue;
				const fields = { ready: [], size: [ 'height', 'ready', 'revision' ], select: [], wheel: [ 'deltaX', 'deltaY', 'deltaMode', 'shiftKey', 'clientX', 'clientY' ], contextmenu: [ 'clientX', 'clientY' ], error: [ 'message' ] };
				const keys = Object.prototype.hasOwnProperty.call( fields, data.type ) && fields[data.type];
				if ( ! keys || ! Object.keys( data ).every( key => [ 'lieveCodePreview', 'type', 'generation', 'sequence', ...keys ].includes( key ) ) || ! Number.isSafeInteger( data.sequence ) || data.sequence <= record.sequence ||
					( data.type === 'ready' ? record.ready || data.generation !== null && data.generation !== record.generation : data.generation !== record.generation ) ) { counters.denied++; return; }
				if ( data.type === 'size' && ( data.ready !== true || data.revision !== record.revision || ! Number.isFinite( data.height ) ) ||
					data.type === 'error' && ( typeof data.message !== 'string' || data.message.length > 240 ) ||
					data.type === 'wheel' && ( ! [ 0, 1, 2 ].includes( data.deltaMode ) || ! Number.isFinite( data.deltaX ) || ! Number.isFinite( data.deltaY ) || typeof data.shiftKey !== 'boolean' || ! Number.isFinite( data.clientX ) || ! Number.isFinite( data.clientY ) ) ||
					data.type === 'contextmenu' && ( ! Number.isFinite( data.clientX ) || ! Number.isFinite( data.clientY ) ) ) { counters.denied++; return; }
				const routing = performance.now();
				if ( ! current( record ) || arbiter && ! arbiter.accept( record, data ) ) { counters.denied++; return; }
				sample( 'routing', routing );
				record.sequence = data.sequence; counters.accepted++;
				if ( data.type === 'ready' ) { record.ready = true; context( frame, true ); }
				if ( data.type === 'size' && data.ready === true && data.revision === record.revision && typeof data.height === 'number' && Number.isFinite( data.height ) ) {
					const height = Math.max( 24, Math.min( 10000, data.height ) ) + 'px';
					record.height = height;
					if ( frame.style.height !== height ) { frame.style.height = height; layout(); record.resize?.(); }
					if ( ! record.shown ) {
						// Reveal parsed content with its current inherited CSS and measured
						// geometry, without waiting for unrelated fonts or external resources.
						record.shown = true; window.clearTimeout( record.timeout ); record.timeout = 0;
						record.portal.style.visibility = 'visible'; record.portal.removeAttribute( 'aria-hidden' ); record.portal.tabIndex = 0;
						record.pending?.remove(); record.pending = null;
						if ( record.initializationError ) { record.initializationError.remove(); record.error = null; record.initializationError = null; }
					}
				}
				if ( data.type === 'select' && record.shown && ! layer.hidden ) { const selected = performance.now(); arbiter?.before( record ); record.select?.( record.binding.id ); sample( 'selections', selected ); }
				if ( data.type === 'wheel' && record.shown && ! layer.hidden ) { if ( window.LieveViewport?.scrollFrom( owner, data, frame ) ) arbiter?.scrolled(); }
				if ( data.type === 'contextmenu' && record.shown && ! layer.hidden && typeof data.clientX === 'number' && Number.isFinite( data.clientX ) && typeof data.clientY === 'number' && Number.isFinite( data.clientY ) && data.clientX >= 0 && data.clientX <= frame.offsetWidth && data.clientY >= 0 && data.clientY <= frame.offsetHeight && frame.offsetWidth > 0 && frame.offsetHeight > 0 ) {
					const rect = record.portal.getBoundingClientRect();
					if ( rect.width > 0 && rect.height > 0 ) { arbiter?.before( record ); record.contextMenu?.( record.binding.id, rect.left + data.clientX * rect.width / frame.offsetWidth, rect.top + data.clientY * rect.height / frame.offsetHeight, record.portal ); arbiter?.menu( record ); }
				}
				if ( data.type === 'error' ) {
					record.initializationError = null; reportError( frame, record, data.message );
				}
				sample( 'messages', start ); return;
			}
			counters.denied++;
		} );
		const api = {
			mount( root, callbacks ) {
				if ( destroyed || ! callbacks.binding?.current() || callbacks.binding.root !== root ) return;
				root.querySelectorAll( 'iframe[data-lieve-code-preview]' ).forEach( frame => {
					if ( ! frames.has( frame ) ) {
						const retained = Array.from( frames.values() ).find( record => ! record.frame.isConnected && record.binding?.model === callbacks.binding.model && record.binding.node === callbacks.binding.node && record.channel === frame.dataset.lieveCodeChannel && frame.getAttribute( 'data-lieve-code-source' ) === record.source );
						if ( retained ) { observer?.unobserve( retained.frame ); frames.delete( retained.frame ); Object.assign( retained, callbacks ); bindFrame( frame, retained ); counters.transferred++; }
					}
					if ( ! frames.has( frame ) ) {
						const portal = top.createElement( 'iframe' ); portal.className = 'lieve-code-preview-portal'; portal.title = frame.title || 'Custom Code preview'; portal.setAttribute( 'sandbox', 'allow-scripts' ); portal.setAttribute( 'aria-hidden', 'true' ); portal.tabIndex = -1; portal.referrerPolicy = 'no-referrer';
						const pending = top.createElement( 'div' ); pending.className = 'lieve-code-preview-loading lieve-code-preview-pending'; pending.setAttribute( 'role', 'status' ); pending.setAttribute( 'aria-label', 'Loading Custom Code preview' ); pending.innerHTML = '<span aria-hidden="true"></span>';
						const source = frame.getAttribute( 'data-lieve-code-source' ); const record = { ...callbacks, portal, source, pending, channel: frame.dataset.lieveCodeChannel, generation: generation(), sequence: 0, revision: 0, loads: 0, ready: false, shown: false };
						bindFrame( frame, record );
						record.load = () => {
							if ( ! current( record ) ) return;
							if ( record.loads++ ) { arbiter?.release( record ); record.generation = generation(); record.sequence = record.revision = 0; record.context = null; record.ready = record.shown = false; portal.style.visibility = 'hidden'; portal.setAttribute( 'aria-hidden', 'true' ); portal.tabIndex = -1; watch( record ); }
							context( record.frame, true ); layout();
						};
						portal.addEventListener( 'load', record.load ); portal.srcdoc = source || ''; layer.appendChild( pending ); layer.appendChild( portal ); counters.created++;
						watch( record );
					} else { Object.assign( frames.get( frame ), callbacks ); } context( frame );
				} ); layout();
			},
			refresh( force = false ) { if ( destroyed ) return; prune(); frames.forEach( ( record, frame ) => context( frame, force ) ); layout(); },
			connect( next ) { if ( destroyed || arbiter ) return false; arbiter = next; layout(); return true; },
			visible() { return ! layer.hidden && ! destroyed; },
			owns( node ) { return Array.from( frames.values() ).some( record => record.portal === node && current( record ) ); },
			pause() { frames.forEach( record => arbiter?.release( record ) ); api.refresh(); },
			destroy() { if ( destroyed ) return; for ( const record of Array.from( frames.values() ) ) remove( record ); destroyed = true; listeners.splice( 0 ).forEach( off => off() ); mutations.splice( 0 ).forEach( item => item.disconnect() ); observer?.disconnect(); layer.remove(); owner = outer = stage = observer = layer = arbiter = null; },
			stats() { return { ...counters, messages: counters.messages.slice(), selections: counters.selections.slice(), routing: counters.routing.slice(), layouts: counters.layouts.slice(), destroyed, records: frames.size, listeners: listeners.length + frames.size, observers: destroyed ? 0 : mutations.length + Number( Boolean( observer ) ), timers: Array.from( frames.values() ).filter( record => record.timeout ).length, hidden: layer?.hidden ?? true }; }
		};
		listen( window, 'pagehide', event => { if ( ! event.persisted ) api.destroy(); } );
		managers.set( owner, api ); return api;
	}
	window.LieveCodePreview = {
		// Passive satellite. Ordinary builder never constructs or mounts this.
		createParent( { viewport, controller, context, cancelDrag = () => {}, cancelCommands = () => {}, onOutline = () => {} } ) {
			let state = 'created', surface = null, valid = null, menuOwner = null, menuElement = null, focusFrame = 0, focusEpoch = 0;
			const service = manager( viewport.document ), listeners = [];
			const listen = ( target, type, fn, options ) => { target.addEventListener( type, fn, options ); listeners.push( () => target.removeEventListener( type, fn, options ) ); };
			const active = () => state === 'mounted' && valid?.() === true && viewport.readiness?.().destroyed !== true;
			const cancelFocus = () => { focusEpoch++; window.cancelAnimationFrame( focusFrame ); focusFrame = 0; };
			function deferredFocus( target, guard ) {
				window.cancelAnimationFrame( focusFrame ); const epoch = ++focusEpoch;
				focusFrame = window.requestAnimationFrame( () => {
					if ( epoch !== focusEpoch || state === 'destroyed' ) return;
					focusFrame = 0;
					if ( target?.isConnected && valid?.() && document.hasFocus?.() !== false && guard() ) target.focus( { preventScroll: true } );
				} );
			}
			function release( record ) {
				const focused = document.activeElement === record.portal || menuOwner === record && context.contextMenu?.contains( document.activeElement );
				if ( menuOwner === record ) { context.closeContextMenu(); menuOwner = null; if ( context.contextReturnFocus === record.portal ) context.contextReturnFocus = null; }
				if ( focused && surface?.isConnected ) { surface.focus( { preventScroll: true } ); deferredFocus( surface, () => document.activeElement === record.portal || document.activeElement === document.body ); }
			}
			const authority = record => active() && record.binding.current() && controller.canvasIdentity().resolve( record.binding.root ).identity?.selectId === record.binding.id;
			const adapter = {
				active, release, project: rect => viewport.toParent( rect ),
				accept( record, data ) {
					if ( ! authority( record ) ) return false;
					if ( ! [ 'select', 'wheel', 'contextmenu' ].includes( data.type ) ) return true;
					if ( ! record.shown || ! service.visible() || context.app.classList.contains( 'is-dragging-canvas' ) ) return false;
					if ( data.type === 'select' ) return document.hasFocus?.() !== false && document.activeElement === record.portal;
					if ( data.clientX < 0 || data.clientY < 0 || data.clientX >= record.frame.offsetWidth || data.clientY >= record.frame.offsetHeight ) return false;
					const r = record.portal.getBoundingClientRect(), x = r.left + data.clientX * r.width / record.frame.offsetWidth, y = r.top + data.clientY * r.height / record.frame.offsetHeight, b = viewport.bounds();
					return x >= b.left && x < b.right && y >= b.top && y < b.bottom && document.elementFromPoint( x, y ) === record.portal;
				},
				before() { cancelFocus(); cancelDrag(); cancelCommands(); }, scrolled() { service.refresh(); onOutline(); },
				menu( record ) {
					menuOwner = record;
					// Firefox can finish an opaque-frame focus transition after the
					// message callback. Reconcile once, never poll or steal field focus.
					deferredFocus( context.contextMenu?.querySelector( '[data-context-action]:not(:disabled)' ), () => menuOwner === record && authority( record ) && ! context.contextMenu.hidden && ( document.activeElement === record.portal || document.activeElement === document.body ) );
					if ( menuElement === context.contextMenu ) return;
					menuElement = context.contextMenu;
					const guard = event => {
						if ( menuOwner && ( ! event.isTrusted || ! authority( menuOwner ) ) ) { event.preventDefault(); event.stopImmediatePropagation(); release( menuOwner ); return; }
						const currentOwner = menuOwner;
						window.queueMicrotask( () => { if ( currentOwner && menuOwner === currentOwner && active() && context.contextMenu?.hidden && authority( currentOwner ) ) { if ( document.activeElement === document.body || context.contextMenu.contains( document.activeElement ) ) currentOwner.portal.focus( { preventScroll: true } ); menuOwner = null; } } );
					};
					for ( const type of [ 'click', 'keydown' ] ) { menuElement.addEventListener( type, guard, true ); const node = menuElement; listeners.push( () => node.removeEventListener( type, guard, true ) ); }
				}
			};
			return Object.freeze( {
				mount( target, isValid ) {
					if ( state !== 'created' ) return false; surface = target; valid = isValid; state = 'mounted'; if ( ! service.connect( adapter ) ) { state = 'created'; return false; }
					listen( document, 'pointerdown', event => {
						if ( ! active() || ! event.isTrusted ) return;
						if ( surface.contains( event.target ) ) deferredFocus( surface, () => document.activeElement === document.body || service.owns( document.activeElement ) );
					}, true );
					return true;
				},
				refresh() { if ( active() ) service.refresh(); },
				suspend() { if ( state !== 'mounted' ) return false; cancelFocus(); state = 'suspended'; service.pause(); return true; },
				resume() { if ( state !== 'suspended' || ! valid?.() ) return false; cancelFocus(); state = 'mounted'; service.refresh( true ); return true; },
				destroy() { if ( state === 'destroyed' ) return; service.destroy(); listeners.splice( 0 ).forEach( off => off() ); state = 'destroyed'; cancelFocus(); surface = valid = menuOwner = menuElement = viewport = controller = context = cancelDrag = cancelCommands = onOutline = null; },
				stats() { return { state, listeners: listeners.length, framesActive: focusFrame ? 1 : 0, manager: service.stats() }; }
			} );
		},
		mount( root, callbacks = {} ) {
			// Cached previews are built in a detached parent-document visual. Wait for
			// insertion/adoption before choosing the owner and consuming frame source.
			if ( ! root.isConnected ) { window.queueMicrotask( () => { if ( root.isConnected ) manager( root.ownerDocument ).mount( root, callbacks ); } ); return; }
			manager( root.ownerDocument ).mount( root, callbacks );
		},
		refresh( root ) { if ( root?.ownerDocument ) manager( root.ownerDocument ).refresh(); }
	};
} )();
