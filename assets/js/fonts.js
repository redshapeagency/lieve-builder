( function() {
	'use strict';
	const root = document.getElementById( 'lieve-fonts' ), config = window.LieveFontsConfig;
	if ( ! root || ! config ) { return; }
	const clone = data => JSON.parse( JSON.stringify( data ) );
	const esc = value => String( value ?? '' ).replace( /[&<>"']/g, c => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' } )[ c ] );
	const icon = name => config.icons[ name ] || '';
	const q = selector => root.querySelector( selector );
	const bytes = n => n < 1024 * 1024 ? ( n / 1024 ).toFixed( 1 ) + ' KB' : ( n / 1024 / 1024 ).toFixed( 1 ) + ' MB';
	let saved = clone( config.data ), draft = clone( saved ), revision = config.revision, selected = '', filter = 'all', search = '', descending = false, busy = false;
	let modal = '', opener = null, catalog = null, catalogSearch = '', category = 'all', catalogFamily = null, chosen = new Set(), uploads = [], sample = 'Good design starts\nwith great type.', sampleSize = 42, previewFace = '';
	const family = () => draft.families.find( item => item.id === selected );
	const dirty = () => JSON.stringify( saved ) !== JSON.stringify( draft );
	function status( message, error = false ) { q( '[data-font-status]' ).textContent = message; q( '[data-font-status]' ).classList.toggle( 'is-error', error ); }
	function syncControls() { q( '[data-font-save]' ).disabled = busy || ! dirty(); q( '[data-font-cancel]' ).hidden = ! dirty(); q( '[data-font-cancel]' ).disabled = busy; root.querySelectorAll( '[data-font-open]' ).forEach( b => { b.disabled = busy || dirty(); b.title = dirty() ? 'Save or cancel changes before installing fonts.' : ''; } ); }
	function changed() { syncControls(); status( 'Unsaved font settings. Save to apply them to your website.' ); }
	async function request( suffix = '', body = null, multipart = false ) {
		const response = await ( window.LieveTransport?.fetch || fetch )(  config.url + suffix, { method: body ? ( suffix ? 'POST' : 'PUT' ) : 'GET', credentials: 'same-origin', headers: { 'X-WP-Nonce': config.nonce, ...( multipart ? {} : { 'Content-Type': 'application/json' } ) }, ...( body ? { body: multipart ? body : JSON.stringify( body ) } : {} ) } );
		const result = await response.json().catch( () => null );
		if ( ! response.ok || ! result ) { throw new Error( result?.message || 'The server did not complete the font operation. Retry without closing this page.' ); }
		return result;
	}
	const previewStyle = document.createElement( 'style' ); document.head.appendChild( previewStyle );
	function accept( result ) { saved = clone( result.data ); draft = clone( saved ); revision = result.revision; previewStyle.textContent = result.previewCss || ''; renderList(); renderDetails(); syncControls(); }
	function select( key, value, options, label ) { return '<div class="lieve-font-select" data-font-select-key="' + esc( key ) + '"><button type="button" aria-label="' + esc( label ) + '" aria-haspopup="listbox" aria-expanded="false"><span>' + esc( options[ value ] ?? value ) + '</span>' + icon( 'chevron' ) + '</button><div role="listbox" aria-label="' + esc( label ) + '" hidden>' + Object.entries( options ).map( ( [ v, text ] ) => '<button type="button" role="option" aria-selected="' + ( v === value ) + '" data-font-option="' + esc( v ) + '">' + esc( text ) + '</button>' ).join( '' ) + '</div></div>'; }
	function toggle( attribute, enabled, label, disabled = false ) { return '<button type="button" class="lieve-ds-toggle" role="switch" aria-checked="' + enabled + '" aria-label="' + esc( label ) + '" ' + attribute + ( disabled ? ' disabled' : '' ) + '><span></span></button>'; }
	function renderList() {
		const items = draft.families.filter( f => ( filter === 'archived' ? f.archived : ! f.archived && ( filter === 'all' || f.source === filter ) ) && ( f.label + ' ' + f.name ).toLowerCase().includes( search.toLowerCase() ) ).sort( ( a, b ) => a.label.localeCompare( b.label, undefined, { numeric: true } ) * ( descending ? -1 : 1 ) );
		q( '[data-font-list-title]' ).textContent = filter === 'archived' ? 'Archived fonts' : 'Installed fonts';
		q( '[data-font-count]' ).textContent = items.length + ( items.length === 1 ? ' family' : ' families' );
		q( '[data-font-list]' ).innerHTML = items.map( f => '<button type="button" class="lieve-font-family" data-font-select="' + esc( f.id ) + '" aria-pressed="' + ( selected === f.id ) + '"><span class="lieve-font-glyph">' + icon( 'font' ) + '</span><span><strong>' + esc( f.label ) + '</strong><small>' + ( f.source === 'google' ? 'Google Fonts' : 'Custom font' ) + ' · ' + f.faces.length + ' face' + ( f.faces.length === 1 ? '' : 's' ) + '</small></span><span class="lieve-font-state">' + ( f.archived ? 'Archived' : f.enabled ? 'Active' : 'Inactive' ) + '</span></button>' ).join( '' ) || '<div class="lieve-font-list-empty"><h3>' + ( search ? 'No matching fonts' : filter === 'archived' ? 'Nothing archived' : 'No fonts installed yet' ) + '</h3><p>' + ( search ? 'Try another family name or clear the search.' : filter === 'archived' ? 'Archived families retain their files and can be restored here.' : 'Download a Google family or upload a font you own.' ) + '</p></div>';
	}
	function renderDetails() {
		const f = family(); if ( ! f ) { return; }
		const custom = f.source === 'custom';
		q( '[data-font-details]' ).innerHTML = '<div class="lieve-font-heading"><div><h2>' + esc( f.label ) + '</h2><p>' + esc( f.name ) + ' · ' + ( custom ? 'Custom font' : 'Google Fonts' ) + ' · ' + bytes( f.faces.reduce( ( n, x ) => n + x.size, 0 ) ) + ' locally</p></div><div class="lieve-ds-detail-actions"><button type="button" class="lieve-ds-icon" data-font-copy aria-label="Copy CSS font family" title="Copy CSS font family">' + icon( 'copy' ) + '</button><button type="button" class="lieve-ds-icon" data-font-archive aria-label="' + ( f.archived ? 'Restore font' : 'Archive font' ) + '" title="' + ( f.archived ? 'Restore font' : 'Archive font' ) + '">' + icon( f.archived ? 'restore' : 'archive' ) + '</button></div></div><label class="lieve-ds-enabled">' + toggle( 'data-font-enabled', f.enabled && ! f.archived, 'Enable ' + f.label, f.archived ) + '<span>' + ( f.archived ? 'Archived · files retained' : 'Available in the builder' ) + '</span></label><div class="lieve-font-specimen" data-font-specimen aria-label="Local font preview"></div><div class="lieve-font-preview-controls"><label class="lieve-ds-field"><span>Preview text</span><input type="text" data-font-sample value="' + esc( sample.replace( /\n/g, ' ' ) ) + '" placeholder="Type your own sample text…"></label><label class="lieve-ds-field"><span>Size (px)</span><input type="number" data-font-size min="12" max="120" value="' + sampleSize + '"></label></div><p class="lieve-font-preview-note">Preview uses your local files. UI typography is unchanged.</p><section class="lieve-font-section"><h3>Family settings</h3><div class="lieve-font-fields"><label class="lieve-ds-field is-wide"><span>Library label</span><input data-font-field="label" value="' + esc( f.label ) + '" maxlength="150" placeholder="e.g. Brand headings"></label><div class="lieve-ds-field"><span>Fallback</span>' + select( 'fallback', f.fallback, { 'sans-serif': 'Sans serif', serif: 'Serif', monospace: 'Monospace', cursive: 'Cursive', 'system-ui': 'System UI' }, 'Fallback font' ) + '</div><div class="lieve-ds-field"><span>Font display</span>' + select( 'display', f.display, { swap: 'Swap · recommended', optional: 'Optional', fallback: 'Fallback', block: 'Block', auto: 'Auto' }, 'Font display' ) + '</div><label class="lieve-ds-field is-wide"><span>Notes / license reference</span><textarea data-font-field="notes" rows="2" maxlength="2000" placeholder="Usage, brand guidelines or your custom font license…">' + esc( f.notes ) + '</textarea></label></div><p class="lieve-font-preview-note">CSS family: <code>' + esc( '"' + f.name + '", ' + f.fallback ) + '</code>. Changing the library label does not break existing styles.</p></section><section class="lieve-font-section"><h3>Font files & loading</h3><p class="lieve-font-preview-note">Preload at most two critical faces. Other files download only when used.</p>' + f.faces.map( face => '<div class="lieve-font-file"><div><strong>' + esc( face.original ) + '</strong><small>' + face.format.toUpperCase() + ' · ' + bytes( face.size ) + '</small></div>' + ( custom ? '<label class="lieve-ds-field"><span>Weight / range</span><input data-font-face-weight="' + esc( face.id ) + '" value="' + esc( face.weight ) + '" placeholder="400 or 100 900"></label><div class="lieve-ds-field"><span>Style</span>' + select( 'style:' + face.id, face.style, { normal: 'Normal', italic: 'Italic' }, 'Font file style' ) + '</div>' : '<span>' + esc( face.weight ) + '</span><span>' + esc( face.style ) + '</span>' ) + '<div class="lieve-font-preload">' + toggle( 'data-font-preload="' + esc( face.id ) + '"', face.preload, 'Preload ' + face.original ) + '<span>Preload</span></div></div>' ).join( '' ) + '</section>';
		if ( ! f.faces.some( face => face.id === previewFace ) ) { previewFace = ( f.faces.find( face => face.style === 'normal' && face.weight === '400' ) || f.faces[0] ).id; }
		q( '.lieve-font-preview-controls' ).insertAdjacentHTML( 'beforeend', '<div class="lieve-ds-field is-wide"><span>Preview face</span>' + select( 'preview-face', previewFace, Object.fromEntries( f.faces.map( face => [ face.id, face.weight + ' · ' + face.style + ( face.weight.includes( ' ' ) ? ' · Variable' : '' ) ] ) ), 'Preview font face' ) + '</div>' );
		preview();
	}
	function preview() {
		const f = family(), specimen = q( '[data-font-specimen]' ); if ( ! f || ! specimen ) { return; }
		specimen.textContent = sample;
		specimen.style.fontFamily = '"' + f.name + '", ' + f.fallback;
		specimen.style.fontSize = sampleSize + 'px';
		const face = f.faces.find( x => x.id === previewFace ) || f.faces[ 0 ];
		specimen.style.fontStyle = face.style;
		const range = face.weight.split( ' ' ).map( Number ); specimen.style.fontWeight = String( range.length === 2 ? Math.max( range[0], Math.min( 400, range[1] ) ) : range[0] );
	}
	async function save() {
		if ( busy || ! dirty() || modal ) { return; } busy = true; syncControls(); status( 'Saving font settings…' );
		try { accept( await request( '', { data: draft, revision } ) ); status( 'Font settings saved.' ); } catch ( error ) { status( error.message, true ); } finally { busy = false; syncControls(); }
	}
	function modalError( message ) { q( '[data-font-modal-error]' ).textContent = message; }
	function setModalBusy( value, message = '' ) { busy = value; q( '[data-font-dialog]' ).setAttribute( 'aria-busy', String( value ) ); q( '[data-font-dialog]' ).querySelectorAll( 'button,input' ).forEach( e => { e.disabled = value || e.hasAttribute( 'data-font-installed' ); } ); q( '[data-font-progress]' ).textContent = message; syncControls(); if ( ! value ) { updateInstallButton(); } }
	function closeModal() {
		if ( busy || ! modal ) { return; } const layer = q( '[data-font-modal]' ); layer.classList.remove( 'is-visible' ); modal = '';
		window.setTimeout( () => { if ( modal ) { return; } layer.hidden = true; q( '.lieve-font-workspace' ).inert = false; q( '.lieve-ds-toolbar' ).inert = false; q( '.lieve-ds-footer' ).inert = false; document.body.style.overflow = oldOverflow; opener?.focus(); }, window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches ? 0 : 180 );
	}
	let oldOverflow = '';
	async function openModal( type, trigger ) {
		if ( busy || dirty() ) { return; } modal = type; opener = trigger; const layer = q( '[data-font-modal]' );
		if ( layer.hidden ) { oldOverflow = document.body.style.overflow; } document.body.style.overflow = 'hidden';
		layer.dataset.dsAction = 'fonts'; layer.hidden = false; window.requestAnimationFrame( () => window.requestAnimationFrame( () => { if ( modal ) { layer.classList.add( 'is-visible' ); } } ) );
		q( '.lieve-font-workspace' ).inert = true; q( '.lieve-ds-toolbar' ).inert = true; q( '.lieve-ds-footer' ).inert = true;
		const title = type === 'google' ? 'Google Fonts, hosted locally' : 'Upload custom fonts';
		q( '[data-font-dialog]' ).innerHTML = '<header><div><h3 id="lieve-font-dialog-title">' + title + '</h3><p>' + ( type === 'google' ? 'Choose a family and only the faces you need. Files are downloaded to your website.' : 'Add WOFF2, WOFF, TTF or OTF files to a family. Variable weight ranges are supported.' ) + '</p></div><button type="button" class="lieve-ds-icon" data-font-close aria-label="Close">' + icon( 'close' ) + '</button></header><div class="lieve-font-dialog-body" data-font-modal-body></div><p class="lieve-font-dialog-error" role="alert" data-font-modal-error></p><footer><span class="lieve-font-dialog-progress" role="status" aria-live="polite" data-font-progress></span><button type="button" class="lieve-conditions-cancel" data-font-close>Cancel</button><button type="button" class="lieve-conditions-save" data-font-install disabled>' + ( type === 'google' ? 'Install Locally' : 'Upload & Install' ) + '</button></footer>';
		q( '[data-font-dialog]' ).focus();
		if ( type === 'google' ) {
			catalogFamily = null; chosen = new Set(); catalogSearch = ''; category = 'all';
			if ( catalog ) { renderCatalog(); } else { q( '[data-font-modal-body]' ).innerHTML = '<p role="status">Loading the official Google Fonts catalogue…</p>'; try { catalog = await request( '/catalog' ); if ( modal === 'google' ) { renderCatalog(); } } catch ( error ) { if ( modal === 'google' ) { q( '[data-font-modal-body]' ).innerHTML = '<p>The catalogue could not be loaded.</p><button type="button" class="lieve-conditions-cancel" data-font-retry>Retry</button>'; modalError( error.message ); } } }
		} else {
			uploads = [];
			q( '[data-font-modal-body]' ).innerHTML = '<label class="lieve-ds-field"><span>CSS family name</span><input data-font-upload-name maxlength="100" placeholder="e.g. My Brand Sans" autocomplete="off"></label><p class="lieve-font-preview-note">Use an existing custom family name to add faces. This is the CSS name used in your designs.</p><div class="lieve-font-upload">' + icon( 'upload' ) + '<strong>Your fonts, your website</strong><p>Choose one or more font files. Maximum 5 MB per file. WOFF2 is recommended.</p><input type="file" data-font-files multiple accept=".woff2,.woff,.ttf,.otf" aria-label="Choose custom font files"></div><div data-font-upload-files></div><p class="lieve-font-preview-note">Only upload fonts you have permission to host on this website. Archives and SVG fonts are not accepted.</p>';
		}
	}
	function renderCatalog() {
		q( '[data-font-modal-body]' ).innerHTML = '<div class="lieve-font-catalog-tools"><label class="lieve-ds-field"><span>Search Google Fonts</span><input type="search" data-font-catalog-search placeholder="e.g. Roboto, Lato, Source Sans…" value="' + esc( catalogSearch ) + '"></label><div class="lieve-ds-field"><span>Category</span>' + select( 'catalog-category', category, { all: 'All categories', 'sans-serif': 'Sans serif', serif: 'Serif', display: 'Display', handwriting: 'Handwriting', monospace: 'Monospace' }, 'Google font category' ) + '</div></div><div class="lieve-font-catalog"><div class="lieve-font-catalog-list" data-font-catalog-list></div><div class="lieve-font-catalog-detail" data-font-catalog-detail><h3>Choose a font family</h3><p>Search the catalogue, choose its weights and styles, then install the local files. A real specimen is available in your library after installation.</p><p>Opening this catalogue contacts WordPress.org from your server. Installing selected fonts contacts Google from your server, not from your visitors’ browsers.</p></div></div>';
		renderCatalogList(); if ( catalogFamily ) { renderCatalogFaces(); }
	}
	function renderCatalogList() {
		const items = catalog.filter( f => ( category === 'all' || f.category === category ) && f.name.toLowerCase().includes( catalogSearch.toLowerCase() ) );
		q( '[data-font-catalog-list]' ).innerHTML = items.slice( 0, 80 ).map( f => '<button type="button" class="lieve-font-family" data-font-catalog-family="' + esc( f.id ) + '" aria-pressed="' + ( catalogFamily?.id === f.id ) + '"><span><strong>' + esc( f.name ) + '</strong><small>' + esc( f.category ) + ' · ' + f.faces.length + ' faces</small></span></button>' ).join( '' ) + ( items.length > 80 ? '<p class="lieve-font-preview-note">Showing the first 80 matches. Refine your search to find any family.</p>' : items.length ? '' : '<p>No matching Google families.</p>' );
	}
	function installed( face ) { return saved.families.some( f => f.name === catalogFamily?.name && f.faces.some( x => x.weight === face.weight && x.style === face.style ) ); }
	function renderCatalogFaces() {
		q( '[data-font-catalog-detail]' ).innerHTML = '<h3>' + esc( catalogFamily.name ) + '</h3><p>Select up to 12 faces. A variable range covers every weight within it.</p><div class="lieve-font-variants">' + catalogFamily.faces.map( face => '<div class="lieve-font-variant"><span>' + esc( face.weight ) + ' · ' + esc( face.style ) + '<small>' + ( installed( face ) ? 'Already installed locally' : face.weight.includes( ' ' ) ? 'Variable font' : 'Static face' ) + '</small></span>' + toggle( 'data-font-catalog-face="' + esc( face.id ) + '"' + ( installed( face ) ? ' data-font-installed' : '' ), installed( face ) || chosen.has( face.id ), 'Install ' + face.weight + ' ' + face.style, installed( face ) ) + '</div>' ).join( '' ) + '</div><p class="lieve-font-preview-note">No remote preview is loaded. Your installed specimen uses only local files.</p>';
		updateInstallButton();
	}
	function updateInstallButton() {
		const button = q( '[data-font-install]' ); if ( ! button ) { return; }
		button.disabled = busy || ( modal === 'google' ? ! chosen.size || chosen.size > 12 : ! uploads.length || ! q( '[data-font-upload-name]' )?.value.trim() );
	}
	function renderUploads() {
		q( '[data-font-upload-files]' ).innerHTML = uploads.map( ( file, i ) => '<div class="lieve-font-upload-row"><span>' + esc( file.file.name ) + '<small> · ' + bytes( file.file.size ) + '</small></span><label class="lieve-ds-field"><span>Weight / range</span><input data-font-upload-weight="' + i + '" value="' + esc( file.weight ) + '" placeholder="400 or 100 900"></label><div class="lieve-ds-field"><span>Style</span>' + select( 'upload-style:' + i, file.style, { normal: 'Normal', italic: 'Italic' }, 'Upload file style' ) + '</div></div>' ).join( '' ); updateInstallButton();
	}
	async function install() {
		if ( busy || q( '[data-font-install]' ).disabled ) { return; } modalError( '' ); setModalBusy( true, 'Installing local font files…' );
		try {
			if ( modal === 'google' ) { const result = await request( '/google', { family: catalogFamily.id, faces: [ ...chosen ], revision } ); accept( result ); selected = draft.families.find( f => f.name === catalogFamily.name )?.id || ''; }
			else {
				const name = q( '[data-font-upload-name]' ).value.trim(); let completed = 0;
				for ( const file of uploads ) {
					if ( file.done ) { continue; }
					const body = new FormData(); body.append( 'file', file.file ); body.append( 'family', name ); body.append( 'weight', file.weight.trim() ); body.append( 'style', file.style ); body.append( 'revision', revision );
					accept( await request( '/upload', body, true ) ); file.done = true; completed++; q( '[data-font-progress]' ).textContent = completed + ' file(s) installed…';
				}
				selected = draft.families.find( f => f.name.toLowerCase() === name.toLowerCase() )?.id || '';
			}
			status( 'Font files installed locally and available in the builder.' ); busy = false; closeModal(); filter = 'all'; root.querySelector( '[data-font-filter="all"]' ).click(); renderList(); renderDetails(); syncControls();
		} catch ( error ) { modalError( error.message + ( uploads.some( f => f.done ) ? ' Files already installed are retained; retry uploads only the remaining files.' : '' ) ); setModalBusy( false ); }
	}
	root.addEventListener( 'click', event => {
		const target = event.target.closest( 'button' ); if ( ! target || target.disabled ) { return; }
		if ( target.hasAttribute( 'data-font-open' ) ) { openModal( target.dataset.fontOpen, target ); }
		else if ( target.hasAttribute( 'data-font-close' ) ) { closeModal(); }
		else if ( target.hasAttribute( 'data-font-retry' ) ) { openModal( 'google', opener ); }
		else if ( target.hasAttribute( 'data-font-save' ) ) { save(); }
		else if ( target.hasAttribute( 'data-font-cancel' ) ) { draft = clone( saved ); renderList(); renderDetails(); syncControls(); status( 'Unsaved changes discarded.' ); }
		else if ( target.hasAttribute( 'data-font-select' ) ) { selected = target.dataset.fontSelect; renderList(); renderDetails(); q( '[data-font-select="' + selected + '"]' )?.focus( { preventScroll: true } ); }
		else if ( target.hasAttribute( 'data-font-filter' ) ) { filter = target.dataset.fontFilter; root.querySelectorAll( '[data-font-filter]' ).forEach( b => { b.classList.toggle( 'is-active', b === target ); b.setAttribute( 'aria-pressed', String( b === target ) ); } ); renderList(); }
		else if ( target.hasAttribute( 'data-font-sort' ) ) { descending = ! descending; target.textContent = descending ? 'Z–A' : 'A–Z'; renderList(); }
		else if ( target.hasAttribute( 'data-font-enabled' ) && family() ) { family().enabled = ! family().enabled; renderDetails(); renderList(); changed(); q( '[data-font-enabled]' )?.focus( { preventScroll: true } ); }
		else if ( target.hasAttribute( 'data-font-archive' ) && family() ) { family().archived = ! family().archived; filter = family().archived ? 'archived' : 'all'; root.querySelector( '[data-font-filter="' + filter + '"]' ).click(); renderDetails(); changed(); status( family().archived ? 'Font archived in your draft. Save to remove it from the website. Local files are retained for Restore.' : 'Font restored in your draft. Save to reactivate it.' ); q( '[data-font-archive]' )?.focus( { preventScroll: true } ); }
		else if ( target.hasAttribute( 'data-font-copy' ) && family() ) { navigator.clipboard.writeText( 'font-family: "' + family().name + '", ' + family().fallback + ';' ).then( () => status( 'CSS font family copied.' ), () => status( 'Clipboard unavailable. Copy the CSS family shown below.', true ) ); }
		else if ( target.hasAttribute( 'data-font-preload' ) && family() ) { const face = family().faces.find( f => f.id === target.dataset.fontPreload ); const count = draft.families.filter( f => f.enabled && ! f.archived ).flatMap( f => f.faces ).filter( f => f.preload ).length; if ( ! face.preload && count >= 2 ) { status( 'Preload at most two critical faces.', true ); return; } face.preload = ! face.preload; target.setAttribute( 'aria-checked', String( face.preload ) ); changed(); }
		else if ( target.hasAttribute( 'data-font-install' ) ) { install(); }
		else if ( target.hasAttribute( 'data-font-catalog-family' ) ) { catalogFamily = catalog.find( f => f.id === target.dataset.fontCatalogFamily ); chosen = new Set(); const first = catalogFamily.faces.find( f => ! installed( f ) && f.style === 'normal' && ( f.weight === '400' || f.weight.includes( ' ' ) ) ) || catalogFamily.faces.find( f => ! installed( f ) ); if ( first ) { chosen.add( first.id ); } renderCatalogList(); renderCatalogFaces(); modalError( '' ); q( '[data-font-catalog-family="' + catalogFamily.id + '"]' )?.focus( { preventScroll: true } ); }
		else if ( target.hasAttribute( 'data-font-catalog-face' ) ) { const id = target.dataset.fontCatalogFace; if ( chosen.has( id ) ) { chosen.delete( id ); } else if ( chosen.size < 12 ) { chosen.add( id ); } else { modalError( 'Choose at most 12 faces per installation.' ); return; } target.setAttribute( 'aria-checked', String( chosen.has( id ) ) ); updateInstallButton(); }
		else if ( target.hasAttribute( 'data-font-option' ) ) {
			const box = target.closest( '[data-font-select-key]' ), key = box.dataset.fontSelectKey, value = target.dataset.fontOption;
			if ( key === 'preview-face' ) { previewFace = value; renderDetails(); }
			else if ( key === 'catalog-category' ) { category = value; renderCatalog(); }
			else if ( key.startsWith( 'upload-style:' ) ) { uploads[ Number( key.split( ':' )[1] ) ].style = value; renderUploads(); }
			else if ( family() ) { if ( key.startsWith( 'style:' ) ) { family().faces.find( f => f.id === key.slice( 6 ) ).style = value; } else { family()[ key ] = value; } renderDetails(); changed(); }
			root.querySelector( '[data-font-select-key="' + key + '"] > button' )?.focus();
		} else if ( target.parentElement.matches( '[data-font-select-key]' ) ) {
			const expanded = target.getAttribute( 'aria-expanded' ) === 'true'; closeSelects(); target.setAttribute( 'aria-expanded', String( ! expanded ) ); target.nextElementSibling.hidden = expanded; if ( ! expanded ) { target.nextElementSibling.querySelector( '[aria-selected="true"]' )?.focus(); }
		}
	} );
	function closeSelects() { root.querySelectorAll( '.lieve-font-select > button' ).forEach( b => { b.setAttribute( 'aria-expanded', 'false' ); b.nextElementSibling.hidden = true; } ); }
	document.addEventListener( 'click', e => { if ( ! e.target.closest( '.lieve-font-select' ) ) { closeSelects(); } if ( e.target === q( '[data-font-modal]' ) ) { closeModal(); } } );
	root.addEventListener( 'input', event => {
		const e = event.target;
		if ( e.matches( '[data-font-search]' ) ) { search = e.value; renderList(); }
		else if ( e.matches( '[data-font-field]' ) && family() ) { family()[ e.dataset.fontField ] = e.value; changed(); if ( e.dataset.fontField === 'label' ) { renderList(); } }
		else if ( e.matches( '[data-font-face-weight]' ) && family() ) { family().faces.find( f => f.id === e.dataset.fontFaceWeight ).weight = e.value; changed(); }
		else if ( e.matches( '[data-font-sample]' ) ) { sample = e.value; preview(); }
		else if ( e.matches( '[data-font-size]' ) ) { sampleSize = Math.min( 120, Math.max( 12, Number( e.value ) || 42 ) ); preview(); }
		else if ( e.matches( '[data-font-catalog-search]' ) ) { catalogSearch = e.value; renderCatalogList(); }
		else if ( e.matches( '[data-font-upload-name]' ) ) { updateInstallButton(); }
		else if ( e.matches( '[data-font-upload-weight]' ) ) { uploads[ Number( e.dataset.fontUploadWeight ) ].weight = e.value; }
	} );
	root.addEventListener( 'change', event => {
		if ( ! event.target.matches( '[data-font-files]' ) ) { return; }
		const files = [ ...event.target.files ];
		if ( files.length > 12 || files.some( f => f.size > 5 * 1024 * 1024 || ! /\.(woff2?|ttf|otf)$/i.test( f.name ) ) ) { modalError( 'Choose up to 12 font files, no larger than 5 MB each.' ); uploads = []; renderUploads(); return; }
		modalError( '' ); uploads = files.map( file => ( { file, weight: /thin/i.test( file.name ) ? '100' : /extralight/i.test( file.name ) ? '200' : /light/i.test( file.name ) ? '300' : /semibold/i.test( file.name ) ? '600' : /extrabold/i.test( file.name ) ? '800' : /bold/i.test( file.name ) ? '700' : /black/i.test( file.name ) ? '900' : /medium/i.test( file.name ) ? '500' : '400', style: /italic|oblique/i.test( file.name ) ? 'italic' : 'normal', done: false } ) ); renderUploads();
	} );
	document.addEventListener( 'keydown', event => {
		if ( ( event.ctrlKey || event.metaKey ) && event.key.toLowerCase() === 's' ) { event.preventDefault(); save(); }
		const selectBox = event.target.closest( '.lieve-font-select' );
		if ( selectBox && [ 'ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape' ].includes( event.key ) ) {
			event.preventDefault(); const trigger = selectBox.querySelector( 'button' ), menu = selectBox.querySelector( '[role="listbox"]' ), options = [ ...menu.querySelectorAll( '[role="option"]' ) ];
			if ( event.key === 'Escape' ) { closeSelects(); trigger.focus(); return; } menu.hidden = false; trigger.setAttribute( 'aria-expanded', 'true' ); const current = options.indexOf( document.activeElement ); options[ event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : ( current + ( event.key === 'ArrowDown' ? 1 : -1 ) + options.length ) % options.length ]?.focus(); return;
		}
		if ( ! modal ) { return; }
		if ( event.key === 'Escape' ) { event.preventDefault(); closeModal(); }
		if ( event.key === 'Tab' ) {
			const items = [ ...q( '[data-font-dialog]' ).querySelectorAll( 'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]' ) ].filter( e => ! e.closest( '[hidden]' ) );
			const first = items[0], last = items[ items.length - 1 ];
			if ( ! items.length ) { event.preventDefault(); return; }
			if ( ! q( '[data-font-dialog]' ).contains( document.activeElement ) ) { event.preventDefault(); ( event.shiftKey ? last : first ).focus(); return; }
			if ( event.shiftKey && ( document.activeElement === first || document.activeElement === q( '[data-font-dialog]' ) ) ) { event.preventDefault(); last.focus(); } else if ( ! event.shiftKey && ( document.activeElement === last || document.activeElement === q( '[data-font-dialog]' ) ) ) { event.preventDefault(); first.focus(); }
		}
	} );
	window.addEventListener( 'beforeunload', event => { if ( dirty() ) { event.preventDefault(); event.returnValue = ''; } } );
	syncControls();
} )();
