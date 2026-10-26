use tauri::{
    ipc::{CallbackFn, InvokeBody},
    test::{get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY},
    utils::acl::ExecutionContext,
    webview::InvokeRequest,
    Manager, WebviewUrl, WebviewWindowBuilder,
};

#[tauri::command]
async fn create_auxiliary_window(app: tauri::AppHandle<MockRuntime>) -> Result<(), String> {
    WebviewWindowBuilder::new(&app, "auxiliary", WebviewUrl::App("index.html".into()))
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[test]
fn async_window_command_builds_a_mock_webview() {
    let mut context = mock_context(noop_assets());
    context
        .runtime_authority_mut()
        .__allow_command("create_auxiliary_window".into(), ExecutionContext::Local);
    let app = mock_builder()
        .invoke_handler(tauri::generate_handler![create_auxiliary_window])
        .build(context)
        .expect("mock Tauri app should build");
    let main = WebviewWindowBuilder::new(&app, "main", WebviewUrl::App("index.html".into()))
        .build()
        .expect("mock main window should build");
    let response = get_ipc_response(
        &main,
        InvokeRequest {
            cmd: "create_auxiliary_window".into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: "http://tauri.localhost"
                .parse()
                .expect("mock origin should parse"),
            body: InvokeBody::default(),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    );

    assert!(response.is_ok(), "resposta IPC inválida: {response:?}");
    assert!(app.get_webview_window("auxiliary").is_some());
}
