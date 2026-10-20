( function () {
	'use strict';
	let instanceId = 0;

	function clone( value ) {
		return JSON.parse( JSON.stringify( value || [] ) );
	}

	function normalizeRow( row = {} ) {
		return {
			action: row.action === 'exclude' ? 'exclude' : 'include',
			type: row.type || 'entire_site',
			values: Array.isArray( row.values ) ? row.values.map( String ) : [],
			archiveType: row.archiveType || 'all',
			archiveTypes: Array.isArray( row.archiveTypes ) && row.archiveTypes.length ? row.archiveTypes.map( String ) : [ row.archiveType || 'all' ],
			archivePostTypes: Array.isArray( row.archivePostTypes ) ? row.archivePostTypes.map( String ) : row.archiveType === 'post_type' ? ( row.values || [] ).map( String ) : [],
			archiveTerms: Array.isArray( row.archiveTerms ) ? row.archiveTerms.map( String ) : row.archiveType === 'term' ? ( row.values || [] ).map( String ) : [],
			includeChildren: Boolean( row.includeChildren ),
			hookName: row.hookName || '',
			hookPriority: row.hookPriority === undefined ? 10 : row.hookPriority,
		};
	}

	function addOptions( select, options, selectedValues = [] ) {
		Object.entries( options || {} ).forEach( ( [ value, label ] ) => {
			const option = document.createElement( 'option' );
			option.value = value;
			option.textContent = label;
			option.selected = selectedValues.includes( String( value ) );
			select.appendChild( option );
		} );
	}

	function field( label, control, className = '' ) {
		const wrapper = document.createElement( 'label' );
		wrapper.className = 'lieve-condition-field' + ( className ? ' ' + className : '' );
		const text = document.createElement( 'span' );
		text.textContent = label;
		wrapper.append( text, control );
		return wrapper;
	}

	function toggle( input ) {
		const wrapper = document.createElement( 'span' );
		wrapper.className = 'lieve-condition-switch';
		input.setAttribute( 'role', 'switch' );
		const slider = document.createElement( 'span' );
		slider.className = 'lieve-condition-switch-slider';
		slider.setAttribute( 'aria-hidden', 'true' );
		wrapper.append( input, slider );
		return wrapper;
	}

	function validate( rows ) {
		if ( ! Array.isArray( rows ) || rows.length > 30 ) { return 'Enter up to 30 conditions.'; }
		for ( let index = 0; index < rows.length; index++ ) {
			const row = rows[ index ]; let error = '';
			if ( ! row || typeof row !== 'object' ) { return 'Rule ' + ( index + 1 ) + ': Choose a valid condition.'; }
			if ( ! [ 'include', 'exclude' ].includes( row.action ) || ! [ 'entire_site', 'front_page', 'post_type', 'archive', 'search', 'error_page', 'terms', 'individual' ].includes( row.type ) ) { error = 'Choose a valid rule and condition.'; }
			if ( [ 'post_type', 'terms', 'individual' ].includes( row.type ) && ! row.values?.length ) { error = 'Select at least one target.'; }
			if ( row.type === 'archive' && ! row.archiveTypes?.includes( 'all' ) ) {
				if ( ! row.archiveTypes?.length ) { error = 'Choose an archive type.'; }
				if ( row.archiveTypes?.includes( 'post_type' ) && ! row.archivePostTypes?.length ) { error = 'Select at least one archive post type.'; }
				if ( row.archiveTypes?.includes( 'term' ) && ! row.archiveTerms?.length ) { error = 'Select at least one archive term.'; }
			}
			if ( ! /^[a-zA-Z0-9_.:\/-]{0,150}$/.test( row.hookName || '' ) ) { error = 'Use a valid hook name (up to 150 characters, without spaces).'; }
			const priority = row.hookPriority;
			if ( priority === '' || priority === null || ! Number.isInteger( Number( priority ) ) || Number( priority ) < -1000 || Number( priority ) > 1000 ) { error = 'Hook priority must be a whole number between -1000 and 1000.'; }
			if ( error ) { return 'Rule ' + ( index + 1 ) + ': ' + error; }
		}
		return '';
	}

	function create( options ) {
		const root = typeof options.root === 'string' ? document.querySelector( options.root ) : options.root;
		const input = typeof options.input === 'string' ? document.querySelector( options.input ) : options.input;
		const config = options.config || {};
		let templateType = options.templateType || '';
		let popupOpening = options.popupOpening === 'interaction' ? 'interaction' : 'automatic';
		const popupInput = typeof options.popupInput === 'string' ? document.querySelector( options.popupInput ) : options.popupInput;
		let popupSelect = null;
		let ruleSelects = [];
		const selectPrefix = 'lieve-condition-control-' + ( ++instanceId );
		const popupLayer = document.createElement( 'div' ); popupLayer.className = 'lieve-ds lieve-popup-select-layer';
		let rows = clone( options.conditions ).map( normalizeRow );
		let closePicker = null;
		let pickerId = 0;
		let busy = false;
		let revealErrors = false;
		const disabledBefore = new WeakMap();

		if ( ! root ) {
			return null;
		}
		root.closest( '.lieve-conditions-popup' )?.addEventListener( 'lieve:conditions-close', () => { closePicker?.(); popupSelect?.close(); ruleSelects.forEach( picker => picker.close() ); } );
		[ 'click', 'input', 'change', 'keydown', 'pointerdown' ].forEach( name => root.addEventListener( name, event => {
			if ( busy ) { event.preventDefault(); event.stopImmediatePropagation(); }
		}, true ) );

		function refreshErrors() {
			if ( ! revealErrors ) { return; }
			root.querySelectorAll( '[data-condition-index]' ).forEach( card => {
				if ( ! rows[ Number( card.dataset.conditionIndex ) ] ) { return; }
				const message = validate( [ rows[ Number( card.dataset.conditionIndex ) ] ] ).replace( /^Rule 1: /, '' );
				const error = card.querySelector( '.lieve-condition-error' );
				if ( error ) { error.textContent = message; error.hidden = ! message; }
				card.classList.toggle( 'has-error', Boolean( message ) );
			} );
		}
		function applyBusy() {
			root.setAttribute( 'aria-busy', String( busy ) );
			root.querySelectorAll( 'input, select, button' ).forEach( field => {
				if ( busy ) { if ( ! disabledBefore.has( field ) ) { disabledBefore.set( field, field.disabled ); } field.disabled = true; }
				else if ( disabledBefore.has( field ) ) { field.disabled = disabledBefore.get( field ); disabledBefore.delete( field ); }
			} );
			root.querySelectorAll( '[data-condition-index]' ).forEach( card => { card.tabIndex = busy ? -1 : 0; } );
			const $ = window.jQuery; const list = root.querySelector( '.lieve-condition-list' );
			popupSelect?.refresh();
			ruleSelects.forEach( picker => picker.refresh() );
			if ( $ && list && $( list ).data( 'ui-sortable' ) ) { $( list ).sortable( 'option', 'disabled', busy ); }
		}

		function sync( notify = true ) {
			refreshErrors();
			if ( popupInput ) { popupInput.value = popupOpening; }
			if ( input ) {
				input.value = JSON.stringify( rows );
			}
			if ( notify && typeof options.onChange === 'function' ) {
				options.onChange( clone( rows ), popupOpening );
			}
		}

		function valueControl( row, index, source, label, key = 'values', kind = '', onChange = null ) {
			const wrapper = document.createElement( 'div' );
			wrapper.className = 'lieve-condition-picker';
			const trigger = document.createElement( 'button' );
			trigger.type = 'button';
			trigger.className = 'lieve-condition-picker-trigger';
			trigger.setAttribute( 'aria-label', label );
			trigger.setAttribute( 'aria-haspopup', 'dialog' );
			trigger.setAttribute( 'aria-expanded', 'false' );
			const menu = document.createElement( 'div' );
			menu.id = ( root.id || 'lieve-conditions' ) + '-picker-' + ( ++pickerId );
			menu.className = 'lieve-condition-picker-menu';
			menu.setAttribute( 'role', 'dialog' );
			menu.setAttribute( 'aria-label', label );
			trigger.setAttribute( 'aria-controls', menu.id );
			const heading = document.createElement( 'div' );
			heading.className = 'lieve-condition-picker-heading';
			const title = document.createElement( 'strong' );
			title.textContent = label;
			const count = document.createElement( 'span' );
			heading.append( title, count );
			const search = document.createElement( 'input' );
			search.type = 'search';
			search.className = 'lieve-condition-picker-search';
			search.placeholder = 'Search ' + label.toLowerCase() + '…';
			search.setAttribute( 'aria-label', search.placeholder );
			const choices = document.createElement( 'div' );
			choices.className = 'lieve-condition-picker-options';
			const footer = document.createElement( 'div' );
			footer.className = 'lieve-condition-picker-footer';
			const status = document.createElement( 'small' );
			status.setAttribute( 'role', 'status' );
			const more = document.createElement( 'button' );
			more.type = 'button';
			more.className = 'lieve-condition-more';
			more.textContent = 'Load more';
			more.hidden = true;
			footer.append( status, more );
			menu.append( heading, search, choices, footer );
			wrapper.appendChild( trigger );
			let known = { ...source };
			row[ key ].forEach( ( value ) => { if ( ! known[ value ] ) { known[ value ] = value; } } );
			let page = 1;
			let ticket = 0;
			let timer;
			let opened = false;
			const remote = Boolean( kind && config.optionsUrl );
			function renderTrigger() {
				trigger.replaceChildren();
				const summary = document.createElement( 'span' );
				summary.className = 'lieve-condition-picker-summary';
				if ( ! row[ key ].length ) {
					const placeholder = document.createElement( 'span' );
					placeholder.className = 'lieve-condition-picker-placeholder';
					placeholder.textContent = 'Select ' + label.toLowerCase() + '…';
					summary.appendChild( placeholder );
				} else {
					row[ key ].slice( 0, 2 ).forEach( ( value ) => {
						const tag = document.createElement( 'span' );
						tag.className = 'lieve-condition-picker-tag';
						tag.textContent = known[ value ] || value;
						summary.appendChild( tag );
					} );
					if ( row[ key ].length > 2 ) {
						const extra = document.createElement( 'span' );
						extra.className = 'lieve-condition-picker-count';
						extra.textContent = '+' + ( row[ key ].length - 2 );
						summary.appendChild( extra );
					}
				}
				const arrow = document.createElement( 'span' );
				arrow.className = 'lieve-condition-picker-arrow';
				arrow.setAttribute( 'aria-hidden', 'true' );
				arrow.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
				trigger.append( summary, arrow );
				trigger.title = row[ key ].map( ( value ) => known[ value ] || value ).join( ', ' );
				count.textContent = row[ key ].length + ' selected';
			}
			function renderChoices() {
				choices.replaceChildren();
				Object.entries( known ).forEach( ( [ value, text ] ) => {
					if ( ! remote && ! String( text ).toLowerCase().includes( search.value.toLowerCase() ) ) { return; }
					const choice = document.createElement( 'label' );
					choice.className = 'lieve-condition-picker-option';
					const checkbox = document.createElement( 'input' );
					checkbox.type = 'checkbox';
					checkbox.value = value;
					checkbox.checked = row[ key ].includes( value );
					const name = document.createElement( 'span' );
					name.textContent = text;
					checkbox.addEventListener( 'change', () => {
						if ( busy ) { return; }
						if ( checkbox.checked && row[ key ].length >= 100 ) {
							checkbox.checked = false;
							status.textContent = 'Select up to 100 targets per rule.';
							return;
						}
						row[ key ] = checkbox.checked ? [ ...row[ key ], value ] : row[ key ].filter( ( item ) => item !== value );
						status.textContent = '';
						renderTrigger();
						if ( onChange ) { onChange( value, checkbox.checked ); } else { sync(); }
					} );
					choice.append( toggle( checkbox ), name );
					choices.appendChild( choice );
				} );
				if ( ! choices.childElementCount ) {
					const empty = document.createElement( 'p' );
					empty.className = 'lieve-condition-picker-empty';
					empty.textContent = 'No results found.';
					choices.appendChild( empty );
				}
			}
			function position() {
				const rect = trigger.getBoundingClientRect();
				const width = Math.min( Math.max( rect.width, 300 ), window.innerWidth - 32 );
				menu.style.width = width + 'px';
				menu.style.left = Math.max( 16, Math.min( rect.left, window.innerWidth - width - 16 ) ) + 'px';
				const availableBelow = window.innerHeight - rect.bottom - 16;
				const above = availableBelow < 240 && rect.top > availableBelow;
				menu.style.maxHeight = Math.max( 140, Math.min( 360, above ? rect.top - 24 : availableBelow - 8 ) ) + 'px';
				menu.style.top = ( above ? Math.max( 16, rect.top - menu.offsetHeight - 8 ) : rect.bottom + 8 ) + 'px';
			}
			function close( restoreFocus = false ) {
				if ( ! opened ) { return; }
				opened = false;
				menu.remove();
				trigger.setAttribute( 'aria-expanded', 'false' );
				document.removeEventListener( 'pointerdown', outside );
				window.removeEventListener( 'resize', position );
				window.removeEventListener( 'scroll', scroll, true );
				if ( closePicker === close ) { closePicker = null; }
				if ( restoreFocus && trigger.isConnected ) { trigger.focus(); }
			}
			function outside( event ) {
				if ( ! menu.contains( event.target ) && ! trigger.contains( event.target ) ) { close(); }
			}
			function scroll( event ) {
				if ( ! menu.contains( event.target ) ) { position(); }
			}
			menu.addEventListener( 'keydown', ( event ) => {
				if ( event.key === 'Escape' ) {
					event.preventDefault();
					event.stopPropagation();
					close( true );
				}
			} );
			trigger.addEventListener( 'click', () => {
				if ( busy ) { return; }
				if ( opened ) { close(); return; }
				closePicker?.();
				opened = true;
				closePicker = close;
				( root.closest( '.lieve-conditions-popup' ) || document.body ).appendChild( menu );
				trigger.setAttribute( 'aria-expanded', 'true' );
				position();
				document.addEventListener( 'pointerdown', outside );
				window.addEventListener( 'resize', position );
				window.addEventListener( 'scroll', scroll, true );
				search.focus();
				if ( remote && ! search.dataset.loaded ) { search.dataset.loaded = 'true'; load(); }
			} );
			trigger.addEventListener( 'keydown', ( event ) => {
				if ( event.key === 'ArrowDown' && ! opened ) {
					event.preventDefault();
					trigger.click();
				}
			} );
			async function load( append = false ) {
				if ( ! wrapper.isConnected ) { return; }
				const current = ++ticket;
				more.disabled = true;
				status.textContent = 'Loading…';
				const params = new URLSearchParams( { kind, search: search.value, page: String( page ) } );
				row[ key ].forEach( ( value ) => params.append( 'selected[]', value ) );
				const url = new URL( config.optionsUrl, window.location.href );
				params.forEach( ( value, name ) => url.searchParams.append( name, value ) );
				try {
					const response = await ( window.LieveTransport?.fetch || fetch )(  url.href, { credentials: 'same-origin', headers: { 'X-WP-Nonce': config.nonce } } );
					const result = await response.json();
					if ( ! response.ok ) { throw new Error( result.message || 'Search failed.' ); }
					if ( current !== ticket || ! wrapper.isConnected ) { return; }
					const retained = Object.fromEntries( row[ key ].map( ( value ) => [ value, known[ value ] || value ] ) );
					known = { ...( append ? known : retained ), ...result.options };
					renderChoices();
					renderTrigger();
					more.hidden = ! result.hasMore;
					status.textContent = Object.keys( known ).length ? '' : 'No results.';
					if ( opened ) { position(); }
				} catch ( error ) {
					if ( current === ticket ) { status.textContent = error.message; }
				} finally {
					if ( current === ticket ) { more.disabled = false; }
				}
			}
			search.addEventListener( 'keydown', ( event ) => { if ( event.key === 'Enter' ) { event.preventDefault(); } } );
			search.addEventListener( 'input', () => {
				if ( ! remote ) { renderChoices(); return; }
				window.clearTimeout( timer );
				ticket++;
				page = 1;
				timer = window.setTimeout( () => load(), 250 );
			} );
			more.addEventListener( 'click', () => { page++; load( true ); } );
			renderTrigger();
			renderChoices();
			return wrapper;
		}

		function bindSortable( list ) {
			const $ = window.jQuery;
			if ( ! $ || ! $.fn || typeof $.fn.sortable !== 'function' ) {
				return;
			}

			const $list = $( list );
			$list.sortable( {
				appendTo: root.closest( '.lieve-conditions-popup' ) || list.parentElement,
				items: '> .lieve-condition-row',
				cancel: 'input, textarea, button, select, option, a, label',
				placeholder: 'lieve-condition-row lieve-condition-placeholder ui-sortable-placeholder',
				tolerance: 'pointer',
				start( event, ui ) {
					ui.placeholder.outerHeight( ui.item.outerHeight() );
				},
				stop() {
					if ( busy ) { render(); return; }
					const order = $list.children( '.lieve-condition-row' ).map( function () {
						return parseInt( this.dataset.conditionIndex, 10 );
					} ).get();
					if ( order.length !== rows.length || order.some( ( index ) => ! Number.isInteger( index ) || ! rows[ index ] ) ) {
						render();
						return;
					}
					rows = order.map( ( index ) => rows[ index ] );
					sync();
					window.requestAnimationFrame( render );
				},
			} );
			$list.disableSelection();
			$list.addClass( 'is-ready' );

			const warm = () => {
				if ( $list.data( 'ui-sortable' ) ) {
					$list.sortable( 'refreshPositions' );
				}
			};
			if ( window.requestIdleCallback ) {
				window.requestIdleCallback( warm, { timeout: 500 } );
			} else {
				window.setTimeout( warm, 0 );
			}
		}

		function render() {
			closePicker?.();
			popupSelect?.destroy(); popupSelect = null;
			ruleSelects.forEach( picker => picker.destroy() ); ruleSelects = [];
			root.innerHTML = '';
			root.classList.add( 'lieve-conditions-builder' );
			if ( templateType === 'popup' ) {
				const group = document.createElement( 'div' ); group.className = 'lieve-popup-opening';
				const label = document.createElement( 'label' ); label.textContent = 'Opening mode';
				const select = document.createElement( 'select' ); select.id = ( root.id || 'lieve-conditions' ) + '-opening'; select.className = 'lieve-condition-param'; select.setAttribute( 'aria-label', 'Opening mode' ); label.setAttribute( 'for', select.id );
				addOptions( select, { automatic: 'Automatic', interaction: 'On interaction' }, [ popupOpening ] );
				const help = document.createElement( 'p' ); help.id = select.id + '-help'; select.setAttribute( 'aria-describedby', help.id );
				const describe = () => { help.textContent = popupOpening === 'interaction' ? 'Starts closed. Open it from an Interact rule by selecting its name. Display rules limit availability; without rules it is available site-wide.' : 'Opens on page load when display conditions match. Only the most specific automatic Pop Up opens; without rules it does not appear.'; };
				select.addEventListener( 'change', () => { popupOpening = select.value; describe(); sync(); } );
				const control = document.createElement( 'div' ); control.className = 'lieve-ds lieve-popup-opening-control';
				control.appendChild( select ); group.append( label, control, help ); root.appendChild( group ); describe();
				if ( window.LieveDesignSystem?.createSelect ) {
					const owner = root.closest( '.lieve-conditions-popup' ) || root.closest( '#lieve-builder-app' ) || root;
					owner.appendChild( popupLayer ); popupSelect = window.LieveDesignSystem.createSelect( select, owner, popupLayer, { lazy: true } );
					label.setAttribute( 'for', select.id + '-trigger' );
				}
			}

			const list = document.createElement( 'div' );
			list.className = 'lieve-condition-list';
			list.setAttribute( 'role', 'list' );
			const columns = document.createElement( 'div' );
			columns.className = 'lieve-condition-columns';
			columns.setAttribute( 'aria-hidden', 'true' );
			[ '', 'Rule', 'Condition', 'Targets', '' ].forEach( ( label ) => {
				const column = document.createElement( 'span' );
				column.textContent = label;
				columns.appendChild( column );
			} );

			function reorder( from, insertionIndex, focusRow = false ) {
				if ( busy || ! Number.isInteger( from ) || from < 0 || from >= rows.length ) {
					return;
				}
				let destination = Math.max( 0, Math.min( rows.length, insertionIndex ) );
				const moved = rows.splice( from, 1 )[ 0 ];
				if ( from < destination ) {
					destination--;
				}
				rows.splice( destination, 0, moved );
				sync();
				render();
				if ( focusRow ) {
					window.requestAnimationFrame( () => {
						root.querySelector( '[data-condition-index="' + destination + '"]' )?.focus();
					} );
				}
			}

			if ( ! rows.length ) {
				const empty = document.createElement( 'div' );
				empty.className = 'lieve-condition-empty';
				empty.textContent = config.emptyLabel || 'No automatic conditions.';
				list.appendChild( empty );
			}

			rows.forEach( ( row, index ) => {
				const card = document.createElement( 'div' );
				card.className = 'lieve-condition-row';
				card.dataset.conditionIndex = String( index );
				card.tabIndex = 0;
				card.setAttribute( 'role', 'listitem' );
				card.setAttribute( 'aria-roledescription', 'Sortable item' );
				card.setAttribute( 'aria-label', 'Condition ' + ( index + 1 ) );

				const top = document.createElement( 'div' );
				top.className = 'lieve-condition-row-main';
				const drag = document.createElement( 'span' );
				drag.className = 'lieve-condition-drag';
				drag.setAttribute( 'aria-hidden', 'true' );
				drag.innerHTML = '&#8942;&#8942;';
				card.addEventListener( 'keydown', ( event ) => {
					if ( event.target !== card || ! [ 'ArrowUp', 'ArrowDown', 'Home', 'End' ].includes( event.key ) ) {
						return;
					}
					let insertion = index;
					if ( event.key === 'ArrowUp' ) {
						insertion = index - 1;
					} else if ( event.key === 'ArrowDown' ) {
						insertion = index + 2;
					} else if ( event.key === 'Home' ) {
						insertion = 0;
					} else if ( event.key === 'End' ) {
						insertion = rows.length;
					}
					if ( insertion < 0 || ( event.key === 'ArrowDown' && index === rows.length - 1 ) || ( event.key === 'Home' && index === 0 ) || ( event.key === 'End' && index === rows.length - 1 ) ) {
						return;
					}
					event.preventDefault();
					reorder( index, insertion, true );
				} );

				const action = document.createElement( 'select' );
				action.id = selectPrefix + '-' + index + '-rule';
				action.dataset.dsSelectKind = 'rules';
				action.className = 'lieve-condition-param';
				action.setAttribute( 'aria-label', 'Rule' );
				addOptions( action, config.actions, [ row.action ] );
				action.addEventListener( 'change', () => {
					rows[ index ].action = action.value;
					sync();
				} );

				const type = document.createElement( 'select' );
				type.id = selectPrefix + '-' + index + '-type';
				type.dataset.dsSelectKind = 'conditions';
				type.className = 'lieve-condition-operator';
				type.setAttribute( 'aria-label', 'Condition' );
				addOptions( type, config.types, [ row.type ] );
				type.addEventListener( 'change', () => {
					rows[ index ].type = type.value;
					rows[ index ].values = [];
					rows[ index ].archiveType = 'all';
					rows[ index ].archiveTypes = [ 'all' ];
					rows[ index ].archivePostTypes = [];
					rows[ index ].archiveTerms = [];
					rows[ index ].includeChildren = false;
					sync();
					render();
					root.querySelector( '#' + type.id + '-trigger' )?.focus();
				} );

				const remove = document.createElement( 'button' );
				remove.type = 'button';
				remove.className = 'lieve-condition-remove';
				remove.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
				remove.setAttribute( 'aria-label', ( config.removeLabel || 'Remove condition' ) + ' ' + ( index + 1 ) );
				remove.title = config.removeLabel || 'Remove condition';
				remove.addEventListener( 'click', () => {
					rows.splice( index, 1 );
					sync();
					render();
					root.querySelector( '[data-condition-index="' + Math.min( index, rows.length - 1 ) + '"] .lieve-condition-remove' )?.focus();
					if ( ! rows.length ) { root.querySelector( '.lieve-condition-add' )?.focus(); }
				} );

				const targets = document.createElement( 'div' );
				targets.className = 'lieve-condition-targets';
				top.append( drag, field( 'Rule', action ), field( 'Condition', type ), targets, remove );

				const details = document.createElement( 'div' );
				details.className = 'lieve-condition-row-details';

				if ( row.type === 'post_type' ) {
					targets.appendChild( valueControl( row, index, config.postTypes, 'Post Types' ) );
				}

				if ( row.type === 'archive' ) {
					targets.appendChild( valueControl( row, index, config.archiveTypes, 'Archive Types', 'archiveTypes', '', ( value, checked ) => {
						if ( checked ) {
							rows[ index ].archiveTypes = value === 'all' ? [ 'all' ] : rows[ index ].archiveTypes.filter( ( item ) => item !== 'all' );
						}
						if ( ! rows[ index ].archiveTypes.length ) { rows[ index ].archiveTypes = [ 'all' ]; }
						rows[ index ].archiveType = rows[ index ].archiveTypes[ 0 ];
						sync();
						render();
						root.querySelector( '[data-condition-index="' + index + '"] [aria-label="Archive Types"]' )?.click();
					} ) );

					if ( row.archiveTypes.includes( 'post_type' ) && ! row.archiveTypes.includes( 'all' ) ) {
						targets.appendChild( valueControl( row, index, config.postTypes, 'Archive Post Types', 'archivePostTypes' ) );
					}
					if ( row.archiveTypes.includes( 'term' ) && ! row.archiveTypes.includes( 'all' ) ) {
						targets.appendChild( valueControl( row, index, config.terms, 'Archive Terms', 'archiveTerms', 'terms' ) );
					}
				}

				if ( row.type === 'terms' ) {
					targets.appendChild( valueControl( row, index, config.terms, 'Terms', 'values', 'terms' ) );
				}
				if ( row.type === 'individual' ) {
					targets.appendChild( valueControl( row, index, config.individuals, 'Individual Content', 'values', 'individual' ) );
				}
				if ( ! targets.childElementCount ) {
					const scope = document.createElement( 'span' );
					scope.className = 'lieve-condition-scope';
					scope.textContent = { entire_site: 'All pages on this site', front_page: 'The site homepage', search: 'All search results', error_page: 'The 404 page' }[ row.type ] || 'No additional targets';
					targets.appendChild( scope );
				}

				const supportsChildren = row.type === 'terms' || row.type === 'individual' || ( row.type === 'archive' && row.archiveTypes.includes( 'term' ) && ! row.archiveTypes.includes( 'all' ) );
				if ( supportsChildren ) {
					const checkbox = document.createElement( 'input' );
					checkbox.type = 'checkbox';
					checkbox.checked = row.includeChildren;
					const checkLabel = document.createElement( 'label' );
					checkLabel.className = 'lieve-condition-choice lieve-condition-checkbox' + ( row.includeChildren ? ' is-active' : '' );
					const checkText = document.createElement( 'span' );
					checkText.textContent = config.childrenLabel || 'Apply to child items';
					checkbox.addEventListener( 'change', () => {
						rows[ index ].includeChildren = checkbox.checked;
						checkLabel.classList.toggle( 'is-active', checkbox.checked );
						sync();
					} );
					checkLabel.append( toggle( checkbox ), checkText );
					details.appendChild( checkLabel );
				}
				if ( templateType === 'section' ) {
					const hook = document.createElement( 'input' );
					hook.type = 'text';
					hook.value = row.hookName;
					hook.placeholder = 'lieve_before_footer';
					hook.maxLength = 150;
					hook.addEventListener( 'input', () => { row.hookName = hook.value; sync(); } );
					const priority = document.createElement( 'input' );
					priority.type = 'number';
					priority.min = '-1000';
					priority.max = '1000';
					priority.value = row.hookPriority;
					priority.step = '1';
					priority.addEventListener( 'input', () => { row.hookPriority = priority.value === '' ? '' : Number( priority.value ); sync(); } );
					details.append( field( 'Hook Name (optional)', hook, 'is-wide' ), field( 'Hook Priority', priority, 'is-priority' ) );
					const hint = document.createElement( 'small' );
					hint.className = 'lieve-condition-hook-hint';
					hint.textContent = 'Choose a frontend hook for automatic placement. Leave blank to insert this section manually.';
					details.appendChild( hint );
				}

				if ( details.childElementCount ) {
					card.appendChild( details );
				}
				card.prepend( top );
				const error = document.createElement( 'p' ); error.className = 'lieve-condition-error'; error.hidden = true; error.setAttribute( 'role', 'status' ); card.appendChild( error );
				list.appendChild( card );
			} );

			const add = document.createElement( 'button' );
			add.type = 'button';
			add.className = 'lieve-condition-add';
			add.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
			add.appendChild( document.createTextNode( config.addLabel || 'Add Condition' ) );
			add.addEventListener( 'click', () => {
				if ( rows.length >= 30 ) { return; }
				rows.push( normalizeRow() );
				sync();
				render();
				const added = root.querySelector( '[data-condition-index="' + ( rows.length - 1 ) + '"]' );
				( added?.querySelector( '.lieve-ds-select-trigger' ) || added?.querySelector( 'select' ) )?.focus();
			} );
			add.disabled = rows.length >= 30;

			const toolbar = document.createElement( 'div' );
			toolbar.className = 'lieve-condition-toolbar';
			const total = document.createElement( 'span' );
			total.className = 'lieve-condition-total';
			total.textContent = rows.length + ( rows.length === 1 ? ' display rule' : ' display rules' );
			toolbar.append( total, add );
			root.append( toolbar );
			if ( rows.length ) { root.appendChild( columns ); }
			root.appendChild( list );
			if ( window.LieveDesignSystem?.createSelect ) {
				const owner = root.closest( '.lieve-conditions-popup' ) || root.closest( '#lieve-builder-app' ) || root;
				owner.appendChild( popupLayer );
				root.querySelectorAll( '.lieve-condition-row-main select' ).forEach( select => {
					const wrapper = select.parentElement; wrapper.classList.add( 'lieve-ds', 'lieve-condition-select' );
					wrapper.setAttribute( 'for', select.id + '-trigger' );
					ruleSelects.push( window.LieveDesignSystem.createSelect( select, owner, popupLayer, { lazy: true } ) );
				} );
			}
			bindSortable( list );
			applyBusy();
			sync( false );
		}

		render();

		return {
			setBusy( value ) {
				busy = Boolean( value );
				if ( busy ) {
					closePicker?.();
					popupSelect?.close(); ruleSelects.forEach( picker => picker.close() );
					const $ = window.jQuery, list = root.querySelector( '.lieve-condition-list' );
					if ( $ && list && $( list ).data( 'ui-sortable' )?.dragging ) { $( list ).sortable( 'cancel' ); }
				}
				applyBusy();
			},
			reportValidity() {
				revealErrors = true; refreshErrors(); const error = validate( rows );
				if ( error ) { root.querySelector( '.has-error' )?.focus(); }
				return ! error;
			},
			getConditions() {
				return clone( rows );
			},
			getPopupOpening() { return popupOpening; },
			setConditions( nextRows, notify = false, type = templateType, opening = popupOpening ) {
				revealErrors = false;
				rows = clone( nextRows ).map( normalizeRow );
				templateType = type;
				popupOpening = opening === 'interaction' ? 'interaction' : 'automatic';
				render();
				sync( notify );
			},
			setTemplateType( type ) {
				templateType = type;
				render();
			},
		};
	}

	function modal( root, canClose = () => true ) {
		let trigger = null;
		let previousOverflow = '';
		let closeTimer = 0;
		let openFrame = 0;
		let opened = false;
		function close() {
			if ( ! opened || ! canClose() ) {
				return;
			}
			opened = false;
			window.cancelAnimationFrame( openFrame );
			window.clearTimeout( closeTimer );
			root.dispatchEvent( new Event( 'lieve:conditions-close' ) );
			root.classList.remove( 'is-visible' );
			root.inert = true;
			document.body.style.overflow = previousOverflow;
			closeTimer = window.setTimeout( () => {
				root.hidden = true;
			}, 180 );
			// An opener can be hidden in a collapsed drawer after a viewport change.
			const visible = item => item && item.isConnected !== false && ! item.disabled && ( ! item.getClientRects || item.getClientRects().length );
			let returnTo = trigger;
			if ( ! visible( returnTo ) ) {
				const app = root.closest?.( '#lieve-builder-app' );
				const drawer = trigger?.closest?.( '#lieve-inspector-content, .lieve-inspector' ) ? 'properties' : 'elements';
				returnTo = app?.querySelector( '[data-toggle-drawer="' + drawer + '"]' );
				if ( ! visible( returnTo ) ) { returnTo = app?.querySelector( '#lieve-elements-tab' ); }
			}
			if ( visible( returnTo ) ) { returnTo.focus( { preventScroll: true } ); }
		}
		root.querySelectorAll( '[data-close-conditions]' ).forEach( ( button ) => button.addEventListener( 'click', close ) );
		root.addEventListener( 'keydown', ( event ) => {
			if ( event.isComposing || event.keyCode === 229 ) { return; }
			if ( event.key === 'Escape' ) {
				event.preventDefault();
				event.stopPropagation();
				close();
			}
			if ( event.key !== 'Tab' ) {
				return;
			}
			const focusable = Array.from( root.querySelectorAll( 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]' ) ).filter( ( item ) => item.getClientRects().length );
			const first = focusable[ 0 ];
			const last = focusable[ focusable.length - 1 ];
			if ( event.shiftKey && ( document.activeElement === first || document.activeElement === root.querySelector( '[role="dialog"]' ) ) ) {
				event.preventDefault();
				last?.focus();
			} else if ( ! event.shiftKey && document.activeElement === last ) {
				event.preventDefault();
				first?.focus();
			}
		} );
		return {
			open( opener = document.activeElement ) {
				if ( opened ) { return; }
				opened = true;
				window.clearTimeout( closeTimer );
				trigger = opener;
				previousOverflow = document.body.style.overflow;
				document.body.style.overflow = 'hidden';
				root.hidden = false;
				root.inert = false;
				openFrame = window.requestAnimationFrame( () => {
					if ( opened ) { root.classList.add( 'is-visible' ); }
				} );
				root.querySelector( '[role="dialog"]' )?.focus( { preventScroll: true } );
			},
			close,
		};
	}

	window.LieveConditions = { create, modal, validate };
}() );
