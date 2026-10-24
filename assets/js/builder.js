/* Workspace coordinator. Feature factories live in assets/js/editor/ and load as explicit dependencies. */
( function () {
	'use strict';
	const initialized = new WeakSet();
	function initialize() {
	// The head-loaded module mounts the complete shell before any partial editor paint.
	const shell = document.getElementById( 'lieve-builder-shell' );
	if ( shell && window.LieveBuilderConfig ) { shell.replaceWith( shell.content ); }

	const config = window.LieveBuilderConfig;
	const dynamicData = window.LieveDynamicData;
	dynamicData?.configure( config?.dynamicData );
	const app = document.getElementById( 'lieve-builder-app' );

	if ( ! config || ! app || initialized.has( app ) ) {
		return;
	}
	initialized.add( app );

	// @lieve-controller-bridge-start
	// Live accessors preserve one workspace state, including values changed while awaiting a request.
	const controllerContext = {
		get activeClassId() { return activeClassId; }, set activeClassId( value ) { activeClassId = value; },
		get addBlock() { return addBlock; },
		get app() { return app; },
		get automaticDataId() { return automaticDataId; },
		get automaticHtmlId() { return automaticHtmlId; },
		get beginTreeRename() { return beginTreeRename; },
		get bindCustomAttributes() { return bindCustomAttributes; },
		get bindElementId() { return bindElementId; },
		get bindIdentityControls() { return bindIdentityControls; },
		get bindMarkupClasses() { return bindMarkupClasses; },
		get bindStyleControls() { return bindStyleControls; },
		get canNest() { return canNest; },
		get canvas() { return canvas; },
		get canvasIdentity() { return canvasIdentity; },
		get canvasDrag() { return canvasDrag; }, set canvasDrag( value ) { canvasDrag = value; },
		get canvasInitializing() { return canvasInitializing; }, set canvasInitializing( value ) { canvasInitializing = value; },
		get catalogueInsertion() { return catalogueInsertion; }, set catalogueInsertion( value ) { catalogueInsertion = value; },
		get changeClassTarget() { return changeClassTarget; },
		get chooseImage() { return chooseImage; },
		get classSelector() { return classSelector; }, set classSelector( value ) { classSelector = value; },
		get classStyleWriting() { return classStyleWriting; }, set classStyleWriting( value ) { classStyleWriting = value; },
		get classWorkspace() { return classWorkspace; }, set classWorkspace( value ) { classWorkspace = value; },
		get clearDropIndicators() { return clearDropIndicators; },
		get clearTreeDragMotion() { return clearTreeDragMotion; },
		get clearTreeDropPlaceholder() { return clearTreeDropPlaceholder; },
		get clone() { return clone; },
		get closeContextMenu() { return closeContextMenu; },
		get closeDrawers() { return closeDrawers; },
		get closeTokenPicker() { return closeTokenPicker; },
		get codeEditor() { return codeEditor; }, set codeEditor( value ) { codeEditor = value; },
		get codeFields() { return codeFields; }, set codeFields( value ) { codeFields = value; },
		get codeSource() { return codeSource; },
		get commit() { return commit; },
		get componentEditor() { return componentEditor; },
		get conditionsBuilder() { return conditionsBuilder; }, set conditionsBuilder( value ) { conditionsBuilder = value; },
		get conditionsCount() { return conditionsCount; },
		get conditionsDialog() { return conditionsDialog; },
		get conditionsModal() { return conditionsModal; },
		get conditionsOpenButton() { return conditionsOpenButton; },
		get config() { return config; },
		get containsId() { return containsId; },
		get contextMenu() { return contextMenu; }, set contextMenu( value ) { contextMenu = value; },
		get contextReturnFocus() { return contextReturnFocus; }, set contextReturnFocus( value ) { contextReturnFocus = value; },
		get control() { return control; },
		get controlId() { return controlId; }, set controlId( value ) { controlId = value; },
		get copiedClasses() { return copiedClasses; }, set copiedClasses( value ) { copiedClasses = value; },
		get copiedElement() { return copiedElement; }, set copiedElement( value ) { copiedElement = value; },
		get copiedInteractions() { return copiedInteractions; }, set copiedInteractions( value ) { copiedInteractions = value; },
		get copiedStyles() { return copiedStyles; }, set copiedStyles( value ) { copiedStyles = value; },
		get customAttributeIcon() { return customAttributeIcon; },
		get customAttributeNameAllowed() { return customAttributeNameAllowed; },
		get customAttributeRows() { return customAttributeRows; },
		get customAttributesControl() { return customAttributesControl; },
		get customAttributeValueAllowed() { return customAttributeValueAllowed; },
		get deleteSelected() { return deleteSelected; },
		get designSystem() { return designSystem; }, set designSystem( value ) { designSystem = value; },
		get dimensionControlParts() { return dimensionControlParts; },
		get documentWithNewIds() { return documentWithNewIds; },
		get duplicateSelected() { return duplicateSelected; },
		get dynamicData() { return dynamicData; },
		get dynamicDataButton() { return dynamicDataButton; },
		get editingClass() { return editingClass; },
		get editorTemplateType() { return editorTemplateType; },
		get elementClassSummary() { return elementClassSummary; },
		get elementConditionController() { return elementConditionController; }, set elementConditionController( value ) { elementConditionController = value; },
		get elementIcon() { return elementIcon; },
		get elementIdentityControl() { return elementIdentityControl; },
		get elementMarkupClassesControl() { return elementMarkupClassesControl; },
		get elementMarkupClassOptions() { return elementMarkupClassOptions; },
		get elementPreviews() { return elementPreviews; },
		get enhanceInspectorSelects() { return enhanceInspectorSelects; },
		get enhanceSelects() { return enhanceSelects; },
		get escapeHtml() { return escapeHtml; },
		get executeCodePreview() { return executeCodePreview; },
		get findNode() { return findNode; },
		get findParent() { return findParent; },
		get findStyleNode() { return findStyleNode; },
		get group() { return group; },
		get headEditor() { return headEditor; }, set headEditor( value ) { headEditor = value; },
		get hideEditorTooltip() { return hideEditorTooltip; },
		get identityEnabled() { return identityEnabled; },
		get inspector() { return inspector; },
		get inspectorRevision() { return inspectorRevision; }, set inspectorRevision( value ) { inspectorRevision = value; },
		get inspectorSelects() { return inspectorSelects; }, set inspectorSelects( value ) { inspectorSelects = value; },
		get inspectorStyleValues() { return inspectorStyleValues; },
		get inspectorTab() { return inspectorTab; }, set inspectorTab( value ) { inspectorTab = value; },
		get interactController() { return interactController; }, set interactController( value ) { interactController = value; },
		get isPopupTemplate() { return isPopupTemplate; },
		get labels() { return labels; },
		get latestPreviews() { return latestPreviews; },
		get libraryDialog() { return libraryDialog; },
		get linkedSpacing() { return linkedSpacing; },
		get listingAncestor() { return listingAncestor; },
		get listingEditor() { return listingEditor; },
		get liveChange() { return liveChange; },
		get liveEdit() { return liveEdit; }, set liveEdit( value ) { liveEdit = value; },
		get markupClassesResetControl() { return markupClassesResetControl; },
		get markupResetButton() { return markupResetButton; },
		get markupResetIcon() { return markupResetIcon; },
		get motionChoicesSnapshot() { return motionChoicesSnapshot; }, set motionChoicesSnapshot( value ) { motionChoicesSnapshot = value; },
		get motionController() { return motionController; }, set motionController( value ) { motionController = value; },
		get motionEditor() { return motionEditor; }, set motionEditor( value ) { motionEditor = value; },
		get moveSelected() { return moveSelected; },
		get moveToRoot() { return moveToRoot; },
		get nodeDepth() { return nodeDepth; },
		get normalizeDocument() { return normalizeDocument; },
		get openContextMenu() { return openContextMenu; },
		get openDynamicPicker() { return openDynamicPicker; },
		get openPopupSettings() { return openPopupSettings; },
		get openTokenPicker() { return openTokenPicker; },
		get pageMarkupEditor() { return pageMarkupEditor; }, set pageMarkupEditor( value ) { pageMarkupEditor = value; },
		get parseItems() { return parseItems; },
		get pasteElement() { return pasteElement; },
		get phpPreviewSources() { return phpPreviewSources; },
		get popupPanelOpen() { return popupPanelOpen; }, set popupPanelOpen( value ) { popupPanelOpen = value; },
		get popupPanelTab() { return popupPanelTab; }, set popupPanelTab( value ) { popupPanelTab = value; },
		get popupRefresh() { return popupRefresh; }, set popupRefresh( value ) { popupRefresh = value; },
		get popupStyleId() { return popupStyleId; },
		get popupStyleNode() { return popupStyleNode; },
		get preserveEditorScroll() { return preserveEditorScroll; },
		get preserveInspectorScroll() { return preserveInspectorScroll; },
		get previewJobs() { return previewJobs; },
		get recovery() { return recovery; },
		get refreshPopupChoices() { return refreshPopupChoices; },
		get refreshStyleColorSwatch() { return refreshStyleColorSwatch; },
		get removeNode() { return removeNode; },
		get renderAll() { return renderAll; },
		get renderCanvas() { return renderCanvas; },
		get renderCanvasElement() { return renderCanvasElement; },
		get renderCanvasStyles() { return renderCanvasStyles; },
		get renderInspector() { return renderInspector; },
		get renderStructure() { return renderStructure; },
		get renderStylePanel() { return renderStylePanel; },
		get renderTemplateSettings() { return renderTemplateSettings; },
		get repeaterControl() { return repeaterControl; },
		get richTextControl() { return richTextControl; },
		get richTextController() { return richTextController; }, set richTextController( value ) { richTextController = value; },
		get save() { return save; },
		get saveButton() { return saveButton; },
		get selectControl() { return selectControl; },
		get selectedListingPosition() { return selectedListingPosition; }, set selectedListingPosition( value ) { selectedListingPosition = value; },
		get selectElement() { return selectElement; },
		get selectionFrame() { return selectionFrame; }, set selectionFrame( value ) { selectionFrame = value; },
		get selectionObservedTargets() { return selectionObservedTargets; }, set selectionObservedTargets( value ) { selectionObservedTargets = value; },
		get selectionOutline() { return selectionOutline; }, set selectionOutline( value ) { selectionOutline = value; },
		get selectionResizeObserver() { return selectionResizeObserver; }, set selectionResizeObserver( value ) { selectionResizeObserver = value; },
		get seoEditor() { return seoEditor; }, set seoEditor( value ) { seoEditor = value; },
		get serializeSnapshot() { return serializeSnapshot; },
		get showToast() { return showToast; },
		get showWorkspacePanel() { return showWorkspacePanel; },
		get snapshot() { return snapshot; },
		get state() { return state; },
		get structure() { return structure; },
		get styleCategory() { return styleCategory; }, set styleCategory( value ) { styleCategory = value; },
		get styleCategoryIcon() { return styleCategoryIcon; },
		get styleDevice() { return styleDevice; }, set styleDevice( value ) { styleDevice = value; },
		get styleInspectionNode() { return styleInspectionNode; },
		get styles() { return styles; },
		get styleSearch() { return styleSearch; }, set styleSearch( value ) { styleSearch = value; },
		get styleState() { return styleState; }, set styleState( value ) { styleState = value; },
		get styleTarget() { return styleTarget; }, set styleTarget( value ) { styleTarget = value; },
		get subtreeDepth() { return subtreeDepth; },
		get syncElementClassSummary() { return syncElementClassSummary; },
		get syncIdentityControls() { return syncIdentityControls; },
		get templateAssignments() { return templateAssignments; },
		get templateContext() { return templateContext; }, set templateContext( value ) { templateContext = value; },
		get templateFilters() { return templateFilters; },
		get templateGrid() { return templateGrid; },
		get templateLoading() { return templateLoading; },
		get templateModal() { return templateModal; },
		get templateOpenButton() { return templateOpenButton; },
		get templateSelects() { return templateSelects; }, set templateSelects( value ) { templateSelects = value; },
		get templateTypeLabels() { return templateTypeLabels; },
		get tokenPicker() { return tokenPicker; }, set tokenPicker( value ) { tokenPicker = value; },
		get tokenPickerAnchor() { return tokenPickerAnchor; }, set tokenPickerAnchor( value ) { tokenPickerAnchor = value; },
		get tokenPickerCleanup() { return tokenPickerCleanup; }, set tokenPickerCleanup( value ) { tokenPickerCleanup = value; },
		get treeDragPointer() { return treeDragPointer; }, set treeDragPointer( value ) { treeDragPointer = value; },
		get treeDragPreview() { return treeDragPreview; }, set treeDragPreview( value ) { treeDragPreview = value; },
		get treeDropIntent() { return treeDropIntent; }, set treeDropIntent( value ) { treeDropIntent = value; },
		get treeDropPlaceholder() { return treeDropPlaceholder; }, set treeDropPlaceholder( value ) { treeDropPlaceholder = value; },
		get treeDropTargetRow() { return treeDropTargetRow; }, set treeDropTargetRow( value ) { treeDropTargetRow = value; },
		get treeHoverId() { return treeHoverId; }, set treeHoverId( value ) { treeHoverId = value; },
		get treeHoverTimer() { return treeHoverTimer; }, set treeHoverTimer( value ) { treeHoverTimer = value; },
		get treeRename() { return treeRename; }, set treeRename( value ) { treeRename = value; },
		get treeScrollFrame() { return treeScrollFrame; }, set treeScrollFrame( value ) { treeScrollFrame = value; },
		get treeScrollTime() { return treeScrollTime; }, set treeScrollTime( value ) { treeScrollTime = value; },
		get updateButtons() { return updateButtons; },
		get updateSelectionOutline() { return updateSelectionOutline; },
		get validateCustomAttributes() { return validateCustomAttributes; },
		get validateInteractions() { return validateInteractions; },
		get viewport() { return viewport; },
		get walkNodes() { return walkNodes; },
		get wrapSelected() { return wrapSelected; },
	};
	const { refreshPopupChoices, renderTemplateSettings, closeConditions, applyConditions, openConditions, closeTemplateLibrary, loadTemplates, renderTemplateLibrary, renderTemplateAssignments, applyTemplate, openTemplateLibrary } = window.LieveEditorControllers[ 'library' ]( controllerContext );
	const { canNest, clone, normalizeDocument, uid, escapeHtml, makeBlock, findNode, findParent, containsId, nodeDepth, subtreeDepth, nodeCount, canDrop, removeNode, insertRelative, cloneWithNewIds, documentWithNewIds, serializeSnapshot, snapshot, restoreSnapshot, commit, liveChange, undo, redo, addBlock, deleteSelected, pasteAllContent, clearAllContent, duplicateSelected, moveSelected, moveRelative, moveInside, moveToRoot, pasteElement, wrapSelected, walkNodes } = window.LieveEditorControllers[ 'document' ]( controllerContext );
	const { closeContextMenu, copyElementStyles, elementClassAssignments, elementClassSummary, syncElementClassSummary, canTransferElementClasses, copyElementClasses, pasteElementClasses, canTransferElementInteractions, copyElementInteractions, pasteElementInteractions, contextTransferRow, runContextAction, openContextMenu } = window.LieveEditorControllers[ 'context-menu' ]( controllerContext );
	const { canvasIdentity, styleString, createChildren, createNodeElement, prepareEditorRoot, prepareHtmlFragment, editorBounds, previewNodeData, previewKey, seedElementPreviews, handlePreviewInteraction, revealSelectedPreview, clearDropIndicators, loadElementPreview, selectElement, renderCanvasStyles, observeSelectionLayout, updateSelectionOutline, renderCanvasElement, renderCanvas } = window.LieveEditorControllers[ 'canvas' ]( controllerContext );
	const { destroy: destroyStructure, renameElement, beginTreeRename, clearTreeDragPreview, setTreeDragPreview, clearTreeDropPlaceholder, treeDropDestination, validTreeDrop, treeDropChangesPosition, treeDropPosition, treeRowDropPosition, resolveTreeDrop, showTreeDropPlaceholder, clearTreeDragMotion, updateTreeHover, treeScrollVelocity, scrollTreeDrag, moveTreeElement, applyTreeDrop, handleTreeDragOver, handleTreeDrop, cancelTreeDrag, handleTreeKeyDown, renderTreeBranch, renderStructure } = window.LieveEditorControllers[ 'structure' ]( controllerContext );
	const { control, selectControl, richTextControl, dynamicDataButton, styleCategoryIcon, group, parseItems, repeaterControl } = window.LieveEditorControllers[ 'controls' ]( controllerContext );
	const { editingClass, inspectorStyleValues, writeClassStyles, changeClassTarget, refreshClassStyleFields, dimensionControlParts, spacingLinkKey, toggleSpacingLink, spacingLinkProperties, spacingLinkStatus, spacingLinkIcon, renderSpacingLinks, fontFamilyOptions, styleControl, gradientRepeater, editGradientRows, renderStylePanel, bindStyleControls } = window.LieveEditorControllers[ 'inspector-style' ]( controllerContext );
	const { inspectorSettingSummary, settingIndicator, refreshInspectorIndicators, inspectorContextSummary, inspectorContextMarkup, syncInspectorContext, interactionElementChoices, validateInteractions, openPopupSettings, renderPopupInspector, writeCustomCode, openCodeDynamic, renderContentPanel, enhanceInspectorSelects, mountInspectorRichText, mountInspectorCode, renderInspector, preserveInspectorScroll, preserveEditorScroll } = window.LieveEditorControllers[ 'inspector' ]( controllerContext );
	const { elementIdError, bindElementId, customAttributeRows, customAttributeNameAllowed, customAttributeValueAllowed, customAttributeErrors, writeCustomAttributes, customAttributeIcon, customAttributesControl, bindCustomAttributes, validateCustomAttributes, automaticHtmlId, automaticDataId, identityEnabled, elementIdentityControl, syncIdentityControls, bindIdentityControls, elementMarkupClassOptions, markupResetIcon, markupResetButton, elementMarkupClassesControl, markupClassesResetControl, bindMarkupClasses } = window.LieveEditorControllers[ 'inspector-markup' ]( controllerContext );
	const { closeTokenPicker, refreshStyleColorSwatch, tokenColorPreview, openTokenPicker, openDynamicPicker, chooseImage } = window.LieveEditorControllers[ 'pickers' ]( controllerContext );
	const { save } = window.LieveEditorControllers[ 'save' ]( controllerContext );
	// @lieve-controller-bridge-end


	const canvas = document.getElementById( 'lieve-canvas' );
	window.addEventListener( 'pagehide', event => { if ( ! event.persisted ) { destroyStructure?.(); canvasIdentity().destroy(); } } );
	window.LieveWorkspace?.createPanelResize( { app, storageKey: config.layoutStorageKey } );
	const viewport = window.LieveViewport?.create( { canvas, app, styles: config.viewportStyles || [], styleTexts: config.viewportStyleTexts || {}, inlineCss: config.viewportInlineCss || '', verifiedCss: true, initialWidth: config.breakpoints?.find( item => item.base )?.width, onResize: () => window.requestAnimationFrame( updateSelectionOutline ), onReady: () => window.LieveEditorStartup?.ready(), onError: () => window.LieveEditorStartup?.fail() } ) || null;
	function onEditorDocuments( type, listener, options ) {
		[ ...new Set( [ document, canvas.ownerDocument || document ] ) ].forEach( doc => doc.addEventListener( type, listener, options ) );
	}
	function onWorkspaceReturn( listener ) { if ( viewport ) { viewport.onReturn( listener ); } else { window.addEventListener( 'focus', listener ); } }
	const structure = document.getElementById( 'lieve-structure' );
	const inspector = document.getElementById( 'lieve-inspector-content' );
	window.LieveWorkspace?.createFieldFocus( { app, documents: [ canvas.ownerDocument ] } );
	// Shared searchable picker, portaled outside scrolling panels. Populate on open.
	const selectLayer = document.createElement( 'div' );
	selectLayer.className = 'lieve-ds lieve-editor-select-layer'; app.appendChild( selectLayer );
	const zoomSelect = app.querySelector( '[data-editor-zoom]' );
	const zoomControl = zoomSelect && window.LieveDesignSystem?.createSelect( zoomSelect, app, selectLayer, { lazy: true, outsideDocuments: [ canvas.ownerDocument ] } );
	viewport?.onZoomChange( () => zoomControl?.refresh() );
	let inspectorSelects = [];
	let inspectorRevision = 0;
	let richTextController = null;
	let templateSelects = [];
	let categoryPicker = null;
	let codeEditor = null;
	let codeFields = null;
	// Tooltips live outside both scrolling sidebars and their stacking contexts.
	const editorTooltip = document.createElement( 'div' );
	editorTooltip.id = 'lieve-editor-tooltip'; editorTooltip.className = 'lieve-editor-tooltip'; editorTooltip.setAttribute( 'role', 'tooltip' ); editorTooltip.hidden = true; document.body.appendChild( editorTooltip );
	let tooltipAnchor = null;
	function hideEditorTooltip() {
		if ( tooltipAnchor ) { const ids = ( tooltipAnchor.getAttribute( 'aria-describedby' ) || '' ).split( /\s+/ ).filter( id => id && id !== editorTooltip.id ); if ( ids.length ) { tooltipAnchor.setAttribute( 'aria-describedby', ids.join( ' ' ) ); } else { tooltipAnchor.removeAttribute( 'aria-describedby' ); } }
		tooltipAnchor = null; editorTooltip.hidden = true;
	}
	function showEditorTooltip( anchor ) {
		hideEditorTooltip();
		if ( ! anchor?.dataset.tooltip || anchor.disabled ) { return; }
		tooltipAnchor = anchor; editorTooltip.textContent = anchor.dataset.tooltip; editorTooltip.hidden = false;
		anchor.setAttribute( 'aria-describedby', [ anchor.getAttribute( 'aria-describedby' ), editorTooltip.id ].filter( Boolean ).join( ' ' ) );
		const rect = anchor.getBoundingClientRect(); const box = editorTooltip.getBoundingClientRect();
		editorTooltip.style.left = Math.max( 8, Math.min( rect.left + ( rect.width - box.width ) / 2, window.innerWidth - box.width - 8 ) ) + 'px';
		editorTooltip.style.top = ( rect.bottom + box.height + 16 <= window.innerHeight ? rect.bottom + 8 : Math.max( 8, rect.top - box.height - 8 ) ) + 'px';
	}
	[ 'pointerover', 'focusin' ].forEach( type => app.addEventListener( type, event => { const anchor = event.target.closest?.( '[data-tooltip]' ); if ( anchor && anchor !== tooltipAnchor ) { showEditorTooltip( anchor ); } } ) );
	app.addEventListener( 'click', event => { const anchor = event.target.closest?.( '[data-tooltip]' ); if ( anchor && anchor === tooltipAnchor && editorTooltip.textContent !== anchor.dataset.tooltip ) { showEditorTooltip( anchor ); } } );
	[ 'pointerout', 'focusout' ].forEach( type => app.addEventListener( type, event => { if ( tooltipAnchor && tooltipAnchor.contains( event.target ) && ! tooltipAnchor.contains( event.relatedTarget ) ) { hideEditorTooltip(); } } ) );
	document.addEventListener( 'scroll', () => { if ( tooltipAnchor?.contains( document.activeElement ) ) { showEditorTooltip( tooltipAnchor ); } else { hideEditorTooltip(); } }, true ); window.addEventListener( 'resize', hideEditorTooltip );
	onEditorDocuments( 'pointerdown', hideEditorTooltip );
	onEditorDocuments( 'keydown', event => { if ( event.key === 'Escape' ) { hideEditorTooltip(); } } );
	function enhanceSelects( root, visibleOnly = false ) {
		if ( ! window.LieveDesignSystem?.createSelect ) { return []; }
		return Array.from( root.querySelectorAll( 'select' ) ).filter( select => ! visibleOnly || ( ! select.hidden && ! select.closest( '[hidden]' ) ) ).map( select => {
			select.id ||= 'lieve-editor-choice-' + ( ++controlId );
			const label = select.getAttribute( 'aria-label' ) || root.querySelector( 'label[for="' + select.id + '"]' )?.textContent || select.closest( 'label' )?.querySelector( 'span' )?.textContent || 'Options';
			const fontInput = select.hasAttribute( 'data-font-family-picker' ) ? root.querySelector( '[data-style-prop="font-family"]' ) : null;
			const attributeInput = select.hasAttribute( 'data-attribute-picker' ) ? select.closest( '[data-attribute-row]' )?.querySelector( '[data-attribute-name]' ) : null;
			const editableInput = fontInput || attributeInput;
			select.setAttribute( 'aria-label', label ); select.dataset.dsSelectKind = fontInput ? 'fonts' : attributeInput ? 'attributes' : select.dataset.dsSelectKind || 'options';
			const controller = window.LieveDesignSystem.createSelect( select, app, selectLayer, { lazy: true, editableInput, anchor: editableInput?.closest( '.lieve-style-input' ), outsideDocuments: [ canvas.ownerDocument ] } );
			root.querySelector( 'label[for="' + select.id + '"]' )?.setAttribute( 'for', select.id + '-trigger' );
			return controller;
		} );
	}
	const fontDocument = canvas.ownerDocument || document;
	let localFontStyle = null;
	if ( fontDocument.createElement && fontDocument.head ) { localFontStyle = fontDocument.createElement( 'style' ); localFontStyle.textContent = config.localFontsCss || ''; fontDocument.head.appendChild( localFontStyle ); }
	onWorkspaceReturn( async () => {
		if ( ! config.fontLibraryUrl ) { return; }
		try {
			const response = await ( window.LieveTransport?.fetch || fetch )(  config.fontLibraryUrl, { credentials: 'same-origin', headers: { 'X-WP-Nonce': config.nonce } } );
			if ( ! response.ok ) { return; } const result = await response.json();
			config.fontChoices = result.choices || []; if ( localFontStyle ) { localFontStyle.textContent = result.css || ''; }
			const list = document.getElementById( 'lieve-installed-fonts' );
			if ( list ) { inspectorSelects.forEach( select => select.close() ); list.innerHTML = fontFamilyOptions(); inspectorSelects.forEach( select => select.refresh() ); }
		} catch ( error ) { /* A temporary library error must not interrupt page editing. */ }
	} );
	const saveButton = document.getElementById( 'lieve-save' );
	let popupRefresh = null;
	/* @lieve-controller library.refreshPopupChoices */
	onWorkspaceReturn( async () => { try { if ( await refreshPopupChoices() && inspectorTab === 'interact' ) { preserveInspectorScroll( () => renderInspector() ); } } catch ( error ) { /* Keep current choices and the unsaved element draft; explicit Refresh can retry. */ } } );
	const templateActivation = document.getElementById( 'lieve-template-activation' );
	const undoButton = document.getElementById( 'lieve-undo' );
	const redoButton = document.getElementById( 'lieve-redo' );
	const toast = document.getElementById( 'lieve-toast' );
	const templateOpenButton = document.getElementById( 'lieve-templates-open' );
	const templateModal = document.getElementById( 'lieve-template-modal' );
	const templateFilters = document.getElementById( 'lieve-template-filters' );
	const templateGrid = document.getElementById( 'lieve-template-grid' );
	const templateLoading = document.getElementById( 'lieve-template-loading' );
	const templateAssignments = document.getElementById( 'lieve-template-assignments' );
	const editorTemplateType = document.getElementById( 'lieve-editor-template-type' );
	const conditionsOpenButton = document.getElementById( 'lieve-editor-conditions-open' );
	const conditionsModal = document.getElementById( 'lieve-conditions-modal' );
	const conditionsRoot = document.getElementById( 'lieve-editor-conditions' );
	const conditionsCount = document.getElementById( 'lieve-editor-condition-count' );
	const breakpointsModal = document.getElementById( 'lieve-breakpoints-modal' );
	let designSystem = null;
	let classWorkspace = null; let classSelector = null; let classNamesSnapshot = '';
	let activeClassId = null; let classStyleWriting = false; let classStyleSnapshot = '';
	const phpPreviewSources = new Map();
	const codeSource = node => node.type === 'component' ? JSON.stringify([previewNodeData(node),componentEditor?.revision()]) : JSON.stringify( [ node.props?.content || '', node.props?.customCss || '', node.props?.customJs || '', Boolean( node.props?.suppressPhpErrors ), Boolean( node.props?.dynamicCode ) ] );
	const executeCodePreview = node => config.customCode?.phpEnabled === true && config.customCode?.canAuthor === true && (node.type === 'component' || node.type === 'html' && node.props?.phpPreview === true);
	let tokenPicker = null;
	let canvasDrag = null;
	let seoEditor = null;
	let headEditor = null;
	let pageMarkupEditor = null;
	let tokenPickerAnchor = null;
	let tokenPickerCleanup = null;
	let conditionsBuilder = null;
	const conditionsDialog = conditionsModal && window.LieveConditions ? window.LieveConditions.modal( conditionsModal ) : null;
	const libraryDialog = templateModal && window.LieveConditions ? window.LieveConditions.modal( templateModal ) : null;

	const labels = {
		section: 'Section',
		container: 'Container',
		heading: 'Heading',
		text: 'Text',
		button: 'Button',
		image: 'Image',
		spacer: 'Spacer',
	};

	const icons = {
		section: '▤',
		container: '□',
		heading: 'H',
		text: '¶',
		button: '↗',
		image: '▧',
		spacer: '↕',
	};
	Object.entries( config.elements || {} ).forEach( ( [ type, definition ] ) => { labels[ type ] = definition.label; } );
	const elementPreviews = new Map();
	const latestPreviews = new Map();
	const previewJobs = new Map();
	let canvasInitializing = true;
	const styles = window.LieveStyles;
	const listingEditor = window.LieveListingEditor;
	let selectedListingPosition = null;
	function listingAncestor( node ) { for ( let parent = findParent( state.document.children, node.id ); parent; parent = findParent( state.document.children, parent.id ) ) { if ( listingEditor?.enabled( parent ) ) { return parent; } } return null; }
	let templateContext = null;
	styles?.configure( config.styleSchema );
	config.breakpoints = window.LieveResponsive?.normalize( config.breakpoints ) || [];
	styles?.configureBreakpoints( config.breakpoints );
	let inspectorTab = 'content';
	let interactController = null;
	let elementConditionController = null;
	let motionEditor = null, motionController = null;
	let motionChoicesSnapshot = '';
	let elementCategory = 'all';
	let controlId = 0;
	let liveEdit = null;
	let styleDevice = config.breakpoints.find( item => item.base )?.id || 'desktop';
	let styleState = 'normal';
	let styleTarget = 'root';
	let styleSearch = '';
	const linkedSpacing = new Set();
	let styleCategory = 'Layout';
	let contextMenu = null;
	let contextReturnFocus = null;
	let copiedElement = null;
	let structureActions = null;
	let copiedStyles = null;
	let copiedClasses = null;
	let copiedInteractions = null;
	let selectionOutline = null;
	let selectionFrame = 0;
	let selectionResizeObserver = null;
	let selectionObservedTargets = [];
	let treeRename = null;
	let treeDragPreview = null;
	let treeDropPlaceholder = null;
	let treeDropIntent = null;
	let treeDropTargetRow = null;
	let treeDragPointer = null;
	let treeScrollFrame = 0;
	let treeScrollTime = 0;
	let treeHoverTimer = 0;
	let treeHoverId = null;

	/* @lieve-controller document.canNest */

	function elementIcon( type ) {
		const name = config.elements?.[ type ]?.icon || 'layout';
		return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ( config.elementIcons?.[ name ] || '<rect x="3" y="3" width="18" height="18" rx="2"/>' ) + '</svg>';
	}

	const templateTypeLabels = {
		header: 'Header',
		footer: 'Footer',
		content: 'Single',
		section: 'Section',
		popup: 'Pop Up',
		archive: 'Archive',
		search: 'Search Results',
		error: 'Error Page',
	};

	const state = {
		document: normalizeDocument( config.document || { version: 1, children: [] } ),
		selectedId: null,
		seo: config.isTemplate ? undefined : window.LieveSEO?.normalize( config.seo || {} ),
		headOverrides: config.isTemplate ? undefined : window.LieveHead.normalize( config.headOverrides ),
		pageMarkup: config.isTemplate ? undefined : window.LievePageMarkup.normalize( config.pageMarkup ),
		draggingId: null,
		collapsedIds: new Set(),
		history: [],
		future: [],
		dirty: false,
		saving: false,
		savedSnapshot: null,
		headerTemplateId: parseInt( config.headerTemplateId || 0, 10 ),
		footerTemplateId: parseInt( config.footerTemplateId || 0, 10 ),
		templateType: config.templateType || 'section',
		popupOpening: config.popupOpening || 'automatic',
		popupSettings: window.LievePopupSettings?.normalize( config.popupSettings ) || {},
		templateConditions: clone( config.templateConditions || [] ),
		templates: [],
		templateTypes: [],
		activeTemplateType: 'all',
	};
	const componentEditor = window.LieveComponents?.create( {
		config, read: () => state.document, freshId: uid, icon: customAttributeIcon, reset: markupResetButton,
		change: mutation => commit( mutation, true ),
		render: () => preserveEditorScroll( () => renderAll() ), notice: showToast,
		replace: ( id, replacement ) => { const parent = findParent( state.document.children, id ); const nodes = parent ? parent.children : state.document.children; const index = nodes.findIndex( item => item.id === id ); if ( index >= 0 ) { nodes[index] = replacement; state.selectedId = replacement.id; } },
	} );
	onWorkspaceReturn( () => componentEditor?.refresh() );
	// Catalogue auto-selection edits the new element, but keeps its insertion parent.
	let catalogueInsertion = null;
	const popupStyleId = '__lieve-popup-shell';
	let popupPanelOpen = false; let popupPanelTab = 'style';
	const isPopupTemplate = () => Boolean( config.isTemplate && state.templateType === 'popup' );
	function popupStyleNode() { return { id: popupStyleId, type: 'popup-shell', props: state.popupSettings, children: [] }; }
	function styleInspectionNode() { return popupPanelOpen && isPopupTemplate() ? popupStyleNode() : findNode( state.document.children, state.selectedId ); }
	function findStyleNode( id ) { return id === popupStyleId && isPopupTemplate() ? popupStyleNode() : findNode( state.document.children, id ); }

	/* @lieve-controller document.clone */

	/** PHP encodes empty associative arrays as []; named JS array props never serialize. */
	/* @lieve-controller document.normalizeDocument */

	/* @lieve-controller document.uid */

	/* @lieve-controller document.escapeHtml */

	/* @lieve-controller document.makeBlock */

	/* @lieve-controller document.findNode */

	/* @lieve-controller document.findParent */

	/* @lieve-controller document.containsId */

	/* @lieve-controller document.nodeDepth */

	/* @lieve-controller document.subtreeDepth */

	/* @lieve-controller document.nodeCount */

	/* @lieve-controller document.canDrop */

	/* @lieve-controller document.removeNode */

	/* @lieve-controller document.insertRelative */

	/* @lieve-controller document.cloneWithNewIds */

	/* @lieve-controller document.documentWithNewIds */

	/* @lieve-controller document.serializeSnapshot */

	/* @lieve-controller document.snapshot */
	window.LieveFullPreview?.create( { app, config, read: snapshot, flush: () => { richTextController?.flush(); codeFields?.flush(); treeRename?.finish( true ); }, notify: showToast } );

	/* @lieve-controller document.restoreSnapshot */

	/* @lieve-controller document.commit */

	/** Group a typing session into one undo step; never wait for blur to store input. */
	/* @lieve-controller document.liveChange */

	/* @lieve-controller document.undo */

	/* @lieve-controller document.redo */

	/* @lieve-controller document.addBlock */

	/* @lieve-controller document.deleteSelected */

	/* @lieve-controller document.pasteAllContent */

	/* @lieve-controller document.clearAllContent */

	/* @lieve-controller document.duplicateSelected */

	/* @lieve-controller document.moveSelected */

	/* @lieve-controller document.moveRelative */

	/* @lieve-controller document.moveInside */

	/* @lieve-controller document.moveToRoot */

	/* @lieve-controller context-menu.closeContextMenu */

	/* @lieve-controller document.pasteElement */

	/* @lieve-controller document.wrapSelected */

	/* @lieve-controller context-menu.copyElementStyles */

	/* @lieve-controller context-menu.elementClassAssignments */
	/* @lieve-controller context-menu.elementClassSummary */
	/* @lieve-controller context-menu.syncElementClassSummary */

	/* @lieve-controller context-menu.canTransferElementClasses */

	/* @lieve-controller context-menu.copyElementClasses */

	/* @lieve-controller context-menu.pasteElementClasses */

	/* @lieve-controller context-menu.canTransferElementInteractions */

	/* @lieve-controller context-menu.copyElementInteractions */

	/* @lieve-controller context-menu.pasteElementInteractions */

	/* @lieve-controller context-menu.contextTransferRow */

	/* @lieve-controller context-menu.runContextAction */

	/* @lieve-controller context-menu.openContextMenu */

	/* @lieve-controller canvas.styleString */

	/* @lieve-controller canvas.createChildren */

	/* @lieve-controller canvas.createNodeElement */

	/* @lieve-controller canvas.prepareEditorRoot */

	/** Raw fragments keep their own tags, IDs and inline styles; handles are editor-only. */
	/* @lieve-controller canvas.prepareHtmlFragment */

	/* @lieve-controller canvas.editorBounds */

	/* @lieve-controller canvas.previewNodeData */
	/* @lieve-controller canvas.previewKey */
	/* @lieve-controller canvas.seedElementPreviews */

	/** Preview-only navigation: never submits forms or changes document properties. */
	/* @lieve-controller canvas.handlePreviewInteraction */

	/** Reveal hidden panels only in the editor, so nested content can be edited. */
	/* @lieve-controller canvas.revealSelectedPreview */

	/* @lieve-controller canvas.clearDropIndicators */

	/* @lieve-controller canvas.loadElementPreview */

	/* @lieve-controller canvas.selectElement */

	/* @lieve-controller canvas.renderCanvasStyles */

	/* @lieve-controller canvas.observeSelectionLayout */

	/* @lieve-controller canvas.updateSelectionOutline */

	/** Content typing replaces only its owning branch, preserving unrelated runtimes. */
	/* @lieve-controller canvas.renderCanvasElement */

	/* @lieve-controller canvas.renderCanvas */

	/* @lieve-controller structure.renameElement */

	/* @lieve-controller structure.beginTreeRename */

	/* @lieve-controller structure.clearTreeDragPreview */

	/* @lieve-controller structure.setTreeDragPreview */

	/* @lieve-controller structure.clearTreeDropPlaceholder */

	/* @lieve-controller structure.treeDropDestination */

	/* @lieve-controller structure.validTreeDrop */

	/* @lieve-controller structure.treeDropChangesPosition */

	/* @lieve-controller structure.treeDropPosition */

	/* @lieve-controller structure.treeRowDropPosition */

	/* @lieve-controller structure.resolveTreeDrop */

	/* @lieve-controller structure.showTreeDropPlaceholder */

	/* @lieve-controller structure.clearTreeDragMotion */

	/* @lieve-controller structure.updateTreeHover */

	/* @lieve-controller structure.treeScrollVelocity */

	/* @lieve-controller structure.scrollTreeDrag */

	/* @lieve-controller structure.moveTreeElement */

	/* @lieve-controller structure.applyTreeDrop */

	/* @lieve-controller structure.handleTreeDragOver */

	/* @lieve-controller structure.handleTreeDrop */

	/* @lieve-controller structure.cancelTreeDrag */

	/* @lieve-controller structure.handleTreeKeyDown */

	/* @lieve-controller structure.renderTreeBranch */

	/* @lieve-controller structure.renderStructure */

	/* @lieve-controller controls.control */

	/* @lieve-controller controls.selectControl */

	/* @lieve-controller controls.richTextControl */

	/* @lieve-controller controls.dynamicDataButton */

	/* @lieve-controller inspector-style.editingClass */
	/* @lieve-controller inspector-style.inspectorStyleValues */
	// Authored settings, not unsaved changes. Inherited values never count as local overrides.
	/* @lieve-controller inspector.inspectorSettingSummary */
	/* @lieve-controller inspector.settingIndicator */
	/* @lieve-controller inspector.refreshInspectorIndicators */
	/* @lieve-controller inspector-style.writeClassStyles */
	/* @lieve-controller inspector-style.changeClassTarget */
	/* @lieve-controller inspector-style.refreshClassStyleFields */
	/* @lieve-controller inspector-style.dimensionControlParts */
	/* @lieve-controller inspector-style.spacingLinkKey */
	/* @lieve-controller inspector-style.toggleSpacingLink */
	/* @lieve-controller inspector-style.spacingLinkProperties */
	/* @lieve-controller inspector-style.spacingLinkStatus */
	/* @lieve-controller inspector-style.spacingLinkIcon */
	/* @lieve-controller inspector-style.renderSpacingLinks */
	/* @lieve-controller inspector-style.fontFamilyOptions */

	/* @lieve-controller inspector-style.styleControl */

	/* @lieve-controller inspector-style.gradientRepeater */

	/* @lieve-controller inspector-style.editGradientRows */

	/* @lieve-controller inspector-style.renderStylePanel */

	/* @lieve-controller inspector.inspectorContextSummary */

	/* @lieve-controller inspector.inspectorContextMarkup */

	/* @lieve-controller inspector.syncInspectorContext */

	/* @lieve-controller controls.styleCategoryIcon */

	/* @lieve-controller controls.group */

	/* @lieve-controller controls.parseItems */

	/* @lieve-controller document.walkNodes */

	/* @lieve-controller inspector-markup.elementIdError */

	/* @lieve-controller inspector-markup.bindElementId */

	/* @lieve-controller controls.repeaterControl */

	/* @lieve-controller inspector-markup.customAttributeRows */

	/* @lieve-controller inspector-markup.customAttributeNameAllowed */

	/* @lieve-controller inspector-markup.customAttributeValueAllowed */

	/* @lieve-controller inspector-markup.customAttributeErrors */

	/* @lieve-controller inspector-markup.writeCustomAttributes */

	/* @lieve-controller inspector-markup.customAttributeIcon */

	/* @lieve-controller inspector-markup.customAttributesControl */

	/* @lieve-controller inspector-markup.bindCustomAttributes */

	/* @lieve-controller inspector-markup.validateCustomAttributes */

	/* @lieve-controller inspector-markup.automaticHtmlId */

	/* @lieve-controller inspector-markup.automaticDataId */

	/* @lieve-controller inspector-markup.identityEnabled */

	/* @lieve-controller inspector-markup.elementIdentityControl */

	/* @lieve-controller inspector-markup.syncIdentityControls */

	/* @lieve-controller inspector-markup.bindIdentityControls */

	/** Only classes owned by this root can override Settings → Markup. */
	/* @lieve-controller inspector-markup.elementMarkupClassOptions */

	/* @lieve-controller inspector-markup.markupResetIcon */

	/** All Markup reset actions share geometry, icon, hover and accessible naming. */
	/* @lieve-controller inspector-markup.markupResetButton */

	/* @lieve-controller inspector-markup.elementMarkupClassesControl */

	/* @lieve-controller inspector-markup.markupClassesResetControl */

	/* @lieve-controller inspector-markup.bindMarkupClasses */

	/* @lieve-controller inspector.interactionElementChoices */

	/* @lieve-controller inspector.validateInteractions */

	/* @lieve-controller inspector.openPopupSettings */

	/* @lieve-controller inspector.renderPopupInspector */

	/** All widgets share the same Content shell; field labels carry the meaning. */
	/* @lieve-controller inspector.writeCustomCode */
	/* @lieve-controller inspector.openCodeDynamic */

	/* @lieve-controller inspector.renderContentPanel */

	/* @lieve-controller inspector.enhanceInspectorSelects */
	/* @lieve-controller inspector.mountInspectorRichText */
	/* @lieve-controller inspector.mountInspectorCode */

	/* @lieve-controller inspector.renderInspector */

	/* @lieve-controller pickers.closeTokenPicker */
	/* @lieve-controller pickers.refreshStyleColorSwatch */
	/* @lieve-controller pickers.tokenColorPreview */
	/* @lieve-controller pickers.openTokenPicker */
	onEditorDocuments( 'pointerdown', event => { if ( tokenPicker && ! tokenPicker.contains( event.target ) && ! event.target.closest( '[data-style-token], [data-style-library], [data-dynamic-style], [data-dynamic-prop], [data-code-dynamic]' ) ) { closeTokenPicker(); } } );

	/* @lieve-controller pickers.openDynamicPicker */

	/* @lieve-controller inspector.preserveInspectorScroll */

	/* @lieve-controller inspector.preserveEditorScroll */

	/* @lieve-controller inspector-style.bindStyleControls */

	/* @lieve-controller pickers.chooseImage */

	function updateButtons() {
		codeFields?.sync();
		codeEditor?.refresh();
		structureActions?.sync();
		refreshInspectorIndicators();
		if ( inspector.querySelector( '[data-inspector-context]' ) ) { syncInspectorContext(); }
		const dirty = state.dirty || Boolean( classWorkspace?.isDirty() );
		const classBusy = Boolean( activeClassId && ( state.saving || classWorkspace?.isSaving() ) );
		const stylePanel = inspector.querySelector( '#lieve-style-panel' ); if ( stylePanel ) { stylePanel.inert = classBusy; stylePanel.setAttribute( 'aria-busy', String( classBusy ) ); }
		undoButton.disabled = activeClassId && classWorkspace ? ! classWorkspace.canUndo() : state.history.length === 0;
		redoButton.disabled = activeClassId && classWorkspace ? ! classWorkspace.canRedo() : state.future.length === 0;
		saveButton.disabled = state.saving || Boolean( classWorkspace?.isSaving() );
		saveButton.textContent = state.saving ? 'Saving…' : dirty ? 'Save changes' : 'Save';
		saveButton.setAttribute( 'aria-busy', String( state.saving ) );
		saveButton.title = dirty ? 'Save page and shared class changes (⌘S / Ctrl+S)' : 'All changes saved';
		if ( config.isTemplate ) {
			if ( templateActivation ) { templateActivation.disabled = state.saving; templateActivation.textContent = config.templateStatus === 'publish' ? 'Deactivate' : 'Activate'; templateActivation.title = config.templateStatus === 'publish' ? 'Save your current edits and deactivate this template' : 'Save your current edits and activate this template'; }
			const badge = document.getElementById( 'lieve-editor-template-state' ); if ( badge && config.templateState ) { badge.dataset.templateState = config.templateState.key; badge.textContent = config.templateState.label; }
		}
		const status = document.getElementById( 'lieve-save-status' );
		if ( status ) { status.textContent = state.saving ? 'Saving changes…' : classWorkspace?.isDirty() ? state.dirty ? 'Page + shared classes unsaved' : 'Unsaved shared class changes' : state.dirty ? 'Unsaved changes' : 'All changes saved'; status.classList.toggle( 'is-dirty', dirty ); }
		saveButton.setAttribute( 'aria-description', classWorkspace?.isDirty() ? 'Saves this document and publishes shared class changes across the website.' : 'Saves this document. Colors, variables and breakpoints are saved separately in their managers.' );
		const total = document.getElementById( 'lieve-element-total' );
		if ( total ) { const count = nodeCount( state.document.children ); total.textContent = count + ( count === 1 ? ' element' : ' elements' ); }
		const breadcrumb = document.getElementById( 'lieve-element-breadcrumb' );
		const selected = findNode( state.document.children, state.selectedId );
		if ( selected && ! popupPanelOpen ) { const title = inspector.querySelector( '.lieve-inspector-heading strong' ); if ( title ) { title.textContent = selected.props.editorLabel || labels[ selected.type ] || selected.type; title.title = title.textContent; } }
		if ( breadcrumb ) {
			const path = []; let node = findNode( state.document.children, state.selectedId );
			while ( node ) { path.unshift( node ); node = findParent( state.document.children, node.id ); }
			breadcrumb.innerHTML = path.map( ( item ) => '<button type="button" data-select-element="' + escapeHtml( item.id ) + '">' + escapeHtml( item.props.editorLabel || labels[ item.type ] || item.type ) + '</button>' ).join( '<span aria-hidden="true">/</span>' );
			breadcrumb.querySelectorAll( 'button' ).forEach( ( button ) => button.addEventListener( 'click', () => selectElement( button.dataset.selectElement ) ) );
		}
	}

	/* @lieve-controller library.renderTemplateSettings */

	/* @lieve-controller library.closeConditions */

	/* @lieve-controller library.applyConditions */

	/* @lieve-controller library.openConditions */

	function renderAll( preserveInspector = false ) {
		renderCanvas();
		renderStructure();
		if ( ! preserveInspector ) { renderInspector(); }
		renderTemplateSettings();
		seoEditor?.sync();
		headEditor?.sync();
		pageMarkupEditor?.sync();
		updateButtons();
		motionEditor?.sync();
		if ( templateModal && ! templateModal.hidden ) {
			renderTemplateAssignments();
		}
	}

	function dismissToast() {
		const focused = toast.contains( document.activeElement );
		window.clearTimeout( showToast.timer ); toast.classList.remove( 'is-visible' ); toast.hidden = true;
		if ( focused ) {
			const previous = showToast.returnFocus;
			if ( previous?.isConnected && ! previous.disabled && ! previous.closest( '[inert], [hidden]' ) ) { previous.focus( { preventScroll: true } ); }
			else { const modal = app.querySelector( '.lieve-template-modal:not([hidden]) [role="dialog"]' ); ( modal || saveButton ).focus( { preventScroll: true } ); }
		}
	}
	toast.querySelector( '[data-toast-dismiss]' )?.addEventListener( 'click', dismissToast );

	function showToast( message, error = false, resolveError = false ) {
		// Routine notices must not erase an unresolved conflict or partial Save warning.
		if ( ! error && ! resolveError && ! toast.hidden && toast.classList.contains( 'is-error' ) ) { return; }
		if ( ! toast.contains( document.activeElement ) ) { showToast.returnFocus = document.activeElement; }
		window.clearTimeout( showToast.timer );
		toast.setAttribute( 'role', error ? 'alert' : 'status' ); toast.setAttribute( 'aria-live', error ? 'assertive' : 'polite' );
		toast.querySelector( '[data-toast-message]' ).textContent = message;
		toast.querySelector( '[data-toast-title]' ).hidden = ! error;
		toast.querySelector( '[data-toast-dismiss]' ).hidden = ! error;
		toast.classList.toggle( 'is-error', error );
		toast.hidden = false;
		toast.classList.add( 'is-visible' );
		if ( ! error ) { showToast.timer = window.setTimeout( dismissToast, 3500 ); }
	}

	/* @lieve-controller library.closeTemplateLibrary */

	/* @lieve-controller library.loadTemplates */

	/* @lieve-controller library.renderTemplateLibrary */

	/* @lieve-controller library.renderTemplateAssignments */

	/* @lieve-controller library.applyTemplate */

	/* @lieve-controller library.openTemplateLibrary */

	/* @lieve-controller save.save */

	function filterElementCatalogue( value ) {
		const search = value.toLowerCase().trim(); let matches = 0;
		document.querySelectorAll( '[data-element-search]' ).forEach( ( button ) => {
			button.hidden = ! button.dataset.elementSearch.includes( search );
			const tile = button.closest( '.lieve-element-tile' ); if ( tile ) { tile.hidden = button.hidden; }
		} );
		document.querySelectorAll( '.lieve-element-category' ).forEach( ( category ) => {
			const count = category.querySelectorAll( '[data-add-block]:not([hidden])' ).length;
			category.hidden = count === 0 || ( elementCategory !== 'all' && category.dataset.elementGroup !== elementCategory );
			category.querySelector( '.lieve-element-category-count' ).textContent = String( count );
			if ( ! category.hidden ) { matches += count; }
		} );
		const empty = document.querySelector( '.lieve-element-search-empty' );
		empty.hidden = matches > 0;
		empty.textContent = search ? 'No matching elements. Try a different search or category.' : elementCategory === 'pinned' ? 'No pinned elements yet. Pin a widget from any category to keep it here.' : 'No elements in this category.';
	}

	function bindElementSearch( input ) {
		if ( ! input ) { return; }
		let previousValue = null;
		const refresh = () => {
			if ( previousValue === input.value ) { return; }
			previousValue = input.value;
			filterElementCatalogue( input.value );
			window.LieveSearchControls?.refresh( input );
		};
		// Browser suggestions and restored fields do not always emit input.
		[ 'input', 'change', 'search' ].forEach( type => input.addEventListener( type, refresh ) );
		input.addEventListener( 'keydown', event => {
			if ( event.key !== 'Escape' || event.isComposing || event.keyCode === 229 || ! input.value ) { return; }
			event.preventDefault(); event.stopPropagation(); input.value = '';
			input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		} );
		window.addEventListener( 'pageshow', refresh );
		refresh();
	}

	function selectElementCategory( name, focus = false ) {
		const tabs = Array.from( app.querySelectorAll( '[data-element-category-tab]' ) );
		const select = document.getElementById( 'lieve-widget-category' );
		const selected = tabs.find( tab => tab.dataset.elementCategoryTab === name );
		if ( ! selected && ! Array.from( select?.options || [] ).some( option => option.value === name ) ) { return; }
		elementCategory = name;
		tabs.forEach( tab => tab.setAttribute( 'aria-pressed', String( tab === selected ) ) );
		if ( select ) { select.value = name; categoryPicker?.refresh(); }
		const catalogue = document.getElementById( 'lieve-element-catalogue' );
		catalogue.dataset.category = name; catalogue.scrollTop = 0;
		filterElementCatalogue( document.getElementById( 'lieve-element-search' ).value );
		if ( focus ) { selected?.focus( { preventScroll: true } ); }
	}

	function updateBreakpointPreview( breakpoints ) {
		return preserveEditorScroll( () => {
			breakpoints = window.LieveResponsive.normalize( breakpoints ); config.breakpoints = breakpoints;
			styles?.configureBreakpoints( breakpoints );
			if ( ! breakpoints.some( item => item.id === styleDevice ) ) { liveEdit = null; styleDevice = breakpoints.find( item => item.base ).id; }
			const selected = breakpoints.find( item => item.id === styleDevice );
			const choices = app.querySelector( '.lieve-device-choices' );
			choices.replaceChildren( ...[ ...breakpoints ].sort( ( a, b ) => b.width - a.width ).map( item => {
				const button = document.createElement( 'button' ); button.type = 'button'; button.dataset.device = item.id;
				button.dataset.deviceIcon = item.icon; button.innerHTML = window.LieveResponsive.iconSvg( item.icon, config.breakpointIcons );
				const description = item.name + ' · ' + item.width + 'px · ' + ( item.base ? 'Base styles · all widths' : window.LieveResponsive.rule( item, breakpoints ) );
				button.dataset.tooltip = description; button.setAttribute( 'aria-label', description );
				button.tabIndex = item.id === styleDevice ? 0 : -1;
				button.classList.toggle( 'is-active', item.id === styleDevice ); button.setAttribute( 'aria-pressed', String( item.id === styleDevice ) ); return button;
			} ) );
			canvas.classList.remove( 'is-desktop', 'is-tablet', 'is-mobile' ); canvas.classList.add( 'is-responsive' );
			canvas.style.setProperty( '--lv-preview-width', selected.width + 'px' );
			viewport?.resize( selected.width );
			const label = document.getElementById( 'lieve-viewport-label' );
			if ( label ) { label.textContent = selected.base ? 'Base · all widths' : window.LieveResponsive.rule( selected, breakpoints ).replace( ':', ': ' ); }
			renderCanvasStyles(); renderInspector(); refreshInspectorIndicators();
		} );
	}

	function showWorkspacePanel( name ) {
		if ( ! [ 'elements', 'structure', 'seo', 'page-markup' ].includes( name ) ) { return; }
		document.querySelectorAll( '[data-panel-tab]' ).forEach( ( tab ) => { const active = tab.dataset.panelTab === name; tab.setAttribute( 'aria-selected', String( active ) ); tab.tabIndex = active ? 0 : -1; } );
		document.getElementById( 'lieve-elements-panel' ).hidden = name !== 'elements';
		document.getElementById( 'lieve-structure-panel' ).hidden = name !== 'structure';
		const seoPanel = document.getElementById( 'lieve-seo-panel' ); if ( seoPanel ) { seoPanel.hidden = name !== 'seo'; }
		const markupPanel = document.getElementById( 'lieve-page-markup-panel' ); if ( markupPanel ) { markupPanel.hidden = name !== 'page-markup'; }
		if ( [ 'seo', 'page-markup' ].includes( name ) && activeClassId ) { activeClassId = null; classWorkspace?.breakGroup(); renderInspector(); renderCanvasStyles(); }
	}
	document.querySelectorAll( '[data-panel-tab]' ).forEach( ( button ) => {
		button.addEventListener( 'click', () => showWorkspacePanel( button.dataset.panelTab ) );
		button.addEventListener( 'keydown', ( event ) => {
			if ( ! [ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End' ].includes( event.key ) ) { return; }
			event.preventDefault(); const tabs = Array.from( document.querySelectorAll( '[data-panel-tab]' ) ), index = tabs.indexOf( button );
			const next = window.LieveWorkspace.gridTabIndex( event.key, index, tabs.length, 2 );
			showWorkspacePanel( tabs[ next ].dataset.panelTab ); tabs[ next ].focus( { preventScroll: true } );
		} );
	} );
	function closeDrawers( restoreFocus = false ) {
		const drawer = app.dataset.drawer; const documentOpen = app.classList.contains( 'is-document-open' );
		delete app.dataset.drawer; app.classList.remove( 'is-document-open' );
		document.querySelectorAll( '[data-toggle-drawer], [data-toggle-document]' ).forEach( button => button.setAttribute( 'aria-expanded', 'false' ) );
		if ( restoreFocus && ( drawer || documentOpen ) ) {
			const opener = document.querySelector( drawer ? '[data-toggle-drawer="' + drawer + '"]' : '[data-toggle-document]' );
			if ( opener?.getClientRects().length ) { opener.focus( { preventScroll: true } ); }
		}
	}
	document.querySelectorAll( '[data-toggle-drawer]' ).forEach( ( button ) => button.addEventListener( 'click', () => { const name = button.dataset.toggleDrawer; const open = app.dataset.drawer !== name; closeDrawers(); if ( open ) { app.dataset.drawer = name; button.setAttribute( 'aria-expanded', 'true' ); } } ) );
	document.querySelector( '[data-toggle-document]' )?.addEventListener( 'click', ( event ) => { const open = ! app.classList.contains( 'is-document-open' ); closeDrawers(); app.classList.toggle( 'is-document-open', open ); event.currentTarget.setAttribute( 'aria-expanded', String( open ) ); } );
	onEditorDocuments( 'keydown', ( event ) => { if ( event.key === 'Escape' && ! event.defaultPrevented && ! event.isComposing && event.keyCode !== 229 ) { closeDrawers( true ); } } );
	bindElementSearch( document.getElementById( 'lieve-element-search' ) );
	app.querySelectorAll( '[data-element-category-tab]' ).forEach( button => {
		button.addEventListener( 'click', () => selectElementCategory( elementCategory === button.dataset.elementCategoryTab ? 'all' : button.dataset.elementCategoryTab ) );
	} );
	document.getElementById( 'lieve-widget-category' )?.addEventListener( 'change', event => selectElementCategory( event.target.value ) );
	categoryPicker = enhanceSelects( app.querySelector( '.lieve-widget-category-picker' ) )[0] || null;
	templateContext = window.LieveTemplateContext?.create( { config, onChange: () => { renderCanvas(); if ( ! templateModal?.hidden ) { renderTemplateAssignments(); } }, onError: message => showToast( message, true ) } );
	onWorkspaceReturn( () => { void templateContext?.refresh( state.headerTemplateId, state.footerTemplateId, true ); } );
	designSystem = window.LieveDesignSystem?.createWorkspace( { config: config.designSystem, onChange: renderCanvasStyles, onError: message => showToast( message, true ) } );
	classWorkspace = window.LieveClasses?.createWorkspace( { config: config.classes, onChange: () => { const names = JSON.stringify( classWorkspace?.current().classes.map( item => [ item.id, item.name, Boolean( item.trashed ) ] ) || [] ); if ( names !== classNamesSnapshot ) { classNamesSnapshot = names; renderCanvas(); } else { renderCanvasStyles(); } const css = JSON.stringify( editingClass() ); if ( css !== classStyleSnapshot ) { classStyleSnapshot = css; if ( ! classStyleWriting ) { if ( activeClassId && ! editingClass() ) { activeClassId = null; renderInspector(); } else { refreshClassStyleFields(); } } } if ( ! classStyleWriting ) { classSelector?.refresh(); } syncElementClassSummary(); updateButtons(); }, onError: message => showToast( message, true ) } );
	classNamesSnapshot = JSON.stringify( classWorkspace?.current().classes.map( item => [ item.id, item.name, Boolean( item.trashed ) ] ) || [] );
	const workspaceTools = window.LieveWorkspace?.create( { app, config, onAddBlock: addBlock, onCatalogueChange: () => filterElementCatalogue( document.getElementById( 'lieve-element-search' ).value ), onBreakpointsChange: items => { designSystem?.breakpoints( items ); classWorkspace?.breakpoints( items ); updateBreakpointPreview( items ); }, onError: message => showToast( message, true ) } );
	onWorkspaceReturn( () => { void workspaceTools?.refreshBreakpoints(); } );
	onWorkspaceReturn( () => { void designSystem?.refresh(); void classWorkspace?.refresh(); } );
	let refreshingQueries = false;
	onWorkspaceReturn( async () => {
		if ( ! config.queryChoicesUrl || refreshingQueries ) { return; }
		refreshingQueries = true; const controller = new AbortController(); const timeout = window.setTimeout( () => controller.abort(), 20000 );
		try {
			const response = await ( window.LieveTransport?.fetch || fetch )(  config.queryChoicesUrl, { signal: controller.signal, credentials: 'same-origin', headers: { 'X-WP-Nonce': config.nonce } } );
			if ( ! response.ok ) { return; } const result = await response.json();
			const valid = choices => choices && typeof choices === 'object' && ! Array.isArray( choices ) && Object.keys( choices ).length <= 201 && Object.entries( choices ).every( ( [ id, title ] ) => ( id === '' || /^q_[a-zA-Z0-9_-]{6,70}$/.test( id ) ) && typeof title === 'string' );
			if ( ! valid( result.all ) || ! valid( result.posts ) || ! /^[a-f0-9]{64}$/.test( result.revision || '' ) || result.revision === config.queryRevision ) { return; }
			config.queryRevision = result.revision;
			config.listingQueries = result.all;
			for ( const type of [ 'posts', 'related-posts', 'query-results' ] ) { if ( config.elements?.[type]?.fields?.savedQuery ) { config.elements[type].fields.savedQuery.options = type === 'query-results' ? result.all : result.posts; } }
			const usesSavedQuery = node => Boolean( node?.props?.savedQuery || listingEditor?.enabled( node ) || ( node?.children || [] ).some( usesSavedQuery ) );
			for ( const [ key ] of elementPreviews ) { try { if ( usesSavedQuery( JSON.parse( key ) ) ) { elementPreviews.delete( key ); } } catch ( error ) { /* Other preview formats are unrelated. */ } }
			const affected = usesSavedQuery( state.document );
			previewJobs.forEach( ( job, id ) => { if ( usesSavedQuery( findNode( state.document.children, id ) ) ) { job.controller.abort(); window.clearTimeout( job.timer ); previewJobs.delete( id ); } } );
			preserveEditorScroll( () => { if ( affected ) { renderCanvas(); } const selected = findNode( state.document.children, state.selectedId ); if ( listingEditor?.supports( selected?.type ) || [ 'posts', 'related-posts', 'query-results' ].includes( selected?.type ) ) { renderInspector(); } } );
		} catch ( error ) { /* Offline/library errors must not interrupt or discard page edits. */ }
		finally { window.clearTimeout( timeout ); refreshingQueries = false; }
	} );

	app.querySelector( '.lieve-device-choices' ).addEventListener( 'pointerdown', event => {
		// Clicking a viewport is a context switch, not a request to leave the field.
		// Preserve its focus/caret before the browser performs its default mouse focus.
		if ( event.button === 0 && event.target.closest( '[data-device]' ) && inspector.contains( document.activeElement ) ) { event.preventDefault(); }
	} );
	app.querySelector( '.lieve-device-choices' ).addEventListener( 'click', event => {
		const button = event.target.closest( '[data-device]' ); if ( ! button ) { return; }
		const retainField = inspector.contains( document.activeElement );
		richTextController?.flush(); codeFields?.flush(); classWorkspace?.breakGroup();
		liveEdit = null; styleDevice = button.dataset.device; updateBreakpointPreview( config.breakpoints );
		const active = app.querySelector( '[data-device="' + styleDevice + '"]' );
		if ( ! retainField ) { active?.focus( { preventScroll: true } ); }
	} );
	app.querySelector( '.lieve-device-choices' ).addEventListener( 'keydown', event => {
		const button = event.target.closest( '[data-device]' );
		if ( ! button || ! [ 'ArrowLeft', 'ArrowRight', 'Home', 'End' ].includes( event.key ) ) { return; }
		event.preventDefault();
		const buttons = Array.from( app.querySelectorAll( '.lieve-device-choices [data-device]' ) ); const index = buttons.indexOf( button );
		const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : ( index + ( event.key === 'ArrowRight' ? 1 : -1 ) + buttons.length ) % buttons.length;
		buttons[ next ].click();
	} );

	canvas.addEventListener( 'click', ( event ) => {
		if ( event.target === canvas ) {
			// Selection is UI state, not a document change. Keep previews and their
			// JavaScript runtime intact when clicking empty canvas.
			selectElement( null );
		}
	} );
	canvas.addEventListener( 'submit', ( event ) => event.preventDefault(), true );

	function handleEditorContextMenu( event ) {
		const target = event.target.closest( '.lieve-tree-row[data-id], .lieve-editor-node[data-id]' );
		if ( ! target ) { return; }
		const point = viewport && target.ownerDocument === canvas.ownerDocument ? viewport.point( event.clientX, event.clientY ) : { x: event.clientX, y: event.clientY };
		event.preventDefault(); event.stopPropagation(); openContextMenu( target.dataset.id, point.x, point.y );
	}
	app.addEventListener( 'contextmenu', handleEditorContextMenu );
	viewport?.document.addEventListener( 'contextmenu', handleEditorContextMenu );
	function handleEditorContextKey( event ) {
		if ( event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.target.closest?.( 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .CodeMirror' ) ) { return; }
		if ( event.key !== 'ContextMenu' && ! ( event.shiftKey && event.key === 'F10' ) ) { return; }
		const target = event.target.closest( '.lieve-tree-row[data-id], .lieve-editor-node[data-id]' ); if ( ! target ) { return; }
		const tree = target.closest?.( '#lieve-structure' );
		event.preventDefault(); const rect = viewport && target.ownerDocument === canvas.ownerDocument ? viewport.toParent( target.getBoundingClientRect() ) : target.getBoundingClientRect(); openContextMenu( target.dataset.id, rect.left + 16, rect.top + 20 );
		if ( tree && tree === structure ) { contextReturnFocus = tree.querySelector( '.lieve-tree-row[data-id="' + window.CSS.escape( target.dataset.id ) + '"]' ); }
	}
	app.addEventListener( 'keydown', handleEditorContextKey );
	viewport?.document.addEventListener( 'keydown', handleEditorContextKey );
	onEditorDocuments( 'pointerdown', ( event ) => { if ( contextMenu && ! contextMenu.contains( event.target ) ) { closeContextMenu(); } } );
	onEditorDocuments( 'scroll', ( event ) => { if ( ! contextMenu?.contains( event.target ) ) { closeContextMenu(); } window.cancelAnimationFrame( selectionFrame ); selectionFrame = window.requestAnimationFrame( updateSelectionOutline ); }, true );
	window.addEventListener( 'resize', () => { closeContextMenu(); updateSelectionOutline(); } );
	[ 'transitionend', 'transitioncancel' ].forEach( type => canvas.addEventListener( type, event => {
		if ( event.target === canvas && event.propertyName === 'width' ) { updateSelectionOutline(); }
	} ) );
	// Resolve immediately when entering another row/child, not only on the
	// browser's next periodic dragover. Both events use the same destination.
	structure.parentElement.addEventListener( 'dragenter', handleTreeDragOver );
	structure.parentElement.addEventListener( 'dragover', handleTreeDragOver );
	structure.parentElement.addEventListener( 'drop', handleTreeDrop );
	onEditorDocuments( 'keydown', cancelTreeDrag );
	structure.parentElement.addEventListener( 'dragleave', ( event ) => {
		const bounds = structure.getBoundingClientRect();
		const viewport = structure.parentElement.getBoundingClientRect();
		if ( event.clientX < Math.max( bounds.left, viewport.left ) || event.clientX >= viewport.right || event.clientY < Math.max( bounds.top, viewport.top ) || event.clientY >= viewport.bottom ) { clearTreeDragMotion(); clearTreeDropPlaceholder(); }
	} );

	canvasDrag = window.LieveCanvasDrag?.create( {
		canvas, app, viewport, read: () => state.document.children, nestable: canNest,
		label: id => { const node = findNode( state.document.children, id ); return node?.props.editorLabel || labels[ node?.type ] || 'Element'; },
		icon: id => elementIcon( findNode( state.document.children, id )?.type || 'div' ),
		dragging: () => state.draggingId,
		begin: id => { clearDropIndicators(); state.draggingId = id; closeContextMenu(); hideEditorTooltip(); },
		canonical: ( parentId, beforeId ) => treeDropDestination( parentId, beforeId ),
		valid: treeDropChangesPosition, move: moveTreeElement,
		finish: () => {
			state.draggingId = null; clearTreeDragMotion(); clearTreeDragPreview(); clearDropIndicators();
			structure.classList.remove( 'is-dragging' );
			structure.querySelectorAll( '.lieve-tree-branch.is-dragging' ).forEach( branch => branch.classList.remove( 'is-dragging' ) );
		},
	} );
	viewport?.onZoomChange( () => canvasDrag?.invalidate() );

	const recovery = window.LieveRecovery?.create( { app, config, read: snapshot, dirty: () => state.dirty, saving: () => state.saving, notify: showToast, restore: value => commit( () => restoreSnapshot( value ) ), onLayout: () => { viewport?.refresh(); updateSelectionOutline(); window.LieveCodePreview?.refresh( canvas ); } } ) || null;
	saveButton.addEventListener( 'click', () => save() );
	templateActivation?.addEventListener( 'click', () => save( config.templateStatus === 'publish' ? 'draft' : 'publish' ) );
	undoButton.addEventListener( 'click', undo );
	redoButton.addEventListener( 'click', redo );
	templateOpenButton?.addEventListener( 'click', openTemplateLibrary );
	conditionsOpenButton?.addEventListener( 'click', openConditions );
	document.getElementById( 'lieve-popup-settings' )?.addEventListener( 'click', () => openPopupSettings() );
	editorTemplateType?.addEventListener( 'change', () => {
		commit( () => {
			state.templateType = editorTemplateType.value;
		} );
		conditionsBuilder?.setTemplateType( state.templateType );
	} );
	document.querySelectorAll( '[data-close-templates]' ).forEach( ( button ) => button.addEventListener( 'click', closeTemplateLibrary ) );

	if ( config.isTemplate && conditionsRoot && window.LieveConditions ) {
		conditionsBuilder = window.LieveConditions.create( {
			root: conditionsRoot,
			config: config.conditionConfig || {},
			templateType: state.templateType,
			conditions: state.templateConditions,
			popupOpening: state.popupOpening,
		} );
		conditionsModal.addEventListener( 'lieve:conditions-close', () => {
			conditionsBuilder.setConditions( state.templateConditions, false, state.templateType, state.popupOpening );
			conditionsOpenButton?.setAttribute( 'aria-expanded', 'false' );
		} );
		conditionsModal.querySelector( '[data-apply-conditions]' )?.addEventListener( 'click', applyConditions );
	}

	onEditorDocuments( 'keydown', ( event ) => {
		// One application dispatcher; native fields and local editors own their keys.
		if ( ! event.isTrusted || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || ! event.target?.isConnected || viewport?.readiness?.().destroyed ) { return; }
		if ( window.LieveViewport?.keyboardContext?.( event.target ) === false ) {
			// Refuse application commands AND their browser defaults (Backspace can
			// navigate away). Tab remains native so an inactive surface is not a trap.
			if ( [ 'Delete', 'Backspace', '/', 'ContextMenu' ].includes( event.key ) || event.shiftKey && event.key === 'F10' || ( event.metaKey || event.ctrlKey ) && [ 's', 'z', 'd' ].includes( event.key.toLowerCase() ) ) { event.preventDefault(); }
			return;
		}
		if ( ! app.contains( event.target ) && event.target !== document.body && event.target.ownerDocument !== canvas.ownerDocument ) { return; }
		if ( designSystem?.isOpen() || classWorkspace?.isOpen() ) {
			if ( ( event.metaKey || event.ctrlKey ) && event.key.toLowerCase() === 's' ) { event.preventDefault(); if ( classWorkspace?.isOpen() ) { classWorkspace.submit(); } else { designSystem.submit(); } }
			return;
		}
		if ( breakpointsModal?.hidden === false ) {
			if ( ( event.metaKey || event.ctrlKey ) && event.key.toLowerCase() === 's' ) { event.preventDefault(); workspaceTools?.submitBreakpoints(); }
			return;
		}
		if ( event.key === 'Escape' && contextMenu && ! contextMenu.hidden ) { event.preventDefault(); closeContextMenu( true ); return; }
		if ( event.key === '/' && ! event.metaKey && ! event.ctrlKey && ! [ 'INPUT', 'TEXTAREA', 'SELECT' ].includes( event.target.tagName ) && ! event.target.isContentEditable && ! app.querySelector( '.lieve-template-modal:not([hidden])' ) && conditionsModal?.hidden !== false && templateModal?.hidden !== false ) {
			event.preventDefault(); showWorkspacePanel( 'elements' );
			if ( window.matchMedia( '(max-width: 900px)' ).matches ) { closeDrawers(); app.dataset.drawer = 'elements'; document.querySelector( '[data-toggle-drawer="elements"]' )?.setAttribute( 'aria-expanded', 'true' ); }
			document.getElementById( 'lieve-element-search' )?.focus(); return;
		}
		if ( event.key === 'Escape' && conditionsModal && ! conditionsModal.hidden ) {
			closeConditions();
			return;
		}
		if ( event.key === 'Escape' && templateModal && ! templateModal.hidden ) {
			closeTemplateLibrary();
			return;
		}
		const command = event.metaKey || event.ctrlKey;
		const editing = [ 'INPUT', 'TEXTAREA', 'SELECT' ].includes( event.target.tagName ) || event.target.isContentEditable;
		const modalOpen = app.querySelector( '.lieve-template-modal:not([hidden])' );
		if ( ! editing && ! modalOpen && ( event.key === 'Delete' || event.key === 'Backspace' ) && state.selectedId ) { event.preventDefault(); deleteSelected(); return; }
		if ( command && event.key.toLowerCase() === 'd' && ! editing && ! modalOpen && state.selectedId ) { event.preventDefault(); duplicateSelected(); return; }
		if ( command && event.key.toLowerCase() === 's' ) {
			event.preventDefault();
			if ( conditionsModal && ! conditionsModal.hidden ) {
				if ( ! applyConditions() ) { return; }
			}
			save();
		}
		if ( command && event.key.toLowerCase() === 'z' ) {
			if ( editing || modalOpen ) { return; }
			event.preventDefault();
			if ( event.shiftKey ) {
				redo();
			} else {
				undo();
			}
		}
	} );

	window.addEventListener( 'beforeunload', ( event ) => {
		if ( ! state.dirty && ! classWorkspace?.isDirty() && ! classWorkspace?.isSaving() ) {
			return;
		}
		event.preventDefault();
		event.returnValue = '';
	} );

	if ( editorTemplateType ) { templateSelects = enhanceSelects( app.querySelector( '.lieve-template-settings' ) ); }
	headEditor = window.LieveHead.create( { root: document.getElementById( 'lieve-head-panel' ), config: config.headConfig, showIntro: false, renderReset: markupResetButton, read: () => state.headOverrides, change: next => { liveEdit = null; liveChange( 'head-overrides', () => { state.headOverrides = clone( next ); }, 'metadata' ); liveEdit = null; } } );
	pageMarkupEditor = window.LievePageMarkup.create( { root: document.getElementById( 'lieve-page-ids-controls' ), global: config.pageMarkupGlobal, template: config.isTemplate, embedded: true, renderReset: markupResetButton, read: () => state.pageMarkup, change: ( next, key, discrete ) => { if ( discrete ) { liveEdit = null; } liveChange( 'page-markup:' + key, () => { state.pageMarkup = clone( next ); }, 'metadata' ); if ( discrete ) { liveEdit = null; } } } );
	seoEditor = window.LieveSEO?.create( { root: document.getElementById( 'lieve-seo-panel' ), context: config.seoContext || {}, template: config.isTemplate, read: () => state.seo, enhance: enhanceSelects, change: ( next, key, discrete ) => { if ( activeClassId ) { activeClassId = null; classWorkspace?.breakGroup(); renderInspector(); renderCanvasStyles(); } if ( discrete ) { commit( () => { state.seo = clone( next ); }, true ); } else { liveChange( 'seo-' + key, () => { state.seo = clone( next ); }, 'metadata' ); } } } ) || null;
	motionEditor = window.LieveMotionEditor?.create( {
		app, canvas, read: () => state.document, device: () => styleDevice, breakpoints: () => config.breakpoints || [], elements: interactionElementChoices,
		selected: () => findNode( state.document.children, state.selectedId ),
		select: id => { activeClassId = null; classWorkspace?.breakGroup(); state.selectedId = id; inspectorTab = 'motion'; preserveInspectorScroll( () => renderAll() ); if ( window.innerWidth <= 900 ) { app.dataset.drawer = 'properties'; } },
		refresh: () => preserveInspectorScroll( () => renderInspector() ),
		refreshChoices: () => inspectorSelects.forEach( control => control.refresh() ),
		change: ( key, fn, discrete ) => { if ( discrete ) { liveEdit = null; } liveChange( key, fn, 'metadata' ); if ( discrete ) { liveEdit = null; } },
		structural: fn => preserveInspectorScroll( () => commit( fn ) ), enhance: root => enhanceSelects( root, true ), notice: showToast, layout: () => window.requestAnimationFrame( updateSelectionOutline )
	} ) || null;
	structureActions = window.LieveStructureActions?.create( { root: app.querySelector( '[data-structure-actions]' ), elements: config.elements || {}, read: () => state.document, flush: () => { richTextController?.flush(); codeFields?.flush(); treeRename?.finish( true ); }, canEdit: () => ! state.saving, paste: pasteAllContent, clear: clearAllContent, notice: showToast } ) || null;
	state.savedSnapshot = snapshot();
	seedElementPreviews();
	renderAll();
	canvasInitializing = false;
	if ( viewport ) { viewport.markContentReady(); }
	else { canvas.closest( '.lieve-stage-scroll' ).removeAttribute( 'data-viewport-pending' ); canvas.closest( '.lieve-stage-scroll' ).setAttribute( 'aria-busy', 'false' ); zoomSelect?.closest( '.lieve-editor-zoom-control' )?.removeAttribute( 'data-viewport-pending' ); window.LieveEditorStartup?.ready(); }
	}
	window.LieveBuilder = { initialize };
	if ( document.getElementById( 'lieve-builder-app' ) ) { initialize(); }
	else { document.addEventListener( 'DOMContentLoaded', initialize, { once: true } ); }
}() );
