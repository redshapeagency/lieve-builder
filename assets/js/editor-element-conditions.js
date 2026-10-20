/* Condition inspector. Uses the same document history, controls and dynamic picker. */
( function () {
	'use strict';
	const model = window.LieveElementConditions, catalog = model.catalog;
	const esc = value => String( value ?? '' ).replace( /[&<>"']/g, c => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' } )[ c ] );
	const svg = body => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
	const icons = { add: svg( '<path d="M12 5v14M5 12h14"/>' ), clone: svg( '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>' ), trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>', dynamic: svg( '<path d="m8 8-4 4 4 4m8-8 4 4-4 4M14 4l-4 16"/>' ), check: svg( '<path d="m8 12 3 3 5-6"/><rect x="3" y="3" width="18" height="18" rx="5"/>' ), chevron: svg( '<path d="m8 10 4 4 4-4"/>' ) };
	const expanded = new Set();
	const action = ( name, label, icon, disabled = false ) => '<button type="button" class="lieve-button-secondary lieve-interact-icon" data-ec-action="' + name + '" aria-label="' + esc( label ) + '" data-tooltip="' + esc( label ) + '"' + ( disabled ? ' disabled' : '' ) + '>' + icons[ icon ] + '</button>';
	function options( choices, value, grouped = false ) {
		let previous = '', html = '';
		for ( const [ key, spec ] of Object.entries( choices ) ) { if ( grouped && previous !== spec.group ) { if ( previous ) { html += '</optgroup>'; } html += '<optgroup label="' + esc( spec.group ) + '">'; previous = spec.group; } html += '<option value="' + esc( key ) + '"' + ( key === value ? ' selected' : '' ) + '>' + esc( typeof spec === 'string' ? spec : spec.label ) + '</option>'; }
		return html + ( previous ? '</optgroup>' : '' );
	}
	function field( id, key, label, value, choices, placeholder = '', dynamic = false ) {
		const uid = 'ec-' + id + '-' + key;
		return '<div class="lieve-control"><label for="' + uid + '">' + esc( label ) + '</label>' + ( choices ? '<select id="' + uid + '" data-ec-field="' + key + '">' + options( choices, value, key === 'source' ) + '</select>' : '<div class="lieve-ec-operand"><input id="' + uid + '" data-ec-field="' + key + '" type="text" value="' + esc( value ) + '" placeholder="' + esc( placeholder ) + '" maxlength="' + ( key === 'name' ? 120 : 1200 ) + '" autocomplete="off" spellcheck="false">' + ( dynamic ? '<button type="button" class="lieve-button-secondary lieve-interact-icon" data-ec-dynamic="' + key + '" aria-label="Choose dynamic data for ' + esc( label.toLowerCase() ) + '" data-tooltip="Choose dynamic data" aria-haspopup="dialog" aria-expanded="false" aria-pressed="' + Boolean( window.LieveDynamicData?.parse( value ) ) + '">' + icons.dynamic + '</button>' : '' ) + '</div>' ) + '</div>';
	}
	function markup( node ) {
		const value = node.props.conditions || model.create(), valid = value.version === 1 && Array.isArray( value.groups );
		return '<div class="lieve-interact lieve-element-conditions"><div class="lieve-interact-intro"><div class="lieve-inspector-group-heading"><h3 class="lieve-control-group-title">Element conditions</h3></div><p>Render this element only when your rules match. Its children follow the same visibility. The canvas always keeps it editable.</p></div>' +
			( ! valid ? '<p class="lieve-interact-error">These saved conditions are invalid. Reset them before saving.</p><button type="button" class="lieve-button-secondary" data-ec-action="reset">Reset conditions</button>' :
				'<label class="lieve-checkbox lieve-interact-toggle"><span><strong>Conditional rendering</strong><small>Off means this element is always rendered.</small></span><input type="checkbox" role="switch" data-ec-field="enabled"' + ( value.enabled ? ' checked' : '' ) + '></label>' +
				( value.groups.length > 1 ? field( node.id, 'relation', 'Match groups', value.relation, { any: 'Any group matches (OR)', all: 'Every group matches (AND)' } ) : '' ) +
				'<div class="lieve-ec-groups">' + value.groups.map( ( group, index ) => {
					const open = expanded.has( node.id + ':' + group.id );
					return '<section class="lieve-interact-row" data-ec-group="' + group.id + '"><div class="lieve-interact-row-heading"><button type="button" class="lieve-interact-disclosure" id="ec-disclosure-' + group.id + '" data-ec-action="expand" aria-expanded="' + open + '" aria-controls="ec-body-' + group.id + '"><strong data-ec-name>' + esc( group.name || 'Rule group ' + ( index + 1 ) ) + '</strong><span data-ec-summary>' + group.rules.length + ' rule' + ( group.rules.length === 1 ? '' : 's' ) + ' · ' + ( group.relation === 'all' ? 'All must match' : 'Any can match' ) + '</span></button>' + icons.chevron + '</div><div class="lieve-interact-body" id="ec-body-' + group.id + '"' + ( open ? '' : ' hidden' ) + '><div class="lieve-ec-tools"><span class="lieve-ec-result" data-ec-group-result></span>' + action( 'clone-group', 'Duplicate rule group', 'clone', value.groups.length >= catalog.groupLimit ) + action( 'remove-group', 'Delete rule group', 'trash' ) + '</div>' + field( group.id, 'name', 'Group name', group.name, null, 'Members, Special offer…' ) + field( group.id, 'relation', 'Match rules', group.relation, { all: 'Every rule matches (AND)', any: 'Any rule matches (OR)' } ) + group.rules.map( ( rule, at ) => {
						const spec = catalog.sources[ rule.source ];
						if ( ! spec ) { return '<div data-ec-rule="' + esc( rule.id ) + '"><p class="lieve-interact-error">Unavailable condition source.</p>' + action( 'remove-rule', 'Delete rule', 'trash', group.rules.length < 2 ) + '</div>'; }
						return '<div class="lieve-ec-rule" data-ec-rule="' + rule.id + '"><div class="lieve-ec-rule-heading"><strong>Rule ' + ( at + 1 ) + '</strong><span class="lieve-ec-result" data-ec-rule-result></span>' + action( 'clone-rule', 'Duplicate rule ' + ( at + 1 ), 'clone', group.rules.length >= catalog.ruleLimit ) + action( 'remove-rule', 'Delete rule ' + ( at + 1 ), 'trash', group.rules.length < 2 ) + '</div>' + field( rule.id, 'source', 'Check', rule.source, catalog.sources ) + ( spec.parameter ? field( rule.id, 'parameter', spec.parameter, rule.parameter, null, spec.placeholder, rule.source === 'dynamic' ) : '' ) + field( rule.id, 'operator', 'Comparison', rule.operator, catalog.operators ) + ( ! [ 'empty', 'not_empty' ].includes( rule.operator ) ? field( rule.id, 'value', 'Compare with', rule.value, null, spec.choices ? Object.entries( spec.choices ).map( ( [ key, label ] ) => key + ' = ' + label ).join( ' · ' ) : spec.parameter ? 'A value or dynamic data…' : spec.placeholder || 'A value or dynamic data…', true ) : '' ) + '<p class="lieve-interact-error" data-ec-error hidden></p></div>';
					} ).join( '' ) + '<button type="button" class="lieve-button-secondary" data-ec-action="add-rule"' + ( group.rules.length >= catalog.ruleLimit ? ' disabled' : '' ) + '>' + icons.add + 'Add rule</button></div></section>';
				} ).join( '' ) + '</div><button type="button" class="lieve-button-secondary lieve-ec-add-group" data-ec-action="add-group"' + ( value.groups.length >= catalog.groupLimit ? ' disabled' : '' ) + '>' + icons.add + 'Add rule group</button>' +
				( ! value.groups.length ? '<div class="lieve-interact-empty">' + icons.check + '<strong>Show it to the right people</strong><p>Combine page, visitor and dynamic data rules. Without enabled conditions, this element stays visible.</p></div>' : '' ) +
				'<div class="lieve-ec-check"><button type="button" class="lieve-button-secondary" data-ec-action="check">' + icons.check + 'Check conditions</button><p class="lieve-interact-help">Checks this page and your signed-in user. Request-only or template contexts can be unavailable here. Save and preview the live URL to test those.</p><p class="lieve-ec-check-result" role="status" data-ec-check-result hidden></p></div><p class="lieve-interact-error" data-ec-global-error hidden></p>' ) + '</div>';
	}
	function bind( { root, node, read, change, structural, refresh, openDynamic, url, nonce } ) {
		const panel = root.querySelector( '.lieve-element-conditions' ); if ( ! panel ) { return { destroy() {} }; }
		let revision = 0, disposed = false, pending = null;
		const current = () => read()?.props.conditions || model.create();
		function clearResults() { revision++; pending?.abort(); pending = null; panel.querySelectorAll( '[data-ec-rule-result], [data-ec-group-result]' ).forEach( label => { label.textContent = ''; } ); panel.querySelector( '[data-ec-check-result]' )?.setAttribute( 'hidden', '' ); const button = panel.querySelector( '[data-ec-action="check"]' ); if ( button ) { button.disabled = false; } }
		function errors() {
			const issues = model.errors( current() );
			panel.querySelectorAll( '[data-ec-rule]' ).forEach( row => { const error = row.querySelector( '[data-ec-error]' ), message = issues[ row.dataset.ecRule ]; if ( error ) { error.textContent = message || ''; error.hidden = ! message; row.querySelectorAll( '[data-ec-field]' ).forEach( input => input.setAttribute( 'aria-invalid', String( Boolean( message ) ) ) ); } } );
			const global = panel.querySelector( '[data-ec-global-error]' ); if ( global ) { global.textContent = issues.settings || issues.groups || ''; global.hidden = ! global.textContent; }
			return issues;
		}
		function update( mutate, key, discrete = false ) { clearResults(); change( node.id + ':conditions:' + key, () => { const item = read(); if ( ! item ) { return; } item.props.conditions ||= model.create(); mutate( item.props.conditions ); }, discrete ); errors(); }
		function edit( mutate ) { let target; clearResults(); structural( () => { const item = read(); if ( ! item ) { return; } item.props.conditions ||= model.create(); target = mutate( item.props.conditions, item ); }, () => { refresh(); const field = root.querySelector( target || '[data-ec-action="add-group"]' ); ( field?.tagName === 'SELECT' ? field.closest( '.lieve-control' ).querySelector( '.lieve-ds-select-trigger' ) : field )?.focus( { preventScroll: true } ); } ); }
		panel.querySelectorAll( '[data-ec-field]' ).forEach( input => {
			const listener = event => {
				if ( disposed || ! panel.isConnected || event.isComposing ) { return; }
				const key = input.dataset.ecField, groupId = input.closest( '[data-ec-group]' )?.dataset.ecGroup, ruleId = input.closest( '[data-ec-rule]' )?.dataset.ecRule;
				update( value => { const group = value.groups.find( row => row.id === groupId ), target = ruleId ? group?.rules.find( row => row.id === ruleId ) : group || value; if ( ! target ) { return; } target[ key ] = input.type === 'checkbox' ? input.checked : input.value; if ( ruleId && key === 'source' ) { target.parameter = ''; target.value = catalog.sources[ target.source ]?.choices ? Object.keys( catalog.sources[ target.source ].choices )[0] : ''; } }, [ groupId, ruleId, key ].join( ':' ), input.type === 'checkbox' || input.tagName === 'SELECT' );
				if ( key === 'name' ) { input.closest( '[data-ec-group]' ).querySelector( '[data-ec-name]' ).textContent = input.value || 'Rule group'; }
				if ( input.closest( '[data-ec-rule]' ) && [ 'source', 'operator' ].includes( key ) || key === 'enabled' || key === 'relation' ) { structural( null, refresh ); }
			};
			input.addEventListener( input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input', listener ); input.addEventListener( 'compositionend', listener );
		} );
		panel.querySelectorAll( '[data-ec-dynamic]' ).forEach( button => button.addEventListener( 'click', () => { const field = button.parentElement.querySelector( 'input' ); openDynamic( button, { field, nodeId: node.id, kind: 'text' } ); } ) );
		panel.querySelectorAll( '[data-ec-action]' ).forEach( button => button.addEventListener( 'click', async () => {
			if ( disposed || ! panel.isConnected ) { return; }
			const name = button.dataset.ecAction, groupId = button.closest( '[data-ec-group]' )?.dataset.ecGroup, ruleId = button.closest( '[data-ec-rule]' )?.dataset.ecRule;
			if ( name === 'expand' ) { const key = node.id + ':' + groupId; expanded.has( key ) ? expanded.delete( key ) : expanded.add( key ); structural( null, refresh ); return; }
			if ( name === 'check' ) {
				const issues = errors(), result = panel.querySelector( '[data-ec-check-result]' ); result.hidden = false;
				if ( Object.keys( issues ).length ) { result.textContent = 'Complete the highlighted rules before checking.'; return; }
				clearResults(); result.hidden = false; result.textContent = 'Checking conditions…'; const hadFocus = document.activeElement === button; button.disabled = true; const token = revision, snapshot = JSON.stringify( current() ); pending = new AbortController();
				try {
					const response = await ( window.LieveTransport?.fetch || fetch )(  url, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce }, body: JSON.stringify( { conditions: current() } ), signal: pending.signal } ), data = await response.json();
					if ( ! response.ok ) { throw new Error( data.message || 'Could not check conditions. Try again.' ); }
					if ( disposed || token !== revision || JSON.stringify( current() ) !== snapshot ) { return; }
					const label = state => state === null ? 'Unavailable' : state ? 'Match' : 'No match';
					result.textContent = data.disabled ? 'Conditions are off. This element will be rendered.' : data.result === null ? 'Context unavailable. The live element is omitted unless a rule group matches.' : data.matches ? 'Matches in this context. This element will be rendered.' : 'Does not match. This element will be omitted on the live page.';
					for ( const group of data.groups || [] ) { const box = panel.querySelector( '[data-ec-group="' + group.id + '"]' ); if ( ! box ) { continue; } box.querySelector( '[data-ec-group-result]' ).textContent = label( group.result ); for ( const rule of group.rules ) { const row = box.querySelector( '[data-ec-rule="' + rule.id + '"]' ); if ( row ) { row.querySelector( '[data-ec-rule-result]' ).textContent = label( rule.result ); } } }
				} catch ( error ) { if ( ! disposed && token === revision && error.name !== 'AbortError' ) { result.textContent = error.message; } }
				finally { if ( ! disposed && token === revision ) { button.disabled = false; pending = null; if ( hadFocus && document.activeElement === document.body ) { button.focus( { preventScroll: true } ); } } }
				return;
			}
			edit( ( value, item ) => {
				if ( name === 'reset' ) { delete item.props.conditions; return; }
				if ( name === 'add-group' && value.groups.length < catalog.groupLimit ) { const group = model.group(); value.groups.push( group ); if ( value.groups.length === 1 ) { value.enabled = true; } expanded.add( node.id + ':' + group.id ); return '#ec-' + group.id + '-name'; }
				const group = value.groups.find( row => row.id === groupId ); if ( ! group ) { return; }
				if ( name === 'remove-group' ) { value.groups.splice( value.groups.indexOf( group ), 1 ); if ( ! value.groups.length ) { value.enabled = false; } return '[data-ec-action="add-group"]'; }
				if ( name === 'clone-group' && value.groups.length < catalog.groupLimit ) { const copy = model.clone( { groups: [ group ] } ).groups[0]; copy.name = Array.from( group.name ? group.name + ' copy' : 'Group copy' ).slice( 0, 120 ).join( '' ); value.groups.splice( value.groups.indexOf( group ) + 1, 0, copy ); expanded.add( node.id + ':' + copy.id ); return '#ec-' + copy.id + '-name'; }
				if ( name === 'add-rule' && group.rules.length < catalog.ruleLimit ) { const rule = model.rule(); group.rules.push( rule ); return '#ec-' + rule.id + '-source'; }
				const index = group.rules.findIndex( row => row.id === ruleId );
				if ( name === 'clone-rule' && index >= 0 && group.rules.length < catalog.ruleLimit ) { const rule = { ...group.rules[ index ], id: model.id() }; group.rules.splice( index + 1, 0, rule ); return '#ec-' + rule.id + '-source'; }
				if ( name === 'remove-rule' && index >= 0 && group.rules.length > 1 ) { group.rules.splice( index, 1 ); return '#ec-' + group.rules[ Math.min( index, group.rules.length - 1 ) ].id + '-source'; }
			} );
		} ) );
		errors(); return { errors, destroy() { disposed = true; revision++; pending?.abort(); } };
	}
	window.LieveElementConditionEditor = { markup, bind, expanded };
}() );
