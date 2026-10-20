/* Page metadata UI. No remote scoring, content execution or independent save endpoint. */
( function () {
	'use strict';
	const defaults = () => ( { output: false, title: '', description: '', canonical: '', index: 'default', follow: 'default', noSnippet: false, noImageIndex: false, noTranslate: false, maxSnippet: '', maxVideoPreview: '', maxImagePreview: 'default', ogType: 'default', ogTitle: '', ogDescription: '', ogImageId: 0, ogImageUrl: '', ogImageAlt: '', twitterCard: 'summary_large_image', twitterTitle: '', twitterDescription: '', twitterImageId: 0, twitterImageUrl: '', twitterImageAlt: '', twitterSite: '', twitterCreator: '', schemaType: '', schemaJson: '', languages: [] } );
	const normalize = value => ( { ...defaults(), ...value, languages: Array.isArray( value?.languages ) ? value.languages.map( row => ( { lang: row.lang || '', url: row.url || '' } ) ) : [] } );
	const enums = { index: [ [ 'default', 'Inherit WordPress' ], [ 'index', 'Allow indexing' ], [ 'noindex', 'Do not index' ] ], follow: [ [ 'default', 'Inherit WordPress' ], [ 'follow', 'Follow links' ], [ 'nofollow', 'Do not follow links' ] ], maxImagePreview: [ [ 'default', 'Inherit WordPress' ], [ 'none', 'None' ], [ 'standard', 'Standard' ], [ 'large', 'Large' ] ], ogType: [ [ 'default', 'Automatic' ], [ 'website', 'Website' ], [ 'article', 'Article' ] ], twitterCard: [ [ 'summary_large_image', 'Large image' ], [ 'summary', 'Summary' ] ], schemaType: [ [ '', 'None / custom JSON-LD only' ], [ 'WebPage', 'Web page' ], [ 'AboutPage', 'About page' ], [ 'ContactPage', 'Contact page' ], [ 'CollectionPage', 'Collection page' ], [ 'Article', 'Article' ] ] };
	const clone = value => JSON.parse( JSON.stringify( value ) );
	const escape = value => String( value ?? '' ).replace( /[&<>"']/g, char => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } )[ char ] );
	function httpUrl( value, fragment = true ) {
		try { const url = new URL( value ); return ! /[\s<>]/.test( value ) && value.length <= 2048 && [ 'http:', 'https:' ].includes( url.protocol ) && Boolean( url.hostname ) && ! url.username && ! url.password && ( fragment || ! url.hash ); } catch ( error ) { return false; }
	}
	function sharingImage( data, context, prefix ) {
		const explicit = name => data[ name + 'ImageUrl' ] || ( data[ name + 'ImageId' ] && data[ name + 'ImageId' ] === context[ name + 'Image' ]?.id ? context[ name + 'Image' ].url : '' );
		const social = explicit( 'og' ) || context.featuredImage?.url || '';
		return prefix === 'twitter' ? explicit( 'twitter' ) || social : social;
	}
	function schemaReport( json ) {
		const rules = window.LieveBuilderConfig?.seoSchemaRules || {};
		const result = { errors: [], advice: [] }; let nodes = 0;
		const object = value => Boolean( value && typeof value === 'object' && ! Array.isArray( value ) );
		const label = value => { const chars = Array.from( value ); return chars.length > 180 ? chars.slice( 0, 180 ).join( '' ) + '…' : value; };
		const error = ( path, message ) => { const value = label( path ) + ': ' + message; if ( result.errors.length < 12 && ! result.errors.includes( value ) ) { result.errors.push( value ); } };
		const warn = message => { message = label( message ); if ( result.advice.length < 12 && ! result.advice.includes( message ) ) { result.advice.push( message ); } };
		const types = node => ( Array.isArray( node?.[ '@type' ] ) ? node[ '@type' ] : node?.[ '@type' ] !== undefined ? [ node[ '@type' ] ] : [] ).map( value => typeof value === 'string' ? value.replace( /^(?:https?:\/\/schema\.org\/|schema:)/, '' ) : '' );
		const iri = value => typeof value === 'string' && value.length <= 2048 && ! /[\s<>]/.test( value ) && ( httpUrl( value ) || /^(?:#[^\s]+|_:[a-zA-Z0-9_-]+|urn:[a-zA-Z0-9][^\s]*)$/.test( value ) );
		const text = value => typeof value === 'string' || ( object( value ) && typeof value[ '@value' ] === 'string' );
		const literal = value => object( value ) && Object.hasOwn( value, '@value' ) ? value[ '@value' ] : value;
		const numeric = value => ( typeof value === 'number' || ( typeof value === 'string' && value.trim() !== '' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test( value.trim() ) ) ) && Number.isFinite( Number( value ) );
		const date = value => {
			if ( typeof value !== 'string' ) { return false; }
			const parts = value.match( /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/ ); if ( ! parts ) { return false; }
			const year = Number( parts[1] ), month = Number( parts[2] ), day = Number( parts[3] ); const leap = year % 4 === 0 && ( year % 100 !== 0 || year % 400 === 0 ); const days = [ 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ];
			return year > 0 && month > 0 && month <= 12 && day > 0 && day <= days[ month - 1 ] && ( ! parts[4] || ( Number( parts[4] ) <= 23 && Number( parts[5] ) <= 59 && ( ! parts[6] || Number( parts[6] ) <= 59 ) ) ) && ( ! parts[7] || parts[7] === 'Z' || ( Number( parts[7].slice( 1, 3 ) ) <= 23 && Number( parts[7].slice( 4 ) ) <= 59 ) );
		};
		const has = ( kind, key ) => ( rules[ kind ] || [] ).includes( key );
		function walk( node, path, depth, schema ) {
			if ( ++nodes > 1500 || depth > 30 ) { error( path, 'Use a smaller JSON-LD graph (up to 1500 values and 30 levels).' ); return; }
			if ( Array.isArray( node ) ) { node.forEach( ( item, index ) => walk( item, path + '[' + index + ']', depth + 1, schema ) ); return; }
			if ( typeof node === 'number' && ! Number.isFinite( node ) ) { error( path, 'JSON numbers must be finite.' ); return; }
			if ( ! object( node ) ) { return; }
			if ( Object.hasOwn( node, '@context' ) ) {
				const contexts = Array.isArray( node[ '@context' ] ) ? node[ '@context' ] : [ node[ '@context' ] ]; schema = false;
				if ( ! contexts.length ) { error( path + '.@context', 'Provide a context URL or an inline context object.' ); }
				contexts.forEach( entry => {
					if ( typeof entry === 'string' ) { if ( ! httpUrl( entry ) ) { error( path + '.@context', 'Context URLs must use HTTP(S).' ); } if ( /^https?:\/\/schema\.org\/?$/.test( entry ) ) { schema = true; } }
					else if ( object( entry ) ) { if ( entry[ '@vocab' ] !== undefined ) { if ( typeof entry[ '@vocab' ] !== 'string' ) { error( path + '.@context.@vocab', 'Use a vocabulary URL.' ); } else { schema = /^https?:\/\/schema\.org\/?$/.test( entry[ '@vocab' ] ); } } }
					else { error( path + '.@context', 'Provide a context URL or an inline context object.' ); }
				} );
				if ( ! schema ) { warn( 'Custom contexts are not resolved remotely; their vocabulary needs external validation.' ); }
			}
			if ( node[ '@id' ] !== undefined && ! iri( node[ '@id' ] ) ) { error( path + '.@id', 'Use an HTTP(S) URL, fragment, blank-node ID or URN.' ); }
			if ( Object.hasOwn( node, '@value' ) ) {
				if ( node[ '@id' ] !== undefined || node[ '@graph' ] !== undefined ) { error( path, 'A value object cannot also be an identified node or graph.' ); }
				if ( node[ '@language' ] !== undefined && ( typeof node[ '@language' ] !== 'string' || typeof node[ '@value' ] !== 'string' ) ) { error( path, 'Language-tagged values need text and a language string.' ); }
				if ( node[ '@language' ] !== undefined && node[ '@type' ] !== undefined ) { error( path, 'Choose a language tag or an explicit value type, not both.' ); }
				if ( node[ '@type' ] !== undefined && typeof node[ '@type' ] !== 'string' ) { error( path, 'Value-object types must be strings.' ); }
				if ( ( object( node[ '@value' ] ) || Array.isArray( node[ '@value' ] ) ) && node[ '@type' ] !== '@json' ) { error( path, 'Object/array values need the @json value type.' ); }
				if ( typeof node[ '@value' ] === 'number' && ! Number.isFinite( node[ '@value' ] ) ) { error( path, 'JSON numbers must be finite.' ); }
				return;
			}
			if ( Object.hasOwn( node, '@graph' ) ) { if ( ! Array.isArray( node[ '@graph' ] ) || ! node[ '@graph' ].length ) { error( path + '.@graph', 'Provide a non-empty array of node objects.' ); } else { node[ '@graph' ].forEach( item => { if ( ! object( item ) || ( item[ '@type' ] === undefined && item[ '@id' ] === undefined && item[ '@graph' ] === undefined ) ) { error( path + '.@graph', 'Each graph entry needs @type, @id or @graph.' ); } } ); } }
			const names = types( node );
			if ( Object.hasOwn( node, '@type' ) ) {
				const entries = Array.isArray( node[ '@type' ] ) ? node[ '@type' ] : [ node[ '@type' ] ];
				if ( ! entries.length || entries.length > 20 ) { error( path + '.@type', 'Provide one type or up to 20 type names.' ); }
				entries.forEach( value => { if ( typeof value !== 'string' || ! /^(?:[a-zA-Z][a-zA-Z0-9_-]*(?::[a-zA-Z][a-zA-Z0-9_-]*)?|https?:\/\/[^\s<>]+)$/.test( value ) ) { error( path + '.@type', 'Types must be non-empty names or absolute HTTP(S) IRIs.' ); } } );
			}
			if ( schema ) {
				names.forEach( name => { if ( ! has( 'types', name ) ) { warn( 'No built-in completeness profile for ' + name + '; validate this type externally.' ); } const missing = ( rules.recommended?.[ name ] || [] ).filter( key => node[ key ] == null || node[ key ] === '' || ( Array.isArray( node[ key ] ) && ! node[ key ].length ) ); if ( missing.length ) { warn( name + ': consider adding ' + missing.join( ', ' ) + ' where applicable.' ); } } );
				Object.entries( node ).forEach( ( [ key, value ] ) => {
					( Array.isArray( value ) ? value : [ value ] ).forEach( item => {
						const scalar = literal( item );
						if ( has( 'text', key ) && ! text( item ) ) { error( path + '.' + key, 'Use text, not a number or an object.' ); }
						if ( has( 'urls', key ) && ! ( typeof scalar === 'string' && httpUrl( scalar ) ) && ! ( object( item ) && iri( item[ '@id' ] ) ) ) { error( path + '.' + key, 'Use an absolute HTTP(S) URL or an identified node.' ); }
						if ( has( 'dates', key ) && ! date( scalar ) ) { error( path + '.' + key, 'Use a real ISO 8601 date or date/time.' ); }
						if ( has( 'numbers', key ) && ( ! numeric( scalar ) || ( has( 'nonnegativeNumbers', key ) && Number( scalar ) < 0 ) ) ) { error( path + '.' + key, 'Use a finite number; prices cannot be negative.' ); }
						if ( has( 'integers', key ) && ( ! numeric( scalar ) || ( typeof scalar === 'string' && ! /^\d+$/.test( scalar ) ) || ! Number.isInteger( Number( scalar ) ) || Number( scalar ) < 0 || ( key === 'position' && Number( scalar ) < 1 ) ) ) { error( path + '.' + key, 'Use a non-negative whole number (positions start at 1).' ); }
						if ( has( 'images', key ) && ! ( typeof item === 'string' && httpUrl( item ) ) && ! ( object( item ) && ( item[ '@id' ] !== undefined || types( item ).includes( 'ImageObject' ) ) ) ) { error( path + '.' + key, 'Use an HTTP(S) image URL or ImageObject.' ); }
						if ( rules.relations?.[ key ] && ( ! object( item ) || ( item[ '@id' ] === undefined && ! types( item ).some( name => rules.relations[ key ].includes( name ) ) ) ) ) { error( path + '.' + key, 'Use an identified node or ' + rules.relations[ key ].join( ' / ' ) + ' object.' ); }
						if ( has( 'nodesOrUrls', key ) && ! ( typeof scalar === 'string' && httpUrl( scalar ) ) && ! ( object( item ) && ( item[ '@id' ] !== undefined || item[ '@type' ] !== undefined ) ) ) { error( path + '.' + key, 'Use an HTTP(S) URL, identified node or typed node.' ); }
					} );
					if ( key === 'priceCurrency' && ( typeof value !== 'string' || ! /^[A-Z]{3}$/.test( value ) ) ) { error( path + '.' + key, 'Use a three-letter uppercase currency code, such as EUR.' ); }
				} );
				if ( names.includes( 'BreadcrumbList' ) && node.itemListElement !== undefined ) { const items = node.itemListElement, positions = new Set(); if ( ! Array.isArray( items ) ) { error( path + '.itemListElement', 'Use an array of ListItem nodes.' ); } else { items.forEach( item => { if ( ! object( item ) || ! types( item ).includes( 'ListItem' ) ) { error( path + '.itemListElement', 'Each breadcrumb must be a ListItem.' ); return; } if ( item.position !== undefined && [ 'string', 'number', 'boolean' ].includes( typeof item.position ) ) { const position = String( item.position ); if ( positions.has( position ) ) { error( path + '.itemListElement', 'Breadcrumb positions must be unique.' ); } positions.add( position ); } } ); if ( items.length < 2 ) { warn( 'BreadcrumbList: Google breadcrumb results need at least two list items.' ); } } }
			}
			Object.entries( node ).forEach( ( [ key, value ] ) => { if ( typeof value === 'number' && ! Number.isFinite( value ) ) { error( path + '.' + key, 'JSON numbers must be finite.' ); } if ( key !== '@context' && ( object( value ) || Array.isArray( value ) ) ) { walk( value, path + '.' + key, depth + 1, schema ); } } );
		}
		if ( ! object( json ) || json[ '@context' ] === undefined || ( json[ '@type' ] === undefined && json[ '@graph' ] === undefined ) ) { error( 'JSON-LD', 'Provide an object with @context and @type or @graph.' ); } else { walk( json, 'JSON-LD', 0, false ); }
		return result;
	}
	function errors( data ) {
		const result = {};
		for ( const key of [ 'canonical', 'ogImageUrl', 'twitterImageUrl' ] ) { if ( data[ key ].trim() && ! httpUrl( data[ key ].trim(), key !== 'canonical' ) ) { result[ key ] = 'Use an absolute HTTP(S) URL' + ( key === 'canonical' ? ' without a fragment.' : '.' ); } }
		for ( const key of [ 'maxSnippet', 'maxVideoPreview' ] ) { if ( data[ key ] !== '' && ( ! /^(?:-1|\d{1,5})$/.test( data[ key ] ) || Number( data[ key ] ) > 10000 ) ) { result[ key ] = 'Use -1 or a number from 0 to 10000.'; } }
		for ( const key of [ 'twitterSite', 'twitterCreator' ] ) { if ( data[ key ].trim() && ! /^@?[a-zA-Z0-9_]{1,30}$/.test( data[ key ].trim() ) ) { result[ key ] = 'Use a handle with letters, digits and underscores.'; } }
		if ( data.schemaJson.trim() ) {
			try { const json = JSON.parse( data.schemaJson ); if ( ! json || Array.isArray( json ) || ! json[ '@context' ] || ! ( json[ '@type' ] || json[ '@graph' ] ) || new TextEncoder().encode( data.schemaJson ).length > 30000 ) { throw new Error(); } const report = schemaReport( json ); if ( report.errors.length ) { result.schemaJson = report.errors.join( ' ' ); } }
			catch ( error ) { result.schemaJson = 'Use a valid JSON-LD object with @context and @type or @graph, under 30 KB. No script tags.'; }
		}
		const seen = new Set();
		data.languages.forEach( ( row, index ) => { const lang = row.lang.trim().toLowerCase(); if ( ! /^(?:x-default|[a-z]{2,3}(?:-[a-z0-9]{2,8})*)$/.test( lang ) || seen.has( lang ) || ! httpUrl( row.url.trim(), false ) ) { result[ 'language-' + index ] = 'Enter a unique language code and an absolute HTTP(S) URL without a fragment.'; } seen.add( lang ); } );
		return result;
	}
	const icon = path => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
	const resetIcon = icon( '<path d="M3 10a9 9 0 1 1 2.7 8M3 4v6h6"/>' );
	const trashIcon = icon( '<path d="M4 6h16M6 6l1 15h10l1-15M10 10v7M14 10v7"/>' );
	const copyIcon = icon( '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>' );
	function create( { root, context = {}, template = false, read, change, enhance = () => [] } ) {
		if ( ! root ) { return null; }
		root.classList.add( 'lieve-seo', 'lieve-page-settings-panel' );
		if ( template ) { root.innerHTML = '<div class="lieve-seo-intro lieve-page-settings-intro"><div class="lieve-page-settings-title-row"><h2>Page metadata</h2></div><p>SEO belongs to the published page or post, not its reusable template. Open that page in the builder to manage its metadata.</p></div>'; return { sync() {}, validate: () => true }; }
		function field( key, label, options = {} ) {
			const id = 'lieve-seo-' + key;
			let input = '<input id="' + id + '" data-seo-field="' + key + '" type="' + ( options.type || 'text' ) + '" placeholder="' + escape( options.placeholder || '' ) + '" maxlength="' + ( options.max || 2000 ) + '" autocomplete="off">';
			if ( options.area ) { input = '<textarea id="' + id + '" data-seo-field="' + key + '" rows="' + ( options.rows || 3 ) + '" placeholder="' + escape( options.placeholder || '' ) + '" maxlength="' + ( options.max || 2000 ) + '" spellcheck="' + ( key !== 'schemaJson' ) + '"></textarea>'; }
			if ( enums[ key ] ) { input = '<select id="' + id + '" data-seo-field="' + key + '">' + enums[ key ].map( ( [ value, text ] ) => '<option value="' + value + '">' + text + '</option>' ).join( '' ) + '</select>'; }
			return '<div class="lieve-control lieve-seo-field"><div class="lieve-seo-field-heading"><label for="' + id + '">' + label + '</label><button type="button" class="lieve-seo-reset" data-seo-reset="' + key + '" aria-label="Reset ' + label + '" title="Restore default">' + resetIcon + '</button></div>' + input + ( options.count ? '<span class="lieve-seo-count" data-seo-count="' + key + '" id="' + id + '-count"></span>' : '' ) + ( options.help ? '<p class="lieve-seo-help" id="' + id + '-help">' + options.help + '</p>' : '' ) + ( key === 'schemaJson' ? '<p class="lieve-seo-help" data-seo-schema-advice id="lieve-seo-schema-advice" hidden></p>' : '' ) + '<p class="lieve-seo-error" data-seo-error="' + key + '" id="' + id + '-error" role="alert" hidden></p></div>';
		}
		function toggle( key, title, help ) { return '<label class="lieve-seo-toggle"><span><strong>' + title + '</strong><small>' + help + '</small></span><span class="lieve-seo-switch"><input type="checkbox" role="switch" data-seo-field="' + key + '" aria-label="' + title + '"><span aria-hidden="true"></span></span></label>'; }
		function section( title, content, open = false ) { return '<details class="lieve-seo-section"' + ( open ? ' open' : '' ) + '><summary><strong>' + title + '</strong>' + icon( '<path d="m8 10 4 4 4-4"/>' ) + '</summary><div class="lieve-seo-section-body">' + content + '</div></details>'; }
		function imageFields( prefix, title ) { return '<div class="lieve-seo-image"><img data-seo-image="' + prefix + '" alt="' + title + ' preview" hidden><div class="lieve-seo-image-actions"><button type="button" class="lieve-button-secondary" data-seo-media="' + prefix + '">Choose image</button><button type="button" class="lieve-button-secondary" data-seo-remove-image="' + prefix + '">Remove</button></div>' + field( prefix + 'ImageUrl', title + ' URL', { type: 'url', placeholder: 'Featured image / inherited image', max: 2048 } ) + field( prefix + 'ImageAlt', 'Image alternative text', { placeholder: 'Describe the image, not the caption.' } ) + '</div>'; }
		root.innerHTML = '<div class="lieve-seo-intro lieve-page-settings-intro"><div class="lieve-page-settings-title-row"><h2>Page metadata</h2><button type="button" class="lieve-seo-reset" data-seo-reset-all aria-label="Reset SEO to defaults" title="Reset SEO to defaults">' + resetIcon + '</button></div><p>Saved with this page. Empty fields inherit sensible defaults.</p><p class="lieve-seo-status" data-seo-status></p></div>' +
			toggle( 'output', 'Output page metadata', 'Search and social metadata for this page.' ) +
			section( 'Search preview', '<div class="lieve-seo-preview" aria-label="Search result preview"><span data-seo-preview-url></span><strong data-seo-preview-title></strong><p data-seo-preview-description></p><small>Illustrative preview. Search engines may rewrite titles and snippets.</small></div>' ) +
			section( 'Search appearance', field( 'title', 'SEO title', { placeholder: context.title, count: true, max: 400, help: 'About 50–60 characters is a guide, not a ranking score.' } ) + field( 'description', 'Meta description', { area: true, placeholder: context.description || 'Describe what people will find on this page.', count: true, help: 'About 150–160 characters is a guide. The visible snippet can vary.' } ) + field( 'canonical', 'Canonical URL', { type: 'url', max: 2048, placeholder: context.url, help: 'Leave empty for the page’s WordPress canonical URL.' } ), true ) +
			section( 'Social sharing', field( 'ogType', 'Open Graph type' ) + field( 'ogTitle', 'Social title', { placeholder: 'Inherit SEO title' } ) + field( 'ogDescription', 'Social description', { area: true, placeholder: 'Inherit meta description' } ) + imageFields( 'og', 'Social image' ) + '<h3>X / Twitter card</h3>' + field( 'twitterCard', 'Card layout' ) + field( 'twitterTitle', 'Card title', { placeholder: 'Inherit social title' } ) + field( 'twitterDescription', 'Card description', { area: true, placeholder: 'Inherit social description' } ) + imageFields( 'twitter', 'Card image' ) + field( 'twitterSite', 'Site handle', { placeholder: '@yourbrand' } ) + field( 'twitterCreator', 'Creator handle', { placeholder: '@author' } ) ) +
			section( 'Indexing & previews', '<p class="lieve-seo-help">Page controls cannot override site-wide WordPress privacy. Noindex prevents search indexing; it does not block crawling.</p>' + field( 'index', 'Search indexing' ) + field( 'follow', 'Link following' ) + toggle( 'noSnippet', 'Hide text snippets', 'Disallow text snippets and video previews in search.' ) + toggle( 'noImageIndex', 'Exclude images from indexing', 'Applies to images on this page.' ) + toggle( 'noTranslate', 'Disable result translation', 'Ask supported crawlers not to translate this result.' ) + field( 'maxSnippet', 'Maximum snippet characters', { placeholder: 'Default · -1 = unlimited · 0 = none', max: 5 } ) + field( 'maxImagePreview', 'Maximum image preview' ) + field( 'maxVideoPreview', 'Maximum video preview seconds', { placeholder: 'Default · -1 = unlimited · 0 = none', max: 5 } ) ) +
			section( 'Structured data', field( 'schemaType', 'Page schema' ) + field( 'schemaJson', 'Additional JSON-LD', { area: true, rows: 8, max: 30000, placeholder: '{"@context":"https://schema.org","@type":"WebPage"}', help: 'Describe visible, accurate content only. Paste JSON, not script tags. Valid markup does not guarantee rich results.' } ) ) +
			section( 'Language alternates', '<div class="lieve-seo-alternates"><p class="lieve-seo-help">Use published equivalent pages, including this page itself. Reciprocal links must be configured on the other pages. Add x-default for a language selector or fallback.</p><div data-seo-languages></div><button type="button" class="lieve-button-secondary" data-seo-add-language>' + icon( '<path d="M12 5v14M5 12h14"/>' ) + 'Add language</button></div>' ) +
			'<p class="lieve-seo-footer">Metadata helps describe your content. It cannot guarantee rankings or rich results.</p>';
		const selects = enhance( root ); let languageSignature = '';
		function emit( key, mutate, discrete = false ) { const next = clone( read() ); mutate( next ); change( next, key, discrete ); }
		function renderLanguages( data ) {
			const holder = root.querySelector( '[data-seo-languages]' );
			if ( holder.children.length !== data.languages.length ) {
				holder.innerHTML = data.languages.map( ( row, index ) => '<div class="lieve-seo-language" data-seo-language-row="' + index + '"><div class="lieve-seo-language-heading"><strong>Alternate ' + ( index + 1 ) + '</strong><div><button type="button" class="lieve-seo-reset" data-seo-clone-language="' + index + '" aria-label="Duplicate alternate ' + ( index + 1 ) + '">' + copyIcon + '</button><button type="button" class="lieve-seo-reset" data-seo-delete-language="' + index + '" aria-label="Remove alternate ' + ( index + 1 ) + '">' + trashIcon + '</button></div></div><label for="lieve-seo-language-' + index + '">Language code</label><input id="lieve-seo-language-' + index + '" data-seo-language="' + index + '" data-seo-language-key="lang" aria-describedby="lieve-seo-language-' + index + '-error" placeholder="en, it, en-US or x-default" maxlength="50"><label for="lieve-seo-alternate-' + index + '">Alternate URL</label><input id="lieve-seo-alternate-' + index + '" data-seo-language="' + index + '" data-seo-language-key="url" aria-describedby="lieve-seo-language-' + index + '-error" type="url" placeholder="https://example.com/translated-page/" maxlength="2048"><p class="lieve-seo-error" id="lieve-seo-language-' + index + '-error" data-seo-error="language-' + index + '" role="alert" hidden></p></div>' ).join( '' );
			}
			holder.querySelectorAll( '[data-seo-language]' ).forEach( input => { const value = data.languages[ Number( input.dataset.seoLanguage ) ][ input.dataset.seoLanguageKey ]; if ( input.value !== value ) { input.value = value; } } );
			languageSignature = JSON.stringify( data.languages ); root.querySelector( '[data-seo-add-language]' ).disabled = data.languages.length >= 30;
		}
		function sync() {
			const data = read(); const invalid = errors( data );
			root.querySelectorAll( '[data-seo-field]' ).forEach( input => {
				const key = input.dataset.seoField;
				if ( input.type === 'checkbox' ) { input.checked = data[ key ]; }
				else if ( input.value !== data[ key ] ) { input.value = data[ key ]; }
				input.setAttribute( 'aria-invalid', String( Boolean( invalid[ key ] ) ) );
				const descriptionIds = [ 'error', 'count', 'help' ].map( suffix => 'lieve-seo-' + key + '-' + suffix ).filter( id => root.querySelector( '#' + id ) );
				if ( key === 'schemaJson' ) { descriptionIds.push( 'lieve-seo-schema-advice' ); }
				input.setAttribute( 'aria-describedby', descriptionIds.join( ' ' ) );
			} );
			if ( languageSignature !== JSON.stringify( data.languages ) ) { renderLanguages( data ); }
			root.querySelectorAll( '[data-seo-language]' ).forEach( input => input.setAttribute( 'aria-invalid', String( Boolean( invalid[ 'language-' + input.dataset.seoLanguage ] ) ) ) );
			root.querySelectorAll( '[data-seo-error]' ).forEach( field => { field.textContent = invalid[ field.dataset.seoError ] || ''; field.hidden = ! field.textContent; } );
			const advice = root.querySelector( '[data-seo-schema-advice]' ); advice.textContent = '';
			if ( data.schemaJson.trim() && ! invalid.schemaJson ) { try { advice.textContent = schemaReport( JSON.parse( data.schemaJson ) ).advice.slice( 0, 4 ).join( ' ' ); } catch ( error ) {} }
			advice.hidden = ! advice.textContent;
			selects.forEach( select => select.refresh() );
			root.querySelectorAll( '[data-seo-count]' ).forEach( field => { field.textContent = Array.from( data[ field.dataset.seoCount ] ).length + ' characters'; } );
			root.querySelector( '[data-seo-preview-title]' ).textContent = data.title || context.title || 'Page title';
			root.querySelector( '[data-seo-preview-description]' ).textContent = data.description || context.description || 'Add a description to introduce this page.';
			root.querySelector( '[data-seo-preview-url]' ).textContent = data.canonical || context.url || '';
			const status = root.querySelector( '[data-seo-status]' );
			status.textContent = context.provider ? context.provider + ' manages metadata. Lieve retains these fields but does not output duplicate tags.' : ! context.public ? 'WordPress discourages indexing site-wide. Page settings cannot override this.' : context.passwordProtected ? 'Password-protected content does not output Lieve metadata.' : '';
			status.hidden = ! status.textContent;
			for ( const prefix of [ 'og', 'twitter' ] ) { const image = root.querySelector( '[data-seo-image="' + prefix + '"]' ); const url = sharingImage( data, context, prefix ); if ( httpUrl( url ) ) { if ( image.getAttribute( 'src' ) !== url ) { image.src = url; } image.hidden = false; } else { image.removeAttribute( 'src' ); image.hidden = true; } }
			root.querySelector( '[data-seo-field="maxSnippet"]' ).disabled = data.noSnippet;
			root.querySelector( '[data-seo-reset-all]' ).disabled = JSON.stringify( normalize( data ) ) === JSON.stringify( defaults() );
			root.querySelectorAll( '[data-seo-reset]' ).forEach( button => { button.disabled = data[ button.dataset.seoReset ] === defaults()[ button.dataset.seoReset ]; } );
		}
		root.addEventListener( 'input', event => {
			const input = event.target;
			if ( input.dataset.seoField && input.tagName !== 'SELECT' && input.type !== 'checkbox' ) { emit( input.dataset.seoField, data => { data[ input.dataset.seoField ] = input.value; if ( /ImageUrl$/.test( input.dataset.seoField ) ) { data[ input.dataset.seoField.replace( 'Url', 'Id' ) ] = 0; } } ); }
			if ( input.dataset.seoLanguage !== undefined ) { emit( 'language-' + input.dataset.seoLanguage + '-' + input.dataset.seoLanguageKey, data => { data.languages[ Number( input.dataset.seoLanguage ) ][ input.dataset.seoLanguageKey ] = input.value; } ); }
		} );
		root.addEventListener( 'change', event => { const input = event.target; if ( input.dataset.seoField && ( input.tagName === 'SELECT' || input.type === 'checkbox' ) ) { emit( input.dataset.seoField, data => { data[ input.dataset.seoField ] = input.type === 'checkbox' ? input.checked : input.value; }, true ); } } );
		root.addEventListener( 'click', event => {
			const button = event.target.closest( 'button' ); if ( ! button || button.disabled ) { return; }
			if ( button.dataset.seoReset !== undefined ) { emit( button.dataset.seoReset, data => { data[ button.dataset.seoReset ] = defaults()[ button.dataset.seoReset ]; }, true ); }
			if ( button.hasAttribute( 'data-seo-reset-all' ) ) { change( defaults(), 'reset-all', true ); }
			if ( button.hasAttribute( 'data-seo-add-language' ) ) { emit( 'add-language', data => { if ( data.languages.length < 30 ) { data.languages.push( { lang: '', url: '' } ); } }, true ); }
			if ( button.dataset.seoDeleteLanguage !== undefined ) { emit( 'delete-language', data => data.languages.splice( Number( button.dataset.seoDeleteLanguage ), 1 ), true ); }
			if ( button.dataset.seoCloneLanguage !== undefined ) { emit( 'clone-language', data => { if ( data.languages.length < 30 ) { data.languages.splice( Number( button.dataset.seoCloneLanguage ) + 1, 0, clone( data.languages[ Number( button.dataset.seoCloneLanguage ) ] ) ); } }, true ); }
			if ( button.dataset.seoRemoveImage ) { const prefix = button.dataset.seoRemoveImage; emit( prefix + '-image', data => { data[ prefix + 'ImageId' ] = 0; data[ prefix + 'ImageUrl' ] = ''; data[ prefix + 'ImageAlt' ] = ''; }, true ); }
			if ( button.dataset.seoMedia && window.wp?.media ) { const prefix = button.dataset.seoMedia; const frame = window.wp.media( { title: 'Choose sharing image', library: { type: 'image' }, button: { text: 'Use image' }, multiple: false } ); frame.on( 'select', () => { const image = frame.state().get( 'selection' ).first().toJSON(); emit( prefix + '-image', data => { data[ prefix + 'ImageId' ] = image.id; data[ prefix + 'ImageUrl' ] = image.url; data[ prefix + 'ImageAlt' ] = image.alt || ''; }, true ); } ); frame.open(); }
		} );
		sync();
		return { sync, validate: () => ! Object.keys( errors( read() ) ).length, reportValidity() { const invalid = errors( read() ); const key = Object.keys( invalid )[0]; if ( ! key ) { return true; } const field = root.querySelector( '[data-seo-field="' + key + '"], [data-seo-language-row="' + key.replace( 'language-', '' ) + '"] input' ); if ( field ) { field.closest( 'details' ).open = true; field.focus( { preventScroll: true } ); field.scrollIntoView( { block: 'nearest' } ); } return false; } };
	}
	window.LieveSEO = { defaults, normalize, errors, httpUrl, sharingImage, schemaReport, create };
}() );
