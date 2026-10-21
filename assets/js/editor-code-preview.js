/* Connect sandboxed code previews to canvas sizing, design tokens and selection. */
( function() {
	'use strict';
	const managers = new WeakMap();
	function manager( owner ) {
		if ( managers.has( owner ) ) return managers.get( owner );
		const frames = new Map(), top = document, outer = owner.defaultView.frameElement;
		const stage = outer?.closest( '.lieve-stage-scroll' );
		// Script restrictions are inherited by nested frames. Portal ONLY the opaque-origin
		// executable frame outside the inert canvas; keep its real layout handle in place.
		const layer = top.createElement( 'div' ); layer.className = 'lieve-code-preview-layer'; layer.setAttribute( 'aria-label', 'Custom Code previews' );
		( top.getElementById( 'lieve-builder-app' ) || top.body ).appendChild( layer );
		function bindFrame( frame, record ) {
			frame.removeAttribute( 'data-lieve-code-source' ); frame.style.visibility = 'hidden'; frame.setAttribute( 'aria-hidden', 'true' ); frame.tabIndex = -1;
			frame.style.height = record.height || 'calc(32px * var(--lv-canvas-ui-scale, 1))';
			record.frame = frame; frames.set( frame, record ); observer?.observe( frame );
			if ( record.error ) frame.after( record.error );
		}
		function prune() {
			const detached = Array.from( frames ).filter( ( [ frame ] ) => ! frame.isConnected );
			if ( ! detached.length ) return;
			// Re-rendering surrounding editor markup must not restart an unchanged
			// executable iframe. Transfer its handle, retaining script/input state.
			const replacements = Array.from( owner.querySelectorAll( 'iframe[data-lieve-code-preview]' ) );
			detached.forEach( ( [ frame, record ] ) => {
				const next = replacements.find( item => ! frames.has( item ) && item.dataset.lieveCodeChannel === frame.dataset.lieveCodeChannel && item.dataset.lieveCodeNode === frame.dataset.lieveCodeNode && item.getAttribute( 'data-lieve-code-source' ) === record.source );
				observer?.unobserve( frame ); frames.delete( frame );
				if ( next ) { bindFrame( next, record ); }
				else { window.clearTimeout( record.timeout ); record.pending?.remove(); record.error?.remove(); record.portal.remove(); }
			} );
		}
		function layout() {
			prune();
			const bounds = stage?.getBoundingClientRect();
			if ( bounds ) layer.style.clipPath = 'inset(' + Math.max( 0, bounds.top ) + 'px ' + Math.max( 0, window.innerWidth - bounds.right ) + 'px ' + Math.max( 0, window.innerHeight - bounds.bottom ) + 'px ' + Math.max( 0, bounds.left ) + 'px)';
			layer.hidden = ! frames.size || ! outer?.isConnected || ! outer.classList.contains( 'is-ready' ) || !! top.querySelector( '.lieve-workspace.is-dragging-canvas' );
			if ( layer.hidden ) return;
			const viewport = outer.getBoundingClientRect(), sx = viewport.width / outer.clientWidth, sy = viewport.height / outer.clientHeight;
			frames.forEach( ( record, frame ) => {
				const rect = frame.getBoundingClientRect();
				const left = viewport.left + rect.left * sx + 'px', top = viewport.top + rect.top * sy + 'px';
				Object.assign( record.portal.style, { left, top, width: frame.offsetWidth + 'px', height: frame.offsetHeight + 'px', transform: 'scale(' + sx + ',' + sy + ')' } );
				if ( record.pending ) Object.assign( record.pending.style, { left, top, width: frame.offsetWidth * sx + 'px', height: frame.offsetHeight * sy + 'px' } );
			} );
		}
		const observer = typeof ResizeObserver === 'function' ? new ResizeObserver( layout ) : null;
		if ( outer ) observer?.observe( outer ); if ( stage ) observer?.observe( stage );
		window.addEventListener( 'resize', layout ); top.addEventListener( 'scroll', layout, true ); owner.addEventListener( 'scroll', layout, true );
		if ( outer && typeof MutationObserver === 'function' ) {
			new MutationObserver( layout ).observe( outer, { attributes: true, attributeFilter: [ 'style', 'class' ] } );
			new MutationObserver( layout ).observe( owner.body, { childList: true, subtree: true } );
			const app = top.querySelector( '.lieve-workspace' ); if ( app ) new MutationObserver( layout ).observe( app, { attributes: true, attributeFilter: [ 'class' ] } );
		}
		const context = ( frame, force = false ) => {
			const record = frames.get( frame ); if ( ! record ) return;
			const style = owner.defaultView.getComputedStyle( frame ), variables = {};
			for ( const name of style ) { if ( name.startsWith( '--' ) && Object.keys( variables ).length < 300 ) { const value = style.getPropertyValue( name ); if ( value.length <= 2000 ) variables[ name ] = value; } }
			const inherited = [ 'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'direction' ].map( name => name + ':' + style.getPropertyValue( name ) + ';' ).join( '' );
			const signature = JSON.stringify( { variables, inherited } );
			if ( ! force && record.context === signature ) return;
			record.context = signature;
			record.revision++;
			record.portal.contentWindow?.postMessage( { lieveCodePreview: frame.dataset.lieveCodeChannel, type: 'context', variables, inherited, revision: record.revision }, '*' );
		};
		function reportError( frame, record, message ) {
			if ( ! record.error ) { record.error = owner.createElement( 'p' ); record.error.className = 'lieve-code-preview-error'; record.error.dataset.editorUi = ''; record.error.setAttribute( 'role', 'status' ); frame.after( record.error ); }
			record.error.textContent = String( message || 'JavaScript preview error.' ).slice( 0, 240 ); record.resize?.();
			return record.error;
		}
		window.addEventListener( 'message', event => {
			prune();
			for ( const [ frame, record ] of frames ) {
				if ( event.source !== record.portal.contentWindow || event.data?.lieveCodePreview !== frame.dataset.lieveCodeChannel ) continue;
				const data = event.data;
				if ( data.type === 'ready' ) context( frame, true );
				if ( data.type === 'size' && data.ready === true && data.revision === record.revision && typeof data.height === 'number' && Number.isFinite( data.height ) ) {
					const height = Math.max( 24, Math.min( 10000, data.height ) ) + 'px';
					record.height = height;
					if ( frame.style.height !== height ) { frame.style.height = height; layout(); record.resize?.(); }
					if ( ! record.shown ) {
						// Reveal parsed content with its current inherited CSS and measured
						// geometry, without waiting for unrelated fonts or external resources.
						record.shown = true; window.clearTimeout( record.timeout );
						record.portal.style.visibility = 'visible'; record.portal.removeAttribute( 'aria-hidden' ); record.portal.tabIndex = 0;
						record.pending?.remove(); record.pending = null;
						if ( record.initializationError ) { record.initializationError.remove(); record.error = null; record.initializationError = null; }
					}
				}
				if ( data.type === 'select' && record.shown ) record.select?.( frame.dataset.lieveCodeNode );
				if ( data.type === 'wheel' && record.shown && ! layer.hidden ) { window.LieveViewport?.scrollFrom( owner, data, frame ); }
				if ( data.type === 'error' ) {
					record.initializationError = null; reportError( frame, record, data.message );
				}
			}
		} );
		const api = {
			mount( root, callbacks ) {
				prune(); root.querySelectorAll( 'iframe[data-lieve-code-preview]' ).forEach( frame => {
					if ( ! frames.has( frame ) ) {
						const portal = top.createElement( 'iframe' ); portal.className = 'lieve-code-preview-portal'; portal.title = frame.title || 'Custom Code preview'; portal.setAttribute( 'sandbox', 'allow-scripts' ); portal.setAttribute( 'aria-hidden', 'true' ); portal.tabIndex = -1; portal.referrerPolicy = 'no-referrer';
						const pending = top.createElement( 'div' ); pending.className = 'lieve-code-preview-loading lieve-code-preview-pending'; pending.setAttribute( 'role', 'status' ); pending.setAttribute( 'aria-label', 'Loading Custom Code preview' ); pending.innerHTML = '<span aria-hidden="true"></span>';
						const source = frame.getAttribute( 'data-lieve-code-source' ); const record = { ...callbacks, portal, source, pending, revision: 0, shown: false };
						bindFrame( frame, record ); portal.addEventListener( 'load', () => { context( record.frame, true ); layout(); } ); portal.srcdoc = source || ''; layer.appendChild( pending ); layer.appendChild( portal );
						record.timeout = window.setTimeout( () => { if ( ! record.shown && frames.has( record.frame ) ) { record.pending?.remove(); record.pending = null; record.initializationError = reportError( record.frame, record, 'Custom Code preview could not initialize. Check its scripts or resources and try again.' ); } }, 15000 );
					} else { Object.assign( frames.get( frame ), callbacks ); } context( frame );
				} ); layout();
			},
			refresh() { prune(); frames.forEach( ( record, frame ) => context( frame ) ); layout(); }
		};
		managers.set( owner, api ); return api;
	}
	window.LieveCodePreview = {
		mount( root, callbacks = {} ) {
			// Cached previews are built in a detached parent-document visual. Wait for
			// insertion/adoption before choosing the owner and consuming frame source.
			if ( ! root.isConnected ) { window.queueMicrotask( () => { if ( root.isConnected ) manager( root.ownerDocument ).mount( root, callbacks ); } ); return; }
			manager( root.ownerDocument ).mount( root, callbacks );
		},
		refresh( root ) { if ( root?.ownerDocument ) manager( root.ownerDocument ).refresh(); }
	};
} )();
