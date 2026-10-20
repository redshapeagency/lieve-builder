/* Per-element behavior editor. Shared document history, custom controls, no canvas mutation. */
( function () {
	'use strict';
	const model = window.LieveInteractions; if ( ! model ) { return; }
	const catalog = model.catalog; const expanded = new Set();
	let motionChoices = {};
	const esc = value => String( value ?? '' ).replace( /[&<>"']/g, char => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' } )[ char ] );
	const svg = ( body, strokeWidth = 1.6 ) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + strokeWidth + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
	const icons = { add: svg( '<path d="M12 5v14M5 12h14"/>' ), clone: svg( '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>' ), trash: svg( '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>', 2 ), grip: svg( '<circle cx="9" cy="6" r=".7"/><circle cx="15" cy="6" r=".7"/><circle cx="9" cy="12" r=".7"/><circle cx="15" cy="12" r=".7"/><circle cx="9" cy="18" r=".7"/><circle cx="15" cy="18" r=".7"/>' ), chevron: svg( '<path d="m8 10 4 4 4-4"/>' ), bolt: svg( '<path d="m13 3-8 11h6l-1 7 9-12h-6z"/>' ) };
	icons.copyId = svg( '<rect x="8" y="3" width="8" height="4" rx="1.5"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 12h6M9 16h4"/>' );
	icons.refresh = svg( '<path d="M3 10a9 9 0 1 1 2.7 8M3 4v6h6"/>' );
	const button = ( action, label, icon, extra = '' ) => '<button type="button" class="lieve-button-secondary lieve-interact-icon" data-interact-action="' + action + '" aria-label="' + esc( label ) + '" data-tooltip="' + esc( label ) + '"' + extra + '>' + icons[ action === 'copy-id' ? 'copyId' : icon ] + '</button>';
	function options( choices, value, grouped = false ) {
		let last = null; let html = '';
		Object.entries( choices ).forEach( ( [ key, item ] ) => {
			if ( grouped && item.group !== last ) { if ( last ) { html += '</optgroup>'; } html += '<optgroup label="' + esc( item.group ) + '">'; last = item.group; }
			html += '<option value="' + esc( key ) + '"' + ( key === String( value ) ? ' selected' : '' ) + '>' + esc( typeof item === 'string' ? item : item.label ) + '</option>';
		} ); return html + ( last ? '</optgroup>' : '' );
	}
	function field( row, key, spec = catalog.fields[ key ], choices, prefix = '' ) {
		if ( key === 'functionName' ) { choices = { '': 'Choose a registered function…', ...( window.LieveInteractionFunctions || {} ), ...( row.functionName && ! Object.hasOwn( window.LieveInteractionFunctions || {}, row.functionName ) ? { [ row.functionName ]: 'Unavailable · ' + row.functionName } : {} ) }; }
		if ( key === 'timelineId' ) { choices = { '': 'Choose a Motion timeline…', ...motionChoices, ...( row.timelineId && ! motionChoices[ row.timelineId ] ? { [ row.timelineId ]: 'Unavailable timeline' } : {} ) }; }
		const name = prefix + key; const uid = 'interact-' + row.id + '-' + name;
		const value = prefix ? row[ key ] : row[ key ] ?? spec.default; const type = choices ? 'select' : spec.type;
		let control = '<input id="' + uid + '" type="' + ( type === 'number' ? 'number' : 'text' ) + '" data-interact-field="' + name + '" value="' + esc( value ) + '"' + ( spec.max && type !== 'number' ? ' maxlength="' + spec.max + '"' : '' ) + ( type === 'number' ? ' min="' + spec.min + '" max="' + spec.max + '" step="any"' : '' ) + ' placeholder="' + esc( spec.placeholder || '' ) + '" autocomplete="off" spellcheck="false" aria-describedby="' + uid + '-error">';
		if ( type === 'select' ) { control = '<select id="' + uid + '" data-interact-field="' + name + '" aria-describedby="' + uid + '-error">' + options( choices || spec.options, value, Boolean( choices?.click?.group || choices?.show?.group ) ) + '</select>'; }
		if ( key === 'arguments' ) { control = '<textarea id="' + uid + '" data-interact-field="' + name + '" maxlength="6000" spellcheck="false" placeholder="' + esc( spec.placeholder ) + '" aria-describedby="' + uid + '-error">' + esc( value ) + '</textarea>'; }
		return '<div class="lieve-control"><label for="' + uid + '">' + esc( spec.label || key ) + '</label>' + control + '<p id="' + uid + '-error" class="lieve-interact-error" data-interact-error="' + name + '" hidden></p></div>';
	}
	const toggle = ( row, key, label, help = '' ) => '<label class="lieve-checkbox lieve-interact-toggle"><span><strong>' + label + '</strong>' + ( help ? '<small>' + help + '</small>' : '' ) + '</span><input type="checkbox" role="switch" data-interact-field="' + key + '"' + ( row[ key ] ? ' checked' : '' ) + '></label>';
	function conditions( row ) {
		return '<div class="lieve-interact-subheading"><h4>Conditions</h4>' + button( 'add-condition', 'Add condition', 'add', row.conditions.length >= catalog.conditionLimit ? ' disabled' : '' ) + '</div>' + ( row.conditions.length ? field( row, 'relation' ) + '<div class="lieve-interact-conditions">' + row.conditions.map( ( item, index ) => {
			const fake = { ...item, id: row.id + '-condition-' + index };
			const control = ( key, spec, choices ) => field( fake, key, spec, choices, 'condition-' + index + ':' );
			return '<div class="lieve-interact-condition" data-interact-condition="' + index + '"><div class="lieve-interact-subheading"><strong>Condition ' + ( index + 1 ) + '</strong>' + button( 'clone-condition', 'Duplicate condition ' + ( index + 1 ), 'clone', row.conditions.length >= catalog.conditionLimit ? ' disabled' : '' ) + button( 'remove-condition', 'Remove condition ' + ( index + 1 ), 'trash' ) + '</div>' + control( 'kind', { label: 'Check' }, { storage: 'Browser storage', media: 'Media query', selector: 'Element exists' } ) + ( item.kind === 'storage' ? control( 'storage', { label: 'Storage' }, catalog.fields.storage.options ) : '' ) + control( 'key', { label: item.kind === 'storage' ? 'Storage key' : item.kind === 'media' ? 'Media query' : 'CSS selector', type: 'string', max: 500, placeholder: item.kind === 'storage' ? 'notice-dismissed' : item.kind === 'media' ? '(prefers-color-scheme: dark)' : '.is-active' } ) + control( 'operator', { label: 'Comparison' }, item.kind === 'storage' ? model.operators : { exists: 'Matches / exists', missing: 'Does not match / exist' } ) + ( item.kind === 'storage' && ! [ 'exists', 'missing' ].includes( item.operator ) ? control( 'value', { label: 'Compare with', type: 'string', max: 2000, placeholder: 'true, 10, accepted…' } ) : '' ) + '<p class="lieve-interact-error" data-interact-error="condition-' + index + '" hidden></p></div>';
		} ).join( '' ) + '</div>' : '<p class="lieve-interact-help">No extra conditions. The viewport limits still apply.</p>' );
	}
	function summary( row, elements, popupChoices = {} ) {
		const target = catalog.actions[ row.action ]?.noTarget ? 'Page' : row.targetMode === 'popup' ? popupChoices[ row.targetValue ] || 'Choose Pop Up' : row.targetMode === 'self' ? 'This element' : row.targetMode === 'element' ? ( elements[ row.targetValue ] || 'Missing element' ).split( ' · #' )[0] : row.targetValue || catalog.targets[ row.targetMode ];
		return ( catalog.triggers[ row.trigger ]?.label || 'Trigger' ) + ' → ' + ( catalog.actions[ row.action ]?.label || 'Action' ) + ' · ' + target;
	}
	function targetControls( row, elements, popupChoices ) {
		if ( catalog.actions[ row.action ]?.noTarget ) { return ''; }
		const dialog = [ 'open-dialog', 'close-dialog', 'toggle-dialog' ].includes( row.action );
		const modes = Object.fromEntries( Object.entries( catalog.targets ).filter( ( [ key ] ) => dialog || key !== 'popup' ) );
		let html = field( row, 'targetMode', { label: 'Target' }, modes );
		if ( row.targetMode === 'popup' ) {
			html += field( row, 'targetValue', { label: 'Pop Up' }, { '': 'Choose Pop Up…', ...popupChoices, ...( row.targetValue && ! popupChoices[ row.targetValue ] ? { [ row.targetValue ]: 'Unavailable Pop Up · #' + row.targetValue } : {} ) } );
			html += '<button type="button" class="lieve-button-secondary" data-interact-action="refresh-popups">' + icons.refresh + 'Refresh Pop Ups</button>';
			html += '<p class="lieve-interact-help">Only active Pop Ups are listed. Display conditions must match this page; On interaction keeps the popup closed until triggered.' + ( Object.keys( popupChoices ).length ? '' : ' Create and activate a Pop Up in Templates, then refresh the list.' ) + '</p>';
		} else if ( row.targetMode === 'element' ) { html += field( row, 'targetValue', { label: 'Element' }, { '': 'Choose element…', ...elements, ...( row.targetValue && ! elements[ row.targetValue ] ? { [ row.targetValue ]: 'Missing element · ' + row.targetValue } : {} ) } ); }
		else if ( [ 'selector', 'children', 'closest' ].includes( row.targetMode ) ) { html += field( row, 'targetValue', { ...catalog.fields.targetValue, label: 'CSS selector', placeholder: '.menu-panel or #my-target' } ); }
		return html;
	}
	function markup( node, elements, popupChoices = {} ) {
		const rows = node.props.interactions || [];
		if ( node.type === 'html' && ! window.LieveStyles?.htmlHasWrapper?.( node ) ) { return '<div class="lieve-interact"><div class="lieve-inspector-group-heading"><h3 class="lieve-control-group-title">Interactions</h3></div><div class="lieve-raw-html-note"><p>Raw HTML has no element root. Enable an explicit wrapper in Style before attaching behavior; your authored HTML stays untouched.</p></div></div>'; }
		return '<div class="lieve-interact"><div class="lieve-interact-intro"><div class="lieve-inspector-group-heading"><h3 class="lieve-control-group-title">Interactions</h3><button type="button" class="lieve-button-secondary lieve-section-action" data-interact-action="add"' + ( rows.length >= catalog.limit ? ' disabled' : '' ) + '>' + icons.add + 'Add interaction</button></div><p>Rules run on your live page. Save, then use Preview to test; the editing canvas stays interactive.</p></div><div class="lieve-interact-list" role="list">' + ( rows.length ? rows.map( raw => {
			const row = model.normalize( raw ); const open = expanded.has( node.id + ':' + row.id );
			return '<section class="lieve-interact-row' + ( ! row.enabled ? ' is-disabled' : '' ) + '" role="listitem" data-interact-row="' + esc( row.id ) + '"><div class="lieve-interact-row-heading">' + button( 'move', 'Reorder ' + ( row.name || 'interaction' ) + ' · Arrow keys', 'grip', rows.length < 2 ? ' disabled' : '' ) + '<button type="button" class="lieve-interact-disclosure" data-interact-action="expand" aria-expanded="' + open + '" aria-controls="interact-body-' + row.id + '"><strong data-interact-name>' + esc( row.name || 'Untitled interaction' ) + '</strong><span data-interact-summary>' + esc( summary( row, elements, popupChoices ) ) + '</span></button>' + '<label class="lieve-checkbox lieve-interact-enable"><input type="checkbox" role="switch" aria-label="Enable ' + esc( row.name || 'interaction' ) + '" data-interact-field="enabled"' + ( row.enabled ? ' checked' : '' ) + '></label>' + icons.chevron + '</div><div id="interact-body-' + row.id + '" class="lieve-interact-body"' + ( open ? '' : ' hidden' ) + '><div class="lieve-interact-row-tools"><code title="Interaction ID">' + row.id + '</code>' + button( 'copy-id', 'Copy interaction ID', 'clone' ) + button( 'clone', 'Duplicate interaction', 'clone', rows.length >= catalog.limit ? ' disabled' : '' ) + button( 'remove', 'Delete interaction', 'trash' ) + '</div>' + field( row, 'name', { ...catalog.fields.name, label: 'Name', placeholder: 'Open navigation, Reveal content…' } ) + field( row, 'trigger', { label: 'Trigger' }, catalog.triggers ) + ( catalog.triggers[ row.trigger ]?.fields || [] ).map( key => field( row, key ) ).join( '' ) + field( row, 'action', { label: 'Action' }, catalog.actions ) + targetControls( row, elements, popupChoices ) + ( catalog.actions[ row.action ]?.fields || [] ).map( key => field( row, key ) ).join( '' ) + ( row.action === 'call' ? '<p class="lieve-interact-help">Arguments are a JSON array. The function receives your arguments followed by a context object: source, targets, target, event and interaction. Only functions registered by trusted site code are available; no code is evaluated. Arguments are data, never executable code.</p>' : '' ) + '<div class="lieve-interact-subheading"><h4>Execution</h4></div>' + field( row, 'delay' ) + field( row, 'cooldown' ) + toggle( row, 'once', 'Run once', 'Once per rendered element and page visit, after conditions match.' ) + ( [ 'click', 'dblclick', 'keydown', 'custom' ].includes( row.trigger ) ? toggle( row, 'preventDefault', 'Prevent default behavior', 'Off by default: links and native controls keep working.' ) + toggle( row, 'stopPropagation', 'Stop propagation' ) : '' ) + ( row.action === 'scroll-to' ? toggle( row, 'smooth', 'Smooth scrolling', 'Reduced-motion preferences always take priority.' ) : '' ) + '<div class="lieve-interact-subheading"><h4>Viewport range</h4></div>' + field( row, 'minWidth' ) + field( row, 'maxWidth' ) + conditions( row ) + '</div></section>';
		} ).join( '' ) : '<div class="lieve-interact-empty">' + icons.bolt + '<strong>Give this element a behavior</strong><p>Reveal a panel on click, animate when visible, or respond to a form. Add your first interaction above.</p></div>' ) + '</div><p class="lieve-interact-help">Rules with the same trigger start in list order. Delays can change completion order. Changes use Save and Undo like other element settings.</p><span class="screen-reader-text" role="status" data-interact-announcement></span></div>';
	}
	function bind( { root, node, read, elements, popupChoices = {}, refreshPopups, change, structural, refresh, notice } ) {
		const group = root.querySelector( '.lieve-interact' ); if ( ! group ) { return { destroy() {} }; }
		const list = group.querySelector( '.lieve-interact-list' ); const rows = () => read()?.props.interactions || [];
		let sortable = null; let dragging = false;
		function openOnly( id ) { Array.from( expanded ).forEach( key => { if ( key.startsWith( node.id + ':' ) ) { expanded.delete( key ); } } ); expanded.add( node.id + ':' + id ); }
		function mutate( fn, focusId, key = 'name' ) {
			structural( () => { const current = read(); if ( ! current ) { return; } current.props.interactions ||= []; fn( current.props.interactions ); }, () => { refresh(); if ( focusId ) { root.querySelector( '[data-interact-row="' + focusId + '"] [data-interact-field="' + key + '"]' )?.focus( { preventScroll: true } ); } } );
		}
		function errors() {
			group.querySelectorAll( '[data-interact-row]' ).forEach( box => {
				const row = rows().find( item => item.id === box.dataset.interactRow ); if ( ! row ) { return; }
				const issues = model.errors( row ); box.classList.toggle( 'has-error', Object.keys( issues ).length > 0 );
				box.querySelectorAll( '[data-interact-error]' ).forEach( target => { const text = issues[ target.dataset.interactError ] || ''; target.textContent = text; target.hidden = ! text; } );
				box.querySelectorAll( '[data-interact-field]' ).forEach( field => { field.setAttribute( 'aria-invalid', String( Boolean( issues[ field.dataset.interactField ] || issues[ field.dataset.interactField.split( ':' )[0] ] ) ) ); } );
			} );
		}
		group.querySelectorAll( '[data-interact-field]' ).forEach( field => {
			const update = event => {
				if ( event.isComposing || field.validity?.badInput ) { return; }
				const box = field.closest( '[data-interact-row]' ); const row = rows().find( item => item.id === box.dataset.interactRow ); if ( ! row ) { return; }
				const key = field.dataset.interactField; const value = field.type === 'checkbox' ? field.checked : field.type === 'number' ? Number( field.value ) : field.value;
				change( 'interact:' + node.id + ':' + row.id + ':' + key, () => {
					if ( key.startsWith( 'condition-' ) ) { const [ index, prop ] = key.slice( 10 ).split( ':' ); row.conditions[ Number( index ) ][ prop ] = value; if ( prop === 'kind' && value !== 'storage' ) { row.conditions[ Number( index ) ].operator = 'exists'; } }
					else {
						if ( key === 'action' && [ 'open-dialog', 'close-dialog', 'toggle-dialog' ].includes( value ) && ! [ 'open-dialog', 'close-dialog', 'toggle-dialog' ].includes( row.action ) ) { row.targetMode = 'popup'; row.targetValue = ''; }
						else if ( key === 'action' && row.targetMode === 'popup' && ! [ 'open-dialog', 'close-dialog', 'toggle-dialog' ].includes( value ) && ! catalog.actions[ value ]?.noTarget ) { row.targetMode = 'self'; }
						if ( key === 'targetMode' && ( value === 'popup' || row.targetMode === 'popup' ) && value !== row.targetMode ) { row.targetValue = ''; }
						row[ key ] = value;
					}
				}, [ 'checkbox', 'select-one' ].includes( field.type ) );
				box.classList.toggle( 'is-disabled', ! row.enabled ); box.querySelector( '[data-interact-name]' ).textContent = row.name || 'Untitled interaction'; box.querySelector( '[data-interact-summary]' ).textContent = summary( row, elements, popupChoices ); box.querySelector( '[data-interact-field="enabled"]' ).setAttribute( 'aria-label', 'Enable ' + ( row.name || 'interaction' ) );
				const grip = box.querySelector( '[data-interact-action="move"]' ); const gripLabel = 'Reorder ' + ( row.name || 'interaction' ) + ' · Arrow keys'; grip.setAttribute( 'aria-label', gripLabel ); grip.dataset.tooltip = gripLabel; errors();
				if ( [ 'trigger', 'action', 'targetMode' ].includes( key ) || /condition-\d+:(kind|operator)/.test( key ) ) { structural( null, refresh ); }
			};
			const discrete = [ 'checkbox', 'select-one' ].includes( field.type );
			field.addEventListener( discrete ? 'change' : 'input', update ); if ( ! discrete ) { field.addEventListener( 'compositionend', update ); }
		} );
		group.querySelectorAll( '[data-interact-action]' ).forEach( button => button.addEventListener( 'click', async () => {
			if ( dragging ) { return; }
			const action = button.dataset.interactAction; const box = button.closest( '[data-interact-row]' ); const current = box && rows().find( item => item.id === box.dataset.interactRow ); const index = current ? rows().indexOf( current ) : -1;
			if ( action === 'refresh-popups' ) { button.disabled = true; try { await refreshPopups?.(); if ( group.isConnected ) { structural( null, refresh ); notice( 'Pop Up list updated.' ); } } catch ( error ) { if ( group.isConnected ) { notice( error.message || 'Could not refresh Pop Ups. Try again.', true ); } } finally { button.disabled = false; } return; }
			if ( action === 'expand' ) { const key = node.id + ':' + current.id; expanded.has( key ) ? expanded.delete( key ) : expanded.add( key ); button.setAttribute( 'aria-expanded', String( expanded.has( key ) ) ); box.querySelector( '.lieve-interact-body' ).hidden = ! expanded.has( key ); return; }
			if ( action === 'copy-id' ) { try { await navigator.clipboard.writeText( current.id ); notice( 'Interaction ID copied.' ); } catch ( error ) { notice( 'Copy the interaction ID shown beside this button.', true ); } return; }
			if ( action === 'add' && rows().length < catalog.limit ) { const row = model.create(); openOnly( row.id ); mutate( items => items.push( row ), row.id ); }
			if ( action === 'clone' && rows().length < catalog.limit ) { const row = model.cloneRows( [ current ] )[0]; row.name = Array.from( current.name ? current.name + ' copy' : 'Interaction copy' ).slice( 0, 120 ).join( '' ); openOnly( row.id ); mutate( items => items.splice( index + 1, 0, row ), row.id ); }
			if ( action === 'remove' ) { mutate( items => items.splice( index, 1 ) ); root.querySelector( '[data-interact-action="add"]' )?.focus( { preventScroll: true } ); }
			if ( action.includes( 'condition' ) && current ) { const at = Number( button.closest( '[data-interact-condition]' )?.dataset.interactCondition ); const focus = action === 'add-condition' ? current.conditions.length : action === 'clone-condition' ? at + 1 : Math.max( 0, at - 1 ); mutate( items => { const row = items[ index ]; if ( action === 'add-condition' && row.conditions.length < catalog.conditionLimit ) { row.conditions.push( model.condition() ); } else if ( action === 'clone-condition' && row.conditions.length < catalog.conditionLimit ) { row.conditions.splice( at + 1, 0, JSON.parse( JSON.stringify( row.conditions[ at ] ) ) ); } else if ( action === 'remove-condition' ) { row.conditions.splice( at, 1 ); } }, current.id, 'condition-' + focus + ':key' ); }
		} ) );
		function reorder( from, to ) {
			if ( from === to || from < 0 || to < 0 || to >= rows().length ) { return; }
			const id = rows()[ from ].id; mutate( items => items.splice( to, 0, items.splice( from, 1 )[0] ), id, 'name' ); root.querySelector( '[data-interact-row="' + id + '"] [data-interact-action="move"]' )?.focus( { preventScroll: true } );
			root.querySelector( '[data-interact-announcement]' ).textContent = 'Interaction moved to position ' + ( to + 1 ) + '.';
		}
		group.querySelectorAll( '[data-interact-action="move"]' ).forEach( grip => grip.addEventListener( 'keydown', event => { if ( ! [ 'ArrowUp', 'ArrowDown', 'Home', 'End' ].includes( event.key ) ) { return; } event.preventDefault(); event.stopPropagation(); const from = rows().findIndex( item => item.id === grip.closest( '[data-interact-row]' ).dataset.interactRow ); reorder( from, event.key === 'Home' ? 0 : event.key === 'End' ? rows().length - 1 : from + ( event.key === 'ArrowUp' ? -1 : 1 ) ); } ) );
		const $ = window.jQuery;
		if ( rows().length > 1 && $?.fn?.sortable ) {
			sortable = $( list ); sortable.sortable( {
				items: '> [data-interact-row]', handle: '[data-interact-action="move"]', cancel: 'input,textarea,select,option', tolerance: 'pointer', axis: 'y', distance: 5, placeholder: 'lieve-interact-placeholder',
				helper( event, item ) { const copy = item.clone(); copy.find( '.lieve-interact-body' ).remove(); copy.width( item.outerWidth() ); return copy; },
				start( event, ui ) { dragging = true; ui.placeholder.height( ui.helper.outerHeight() ); sortable.sortable( 'refreshPositions' ); },
				stop() {
					dragging = false; const ids = Array.from( list.querySelectorAll( '[data-interact-row]' ), row => row.dataset.interactRow );
					if ( ids.length === rows().length && new Set( ids ).size === ids.length && ids.every( id => rows().some( row => row.id === id ) ) && ids.some( ( id, index ) => rows()[ index ].id !== id ) ) {
						// Let Sortable finish its own cleanup before replacing the inspector.
						queueMicrotask( () => { if ( ! root.isConnected || ! read() ) { return; } mutate( items => { const byId = new Map( items.map( row => [ row.id, row ] ) ); items.splice( 0, items.length, ...ids.map( id => byId.get( id ) ) ); } ); } );
					}
				}
			} );
		}
		const escapeDrag = event => { if ( event.key === 'Escape' && dragging && sortable ) { event.preventDefault(); event.stopPropagation(); sortable.sortable( 'cancel' ); dragging = false; } }; root.ownerDocument.addEventListener( 'keydown', escapeDrag, true ); errors();
		return { errors, destroy() { root.ownerDocument.removeEventListener( 'keydown', escapeDrag, true ); if ( sortable ) { sortable.sortable( 'destroy' ); sortable = null; } } };
	}
	window.LieveInteractEditor = { markup, bind, expanded, configureMotion: choices => { motionChoices = choices; } };
}() );
