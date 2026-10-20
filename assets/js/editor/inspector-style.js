( function () {
	'use strict';
	window.LieveEditorControllers ||= {};
	window.LieveEditorControllers[ 'inspector-style' ] = function create( lieveContext ) {
	function editingClass() {
		if ( ! lieveContext.activeClassId || ! lieveContext.classWorkspace ) { return null; }
		const node = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId );
		return window.LieveClasses.assignedClass( node?.props, lieveContext.activeClassId, lieveContext.classWorkspace.current().classes );
	}

	function inspectorStyleValues( node, inherited = false ) {
		if ( node?.type === 'popup-shell' ) { const values = inherited ? lieveContext.styles.effectiveValues( node, lieveContext.styleTarget, lieveContext.styleDevice, lieveContext.styleState ) : lieveContext.styles.ownValues( node, lieveContext.styleTarget, lieveContext.styleDevice, lieveContext.styleState ); return inherited ? { ...( window.LievePopupSettings.baselines[ lieveContext.styleTarget ] || {} ), ...values } : values; }
		const item = editingClass(); if ( item ) { const css = inherited ? window.LieveClassStyles.effectiveCss( item, lieveContext.styleDevice, lieveContext.styleState, lieveContext.config.breakpoints ) : window.LieveClassStyles.context( item, lieveContext.styleDevice, lieveContext.styleState, lieveContext.config.breakpoints ); const values = window.LieveClassStyles.read( css ); if ( ! values[ 'custom-css' ].trim() ) { delete values[ 'custom-css' ]; } return values; }
		return inherited ? lieveContext.styles.effectiveValues( node, lieveContext.styleTarget, lieveContext.styleDevice, lieveContext.styleState ) : lieveContext.styles.ownValues( node, lieveContext.styleTarget, lieveContext.styleDevice, lieveContext.styleState );
	}

	function writeClassStyles( properties, value, group = '' ) {
		if ( ! editingClass() || lieveContext.state.saving || lieveContext.classWorkspace.isSaving() ) { return false; }
		lieveContext.classStyleWriting = true;
		try { return lieveContext.classWorkspace.edit( data => { const item = data.classes.find( item => item.id === lieveContext.activeClassId ); properties.forEach( property => window.LieveClassStyles.write( item, lieveContext.styleDevice, lieveContext.styleState, lieveContext.config.breakpoints, property, value ) ); }, group ); }
		finally { lieveContext.classStyleWriting = false; lieveContext.updateButtons(); }
	}

	function changeClassTarget( id ) {
		const node = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId );
		if ( id && ( ! lieveContext.classWorkspace?.canManage || ! window.LieveClasses.assignedClass( node?.props, id, lieveContext.classWorkspace.current().classes ) ) ) { return; }
		lieveContext.classWorkspace?.breakGroup(); lieveContext.activeClassId = id; lieveContext.styleTarget = 'root'; if ( ! id && lieveContext.styleState === 'disabled' ) { lieveContext.styleState = 'normal'; } lieveContext.inspectorTab = 'style';
		lieveContext.renderInspector(); lieveContext.renderCanvasStyles(); lieveContext.updateButtons();
		lieveContext.inspector.querySelector( '[data-inspector-tab="style"]' )?.focus( { preventScroll: true } );
	}

	function refreshClassStyleFields() {
		if ( ! editingClass() ) { return; }
		const node = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId ); const own = inspectorStyleValues( node ); const effective = inspectorStyleValues( node, true );
		const gradientRows = lieveContext.inspector.querySelectorAll( '[data-gradient-row]' ).length;
		if ( gradientRows && gradientRows !== lieveContext.styles.gradientCount( effective ) ) { lieveContext.preserveInspectorScroll( () => lieveContext.renderInspector() ); return; }
		lieveContext.inspector.querySelectorAll( '[data-style-prop]' ).forEach( field => {
			const property = field.dataset.styleProp; const definition = lieveContext.styles.field( property ); const value = own[ property ] || ''; const inherited = effective[ property ] || '';
			if ( field !== document.activeElement ) {
				if ( field.tagName === 'SELECT' && value && ! Array.from( field.options ).some( option => option.value === value ) ) { field.add( new Option( value, value ) ); }
				field.value = definition.type === 'dimension' ? dimensionControlParts( value ).value : value; field.removeAttribute( 'aria-invalid' );
				if ( field.tagName === 'SELECT' && field.options[ 0 ]?.value === '' ) { field.options[ 0 ].textContent = inherited ? 'Inherited: ' + inherited : definition.options[ '' ]; }
			}
			if ( field.tagName !== 'SELECT' ) { field.placeholder = ( definition.type === 'dimension' ? dimensionControlParts( inherited ).value : inherited ) || definition.placeholder || ( definition.type === 'dimension' ? 'Default' : '' ); }
			const reset = lieveContext.inspector.querySelector( '[data-style-reset="' + property + '"]' ); if ( reset ) { reset.disabled = ! value; }
			if ( definition.type === 'color' ) { lieveContext.refreshStyleColorSwatch( property ); }
			const unit = lieveContext.inspector.querySelector( '[data-style-unit="' + property + '"]' ); const suffix = dimensionControlParts( value || inherited ).unit; if ( unit && suffix ) { unit.value = suffix; }
		} );
		lieveContext.inspector.querySelectorAll( '[data-style-group]' ).forEach( group => { group.querySelector( '[data-style-count]' ).textContent = Array.from( group.querySelectorAll( '[data-style-prop]' ) ).filter( field => own[ field.dataset.styleProp ] !== undefined ).length || ''; } );
		const reset = lieveContext.inspector.querySelector( '[data-reset-context]' ); if ( reset ) { reset.disabled = ! Object.keys( own ).length; } lieveContext.inspectorSelects.forEach( select => select.refresh() );
	}

	function dimensionControlParts( value ) {
		const binding = lieveContext.dynamicData?.parse( value );
		if ( binding ) { return { value: lieveContext.dynamicData.reference( binding.source, '', binding.options ), unit: binding.unit }; }
		return lieveContext.styles.dimensionParts( value );
	}

	function spacingLinkKey( prefix, mode ) { return mode === 'all' ? prefix : prefix + ':' + mode; }

	function toggleSpacingLink( prefix, mode ) {
		if ( ! [ 'padding', 'margin' ].includes( prefix ) || ! [ 'all', 'vertical', 'horizontal' ].includes( mode ) ) { return; }
		const key = spacingLinkKey( prefix, mode ); const wasLinked = lieveContext.linkedSpacing.has( key );
		if ( mode === 'all' ) { lieveContext.linkedSpacing.delete( prefix + ':vertical' ); lieveContext.linkedSpacing.delete( prefix + ':horizontal' ); }
		else { lieveContext.linkedSpacing.delete( prefix ); }
		if ( wasLinked ) { lieveContext.linkedSpacing.delete( key ); } else { lieveContext.linkedSpacing.add( key ); }
	}

	function spacingLinkProperties( property ) {
		const match = property.match( /^(padding|margin)-(top|right|bottom|left)$/ ); if ( ! match ) { return [ property ]; }
		const [ , prefix, side ] = match; let sides = [ side ];
		if ( lieveContext.linkedSpacing.has( prefix ) ) { sides = [ 'top', 'right', 'bottom', 'left' ]; }
		else if ( [ 'top', 'bottom' ].includes( side ) && lieveContext.linkedSpacing.has( prefix + ':vertical' ) ) { sides = [ 'top', 'bottom' ]; }
		else if ( [ 'left', 'right' ].includes( side ) && lieveContext.linkedSpacing.has( prefix + ':horizontal' ) ) { sides = [ 'left', 'right' ]; }
		return sides.map( item => prefix + '-' + item );
	}

	function spacingLinkStatus( prefix ) {
		if ( lieveContext.linkedSpacing.has( prefix ) ) { return 'All four sides'; }
		const vertical = lieveContext.linkedSpacing.has( prefix + ':vertical' ), horizontal = lieveContext.linkedSpacing.has( prefix + ':horizontal' );
		return vertical && horizontal ? 'Opposite pairs' : vertical ? 'Top + bottom' : horizontal ? 'Left + right' : 'Independent';
	}

	function spacingLinkIcon( mode ) {
		const paths = { all: 'M7 3h10M7 21h10M3 7v10M21 7v10M12 3v3m0 12v3M3 12h3m12 0h3', vertical: 'M6 3h12M6 21h12M12 3v6m0 6v6', horizontal: 'M3 6v12M21 6v12M3 12h6m6 0h6' };
		return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" opacity=".5"/><path d="' + paths[ mode ] + '"/></svg>';
	}

	function renderSpacingLinks() {
		const modes = { all: 'Link all four sides', vertical: 'Link top and bottom', horizontal: 'Link left and right' };
		return '<div class="lieve-spacing-links">' + [ 'padding', 'margin' ].map( prefix => '<div class="lieve-spacing-link-row" role="group" aria-label="' + ( prefix === 'padding' ? 'Padding' : 'Margin' ) + ' side linking"><div class="lieve-spacing-link-label"><span>' + ( prefix === 'padding' ? 'Padding' : 'Margin' ) + '</span><small data-spacing-link-status="' + prefix + '">' + spacingLinkStatus( prefix ) + '</small></div><div class="lieve-spacing-link-options">' + Object.entries( modes ).map( ( [ mode, label ] ) => '<button type="button" class="lieve-button-secondary lieve-spacing-link" data-link-spacing="' + prefix + '" data-spacing-mode="' + mode + '" aria-label="' + label + ' · ' + prefix + '" title="' + label + ' · ' + prefix + '" aria-pressed="' + lieveContext.linkedSpacing.has( spacingLinkKey( prefix, mode ) ) + '">' + spacingLinkIcon( mode ) + '</button>' ).join( '' ) + '</div></div>' ).join( '' ) + '</div>';
	}

	function fontFamilyOptions() {
		const choices = [ { value: '', label: 'Default / inherited' }, ...( lieveContext.config.fontChoices || [] ).map( font => ( { value: font.value, label: font.label + ' · Local font' } ) ), ...[ 'system-ui', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy' ].map( value => ( { value, label: value } ) ) ];
		const seen = new Set();
		return choices.filter( font => { if ( seen.has( font.value ) ) { return false; } seen.add( font.value ); return true; } ).map( font => '<option value="' + lieveContext.escapeHtml( font.value ) + '">' + lieveContext.escapeHtml( font.label ) + '</option>' ).join( '' );
	}

	function styleControl( node, property, field, context = null ) {
		const own = context?.own || inspectorStyleValues( node );
		const effective = context?.effective || inspectorStyleValues( node, true );
		const value = own[ property ] ?? ( ! lieveContext.activeClassId && lieveContext.styleDevice === 'desktop' && lieveContext.styleState === 'normal' && lieveContext.styleTarget === 'root' ? lieveContext.styles.legacyValues( node )[ property ] ?? '' : '' );
		const inherited = value === '' ? effective[ property ] : '';
		const id = 'lieve-style-' + property;
		const placeholder = ( field.type === 'dimension' ? dimensionControlParts( inherited ).value : inherited ) || field.placeholder || ( field.type === 'dimension' ? 'Default' : '' );
		const attributes = ' id="' + lieveContext.escapeHtml( id ) + '" data-style-prop="' + lieveContext.escapeHtml( property ) + '"';
		let input;
		if ( field.type === 'select' ) {
			const options = lieveContext.activeClassId && value && ! Object.hasOwn( field.options, value ) ? { ...field.options, [ value ]: value } : field.options;
			input = '<select' + attributes + '>' + Object.entries( options ).map( ( [ key, label ] ) => '<option value="' + lieveContext.escapeHtml( key ) + '"' + ( String( value ) === key ? ' selected' : '' ) + ( property === 'gradient-apply' && key === 'overlay' && [ 'before', 'after' ].includes( lieveContext.styleState ) ? ' disabled' : '' ) + '>' + lieveContext.escapeHtml( key === '' && inherited ? 'Inherited: ' + inherited : label ) + '</option>' ).join( '' ) + '</select>';
		} else if ( field.type === 'textarea' ) { input = '<textarea' + attributes + ' placeholder="' + lieveContext.escapeHtml( placeholder ) + '" spellcheck="false">' + lieveContext.escapeHtml( value ) + '</textarea>'; }
		else {
			const type = field.type === 'image' ? 'url' : 'text';
			input = '<input type="' + type + '"' + attributes + ' value="' + lieveContext.escapeHtml( field.type === 'dimension' ? dimensionControlParts( value ).value : value ) + '" placeholder="' + lieveContext.escapeHtml( placeholder ) + '"' + ( field.type === 'number' ? ' inputmode="decimal"' : '' ) + ' autocomplete="off" spellcheck="false">';
			if ( property === 'font-family' ) {
				input += '<select id="lieve-installed-fonts" data-font-family-picker aria-label="Choose font family">' + fontFamilyOptions() + '</select>';
				if ( lieveContext.config.fontLibraryPage && lieveContext.config.canManageFonts ) { input += '<a class="lieve-style-image" href="' + lieveContext.escapeHtml( lieveContext.config.fontLibraryPage ) + '" target="_blank" rel="noopener" aria-label="Manage local fonts" title="Manage local fonts">' + lieveContext.elementIcon( 'text' ) + '</a>'; }
			}
			if ( field.type === 'color' ) { input = '<button type="button" class="lieve-color-swatch" data-style-library="' + lieveContext.escapeHtml( property ) + '" aria-label="Choose library color for ' + lieveContext.escapeHtml( field.label ) + '" title="Color library and custom colors" aria-expanded="false"><span aria-hidden="true"></span></button>' + input; }
			if ( field.type === 'image' ) { input += '<button type="button" class="lieve-style-image" data-style-image aria-label="Choose background image" title="Media Library">' + lieveContext.elementIcon( 'image' ) + '</button>'; }
			if ( field.type === 'dimension' ) {
				const unit = dimensionControlParts( value || inherited ).unit || 'px';
				input += '<select class="lieve-unit-select" data-style-unit="' + lieveContext.escapeHtml( property ) + '" aria-label="' + lieveContext.escapeHtml( field.label ) + ' unit">' + [ 'px', '%', 'rem', 'em', 'vh', 'vw', 'dvh', 'svh', 'vmin', 'vmax', 'ch', 'fr' ].map( ( item ) => '<option' + ( unit === item ? ' selected' : '' ) + '>' + item + '</option>' ).join( '' ) + '</select>';
			}
			if ( field.type !== 'image' ) { input += '<button type="button" class="lieve-style-image lieve-token-button" data-style-token="' + lieveContext.escapeHtml( property ) + '" aria-label="Choose variable for ' + lieveContext.escapeHtml( field.label ) + '" aria-haspopup="dialog" aria-expanded="false" title="System variables"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4H6a2 2 0 0 0-2 2v3a3 3 0 0 1-2 3 3 3 0 0 1 2 3v3a2 2 0 0 0 2 2h2m8-16h2a2 2 0 0 1 2 2v3a3 3 0 0 0 2 3 3 3 0 0 0-2 3v3a2 2 0 0 1-2 2h-2"/><circle cx="12" cy="12" r="1"/></svg></button>'; }
			if ( lieveContext.dynamicData?.styleKind( property, field ) ) { input += lieveContext.dynamicDataButton( property, field.label, true, value ); }
		}
		return '<div class="lieve-style-control' + ( field.type === 'textarea' || [ 'font-family', 'box-shadow', 'text-shadow', 'filter', 'backdrop-filter', 'transform', 'clip-path', 'grid-template-columns', 'grid-template-rows', 'background-image' ].includes( property ) ? ' is-wide' : '' ) + '" data-style-label="' + lieveContext.escapeHtml( ( field.label + ' ' + property ).toLowerCase() ) + '"><div class="lieve-style-label lieve-field-heading"><label for="' + lieveContext.escapeHtml( id ) + '">' + lieveContext.escapeHtml( field.label ) + '</label><span class="lieve-style-origin" data-style-origin="' + lieveContext.escapeHtml( property ) + '" hidden></span><button type="button" class="lieve-button-secondary lieve-field-reset" data-style-reset="' + lieveContext.escapeHtml( property ) + '" aria-label="Reset ' + lieveContext.escapeHtml( field.label ) + '" title="Reset to inherited / default"' + ( value === '' ? ' disabled' : '' ) + '>' + lieveContext.markupResetIcon() + '</button></div><div class="lieve-style-input">' + input + '</div></div>';
	}

	function gradientRepeater( node ) {
		const count = lieveContext.styles.gradientCount( inspectorStyleValues( node, true ) );
		const copy = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="3"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/></svg>';
		const trash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M5 6l1 14h12l1-14M10 10v6m4-6v6"/></svg>';
		const labels = Array.from( { length: count }, ( _, i ) => 'stop ' + ( i + 1 ) + ' color gradient-color-' + ( i + 1 ) + ' gradient-stop-' + ( i + 1 ) ).join( ' ' );
		return '<div class="lieve-gradient-repeater" data-style-label="gradient colors stops ' + labels + '"><div class="lieve-gradient-heading"><span>Color stops</span><small>Color + position</small></div><div class="lieve-gradient-list">' + Array.from( { length: count }, ( _, index ) => {
			const number = index + 1;
			return '<div class="lieve-gradient-row" data-gradient-row="' + number + '"><div class="lieve-gradient-row-heading"><span>Color ' + number + '</span><div class="lieve-gradient-actions"><button type="button" class="lieve-button-secondary" data-gradient-action="clone" data-gradient-index="' + index + '" aria-label="Duplicate gradient color ' + number + '" title="Duplicate color"' + ( count >= 100 ? ' disabled' : '' ) + '>' + copy + '</button><button type="button" class="lieve-button-secondary" data-gradient-action="remove" data-gradient-index="' + index + '" aria-label="Remove gradient color ' + number + '" title="Remove color"' + ( count <= 2 ? ' disabled' : '' ) + '>' + trash + '</button></div></div><div class="lieve-gradient-row-fields">' + styleControl( node, 'gradient-color-' + number, { ...lieveContext.styles.field( 'gradient-color-' + number ), label: 'Stop ' + number + ' color', placeholder: '#16c6c0 or var(--primary)' } ) + styleControl( node, 'gradient-stop-' + number, { ...lieveContext.styles.field( 'gradient-stop-' + number ), label: 'Stop ' + number + ' (%)', placeholder: 'Auto' } ) + '</div></div>';
		} ).join( '' ) + '</div><button type="button" class="lieve-button-secondary lieve-gradient-add" data-gradient-action="add"' + ( count >= 100 ? ' disabled' : '' ) + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Add color</button><p class="lieve-element-help">Use at least two colors. Blank positions are spaced automatically. Overlay uses ::before above the background and below the content.</p></div>';
	}

	function editGradientRows( node, action, index = -1 ) {
		if ( lieveContext.state.saving || lieveContext.classWorkspace?.isSaving() ) { return; }
		const values = inspectorStyleValues( node, true ); const count = lieveContext.styles.gradientCount( values );
		const rows = Array.from( { length: count }, ( _, i ) => ( { color: values[ 'gradient-color-' + ( i + 1 ) ] || '', stop: values[ 'gradient-stop-' + ( i + 1 ) ] || '' } ) );
		if ( action === 'add' && count < 100 ) { rows.push( { color: '', stop: '' } ); }
		else if ( action === 'clone' && index >= 0 && index < count && count < 100 ) { rows.splice( index + 1, 0, { ...rows[ index ] } ); }
		else if ( action === 'remove' && index >= 0 && index < count && count > 2 ) { rows.splice( index, 1 ); }
		else { return; }
		lieveContext.preserveInspectorScroll( () => {
			const write = ( property, value ) => lieveContext.styles.write( node, lieveContext.styleTarget, lieveContext.styleDevice, lieveContext.styleState, property, value );
			const change = item => {
				if ( item ) { window.LieveClassStyles.writeGradientRows( item, lieveContext.styleDevice, lieveContext.styleState, lieveContext.config.breakpoints, rows ); return; }
				// Write the count first so removed inherited rows can never reappear in this context.
				write( 'gradient-count', String( rows.length ) );
				write( 'gradient-local-stops', '1' );
				rows.forEach( ( row, i ) => { write( 'gradient-color-' + ( i + 1 ), row.color ); write( 'gradient-stop-' + ( i + 1 ), row.stop ); } );
				for ( let i = rows.length + 1; i <= count; i++ ) { write( 'gradient-color-' + i, '' ); write( 'gradient-stop-' + i, '' ); }
			};
			if ( lieveContext.activeClassId ) {
				lieveContext.classStyleWriting = true; try { lieveContext.classWorkspace.breakGroup(); lieveContext.classWorkspace.edit( data => { const item = data.classes.find( item => item.id === lieveContext.activeClassId ); if ( ! item ) { throw new Error( 'This class is no longer available. Select another class or return to Element.' ); } change( item ); } ); } catch ( error ) { lieveContext.showToast( error.message, true ); return; } finally { lieveContext.classStyleWriting = false; }
			} else { lieveContext.liveEdit = null; lieveContext.liveChange( node.id + ':gradient:rows', () => change( null ), true ); lieveContext.liveEdit = null; }
			lieveContext.renderInspector(); lieveContext.renderCanvasStyles(); lieveContext.updateButtons();
			const next = action === 'add' ? rows.length : action === 'clone' ? index + 2 : Math.min( index + 1, rows.length );
			lieveContext.inspector.querySelector( '[data-style-prop="gradient-color-' + next + '"]' )?.focus( { preventScroll: true } );
		} );
	}

	function renderStylePanel( node ) {
		if ( ! lieveContext.styles ) { return '<p class="lieve-element-help">Style controls could not be loaded. Reload the editor.</p>'; }
		if ( node.type === 'html' && ! lieveContext.styles.htmlHasWrapper( node ) ) { return '<div class="lieve-raw-html-note"><strong>Clean HTML output</strong><p>No wrapper is added. Define classes, IDs and styles directly in your HTML, or add a wrapper explicitly to use builder style controls.</p><button type="button" class="lieve-button-secondary lieve-section-action" data-enable-html-wrapper>Add wrapper for builder styles</button></div>'; }
		const targets = lieveContext.activeClassId ? { root: { label: 'Class', selector: '' } } : Object.fromEntries( Object.entries( lieveContext.config.styleTargets?.[ node.type ] || { root: { label: 'Element', selector: '' } } ).filter( ( [key] ) => ! key.startsWith( 'listing-' ) || window.LieveListingEditor?.enabled( node ) ) );
		if ( ! targets[ lieveContext.styleTarget ] ) { lieveContext.styleTarget = 'root'; }
		const selector = ( label, attribute, choices, selected ) => '<div class="lieve-control"><label for="lieve-' + attribute.slice( 5 ) + '">' + label + '</label><select id="lieve-' + attribute.slice( 5 ) + '" ' + attribute + ' aria-label="' + label + '">' + Object.entries( choices ).map( ( [ key, text ] ) => '<option value="' + key + '"' + ( selected === key ? ' selected' : '' ) + '>' + lieveContext.escapeHtml( text ) + '</option>' ).join( '' ) + '</select></div>';
		const targetNames = Object.fromEntries( Object.entries( targets ).map( ( [ key, target ] ) => [ key, target.label ] ) );
		const breakpoint = lieveContext.config.breakpoints.find( item => item.id === lieveContext.styleDevice );
		const inheritedFrom = window.LieveResponsive.cascade( lieveContext.config.breakpoints, lieveContext.styleDevice ).filter( item => item.id !== lieveContext.styleDevice ).map( item => item.name );
		const contextDescription = ( breakpoint?.name || lieveContext.styleDevice ) + ( breakpoint?.base ? ' · Base styles' : ' · Inherits ' + inheritedFrom.join( ' → ' ) );
		const contextFields = '<div class="lieve-style-context" title="' + lieveContext.escapeHtml( contextDescription ) + '">' + selector( 'Target', 'data-style-target', targetNames, lieveContext.styleTarget ) + selector( 'State', 'data-style-state', { normal: 'Default', hover: ':hover', focus: ':focus-visible', active: ':active', ...( lieveContext.activeClassId ? { disabled: ':disabled' } : {} ), before: '::before', after: '::after' }, lieveContext.styleState ) + '</div>';
		const contextCount = Object.keys( inspectorStyleValues( node ) ).length + ( ! lieveContext.activeClassId && lieveContext.styleDevice === 'desktop' && lieveContext.styleState === 'normal' && lieveContext.styleTarget === 'root' ? Object.keys( lieveContext.styles.legacyValues( node ) ).length : 0 );
		const fieldContext = { own: inspectorStyleValues( node ), effective: inspectorStyleValues( node, true ) };
		const resetContext = '<button type="button" class="lieve-button-secondary lieve-section-action" data-reset-context title="Reset styles in this breakpoint and state"' + ( contextCount ? '' : ' disabled' ) + '>' + lieveContext.markupResetIcon() + 'Reset context</button>';
		let html = lieveContext.group( 'Style context', contextFields, 'lieve-style-context-group', resetContext );
		html += '<div class="lieve-style-search"><input type="search" data-style-search aria-label="Find a style setting" placeholder="Find a style setting…" value="' + lieveContext.escapeHtml( lieveContext.styleSearch ) + '"></div>';
		const groups = {};
		Object.entries( lieveContext.config.styleSchema || {} ).forEach( ( [ property, field ] ) => {
			if ( property === 'content' && ! [ 'before', 'after' ].includes( lieveContext.styleState ) ) { return; }
			if ( [ 'gradient-count', 'gradient-local-stops' ].includes( property ) || /^gradient-(?:color|stop)-/.test( property ) ) { return; }
			groups[ field.group ] ||= []; groups[ field.group ].push( [ property, field ] );
		} );
		if ( ! groups[ lieveContext.styleCategory ] ) { lieveContext.styleCategory = Object.keys( groups )[ 0 ]; }
		html += '<div class="lieve-workspace-tabs lieve-style-categories" role="tablist" aria-label="Style categories">' + Object.keys( groups ).map( ( name, index ) => '<button type="button" id="lieve-style-category-' + index + '" role="tab" data-style-category="' + lieveContext.escapeHtml( name ) + '" aria-label="' + lieveContext.escapeHtml( name ) + '" data-tooltip="' + lieveContext.escapeHtml( name ) + '" aria-controls="lieve-style-category-panel-' + index + '" aria-selected="' + ( name === lieveContext.styleCategory ) + '" tabindex="' + ( name === lieveContext.styleCategory ? 0 : -1 ) + '">' + lieveContext.styleCategoryIcon( name ) + '</button>' ).join( '' ) + '</div>';
		Object.entries( groups ).forEach( ( [ name, fields ], index ) => {
			const own = fieldContext.own; const count = fields.filter( ( [ key ] ) => own[ key ] !== undefined ).length + ( name === 'Gradient' ? Object.keys( own ).filter( key => /^gradient-(?:color|stop)-/.test( key ) ).length : 0 );
			const links = name === 'Spacing' ? renderSpacingLinks() : '';
			html += '<section class="lieve-control-group lieve-style-group" id="lieve-style-category-panel-' + index + '" role="tabpanel" aria-labelledby="lieve-style-category-' + index + '" data-style-group="' + lieveContext.escapeHtml( name ) + '"' + ( name !== lieveContext.styleCategory ? ' hidden' : '' ) + '><div class="lieve-inspector-group-heading lieve-style-category-heading"><h3 class="lieve-control-group-title">' + lieveContext.escapeHtml( name ) + '</h3><small data-style-count aria-label="Settings in this context">' + ( count || '' ) + '</small></div><div class="lieve-inspector-group-body">' + links + '<div class="lieve-style-fields">' + fields.map( ( [ property, field ] ) => styleControl( node, property, field, fieldContext ) ).join( '' ) + '</div>' + ( name === 'Gradient' ? gradientRepeater( node ) : '' ) + '</div></section>';
		} );
		return html + '<p class="lieve-style-search-empty" role="status" hidden>No style settings match your search.</p><p class="lieve-style-help">' + ( lieveContext.activeClassId ? 'Changes edit the shared class CSS, not this element. Save publishes them across the website. Blank fields inherit. The CSS tab shows the complete declaration list for this breakpoint and state; editing it updates these controls.' : 'Blank fields use inheritance or the clean element baseline: zero spacing and decoration, with H1–H6 size presets. Dimensions accept CSS units, calc(), clamp() and variables. Pseudo-elements need content and sizing. CSS accepts scoped declarations, not selectors or scripts.' ) + '</p>';
	}

	function bindStyleControls( node ) {
		if ( ! lieveContext.styles ) { return; }
		const boundContext = { revision: lieveContext.inspectorRevision, target: lieveContext.styleTarget, device: lieveContext.styleDevice, state: lieveContext.styleState, classId: lieveContext.activeClassId, selectedId: lieveContext.state.selectedId, popup: lieveContext.popupPanelOpen };
		const isCurrentContext = () => boundContext.revision === lieveContext.inspectorRevision && boundContext.target === lieveContext.styleTarget && boundContext.device === lieveContext.styleDevice && boundContext.state === lieveContext.styleState && boundContext.classId === lieveContext.activeClassId && boundContext.selectedId === lieveContext.state.selectedId && boundContext.popup === lieveContext.popupPanelOpen;
		lieveContext.inspector.querySelectorAll( '[data-gradient-action]' ).forEach( button => button.addEventListener( 'click', () => editGradientRows( node, button.dataset.gradientAction, Number( button.dataset.gradientIndex ) ) ) );
		lieveContext.inspector.querySelectorAll( '[data-style-token], [data-style-library]' ).forEach( button => button.addEventListener( 'click', () => lieveContext.openTokenPicker( button ) ) );
		lieveContext.inspector.querySelectorAll( '[data-style-library]' ).forEach( button => lieveContext.refreshStyleColorSwatch( button.dataset.styleLibrary ) );
		const filterStyles = () => {
			const query = lieveContext.styleSearch.toLowerCase().trim();
			lieveContext.inspector.querySelectorAll( '[data-style-group]' ).forEach( group => { let matches = 0; group.querySelectorAll( '[data-style-label]' ).forEach( field => { field.hidden = ! ( group.dataset.styleGroup.toLowerCase() + ' ' + field.dataset.styleLabel ).includes( query ); if ( ! field.hidden ) { matches++; } } ); const tab = Array.from( lieveContext.inspector.querySelectorAll( '[data-style-category]' ) ).find( item => item.dataset.styleCategory === group.dataset.styleGroup ); tab.hidden = ! matches; } );
			const tabs = Array.from( lieveContext.inspector.querySelectorAll( '[data-style-category]' ) ).filter( tab => ! tab.hidden );
			if ( ! tabs.some( tab => tab.dataset.styleCategory === lieveContext.styleCategory ) && tabs.length ) { lieveContext.styleCategory = tabs[ 0 ].dataset.styleCategory; }
			lieveContext.inspector.querySelectorAll( '[data-style-category]' ).forEach( tab => { const active = ! tab.hidden && tab.dataset.styleCategory === lieveContext.styleCategory; tab.setAttribute( 'aria-selected', String( active ) ); tab.tabIndex = active ? 0 : -1; } );
			lieveContext.inspector.querySelectorAll( '[data-style-group]' ).forEach( group => { group.hidden = ! tabs.length || group.dataset.styleGroup !== lieveContext.styleCategory; } );
			const empty = lieveContext.inspector.querySelector( '.lieve-style-search-empty' ); if ( empty ) { empty.hidden = Boolean( tabs.length ); }
			lieveContext.enhanceInspectorSelects();
		};
		lieveContext.inspector.querySelectorAll( '[data-style-category]' ).forEach( button => {
			const activate = () => { lieveContext.inspectorSelects.forEach( select => select.close() ); lieveContext.hideEditorTooltip(); lieveContext.styleCategory = button.dataset.styleCategory; filterStyles(); };
			button.addEventListener( 'click', activate );
			button.addEventListener( 'keydown', event => {
				if ( ! [ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End' ].includes( event.key ) ) { return; }
				event.preventDefault(); const tabs = Array.from( lieveContext.inspector.querySelectorAll( '[data-style-category]' ) ).filter( tab => ! tab.hidden ); const index = tabs.indexOf( button );
				if ( ! tabs.length ) { return; }
				const columns = window.getComputedStyle( button.parentElement ).gridTemplateColumns.split( /\s+/ ).length;
				const next = window.LieveWorkspace.gridTabIndex( event.key, index, tabs.length, columns );
				tabs[ next ].click(); tabs[ next ].focus( { preventScroll: true } );
			} );
		} );
		lieveContext.inspector.querySelector( '[data-style-search]' )?.addEventListener( 'input', ( event ) => { lieveContext.styleSearch = event.target.value; filterStyles(); } );
		filterStyles();
		lieveContext.inspector.querySelectorAll( '[data-link-spacing]' ).forEach( button => button.addEventListener( 'click', () => {
			const prefix = button.dataset.linkSpacing; toggleSpacingLink( prefix, button.dataset.spacingMode );
			lieveContext.inspector.querySelectorAll( '[data-link-spacing="' + prefix + '"]' ).forEach( item => item.setAttribute( 'aria-pressed', String( lieveContext.linkedSpacing.has( spacingLinkKey( prefix, item.dataset.spacingMode ) ) ) ) );
			lieveContext.inspector.querySelector( '[data-spacing-link-status="' + prefix + '"]' ).textContent = spacingLinkStatus( prefix );
		} ) );
		[ [ '[data-style-target]', 'target' ], [ '[data-style-state]', 'state' ] ].forEach( ( [ selector, kind ] ) => lieveContext.inspector.querySelector( selector )?.addEventListener( 'change', ( event ) => { lieveContext.liveEdit = null; if ( kind === 'target' ) { lieveContext.styleTarget = event.target.value; } else { lieveContext.styleState = event.target.value; } lieveContext.renderInspector(); lieveContext.renderCanvasStyles(); lieveContext.inspector.querySelector( selector + ' + .lieve-ds-select-trigger' )?.focus(); } ) );
		lieveContext.inspector.querySelectorAll( '[data-style-prop]' ).forEach( ( field ) => {
			const property = field.dataset.styleProp;
			const update = ( event ) => {
				// Native change/blur can fire while a focused control is being replaced.
				// Its old value belongs to the context that created it, never the new viewport.
				if ( ! isCurrentContext() || field.isConnected === false || event?.isComposing || field.validity?.badInput || ( lieveContext.activeClassId && ( lieveContext.state.saving || lieveContext.classWorkspace?.isSaving() ) ) ) { return; }
				let value = field.value;
				const unit = lieveContext.inspector.querySelector( '[data-style-unit="' + property + '"]' );
				if ( unit && lieveContext.dynamicData?.parse( value ) ) { const binding = lieveContext.dynamicData.parse( value ); value = lieveContext.dynamicData.reference( binding.source, unit.value, binding.options ); }
				else if ( unit && /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test( value.trim() ) ) { value = value.trim() + unit.value; }
				else if ( unit ) { value = lieveContext.styles.dimensionValue( value, unit.value ); }
				const explicitUnit = dimensionControlParts( value ).unit; if ( unit && explicitUnit ) { unit.value = explicitUnit; if ( field.value !== dimensionControlParts( value ).value ) { field.value = dimensionControlParts( value ).value; } }
				field.setAttribute( 'aria-invalid', String( Boolean( ! lieveContext.activeClassId && value && ! lieveContext.styles.safeValue( property, value ) ) ) );
				const properties = spacingLinkProperties( property );
				if ( lieveContext.activeClassId ) {
					try { writeClassStyles( properties, value, lieveContext.activeClassId + ':' + lieveContext.styleDevice + ':' + lieveContext.styleState + ':' + property ); field.setAttribute( 'aria-invalid', 'false' ); }
					catch ( error ) { field.setAttribute( 'aria-invalid', 'true' ); field.dataset.styleError = error.message; return; }
					delete field.dataset.styleError; refreshClassStyleFields();
				} else { lieveContext.liveChange( node.id + ':style:' + lieveContext.styleTarget + ':' + lieveContext.styleDevice + ':' + lieveContext.styleState + ':' + property, () => properties.forEach( ( key ) => lieveContext.styles.write( node, lieveContext.styleTarget, lieveContext.styleDevice, lieveContext.styleState, key, value ) ), true ); }
				properties.filter( ( key ) => key !== property ).forEach( ( key ) => { const linked = lieveContext.inspector.querySelector( '[data-style-prop="' + key + '"]' ); const linkedUnit = lieveContext.inspector.querySelector( '[data-style-unit="' + key + '"]' ); if ( linked ) { linked.value = linkedUnit ? dimensionControlParts( value ).value : value; linked.setAttribute( 'aria-invalid', field.getAttribute( 'aria-invalid' ) ); } const reset = lieveContext.inspector.querySelector( '[data-style-reset="' + key + '"]' ); if ( reset ) { reset.disabled = ! value; } if ( linkedUnit && explicitUnit ) { linkedUnit.value = explicitUnit; } } );
				lieveContext.inspector.querySelector( '[data-style-reset="' + property + '"]' ).disabled = ! value;
				const group = field.closest( '[data-style-group]' ); const own = inspectorStyleValues( node );
				group.querySelector( '[data-style-count]' ).textContent = Array.from( group.querySelectorAll( '[data-style-prop]' ) ).filter( ( item ) => own[ item.dataset.styleProp ] !== undefined ).length || '';
				const contextReset = lieveContext.inspector.querySelector( '[data-reset-context]' ); if ( contextReset ) { contextReset.disabled = ! Object.keys( own ).length; }
				lieveContext.inspectorSelects.forEach( select => select.refresh() );
				if ( lieveContext.styles.field( property )?.type === 'color' ) { lieveContext.refreshStyleColorSwatch( property ); }
			};
			field.addEventListener( 'input', update ); field.addEventListener( 'change', update ); field.addEventListener( 'compositionend', update ); field.addEventListener( 'blur', () => { if ( ! isCurrentContext() || field.isConnected === false ) { return; } lieveContext.liveEdit = null; lieveContext.classWorkspace?.breakGroup(); if ( lieveContext.activeClassId && field.getAttribute( 'aria-invalid' ) !== 'true' ) { refreshClassStyleFields(); } } );
		} );
		lieveContext.inspector.querySelectorAll( '[data-style-unit]' ).forEach( ( unit ) => unit.addEventListener( 'change', () => { if ( ! isCurrentContext() || unit.isConnected === false ) { return; } const input = lieveContext.inspector.querySelector( '[data-style-prop="' + unit.dataset.styleUnit + '"]' ); const parts = dimensionControlParts( input.value ); if ( lieveContext.dynamicData?.parse( input.value ) || /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test( parts.value ) || lieveContext.styles.dimensionValue( parts.value, unit.value ) !== parts.value ) { input.value = parts.value; input.dispatchEvent( new Event( 'input', { bubbles: true } ) ); } } ) );
		lieveContext.inspector.querySelectorAll( '[data-style-reset]' ).forEach( ( button ) => button.addEventListener( 'click', () => lieveContext.preserveInspectorScroll( () => { if ( lieveContext.activeClassId ) { writeClassStyles( [ button.dataset.styleReset ], '' ); lieveContext.renderInspector(); } else { lieveContext.commit( () => lieveContext.styles.write( node, lieveContext.styleTarget, lieveContext.styleDevice, lieveContext.styleState, button.dataset.styleReset, '' ) ); } } ) ) );
		lieveContext.inspector.querySelector( '[data-reset-context]' )?.addEventListener( 'click', () => lieveContext.preserveInspectorScroll( () => { if ( lieveContext.activeClassId ) { writeClassStyles( [ 'custom-css' ], '' ); lieveContext.renderInspector(); } else { lieveContext.commit( () => { lieveContext.styles.migrate( node ); if ( node.props.styles?.[ lieveContext.styleTarget ]?.[ lieveContext.styleDevice ] ) { delete node.props.styles[ lieveContext.styleTarget ][ lieveContext.styleDevice ][ lieveContext.styleState ]; lieveContext.styles.prune( node ); } } ); } } ) );
		lieveContext.inspector.querySelector( '[data-style-image]' )?.addEventListener( 'click', () => {
			if ( ! window.wp?.media ) { lieveContext.showToast( 'The Media Library is unavailable.', true ); return; }
			const context = { target: lieveContext.styleTarget, device: lieveContext.styleDevice, state: lieveContext.styleState, classId: lieveContext.activeClassId }; const id = node.id;
			const frame = window.wp.media( { title: 'Choose a Background Image', button: { text: 'Use This Image' }, library: { type: 'image' }, multiple: false } );
			frame.on( 'select', () => { const image = frame.state().get( 'selection' ).first().toJSON(); if ( context.classId ) { lieveContext.classWorkspace.edit( data => { const item = data.classes.find( item => item.id === context.classId ); if ( item ) { window.LieveClassStyles.write( item, context.device, context.state, lieveContext.config.breakpoints, 'background-image', image.url ); } } ); refreshClassStyleFields(); } else { lieveContext.commit( () => { const current = lieveContext.findStyleNode( id ); if ( current ) { lieveContext.styles.write( current, context.target, context.device, context.state, 'background-image', image.url ); } } ); } } ); frame.open();
		} );
	}
	return { editingClass, inspectorStyleValues, writeClassStyles, changeClassTarget, refreshClassStyleFields, dimensionControlParts, spacingLinkKey, toggleSpacingLink, spacingLinkProperties, spacingLinkStatus, spacingLinkIcon, renderSpacingLinks, fontFamilyOptions, styleControl, gradientRepeater, editGradientRows, renderStylePanel, bindStyleControls };
	};
} )();
