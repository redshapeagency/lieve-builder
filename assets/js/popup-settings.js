( function () {
	'use strict';
	const defaults = () => ( { closeButton: false, closeOnEscape: true, closeOnBackdrop: true, lockScroll: true, overlay: true, label: '', entrance: 'fade', exit: 'fade', duration: 250, delay: 0, easing: 'ease-out', styles: {} } );
	const animations = { none: 'None', fade: 'Fade', zoom: 'Soft zoom', 'slide-up': 'Slide up', 'slide-down': 'Slide down', 'slide-left': 'Slide left', 'slide-right': 'Slide right' };
	const baselines = {
		root: { width: '720px', 'max-width': '100%', height: 'auto', 'max-height': 'calc(100dvh - 48px)', 'border-radius': '0px', 'background-color': '#ffffff', overflow: 'auto', position: 'relative', 'box-shadow': '0 24px 60px rgba(16,24,40,.28), 0 4px 12px rgba(16,24,40,.12)' },
		overlay: { 'background-color': 'rgba(16,24,40,.58)', 'backdrop-filter': 'blur(4px)' },
		close: { width: '36px', height: '36px', 'border-radius': '0px', top: '14px', right: '14px', 'background-color': 'transparent', color: 'inherit', 'box-shadow': 'none', transition: 'none' },
		frame: { display: 'grid', 'grid-template-columns': 'minmax(0, 1fr)', 'grid-template-rows': 'minmax(0, 1fr)', 'align-items': 'center', 'justify-items': 'center', 'padding-top': '24px', 'padding-right': '24px', 'padding-bottom': '24px', 'padding-left': '24px', 'z-index': '99999' },
	};
	function normalize( value ) {
		const result = defaults();
		if ( ! value || typeof value !== 'object' || Array.isArray( value ) ) { return result; }
		Object.keys( result ).forEach( key => { if ( key === 'styles' ) { const styles = value.styles; result.styles = styles && typeof styles === 'object' && ! Array.isArray( styles ) ? JSON.parse( JSON.stringify( styles ) ) : {}; } else if ( value[ key ] !== undefined ) { result[ key ] = value[ key ]; } } );
		return result;
	}
	function validate( value ) {
		if ( ! value || typeof value !== 'object' || Array.isArray( value ) ) { return 'Enter valid Pop Up settings.'; }
		const base = defaults();
		for ( const [ key, item ] of Object.entries( value ) ) {
			if ( ! Object.hasOwn( base, key ) ) { return 'Unknown Pop Up setting: ' + key; }
			if ( typeof base[ key ] === 'boolean' && typeof item !== 'boolean' ) { return 'Pop Up switches must be On or Off.'; }
		}
		for ( const key of [ 'entrance', 'exit' ] ) { if ( value[ key ] !== undefined && ! Object.hasOwn( animations, value[ key ] ) ) { return 'Choose a valid Pop Up animation.'; } }
		if ( value.easing !== undefined && ! [ 'ease-out', 'ease-in-out', 'linear' ].includes( value.easing ) ) { return 'Choose a valid animation easing.'; }
		for ( const [ key, max ] of [ [ 'duration', 2000 ], [ 'delay', 5000 ] ] ) { if ( value[ key ] !== undefined && ( ! Number.isInteger( value[ key ] ) || value[ key ] < 0 || value[ key ] > max ) ) { return 'Animation ' + key + ' must be a whole number from 0 to ' + max + ' ms.'; } }
		if ( typeof value.label !== 'string' || new TextEncoder().encode( value.label ).length > 600 || /[<>]/.test( value.label ) ) { return 'Use a plain-text accessible name (up to 600 bytes).'; }
		if ( ! value.styles || typeof value.styles !== 'object' || Array.isArray( value.styles ) || JSON.stringify( value ).length > 70000 ) { return 'Enter valid Pop Up styles (up to 70 KB).'; }
		for ( const [ target, devices ] of Object.entries( value.styles ) ) {
			if ( ! Object.hasOwn( baselines, target ) ) { return 'Choose a valid Pop Up style target.'; }
			if ( ! devices || typeof devices !== 'object' || Array.isArray( devices ) ) { return 'Enter valid Pop Up style contexts.'; }
			for ( const states of Object.values( devices ) ) {
				if ( ! states || typeof states !== 'object' || Array.isArray( states ) ) { return 'Enter valid Pop Up style states.'; }
				for ( const [ state, values ] of Object.entries( states ) ) {
					if ( ! [ 'normal', 'hover', 'focus', 'active', 'before', 'after' ].includes( state ) || ! values || typeof values !== 'object' || Array.isArray( values ) ) { return 'Enter valid Pop Up style declarations.'; }
					for ( const [ property, item ] of Object.entries( values ) ) { if ( typeof item !== 'string' || ! window.LieveStyles.safeValue( property, item ) ) { return 'Invalid Pop Up style: ' + property + '. Review its value before saving.'; } }
				}
			}
		}
		return '';
	}
	window.LievePopupSettings = { defaults, normalize, validate, animations, baselines };
}() );
