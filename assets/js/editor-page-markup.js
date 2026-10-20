/* Page-shell IDs, separate from the selected element's Markup inspector. */
( function () {
	'use strict';
	const defaults = { body: '', main: 'main-content' };
	const own = ( object, key ) => Object.prototype.hasOwnProperty.call( object, key );
	const validId = value => typeof value === 'string' && /^(?:[A-Za-z_][A-Za-z0-9_-]{0,127})?$/.test( value ) && ! /[\r\n]/.test( value );
	function normalize( value ) {
		const out = {};
		for ( const target of Object.keys( defaults ) ) {
			const row = value?.[target]; if ( ! row || typeof row !== 'object' || Array.isArray( row ) ) { continue; }
			const clean = {};
			if ( typeof row.enabled === 'boolean' ) { clean.enabled = row.enabled; }
			// Retain an unfinished text draft for correction, never silently replace it on save.
			if ( typeof row.custom === 'string' ) { clean.custom = row.custom; }
			if ( Object.keys( clean ).length ) { out[target] = clean; }
		}
		return out;
	}
	function ids( page, global = {} ) {
		const out = {};
		for ( const target of Object.keys( defaults ) ) { const row = { enabled: true, custom: '', ...global[target], ...page[target] }; out[target] = row.enabled ? row.custom || defaults[target] : ''; }
		return out;
	}
	function errors( page, global ) {
		const out = {};
		for ( const target of Object.keys( defaults ) ) { if ( own( page[target] || {}, 'custom' ) && ! validId( page[target].custom ) ) { out[target] = 'Start with a letter or underscore. Use letters, digits, hyphens or underscores, up to 128 characters; no # or spaces.'; } }
		const values = ids( page, global ); if ( values.body && values.body === values.main ) { out.body = out.main = 'Body and Main must use different HTML IDs.'; }
		return out;
	}
	function create( { root, global = {}, template = false, embedded = false, read, change, renderReset } ) {
		if ( ! root ) { return null; }
		root.classList.add( 'lieve-head-controls', 'lieve-page-markup' );
		root.innerHTML = embedded ? '' : '<div class="lieve-head-intro"><h2>Page markup</h2><p>' + ( template ? 'Body and Main belong to individual pages, not reusable templates. Open a page to override its shell IDs.' : 'Manage Body and Main for this page. These controls are independent of the selected widget. Inherited values follow Settings → Markup.' ) + '</p></div>';
		if ( template ) { return { sync() {}, validate: () => true }; }
		root.innerHTML += '<div class="lieve-page-markup-heading"><h3>' + ( embedded ? 'Body & Main' : 'Page IDs' ) + '</h3>' + renderReset( 'data-page-markup-reset-all', 'Reset all page IDs to global', false, 'Reset to global' ) + '</div>' + Object.keys( defaults ).map( target => {
			const label = target === 'body' ? 'Body' : 'Main', prefix = 'lieve-page-markup-' + target;
			return '<section class="lieve-page-markup-target" data-page-markup-target="' + target + '" aria-labelledby="' + prefix + '-title"><h3 id="' + prefix + '-title">' + label + '</h3><div class="lieve-control lieve-element-id"><div class="lieve-field-heading lieve-identity-heading"><div class="lieve-markup-field-copy"><span>Output HTML ID</span><span class="lieve-identity-status" data-page-markup-source></span></div><label class="lieve-checkbox lieve-identity-toggle"><input type="checkbox" role="switch" data-page-markup-enabled aria-label="' + label + ': Output HTML ID"></label>' + renderReset( 'data-page-markup-reset="enabled"', 'Use global ID output for ' + label ) + '</div><label for="' + prefix + '-custom">Custom HTML ID</label><div class="lieve-element-id-input"><input id="' + prefix + '-custom" type="text" data-page-markup-custom maxlength="128" autocomplete="off" spellcheck="false" aria-describedby="' + prefix + '-help ' + prefix + '-error">' + renderReset( 'data-page-markup-reset="custom"', 'Use global ID for ' + label ) + '</div><p class="lieve-element-id-help" id="' + prefix + '-help">' + ( target === 'main' ? 'Automatic ID: main-content.' : 'Body has no automatic ID.' ) + ' Clear the field to use the automatic ID; reset to inherit the global value.</p><p class="lieve-page-markup-error" id="' + prefix + '-error" data-page-markup-error role="status" hidden></p><code class="lieve-page-markup-preview" data-page-markup-preview></code></div></section>';
		} ).join( '' ) + '<p class="lieve-head-footnote">One ID per element. Save or ⌘S / Ctrl+S publishes page overrides. Changing or disabling an ID can affect custom CSS and anchor links that reference it.</p>';
		function sync() {
			const page = normalize( read() ), issues = errors( page, global ), values = ids( page, global );
			root.querySelector( '[data-page-markup-reset-all]' ).disabled = ! Object.keys( page ).length;
			root.querySelectorAll( '[data-page-markup-target]' ).forEach( row => {
				const target = row.dataset.pageMarkupTarget, draft = page[target] || {}, base = { enabled: true, custom: '', ...global[target] }, enabled = draft.enabled ?? base.enabled;
				row.querySelector( '[data-page-markup-enabled]' ).checked = enabled;
				row.querySelector( '[data-page-markup-source]' ).textContent = ( own( draft, 'enabled' ) ? 'Page override' : 'Inherited' ) + ' · ' + ( enabled ? 'On' : 'Off' );
				const input = row.querySelector( '[data-page-markup-custom]' ); input.value = draft.custom ?? ''; input.placeholder = ( own( draft, 'custom' ) ? defaults[target] : base.custom || defaults[target] ) || 'No ID'; input.setAttribute( 'aria-invalid', String( Boolean( issues[target] ) ) );
				input.classList.toggle( 'is-inherited', ! own( draft, 'custom' ) );
				row.querySelectorAll( '[data-page-markup-reset]' ).forEach( button => { button.disabled = ! own( draft, button.dataset.pageMarkupReset ); } );
				const error = row.querySelector( '[data-page-markup-error]' ); error.hidden = ! issues[target]; error.textContent = issues[target] || '';
				row.querySelector( '[data-page-markup-preview]' ).textContent = '<' + target + ( values[target] ? ' id="' + values[target] + '"' : '' ) + '>';
			} );
		}
		function write( target, key, value, remove = false ) {
			const page = normalize( read() ); page[target] ||= {};
			if ( remove ) { delete page[target][key]; } else { page[target][key] = value; }
			if ( ! Object.keys( page[target] ).length ) { delete page[target]; }
			change( page, target + ':' + key, key === 'enabled' || remove ); sync();
		}
		root.addEventListener( 'input', event => { if ( event.target.matches( '[data-page-markup-custom]' ) ) { write( event.target.closest( '[data-page-markup-target]' ).dataset.pageMarkupTarget, 'custom', event.target.value ); } } );
		root.addEventListener( 'change', event => { if ( event.target.matches( '[data-page-markup-enabled]' ) ) { write( event.target.closest( '[data-page-markup-target]' ).dataset.pageMarkupTarget, 'enabled', event.target.checked ); } } );
		root.addEventListener( 'click', event => {
			const all = event.target.closest( '[data-page-markup-reset-all]' ); if ( all && ! all.disabled ) { change( {}, 'reset-all', true ); sync(); return; }
			const button = event.target.closest( '[data-page-markup-reset]' ); if ( button && ! button.disabled ) { write( button.closest( '[data-page-markup-target]' ).dataset.pageMarkupTarget, button.dataset.pageMarkupReset, null, true ); }
		} );
		sync(); return { sync, validate( reveal = false ) { const issues = errors( normalize( read() ), global ); sync(); if ( ! Object.keys( issues ).length ) { return true; } if ( reveal ) { const section = root.closest( '[data-page-markup-section]' ); if ( section ) { section.open = true; } root.querySelector( '[aria-invalid="true"]' )?.focus(); } return false; } };
	}
	window.LievePageMarkup = { normalize, ids, errors, validId, create };
}() );
