use std::{
    future::Future,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, Runtime, WebviewWindow,
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
                    if let Err(error) = main_window.hide() {
                        log::warn!("Não foi possível ocultar a janela principal: {error}");
                    }
                }
                CloseAction::Exit => {
                    api.prevent_close();
                    shutdown(&handle);
                }
            }
        }
    });
}

async fn close_auxiliary_windows(app: &AppHandle) {
    crate::providers::cancel_all(app);
    if let Some(state) = app.try_state::<crate::security::SecurityState>() {
        state.approval_broker.deny_all().await;
        let mut runs = state.agent_runs.lock().await;
        for token in runs.values() {
            token.cancel();
        }
        runs.clear();
    }
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
        let cleanup_handle = handle.clone();
        let exit_handle = handle.clone();
        let completed = finalize_after_cleanup(
            close_auxiliary_windows(&cleanup_handle),
            SHUTDOWN_TIMEOUT,
            move |cleanup_completed| {
                if !cleanup_completed {
                    log::error!(
                        "A limpeza excedeu o prazo; encerrando pelo ciclo normal do Tauri."
                    );
                }
                exit_handle.remove_tray_by_id(TRAY_ID);
                exit_handle.exit(0);
            },
        )
        .await;
        if !completed {
            log::warn!("O encerramento prosseguiu após o prazo de limpeza.");
        }
    });
}

async fn wait_for_cleanup<F: Future>(cleanup: F, timeout: Duration) -> bool {
    tokio::time::timeout(timeout, cleanup).await.is_ok()
}

async fn finalize_after_cleanup<F, C>(cleanup: F, timeout: Duration, finalize: C) -> bool
where
    F: Future,
    C: FnOnce(bool),
{
    let completed = wait_for_cleanup(cleanup, timeout).await;
    finalize(completed);
    completed
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

pub(crate) fn show_main<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        log::warn!("A instância existente não tem janela principal para restaurar.");
        return;
    };
    for (operation, result) in [
        ("desminimizar", window.unminimize()),
        ("mostrar", window.show()),
        ("focar", window.set_focus()),
    ] {
        if let Err(error) = result {
            log::warn!("Não foi possível {operation} a janela principal: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{close_action, finalize_after_cleanup, show_main, wait_for_cleanup, CloseAction};
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use std::{future, time::Duration};
    use tauri::{
        test::{mock_builder, mock_context, noop_assets, MockRuntime},
        Manager, WebviewUrl, WebviewWindowBuilder,
    };

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

    #[tokio::test]
    async fn shutdown_finalizes_after_successful_cleanup() {
        let finalized = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&finalized);
        let completed = finalize_after_cleanup(async {}, Duration::from_millis(50), move |clean| {
            assert!(clean);
            flag.store(true, Ordering::SeqCst);
        })
        .await;

        assert!(completed);
        assert!(finalized.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn shutdown_still_finalizes_after_cleanup_timeout() {
        let finalized = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&finalized);
        let completed = finalize_after_cleanup(
            future::pending::<()>(),
            Duration::from_millis(1),
            move |clean| {
                assert!(!clean);
                flag.store(true, Ordering::SeqCst);
            },
        )
        .await;

        assert!(!completed);
        assert!(finalized.load(Ordering::SeqCst));
    }

    #[test]
    fn restoring_main_window_unminimizes_shows_and_focuses_it() {
        let app = mock_builder()
            .build(mock_context(noop_assets()))
            .expect("mock Tauri app should build");
        let window = WebviewWindowBuilder::<MockRuntime, _>::new(
            &app,
            "main",
            WebviewUrl::App("index.html".into()),
        )
        .build()
        .expect("mock main window should build");
        window.hide().expect("window should hide");
        window.minimize().expect("window should minimize");

        let handle = app.handle();
        show_main(&handle);

        let restored = app
            .get_webview_window("main")
            .expect("main window should remain registered");
        assert!(restored
            .is_visible()
            .expect("visibility should be readable"));
        assert!(!restored
            .is_minimized()
            .expect("minimized state should be readable"));
    }
}
