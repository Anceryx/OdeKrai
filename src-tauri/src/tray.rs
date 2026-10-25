use std::{
    future::Future,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WebviewWindow,
};

const TRAY_ID: &str = "odekrai-main-tray";
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Default)]
pub struct CloseBehaviorState(AtomicBool);

#[derive(Default)]
pub struct ShutdownState(AtomicBool);

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
    for label in ["pet", "approval"] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.destroy();
        }
    }
}

fn shutdown(app: &AppHandle) {
    if app
        .try_state::<ShutdownState>()
        .is_some_and(|state| state.0.swap(true, Ordering::SeqCst))
    {
        return;
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let timeout_handle = handle.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(SHUTDOWN_TIMEOUT).await;
            std::process::exit(0);
        });
        let cleanup =
            tauri::async_runtime::spawn_blocking(move || close_auxiliary_windows(&handle));
        if wait_for_cleanup(cleanup, SHUTDOWN_TIMEOUT).await {
            timeout_handle.exit(0);
        }
    });
}

async fn wait_for_cleanup<F: Future>(cleanup: F, timeout: Duration) -> bool {
    tokio::time::timeout(timeout, cleanup).await.is_ok()
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
        let pet = MenuItem::with_id(&app, "pet", "Mostrar/ocultar pet", true, None::<&str>)
            .map_err(|error| error.to_string())?;
        let quit = MenuItem::with_id(&app, "quit", "Sair", true, None::<&str>)
            .map_err(|error| error.to_string())?;
        let menu =
            Menu::with_items(&app, &[&open, &pet, &quit]).map_err(|error| error.to_string())?;
        TrayIconBuilder::with_id(TRAY_ID)
            .icon(icon)
            .menu(&menu)
            .on_menu_event(|app, event| match event.id().as_ref() {
                "open" => show_main(app),
                "quit" => shutdown(app),
                "pet" => {
                    let handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        crate::toggle_pet_from_tray(&handle).await;
                    });
                }
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
    use super::{close_action, wait_for_cleanup, CloseAction};
    use std::{future, time::Duration};

    #[test]
    fn close_behavior_maps_to_hide_or_application_exit() {
        assert_eq!(close_action(true), CloseAction::Hide);
        assert_eq!(close_action(false), CloseAction::Exit);
    }

    #[tokio::test]
    async fn shutdown_cleanup_respects_its_deadline() {
        assert!(!wait_for_cleanup(future::pending::<()>(), Duration::from_millis(1)).await);
        assert!(wait_for_cleanup(async {}, Duration::from_millis(50)).await);
    }
}
