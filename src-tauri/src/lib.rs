use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn set_island_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    let window = app.get_webview_window("island").ok_or("Janela Companion indisponível")?;
    if visible { window.show() } else { window.hide() }.map_err(|error| error.to_string())
}

#[tauri::command]
fn set_island_position(app: tauri::AppHandle, x: f64, y: f64, size: f64) -> Result<(), String> {
    if !x.is_finite()
        || !y.is_finite()
        || !(-100_000.0..=100_000.0).contains(&x)
        || !(-100_000.0..=100_000.0).contains(&y)
        || !(0.75..=1.5).contains(&size)
    {
        return Err("Posição ou escala inválida".into());
    }
    let window = app.get_webview_window("island").ok_or("Janela Companion indisponível")?;
    let factor = window.scale_factor().map_err(|e| e.to_string())?;
    let current_size = window.inner_size().map_err(|e| e.to_string())?;
    let height = current_size.height as f64 / factor;
    window
        .set_size(LogicalSize::new(280.0 * size, height))
        .map_err(|e| e.to_string())?;
    window.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_island_topmost(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    app.get_webview_window("island").ok_or("Janela Companion indisponível")?
        .set_always_on_top(enabled).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_island_height(app: tauri::AppHandle, size: f64, height: f64) -> Result<(), String> {
    if !(0.75..=1.5).contains(&size) || !height.is_finite() || !(100.0..=360.0).contains(&height) {
        return Err("Dimensão inválida".into());
    }
    app.get_webview_window("island").ok_or("Janela Companion indisponível")?
        .set_size(LogicalSize::new(280.0 * size, height)).map_err(|error| error.to_string())
}

#[tauri::command]
fn set_character_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    let window = app.get_webview_window("mascot").ok_or("Janela do marcador indisponível")?;
    if visible { window.show() } else { window.hide() }.map_err(|error| error.to_string())
}

#[tauri::command]
fn set_character_position(app: tauri::AppHandle, x: f64, y: f64, size: f64) -> Result<(), String> {
    if !x.is_finite()
        || !y.is_finite()
        || !(-100_000.0..=100_000.0).contains(&x)
        || !(-100_000.0..=100_000.0).contains(&y)
        || !(0.75..=1.5).contains(&size)
    {
        return Err("Posição ou escala inválida".into());
    }
    let window = app.get_webview_window("mascot").ok_or("Janela do marcador indisponível")?;
    window.set_size(LogicalSize::new(104.0 * size, 104.0 * size)).map_err(|e| e.to_string())?;
    window.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let island = WebviewWindowBuilder::new(app, "island", WebviewUrl::App("index.html".into()))
                .title("ODEKRAI Companion")
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
            let handle = app.handle().clone();
            let moved_window = island.clone();
            island.on_window_event(move |event| {
                if let tauri::WindowEvent::Moved(position) = event {
                    let scale = moved_window.scale_factor().unwrap_or(1.0);
                    let _ = handle.emit(
                        "companion-moved",
                        (position.x as f64 / scale, position.y as f64 / scale),
                    );
                }
            });
            let mascot = WebviewWindowBuilder::new(app, "mascot", WebviewUrl::App("index.html".into()))
                .title("ODEKRAI Companion")
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
            let handle = app.handle().clone();
            let moved_window = mascot.clone();
            mascot.on_window_event(move |event| {
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
        .invoke_handler(tauri::generate_handler![set_island_visible, set_island_position, set_island_topmost, set_island_height, set_character_visible, set_character_position])
        .run(tauri::generate_context!())
        .expect("falha ao iniciar o Odekrai");
}
