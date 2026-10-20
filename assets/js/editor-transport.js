/* Shared authenticated transport. Only nonce rejection is safe to replay. */
( function( root, factory ) {
	'use strict';
	if ( typeof module === 'object' && module.exports ) { module.exports = factory; }
	else { root.LieveTransport = factory( root, root.LieveTransportConfig || {} ); }
}( typeof window !== 'undefined' ? window : this, function( win, config ) {
	'use strict';
	const nativeFetch = win.fetch.bind( win ); let nonce = config.nonce || '', renewal = null;
	const validNonce = value => typeof value === 'string' && /^[a-zA-Z0-9]{10}$/.test( value );
	async function renew( signal ) {
		if ( ! config.renewUrl ) { throw new Error( 'Your editing session expired. Sign in again in another tab, then retry. Your draft is retained.' ); }
		if ( ! renewal ) {
			renewal = ( async () => {
				const controller = new win.AbortController(); const timer = win.setTimeout( () => controller.abort(), 15000 );
				try { const response = await nativeFetch( config.renewUrl, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal } ); const value = ( await response.text() ).trim(); if ( ! response.ok || ! validNonce( value ) ) { throw new Error( 'Your editing session expired. Sign in again in another tab, then retry. Your draft is retained.' ); } nonce = value; return value; }
				finally { win.clearTimeout( timer ); }
			} )().finally( () => { renewal = null; } );
		}
		const value = await renewal; if ( signal?.aborted ) { throw new win.DOMException( 'Request cancelled', 'AbortError' ); } return value;
	}
	async function request( url, options = {} ) {
		const target = new URL( String( url ), win.location.href ), base = new URL( config.root || win.location.href );
		const headers = new win.Headers( options.headers || {} );
		if ( target.origin !== base.origin || ! target.href.startsWith( base.href ) || ! headers.has( 'X-WP-Nonce' ) ) { return nativeFetch( url, options ); }
		const controller = new win.AbortController(); const abort = () => controller.abort();
		if ( options.signal?.aborted ) { abort(); } else { options.signal?.addEventListener( 'abort', abort, { once: true } ); }
		const timer = win.setTimeout( abort, 30000 );
		try {
			for ( let attempt = 0; attempt < 2; attempt++ ) {
				headers.set( 'X-WP-Nonce', nonce || headers.get( 'X-WP-Nonce' ) );
				const response = await nativeFetch( url, { ...options, headers, signal: controller.signal, credentials: 'same-origin' } );
				const updated = response.headers?.get( 'X-WP-Nonce' ); if ( validNonce( updated ) ) { nonce = updated; }
				if ( attempt === 0 && response.status === 403 ) {
					let error; try { error = await response.clone().json(); } catch ( ignored ) {}
					if ( error?.code === 'rest_cookie_invalid_nonce' ) { await renew( controller.signal ); continue; }
				}
				// Keep the timeout active until the body arrives, not just its headers.
				if ( response.clone && response.arrayBuffer ) { await response.clone().arrayBuffer(); }
				return response;
			}
		} finally { win.clearTimeout( timer ); options.signal?.removeEventListener( 'abort', abort ); }
	}
	return { fetch: request, renew };
} ) );
