use super::*;

const DEFAULT_SHORTCUT: &str = "Ctrl+Shift+F12";

fn set_halted(
    app: &tauri::AppHandle,
    state: &SecurityState,
    halted: bool,
    reason: &'static str,
) -> Result<(), String> {
    if halted {
        state.halted.store(true, Ordering::SeqCst);
        let persistence = set_db_setting(app, "halted", "true");
        crate::providers::cancel_all(app);
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Some(state) = handle.try_state::<SecurityState>() {
                state.approval_broker.stop_all().await;
                let mut runs = state.agent_runs.lock().await;
                for token in runs.values() {
                    token.cancel();
                }
                runs.clear();
            }
        });
        let mut pending = state
            .pending
            .lock()
            .map_err(|_| "Fila de aprovação indisponível.".to_string())?;
        pending.clear();
        drop(pending);
        if let Some(window) = app.get_webview_window("approval") {
            let _ = window.close();
        }
        let _ = app.emit("companion-state",serde_json::json!({"type":"activity","state":"paused","message":"Parado pelo kill switch"}));
        let _ = crate::pet_alerts::enqueue_agent_activity(app, "paused");
        let _ = app.emit("security-halted", ());
        let request_id = id();
        let origin = Origin::User;
        let audit = record(
            app,
            state,
            &request_id,
            "security.kill_switch",
            Risk::Leitura,
            &origin,
            "halt",
            reason,
            "not_required",
            0,
            "{}".into(),
            "halted",
            None,
        );
        return persistence.and(audit);
    }
    if !state.is_halted() {
        return Ok(());
    }
    let request_id = id();
    let origin = Origin::User;
    record(
        app,
        state,
        &request_id,
        "security.kill_switch",
        Risk::Leitura,
        &origin,
        "resume",
        reason,
        "not_required",
        0,
        "{}".into(),
        "resumed",
        None,
    )?;
    set_db_setting(app, "halted", "false")?;
    state.halted.store(false, Ordering::SeqCst);
    let _ = app.emit("companion-state", serde_json::json!({"type":"reveal"}));
    let _ = app.emit("security-resumed", ());
    Ok(())
}

pub(super) fn halt_all_inner(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    state: State<'_, SecurityState>,
) -> Result<(), String> {
    crate::require_main(&caller)?;
    set_halted(&app, &state, true, "user_halt")
}

pub(super) fn resume_all_inner(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    state: State<'_, SecurityState>,
) -> Result<(), String> {
    crate::require_main(&caller)?;
    set_halted(&app, &state, false, "user_resume")
}

pub fn on_global_shortcut(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<SecurityState>() {
        if let Err(error) = set_halted(app, &state, true, "global_shortcut") {
            let _ = app.emit("security-error", error);
        }
    }
}

pub fn init_shortcut(app: &tauri::AppHandle) {
    let shortcut = db_setting(app, "shortcut").unwrap_or_else(|_| DEFAULT_SHORTCUT.into());
    if let Err(error) = app.global_shortcut().register(shortcut.as_str()) {
        if let Some(state) = app.try_state::<SecurityState>() {
            if let Ok(mut status) = state.shortcut_error.lock() {
                *status = Some(format!("Atalho não registrado: {error}"));
            }
        }
    }
}

pub fn load_halted(app: &tauri::AppHandle) -> bool {
    db_setting(app, "halted")
        .map(|value| value == "true")
        .unwrap_or(true)
}
