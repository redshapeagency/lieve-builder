/* Progressive enhancement: every Load more link also works without JavaScript. */
( function() {
	'use strict';
	document.addEventListener( 'click', async event => {
		const link = event.target.closest?.( '[data-lieve-listing-more]' ); if ( ! link || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ) { return; }
		const listing = link.closest( '[data-lieve-listing]' ), track = listing?.querySelector( ':scope > [data-lieve-listing-track]' );
		if ( ! track || listing.closest( '#lieve-builder-app,[data-editor-root]' ) ) { return; }
		event.preventDefault(); if ( link.getAttribute( 'aria-disabled' ) === 'true' ) { return; }
		const url = new URL( link.href ); if ( url.origin !== window.location.origin ) { return; }
		const nav = link.parentElement, status = nav.querySelector( '[data-lieve-listing-page-status]' ); link.setAttribute( 'aria-disabled', 'true' ); listing.setAttribute( 'aria-busy', 'true' ); status.textContent = 'Loading items…';
		const controller = new AbortController(), timer = setTimeout( () => controller.abort(), 20000 );
		try {
			const response = await fetch( url.href, { credentials: 'same-origin', signal: controller.signal, cache: 'no-store' } ); if ( ! response.ok ) { throw new Error(); }
			const page = new DOMParser().parseFromString( await response.text(), 'text/html' ), id = listing.getAttribute( 'data-lieve-listing' );
			const next = Array.from( page.querySelectorAll( '[data-lieve-listing]' ) ).find( node => node.getAttribute( 'data-lieve-listing' ) === id ), nextTrack = next?.querySelector( ':scope > [data-lieve-listing-track]' );
			if ( ! next ) { throw new Error(); }
			if ( ! nextTrack && next.querySelector( '[data-lieve-listing-empty]' ) ) { link.remove(); status.textContent = 'All items loaded.'; return; }
			if ( ! nextTrack ) { throw new Error(); }
			const items = Array.from( nextTrack.children );
			// HTML is server-rendered. Scripts stay inert; never eval fetched markup.
			items.forEach( item => { item.querySelectorAll( 'script' ).forEach( script => script.remove() ); track.appendChild( document.importNode( item, true ) ); } );
			page.querySelectorAll( 'style[data-lieve-listing-styles],style[data-lieve-styles]' ).forEach( style => { if ( ! Array.from( document.querySelectorAll( 'style' ) ).some( existing => existing.textContent === style.textContent ) ) { document.head.appendChild( document.importNode( style, true ) ); } } );
			const more = next.querySelector( ':scope > [data-lieve-listing-pagination] [data-lieve-listing-more]' ); if ( more ) { link.href = more.href; } else { link.remove(); }
			status.textContent = items.length ? items.length + ' more items loaded.' : 'All items loaded.';
			window.LieveListings?.mount( listing ); window.LieveInteractRuntime?.scan(); listing.dispatchEvent( new CustomEvent( 'lieve:fragment-refreshed', { bubbles: true } ) );
		} catch ( error ) { status.textContent = 'Items could not be loaded. Try again or open the link in a new tab.'; }
		finally { clearTimeout( timer ); listing.removeAttribute( 'aria-busy' ); link.removeAttribute( 'aria-disabled' ); }
	} );
} )();
