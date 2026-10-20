/* Functional behavior only. Authored element appearance remains controlled by the builder. */
( function () {
	'use strict';
	const mounted = new WeakSet(), reduced = window.matchMedia( '(prefers-reduced-motion: reduce)' );
	function mountSlider( root ) {
		if ( mounted.has( root ) ) { return; } mounted.add( root );
		const slides = Array.from( root.children ).filter( item => item.hasAttribute( 'data-lieve-slide' ) );
		const own = selector => Array.from( root.querySelectorAll( selector ) ).filter( item => item.closest( '[data-lieve-slider]' ) === root );
		const previous = own( '[data-lieve-slide-prev]' )[0], next = own( '[data-lieve-slide-next]' )[0], pause = own( '[data-lieve-slide-pause]' )[0], status = own( '[data-lieve-slide-status]' )[0], dots = own( '[data-lieve-slide-index]' );
		let current = 0, timer, animation, paused = reduced.matches, hovered = false, focused = false, pointer = null;
		const loop = root.dataset.sliderLoop !== 'false';
		function schedule() {
			clearTimeout( timer );
			if ( ! root.isConnected || root.dataset.sliderAutoplay !== 'true' || paused || hovered || focused || document.hidden || slides.length < 2 || ! loop && current === slides.length - 1 ) { return; }
			timer = setTimeout( () => go( current + 1, false ), Math.max( 2000, Math.min( 60000, Number( root.dataset.sliderInterval ) || 5000 ) ) );
		}
		function go( index, user = true, animate = true ) {
			if ( ! slides.length ) { return; }
			current = loop ? ( index + slides.length ) % slides.length : Math.min( slides.length - 1, Math.max( 0, index ) );
			animation?.cancel(); slides.forEach( ( slide, i ) => { slide.hidden = i !== current; } );
			if ( animate && ! reduced.matches && root.dataset.sliderEffect === 'fade' && slides[current].animate ) { animation = slides[current].animate( [ { opacity: 0 }, { opacity: 1 } ], { duration: Math.max( 0, Math.min( 2000, Number( root.dataset.sliderDuration ?? 200 ) || 0 ) ), easing: 'ease-out' } ); }
			if ( previous ) { previous.disabled = ! loop && current === 0; } if ( next ) { next.disabled = ! loop && current === slides.length - 1; }
			dots.forEach( ( dot, i ) => { if ( i === current ) { dot.setAttribute( 'aria-current', 'true' ); } else { dot.removeAttribute( 'aria-current' ); } } );
			if ( status ) { status.setAttribute( 'aria-live', user ? 'polite' : 'off' ); status.textContent = ( current + 1 ) + ' / ' + slides.length; }
			schedule();
		}
		previous?.addEventListener( 'click', () => go( current - 1 ) ); next?.addEventListener( 'click', () => go( current + 1 ) );
		dots.forEach( dot => dot.addEventListener( 'click', () => go( Number( dot.dataset.lieveSlideIndex ) ) ) );
		function syncPause() { if ( pause ) { pause.setAttribute( 'aria-pressed', String( paused ) ); pause.textContent = paused ? 'Resume autoplay' : 'Pause autoplay'; } schedule(); }
		pause?.addEventListener( 'click', () => { paused = ! paused; syncPause(); } );
		root.addEventListener( 'keydown', event => { if ( root.dataset.sliderKeyboard === 'false' || event.target.closest( 'input,textarea,select,[contenteditable="true"]' ) || event.target.closest( '[data-lieve-slider]' ) !== root || ! [ 'ArrowLeft', 'ArrowRight', 'Home', 'End' ].includes( event.key ) ) { return; } event.preventDefault(); go( event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : current + ( event.key === 'ArrowRight' ? 1 : -1 ) ); } );
		root.addEventListener( 'pointerenter', () => { hovered = true; schedule(); } ); root.addEventListener( 'pointerleave', () => { hovered = false; schedule(); } );
		root.addEventListener( 'focusin', () => { focused = true; schedule(); } ); root.addEventListener( 'focusout', () => { queueMicrotask( () => { focused = root.contains( document.activeElement ); schedule(); } ); } );
		if ( root.dataset.sliderSwipe !== 'false' ) {
			root.addEventListener( 'pointerdown', event => { if ( event.button !== 0 || event.target.closest( 'button,input,select,textarea,[contenteditable="true"]' ) || event.target.closest( '[data-lieve-slider]' ) !== root ) { return; } pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; } );
			root.addEventListener( 'pointerup', event => { if ( ! pointer || pointer.id !== event.pointerId ) { return; } const x = event.clientX - pointer.x, y = event.clientY - pointer.y; pointer = null; if ( Math.abs( x ) > 40 && Math.abs( x ) > Math.abs( y ) * 1.5 ) { event.preventDefault(); root.addEventListener( 'click', stopClick, { capture: true, once: true } ); setTimeout( () => root.removeEventListener( 'click', stopClick, true ), 100 ); go( current + ( x < 0 ? 1 : -1 ) ); } } );
			root.addEventListener( 'pointercancel', () => { pointer = null; } );
		}
		function stopClick( event ) { event.preventDefault(); event.stopPropagation(); }
		const visibility = () => { if ( ! root.isConnected ) { clearTimeout( timer ); document.removeEventListener( 'visibilitychange', visibility ); reduced.removeEventListener?.( 'change', preference ); return; } schedule(); };
		const preference = () => { if ( reduced.matches ) { paused = true; animation?.cancel(); syncPause(); } };
		document.addEventListener( 'visibilitychange', visibility ); reduced.addEventListener?.( 'change', preference ); go( 0, false, false ); syncPause();
	}
	function mountNavigation( root ) {
		if ( mounted.has( root ) ) { return; } mounted.add( root );
		const toggle = root.querySelector( ':scope > [data-menu-toggle]' ), panel = root.querySelector( ':scope > [data-menu-panel]' ), media = window.matchMedia( '(max-width:' + ( Number( root.dataset.menuBreakpoint ) || 991 ) + 'px)' );
		let opened = false;
		function setOpen( value, focus = false ) { opened = value; if ( toggle && panel ) { toggle.setAttribute( 'aria-expanded', String( opened ) ); panel.hidden = ! toggle.hidden && ! opened; if ( focus ) { toggle.focus(); } } }
		const sync = () => { if ( toggle ) { toggle.hidden = ! media.matches; setOpen( false ); } }; sync(); media.addEventListener?.( 'change', sync );
		toggle?.addEventListener( 'click', () => setOpen( ! opened ) );
		root.addEventListener( 'keydown', event => { if ( event.key === 'Escape' ) { root.querySelectorAll( '[data-submenu-toggle]' ).forEach( button => { button.setAttribute( 'aria-expanded', 'false' ); document.getElementById( button.getAttribute( 'aria-controls' ) ).hidden = true; } ); if ( opened ) { event.preventDefault(); setOpen( false, true ); } else if ( event.target.closest( 'ul' )?.previousElementSibling?.hasAttribute( 'data-submenu-toggle' ) ) { event.target.closest( 'ul' ).previousElementSibling.focus(); } } } );
		root.addEventListener( 'click', event => { if ( root.dataset.menuClose !== 'false' && event.target.closest( 'a[href]' ) ) { setOpen( false ); } } );
		const outside = event => { if ( ! root.isConnected ) { document.removeEventListener( 'pointerdown', outside ); media.removeEventListener?.( 'change', sync ); } else if ( ! root.contains( event.target ) ) { setOpen( false ); } }; document.addEventListener( 'pointerdown', outside );
		if ( root.dataset.menuSubmenus === 'true' ) { root.querySelectorAll( 'li' ).forEach( ( item, index ) => {
			const sub = item.querySelector( ':scope > ul' ), link = item.querySelector( ':scope > a' ); if ( ! sub || ! link ) { return; }
			const button = document.createElement( 'button' ); button.type = 'button'; button.dataset.submenuToggle = ''; sub.id ||= ( root.id || 'lieve-navigation-' + Math.random().toString( 36 ).slice( 2 ) ) + '-submenu-' + index; button.setAttribute( 'aria-controls', sub.id ); button.setAttribute( 'aria-expanded', 'false' ); button.setAttribute( 'aria-label', 'Toggle submenu: ' + link.textContent.trim() ); button.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'; sub.hidden = true; sub.before( button );
			button.addEventListener( 'click', () => { const open = button.getAttribute( 'aria-expanded' ) !== 'true'; button.setAttribute( 'aria-expanded', String( open ) ); sub.hidden = ! open; } );
		} ); }
	}
	let lightbox;
	function openLightbox( link ) {
		if ( ! window.HTMLDialogElement ) { return false; }
		const group = link.dataset.lightboxGroup, links = group ? Array.from( document.querySelectorAll( '[data-lieve-lightbox]' ) ).filter( item => item.dataset.lightboxGroup === group ) : [link]; let index = links.indexOf( link );
		lightbox?.close(); lightbox?.remove(); lightbox = document.createElement( 'dialog' ); const dialog = lightbox; lightbox.className = 'lieve-lightbox'; lightbox.setAttribute( 'aria-label', 'Image viewer' );
		const tools = document.createElement( 'div' ), figure = document.createElement( 'figure' ), image = document.createElement( 'img' ), caption = document.createElement( 'figcaption' );
		const make = ( label, action ) => { const button = document.createElement( 'button' ); button.type = 'button'; button.textContent = label; button.addEventListener( 'click', action ); tools.append( button ); return button; };
		const close = make( 'Close', () => lightbox.close() ), previous = make( 'Previous image', () => show( index - 1 ) ), next = make( 'Next image', () => show( index + 1 ) ); previous.hidden = next.hidden = links.length < 2;
		function show( value ) { index = ( value + links.length ) % links.length; image.src = links[index].href; image.alt = links[index].querySelector( 'img' )?.alt || ''; caption.textContent = links[index].dataset.lightboxCaption || ''; }
		figure.append( image, caption ); lightbox.append( tools, figure ); document.body.append( lightbox ); show( index ); lightbox.showModal(); close.focus();
		lightbox.addEventListener( 'close', () => { if ( lightbox === dialog && link.isConnected ) { link.focus( { preventScroll: true } ); } dialog.remove(); } , { once: true } );
		lightbox.addEventListener( 'keydown', event => { if ( event.key === 'ArrowLeft' || event.key === 'ArrowRight' ) { event.preventDefault(); show( index + ( event.key === 'ArrowRight' ? 1 : -1 ) ); } } ); return true;
	}
	function mount( scope = document ) { scope.querySelectorAll( '[data-lieve-slider]' ).forEach( mountSlider ); scope.querySelectorAll( '[data-lieve-navigation]' ).forEach( mountNavigation ); }
	document.addEventListener( 'click', event => { const link = event.target.closest( '[data-lieve-lightbox]' ); if ( link && ! event.ctrlKey && ! event.metaKey && ! event.shiftKey && openLightbox( link ) ) { event.preventDefault(); } } );
	window.LieveWidgets = { mount, mountSlider, mountNavigation }; if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', () => mount(), { once: true } ); } else { mount(); }
}() );
