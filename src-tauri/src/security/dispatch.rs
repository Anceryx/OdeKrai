use super::*;

pub(super) fn action_metadata(
    action: &SimulatedAction,
) -> (&'static str, Risk, bool, Option<&'static str>) {
    let tool = tool_for(action);
    let workspace_action = matches!(
        action,
        SimulatedAction::ReadFile { .. }
            | SimulatedAction::WriteFile { .. }
            | SimulatedAction::DeleteFile { .. }
    );
    let fixed = match action {
        SimulatedAction::Payment { .. } => Some("fixed_block_payment"),
        SimulatedAction::ReadFile { path } | SimulatedAction::DeleteFile { path } => {
            protected_path_block(path)
        }
        SimulatedAction::WriteFile { path, content } => protected_path_block(path)
            .or_else(|| contains_secret_marker(content).then_some("fixed_block_secret_storage")),
        SimulatedAction::SendMessage { message, .. } if contains_secret_marker(message) => {
            Some("fixed_block_secret_exfiltration")
        }
        _ => None,
    };
    (tool.name(), tool.risk(action), workspace_action, fixed)
}

pub(super) fn summary(action: &SimulatedAction) -> String {
    match action {
        SimulatedAction::ReadFile { path } | SimulatedAction::DeleteFile { path } => {
            format!("{}: {}", tool_for(action).name(), path)
        }
        SimulatedAction::WriteFile { path, content } => {
            format!("Salvar arquivo: {path} ({} bytes)", content.len())
        }
        SimulatedAction::SendMessage { recipient, .. } => {
            format!("Mensagem simulada para {}", clipped(recipient, 200))
        }
        SimulatedAction::Payment {
            amount_cents,
            currency,
        } => format!("Pagamento bloqueado: {currency} {amount_cents}"),
    }
}

pub(super) fn audit_params(action: &SimulatedAction) -> String {
    match action {
        SimulatedAction::ReadFile { path } | SimulatedAction::DeleteFile { path } => {
            format!("path={path}")
        }
        SimulatedAction::WriteFile { path, content } => format!(
            "path={path}; bytes={}; sha256={}; prefix={}",
            content.len(),
            digest(content.as_bytes()),
            if contains_secret_marker(content) {
                "[redigido]".into()
            } else {
                clipped(content, 64)
            }
        ),
        SimulatedAction::SendMessage { recipient, message } => format!(
            "recipient={}; bytes={}; sha256={}; prefix={}",
            clipped(recipient, 200),
            message.len(),
            digest(message.as_bytes()),
            if contains_secret_marker(message) {
                "[redigido]".into()
            } else {
                clipped(message, 64)
            }
        ),
        SimulatedAction::Payment {
            amount_cents,
            currency,
        } => format!("amount_cents={amount_cents}; currency={currency}"),
    }
}

pub(super) fn preview_for(
    app: &tauri::AppHandle,
    action: &SimulatedAction,
) -> Result<String, String> {
    let workspace = if matches!(
        action,
        SimulatedAction::ReadFile { .. }
            | SimulatedAction::WriteFile { .. }
            | SimulatedAction::DeleteFile { .. }
    ) {
        agent_home::workspace_path(app)?
    } else {
        PathBuf::new()
    };
    if matches!(action, SimulatedAction::WriteFile { .. }) {
        return Ok(format!(
            "Destino no workspace:\n{}\n\n{}",
            preview_target(&workspace, action_path(action)?)?.display(),
            tool_for(action).preview(action, &workspace)?
        ));
    }
    tool_for(action).preview(action, &workspace)
}

pub(super) fn append_audit(
    app: &tauri::AppHandle,
    state: &SecurityState,
    mut payload: AuditPayload,
) -> Result<(), String> {
    let _lock = state
        .audit_lock
        .lock()
        .map_err(|_| "Trava da auditoria indisponível; ação bloqueada.".to_string())?;
    let logs = agent_home::audit_logs_path(app)?;
    let mut previous = String::new();
    if let Some(last) = verify_audit_path(&logs)?.last() {
        previous = last.hash.clone();
    }
    payload.previous_hash = previous;
    let serialized = serde_json::to_vec(&payload)
        .map_err(|_| "Não foi possível preparar a auditoria; ação bloqueada.".to_string())?;
    let line = AuditLine {
        hash: digest(&serialized),
        payload,
    };
    let day = now_secs() / 86_400;
    let path = logs.join(format!("{day}.jsonl"));
    if has_reparse(&path) {
        return Err("O arquivo de auditoria foi redirecionado; ação bloqueada.".into());
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|_| "Não foi possível gravar auditoria; ação bloqueada.".to_string())?;
    serde_json::to_writer(&mut file, &line)
        .map_err(|_| "Não foi possível gravar auditoria; ação bloqueada.".to_string())?;
    file.write_all(b"\n")
        .and_then(|_| file.sync_data())
        .map_err(|_| "Não foi possível confirmar a auditoria; ação bloqueada.".to_string())
}

#[allow(clippy::too_many_arguments)]
pub(super) fn record(
    app: &tauri::AppHandle,
    state: &SecurityState,
    id: &str,
    tool: &str,
    risk: Risk,
    origin: &Origin,
    decision: &str,
    rule: &str,
    approval: &str,
    latency: u64,
    params_summary: String,
    status: &str,
    error: Option<String>,
) -> Result<(), String> {
    let mode = effective_mode(app)?;
    let origin = match origin {
        Origin::User => "usuário".to_string(),
        Origin::Model => "modelo".to_string(),
        Origin::ExternalContent(source) => format!("conteúdo externo: {}", clipped(source, 120)),
    };
    append_audit(
        app,
        state,
        AuditPayload {
            timestamp: now_secs(),
            id: id.into(),
            tool: tool.into(),
            risk,
            mode,
            origin,
            decision: decision.into(),
            rule_id: rule.into(),
            approval: approval.into(),
            latency_ms: latency,
            params_summary,
            status: status.into(),
            error,
            previous_hash: String::new(),
        },
    )
}

pub(super) fn allowed_rate(state: &SecurityState, tool: &dyn Tool) -> Result<bool, String> {
    let mut rate = state
        .rate
        .lock()
        .map_err(|_| "Limite de frequência indisponível.".to_string())?;
    let now = Instant::now();
    let entries = rate.entry(tool.name().into()).or_default();
    while entries
        .front()
        .is_some_and(|at| now.duration_since(*at) > Duration::from_secs(60))
    {
        entries.pop_front();
    }
    if entries.len() >= tool.rate_limit_per_minute() {
        return Ok(false);
    }
    entries.push_back(now);
    Ok(true)
}

pub(super) fn execute_action(
    action: &SimulatedAction,
    app: &tauri::AppHandle,
) -> Result<String, String> {
    let workspace_action = matches!(
        action,
        SimulatedAction::ReadFile { .. }
            | SimulatedAction::WriteFile { .. }
            | SimulatedAction::DeleteFile { .. }
    );
    let workspace = if workspace_action {
        agent_home::workspace_path(app)?
    } else {
        PathBuf::new()
    };
    let tool = tool_for(action);
    let started = Instant::now();
    let result = tool.execute(action, &workspace);
    if started.elapsed() > tool.timeout() {
        return Err("A ferramenta simulada excedeu o tempo limite.".into());
    }
    result
}

pub(super) fn submit_simulated_action_inner(
    app: tauri::AppHandle,
    state: State<'_, SecurityState>,
    request: ActionRequest,
) -> Result<ActionResult, String> {
    submit_action(&app, &state, request.action, Origin::User)
}

pub(super) fn submit_action(
    app: &tauri::AppHandle,
    state: &SecurityState,
    action: SimulatedAction,
    origin: Origin,
) -> Result<ActionResult, String> {
    if state.is_halted() {
        return Err(
            "O OdeKrai está parado. Retome na janela principal para permitir novas ações.".into(),
        );
    }
    let (tool_name, risk, inside, fixed) = action_metadata(&action);
    let id = id();
    let summary = summary(&action);
    if let Err(error) = validate_action(&action) {
        record(
            app,
            state,
            &id,
            tool_name,
            risk,
            &origin,
            "deny",
            "fixed_invalid_parameters",
            "not_required",
            0,
            audit_params(&action),
            "denied",
            Some(error.clone()),
        )?;
        return Ok(ActionResult {
            id,
            status: "denied".into(),
            message: error,
            result: None,
        });
    }
    let preview = match preview_for(app, &action) {
        Ok(preview) => preview,
        Err(error) => {
            record(
                app,
                state,
                &id,
                tool_name,
                risk,
                &origin,
                "deny",
                "target_validation_failed",
                "not_required",
                0,
                audit_params(&action),
                "denied",
                Some(error.clone()),
            )?;
            return Ok(ActionResult {
                id,
                status: "denied".into(),
                message: error,
                result: None,
            });
        }
    };
    let mode = effective_mode(app)?;
    let override_on = override_enabled(app, tool_name)?;
    let decision = policy::decide(mode, risk, &origin, inside, fixed, override_on);
    let (decision_name, rule) = match decision {
        Decision::Allow(rule) => ("allow", rule),
        Decision::AskUser(rule) => ("ask_user", rule),
        Decision::Deny(rule) => ("deny", rule),
    };
    if matches!(&decision, Decision::Deny(_)) {
        record(
            app,
            state,
            &id,
            tool_name,
            risk,
            &origin,
            decision_name,
            rule,
            "not_required",
            0,
            audit_params(&action),
            "denied",
            Some(rule.into()),
        )?;
        return Ok(ActionResult {
            id,
            status: "denied".into(),
            message: format!("Ação bloqueada pela regra {rule}."),
            result: None,
        });
    }
    if !allowed_rate(state, tool_for(&action))? {
        record(
            app,
            state,
            &id,
            tool_name,
            risk,
            &origin,
            "deny",
            "rate_limit",
            "not_required",
            0,
            audit_params(&action),
            "denied",
            Some("Limite de frequência excedido".into()),
        )?;
        return Ok(ActionResult {
            id,
            status: "denied".into(),
            message: "Limite de frequência da ferramenta atingido.".into(),
            result: None,
        });
    }
    match decision {
        Decision::Allow(rule) => {
            record(
                app,
                state,
                &id,
                tool_name,
                risk,
                &origin,
                "allow",
                rule,
                "not_required",
                0,
                audit_params(&action),
                "started",
                None,
            )?;
            let result = execute_action(&action, app);
            let status = if result.is_ok() {
                "completed"
            } else {
                "failed"
            };
            let error = result.as_ref().err().cloned();
            record(
                app,
                state,
                &id,
                tool_name,
                risk,
                &origin,
                "allow",
                rule,
                "not_required",
                0,
                audit_params(&action),
                status,
                error.clone(),
            )?;
            Ok(ActionResult {
                id,
                status: status.into(),
                message: error.unwrap_or_else(|| "Ação concluída.".into()),
                result: result.ok(),
            })
        }
        Decision::AskUser(rule) => {
            let mut pending = lock_pending(state)?;
            if !queue_has_capacity(&pending) {
                drop(pending);
                record(
                    app,
                    state,
                    &id,
                    tool_name,
                    risk,
                    &origin,
                    "deny",
                    "approval_queue_full",
                    "denied",
                    0,
                    audit_params(&action),
                    "denied",
                    Some("Fila de aprovação cheia".into()),
                )?;
                return Ok(ActionResult {
                    id,
                    status: "denied".into(),
                    message: "Fila de aprovação cheia; a ação foi negada.".into(),
                    result: None,
                });
            }
            let digest = digest(
                serde_json::to_string(&action)
                    .map_err(|_| "Não foi possível validar os parâmetros.")?
                    .as_bytes(),
            );
            let ttl = db_setting(app, "approval_ttl_seconds")?
                .parse::<u64>()
                .map_err(|_| "Prazo de aprovação inválido; a ação foi bloqueada.")?;
            if !(MIN_APPROVAL_TTL..=MAX_APPROVAL_TTL).contains(&ttl) {
                return Err("Prazo de aprovação inválido; a ação foi bloqueada.".into());
            }
            let approval_ttl = Duration::from_secs(ttl);
            let expires_at = now_secs() + approval_ttl.as_secs();
            record(
                app,
                state,
                &id,
                tool_name,
                risk,
                &origin,
                "ask_user",
                rule,
                "pending",
                0,
                audit_params(&action),
                "awaiting_approval",
                None,
            )?;
            pending.push_back(PendingAction {
                id: id.clone(),
                action: action.clone(),
                origin: origin.clone(),
                risk,
                rule,
                summary,
                preview,
                digest: digest.clone(),
                expires: Instant::now() + approval_ttl,
                expires_at,
                created_at: Instant::now(),
            });
            drop(pending);
            if let Err(error) = open_approval(app) {
                match lock_pending(state) {
                    Ok(mut pending) => pending.retain(|item| item.id != id),
                    Err(_) => log::error!(
                        "Não foi possível limpar a aprovação após falha ao abrir a janela."
                    ),
                }
                let _ = record(
                    app,
                    state,
                    &id,
                    tool_name,
                    risk,
                    &origin,
                    "deny",
                    "approval_window_failed",
                    "unavailable",
                    0,
                    audit_params(&action),
                    "denied",
                    Some(error.clone()),
                );
                return Err(error);
            }
            let _ = app.emit("approval-updated", ());
            let _ = app.emit("companion-state", serde_json::json!({"type":"activity","state":"awaiting_approval","message":"Aguardando aprovação"}));
            Ok(ActionResult {
                id,
                status: "awaiting_approval".into(),
                message: "Ação aguardando aprovação na janela do OdeKrai.".into(),
                result: None,
            })
        }
        Decision::Deny(_) => Ok(ActionResult {
            id,
            status: "denied".into(),
            message: "A ação foi bloqueada pelas regras de segurança.".into(),
            result: None,
        }),
    }
}

pub(super) fn open_approval(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("approval") {
        window
            .show()
            .and_then(|_| window.set_focus())
            .map_err(|_| "Não foi possível mostrar a janela de aprovação.".to_string())?;
        return Ok(());
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = create_approval_window(&handle).await {
            log::error!("Falha ao criar janela de aprovação: {error}");
            let _ = handle.emit(
                "security-error",
                "Não foi possível abrir a janela de aprovação.",
            );
        }
    });
    Ok(())
}

async fn create_approval_window(app: &tauri::AppHandle) -> Result<(), String> {
    let window = WebviewWindowBuilder::new(app, "approval", WebviewUrl::App("index.html".into()))
        .title("Aprovação de ação — OdeKrai")
        .inner_size(560.0, 620.0)
        .min_inner_size(420.0, 420.0)
        .always_on_top(true)
        .focusable(true)
        .focused(true)
        .resizable(true)
        .skip_taskbar(false)
        .build()
        .map_err(|_| "Não foi possível abrir a janela de aprovação.".to_string())?;
    let handle = app.clone();
    let close_window = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let Some(state) = handle.try_state::<SecurityState>() else {
                let _ = close_window.destroy();
                return;
            };
            let (item, has_more) = match state.pending.try_lock() {
                Ok(mut queue) => {
                    let item = queue.pop_front();
                    (item, !queue.is_empty())
                }
                Err(_) => {
                    let _ = handle.emit(
                        "security-error",
                        "A fila de aprovação está ocupada; tente fechar novamente.",
                    );
                    return;
                }
            };
            if has_more {
                if let Some(item) = item {
                    let _ = handle.emit("approval-updated", ());
                    let _ = close_window.set_focus();
                    let audit_handle = handle.clone();
                    tauri::async_runtime::spawn_blocking(move || {
                        if let Some(state) = audit_handle.try_state::<SecurityState>() {
                            let _ = record(
                                &audit_handle,
                                &state,
                                &item.id,
                                tool_for(&item.action).name(),
                                item.risk,
                                &item.origin,
                                "deny",
                                "approval_window_closed",
                                "denied",
                                item.created_at.elapsed().as_millis() as u64,
                                audit_params(&item.action),
                                "denied",
                                None,
                            );
                        }
                    });
                }
            } else {
                let audit_handle = handle.clone();
                let destroy_window = close_window.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    if let Some(item) = item {
                        if let Some(state) = audit_handle.try_state::<SecurityState>() {
                            let _ = record(
                                &audit_handle,
                                &state,
                                &item.id,
                                tool_for(&item.action).name(),
                                item.risk,
                                &item.origin,
                                "deny",
                                "approval_window_closed",
                                "denied",
                                item.created_at.elapsed().as_millis() as u64,
                                audit_params(&item.action),
                                "denied",
                                None,
                            );
                        }
                    }
                    let _ = destroy_window.destroy();
                });
            }
        }
    });
    Ok(())
}

pub(super) fn get_pending_approval_inner(
    app: tauri::AppHandle,
    state: State<'_, SecurityState>,
) -> Result<Option<PendingView>, String> {
    let mut pending = lock_pending(&state)?;
    while pending
        .front()
        .is_some_and(|item| is_expired(item.expires, Instant::now()))
    {
        let Some(expired) = pending.pop_front() else {
            log::error!("A fila de aprovação mudou durante a expiração; consulta bloqueada.");
            return Err("Fila de aprovação indisponível.".into());
        };
        let tool = tool_for(&expired.action).name();
        record(
            &app,
            &state,
            &expired.id,
            tool,
            expired.risk,
            &expired.origin,
            "deny",
            "approval_expired",
            "expired",
            expired.created_at.elapsed().as_millis() as u64,
            audit_params(&expired.action),
            "denied",
            Some("Aprovação expirou".into()),
        )?;
    }
    let Some(item) = pending.front() else {
        drop(pending);
        close_approval_if_empty(&app, &state);
        return Ok(None);
    };
    Ok(Some(PendingView {
        id: item.id.clone(),
        tool: tool_for(&item.action).name().into(),
        risk: item.risk,
        origin: match &item.origin {
            Origin::User => "Ação solicitada pelo usuário".into(),
            Origin::Model => "Ação proposta pelo modelo".into(),
            Origin::ExternalContent(source) => {
                format!("Veio de conteúdo externo: {}", clipped(source, 120))
            }
        },
        summary: item.summary.clone(),
        full_preview: item.preview.chars().count() > 4_000,
        preview: clipped(&item.preview, 4_000),
        expires_at: item.expires_at,
        display_hash: item.digest.clone(),
    }))
}

pub(super) fn get_full_approval_preview_inner(
    app: tauri::AppHandle,
    state: State<'_, SecurityState>,
    id: String,
    display_hash: String,
) -> Result<String, String> {
    let pending = lock_pending(&state)?;
    let item = pending
        .front()
        .ok_or("A aprovação não está mais disponível.")?;
    if item.id != id || item.digest != display_hash {
        return Err("A prévia não corresponde à ação pendente.".into());
    }
    if !display_hash_matches(&item.action, &item.digest, &display_hash) {
        return Err("Os parâmetros mudaram; a prévia foi bloqueada.".into());
    }
    let preview = preview_for(&app, &item.action)?;
    if preview.len() > 16 * 1024 {
        return Err("A prévia excede o limite de 16 KiB.".into());
    }
    Ok(preview)
}

pub(super) fn approval_respond_inner(
    app: tauri::AppHandle,
    state: State<'_, SecurityState>,
    id: String,
    display_hash: String,
    approve: bool,
) -> Result<ActionResult, String> {
    let mut pending = lock_pending(&state)?;
    let Some(item) = pending.front() else {
        return Err("A aprovação não está mais disponível.".into());
    };
    if item.id != id {
        return Err("A aprovação está desatualizada.".into());
    }
    if !display_hash_matches(&item.action, &item.digest, &display_hash) {
        return Err("Os parâmetros exibidos mudaram; a ação foi recusada.".into());
    }
    let item = take_pending_approval(&mut pending, &id, &display_hash)
        .map_err(|_| "A aprovação não corresponde à ação pendente.".to_string())?;
    drop(pending);
    let tool = tool_for(&item.action).name();
    if is_expired(item.expires, Instant::now()) || state.is_halted() || !approve {
        let reason = if is_expired(item.expires, Instant::now()) {
            "approval_expired"
        } else if state.is_halted() {
            "kill_switch"
        } else {
            "user_denied"
        };
        record(
            &app,
            &state,
            &item.id,
            tool,
            item.risk,
            &item.origin,
            "deny",
            reason,
            if approve {
                "expired_or_halted"
            } else {
                "denied"
            },
            item.created_at.elapsed().as_millis() as u64,
            audit_params(&item.action),
            "denied",
            None,
        )?;
        close_approval_if_empty(&app, &state);
        return Ok(ActionResult {
            id: item.id,
            status: "denied".into(),
            message: "Ação negada.".into(),
            result: None,
        });
    }
    record(
        &app,
        &state,
        &item.id,
        tool,
        item.risk,
        &item.origin,
        "allow",
        item.rule,
        "approved_once",
        item.created_at.elapsed().as_millis() as u64,
        audit_params(&item.action),
        "started",
        None,
    )?;
    let result = execute_action(&item.action, &app);
    let error = result.as_ref().err().cloned();
    let status = if error.is_some() {
        "failed"
    } else {
        "completed"
    };
    record(
        &app,
        &state,
        &item.id,
        tool,
        item.risk,
        &item.origin,
        "allow",
        item.rule,
        "approved_once",
        item.created_at.elapsed().as_millis() as u64,
        audit_params(&item.action),
        status,
        error.clone(),
    )?;
    close_approval_if_empty(&app, &state);
    let has_pending = lock_pending(&state).map_or_else(|_| true, |queue| !queue.is_empty());
    let next_activity = if has_pending {
        "awaiting_approval"
    } else if status == "completed" {
        "completed"
    } else {
        "error"
    };
    let _ = app.emit(
        "companion-state",
        serde_json::json!({"type":"activity","state":next_activity}),
    );
    Ok(ActionResult {
        id: item.id,
        status: status.into(),
        message: error.unwrap_or_else(|| "Ação aprovada e concluída.".into()),
        result: result.ok(),
    })
}

pub(super) fn close_approval_if_empty(app: &tauri::AppHandle, state: &SecurityState) {
    if lock_pending(state).is_ok_and(|pending| pending.is_empty()) {
        if let Some(window) = app.get_webview_window("approval") {
            let _ = window.close();
        }
    }
}
