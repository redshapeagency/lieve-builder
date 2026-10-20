( function () {
	'use strict';
	window.LieveEditorControllers ||= {};
	window.LieveEditorControllers[ 'save' ] = function create( lieveContext ) {
	async function save( templateStatus = null ) {
		if ( lieveContext.state.saving ) { return; }
		if ( lieveContext.pageMarkupEditor && ! lieveContext.pageMarkupEditor.validate() ) { lieveContext.showWorkspacePanel( 'page-markup' ); if ( window.innerWidth <= 900 ) { lieveContext.app.dataset.drawer = 'elements'; } lieveContext.pageMarkupEditor.validate( true ); lieveContext.showToast( 'Correct the highlighted page IDs before saving.', true ); return; }
		lieveContext.motionEditor?.stop();
		lieveContext.richTextController?.flush(); lieveContext.codeFields?.flush();
		if ( lieveContext.seoEditor && ! lieveContext.seoEditor.validate() ) { lieveContext.showWorkspacePanel( 'seo' ); if ( window.innerWidth <= 900 ) { lieveContext.app.dataset.drawer = 'elements'; } lieveContext.seoEditor.reportValidity(); lieveContext.showToast( 'Correct the highlighted SEO fields before saving.', true ); return; }
		if ( ! lieveContext.validateCustomAttributes() ) { return; }
		if ( ! lieveContext.validateInteractions() ) { return; }
		const documentError = window.LieveDocumentValidation?.validate( lieveContext.state.document, lieveContext.config.elements || {} );
		if ( documentError ) { if ( documentError.node ) { lieveContext.activeClassId = null; lieveContext.state.selectedId = documentError.node.id; lieveContext.inspectorTab = documentError.tab || 'content'; lieveContext.renderAll(); } lieveContext.showToast( documentError.message, true ); return; }
		if ( lieveContext.motionEditor && ! lieveContext.motionEditor.validate() ) { return; }
		const invalidCondition = window.LieveElementConditions?.validateDocument( lieveContext.state.document );
		if ( invalidCondition ) { lieveContext.activeClassId = null; lieveContext.classWorkspace?.breakGroup(); lieveContext.state.selectedId = invalidCondition.node.id; lieveContext.inspectorTab = 'condition'; ( invalidCondition.node.props.conditions?.groups || [] ).forEach( group => window.LieveElementConditionEditor?.expanded.add( invalidCondition.node.id + ':' + group.id ) ); lieveContext.renderAll(); lieveContext.showToast( Object.values( invalidCondition.errors )[0], true ); lieveContext.inspector.querySelector( '[data-inspector-tab="condition"]' )?.focus( { preventScroll: true } ); return; }
		const invalidStyle = lieveContext.activeClassId && lieveContext.inspector.querySelector( '[data-style-prop][aria-invalid="true"]' ); if ( invalidStyle ) { lieveContext.showToast( invalidStyle.dataset.styleError || 'Correct the invalid class CSS before saving.', true ); invalidStyle.focus(); return; }
		const invalidId = lieveContext.inspector.querySelector( '[data-html-id][aria-invalid="true"]' );
		if ( invalidId ) { lieveContext.showToast( invalidId.validationMessage, true ); invalidId.focus(); return; }
		lieveContext.treeRename?.finish( true );
		if ( lieveContext.config.isTemplate ) {
			const error = window.LieveConditions.validate( lieveContext.state.templateConditions );
			if ( error ) { lieveContext.showToast( error, true ); return; }
			const popupError = lieveContext.inspector.querySelector( '[data-popup-error]' )?.dataset.popupError || window.LievePopupSettings?.validate( lieveContext.state.popupSettings );
			if ( popupError ) { lieveContext.showToast( popupError, true ); return; }
		}
		lieveContext.liveEdit = null;
		const sentSnapshot = lieveContext.snapshot();
		const sent = JSON.parse( sentSnapshot ); const previous = JSON.parse( lieveContext.state.savedSnapshot || '{}' );
		const sentDocumentRevision = lieveContext.config.documentRevision;
		const localContentChanged = () => lieveContext.serializeSnapshot( lieveContext.state.document ) !== lieveContext.serializeSnapshot( sent.document ) || lieveContext.state.headerTemplateId !== sent.headerTemplateId || lieveContext.state.footerTemplateId !== sent.footerTemplateId;
		// Content-writing intent is independent of whether metadata changed: a repeated
		// keyboard Save must never turn an unchanged native page into an empty canvas.
		const metadataOnly = ! lieveContext.config.isTemplate && ( Boolean( sent.seo ) || Boolean( sent.headOverrides ) || Boolean( sent.pageMarkup ) ) &&
			lieveContext.serializeSnapshot( sent.document ) === lieveContext.serializeSnapshot( previous.document ) && sent.headerTemplateId === previous.headerTemplateId && sent.footerTemplateId === previous.footerTemplateId;
		lieveContext.state.saving = true;
		lieveContext.saveButton.classList.add( 'is-saving' );
		lieveContext.updateButtons();

		let saveTimeout = null;
		let classesAlreadySaved = false;
		try {
			if ( lieveContext.recovery ) { try { await lieveContext.recovery.flush( true ); } catch ( error ) { /* A recovery outage must not block an explicit Save. */ } }
			if ( lieveContext.classWorkspace?.isDirty() ) {
				// Detect a known page conflict before changing the shared library.
				const check = await ( window.LieveTransport?.fetch || window.fetch.bind( window ) )( lieveContext.config.restUrl, { credentials: 'same-origin', cache: 'no-store', headers: { 'X-WP-Nonce': lieveContext.config.nonce } } );
				const current = await check.json(); if ( ! check.ok ) { throw new Error( current.message || 'The latest page could not be checked. Nothing has been saved.' ); }
				const keys = lieveContext.config.isTemplate ? [ 'templateRevision' ] : [ 'documentRevision', 'seoRevision', 'headRevision', 'markupRevision' ];
				if ( keys.some( key => lieveContext.config[ key ] && current[ key ] !== lieveContext.config[ key ] ) ) { throw new Error( 'The saved page changed in another session. Review the latest version before saving. Your page and class drafts are retained.' ); }
				await lieveContext.classWorkspace.save(); classesAlreadySaved = true;
			}
			const controller = window.AbortController ? new window.AbortController() : null;
			if ( controller ) { saveTimeout = window.setTimeout( () => controller.abort(), 30000 ); }
			const response = await ( window.LieveTransport?.fetch || window.fetch.bind( window ) )(  lieveContext.config.restUrl, {
				method: 'POST',
				credentials: 'same-origin',
				...( controller ? { signal: controller.signal } : {} ),
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': lieveContext.config.nonce,
				},
				body: lieveContext.config.isTemplate ? JSON.stringify( { ...sent, templateRevision: lieveContext.config.templateRevision, ...( typeof templateStatus === 'string' ? { templateStatus } : {} ) } ) : JSON.stringify( { ...sent, metadataOnly, documentRevision: lieveContext.config.documentRevision, headRevision: lieveContext.config.headRevision, ...( sent.pageMarkup ? { markupRevision: lieveContext.config.markupRevision } : {} ), ...( sent.seo ? { seoRevision: lieveContext.config.seoRevision } : {} ) } ),
			} );

			const result = await response.json();
			if ( ! response.ok ) {
				throw new Error( result.message || 'An error occurred while saving.' );
			}
			if ( ! result.document || typeof result.document !== 'object' || Array.isArray( result.document ) || ! Array.isArray( result.document.children ) ) { throw new Error( 'The saved document response could not be verified. Your draft is retained.' ); }
			if ( ! lieveContext.config.isTemplate && sent.seo ) {
				if ( ! /^[a-f0-9]{64}$/.test( result.seoRevision || '' ) || ! result.seo || ! result.document ) { throw new Error( 'The SEO save could not be verified. Your draft is retained; reload before saving again.' ); }
			}
			if ( ! lieveContext.config.isTemplate ) {
				if ( result.success !== true || ! /^[a-f0-9]{64}$/.test( result.documentRevision || '' ) ) { throw new Error( 'The page save could not be verified. Your draft is retained.' ); }
				if ( ! /^[a-f0-9]{64}$/.test( result.headRevision || '' ) || ! result.headOverrides || Array.isArray( result.headOverrides ) ) { throw new Error( 'The HEAD save could not be verified. Your draft is retained; reload before saving again.' ); }
				if ( sent.pageMarkup ) { if ( ! /^[a-f0-9]{64}$/.test( result.markupRevision || '' ) || ! result.pageMarkup || Array.isArray( result.pageMarkup ) ) { throw new Error( 'The page IDs save could not be verified. Your draft is retained; reload before saving again.' ); } }
			}
			if ( lieveContext.config.isTemplate ) {
				if ( ! /^[a-f0-9]{64}$/.test( result.templateRevision || '' ) || typeof result.templateStatus !== 'string' || ! result.state || ! Array.isArray( result.templateConditions ) || ! result.document ) { throw new Error( 'The save could not be verified. Your draft is retained; reload before saving again.' ); }
				if ( window.LievePopupSettings && ( ! result.popupSettings || window.LievePopupSettings.validate( window.LievePopupSettings.normalize( result.popupSettings ) ) ) ) { throw new Error( 'The Pop Up settings save could not be verified. Your draft is retained; reload before saving again.' ); }
				lieveContext.config.templateRevision = result.templateRevision; lieveContext.config.templateStatus = result.templateStatus; lieveContext.config.templateState = result.state;
			}
			if ( ! lieveContext.config.isTemplate ) {
				// Promote no baseline until the complete response is verified.
				if ( sent.seo ) { lieveContext.config.seoRevision = result.seoRevision; }
				lieveContext.config.headRevision = result.headRevision; if ( sent.pageMarkup ) { lieveContext.config.markupRevision = result.markupRevision; }
				// A metadata-only response must not bless newer local content based on a stale layout.
				if ( ! metadataOnly || result.documentRevision === sentDocumentRevision || ! localContentChanged() ) { lieveContext.config.documentRevision = result.documentRevision; }
			}

			lieveContext.treeRename?.finish( true );
			if ( lieveContext.snapshot() === sentSnapshot ) {
				lieveContext.state.document = lieveContext.normalizeDocument( result.document );
				lieveContext.state.headerTemplateId = parseInt( result.headerTemplateId || 0, 10 );
				lieveContext.state.footerTemplateId = parseInt( result.footerTemplateId || 0, 10 );
				if ( window.LieveSEO && ! lieveContext.config.isTemplate && result.seo ) { lieveContext.state.seo = window.LieveSEO.normalize( result.seo ); }
				if ( ! lieveContext.config.isTemplate ) { lieveContext.state.headOverrides = window.LieveHead.normalize( result.headOverrides ); }
				if ( ! lieveContext.config.isTemplate ) { lieveContext.state.pageMarkup = window.LievePageMarkup.normalize( result.pageMarkup ); }
				if ( lieveContext.config.isTemplate ) {
					lieveContext.state.templateType = result.templateType || lieveContext.state.templateType;
					lieveContext.state.popupOpening = result.popupOpening || lieveContext.state.popupOpening;
					lieveContext.state.popupSettings = window.LievePopupSettings?.normalize( result.popupSettings || lieveContext.state.popupSettings ) || lieveContext.state.popupSettings;
					lieveContext.state.templateConditions = lieveContext.clone( result.templateConditions || lieveContext.state.templateConditions );
					lieveContext.conditionsBuilder?.setConditions( lieveContext.state.templateConditions, false, lieveContext.state.templateType, lieveContext.state.popupOpening );
				}
				lieveContext.state.savedSnapshot = lieveContext.snapshot(); lieveContext.state.dirty = false; lieveContext.preserveEditorScroll( () => lieveContext.renderAll() );
				lieveContext.recovery?.clear().catch( error => lieveContext.showToast( error.message, true ) );
				lieveContext.showToast( lieveContext.config.isTemplate ? templateStatus === 'publish' ? 'Template saved and activated.' : templateStatus === 'draft' ? 'Template saved and deactivated.' : lieveContext.config.templateStatus === 'publish' ? 'Template saved.' : 'Inactive template saved.' : 'Page saved.', false, true );
			} else {
				// Edits made during the request are a newer draft, not server response data.
				if ( metadataOnly && ! localContentChanged() ) { lieveContext.state.document = lieveContext.normalizeDocument( result.document ); lieveContext.state.headerTemplateId = parseInt( result.headerTemplateId || 0, 10 ); lieveContext.state.footerTemplateId = parseInt( result.footerTemplateId || 0, 10 ); }
				const saved = JSON.parse( sentSnapshot ); saved.document = lieveContext.normalizeDocument( result.document );
				saved.headerTemplateId = parseInt( result.headerTemplateId || 0, 10 ); saved.footerTemplateId = parseInt( result.footerTemplateId || 0, 10 );
				if ( window.LieveSEO && ! lieveContext.config.isTemplate && result.seo ) { saved.seo = window.LieveSEO.normalize( result.seo ); }
				if ( ! lieveContext.config.isTemplate ) { saved.headOverrides = window.LieveHead.normalize( result.headOverrides ); }
				if ( ! lieveContext.config.isTemplate ) { saved.pageMarkup = window.LievePageMarkup.normalize( result.pageMarkup ); }
				if ( lieveContext.config.isTemplate ) { saved.templateType = result.templateType || saved.templateType; saved.popupOpening = result.popupOpening || saved.popupOpening; saved.popupSettings = window.LievePopupSettings?.normalize( result.popupSettings || saved.popupSettings ) || saved.popupSettings; saved.templateConditions = lieveContext.clone( result.templateConditions || saved.templateConditions ); }
				lieveContext.state.savedSnapshot = lieveContext.serializeSnapshot( saved );
				lieveContext.state.dirty = true; lieveContext.showToast( 'Saved. Your newer edits are still unsaved.', false, true );
			}
		} catch ( error ) {
			const message = error.name === 'AbortError' ? 'The save timed out. Your draft is retained. Reload the latest saved version before retrying.' : error.message || 'Unable to save the page.';
			lieveContext.showToast( ( classesAlreadySaved ? 'Shared classes were saved site-wide, but the page was not confirmed saved. Your page draft is retained. ' : '' ) + message, true );
		} finally {
			if ( saveTimeout ) { window.clearTimeout( saveTimeout ); }
			lieveContext.state.saving = false;
			lieveContext.saveButton.classList.remove( 'is-saving' );
			lieveContext.updateButtons();
		}
	}
	return { save };
	};
} )();
