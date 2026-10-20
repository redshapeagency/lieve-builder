<?php
/** WooCommerce adapters. Checkout, authentication and payments stay in WooCommerce. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_commerce_elements() {
	return array(
		'product-title', 'product-gallery', 'product-short-description', 'product-price', 'product-stock', 'product-meta', 'product-rating', 'product-content', 'product-add-to-cart', 'product-related', 'product-reviews', 'product-additional-information', 'product-tabs', 'product-upsells',
		'woocommerce-breadcrumbs', 'woocommerce-mini-cart', 'woocommerce-cart-collaterals', 'woocommerce-cart-coupon', 'woocommerce-cart-items', 'woocommerce-checkout-coupon', 'woocommerce-checkout-login', 'woocommerce-checkout-order-review', 'woocommerce-checkout-thankyou', 'woocommerce-checkout-order-table', 'woocommerce-checkout-order-payment', 'woocommerce-checkout-customer-details',
		'woocommerce-products', 'woocommerce-products-pagination', 'woocommerce-products-orderby', 'woocommerce-products-total-results', 'woocommerce-products-filter', 'woocommerce-products-archive-description', 'woocommerce-notice',
		'woocommerce-account-page', 'woocommerce-account-form-login', 'woocommerce-account-form-register', 'woocommerce-account-form-lost-password', 'woocommerce-account-form-reset-password', 'woocommerce-account-orders', 'woocommerce-account-downloads', 'woocommerce-account-addresses', 'woocommerce-account-view-order', 'woocommerce-account-form-edit-address', 'woocommerce-account-form-edit-account', 'woocommerce-account-payment-methods', 'woocommerce-account-add-payment-method',
		'woocommerce-dynamic-fragment', 'woocommerce-cart-form', 'woocommerce-cart-item-data', 'woocommerce-order-item-data', 'woocommerce-cart-quantity', 'woocommerce-cart-v2', 'woocommerce-cart-v2-state-cart', 'woocommerce-cart-v2-state-empty',
		'woocommerce-checkout-steps-nav', 'woocommerce-checkout-step-nav-item', 'woocommerce-checkout-step', 'woocommerce-shipping-options', 'woocommerce-payment-options', 'woocommerce-form-field', 'woocommerce-form-submit', 'woocommerce-checkout-account-fields', 'woocommerce-checkout-billing-address', 'woocommerce-checkout-shipping-address', 'woocommerce-checkout-v2', 'woocommerce-checkout-v2-state-checkout', 'woocommerce-checkout-v2-state-login', 'woocommerce-checkout-v2-state-pay', 'woocommerce-checkout-v2-state-thankyou', 'woocommerce-checkout-v2-state-receipt', 'woocommerce-checkout-order-summary', 'woocommerce-checkout-place-order',
		'woocommerce-account-page-v2', 'woocommerce-account-v2-state-dashboard', 'woocommerce-account-v2-state-orders', 'woocommerce-account-v2-state-view-order', 'woocommerce-account-v2-state-downloads', 'woocommerce-account-v2-state-addresses', 'woocommerce-account-v2-state-edit-address', 'woocommerce-account-v2-state-edit-account', 'woocommerce-account-v2-state-payment-methods', 'woocommerce-account-v2-state-add-payment-method', 'woocommerce-account-v2-state-login', 'woocommerce-account-v2-state-lost-password', 'woocommerce-account-v2-state-lost-password-confirmation', 'woocommerce-account-v2-state-reset-password', 'woocommerce-account-v2-state-order-withdrawal',
		'woocommerce-account-login-form', 'woocommerce-account-register-form', 'woocommerce-account-lost-password-form', 'woocommerce-account-order-withdrawal-form', 'woocommerce-account-reset-password-form', 'woocommerce-account-orders-pagination', 'woocommerce-account-edit-address-form', 'woocommerce-account-edit-account-form', 'woocommerce-item-data', 'woocommerce-form-field',
	);
}

function lieve_register_commerce_elements( $registry ) {
	foreach ( array_unique( lieve_commerce_elements() ) as $type ) {
		$name = preg_replace( '/^woocommerce-/', '', $type );
		$group = 0 === strpos( $type, 'product-' ) ? 'WooCommerce · Product' : ( false !== strpos( $type, 'account' ) ? 'WooCommerce · Account' : ( false !== strpos( $type, 'checkout' ) ? 'WooCommerce · Checkout' : 'WooCommerce · Store' ) );
		$children = false !== strpos( $type, '-state-' ) || in_array( $type, array( 'woocommerce-cart-v2', 'woocommerce-checkout-v2', 'woocommerce-account-page-v2', 'woocommerce-cart-form', 'woocommerce-cart-items', 'woocommerce-checkout-steps-nav', 'woocommerce-checkout-step', 'woocommerce-dynamic-fragment' ), true );
		$fields = array();
		if ( 0 === strpos( $type, 'product-' ) ) { $fields['productId'] = array( 'label' => 'Product ID (empty = current product)', 'type' => 'number', 'options' => array() ); }
		if ( in_array( $type, array( 'woocommerce-cart-item-data', 'woocommerce-order-item-data', 'woocommerce-item-data' ), true ) ) { $fields['dataField'] = array( 'label' => 'Data field', 'type' => 'select', 'options' => array( 'name' => 'Name', 'price' => 'Price', 'quantity' => 'Quantity', 'subtotal' => 'Subtotal', 'sku' => 'SKU' ) ); }
		if ( false !== strpos( $type, 'edit-address' ) ) { $fields['addressType'] = array( 'label' => 'Address type', 'type' => 'select', 'options' => array( 'billing' => 'Billing', 'shipping' => 'Shipping' ) ); }
		if ( 'woocommerce-products' === $type ) { $fields['count'] = array( 'label' => 'Products per page', 'type' => 'number', 'options' => array() ); }
		if ( in_array( $type, array( 'woocommerce-checkout-step', 'woocommerce-checkout-step-nav-item', 'woocommerce-form-submit' ), true ) ) { $fields['label'] = array( 'label' => 'Label', 'type' => 'text', 'options' => array() ); }
		if ( 'woocommerce-form-field' === $type ) { $fields['fieldName'] = array( 'label' => 'WooCommerce checkout field key', 'type' => 'text', 'options' => array() ); }
		if ( 'woocommerce-products-filter' === $type ) { $fields['attribute'] = array( 'label' => 'Product attribute slug (e.g. color)', 'type' => 'text', 'options' => array() ); }
		$registry[ $type ] = array( 'label' => ucwords( str_replace( array( '-', 'v2' ), array( ' ', 'V2' ), $name ) ), 'group' => $group, 'icon' => 'commerce', 'fields' => $fields, 'defaults' => array(), 'children' => $children, 'dependency' => function_exists( 'WC' ) ? '' : 'Requires WooCommerce' );
		$registry[ $type ]['description'] = 'WooCommerce adapter. Configure and test on the relevant product, cart, checkout or account page. Commerce forms, sessions and payments remain managed by WooCommerce.';
		if ( false !== strpos( $type, 'order-withdrawal' ) ) { $registry[ $type ]['dependency'] = lieve_commerce_withdrawal_available() ? '' : 'Enable WooCommerce order withdrawal (11.1+)'; $registry[ $type ]['description'] = 'Uses the native WooCommerce order withdrawal endpoint when its feature is enabled. Lieve does not enable that feature, submit requests, cancel orders or issue refunds automatically.'; }
		if ( in_array( $type, array( 'woocommerce-account-form-login', 'woocommerce-account-login-form', 'woocommerce-account-form-register', 'woocommerce-account-register-form' ), true ) ) { $registry[ $type ]['description'] = 'Uses WooCommerce’s native login/registration form. Registration is available only when enabled in WooCommerce account settings.'; }
	}
	return $registry;
}
add_filter( 'lieve_element_registry', 'lieve_register_commerce_elements', 5 );

function lieve_commerce_withdrawal_available() {
	return function_exists( 'WC' ) && defined( 'WC_VERSION' ) && version_compare( WC_VERSION, '11.1', '>=' ) && class_exists( '\Automattic\WooCommerce\Utilities\FeaturesUtil' ) && \Automattic\WooCommerce\Utilities\FeaturesUtil::feature_is_enabled( 'order_withdrawal' );
}

/** Never expose another customer's order through a layout element. */
function lieve_commerce_current_order() {
	$id = absint( get_query_var( 'view-order' ) ?: get_query_var( 'order-received' ) ?: get_query_var( 'order-pay' ) );
	$order = $id && function_exists( 'wc_get_order' ) ? wc_get_order( $id ) : false;
	if ( ! $order ) { return false; }
	if ( current_user_can( 'manage_woocommerce' ) || ( get_current_user_id() && (int) $order->get_customer_id() === get_current_user_id() ) ) { return $order; }
	$key = isset( $_GET['key'] ) && is_scalar( $_GET['key'] ) ? wc_clean( wp_unslash( $_GET['key'] ) ) : '';
	return $key && hash_equals( $order->get_order_key(), $key ) ? $order : false;
}

function lieve_commerce_template( $name, $args = array() ) { if ( function_exists( 'wc_get_template' ) ) { wc_get_template( $name, $args ); } }

function lieve_render_commerce_element( $node, $attributes ) {
	$type = $node['type']; $p = $node['props'] ?? array();
	if ( ! in_array( $type, lieve_commerce_elements(), true ) ) { return false; }
	if ( ! empty( $GLOBALS['lieve_element_preview'] ) ) {
		echo '<div' . $attributes . '><p>' . esc_html( ucwords( str_replace( '-', ' ', $type ) ) ) . ' — ' . esc_html__( 'preview on the relevant WooCommerce page', 'lieve-builder' ) . '</p>';
		if ( ! empty( $node['children'] ) ) { lieve_render_element_children( $node ); }
		echo '</div>'; return true;
	}
	if ( ! function_exists( 'WC' ) ) { return true; }
	if ( false !== strpos( $type, 'order-withdrawal' ) && ! lieve_commerce_withdrawal_available() ) { return true; }
	if ( 0 === strpos( $type, 'product-' ) ) {
		$previous = $GLOBALS['product'] ?? null;
		$product = empty( $p['productId'] ) && isset( $GLOBALS['product'] ) && $GLOBALS['product'] instanceof WC_Product ? $GLOBALS['product'] : wc_get_product( absint( ! empty( $p['productId'] ) ? $p['productId'] : get_the_ID() ) );
		if ( ! $product || ( 'publish' !== $product->get_status() && ! current_user_can( 'edit_post', $product->get_id() ) ) ) { return true; }
		$previous_post = $GLOBALS['post'] ?? null;
		$GLOBALS['post'] = get_post( $product->get_id() );
		if ( $GLOBALS['post'] ) { setup_postdata( $GLOBALS['post'] ); }
		$GLOBALS['product'] = $product;
		try {
		echo '<div' . $attributes . '>';
		$callbacks = array( 'product-gallery' => 'woocommerce_show_product_images', 'product-price' => 'woocommerce_template_single_price', 'product-meta' => 'woocommerce_template_single_meta', 'product-rating' => 'woocommerce_template_single_rating', 'product-add-to-cart' => 'woocommerce_template_single_add_to_cart', 'product-related' => 'woocommerce_output_related_products', 'product-tabs' => 'woocommerce_output_product_data_tabs', 'product-upsells' => 'woocommerce_upsell_display' );
		if ( isset( $callbacks[ $type ] ) && function_exists( $callbacks[ $type ] ) ) { call_user_func( $callbacks[ $type ] ); }
		elseif ( 'product-stock' === $type ) { echo wc_get_stock_html( $product ); }
		elseif ( 'product-title' === $type ) { echo '<h1>' . esc_html( $product->get_name() ) . '</h1>'; }
		elseif ( 'product-short-description' === $type ) { echo wp_kses_post( wpautop( $product->get_short_description() ) ); }
		elseif ( 'product-content' === $type ) { echo wp_kses_post( wpautop( $product->get_description() ) ); }
		elseif ( 'product-additional-information' === $type ) { lieve_commerce_template( 'single-product/additional-information.php', array( 'product' => $product ) ); }
		elseif ( 'product-reviews' === $type ) { comments_template(); }
			echo '</div>';
		} finally {
			$GLOBALS['post'] = $previous_post;
			if ( $previous_post ) { setup_postdata( $previous_post ); } else { wp_reset_postdata(); }
			$GLOBALS['product'] = $previous;
		}
		return true;
	}

	$account = 0 === strpos( $type, 'woocommerce-account' );
	$public_account = preg_match( '/(login|register|lost-password|reset-password|order-withdrawal|account-page)/', $type );
	if ( $account && ! $public_account && ! is_user_logged_in() ) { return true; }
	$cart = WC()->cart; $checkout = false !== strpos( $type, 'checkout' ) || 'woocommerce-form-field' === $type ? WC()->checkout() : null;
	if ( ! $cart && ( false !== strpos( $type, 'cart' ) || false !== strpos( $type, 'checkout' ) ) ) { return true; }
	if ( false !== strpos( $type, '-state-' ) ) {
		$state = substr( $type, strpos( $type, '-state-' ) + 7 );
		$allowed = true;
		if ( 0 === strpos( $type, 'woocommerce-cart-' ) ) { $allowed = 'empty' === $state ? $cart->is_empty() : ! $cart->is_empty(); }
		elseif ( 0 === strpos( $type, 'woocommerce-account-' ) ) {
			$endpoint = WC()->query->get_current_endpoint() ?: 'dashboard';
			if ( 'lost-password' === $endpoint ) { $endpoint = ! empty( $_GET['show-reset-form'] ) ? 'reset-password' : ( ! empty( $_GET['reset-link-sent'] ) ? 'lost-password-confirmation' : 'lost-password' ); }
			elseif ( ! is_user_logged_in() && 'order-withdrawal' !== $endpoint ) { $endpoint = 'login'; }
			if ( 'edit-address' === $endpoint && ! get_query_var( 'edit-address' ) ) { $endpoint = 'addresses'; }
			$allowed = $endpoint === $state;
		}
		elseif ( 0 === strpos( $type, 'woocommerce-checkout-' ) ) { $endpoint = WC()->query->get_current_endpoint(); $allowed = 'checkout' === $state ? ! $endpoint : ( ( 'pay' === $state && 'order-pay' === $endpoint ) || ( in_array( $state, array( 'thankyou', 'receipt' ), true ) && 'order-received' === $endpoint ) || ( 'login' === $state && ! is_user_logged_in() ) ); }
		if ( $allowed ) {
			if ( 'woocommerce-checkout-v2-state-checkout' === $type ) { lieve_commerce_checkout_form( $node, $attributes ); }
			else { echo '<div' . $attributes . '>'; lieve_render_element_children( $node ); echo '</div>'; }
		} return true;
	}
	echo '<div' . $attributes . '>';
	$callbacks = array( 'woocommerce-breadcrumbs' => 'woocommerce_breadcrumb', 'woocommerce-mini-cart' => 'woocommerce_mini_cart', 'woocommerce-cart-collaterals' => 'woocommerce_cart_totals', 'woocommerce-checkout-coupon' => 'woocommerce_checkout_coupon_form', 'woocommerce-checkout-login' => 'woocommerce_checkout_login_form', 'woocommerce-checkout-order-review' => 'woocommerce_order_review', 'woocommerce-checkout-order-summary' => 'woocommerce_order_review', 'woocommerce-payment-options' => 'woocommerce_checkout_payment', 'woocommerce-products-pagination' => 'woocommerce_pagination', 'woocommerce-products-orderby' => 'woocommerce_catalog_ordering', 'woocommerce-products-total-results' => 'woocommerce_result_count', 'woocommerce-products-archive-description' => 'woocommerce_taxonomy_archive_description', 'woocommerce-notice' => 'wc_print_notices' );
	if ( 'woocommerce-mini-cart' === $type || 'woocommerce-dynamic-fragment' === $type ) { wp_enqueue_script( 'wc-cart-fragments' ); }
	if ( isset( $callbacks[ $type ] ) && function_exists( $callbacks[ $type ] ) ) { call_user_func( $callbacks[ $type ] ); }
	else {
		switch ( $type ) {
			case 'woocommerce-products': echo do_shortcode( '[products limit="' . min( 50, max( 1, (int) ( $p['count'] ?? 6 ) ) ) . '" paginate="true"]' ); break;
			case 'woocommerce-products-filter': if ( class_exists( 'WC_Widget_Layered_Nav' ) && ! empty( $p['attribute'] ) ) { the_widget( 'WC_Widget_Layered_Nav', array( 'attribute' => sanitize_title( $p['attribute'] ), 'display_type' => 'dropdown' ) ); } break;
			case 'woocommerce-cart-v2': case 'woocommerce-cart-form':
				if ( empty( $node['children'] ) ) { echo do_shortcode( '[woocommerce_cart]' ); }
				elseif ( 'woocommerce-cart-v2' === $type ) { lieve_render_element_children( $node ); }
				else { echo '<form class="woocommerce-cart-form" method="post" action="' . esc_url( wc_get_cart_url() ) . '">'; lieve_render_element_children( $node ); wp_nonce_field( 'woocommerce-cart', 'woocommerce-cart-nonce' ); echo '<button type="submit" name="update_cart" value="1">' . esc_html__( 'Update cart', 'lieve-builder' ) . '</button></form>'; } break;
			case 'woocommerce-cart-items':
				if ( empty( $node['children'] ) ) { lieve_commerce_cart_rows( $cart ); }
				else { $previous_item = $GLOBALS['lieve_cart_item'] ?? null; try { foreach ( $cart->get_cart() as $key => $item ) { $GLOBALS['lieve_cart_item'] = array( 'key' => $key, 'item' => $item ); lieve_render_element_children( $node ); } } finally { if ( null === $previous_item ) { unset( $GLOBALS['lieve_cart_item'] ); } else { $GLOBALS['lieve_cart_item'] = $previous_item; } } } break;
			case 'woocommerce-cart-item-data': case 'woocommerce-item-data':
				$context = $GLOBALS['lieve_cart_item'] ?? null; if ( $context ) { $item = $context['item']; $field = $p['dataField'] ?? 'name'; if ( 'name' === $field ) { echo esc_html( $item['data']->get_name() ); } elseif ( 'sku' === $field ) { echo esc_html( $item['data']->get_sku() ); } elseif ( 'quantity' === $field ) { echo (int) $item['quantity']; } elseif ( 'price' === $field ) { echo $cart->get_product_price( $item['data'] ); } else { echo $cart->get_product_subtotal( $item['data'], $item['quantity'] ); } } break;
			case 'woocommerce-cart-quantity': $context = $GLOBALS['lieve_cart_item'] ?? null; if ( $context ) { woocommerce_quantity_input( array( 'input_name' => 'cart[' . $context['key'] . '][qty]', 'input_value' => $context['item']['quantity'], 'min_value' => 0, 'max_value' => $context['item']['data']->get_max_purchase_quantity() ), $context['item']['data'] ); } break;
			case 'woocommerce-cart-coupon':
				if ( wc_coupons_enabled() ) { echo '<label>' . esc_html__( 'Coupon code', 'lieve-builder' ) . '<input type="text" name="coupon_code"></label><button type="submit" name="apply_coupon" value="1">' . esc_html__( 'Apply coupon', 'lieve-builder' ) . '</button>'; } break;
			case 'woocommerce-checkout-v2':
				if ( empty( $node['children'] ) ) { echo do_shortcode( '[woocommerce_checkout]' ); }
				elseif ( count( array_filter( $node['children'], function( $child ) { return 0 === strpos( $child['type'], 'woocommerce-checkout-v2-state-' ); } ) ) ) { lieve_render_element_children( $node ); }
				else { lieve_commerce_checkout_form( $node ); } break;
			case 'woocommerce-checkout-customer-details': lieve_commerce_template( 'checkout/form-billing.php', array( 'checkout' => $checkout ) ); lieve_commerce_template( 'checkout/form-shipping.php', array( 'checkout' => $checkout ) ); break;
			case 'woocommerce-checkout-billing-address': lieve_commerce_template( 'checkout/form-billing.php', array( 'checkout' => $checkout ) ); break;
			case 'woocommerce-checkout-shipping-address': lieve_commerce_template( 'checkout/form-shipping.php', array( 'checkout' => $checkout ) ); break;
			case 'woocommerce-checkout-account-fields':
				foreach ( $checkout->get_checkout_fields( 'account' ) as $key => $field ) { woocommerce_form_field( $key, $field, $checkout->get_value( $key ) ); } break;
			case 'woocommerce-form-field':
				$key = sanitize_key( $p['fieldName'] ?? '' ); foreach ( $checkout->get_checkout_fields() as $fields ) { if ( isset( $fields[ $key ] ) ) { woocommerce_form_field( $key, $fields[ $key ], $checkout->get_value( $key ) ); break; } } break;
			case 'woocommerce-form-submit': case 'woocommerce-checkout-place-order': echo '<button type="submit" class="button alt" name="woocommerce_checkout_place_order" id="place_order" value="1">' . esc_html( $p['label'] ?? __( 'Place order', 'lieve-builder' ) ) . '</button>'; break;
			case 'woocommerce-shipping-options': echo '<table><tbody>'; wc_cart_totals_shipping_html(); echo '</tbody></table>'; break;
			case 'woocommerce-checkout-thankyou': case 'woocommerce-checkout-order-table': case 'woocommerce-checkout-order-payment':
				$order = lieve_commerce_current_order(); if ( $order ) { if ( 'woocommerce-checkout-thankyou' === $type ) { lieve_commerce_template( 'checkout/thankyou.php', array( 'order' => $order ) ); } elseif ( 'woocommerce-checkout-order-table' === $type ) { woocommerce_order_details_table( $order->get_id() ); } elseif ( get_query_var( 'order-pay' ) ) { echo do_shortcode( '[woocommerce_checkout]' ); } } break;
			case 'woocommerce-order-item-data':
				$order = lieve_commerce_current_order(); if ( $order ) {
					echo '<ul>'; foreach ( $order->get_items() as $item ) {
						$field = $p['dataField'] ?? 'name'; echo '<li>';
						if ( 'quantity' === $field ) { echo (int) $item->get_quantity(); }
						elseif ( 'sku' === $field ) { $product = $item->get_product(); echo $product ? esc_html( $product->get_sku() ) : ''; }
						elseif ( 'subtotal' === $field || 'price' === $field ) { echo wc_price( 'subtotal' === $field ? $item->get_subtotal() : $item->get_total() / max( 1, $item->get_quantity() ), array( 'currency' => $order->get_currency() ) ); }
						else { echo esc_html( $item->get_name() ); } echo '</li>';
					} echo '</ul>';
				} break;
			case 'woocommerce-account-page': case 'woocommerce-account-page-v2':
				if ( empty( $node['children'] ) ) { echo do_shortcode( '[woocommerce_my_account]' ); } else { lieve_render_element_children( $node ); } break;
			case 'woocommerce-account-orders': woocommerce_account_orders( max( 1, absint( get_query_var( 'orders' ) ) ) ); break;
			case 'woocommerce-account-downloads': woocommerce_account_downloads(); break;
			case 'woocommerce-account-addresses': lieve_commerce_template( 'myaccount/my-address.php' ); break;
			case 'woocommerce-account-form-edit-account': case 'woocommerce-account-edit-account-form': woocommerce_account_edit_account(); break;
			case 'woocommerce-account-form-edit-address': case 'woocommerce-account-edit-address-form': woocommerce_account_edit_address( $p['addressType'] ?? 'billing' ); break;
			case 'woocommerce-account-payment-methods': woocommerce_account_payment_methods(); break;
			case 'woocommerce-account-add-payment-method': woocommerce_account_add_payment_method(); break;
			case 'woocommerce-account-view-order': $order = lieve_commerce_current_order(); if ( $order ) { woocommerce_account_view_order( $order->get_id() ); } break;
			case 'woocommerce-account-form-login': case 'woocommerce-account-login-form': case 'woocommerce-account-form-register': case 'woocommerce-account-register-form':
				if ( ! is_user_logged_in() ) { lieve_commerce_account_form( false !== strpos( $type, 'register' ) ? 'register' : 'login' ); } break;
			case 'woocommerce-account-form-lost-password': case 'woocommerce-account-lost-password-form':
				if ( class_exists( 'WC_Shortcode_My_Account' ) ) { WC_Shortcode_My_Account::lost_password(); } break;
			case 'woocommerce-account-form-reset-password': case 'woocommerce-account-reset-password-form':
				if ( class_exists( 'WC_Shortcode_My_Account' ) ) { WC_Shortcode_My_Account::lost_password(); } break;
			case 'woocommerce-account-order-withdrawal-form':
				if ( is_wc_endpoint_url( 'order-withdrawal' ) ) { echo do_shortcode( '[woocommerce_my_account]' ); }
				else { echo '<a href="' . esc_url( wc_get_account_endpoint_url( 'order-withdrawal' ) ) . '">' . esc_html__( 'Open order withdrawal form', 'lieve-builder' ) . '</a>'; } break;
			case 'woocommerce-account-orders-pagination':
				$current = max( 1, absint( get_query_var( 'orders' ) ) ); $orders = wc_get_orders( array( 'customer' => get_current_user_id(), 'page' => $current, 'paginate' => true ) );
				if ( $current > 1 ) { echo '<a href="' . esc_url( wc_get_endpoint_url( 'orders', $current - 1, wc_get_page_permalink( 'myaccount' ) ) ) . '">' . esc_html__( 'Previous orders', 'lieve-builder' ) . '</a> '; }
				if ( $current < $orders->max_num_pages ) { echo '<a href="' . esc_url( wc_get_endpoint_url( 'orders', $current + 1, wc_get_page_permalink( 'myaccount' ) ) ) . '">' . esc_html__( 'Next orders', 'lieve-builder' ) . '</a>'; } break;
			case 'woocommerce-checkout-steps-nav': echo '<nav aria-label="Checkout steps">'; lieve_render_element_children( $node ); echo '</nav>'; break;
			case 'woocommerce-checkout-step-nav-item': echo '<button type="button" data-lieve-checkout-step-link="' . esc_attr( $p['label'] ?? '' ) . '">' . esc_html( $p['label'] ?? 'Step' ) . '</button>'; break;
			case 'woocommerce-checkout-step': echo '<section data-lieve-checkout-step="' . esc_attr( $p['label'] ?? '' ) . '">'; lieve_render_element_children( $node ); echo '</section>'; break;
			case 'woocommerce-dynamic-fragment':
				$source = $GLOBALS['lieve_document_source_id'] ?? get_the_ID();
				$instance = function_exists( 'lieve_listing_fragment_token' ) ? lieve_listing_fragment_token( $source, $node ) : '';
				echo '<div data-lieve-commerce-fragment data-fragment-post="' . (int) $source . '" data-fragment-id="' . esc_attr( $node['_lieveListingSourceId'] ?? $node['id'] ) . '" data-fragment-instance="' . esc_attr( $instance ) . '" data-fragment-endpoint="' . esc_url( WC_AJAX::get_endpoint( 'lieve_fragments' ) ) . '" data-fragment-nonce="' . esc_attr( wp_create_nonce( 'lieve_commerce_fragments' ) ) . '">'; lieve_render_element_children( $node ); echo '</div>'; break;
		}
	}
	echo '</div>'; return true;
}

function lieve_commerce_checkout_form( $node, $attributes = '' ) {
	wp_enqueue_script( 'wc-checkout' );
	$attributes = $attributes ? preg_replace( '/class="([^"]*)"/', 'class="checkout woocommerce-checkout $1"', $attributes, 1 ) : ' class="checkout woocommerce-checkout"';
	echo '<form' . $attributes . ' name="checkout" method="post" action="' . esc_url( wc_get_checkout_url() ) . '" enctype="multipart/form-data">';
	lieve_render_element_children( $node );
	wp_nonce_field( 'woocommerce-process_checkout', 'woocommerce-process-checkout-nonce' );
	echo '</form>';
}

/** Refresh saved, public fragments only; the browser cannot supply executable markup. */
function lieve_commerce_refresh_fragments() {
	if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || ! function_exists( 'WC' ) ) { wp_send_json_error( array(), 405 ); }
	check_ajax_referer( 'lieve_commerce_fragments', 'nonce' );
	nocache_headers();
	$raw = isset( $_POST['fragments'] ) && is_string( $_POST['fragments'] ) ? wp_unslash( $_POST['fragments'] ) : '';
	if ( strlen( $raw ) > 140000 ) { wp_send_json_error( array(), 413 ); }
	$requests = json_decode( $raw, true );
	if ( ! is_array( $requests ) || count( $requests ) > 20 ) { wp_send_json_error( array(), 400 ); }
	$output = array();
	foreach ( $requests as $index => $request ) {
		if ( ! is_array( $request ) || ! is_scalar( $request['postId'] ?? null ) || ! is_scalar( $request['id'] ?? null ) ) { continue; }
		$post = get_post( absint( $request['postId'] ) );
		if ( ! $post || 'publish' !== $post->post_status || post_password_required( $post ) ) { continue; }
		$document = lieve_get_document( $post->ID );
		if ( function_exists( 'lieve_components_runtime_document' ) ) { $document = lieve_components_runtime_document( $document ); }
		$node = lieve_find_document_node( $document['children'], sanitize_text_field( $request['id'] ) );
		if ( ! $node || 'woocommerce-dynamic-fragment' !== $node['type'] ) { continue; }
		$previous = $GLOBALS['lieve_document_source_id'] ?? null;
		$GLOBALS['lieve_document_source_id'] = $post->ID;
		try {
			$render = static function( $instance ) { ob_start(); try { lieve_render_element_children( $instance ); return ob_get_clean(); } catch ( Throwable $error ) { ob_end_clean(); throw $error; } };
			$token = $request['instance'] ?? '';
			$html = function_exists( 'lieve_with_listing_fragment_context' ) ? lieve_with_listing_fragment_context( $token, $post->ID, $node, $render ) : $render( $node );
			if ( ! is_wp_error( $html ) ) { $output[ $index ] = $html; }
		}
		finally { if ( null === $previous ) { unset( $GLOBALS['lieve_document_source_id'] ); } else { $GLOBALS['lieve_document_source_id'] = $previous; } }
	}
	wp_send_json_success( (object) $output );
}
add_action( 'wc_ajax_lieve_fragments', 'lieve_commerce_refresh_fragments' );

/** Keep native WooCommerce templates unless a Lieve layout explicitly applies. */
function lieve_commerce_template_include( $template ) {
	if ( ! function_exists( 'is_product' ) || is_admin() ) { return $template; }
	if ( is_product() ) {
		$id = get_queried_object_id();
		if ( lieve_builder_is_enabled( $id ) || lieve_get_matching_template_id( 'content', $id ) ) { return dirname( __DIR__, 2 ) . '/single.php'; }
	} elseif ( is_shop() || is_product_taxonomy() ) {
		if ( is_search() && lieve_get_matching_template_id( 'search' ) ) { return dirname( __DIR__, 2 ) . '/search.php'; }
		if ( lieve_get_matching_template_id( 'archive' ) ) { return dirname( __DIR__, 2 ) . '/archive.php'; }
	}
	return $template;
}
add_filter( 'template_include', 'lieve_commerce_template_include', 100 );

/** Cart rows are not a second form: the Cart Form element owns submission. */
function lieve_commerce_cart_rows( $cart ) {
	echo '<table class="shop_table cart"><thead><tr><th>' . esc_html__( 'Product', 'lieve-builder' ) . '</th><th>' . esc_html__( 'Price', 'lieve-builder' ) . '</th><th>' . esc_html__( 'Quantity', 'lieve-builder' ) . '</th><th>' . esc_html__( 'Subtotal', 'lieve-builder' ) . '</th><th>' . esc_html__( 'Remove', 'lieve-builder' ) . '</th></tr></thead><tbody>';
	foreach ( $cart->get_cart() as $key => $item ) {
		$product = $item['data'] ?? null;
		if ( ! $product || ! $product->exists() || $item['quantity'] <= 0 ) { continue; }
		echo '<tr><td><a href="' . esc_url( $product->get_permalink() ) . '">' . esc_html( $product->get_name() ) . '</a>' . wc_get_formatted_cart_item_data( $item ) . '</td><td>' . $cart->get_product_price( $product ) . '</td><td>';
		woocommerce_quantity_input( array( 'input_name' => 'cart[' . $key . '][qty]', 'input_value' => $item['quantity'], 'min_value' => 0, 'max_value' => $product->get_max_purchase_quantity() ), $product );
		echo '</td><td>' . $cart->get_product_subtotal( $product, $item['quantity'] ) . '</td><td><a href="' . esc_url( wc_get_cart_remove_url( $key ) ) . '" aria-label="' . esc_attr( sprintf( __( 'Remove %s', 'lieve-builder' ), $product->get_name() ) ) . '">' . esc_html__( 'Remove', 'lieve-builder' ) . '</a></td></tr>';
	}
	echo '</tbody></table>';
}

/** Keep WooCommerce's own fields, extension hooks and nonce in each distinct form. */
function lieve_commerce_account_form( $kind ) {
	ob_start(); lieve_commerce_template( 'myaccount/form-login.php' ); $html = ob_get_clean();
	$pattern = '~<form\b[^>]*class=["\'][^"\']*woocommerce-form-' . ( 'register' === $kind ? 'register' : 'login' ) . '\b[^"\']*["\'][^>]*>.*?</form>~is';
	if ( preg_match( $pattern, $html, $match ) ) { echo $match[0]; }
	elseif ( 'register' === $kind ) { echo esc_html__( 'Account registration is disabled in WooCommerce settings.', 'lieve-builder' ); }
}
