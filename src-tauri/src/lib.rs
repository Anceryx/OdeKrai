use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

mod agent_home;
mod history;
mod policy;
mod profile;
mod providers;
mod security;

fn require_main(window: &tauri::WebviewWindow) -> Result<(), String> {
    require_caller(window, &["main"])
}

fn require_caller(window: &tauri::WebviewWindow, allowed: &[&str]) -> Result<(), String> {
    if caller_label_allowed(&window.label(), allowed) {
        Ok(())
    } else {
        Err("Comando indisponível para esta janela.".into())
    }
}

fn caller_label_allowed(label: &str, allowed: &[&str]) -> bool {
    allowed.contains(&label)
}

#[cfg(test)]
mod security_caller_tests {
    use super::caller_label_allowed;

    #[test]
    fn approval_commands_only_accept_the_approval_window() {
        assert!(caller_label_allowed("approval", &["approval"]));
        assert!(!caller_label_allowed("main", &["approval"]));
        assert!(!caller_label_allowed("island", &["approval"]));
        assert!(!caller_label_allowed("mascot", &["approval"]));
    }
}

#[cfg(windows)]
fn apply_click_region(
    window: &tauri::WebviewWindow,
    inset: f64,
    corner_radius: f64,
) -> Result<(), String> {
    use std::{ffi::c_void, io};

    #[link(name = "gdi32")]
    unsafe extern "system" {
        fn CreateRoundRectRgn(
            left: i32,
            top: i32,
            right: i32,
            bottom: i32,
            ellipse_width: i32,
            ellipse_height: i32,
        ) -> *mut c_void;
        fn DeleteObject(object: *mut c_void) -> i32;
    }
    #[link(name = "user32")]
    unsafe extern "system" {
        fn SetWindowRgn(window: *mut c_void, region: *mut c_void, redraw: i32) -> i32;
    }

    let size = window.inner_size().map_err(|error| error.to_string())?;
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    let hwnd = window.hwnd().map_err(|error| error.to_string())?.0;
    let inset = (inset * scale).round() as i32;
    let radius = (corner_radius * scale).round() as i32;
    let region = unsafe {
        CreateRoundRectRgn(
            inset,
            inset,
            size.width as i32 - inset,
            size.height as i32 - inset,
            radius * 2,
            radius * 2,
        )
    };
    if region.is_null() {
        return Err(io::Error::last_os_error().to_string());
    }

    // SetWindowRgn takes ownership of the region after a successful call.
    if unsafe { SetWindowRgn(hwnd, region, 1) } == 0 {
        let error = io::Error::last_os_error();
        unsafe { DeleteObject(region) };
        return Err(error.to_string());
    }
    Ok(())
}

#[cfg(not(windows))]
fn apply_click_region(
    _window: &tauri::WebviewWindow,
    _inset: f64,
    _corner_radius: f64,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn set_island_visible(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    visible: bool,
) -> Result<(), String> {
    require_caller(&caller, &["main", "island", "mascot"])?;
    let window = app
        .get_webview_window("island")
        .ok_or("Janela do assistente indisponível")?;
    if visible {
        window.show()
    } else {
        window.hide()
    }
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_island_position(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    x: f64,
    y: f64,
    size: f64,
) -> Result<(), String> {
    require_caller(&caller, &["main", "mascot"])?;
    if !x.is_finite()
        || !y.is_finite()
        || !(-100_000.0..=100_000.0).contains(&x)
        || !(-100_000.0..=100_000.0).contains(&y)
        || !(0.75..=1.5).contains(&size)
    {
        return Err("Posição ou escala inválida".into());
    }
    let window = app
        .get_webview_window("island")
        .ok_or("Janela do assistente indisponível")?;
    let factor = window.scale_factor().map_err(|e| e.to_string())?;
    let current_size = window.inner_size().map_err(|e| e.to_string())?;
    let height = current_size.height as f64 / factor;
    window
        .set_size(LogicalSize::new(280.0 * size, height))
        .map_err(|e| e.to_string())?;
    apply_click_region(&window, 5.0, 34.0)?;
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_island_topmost(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    require_caller(&caller, &["main", "mascot"])?;
    app.get_webview_window("island")
        .ok_or("Janela do assistente indisponível")?
        .set_always_on_top(enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_island_height(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    size: f64,
    height: f64,
) -> Result<(), String> {
    require_caller(&caller, &["main", "island"])?;
    if !(0.75..=1.5).contains(&size) || !height.is_finite() || !(100.0..=360.0).contains(&height) {
        return Err("Dimensão inválida".into());
    }
    let window = app
        .get_webview_window("island")
        .ok_or("Janela do assistente indisponível")?;
    window
        .set_size(LogicalSize::new(280.0 * size, height))
        .map_err(|error| error.to_string())?;
    apply_click_region(&window, 5.0, 34.0)
}

#[tauri::command]
fn set_character_visible(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    visible: bool,
) -> Result<(), String> {
    require_caller(&caller, &["main", "island", "mascot"])?;
    let window = app
        .get_webview_window("mascot")
        .ok_or("Janela do marcador indisponível")?;
    if visible {
        window.show()
    } else {
        window.hide()
    }
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_character_position(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    x: f64,
    y: f64,
    size: f64,
) -> Result<(), String> {
    require_caller(&caller, &["main", "island"])?;
    if !x.is_finite()
        || !y.is_finite()
        || !(-100_000.0..=100_000.0).contains(&x)
        || !(-100_000.0..=100_000.0).contains(&y)
        || !(0.75..=1.5).contains(&size)
    {
        return Err("Posição ou escala inválida".into());
    }
    let window = app
        .get_webview_window("mascot")
        .ok_or("Janela do marcador indisponível")?;
    window
        .set_size(LogicalSize::new(104.0 * size, 104.0 * size))
        .map_err(|e| e.to_string())?;
    apply_click_region(&window, 8.0, 26.0)?;
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        security::on_global_shortcut(app);
                    }
                })
                .build(),
        )
        .manage(providers::ProviderRequests::default())
        .manage(security::SecurityState::new(true))
        .setup(|app| {
            let halted = security::load_halted(app.handle());
            if let Some(state) = app.try_state::<security::SecurityState>() {
                state.set_initial_halted(halted);
            }
            security::init_shortcut(app.handle());
            let island =
                WebviewWindowBuilder::new(app, "island", WebviewUrl::App("index.html".into()))
                    .title("Ilha do OdeKrai")
                    .inner_size(280.0, 150.0)
                    .decorations(false)
                    .transparent(true)
                    .always_on_top(true)
                    .focusable(false)
                    .focused(false)
                    .resizable(false)
                    .skip_taskbar(true)
                    .visible(false)
                    .build()?;
            apply_click_region(&island, 5.0, 34.0).map_err(std::io::Error::other)?;
            let handle = app.handle().clone();
            let moved_window = island.clone();
            island.on_window_event(move |event| {
                if matches!(
                    event,
                    tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. }
                ) {
                    let _ = apply_click_region(&moved_window, 5.0, 34.0);
                }
                if let tauri::WindowEvent::Moved(position) = event {
                    let scale = moved_window.scale_factor().unwrap_or(1.0);
                    let _ = handle.emit(
                        "companion-moved",
                        (position.x as f64 / scale, position.y as f64 / scale),
                    );
                }
            });
            let mascot =
                WebviewWindowBuilder::new(app, "mascot", WebviewUrl::App("index.html".into()))
                    .title("OdeKrai")
                    .inner_size(104.0, 104.0)
                    .decorations(false)
                    .transparent(true)
                    .always_on_top(true)
                    .focusable(false)
                    .focused(false)
                    .resizable(false)
                    .skip_taskbar(true)
                    .visible(false)
                    .build()?;
            apply_click_region(&mascot, 8.0, 26.0).map_err(std::io::Error::other)?;
            let handle = app.handle().clone();
            let moved_window = mascot.clone();
            mascot.on_window_event(move |event| {
                if matches!(
                    event,
                    tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. }
                ) {
                    let _ = apply_click_region(&moved_window, 8.0, 26.0);
                }
                if let tauri::WindowEvent::Moved(position) = event {
                    let scale = moved_window.scale_factor().unwrap_or(1.0);
                    let _ = handle.emit(
                        "character-moved",
                        (position.x as f64 / scale, position.y as f64 / scale),
                    );
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_island_visible,
            set_island_position,
            set_island_topmost,
            set_island_height,
            set_character_visible,
            set_character_position,
            providers::save_provider_credential,
            providers::has_provider_credential,
            providers::remove_provider_credential,
            providers::send_provider_message,
            providers::cancel_provider_request,
            providers::stream_provider_message,
            providers::validate_provider_endpoint,
            providers::list_provider_models,
            providers::test_provider_connection,
            providers::ping_provider,
            profile::get_profile,
            profile::save_profile,
            profile::save_profile_avatar,
            profile::remove_profile_avatar,
            history::list_conversations,
            history::load_conversation,
            history::append_conversation_message,
            history::delete_conversation,
            history::delete_all_conversations,
            security::get_permission_settings,
            security::set_permission_mode,
            security::set_tool_override,
            security::set_kill_shortcut,
            security::set_approval_ttl,
            security::halt_all,
            security::resume_all,
            security::list_audit,
            security::verify_audit,
            security::get_pending_approval,
            security::get_full_approval_preview,
            security::approval_respond,
            #[cfg(debug_assertions)]
            security::submit_simulated_action,
            agent_home::agent_home_status,
            agent_home::agent_home_init,
            agent_home::agent_home_read_core,
            agent_home::agent_home_save_core,
            agent_home::agent_memory_list,
            agent_home::agent_memory_read,
            agent_home::agent_memory_save,
            agent_home::agent_memory_delete,
            agent_home::agent_memory_delete_all,
        ])
        .run(tauri::generate_context!())
        .expect("falha ao iniciar o OdeKrai");
}
