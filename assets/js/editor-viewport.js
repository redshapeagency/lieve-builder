/* A real, same-origin viewport. Authored markup cannot execute scripts here. */
( function () {
	'use strict';
	const scrollers = new WeakMap();
	function consumeScroll( element, delta, horizontal, scale = 1 ) {
		if ( ! element || ! delta ) { return delta; }
		const key = horizontal ? 'scrollLeft' : 'scrollTop';
		const extent = Math.max( 0, ( element[ horizontal ? 'scrollWidth' : 'scrollHeight' ] || 0 ) - ( element[ horizontal ? 'clientWidth' : 'clientHeight' ] || 0 ) );
		if ( ! extent ) { return delta; }
		const rtl = horizontal && element.ownerDocument?.defaultView?.getComputedStyle( element ).direction === 'rtl';
		const before = element[ key ] || 0, next = Math.max( rtl ? -extent : 0, Math.min( rtl ? 0 : extent, before + delta / scale ) );
		if ( next === before ) { return delta; }
		if ( typeof element.scrollTo === 'function' ) { element.scrollTo( { left: horizontal ? next : element.scrollLeft, top: horizontal ? element.scrollTop : next, behavior: 'instant' } ); }
		else { element[ key ] = next; }
		return delta - ( element[ key ] - before ) * scale;
	}
	function canInlineCss( css ) {
		if ( /@import\b/i.test( css ) ) { return false; }
		for ( const match of css.matchAll( /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi ) ) {
			if ( ! /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test( ( match[ 1 ] ?? match[ 2 ] ?? match[ 3 ] ).trim() ) ) { return false; }
		}
		return true;
	}
	function loadedCss( url ) {
		try {
			const href = new URL( url, window.location.href ).href;
			const sheet = Array.from( document.styleSheets || [] ).find( item => item.href === href && ! item.disabled );
			if ( ! sheet ) { return null; }
			const rules = Array.from( sheet.cssRules );
			if ( rules.some( rule => rule.type === 3 ) ) { return null; } // Keep imports and their URL bases intact.
			const css = rules.map( rule => rule.cssText ).join( '\n' );
			return canInlineCss( css ) ? css : null;
		} catch ( error ) { return null; } // Unloaded or cross-origin sheets use the normal link fallback.
	}
	function create( { canvas, app, styles = [], styleTexts = {}, inlineCss = '', initialWidth = 1279, onResize = () => {}, onReady = () => {} } ) {
		const stage = canvas.closest( '.lieve-stage-scroll' );
		const zoomSelect = app.querySelector( '[data-editor-zoom]' ); const zoomListeners = new Set();
		let stylesReady = false; let contentReady = false; let revealed = false;
		const host = document.createElement( 'div' ); host.className = 'lieve-viewport-host';
		const frame = document.createElement( 'iframe' ); frame.className = 'lieve-viewport-frame';
		frame.title = 'Responsive composition viewport';
		frame.setAttribute( 'sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox' );
		canvas.replaceWith( host ); host.appendChild( frame );
		const doc = frame.contentDocument;
		doc.open(); doc.write( '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>' ); doc.close();
		doc.documentElement.lang = document.documentElement.lang || 'en';
		doc.body.className = 'lieve-workspace lieve-preview-document';
		canvas.classList.add( 'lieve-builder-content' ); doc.body.appendChild( canvas );
		const base = doc.createElement( 'base' ); base.href = window.location.href; doc.head.appendChild( base );
		const syncAppearance = () => {
			doc.body.dataset.colorMode = app.dataset.colorMode || 'light';
			const chrome = window.getComputedStyle( app );
			for ( const key of [ '--lv-teal', '--lv-violet', '--lv-gradient' ] ) { const value = chrome.getPropertyValue?.( key ); if ( value ) { doc.body.style.setProperty( key, value ); } }
		};
		syncAppearance();
		const appearance = typeof MutationObserver !== 'undefined' ? new MutationObserver( syncAppearance ) : null;
		appearance?.observe( app, { attributes: true, attributeFilter: [ 'data-color-mode' ] } );
		const loaded = styles.map( url => {
			const css = Object.prototype.hasOwnProperty.call( styleTexts, url ) ? styleTexts[ url ] : loadedCss( url );
			if ( typeof css === 'string' && canInlineCss( css ) ) { const inline = doc.createElement( 'style' ); inline.textContent = css; doc.head.appendChild( inline ); return null; }
			return new Promise( resolve => {
			const link = doc.createElement( 'link' ); link.rel = 'stylesheet'; link.href = url;
			link.onload = resolve; link.onerror = resolve; doc.head.appendChild( link );
			} );
		} ).filter( Boolean );
		if ( inlineCss ) { const inline = doc.createElement( 'style' ); inline.textContent = inlineCss; doc.head.appendChild( inline ); }
		if ( loaded.length ) { Promise.all( loaded ).then( () => { stylesReady = true; reveal(); } ); }
		else { stylesReady = true; }
		// Moving focus between the inspector and the frame is not returning to
		// the editor. Refresh global settings only after a real window/tab absence.
		const returnListeners = new Set(); let wasAway = false;
		const away = () => window.setTimeout( () => { if ( document.visibilityState === 'hidden' || ! document.hasFocus() ) { wasAway = true; } }, 0 );
		const returned = () => { if ( wasAway && document.visibilityState !== 'hidden' && document.hasFocus() ) { wasAway = false; returnListeners.forEach( listener => listener() ); } };
		window.addEventListener( 'blur', away ); window.addEventListener( 'focus', returned );
		frame.contentWindow?.addEventListener( 'blur', away ); frame.contentWindow?.addEventListener( 'focus', returned );
		document.addEventListener?.( 'visibilitychange', () => { if ( document.visibilityState === 'hidden' ) { wasAway = true; } else { returned(); } } );
		let width = Number.isInteger( initialWidth ) && initialWidth >= 240 && initialWidth <= 7680 ? initialWidth : 1279; let scale = 1; let zoom = 'fit';
		function scroll( input, target = canvas ) {
			if ( ! input || input.defaultPrevented || input.ctrlKey || input.metaKey ) { return false; }
			const mode = input.deltaMode ?? 0, x = input.deltaX ?? 0, y = input.deltaY ?? 0;
			if ( ! [ 0, 1, 2 ].includes( mode ) || ! Number.isFinite( x ) || ! Number.isFinite( y ) ) { return false; }
			const unit = mode === 1 ? 16 : mode === 2 ? stage.clientHeight : 1;
			let dx = Math.max( -10000, Math.min( 10000, x * unit ) ), dy = Math.max( -10000, Math.min( 10000, y * unit ) );
			if ( input.shiftKey && ! dx ) { dx = dy; dy = 0; }
			const initialX = dx, initialY = dy, root = doc.scrollingElement || doc.documentElement;
			// Preserve nested scrolling, then hand the remaining movement through
			// the canvas viewport and its parent stage instead of trapping the wheel.
			for ( let node = target?.nodeType === 3 ? target.parentElement : target; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement || node.getRootNode?.().host ) {
				const css = doc.defaultView?.getComputedStyle( node ) || window.getComputedStyle( node );
				if ( /^(auto|scroll|overlay)$/.test( css.overflowX ) ) { dx = consumeScroll( node, dx, true, scale ); }
				if ( /^(auto|scroll|overlay)$/.test( css.overflowY ) ) { dy = consumeScroll( node, dy, false, scale ); }
				if ( ! dx && ! dy ) { break; }
			}
			const route = ( delta, horizontal ) => {
				if ( delta < 0 ) { delta = consumeScroll( root, delta, horizontal, scale ); }
				delta = consumeScroll( stage, delta, horizontal );
				return delta > 0 ? consumeScroll( root, delta, horizontal, scale ) : delta;
			};
			dx = route( dx, true ); dy = route( dy, false );
			return dx !== initialX || dy !== initialY;
		}
		scrollers.set( doc, scroll );
		doc.addEventListener?.( 'wheel', event => { if ( event.cancelable !== false && scroll( event, event.target ) ) { event.preventDefault(); } }, { passive: false } );
		function layout() {
			const padding = window.getComputedStyle( stage );
			const available = Math.max( 1, stage.clientWidth - parseFloat( padding.paddingLeft || 0 ) - parseFloat( padding.paddingRight || 0 ) );
			const height = Math.max( 240, stage.clientHeight - parseFloat( padding.paddingTop || 0 ) - parseFloat( padding.paddingBottom || 0 ) );
			const fitScale = Math.min( 1, available / width ); scale = zoom === 'fit' ? fitScale : Number( zoom ) / 100;
			// Zoom scales both axes of the same viewport. Cancelling scale out of
			// its height makes an enlarged canvas impossible to pan vertically.
			const viewportHeight = Math.round( height / fitScale );
			// Canvas hints stay screen-sized; authored content still uses the real viewport/zoom.
			doc.documentElement.style.setProperty( '--lv-canvas-ui-scale', String( 1 / scale ) );
			host.style.width = width * scale + 'px'; host.style.height = ( zoom === 'fit' ? height : viewportHeight * scale ) + 'px';
			frame.style.width = width + 'px'; frame.style.height = viewportHeight + 'px';
			frame.style.transform = 'scale(' + scale + ')';
			if ( zoomSelect ) { const fitOption = zoomSelect.querySelector( '[value="fit"]' ); if ( fitOption ) { fitOption.textContent = 'Fit · ' + Math.max( 1, Math.round( fitScale * 100 ) ) + '%'; } zoomSelect.value = zoom; }
			frame.dataset.zoomMode = zoom; frame.dataset.viewportWidth = String( width ); frame.dataset.previewScale = String( scale ); zoomListeners.forEach( listener => listener() ); onResize();
		}
		function setZoom( next ) {
			if ( next !== 'fit' && ( typeof next !== 'string' && typeof next !== 'number' || ! /^\d+(?:\.\d+)?$/.test( String( next ) ) || ! Number.isFinite( Number( next ) ) || Number( next ) < 10 || Number( next ) > 200 ) ) { return false; }
			zoom = next === 'fit' ? 'fit' : String( Number( next ) ); layout(); return true;
		}
		function reveal() {
			if ( revealed || ! stylesReady || ! contentReady ) { return; }
			// A single first paint: final scale, styled document and enhanced zoom.
			layout(); revealed = true; frame.classList.add( 'is-ready' );
			stage.removeAttribute( 'data-viewport-pending' ); stage.setAttribute( 'aria-busy', 'false' );
			zoomSelect?.closest( '.lieve-editor-zoom-control' )?.removeAttribute( 'data-viewport-pending' );
			onReady();
		}
		zoomSelect?.addEventListener( 'change', () => { if ( ! setZoom( zoomSelect.value ) ) { zoomSelect.value = zoom; } } );
		const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver( layout ) : null;
		observer?.observe( stage ); window.addEventListener( 'resize', layout );
		layout();
		return {
			canvas, document: doc, frame, stage,
			refresh: layout,
			markContentReady() { contentReady = true; reveal(); },
			onReturn( listener ) { returnListeners.add( listener ); },
			setZoom, onZoomChange( listener ) { zoomListeners.add( listener ); },
			resize( next ) { if ( Number.isInteger( next ) && next >= 240 && next <= 7680 ) { width = next; layout(); } },
			toParent( rect ) {
				const origin = frame.getBoundingClientRect();
				const left = origin.left + rect.left * scale; const top = origin.top + rect.top * scale;
				const width = rect.width * scale; const height = rect.height * scale;
				return { left, top, width, height, right: left + width, bottom: top + height };
			},
			point( x, y ) { const origin = frame.getBoundingClientRect(); return { x: origin.left + x * scale, y: origin.top + y * scale }; },
			bounds() {
				const rect = frame.getBoundingClientRect(); const clip = stage.getBoundingClientRect();
				const left = Math.max( rect.left, clip.left ), top = Math.max( rect.top, clip.top );
				const right = Math.max( left, Math.min( rect.right, clip.right ) ), bottom = Math.max( top, Math.min( rect.bottom, clip.bottom ) );
				return { left, top, right, bottom, width: right - left, height: bottom - top };
			},
		};
	}
	window.LieveViewport = { create, loadedCss, scrollFrom( owner, input, target ) { return scrollers.get( owner )?.( input, target ) || false; } };
}() );
