/* Lieve Interact: declarative runtime, no eval, no dependency or editor side effects. */
( function ( root, factory ) {
	'use strict';
	if ( typeof module === 'object' && module.exports ) { module.exports = factory; }
	else { root.LieveInteractRuntime = factory( root.document, root ); root.LieveInteractRuntime.start(); }
}( typeof window !== 'undefined' ? window : this, function ( document, win ) {
	'use strict';
	const bound = new Map(), memory = new Map(), hidden = new WeakMap(), popupOpeners = new WeakMap(), animations = new WeakMap(), fallbackOpacity = new WeakMap(), eventChains = new WeakMap();
	// Snapshot a server-owned allowlist, never a path supplied by a document.
	const allowedFunctions = new Set( Object.keys( win.LieveInteractionFunctions || {} ) );
	let observer = null, activeChain = null, started = false; const globalDisposers = [];
	const reduced = () => win.matchMedia?.( '(prefers-reduced-motion: reduce)' ).matches === true;
	const noTarget = new Set( [ 'navigate', 'set-color-mode', 'storage-set', 'storage-remove', 'storage-increment', 'motion-play', 'motion-pause', 'motion-restart', 'motion-reverse', 'motion-reset' ] );
	const safePath = name => typeof name === 'string' && /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test( name ) && ! name.split( '.' ).some( key => [ '__proto__', 'prototype', 'constructor', 'eval', 'Function', 'setTimeout', 'setInterval', 'document', 'location', 'fetch', 'open' ].includes( key ) );
	const safeAttribute = name => typeof name === 'string' && /^[a-z_][a-z0-9_.:-]{0,99}$/i.test( name ) && ! /^(on|data-(lieve-|editor-|wp-|id$))/i.test( name ) && ! [ 'id', 'class', 'style', 'srcdoc', 'src', 'href', 'action', 'formaction', 'xlink:href', 'srcset', 'poster', 'data', 'codebase' ].includes( name.toLowerCase() );
	const safeStyle = row => /^(--[a-zA-Z_][a-zA-Z0-9_-]*|[a-z][a-z-]*)$/.test( row.property ) && ! /^(behavior|-moz-binding)$/i.test( row.property ) && ! /[;{}<>@\\\u0000-\u001f]|\/\*|\*\/|(?:expression|url|attr)\s*\(/i.test( row.value || '' );
	function emit( source, name, detail, chain ) { const event = new win.CustomEvent( name, { bubbles: true, detail } ); if ( chain ) { eventChains.set( event, chain ); } source.dispatchEvent( event ); }
	function storage( scope ) {
		if ( scope === 'memory' ) { return { getItem: key => memory.has( key ) ? memory.get( key ) : null, setItem: ( key, value ) => memory.set( key, String( value ) ), removeItem: key => memory.delete( key ) }; }
		if ( scope === 'session' ) { return win.sessionStorage; } if ( scope === 'local' ) { return win.localStorage; } throw new Error( 'Unknown storage.' );
	}
	function compare( value, operator, expected ) {
		if ( operator === 'exists' ) { return value !== null && value !== false; }
		if ( operator === 'missing' ) { return value === null || value === false; }
		if ( operator === 'equals' ) { return String( value ) === expected; }
		if ( operator === 'not-equals' ) { return String( value ) !== expected; }
		if ( operator === 'contains' ) { return value !== null && String( value ).includes( expected ); }
		if ( value === null || String( value ).trim() === '' || String( expected ).trim() === '' ) { return false; }
		const a = Number( value ), b = Number( expected ); if ( ! Number.isFinite( a ) || ! Number.isFinite( b ) ) { return false; }
		return operator === 'gt' ? a > b : operator === 'gte' ? a >= b : operator === 'lt' ? a < b : operator === 'lte' ? a <= b : false;
	}
	function eligible( row ) {
		if ( row.minWidth !== '' && Number( win.innerWidth ) < Number( row.minWidth ) || row.maxWidth !== '' && Number( win.innerWidth ) > Number( row.maxWidth ) ) { return false; }
		const results = ( row.conditions || [] ).map( condition => {
			try {
				const value = condition.kind === 'storage' ? storage( condition.storage ).getItem( condition.key ) : condition.kind === 'media' ? win.matchMedia( condition.key ).matches : condition.kind === 'selector' ? Boolean( document.querySelector( condition.key ) ) : false;
				return compare( value, condition.operator, condition.value );
			} catch ( error ) { return false; } // Denied storage / invalid selector must never pass a rule.
		} );
		return ! results.length || ( row.relation === 'any' ? results.some( Boolean ) : results.every( Boolean ) );
	}
	function element( value ) {
		// Legacy 64-character internal keys can expand to a 203-character numeric data ID.
		if ( ! /^[A-Za-z0-9_-]{1,220}$/.test( value ) ) { return null; }
		return document.getElementById( value ) || document.querySelector( '[data-lieve-id="' + value + '"],[data-lieve-node="' + value + '"]' );
	}
	function targets( source, row ) {
		if ( noTarget.has( row.action ) ) { return []; }
		const value = row.targetValue;
		switch ( row.targetMode ) {
			case 'popup': { if ( ! /^[1-9]\d{0,14}$/.test( value ) || ! [ 'open-dialog', 'close-dialog', 'toggle-dialog' ].includes( row.action ) ) { return []; } const popup = document.querySelector( '[data-lieve-popup-id="' + value + '"]' ); return popup ? [ popup ] : []; }
			case 'self': return [ source ];
			case 'parent': return source.parentElement ? [ source.parentElement ] : [];
			case 'element': { const target = element( value ); return target ? [ target ] : []; }
			case 'selector': return Array.from( document.querySelectorAll( value ) );
			case 'children': return Array.from( source.querySelectorAll( value ) );
			case 'closest': { const target = source.closest( value ); return target ? [ target ] : []; }
			default: return [];
		}
	}
	function visible( target ) { return ! target.hidden && win.getComputedStyle( target ).display !== 'none'; }
	function visibility( target, show ) {
		if ( ! show ) { if ( ! hidden.has( target ) ) { hidden.set( target, { value: target.style.getPropertyValue( 'display' ), priority: target.style.getPropertyPriority( 'display' ) } ); } target.hidden = true; target.style.setProperty( 'display', 'none', 'important' ); }
		else { target.hidden = false; const previous = hidden.get( target ); if ( previous?.value && previous.value !== 'none' ) { target.style.setProperty( 'display', previous.value, previous.priority ); } else { target.style.removeProperty( 'display' ); } hidden.delete( target ); if ( win.getComputedStyle( target ).display === 'none' ) { target.style.setProperty( 'display', 'revert', 'important' ); } }
		if ( target.matches( '[data-lieve-popup]' ) ) { document.documentElement.classList.toggle( 'lieve-popup-open', Array.from( document.querySelectorAll( '[data-lieve-popup]' ) ).some( visible ) ); }
	}
	function dialog( source, target, action, chain, event = null ) {
		const panel = target.matches( 'dialog,[data-lieve-popup]' ) ? target : target.querySelector( 'dialog,[data-lieve-popup]' ) || target.closest( 'dialog,[data-lieve-popup]' );
		if ( ! panel ) { throw new Error( 'Target does not contain a dialog or a rendered popup.' ); }
		if ( panel.matches( '[data-lieve-popup]' ) && win.LievePopups ) {
			const show = action === 'open-dialog' || action === 'toggle-dialog' && ! win.LievePopups.isOpen( panel );
			return win.LievePopups[ show ? 'open' : 'close' ]( panel, source, { immediate: event?.type === 'keydown' || event?.type === 'click' && event.detail === 0, emit: opening => emit( panel, opening ? 'lieve:popup-open' : 'lieve:popup-close', { source }, chain ) } ).then( () => true );
		}
		const open = panel.matches( 'dialog' ) ? panel.open : visible( panel ); const show = action === 'open-dialog' || action === 'toggle-dialog' && ! open;
		if ( show && ! open ) { popupOpeners.set( panel, source ); }
		if ( panel.matches( 'dialog' ) ) { if ( show && ! panel.open ) { panel.showModal(); } else if ( ! show && panel.open ) { panel.close(); } }
		else { visibility( panel, show ); if ( show !== open ) { emit( panel, show ? 'lieve:popup-open' : 'lieve:popup-close', { source }, chain ); } if ( show && ! open ) { ( panel.querySelector( 'button:not([tabindex="-1"]),a[href],input:not([type="hidden"]),[tabindex]:not([tabindex="-1"])' ) || panel ).focus?.( { preventScroll: true } ); } }
		if ( ! show ) { const opener = popupOpeners.get( panel ); if ( opener?.isConnected ) { opener.focus?.( { preventScroll: true } ); } popupOpeners.delete( panel ); }
	}
	const keyframes = {
		'fade-in': [ { opacity: 0 }, { opacity: 1 } ], 'fade-out': [ { opacity: 1 }, { opacity: 0 } ],
		rise: [ { opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0)' } ], fall: [ { opacity: 0, transform: 'translateY(-24px)' }, { opacity: 1, transform: 'translateY(0)' } ],
		'slide-left': [ { opacity: 0, transform: 'translateX(-24px)' }, { opacity: 1, transform: 'translateX(0)' } ], 'slide-right': [ { opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'translateX(0)' } ],
		'zoom-in': [ { opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'scale(1)' } ], 'zoom-out': [ { opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.94)' } ],
		pulse: [ { transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' } ], shake: [ { transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' } ]
	};
	function restoreFallbackOpacity( target, owner = null ) {
		const previous = fallbackOpacity.get( target ); if ( ! previous || owner && previous.owner !== owner ) { return; }
		// Restore only our own final frame; a later authored CSS change wins.
		if ( target.style.getPropertyValue( 'opacity' ) === previous.applied && target.style.getPropertyPriority( 'opacity' ) === previous.appliedPriority ) { if ( previous.value ) { target.style.setProperty( 'opacity', previous.value, previous.priority ); } else { target.style.removeProperty( 'opacity' ); } }
		fallbackOpacity.delete( target );
	}
	function animate( target, row, entry ) {
		const preset = keyframes[ row.animation ]; if ( ! preset ) { throw new Error( 'Unknown animation.' ); }
		animations.get( target )?.cancel();
		restoreFallbackOpacity( target );
		const computed = win.getComputedStyle( target ); const base = computed.transform === 'none' ? '' : computed.transform + ' '; const opacity = Number( computed.opacity );
		const frames = preset.map( frame => ( { ...frame, ...( frame.transform ? { transform: base + frame.transform } : {} ), ...( frame.opacity !== undefined ? { opacity: frame.opacity * ( Number.isFinite( opacity ) ? opacity : 1 ) } : {} ) } ) );
		if ( reduced() || ! target.animate || row.duration === 0 ) {
			const final = frames.at( -1 );
			if ( final.opacity !== undefined ) { const previous = { value: target.style.getPropertyValue( 'opacity' ), priority: target.style.getPropertyPriority( 'opacity' ), owner: entry }; target.style.setProperty( 'opacity', String( final.opacity ) ); previous.applied = target.style.getPropertyValue( 'opacity' ); previous.appliedPriority = target.style.getPropertyPriority( 'opacity' ); fallbackOpacity.set( target, previous ); entry.fallbackTargets.add( target ); }
			return Promise.resolve( true );
		}
		const animation = target.animate( frames, { duration: row.duration, easing: row.easing, fill: 'both' } ); animations.set( target, animation ); entry.animations.add( animation );
		return animation.finished.then( () => true, () => false );
	}
	function parseArguments( text ) {
		const parsed = JSON.parse( text || '[]' ); let count = 0;
		const walk = ( value, depth ) => { if ( ++count > 1000 || depth > 16 || typeof value === 'number' && ! Number.isFinite( value ) ) { throw new Error( 'Invalid JSON arguments.' ); } if ( value && typeof value === 'object' ) { Object.entries( value ).forEach( ( [ key, next ] ) => { if ( [ '__proto__', 'prototype', 'constructor' ].includes( key ) ) { throw new Error( 'Unsafe JSON key.' ); } walk( next, depth + 1 ); } ); } }; walk( parsed, 0 ); return parsed;
	}
	function perform( record, event, affected, chain ) {
		const row = record.row, source = record.source; const action = row.action;
		if ( action.startsWith( 'motion-' ) ) { if ( ! win.LieveMotionRuntime ) { throw new Error( 'Motion runtime is unavailable.' ); } return win.LieveMotionRuntime.control( row.timelineId, action.slice( 7 ) ); }
		if ( action.startsWith( 'storage-' ) ) { const store = storage( row.storage ); if ( ! row.storageKey ) { throw new Error( 'Storage key is missing.' ); } if ( action === 'storage-remove' ) { store.removeItem( row.storageKey ); } else if ( action === 'storage-set' ) { store.setItem( row.storageKey, row.value ); } else if ( action === 'storage-increment' ) { const raw = store.getItem( row.storageKey ); const value = raw === null ? 0 : Number( raw ); const result = value + row.amount; if ( ! Number.isFinite( result ) || ! Number.isFinite( value ) ) { throw new Error( 'Stored value is not numeric.' ); } store.setItem( row.storageKey, String( result ) ); } return true; }
		if ( action === 'navigate' ) { if ( ! row.url || /[\u0000-\u0020\u007f\\]/.test( row.url ) ) { throw new Error( 'Invalid destination.' ); } const url = new URL( row.url, win.location.href ); if ( ! [ 'http:', 'https:' ].includes( url.protocol ) || /^\/\//.test( row.url ) ) { throw new Error( 'Invalid destination.' ); } win.location.assign( url.href ); return true; }
		if ( action === 'set-color-mode' ) { document.documentElement.dataset.colorMode = row.colorMode === 'toggle' ? document.documentElement.dataset.colorMode === 'dark' ? 'light' : 'dark' : row.colorMode; return true; }
		const promises = affected.map( target => {
			if ( [ 'show', 'hide', 'toggle' ].includes( action ) ) { const show = action === 'show' || action === 'toggle' && ! visible( target ); visibility( target, show ); if ( target !== source && source.matches( 'button,a,[role="button"]' ) ) { source.setAttribute( 'aria-expanded', String( show ) ); } }
			else if ( action.endsWith( '-class' ) ) { const classes = String( row.className ).trim().split( /\s+/ ); if ( classes.some( name => ! /^(?:--|[A-Za-z_]|-[A-Za-z_])[A-Za-z0-9_-]*$/.test( name ) ) ) { throw new Error( 'Invalid CSS class.' ); } classes.forEach( name => action === 'toggle-class' ? target.classList.toggle( name ) : target.classList[ action === 'add-class' ? 'add' : 'remove' ]( name ) ); }
			else if ( action.endsWith( '-attribute' ) ) { if ( ! safeAttribute( row.attribute ) ) { throw new Error( 'Unsafe attribute.' ); } if ( action === 'remove-attribute' || action === 'toggle-attribute' && target.hasAttribute( row.attribute ) ) { target.removeAttribute( row.attribute ); } else { target.setAttribute( row.attribute, row.value ); } }
			else if ( [ 'set-style', 'remove-style' ].includes( action ) ) { if ( ! safeStyle( row ) ) { throw new Error( 'Unsafe CSS property.' ); } if ( action === 'set-style' ) { target.style.setProperty( row.property, row.value ); } else { target.style.removeProperty( row.property ); } }
			else if ( action === 'animate' ) { return animate( target, row, record.entry ); }
			else if ( action === 'cancel-animation' ) { animations.get( target )?.cancel(); animations.delete( target ); restoreFallbackOpacity( target ); }
			else if ( action === 'scroll-to' ) { win.scrollTo( { top: Math.max( 0, target.getBoundingClientRect().top + win.scrollY - row.offset ), behavior: row.smooth && ! reduced() ? 'smooth' : 'auto' } ); }
			else if ( action === 'focus' ) { const temporary = ! target.hasAttribute( 'tabindex' ) && ! target.matches( 'a[href],button,input,select,textarea,[contenteditable="true"]' ); if ( temporary ) { target.setAttribute( 'tabindex', '-1' ); target.addEventListener( 'blur', () => target.removeAttribute( 'tabindex' ), { once: true } ); } target.focus( { preventScroll: true } ); }
			else if ( action === 'click' ) { target.click(); }
			else if ( action.endsWith( '-dialog' ) ) { return Promise.resolve( dialog( source, target, action, chain, event ) ).then( () => true ); }
			else if ( action === 'reset-form' ) { const forms = target.matches( 'form' ) ? [ target ] : Array.from( target.querySelectorAll( 'form' ) ); if ( ! forms.length ) { throw new Error( 'Target contains no form.' ); } forms.forEach( form => { form.reset(); emit( form, 'lieve:form-reset', { source }, chain ); } ); }
			else if ( [ 'play-media', 'pause-media', 'toggle-media' ].includes( action ) ) { const media = target.matches( 'video,audio' ) ? target : target.querySelector( 'video,audio' ); if ( ! media ) { throw new Error( 'Target contains no audio or video.' ); } if ( action === 'pause-media' || action === 'toggle-media' && ! media.paused ) { media.pause(); } else { return Promise.resolve( media.play() ).then( () => true ); } }
			else if ( [ 'next-slide', 'previous-slide' ].includes( action ) ) { const control = target.querySelector( action === 'next-slide' ? '[data-lieve-slide-next]' : '[data-lieve-slide-prev]' ); if ( ! control ) { throw new Error( 'Target contains no slider control.' ); } control.click(); }
			else if ( action === 'checkout-step' ) { const controls = Array.from( target.querySelectorAll( '[data-lieve-checkout-step-link]' ) ); const control = controls.find( item => item.dataset.lieveCheckoutStepLink === row.step ); if ( ! control ) { throw new Error( 'Checkout step is unavailable.' ); } control.click(); }
			else if ( action === 'dispatch' ) { if ( ! /^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/.test( row.eventName ) || /^lieve:interaction-(end|error)$/.test( row.eventName ) ) { throw new Error( 'Reserved or invalid event name.' ); } emit( target, row.eventName, parseArguments( row.arguments ), chain ); }
			else if ( action === 'call' ) { if ( ! allowedFunctions.has( row.functionName ) || ! safePath( row.functionName ) ) { throw new Error( 'Unsafe function path.' ); } const parts = row.functionName.split( '.' ); const name = parts.pop(); let owner = win; for ( const key of parts ) { if ( ! Object.prototype.hasOwnProperty.call( owner, key ) ) { throw new Error( 'Site function is unavailable.' ); } owner = owner[ key ]; if ( ! owner ) { throw new Error( 'Site function is unavailable.' ); } } if ( ! Object.prototype.hasOwnProperty.call( owner, name ) || typeof owner[ name ] !== 'function' ) { throw new Error( 'Site function is unavailable.' ); } const args = parseArguments( row.arguments ); if ( ! Array.isArray( args ) ) { throw new Error( 'Function arguments must be an array.' ); } return Promise.resolve( owner[ name ].call( owner, ...args, { source, targets: affected, target, event, interaction: row } ) ).then( () => true ); }
			else { throw new Error( 'Unsupported action.' ); }
			return true;
		} );
		return Promise.all( promises ).then( result => result.every( Boolean ) );
	}
	function run( record, event = null ) {
		const { row, source, entry } = record; const parent = activeChain || ( event && eventChains.get( event ) ) || new Set();
		if ( ! bound.has( source ) || ! source.isConnected || record.ran && row.once || record.pending || Date.now() - record.last < row.cooldown || parent.has( record ) || parent.size >= 24 || ! eligible( row ) ) { return; }
		const chain = new Set( parent ); chain.add( record );
		if ( row.preventDefault ) { event?.preventDefault(); } if ( row.stopPropagation ) { event?.stopPropagation(); }
		const execute = () => {
			record.pending = null;
			if ( ! bound.has( source ) || ! source.isConnected || record.ran && row.once || ! eligible( row ) ) { return; }
			const previous = activeChain; activeChain = chain;
			try {
				const affected = targets( source, row ); if ( ! noTarget.has( row.action ) && ! affected.length ) { throw new Error( 'No target matched this interaction.' ); }
				record.ran = true; record.last = Date.now();
				Promise.resolve( perform( record, event, affected, chain ) ).then( success => { if ( success && bound.has( source ) && source.isConnected ) { emit( source, 'lieve:interaction-end', { id: row.id, name: row.name, source, targets: affected }, chain ); } }, error => { record.ran = false; emit( source, 'lieve:interaction-error', { id: row.id, message: error.message }, chain ); } );
			} catch ( error ) { record.ran = false; emit( source, 'lieve:interaction-error', { id: row.id, message: error.message }, chain ); }
			finally { activeChain = previous; }
		};
		if ( row.delay > 0 ) { const timer = win.setTimeout( () => { entry.timers.delete( timer ); execute(); }, row.delay ); record.pending = timer; entry.timers.add( timer ); } else { execute(); }
	}
	function listen( entry, target, name, fn, options ) { target.addEventListener( name, fn, options ); entry.dispose.push( () => target.removeEventListener( name, fn, options ) ); }
	function install( source, row, entry ) {
		const record = { source, row, entry, pending: null, ran: false, last: -Infinity }; entry.records.push( record );
		const invoke = event => { if ( row.trigger !== 'keydown' || event.key === row.key ) { run( record, event ); } };
		const native = [ 'click', 'dblclick', 'pointerenter', 'pointerleave', 'focusin', 'focusout', 'keydown', 'input', 'change', 'animationend' ];
		if ( native.includes( row.trigger ) ) { listen( entry, source, row.trigger, invoke ); }
		else if ( row.trigger === 'load' ) { if ( document.readyState === 'loading' ) { listen( entry, document, 'DOMContentLoaded', invoke, { once: true } ); } else { invoke(); } }
		else if ( row.trigger === 'custom' ) { listen( entry, row.eventScope === 'document' ? document : row.eventScope === 'window' ? win : source, row.eventName, invoke ); }
		else if ( row.trigger === 'interaction-end' ) { listen( entry, document, 'lieve:interaction-end', event => { if ( event.detail?.id === row.afterId ) { invoke( event ); } } ); }
		else if ( row.trigger === 'window-leave' ) { listen( entry, document.documentElement, 'mouseleave', event => { if ( ! event.relatedTarget && event.clientY <= 0 ) { invoke( event ); } } ); }
		else if ( [ 'enter-view', 'leave-view' ].includes( row.trigger ) && win.IntersectionObserver ) {
			let previous = false;
			const threshold = Math.max( 0, Math.min( 1, row.threshold / 100 ) );
			const watcher = new win.IntersectionObserver( entries => entries.forEach( item => { const inside = item.isIntersecting && item.intersectionRatio >= threshold; if ( inside !== previous ) { if ( row.trigger === 'enter-view' && inside || row.trigger === 'leave-view' && ! inside ) { invoke(); } previous = inside; } } ), { threshold, rootMargin: row.rootMargin || '0px' } ); watcher.observe( source ); entry.dispose.push( () => watcher.disconnect() );
		}
		else if ( row.trigger === 'scroll' ) {
			let previous = win.scrollY, frame = 0;
			const check = () => { frame = 0; const at = row.scrollUnit === '%' ? Math.max( 0, document.documentElement.scrollHeight - win.innerHeight ) * row.scrollOffset / 100 : row.scrollUnit === 'vh' ? win.innerHeight * row.scrollOffset / 100 : row.scrollOffset; const next = win.scrollY; if ( ( row.scrollDirection !== 'up' && previous < at && next >= at ) || ( row.scrollDirection !== 'down' && previous > at && next <= at ) ) { invoke(); } previous = next; };
			listen( entry, win, 'scroll', () => { if ( ! frame ) { frame = win.requestAnimationFrame( check ); } }, { passive: true } ); entry.dispose.push( () => { if ( frame ) { win.cancelAnimationFrame( frame ); } } );
		}
		else {
			const events = { 'form-submit': 'lieve:form-submit', 'form-success': 'lieve:form-success', 'form-error': 'lieve:form-error', 'filter-submit': 'lieve:filter-submit', 'fragment-ready': 'lieve:fragment-refreshed', 'woo-adding': 'lieve:woo-adding', 'woo-added': 'lieve:woo-added', 'woo-removed': 'lieve:woo-removed', 'woo-cart': 'lieve:woo-cart', 'woo-coupon': 'lieve:woo-coupon', 'woo-coupon-removed': 'lieve:woo-coupon-removed', 'woo-checkout': 'lieve:woo-checkout' };
			if ( events[ row.trigger ] ) { listen( entry, document, events[ row.trigger ], event => { const local = row.trigger.startsWith( 'form-' ) || row.trigger === 'filter-submit' || row.trigger === 'fragment-ready'; if ( ! local || event.target === source || source.contains( event.target ) ) { invoke( event ); } } ); }
		}
	}
	function unbind( source ) { const entry = bound.get( source ); if ( ! entry ) { return; } bound.delete( source ); entry.dispose.forEach( dispose => dispose() ); entry.timers.forEach( timer => win.clearTimeout( timer ) ); entry.animations.forEach( animation => animation.cancel() ); entry.fallbackTargets.forEach( target => restoreFallbackOpacity( target, entry ) ); }
	function scan() {
		bound.forEach( ( entry, source ) => { if ( ! source.isConnected || source.getAttribute( 'data-lieve-interactions' ) !== entry.data ) { unbind( source ); } } );
		Array.from( document.querySelectorAll( '[data-lieve-interactions]' ) ).forEach( source => {
			if ( bound.has( source ) || source.closest( '#lieve-builder-app,[data-editor-root]' ) ) { return; }
			const data = source.getAttribute( 'data-lieve-interactions' ); let rows; try { rows = JSON.parse( data ); } catch ( error ) { return; }
			if ( ! Array.isArray( rows ) || rows.length > 100 ) { return; }
			const entry = { data, dispose: [], timers: new Set(), animations: new Set(), fallbackTargets: new Set(), records: [] }; bound.set( source, entry );
			rows.filter( row => row && row.enabled === true && /^li_[a-f0-9]{12,24}$/.test( row.id ) ).forEach( row => { try { install( source, row, entry ); } catch ( error ) { emit( source, 'lieve:interaction-error', { id: row.id, message: error.message } ); } } );
		} );
	}
	function start() {
		if ( started || document.querySelector( '#lieve-builder-app' ) ) { return; } started = true;
		const bootstrap = () => { scan(); if ( win.MutationObserver ) { observer = new win.MutationObserver( records => { if ( records.some( record => record.type === 'childList' || record.attributeName === 'data-lieve-interactions' ) ) { scan(); } } ); observer.observe( document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: [ 'data-lieve-interactions' ] } ); } };
		if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', bootstrap, { once: true } ); globalDisposers.push( () => document.removeEventListener( 'DOMContentLoaded', bootstrap ) ); } else { bootstrap(); }
		if ( typeof win.jQuery === 'function' && document.body ) { const $ = win.jQuery; const names = { adding_to_cart: 'woo-adding', added_to_cart: 'woo-added', removed_from_cart: 'woo-removed', updated_cart_totals: 'woo-cart', applied_coupon: 'woo-coupon', removed_coupon: 'woo-coupon-removed', updated_checkout: 'woo-checkout' }; Object.entries( names ).forEach( ( [ event, name ] ) => { const handler = () => emit( document.body, 'lieve:' + name, {} ); $( document.body ).on( event + '.lieveInteract', handler ); globalDisposers.push( () => $( document.body ).off( event + '.lieveInteract', handler ) ); } ); }
	}
	function destroy() { observer?.disconnect(); observer = null; Array.from( bound.keys() ).forEach( unbind ); globalDisposers.splice( 0 ).forEach( dispose => dispose() ); started = false; memory.clear(); }
	return { start, scan, destroy, eligible, compare, targets, keyframes };
} ) );
