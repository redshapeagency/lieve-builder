/* Inherited template previews never become page nodes, assignments or Undo entries. */
( function () {
	'use strict';
	const before = [ 'before_header', 'header', 'after_header', 'before_content' ];
	const after = [ 'after_content', 'before_footer', 'footer', 'after_footer' ];
	const titles = { header: 'Header', footer: 'Footer', before_header: 'Before header', after_header: 'After header', before_content: 'Before content', after_content: 'After content', before_footer: 'Before footer', after_footer: 'After footer' };
	function create( { config, onChange, onError } ) {
		let placements = Array.isArray( config.templateContext?.placements ) ? config.templateContext.placements : [];
		let key = Number( config.headerTemplateId || 0 ) + '|' + Number( config.footerTemplateId || 0 );
		const cache = new Map( [ [ key, placements ] ] );
		let pending = null;
		let observedCanvas = null;
		const resize = typeof ResizeObserver === 'function' ? new ResizeObserver( () => measure( observedCanvas ) ) : null;
		function measure( canvas ) {
			if ( ! canvas ) { return; }
			const height = [ ...canvas.querySelectorAll( ':scope > .lieve-inherited-template' ) ].reduce( ( sum, item ) => sum + item.getBoundingClientRect().height, 0 );
			canvas.style.setProperty( '--lv-inherited-height', Math.ceil( height ) + 'px' );
		}
		async function refresh( header, footer, force = false ) {
			if ( config.isTemplate || ! config.templateContextUrl ) { return; }
			const next = Number( header || 0 ) + '|' + Number( footer || 0 );
			if ( ! force && next === key ) { return; }
			pending?.abort(); key = next;
			if ( force ) { cache.clear(); }
			else if ( cache.has( key ) ) { placements = cache.get( key ); return; }
			const job = new AbortController(); pending = job;
			try {
				const url = new URL( config.templateContextUrl, window.location.href );
				url.searchParams.set( 'headerTemplateId', Number( header || 0 ) ); url.searchParams.set( 'footerTemplateId', Number( footer || 0 ) );
				const response = await ( window.LieveTransport?.fetch || window.fetch.bind( window ) )(  url.href, { credentials: 'same-origin', signal: job.signal, headers: { 'X-WP-Nonce': config.nonce }, cache: 'no-store' } );
				const result = await response.json();
				if ( job.signal.aborted || next !== key ) { return; }
				if ( ! response.ok || ! Array.isArray( result.placements ) ) { throw new Error( result.message || 'Template previews could not be refreshed.' ); }
				placements = result.placements;
				if ( cache.size >= 8 ) { cache.delete( cache.keys().next().value ); }
				cache.set( key, placements ); onChange();
			} catch ( error ) { if ( ! job.signal.aborted && next === key ) { onError( error.message || 'Template previews could not be refreshed.' ); } }
			finally { if ( pending === job ) { pending = null; } }
		}
		function append( side, canvas ) {
			if ( config.isTemplate ) { return; }
			if ( side === 'before' ) { resize?.disconnect(); observedCanvas = canvas; }
			for ( const position of side === 'before' ? before : after ) {
				placements.filter( item => item.position === position ).forEach( item => {
					const preview = document.createElement( [ 'header', 'footer' ].includes( position ) ? position : 'div' );
					preview.className = 'lieve-inherited-template lieve-builder-content'; preview.dataset.inheritedKey = item.key;
					const content = document.createElement( 'div' ); content.className = 'lieve-inherited-template-content'; content.inert = true;
					content.innerHTML = item.html || '';
					content.querySelectorAll( 'style[data-lieve-styles]' ).forEach( sheet => sheet.remove() );
					const tools = document.createElement( 'div' ); tools.className = 'lieve-template-preview-tools'; tools.dataset.editorUi = '';
					const label = document.createElement( 'span' ); label.textContent = titles[ position ] + ' · ' + item.title;
					tools.appendChild( label );
					if ( item.editUrl ) {
						const link = document.createElement( 'a' ); link.href = item.editUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
						link.textContent = 'Edit template'; link.setAttribute( 'aria-label', 'Edit ' + item.title + ' template in a new tab' ); tools.appendChild( link );
					}
					preview.append( content, tools ); canvas.appendChild( preview ); resize?.observe( preview );
				} );
			}
		}
		function css( device ) {
			if ( config.isTemplate || ! window.LieveStyles ) { return ''; }
			return placements.map( item => ( item.styleNodes || [] ).map( node => window.LieveStyles.editorCss( node, config.styleTargets?.[ node.type ], device, 'normal', item.key ) ).join( '' ) ).join( '' );
		}
		return { refresh, append, css, measure, area: name => placements.find( item => item.position === name ) };
	}
	window.LieveTemplateContext = { create };
}() );
