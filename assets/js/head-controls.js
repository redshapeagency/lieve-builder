/* Shared global policy / page override controls. No code injection or asset execution. */
( function () {
	'use strict';
	const owns = ( object, key ) => Object.prototype.hasOwnProperty.call( object, key );
	const validKey = key => /^[a-z0-9][a-z0-9:_.-]{0,179}$/.test( key ) && ! [ '__proto__', 'constructor', 'prototype' ].includes( key );
	function normalize( value ) {
		const result = {}; if ( ! value || typeof value !== 'object' || Array.isArray( value ) ) { return result; }
		Object.keys( value ).filter( key => validKey( key ) && typeof value[key] === 'boolean' ).sort().slice( 0, 512 ).forEach( key => { result[key] = value[key]; } ); return result;
	}
	const escape = value => String( value ).replace( /[&<>"']/g, char => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } )[char] );
	let sequence = 0;
	function create( { root, config = {}, globalMode = false, showIntro = true, read, change, renderReset } ) {
		if ( ! root ) { return null; }
		root.classList.add( 'lieve-head-controls' );
		if ( config.template ) { root.innerHTML = '<div class="lieve-head-intro"><h2>Page head</h2><p>Head overrides belong to individual pages and posts. Open a page in the builder to manage its document head; reusable templates do not own a page head.</p></div>'; return { sync() {} }; }
		const prefix = 'lieve-head-' + ++sequence + '-'; const global = normalize( config.global );
		const actionClass = globalMode ? 'lieve-conditions-cancel' : 'lieve-button-secondary';
		const standardKeys = new Set( ( config.items || [] ).map( row => row.key ) );
		let items = new Map(), observed = null, scanned = false, scanning = false, query = '';
		const cacheKey = 'lieveHeadCatalog:' + location.origin + ':' + ( globalMode ? 'site' : new URL( config.scanUrl, location.href ).pathname + ':' + new URL( config.scanUrl, location.href ).searchParams.get( 'page_id' ) + ':' + new URL( config.scanUrl, location.href ).searchParams.get( 'p' ) );
		function merge( rows ) {
			if ( ! Array.isArray( rows ) ) { return; }
			rows.slice( 0, 512 ).forEach( row => { if ( validKey( row?.key || '' ) && typeof row.label === 'string' && typeof row.group === 'string' && ( items.size < 512 || items.has( row.key ) ) ) { const known = standardKeys.has( row.key ) ? items.get( row.key ) : null; items.set( row.key, { key: row.key, label: ( known?.label || row.label ).slice( 0, 160 ), group: known?.group || row.group.slice( 0, 60 ), sensitive: Boolean( row.sensitive || known?.sensitive ) } ); } } );
		}
		merge( config.items );
		try { merge( JSON.parse( localStorage.getItem( cacheKey ) || '[]' ) ); } catch ( error ) { /* Storage is optional. */ }
		Object.keys( { ...global, ...normalize( read() ) } ).forEach( key => { if ( ! items.has( key ) ) { items.set( key, { key, label: key, group: 'Saved controls', sensitive: true } ); } } );
		root.innerHTML = ( globalMode || ! showIntro ? '' : '<div class="lieve-head-intro"><h2>Page head</h2><p>Override site defaults for this page. Inherited controls continue to follow Settings → Head.</p></div>' ) +
			'<div class="lieve-head-toolbar"><button type="button" class="lieve-head-button ' + actionClass + '" data-head-scan>Scan page head</button>' + ( globalMode ? '<button type="button" class="lieve-head-button ' + actionClass + '" data-head-reset-all>Reset to defaults</button>' : renderReset( 'data-head-reset-all', 'Reset to global', false, 'Reset all page head overrides to global' ) ) + '</div>' +
			'<p class="lieve-head-note">Disabling document metadata can affect SEO and responsive layout. Disabling styles or scripts can break site features. Only HTML inside &lt;head&gt; is affected, not HTTP headers or footer assets.</p>' +
			'<label class="lieve-head-search' + ( globalMode ? ' lieve-ds-field' : '' ) + '"><span class="screen-reader-text">Search head elements</span><input type="search" placeholder="Search head elements…" aria-label="Search head elements"></label>' +
			'<div class="lieve-head-status" role="status" aria-live="polite">Standard controls are ready. Scan to discover integration tags and assets.</div><div data-head-groups></div><p class="lieve-head-empty" hidden>No matching head elements.</p>' +
			'<p class="lieve-head-footnote">An enabled control allows existing output; it does not create a missing tag. ' + ( globalMode ? 'Save Settings to publish changes.' : 'Use Save or ⌘S / Ctrl+S to publish page overrides.' ) + '</p>';
		const groups = root.querySelector( '[data-head-groups]' ), resetAll = root.querySelector( '[data-head-reset-all]' ), scan = root.querySelector( '[data-head-scan]' ), status = root.querySelector( '[role="status"]' );
		function rebuild() {
			const opened = new Map( [ ...groups.querySelectorAll( 'details' ) ].map( group => [ group.dataset.group, group.open ] ) ); const grouped = new Map();
			items.forEach( row => { if ( ! grouped.has( row.group ) ) { grouped.set( row.group, [] ); } grouped.get( row.group ).push( row ); } );
			groups.innerHTML = [ ...grouped ].map( ( [ group, rows ], index ) => '<details class="lieve-head-group lieve-ds-color-section" data-group="' + escape( group ) + '"' + ( opened.get( group ) === true ? ' open' : '' ) + '><summary><strong>' + escape( group ) + '</strong><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m6 9 6 6 6-6"/></svg></span></summary><div class="lieve-head-rows">' + rows.map( ( row, rowIndex ) => {
				const id = prefix + index + '-' + rowIndex;
				const reset = globalMode ? '<button type="button" class="lieve-head-reset ' + actionClass + '" data-head-reset aria-label="Reset to default: ' + escape( row.label ) + '" title="Reset to default">Reset to defaults</button>' : renderReset( 'data-head-reset', 'Reset to global: ' + row.label );
				return '<div class="lieve-head-row" data-head-key="' + escape( row.key ) + '"><div class="lieve-head-copy"><label for="' + id + '">' + escape( row.label ) + '</label><code>' + escape( row.key ) + '</code><span class="lieve-head-source"></span>' + ( row.sensitive ? '<small>Changes may affect site functionality.</small>' : '' ) + '</div><div class="lieve-head-actions"><label class="' + ( globalMode ? 'lieve-settings-popup-switch' : 'lieve-head-switch' ) + '"><input type="checkbox" role="switch" id="' + id + '" aria-label="Output ' + escape( row.label ) + '"><span' + ( globalMode ? ' class="lieve-template-toggle-track"' : '' ) + '></span></label>' + reset + '</div></div>';
			} ).join( '' ) + '</div></details>' ).join( '' ); sync(); filter();
		}
		function sync() {
			const draft = normalize( read() ); resetAll.disabled = ! Object.keys( draft ).length;
			root.querySelectorAll( '[data-head-key]' ).forEach( row => {
				const key = row.dataset.headKey, own = owns( draft, key ), enabled = own ? draft[key] : globalMode ? true : global[key] ?? true;
				row.querySelector( 'input' ).checked = enabled;
				row.querySelector( '[data-head-reset]' ).disabled = ! own;
				row.classList.toggle( 'is-override', ! globalMode && own );
				row.querySelector( '.lieve-head-source' ).textContent = ( globalMode ? own ? 'Site default · Off' : 'Default · On' : own ? 'Page override · ' + ( enabled ? 'On' : 'Off' ) : 'Inherited · ' + ( enabled ? 'On' : 'Off' ) ) + ( scanned && ! observed?.has( key ) ? ' · Not detected' : '' );
			} );
		}
		function filter() {
			let visible = 0;
			groups.querySelectorAll( 'details' ).forEach( group => {
				let count = 0; group.querySelectorAll( '[data-head-key]' ).forEach( row => { const item = items.get( row.dataset.headKey ); row.hidden = ! ( item.label + ' ' + item.key + ' ' + item.group ).toLowerCase().includes( query ); if ( ! row.hidden ) { count++; } } );
				group.hidden = ! count; if ( query && count ) { group.open = true; } visible += count;
			} ); root.querySelector( '.lieve-head-empty' ).hidden = visible > 0;
		}
		root.addEventListener( 'change', event => {
			const row = event.target.closest( '[data-head-key]' ); if ( ! row || event.target.type !== 'checkbox' ) { return; }
			const next = normalize( read() ), key = row.dataset.headKey;
			if ( globalMode && event.target.checked ) { delete next[key]; } else { next[key] = event.target.checked; }
			change( normalize( next ) ); sync();
		} );
		root.addEventListener( 'click', event => {
			const button = event.target.closest( '[data-head-reset]' ); if ( ! button || button.disabled ) { return; }
			const next = normalize( read() ); delete next[button.closest( '[data-head-key]' ).dataset.headKey]; change( next ); sync();
		} );
		resetAll.addEventListener( 'click', () => { change( {} ); sync(); } );
		root.querySelector( 'input[type="search"]' ).addEventListener( 'input', event => { query = event.target.value.trim().toLowerCase(); filter(); } );
		scan.addEventListener( 'click', async () => {
			if ( scanning ) { return; } scanning = true; scan.disabled = true; status.textContent = 'Scanning this page’s unfiltered HEAD…'; status.classList.remove( 'is-error' );
			const controller = new AbortController(), timeout = setTimeout( () => controller.abort(), 20000 );
			try {
				const url = new URL( config.scanUrl, location.href ); if ( url.origin !== location.origin ) { throw new Error( 'The scan must use this site’s frontend URL.' ); }
				const response = await fetch( url.href, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } } ); const result = await response.json();
				if ( ! response.ok || ! Array.isArray( result.items ) || ! result.complete ) { throw new Error( result.data?.message || 'The page HEAD could not be inspected. Check that its frontend is accessible, then try again.' ); }
				merge( result.items ); observed = new Set( result.items.map( row => row.key ) ); scanned = true; rebuild();
				try { localStorage.setItem( cacheKey, JSON.stringify( [ ...items.values() ] ) ); } catch ( error ) { /* Optional metadata-only cache. */ }
				status.textContent = result.items.length + ' HEAD elements detected. No settings changed.';
			} catch ( error ) { status.textContent = error.name === 'AbortError' ? 'The scan timed out. Your draft is unchanged; try again.' : error.message || 'Scan failed. Your draft is unchanged.'; status.classList.add( 'is-error' ); }
			finally { clearTimeout( timeout ); scanning = false; scan.disabled = false; }
		} );
		rebuild(); return { sync };
	}
	window.LieveHead = { normalize, create };
}() );
