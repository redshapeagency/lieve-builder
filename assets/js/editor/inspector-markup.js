( function () {
	'use strict';
	window.LieveEditorControllers ||= {};
	window.LieveEditorControllers[ 'inspector-markup' ] = function create( lieveContext ) {
	function elementIdError( value, node, data = false ) {
		const automatic = data ? automaticDataId( node ) : automaticHtmlId( node );
		if ( ! value || value === automatic ) { return ''; }
		if ( ! /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test( value ) ) { return 'Use a letter or underscore first, then letters, digits, hyphens or underscores (128 characters maximum).'; }
		const prefix = data ? 'lieve-data-' : 'lieve-';
		if ( value.startsWith( prefix ) ) { return 'The ' + prefix + ' prefix is reserved for automatic IDs. Choose another name.'; }
		let duplicate = false;
		lieveContext.walkNodes( lieveContext.state.document.children, item => { if ( item.id !== node.id && ( data ? lieveContext.styles.elementDataId( item ) : lieveContext.styles.elementHtmlId( item ) ) === value ) { duplicate = true; } } );
		if ( duplicate || Array.from( lieveContext.canvas.querySelectorAll( data ? '[data-lieve-id]' : '[id]' ) ).some( root => ( data ? root.dataset.lieveId : root.id ) === value && root.dataset.editorRoot !== node.id ) ) { return data ? 'This data-lieve-id is already used in the page. Choose a unique value.' : 'This ID is already used in the page. Choose a unique ID.'; }
		return '';
	}

	function bindElementId( node, data = false ) {
		const field = lieveContext.inspector.querySelector( data ? '[data-data-lieve-id]' : '[data-html-id]' ); if ( ! field ) { return; }
		const help = lieveContext.inspector.querySelector( data ? '#lieve-data-value-help' : '#lieve-html-id-help' ); const reset = lieveContext.inspector.querySelector( data ? '[data-reset-data-id]' : '[data-reset-html-id]' );
		const property = data ? 'dataLieveId' : 'htmlId', automatic = data ? automaticDataId( node ) : automaticHtmlId( node );
		const hint = data ? 'Leave blank to use the automatic data-lieve-id. Start with a letter or underscore.' : 'Leave blank to use the automatic ID. Start with a letter or underscore.';
		const update = event => {
			if ( event?.isComposing ) { return; }
			const value = field.value.trim(); const error = elementIdError( value, node, data );
			field.setAttribute( 'aria-invalid', String( Boolean( error ) ) ); field.setCustomValidity( error );
			help.textContent = error || hint;
			reset.disabled = ! value || value === automatic;
			if ( error ) { return; }
			lieveContext.liveChange( node.id + ':' + property, () => { if ( value && value !== automatic ) { node.props[ property ] = value; } else { delete node.props[ property ]; } } );
			syncIdentityControls( node );
		};
		field.addEventListener( 'input', update ); field.addEventListener( 'compositionend', update );
		field.addEventListener( 'blur', () => { lieveContext.liveEdit = null; } );
		reset.addEventListener( 'click', () => { field.value = ''; update(); field.focus( { preventScroll: true } ); } );
	}

	function customAttributeRows( node ) {
		return ( Array.isArray( node.props.attributeRows ) ? node.props.attributeRows : Object.entries( node.props.attributes || {} ).map( ( [ name, value ] ) => ( { name, value } ) ) ).slice( 0, 30 ).map( row => ( { name: String( row.name ?? '' ), value: String( row.value ?? '' ) } ) );
	}

	function customAttributeNameAllowed( name ) {
		return name.length <= 100 && /^[a-z_][a-z0-9_.:-]*$/.test( name ) && ! /^on|^data-(lieve-|editor-|wp-|id$)/.test( name ) && ! [ 'id', 'class', 'style', 'srcdoc' ].includes( name );
	}

	function customAttributeValueAllowed( name, value ) {
		if ( ! [ 'href', 'src', 'action', 'formaction', 'poster', 'cite', 'background', 'longdesc', 'manifest', 'codebase', 'profile', 'data', 'xlink:href', 'ping', 'archive', 'srcset', 'imagesrcset' ].includes( name ) ) { return true; }
		const protocols = lieveContext.config.attributeProtocols || [ 'http', 'https', 'mailto', 'tel', 'sms', 'ftp', 'ftps', 'irc', 'ircs', 'news', 'nntp', 'feed', 'rtsp', 'webcal', 'urn' ];
		const decoded = String( value ).replace( /&#(?:x([0-9a-f]+)|([0-9]+));?/gi, ( match, hex, decimal ) => { const point = parseInt( hex || decimal, hex ? 16 : 10 ); return point <= 0x10ffff ? String.fromCodePoint( point ) : ''; } ).replace( /&(colon|tab|newline);/gi, ( match, entity ) => ( { colon: ':', tab: '\t', newline: '\n' } )[ entity.toLowerCase() ] );
		return [ decoded, ...decoded.split( /[\s,]+/ ) ].every( url => {
			url = url.replace( /[\u0000-\u0020\u007f]+/g, '' );
			// Feed URLs can wrap another protocol; validate the destination too.
			const feed = url.match( /^(?:feed:)+/i );
			if ( feed ) { if ( ! protocols.includes( 'feed' ) || feed[ 0 ].split( ':' ).length > 3 ) { return false; } url = url.slice( feed[ 0 ].length ); }
			const scheme = url.match( /^([^/?#:]*):/ );
			return ! scheme || protocols.includes( scheme[ 1 ].toLowerCase() );
		} );
	}

	function customAttributeErrors( rows ) {
		const names = rows.map( row => row.name.trim().toLowerCase() );
		return rows.map( ( row, index ) => {
			const name = names[ index ];
			if ( ! name ) { return row.value ? 'Choose an attribute name for this value.' : ''; }
			if ( [ 'id', 'class', 'style' ].includes( name ) ) { return 'Use the HTML ID, Custom CSS classes or Style controls for this attribute.'; }
			if ( ! customAttributeNameAllowed( name ) ) { return 'Enter a valid attribute name. Event handlers, srcdoc and internal builder/WordPress attributes are reserved.'; }
			if ( ! customAttributeValueAllowed( name, row.value ) ) { return 'Enter a safe URL. JavaScript and executable data URLs are not allowed.'; }
			return names.some( ( other, position ) => position < index && other === name ) ? 'This attribute already exists. Choose a different name.' : '';
		} );
	}

	function writeCustomAttributes( node, rows ) {
		// Rows own the editor state; the existing map remains the safe HTML output.
		node.props.attributeRows = rows.slice( 0, 30 );
		const attributes = Object.create( null );
		node.props.attributeRows.forEach( row => {
			const name = row.name.trim().toLowerCase();
			if ( customAttributeNameAllowed( name ) && customAttributeValueAllowed( name, row.value ) && ! Object.hasOwn( attributes, name ) ) { attributes[ name ] = row.value; }
		} );
		node.props.attributes = attributes;
	}

	function customAttributeIcon( name ) {
		const shapes = {
			up: '<path d="M12 19V5m-5 5 5-5 5 5"/>',
			down: '<path d="M12 5v14m-5-5 5 5 5-5"/>',
			clone: '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
			delete: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6m4-6v6"/>',
			add: '<path d="M12 5v14M5 12h14"/>',
		};
		return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + shapes[ name ] + '</svg>';
	}

	function customAttributesControl( node ) {
		const rows = customAttributeRows( node );
		const choices = [ 'role', 'title', 'name', 'rel', 'target', 'download', 'hidden', 'inert', 'itemprop', 'itemscope', 'itemtype', 'lang', 'dir', 'tabindex', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden', 'aria-expanded', 'aria-controls', 'aria-live', 'aria-current', 'aria-pressed', 'aria-disabled', 'data-custom' ];
		const fields = rows.map( ( row, index ) => {
			const id = 'lieve-attribute-' + index;
			return '<div class="lieve-attribute-row" data-attribute-row="' + index + '" role="group" aria-label="Attribute ' + ( index + 1 ) + '"><div class="lieve-attribute-heading"><label for="' + id + '-name">Attribute</label><div class="lieve-attribute-actions">' + [ 'clone', 'delete' ].map( action => '<button type="button" class="lieve-button-secondary" data-attribute-action="' + action + '" aria-label="' + ( action === 'clone' ? 'Clone' : 'Delete' ) + ' attribute ' + ( index + 1 ) + '" data-tooltip="' + ( action === 'clone' ? 'Clone attribute' : 'Delete attribute' ) + '"' + ( action === 'clone' && rows.length >= 30 ? ' disabled' : '' ) + '>' + customAttributeIcon( action ) + '</button>' ).join( '' ) + '</div></div>' +
				'<div class="lieve-style-input"><input type="text" id="' + id + '-name" data-attribute-name value="' + lieveContext.escapeHtml( row.name ) + '" placeholder="e.g. role, aria-label or custom-name" maxlength="100" autocomplete="off" spellcheck="false" aria-describedby="' + id + '-error lieve-attributes-help"><select id="' + id + '-picker" data-attribute-picker aria-label="Choose attribute ' + ( index + 1 ) + '">' + choices.map( name => '<option value="' + name + '"' + ( name === row.name ? ' selected' : '' ) + '>' + name + '</option>' ).join( '' ) + '</select></div>' +
				'<div class="lieve-control"><label for="' + id + '-value">Value</label><input type="text" id="' + id + '-value" data-attribute-value value="' + lieveContext.escapeHtml( row.value ) + '" placeholder="e.g. Description, true, or en" maxlength="500" autocomplete="off" spellcheck="false"></div><p id="' + id + '-error" class="lieve-attribute-error" data-attribute-error aria-live="polite" hidden></p></div>';
		} ).join( '' );
		return lieveContext.group( 'Custom attributes', '<div class="lieve-attributes-body"><p id="lieve-attributes-help" class="lieve-element-help">Choose a suggestion or type any attribute name. Leave the value blank for a boolean attribute.</p><div class="lieve-attribute-list">' + fields + '</div>' + ( rows.length ? '' : '<p class="lieve-attributes-empty">No custom attributes added.</p>' ) + '<button type="button" class="lieve-button-secondary lieve-attribute-add" data-attribute-add' + ( rows.length >= 30 ? ' disabled' : '' ) + '>' + customAttributeIcon( 'add' ) + 'Add attribute</button></div>', 'lieve-attributes-group' );
	}

	function bindCustomAttributes( node ) {
		const group = lieveContext.inspector.querySelector( '.lieve-attributes-group' ); if ( ! group ) { return; }
		const sync = () => {
			const errors = customAttributeErrors( customAttributeRows( node ) );
			group.querySelectorAll( '[data-attribute-row]' ).forEach( row => {
				const error = errors[ Number( row.dataset.attributeRow ) ] || '';
				const field = row.querySelector( '[data-attribute-name]' ); const help = row.querySelector( '[data-attribute-error]' );
				field.setCustomValidity( error ); field.setAttribute( 'aria-invalid', String( Boolean( error ) ) );
				help.textContent = error; help.hidden = ! error;
			} );
		};
		group.querySelectorAll( '[data-attribute-name], [data-attribute-value]' ).forEach( field => {
			const update = event => {
				if ( event?.isComposing ) { return; }
				const index = Number( field.closest( '[data-attribute-row]' ).dataset.attributeRow );
				lieveContext.liveChange( node.id + ':attribute:' + index + ':' + ( field.hasAttribute( 'data-attribute-name' ) ? 'name' : 'value' ), () => {
					const rows = customAttributeRows( node ); rows[ index ][ field.hasAttribute( 'data-attribute-name' ) ? 'name' : 'value' ] = field.value; writeCustomAttributes( node, rows );
				} );
				if ( field.hasAttribute( 'data-attribute-name' ) ) { field.closest( '[data-attribute-row]' ).querySelector( '[data-attribute-picker]' )?.dispatchEvent( new Event( 'change', { bubbles: true } ) ); }
				sync();
			};
			[ 'input', 'change', 'compositionend' ].forEach( type => field.addEventListener( type, update ) );
			field.addEventListener( 'blur', () => { lieveContext.liveEdit = null; } );
		} );
		group.querySelectorAll( '[data-attribute-action], [data-attribute-add]' ).forEach( button => button.addEventListener( 'click', () => {
			const rows = customAttributeRows( node ); const action = button.dataset.attributeAction || 'add'; const index = action === 'add' ? rows.length : Number( button.closest( '[data-attribute-row]' ).dataset.attributeRow );
			if ( action !== 'delete' && rows.length >= 30 ) { return; }
			if ( action === 'delete' ) { rows.splice( index, 1 ); }
			else { rows.splice( action === 'clone' ? index + 1 : index, 0, action === 'clone' ? { ...rows[ index ] } : { name: '', value: '' } ); }
			lieveContext.preserveInspectorScroll( () => {
				lieveContext.commit( () => writeCustomAttributes( node, rows ) );
				const focusIndex = action === 'clone' ? index + 1 : Math.min( index, rows.length - 1 );
				const target = focusIndex >= 0 ? lieveContext.inspector.querySelector( '#lieve-attribute-' + focusIndex + '-name' ) : lieveContext.inspector.querySelector( '[data-attribute-add]' );
				target?.focus( { preventScroll: true } ); if ( action === 'clone' ) { target?.select(); }
			} );
		} ) ); sync();
	}

	function validateCustomAttributes() {
		let invalid = null;
		lieveContext.walkNodes( lieveContext.state.document.children, node => {
			if ( invalid || ( node.type === 'html' && ! lieveContext.styles?.htmlHasWrapper( node ) ) ) { return; }
			const errors = customAttributeErrors( customAttributeRows( node ) ); const index = errors.findIndex( Boolean );
			if ( index >= 0 ) { invalid = { node, index, error: errors[ index ] }; }
		} );
		if ( ! invalid ) { return true; }
		lieveContext.activeClassId = null; lieveContext.state.selectedId = invalid.node.id; lieveContext.inspectorTab = 'markup'; lieveContext.renderAll();
		lieveContext.inspector.querySelector( '#lieve-attribute-' + invalid.index + '-name' )?.focus();
		lieveContext.showToast( invalid.error, true ); return false;
	}

	function automaticHtmlId( node ) { return lieveContext.styles.elementHtmlId( { id: node.id, props: {} } ); }

	function automaticDataId( node ) { return lieveContext.styles.elementDataId( { id: node.id, props: {} } ); }

	function identityEnabled( props, flag ) { return typeof props[ flag ] === 'boolean' ? props[ flag ] : lieveContext.config.identityDefaults?.[ flag ] !== false; }

	function elementIdentityControl( props, flag = 'outputLieveId', node = null ) {
		const html = flag === 'outputHtmlId', help = html ? 'lieve-html-output-help' : 'lieve-data-id-help';
		const overridden = typeof props[ flag ] === 'boolean', enabled = identityEnabled( props, flag );
		const text = html ? 'Publish the automatic or custom ID.' : 'Publish the automatic or custom data-lieve-id.';
		const label = html ? 'HTML ID' : 'data-lieve-id', inputId = html ? 'lieve-html-id' : 'lieve-data-id';
		const toggle = '<label class="lieve-checkbox lieve-identity-toggle"><input type="checkbox" role="switch" data-prop="' + flag + '" aria-label="Output ' + label + '" aria-describedby="' + help + '"' + ( enabled ? ' checked' : '' ) + '></label>';
		const reset = markupResetButton( 'data-reset-identity="' + flag + '"', 'Use global setting for ' + label, ! overridden );
		const valueControl = ! node ? '' : html ?
			'<div class="lieve-element-id-input"><input type="text" id="lieve-html-id" data-html-id value="' + lieveContext.escapeHtml( props.htmlId || '' ) + '" placeholder="' + lieveContext.escapeHtml( automaticHtmlId( node ) ) + '" maxlength="128" autocomplete="off" spellcheck="false" aria-describedby="lieve-html-id-help">' + markupResetButton( 'data-reset-html-id', 'Restore automatic ID', ! props.htmlId ) + '</div><p id="lieve-html-id-help" class="lieve-element-id-help" aria-live="polite">Leave blank to use the automatic ID. Start with a letter or underscore.</p>' :
			'<div class="lieve-element-id-input"><input type="text" id="lieve-data-id" data-data-lieve-id value="' + lieveContext.escapeHtml( props.dataLieveId || '' ) + '" placeholder="' + lieveContext.escapeHtml( automaticDataId( node ) ) + '" maxlength="128" autocomplete="off" spellcheck="false" aria-describedby="lieve-data-value-help">' + markupResetButton( 'data-reset-data-id', 'Restore automatic data-lieve-id', ! props.dataLieveId ) + '</div><p id="lieve-data-value-help" class="lieve-element-id-help" aria-live="polite">Leave blank to use the automatic data-lieve-id. Start with a letter or underscore.</p>';
		return '<div class="lieve-control lieve-element-id"><div class="lieve-field-heading lieve-identity-heading"><div class="lieve-markup-field-copy">' + ( node ? '<label for="' + inputId + '">' : '<span>' ) + label + ( node ? '</label>' : '</span>' ) + '<span class="lieve-identity-status" data-identity-status="' + flag + '">' + ( overridden ? 'Override' : 'Inherited' ) + ' · ' + ( enabled ? 'On' : 'Off' ) + '</span></div>' + toggle + reset + '</div>' + valueControl + '<p id="' + help + '" class="screen-reader-text">' + lieveContext.escapeHtml( text ) + ' Inherit Settings → Markup, or override for this element. Editor handles and required styling hooks are preserved.</p></div>';
	}

	function syncIdentityControls( node ) {
		for ( const flag of [ 'outputHtmlId', 'outputLieveId' ] ) {
			const enabled = identityEnabled( node.props, flag ), overridden = typeof node.props[ flag ] === 'boolean';
			const field = lieveContext.inspector.querySelector( '[data-prop="' + flag + '"]' ); if ( field ) { field.checked = enabled; }
			const status = lieveContext.inspector.querySelector( '[data-identity-status="' + flag + '"]' ); if ( status ) { status.textContent = ( overridden ? 'Override' : 'Inherited' ) + ' · ' + ( enabled ? 'On' : 'Off' ); }
			const reset = lieveContext.inspector.querySelector( '[data-reset-identity="' + flag + '"]' ); if ( reset ) { reset.disabled = ! overridden; }
		}
		const label = lieveContext.inspector.querySelector( '[data-element-html-id]' ); if ( label ) { label.textContent = identityEnabled( node.props, 'outputHtmlId' ) ? '#' + lieveContext.styles.elementHtmlId( node ) : 'HTML ID output off'; label.title = label.textContent; }
	}

	function bindIdentityControls( node ) {
		lieveContext.inspector.querySelectorAll( '[data-reset-identity]' ).forEach( button => button.addEventListener( 'click', () => {
			lieveContext.liveEdit = null; lieveContext.liveChange( node.id + ':identity:reset:' + button.dataset.resetIdentity, () => { delete node.props[ button.dataset.resetIdentity ]; } ); lieveContext.liveEdit = null; syncIdentityControls( node );
		} ) );
	}

	function elementMarkupClassOptions( node ) {
		const options = new Map();
		for ( const [ target, defaults ] of [ [ 'elements', [ 'lieve-element' ] ], [ 'element-' + node.type, [ 'lieve-' + node.type, ...( node.type === 'template' ? [ 'lieve-builder-content' ] : [] ) ] ] ] ) {
			const definition = lieveContext.config.outputClasses?.find( item => item.target === target ); const rule = definition?.rule;
			for ( const name of definition?.classes || defaults ) { options.set( name, { name, enabled: ( options.get( name )?.enabled || false ) || ! rule || rule.defaults.includes( name ), source: 'System class' } ); }
			for ( const name of ( rule?.custom || '' ).split( /\s+/ ).filter( Boolean ) ) { options.set( name, { name, enabled: true, source: 'Global custom class' } ); }
		}
		return Array.from( options.values() );
	}

	function markupResetIcon() {
		return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2.7 8M3 4v6h6"/></svg>';
	}

	function markupResetButton( attributes, label, disabled = false, tooltip = label ) {
		return '<button type="button" class="lieve-button-secondary lieve-markup-reset" ' + attributes + ' aria-label="' + lieveContext.escapeHtml( label ) + '" data-tooltip="' + lieveContext.escapeHtml( tooltip ) + '"' + ( disabled ? ' disabled' : '' ) + '>' + markupResetIcon() + '</button>';
	}

	function elementMarkupClassesControl( node ) {
		const overrides = node.props.markupClasses || {};
		return '<p class="lieve-element-help">Inherit Settings → Markup or override class output for this element only. Authored and assigned classes stay separate.</p><div class="lieve-markup-classes">' + elementMarkupClassOptions( node ).map( option => {
			const overridden = typeof overrides[ option.name ] === 'boolean'; const enabled = overridden ? overrides[ option.name ] : option.enabled;
			return '<div class="lieve-markup-class" data-markup-class-row="' + lieveContext.escapeHtml( option.name ) + '"><label class="lieve-checkbox"><span class="lieve-markup-class-copy"><code>' + lieveContext.escapeHtml( option.name ) + '</code><span data-markup-class-status>' + ( overridden ? 'Override' : 'Inherited' ) + ' · ' + ( enabled ? 'On' : 'Off' ) + '</span></span><input type="checkbox" role="switch" data-markup-class="' + lieveContext.escapeHtml( option.name ) + '" aria-label="Output class ' + lieveContext.escapeHtml( option.name ) + '"' + ( enabled ? ' checked' : '' ) + '></label>' + markupResetButton( 'data-reset-markup-class="' + lieveContext.escapeHtml( option.name ) + '"', 'Use global setting for ' + option.name, ! overridden ) + '</div>';
		} ).join( '' ) + '</div>';
	}

	function markupClassesResetControl( node ) {
		return markupResetButton( 'data-reset-markup-classes', 'Reset to global', ! Object.keys( node.props.markupClasses || {} ).length, 'Reset all system class overrides to global' );
	}

	function bindMarkupClasses( node ) {
		const sync = () => {
			const overrides = node.props.markupClasses || {};
			elementMarkupClassOptions( node ).forEach( option => {
				const row = Array.from( lieveContext.inspector.querySelectorAll( '[data-markup-class-row]' ) ).find( item => item.dataset.markupClassRow === option.name ); if ( ! row ) { return; }
				const overridden = typeof overrides[ option.name ] === 'boolean'; const enabled = overridden ? overrides[ option.name ] : option.enabled;
				row.querySelector( '[data-markup-class]' ).checked = enabled; row.querySelector( '[data-reset-markup-class]' ).disabled = ! overridden;
				row.querySelector( '[data-markup-class-status]' ).textContent = ( overridden ? 'Override' : 'Inherited' ) + ' · ' + ( enabled ? 'On' : 'Off' );
			} );
			const reset = lieveContext.inspector.querySelector( '[data-reset-markup-classes]' ); if ( reset ) { reset.disabled = ! Object.keys( overrides ).length; }
		};
		lieveContext.inspector.querySelectorAll( '[data-markup-class]' ).forEach( field => field.addEventListener( 'change', () => { lieveContext.liveEdit = null; lieveContext.liveChange( node.id + ':markup:' + field.dataset.markupClass, () => { node.props.markupClasses = { ...node.props.markupClasses, [ field.dataset.markupClass ]: field.checked }; } ); lieveContext.liveEdit = null; sync(); } ) );
		lieveContext.inspector.querySelectorAll( '[data-reset-markup-class], [data-reset-markup-classes]' ).forEach( button => button.addEventListener( 'click', () => { lieveContext.liveEdit = null; lieveContext.liveChange( node.id + ':markup:reset', () => { if ( button.dataset.resetMarkupClass ) { delete node.props.markupClasses?.[ button.dataset.resetMarkupClass ]; if ( ! Object.keys( node.props.markupClasses || {} ).length ) { delete node.props.markupClasses; } } else { delete node.props.markupClasses; } } ); lieveContext.liveEdit = null; sync(); } ) );
	}
	return { elementIdError, bindElementId, customAttributeRows, customAttributeNameAllowed, customAttributeValueAllowed, customAttributeErrors, writeCustomAttributes, customAttributeIcon, customAttributesControl, bindCustomAttributes, validateCustomAttributes, automaticHtmlId, automaticDataId, identityEnabled, elementIdentityControl, syncIdentityControls, bindIdentityControls, elementMarkupClassOptions, markupResetIcon, markupResetButton, elementMarkupClassesControl, markupClassesResetControl, bindMarkupClasses };
	};
} )();
