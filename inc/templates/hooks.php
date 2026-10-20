<?php
/** Hook registrations in their established order. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'init', 'lieve_register_templates', 5 );
add_action( 'add_meta_boxes_' . LIEVE_TEMPLATE_POST_TYPE, 'lieve_add_template_type_meta_box' );
add_action( 'save_post_' . LIEVE_TEMPLATE_POST_TYPE, 'lieve_save_template_type' );
add_action( 'admin_menu', 'lieve_register_dashboard_menu', 5 );
add_action( 'admin_menu', 'lieve_register_settings_submenu', 20 );
add_action( 'load-admin_page_lieve-new-template', 'lieve_load_new_template_page' );
add_filter( 'admin_title', 'lieve_management_admin_title' );
add_action( 'load-post-new.php', 'lieve_redirect_native_template_creation' );
add_action( 'admin_enqueue_scripts', 'lieve_template_admin_assets' );
add_action( 'all_admin_notices', 'lieve_render_template_library_header', 0 );
add_action( 'admin_post_lieve_create_template', 'lieve_handle_create_template' );
add_filter( 'manage_' . LIEVE_TEMPLATE_POST_TYPE . '_posts_columns', 'lieve_template_admin_columns' );
add_action( 'restrict_manage_posts', 'lieve_template_type_filter_dropdown' );
add_action( 'pre_get_posts', 'lieve_template_type_filter_query' );
add_action( 'manage_' . LIEVE_TEMPLATE_POST_TYPE . '_posts_custom_column', 'lieve_template_admin_column_content', 10, 2 );
add_filter( 'get_edit_post_link', 'lieve_template_visual_edit_link', 10, 2 );
add_filter( 'post_row_actions', 'lieve_template_visual_row_actions', 20, 2 );
add_action( 'admin_footer', 'lieve_template_list_conditions_modal' );
add_action( 'rest_api_init', 'lieve_register_template_routes' );
add_action( 'template_redirect', 'lieve_register_conditional_section_hooks' );
add_action( 'rest_api_init', 'lieve_register_template_library_routes' );
add_action( 'all_admin_notices', 'lieve_template_library_notices', 10 );
add_filter( 'post_type_labels_lieve_template', 'lieve_template_empty_messages' );
