/* Bounded serialized history. No DOM or editor-specific state ownership. */
( function( root, factory ) {
	'use strict';
	if ( typeof module === 'object' && module.exports ) { module.exports = factory(); }
	else { root.LieveHistory = factory(); }
}( typeof window !== 'undefined' ? window : this, function() {
	'use strict';
	const maxBytes = 24 * 1024 * 1024, maxEntries = 60;
	function push( stack, value, opposite = [] ) {
		if ( stack.at( -1 ) !== value ) { stack.push( value ); }
		let bytes = [ ...stack, ...opposite ].reduce( ( total, item ) => total + item.length * 2, 0 );
		while ( stack.length > maxEntries || bytes > maxBytes && stack.length > 1 ) { bytes -= stack.shift().length * 2; }
		while ( bytes > maxBytes && opposite.length > 1 ) { bytes -= opposite.shift().length * 2; }
	}
	return { push, maxBytes, maxEntries };
} ) );
