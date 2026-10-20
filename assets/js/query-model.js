/* Pure query-library operations, shared by the admin and regression tests. */
(function(root){
	'use strict';
	const clone=value=>JSON.parse(JSON.stringify(value));
	const id=()=> 'q_'+(root.crypto?.randomUUID?.()||Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));
	const unique=(value,items)=>{value=value.slice(0,70);let key=value,index=2;while(items.some(item=>item.slug===key)){key=value+'-'+index++;}return key;};
	const normalize=query=>({...clone(query),core:clone(query.core||[]),coreRelation:query.coreRelation||'AND'});
	function create(defaults,items){return {...normalize(defaults),id:id(),name:'New query',slug:unique('query',items)};}
	function duplicate(query,items){const copy=clone(query);copy.id=id();copy.name=(query.name+' copy').slice(0,160);copy.slug=unique(query.slug+'-copy',items);copy.trashed=false;return copy;}
	function merge(current,incoming){const result=clone(current);for(const item of incoming.queries){const copy=normalize(item);copy.id=id();copy.slug=unique(copy.slug,result.queries);result.queries.push(copy);}return result;}
	function keyFromName(name,items){return unique(name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/^[^a-z]+/,'')||'query',items);}
	const operators=type=>type==='text'?['=','!=','LIKE','NOT LIKE','IN','NOT IN']:['=','!=','>','>=','<','<=','IN','NOT IN','BETWEEN','NOT BETWEEN'];
	function fieldChoices(q,config){
		const choices={'':'Choose a field to add…'};
		for(const [key,field] of Object.entries(config.coreFields?.[q.type]||{}))choices['core:'+key]='WordPress · '+field.label+' ('+key+')';
		for(const [key,label] of Object.entries(config.metaFields?.[q.type]||{}))choices['meta:'+key]='Custom field · '+(label===key?key:label+' ('+key+')');
		choices.__custom__='Custom meta key…';return choices;
	}
	function addField(q,selection,config){
		if(typeof selection!=='string')return {error:'Choose an available field or Custom meta key.'};
		const manual=selection==='__custom__',kind=manual?'meta':selection.split(':')[0],key=manual?'':selection.slice(kind.length+1);
		if(!['core','meta'].includes(kind)||!manual&&!Object.hasOwn(fieldChoices(q,config),selection))return {error:'Choose an available field or Custom meta key.'};
		if(q[kind].length>=20)return {error:'The limit is 20 rules per field group.'};
		q[kind].push(kind==='core'?{field:key,compare:'=',value:''}:{key,compare:'=',value:'',type:'CHAR'});
		return {kind,index:q[kind].length-1,manual};
	}
	function nativeField(q,key,config){return Object.keys(config.coreFields?.[q.type]||{}).find(field=>field.toLowerCase()===key.trim().toLowerCase())||'';}
	function useNativeField(q,index,config){
		const row=q.meta[index],field=row&&nativeField(q,row.key,config),definition=config.coreFields?.[q.type]?.[field];
		if(!definition)return {error:'This key does not identify an available WordPress field.'};
		if(q.core.length>=20)return {error:'The WordPress field group already has 20 rules.'};
		if(!operators(definition.type).includes(row.compare))return {error:'Choose a value comparison before using this WordPress field. Existence checks apply to metadata only.'};
		q.core.push({field,compare:row.compare,value:row.value});q.meta.splice(index,1);return {kind:'core',index:q.core.length-1};
	}
	function validate(data,config){
		if(!data||data.version!==1||!Array.isArray(data.queries)||data.queries.length>200)return 'Use a version 1 Lieve library with up to 200 queries.';
		const ids=new Set(),slugs=new Set();
		for(const q of data.queries){
			if(!q||typeof q.name!=='string'||!q.name.trim()||q.name.length>160)return 'Every query needs a name (up to 160 characters).';
			if(typeof q.id!=='string'||!/^q_[a-zA-Z0-9_-]{6,70}$/.test(q.id)||ids.has(q.id)||typeof q.slug!=='string'||!/^[a-z][a-z0-9_-]{0,79}$/.test(q.slug)||slugs.has(q.slug))return 'Each query needs a unique ID and key. Keys start with a lowercase letter and use letters, numbers, hyphens or underscores.';
			ids.add(q.id);slugs.add(q.slug);
			if(!Object.hasOwn(config.types,q.type))return 'Choose a supported query type.';
			for(const key of ['enabled','trashed','calculateTotal','cache','hideEmpty','excludeCurrent'])if(typeof q[key]!=='boolean')return 'Invalid query switch: '+key;
			for(const [key,min,max]of [['limit',1,100],['offset',0,10000],['ttl',10,86400]])if(!Number.isInteger(q[key])||q[key]<min||q[key]>max)return key+': enter a whole number from '+min+' to '+max+'.';
			if(!Array.isArray(q.postTypes)||!q.postTypes.length||q.postTypes.length>30||q.postTypes.some(type=>typeof type!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(type)))return 'Choose at least one valid post type.';
			for(const [key,max]of [['description',1000],['taxonomy',80],['role',80],['parent',240],['include',2000],['exclude',2000],['author',240],['search',240],['after',80],['before',80]])if(typeof q[key]!=='string'||q[key].length>max)return 'Invalid query text: '+key+'.';
			for(const key of ['parent','include','exclude','author']){const value=q[key].replace(/\{(?:current_post_id|current_author_id|current_user_id|queried_id)\}/g,'0').trim();if(value&&!/^\d+(?:[\s,]+\d+)*$/.test(value))return 'Use numeric IDs or supported numeric dynamic values for '+key+'.';}
			for(const key of ['after','before']){if(q[key]&&q[key]!=='{today}'&&(!/^\d{4}-\d{2}-\d{2}$/.test(q[key])||Number.isNaN(Date.parse(q[key]))||new Date(q[key]).toISOString().slice(0,10)!==q[key]))return 'Dates use YYYY-MM-DD or {today}.';}
			for(const key of ['meta','tax','sort'])if(!Array.isArray(q[key]))return 'Invalid '+key+' rules.';
			const core=q.core??[];if(!Array.isArray(core)||core.length>20||!['AND','OR'].includes(q.coreRelation??'AND'))return 'Use up to 20 WordPress field filters with an AND/OR relation.';
			for(const row of core){const field=config.coreFields?.[q.type]?.[row?.field];if(!field||!operators(field.type).includes(row.compare)||typeof row.value!=='string'||row.value.length>2000)return 'Complete every WordPress field filter.';const value=row.value.replace(/\{(?:current_post_id|current_author_id|current_user_id|queried_id)\}/g,'0').replaceAll('{today}','2000-01-01');const parts=['IN','NOT IN','BETWEEN','NOT BETWEEN'].includes(row.compare)?value.split(',').map(v=>v.trim()):[value];if(parts.length>200||(['BETWEEN','NOT BETWEEN'].includes(row.compare)&&parts.length!==2))return 'BETWEEN needs two values; field lists accept up to 200 values.';if(field.type==='number'&&parts.some(part=>! /^-?\d{1,15}$/.test(part.trim())))return 'Numeric field filters need whole numbers or numeric dynamic values.';if(field.type==='date'&&parts.some(part=>!/^\d{4}-\d{2}-\d{2}(?: ([01]\d|2[0-3]):[0-5]\d:[0-5]\d)?$/.test(part.trim())||Number.isNaN(Date.parse(part.trim().slice(0,10)))||new Date(part.trim().slice(0,10)).toISOString().slice(0,10)!==part.trim().slice(0,10)))return 'Date field filters need a valid date or {today}.';}
			if([...q.meta,...q.tax,...q.sort].some(row=>!row||typeof row!=='object'||Array.isArray(row)))return 'Invalid query rule.';
			if(q.meta.length>20||q.tax.length>20||!q.sort.length||q.sort.length>5)return 'Use up to 20 filters per group and one to five sorting rules.';
			if(q.type==='terms'&&q.sort.length>1)return 'Taxonomy queries support one sorting rule.';
			if(new Set(q.sort.map(s=>s.field)).size!==q.sort.length||q.sort.some(s=>!config.sort[q.type].includes(s.field)||!['ASC','DESC'].includes(s.direction)))return 'Choose valid, unique sorting rules.';
			if(q.meta.some(row=>typeof row.key!=='string'||!/^[a-zA-Z0-9_.-]{1,120}$/.test(row.key)||!['=','!=','>','>=','<','<=','LIKE','NOT LIKE','IN','NOT IN','BETWEEN','NOT BETWEEN','EXISTS','NOT EXISTS'].includes(row.compare)||!['CHAR','NUMERIC','DECIMAL','SIGNED','UNSIGNED','DATE','DATETIME','BINARY'].includes(row.type)||typeof row.value!=='string'||row.value.length>1000))return 'Complete every custom-field filter.';
			if(q.meta.some(row=>['BETWEEN','NOT BETWEEN'].includes(row.compare)&&row.value.split(',').length!==2))return 'BETWEEN needs two comma-separated values.';
			if(q.tax.some(row=>typeof row.taxonomy!=='string'||!row.taxonomy||!['IN','NOT IN','AND','EXISTS','NOT EXISTS'].includes(row.operator)||typeof row.terms!=='string'||(!['EXISTS','NOT EXISTS'].includes(row.operator)&&!row.terms.trim())))return 'Complete every taxonomy filter.';
			if(q.tax.some(row=>!['term_id','term_taxonomy_id','slug','name'].includes(row.field??'term_id')||('includeChildren'in row&&typeof row.includeChildren!=='boolean')))return 'Choose a valid taxonomy field and child-term switch.';
		}return '';
	}
	root.LieveQueryModel={clone,create,duplicate,merge,validate,normalize,keyFromName,operators,fieldChoices,addField,nativeField,useNativeField};
})(typeof window==='undefined'?globalThis:window);
