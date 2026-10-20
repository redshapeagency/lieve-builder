/* Data-only token model: shared by managers, canvas, pickers and isolated tests. */
( function () {
	'use strict';
	const clone = value => JSON.parse( JSON.stringify( value ) );
	const empty = () => ( { version: 1, categories: [], variables: [], palettes: [], colors: [], darkMode: 'auto' } );
	const validId = id => typeof id === 'string' && /^ds_[a-z0-9]{8,24}$/.test( id );
	const validName = name => typeof name === 'string' && /^[a-zA-Z_][a-zA-Z0-9_-]{0,79}$/.test( name );
	const validSuffix = name => typeof name === 'string' && /^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,59}$/.test( name );
	const functions = new Set( 'var calc min max clamp repeat minmax fit-content rgb rgba hsl hsla hwb lab lch oklab oklch color color-mix linear-gradient radial-gradient conic-gradient translate translatex translatey translatez translate3d rotate rotatex rotatey rotatez rotate3d scale scalex scaley scalez scale3d skew skewx skewy matrix matrix3d perspective blur brightness contrast drop-shadow grayscale hue-rotate invert opacity saturate sepia polygon circle ellipse inset cubic-bezier steps'.split( ' ' ) );
	function safeValue( value ) {
		return typeof value === 'string' && value.trim().length > 0 && value.length <= 1200 && ! /[;{}<>@\\\x00-\x1f]|\/\*|\*\//.test( value ) && Array.from( value.matchAll( /([a-zA-Z][a-zA-Z0-9-]*)\s*\(/g ) ).every( match => functions.has( match[ 1 ].toLowerCase() ) );
	}
	function normalize( raw ) {
		const data = clone( raw );
		for ( const category of [ ...data.categories, ...data.palettes ] ) { if ( category.iconColor === '' ) { delete category.iconColor; } else if ( typeof category.iconColor === 'string' ) { category.iconColor = category.iconColor.toLowerCase(); } }
		for ( const item of [ ...data.variables, ...data.colors ] ) { item.aliases ||= []; item.description ||= ''; if ( item.trashed === false || item.trashed === undefined ) { delete item.trashed; delete item.trashedAt; } if ( item.values && Array.isArray( item.values ) && ! item.values.length ) { item.values = {}; } for ( const variant of item.variants || [] ) { variant.aliases ||= []; variant.conditions ||= []; if ( variant.trashed === false || variant.trashed === undefined ) { delete variant.trashed; delete variant.trashedAt; } } }
		return data;
	}
	function validColor( value ) { return safeValue( value ) && ( window.CSS?.supports ? window.CSS.supports( 'color', value ) : /^(?:#[a-f\d]{3,8}|[a-z]+|(?:var|rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(.+\))$/i.test( value ) ); }
	const validIconColor = value => typeof value === 'string' && /^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test( value );
	const validTrash = item => ( item.trashed === undefined || typeof item.trashed === 'boolean' ) && ( item.trashedAt === undefined || Number.isInteger( item.trashedAt ) && item.trashedAt >= 0 && item.trashedAt <= 4102444800 );
	function validate( data ) {
		if ( ! data || data.version !== 1 || JSON.stringify( data ).length > 1500000 ) { return 'Invalid design system format (maximum 1.5 MB).'; }
		for ( const [ key, limit ] of Object.entries( { categories: 100, palettes: 100, variables: 1000, colors: 500 } ) ) { if ( ! Array.isArray( data[ key ] ) || data[ key ].length > limit ) { return 'Invalid or oversized ' + key + ' list.'; } }
		if ( ! [ 'auto', 'manual', 'off' ].includes( data.darkMode ) ) { return 'Choose a valid dark color mode.'; }
		const ids = new Set(); const names = new Set(); const groups = {};
		const claimId = id => { if ( ! validId( id ) || ids.has( id ) ) { return false; } ids.add( id ); return true; };
		const claimName = name => { if ( ! validName( name ) || names.has( name ) || names.size >= 3000 ) { return false; } names.add( name ); return true; };
		for ( const key of [ 'categories', 'palettes' ] ) {
			const labels = new Set(); groups[ key ] = new Set();
			for ( const item of data[ key ] ) {
				if ( ! item || ! claimId( item.id ) || typeof item.name !== 'string' || ! item.name.trim() || item.name.length > 100 || /[<>\x00-\x1f\x7f]/.test( item.name ) || labels.has( item.name.trim().toLowerCase() ) ) { return 'Categories and palettes need unique IDs and plain, unique names (1–100 characters).'; }
				if ( item.iconColor !== undefined && item.iconColor !== '' && ! validIconColor( item.iconColor ) ) { return 'Folder background colors must be six- or eight-digit hex colors, such as #8044e3 or #8044e380, or empty for Automatic.'; }
				labels.add( item.name.trim().toLowerCase() ); groups[ key ].add( item.id );
			}
		}
		const validConditions = conditions => Array.isArray( conditions ) && conditions.length <= 30 && conditions.every( row => row && [ 'include', 'exclude' ].includes( row.action ) && [ 'entire_site', 'front_page', 'post_type', 'archive', 'search', 'error_page', 'terms', 'individual' ].includes( row.type ) && ( row.values === undefined || Array.isArray( row.values ) ) );
		const validAliases = aliases => Array.isArray( aliases ) && aliases.length <= 20 && aliases.every( claimName );
		for ( const key of [ 'variables', 'colors' ] ) {
			for ( const item of data[ key ] ) {
				if ( ! item || ! claimId( item.id ) || ! claimName( item.name ) || typeof item.enabled !== 'boolean' ) { return 'Every token needs a unique CSS name (letters, digits, hyphens or underscores), a unique ID and an enabled flag.'; }
				if ( ! validTrash( item ) ) { return 'Invalid Trash metadata.'; }
				const groupId = item[ key === 'variables' ? 'categoryId' : 'paletteId' ];
				if ( typeof groupId !== 'string' || ( groupId && ! groups[ key === 'variables' ? 'categories' : 'palettes' ].has( groupId ) ) ) { return 'A token references a missing category or palette.'; }
				if ( ! validConditions( item.conditions ) || ! validAliases( item.aliases || [] ) ) { return 'Invalid conditions or conflicting previous CSS names.'; }
				if ( typeof ( item.description || '' ) !== 'string' || ( item.description || '' ).length > 1000 ) { return 'Descriptions are limited to 1000 characters.'; }
				if ( key === 'variables' ) {
					if ( ! safeValue( item.value ) || ! item.values || typeof item.values !== 'object' || ( Array.isArray( item.values ) && item.values.length ) || Object.keys( item.values ).length > 50 || ! Object.entries( item.values ).every( ( [ id, value ] ) => window.LieveResponsive.validId( id ) && safeValue( value ) ) ) { return 'Variables need a safe CSS value and valid responsive overrides.'; }
				} else {
					if ( ! validColor( item.light ) || ( item.dark !== '' && ! validColor( item.dark ) ) || ! Array.isArray( item.variants ) || item.variants.length > 50 ) { return 'Colors need a valid light color, an optional dark color and at most 50 variants.'; }
					for ( const variant of item.variants ) {
						if ( ! variant || ! validTrash( variant ) ) { return 'Invalid variant Trash metadata.'; }
						if ( ! variant || ! claimId( variant.id ) || ! validSuffix( variant.suffix ) || ! claimName( item.name + '-' + variant.suffix ) || ! [ 'custom', 'tint', 'shade', 'alpha' ].includes( variant.type ) || ! validConditions( variant.conditions || [] ) || ! validAliases( variant.aliases || [] ) || ! ( item.aliases || [] ).every( alias => claimName( alias + '-' + variant.suffix ) ) ) { return 'Variants need unique names, valid types, conditions and previous names.'; }
					if ( variant.type === 'custom' ? ! validColor( variant.light ) || ( variant.dark !== '' && ! validColor( variant.dark ) ) : typeof variant.amount !== 'number' || ! Number.isFinite( variant.amount ) || variant.amount < 0 || variant.amount > 100 ) { return 'Variants need valid custom colors or a percentage between 0 and 100.'; }
					}
				}
			}
		}
		return '';
	}
	/* Organization remains editable even while an unrelated token is unfinished. */
	function validateGroups( data ) {
		const check = empty(); check.categories = data.categories; check.palettes = data.palettes;
		const error = validate( check ); if ( error ) { return error; }
		const ids = new Set( [ ...check.categories, ...check.palettes ].map( group => group.id ) );
		if ( [ ...data.variables, ...data.colors, ...data.colors.flatMap( color => color.variants || [] ) ].some( token => ids.has( token.id ) ) ) { return 'Categories and palettes must have IDs distinct from their definitions.'; }
		return '';
	}
	function newId() { const bytes = new Uint8Array( 10 ); window.crypto.getRandomValues( bytes ); return 'ds_' + Array.from( bytes, n => n.toString( 16 ).padStart( 2, '0' ) ).join( '' ); }
	function names( data ) { return new Set( [ ...data.variables.flatMap( item => [ item.name, ...( item.aliases || [] ) ] ), ...data.colors.flatMap( item => [ item.name, ...( item.aliases || [] ), ...item.variants.flatMap( variant => [ item.name + '-' + variant.suffix, ...( variant.aliases || [] ), ...( item.aliases || [] ).map( alias => alias + '-' + variant.suffix ) ] ) ] ) ] ); }
	function uniqueName( data, requested, suffixes = [] ) {
		const used = names( data ); const available = name => validName( name ) && ! used.has( name ) && suffixes.every( suffix => ! used.has( name + '-' + suffix ) && validName( name + '-' + suffix ) );
		if ( available( requested ) ) { return requested; }
		for ( let i = 2; i < 4000; i++ ) { const candidate = requested.slice( 0, 68 ) + '-' + i; if ( available( candidate ) ) { return candidate; } }
		throw new Error( 'Could not create a unique CSS name.' );
	}
	const variantValue = ( color, variant, dark = false ) => variant.type === 'custom' ? ( dark && variant.dark ? variant.dark : variant.light ) : 'color-mix(in srgb,var(--' + color.name + ') ' + ( variant.type === 'alpha' ? variant.amount : 100 - variant.amount ) + '%,' + ( variant.type === 'tint' ? 'white' : variant.type === 'shade' ? 'black' : 'transparent' ) + ')';
	function tokens( data, activeIds = null, dark = false, device = null, breakpoints = window.LieveResponsive.defaults, includeTrashed = false ) {
		const active = activeIds === null ? null : new Set( activeIds ); const result = [];
		const add = ( item, name, value, aliases = [] ) => { if ( ( includeTrashed || ! item.trashed ) && ( ! active || active.has( item.id ) ) ) { result.push( { id: item.id, name, value, aliases, conditions: item.conditions, enabled: item.enabled !== false && ! item.trashed, ...( item.trashed ? { trashed: true } : {} ) } ); } };
		for ( const item of data.variables ) {
			let value = item.value;
			if ( device ) { for ( const bp of window.LieveResponsive.cascade( breakpoints, device ) ) { value = item.values[ bp.id ] || value; } }
			add( item, item.name, value, item.aliases );
		}
		for ( const color of data.colors ) {
			if ( color.trashed && ! includeTrashed ) { continue; }
			if ( active && ! active.has( color.id ) ) { continue; }
			add( color, color.name, dark && data.darkMode !== 'off' && color.dark ? color.dark : color.light, color.aliases );
			for ( const variant of color.variants ) { add( { ...variant, enabled: color.enabled, trashed: color.trashed || variant.trashed }, color.name + '-' + variant.suffix, variantValue( color, variant, dark && data.darkMode !== 'off' ), [ ...( variant.aliases || [] ), ...( color.aliases || [] ).map( alias => alias + '-' + variant.suffix ) ] ); }
		}
		return result;
	}
	/* Dimension references use the field's unit only while their token is unitless. */
	function numericValue( input, values, seen = new Set() ) {
		let value = String( input ).trim(); if ( seen.size >= 32 ) { return false; }
		value = value.replace( /var\(\s*--([A-Za-z_][A-Za-z0-9_-]*)\s*(?:,\s*([^()]+))?\)/g, ( _, name, fallback ) => {
			if ( seen.has( name ) ) { return 'invalid'; }
			return numericValue( values.has( name ) ? values.get( name ) : fallback ?? 'invalid', values, new Set( [ ...seen, name ] ) ) ? '0' : 'invalid';
		} );
		if ( /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test( value ) ) { return true; }
		return /^(?:calc|min|max|clamp)\(/i.test( value ) && /\d/.test( value ) && /^[\d.eE+*/(),\s-]+$/.test( value.replace( /\b(?:calc|min|max|clamp)\(/gi, '(' ) );
	}
	function dimensionDeclarations( items ) {
		const values = new Map(); items.forEach( item => { values.set( item.name, item.value ); ( item.aliases || [] ).forEach( alias => values.set( alias, 'var(--' + item.name + ')' ) ); } );
		return items.map( item => '--lieve-dimension--' + item.name + ':' + ( numericValue( item.value, values ) ? 'initial' : 'var(--' + item.name + ')' ) + ';' + ( item.aliases || [] ).map( alias => '--lieve-dimension--' + alias + ':var(--lieve-dimension--' + item.name + ');' ).join( '' ) ).join( '' );
	}
	function css( data, activeIds, device, breakpoints, dark = false ) {
		const declarations = tokens( data, activeIds, dark, device, breakpoints ).filter( item => item.enabled ).map( item => '--' + item.name + ':' + item.value + ';' + ( item.aliases || [] ).map( alias => '--' + alias + ':var(--' + item.name + ');' ).join( '' ) ).join( '' );
		const variableIds = new Set( data.variables.map( item => item.id ) ); const dimensions = dimensionDeclarations( tokens( data, activeIds, dark, device, breakpoints ).filter( item => item.enabled && variableIds.has( item.id ) ) );
		return declarations ? '#lieve-canvas{' + declarations + dimensions + '}' : '';
	}
	/** Reordering exchanges visible slots without changing token data or hidden positions. */
	function reorderTokens( data, order, kind = 'variables' ) {
		if ( ! [ 'variables', 'colors' ].includes( kind ) || ! Array.isArray( order ) || new Set( order ).size !== order.length || order.some( id => ! validId( id ) || ! data[ kind ].some( item => item.id === id ) ) ) { throw new Error( 'The token order contains missing or duplicate IDs.' ); }
		const next = clone( data ); const byId = new Map( next[ kind ].map( item => [ item.id, item ] ) ); const visible = new Set( order ); let index = 0;
		// Filtered/category lists only exchange their own slots. Hidden variables
		// keep their positions, values and assignments; unfinished drafts are allowed.
		next[ kind ] = next[ kind ].map( item => visible.has( item.id ) ? byId.get( order[ index++ ] ) : item );
		return next;
	}
	function reorderVariables( data, order ) { return reorderTokens( data, order ); }
	/** Trash is an identity-preserving state, not a second namespace or a CSS-enabled definition. */
	function trashEntries( data, kind ) {
		if ( ! [ 'variables', 'colors', 'classes' ].includes( kind ) || ! Array.isArray( data[ kind ] ) ) { throw new Error( 'Choose a valid library.' ); }
		const rows = data[ kind ].filter( item => item.trashed );
		if ( kind === 'colors' ) { for ( const parent of data.colors.filter( item => ! item.trashed ) ) { for ( const variant of parent.variants.filter( item => item.trashed ) ) { rows.push( { ...variant, _parentId: parent.id, name: parent.name + '-' + variant.suffix, description: 'Variant of --' + parent.name, paletteId: parent.paletteId, light: variantValue( parent, variant ), dark: variantValue( parent, variant, true ), variants: [], enabled: false } ); } } }
		return rows.sort( ( a, b ) => ( b.trashedAt || 0 ) - ( a.trashedAt || 0 ) );
	}
	function updateTrash( data, kind, ids, operation, timestamp = Math.floor( Date.now() / 1000 ) ) {
		if ( ! [ 'variables', 'colors', 'classes' ].includes( kind ) || ! Array.isArray( data[ kind ] ) || ! Array.isArray( ids ) || ids.some( id => ! validId( id ) ) || ! [ 'trash', 'restore', 'purge' ].includes( operation ) || ! Number.isInteger( timestamp ) || timestamp < 0 || timestamp > 4102444800 ) { throw new Error( 'Invalid Trash operation.' ); }
		const next = clone( data ); const chosen = new Set( ids );
		const change = item => { if ( ! chosen.has( item.id ) ) { return true; } if ( operation === 'trash' ) { if ( ! item.trashed ) { item.trashed = true; item.trashedAt = timestamp; } } else if ( item.trashed ) { if ( operation === 'purge' ) { return false; } delete item.trashed; delete item.trashedAt; } return true; };
		next[ kind ] = next[ kind ].filter( item => { const wasTrashed = Boolean( item.trashed ); if ( ! change( item ) ) { return false; } if ( kind === 'colors' && ! wasTrashed && ! item.trashed ) { item.variants = item.variants.filter( change ); } return true; } );
		return next;
	}
	/** Copies never share IDs or aliases. Replace is literal, not executable regular expressions. */
	function duplicate( data, kind, ids, { find = '', replace = '', prefix = '', suffix = '-copy', groupId = null } = {} ) {
		const next = clone( data ); const created = []; const pairs = [];
		for ( const original of data[ kind ].filter( item => ! item.trashed && ids.includes( item.id ) ) ) {
			const item = clone( original ); item.id = newId(); item.aliases = [];
			const requested = prefix + ( find ? item.name.split( find ).join( replace ) : item.name ) + suffix;
			if ( ! validName( requested ) ) { throw new Error( 'The duplicated name is not a valid CSS name: ' + requested ); }
			item.name = uniqueName( next, requested, ( item.variants || [] ).map( v => v.suffix ) );
			if ( groupId !== null ) { item[ kind === 'variables' ? 'categoryId' : 'paletteId' ] = groupId; }
			if ( item.variants ) { item.variants = item.variants.filter( variant => ! variant.trashed ); }
			for ( const variant of item.variants || [] ) { variant.id = newId(); variant.aliases = []; }
			next[ kind ].push( item ); created.push( item.id ); pairs.push( [ original, item ] );
		}
		// References within the duplicate batch follow its own new namespace.
		const replacements = new Map();
		pairs.forEach( ( [ old, added ] ) => {
			replacements.set( old.name, added.name ); for ( const alias of old.aliases || [] ) { replacements.set( alias, added.name ); }
			for ( const variant of old.variants || [] ) {
				const name = added.name + '-' + variant.suffix; replacements.set( old.name + '-' + variant.suffix, name );
				for ( const alias of variant.aliases || [] ) { replacements.set( alias, name ); }
				for ( const alias of old.aliases || [] ) { replacements.set( alias + '-' + variant.suffix, name ); }
			}
		} );
		const rewrite = value => typeof value === 'string' ? value.replace( /var\(\s*--([a-zA-Z_][a-zA-Z0-9_-]*)/g, ( match, name ) => replacements.has( name ) ? 'var(--' + replacements.get( name ) : match ) : value;
		for ( const item of next[ kind ].filter( value => created.includes( value.id ) ) ) { for ( const key of [ 'value', 'light', 'dark' ] ) { if ( key in item ) { item[ key ] = rewrite( item[ key ] ); } } for ( const key of Object.keys( item.values || {} ) ) { item.values[ key ] = rewrite( item.values[ key ] ); } for ( const variant of item.variants || [] ) { if ( variant.type === 'custom' ) { variant.light = rewrite( variant.light ); variant.dark = rewrite( variant.dark ); } } }
		const error = validate( next ); if ( error ) { throw new Error( error ); } return { data: next, ids: created };
	}
	/** Advisory only: external definitions and CSS fallbacks must remain saveable. */
	function dependencyReport( data, breakpoints = window.LieveResponsive.defaults ) {
		const definitions = new Map(); const aliases = new Map(); const issues = new Map(); const cycleKeys = new Map();
		const refs = value => [ ...new Set( Array.from( String( value || '' ).replace( /"[^"]*"|'[^']*'/g, '' ).matchAll( /\bvar\(\s*--([a-zA-Z_][a-zA-Z0-9_-]*)/g ), match => match[ 1 ] ) ) ];
		for ( const token of tokens( data, null, false, null, window.LieveResponsive.defaults, true ) ) {
			if ( ! validName( token.name ) ) { continue; }
			definitions.set( token.name, token ); aliases.set( token.name, token.name );
			for ( const alias of token.aliases || [] ) { aliases.set( alias, token.name ); }
		}
		const add = ( token, type, references, context, referenceKey = references.join( ',' ) ) => {
			const key = token.id + ':' + type + ':' + referenceKey;
			if ( ! issues.has( key ) ) { issues.set( key, { id: token.id, name: token.name, type, references, contexts: [] } ); }
			const item = issues.get( key ); if ( ! item.contexts.includes( context ) ) { item.contexts.push( context ); }
		};
		const inspect = ( name, value, context ) => {
			const token = definitions.get( name ); if ( ! token?.enabled ) { return; }
			for ( const ref of refs( value ) ) {
				const target = definitions.get( aliases.get( ref ) );
				if ( ! target ) { add( token, 'external', [ ref ], context ); }
				else if ( ! target.enabled ) { add( token, 'disabled', [ ref ], context ); }
			}
		};
		// Scan authored fields too: retained values must not hide external references.
		for ( const variable of data.variables ) {
			inspect( variable.name, variable.value, 'Base value' );
			for ( const [ id, value ] of Object.entries( variable.values || {} ) ) { inspect( variable.name, value, breakpoints.find( bp => bp.id === id )?.name || 'Retained breakpoint (' + id + ')' ); }
		}
		for ( const color of data.colors ) {
			inspect( color.name, color.light, 'Light mode' );
			if ( data.darkMode !== 'off' && color.dark ) { inspect( color.name, color.dark, 'Dark mode' ); }
			for ( const variant of color.variants || [] ) {
				inspect( color.name + '-' + variant.suffix, variantValue( color, variant ), 'Light mode' );
				if ( data.darkMode !== 'off' ) { inspect( color.name + '-' + variant.suffix, variantValue( color, variant, true ), 'Dark mode' ); }
			}
		}
		// Evaluate each effective cascade separately. Combining every override into
		// one graph would invent cycles between values that can never coexist.
		const contexts = breakpoints.map( bp => ( { device: bp.id, label: bp.name } ) );
		const modes = data.darkMode === 'off' ? [ false ] : [ false, true ]; const evaluated = new Map();
		for ( const context of contexts ) { for ( const dark of modes ) {
			const effective = tokens( data, null, dark, context.device, breakpoints ).filter( token => token.enabled && validName( token.name ) );
			const graph = new Map( effective.map( token => [ token.name, refs( token.value ).map( ref => aliases.get( ref ) ).filter( name => definitions.get( name )?.enabled ) ] ) );
			const fingerprint = JSON.stringify( [ ...graph ] );
			// Duplicate graphs still contribute their context labels, but reuse SCCs.
			let components = evaluated.get( fingerprint );
			if ( ! components ) {
				const seen = new Set(); const ordered = []; const reverse = new Map( [ ...graph.keys() ].map( name => [ name, [] ] ) );
				for ( const [ name, edges ] of graph ) { for ( const edge of edges ) { reverse.get( edge )?.push( name ); } }
				// Iterative Kosaraju: bounded O(vertices + edges), no call-stack limit
				// and no per-token recursive walk through a thousand-token chain.
				for ( const name of graph.keys() ) {
					if ( seen.has( name ) ) { continue; } const stack = [ [ name, false ] ];
					while ( stack.length ) { const [ current, exit ] = stack.pop(); if ( exit ) { ordered.push( current ); continue; } if ( seen.has( current ) ) { continue; } seen.add( current ); stack.push( [ current, true ] ); for ( const edge of graph.get( current ) || [] ) { if ( ! seen.has( edge ) ) { stack.push( [ edge, false ] ); } } }
				}
				seen.clear(); components = [];
				for ( const name of ordered.reverse() ) {
					if ( seen.has( name ) ) { continue; } const members = []; const stack = [ name ]; seen.add( name );
					while ( stack.length ) { const current = stack.pop(); members.push( current ); for ( const edge of reverse.get( current ) || [] ) { if ( ! seen.has( edge ) ) { seen.add( edge ); stack.push( edge ); } } }
					if ( members.length > 1 || ( graph.get( name ) || [] ).includes( name ) ) { components.push( members.sort() ); }
				}
				evaluated.set( fingerprint, components );
			}
			for ( const members of components ) {
				const signature = members.join( ',' ); if ( ! cycleKeys.has( signature ) ) { cycleKeys.set( signature, cycleKeys.size ); }
				for ( const name of members ) { add( definitions.get( name ), members.length === 1 ? 'self' : 'circular', members, context.label + ( dark ? ' · Dark' : ' · Light' ), cycleKeys.get( signature ) ); }
			}
		} }
		return [ ...issues.values() ];
	}
	function diagnostics( data, breakpoints ) {
		return dependencyReport( data, breakpoints ).map( issue => '--' + issue.name + ( issue.type === 'external' ? ' references --' + issue.references[ 0 ] + ', defined outside this manager or missing.' : issue.type === 'disabled' ? ' references disabled --' + issue.references[ 0 ] + '.' : ' has a circular reference.' ) );
	}
	function merge( current, imported ) {
		const error = validate( imported ); if ( error ) { throw new Error( error ); }
		const next = clone( current ); const groupIds = new Map( [ [ '', '' ] ] ); const references = new Map(); const added = [];
		for ( const key of [ 'categories', 'palettes' ] ) { for ( const group of imported[ key ] ) { let target = next[ key ].find( item => item.name.toLowerCase() === group.name.toLowerCase() ); if ( ! target ) { target = { id: newId(), name: group.name, ...( group.iconColor ? { iconColor: group.iconColor } : {} ) }; next[ key ].push( target ); } groupIds.set( group.id, target.id ); } }
		for ( const kind of [ 'variables', 'colors' ] ) {
			for ( const original of imported[ kind ] ) {
				const item = clone( original ); item.id = newId(); item.name = uniqueName( next, item.name, ( item.variants || [] ).map( variant => variant.suffix ) ); item.aliases = [];
				const groupKey = kind === 'variables' ? 'categoryId' : 'paletteId'; item[ groupKey ] = groupIds.get( original[ groupKey ] );
				references.set( original.name, item.name ); for ( const alias of original.aliases || [] ) { references.set( alias, item.name ); }
				for ( const variant of item.variants || [] ) { variant.id = newId(); references.set( original.name + '-' + variant.suffix, item.name + '-' + variant.suffix ); for ( const alias of variant.aliases || [] ) { references.set( alias, item.name + '-' + variant.suffix ); } for ( const alias of original.aliases || [] ) { references.set( alias + '-' + variant.suffix, item.name + '-' + variant.suffix ); } variant.aliases = []; }
				next[ kind ].push( item ); added.push( item );
			}
		}
		const rewrite = value => value.replace( /var\(\s*--([a-zA-Z_][a-zA-Z0-9_-]*)/g, ( match, name ) => references.has( name ) ? 'var(--' + references.get( name ) : match );
		for ( const item of added ) { for ( const key of [ 'value', 'light', 'dark' ] ) { if ( typeof item[ key ] === 'string' ) { item[ key ] = rewrite( item[ key ] ); } } for ( const key of Object.keys( item.values || {} ) ) { item.values[ key ] = rewrite( item.values[ key ] ); } for ( const variant of item.variants || [] ) { if ( variant.type === 'custom' ) { variant.light = rewrite( variant.light ); variant.dark = rewrite( variant.dark ); } } }
		const invalid = validate( next ); if ( invalid ) { throw new Error( invalid ); } return next;
	}
	function harmonies( color, kind ) {
		const angles = { analogous: [ -30, 30 ], complementary: [ 180 ], split: [ 150, 210 ], triadic: [ 120, 240 ], tetradic: [ 90, 180, 270 ] }[ kind ];
		if ( ! angles ) { throw new Error( 'Choose a supported harmony.' ); }
		return angles.map( ( angle, index ) => ( { id: newId(), suffix: kind + '-' + ( index + 1 ), type: 'custom', light: 'hsl(from var(--' + color.name + ') calc(h + ' + angle + ') s l)', dark: '', conditions: [], aliases: [] } ) );
	}
	/** The same validated builder owns generation and its live preview. */
	function generateVariants( data, colorId, { type = 'tint', amounts = '', prefix = '', harmony = '' } = {} ) {
		const next = clone( data ); const color = next.colors.find( item => item.id === colorId );
		if ( ! color ) { throw new Error( 'Select a parent color first.' ); }
		let created;
		if ( harmony ) { created = harmonies( color, harmony ); }
		else {
			const values = String( amounts ).split( ',' ).map( value => value.trim() ); prefix = String( prefix ).trim();
			if ( ! [ 'tint', 'shade', 'alpha' ].includes( type ) || ! prefix || ! validSuffix( prefix ) || values.length > 50 || values.some( value => ! value || ! Number.isFinite( Number( value ) ) || Number( value ) < 0 || Number( value ) > 100 ) ) { throw new Error( 'Use a valid suffix prefix and up to 50 percentages from 0 to 100, separated by commas.' ); }
			if ( new Set( values.map( Number ) ).size !== values.length ) { throw new Error( 'Each percentage must be unique.' ); }
			created = values.map( value => ( { id: newId(), suffix: prefix + '-' + String( Number( value ) ).replace( '.', '_' ), type, amount: Number( value ), conditions: [], aliases: [] } ) );
		}
		if ( color.variants.length + created.length > 50 ) { throw new Error( 'A color supports up to 50 variants. Remove some variants or generate a smaller set.' ); }
		const used = names( next );
		for ( const variant of created ) { if ( used.has( color.name + '-' + variant.suffix ) ) { throw new Error( '--' + color.name + '-' + variant.suffix + ' already exists. Choose a different suffix prefix or harmony.' ); } }
		color.variants.push( ...created ); const error = validate( next ); if ( error ) { throw new Error( error ); }
		return { data: next, created };
	}
	/** Session-only draft history. Invalid drafts are recoverable; snapshots never reach storage. */
	function createHistory( initial, { limit = 50, bytes = 8000000, now = () => Date.now() } = {} ) {
		let present = JSON.stringify( initial ); let past = []; let future = []; let group = ''; let time = 0;
		function trim() { while ( past.length > limit || ( past.length > 1 && past.reduce( ( sum, item ) => sum + item.length * 2, 0 ) > bytes ) ) { past.shift(); } }
		return {
			record( data, key = '' ) { const next = JSON.stringify( data ); if ( next === present ) { return false; } const tick = now(); if ( ! key || key !== group || tick - time > 750 || future.length ) { past.push( present ); } present = next; future = []; group = key; time = tick; trim(); return true; },
			undo() { if ( ! past.length ) { return null; } future.push( present ); present = past.pop(); group = ''; return JSON.parse( present ); },
			redo() { if ( ! future.length ) { return null; } past.push( present ); present = future.pop(); group = ''; trim(); return JSON.parse( present ); },
			reset( data ) { present = JSON.stringify( data ); past = []; future = []; group = ''; },
			breakGroup() { group = ''; },
			canUndo: () => past.length > 0, canRedo: () => future.length > 0,
		};
	}
	/** Read browser-computed sRGB without quantizing fractional channels or alpha to 8 bits. */
	function computedSrgb( value ) {
		const rgb = value.match( /^rgba?\(([^)]+)\)$/i ); const color = value.match( /^color\(srgb\s+([^)]+)\)$/i ); if ( ! rgb && ! color ) { return null; }
		const parts = ( rgb || color )[ 1 ].trim().split( /[\s,/]+/ ); if ( parts.length < 3 || parts.length > 4 || parts.some( part => ! /^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?%?$/i.test( part ) ) ) { return null; }
		return parts.map( ( part, index ) => { const max = index === 3 ? 1 : 255; const channel = part.endsWith( '%' ) ? parseFloat( part ) / 100 * max : parseFloat( part ) * ( color && index < 3 ? 255 : 1 ); return Math.max( 0, Math.min( max, channel ) ); } ).concat( parts.length === 3 ? [ 1 ] : [] );
	}
	/** WCAG 2.2 sRGB luminance. Alpha text is composited on an explicitly opaque background. */
	function contrastReport( foreground, background ) {
		const valid = color => Array.isArray( color ) && color.length === 4 && color.every( Number.isFinite ) && color.slice( 0, 3 ).every( channel => channel >= 0 && channel <= 255 ) && color[ 3 ] >= 0 && color[ 3 ] <= 1;
		if ( ! valid( foreground ) || ! valid( background ) || background[ 3 ] < 1 ) { return null; }
		const text = foreground.slice( 0, 3 ).map( ( channel, index ) => channel * foreground[ 3 ] + background[ index ] * ( 1 - foreground[ 3 ] ) );
		const luminance = color => color.slice( 0, 3 ).map( channel => { const value = channel / 255; return value <= .04045 ? value / 12.92 : ( ( value + .055 ) / 1.055 ) ** 2.4; } ).reduce( ( total, value, index ) => total + value * [ .2126, .7152, .0722 ][ index ], 0 );
		const a = luminance( text ); const b = luminance( background ); const ratio = ( Math.max( a, b ) + .05 ) / ( Math.min( a, b ) + .05 );
		return { ratio, aa: ratio >= 4.5, aaLarge: ratio >= 3, aaa: ratio >= 7, aaaLarge: ratio >= 4.5, text, background: background.slice( 0, 3 ) };
	}
	window.LieveDesignModel = { clone, empty, normalize, validate, validateGroups, safeValue, validColor, validIconColor, validId, validName, validSuffix, newId, names, uniqueName, variantValue, tokens, css, reorderVariables, reorderTokens, trashEntries, updateTrash, duplicate, merge, harmonies, generateVariants, dependencyReport, diagnostics, createHistory, computedSrgb, contrastReport };
}() );
