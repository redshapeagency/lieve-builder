( function () {
	'use strict';
	window.LieveEditorControllers ||= {};
	window.LieveEditorControllers[ 'controls' ] = function create( lieveContext ) {
	function control( label, property, type = 'text', options = {} ) {
		const node = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId );
		const value = property === 'wrapHtml' && node?.type === 'html' && lieveContext.styles ? lieveContext.styles.htmlHasWrapper( node ) : node?.props?.[ property ] ?? '';
		const id = 'lieve-prop-' + property + '-' + ( ++lieveContext.controlId );
		const attributes = [
			'id="' + lieveContext.escapeHtml( id ) + '"',
			'data-prop="' + property + '"',
			type === 'number' && options.min !== undefined ? 'min="' + options.min + '"' : '',
			type === 'number' && options.max !== undefined ? 'max="' + options.max + '"' : '',
			type === 'number' ? 'step="' + ( options.step || 1 ) + '"' : '',
			options.placeholder ? 'placeholder="' + lieveContext.escapeHtml( options.placeholder ) + '"' : '',
		].filter( Boolean ).join( ' ' );

		const dynamic = lieveContext.dynamicData?.propKind( node?.type, property ) ? dynamicDataButton( property, label, false, value ) : '';
		if ( type === 'textarea' ) {
			return '<div class="lieve-control"><div class="lieve-field-heading"><label for="' + lieveContext.escapeHtml( id ) + '">' + lieveContext.escapeHtml( label ) + '</label>' + dynamic + ( options.headingAction || '' ) + '</div><textarea ' + attributes + '>' + lieveContext.escapeHtml( value ) + '</textarea></div>';
		}
		if ( type === 'checkbox' ) { return '<div class="lieve-control"><label class="lieve-checkbox"><span>' + lieveContext.escapeHtml( label ) + '</span><input type="checkbox" role="switch" data-prop="' + lieveContext.escapeHtml( property ) + '"' + ( value ? ' checked' : '' ) + '></label></div>'; }
		return '<div class="lieve-control"><label for="' + lieveContext.escapeHtml( id ) + '">' + lieveContext.escapeHtml( label ) + '</label>' + ( dynamic ? '<div class="lieve-style-input lieve-content-data-input">' : '' ) + '<input type="' + type + '" value="' + lieveContext.escapeHtml( value ) + '" ' + attributes + '>' + dynamic + ( dynamic ? '</div>' : '' ) + '</div>';
	}

	function selectControl( label, property, options ) {
		const node = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId );
		const value = String( node?.props?.[ property ] ?? '' );
		const id = 'lieve-prop-' + property + '-' + ( ++lieveContext.controlId );
		const choices = Object.entries( options ).map( ( [ optionValue, optionLabel ] ) => '<option value="' + lieveContext.escapeHtml( optionValue ) + '"' + ( value === String( optionValue ) ? ' selected' : '' ) + '>' + lieveContext.escapeHtml( optionLabel ) + '</option>' ).join( '' );
		return '<div class="lieve-control"><label for="' + lieveContext.escapeHtml( id ) + '">' + lieveContext.escapeHtml( label ) + '</label><select id="' + lieveContext.escapeHtml( id ) + '" data-prop="' + lieveContext.escapeHtml( property ) + '">' + choices + '</select></div>';
	}

	function richTextControl( label, property ) {
		const node = lieveContext.findNode( lieveContext.state.document.children, lieveContext.state.selectedId ), value = node?.props?.[ property ] ?? '';
		const id = 'lieve-rich-content-' + ( ++lieveContext.controlId );
		return '<div class="lieve-control lieve-rich-text" data-rich-text><div class="lieve-rich-tools"><div data-rich-tabs></div>' + dynamicDataButton( property, label, false, value ) + '</div><div data-rich-body><textarea id="' + id + '" data-prop="' + property + '" aria-label="Rich Text HTML content">' + lieveContext.escapeHtml( value ) + '</textarea><p class="lieve-rich-status" data-rich-status role="status" hidden></p></div><div class="lieve-rich-binding" data-rich-binding hidden><strong data-rich-source></strong><p>Dynamic data controls this content. Use the data selector to change or remove it.</p></div></div>';
	}

	function dynamicDataButton( property, label, style, value ) {
		const disabled = style && Boolean( lieveContext.editingClass() );
		return '<button type="button" class="lieve-style-image lieve-dynamic-button" data-dynamic-' + ( style ? 'style' : 'prop' ) + '="' + lieveContext.escapeHtml( property ) + '" aria-label="Choose dynamic data for ' + lieveContext.escapeHtml( label ) + '" aria-haspopup="dialog" aria-expanded="false" aria-pressed="' + Boolean( lieveContext.dynamicData?.parse( value ) ) + '" title="' + ( disabled ? 'Dynamic data belongs to elements, not global classes' : 'WordPress dynamic data' ) + '"' + ( disabled ? ' disabled' : '' ) + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></svg></button>';
	}

	function styleCategoryIcon( name ) {
		const paths = {
			Layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
			Sizing: '<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5"/>',
			Spacing: '<rect x="8" y="8" width="8" height="8" rx="1"/><path d="M3 3h18v18H3zM12 3v3m0 12v3M3 12h3m12 0h3"/>',
			'Flex & Grid': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
			Position: '<circle cx="12" cy="12" r="4"/><path d="M12 2v6m0 8v6M2 12h6m8 0h6"/>',
			Typography: '<path d="M3 19 9 4l6 15M5 14h8m2-4h7m-3 0v9m-3 0h6"/>',
			Background: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
			Gradient: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16m5-16v16m5-16v16" opacity=".5"/>',
			'Border & Shadow': '<rect x="4" y="4" width="14" height="14" rx="3"/><path d="M8 21h11a2 2 0 0 0 2-2V8"/>',
			Transform: '<path d="m8 3 13 5-5 13L3 16zM5 3H3v2m16 16h2v-2"/>',
			Effects: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4m-2-2h4"/>',
			Interaction: '<path d="m5 3 14 10-7 1-3 7zM16 3l1 3m3 0 2-1"/>',
			Scroll: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 6v5m-2-2 2 2 2-2"/>',
			CSS: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
		};
		return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ( paths[ name ] || paths.CSS ) + '</svg>';
	}

	function group( title, content, className = '', actions = '' ) {
		return '<section class="lieve-control-group' + ( className ? ' ' + lieveContext.escapeHtml( className ) : '' ) + '">' + ( title ? '<div class="lieve-inspector-group-heading"><div class="lieve-control-group-title">' + lieveContext.escapeHtml( title ) + '</div>' + actions + '</div>' : '' ) + '<div class="lieve-inspector-group-body">' + content + '</div></section>';
	}

	function parseItems( value ) {
		try { const rows = JSON.parse( value ); if ( Array.isArray( rows ) ) { return rows.filter( Array.isArray ).slice( 0, 100 ).map( ( row ) => row.slice( 0, 8 ).map( String ) ); } } catch ( error ) { /* Existing line-based documents remain supported. */ }
		return String( value || '' ).split( /\r?\n/ ).filter( Boolean ).slice( 0, 100 ).map( ( row ) => row.split( '|' ).slice( 0, 8 ).map( ( item ) => item.trim() ) );
	}

	function repeaterControl( node, field ) {
		const rows = parseItems( node.props.items );
		const content = rows.map( ( row, index ) => {
			const cells = field.itemFields.map( ( label, column ) => {
				const id = 'lieve-item-' + index + '-' + column;
				const attrs = ' id="' + id + '" data-item-column="' + column + '"';
				let input = '<input type="' + ( label.includes( 'URL' ) ? 'url' : 'text' ) + '"' + attrs + ' value="' + lieveContext.escapeHtml( row[ column ] || '' ) + '">';
				if ( [ 'Content', 'Description', 'Quote' ].includes( label ) ) { input = '<textarea' + attrs + '>' + lieveContext.escapeHtml( row[ column ] || '' ) + '</textarea>'; }
				if ( node.type === 'form' && column === 1 ) { input = '<select' + attrs + '>' + [ 'text', 'email', 'textarea', 'number', 'checkbox', 'select', 'radio', 'tel', 'url', 'date', 'time', 'hidden' ].map( ( type ) => '<option' + ( row[ column ] === type ? ' selected' : '' ) + '>' + type + '</option>' ).join( '' ) + '</select>'; }
				if ( node.type === 'form' && column === 2 ) { return '<div class="lieve-control"><label class="lieve-checkbox"><input type="checkbox" role="switch"' + attrs + ( row[ column ] === 'required' ? ' checked' : '' ) + '> ' + lieveContext.escapeHtml( label ) + '</label></div>'; }
				return '<div class="lieve-control"><label for="' + id + '">' + lieveContext.escapeHtml( label ) + '</label>' + input + '</div>';
			} ).join( '' );
			return '<details class="lieve-repeater-item" data-item-index="' + index + '" open><summary><span>' + lieveContext.escapeHtml( row[ 0 ] || 'Item ' + ( index + 1 ) ) + '</span><span class="lieve-repeater-number">' + ( index + 1 ) + '</span></summary><div class="lieve-repeater-fields">' + cells + '<div class="lieve-repeater-actions"><button type="button" class="lieve-button-secondary" data-item-action="up" aria-label="Move item up"' + ( index === 0 ? ' disabled' : '' ) + '>' + lieveContext.customAttributeIcon( 'up' ) + '</button><button type="button" class="lieve-button-secondary" data-item-action="down" aria-label="Move item down"' + ( index === rows.length - 1 ? ' disabled' : '' ) + '>' + lieveContext.customAttributeIcon( 'down' ) + '</button><button type="button" class="lieve-button-secondary" data-item-action="remove" aria-label="Remove item">' + lieveContext.customAttributeIcon( 'delete' ) + '</button></div></div></details>';
		} ).join( '' );
		return '<div class="lieve-repeater">' + content + '<button type="button" class="lieve-button-secondary lieve-repeater-add" data-item-add' + ( rows.length >= ( node.type === 'form' ? 20 : 100 ) ? ' disabled' : '' ) + '>' + lieveContext.customAttributeIcon( 'add' ) + 'Add item</button></div>';
	}
	return { control, selectControl, richTextControl, dynamicDataButton, styleCategoryIcon, group, parseItems, repeaterControl };
	};
} )();
