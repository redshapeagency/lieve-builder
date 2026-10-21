/* Anime.js adapter. Saved Lieve timelines and public controls remain engine-independent. */
( function( root, factory ) {
	'use strict';
	if ( typeof module === 'object' && module.exports ) { module.exports = factory; }
	else { root.LieveMotionEngine = factory( root.anime, root ); }
}( typeof window !== 'undefined' ? window : this, function( anime, win ) {
	'use strict';
	// Stable document identifiers, mapped to standard easing equivalents; no old engine is loaded.
	const eases = { none: 'linear', 'power1.out': 'outQuad', 'power2.out': 'outCubic', 'power2.inOut': 'inOutCubic', 'power3.out': 'outQuart', 'expo.out': 'outExpo', 'sine.inOut': 'inOutSine', 'back.out(1.2)': 'outBack(1.2)' };
	const transforms = new Set( [ 'x', 'y', 'z', 'xPercent', 'yPercent', 'scale', 'scaleX', 'scaleY', 'rotation', 'rotationX', 'rotationY' ] );
	const cssName = key => key.replace( /[A-Z]/g, letter => '-' + letter.toLowerCase() );
	const defaults = () => ( { x: 0, y: 0, z: 0, xPercent: 0, yPercent: 0, scaleX: 1, scaleY: 1, scaleZ: 1, rotation: 0, rotationX: 0, rotationY: 0 } );
	const dom = target => Boolean( target?.style?.getPropertyValue );
	const owner = target => target.ownerDocument?.defaultView || win;
	const computed = target => owner( target ).getComputedStyle( target );
	function transformState( target ) {
		const state = defaults(); let residual = '';
		if ( ! dom( target ) ) { Object.keys( state ).forEach( key => { if ( typeof target[ key ] === 'number' ) { state[ key ] = target[ key ]; } } ); return { state, residual }; }
		const Matrix = owner( target ).DOMMatrixReadOnly || owner( target ).DOMMatrix;
		const value = computed( target ).transform;
		if ( Matrix && value && value !== 'none' ) {
			const matrix = new Matrix( value ), degrees = 180 / Math.PI;
			state.x = matrix.m41; state.y = matrix.m42; state.z = matrix.m43;
			state.scaleX = Math.hypot( matrix.m11, matrix.m12, matrix.m13 ); state.scaleY = Math.hypot( matrix.m21, matrix.m22, matrix.m23 ); state.scaleZ = Math.hypot( matrix.m31, matrix.m32, matrix.m33 );
			if ( matrix.is2D && matrix.a * matrix.d - matrix.b * matrix.c < 0 ) { state.scaleY *= -1; }
			const sx = state.scaleX || 1, sy = state.scaleY || 1, sz = state.scaleZ || 1;
			state.rotationY = Math.asin( Math.max( -1, Math.min( 1, -matrix.m13 / sx ) ) ) * degrees;
			state.rotation = Math.atan2( matrix.m12 / sx, matrix.m11 / sx ) * degrees;
			state.rotationX = Math.atan2( matrix.m23 / sy, matrix.m33 / sz ) * degrees;
			// Preserve skew/perspective and any matrix components not exposed by Lieve.
			const base = new Matrix( transformCSS( state ) ), remainder = base.inverse().multiply( matrix );
			if ( [ remainder.m11, remainder.m22, remainder.m33, remainder.m44 ].every( Number.isFinite ) ) { residual = remainder.isIdentity ? '' : remainder.toString(); }
		}
		return { state, residual };
	}
	function transformCSS( state ) {
		const axis = ( pixels, percent ) => percent ? 'calc(' + pixels + 'px + ' + percent + '%)' : pixels + 'px';
		return 'translate3d(' + axis( state.x, state.xPercent ) + ',' + axis( state.y, state.yPercent ) + ',' + state.z + 'px) rotateZ(' + state.rotation + 'deg) rotateY(' + state.rotationY + 'deg) rotateX(' + state.rotationX + 'deg) scale3d(' + state.scaleX + ',' + state.scaleY + ',' + state.scaleZ + ')';
	}
	function expand( values ) {
		const result = { ...values };
		if ( result.scale !== undefined ) { result.scaleX ??= result.scale; result.scaleY ??= result.scale; delete result.scale; }
		return result;
	}
	function channels( value, target ) {
		const numbers = value.match( /^rgba?\(([^)]+)\)$/i )?.[1].split( /[,\s/]+/ ).filter( Boolean ).map( Number );
		if ( numbers?.length >= 3 ) { return { r: numbers[0], g: numbers[1], b: numbers[2], a: numbers[3] ?? 1 }; }
		// Resolve modern CSS colors in variables to sRGB without adding a visible node.
		const canvas = target.ownerDocument.createElement( 'canvas' ); canvas.width = canvas.height = 1;
		const context = canvas.getContext( '2d', { willReadFrequently: true } );
		if ( ! context ) { throw new Error( 'This animation color cannot be resolved.' ); }
		context.fillStyle = value; context.fillRect( 0, 0, 1, 1 ); const data = context.getImageData( 0, 0, 1, 1 ).data;
		return { r: data[0], g: data[1], b: data[2], a: data[3] / 255 };
	}
	function create( { row, steps, onUpdate = () => {} } ) {
		if ( ! anime?.createTimeline ) { throw new Error( 'The local Motion animation engine is unavailable.' ); }
		const duration = Math.max( ...steps.map( ( { step, targets } ) => step.start + step.duration + ( targets.length - 1 ) * step.stagger ) );
		const snapshots = new Map(), states = new Map(), colors = new Map(); let raw = null, driver = null, destroyed = false, building = false, started = false, position = 0, reversed = false, paused = true;
		const total = row.trigger === 'scroll' ? duration : row.repeat === -1 ? Infinity : duration * ( row.repeat + 1 );
		function remember( target, key ) {
			let entry = snapshots.get( target );
			if ( ! entry ) { entry = { empty: dom( target ) && ! target.hasAttribute( 'style' ), values: new Map() }; snapshots.set( target, entry ); }
			if ( entry.values.has( key ) ) { return; }
			entry.values.set( key, dom( target ) ? { value: target.style.getPropertyValue( cssName( key ) ), priority: target.style.getPropertyPriority( cssName( key ) ) } : { value: target[ key ], exists: Object.hasOwn( target, key ) } );
			if ( dom( target ) && key === 'borderRadius' ) { [ 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius' ].forEach( corner => remember( target, corner ) ); }
		}
		function restoreStyles() {
			snapshots.forEach( ( entry, target ) => {
				entry.values.forEach( ( saved, key ) => {
					restoreProperty( target, key, saved );
				} );
				if ( dom( target ) && entry.empty && ! target.style.length ) { target.removeAttribute( 'style' ); }
			} );
		}
		function restoreProperty( target, key, saved = snapshots.get( target ).values.get( key ) ) {
			if ( dom( target ) ) {
				const name = cssName( key );
				if ( target.style.getPropertyValue( name ) !== saved.value || target.style.getPropertyPriority( name ) !== saved.priority ) {
					if ( saved.value ) { target.style.setProperty( name, saved.value, saved.priority ); } else { target.style.removeProperty( name ); }
				}
			} else if ( saved.exists ) { target[ key ] = saved.value; } else { delete target[ key ]; }
		}
		function render() {
			if ( building || destroyed ) { return; }
			states.forEach( ( { state, residual, start }, target ) => {
				if ( time() < start ) { if ( dom( target ) ) { restoreProperty( target, 'transform' ); } else { Object.keys( state ).forEach( key => restoreProperty( target, key ) ); } return; }
				if ( dom( target ) ) { target.style.transform = transformCSS( state ) + ( residual ? ' ' + residual : '' ); }
				else { Object.keys( state ).forEach( key => { target[ key ] = state[ key ]; } ); }
			} );
			colors.forEach( ( properties, target ) => properties.forEach( ( color, key ) => {
				if ( time() < color.start ) { restoreProperty( target, key ); return; }
				target.style.setProperty( cssName( key ), 'rgba(' + [ color.r, color.g, color.b ].map( value => Math.round( value ) ).join( ',' ) + ',' + color.a + ')' );
			} ) );
		}
		function value( target, key, input ) {
			if ( ! dom( target ) || typeof input !== 'string' ) { return input; }
			let next = input;
			if ( /^var\(/.test( next ) ) { next = computed( target ).getPropertyValue( next.slice( 4, -1 ) ).trim(); if ( ! next ) { throw new Error( 'An animation variable is unavailable on its target.' ); } }
			if ( key === 'borderRadius' && /^\d+(?:\.\d+)?$/.test( next ) ) { next += 'px'; }
			if ( key !== 'color' && key !== 'backgroundColor' ) { return next; }
			const name = cssName( key ), previous = target.style.getPropertyValue( name ), priority = target.style.getPropertyPriority( name );
			target.style.setProperty( name, next ); const resolved = computed( target ).getPropertyValue( name );
			if ( previous ) { target.style.setProperty( name, previous, priority ); } else { target.style.removeProperty( name ); }
			return resolved;
		}
		function build() {
			if ( raw || destroyed ) { return; } building = true;
			try {
				// Capture every target before the first animation can change any style.
				steps.forEach( ( { step, targets } ) => targets.forEach( ( target, index ) => {
					const start = step.start + index * step.stagger;
					const keys = new Set( [ ...Object.keys( expand( step.from ) ), ...Object.keys( expand( step.to ) ) ] );
					keys.forEach( key => {
						if ( transforms.has( key ) ) {
							remember( target, dom( target ) ? 'transform' : key );
							if ( ! states.has( target ) ) { states.set( target, { ...transformState( target ), start } ); if ( ! dom( target ) ) { Object.keys( states.get( target ).state ).forEach( property => remember( target, property ) ); } }
							states.get( target ).start = Math.min( states.get( target ).start, start );
					} else {
						remember( target, key );
						if ( dom( target ) && ( key === 'color' || key === 'backgroundColor' ) ) {
							if ( ! colors.has( target ) ) { colors.set( target, new Map() ); }
							if ( ! colors.get( target ).has( key ) ) { colors.get( target ).set( key, { ...channels( computed( target ).getPropertyValue( cssName( key ) ), target ), start } ); }
							colors.get( target ).get( key ).start = Math.min( colors.get( target ).get( key ).start, start );
						}
					}
					} );
				} ) );
				raw = anime.createTimeline( { autoplay: false } );
				steps.forEach( ( { step, targets } ) => targets.forEach( ( target, index ) => {
					const from = expand( step.from ), to = expand( step.to ), motion = {}, styles = {};
					const parameters = { duration: step.duration * 1000, ease: eases[ step.ease ], composition: 'replace' }, position = ( step.start + index * step.stagger ) * 1000;
					new Set( [ ...Object.keys( from ), ...Object.keys( to ) ] ).forEach( key => {
						const animated = transforms.has( key ), destination = animated ? states.get( target ).state : target;
						const end = to[ key ] ?? ( animated ? destination[ key ] : dom( target ) ? computed( target ).getPropertyValue( cssName( key ) ) : target[ key ] );
						const endValue = value( target, key, end );
						if ( colors.get( target )?.has( key ) ) {
							const color = colors.get( target ).get( key ), finish = channels( endValue, target ), start = from[ key ] === undefined ? null : channels( value( target, key, from[ key ] ), target );
							raw.add( color, { ...parameters, ...Object.fromEntries( Object.keys( finish ).map( component => [ component, start ? { from: start[ component ], to: finish[ component ] } : finish[ component ] ] ) ) }, position ); return;
						}
						( animated ? motion : styles )[ key ] = from[ key ] === undefined ? endValue : { from: value( target, key, from[ key ] ), to: endValue };
					} );
					if ( Object.keys( motion ).length ) { raw.add( states.get( target ).state, { ...parameters, ...motion }, position ); }
					if ( Object.keys( styles ).length ) { raw.add( target, { ...parameters, ...styles }, position ); }
				} ) );
			} catch ( error ) { raw?.revert(); raw = null; restoreStyles(); states.clear(); colors.clear(); snapshots.clear(); throw error; }
			finally { building = false; }
			render();
		}
		function time() { return raw ? Math.min( duration, raw.iterationCurrentTime / 1000 ) : 0; }
		function stopDriver() { driver?.cancel(); driver = null; paused = true; }
		function applyPosition() {
			const cycle = Math.max( 0, Math.ceil( position / duration ) - 1 ), local = position - cycle * duration;
			raw.seek( ( row.yoyo && row.trigger !== 'scroll' && cycle % 2 ? duration - local : local ) * 1000, true ); render();
		}
		function seek( seconds ) {
			if ( destroyed || ! Number.isFinite( seconds ) ) { return; }
			build(); if ( ! raw ) { return; } stopDriver(); reversed = false; position = Math.max( 0, Math.min( duration, seconds ) );
			applyPosition(); onUpdate( time(), false ); started = true;
		}
		function run() {
			stopDriver(); const origin = position, destination = reversed ? 0 : total, distance = Math.abs( destination - origin );
			if ( distance < .000001 ) { onUpdate( time(), false ); return; } paused = false;
			// An independent clock preserves global reverse semantics for finite/infinite yoyo loops.
			driver = anime.createTimer( { duration: Number.isFinite( distance ) ? distance * 1000 : 1e12, onUpdate: clock => {
				position = origin + ( reversed ? -1 : 1 ) * clock.currentTime / 1000; applyPosition(); onUpdate( time(), true );
			}, onComplete: () => { paused = true; if ( Number.isFinite( destination ) ) { position = destination; applyPosition(); } onUpdate( time(), false ); } } );
			onUpdate( time(), true );
		}
		function command( action ) {
			if ( destroyed || ! [ 'play', 'pause', 'restart', 'reverse', 'reset' ].includes( action ) ) { return false; }
			if ( action === 'pause' ) { stopDriver(); onUpdate( time(), false ); return true; }
			if ( action === 'reset' ) { seek( 0 ); return true; }
			build(); if ( ! raw ) { return false; } started = true;
			if ( action === 'restart' ) { position = 0; reversed = false; applyPosition(); } else { reversed = action === 'reverse'; }
			run(); return true;
		}
		function snapshot() { return raw ? { initialized: true, currentTime: position * 1000, reversed, paused, started } : { initialized: false, started: false }; }
		function restore( saved ) {
			if ( destroyed || ! saved?.initialized ) { return; } build();
			stopDriver(); reversed = Boolean( saved.reversed ); position = Math.min( saved.currentTime / 1000, total ); applyPosition(); started = saved.started;
			if ( ! saved.paused ) { run(); }
		}
		function scroll( source, start, end ) {
			if ( destroyed ) { return () => {}; }
			build(); const watcher = anime.onScroll( { target: source, enter: start + '% top', leave: end + '% bottom', sync: true, onUpdate: () => { position = raw.iterationCurrentTime / 1000; render(); onUpdate( time(), false ); } } );
			try { watcher.link( raw ); render(); } catch ( error ) { watcher.revert(); throw error; }
			return () => watcher.revert();
		}
		function destroy() { if ( destroyed ) { return; } destroyed = true; stopDriver(); raw?.revert(); restoreStyles(); states.clear(); colors.clear(); snapshots.clear(); }
		return { command, seek, destroy, duration: () => duration, time, snapshot, restore, scroll };
	}
	return { create, eases, transformCSS };
} ) );
