/* Linked models use the native template editor; instances store values and slot content only. */
( function () {
	'use strict';
	const clone = value => JSON.parse( JSON.stringify( value ) );
	function create( { config, read, change, render, notice, freshId, replace, icon = () => '', reset = null } ) {
		let items = Array.isArray( config.components ) ? config.components : [], pending = false, generation = 0, creatingId = null, creationAttempt = null, revision = 0;
		const escape = value => String( value ?? '' ).replace( /[&<>"']/g, char => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } )[char] );
		const walk = ( nodes, fn ) => { for ( const node of nodes ) { fn( node ); walk( node.children || [], fn ); } };
		const find = id => { let found; walk( read().children || [], node => { if ( node.id === id ) { found = node; } } ); return found; };
		const definition = id => items.find( item => Number( item.id ) === Number( id ) );
		const requestId = () => window.crypto?.randomUUID?.() || ( Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) );
		const button = ( action, text, extra = '' ) => '<button type="button" class="lieve-button-secondary" data-component-action="' + action + '"' + extra + '>' + text + '</button>';
		const propertyField = ( property, values ) => {
			const set = Object.hasOwn( values, property.id ), value = set ? values[property.id] : '', key = escape( property.id );
			const attrs = ' id="lieve-component-' + key + '" data-component-value="' + key + '" aria-label="' + escape( property.label ) + '"';
			let field;
			if ( property.type === 'checkbox' ) { field = '<label class="lieve-checkbox"><span>' + ( set ? 'Local override' : 'Inherited from model' ) + '</span><input type="checkbox" role="switch"' + attrs + ( ( set ? value : property.default ) ? ' checked' : '' ) + '></label>'; }
			else if ( property.type === 'select' ) { field = '<select' + attrs + '><option value="__lieve_inherit__"' + ( set ? '' : ' selected' ) + '>Inherit · ' + escape( property.options?.[property.default] ?? property.default ) + '</option>' + Object.entries( property.options || {} ).map( ( [key, label] ) => '<option value="' + escape( key ) + '"' + ( set && String( value ) === key ? ' selected' : '' ) + '>' + escape( label ) + '</option>' ).join( '' ) + '</select>'; }
			else if ( property.type === 'textarea' ) { field = '<textarea' + attrs + ' placeholder="' + escape( set ? '' : property.default ) + '">' + escape( value ) + '</textarea>'; }
			else { field = '<input' + attrs + ' type="' + ( [ 'number', 'url' ].includes( property.type ) ? property.type : 'text' ) + '"' + ( property.type === 'number' ? ' step="any"' : '' ) + ' value="' + escape( value ) + '" placeholder="' + escape( set ? '' : property.default ) + '">'; }
			const restore = reset ? reset( 'data-component-action="reset-value" data-component-property="' + key + '"', 'Reset ' + property.label + ' to model', !set ) : button( 'reset-value', 'Reset to model', ' data-component-property="' + key + '"' + ( set ? '' : ' disabled' ) );
			return '<div class="lieve-control"><div class="lieve-field-heading"><label for="lieve-component-' + key + '">' + escape( property.label ) + '</label>' + restore + '</div>' + field + '</div>';
		};
		function bindings() {
			const out = [];
			walk( read().children || [], node => {
				if ( [ 'html', 'code', 'shortcode', 'template', 'component', 'slot', 'form' ].includes( node.type ) ) { return; }
				for ( const [key, field] of Object.entries( config.elements?.[node.type]?.fields || {} ) ) {
					if ( ! [ 'text', 'textarea', 'url', 'number', 'checkbox', 'select' ].includes( field.type ) || [ 'items', 'shortcode', 'recipient', 'redirectUrl' ].includes( key ) ) { continue; }
					out.push( { value: node.id + ':' + key, label: ( node.props.editorLabel || config.elements[node.type].label ) + ' · ' + field.label } );
				}
			} ); return out;
		}
		function bindingRow( row, index, choices ) {
			const value = row.nodeId + ':' + row.field, prefix = 'lieve-component-binding-' + index;
			const missing = choices.some(item=>item.value===value) ? '' : '<option value="'+escape(value)+'" selected>Unavailable field · choose another</option>';
			const options = missing + choices.map(item=>'<option value="'+escape(item.value)+'"'+(item.value===value?' selected':'')+'>'+escape(item.label)+'</option>').join('');
			return '<div class="lieve-repeater-item"><div class="lieve-repeater-fields"><div class="lieve-control"><label for="'+prefix+'-name">Property name</label><input id="'+prefix+'-name" type="text" data-component-label="'+index+'" value="'+escape(row.label)+'" maxlength="120"></div><div class="lieve-control"><label for="'+prefix+'-source">Connected field</label><select id="'+prefix+'-source" data-component-binding="'+index+'">'+options+'</select></div><div class="lieve-repeater-actions"><button type="button" class="lieve-button-secondary" data-component-action="remove-property" data-component-index="'+index+'" aria-label="Remove property '+escape(row.label)+'">'+icon('delete')+'</button></div></div></div>';
		}
		function markup( node, group ) {
			if ( config.componentMode && read().children[0]?.id === node.id ) {
				const choices = bindings(), rows = node.props.componentProperties || [];
				const body = '<p class="lieve-element-help">You are editing the shared model. Saving updates every linked instance. Expose only the content fields that may differ between instances; use named Slot elements for local layouts.</p><div class="lieve-repeater">' + rows.map((row,index)=>bindingRow(row,index,choices)).join('') + button( 'add-property', icon('add') + 'Expose a property', choices.length && rows.length < 50 ? '' : ' disabled' ) + '</div>' + ( choices.length ? '' : '<p class="lieve-element-help">Add a heading, image or another content element to expose its fields.</p>' );
				return group( 'Component model', body );
			}
			if ( node.type === 'component' ) {
				const model = definition( node.props.componentId ), values = node.props.componentValues || {};
				const select = '<div class="lieve-control"><label for="lieve-component-model">Component model</label><select id="lieve-component-model" data-component-select><option value="">Choose a component</option>' + items.filter( item => Number( item.id ) !== Number( config.postId ) ).map( item => '<option value="' + item.id + '"' + ( Number( item.id ) === Number( node.props.componentId ) ? ' selected' : '' ) + '>' + escape( item.title ) + '</option>' ).join('') + '</select></div>';
				const edit = model?.editUrl ? '<a class="lieve-button-secondary" href="' + escape( model.editUrl ) + '" target="_blank" rel="noopener noreferrer">Edit shared model</a>' : '';
				const missing = (model?.slots||[]).filter(slot=>!node.children.some(child=>(child.props.slotKey||child.id)===slot.key));
				const unused = model && (Object.keys(values).some(key=>!model.properties.some(property=>property.id===key)) || node.children.some(child=>!model.slots.some(slot=>slot.key===(child.props.slotKey||child.id))));
				return group( 'Linked component', select + '<p class="lieve-element-help">Model changes apply to all linked instances. Local values override only exposed properties. Add local elements inside the named Slots in Structure.</p>' + edit + (missing.length ? button('sync-slots','Add new model Slots to Structure') : '') + (unused ? '<p class="lieve-element-help">This model no longer uses some local properties or Slots. Their values/content are retained until you remove them.</p>'+button('clean-unused','Remove unused overrides') : '') + ( model?.properties || [] ).map( property => propertyField( property, values ) ).join('') + ( model ? '' : '<p class="lieve-element-help">The model is unavailable or inactive. Your instance values and slot content are retained.</p>' ) );
			}
			if ( ! config.componentMode && config.canCreateComponents && creatingId === node.id ) { return group( 'Reusable component', '<p class="lieve-element-help">Turn this element and its children into a centrally edited model. Your page keeps a linked instance.</p><div class="lieve-control"><label for="lieve-component-new-name">Component name</label><input id="lieve-component-new-name" type="text" data-component-name placeholder="e.g. Product card" maxlength="160" autocomplete="off"></div>' + button( 'create', 'Create linked component', ' disabled' ) + button('cancel-create','Cancel') ); }
			return '';
		}
		function instance( model, id = freshId(), source = null ) {
			const props = { componentId: Number(model.id), componentValues: {} };
			// Only the converted original keeps its public root identity. New insertions remain independent.
			for ( const key of ['htmlId','dataLieveId','outputHtmlId','outputLieveId','editorLabel'] ) { if (source?.props && Object.hasOwn(source.props,key)) { props[key]=source.props[key]; } }
			return {id,type:'component',props,children:(model.slots||[]).map(slot=>({id:freshId(),type:'slot',props:{slotKey:slot.key,label:slot.label},children:[]}))};
		}
		async function refresh( force = false ) {
			if ( ! config.componentsUrl || pending ) { return; } const ticket = ++generation;
			try { const response = await ( window.LieveTransport?.fetch || window.fetch.bind(window) )( config.componentsUrl, { credentials:'same-origin', headers:{'X-WP-Nonce':config.nonce}, cache:'no-store' } ); const result = await response.json(); if ( ! response.ok || ! Array.isArray( result.items ) || ticket !== generation ) { return; } const changed = JSON.stringify(items) !== JSON.stringify(result.items); items = result.items; config.components = items; if(changed)revision++; if ( changed || force ) { render(); } } catch ( error ) { /* A library read cannot discard an authored instance draft. */ }
		}
		function bind( root, node ) {
			root.querySelector('[data-component-name]')?.addEventListener('input', event => { root.querySelector('[data-component-action="create"]').disabled = pending || !event.target.value.trim(); });
			root.querySelector('[data-component-select]')?.addEventListener('change', event => { const model=definition(event.target.value); if(!model)return; if ( Number(node.props.componentId) === Number(model.id) ) return; if ( ( Object.keys(node.props.componentValues||{}).length || node.children.some(slot=>slot.children.length||slot.props.slotOverride) ) && ! window.confirm('Change this model and discard its local properties and slot content? Undo restores this instance.') ) { event.target.value=String(node.props.componentId); render(); return; } change(()=>{const next=instance(model,node.id);next.props={...clone(node.props),componentId:next.props.componentId,componentValues:{}};replace(node.id,next);}); render(); });
			root.querySelectorAll('[data-component-value]').forEach(field => { const update=()=>{const next=field.type==='checkbox'?field.checked:field.type==='number'&&field.value!==''?Number(field.value):field.value;const inherit=field.tagName==='SELECT'&&next==='__lieve_inherit__'||field.type==='number'&&next==='';change(()=>{const current=find(node.id);if(!current)return;current.props.componentValues||={};if(inherit)delete current.props.componentValues[field.dataset.componentValue];else current.props.componentValues[field.dataset.componentValue]=next;});field.placeholder='';const reset=root.querySelector('[data-component-property="'+field.dataset.componentValue+'"]');if(reset)reset.disabled=inherit;}; field.addEventListener('input',update);field.addEventListener('change',update);});
			root.querySelectorAll('[data-component-label]').forEach(field=>field.addEventListener('input',()=>change(()=>{find(node.id).props.componentProperties[Number(field.dataset.componentLabel)].label=field.value;})));
			root.querySelectorAll('[data-component-binding]').forEach(field=>field.addEventListener('change',()=>{const rows=find(node.id).props.componentProperties,index=Number(field.dataset.componentBinding);if(rows.some((row,i)=>i!==index&&row.nodeId+':'+row.field===field.value)){notice('This field is already exposed by another property.',true);render();return;}change(()=>{const [nodeId,key]=field.value.split(':');Object.assign(rows[index],{nodeId,field:key});});}));
			root.querySelectorAll('[data-component-action]').forEach(button=>button.addEventListener('click',async()=>{
				const action=button.dataset.componentAction;if(pending)return;
				if(action==='cancel-create'){creatingId=null;render();return;}
				if(action==='reset-value'){change(()=>delete find(node.id).props.componentValues[button.dataset.componentProperty]);render();return;}
				if(action==='sync-slots'){const model=definition(node.props.componentId);change(()=>{const current=find(node.id);for(const slot of model?.slots||[]){if(!current.children.some(child=>(child.props.slotKey||child.id)===slot.key))current.children.push({id:freshId(),type:'slot',props:{slotKey:slot.key,label:slot.label},children:[]});}});render();return;}
				if(action==='clean-unused'){const model=definition(node.props.componentId);if(!model||!window.confirm('Remove local values and Slot content no longer used by this model? Undo restores them.'))return;change(()=>{const current=find(node.id);current.props.componentValues=Object.fromEntries(Object.entries(current.props.componentValues||{}).filter(([key])=>model.properties.some(property=>property.id===key)));current.children=current.children.filter(child=>model.slots.some(slot=>slot.key===(child.props.slotKey||child.id)));});render();return;}
				if(action==='add-property'){const rows=find(node.id).props.componentProperties||[];const source=bindings().find(item=>!rows.some(row=>row.nodeId+':'+row.field===item.value));if(!source){notice('All available content fields are already exposed.');return;}const [nodeId,key]=source.value.split(':');change(()=>{(find(node.id).props.componentProperties||=[]).push({id:'cp_'+freshId(),label:source.label,nodeId,field:key});});render();return;}
				if(action==='remove-property'){change(()=>find(node.id).props.componentProperties.splice(Number(button.dataset.componentIndex),1));render();return;}
				if(action!=='create')return; const name=root.querySelector('[data-component-name]').value.trim();if(!name)return; const snapshot=JSON.stringify(find(node.id)); if(!creationAttempt||creationAttempt.snapshot!==snapshot||creationAttempt.name!==name)creationAttempt={snapshot,name,id:requestId()}; pending=true;button.disabled=true;button.setAttribute('aria-busy','true');
				try { const response=await(window.LieveTransport?.fetch||window.fetch.bind(window))(config.componentsUrl,{method:'POST',credentials:'same-origin',headers:{'X-WP-Nonce':config.nonce,'Content-Type':'application/json'},body:JSON.stringify({name,requestId:creationAttempt.id,document:{version:1,children:[JSON.parse(snapshot)]}})});const result=await response.json();if(!response.ok)throw Error(result.message||'Component could not be created. Your element is unchanged.');items=result.items;config.components=items;const model=definition(result.id);if(model&&JSON.stringify(find(node.id))===snapshot){change(()=>replace(node.id,instance(model,node.id,JSON.parse(snapshot))));creatingId=null;render();notice('Component created. Save this page to keep its linked instance.');}else{notice('Component created in Library. The element changed during creation and was not replaced.');} }
				catch(error){notice(error.message,true);}finally{pending=false;if(button.isConnected){button.disabled=false;button.removeAttribute('aria-busy');}}
			}));
		}
		return { markup, bind, refresh, instance, definition, beginCreate:id=>{creatingId=id;render();document.querySelector('[data-component-name]')?.focus({preventScroll:true});}, revision:()=>revision };
	}
	window.LieveComponents={create};
}() );
