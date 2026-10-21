( function () {
	'use strict';
	window.LieveEditorControllers ||= {};
	window.LieveEditorControllers[ 'pickers' ] = function create( lieveContext ) {
	function closeTokenPicker( restoreFocus = false ) {
		const anchor = lieveContext.tokenPickerAnchor;
		lieveContext.tokenPickerCleanup?.(); lieveContext.tokenPickerCleanup = null;
		lieveContext.tokenPicker?.remove(); lieveContext.tokenPicker = null; lieveContext.tokenPickerAnchor = null;
		anchor?.setAttribute( 'aria-expanded', 'false' ); anchor?.removeAttribute( 'aria-controls' );
		if ( restoreFocus && anchor?.isConnected ) { anchor.focus( { preventScroll: true } ); }
	}

	function refreshStyleColorSwatch( property ) {
		const button = lieveContext.inspector.querySelector( '[data-style-library="' + property + '"]' ); const field = lieveContext.inspector.querySelector( '[data-style-prop="' + property + '"]' );
		if ( ! button || ! field ) { return; }
		const node = lieveContext.styleInspectionNode(); let value = field.value || ( node ? lieveContext.inspectorStyleValues( node, true )[ property ] : '' ) || '';
		if ( /^var\(/.test( value ) ) { const name = value.match( /^var\(\s*(--[A-Za-z_][A-Za-z0-9_-]*)\s*\)$/ )?.[ 1 ]; value = name ? ( lieveContext.canvas.ownerDocument.defaultView || window ).getComputedStyle( lieveContext.canvas ).getPropertyValue( name ).trim() : ''; }
		const valid = Boolean( value && window.CSS?.supports( 'color', value ) );
		button.style.setProperty( '--lieve-style-color', valid ? value : 'transparent' ); button.classList.toggle( 'is-empty', ! valid );
	}

	function tokenColorPreview( value, definitions, seen = new Set() ) {
		if ( seen.size >= 16 || String( value ).length > 4000 ) { return ''; }
		return String( value ).replace( /var\(\s*--([A-Za-z_][A-Za-z0-9_-]*)\s*(?:,\s*([^()]*))?\)/g, ( expression, name, fallback ) => {
			if ( seen.has( name ) ) { return ''; }
			if ( ! definitions.has( name ) ) { return fallback?.trim() || expression; }
			return tokenColorPreview( definitions.get( name ), definitions, new Set( [ ...seen, name ] ) );
		} );
	}

	function openTokenPicker( button ) {
		if ( lieveContext.tokenPicker && lieveContext.tokenPickerAnchor === button ) { closeTokenPicker( true ); return; }
		closeTokenPicker();
		lieveContext.liveEdit = null; lieveContext.hideEditorTooltip(); lieveContext.inspectorSelects.forEach( select => select.close() );
		if ( ! lieveContext.designSystem ) { lieveContext.showToast( 'The design system is unavailable. Reload the editor.', true ); return; }
		if ( lieveContext.designSystem.storageError?.() ) { lieveContext.showToast( lieveContext.designSystem.storageError().message, true ); return; }
		const nodeId = lieveContext.styleInspectionNode()?.id; const colorsOnly = Boolean( button.dataset.styleLibrary ); const kind = colorsOnly ? 'colors' : 'variables'; const label = colorsOnly ? 'Colors' : 'Variables'; const property = button.dataset.styleLibrary || button.dataset.styleToken;
		const field = lieveContext.inspector.querySelector( '[data-style-prop="' + property + '"]' );
		if ( ! field || field.disabled || field.readOnly || button.disabled || lieveContext.state.saving || lieveContext.classWorkspace?.isSaving() ) { return; }
		const current = lieveContext.findStyleNode( nodeId );
		const currentValue = field.value || lieveContext.inspectorStyleValues( current, true )[ property ] || '';
		let selectedName = currentValue.match( /^var\(\s*--([A-Za-z_][A-Za-z0-9_-]*)\s*\)$/ )?.[ 1 ];
		const popup = document.createElement( 'div' ); popup.id = 'lieve-style-token-picker'; popup.className = 'lieve-ds lieve-token-picker lieve-ds-select-menu'; popup.setAttribute( 'role', 'dialog' ); popup.setAttribute( 'aria-label', colorsOnly ? 'Choose a library color' : 'Choose a CSS variable' );
		popup.innerHTML = '<div class="lieve-ds-select-find"><input type="search" aria-label="Search ' + label.toLowerCase() + '" placeholder="Search ' + label.toLowerCase() + ' or categories…" autocomplete="off"></div><div class="lieve-ds-select-list" role="listbox" aria-label="' + label + '"></div><p class="lieve-ds-select-empty" role="status" hidden>No matching ' + label.toLowerCase() + '. Try another search or open the manager.</p><div class="lieve-token-footer">' + ( colorsOnly ? '<div class="lieve-token-custom"><button type="button" data-token-custom-color aria-label="Choose custom color" title="Choose custom color"></button><span>Custom color<small>A standalone color, without a library reference</small></span></div>' : '' ) + '<button type="button" class="lieve-button-secondary lieve-token-manage" data-token-manage>' + lieveContext.styleCategoryIcon( 'CSS' ) + 'Manage ' + label.toLowerCase() + '</button></div>';
		const search = popup.querySelector( 'input' ); const results = popup.querySelector( '[role="listbox"]' ); const empty = popup.querySelector( '[role="status"]' );
		let options = []; let active = -1;
		function highlight( index, focus = false ) {
			active = index;
			options.forEach( ( option, i ) => option.classList.toggle( 'is-over', i === active ) );
			if ( focus && options[ active ] ) { options[ active ].focus( { preventScroll: true } ); const option = options[ active ]; results.scrollTop = Math.max( option.offsetTop - results.offsetTop - results.clientHeight + option.offsetHeight, Math.min( results.scrollTop, option.offsetTop - results.offsetTop ) ); }
		}
		function filter() {
			const query = search.value.trim().toLowerCase(); const tokens = lieveContext.designSystem.tokens( colorsOnly ).filter( token => ( colorsOnly || token.kind !== 'colors' ) && ( token.name + ' ' + token.value + ' ' + ( token.groupName || '' ) ).toLowerCase().includes( query ) );
			const groups = new Map(); tokens.forEach( token => { const key = token.groupId || ''; if ( ! groups.has( key ) ) { groups.set( key, { name: token.groupName || 'Uncategorized', order: token.groupOrder || 0, color: token.groupColor || '', tokens: [] } ); } groups.get( key ).tokens.push( token ); } );
			results.innerHTML = Array.from( groups.values() ).sort( ( a, b ) => a.order - b.order ).map( group => '<div class="lieve-token-group" role="group" aria-label="' + lieveContext.escapeHtml( group.name ) + '"><div class="lieve-token-group-heading"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"' + ( /^#[\da-f]{6}$/i.test( group.color ) ? ' style="color:' + group.color + '"' : '' ) + '><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10H3Z"/></svg><span>' + lieveContext.escapeHtml( group.name ) + '</span><small>' + group.tokens.length + '</small></div>' + group.tokens.map( token => '<button type="button" role="option" tabindex="-1" class="lieve-ds-select-option' + ( token.name === selectedName ? ' is-chosen' : '' ) + '" aria-selected="' + ( token.name === selectedName ) + '" data-token-name="' + lieveContext.escapeHtml( token.name ) + '">' + ( colorsOnly ? '<i class="lieve-token-color-preview" data-token-swatch="' + lieveContext.escapeHtml( token.name ) + '" aria-hidden="true"></i>' : '' ) + '<span>--' + lieveContext.escapeHtml( token.name ) + '</span><small>' + lieveContext.escapeHtml( token.value ) + ( token.conditions?.length ? ' · Selective' : '' ) + '</small></button>' ).join( '' ) + '</div>' ).join( '' );
			const definitions = new Map(); lieveContext.designSystem.tokens().forEach( token => { definitions.set( token.name, token.value ); ( token.aliases || [] ).forEach( alias => definitions.set( alias, 'var(--' + token.name + ')' ) ); } );
			results.querySelectorAll( '[data-token-swatch]' ).forEach( swatch => { const token = tokens.find( item => item.name === swatch.dataset.tokenSwatch ); if ( token ) { swatch.style.setProperty( '--lieve-token-color', tokenColorPreview( token.value, definitions ) ); } } );
			options = Array.from( results.querySelectorAll( '[role="option"]' ) ); empty.hidden = Boolean( options.length );
			highlight( Math.max( 0, options.findIndex( option => option.dataset.tokenName === selectedName ) ) );
			results.scrollTop = 0;
		}
		search.addEventListener( 'input', filter );
		popup.addEventListener( 'click', event => {
			const choice = event.target.closest( '[data-token-name]' );
			if ( choice ) {
				const value = 'var(--' + choice.dataset.tokenName + ')';
				// Use the existing live input path: no inspector rebuild, focus jump or scroll reset.
				if ( lieveContext.styleInspectionNode()?.id === nodeId && field.isConnected && ! field.disabled && ! field.readOnly && ! lieveContext.state.saving && ! lieveContext.classWorkspace?.isSaving() && lieveContext.styles.safeValue( property, value ) ) { field.value = value; field.dispatchEvent( new Event( 'input', { bubbles: true } ) ); lieveContext.liveEdit = null; }
				closeTokenPicker( true );
			}
			if ( event.target.closest( '[data-token-manage]' ) ) { closeTokenPicker(); void lieveContext.designSystem.open( kind ); }
		} );
		popup.addEventListener( 'keydown', event => {
			if ( event.target?.closest?.( '.lieve-colour-panel' ) ) { return; }
			if ( event.key === 'Escape' ) { event.preventDefault(); event.stopPropagation(); closeTokenPicker( true ); }
			else if ( [ 'ArrowDown', 'ArrowUp', 'Home', 'End' ].includes( event.key ) && ( event.target !== search || [ 'ArrowDown', 'ArrowUp' ].includes( event.key ) ) ) {
				event.preventDefault(); event.stopPropagation(); if ( ! options.length ) { return; }
				const index = options.indexOf( event.target );
				highlight( event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : index < 0 ? ( event.key === 'ArrowUp' ? options.length - 1 : active ) : ( index + ( event.key === 'ArrowDown' ? 1 : -1 ) + options.length ) % options.length, true );
			} else if ( event.key === 'Enter' && event.target === search ) { event.preventDefault(); event.stopPropagation(); options[ active ]?.click(); }
			else if ( event.key === 'Tab' && ( ( event.shiftKey && event.target === search ) || ( ! event.shiftKey && event.target.closest?.( '[data-token-manage]' ) ) ) ) { event.preventDefault(); closeTokenPicker( true ); }
		} );
		lieveContext.app.appendChild( popup ); lieveContext.tokenPicker = popup; lieveContext.tokenPickerAnchor = button;
		button.setAttribute( 'aria-haspopup', 'dialog' ); button.setAttribute( 'aria-expanded', 'true' ); button.setAttribute( 'aria-controls', popup.id );
		function position() {
			const rect = button.getBoundingClientRect(); const bounds = lieveContext.inspector.getBoundingClientRect();
			if ( ! rect.width || bounds.right < 32 || bounds.left > window.innerWidth - 32 || bounds.width < 80 ) { closeTokenPicker(); return; }
			const left = Math.max( 12, bounds.left + 16 ); const right = Math.min( window.innerWidth - 12, bounds.right - 16 );
			const width = Math.max( 0, Math.min( 320, right - left ) ); const below = window.innerHeight - rect.bottom - 12; const above = rect.top - 12;
			popup.style.width = width + 'px'; popup.style.height = popup.style.maxHeight = Math.max( 0, Math.min( 380, Math.max( below, above ) - 6 ) ) + 'px';
			popup.style.left = Math.max( left, Math.min( rect.right - width, right - width ) ) + 'px';
			popup.style.top = ( below < popup.offsetHeight + 6 && above > below ? Math.max( 12, rect.top - popup.offsetHeight - 6 ) : rect.bottom + 6 ) + 'px';
		}
		const scroll = event => { if ( ! popup.contains( event.target ) ) { closeTokenPicker(); } };
		window.addEventListener( 'resize', position ); window.addEventListener( 'scroll', scroll, true );
		const customColor = colorsOnly && window.LieveColour ? window.LieveColour.create( field, { trigger: popup.querySelector( '[data-token-custom-color]' ), container: popup, allowAlpha: true } ) : null;
		const refreshSelection = () => {
			selectedName = field.value.match( /^var\(\s*--([A-Za-z_][A-Za-z0-9_-]*)\s*\)$/ )?.[ 1 ];
			options.forEach( option => { const selected = option.dataset.tokenName === selectedName; option.classList.toggle( 'is-chosen', selected ); option.setAttribute( 'aria-selected', String( selected ) ); } );
		};
		field.addEventListener( 'input', refreshSelection );
		lieveContext.tokenPickerCleanup = () => { customColor?.destroy(); field.removeEventListener( 'input', refreshSelection ); window.removeEventListener( 'resize', position ); window.removeEventListener( 'scroll', scroll, true ); };
		filter(); position(); void popup.offsetWidth; popup.classList.add( 'is-open' ); search.focus( { preventScroll: true } );
	}

	function openDynamicPicker( button, operand = null ) {
		if ( lieveContext.tokenPicker && lieveContext.tokenPickerAnchor === button ) { closeTokenPicker( true ); return; }
		closeTokenPicker(); lieveContext.hideEditorTooltip(); lieveContext.inspectorSelects.forEach( select => select.close() ); lieveContext.liveEdit = null;
		const isStyle = button.hasAttribute( 'data-dynamic-style' );
		const property = button.dataset.dynamicStyle || button.dataset.dynamicProp || button.dataset.codeDynamic;
		const node = isStyle ? lieveContext.styleInspectionNode() : lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId );
		const field = operand?.field || lieveContext.inspector.querySelector( '[' + ( isStyle ? 'data-style-prop' : 'data-prop' ) + '="' + window.CSS.escape( property ) + '"]' );
		if ( ! node || ! field || button.disabled || field.disabled || field.readOnly || lieveContext.state.saving || lieveContext.classWorkspace?.isSaving() || isStyle && lieveContext.editingClass() ) { return; }
		const kind = operand?.kind || ( isStyle ? lieveContext.dynamicData.styleKind( property, lieveContext.styles.field( property ) ) : lieveContext.dynamicData.propKind( node.type, property ) );
		const selected = lieveContext.dynamicData.parse( field.value );
		const popup = document.createElement( 'div' ); popup.id = 'lieve-dynamic-data-picker'; popup.className = 'lieve-ds lieve-token-picker lieve-ds-select-menu'; popup.setAttribute( 'role', 'dialog' ); popup.setAttribute( 'aria-label', 'Choose WordPress dynamic data' );
		const groups = Array.from( new Set( lieveContext.dynamicData.sources( kind ).map( source => source.group ) ) );
		popup.innerHTML = '<div class="lieve-ds-select-find"><input type="search" aria-label="Search dynamic data" placeholder="Search data or categories…" autocomplete="off"><select class="lieve-dynamic-select" data-dynamic-category aria-label="Dynamic data category"><option value="">All categories</option>' + groups.map( group => '<option>' + lieveContext.escapeHtml( group ) + '</option>' ).join( '' ) + '</select></div><div class="lieve-ds-select-list" role="listbox" aria-label="Dynamic data sources"></div><p class="lieve-ds-select-empty" hidden>No compatible sources found. Try another search.</p><div class="lieve-dynamic-config" hidden></div><div class="lieve-token-footer"><p class="lieve-dynamic-help">Select a source. Fields with options let you choose a key, format or fallback.</p><p class="lieve-dynamic-status" role="status" hidden></p><button type="button" class="lieve-button-secondary lieve-token-manage" data-dynamic-clear' + ( selected ? '' : ' disabled' ) + '>Remove dynamic data</button></div><div class="lieve-editor-select-layer"></div>';
		const search = popup.querySelector( 'input' ), list = popup.querySelector( '[role="listbox"]' ), category = popup.querySelector( '[data-dynamic-category]' ), settings = popup.querySelector( '.lieve-dynamic-config' ), status = popup.querySelector( '[role="status"]' ); let options = [], active = 0, configured = null, loading = false;
		const dropdowns = [];
		function enhance( select ) { const control = window.LieveDesignSystem?.createSelect( select, popup, popup.querySelector( '.lieve-editor-select-layer' ), { lazy: true } ); if ( control ) { dropdowns.push( control ); } }
		function highlight( index, paint = true ) { active = index; options.forEach( ( option, i ) => option.classList.toggle( 'is-over', paint && i === index ) ); }
		function filter() {
			const query = search.value.toLowerCase().trim(), sections = new Map();
			lieveContext.dynamicData.sources( kind ).filter( source => ( ! category.value || source.group === category.value ) && ( source.label + ' ' + source.id + ' ' + source.group ).toLowerCase().includes( query ) ).forEach( source => { if ( ! sections.has( source.group ) ) { sections.set( source.group, [] ); } sections.get( source.group ).push( source ); } );
			list.innerHTML = Array.from( sections, ( [ group, sources ] ) => '<div class="lieve-token-group" role="group" aria-label="' + lieveContext.escapeHtml( group ) + '"><div class="lieve-token-group-heading"><span>' + lieveContext.escapeHtml( group ) + '</span><small>' + sources.length + '</small></div>' + sources.map( source => '<button type="button" role="option" tabindex="-1" class="lieve-ds-select-option' + ( selected?.source === source.id ? ' is-chosen' : '' ) + '" aria-selected="' + ( selected?.source === source.id ) + '" data-dynamic-source="' + lieveContext.escapeHtml( source.id ) + '"><span>' + lieveContext.escapeHtml( source.label ) + '</span><small>' + lieveContext.escapeHtml( source.hint || ( Object.keys( source.parameters || {} ).length ? 'Configure options' : source.requestBound ? 'Resolved in the current context' : source.value === '' ? 'No value in this preview' : source.value ) ) + '</small></button>' ).join( '' ) + '</div>' ).join( '' );
			options = Array.from( list.querySelectorAll( '[role="option"]' ) ); popup.querySelector( '.lieve-ds-select-empty' ).hidden = Boolean( options.length ); list.scrollTop = 0; highlight( Math.max( 0, options.findIndex( option => option.dataset.dynamicSource === selected?.source ) ), false );
		}
		async function choose( source, parameters = {} ) {
			if ( loading ) { return; }
			const unit = kind === 'dimension' ? lieveContext.inspector.querySelector( '[data-style-unit="' + window.CSS.escape( property ) + '"]' )?.value || 'px' : '';
			const reference = lieveContext.dynamicData.reference( source.id, unit, parameters ), binding = lieveContext.dynamicData.parse( reference );
			if ( ! binding ) { status.textContent = 'The options are too long. Shorten the values and try again.'; status.hidden = false; return; }
			loading = true; status.hidden = false; status.textContent = 'Resolving data…'; popup.setAttribute( 'aria-busy', 'true' );
			const locked = Array.from( settings.querySelectorAll( 'input, select, button' ), control => [ control, control.disabled ] ); locked.forEach( ( [ control ] ) => { control.disabled = true; } );
			try { await lieveContext.dynamicData.load( binding, kind, lieveContext.config.nonce ); if ( lieveContext.tokenPicker === popup ) { apply( reference ); } }
			catch ( error ) { if ( lieveContext.tokenPicker === popup ) { status.textContent = error.message; } }
			finally { loading = false; locked.forEach( ( [ control, disabled ] ) => { control.disabled = disabled; } ); popup.removeAttribute( 'aria-busy' ); }
		}
		function configureSource( source ) {
			configured = source; settings.hidden = false; list.hidden = true; popup.querySelector( '.lieve-ds-select-find' ).hidden = true; popup.querySelector( '.lieve-ds-select-empty' ).hidden = true; popup.querySelector( '.lieve-token-footer' ).hidden = true;
			const current = selected?.source === source.id ? selected.options : {};
			settings.innerHTML = '<div class="lieve-dynamic-config-heading"><button type="button" class="lieve-button-secondary" data-dynamic-back aria-label="Back to dynamic data sources"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 6-6 6 6 6M4 12h16"/></svg></button><strong>' + lieveContext.escapeHtml( source.label ) + '</strong></div>' + ( source.hint ? '<p class="lieve-dynamic-help">' + lieveContext.escapeHtml( source.hint ) + '</p>' : '' ) + Object.entries( { ...source.parameters, fallback: { label: 'Fallback (optional)', placeholder: 'Used when the source is empty' } } ).map( ( [ key, definition ] ) => {
				const id = 'lieve-dynamic-option-' + key, value = current[ key ] ?? '';
				return '<div class="lieve-dynamic-option"><label for="' + id + '">' + lieveContext.escapeHtml( definition.label ) + ( definition.required ? ' *' : '' ) + '</label>' + ( definition.control === 'select' ? '<select class="lieve-dynamic-select" data-dynamic-parameter="' + key + '" id="' + id + '"><option value="">Choose…</option>' + Object.entries( definition.choices || {} ).map( ( [ choice, label ] ) => '<option value="' + lieveContext.escapeHtml( choice ) + '"' + ( String( value ) === choice ? ' selected' : '' ) + '>' + lieveContext.escapeHtml( label ) + '</option>' ).join( '' ) + '</select>' : '<input type="text" id="' + id + '" data-dynamic-parameter="' + key + '" value="' + lieveContext.escapeHtml( value ) + '" placeholder="' + lieveContext.escapeHtml( definition.placeholder || '' ) + '" maxlength="240" autocomplete="off">' ) + '</div>';
			} ).join( '' ) + '<p class="lieve-dynamic-status" data-dynamic-config-status role="status" hidden></p><button type="button" class="lieve-button-secondary lieve-token-manage" data-dynamic-apply>Apply dynamic data</button>';
			settings.querySelectorAll( 'select' ).forEach( enhance ); settings.querySelector( 'input, .lieve-ds-select-trigger' )?.focus( { preventScroll: true } );
		}
		function apply( value ) {
			if ( ! field.isConnected || ( isStyle ? lieveContext.styleInspectionNode()?.id : lieveContext.state.selectedId ) !== node.id || lieveContext.state.saving || lieveContext.classWorkspace?.isSaving() ) { closeTokenPicker(); return; }
			if ( operand?.apply ) { if ( operand.isCurrent && ! operand.isCurrent() ) { closeTokenPicker(); return; } operand.apply( value ); lieveContext.liveEdit = null; closeTokenPicker(); operand.focus?.(); return; }
			field.value = value; field.dispatchEvent( new Event( 'input', { bubbles: true } ) ); button.setAttribute( 'aria-pressed', String( Boolean( lieveContext.dynamicData.parse( value ) ) ) ); lieveContext.liveEdit = null; closeTokenPicker( true );
		}
		popup.addEventListener( 'click', event => {
			const choice = event.target.closest( '[data-dynamic-source]' );
			if ( choice ) { const source = lieveContext.dynamicData.source( choice.dataset.dynamicSource ); if ( source && Object.keys( source.parameters || {} ).length ) { configureSource( source ); } else if ( source ) { void choose( source ); } }
			if ( event.target.closest( '[data-dynamic-back]' ) ) { settings.hidden = true; list.hidden = false; popup.querySelector( '.lieve-ds-select-find' ).hidden = false; popup.querySelector( '.lieve-token-footer' ).hidden = false; configured = null; filter(); search.focus( { preventScroll: true } ); }
			if ( event.target.closest( '[data-dynamic-apply]' ) && configured && ! loading ) {
				const parameters = Object.fromEntries( Array.from( settings.querySelectorAll( '[data-dynamic-parameter]' ), input => [ input.dataset.dynamicParameter, input.value.trim() ] ).filter( ( [ , value ] ) => value !== '' ) );
				const missing = Object.entries( configured.parameters ).find( ( [ key, definition ] ) => definition.required && ! parameters[ key ] );
				const message = settings.querySelector( '[data-dynamic-config-status]' );
				if ( missing ) { message.textContent = 'Choose ' + missing[ 1 ].label.toLowerCase() + ' to continue.'; message.hidden = false; return; }
				message.hidden = false; message.textContent = 'Resolving data…'; void choose( configured, parameters ).then( () => { if ( settings.isConnected ) { message.textContent = status.textContent; } } );
			}
			if ( event.target.closest( '[data-dynamic-clear]' ) ) { apply( '' ); }
		} );
		search.addEventListener( 'input', filter ); category.addEventListener( 'change', filter );
		list.addEventListener( 'pointermove', event => { const option = event.target.closest( '[data-dynamic-source]' ); if ( option ) { highlight( options.indexOf( option ) ); } } );
		popup.addEventListener( 'keydown', event => {
			if ( event.key === 'Escape' ) { event.preventDefault(); event.stopPropagation(); closeTokenPicker( true ); }
			else if ( ! settings.hidden ) { if ( event.key === 'Enter' && event.target.tagName === 'INPUT' ) { event.preventDefault(); settings.querySelector( '[data-dynamic-apply]' )?.click(); } }
			else if ( [ 'ArrowDown', 'ArrowUp', 'Home', 'End' ].includes( event.key ) && ( event.target !== search || [ 'ArrowDown', 'ArrowUp' ].includes( event.key ) ) ) {
				event.preventDefault(); event.stopPropagation(); if ( ! options.length ) { return; }
				const at = options.indexOf( event.target ); highlight( event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : at < 0 ? active : ( at + ( event.key === 'ArrowDown' ? 1 : -1 ) + options.length ) % options.length ); options[ active ].focus( { preventScroll: true } ); options[ active ].scrollIntoView( { block: 'nearest' } );
			} else if ( event.key === 'Enter' && event.target === search ) { event.preventDefault(); event.stopPropagation(); options[ active ]?.click(); }
			else if ( event.key === 'Tab' && ( event.shiftKey && event.target === search || ! event.shiftKey && ( event.target.closest( '[data-dynamic-clear]' ) || ! selected && options.includes( event.target ) ) ) ) { event.preventDefault(); closeTokenPicker( true ); }
		} );
		( operand?.container || lieveContext.app ).appendChild( popup ); lieveContext.tokenPicker = popup; lieveContext.tokenPickerAnchor = button;
		button.setAttribute( 'aria-expanded', 'true' ); button.setAttribute( 'aria-controls', popup.id );
		function position() {
			const rect = button.getBoundingClientRect(), bounds = ( operand?.container || lieveContext.inspector ).getBoundingClientRect(); const left = Math.max( 12, bounds.left + 16 ), right = Math.min( window.innerWidth - 12, bounds.right - 16 );
			if ( ! rect.width || bounds.right < 32 || bounds.left > window.innerWidth - 32 || right - left < 80 ) { closeTokenPicker(); return; }
			const width = Math.max( 0, Math.min( 320, right - left ) ), below = window.innerHeight - rect.bottom - 12, above = rect.top - 12;
			popup.style.width = width + 'px'; popup.style.height = popup.style.maxHeight = Math.max( 0, Math.min( 460, Math.max( below, above ) - 6 ) ) + 'px'; popup.style.left = Math.max( left, Math.min( rect.right - width, right - width ) ) + 'px'; popup.style.top = ( below < popup.offsetHeight + 6 && above > below ? Math.max( 12, rect.top - popup.offsetHeight - 6 ) : rect.bottom + 6 ) + 'px';
		}
		const scroll = event => { if ( ! popup.contains( event.target ) ) { closeTokenPicker(); } };
		window.addEventListener( 'resize', position ); window.addEventListener( 'scroll', scroll, true ); lieveContext.tokenPickerCleanup = () => { dropdowns.forEach( control => control.destroy() ); window.removeEventListener( 'resize', position ); window.removeEventListener( 'scroll', scroll, true ); };
		enhance( category ); filter(); position(); void popup.offsetWidth; popup.classList.add( 'is-open' ); search.focus( { preventScroll: true } );
	}

	function chooseImage() {
		if ( ! window.wp?.media ) {
			lieveContext.showToast( 'The Media Library is unavailable.', true );
			return;
		}
		const frame = window.wp.media( {
			title: 'Choose an Image',
			button: { text: 'Use This Image' },
			library: { type: 'image' },
			multiple: false,
		} );
		frame.on( 'select', () => {
			const attachment = frame.state().get( 'selection' ).first().toJSON();
			lieveContext.commit( () => {
				const node = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId );
				if ( node && node.type === 'image' ) {
					node.props.attachmentId = attachment.id;
					node.props.imageSource = 'attachment';
					node.props.url = attachment.url;
					node.props.alt = attachment.alt || attachment.title || '';
				}
			} );
		} );
		frame.open();
	}
	return { closeTokenPicker, refreshStyleColorSwatch, tokenColorPreview, openTokenPicker, openDynamicPicker, chooseImage };
	};
} )();
