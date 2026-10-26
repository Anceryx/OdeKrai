use tauri::{
    Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

#[derive(serde::Serialize)]
struct BuildInfo {
    version: String,
    commit: &'static str,
    build_date: &'static str,
    webview_version: String,
}

#[tauri::command]
fn get_build_info(caller: tauri::WebviewWindow) -> Result<BuildInfo, String> {
    require_main(&caller)?;
    Ok(BuildInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        commit: option_env!("ODEKRAI_BUILD_COMMIT").unwrap_or("local"),
        build_date: option_env!("ODEKRAI_BUILD_DATE").unwrap_or("não definida"),
        webview_version: tauri::webview_version().map_err(|error| error.to_string())?,
    })
}

pub mod agent;
mod agent_home;
mod diagnostics;
mod history;
mod policy;
mod profile;
mod providers;
mod security;
mod tray;
mod window_sizing;

fn require_main(window: &tauri::WebviewWindow) -> Result<(), String> {
    require_caller(window, &["main"])
}

fn require_caller(window: &tauri::WebviewWindow, allowed: &[&str]) -> Result<(), String> {
    if caller_label_allowed(window.label(), allowed) {
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
        assert!(!caller_label_allowed("pet", &["approval"]));
    }
}

#[cfg(test)]
mod window_config_tests {
    use serde_json::Value;

    #[test]
    fn main_window_uses_requested_default_and_minimum_size() {
        let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let main = &config["app"]["windows"][0];

        assert_eq!(main["width"], 1250);
        assert_eq!(main["height"], 700);
        assert_eq!(main["minWidth"], 1000);
        assert_eq!(main["minHeight"], 600);
        assert_eq!(main["center"], true);
    }
}

#[cfg(test)]
mod feature_window_lifecycle_tests {
    use super::{visibility_action, VisibilityAction};

    #[test]
    fn disabled_feature_windows_are_closed_and_absent_windows_are_not_created() {
        assert_eq!(visibility_action(false, false), VisibilityAction::Noop);
        assert_eq!(visibility_action(false, true), VisibilityAction::Close);
        assert_eq!(
            visibility_action(true, false),
            VisibilityAction::CreateOrShow
        );
        assert_eq!(
            visibility_action(true, true),
            VisibilityAction::CreateOrShow
        );
    }
}

#[cfg(test)]
mod pet_position_tests {
    use super::clamp_window_position;

    #[test]
    fn pet_position_is_limited_to_work_area_including_negative_monitor_origins() {
        assert_eq!(
            clamp_window_position(4000.0, -400.0, -1920.0, 40.0, 1920.0, 1040.0, 300.0, 180.0),
            (-300.0, 40.0)
        );
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum VisibilityAction {
    CreateOrShow,
    Close,
    Noop,
}

fn visibility_action(visible: bool, exists: bool) -> VisibilityAction {
    match (visible, exists) {
        (true, _) => VisibilityAction::CreateOrShow,
        (false, true) => VisibilityAction::Close,
        (false, false) => VisibilityAction::Noop,
    }
}

fn clamp_window_position(
    x: f64,
    y: f64,
    left: f64,
    top: f64,
    work_width: f64,
    work_height: f64,
    window_width: f64,
    window_height: f64,
) -> (f64, f64) {
    (
        x.clamp(left, (left + work_width - window_width).max(left)),
        y.clamp(top, (top + work_height - window_height).max(top)),
    )
}

async fn ensure_pet_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window("pet") {
        return Ok(window);
    }
    let window = WebviewWindowBuilder::new(app, "pet", WebviewUrl::App("index.html".into()))
        .title("Pet do OdeKrai")
        .inner_size(280.0, 150.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .focusable(true)
        .resizable(false)
        .skip_taskbar(true)
        .visible(false)
        .build()
        .map_err(|_| "Não foi possível preparar a janela do pet.".to_string())?;
    let handle = app.clone();
    let moved_window = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Moved(position) = event {
            let scale = moved_window.scale_factor().unwrap_or(1.0);
            if let Ok(Some(monitor)) = moved_window.current_monitor() {
                if let (Ok(size), Ok(_)) = (moved_window.inner_size(), moved_window.scale_factor())
                {
                    let work = monitor.work_area();
                    let x = position.x as f64 / scale;
                    let y = position.y as f64 / scale;
                    let (x, y) = clamp_window_position(
                        x,
                        y,
                        work.position.x as f64 / scale,
                        work.position.y as f64 / scale,
                        work.size.width as f64 / scale,
                        work.size.height as f64 / scale,
                        size.width as f64 / scale,
                        size.height as f64 / scale,
                    );
                    if (x - position.x as f64 / scale).abs() > 1.0
                        || (y - position.y as f64 / scale).abs() > 1.0
                    {
                        let _ = moved_window.set_position(LogicalPosition::new(x, y));
                    }
                }
            }
            let _ = handle.emit(
                "pet-moved",
                (position.x as f64 / scale, position.y as f64 / scale),
            );
        }
    });
    Ok(window)
}

pub(crate) async fn toggle_pet_from_tray(app: &tauri::AppHandle) {
    match app.get_webview_window("pet") {
        Some(window) if window.is_visible().unwrap_or(false) => {
            let _ = window.hide();
        }
        _ => {
            if let Ok(window) = ensure_pet_window(app).await {
                let _ = window.show();
            }
        }
    }
}

#[tauri::command]
async fn set_pet_visible(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    visible: bool,
) -> Result<(), String> {
    require_caller(&caller, &["main", "pet"])?;
    let existing = app.get_webview_window("pet");
    match visibility_action(visible, existing.is_some()) {
        VisibilityAction::CreateOrShow => ensure_pet_window(&app).await?.show(),
        VisibilityAction::Close => existing
            .ok_or("Janela do pet indisponível para fechar.")?
            .close(),
        VisibilityAction::Noop => Ok(()),
    }
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_pet_position(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    x: f64,
    y: f64,
    size: f64,
) -> Result<(), String> {
    require_caller(&caller, &["main", "pet"])?;
    if !x.is_finite()
        || !y.is_finite()
        || !(-100_000.0..=100_000.0).contains(&x)
        || !(-100_000.0..=100_000.0).contains(&y)
        || !(0.75..=1.5).contains(&size)
    {
        return Err("Posição ou escala inválida".into());
    }
    let window = ensure_pet_window(&app).await?;
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or("Não foi possível localizar o monitor do pet.")?;
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    let work = monitor.work_area();
    let current = window.inner_size().map_err(|error| error.to_string())?;
    let width = current.width as f64 / scale;
    let height = current.height as f64 / scale;
    let left = work.position.x as f64 / scale;
    let top = work.position.y as f64 / scale;
    let (x, y) = clamp_window_position(
        x,
        y,
        left,
        top,
        work.size.width as f64 / scale,
        work.size.height as f64 / scale,
        width,
        height,
    );
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_pet_topmost(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    require_caller(&caller, &["main", "pet"])?;
    if let Some(window) = app.get_webview_window("pet") {
        window
            .set_always_on_top(enabled)
            .map_err(|error| error.to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
async fn set_pet_size(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    width: f64,
    height: f64,
) -> Result<(), String> {
    require_caller(&caller, &["main", "pet"])?;
    if !width.is_finite()
        || !height.is_finite()
        || !(100.0..=420.0).contains(&width)
        || !(100.0..=360.0).contains(&height)
    {
        return Err("Dimensão inválida".into());
    }
    let window = app
        .get_webview_window("pet")
        .ok_or("Janela do pet indisponível")?;
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|error| error.to_string())?;
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or("Não foi possível localizar o monitor do pet.")?;
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let actual_size = window.inner_size().map_err(|error| error.to_string())?;
    let work = monitor.work_area();
    let (x, y) = clamp_window_position(
        position.x as f64 / scale,
        position.y as f64 / scale,
        work.position.x as f64 / scale,
        work.position.y as f64 / scale,
        work.size.width as f64 / scale,
        work.size.height as f64 / scale,
        actual_size.width as f64 / scale,
        actual_size.height as f64 / scale,
    );
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|error| error.to_string())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> Result<(), tauri::Error> {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
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
        .manage(tray::CloseBehaviorState::default())
        .manage(tray::ShutdownState::default())
        .setup(|app| {
            let startup_state = diagnostics::setup(app.handle()).unwrap_or_else(|error| {
                log::error!("Não foi possível preparar o estado de inicialização: {error}");
                diagnostics::StartupState::safe_fallback()
            });
            app.manage(startup_state);
            if let Some(window) = app.get_webview_window("main") {
                window_sizing::fit_main_window(&window).map_err(std::io::Error::other)?;
                tray::install_main_close_handler(app.handle(), &window);
            }
            let halted = security::load_halted(app.handle());
            if let Some(state) = app.try_state::<security::SecurityState>() {
                state.set_initial_halted(halted);
            }
            security::init_shortcut(app.handle());
            diagnostics::log_setup_complete(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_build_info,
            diagnostics::get_startup_state,
            diagnostics::complete_startup,
            diagnostics::record_diagnostic_event,
            set_pet_visible,
            set_pet_position,
            set_pet_topmost,
            set_pet_size,
            tray::set_close_behavior,
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
            providers::get_provider_capabilities,
            profile::get_profile,
            profile::save_profile,
            profile::save_profile_avatar,
            profile::remove_profile_avatar,
            history::list_conversations,
            history::load_conversation,
            history::append_conversation_message,
            history::delete_conversation,
            history::rename_conversation,
            history::delete_all_conversations,
            history::get_selected_pet,
            history::get_pet_mode,
            history::set_pet_mode,
            history::set_selected_pet,
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
            agent_home::agent_home_open_folder,
            agent_home::agent_home_change_path,
            agent_home::agent_home_read_core,
            agent_home::agent_home_save_core,
            agent_home::agent_memory_list,
            agent_home::agent_memory_read,
            agent_home::agent_memory_save,
            agent_home::agent_memory_delete,
            agent_home::agent_memory_delete_all,
        ])
        .run(tauri::generate_context!())
}
