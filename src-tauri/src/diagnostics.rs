use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::PathBuf,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Manager, State, WebviewWindow};

pub struct StartupState {
    previous_run_incomplete: bool,
    marker: PathBuf,
    started: Instant,
}

impl StartupState {
    pub fn safe_fallback() -> Self {
        Self {
            previous_run_incomplete: true,
            marker: PathBuf::new(),
            started: Instant::now(),
        }
    }
}

pub fn setup(app: &AppHandle) -> Result<StartupState, Box<dyn std::error::Error>> {
    let app_data = app.path().app_data_dir()?;
    let logs = app_data.join("logs");
    fs::create_dir_all(&logs)?;
    let marker = app_data.join("initialization-status.txt");
    let marker_exists = marker.exists();
    let contents = if marker_exists {
        fs::read(&marker)?
    } else {
        Vec::new()
    };
    let previous_run_incomplete = previous_run_incomplete(marker_exists, &contents);
    fs::write(&marker, b"incomplete")?;
    write_log(&logs.join("diagnostic.log"), "setup_started", "")?;
    write_log(
        &logs.join("diagnostic.log"),
        "build",
        &format!(
            "version={} commit={} date={} webview_version={}",
            env!("CARGO_PKG_VERSION"),
            option_env!("ODEKRAI_BUILD_COMMIT").unwrap_or("local"),
            option_env!("ODEKRAI_BUILD_DATE").unwrap_or("não definida"),
            tauri::webview_version().unwrap_or_else(|_| "unavailable".into())
        ),
    )?;
    Ok(StartupState {
        previous_run_incomplete,
        marker,
        started: Instant::now(),
    })
}

pub fn log_event(app: &AppHandle, event: &str, command: &str, outcome: &str, duration_ms: u64) {
    let Ok(logs) = app.path().app_data_dir().map(|path| path.join("logs")) else {
        return;
    };
    let fields = format!(
        "event={} command={} outcome={} duration_ms={duration_ms}",
        safe_token(event),
        safe_token(command),
        safe_token(outcome),
    );
    let _ = write_log(&logs.join("diagnostic.log"), "frontend_event", &fields);
}

pub fn log_setup_complete(app: &AppHandle) {
    let duration_ms = app
        .try_state::<StartupState>()
        .map(|state| state.started.elapsed().as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or_default();
    log_event(app, "setup_complete", "", "ok", duration_ms);
}

fn write_log(path: &PathBuf, event: &str, details: &str) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let timestamp = timestamp_utc(SystemTime::now());
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    writeln!(file, "{timestamp} {event} {details}")
}

fn timestamp_utc(now: SystemTime) -> String {
    let elapsed = now.duration_since(UNIX_EPOCH).unwrap_or_default();
    let days = (elapsed.as_secs() / 86_400) as i64;
    let seconds_in_day = elapsed.as_secs() % 86_400;
    let shifted_days = days + 719_468;
    let era = if shifted_days >= 0 {
        shifted_days
    } else {
        shifted_days - 146_096
    } / 146_097;
    let day_of_era = shifted_days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_part = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_part + 2) / 5 + 1;
    let month = month_part + if month_part < 10 { 3 } else { -9 };
    if month <= 2 {
        year += 1;
    }
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        seconds_in_day / 3_600,
        (seconds_in_day % 3_600) / 60,
        seconds_in_day % 60,
        elapsed.subsec_millis()
    )
}

fn safe_token(input: &str) -> String {
    input
        .chars()
        .take(64)
        .map(|character| {
            if character.is_ascii_alphanumeric() || "_.-".contains(character) {
                character
            } else {
                '_'
            }
        })
        .collect()
}

fn is_safe_diagnostic(event: &str, command: &str, outcome: &str) -> bool {
    let event_allowed = matches!(
        event,
        "startup_command_start"
            | "startup_command_finish"
            | "frontend_window_error"
            | "frontend_unhandled_rejection"
    );
    let command_allowed = matches!(
        command,
        "get_build_info"
            | "set_close_behavior"
            | "get_startup_state"
            | "get_selected_pet"
            | "get_permission_settings"
            | "get_profile"
            | "agent_home_status"
            | "list_conversations"
            | "has_provider_credential"
            | "load_conversation"
            | "agent_home_read_core"
            | "set_island_position"
            | "set_island_topmost"
            | "set_island_visible"
            | "set_character_position"
            | "set_character_visible"
            | "complete_startup"
            | "window.onerror"
            | "unhandledrejection"
    );
    event_allowed && command_allowed && matches!(outcome, "ok" | "error")
}

fn previous_run_incomplete(marker_exists: bool, contents: &[u8]) -> bool {
    marker_exists && contents != b"complete"
}

#[tauri::command]
pub async fn get_startup_state(
    caller: WebviewWindow,
    state: State<'_, StartupState>,
) -> Result<bool, String> {
    crate::require_main(&caller)?;
    Ok(state.previous_run_incomplete)
}

#[tauri::command]
pub async fn complete_startup(
    app: AppHandle,
    caller: WebviewWindow,
    state: State<'_, StartupState>,
) -> Result<(), String> {
    crate::require_main(&caller)?;
    let marker = state.marker.clone();
    let duration_ms = state.started.elapsed().as_millis().min(u64::MAX as u128) as u64;
    tauri::async_runtime::spawn_blocking(move || fs::write(marker, b"complete"))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())?;
    log_event(&app, "startup_complete", "", "ok", duration_ms);
    Ok(())
}

#[tauri::command]
pub async fn record_diagnostic_event(
    app: AppHandle,
    caller: WebviewWindow,
    event: String,
    command: String,
    outcome: String,
    duration_ms: u64,
) -> Result<(), String> {
    crate::require_main(&caller)?;
    if !is_safe_diagnostic(&event, &command, &outcome) {
        return Err("Evento de diagnóstico inválido.".into());
    }
    let event = safe_token(&event);
    let command = safe_token(&command);
    let outcome = safe_token(&outcome);
    tauri::async_runtime::spawn_blocking(move || {
        log_event(&app, &event, &command, &outcome, duration_ms)
    })
    .await
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_tokens_remove_payload_characters_and_limit_length() {
        assert_eq!(safe_token("get_profile: segredo"), "get_profile__segredo");
        assert_eq!(safe_token(&"x".repeat(100)).len(), 64);
    }

    #[test]
    fn diagnostic_events_reject_free_text() {
        assert!(is_safe_diagnostic("startup_command", "get_profile", "ok"));
        assert!(!is_safe_diagnostic(
            "startup_command",
            "texto da conversa",
            "ok"
        ));
        assert!(!is_safe_diagnostic(
            "startup_command",
            "get_profile",
            "mensagem secreta"
        ));
    }

    #[test]
    fn initialization_marker_distinguishes_complete_and_incomplete() {
        assert!(!previous_run_incomplete(false, b""));
        assert!(!previous_run_incomplete(true, b"complete"));
        assert!(previous_run_incomplete(true, b"incomplete"));
    }

    #[test]
    fn log_timestamp_is_readable_utc() {
        assert_eq!(timestamp_utc(UNIX_EPOCH), "1970-01-01T00:00:00.000Z");
    }
}
