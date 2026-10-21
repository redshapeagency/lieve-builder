/* Native query drafts, field-driven filters and bounded, inspectable live previews. */
(function(){
	'use strict';
	const root=document.getElementById('lieve-query-builder'),config=window.LieveQueriesConfig,model=window.LieveQueryModel;
	if(!root||!config||!model)return;
	const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
	const icon=name=>config.icons[name]||config.icons.query;
	function blockLibrary(error){
		let notice=root.querySelector('[data-library-error]');
		if(!notice){notice=document.createElement('div');notice.className='lieve-ds-guide';notice.setAttribute('data-library-error','');notice.setAttribute('role','alert');notice.innerHTML='<h3>Library unavailable</h3><p></p>';root.prepend(notice);}
		notice.querySelector('p').textContent=error.message;
		Array.from(root.children).forEach(child=>{if(child!==notice){child.hidden=true;child.inert=true;}});
	}
	if(config.storageError){blockLibrary(config.storageError);return;}
	let storageBlocked=false;
	const list=root.querySelector('[data-query-list]'),editor=root.querySelector('[data-query-editor]'),status=root.querySelector('[data-query-status]'),save=root.querySelector('[data-query-save]'),cancel=root.querySelector('[data-query-cancel]');
	const metaModes=new WeakMap(),editedKeys=new Set();
	let draft=model.clone(config.data),saved=model.clone(config.data),revision=config.revision,selected=null,tab='general',filterTab='core',saving=false,filter='all',search='',pickers=[];
	let preview=null,previewBusy=false,previewAbort=null,previewGeneration=0,previewTimer=0,previewStale=false,livePreview=false,previewView='records',contextPost=0,previewPage=1;
	const current=()=>draft.queries.find(q=>q.id===selected);
	const dirty=()=>JSON.stringify(draft)!==JSON.stringify(saved);
	const isNew=q=>!saved.queries.some(item=>item.id===q.id);
	const relations={AND:'All rules (AND)',OR:'Any rule (OR)'};
	const comparisonLabels={'=':'Equals','!=':'Does not equal','>':'Greater than','>=':'Greater than or equal','<':'Less than','<=':'Less than or equal',LIKE:'Contains','NOT LIKE':'Does not contain',IN:'Is one of','NOT IN':'Is not one of',BETWEEN:'Between','NOT BETWEEN':'Not between',EXISTS:'Exists','NOT EXISTS':'Does not exist'};
	function comparisons(keys){return Object.fromEntries(keys.map(key=>[key,comparisonLabels[key]||key]));}
	function message(text,error=false){status.textContent=text;status.classList.toggle('is-error',error);}
	function sync(){save.disabled=saving||!dirty();cancel.hidden=!dirty();if(!saving)message(dirty()?'Unsaved changes':'All changes saved');}
	function picker(select){select.dataset.dsSelectKind=select.hasAttribute('data-query-filter')?'query types':select.hasAttribute('data-query-field-add')||['key','field'].includes(select.dataset.qRow)?'fields':'options';const controller=window.LieveDesignSystem.createSelect(select,root,root);pickers.push(controller);return controller;}
	picker(root.querySelector('[data-query-filter]'));
	function renderList(){
		const items=draft.queries.filter(q=>(filter==='trash'?q.trashed:!q.trashed&&(filter==='all'||filter===q.type))&&(q.name+' '+q.slug+' '+q.description).toLowerCase().includes(search));
		list.innerHTML=items.length?items.map(q=>'<button type="button" class="lieve-query-item'+(q.id===selected?' is-active':'')+'" data-query-select="'+esc(q.id)+'" aria-pressed="'+(q.id===selected)+'">'+icon('query')+'<span><strong>'+esc(q.name||'Untitled query')+'</strong><small>'+esc(q.slug+' · '+config.types[q.type])+'</small></span><span class="lieve-query-state">'+(q.trashed?'Trash':isNew(q)?'Draft':q.enabled?'Active':'Inactive')+'</span></button>').join(''):'<div class="lieve-query-list-empty"><strong>'+(filter==='trash'?'Trash is empty':search?'No matching queries':filter==='all'&&!draft.queries.some(q=>!q.trashed)?'No saved queries yet':'No queries in this view')+'</strong><p>'+(search?'Try a different search.':filter==='trash'?'Removed definitions can be restored here.':filter==='all'&&!draft.queries.some(q=>!q.trashed)?'Create a query to define the content your website needs.':'Create a query or choose another query type.')+'</p></div>';
	}
	function input(label,key,options={}){
		const q=current();return '<label class="lieve-ds-field'+(options.full?' lieve-query-field-full':'')+'"><span>'+esc(label)+'</span><input id="lq-'+key+'" data-q-field="'+key+'" type="'+(options.type||'text')+'" value="'+esc(q[key])+'"'+(options.placeholder?' placeholder="'+esc(options.placeholder)+'"':'')+(options.min!==undefined?' min="'+options.min+'"':'')+(options.max!==undefined?' max="'+options.max+'"':'')+(options.type==='number'?' step="1"':'')+(key==='name'?' maxlength="160"':key==='slug'?' maxlength="80"':'')+' autocomplete="off">'+(options.help?'<small>'+esc(options.help)+'</small>':'')+'</label>';
	}
	function select(label,key,choices,value=current()[key],row='',full=false){
		return '<label class="lieve-ds-field'+(full?' lieve-query-field-full':'')+'"><span>'+esc(label)+'</span><select id="lq-'+key+row.replace(/[^a-z0-9]/g,'')+'" aria-label="'+esc(label)+'" data-q-'+(row?'row':'field')+'="'+key+'" '+row+'>'+Object.entries(choices).map(([id,name])=>'<option value="'+esc(id)+'"'+(String(id)===String(value)?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label>';
	}
	function switchButton(label,attribute,value){return '<button type="button" class="lieve-ds-toggle" role="switch" '+attribute+' aria-label="'+esc(label)+'" aria-checked="'+Boolean(value)+'"><span aria-hidden="true"></span></button>';}
	function toggle(label,key,help=''){return '<div class="lieve-query-switch-row"><div><strong>'+esc(label)+'</strong>'+(help?'<small>'+esc(help)+'</small>':'')+'</div>'+switchButton(label,'data-q-toggle="'+key+'"',current()[key])+'</div>';}
	const section=(title,body,help='')=>'<section class="lieve-query-section"><h3>'+esc(title)+'</h3>'+(help?'<p class="lieve-ds-help">'+esc(help)+'</p>':'')+body+'</section>';
	function disclosure(title,body,extraClass,open=false){
		// Use the same section shell and chevron as the Colors/Variables manager.
		const chevron='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
		return '<details class="lieve-ds-color-section lieve-query-disclosure '+extraClass+'"'+(open?' open':'')+'><summary><strong>'+esc(title)+'</strong><span>'+chevron+'</span></summary><div class="lieve-ds-color-section-body">'+body+'</div></details>';
	}
	function rowActions(kind,index){return '<div class="lieve-query-row-actions"><button type="button" class="lieve-ds-icon" data-q-clone="'+kind+'" data-index="'+index+'" aria-label="Duplicate '+kind+' rule '+(index+1)+'">'+icon('copy')+'</button><button type="button" class="lieve-ds-icon is-danger" data-q-remove="'+kind+'" data-index="'+index+'" aria-label="Remove '+kind+' rule '+(index+1)+'">'+icon('trash')+'</button></div>';}
	function manualMeta(row){return metaModes.has(row)?metaModes.get(row):Boolean(row.key&&!Object.hasOwn(config.metaFields[current().type]||{},row.key));}
	function setMetaMode(index,manual){
		metaModes.set(current().meta[index],manual);renderEditor();
		queueMicrotask(()=>{const field=editor.querySelector((manual?'input':'select')+'[data-kind="meta"][data-index="'+index+'"][data-q-row="key"]');(manual?field:field?.nextElementSibling)?.focus({preventScroll:true});});
	}
	function copyMetaModes(source,copy){source.meta.forEach((row,index)=>{if(metaModes.has(row)&&copy.meta[index])metaModes.set(copy.meta[index],metaModes.get(row));});}
	function metaGuidance(row,index){
		const q=current(),field=model.nativeField(q,row.key,config);if(!field)return '';
		const definition=config.coreFields[q.type][field],canMove=model.operators(definition.type).includes(row.compare);
		return '<div class="lieve-query-field-guidance"><p><strong>'+esc(field)+' is a WordPress field.</strong> This rule searches metadata named <code>'+esc(row.key)+'</code>, not the native field. '+(canMove?'Moving it keeps the comparison and value; WordPress and custom-field groups are combined with AND.':'Choose a value comparison to use the native field; existence checks apply to metadata only.')+'</p>'+(canMove?'<button type="button" class="lieve-conditions-cancel" data-query-use-native="'+index+'">Use '+esc(definition.label)+'</button>':'')+'</div>';
	}
	function focusRule(kind,index,key='value'){
		queueMicrotask(()=>{const field=editor.querySelector('[data-kind="'+kind+'"][data-index="'+index+'"][data-q-row="'+key+'"]');(field?.matches('select')?field.nextElementSibling:field)?.focus({preventScroll:true});});
	}
	function rows(kind,allowAdd=true){
		const q=current(),rules=q[kind]||[];
		return '<div class="lieve-query-rules">'+rules.map((row,index)=>{
			const attrs='data-kind="'+kind+'" data-index="'+index+'"';
			const text=(label,key,placeholder,full=false)=>'<label class="lieve-ds-field'+(full?' lieve-query-field-full':'')+'"><span>'+esc(label)+'</span><input data-q-row="'+key+'" '+attrs+' value="'+esc(row[key])+'" placeholder="'+esc(placeholder)+'" autocomplete="off"></label>';
			let fields='',mode='';
			if(kind==='sort'){
				fields=select('Order by','field',Object.fromEntries(config.sort[q.type].map(key=>[key,key.replaceAll('_',' ')])),row.field,attrs)+select('Direction','direction',{DESC:'Descending',ASC:'Ascending'},row.direction,attrs);
			}else if(kind==='core'){
				const choices=config.coreFields[q.type],type=choices[row.field]?.type||'text';
				fields=select('Field','field',Object.fromEntries(Object.entries(choices).map(([key,field])=>[key,field.label+' · '+key])),row.field,attrs,true)+select('Comparison','compare',comparisons(model.operators(type)),row.compare,attrs)+text('Value','value',type==='number'?'e.g. 10, 25 or {current_post_id}':type==='date'?'YYYY-MM-DD or {today}':'Text or comma-separated values');
			}else if(kind==='tax'){
				fields=select('Taxonomy','taxonomy',config.taxonomies,row.taxonomy,attrs)+select('Match by','field',{term_id:'Term ID',slug:'Slug',name:'Name',term_taxonomy_id:'Term taxonomy ID'},row.field||'term_id',attrs)+select('Comparison','operator',{IN:'Includes any', 'NOT IN':'Excludes all',AND:'Includes all',EXISTS:'Has any term','NOT EXISTS':'Has no terms'},row.operator,attrs);
				if(!['EXISTS','NOT EXISTS'].includes(row.operator))fields+=text('Terms','terms',['slug','name'].includes(row.field)?'e.g. news, featured':'e.g. 12, 24 or {queried_id}');
				fields+='<div class="lieve-query-inline-switch lieve-query-field-full"><span>Include child terms</span>'+switchButton('Include child terms in rule '+(index+1),'data-q-row-toggle="includeChildren" '+attrs,row.includeChildren!==false)+'</div>';
			}else{
				const choices=config.metaFields[q.type]||{},manual=manualMeta(row),retained=row.key&&!Object.hasOwn(choices,row.key)?{[row.key]:'Current key · '+row.key}:{};
				mode='<label class="lieve-query-inline-switch"><span>Manual key</span>'+switchButton('Manual key for rule '+(index+1),'data-q-meta-mode="'+index+'"',manual)+'</label>';
				fields=manual?text('Meta key','key','e.g. featured or _price',true):select('Meta key','key',{'':'Choose a meta key…',...choices,...retained,__custom__:'Enter a custom meta key…'},row.key,attrs,true);
				fields+='<div class="lieve-query-field-full" data-q-meta-guidance="'+index+'"'+(!model.nativeField(q,row.key,config)?' hidden':'')+'>'+metaGuidance(row,index)+'</div>';
				fields+=select('Comparison','compare',comparisons(['=','!=','>','>=','<','<=','LIKE','NOT LIKE','IN','NOT IN','BETWEEN','NOT BETWEEN','EXISTS','NOT EXISTS']),row.compare,attrs)+select('Value type','type',{CHAR:'Text',NUMERIC:'Number',DECIMAL:'Decimal',SIGNED:'Signed integer',UNSIGNED:'Unsigned integer',DATE:'Date',DATETIME:'Date & time',BINARY:'Binary / case-sensitive'},row.type,attrs);
				if(!['EXISTS','NOT EXISTS'].includes(row.compare))fields+=text('Value','value','e.g. 1, 99 or {current_user_id}',true);
			}
			return '<div class="lieve-query-rule" data-rule="'+kind+'"><div class="lieve-query-rule-heading"><strong>'+({core:'WordPress field',meta:'Custom field',tax:'Taxonomy filter',sort:'Sorting rule'}[kind])+'</strong><div class="lieve-query-rule-tools">'+mode+rowActions(kind,index)+'</div></div><div class="lieve-query-rule-fields">'+fields+'</div></div>';
		}).join('')+'</div>'+(allowAdd?'<button type="button" class="lieve-conditions-cancel" data-q-add="'+kind+'"'+(rules.length>=(kind==='sort'?(q.type==='terms'?1:5):20)?' disabled':'')+'>'+icon('plus')+'Add '+(kind==='core'?'field filter':kind==='meta'?'custom-field filter':kind==='tax'?'taxonomy filter':'sorting rule')+'</button>':'');
	}
	function general(){
		const q=current();let source='';
		if(q.type==='posts'){
			source=section('Content types','<div class="lieve-query-post-types">'+Object.entries(config.postTypes).map(([key,label])=>'<div class="lieve-query-content-type"><span>'+esc(label)+'</span>'+switchButton(label,'data-q-post-type="'+esc(key)+'"',q.postTypes.includes(key))+'</div>').join('')+'</div>','Choose one or more public post types.');
		}
		if(q.type==='terms')source=section('Taxonomy',select('Taxonomy','taxonomy',config.taxonomies)+toggle('Hide empty terms','hideEmpty')+input('Parent term ID','parent',{placeholder:'Any parent · 0 for root terms'}));
		if(q.type==='users')source=section('Author scope',select('Role','role',config.roles),'Only users with published content are queried. Login names, passwords and email addresses are not exposed.');
		if(q.type==='comments')source=section('Comment scope','<p>Approved comments on public, non-password-protected posts only. Private discussions, pending comments and spam are excluded.</p>');
		if(q.type==='current')source=section('Current query','<p>Filter the public objects in the current WordPress main query without replacing it. Choose a context page for the admin preview.</p>');
		return section('Query definition','<div class="lieve-query-fields">'+input('Name','name',{placeholder:'e.g. Latest articles'})+input('Query key','slug',{placeholder:'e.g. latest-articles',help:'Stable builder assignments are independent of this PHP key.'})+select('Query type','type',config.types,q.type,'',true)+'<label class="lieve-ds-field lieve-query-field-full"><span>Description</span><textarea data-q-field="description" rows="3" placeholder="What should this query return?">'+esc(q.description)+'</textarea></label></div>')+source+section('Results','<div class="lieve-query-fields">'+input('Items per page','limit',{type:'number',min:1,max:100})+input('Initial offset','offset',{type:'number',min:0,max:10000})+'</div>')+section('Sorting',rows('sort'),'Apply rules in order. Custom-field sorting uses the first custom-field filter.');
	}
	function filterTabs(){
		const q=current(),posts=['posts','current'].includes(q.type);
		const tabs={core:'Fields',...(posts?{tax:'Taxonomies',dates:'Dates & authors'}:{})};
		if(!Object.hasOwn(tabs,filterTab))filterTab='core';
		return '<div class="lieve-query-filter-tabs" style="--query-filter-count:'+Object.keys(tabs).length+'" role="group" aria-label="Filter categories">'+Object.entries(tabs).map(([key,label])=>{const count=key==='core'?q.core.length+q.meta.length:(q[key]||[]).length;return '<button type="button" class="'+(filterTab===key?'lieve-conditions-save':'lieve-conditions-cancel')+'" data-query-filter-tab="'+key+'" aria-pressed="'+(filterTab===key)+'">'+label+(count?' <span class="lieve-query-rule-count">'+count+'</span>':'')+'</button>';}).join('')+'</div>';
	}
	function fieldFilters(){
		const q=current(),sources=['posts','current'].includes(q.type)?(q.type==='current'?'Current WordPress query':q.postTypes.map(key=>config.postTypes[key]||key).join(', ')):config.types[q.type];
		let body='<div class="lieve-query-source-note"><span><strong>Source:</strong> '+esc(sources)+'. Public content only.</span><button type="button" class="lieve-conditions-cancel" data-query-source>Edit source</button></div>';
		body+='<label class="lieve-ds-field lieve-query-field-catalog"><span>Add a field filter</span><select id="lq-field-catalog" aria-label="Add a field filter" data-query-field-add>'+Object.entries(model.fieldChoices(q,config)).map(([key,label])=>'<option value="'+esc(key)+'">'+esc(label)+'</option>').join('')+'</select><small>WordPress fields and custom fields are listed together with their source. Choose Custom meta key to enter one manually.</small></label>';
		for(const kind of ['core','meta']){
			if(!q[kind].length)continue;
			const native=kind==='core',label=native?'WordPress fields':'Custom fields',addLabel=native?'Add field filter':'Add custom-field filter';
			body+='<section class="lieve-query-field-group" aria-label="'+label+'"><div class="lieve-query-field-group-heading"><div><h4>'+label+'</h4><p>'+(native?'Native WordPress properties, separate from metadata.':'Metadata values stored under a meta key, not native WordPress properties.')+'</p></div><div class="lieve-query-field-group-controls">'+select(native?'Match WordPress rules':'Match custom-field rules',kind+'Relation',relations)+'<button type="button" class="lieve-ds-icon" data-q-add="'+kind+'" aria-label="'+addLabel+'"'+(q[kind].length>=20?' disabled':'')+'>'+icon('plus')+'</button></div></div>'+rows(kind,false)+'</section>';
		}
		if(!q.core.length&&!q.meta.length)body+='<p class="lieve-query-filter-empty">No field filters yet. Choose a field above; without filters, all matching source records are returned.</p>';
		body+=disclosure('Additional constraints','<div class="lieve-query-fields">'+input('Include IDs','include',{placeholder:'12, 24 or {current_post_id}'})+input('Exclude IDs','exclude',{placeholder:'7, 18 or {current_post_id}'})+input('Search','search',{placeholder:'Text or {search}',full:true})+'</div>','lieve-query-extra-filters',Boolean(q.include||q.exclude||q.search));
		return section('Field filters',body,'Each group matches its own rules. WordPress fields, custom fields, taxonomy rules and additional constraints narrow one another (AND).');
	}
	function filters(){
		const q=current();let html=filterTabs();
		if(filterTab==='core')html+=fieldFilters();
		if(filterTab==='tax')html+=section('Taxonomy filters',select('Match taxonomy rules','taxRelation',relations)+rows('tax'),'Match terms by ID, slug or name, and choose whether to include child terms.');
		if(filterTab==='dates')html+=section('Dates & authors','<div class="lieve-query-fields">'+input('Published after','after',{placeholder:'YYYY-MM-DD or {today}'})+input('Published before','before',{placeholder:'YYYY-MM-DD or {today}'})+input('Author IDs','author',{placeholder:'Any author or {current_author_id}',full:true})+'</div>'+toggle('Exclude the current page','excludeCurrent'),'For modified dates, date ranges or comment counts, add WordPress field filters.');
		return html+disclosure('Available dynamic values','<dl class="lieve-query-dynamic">'+Object.entries({'{current_post_id}':'Context page ID','{current_author_id}':'Context page author','{current_user_id}':'Current user (0 for visitors)','{queried_id}':'Queried object ID','{search}':'Search text','{today}':'Current site date'}).map(([token,label])=>'<div><dt><code>'+token+'</code></dt><dd>'+label+'</dd></div>').join('')+'</dl><p class="lieve-ds-help">Values resolve when the query runs. Missing numeric context remains 0, never an omitted filter.</p>','lieve-query-token-help');
	}
	function performance(){
		const q=current();return section('Execution',toggle('Cache results','cache','Cache IDs, not HTML. Native object and metadata caches are primed in batches.')+input('Cache lifetime (seconds)','ttl',{type:'number',min:10,max:86400})+(q.type!=='comments'?toggle('Calculate result totals','calculateTotal','Enable for complete counts and numbered pagination. Leave off to avoid unnecessary COUNT queries.'):'<p>Comment totals are unavailable because visibility is checked after retrieval.</p>'))+section('Cache behavior','<p>'+(config.persistentCache?'A persistent object cache is active; cached results can survive across requests.':'No persistent object cache is active. Results are reused within a request; native WordPress query caches still apply.')+'</p><p>Keys include resolved filters, current user, locale and content revisions. No database transient rows are added.</p>')+section('Use in your theme','<p>Assign this query to a compatible element or call its stable ID from PHP.</p><pre><code>'+esc("$result = lieve_query_run( '"+q.id+"', array( 'postId' => get_the_ID() ) );\nif ( ! is_wp_error( $result ) ) {\n    foreach ( $result['items'] as $item ) {\n        // Native WordPress object for this source.\n    }\n}")+'</code></pre>');
	}
	function previewHtml(compact=false){
		return '<section class="lieve-query-preview'+(compact?' is-compact':'')+'" aria-label="Query results preview"><div class="lieve-query-preview-heading"><div><h3>Query results</h3><p>Actual draft data. Nothing is saved or published.</p></div></div><div class="lieve-query-preview-controls"><label class="lieve-ds-field"><span>Context page ID</span><input type="number" min="0" step="1" data-preview-context value="'+contextPost+'" placeholder="Optional page ID"></label><label class="lieve-ds-field"><span>Page</span><input type="number" min="1" max="10000" step="1" data-preview-page value="'+previewPage+'"></label><button type="button" class="lieve-conditions-save" data-query-preview>'+icon('play')+'Run Preview</button><button type="button" class="lieve-conditions-cancel" data-query-preview-fresh>Bypass Cache</button></div><div class="lieve-query-preview-output" data-query-preview-results aria-live="polite">'+previewResult()+'</div><p class="lieve-query-preview-privacy">Safe fields only: credentials and private/system metadata are omitted. Up to 30 public meta keys per record; strings are capped at 4,000 bytes.</p></section>';
	}
	function fieldRows(value,path='',depth=0){
		return Object.entries(value).map(([key,part])=>{
			const name=path?path+'.'+key:key;
			if(part&&typeof part==='object'&&depth<4&&Object.keys(part).length)return fieldRows(part,name,depth+1);
			const type=part===null?'null':Array.isArray(part)?'array':typeof part;
			return '<tr><th scope="row"><code>'+esc(name)+'</code></th><td><span class="lieve-query-field-type">'+esc(type)+'</span></td><td>'+esc(typeof part==='object'?JSON.stringify(part):String(part??'null'))+'</td></tr>';
		}).join('');
	}
	function emptyPreview(){return '<div class="lieve-query-preview-empty"><p class="lieve-query-preview-note">No records match. An existing ID must also match the selected source content types and every active filter group.</p><div><button type="button" class="lieve-conditions-cancel" data-query-source>Review source</button><button type="button" class="lieve-conditions-cancel" data-query-review-filters>Review filters</button></div></div>';}
	function previewResult(){
		const note=previewBusy?'Running query…':previewStale?(livePreview?'Changes pending · refreshing preview…':'Filters changed · run preview to refresh.') :'';
		if(!preview)return '<p class="lieve-query-preview-note" role="status">'+(note||'Run Preview to inspect returned records and every available field.')+'</p>';
		if(preview.error)return '<p class="lieve-query-error" role="alert">'+esc(preview.error)+'</p>';
		const records=preview.records||preview.items;
		const views='<div class="lieve-query-preview-views" role="group" aria-label="Preview format">'+['records','json'].map(view=>'<button type="button" class="'+(view===previewView?'lieve-conditions-save':'lieve-conditions-cancel')+'" data-preview-view="'+view+'" aria-pressed="'+(view===previewView)+'">'+(view==='json'?'JSON':'Records & fields')+'</button>').join('')+'</div>';
		const stats='<div class="lieve-query-preview-stats"><span>'+preview.items.length+' returned</span><span>'+(preview.total===null?'Totals off':preview.total+' total')+'</span><span>'+preview.durationMs+' ms</span><span>'+preview.dbQueries+' DB queries</span><span>Cache: '+esc(preview.cacheState||(preview.cacheHit?'Hit':'Miss'))+'</span></div>';
		if(previewView==='json')return (note?'<p class="lieve-query-preview-note">'+note+'</p>':'')+stats+views+'<pre class="lieve-query-json" tabindex="0" aria-label="Query result JSON"><code>'+esc(JSON.stringify(records,null,2))+'</code></pre>';
		return (note?'<p class="lieve-query-preview-note">'+note+'</p>':'')+stats+views+(preview.items.length?'<div class="lieve-query-records">'+preview.items.map((item,index)=>'<details class="lieve-query-record"><summary><span class="lieve-query-record-id">#'+item.id+'</span><span><strong>'+esc(item.title||'(Untitled)')+'</strong><small>'+esc(item.type)+'</small></span><span class="lieve-query-record-expand">Inspect fields</span></summary><div class="lieve-query-record-fields"><table><thead><tr><th scope="col">Field</th><th scope="col">Type</th><th scope="col">Value</th></tr></thead><tbody>'+fieldRows(records[index]||item)+'</tbody></table></div></details>').join('')+'</div>':emptyPreview());
	}
	function refreshPreview(){
		const target=editor.querySelector('[data-query-preview-results]');if(target)target.innerHTML=previewResult();
		editor.querySelectorAll('[data-query-preview],[data-query-preview-fresh]').forEach(button=>button.disabled=previewBusy||saving);
	}
	function clearEditorPickers(){pickers.splice(1).forEach(controller=>controller.destroy());}
	function renderEditor(){
		clearEditorPickers();const q=current();
		if(!q){const hasQueries=draft.queries.some(item=>!item.trashed);editor.innerHTML='<div class="lieve-query-empty">'+icon('query')+'<h2>'+(hasQueries?'Select a query':'Create your first query')+'</h2><p>'+(hasQueries?'Choose a saved query from the library to edit its filters and preview the results, or create a new one.':'Create a reusable query and check real results before connecting it to your pages.')+'</p><button type="button" class="lieve-conditions-save" data-query-create>'+(hasQueries?'Create Query':'Create Your First Query')+'</button></div>';return;}
		if(q.trashed){editor.innerHTML='<div class="lieve-query-empty">'+icon('trash')+'<h2>'+esc(q.name)+'</h2><p>This query is in Trash. Its definition and assignments are retained; restore and save to use it again.</p><button type="button" class="lieve-conditions-cancel" data-query-restore>'+icon('restore')+'Restore Query</button></div>';return;}
		const contents={general,filters,performance,preview:()=>previewHtml()};
		editor.innerHTML='<div class="lieve-query-editor-heading"><div><h2 data-q-title>'+esc(q.name||'Untitled query')+'</h2><div class="lieve-query-editor-meta"><code data-q-key>'+esc(q.slug)+'</code><span data-q-draft'+(!isNew(q)?' hidden':'')+'>Draft · save to make available</span></div></div><div class="lieve-query-editor-actions"><label class="lieve-ds-enabled"><span>Enabled</span>'+switchButton('Enable query','data-q-toggle="enabled"',q.enabled)+'</label><button type="button" class="lieve-ds-icon" data-query-duplicate aria-label="Duplicate query">'+icon('copy')+'</button><button type="button" class="lieve-ds-icon is-danger" data-query-trash aria-label="Move query to Trash">'+icon('trash')+'</button></div></div><div class="lieve-query-navigation"><nav class="lieve-query-tabs" role="tablist" aria-label="Query configuration">'+Object.entries({general:'General',filters:'Filters',performance:'Performance',preview:'Preview'}).map(([key,label])=>'<button type="button" role="tab" class="'+(tab===key?'lieve-conditions-save':'lieve-conditions-cancel')+'" id="lq-tab-'+key+'" data-query-tab="'+key+'" aria-selected="'+(tab===key)+'" aria-controls="lq-panel" tabindex="'+(tab===key?'0':'-1')+'">'+label+'</button>').join('')+'</nav><label class="lieve-query-live-control"><span>Live preview</span>'+switchButton('Live preview','data-ui-live-preview',livePreview)+'</label></div><div class="lieve-query-editor-body'+(livePreview&&tab!=='preview'?' has-preview':'')+'"><div id="lq-panel" class="lieve-query-panel" role="tabpanel" aria-labelledby="lq-tab-'+tab+'">'+contents[tab]()+'</div>'+(livePreview&&tab!=='preview'?previewHtml(true):'')+'</div>';
		editor.querySelectorAll('select').forEach(picker);refreshPreview();
	}
	function render(){renderList();renderEditor();sync();}
	function invalidatePreview(clear=true){
		clearTimeout(previewTimer);previewAbort?.abort();previewAbort=null;previewGeneration++;previewBusy=false;
		if(clear){preview=null;previewStale=false;}else previewStale=Boolean(preview);
	}
	function schedulePreview(immediate=false){
		clearTimeout(previewTimer);if(!livePreview||!current()||current().trashed)return;
		previewTimer=setTimeout(()=>{void runPreview(false);},immediate?0:500);
	}
	function changed(){
		invalidatePreview(false);renderList();sync();const q=current();
		if(q){editor.querySelector('[data-q-title]')?.replaceChildren(q.name||'Untitled query');editor.querySelector('[data-q-key]')?.replaceChildren(q.slug);}
		refreshPreview();schedulePreview();
	}
	function selectTab(next,focus=true){
		tab=next;renderEditor();
		if(focus)editor.querySelector('[data-query-tab="'+tab+'"]').focus({preventScroll:true});
		if(!preview||previewStale){if(livePreview)schedulePreview(true);else if(tab==='preview')void runPreview(false);}
	}
	function changeType(q,type){
		if(!(['posts','current'].includes(q.type)&&['posts','current'].includes(type)))q.core=[];
		q.type=type;q.sort=[{field:config.sort[type][0],direction:['posts','current','comments'].includes(type)?'DESC':'ASC'}];if(type==='comments')q.calculateTotal=false;
		filterTab='core';invalidatePreview();
	}
	root.addEventListener('input',event=>{
		const q=current(),field=event.target;if(!q||saving)return;
		if(field.matches('[data-preview-context],[data-preview-page]')){
			if(field.hasAttribute('data-preview-context'))contextPost=field.value===''?0:Number(field.value);else previewPage=field.value===''?1:Number(field.value);
			invalidatePreview(false);refreshPreview();schedulePreview();return;
		}
		if(field.matches('[data-q-field]')&&!field.matches('select')){
			const key=field.dataset.qField;q[key]=field.type==='number'?(field.value===''?null:Number(field.value)):field.value;
			if(key==='slug')editedKeys.add(q.id);
			if(key==='name'&&isNew(q)&&!editedKeys.has(q.id)){
				q.slug=model.keyFromName(q.name,draft.queries.filter(item=>item.id!==q.id));
				const keyInput=editor.querySelector('[data-q-field="slug"]');if(keyInput)keyInput.value=q.slug;
			}
			changed();
		}
		if(field.matches('input[data-q-row]')){
			const row=q[field.dataset.kind][Number(field.dataset.index)];row[field.dataset.qRow]=field.value;
			if(field.dataset.kind==='meta'&&field.dataset.qRow==='key'){const guidance=editor.querySelector('[data-q-meta-guidance="'+field.dataset.index+'"]');guidance.innerHTML=metaGuidance(row,Number(field.dataset.index));guidance.hidden=!guidance.innerHTML;}
			changed();
		}
	});
	root.addEventListener('change',event=>{
		const q=current(),field=event.target;if(!q||saving)return;
		if(field.matches('[data-query-field-add]')){
			if(!field.value)return;const added=model.addField(q,field.value,config);
			if(added.error){field.value='';pickers.forEach(controller=>controller.refresh());message(added.error,true);return;}
			if(added.manual)metaModes.set(q.meta[added.index],true);changed();renderEditor();focusRule(added.kind,added.index,added.manual?'key':'value');return;
		}
		if(field.matches('select[data-q-field]')){
			if(field.dataset.qField==='type'){changeType(q,field.value);changed();renderEditor();}else{q[field.dataset.qField]=field.value;changed();}
		}
		if(field.matches('select[data-q-row]')){
			const kind=field.dataset.kind,row=q[kind][Number(field.dataset.index)],key=field.dataset.qRow;
			if(kind==='meta'&&key==='key'&&field.value==='__custom__'){setMetaMode(Number(field.dataset.index),true);return;}
			row[key]=field.value;if(kind==='meta'&&key==='key')metaModes.set(row,false);
			if(kind==='core'&&key==='field'){row.compare='=';row.value='';}
			if(kind==='tax'&&key==='field')row.terms='';
			changed();if((kind==='meta'&&['key','compare'].includes(key))||(kind==='core'&&key==='field')||(kind==='tax'&&['field','operator'].includes(key))){
				const index=field.dataset.index,manual=kind==='meta'&&key==='key'&&manualMeta(row);renderEditor();
				queueMicrotask(()=>{const next=editor.querySelector((manual?'input':'select')+'[data-kind="'+kind+'"][data-index="'+index+'"][data-q-row="'+key+'"]');(manual?next:next?.nextElementSibling)?.focus({preventScroll:true});});
			}
		}
	});
	root.querySelector('[data-query-search]').addEventListener('input',event=>{search=event.target.value.trim().toLowerCase();renderList();});
	root.querySelector('[data-query-filter]').addEventListener('change',event=>{filter=event.target.value;renderList();});
	root.addEventListener('click',async event=>{
		const button=event.target.closest('button');if(!button||button.disabled||saving)return;const q=current();
		if(button.hasAttribute('data-query-create')){
			if(draft.queries.length>=200){message('The library limit is 200 queries, including Trash. Export a backup before reorganizing the library.',true);return;}
			const item=model.create(config.defaults,draft.queries);draft.queries.push(item);selected=item.id;tab='general';filter='all';filterTab='core';search='';
			root.querySelector('[data-query-search]').value='';root.querySelector('[data-query-filter]').value='all';pickers[0].refresh();invalidatePreview();render();
			const name=editor.querySelector('[data-q-field="name"]');name.focus({preventScroll:true});name.select();schedulePreview();
		}else if(button.hasAttribute('data-query-select')){selected=button.dataset.querySelect;invalidatePreview();render();editor.scrollTop=0;schedulePreview();}
		else if(button.hasAttribute('data-query-tab'))selectTab(button.dataset.queryTab);
		else if(button.hasAttribute('data-query-filter-tab')){filterTab=button.dataset.queryFilterTab;renderEditor();}
		else if(button.hasAttribute('data-query-source'))selectTab('general');
		else if(button.hasAttribute('data-query-review-filters'))selectTab('filters');
		else if(button.hasAttribute('data-query-use-native')&&q){
			const moved=model.useNativeField(q,Number(button.dataset.queryUseNative),config);if(moved.error){message(moved.error,true);return;}
			filterTab='core';changed();renderEditor();focusRule(moved.kind,moved.index);message('Moved to WordPress fields. Review the source content types in General if no records match.');
		}
		else if(button.hasAttribute('data-ui-live-preview')){
			const wasStale=previewStale;livePreview=!livePreview;invalidatePreview(false);previewStale=wasStale;renderEditor();if(livePreview)schedulePreview(true);
		}else if(button.hasAttribute('data-preview-view')){previewView=button.dataset.previewView;refreshPreview();}
		else if(button.hasAttribute('data-q-post-type')&&q){
			const key=button.dataset.qPostType,enabled=!q.postTypes.includes(key);
			if(!enabled&&q.postTypes.length===1){message('Keep at least one content type enabled.',true);return;}
			q.postTypes=enabled?[...q.postTypes,key]:q.postTypes.filter(type=>type!==key);button.setAttribute('aria-checked',String(enabled));changed();
		}else if(button.hasAttribute('data-q-meta-mode')&&q){setMetaMode(Number(button.dataset.qMetaMode),button.getAttribute('aria-checked')!=='true');}
		else if(button.hasAttribute('data-q-row-toggle')&&q){
			const row=q[button.dataset.kind][Number(button.dataset.index)],key=button.dataset.qRowToggle;row[key]=!(row[key]??true);button.setAttribute('aria-checked',String(row[key]));changed();
		}else if(button.hasAttribute('data-q-toggle')&&q){const key=button.dataset.qToggle;q[key]=!q[key];button.setAttribute('aria-checked',String(q[key]));changed();}
		else if(button.hasAttribute('data-query-duplicate')&&q){
			if(draft.queries.length>=200){message('The library limit is 200 queries, including Trash.',true);return;}
			const copy=model.duplicate(q,draft.queries);copyMetaModes(q,copy);draft.queries.splice(draft.queries.indexOf(q)+1,0,copy);selected=copy.id;invalidatePreview();render();schedulePreview();
		}else if(button.hasAttribute('data-query-trash')&&q){q.trashed=true;selected=null;invalidatePreview();changed();renderEditor();}
		else if(button.hasAttribute('data-query-restore')&&q){q.trashed=false;filter='all';root.querySelector('[data-query-filter]').value='all';pickers[0].refresh();changed();renderEditor();}
		else if(button.hasAttribute('data-q-add')&&q){
			const kind=button.dataset.qAdd;if((q[kind]||[]).length>=(kind==='sort'?(q.type==='terms'?1:5):20))return;
			q[kind].push(kind==='core'?{field:Object.keys(config.coreFields[q.type])[0],compare:'=',value:''}:kind==='meta'?{key:'',compare:'=',value:'',type:'CHAR'}:kind==='tax'?{taxonomy:Object.keys(config.taxonomies)[0]||'category',operator:'IN',field:'term_id',terms:'',includeChildren:true}:{field:config.sort[q.type].find(key=>!q.sort.some(row=>row.field===key))||config.sort[q.type][0],direction:'ASC'});
			changed();renderEditor();
		}else if(button.hasAttribute('data-q-remove')&&q){
			const kind=button.dataset.qRemove;if(kind==='sort'&&q.sort.length===1){message('Keep at least one sorting rule.',true);return;}
			q[kind].splice(Number(button.dataset.index),1);changed();renderEditor();
		}else if(button.hasAttribute('data-q-clone')&&q){
			const kind=button.dataset.qClone;if(q[kind].length>=(kind==='sort'?(q.type==='terms'?1:5):20)){message('The rule limit has been reached.',true);return;}
			const index=Number(button.dataset.index),source=q[kind][index],copy=model.clone(source);
			if(kind==='meta'&&metaModes.has(source))metaModes.set(copy,metaModes.get(source));
			q[kind].splice(index+1,0,copy);changed();renderEditor();
		}else if(button.hasAttribute('data-query-save'))await saveDraft();
		else if(button.hasAttribute('data-query-cancel')){draft=model.clone(saved);if(!current())selected=null;invalidatePreview();render();schedulePreview();}
		else if(button.hasAttribute('data-query-preview')||button.hasAttribute('data-query-preview-fresh'))await runPreview(button.hasAttribute('data-query-preview-fresh'));
		else if(button.hasAttribute('data-query-export')){
			const blob=new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='lieve-queries.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Query draft exported.');
		}else if(button.hasAttribute('data-query-import'))root.querySelector('[data-query-file]').click();
	});
	root.addEventListener('keydown',event=>{
		if(event.target.matches('[data-query-tab]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
			event.preventDefault();const tabs=['general','filters','performance','preview'],index=tabs.indexOf(tab);
			selectTab(event.key==='Home'?tabs[0]:event.key==='End'?tabs[3]:tabs[(index+(event.key==='ArrowRight'?1:3))%4]);
		}
	});
	async function request(path,payload,method='POST',controller=new AbortController()){
		const timeout=setTimeout(()=>controller.abort(),30000);
		try{
			const response=await ( window.LieveTransport?.fetch || fetch )( config.url+path,{method,signal:controller.signal,credentials:'same-origin',headers:{'Content-Type':'application/json','X-WP-Nonce':config.nonce},body:JSON.stringify(payload)});
			let data;try{data=await response.json();}catch(error){throw new Error('The server returned an unreadable response. Your draft is preserved.');}
			if(!response.ok){const detail=data.data?.params,error=new Error(detail?Object.values(detail).join(' '):(data.message||'The request failed. Your draft is preserved.'));error.code=data.code;throw error;}
			return data;
		}catch(error){if(error.name==='AbortError')throw new Error('The request was cancelled or timed out. Your draft is preserved.');throw error;}finally{clearTimeout(timeout);}
	}
	async function saveDraft(){
		if(storageBlocked)return;
		if(saving||!dirty())return;const error=model.validate(draft,config);if(error){message(error,true);return;}
		saving=true;const fields=[...root.querySelectorAll('button,input,textarea,select')].map(field=>[field,field.disabled]);fields.forEach(([field])=>field.disabled=true);message('Saving queries…');
		try{
			const result=await request('',{data:draft,revision},'PUT');
			if(model.validate(result.data,config)||typeof result.revision!=='string'||!/^[a-f0-9]{64}$/.test(result.revision))throw new Error('The save response could not be verified. Your draft is preserved.');
			const next=model.clone(result.data);next.queries.forEach(query=>{const previous=draft.queries.find(item=>item.id===query.id);if(previous)copyMetaModes(previous,query);});
			draft=next;saved=model.clone(result.data);revision=result.revision;editedKeys.clear();message('All changes saved');
		}catch(error){if(error.code==='lieve_library_unavailable'){storageBlocked=true;blockLibrary(error);}message(error.message,true);}finally{
			saving=false;fields.forEach(([field,disabled])=>field.disabled=disabled);pickers.forEach(controller=>controller.refresh());save.disabled=!dirty();cancel.hidden=!dirty();renderList();
			const marker=editor.querySelector('[data-q-draft]');if(marker&&current())marker.hidden=!isNew(current());
		}
	}
	async function runPreview(bypassCache=false){
		clearTimeout(previewTimer);const q=current();if(!q||previewBusy)return;
		const error=model.validate({version:1,queries:[q]},config);
		if(error){preview={error};previewStale=false;refreshPreview();return;}
		if(!Number.isInteger(contextPost)||contextPost<0||!Number.isInteger(previewPage)||previewPage<1||previewPage>10000){preview={error:'Use a positive page number and an optional non-negative context ID.'};refreshPreview();return;}
		const generation=++previewGeneration;previewAbort=new AbortController();previewBusy=true;refreshPreview();
		try{
			const result=await request('/preview',{query:model.clone(q),postId:contextPost,page:previewPage,bypassCache},'POST',previewAbort);
			if(!Array.isArray(result.items)||!Array.isArray(result.records)||result.items.length!==result.records.length)throw new Error('The preview response could not be verified.');
			if(generation===previewGeneration){preview=result;previewStale=false;}
		}catch(error){if(generation===previewGeneration){preview={error:error.message};previewStale=false;}}
		finally{if(generation===previewGeneration){previewAbort=null;previewBusy=false;refreshPreview();}}
	}
	root.querySelector('[data-query-file]').addEventListener('change',async event=>{
		const file=event.target.files?.[0];event.target.value='';if(!file)return;
		if(file.size>1048576){message('Import files must be at most 1 MB.',true);return;}
		try{
			const imported=JSON.parse(await file.text()),error=model.validate(imported,config);if(error)throw new Error(error);
			const merged=model.merge(draft,imported),invalid=model.validate(merged,config);if(invalid)throw new Error(invalid);
			draft=merged;filter='all';root.querySelector('[data-query-filter]').value='all';pickers[0].refresh();renderList();sync();message('Imported '+imported.queries.length+' queries into this draft. Save Queries to apply.');
		}catch(error){message(error.message||'Invalid query file. Your draft is unchanged.',true);}
	});
	document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void saveDraft();}});
	window.addEventListener('beforeunload',event=>{if(dirty()||saving){event.preventDefault();event.returnValue='';}});
	renderList();sync();
})();
