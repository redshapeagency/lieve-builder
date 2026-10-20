<?php
/**
 * Theme setup and public assets.
 *
 * @package LieveBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Shared brand image. Adjacent brand text provides the accessible name.
 *
 * @return string
 */
function lieve_brand_logo() {
	return '<img class="lieve-brand-logo" src="' . esc_url( LIEVE_LOGO_URL ) . '" alt="" width="500" height="500" decoding="async">';
}

/** Render the shared header for Lieve management pages. */
function lieve_render_admin_header( $title, $description, $actions = array() ) {
	?>
	<header class="lieve-admin-header lieve-admin-header-compact">
		<div class="lieve-admin-logo" aria-hidden="true"><?php echo lieve_brand_logo(); ?></div>
		<div class="lieve-admin-title-wrap">
			<h1><?php echo esc_html( $title ); ?></h1>
			<p><?php echo esc_html( $description ); ?></p>
		</div>
		<?php if ( $actions ) : ?>
			<div class="lieve-admin-actions">
				<?php foreach ( $actions as $action ) : ?>
					<a class="lieve-admin-button lieve-admin-button-primary" href="<?php echo esc_url( $action['url'] ); ?>"><?php echo esc_html( $action['label'] ); ?></a>
				<?php endforeach; ?>
			</div>
		<?php endif; ?>
	</header>
	<?php
}

/** Invalidate cached assets when their contents are updated within a release. */
function lieve_asset_version( $relative_path ) {
	$path = dirname( __DIR__, 2 ) . '/' . $relative_path;
	return is_file( $path ) ? LIEVE_VERSION . '.' . filemtime( $path ) : LIEVE_VERSION;
}

/** Keep the same unmodified logo visible throughout the WordPress backend. */
function lieve_enqueue_brand_assets( $hook_suffix = '' ) {
	wp_enqueue_style( 'lieve-brand', LIEVE_URL . 'assets/css/brand.css', array(), lieve_asset_version( 'assets/css/brand.css' ) );
	$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
	if ( false !== strpos( $hook_suffix, 'lieve-' ) || ( $screen && 'lieve_template' === $screen->post_type ) ) {
		wp_enqueue_script( 'lieve-editor-transport', LIEVE_URL . 'assets/js/editor-transport.js', array(), lieve_asset_version( 'assets/js/editor-transport.js' ), false );
		wp_add_inline_script( 'lieve-editor-transport', 'window.LieveTransportConfig=' . wp_json_encode( array( 'root' => rest_url( 'lieve/v1/' ), 'renewUrl' => add_query_arg( 'action', 'rest-nonce', admin_url( 'admin-ajax.php' ) ), 'nonce' => wp_create_nonce( 'wp_rest' ) ), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ) . ';', 'before' );
		wp_enqueue_script( 'lieve-search-controls', LIEVE_URL . 'assets/js/search-controls.js', array(), lieve_asset_version( 'assets/js/search-controls.js' ), true );
	}
}
add_action( 'admin_enqueue_scripts', 'lieve_enqueue_brand_assets', 5 );

/**
 * Register theme supports.
 */
function lieve_setup() {
	load_theme_textdomain( 'lieve-builder', LIEVE_PATH . 'languages' );

	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'custom-logo', array( 'height' => 80, 'width' => 240, 'flex-height' => true, 'flex-width' => true ) );
	add_theme_support( 'responsive-embeds' );
	add_theme_support( 'align-wide' );
	add_theme_support( 'woocommerce' );
	// Lieve owns the single page-level main landmark, including native shop views.
	remove_action( 'woocommerce_before_main_content', 'woocommerce_output_content_wrapper', 10 );
	remove_action( 'woocommerce_after_main_content', 'woocommerce_output_content_wrapper_end', 10 );
	add_theme_support(
		'html5',
		array( 'search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script' )
	);

	register_nav_menus(
		array(
			'primary' => __( 'Primary Menu', 'lieve-builder' ),
			'footer'  => __( 'Footer Menu', 'lieve-builder' ),
		)
	);
}
add_action( 'after_setup_theme', 'lieve_setup' );

/**
 * Enqueue the shared public shell. Interactive assets are planned separately.
 */
function lieve_enqueue_assets() {
	wp_enqueue_style( 'lieve-style', get_stylesheet_uri(), array(), lieve_asset_version( 'style.css' ) );
	wp_enqueue_style( 'lieve-element-base', LIEVE_URL . 'assets/css/elements-base.css', array( 'lieve-style' ), lieve_asset_version( 'assets/css/elements-base.css' ) );
}
add_action( 'wp_enqueue_scripts', 'lieve_enqueue_assets' );

/**
 * Keep WordPress' automatic content width aligned with the theme.
 */
function lieve_content_width() {
	$GLOBALS['content_width'] = apply_filters( 'lieve_content_width', (int) lieve_theme_setting( 'content_width' ) );
}
add_action( 'after_setup_theme', 'lieve_content_width', 0 );
