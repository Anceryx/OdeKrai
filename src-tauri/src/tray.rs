use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WebviewWindow,
};

const TRAY_ID: &str = "odekrai-main-tray";

#[derive(Default)]
pub struct CloseBehaviorState(AtomicBool);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CloseAction {
    Hide,
    Exit,
}

fn close_action(minimize_to_tray: bool) -> CloseAction {
    if minimize_to_tray {
        CloseAction::Hide
    } else {
        CloseAction::Exit
    }
}

pub fn install_main_close_handler(app: &AppHandle, window: &WebviewWindow) {
    let handle = app.clone();
    let main_window = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            match close_action(
                handle
                    .state::<CloseBehaviorState>()
                    .0
                    .load(Ordering::SeqCst),
            ) {
                CloseAction::Hide => {
                    api.prevent_close();
                    let _ = main_window.hide();
                }
                CloseAction::Exit => {
                    api.prevent_close();
                    shutdown(&handle);
                }
            }
        }
    });
}

fn close_auxiliary_windows(app: &AppHandle) {
    crate::providers::cancel_all(app);
    for label in ["island", "mascot", "approval"] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.destroy();
        }
    }
}

fn shutdown(app: &AppHandle) {
    close_auxiliary_windows(app);
    app.exit(0);
}

#[tauri::command]
pub async fn set_close_behavior(
    app: AppHandle,
    caller: WebviewWindow,
    minimize_to_tray: bool,
) -> Result<(), String> {
    crate::require_main(&caller)?;
    if minimize_to_tray {
        let tray_id = TRAY_ID.to_string();
        app.remove_tray_by_id(&tray_id);
        let icon = app
            .default_window_icon()
            .cloned()
            .ok_or("O ícone do aplicativo não está disponível.")?;
        let open = MenuItem::with_id(&app, "open", "Abrir", true, None::<&str>)
            .map_err(|error| error.to_string())?;
        let quit = MenuItem::with_id(&app, "quit", "Sair", true, None::<&str>)
            .map_err(|error| error.to_string())?;
        let menu = Menu::with_items(&app, &[&open, &quit]).map_err(|error| error.to_string())?;
        TrayIconBuilder::with_id(TRAY_ID)
            .icon(icon)
            .menu(&menu)
            .on_menu_event(|app, event| match event.id().as_ref() {
                "open" => show_main(app),
                "quit" => shutdown(app),
                _ => {}
            })
            .build(&app)
            .map_err(|error| error.to_string())?;
    } else {
        let tray_id = TRAY_ID.to_string();
        app.remove_tray_by_id(&tray_id);
    }
    app.state::<CloseBehaviorState>()
        .0
        .store(minimize_to_tray, Ordering::SeqCst);
    Ok(())
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::{close_action, CloseAction};

    #[test]
    fn close_behavior_maps_to_hide_or_application_exit() {
        assert_eq!(close_action(true), CloseAction::Hide);
        assert_eq!(close_action(false), CloseAction::Exit);
    }
}
