/* Shared preflight: keep unsupported/over-limit drafts editable, never truncate on Save. */
(function(){
	'use strict';
	window.LieveDocumentValidation={validate(document,elements){
		const ids=new Set();let count=0;const bytes=value=>new TextEncoder().encode(value).length;
		if(document.version!==undefined&&document.version!==1)return{message:'Unsupported document version. No content was changed.'};
		function walk(nodes,depth){for(const node of nodes){
			const error=message=>({node, message});
			if(++count>400||depth>12)return error('Use at most 400 elements and 13 nesting levels. Split larger layouts into reusable templates.');
			if(!/^[a-zA-Z0-9_-]{1,64}$/.test(node.id)||ids.has(node.id))return error('Every element needs a unique internal ID.');ids.add(node.id);
			const definition=elements[node.type];if(!definition)return error('This element is unavailable. Restore its extension before saving.');
			if((node.props.className||'').trim().split(/\s+/).filter(Boolean).length>100)return{...error('Use no more than 100 manual CSS classes.'),tab:'markup'};
			for(const [key,field]of Object.entries(definition.fields||{})){const value=node.props[key],limit=field.type==='textarea'?20000:['text','url'].includes(field.type)?2000:0;if(typeof value==='string'&&limit&&bytes(value)>limit)return error((field.label||key)+' exceeds its '+limit.toLocaleString('en-US')+'-byte limit. Shorten it; your draft has not been changed.');}
			const childError=walk(node.children||[],depth+1);if(childError)return childError;
		}return null;}
		return walk(document.children||[],0);
	}};
})();
