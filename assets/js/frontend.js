( function () {
	'use strict';

	if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', () => window.LievePopups?.mount(), { once: true } ); }
	else { window.LievePopups?.mount(); }

	const reducedMotion = window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
	const targetElement = ( id ) => document.getElementById( id ) || document.getElementById( 'lieve-' + id ) || ( /^[A-Za-z0-9_-]+$/.test( id ) ? document.querySelector( '[data-lieve-id="' + id + '"]' ) || document.querySelector( '[data-lieve-node="' + id + '"]' ) : null );
	document.querySelectorAll( '[data-lieve-open]' ).forEach( ( button ) => button.addEventListener( 'click', () => { const dialog = targetElement( button.dataset.lieveOpen ); if ( dialog?.showModal ) { dialog.showModal(); } } ) );
	document.querySelectorAll( '[data-lieve-dialog-close]' ).forEach( ( button ) => button.addEventListener( 'click', () => button.closest( 'dialog' )?.close() ) );
	document.querySelectorAll( '[data-lieve-toggle]' ).forEach( ( button ) => button.addEventListener( 'click', () => { const target = targetElement( button.dataset.lieveToggle ); if ( target ) { target.hidden = ! target.hidden; button.setAttribute( 'aria-expanded', String( ! target.hidden ) ); } } ) );
	document.querySelectorAll( '[data-lieve-color-mode]' ).forEach( ( button ) => button.addEventListener( 'click', () => { const dark = document.documentElement.dataset.colorMode !== 'dark'; document.documentElement.dataset.colorMode = dark ? 'dark' : 'light'; button.setAttribute( 'aria-pressed', String( dark ) ); } ) );
	document.querySelectorAll( '[data-lieve-dismiss]' ).forEach( ( button ) => button.addEventListener( 'click', () => { const alert = button.closest( 'aside[role="status"]' ); if ( alert ) { alert.hidden = true; } } ) );
	document.querySelectorAll( '[data-lieve-back-top]' ).forEach( ( link ) => link.addEventListener( 'click', ( event ) => { event.preventDefault(); window.scrollTo( { top: 0, behavior: reducedMotion ? 'auto' : 'smooth' } ); } ) );

	document.querySelectorAll( '[data-lieve-tabs]' ).forEach( ( root ) => {
		const tabs = Array.from( root.querySelector( ':scope > [role="tablist"]' ).querySelectorAll( '[role="tab"]' ) );
		const select = ( index, focus = false ) => tabs.forEach( ( tab, current ) => { const active = current === index; tab.setAttribute( 'aria-selected', String( active ) ); tab.tabIndex = active ? 0 : -1; const panel = document.getElementById( tab.getAttribute( 'aria-controls' ) ); if ( panel ) { panel.hidden = ! active; } if ( active && focus ) { tab.focus(); } } );
		tabs.forEach( ( tab, index ) => {
			tab.addEventListener( 'click', () => select( index ) );
			tab.addEventListener( 'keydown', ( event ) => { let next; if ( event.key === 'ArrowRight' ) { next = ( index + 1 ) % tabs.length; } else if ( event.key === 'ArrowLeft' ) { next = ( index + tabs.length - 1 ) % tabs.length; } else if ( event.key === 'Home' ) { next = 0; } else if ( event.key === 'End' ) { next = tabs.length - 1; } if ( next !== undefined ) { event.preventDefault(); select( next, true ); } } );
		} );
	} );
	document.querySelectorAll( '[data-lieve-slider]' ).forEach( ( root ) => {
		if ( window.LieveWidgets ) { window.LieveWidgets.mountSlider( root ); return; }
		const slides = Array.from( root.querySelectorAll( ':scope > [data-lieve-slide]' ) ); let current = 0;
		function advance( direction ) { if ( ! slides.length ) { return; } current = ( current + direction + slides.length ) % slides.length; slides.forEach( ( slide, index ) => { slide.hidden = index !== current; } ); const status = root.querySelector( '[data-lieve-slide-status]' ); if ( status ) { status.textContent = ( current + 1 ) + ' / ' + slides.length; } }
		root.querySelector( '[data-lieve-slide-prev]' )?.addEventListener( 'click', () => advance( -1 ) );
		root.querySelector( '[data-lieve-slide-next]' )?.addEventListener( 'click', () => advance( 1 ) );
	} );
	document.querySelectorAll( '[data-lieve-phrases]' ).forEach( ( element ) => {
		if ( reducedMotion ) { return; } let phrases; try { phrases = JSON.parse( element.dataset.lievePhrases ); } catch ( error ) { return; } if ( ! Array.isArray( phrases ) || ! phrases.length ) { return; }
		let index = 0; let deleting = true; let length = Array.from( String( phrases[ 0 ] ) ).length;
		const pause = Math.max( 500, Number( element.dataset.lieveInterval ) || 2400 );
		function type() {
			if ( ! element.isConnected ) { return; }
			if ( document.hidden ) { window.setTimeout( type, 500 ); return; }
			const characters = Array.from( String( phrases[ index ] ) );
			length += deleting ? -1 : 1; element.textContent = characters.slice( 0, Math.max( 0, length ) ).join( '' );
			let delay = deleting ? 35 : 65;
			if ( deleting && length <= 0 ) { deleting = false; index = ( index + 1 ) % phrases.length; delay = 200; }
			else if ( ! deleting && length >= characters.length ) { deleting = true; delay = pause; }
			window.setTimeout( type, delay );
		}
		window.setTimeout( type, pause );
	} );
	document.querySelectorAll( '[data-lieve-countdown]' ).forEach( ( element ) => {
		const deadline = new Date( element.dateTime ).getTime(); if ( ! Number.isFinite( deadline ) ) { return; }
		let timer; function tick() { const remaining = Math.max( 0, deadline - Date.now() ); const seconds = Math.floor( remaining / 1000 ); element.textContent = remaining ? Math.floor( seconds / 86400 ) + 'd ' + Math.floor( seconds % 86400 / 3600 ) + 'h ' + Math.floor( seconds % 3600 / 60 ) + 'm ' + seconds % 60 + 's' : element.dataset.completed || 'Completed'; if ( ! remaining ) { window.clearInterval( timer ); } } tick(); timer = window.setInterval( tick, 1000 );
	} );
	document.querySelectorAll( '[data-lieve-counter]' ).forEach( ( element ) => {
		if ( reducedMotion || ! window.IntersectionObserver ) { return; }
		const observer = new IntersectionObserver( ( entries ) => { if ( ! entries.some( ( entry ) => entry.isIntersecting ) ) { return; } observer.disconnect(); const start = performance.now(); const end = Number( element.dataset.lieveCounter ) || 0;
			function tick( time ) { const progress = Math.min( 1, ( time - start ) / 900 ); element.textContent = ( element.dataset.prefix || '' ) + Math.round( end * progress ) + ( element.dataset.suffix || '' ); if ( progress < 1 ) { requestAnimationFrame( tick ); } } requestAnimationFrame( tick );
		} ); observer.observe( element );
	} );

	function loadEmbed( root, overrideUrl = '' ) {
		const url = overrideUrl || root?.dataset.lieveEmbed; if ( ! root || ! url ) { return; }
		const frame = document.createElement( 'iframe' ); frame.src = url; frame.title = root.dataset.embedTitle || 'External content'; frame.loading = 'lazy'; frame.referrerPolicy = 'no-referrer'; frame.setAttribute( 'sandbox', 'allow-scripts allow-same-origin allow-popups' ); frame.setAttribute( 'allowfullscreen', '' ); root.replaceChildren( frame );
	}
	document.querySelectorAll( '[data-lieve-load-embed]' ).forEach( ( button ) => button.addEventListener( 'click', () => loadEmbed( button.closest( '[data-lieve-embed]' ) ) ) );
	document.querySelectorAll( '[data-lieve-map-target]' ).forEach( ( button ) => button.addEventListener( 'click', () => { const map = targetElement( button.dataset.lieveMapTarget ); if ( map?.matches( '[data-lieve-embed]' ) ) { loadEmbed( map, button.dataset.mapUrl ); } } ) );
	document.querySelectorAll( '[data-lieve-toc]' ).forEach( ( root ) => {
		const list = root.querySelector( 'ol' ); document.querySelectorAll( '.lieve-builder-content h2, .lieve-builder-content h3' ).forEach( ( heading, index ) => { if ( root.contains( heading ) ) { return; } if ( ! heading.id ) { heading.id = 'lieve-heading-' + index; } const item = document.createElement( 'li' ); const link = document.createElement( 'a' ); link.href = '#' + heading.id; link.textContent = heading.textContent; item.appendChild( link ); list.appendChild( item ); } );
	} );
	const readingProgress = Array.from( document.querySelectorAll( '[data-lieve-reading-progress]' ) );
	if ( readingProgress.length ) { const update = () => { const extent = document.documentElement.scrollHeight - window.innerHeight; const value = extent > 0 ? window.scrollY / extent * 100 : 100; readingProgress.forEach( ( element ) => { element.value = value; } ); }; window.addEventListener( 'scroll', update, { passive: true } ); window.addEventListener( 'resize', update ); update(); }

	document.querySelectorAll( '[data-lieve-contact-form]' ).forEach( ( form ) => form.addEventListener( 'submit', async ( event ) => {
		event.preventDefault(); if ( ! form.reportValidity() ) { return; } const button = form.querySelector( 'button[type="submit"]' ); if ( button.disabled ) { return; } const status = form.querySelector( '[data-lieve-form-status]' ); button.disabled = true; status.textContent = 'Sending…';
		const formData = new FormData( form );
		form.dispatchEvent( new CustomEvent( 'lieve:form-submit', { bubbles: true, detail: { formData } } ) );
			try { const response = await fetch( form.dataset.endpoint, { method: 'POST', credentials: 'same-origin', body: formData } ); const result = await response.json(); if ( ! response.ok ) { throw new Error( result.message || 'Unable to send your message.' ); } status.textContent = result.message; if ( form.dataset.formReset !== 'false' ) { form.reset(); } form.dispatchEvent( new CustomEvent( 'lieve:form-success', { bubbles: true, detail: { message: result.message, formData } } ) ); if ( result.redirectUrl ) { const redirect = new URL( result.redirectUrl, window.location.href ); if ( redirect.origin === window.location.origin ) { window.location.assign( redirect.href ); } } } catch ( error ) { status.textContent = error.message; form.dispatchEvent( new CustomEvent( 'lieve:form-error', { bubbles: true, detail: { message: error.message, formData } } ) ); } finally { button.disabled = false; }
	} ) );

	const filterGroups = Array.from( document.querySelectorAll( '[data-lieve-filter]' ) );
	filterGroups.forEach( ( root ) => {
		const id = root.dataset.lieveFilter; const prefix = 'lv_' + id + '_';
		const url = new URL( window.location.href );
		root.querySelectorAll( '[data-filter-key]' ).forEach( ( input ) => {
			const value = url.searchParams.get( prefix + input.dataset.filterKey );
			if ( [ 'checkbox', 'radio' ].includes( input.type ) ) { input.checked = ( value || '' ).split( ',' ).includes( input.value ); } else if ( value !== null && value !== '' ) { input.value = value; }
			if ( input.type === 'range' ) { input.dataset.filterActive = String( value !== null && value !== '' ); input.addEventListener( 'input', () => { input.dataset.filterActive = 'true'; } ); input.addEventListener( 'change', () => { input.dataset.filterActive = 'true'; } ); }
		} );
		if ( root.querySelector( '[data-lieve-filter-reset]' ) && id ) {
			const list = document.createElement( 'ul' );
			[ 'search', 'terms', 'date', 'price' ].forEach( ( key ) => { const value = url.searchParams.get( prefix + key ); if ( ! value ) { return; } const item = document.createElement( 'li' ); const remove = document.createElement( 'button' ); remove.type = 'button'; remove.textContent = key + ': ' + value + ' ×'; remove.setAttribute( 'aria-label', 'Remove ' + key + ' filter' ); remove.addEventListener( 'click', () => { const next = new URL( window.location.href ); next.searchParams.delete( prefix + key ); next.searchParams.delete( prefix + 'page' ); window.location.assign( next.href ); } ); item.appendChild( remove ); list.appendChild( item ); } );
			if ( list.children.length ) { root.prepend( list ); }
		}
		root.querySelector( '[data-lieve-filter-submit]' )?.addEventListener( 'click', () => {
			root.dispatchEvent( new CustomEvent( 'lieve:filter-submit', { bubbles: true } ) );
			if ( ! id ) { return; } const next = new URL( window.location.href ); const values = new Map();
			filterGroups.filter( ( group ) => group.dataset.lieveFilter === id ).forEach( ( group ) => group.querySelectorAll( '[data-filter-key]' ).forEach( ( input ) => { const key = input.dataset.filterKey; if ( ! values.has( key ) ) { values.set( key, [] ); } if ( input.type === 'range' && input.dataset.filterActive !== 'true' ) { return; } if ( ! [ 'checkbox', 'radio' ].includes( input.type ) || input.checked ) { if ( input.value ) { values.get( key ).push( input.value ); } } } ) );
			values.forEach( ( value, key ) => { if ( value.length ) { next.searchParams.set( prefix + key, value.join( ',' ) ); } else { next.searchParams.delete( prefix + key ); } } ); next.searchParams.delete( prefix + 'page' ); window.location.assign( next.href );
		} );
		root.querySelector( '[data-lieve-filter-reset]' )?.addEventListener( 'click', () => { const next = new URL( window.location.href ); Array.from( next.searchParams.keys() ).filter( ( key ) => key.startsWith( prefix ) ).forEach( ( key ) => next.searchParams.delete( key ) ); window.location.assign( next.href ); } );
	} );

	// Native checkout validation runs before changing steps; hidden panels are
	// restored before WooCommerce reports errors or the order is submitted.
	document.querySelectorAll( 'form.woocommerce-checkout' ).forEach( ( form ) => {
		const steps = Array.from( form.querySelectorAll( '[data-lieve-checkout-step]' ) );
		const buttons = Array.from( form.querySelectorAll( '[data-lieve-checkout-step-link]' ) );
		if ( steps.length < 2 || ! buttons.length ) { return; }
		function selectStep( target ) { steps.forEach( ( step ) => { step.hidden = step !== target; } ); buttons.forEach( ( button ) => { const active = button.dataset.lieveCheckoutStepLink === target.dataset.lieveCheckoutStep; button.setAttribute( 'aria-current', active ? 'step' : 'false' ); } ); }
		buttons.forEach( ( button ) => button.addEventListener( 'click', () => {
			const target = steps.find( ( step ) => step.dataset.lieveCheckoutStep === button.dataset.lieveCheckoutStepLink ); if ( ! target ) { return; }
			const current = steps.find( ( step ) => ! step.hidden );
			if ( current && steps.indexOf( target ) > steps.indexOf( current ) ) { const invalid = Array.from( current.querySelectorAll( 'input, select, textarea' ) ).find( ( field ) => ! field.checkValidity() ); if ( invalid ) { invalid.reportValidity(); return; } }
			selectStep( target );
		} ) );
		form.addEventListener( 'invalid', () => { steps.forEach( ( step ) => { step.hidden = false; } ); }, true );
		form.addEventListener( 'submit', () => { steps.forEach( ( step ) => { step.hidden = false; } ); } );
		selectStep( steps[ 0 ] );
		if ( window.jQuery ) { window.jQuery( document.body ).on( 'checkout_error', () => steps.forEach( ( step ) => { step.hidden = false; } ) ); }
	} );
	const fragments = Array.from( document.querySelectorAll( '[data-lieve-commerce-fragment]' ) ).filter( ( root ) => ! root.parentElement.closest( '[data-lieve-commerce-fragment]' ) );
	if ( fragments.length && window.jQuery ) {
		let refreshing = false;
		window.jQuery( document.body ).on( 'added_to_cart removed_from_cart updated_cart_totals updated_checkout wc_fragments_refreshed', async () => {
			if ( refreshing ) { return; } refreshing = true;
			try {
				const body = new FormData(); body.set( 'nonce', fragments[ 0 ].dataset.fragmentNonce ); body.set( 'fragments', JSON.stringify( fragments.slice( 0, 20 ).map( ( root ) => ( { postId: root.dataset.fragmentPost, id: root.dataset.fragmentId, instance: root.dataset.fragmentInstance || '' } ) ) ) );
				const response = await fetch( fragments[ 0 ].dataset.fragmentEndpoint, { method: 'POST', credentials: 'same-origin', body } ); const result = await response.json();
				if ( ! response.ok || ! result.success ) { return; }
				fragments.forEach( ( root, index ) => { if ( typeof result.data[ index ] === 'string' ) { root.innerHTML = result.data[ index ]; root.dispatchEvent( new CustomEvent( 'lieve:fragment-refreshed', { bubbles: true } ) ); } } );
			} catch ( error ) { /* Keep the last valid content if the refresh fails. */ }
			finally { refreshing = false; }
		} );
	}
}() );
