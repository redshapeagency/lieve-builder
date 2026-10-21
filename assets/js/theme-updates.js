/* Checking a release is independent of the Settings draft and never installs it. */
( function() {
	'use strict';
	const root = document.querySelector( '[data-theme-updates]' ), config = window.LieveSettingsConfig;
	if ( ! root || ! config?.updatesUrl ) { return; }
	const button = root.querySelector( '[data-theme-update-check]' ), status = root.querySelector( '[data-theme-update-status]' );
	if ( ! button || ! status ) { return; }
	let pending = false;
	button.addEventListener( 'click', async () => {
		if ( pending ) { return; }
		pending = true; button.disabled = true; root.setAttribute( 'aria-busy', 'true' );
		const label = button.textContent; button.textContent = 'Checking…'; status.textContent = 'Checking the latest stable GitHub release…';
		const controller = window.AbortController ? new window.AbortController() : null;
		const timeout = controller ? window.setTimeout( () => controller.abort(), 35000 ) : null;
		try {
			const response = await ( window.LieveTransport?.fetch || window.fetch.bind( window ) )( config.updatesUrl, { method: 'POST', credentials: 'same-origin', ...( controller ? { signal: controller.signal } : {} ), headers: { 'X-WP-Nonce': config.nonce } } );
			let result;
			try { result = await response.json(); } catch ( error ) { throw new Error( 'The update response could not be verified. Try again later.' ); }
			if ( ! response.ok ) { throw new Error( typeof result?.message === 'string' && result.message ? result.message : 'The update check failed. Try again later.' ); }
			if ( ! result || ! [ 'current', 'available', 'unavailable', 'incompatible', 'error' ].includes( result.state ) || typeof result.message !== 'string' || ! result.message ) { throw new Error( 'The update response could not be verified. Try again later.' ); }
			status.textContent = result.message;
		} catch ( error ) {
			status.textContent = error?.name === 'AbortError' ? 'The update check timed out. Try again later.' : error?.message || 'The update check failed. Try again later.';
		} finally {
			if ( timeout !== null ) { window.clearTimeout( timeout ); }
			pending = false; button.disabled = false; button.textContent = label; root.removeAttribute( 'aria-busy' );
		}
	} );
} )();
