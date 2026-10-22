/* A real, same-origin viewport. Authored markup cannot execute scripts here. */
( function () {
	'use strict';
	const scrollers = new WeakMap();
	const inputOwners = new WeakMap(); // Weak frame lease; values never retain DOM/controllers.
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
	/* Explicit CSS proof for a trusted caller's configured sources.
	 * Only a trusted adapter supplies this immutable URL allowlist, never canvas HTML.
	 * HTTP proof + isolated sandbox parsing precede child application; inline CSS is
	 * inspected in the sandbox only. No child load/error callback is involved. */
	function createCssReadiness( { document: target, styles = [], timeoutMs = 8000 } ) {
		let doc = target, authorized = Object.freeze( [ ...styles ] ), active = null, destroyed = false, generation = 0;
		target = null; styles = null; // The service's document reference is explicitly released by destroy.
		const baseUrl = document.baseURI || window.location.href;
		const timeout = Number.isFinite( timeoutMs ) && timeoutMs > 0 && timeoutMs <= 20000 ? timeoutMs : 8000;
		let startAnchor = null, endAnchor = null, applied = [], last = { state: 'idle', generation: 0, checks: 0, framesActive: 0, listeners: 0, pending: 0, resources: [] };
		const proofs = new Map(); // Instance-local, HTTP-fresh text only; never DOM/sheet references.
		const error = ( code, index = null, httpStatus = null ) => Object.assign( new Error( 'Canvas CSS verification failed (' + code + ').' ), { name: 'CanvasCssError', code, index, httpStatus } );
		function urlFor( value ) {
			try {
				const url = new URL( value, baseUrl ), base = new URL( baseUrl );
				if ( typeof value !== 'string' || ! value.trim() || ! /^https?:$/.test( url.protocol ) || url.origin !== base.origin || url.username || url.password || url.hash ) { throw error( 'URL_NOT_AUTHORIZED' ); }
				return url.href;
			} catch ( failure ) { throw error( 'URL_NOT_AUTHORIZED' ); }
		}
		// A deliberately conservative lexical gate, not a substitute CSS parser.
		// Reject imports (including escaped at-keywords), unterminated constructs and
		// escapes outside strings; unsupported syntax must not trigger hidden imports.
		function validateText( css, index ) {
			let plain = '', quote = '', comment = false; const stack = [];
			for ( let i = 0; i < css.length; i++ ) {
				const c = css[ i ], next = css[ i + 1 ];
				if ( comment ) { if ( c === '*' && next === '/' ) { comment = false; i++; } continue; }
				if ( quote ) { if ( c === '\\' ) { i++; } else if ( c === quote ) { quote = ''; } continue; }
				if ( c === '/' && next === '*' ) { comment = true; i++; continue; }
				if ( c === '"' || c === "'" ) { quote = c; plain += ' '; continue; }
				if ( c === '\\' ) { throw error( 'DEPENDENCY_UNVERIFIABLE', index ); }
				plain += c;
				if ( '{[('.includes( c ) ) { stack.push( c ); }
				if ( '}])'.includes( c ) && stack.pop() !== { '}': '{', ']': '[', ')': '(' }[ c ] ) { throw error( 'CSS_PARSE_ERROR', index ); }
			}
			if ( comment || quote || stack.length ) { throw error( 'CSS_PARSE_ERROR', index ); }
			if ( /@import\b/i.test( plain ) ) { throw error( 'IMPORT_UNVERIFIABLE', index ); }
			return plain.trim();
		}
		function rulesOf( sheet, index ) {
			try {
				if ( ! sheet ) { throw error( 'CSSOM_UNAVAILABLE', index ); }
				const rules = Array.from( sheet.cssRules );
				if ( rules.some( rule => rule.type === 3 ) ) { throw error( 'IMPORT_UNVERIFIABLE', index ); }
				return rules.map( rule => rule.cssText ).join( '\n' );
			} catch ( failure ) { if ( failure.name === 'CanvasCssError' ) { throw failure; } throw error( 'CSSOM_INACCESSIBLE', index ); }
		}
		function removeApplied() { applied.splice( 0 ).forEach( node => node.remove() ); }
		function snapshot() { return JSON.parse( JSON.stringify( { ...last, ownedNodes: applied.length + ( startAnchor ? 2 : 0 ) } ) ); }
		function currentCanvas() {
			const frame = doc?.defaultView?.frameElement;
			return Boolean( doc?.head && doc.body && doc !== document && frame?.isConnected && frame.ownerDocument === document && frame.contentDocument === doc && frame.getAttribute( 'sandbox' ) === 'allow-same-origin allow-popups allow-popups-to-escape-sandbox' );
		}
		function prepare( { styles: requested = authorized, inlineCss = '', signal } = {} ) {
			if ( destroyed ) { return Promise.reject( error( 'VIEWPORT_DESTROYED' ) ); }
			active?.cancel( 'PREPARATION_OBSOLETE' );
			removeApplied();
			const op = { generation: ++generation, frame: 0, timer: null, settled: false, controllers: [], resources: [], probes: [], cleanups: [], started: performance.now() };
			last = { state: 'preparing', phase: 'source', generation, checks: 0, framesActive: 0, listeners: 0, pending: 0, fetches: 0, cacheHits: 0, parentReused: 0, snapshots: 0, canvasLinks: 0, durationMs: 0, resources: op.resources };
			return new Promise( ( resolve, reject ) => {
				function finish( failure ) {
					if ( op.settled ) { return; } op.settled = true;
					window.clearTimeout( op.timer ); window.cancelAnimationFrame( op.frame );
					op.controllers.forEach( controller => controller.abort() ); op.controllers.length = 0;
					for ( const cleanup of [ ...op.cleanups.splice( 0 ), ...op.probes.splice( 0 ) ] ) {
						try { cleanup(); } catch ( cleanupError ) { failure ||= error( 'CSSOM_INACCESSIBLE' ); }
					}
					last.framesActive = last.listeners = last.pending = 0; last.durationMs = performance.now() - op.started;
					last.state = failure ? 'failed' : 'ready'; last.error = failure?.code || null; last.errorIndex = failure?.index ?? null;
					if ( failure ) { removeApplied(); } active = null;
					if ( failure ) { failure.phase = last.phase; reject( failure ); } else { resolve( Object.freeze( { status: 'ready', generation: op.generation, metrics: snapshot() } ) ); }
				}
				op.cancel = code => finish( error( code ) ); active = op;
				op.timer = window.setTimeout( () => finish( error( last.phase === 'application' ? 'CSS_NOT_APPLIED' : 'CSS_TIMEOUT', last.waitingFor ?? null ) ), timeout );
				const live = () => ! op.settled && ! destroyed && active === op;
				try {
					if ( ! currentCanvas() ) { throw error( 'CANVAS_UNAVAILABLE' ); }
					const allowed = authorized.map( urlFor ); let previous = -1;
					const urls = Array.from( requested, ( original, index ) => {
						const href = urlFor( original ), position = allowed.indexOf( href, previous + 1 );
						if ( position < 0 ) { throw error( 'URL_NOT_AUTHORIZED', index ); } previous = position;
						return { original, href, index };
					} );
					if ( typeof inlineCss !== 'string' ) { throw error( 'CSS_PARSE_ERROR' ); }
					validateText( inlineCss, urls.length );
					if ( signal?.aborted ) { throw error( 'OPERATION_ABORTED' ); }
					if ( signal ) { const abort = () => op.cancel( 'OPERATION_ABORTED' ); signal.addEventListener( 'abort', abort, { once: true } ); last.listeners++; op.cleanups.push( () => signal.removeEventListener( 'abort', abort ) ); }
					const violation = event => {
						if ( ! live() || ! /^(connect-src|style-src)/.test( event.effectiveDirective || '' ) ) { return; }
						if ( urls.some( item => item.href === event.blockedURI ) ) { finish( error( 'CSP_INCOMPATIBLE' ) ); }
					};
					document.addEventListener( 'securitypolicyviolation', violation ); last.listeners++;
					op.cleanups.push( () => document.removeEventListener( 'securitypolicyviolation', violation ) );
					if ( ! startAnchor ) { startAnchor = doc.createComment( 'lieve-css-start' ); endAnchor = doc.createComment( 'lieve-css-end' ); doc.head.appendChild( startAnchor ); doc.head.appendChild( endAnchor ); }
					const insert = node => { doc.head.insertBefore( node, endAnchor ); applied.push( node ); return node; };
					const records = urls.map( item => ( { ...item, node: insert( doc.createElement( 'style' ) ), expected: null, loaded: false } ) );
					let inline = null;
					if ( inlineCss ) { inline = insert( doc.createElement( 'style' ) ); inline.textContent = inlineCss; }
					const fetched = new Map();
					async function source( item ) {
						const cached = proofs.get( item.href );
						if ( cached && cached.expires > Date.now() ) { last.cacheHits++; return cached; }
						proofs.delete( item.href );
						const controller = new AbortController(); op.controllers.push( controller ); last.fetches++; last.pending++;
						let response;
						try { response = await window.fetch( item.href, { signal: controller.signal, credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'default' } ); }
						catch ( failure ) { throw error( 'RESOURCE_BLOCKED', item.index ); }
						if ( ! live() ) { return null; }
						if ( ! response.ok ) { throw error( 'HTTP_ERROR', item.index, response.status ); }
						if ( ! /^text\/css(?:\s*;|$)/i.test( response.headers.get( 'content-type' ) || '' ) ) { throw error( 'CSS_MIME_ERROR', item.index ); }
						const text = await response.text(); if ( ! live() ) { return null; }
						const meaningful = validateText( text, item.index );
						// Native parsing in the target realm, isolated from authored content.
						// Constructed sheets/cssText roundtrips lose some WebKit shorthands.
						const host = doc.createElement( 'div' ); host.hidden = true;
						const parser = doc.createElement( 'style' ); parser.textContent = text;
						let css;
						try {
							doc.body.appendChild( host ); host.attachShadow( { mode: 'closed' } ).appendChild( parser );
							if ( ! parser.sheet ) { throw error( 'CSP_INCOMPATIBLE', item.index ); }
							css = rulesOf( parser.sheet, item.index );
						} finally { host.remove(); }
						if ( meaningful && ! css ) { throw error( 'CSS_PARSE_ERROR', item.index ); }
						// Exact URL, exact parsed content: a stale/empty parent sheet is never proof.
						for ( const sheet of Array.from( document.styleSheets || [] ) ) {
							if ( sheet.href !== item.href || sheet.disabled ) { continue; }
							try { if ( rulesOf( sheet, item.index ) === css ) { last.parentReused++; css = rulesOf( sheet, item.index ); break; } } catch ( failure ) { /* Target-realm parse remains authoritative. */ }
						}
						last.pending--;
						const control = response.headers.get( 'cache-control' ) || '', age = Number( response.headers.get( 'age' ) || 0 );
						const maxAge = /(?:^|,)\s*max-age\s*=\s*"?(\d+)/i.exec( control );
						const date = Date.parse( response.headers.get( 'date' ) || '' ), lifetime = Number( maxAge?.[ 1 ] );
						const apparentAge = Number.isFinite( date ) ? Math.max( 0, ( Date.now() - date ) / 1000 ) : Infinity;
						const freshMs = ! /(?:no-store|no-cache|must-revalidate)/i.test( control ) && Number.isFinite( lifetime ) && Number.isFinite( age ) && age >= 0 && response.headers.get( 'vary' ) !== '*' ? Math.max( 0, lifetime - Math.max( age, apparentAge ) ) * 1000 : 0;
						const proof = { css, text, expires: Date.now() + freshMs, linked: /\burl\s*\(|(?:-webkit-)?image-set\s*\(|@font-face\b/i.test( css ) };
						if ( freshMs > 0 ) { proofs.set( item.href, proof ); } return proof;
					}
					const work = records.map( async record => {
						if ( ! fetched.has( record.href ) ) { fetched.set( record.href, source( record ) ); }
						const proof = await fetched.get( record.href ); if ( ! live() || ! proof ) { return; }
						record.expected = proof.css; record.loaded = true;
						if ( proof.linked ) {
							const link = doc.createElement( 'link' ); link.rel = 'stylesheet'; link.href = record.href;
							record.node.replaceWith( link ); applied[ applied.indexOf( record.node ) ] = link; record.node = link; last.canvasLinks++;
						} else { record.node.textContent = proof.text; record.node.dataset.lieveCssSource = record.href; last.snapshots++; }
						op.resources.push( { index: record.index, original: record.original, href: record.href, mode: proof.linked ? 'link' : 'snapshot', status: 'loaded' } );
					} );
					Promise.all( work ).then( () => { if ( live() ) { last.phase = 'canvas'; schedule(); } }, failure => { if ( live() ) { finish( failure.name === 'CanvasCssError' ? failure : error( 'RESOURCE_BLOCKED' ) ); } } );
					function schedule() { last.framesActive = 1; op.frame = window.requestAnimationFrame( inspect ); }
					function inspect() {
						op.frame = 0; last.framesActive = 0; if ( ! live() ) { return; } last.checks++;
						try {
							if ( ! currentCanvas() ) { throw error( 'CANVAS_UNAVAILABLE' ); }
							if ( op.witnesses ) {
								for ( const witness of op.witnesses ) {
									last.waitingFor = witness.index;
									if ( witness.node.sheet !== witness.sheet || witness.sheet.disabled ) { throw error( 'CSS_NOT_APPLIED', witness.index ); }
									if ( ! Array.from( doc.styleSheets ).includes( witness.sheet ) ) { schedule(); return; }
									if ( doc.defaultView.getComputedStyle( witness.probe ).getPropertyValue( witness.key ).trim() !== 'verified' ) { schedule(); return; }
								}
								op.probes.forEach( cleanup => cleanup() ); op.probes.length = 0;
								for ( const record of records ) { if ( rulesOf( record.node.sheet, record.index ) !== record.expected ) { throw error( 'CSS_NOT_APPLIED', record.index ); } }
								op.resources.sort( ( a, b ) => a.index - b.index ).forEach( record => { record.status = 'applied'; } ); finish(); return;
							}
							for ( const record of records ) {
								last.waitingFor = record.index;
								if ( ! record.node.sheet ) { if ( record.node.tagName === 'STYLE' ) { throw error( 'CSP_INCOMPATIBLE', record.index ); } schedule(); return; }
								if ( record.node.sheet.disabled ) { throw error( 'CSS_NOT_APPLIED', record.index ); }
								if ( ! Array.from( doc.styleSheets ).includes( record.node.sheet ) ) { schedule(); return; }
								if ( rulesOf( record.node.sheet, record.index ) !== record.expected ) { schedule(); return; }
							}
							if ( inline ) {
								if ( ! inline.sheet ) { throw error( 'CSP_INCOMPATIBLE', records.length ); }
								if ( validateText( inlineCss, records.length ) && ! rulesOf( inline.sheet, records.length ) ) { throw error( 'CSS_PARSE_ERROR', records.length ); }
							}
							// A temporary, unguessable witness survives one parent animation frame:
							// parsed CSSOM and applied styles can become observable at different times.
							// It is removed on every success/error/cancel, never kept in authored DOM.
							op.witnesses = []; last.phase = 'application';
							for ( const [ index, node ] of [ ...records.map( record => record.node ), ...( inline ? [ inline ] : [] ) ].entries() ) {
								const nonce = () => Array.from( window.crypto.getRandomValues( new Uint32Array( 4 ) ), value => value.toString( 16 ).padStart( 8, '0' ) ).join( '' );
								const probe = doc.createElement( 'span' ), key = '--lv-proof-' + nonce();
								const sheet = node.sheet, ruleIndex = sheet.cssRules.length;
								probe.id = 'lv-css-' + nonce(); probe.hidden = true; doc.body.appendChild( probe );
								let rule = null;
								const cleanup = () => { try { const at = rule ? Array.from( sheet.cssRules ).indexOf( rule ) : -1; if ( at >= 0 ) { sheet.deleteRule( at ); } } finally { rule = null; probe.remove(); } };
								op.probes.push( cleanup );
								sheet.insertRule( '#' + probe.id + ' { ' + key + ': verified !important; }', ruleIndex ); rule = sheet.cssRules[ ruleIndex ];
								op.witnesses.push( { probe, key, sheet, node, index } );
							}
							schedule();
						} catch ( failure ) { finish( failure.name === 'CanvasCssError' ? failure : error( 'CSSOM_INACCESSIBLE' ) ); }
					}
				} catch ( failure ) { finish( failure.name === 'CanvasCssError' ? failure : error( 'CANVAS_UNAVAILABLE' ) ); }
			} );
		}
		return Object.freeze( {
			prepare, stats: snapshot,
			destroy() {
				if ( destroyed ) { return; } destroyed = true; active?.cancel( 'VIEWPORT_DESTROYED' ); removeApplied();
				startAnchor?.remove(); endAnchor?.remove(); startAnchor = endAnchor = doc = null; authorized = Object.freeze( [] );
				proofs.clear();
				last = { ...last, state: 'destroyed', framesActive: 0, listeners: 0, pending: 0, resources: [] };
			},
		} );
	}
	function create( { canvas, app, styles = [], styleTexts = {}, inlineCss = '', verifiedCss = false, initialWidth = 1279, onResize = () => {}, onReady = () => {}, onError = () => {} } ) {
		const stage = canvas.closest( '.lieve-stage-scroll' );
		const zoomSelect = app.querySelector( '[data-editor-zoom]' ); const zoomListeners = new Set();
		let stylesReady = false; let contentReady = false; let revealed = false;
		let destroyed = false, suspended = false, generation = 0, cssService = null, cssAbort = null, failureCode = null;
		const listeners = [], returnTimers = new Set();
		const listen = ( target, type, callback, options ) => { if ( target?.addEventListener ) { target.addEventListener( type, callback, options ); listeners.push( () => target.removeEventListener( type, callback, options ) ); } };
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
			if ( destroyed || suspended ) { return; }
			doc.body.dataset.colorMode = app.dataset.colorMode || 'light';
			const chrome = window.getComputedStyle( app );
			for ( const key of [ '--lv-teal', '--lv-violet', '--lv-gradient' ] ) { const value = chrome.getPropertyValue?.( key ); if ( value ) { doc.body.style.setProperty( key, value ); } }
		};
		syncAppearance();
		const appearance = typeof MutationObserver !== 'undefined' ? new MutationObserver( syncAppearance ) : null;
		appearance?.observe( app, { attributes: true, attributeFilter: [ 'data-color-mode' ] } );
		// The ordinary builder opts into source/parse/application proof. Legacy callers
		// retain their old barrier; the experimental fixture owns its separate proof.
		const loaded = ( verifiedCss ? [] : styles ).map( url => {
			const css = Object.prototype.hasOwnProperty.call( styleTexts, url ) ? styleTexts[ url ] : loadedCss( url );
			if ( typeof css === 'string' && canInlineCss( css ) ) { const inline = doc.createElement( 'style' ); inline.textContent = css; doc.head.appendChild( inline ); return null; }
			return new Promise( resolve => {
			const link = doc.createElement( 'link' ); link.rel = 'stylesheet'; link.href = url;
			link.onload = resolve; link.onerror = resolve; doc.head.appendChild( link );
			} );
		} ).filter( Boolean );
		if ( ! verifiedCss && inlineCss ) { const inline = doc.createElement( 'style' ); inline.textContent = inlineCss; doc.head.appendChild( inline ); }
		if ( loaded.length ) { Promise.all( loaded ).then( () => { if ( ! destroyed ) { stylesReady = true; reveal(); } } ); }
		else { stylesReady = ! verifiedCss; }
		// Moving focus between the inspector and the frame is not returning to
		// the editor. Refresh global settings only after a real window/tab absence.
		const returnListeners = new Set(); let wasAway = false;
		const away = () => { let timer; timer = window.setTimeout( () => { returnTimers.delete( timer ); if ( ! destroyed && ( document.visibilityState === 'hidden' || ! document.hasFocus() ) ) { wasAway = true; } }, 0 ); if ( timer != null ) { returnTimers.add( timer ); } };
		const returned = () => { if ( ! destroyed && ! suspended && wasAway && document.visibilityState !== 'hidden' && document.hasFocus() ) { wasAway = false; returnListeners.forEach( listener => listener() ); } };
		listen( window, 'blur', away ); listen( window, 'focus', returned );
		listen( frame.contentWindow, 'blur', away ); listen( frame.contentWindow, 'focus', returned );
		listen( document, 'visibilitychange', () => { if ( document.visibilityState === 'hidden' ) { wasAway = true; } else { returned(); } } );
		let width = Number.isInteger( initialWidth ) && initialWidth >= 240 && initialWidth <= 7680 ? initialWidth : 1279; let scale = 1; let zoom = 'fit';
		function scroll( input, target = canvas ) {
			if ( destroyed || suspended || ! input || input.defaultPrevented || input.ctrlKey || input.metaKey ) { return false; }
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
		listen( doc, 'wheel', event => { if ( event.cancelable !== false && scroll( event, event.target ) ) { event.preventDefault(); } }, { passive: false } );
		function layout() {
			if ( destroyed || suspended ) { return; }
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
			if ( destroyed || suspended ) { return false; }
			if ( next !== 'fit' && ( typeof next !== 'string' && typeof next !== 'number' || ! /^\d+(?:\.\d+)?$/.test( String( next ) ) || ! Number.isFinite( Number( next ) ) || Number( next ) < 10 || Number( next ) > 200 ) ) { return false; }
			zoom = next === 'fit' ? 'fit' : String( Number( next ) ); layout(); return true;
		}
		function reveal() {
			if ( destroyed || suspended || failureCode || revealed || ! stylesReady || ! contentReady ) { return; }
			// A single first paint: final scale, styled document and enhanced zoom.
			layout(); revealed = true; frame.classList.add( 'is-ready' );
			stage.removeAttribute( 'data-viewport-pending' ); stage.setAttribute( 'aria-busy', 'false' );
			zoomSelect?.closest( '.lieve-editor-zoom-control' )?.removeAttribute( 'data-viewport-pending' );
			onReady();
		}
		listen( zoomSelect, 'change', () => { if ( ! setZoom( zoomSelect.value ) ) { zoomSelect.value = zoom; } } );
		const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver( layout ) : null;
		observer?.observe( stage ); listen( window, 'resize', layout );
		function current() {
			try { return frame.isConnected && host.isConnected && stage.isConnected && stage.contains( host ) && frame.parentElement === host && frame.contentDocument === doc && doc.body.contains( canvas ) && canvas.ownerDocument === doc && frame.getAttribute( 'sandbox' ) === 'allow-same-origin allow-popups allow-popups-to-escape-sandbox'; }
			catch ( failure ) { return false; }
		}
		function fail( failure ) {
			if ( destroyed || failureCode ) { return; }
			failureCode = failure?.code || 'CANVAS_UNAVAILABLE'; generation++; cssAbort?.abort();
			stylesReady = false; frame.classList.remove( 'is-ready' );
			// A detached old viewport must not hide a replacement that owns the stage.
			if ( frame.parentElement === host && stage.contains( host ) ) { stage.setAttribute( 'data-viewport-pending', '' ); stage.setAttribute( 'aria-busy', 'true' ); }
			try { onError( Object.freeze( { code: failureCode } ) ); } catch ( ignored ) { /* A diagnostic callback cannot defeat containment/cleanup. */ }
		}
		function prepareCss() {
			const epoch = ++generation;
			cssAbort?.abort(); cssAbort = new AbortController();
			try {
				if ( ! current() ) { throw { code: 'CANVAS_UNAVAILABLE' }; }
				cssService ||= createCssReadiness( { document: doc, styles } );
				cssService.prepare( { inlineCss, signal: cssAbort.signal } ).then( () => {
					if ( destroyed || suspended || epoch !== generation ) { return; }
					if ( ! current() ) { fail( { code: 'CANVAS_UNAVAILABLE' } ); return; }
					stylesReady = true; reveal();
				}, failure => { if ( ! destroyed && ! suspended && epoch === generation ) { fail( failure ); } } );
			} catch ( failure ) { fail( failure ); }
		}
		function destroy() {
			if ( destroyed ) { return; } destroyed = true; generation++;
			cssAbort?.abort(); cssAbort = null; cssService?.destroy();
			listeners.splice( 0 ).forEach( remove => remove() ); returnTimers.forEach( timer => window.clearTimeout( timer ) ); returnTimers.clear();
			observer?.disconnect(); appearance?.disconnect(); ownership?.disconnect(); scrollers.delete( doc );
			returnListeners.clear(); zoomListeners.clear(); onReady = onError = onResize = () => {};
		}
		// Only the verified ordinary path owns this coordination. An outer iframe
		// event is a currentness check, never CSS readiness or permission to execute.
		const ownership = verifiedCss && typeof MutationObserver !== 'undefined' ? new MutationObserver( () => { if ( ! current() ) { fail( { code: 'CANVAS_UNAVAILABLE' } ); destroy(); } } ) : null;
		if ( verifiedCss ) {
			ownership?.observe( stage, { childList: true, subtree: true, attributes: true, attributeFilter: [ 'sandbox' ] } );
			if ( stage.parentElement ) { ownership?.observe( stage.parentElement, { childList: true } ); }
			listen( frame, 'load', () => { if ( ! current() ) { fail( { code: 'CANVAS_UNAVAILABLE' } ); destroy(); } } );
			listen( window, 'pagehide', event => {
				if ( ! event.persisted ) { destroy(); return; }
				suspended = true; generation++; if ( ! stylesReady ) { cssAbort?.abort(); }
				returnTimers.forEach( timer => window.clearTimeout( timer ) ); returnTimers.clear();
			} );
			listen( window, 'pageshow', event => {
				if ( ! event.persisted || ! suspended || destroyed ) { return; }
				suspended = false;
				if ( ! current() ) { fail( { code: 'CANVAS_UNAVAILABLE' } ); destroy(); return; }
				syncAppearance();
				if ( ! failureCode && ! stylesReady ) { prepareCss(); } else { layout(); reveal(); }
			} );
			prepareCss();
		}
		layout();
		return {
			canvas, document: doc, frame, stage,
			destroy,
			readiness() { return { verifiedCss, destroyed, suspended, generation, stylesReady, contentReady, revealed, error: failureCode, listeners: listeners.length, observers: destroyed ? 0 : Number( Boolean( observer ) ) + Number( Boolean( appearance ) ) + Number( Boolean( ownership ) ), timers: returnTimers.size, css: cssService?.stats() || null }; },
			refresh: layout,
			markContentReady() { if ( ! destroyed ) { contentReady = true; reveal(); } },
			onReturn( listener ) { if ( ! destroyed ) { returnListeners.add( listener ); } },
			setZoom, onZoomChange( listener ) { if ( ! destroyed ) { zoomListeners.add( listener ); } },
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
	/* Inactive until explicitly mounted by a trusted caller. No CSS/startup ownership. */
	function createInputAdapter( { viewport, controller, onOutline = () => {}, onError = () => {}, drag = null } ) {
		let frame = viewport?.frame, doc = viewport?.document, canvas = viewport?.canvas;
		let stage = viewport?.stage, host = frame?.parentElement, surface = null, state = 'created';
		let outlineFrame = 0, epoch = 0, resumeAfterPageShow = false;
		const lease = Object.freeze( {} ), inputListeners = [], lifecycleListeners = [];
		const diagnostics = { hitCount: 0, selections: 0, scrollCalls: 0, handledScrolls: 0, pointermoveWork: 0, hits: [], events: [], errors: [] };
		const error = code => Object.assign( new Error( 'Canvas input unavailable (' + code + ').' ), { name: 'CanvasInputError', code } );
		const sample = ( key, value ) => { if ( diagnostics[ key ].length < 2000 ) { diagnostics[ key ].push( value ); } };
		function validViewport() {
			try {
				return Boolean( frame?.tagName === 'IFRAME' && frame.ownerDocument === document && frame.isConnected && host?.isConnected && stage?.isConnected &&
					frame.parentElement === host && stage.contains( host ) && frame.contentDocument === doc && doc.defaultView?.frameElement === frame &&
					canvas?.ownerDocument === doc && canvas.isConnected && doc.body.contains( canvas ) && viewport.frame === frame && viewport.document === doc && viewport.canvas === canvas && viewport.stage === stage &&
					frame.getAttribute( 'sandbox' ) === 'allow-same-origin allow-popups allow-popups-to-escape-sandbox' );
			} catch ( failure ) { return false; }
		}
		if ( ! validViewport() || typeof viewport.bounds !== 'function' || typeof controller?.canvasIdentity !== 'function' || typeof controller?.selectElement !== 'function' ) { throw error( 'INVALID_VIEWPORT' ); }
		function report( code ) {
			sample( 'errors', { code } );
			try { onError?.( error( code ) ); } catch ( failure ) { /* Diagnostic consumers cannot prevent cleanup. */ }
		}
		function listen( list, target, type, handler, options ) {
			target.addEventListener( type, handler, options ); list.push( () => target.removeEventListener( type, handler, options ) );
		}
		function clear( list ) { list.splice( 0 ).forEach( remove => remove() ); }
		function queueOutline() {
			if ( outlineFrame || state !== 'mounted' ) { return; }
			const generation = epoch;
			outlineFrame = window.requestAnimationFrame( () => {
				if ( state !== 'mounted' || epoch !== generation ) { return; }
				outlineFrame = 0; if ( ! validViewport() ) { return; }
				try { onOutline(); } catch ( failure ) { suspend(); report( 'OUTLINE_FAILED' ); }
			} );
		}
		function geometry( clientX, clientY ) {
			if ( ! Number.isFinite( clientX ) || ! Number.isFinite( clientY ) || ! validViewport() ) { return null; }
			// The bounding-box inverse is valid only for positive axis-aligned 2D
			// transforms. Check ancestors too, including individual CSS transforms.
			for ( let node = frame; node; node = node.parentElement ) {
				const css = window.getComputedStyle( node ), matrix = new window.DOMMatrixReadOnly( css.transform === 'none' ? undefined : css.transform );
				if ( ! matrix.is2D || matrix.b || matrix.c || ! Number.isFinite( matrix.a ) || ! Number.isFinite( matrix.d ) || matrix.a <= 0 || matrix.d <= 0 ||
					css.perspective && css.perspective !== 'none' || css.transformStyle === 'preserve-3d' || css.rotate && css.rotate !== 'none' && css.rotate !== '0deg' ) { return null; }
				if ( css.scale && css.scale !== 'none' ) { const scale = css.scale.split( /\s+/ ).map( Number ); if ( scale.length > 2 || scale.some( value => ! Number.isFinite( value ) || value <= 0 ) ) { return null; } }
				if ( css.translate && css.translate !== 'none' && css.translate.split( /\s+/ ).length > 2 ) { return null; }
				if ( node === frame && [ 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom' ].some( key => parseFloat( css[ key ] || 0 ) !== 0 ) ) { return null; }
			}
			const rect = frame.getBoundingClientRect(), bounds = viewport.bounds();
			if ( ! [ rect.left, rect.top, rect.width, rect.height, frame.offsetWidth, frame.offsetHeight, bounds.left, bounds.top, bounds.right, bounds.bottom ].every( Number.isFinite ) || rect.width <= 0 || rect.height <= 0 || frame.offsetWidth <= 0 || frame.offsetHeight <= 0 ) { return null; }
			const right = Math.min( bounds.right, document.documentElement.clientWidth || window.innerWidth ), bottom = Math.min( bounds.bottom, document.documentElement.clientHeight || window.innerHeight );
			if ( clientX < Math.max( 0, bounds.left ) || clientX >= right || clientY < Math.max( 0, bounds.top ) || clientY >= bottom ) { return null; }
			const parentHit = document.elementFromPoint( clientX, clientY );
			if ( parentHit !== surface && ! surface?.contains( parentHit ) ) { return null; }
			const x = ( clientX - rect.left ) / ( rect.width / frame.offsetWidth ) - frame.clientLeft;
			const y = ( clientY - rect.top ) / ( rect.height / frame.offsetHeight ) - frame.clientTop;
			return x >= 0 && y >= 0 && x < frame.clientWidth && y < frame.clientHeight ? { x, y } : null;
		}
		function resolveAt( clientX, clientY ) {
			const started = performance.now(); diagnostics.hitCount++;
			const none = ( status, reason ) => Object.freeze( { status, reason, identity: null, element: null } );
			if ( state === 'destroyed' ) { return none( 'destroyed', 'adapter-destroyed' ); }
			if ( state !== 'mounted' ) { return none( 'unmanaged', 'adapter-inactive' ); }
			if ( ! validViewport() ) { return none( 'stale', 'viewport-replaced' ); }
			try {
				const point = geometry( clientX, clientY ), geometryMs = performance.now() - started;
				if ( ! point ) { return none( 'unmanaged', 'geometry-uninterpretable' ); }
				const element = doc.elementsFromPoint( point.x, point.y )[ 0 ], paintedAt = performance.now();
				if ( ! element || /^(IFRAME|OBJECT|EMBED)$/.test( element.nodeName ) || ! canvas.contains( element ) ) { return none( 'unmanaged', 'outside-or-browsing-context' ); }
				const resolved = controller.canvasIdentity().resolve( element ), identityMs = performance.now() - paintedAt;
				const result = Object.freeze( { status: resolved.status, reason: resolved.reason, identity: resolved, element, ...point } );
				sample( 'hits', { geometryMs, paintMs: paintedAt - started - geometryMs, identityMs, totalMs: performance.now() - started, status: resolved.status } ); return result;
			} catch ( failure ) { report( 'TARGET_UNAVAILABLE' ); return none( 'unmanaged', 'target-unavailable' ); }
		}
		function selectable( hit ) {
			return hit.status === 'canvas' || [ 'resolved', 'opaque' ].includes( hit.status ) && typeof hit.identity?.identity?.selectId === 'string' && hit.identity.identity.selectId.length > 0;
		}
		function hitTest( x, y ) { const hit = resolveAt( x, y ); return selectable( hit ) ? { ...hit, id: hit.status === 'canvas' ? null : hit.identity.identity.selectId } : null; }
		function pointerDown( event ) {
			if ( state !== 'mounted' || ! event.isTrusted || event.defaultPrevented || event.cancelable === false || event.button !== 0 || ! event.isPrimary || event.pointerType !== 'mouse' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ) { return; }
			const started = performance.now(), hit = hitTest( event.clientX, event.clientY ); if ( ! hit ) { return; }
			try {
				event.preventDefault(); surface.focus( { preventScroll: true } );
				const before = performance.now(); controller.selectElement( hit.id ); const controllerMs = performance.now() - before;
				drag?.pointerDown( event, hit );
				queueOutline(); diagnostics.selections++; sample( 'events', { trusted: true, id: hit.id, startedAt: started, controllerMs, totalMs: performance.now() - started } );
			} catch ( failure ) { suspend(); report( 'SELECTION_FAILED' ); }
		}
		function wheel( event ) {
			if ( state !== 'mounted' || ! event.isTrusted || event.defaultPrevented || event.cancelable === false || event.ctrlKey || event.metaKey || ! [ 0, 1, 2 ].includes( event.deltaMode ) || ! Number.isFinite( event.deltaX ) || ! Number.isFinite( event.deltaY ) ) { return; }
			const hit = resolveAt( event.clientX, event.clientY );
			if ( ! hit.element || [ 'stale', 'destroyed' ].includes( hit.status ) ) { return; }
			try {
				diagnostics.scrollCalls++;
				if ( window.LieveViewport.scrollFrom( doc, event, hit.element ) ) { event.preventDefault(); diagnostics.handledScrolls++; queueOutline(); drag?.invalidate(); }
			} catch ( failure ) { suspend(); report( 'SCROLL_FAILED' ); }
		}
		function pageHide( event ) { if ( event.persisted ) { const wasMounted = state === 'mounted'; suspend(); resumeAfterPageShow = wasMounted; } else { destroy(); } }
		function pageShow( event ) { if ( event.persisted && resumeAfterPageShow ) { resumeAfterPageShow = false; resume(); } }
		function attachInputs() {
			listen( inputListeners, surface, 'pointerdown', pointerDown );
			listen( inputListeners, surface, 'wheel', wheel, { passive: false } );
			listen( inputListeners, surface, 'click', event => { drag?.click( event ); event.preventDefault(); } );
			listen( inputListeners, stage, 'scroll', queueOutline, { passive: true } );
		}
		function mount() {
			if ( state === 'destroyed' || state === 'suspended' ) { return false; }
			if ( ! validViewport() ) { report( 'INVALID_VIEWPORT' ); return false; }
			if ( state === 'mounted' ) { if ( surface?.parentElement === host && inputOwners.get( frame ) === lease ) { return true; } suspend(); report( 'INVALID_SURFACE' ); return false; }
			if ( inputOwners.has( frame ) ) { report( 'DUPLICATE_MOUNT' ); return false; }
			if ( window.getComputedStyle( host ).position === 'static' ) { report( 'INVALID_HOST' ); return false; }
			try {
				surface = document.createElement( 'div' ); surface.dataset.lieveCanvasInput = '';
				surface.setAttribute( 'aria-label', 'Canvas selection surface' ); surface.tabIndex = 0;
				surface.style.cssText = 'position:absolute;inset:0;z-index:10;margin:0;padding:0;border:0;background:transparent;box-sizing:border-box;user-select:none;touch-action:auto;';
				host.appendChild( surface ); inputOwners.set( frame, lease ); state = 'mounted'; epoch++;
				if ( drag && ! drag.mount( surface, resolveAt ) ) { throw error( 'DRAG_MOUNT_FAILED' ); }
				listen( lifecycleListeners, window, 'pagehide', pageHide ); listen( lifecycleListeners, window, 'pageshow', pageShow ); attachInputs(); return true;
			} catch ( failure ) { report( 'MOUNT_FAILED' ); destroy(); return false; }
		}
		function suspend() {
			resumeAfterPageShow = false;
			if ( state !== 'mounted' ) { return false; }
			state = 'suspended'; epoch++; drag?.suspend(); clear( inputListeners ); window.cancelAnimationFrame( outlineFrame ); outlineFrame = 0; return true;
		}
		function resume() {
			if ( state !== 'suspended' ) { return state === 'mounted'; }
			if ( ! validViewport() || surface?.parentElement !== host || inputOwners.get( frame ) !== lease ) { report( 'INVALID_VIEWPORT' ); return false; }
			state = 'mounted'; epoch++;
			try { drag?.resume(); attachInputs(); queueOutline(); return true; }
			catch ( failure ) { suspend(); report( 'RESUME_FAILED' ); return false; }
		}
		function destroy() {
			if ( state === 'destroyed' ) { return; } state = 'destroyed'; epoch++; resumeAfterPageShow = false;
			window.cancelAnimationFrame( outlineFrame ); outlineFrame = 0; drag?.destroy(); drag = null; clear( inputListeners ); clear( lifecycleListeners );
			if ( inputOwners.get( frame ) === lease ) { inputOwners.delete( frame ); }
			surface?.remove(); surface = frame = doc = canvas = stage = host = viewport = controller = onOutline = onError = null;
		}
		return Object.freeze( { mount, resolveAt, hitTest, suspend, resume, destroy,
			stats() { return JSON.parse( JSON.stringify( { ...diagnostics, state, listeners: inputListeners.length + lifecycleListeners.length, inputListeners: inputListeners.length, lifecycleListeners: lifecycleListeners.length, framesActive: outlineFrame ? 1 : 0, surfaces: surface ? 1 : 0 } ) ); },
		} );
	}
	window.LieveViewport = { create, loadedCss, createCssReadiness, createInputAdapter, scrollFrom( owner, input, target ) { return scrollers.get( owner )?.( input, target ) || false; } };
}() );
