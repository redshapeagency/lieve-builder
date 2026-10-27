( function () {
	'use strict';
	window.LieveEditorControllers ||= {};
	window.LieveEditorControllers[ 'library' ] = function create( lieveContext ) {
	async function refreshPopupChoices() {
		if ( ! lieveContext.config.popupChoicesUrl ) { return false; }
		if ( lieveContext.popupRefresh ) { return lieveContext.popupRefresh; }
		lieveContext.popupRefresh = ( async () => {
			const response = await ( window.LieveTransport?.fetch || fetch )(  lieveContext.config.popupChoicesUrl, { credentials: 'same-origin', headers: { 'X-WP-Nonce': lieveContext.config.nonce } } );
			const result = await response.json(); if ( ! response.ok ) { throw new Error( result.message || 'Could not refresh Pop Ups. Try again.' ); }
			if ( ! result.choices || typeof result.choices !== 'object' || Array.isArray( result.choices ) || ! Object.entries( result.choices ).every( ( [ id, title ] ) => /^[1-9]\d{0,14}$/.test( id ) && typeof title === 'string' ) ) { throw new Error( 'The Pop Up list could not be verified. Try again.' ); }
			const changed = JSON.stringify( lieveContext.config.popupChoices || {} ) !== JSON.stringify( result.choices ); lieveContext.config.popupChoices = result.choices; return changed;
		} )();
		try { return await lieveContext.popupRefresh; } finally { lieveContext.popupRefresh = null; }
	}

	function renderTemplateSettings() {
		if ( ! lieveContext.config.isTemplate || ! lieveContext.editorTemplateType ) {
			return;
		}

		lieveContext.editorTemplateType.value = lieveContext.state.templateType;
		if ( lieveContext.config.componentMode ) { lieveContext.editorTemplateType.closest('label').hidden = true; if(lieveContext.conditionsOpenButton)lieveContext.conditionsOpenButton.hidden=true; }
		else { const componentOption = lieveContext.editorTemplateType.querySelector('option[value="component"]'); if(componentOption){componentOption.disabled=true;componentOption.hidden=true;} }
		const popupButton = document.getElementById( 'lieve-popup-settings' ); if ( popupButton ) { popupButton.hidden = ! lieveContext.isPopupTemplate(); popupButton.setAttribute( 'aria-expanded', String( lieveContext.popupPanelOpen && lieveContext.isPopupTemplate() ) ); }
		const popupTools = document.getElementById( 'lieve-popup-inspector-tools' ); if ( popupTools ) { popupTools.hidden = ! lieveContext.isPopupTemplate() || lieveContext.popupPanelOpen; }
		lieveContext.templateSelects.forEach( select => select.refresh() );
		if ( lieveContext.conditionsCount ) {
			lieveContext.conditionsCount.textContent = String( lieveContext.state.templateConditions.length );
			lieveContext.conditionsCount.hidden = lieveContext.state.templateConditions.length === 0;
		}
	}

	function closeConditions() {
		lieveContext.conditionsDialog?.close();
		lieveContext.conditionsOpenButton?.setAttribute( 'aria-expanded', 'false' );
	}

	function applyConditions() {
		if ( ! lieveContext.conditionsBuilder ) {
			return false;
		}
		if ( ! lieveContext.conditionsBuilder.reportValidity() ) { return false; }
		const nextConditions = lieveContext.conditionsBuilder.getConditions();
		const nextOpening = lieveContext.conditionsBuilder.getPopupOpening();
		if ( JSON.stringify( nextConditions ) !== JSON.stringify( lieveContext.state.templateConditions ) || nextOpening !== lieveContext.state.popupOpening ) {
			lieveContext.commit( () => { lieveContext.state.templateConditions = lieveContext.clone( nextConditions ); lieveContext.state.popupOpening = nextOpening; } );
		}
		closeConditions();
		return true;
	}

	function openConditions() {
		if ( ! lieveContext.conditionsModal || ! lieveContext.conditionsBuilder ) {
			return;
		}
		lieveContext.conditionsBuilder.setConditions( lieveContext.state.templateConditions, false, lieveContext.state.templateType, lieveContext.state.popupOpening );
		lieveContext.conditionsOpenButton?.setAttribute( 'aria-expanded', 'true' );
		lieveContext.conditionsDialog?.open( lieveContext.conditionsOpenButton );
	}

	function closeTemplateLibrary() {
		if ( lieveContext.libraryDialog ) { lieveContext.libraryDialog.close(); }
		else if ( lieveContext.templateModal ) {
			lieveContext.templateModal.hidden = true;
		}
	}

	async function loadTemplates() {
		if ( ! lieveContext.templateModal || ! lieveContext.config.templatesUrl ) {
			return;
		}

		lieveContext.templateLoading.hidden = false;
		lieveContext.templateLoading.textContent = 'Loading templates…';
		lieveContext.templateGrid.innerHTML = '';

		try {
			const response = await ( window.LieveTransport?.fetch || window.fetch.bind( window ) )(  lieveContext.config.templatesUrl, {
				method: 'GET',
				credentials: 'same-origin',
				headers: { 'X-WP-Nonce': lieveContext.config.nonce },
			} );
			const result = await response.json();

			if ( ! response.ok ) {
				throw new Error( result.message || 'Unable to load templates.' );
			}

			lieveContext.state.templates = Array.isArray( result.templates ) ? result.templates : [];
			lieveContext.state.templateTypes = Array.isArray( result.types ) ? result.types : [];
			lieveContext.config.expandedPreviewRefresh?.();
			renderTemplateLibrary();
		} catch ( error ) {
			lieveContext.templateLoading.hidden = false;
			lieveContext.templateLoading.textContent = error.message || 'Unable to load templates.';
		}
	}

	function renderTemplateLibrary() {
		if ( ! lieveContext.templateFilters || ! lieveContext.templateGrid ) {
			return;
		}

		lieveContext.templateLoading.hidden = true;
		lieveContext.templateFilters.innerHTML = '';
		renderTemplateAssignments();

		const allFilter = document.createElement( 'button' );
		allFilter.type = 'button';
		allFilter.className = 'lieve-template-filter' + ( lieveContext.state.activeTemplateType === 'all' ? ' is-active' : '' );
		allFilter.setAttribute( 'aria-pressed', String( lieveContext.state.activeTemplateType === 'all' ) );
		allFilter.innerHTML = '<span>All</span><span>' + lieveContext.state.templates.length + '</span>';
		allFilter.addEventListener( 'click', () => {
			lieveContext.state.activeTemplateType = 'all';
			renderTemplateLibrary();
		} );
		lieveContext.templateFilters.appendChild( allFilter );

		lieveContext.state.templateTypes.forEach( ( type ) => {
			const filter = document.createElement( 'button' );
			filter.type = 'button';
			filter.className = 'lieve-template-filter' + ( String( type.id ) === String( lieveContext.state.activeTemplateType ) ? ' is-active' : '' );
			filter.setAttribute( 'aria-pressed', String( String( type.id ) === String( lieveContext.state.activeTemplateType ) ) );
			filter.innerHTML = '<span>' + lieveContext.escapeHtml( type.name ) + '</span><span>' + parseInt( type.count || 0, 10 ) + '</span>';
			filter.addEventListener( 'click', () => {
				lieveContext.state.activeTemplateType = String( type.id );
				renderTemplateLibrary();
			} );
			lieveContext.templateFilters.appendChild( filter );
		} );

		const visibleTemplates = lieveContext.state.activeTemplateType === 'all'
			? lieveContext.state.templates
			: lieveContext.state.templates.filter( ( template ) => String( template.type ) === String( lieveContext.state.activeTemplateType ) );

		lieveContext.templateGrid.innerHTML = '';
		if ( ! visibleTemplates.length ) {
			lieveContext.templateLoading.hidden = false;
			lieveContext.templateLoading.textContent = lieveContext.state.templates.length ? 'No templates match this type.' : 'The library is empty. Create your first template with the guided flow.';
			return;
		}

		visibleTemplates.forEach( ( template ) => {
			const card = document.createElement( 'article' );
			card.className = 'lieve-template-card';
			const type = template.type && lieveContext.templateTypeLabels[ template.type ] ? template.type : 'section';
			const canApply = [ 'header', 'footer', 'content', 'section', 'component' ].includes( type ) && Number(template.id) !== Number(lieveContext.config.postId);
			const actionLabel = type === 'component' ? 'Insert linked instance' : type === 'header' ? 'Use as Header' : ( type === 'footer' ? 'Use as Footer' : ( canApply ? 'Apply to Page' : 'Managed by Conditions' ) );
			const condition = template.conditionLabel || 'Manual';
			card.innerHTML = '<div><div class="lieve-template-type-badge">' + lieveContext.escapeHtml( lieveContext.templateTypeLabels[ type ] ) + '</div><h3>' + lieveContext.escapeHtml( template.title || 'Untitled' ) + '</h3><div class="lieve-template-card-categories"><span>' + lieveContext.escapeHtml( condition ) + '</span></div></div><button type="button" class="lieve-template-apply"' + ( canApply ? '' : ' disabled' ) + '>' + actionLabel + '</button>';
			if ( canApply ) {
				card.querySelector( '.lieve-template-apply' ).addEventListener( 'click', () => applyTemplate( template ) );
			}
			lieveContext.templateGrid.appendChild( card );
		} );
	}

	function renderTemplateAssignments() {
		if ( ! lieveContext.templateAssignments ) {
			return;
		}

		const header = lieveContext.state.templates.find( ( template ) => parseInt( template.id, 10 ) === lieveContext.state.headerTemplateId ) || lieveContext.templateContext?.area( 'header' );
		const footer = lieveContext.state.templates.find( ( template ) => parseInt( template.id, 10 ) === lieveContext.state.footerTemplateId ) || lieveContext.templateContext?.area( 'footer' );
		lieveContext.templateAssignments.innerHTML = '';

		[ [ 'header', header ], [ 'footer', footer ] ].forEach( ( [ area, template ] ) => {
			const item = document.createElement( 'div' );
			item.className = 'lieve-template-assignment';
			const manual = Boolean( area === 'header' ? lieveContext.state.headerTemplateId : lieveContext.state.footerTemplateId );
			item.innerHTML = '<span><strong>' + ( area === 'header' ? 'Header' : 'Footer' ) + '</strong>' + lieveContext.escapeHtml( template ? template.title : 'No Template' ) + ( template && ! manual ? '<small>Automatic · Conditions</small>' : '' ) + '</span>' + ( template && manual ? '<button type="button">Remove</button>' : '' );
			item.querySelector( 'button' )?.addEventListener( 'click', () => {
				lieveContext.commit( () => {
					if ( area === 'header' ) {
						lieveContext.state.headerTemplateId = 0;
					} else {
						lieveContext.state.footerTemplateId = 0;
					}
				} );
				renderTemplateAssignments();
				lieveContext.showToast( ( area === 'header' ? 'Header' : 'Footer' ) + ' override removed. Automatic conditions apply again; save the page to confirm.' );
			} );
			lieveContext.templateAssignments.appendChild( item );
		} );
	}

	function applyTemplate( template ) {
		if ( template.type === 'component' && lieveContext.componentEditor ) {
			const model = lieveContext.componentEditor.definition(template.id) || template;
			const selected = lieveContext.findNode(lieveContext.state.document.children,lieveContext.state.selectedId), parent = selected && lieveContext.canNest(selected.type) && selected.type !== 'component' ? selected : selected ? lieveContext.findParent(lieveContext.state.document.children,selected.id) : null;
			if ( parent?.type === 'component' ) { lieveContext.showToast('Choose a named Slot before inserting a linked component.'); return; }
			lieveContext.commit(()=>{ const node=lieveContext.componentEditor.instance(model); (parent?parent.children:lieveContext.state.document.children).push(node);lieveContext.state.selectedId=node.id; });
			closeTemplateLibrary();lieveContext.showToast('Linked component inserted. Save the page to confirm.');return;
		}
		if ( template.type === 'header' || template.type === 'footer' ) {
			lieveContext.commit( () => {
				if ( template.type === 'header' ) {
					lieveContext.state.headerTemplateId = parseInt( template.id, 10 );
				} else {
					lieveContext.state.footerTemplateId = parseInt( template.id, 10 );
				}
			} );
			closeTemplateLibrary();
			lieveContext.showToast( ( template.type === 'header' ? 'Header' : 'Footer' ) + ' assigned. Save the page to confirm.' );
			return;
		}

		if ( lieveContext.state.document.children.length && ! window.confirm( 'Replace the page content with the “' + ( template.title || 'Untitled' ) + '” template?' ) ) {
			return;
		}

		lieveContext.commit( () => {
			lieveContext.state.document = lieveContext.documentWithNewIds( template.document );
			lieveContext.state.selectedId = null;
		} );
		closeTemplateLibrary();
		lieveContext.showToast( 'Template applied. Save the page to confirm.' );
	}

	function openTemplateLibrary() {
		if ( ! lieveContext.templateModal ) {
			return;
		}
		lieveContext.inspectorSelects.forEach( select => select.close() );
		if ( lieveContext.libraryDialog ) { lieveContext.libraryDialog.open( lieveContext.templateOpenButton ); } else { lieveContext.templateModal.hidden = false; }
		lieveContext.state.activeTemplateType = 'all';
		loadTemplates();
	}
	return { refreshPopupChoices, renderTemplateSettings, closeConditions, applyConditions, openConditions, closeTemplateLibrary, loadTemplates, renderTemplateLibrary, renderTemplateAssignments, applyTemplate, openTemplateLibrary };
	};
} )();
