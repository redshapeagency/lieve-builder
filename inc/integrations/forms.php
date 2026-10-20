<?php
/** Contact forms: server-owned field definitions, validation and mail delivery. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function lieve_contact_fields( $node ) {
	$fields = array();
	foreach ( array_slice( lieve_element_items( $node['props']['items'] ?? '', 6 ), 0, 20 ) as $index => $item ) {
		$type = in_array( $item[1] ?? '', array( 'text', 'email', 'textarea', 'number', 'checkbox', 'select', 'radio', 'tel', 'url', 'date', 'time', 'hidden' ), true ) ? $item[1] : 'text';
		$options = array_values( array_unique( array_filter( array_map( 'trim', explode( ',', $item[3] ?? '' ) ), static function( $value ) { return '' !== $value; } ) ) );
		$fields[] = array( 'name' => 'field_' . $index, 'label' => $item[0], 'type' => $type, 'required' => 'required' === ( $item[2] ?? '' ), 'options' => array_slice( $options, 0, 100 ), 'placeholder' => $item[4] ?? '', 'default' => $item[5] ?? '' );
	}
	return $fields;
}

function lieve_render_contact_form( $node, $attributes ) {
	$preview = ! empty( $GLOBALS['lieve_element_preview'] );
	$post_id = $node['_lieveComponentPostId'] ?? ( $GLOBALS['lieve_document_source_id'] ?? get_the_ID() );
	// Repeated instances have unique DOM IDs but share a server-owned field definition.
	$source_id = $node['_lieveComponentOriginalId'] ?? ( $node['_lieveListingSourceId'] ?? $node['id'] );
	echo '<form' . $attributes . ' data-lieve-contact-form data-form-reset="' . ( false !== ( $node['props']['resetOnSuccess'] ?? true ) ? 'true' : 'false' ) . '" data-endpoint="' . esc_url( rest_url( 'lieve/v1/form' ) ) . '" method="post">';
	if ( ! empty( $node['props']['title'] ) ) { echo '<h3>' . esc_html( $node['props']['title'] ) . '</h3>'; }
	foreach ( lieve_contact_fields( $node ) as $field ) {
		$id = 'lieve-' . lieve_element_number( $node['id'] ) . '-' . $field['name'];
		$attrs = ' id="' . esc_attr( $id ) . '" name="' . esc_attr( $field['name'] ) . '"' . ( $field['required'] ? ' required' : '' );
		if ( 'hidden' === $field['type'] ) { echo '<input type="hidden" name="' . esc_attr($field['name']) . '" value="' . esc_attr($field['default']) . '">'; continue; }
		if ( 'radio' === $field['type'] ) { echo '<fieldset><legend>' . esc_html($field['label']) . '</legend>'; foreach($field['options'] as $choice) { echo '<label><input type="radio" name="' . esc_attr($field['name']) . '" value="' . esc_attr($choice) . '"' . ($field['required']?' required':'') . ($choice===$field['default']?' checked':'') . '>' . esc_html($choice) . '</label>'; } echo '</fieldset>'; continue; }
		echo '<div><label for="' . esc_attr( $id ) . '">' . esc_html( $field['label'] ) . '</label>';
		$placeholder = $field['placeholder'] ? ' placeholder="' . esc_attr($field['placeholder']) . '"' : '';
		if ( 'textarea' === $field['type'] ) { echo '<textarea' . $attrs . $placeholder . ' maxlength="10000">' . esc_html($field['default']) . '</textarea>'; }
		elseif ( 'select' === $field['type'] ) { echo '<select' . $attrs . '><option value="">' . esc_html($field['placeholder'] ?: 'Choose an option') . '</option>'; foreach($field['options'] as $choice) { echo '<option value="' . esc_attr($choice) . '"' . ($choice===$field['default']?' selected':'') . '>' . esc_html($choice) . '</option>'; } echo '</select>'; }
		else { echo '<input type="' . esc_attr( $field['type'] ) . '"' . $attrs . $placeholder . ( 'checkbox' === $field['type'] ? ' value="1"' . ($field['default']==='1'?' checked':'') : ' maxlength="2000" value="' . esc_attr($field['default']) . '"' ) . '>'; }
		echo '</div>';
	}
	// Preserve logged-in REST identity as well as the public form-specific nonce.
	echo '<input type="hidden" name="_wpnonce" value="' . esc_attr( $preview ? '' : wp_create_nonce( 'wp_rest' ) ) . '">';
	echo '<input type="hidden" name="post_id" value="' . (int) $post_id . '"><input type="hidden" name="element_id" value="' . esc_attr( $source_id ) . '"><input type="hidden" name="form_nonce" value="' . esc_attr( $preview ? '' : wp_create_nonce( 'lieve_form_' . $post_id . '_' . $source_id ) ) . '"><input type="text" name="company_website" hidden tabindex="-1" autocomplete="off"><button type="submit"' . ( $preview ? ' disabled' : '' ) . '>' . esc_html( $node['props']['label'] ?? 'Send message' ) . '</button><p role="status" aria-live="polite" data-lieve-form-status></p></form>';
}

add_action( 'rest_api_init', function() {
	register_rest_route( 'lieve/v1', '/form', array( 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'lieve_submit_contact_form', 'permission_callback' => '__return_true' ) );
} );

function lieve_submit_contact_form( $request ) {
	foreach ( array( 'post_id', 'element_id', 'form_nonce' ) as $key ) { if ( ! isset( $request[ $key ] ) || ! is_scalar( $request[ $key ] ) ) { return new WP_Error( 'lieve_invalid_form', __( 'Please reload the page and try again.', 'lieve-builder' ), array( 'status' => 403 ) ); } }
	$post_id = absint( $request['post_id'] ); $element_id = sanitize_text_field( $request['element_id'] );
	$post = get_post( $post_id );
	if ( ! $post || 'publish' !== $post->post_status || ! empty( $post->post_password ) || ! wp_verify_nonce( $request['form_nonce'], 'lieve_form_' . $post_id . '_' . $element_id ) ) { return new WP_Error( 'lieve_invalid_form', __( 'Please reload the page and try again.', 'lieve-builder' ), array( 'status' => 403 ) ); }
	if ( ! empty( $request['company_website'] ) ) { return new WP_Error( 'lieve_form_rejected', __( 'Submission rejected.', 'lieve-builder' ), array( 'status' => 400 ) ); }
	$document = lieve_get_document( $post_id ); $node = lieve_find_document_node( $document['children'], $element_id );
	if ( ! $node || 'form' !== $node['type'] ) { return new WP_Error( 'lieve_missing_form', __( 'Form not found.', 'lieve-builder' ), array( 'status' => 404 ) ); }
	$rate_key = 'lieve_form_' . substr( hash_hmac( 'sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown', wp_salt() ), 0, 32 );
	$attempts = (int) get_transient( $rate_key );
	if ( $attempts >= 5 ) { return new WP_Error( 'lieve_form_rate', __( 'Please wait a few minutes before trying again.', 'lieve-builder' ), array( 'status' => 429 ) ); }
	set_transient( $rate_key, $attempts + 1, 10 * MINUTE_IN_SECONDS );
	$body = array(); $reply = ''; $fields = lieve_contact_fields( $node );
	if ( ! $fields ) { return new WP_Error( 'lieve_empty_form', __( 'This form has no configured fields.', 'lieve-builder' ), array( 'status' => 400 ) ); }
	foreach ( $fields as $field ) {
		$value = 'hidden' === $field['type'] ? $field['default'] : ( $request[ $field['name'] ] ?? '' ); if ( ! is_scalar( $value ) ) { return new WP_Error( 'lieve_form_validation', sprintf( __( 'Please check the %s field.', 'lieve-builder' ), $field['label'] ), array( 'status' => 400 ) ); }
		$value = sanitize_textarea_field( substr( (string) $value, 0, 10000 ) );
		if ( ( $field['required'] && ( '' === trim( $value ) || ( 'checkbox' === $field['type'] && '1' !== $value ) ) ) || ( 'email' === $field['type'] && '' !== $value && ! is_email( $value ) ) || ( 'number' === $field['type'] && '' !== $value && ! is_numeric( $value ) ) ) { return new WP_Error( 'lieve_form_validation', sprintf( __( 'Please check the %s field.', 'lieve-builder' ), $field['label'] ), array( 'status' => 400 ) ); }
		if ( 'email' === $field['type'] && is_email( $value ) ) { $reply = sanitize_email( $value ); }
		if ( '' !== $value && ( in_array($field['type'],array('select','radio'),true) && !in_array($value,$field['options'],true) || 'url' === $field['type'] && !filter_var($value,FILTER_VALIDATE_URL) || 'date' === $field['type'] && !lieve_form_date_valid($value) || 'time' === $field['type'] && !preg_match('/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/D',$value) ) ) { return new WP_Error('lieve_form_validation',sprintf(__('Please check the %s field.','lieve-builder'),$field['label']),array('status'=>400)); }
		$body[] = $field['label'] . ': ' . $value;
	}
	$headers = $reply ? array( 'Reply-To: ' . $reply ) : array();
	$sent = wp_mail( get_option( 'admin_email' ), sanitize_text_field( ( $node['props']['subject'] ?? '' ) ?: ( $node['props']['title'] ?? 'Website contact form' ) ), implode( "\n\n", $body ), $headers );
	if ( ! $sent ) { return new WP_Error( 'lieve_form_mail', __( 'The message could not be delivered. Please try again later.', 'lieve-builder' ), array( 'status' => 500 ) ); }
	$result = array( 'message' => $node['props']['successMessage'] ?? __( 'Thank you. Your message has been sent.', 'lieve-builder' ) );
	if ( ! empty($node['props']['redirectUrl']) && function_exists('wp_validate_redirect') ) { $url = wp_validate_redirect($node['props']['redirectUrl'],''); if ( preg_match( '#^/(?!/)#', $url ) ) { $url = home_url( $url ); } if($url && wp_parse_url($url,PHP_URL_HOST) === wp_parse_url(home_url('/'),PHP_URL_HOST))$result['redirectUrl']=$url; }
	return rest_ensure_response( $result );
}

function lieve_form_date_valid( $value ) { return (bool) preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D',$value,$parts) && checkdate((int)$parts[2],(int)$parts[3],(int)$parts[1]); }
