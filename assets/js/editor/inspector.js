( function () {
	'use strict';
	window.LieveEditorControllers ||= {};
	window.LieveEditorControllers[ 'inspector' ] = function create( lieveContext ) {
	let inspectorOwner = null, preservedView = null, expandedCode = null;
	function inspectorSettingSummary( node ) {
		const sharedClass = node?.type === 'popup-shell' ? null : lieveContext.editingClass();
		if ( sharedClass ) {
			const devices = {};
			for ( const breakpoint of lieveContext.config.breakpoints ) {
				const count = [ 'normal', 'hover', 'focus', 'active', 'disabled', 'before', 'after' ].reduce( ( total, name ) => total + window.LieveClassStyles.parse( window.LieveClassStyles.context( sharedClass, breakpoint.id, name, lieveContext.config.breakpoints ) ).length, 0 );
				if ( count ) { devices[ breakpoint.id ] = count; }
			}
			return { content: 0, markup: 0, interact: 0, motion: 0, condition: 0, style: Object.values( devices ).reduce( ( total, count ) => total + count, 0 ), devices };
		}
		const props = node?.props || {}, definition = lieveContext.config.elements?.[ node?.type ] || {}, defaults = definition.defaults || {};
		const present = value => value !== undefined && value !== null && value !== '';
		const contentKeys = new Set( [ ...Object.keys( definition.fields || {} ), 'editorLabel', 'wrapHtml', ...( definition.children ? [ 'label' ] : [] ), ...( window.LieveListingEditor?.enabled( node ) ? [ 'listing' ] : [] ) ] );
		const content = [ ...contentKeys ].filter( key => Object.hasOwn( props, key ) && ( present( props[ key ] ) || defaults[ key ] !== undefined ) && JSON.stringify( props[ key ] ) !== JSON.stringify( defaults[ key ] ) ).length;
		const markup = [ 'htmlId', 'dataLieveId', 'outputHtmlId', 'outputLieveId', 'className' ].filter( key => present( props[ key ] ) ).length + Object.keys( props.markupClasses || {} ).length + lieveContext.customAttributeRows( node ).length + ( props.classIds?.length || 0 );
		const devices = {};
		for ( const contexts of Object.values( props.styles || {} ) ) { for ( const [ id, states ] of Object.entries( contexts ) ) { devices[ id ] = ( devices[ id ] || 0 ) + Object.values( states ).reduce( ( total, values ) => total + Object.values( values ).filter( present ).length, 0 ); } }
		if ( window.LieveListingEditor?.enabled( node ) ) { for ( const [ id, values ] of Object.entries( props.listing.layout || {} ) ) { devices[id] = ( devices[id] || 0 ) + Object.keys( values ).length; } }
		const legacy = Object.values( lieveContext.styles?.legacyValues( node ) || {} ).filter( present ).length; if ( legacy ) { devices.desktop = ( devices.desktop || 0 ) + legacy; }
		return { content, markup, interact: props.interactions?.length || 0, motion: props.motion?.length || 0, condition: props.conditions?.groups?.reduce( ( count, group ) => count + ( group.rules?.length || 0 ), 0 ) || 0, style: Object.values( devices ).reduce( ( total, count ) => total + count, 0 ) + ( props.classIds?.length || 0 ), devices };
	}

	function settingIndicator( button, count, description, showTooltip = true ) {
		if ( ! button ) { return; }
		const label = button.dataset.settingLabel ||= button.getAttribute( 'aria-label' ) || button.textContent.trim();
		button.dataset.settingCount = String( count );
		button.classList.toggle( 'has-settings', count > 0 );
		button.setAttribute( 'aria-label', label );
		if ( showTooltip ) {
			const tooltip = button.dataset.settingTooltip ||= button.dataset.tooltip || label;
			button.dataset.tooltip = count ? tooltip + ' · ' + description : tooltip;
		}
		let marker = button.querySelector( '[data-setting-marker]' );
		if ( count && ! marker ) { marker = document.createElement( 'span' ); marker.className = 'lieve-setting-marker'; marker.dataset.settingMarker = ''; marker.setAttribute( 'aria-hidden', 'true' ); button.appendChild( marker ); }
		if ( marker ) { marker.hidden = ! count; }
		// Keep the accessible name stable; descriptions expose the same information as the dot.
		if ( count ) { button.setAttribute( 'aria-description', description ); } else { button.removeAttribute( 'aria-description' ); }
	}

	function refreshInspectorIndicators() {
		const node = lieveContext.styleInspectionNode();
		if ( ! lieveContext.styles || ! node ) { lieveContext.app.querySelectorAll( '.lieve-device-choices [data-device]' ).forEach( button => settingIndicator( button, 0, '' ) ); return; }
		const summary = inspectorSettingSummary( node ), item = node.type === 'popup-shell' ? null : lieveContext.editingClass();
		lieveContext.inspector.querySelectorAll( '[data-inspector-tab]' ).forEach( button => {
			const name = button.dataset.inspectorTab, count = summary[ name ];
			settingIndicator( button, count, ( item ? 'Shared class .' + item.name + ' · ' : '' ) + count + ' custom ' + name + ' setting' + ( count === 1 ? '' : 's' ) + ( name === 'style' ? ' across viewports, targets and states' : ' · all viewports' ), false );
		} );
		lieveContext.app.querySelectorAll( '.lieve-device-choices [data-device]' ).forEach( button => {
			const count = summary.devices[ button.dataset.device ] || 0;
			settingIndicator( button, count, ( item ? 'Shared class .' + item.name : node.type === 'popup-shell' ? 'Popup shell' : 'Selected element' ) + ' · ' + count + ' local style setting' + ( count === 1 ? '' : 's' ) );
		} );
		const own = { ...( ! item && lieveContext.styleTarget === 'root' && lieveContext.styleDevice === 'desktop' && lieveContext.styleState === 'normal' ? lieveContext.styles.legacyValues( node ) : {} ), ...lieveContext.inspectorStyleValues( node ) };
		const effective = lieveContext.inspectorStyleValues( node, true ), origins = item ? {} : lieveContext.styles.valueOrigins( node, lieveContext.styleTarget, lieveContext.styleDevice, lieveContext.styleState );
		const local = Object.keys( own ).filter( key => own[ key ] !== '' );
		lieveContext.inspector.querySelectorAll( '[data-style-category]' ).forEach( button => {
			const count = local.filter( key => lieveContext.styles.field( key )?.group === button.dataset.styleCategory ).length;
			settingIndicator( button, count, ( item ? 'Shared class .' + item.name + ' · ' : '' ) + count + ' local setting' + ( count === 1 ? '' : 's' ) + ' in this target, viewport and state' );
		} );
		let refreshSelects = false;
		const fields = new Map( Array.from( lieveContext.inspector.querySelectorAll( '[data-style-prop]' ), field => [ field.dataset.styleProp, field ] ) );
		const units = new Map( Array.from( lieveContext.inspector.querySelectorAll( '[data-style-unit]' ), field => [ field.dataset.styleUnit, field ] ) );
		lieveContext.inspector.querySelectorAll( '[data-style-origin]' ).forEach( badge => {
			const property = badge.dataset.styleOrigin, value = own[ property ], inherited = effective[ property ], explicit = value !== undefined && value !== '';
			const field = fields.get( property ), definition = lieveContext.styles.field( property );
			const origin = origins[ property ], breakpoint = lieveContext.config.breakpoints.find( bp => bp.id === origin?.device );
			const source = origin ? ( breakpoint?.name || origin.device ) + ( origin.state !== 'normal' ? ' · :' + ( origin.state === 'focus' ? 'focus-visible' : origin.state ) : ' · Default' ) : item ? 'Shared class cascade' : 'Element baseline';
			const hasValue = inherited !== undefined && inherited !== '';
			badge.hidden = ! explicit && ! hasValue;
			badge.dataset.valueState = explicit ? 'local' : 'inherited';
			const text = explicit ? 'Set' : 'Inherited'; if ( badge.textContent !== text ) { badge.textContent = text; }
			badge.title = explicit ? 'Set in this target, viewport and state: ' + value : 'Inherited from ' + source + ': ' + inherited;
			if ( field ) {
				field.dataset.valueState = explicit ? 'local' : hasValue ? 'inherited' : 'default';
				if ( explicit || hasValue ) { field.setAttribute( 'aria-description', badge.title ); } else { field.removeAttribute( 'aria-description' ); }
				if ( ! explicit && field.tagName !== 'SELECT' ) { field.placeholder = ( definition.type === 'dimension' ? lieveContext.dimensionControlParts( inherited ).value : inherited ) || definition.placeholder || ( definition.type === 'dimension' ? 'Default' : '' ); }
				if ( field.tagName === 'SELECT' && field.options[ 0 ]?.value === '' ) { const label = ! explicit && hasValue ? 'Inherited: ' + inherited : definition.options[ '' ]; if ( field.options[ 0 ].textContent !== label ) { field.options[ 0 ].textContent = label; refreshSelects = true; } }
				if ( ! explicit && ! field.value ) { const unit = units.get( property ), suffix = lieveContext.dimensionControlParts( inherited ).unit; if ( unit && suffix && unit.value !== suffix ) { unit.value = suffix; refreshSelects = true; } }
			}
		} );
		if ( refreshSelects ) { lieveContext.inspectorSelects.forEach( select => select.refresh() ); }
	}

	function inspectorContextSummary( node ) {
		const item = node?.type === 'popup-shell' ? null : lieveContext.editingClass();
		const breakpoint = lieveContext.config.breakpoints?.find( entry => entry.id === lieveContext.styleDevice );
		const target = lieveContext.config.styleTargets?.[ node?.type ]?.[ lieveContext.styleTarget ]?.label || ( lieveContext.styleTarget === 'root' ? 'Element' : lieveContext.styleTarget );
		const states = { normal: 'Default', hover: ':hover', focus: ':focus-visible', active: ':active', disabled: ':disabled', before: '::before', after: '::after' };
		return {
			label: item ? 'Shared class .' + item.name + ( item.enabled === false ? ' · disabled' : '' ) : node?.type === 'popup-shell' ? 'Pop up styles' : 'Element styles',
			detail: [ ( breakpoint?.name || lieveContext.styleDevice ) + ( breakpoint?.base ? ' (base)' : '' ), item ? 'Shared CSS' : target, states[ lieveContext.styleState ] || lieveContext.styleState ].join( ' · ' ),
			shared: Boolean( item ),
		};
	}

	function inspectorContextMarkup( node, visible = true ) {
		const context = inspectorContextSummary( node );
		visible = visible && ( node?.type !== 'html' || lieveContext.styles?.htmlHasWrapper( node ) );
		return '<div class="lieve-inspector-context" data-inspector-context data-scope="' + ( context.shared ? 'class' : 'element' ) + '" role="group" aria-label="Style editing context"' + ( visible ? '' : ' hidden' ) + '><div><strong data-context-label>' + lieveContext.escapeHtml( context.label ) + '</strong><span data-context-detail>' + lieveContext.escapeHtml( context.detail ) + '</span></div><button type="button" class="lieve-button-secondary lieve-section-action" data-exit-class-styles aria-label="Return to element styles"' + ( context.shared ? '' : ' hidden' ) + '>Element</button></div>';
	}

	function syncInspectorContext() {
		const root = lieveContext.inspector.querySelector( '[data-inspector-context]' ); if ( ! root ) { return; }
		const context = inspectorContextSummary( lieveContext.styleInspectionNode() );
		const node = lieveContext.styleInspectionNode();
		root.hidden = ( lieveContext.popupPanelOpen ? lieveContext.popupPanelTab !== 'style' : lieveContext.inspectorTab !== 'style' ) || ( node?.type === 'html' && ! lieveContext.styles?.htmlHasWrapper( node ) ); root.dataset.scope = context.shared ? 'class' : 'element';
		const label = root.querySelector( '[data-context-label]' ), detail = root.querySelector( '[data-context-detail]' );
		if ( label.textContent !== context.label ) { label.textContent = context.label; } if ( detail.textContent !== context.detail ) { detail.textContent = context.detail; }
		root.querySelector( '[data-exit-class-styles]' ).hidden = ! context.shared;
	}

	function interactionElementChoices() {
		const choices = {};
		lieveContext.walkNodes( lieveContext.state.document.children, item => { if ( item.type !== 'html' || lieveContext.styles?.htmlHasWrapper( item ) ) { choices[ item.id ] = ( item.props.editorLabel || item.props.label || lieveContext.labels[ item.type ] || item.type ) + ' · #' + ( lieveContext.styles?.elementHtmlId( item ) || lieveContext.automaticHtmlId( item ) ); } } );
		return choices;
	}

	function validateInteractions() {
		const invalid = window.LieveInteractions?.validateDocument( lieveContext.state.document, selector => lieveContext.canvas.ownerDocument.querySelectorAll( selector ), lieveContext.config.popupChoices || {} );
		if ( ! invalid ) { return true; }
		lieveContext.activeClassId = null; lieveContext.classWorkspace?.breakGroup(); lieveContext.state.selectedId = invalid.node.id; lieveContext.inspectorTab = 'interact';
		if ( invalid.row ) { window.LieveInteractEditor?.expanded.add( invalid.node.id + ':' + invalid.row.id ); }
		preserveInspectorScroll( () => lieveContext.renderAll() );
		if ( window.innerWidth <= 900 ) { lieveContext.app.dataset.drawer = 'properties'; }
		lieveContext.showToast( Object.values( invalid.errors )[0] || 'Correct the interaction before saving.', true );
		const field = Object.keys( invalid.errors )[0];
		lieveContext.inspector.querySelector( '[data-interact-row="' + ( invalid.row?.id || '' ) + '"] [data-interact-field="' + field + '"]' )?.focus( { preventScroll: true } );
		return false;
	}

	function openPopupSettings( tab = 'style', target = 'root' ) {
		if ( ! lieveContext.isPopupTemplate() ) { return; }
		lieveContext.classWorkspace?.breakGroup(); lieveContext.activeClassId = null; lieveContext.liveEdit = null;
		lieveContext.popupPanelOpen = true; lieveContext.popupPanelTab = tab; lieveContext.styleTarget = target; lieveContext.styleState = 'normal'; lieveContext.styleCategory = target === 'root' ? 'Sizing' : target === 'overlay' ? 'Background' : 'Border'; lieveContext.styleSearch = '';
		renderInspector(); lieveContext.renderCanvasStyles(); lieveContext.renderTemplateSettings(); lieveContext.updateButtons();
		if ( window.matchMedia( '(max-width: 900px)' ).matches ) { lieveContext.closeDrawers(); lieveContext.app.dataset.drawer = 'properties'; document.querySelector( '[data-toggle-drawer="properties"]' )?.setAttribute( 'aria-expanded', 'true' ); }
		lieveContext.inspector.querySelector( '[data-popup-tab="' + tab + '"]' )?.focus( { preventScroll: true } );
	}

	function renderPopupInspector() {
		const settings = lieveContext.state.popupSettings; const node = lieveContext.popupStyleNode(); const model = window.LievePopupSettings;
		const choice = ( key, label, choices, selected ) => '<div class="lieve-control"><label for="lieve-popup-' + key + '">' + lieveContext.escapeHtml( label ) + '</label><select id="lieve-popup-' + key + '" data-popup-setting="' + key + '">' + Object.entries( choices ).map( ( [ value, text ] ) => '<option value="' + value + '"' + ( String( selected ) === value ? ' selected' : '' ) + '>' + lieveContext.escapeHtml( text ) + '</option>' ).join( '' ) + '</select></div>';
		const toggle = ( key, label, help ) => '<label class="lieve-checkbox lieve-popup-switch"><span><strong>' + label + '</strong><small>' + help + '</small></span><input type="checkbox" role="switch" data-popup-setting="' + key + '" aria-label="' + label + '"' + ( settings[ key ] ? ' checked' : '' ) + '></label>';
		const text = ( key, label, type, placeholder, max ) => '<div class="lieve-control"><label for="lieve-popup-' + key + '">' + label + '</label><input id="lieve-popup-' + key + '" type="' + type + '" data-popup-setting="' + key + '" value="' + lieveContext.escapeHtml( settings[ key ] ) + '" placeholder="' + placeholder + '"' + ( type === 'number' ? ' min="0" max="' + max + '" step="1"' : ' maxlength="200"' ) + '></div>';
		const frame = lieveContext.styles.effectiveValues( node, 'frame', lieveContext.styleDevice, 'normal' );
		const align = frame[ 'align-items' ] || 'center', justify = frame[ 'justify-items' ] || 'center';
		const positions = { 'start:start': 'Top left', 'start:center': 'Top center', 'start:end': 'Top right', 'center:start': 'Center left', 'center:center': 'Center', 'center:end': 'Center right', 'end:start': 'Bottom left', 'end:center': 'Bottom center', 'end:end': 'Bottom right' };
		let behavior = lieveContext.group( 'Placement', choice( 'placement', 'Position · current breakpoint', { custom: 'Custom · edit Viewport styles', ...positions }, positions[ align + ':' + justify ] ? align + ':' + justify : 'custom' ) + '<p class="lieve-element-help">Position and outer spacing follow responsive styles. Use Style → Viewport for spacing, alignment and stacking.</p>' );
		behavior += lieveContext.group( 'Closing & overlay', toggle( 'closeButton', 'Close button', 'Off by default. Style it under the Close button target.' ) + toggle( 'closeOnBackdrop', 'Close on backdrop click', 'Click outside the dialog to close it.' ) + toggle( 'closeOnEscape', 'Close with Escape', 'Allow keyboard dismissal.' ) + toggle( 'overlay', 'Show overlay', 'Background, gradient and blur are in Style → Overlay.' ) + '<p class="lieve-popup-dismiss-warning" role="status"' + ( settings.closeButton || settings.closeOnEscape || settings.closeOnBackdrop ? ' hidden' : '' ) + '>All dismissal controls are off. Add an Interact → Close dialog action inside the pop up so visitors can leave it.</p>' );
		behavior += lieveContext.group( 'Page & accessibility', toggle( 'lockScroll', 'Lock page scroll', 'Keep the page behind the pop up in place.' ) + text( 'label', 'Accessible name', 'text', 'Uses the template title when empty', 0 ) + '<p class="lieve-element-help">Focus stays inside the pop up and returns to its opener when closed. Display conditions and opening mode stay in Template conditions.</p>' );
		let motion = lieveContext.group( 'Opening & closing', choice( 'entrance', 'Entrance animation', model.animations, settings.entrance ) + choice( 'exit', 'Exit animation', model.animations, settings.exit ) );
		motion += lieveContext.group( 'Timing', text( 'duration', 'Duration (ms)', 'number', '250', 2000 ) + text( 'delay', 'Entrance delay (ms)', 'number', '0', 5000 ) + choice( 'easing', 'Easing', { 'ease-out': 'Smooth ease out', 'ease-in-out': 'Ease in and out', linear: 'Linear' }, settings.easing ) + '<div class="lieve-popup-preview-actions"><button type="button" class="lieve-button-secondary" data-popup-preview="entrance">Preview entrance</button><button type="button" class="lieve-button-secondary" data-popup-preview="exit">Preview exit</button></div><p class="lieve-element-help">Animations respect reduced motion. Escape closes immediately. Previews never hide your editing canvas.</p>' );
		lieveContext.inspector.innerHTML = '<div class="lieve-inspector-heading"><span class="lieve-inspector-symbol">' + lieveContext.styleCategoryIcon( 'Layout' ) + '</span><div><strong>Pop Up Settings</strong><span>Template shell · content stays independent</span></div><button type="button" class="lieve-button-secondary lieve-popup-panel-close" data-popup-panel-close aria-label="Return to element settings" data-tooltip="Return to element settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>' +
			'<div class="lieve-workspace-tabs lieve-inspector-tabs lieve-popup-tabs" role="tablist" aria-label="Pop Up settings">' + [ 'style', 'behavior', 'motion' ].map( name => '<button type="button" id="lieve-popup-' + name + '-tab" role="tab" aria-controls="lieve-popup-' + name + '-panel" data-popup-tab="' + name + '" aria-selected="' + ( lieveContext.popupPanelTab === name ) + '" tabindex="' + ( lieveContext.popupPanelTab === name ? 0 : -1 ) + '">' + name[0].toUpperCase() + name.slice( 1 ) + '</button>' ).join( '' ) + '</div>' +
			inspectorContextMarkup( node, lieveContext.popupPanelTab === 'style' ) + [ [ 'style', lieveContext.renderStylePanel( node ) ], [ 'behavior', behavior ], [ 'motion', motion ] ].map( ( [ name, content ] ) => '<div id="lieve-popup-' + name + '-panel" class="lieve-inspector-section lieve-popup-panel" role="tabpanel" aria-labelledby="lieve-popup-' + name + '-tab" data-inspector-section="popup-' + name + '"' + ( lieveContext.popupPanelTab === name ? '' : ' hidden' ) + '>' + content + '</div>' ).join( '' );
		const helper = lieveContext.inspector.querySelector( '.lieve-style-help' ); if ( helper ) { helper.textContent = 'Style the popup shell, not its content. Blank fields use the popup baseline or inherited breakpoint values. Dialog radius defaults to 0. Switch Target to edit the overlay, close button or viewport. Variables, library colors and all style categories are available.'; }
		function selectTab( name, focus = false ) { lieveContext.closeTokenPicker(); lieveContext.inspectorSelects.forEach( select => select.close() ); lieveContext.popupPanelTab = name; lieveContext.inspector.querySelectorAll( '[data-popup-tab]' ).forEach( tab => { const active = tab.dataset.popupTab === name; tab.setAttribute( 'aria-selected', String( active ) ); tab.tabIndex = active ? 0 : -1; if ( active && focus ) { tab.focus( { preventScroll: true } ); } } ); lieveContext.inspector.querySelectorAll( '.lieve-popup-panel' ).forEach( panel => { panel.hidden = panel.dataset.inspectorSection !== 'popup-' + name; } ); syncInspectorContext(); enhanceInspectorSelects(); }
		lieveContext.inspector.querySelectorAll( '[data-popup-tab]' ).forEach( tab => { tab.addEventListener( 'click', () => selectTab( tab.dataset.popupTab ) ); tab.addEventListener( 'keydown', event => { const tabs = [ 'style', 'behavior', 'motion' ]; if ( ! [ 'ArrowLeft', 'ArrowRight', 'Home', 'End' ].includes( event.key ) ) { return; } event.preventDefault(); const index = tabs.indexOf( tab.dataset.popupTab ); selectTab( event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at( -1 ) : tabs[ ( index + ( event.key === 'ArrowLeft' ? 2 : 1 ) ) % 3 ], true ); } ); } );
		lieveContext.inspector.querySelector( '[data-popup-panel-close]' ).addEventListener( 'click', () => { lieveContext.popupPanelOpen = false; lieveContext.styleTarget = 'root'; lieveContext.styleState = 'normal'; renderInspector(); lieveContext.renderTemplateSettings(); lieveContext.renderCanvasStyles(); document.getElementById( 'lieve-popup-settings' )?.focus( { preventScroll: true } ); } );
		lieveContext.inspector.querySelectorAll( '[data-popup-setting]' ).forEach( field => {
			const update = event => {
				if ( event.isComposing || field.validity?.badInput ) { return; }
				const key = field.dataset.popupSetting;
				if ( key === 'placement' ) { if ( field.value === 'custom' ) { return; } const [ vertical, horizontal ] = field.value.split( ':' ); lieveContext.liveChange( 'popup:placement:' + lieveContext.styleDevice, () => { lieveContext.styles.write( lieveContext.popupStyleNode(), 'frame', lieveContext.styleDevice, 'normal', 'align-items', vertical ); lieveContext.styles.write( lieveContext.popupStyleNode(), 'frame', lieveContext.styleDevice, 'normal', 'justify-items', horizontal ); }, true ); return; }
				const value = field.type === 'checkbox' ? field.checked : field.type === 'number' ? Number( field.value ) : field.value;
				const error = field.type === 'number' && field.value === '' ? 'Enter a timing value.' : model.validate( { ...lieveContext.state.popupSettings, [ key ]: value } );
				field.setAttribute( 'aria-invalid', String( Boolean( error ) ) ); if ( error ) { field.dataset.popupError = error; return; } delete field.dataset.popupError;
				lieveContext.liveChange( 'popup:' + key, () => { lieveContext.state.popupSettings[ key ] = value; }, true );
				const warning = lieveContext.inspector.querySelector( '.lieve-popup-dismiss-warning' ); warning.hidden = lieveContext.state.popupSettings.closeButton || lieveContext.state.popupSettings.closeOnEscape || lieveContext.state.popupSettings.closeOnBackdrop;
			};
			field.addEventListener( 'input', update ); field.addEventListener( 'change', update ); field.addEventListener( 'blur', () => { lieveContext.liveEdit = null; } );
		} );
		lieveContext.inspector.querySelectorAll( '[data-popup-preview]' ).forEach( button => button.addEventListener( 'click', () => { const shell = lieveContext.canvas.querySelector( '[data-editor-popup-shell]' ); if ( shell ) { void window.LievePopups?.preview( shell, lieveContext.state.popupSettings, button.dataset.popupPreview === 'entrance' ); } } ) );
		lieveContext.bindStyleControls( node ); enhanceInspectorSelects(); refreshInspectorIndicators();
	}

	function writeCustomCode( id, property, value ) {
		const current = lieveContext.findNode( lieveContext.state.document.children, id );
		if ( current?.type !== 'html' || lieveContext.state.saving || ! [ 'content', 'customCss', 'customJs' ].includes( property ) || ( current.props[ property ] ?? '' ) === value ) { return false; }
		lieveContext.liveChange( id + ':prop:' + property, () => {
			lieveContext.phpPreviewSources.delete( id );
			if ( value === '' && property !== 'content' ) { delete current.props[ property ]; } else { current.props[ property ] = value; }
		} );
		if ( lieveContext.state.selectedId === id ) { const field = lieveContext.inspector.querySelector( '[data-prop="' + property + '"]' ); if ( field && field.value !== value ) { field.value = value; } lieveContext.codeFields?.sync( property ); const clear = lieveContext.inspector.querySelector( '[data-clear-code="' + property + '"]' ); if ( clear ) { clear.disabled = ! value || Boolean( field?.readOnly || field?.disabled ); } }
		return true;
	}

	function openCodeDynamic( button, options = {} ) {
		const node = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId );
		const property = button.dataset.codeDynamic;
		const field = options.field || lieveContext.inspector.querySelector( '[data-prop="' + property + '"]' );
		if ( ! node?.props.dynamicCode || ! field ) { return; }
		const codeField = ! options.field ? lieveContext.codeFields?.get( property ) : null;
		const selection = codeField?.selection() || { start: field.selectionStart || 0, end: field.selectionEnd || 0 };
		lieveContext.openDynamicPicker( button, { field, kind: 'text', container: options.container, isCurrent: () => Boolean( lieveContext.findNode( lieveContext.state.document.children, node.id )?.props.dynamicCode && ( ! options.isCurrent || options.isCurrent() ) ), apply: options.insert || ( reference => { if ( codeField ) { codeField.insert( reference, selection ); return; } const current = lieveContext.findNode( lieveContext.state.document.children, node.id ); if ( ! current ) { return; } const text = current.props[property] || ''; writeCustomCode( node.id, property, text.slice( 0, selection.start ) + reference + text.slice( selection.end ) ); field.setSelectionRange( selection.start + reference.length, selection.start + reference.length ); } ), focus: options.focus || codeField?.focus || ( () => field.focus( { preventScroll: true } ) ) } );
	}

	function renderContentPanel( node ) {
		let contentControls = '';
		const props = node.props || {};

		switch ( node.type ) {
			case 'component':
				break;
			case 'slot':
				if ( lieveContext.findParent(lieveContext.state.document.children,node.id)?.type === 'component' ) { contentControls += '<p class="lieve-element-help">Add children here to override this named Slot. Leave it empty to inherit the model content, or enable an explicit empty override.</p>' + lieveContext.control('Override with empty content','slotOverride','checkbox') + '<button type="button" class="lieve-button-secondary" data-slot-reset>Use model content</button>'; }
				else { contentControls += lieveContext.control('Slot key','slotKey','text',{placeholder:node.id}) + lieveContext.control('Slot name','label'); }
				break;
			case 'heading':
				contentControls += lieveContext.control( 'Content', 'content', 'textarea' );
				contentControls += lieveContext.selectControl( 'HTML Level', 'level', { 1: 'H1', 2: 'H2', 3: 'H3', 4: 'H4', 5: 'H5', 6: 'H6' } );
				break;
			case 'text':
				contentControls += lieveContext.richTextControl( 'Rich Text', 'content' );
				break;
			case 'html':
				contentControls += '<p class="lieve-custom-code-status">PHP execution: <strong>' + ( lieveContext.config.customCode?.phpEnabled ? 'Enabled in Settings' : 'Disabled in Settings → General' ) + '</strong></p>';
				contentControls += lieveContext.control( 'Live PHP preview', 'phpPreview', 'checkbox' ) + lieveContext.control( 'Suppress PHP errors', 'suppressPhpErrors', 'checkbox' ) + lieveContext.control( 'Dynamic data', 'dynamicCode', 'checkbox' );
				contentControls += '<p class="lieve-element-help">Live preview runs trusted PHP after code changes. It has full server access, not a PHP sandbox. Suppression hides diagnostics, not authorization or Save errors.</p>';
				[ [ 'HTML/PHP', 'content', '<div class="example">Your markup</div>\n<?php /* Optional trusted PHP */ ?>', 'Markup updates live. Dynamic values are escaped text; PHP is evaluated before dynamic data.' ], [ 'CSS', 'customCss', '.example {\n  color: var(--accent);\n}', 'Write CSS without style tags. Insert dynamic data as a plain CSS value.' ], [ 'JavaScript', 'customJs', 'document.addEventListener("DOMContentLoaded", () => {\n  // Your JavaScript\n});', 'Scripts run in an isolated preview. Insert dynamic data as a standalone JSON value, without surrounding quotes.' ] ].forEach( ( [ label, key, placeholder, help ] ) => {
					const expand = '<button type="button" class="lieve-button-secondary lieve-code-expand" data-expand-code="' + key + '" aria-label="Expand ' + label + ' editor"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"/></svg>Expand</button>';
					const clear = '<button type="button" class="lieve-button-secondary lieve-code-tool" data-clear-code="' + key + '" aria-label="Clear ' + label + '"' + ( ! props[key] ? ' disabled' : '' ) + '>' + lieveContext.customAttributeIcon( 'delete' ) + '</button>';
					const dynamic = '<button type="button" class="lieve-button-secondary lieve-code-tool" data-code-dynamic="' + key + '" aria-label="Insert dynamic data in ' + label + '" aria-haspopup="dialog"' + ( ! props.dynamicCode ? ' disabled' : '' ) + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></svg></button>';
					const field = lieveContext.control( label, key, 'textarea', { placeholder, headingAction: expand + clear + dynamic } );
					contentControls += '<div class="lieve-custom-code-block">' + field + '<p class="lieve-element-help">' + lieveContext.escapeHtml( help ) + '</p></div>';
				} );
				if ( lieveContext.config.customCode && ! lieveContext.config.customCode.canAuthor ) { contentControls += '<p class="lieve-element-help">Only authorized code administrators can change PHP, CSS and JavaScript. Existing approved code can be kept unchanged.</p>'; }
				contentControls += lieveContext.control( 'Add a wrapper for builder styles', 'wrapHtml', 'checkbox' );
				break;
			case 'button':
				contentControls += lieveContext.control( 'Label', 'label' );
				contentControls += lieveContext.control( 'URL', 'url', 'url', { placeholder: 'https://…' } );
				contentControls += '<div class="lieve-control"><label class="lieve-checkbox"><span>Open in a new tab</span><input type="checkbox" role="switch" data-prop="target"' + ( props.target ? ' checked' : '' ) + '></label></div>';
				break;
			case 'image':
				contentControls += '<div class="lieve-control"><button type="button" class="lieve-media-button" id="lieve-choose-image">Choose from Media Library</button></div>';
				contentControls += lieveContext.control( 'Image URL', 'url', 'url' );
				contentControls += lieveContext.control( 'Alternative Text', 'alt' );
				if ( props.attachmentId && props.imageSource !== 'url' ) { contentControls += lieveContext.selectControl( 'Image size', 'imageSize', lieveContext.config.imageSizes || { full: 'Full size' } ); }
				contentControls += lieveContext.selectControl( 'Loading', 'imageLoading', { auto: 'Automatic', lazy: 'Lazy', eager: 'Eager' } );
				contentControls += lieveContext.selectControl( 'Fetch priority', 'imagePriority', { auto: 'Automatic', high: 'High · primary image', low: 'Low' } );
				[ 'caption', 'imageLink', 'linkUrl', 'linkNewTab', 'imageSizes', 'imageDecoding' ].forEach( key => { const field = lieveContext.config.elements.image.fields[key]; contentControls += field.type === 'select' ? lieveContext.selectControl( field.label, key, field.options ) : lieveContext.control( field.label, key, field.type ); } );
				break;
			case 'spacer':
				contentControls += '<p class="lieve-element-help">Set its height in Style → Sizing. The spacer has no preset height.</p>';
				break;
			case 'container':
			case 'section':
				contentControls += '<p class="lieve-element-help">Arrange child elements in Structure. Layout, sizing and responsive controls are available in Style.</p>';
				break;
			default:
				Object.entries( lieveContext.config.elements?.[ node.type ]?.fields || {} ).forEach( ( [ key, field ] ) => {
					if ( props.savedQuery && [ 'postType', 'count', 'taxonomy', 'termId' ].includes( key ) ) { return; }
					if ( field.type === 'saved-query' ) {
						const choices = { ...field.options };
						if ( props[key] && ! Object.hasOwn( choices, props[key] ) ) { choices[props[key]] = 'Unavailable query · ' + props[key]; }
						contentControls += lieveContext.selectControl( field.label, key, choices );
						contentControls += '<p class="lieve-element-help">A saved query controls its own filters, sorting and item count.' + ( lieveContext.config.queryBuilderUrl ? ' <a href="' + lieveContext.escapeHtml( lieveContext.config.queryBuilderUrl ) + '" target="_blank" rel="noopener noreferrer">Manage queries</a>' : '' ) + '</p>';
					} else if ( key === 'menuId' ) { contentControls += lieveContext.selectControl( field.label, key, { 0: 'Select a menu', ...lieveContext.config.navMenus } );
					} else if ( key === 'menuLocation' ) { contentControls += lieveContext.selectControl( field.label, key, { '': 'No registered location', ...lieveContext.config.navLocations } );
					} else if ( key === 'gallerySize' ) { contentControls += lieveContext.selectControl( field.label, key, lieveContext.config.imageSizes || { full: 'Full size' } );
					} else if ( key === 'queryId' ) {
						const choices = { '': 'Select a Posts element' };
						lieveContext.walkNodes( lieveContext.state.document.children, ( item ) => { if ( [ 'posts', 'related-posts' ].includes( item.type ) ) { choices[ item.id ] = ( item.props.label || lieveContext.labels[ item.type ] ) + ' · ' + item.id; } } );
						contentControls += lieveContext.selectControl( field.label, key, choices );
					} else { contentControls += field.itemFields ? lieveContext.repeaterControl( node, field ) : ( field.type === 'select' ? lieveContext.selectControl( field.label, key, field.options ) : lieveContext.control( field.label, key, field.type, { step: field.type === 'number' ? 'any' : undefined } ) ); }
				} );
		}
		if ( lieveContext.canNest( node.type ) && node.type !== 'component' && ! lieveContext.config.elements?.[ node.type ]?.fields?.label ) { contentControls += lieveContext.control( 'Item label', 'label' ); }
		if ( [ 'image-gallery', 'carousel', 'slider' ].includes( node.type ) ) { contentControls += '<div class="lieve-control"><button type="button" class="lieve-button-secondary" data-gallery-media>Add images from Media Library</button></div>'; }
		if ( lieveContext.config.elements?.[ node.type ]?.description ) { contentControls = '<p class="lieve-element-help">' + lieveContext.escapeHtml( lieveContext.config.elements[ node.type ].description ) + '</p>' + contentControls; }

		contentControls += lieveContext.control( 'Structure label', 'editorLabel', 'text', { placeholder: lieveContext.labels[ node.type ] } );
		return ( lieveContext.componentEditor?.markup( node, lieveContext.group ) || '' ) + ( window.LieveListingEditor?.markup( node, { device: lieveContext.styleDevice, points: lieveContext.config.breakpoints, queries: lieveContext.config.listingQueries || {}, manageUrl: lieveContext.config.queryBuilderUrl, group: lieveContext.group, reset: lieveContext.markupResetButton } ) || '' ) + lieveContext.group( 'Element content', contentControls );
	}

	function enhanceInspectorSelects() { lieveContext.inspectorSelects.push( ...lieveContext.enhanceSelects( lieveContext.inspector, true ) ); }

	function mountInspectorRichText( node, restore ) {
		if ( lieveContext.inspectorTab !== 'content' || lieveContext.richTextController ) { return; }
		const model = lieveContext.state.document, isCurrent = () => lieveContext.state.document === model && lieveContext.findNode( model.children, node.id ) === node;
		const root = lieveContext.inspector.querySelector( '[data-rich-text]' );
		if ( root ) { lieveContext.richTextController = window.LieveRichText?.mount( { root, textarea: root.querySelector( '[data-prop="content"]' ), app: lieveContext.app, dynamicData: lieveContext.dynamicData, ...lieveContext.config.richText, restore, isCurrent, onSave: () => { if ( isCurrent() ) { lieveContext.save(); } } } ) || null; if ( lieveContext.richTextController ) { lieveContext.richTextController.nodeId = node.id; } }
	}

	function mountInspectorCode( node, restore ) {
		if ( node.type !== 'html' || lieveContext.inspectorTab !== 'content' ) { return; }
		const model = lieveContext.state.document;
		if ( ! lieveContext.codeFields ) { lieveContext.codeFields = window.LieveCodeEditor?.mount( { root: lieveContext.inspector, canEdit: () => ! lieveContext.state.saving && lieveContext.state.document === model && lieveContext.findNode( model.children, node.id ) === node, restore: restore || {} } ) || null; if ( lieveContext.codeFields ) { lieveContext.codeFields.nodeId = node.id; } }
		else { lieveContext.codeFields.refresh(); }
	}

	function expandedCodeOptions( node, property, field, trigger ) {
		const model = lieveContext.state.document, isCurrent = () => lieveContext.state.document === model && lieveContext.findNode( model.children, node.id ) === node;
		const options = { label: { content: 'HTML/PHP', customCss: 'CSS', customJs: 'JavaScript' }[ property ], value: node.props[ property ] || '', readOnly: field.readOnly || field.disabled, trigger,
			canEdit: () => isCurrent() && ! lieveContext.state.saving, dynamicEnabled: () => isCurrent() && Boolean( node.props.dynamicCode ),
			dynamic: picker => { if ( isCurrent() ) { picker.trigger.dataset.codeDynamic = property; openCodeDynamic( picker.trigger, picker ); } }, closeDynamic: lieveContext.closeTokenPicker,
			read: () => isCurrent() ? node.props[ property ] || '' : undefined, change: value => { if ( isCurrent() ) { writeCustomCode( node.id, property, value ); } },
			finish: () => { if ( expandedCode?.options === options ) { expandedCode = null; } lieveContext.liveEdit = null; },
		};
		return options;
	}

	function renderInspector() {
		lieveContext.inspectorRevision++;
		lieveContext.inspectorSelects.forEach( select => select.destroy() ); lieveContext.inspectorSelects = [];
		const sameOwner = inspectorOwner?.model === lieveContext.state.document && inspectorOwner.node.id === lieveContext.state.selectedId && lieveContext.findNode( lieveContext.state.document.children, inspectorOwner.node.id ) === inspectorOwner.node;
		const keepCodeOwner = sameOwner && expandedCode?.owner === inspectorOwner;
		// Only the existing explicit view-preservation transaction (e.g. accepted
		// manual Save) may restore a caret across canonical server normalization.
		const preserveFocus = Boolean( preservedView && preservedView === inspectorOwner && inspectorOwner.postId === lieveContext.config.postId && inspectorOwner.node.id === lieveContext.state.selectedId && inspectorOwner.node.type === lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId )?.type );
		// A confirmed Save is the only cross-model handoff. Replace the active
		// options with fresh callbacks; never revive callbacks from the old model.
		const savedCode = preserveFocus && expandedCode?.owner === inspectorOwner && lieveContext.state.saving && ! lieveContext.state.dirty && lieveContext.state.savedSnapshot === lieveContext.snapshot() ? expandedCode : null;
		preservedView = null;
		if ( savedCode ) {
			const node = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId ), previous = savedCode.options;
			const options = expandedCodeOptions( node, savedCode.property, { readOnly: previous.readOnly, disabled: false }, previous.trigger );
			if ( lieveContext.codeEditor?.refresh( { owner: previous, replacement: options } ) ) { expandedCode = { ...savedCode, options }; }
			else { expandedCode = null; }
		} else { lieveContext.codeEditor?.refresh(); }
		const codeRestore = lieveContext.codeFields?.nodeId === lieveContext.state.selectedId && ( sameOwner || preserveFocus ) ? lieveContext.codeFields.capture() : null;
		lieveContext.codeFields?.destroy(); lieveContext.codeFields = null;
		lieveContext.motionEditor?.stop();
		const richRestore = lieveContext.richTextController?.nodeId === lieveContext.state.selectedId && ( sameOwner || preserveFocus ) ? lieveContext.richTextController.capture() : null;
		lieveContext.richTextController?.destroy(); lieveContext.richTextController = null;
		lieveContext.interactController?.destroy(); lieveContext.interactController = null;
		lieveContext.elementConditionController?.destroy(); lieveContext.elementConditionController = null;
		lieveContext.motionController?.destroy(); lieveContext.motionController = null;
		lieveContext.classSelector?.destroy(); lieveContext.classSelector = null;
		lieveContext.hideEditorTooltip();
		lieveContext.closeTokenPicker();
		const node = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId );
		const model = lieveContext.state.document, isCurrent = () => lieveContext.state.document === model && lieveContext.findNode( model.children, node?.id ) === node;
		inspectorOwner = node ? { node, model, postId: lieveContext.config.postId } : null;
		if ( ( savedCode || keepCodeOwner ) && expandedCode ) { expandedCode.owner = inspectorOwner; }
		if ( lieveContext.popupPanelOpen && lieveContext.isPopupTemplate() ) { lieveContext.activeClassId = null; renderPopupInspector(); return; }
		if ( lieveContext.popupPanelOpen ) { lieveContext.styleTarget = 'root'; lieveContext.styleState = 'normal'; }
		lieveContext.popupPanelOpen = false;
		if ( ! lieveContext.editingClass() ) { lieveContext.activeClassId = null; }
		if ( ! node ) {
			lieveContext.inspector.innerHTML = '<div class="lieve-inspector-heading"><strong>Element properties</strong></div><div class="lieve-inspector-empty">' + lieveContext.elementIcon( 'container' ) + '<strong>A place for every detail</strong><span>Select an element on the canvas or in Structure to edit its content and style.</span></div>';
			return;
		}
		const motionChoices = lieveContext.motionEditor?.choices() || {}; lieveContext.motionChoicesSnapshot = JSON.stringify( motionChoices );
		if ( node.type === 'component' ) { lieveContext.inspectorTab = 'content'; if ( lieveContext.activeClassId ) { lieveContext.classWorkspace?.breakGroup(); lieveContext.activeClassId = null; } }
		window.LieveInteractEditor?.configureMotion( motionChoices );
		const props = node.props || {}, contentControls = renderContentPanel( node ); let markupControls = '';
		if ( node.type !== 'html' || lieveContext.styles?.htmlHasWrapper( node ) ) {
			markupControls += '<p class="lieve-element-help">Inherit global output settings or override this element. Blank IDs keep their automatic value.</p>';
			markupControls += lieveContext.elementIdentityControl( props, 'outputHtmlId', node );
			markupControls += lieveContext.elementIdentityControl( props, 'outputLieveId', node );
			markupControls = lieveContext.group( '', window.LieveClasses?.markup() || '' ) + lieveContext.group( 'Element identity', markupControls ) + lieveContext.group( 'Authored classes', lieveContext.control( 'Custom CSS classes', 'className', 'text', { placeholder: 'my-class another-class' } ) + ( window.LieveClasses?.manualMarkup() || '' ) ) + lieveContext.group( 'System class overrides', lieveContext.elementMarkupClassesControl( node ), '', lieveContext.markupClassesResetControl( node ) );
			markupControls += lieveContext.customAttributesControl( node );
		} else { markupControls = lieveContext.renderStylePanel( node ); }

		const elementTitle = props.editorLabel || lieveContext.labels[ node.type ] || node.type;
		const identityTitle = lieveContext.identityEnabled( props, 'outputHtmlId' ) ? '#' + lieveContext.styles.elementHtmlId( node ) : 'HTML ID output off';
		lieveContext.inspector.innerHTML = '<div class="lieve-inspector-heading"><span class="lieve-inspector-symbol">' + lieveContext.elementIcon( node.type ) + '</span><div><strong title="' + lieveContext.escapeHtml( elementTitle ) + '">' + lieveContext.escapeHtml( elementTitle ) + '</strong><span data-element-html-id title="' + lieveContext.escapeHtml( identityTitle ) + '">' + lieveContext.escapeHtml( identityTitle ) + '</span><span data-element-class-list aria-label="Assigned classes">' + lieveContext.elementClassSummary( node ) + '</span></div><button type="button" data-element-menu aria-label="Element actions" title="Element actions"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></button></div>' +
			'<div class="lieve-workspace-tabs lieve-inspector-tabs" role="tablist" aria-label="Element settings">' + [ 'content', 'style', 'markup', 'interact', 'motion', 'condition' ].map( name => '<button id="lieve-' + name + '-tab" type="button" role="tab" data-inspector-tab="' + name + '" aria-controls="lieve-' + name + '-panel" tabindex="' + ( lieveContext.inspectorTab === name ? 0 : -1 ) + '" aria-selected="' + ( lieveContext.inspectorTab === name ) + '">' + name[0].toUpperCase() + name.slice( 1 ) + '</button>' ).join( '' ) + '</div>' +
			inspectorContextMarkup( node, lieveContext.inspectorTab === 'style' ) + '<div id="lieve-content-panel" class="lieve-inspector-section" role="tabpanel" aria-labelledby="lieve-content-tab" data-inspector-section="content"' + ( lieveContext.inspectorTab !== 'content' ? ' hidden' : '' ) + '>' + contentControls + '</div>' +
			'<div id="lieve-style-panel" class="lieve-inspector-section" role="tabpanel" aria-labelledby="lieve-style-tab" data-inspector-section="style"' + ( lieveContext.inspectorTab !== 'style' ? ' hidden' : '' ) + '>' +
			lieveContext.renderStylePanel( node ) + '</div><div id="lieve-markup-panel" class="lieve-inspector-section" role="tabpanel" aria-labelledby="lieve-markup-tab" data-inspector-section="markup"' + ( lieveContext.inspectorTab !== 'markup' ? ' hidden' : '' ) + '>' + markupControls + '</div><div id="lieve-interact-panel" class="lieve-inspector-section" role="tabpanel" aria-labelledby="lieve-interact-tab" data-inspector-section="interact"' + ( lieveContext.inspectorTab !== 'interact' ? ' hidden' : '' ) + '>' + ( window.LieveInteractEditor?.markup( node, interactionElementChoices(), lieveContext.config.popupChoices || {} ) || '' ) + '</div>';
		lieveContext.inspector.insertAdjacentHTML( 'beforeend', '<div id="lieve-motion-panel" class="lieve-inspector-section" role="tabpanel" aria-labelledby="lieve-motion-tab" data-inspector-section="motion"' + ( lieveContext.inspectorTab !== 'motion' ? ' hidden' : '' ) + '>' + ( lieveContext.motionEditor?.markup( node ) || '' ) + '</div>' );
		lieveContext.inspector.insertAdjacentHTML( 'beforeend', '<div id="lieve-condition-panel" class="lieve-inspector-section" role="tabpanel" aria-labelledby="lieve-condition-tab" data-inspector-section="condition"' + ( lieveContext.inspectorTab !== 'condition' ? ' hidden' : '' ) + '>' + ( window.LieveElementConditionEditor?.markup( node ) || '' ) + '</div>' );
		if ( node.type === 'component' ) { lieveContext.inspector.querySelector('.lieve-inspector-tabs').hidden=true; lieveContext.inspector.querySelector('[data-element-class-list]')?.setAttribute('hidden',''); }
		function selectInspectorTab( name, focus = false ) {
			lieveContext.motionEditor?.stop();
			lieveContext.classSelector?.close();
			lieveContext.inspectorSelects.forEach( select => select.close() );
			// Non-style tabs belong to the element, never to shared class CSS/history.
			if ( [ 'content', 'markup', 'interact', 'motion', 'condition' ].includes( name ) && lieveContext.activeClassId ) {
				lieveContext.classWorkspace?.breakGroup(); lieveContext.activeClassId = null;
				if ( lieveContext.styleState === 'disabled' ) { lieveContext.styleState = 'normal'; }
				lieveContext.inspectorTab = name;
				preserveInspectorScroll( () => renderInspector() ); lieveContext.renderCanvasStyles(); lieveContext.updateButtons();
				lieveContext.inspector.querySelector( '[data-inspector-tab="' + name + '"]' )?.focus( { preventScroll: true } );
				return;
			}
			if ( name === 'interact' && lieveContext.motionChoicesSnapshot !== JSON.stringify( lieveContext.motionEditor?.choices() || {} ) ) { lieveContext.inspectorTab = name; preserveInspectorScroll( () => renderInspector() ); if ( focus ) { lieveContext.inspector.querySelector( '[data-inspector-tab="interact"]' )?.focus( { preventScroll: true } ); } return; }
			lieveContext.inspectorTab = name;
			lieveContext.inspector.querySelectorAll( '[data-inspector-tab]' ).forEach( ( button ) => { const active = button.dataset.inspectorTab === name; button.setAttribute( 'aria-selected', String( active ) ); button.tabIndex = active ? 0 : -1; if ( active && focus ) { button.focus(); } } );
			lieveContext.inspector.querySelectorAll( '[data-inspector-section]' ).forEach( ( panel ) => { panel.hidden = panel.dataset.inspectorSection !== name; } );
			syncInspectorContext();
			enhanceInspectorSelects(); mountInspectorRichText( node, richRestore ); mountInspectorCode( node, codeRestore );
			lieveContext.motionEditor?.sync();
		}
		lieveContext.inspector.querySelectorAll( '[data-inspector-tab]' ).forEach( ( button ) => {
			button.addEventListener( 'click', () => selectInspectorTab( button.dataset.inspectorTab ) );
			button.addEventListener( 'keydown', event => {
				if ( event.isComposing || ! [ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End' ].includes( event.key ) ) { return; }
				event.preventDefault(); const tabs = [ 'content', 'style', 'markup', 'interact', 'motion', 'condition' ];
				const next = window.LieveWorkspace.gridTabIndex( event.key, tabs.indexOf( button.dataset.inspectorTab ), tabs.length, 3 );
				selectInspectorTab( tabs[ next ], true );
			} );
		} );

		lieveContext.inspector.querySelectorAll( '[data-prop]' ).forEach( ( field ) => {
			const update = ( event ) => {
				if ( ! isCurrent() || ! field.isConnected || event?.isComposing || field.validity?.badInput ) { return; }
				const property = field.dataset.prop;
				let value = field.type === 'checkbox' ? field.checked : field.value;
				if ( field.type === 'number' && value !== '' ) {
					value = Number( value );
				}
				if ( node.type === 'html' && [ 'content', 'customCss', 'customJs' ].includes( property ) ) { writeCustomCode( node.id, property, value ); return; }
				if ( node.type === 'html' && [ 'phpPreview', 'suppressPhpErrors', 'dynamicCode' ].includes( property ) ) { const current = lieveContext.findNode( lieveContext.state.document.children, node.id ); if ( ! current || Boolean( current.props[property] ) === value ) { return; } lieveContext.phpPreviewSources.delete( node.id ); }
				lieveContext.liveChange( node.id + ':prop:' + property, () => {
					const current = lieveContext.findNode( lieveContext.state.document.children, node.id );
					if ( current ) {
						if ( current.type === 'image' && property === 'url' ) { current.props.attachmentId = 0; current.props.imageSource = 'url'; }
						if ( value === '' && ! [ 'content', 'label', 'items' ].includes( property ) ) {
							delete current.props[ property ];
						} else {
							current.props[ property ] = value;
						}
					}
				} );
				if ( [ 'wrapHtml', 'savedQuery', 'phpPreview', 'suppressPhpErrors', 'dynamicCode' ].includes( property ) ) { preserveEditorScroll( () => renderInspector() ); }
				if ( property === 'outputHtmlId' || property === 'outputLieveId' ) { lieveContext.syncIdentityControls( node ); }
				if ( property === 'className' ) { lieveContext.syncElementClassSummary(); lieveContext.classSelector?.refresh(); }
			};
			field.addEventListener( 'input', update ); field.addEventListener( 'change', update ); field.addEventListener( 'compositionend', update );
			field.addEventListener( 'blur', () => { lieveContext.liveEdit = null; } );
		} );
		const phpToggle = lieveContext.inspector.querySelector( '[data-prop="phpPreview"]' ); if ( phpToggle ) { phpToggle.disabled = ! lieveContext.config.customCode?.phpEnabled || ! lieveContext.config.customCode?.canAuthor; }
		lieveContext.inspector.querySelectorAll( '[data-clear-code]' ).forEach( button => button.addEventListener( 'click', () => { if ( ! isCurrent() ) { return; } lieveContext.liveEdit = null; writeCustomCode( node.id, button.dataset.clearCode, '' ); lieveContext.liveEdit = null; lieveContext.codeEditor?.refresh(); } ) );
		lieveContext.inspector.querySelectorAll( '[data-code-dynamic]' ).forEach( button => button.addEventListener( 'click', () => { if ( isCurrent() ) { openCodeDynamic( button ); } } ) );
		lieveContext.inspector.querySelectorAll( '[data-expand-code]' ).forEach( button => button.addEventListener( 'click', () => {
			if ( ! isCurrent() ) { return; }
			lieveContext.codeFields?.flush();
			const property = button.dataset.expandCode, field = lieveContext.inspector.querySelector( '[data-prop="' + property + '"]' );
			if ( ! field || ! window.LieveCodeEditor ) { return; }
			lieveContext.codeEditor ||= window.LieveCodeEditor.create( { app: lieveContext.app } );
			const options = expandedCodeOptions( node, property, field, button );
			expandedCode = { owner: inspectorOwner, options, property }; lieveContext.codeEditor.open( options );
		} ) );
		lieveContext.bindStyleControls( node );
		lieveContext.listingEditor?.bind( { root: lieveContext.inspector, node, device: lieveContext.styleDevice, read: () => lieveContext.findNode( lieveContext.state.document.children, node.id ), change: lieveContext.liveChange, refresh: () => preserveInspectorScroll( renderInspector ) } );
		lieveContext.inspector.querySelectorAll( '[data-dynamic-style], [data-dynamic-prop]' ).forEach( button => {
			button.addEventListener( 'click', () => lieveContext.openDynamicPicker( button ) );
			const property = button.dataset.dynamicStyle || button.dataset.dynamicProp;
			const field = lieveContext.inspector.querySelector( '[' + ( button.hasAttribute( 'data-dynamic-style' ) ? 'data-style-prop' : 'data-prop' ) + '="' + window.CSS.escape( property ) + '"]' );
			field?.addEventListener( 'input', () => button.setAttribute( 'aria-pressed', String( Boolean( lieveContext.dynamicData.parse( field.value ) ) ) ) );
		} );
		lieveContext.bindElementId( node );
		lieveContext.bindElementId( node, true );
		lieveContext.bindIdentityControls( node );
		lieveContext.bindMarkupClasses( node );
		lieveContext.bindCustomAttributes( node );
		lieveContext.inspector.querySelector( '[data-element-class-list]' )?.addEventListener( 'click', event => { const button = event.target.closest( '[data-summary-class-edit]' ); if ( button ) { lieveContext.changeClassTarget( button.dataset.summaryClassEdit === lieveContext.activeClassId ? null : button.dataset.summaryClassEdit ); } } );
		lieveContext.inspector.querySelector( '[data-exit-class-styles]' )?.addEventListener( 'click', () => lieveContext.changeClassTarget( null ) );
		lieveContext.motionController = lieveContext.motionEditor?.bind( lieveContext.inspector, node ) || null;
		lieveContext.elementConditionController = window.LieveElementConditionEditor?.bind( { root: lieveContext.inspector, node, read: () => lieveContext.findNode( lieveContext.state.document.children, node.id ), change: ( key, change, discrete ) => { if ( discrete ) { lieveContext.liveEdit = null; } lieveContext.liveChange( key, change, 'metadata' ); if ( discrete ) { lieveContext.liveEdit = null; } }, structural: ( change, after ) => preserveInspectorScroll( () => { if ( change ) { lieveContext.commit( change, true ); } after?.(); }, ! change ), refresh: renderInspector, openDynamic: lieveContext.openDynamicPicker, url: lieveContext.config.elementConditionUrl, nonce: lieveContext.config.nonce } ) || null;
		lieveContext.motionEditor?.sync();
		lieveContext.interactController = window.LieveInteractEditor?.bind( { root: lieveContext.inspector, node, read: () => lieveContext.findNode( lieveContext.state.document.children, node.id ), elements: interactionElementChoices(), popupChoices: lieveContext.config.popupChoices || {}, refreshPopups: lieveContext.refreshPopupChoices, change: ( key, change, discrete ) => { if ( discrete ) { lieveContext.liveEdit = null; } lieveContext.liveChange( key, change, 'metadata' ); if ( discrete ) { lieveContext.liveEdit = null; } }, structural: ( change, after ) => preserveInspectorScroll( () => { if ( change ) { lieveContext.commit( change, true ); } after?.(); }, ! change ), refresh: renderInspector, notice: lieveContext.showToast } ) || null;
		lieveContext.classSelector = window.LieveClasses?.bind( { root: lieveContext.inspector, workspace: lieveContext.classWorkspace, app: lieveContext.app, editing: () => lieveContext.activeClassId, edit: lieveContext.changeClassTarget, read: () => lieveContext.findNode( lieveContext.state.document.children, node.id )?.props.classIds || [], change: ids => { if ( lieveContext.activeClassId && ! ids.includes( lieveContext.activeClassId ) ) { lieveContext.activeClassId = null; } lieveContext.commit( () => { const current = lieveContext.findNode( lieveContext.state.document.children, node.id ); if ( current ) { current.props.classIds = ids; } }, true ); lieveContext.syncElementClassSummary(); }, readManual: () => lieveContext.findNode( lieveContext.state.document.children, node.id )?.props.className || '', changeManual: value => { lieveContext.commit( () => { const current = lieveContext.findNode( lieveContext.state.document.children, node.id ); if ( current ) { if ( value ) { current.props.className = value; } else { delete current.props.className; } } }, true ); const field = lieveContext.inspector.querySelector( '[data-prop="className"]' ); if ( field ) { field.value = value; } lieveContext.syncElementClassSummary(); } } );
		lieveContext.inspector.querySelectorAll( 'button[title], a[title]' ).forEach( button => { button.dataset.tooltip = button.title; button.removeAttribute( 'title' ); } );
		lieveContext.componentEditor?.bind( lieveContext.inspector, node );
		lieveContext.inspector.querySelector('[data-slot-reset]')?.addEventListener('click',()=>{if(node.children.length&&!window.confirm('Remove the local Slot content and inherit the model content? Undo restores it.'))return;lieveContext.commit(()=>{node.children=[];delete node.props.slotOverride;});});
		enhanceInspectorSelects(); mountInspectorRichText( node, richRestore ); mountInspectorCode( node, codeRestore );
		lieveContext.inspector.querySelectorAll( '[data-enable-html-wrapper]' ).forEach( button => button.addEventListener( 'click', () => lieveContext.commit( () => { const current = lieveContext.findNode( lieveContext.state.document.children, node.id ); if ( current ) { current.props.wrapHtml = true; } } ) ) );
		function editItems( change, preserve = false ) {
			lieveContext.commit( () => { const current = lieveContext.findNode( lieveContext.state.document.children, node.id ); if ( current ) { const rows = lieveContext.parseItems( current.props.items ); change( rows ); current.props.items = JSON.stringify( rows ); } }, preserve );
		}
		lieveContext.inspector.querySelector( '[data-item-add]' )?.addEventListener( 'click', () => editItems( ( rows ) => rows.push( node.type === 'form' ? [ 'New field', 'text', '' ] : [ 'New item', '' ] ) ) );
		lieveContext.inspector.querySelectorAll( '[data-item-index]' ).forEach( ( item ) => {
			const index = Number( item.dataset.itemIndex );
			item.querySelectorAll( '[data-item-column]' ).forEach( ( input ) => {
				const update = ( event ) => { if ( event.isComposing ) { return; } lieveContext.liveChange( node.id + ':items:' + index + ':' + input.dataset.itemColumn, () => { const rows = lieveContext.parseItems( node.props.items ); rows[ index ][ Number( input.dataset.itemColumn ) ] = input.type === 'checkbox' ? ( input.checked ? 'required' : '' ) : input.value; node.props.items = JSON.stringify( rows ); } ); if ( input.dataset.itemColumn === '0' ) { item.querySelector( 'summary > span' ).textContent = input.value || 'Item ' + ( index + 1 ); } };
				input.addEventListener( 'input', update ); input.addEventListener( 'change', update ); input.addEventListener( 'compositionend', update ); input.addEventListener( 'blur', () => { lieveContext.liveEdit = null; } );
			} );
			item.querySelectorAll( '[data-item-action]' ).forEach( ( button ) => button.addEventListener( 'click', () => editItems( ( rows ) => { if ( button.dataset.itemAction === 'remove' ) { rows.splice( index, 1 ); } else { const next = index + ( button.dataset.itemAction === 'up' ? -1 : 1 ); if ( next >= 0 && next < rows.length ) { [ rows[ index ], rows[ next ] ] = [ rows[ next ], rows[ index ] ]; } } } ) ) );
		} );

		lieveContext.inspector.querySelector( '[data-action="up"]' )?.addEventListener( 'click', () => lieveContext.moveSelected( -1 ) );
		lieveContext.inspector.querySelector( '[data-action="down"]' )?.addEventListener( 'click', () => lieveContext.moveSelected( 1 ) );
		lieveContext.inspector.querySelector( '[data-action="duplicate"]' )?.addEventListener( 'click', lieveContext.duplicateSelected );
		lieveContext.inspector.querySelector( '[data-action="delete"]' )?.addEventListener( 'click', lieveContext.deleteSelected );
		lieveContext.inspector.querySelector( '#lieve-choose-image' )?.addEventListener( 'click', lieveContext.chooseImage );
		lieveContext.inspector.querySelector( '[data-gallery-media]' )?.addEventListener( 'click', () => {
			if ( ! window.wp?.media ) { lieveContext.showToast( 'The Media Library is unavailable.', true ); return; }
			const frame = window.wp.media( { title: 'Choose gallery images', button: { text: 'Add images' }, library: { type: 'image' }, multiple: true } );
			frame.on( 'select', () => editItems( rows => { frame.state().get( 'selection' ).toJSON().slice( 0, Math.max( 0, 100 - rows.length ) ).forEach( item => rows.push( [ item.url, item.caption || '', item.alt || '', '', String( item.id ) ] ) ); } ) ); frame.open();
		} );
		lieveContext.inspector.querySelector( '[data-element-menu]' )?.addEventListener( 'click', ( event ) => { const rect = event.currentTarget.getBoundingClientRect(); lieveContext.openContextMenu( node.id, rect.left, rect.bottom + 6 ); } );
		refreshInspectorIndicators();
	}

	function preserveInspectorScroll( change, restoreFocus = false ) {
		const outerPosition = { top: lieveContext.inspector.scrollTop, left: lieveContext.inspector.scrollLeft };
		const positions = new Map( Array.from( lieveContext.inspector.querySelectorAll( '[data-inspector-section]' ), panel => [ panel.dataset.inspectorSection, { top: panel.scrollTop, left: panel.scrollLeft } ] ) );
		const active = document.activeElement;
		const property = active?.dataset?.styleReset;
		const controls = 'input, textarea, select, button, a[href], [tabindex]';
		const focusedIndex = restoreFocus && ! active?.closest?.( '.CodeMirror' ) && lieveContext.inspector.contains( active ) ? Array.from( lieveContext.inspector.querySelectorAll( controls ) ).indexOf( active ) : -1;
		const focusSelector = focusedIndex < 0 ? null : active.dataset.prop ? '[data-prop="' + window.CSS.escape( active.dataset.prop ) + '"]' : active.id ? '#' + window.CSS.escape( active.id ) : null;
		const selection = focusedIndex >= 0 && typeof active.selectionStart === 'number' ? [ active.selectionStart, active.selectionEnd, active.selectionDirection ] : null;
		const fieldScroll = focusedIndex >= 0 ? { top: active.scrollTop, left: active.scrollLeft } : null;
		try { return change(); }
		finally {
			// The reset rebuilds the controls. Keep its field reachable by keyboard
			// without scrolling the new panel into view or returning to its start.
			if ( property ) { lieveContext.inspector.querySelector( '[data-style-prop="' + property + '"]' )?.focus( { preventScroll: true } ); }
			else if ( focusedIndex >= 0 ) {
				const target = active.isConnected ? active : ( focusSelector && lieveContext.inspector.querySelector( focusSelector ) ) || lieveContext.inspector.querySelectorAll( controls )[ focusedIndex ];
				if ( target?.tagName === active.tagName ) {
					target.focus( { preventScroll: true } );
					if ( selection && typeof target.selectionStart === 'number' ) { target.setSelectionRange( ...selection ); }
					target.scrollTop = fieldScroll.top; target.scrollLeft = fieldScroll.left;
				}
			}
			lieveContext.inspector.querySelectorAll( '[data-inspector-section]' ).forEach( panel => { const position = positions.get( panel.dataset.inspectorSection ); if ( position ) { panel.scrollTop = position.top; panel.scrollLeft = position.left; } } );
			lieveContext.inspector.scrollTop = outerPosition.top; lieveContext.inspector.scrollLeft = outerPosition.left;
		}
	}

	function preserveEditorScroll( change ) {
		const previousView = preservedView;
		// Save normalizes the accepted response before entering this existing view
		// transaction. Preserve only presentation here, never the old callbacks'
		// mutation authority; renderInspector checks the page, selection and type.
		preservedView = inspectorOwner;
		// Capture at response time: scrolling while a save is pending is intentional.
		const scrollers = new Map( [ document.scrollingElement, lieveContext.canvas.ownerDocument.scrollingElement, lieveContext.viewport?.stage || lieveContext.canvas.closest( '.lieve-stage-scroll' ), lieveContext.structure.parentElement, document.getElementById( 'lieve-seo-panel' ), document.getElementById( 'lieve-head-panel' ), document.getElementById( 'lieve-page-markup-panel' ) ].filter( Boolean ).map( panel => [ panel, { top: panel.scrollTop, left: panel.scrollLeft } ] ) );
		const canvasFocus = lieveContext.canvas.ownerDocument !== document && document.activeElement === lieveContext.viewport?.frame ? lieveContext.canvas.ownerDocument.activeElement?.closest( '[data-editor-root]' )?.dataset.editorRoot : null;
		try { return preserveInspectorScroll( change, true ); }
		finally {
			preservedView = previousView;
			if ( canvasFocus ) { lieveContext.canvas.querySelector( '[data-editor-root="' + window.CSS.escape( canvasFocus ) + '"]' )?.focus( { preventScroll: true } ); }
			scrollers.forEach( ( position, panel ) => { panel.scrollTop = position.top; panel.scrollLeft = position.left; } );
			lieveContext.updateSelectionOutline();
		}
	}
	return { inspectorSettingSummary, settingIndicator, refreshInspectorIndicators, inspectorContextSummary, inspectorContextMarkup, syncInspectorContext, interactionElementChoices, validateInteractions, openPopupSettings, renderPopupInspector, writeCustomCode, openCodeDynamic, renderContentPanel, enhanceInspectorSelects, mountInspectorRichText, mountInspectorCode, renderInspector, preserveInspectorScroll, preserveEditorScroll };
	};
} )();
