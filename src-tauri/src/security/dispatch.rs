use super::*;

pub(super) fn action_metadata(
    action: &SimulatedAction,
) -> (&str, Risk, bool, Option<&'static str>) {
    let tool = tool_for(action);
    let workspace_action = match action {
        SimulatedAction::ReadFile { .. }
        | SimulatedAction::WriteFile { .. }
        | SimulatedAction::DeleteFile { .. } => true,
        SimulatedAction::FilesList { .. }
        | SimulatedAction::FilesSearch { .. }
        | SimulatedAction::FilesRead { .. } => true,
        SimulatedAction::Productivity { skill_id, .. } => skill_id != "web.fetch",
        _ => false,
    };
    let fixed = match action {
        SimulatedAction::Payment { .. } => Some("fixed_block_payment"),
        SimulatedAction::ReadFile { path } | SimulatedAction::DeleteFile { path } => {
            protected_path_block(path)
        }
        SimulatedAction::FilesRead { path } => protected_path_block(path),
        SimulatedAction::FilesList { path, .. } | SimulatedAction::FilesSearch { path, .. } => {
            protected_path_block(path)
        }
        SimulatedAction::WriteFile { path, content } => protected_path_block(path)
            .or_else(|| contains_secret_marker(content).then_some("fixed_block_secret_storage")),
        SimulatedAction::SendMessage { message, .. } if contains_secret_marker(message) => {
            Some("fixed_block_secret_exfiltration")
        }
        SimulatedAction::Productivity { skill_id, params } if skill_id.starts_with("files.") => {
            let raw = params
                .get("path")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("");
            protected_path_block(raw).or_else(|| {
                params
                    .get("content")
                    .and_then(serde_json::Value::as_str)
                    .is_some_and(contains_secret_marker)
                    .then_some("fixed_block_secret_storage")
            })
        }
        SimulatedAction::Productivity { skill_id, params } if skill_id == "mail.draft" => {
            let sensitive_text = ["to", "subject", "body"]
                .iter()
                .filter_map(|key| params.get(*key).and_then(serde_json::Value::as_str))
                .collect::<Vec<_>>()
                .join("\n");
            contains_secret_marker(&sensitive_text).then_some("fixed_block_secret_exfiltration")
        }
        _ => None,
    };
    let tool_name = match action {
        SimulatedAction::Productivity { skill_id, .. } => match skill_id.as_str() {
            "files.write" | "files.append" | "files.mkdir" | "files.copy" | "files.move"
            | "files.rename" | "files.delete" | "files.apply_plan" => skill_id,
            "calendar.create_event" => "calendar.create_event",
            "doc.create_markdown" => "doc.create_markdown",
            "doc.create_text" => "doc.create_text",
            "sheet.create_csv" => "sheet.create_csv",
            "mail.draft" => "mail.draft",
            "web.fetch" => "web.fetch",
            _ => "productivity",
        },
        _ => tool.name(),
    };
    (tool_name, tool.risk(action), workspace_action, fixed)
}

fn require_batch_approval(action: &SimulatedAction, decision: Decision) -> Decision {
    if matches!(action, SimulatedAction::Productivity { skill_id, .. } if skill_id == "files.apply_plan")
        && matches!(decision, Decision::Allow(_))
    {
        Decision::AskUser("batch_requires_approval")
    } else {
        decision
    }
}

pub(super) fn summary(action: &SimulatedAction) -> String {
    match action {
        SimulatedAction::ReadFile { path } | SimulatedAction::DeleteFile { path } => {
            format!("{}: {}", tool_for(action).name(), path)
        }
        SimulatedAction::FilesRead { path } | SimulatedAction::FilesList { path, .. } => {
            format!("{}: {}", tool_for(action).name(), path)
        }
        SimulatedAction::FilesSearch { path, query, .. } => format!(
            "{} em {} por {}",
            tool_for(action).name(),
            path,
            clipped(query, 128)
        ),
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
        SimulatedAction::Productivity { skill_id, params } => format!(
            "{skill_id}: {}",
            params
                .get("path")
                .or_else(|| params.get("url"))
                .and_then(serde_json::Value::as_str)
                .unwrap_or("")
        ),
    }
}

pub(super) fn audit_params(action: &SimulatedAction) -> String {
    match action {
        SimulatedAction::ReadFile { path } | SimulatedAction::DeleteFile { path } => {
            format!("path={path}")
        }
        SimulatedAction::FilesRead { path } | SimulatedAction::FilesList { path, .. } => {
            format!("path={path}")
        }
        SimulatedAction::FilesSearch { path, query, .. } => {
            format!(
                "path={path}; query_bytes={}; query_sha256={}",
                query.len(),
                digest(query.as_bytes())
            )
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
        SimulatedAction::Productivity { skill_id, params } => format!(
            "skill={skill_id}; params_sha256={}; bytes={}",
            digest(params.to_string().as_bytes()),
            params.to_string().len()
        ),
    }
}

pub(super) fn preview_for(
    app: &tauri::AppHandle,
    action: &SimulatedAction,
) -> Result<String, String> {
    let workspace_action = match action {
        SimulatedAction::ReadFile { .. }
        | SimulatedAction::WriteFile { .. }
        | SimulatedAction::DeleteFile { .. }
        | SimulatedAction::FilesList { .. }
        | SimulatedAction::FilesSearch { .. }
        | SimulatedAction::FilesRead { .. } => true,
        SimulatedAction::Productivity { skill_id, .. } => skill_id != "web.fetch",
        _ => false,
    };
    let (workspace, action) = if workspace_action {
        let write = matches!(
            action,
            SimulatedAction::WriteFile { .. }
                | SimulatedAction::DeleteFile { .. }
                | SimulatedAction::Productivity { .. }
        );
        super::skills::resolve_action_target(app, action, write)?
    } else {
        (PathBuf::new(), action.clone())
    };
    if matches!(action, SimulatedAction::WriteFile { .. }) {
        let location = if agent_home::workspace_path(app).is_ok_and(|home| home == workspace) {
            "pasta de trabalho"
        } else {
            "pasta permitida"
        };
        return Ok(format!(
            "Destino na {location}:\n{}\n\n{}",
            preview_target(&workspace, action_path(&action)?)?.display(),
            tool_for(&action).preview(&action, &workspace)?
        ));
    }
    tool_for(&action).preview(&action, &workspace)
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

#[cfg(test)]
pub(super) fn allowed_rate(state: &SecurityState, tool: &dyn Tool) -> Result<bool, String> {
    allowed_rate_with_limit(state, tool.name(), tool.rate_limit_per_minute())
}

pub(super) fn allowed_rate_with_limit(
    state: &SecurityState,
    tool_name: &str,
    limit: usize,
) -> Result<bool, String> {
    let mut rate = state
        .rate
        .lock()
        .map_err(|_| "Limite de frequência indisponível.".to_string())?;
    let now = Instant::now();
    let entries = rate.entry(tool_name.into()).or_default();
    while entries
        .front()
        .is_some_and(|at| now.duration_since(*at) > Duration::from_secs(60))
    {
        entries.pop_front();
    }
    if entries.len() >= limit {
        return Ok(false);
    }
    entries.push_back(now);
    Ok(true)
}

async fn execute_action_with_timeout(
    action: &SimulatedAction,
    app: &tauri::AppHandle,
    timeout: Duration,
) -> Result<String, String> {
    let workspace_action = match action {
        SimulatedAction::ReadFile { .. }
        | SimulatedAction::WriteFile { .. }
        | SimulatedAction::DeleteFile { .. }
        | SimulatedAction::FilesList { .. }
        | SimulatedAction::FilesSearch { .. }
        | SimulatedAction::FilesRead { .. } => true,
        SimulatedAction::Productivity { skill_id, .. } => skill_id != "web.fetch",
        _ => false,
    };
    let (workspace, action) = if workspace_action {
        let write = matches!(
            action,
            SimulatedAction::WriteFile { .. }
                | SimulatedAction::DeleteFile { .. }
                | SimulatedAction::Productivity { .. }
        );
        super::skills::resolve_action_target(app, action, write)?
    } else {
        (PathBuf::new(), action.clone())
    };
    let tool = tool_for(&action);
    tokio::time::timeout(timeout, tool.execute_with_app(&action, &workspace, app))
        .await
        .map_err(|_| "A ferramenta excedeu o tempo limite.".to_string())?
}

pub(super) async fn submit_simulated_action_inner(
    app: tauri::AppHandle,
    state: State<'_, SecurityState>,
    request: ActionRequest,
) -> Result<ActionResult, String> {
    let mut on_approval = |_| {};
    let tool = tool_for(&request.action);
    submit_agent_action(
        &app,
        &state,
        request.action,
        Origin::User,
        false,
        tool.timeout(),
        tool.rate_limit_per_minute(),
        &tokio_util::sync::CancellationToken::new(),
        &mut on_approval,
    )
    .await
}

#[allow(clippy::too_many_arguments)] // Mantém explícitos os limites e callbacks da execução.
pub(super) async fn submit_agent_action(
    app: &tauri::AppHandle,
    state: &SecurityState,
    action: SimulatedAction,
    origin: Origin,
    tainted: bool,
    timeout: Duration,
    rate_limit_per_minute: usize,
    cancel: &tokio_util::sync::CancellationToken,
    on_approval: &mut (dyn FnMut(String) + Send),
) -> Result<ActionResult, String> {
    let domain_requires_approval = match &action {
        SimulatedAction::Productivity { skill_id, params } if skill_id == "web.fetch" => {
            let raw_url = params
                .get("url")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("");
            match crate::web_fetch::validate_url(raw_url)
                .and_then(|url| crate::web_fetch::normalized_domain(&url))
            {
                Ok(domain) => !crate::security::external_domain_is_trusted(app, &domain)?,
                Err(_) => false,
            }
        }
        _ => false,
    };
    let tainted = tainted
        || domain_requires_approval
        || matches!(
            &action,
            SimulatedAction::Productivity { skill_id, .. } if skill_id == "mail.draft"
        );
    if state.is_halted() || cancel.is_cancelled() {
        return Err("A execução foi parada antes da ação.".into());
    }
    let (tool, risk, inside, fixed) = action_metadata(&action);
    let id = id();
    let params = audit_params(&action);
    let preview = match validate_action(&action).and_then(|_| preview_for(app, &action)) {
        Ok(preview) => preview,
        Err(error) => {
            record(
                app,
                state,
                &id,
                tool,
                risk,
                &origin,
                "deny",
                "target_validation_failed",
                "not_required",
                0,
                params,
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
    let decision = require_batch_approval(
        &action,
        policy::decide_with_taint(
            effective_mode(app)?,
            risk,
            &origin,
            inside,
            fixed,
            override_enabled(app, tool)?,
            tainted,
        ),
    );
    let (decision_name, rule) = match decision {
        Decision::Allow(rule) => ("allow", rule),
        Decision::AskUser(rule) => ("ask_user", rule),
        Decision::Deny(rule) => ("deny", rule),
    };
    if matches!(decision, Decision::Deny(_)) {
        record(
            app,
            state,
            &id,
            tool,
            risk,
            &origin,
            decision_name,
            rule,
            "not_required",
            0,
            params,
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
    if !allowed_rate_with_limit(state, tool, rate_limit_per_minute)? {
        record(
            app,
            state,
            &id,
            tool,
            risk,
            &origin,
            "deny",
            "rate_limit",
            "not_required",
            0,
            params,
            "denied",
            Some("Limite de frequência excedido".into()),
        )?;
        return Ok(ActionResult {
            id,
            status: "denied".into(),
            message: "Limite de frequência da habilidade atingido.".into(),
            result: None,
        });
    }
    if let Decision::Allow(rule) = decision {
        record(
            app,
            state,
            &id,
            tool,
            risk,
            &origin,
            "allow",
            rule,
            "not_required",
            0,
            params.clone(),
            "started",
            None,
        )?;
        let result = execute_action_with_timeout(&action, app, timeout).await;
        let error = result.as_ref().err().cloned();
        record(
            app,
            state,
            &id,
            tool,
            risk,
            &origin,
            "allow",
            rule,
            "not_required",
            0,
            params,
            if error.is_some() {
                "failed"
            } else {
                "completed"
            },
            error.clone(),
        )?;
        return Ok(ActionResult {
            id,
            status: if error.is_some() {
                "failed"
            } else {
                "completed"
            }
            .into(),
            message: error.unwrap_or_else(|| "Ação concluída.".into()),
            result: result.ok(),
        });
    }
    let ttl = db_setting(app, "approval_ttl_seconds")?
        .parse::<u64>()
        .map_err(|_| "Prazo de aprovação inválido; a ação foi bloqueada.")?;
    if !(MIN_APPROVAL_TTL..=MAX_APPROVAL_TTL).contains(&ttl) {
        return Err("Prazo de aprovação inválido; a ação foi bloqueada.".into());
    }
    let approval_ttl = Duration::from_secs(ttl);
    let ticket = state
        .approval_broker
        .request_with_timeout(action.clone(), "model".into(), approval_ttl)
        .await
        .map_err(|_| "Fila de aprovação cheia; a ação foi negada.".to_string())?;
    let ticket_id = ticket.id.clone();
    let digest = ticket.hash.clone();
    let created_at = Instant::now();
    let expires_at = now_secs() + ttl;
    let capacity = lock_pending(state).map(|mut pending| {
        if !queue_has_capacity(&pending) {
            false
        } else {
            pending.push_back(PendingAction {
                id: ticket_id.clone(),
                action: action.clone(),
                origin: origin.clone(),
                risk,
                summary: summary(&action),
                preview,
                digest: digest.clone(),
                expires: created_at + approval_ttl,
                expires_at,
            });
            true
        }
    });
    let has_capacity = match capacity {
        Ok(value) => value,
        Err(error) => {
            state.approval_broker.cancel(&ticket_id).await;
            return Err(error);
        }
    };
    if !has_capacity {
        state.approval_broker.cancel(&ticket_id).await;
        record(
            app,
            state,
            &ticket_id,
            tool,
            risk,
            &origin,
            "deny",
            "approval_queue_full",
            "denied",
            0,
            params,
            "denied",
            Some("Fila de aprovação cheia".into()),
        )?;
        return Ok(ActionResult {
            id: ticket_id,
            status: "denied".into(),
            message: "Fila de aprovação cheia; a ação foi negada.".into(),
            result: None,
        });
    }
    if let Err(error) = open_approval(app) {
        if let Ok(mut pending) = lock_pending(state) {
            pending.retain(|item| item.id != ticket_id);
        }
        state.approval_broker.cancel(&ticket_id).await;
        record(
            app,
            state,
            &ticket_id,
            tool,
            risk,
            &origin,
            "deny",
            "approval_window_failed",
            "unavailable",
            0,
            params,
            "denied",
            Some(error.clone()),
        )?;
        return Err(error);
    }
    record(
        app,
        state,
        &ticket_id,
        tool,
        risk,
        &origin,
        "ask_user",
        rule,
        "pending",
        0,
        params.clone(),
        "awaiting_approval",
        None,
    )?;
    let _ = app.emit("approval-updated", ());
    let _ = app.emit("companion-state", serde_json::json!({"type":"activity","state":"awaiting_approval","message":"Aguardando aprovação"}));
    on_approval(ticket_id.clone());
    let result = state.approval_broker.wait(ticket, cancel).await;
    if let Ok(mut pending) = lock_pending(state) {
        pending.retain(|item| item.id != ticket_id);
    }
    let latency = created_at.elapsed().as_millis() as u64;
    match result {
        ApprovalDecision::Aprovada if !state.is_halted() && !cancel.is_cancelled() => {
            if let SimulatedAction::Productivity { skill_id, params } = &action {
                if skill_id == "web.fetch" {
                    let raw_url = params
                        .get("url")
                        .and_then(serde_json::Value::as_str)
                        .ok_or("Informe uma URL HTTPS.")?;
                    let domain = crate::web_fetch::normalized_domain(
                        &crate::web_fetch::validate_url(raw_url)?,
                    )?;
                    crate::security::remember_fetch_domain(app, &domain)?;
                }
            }
            record(
                app,
                state,
                &ticket_id,
                tool,
                risk,
                &origin,
                "allow",
                rule,
                "approved_once",
                latency,
                params.clone(),
                "started",
                None,
            )?;
            let execution = execute_action_with_timeout(&action, app, timeout).await;
            let error = execution.as_ref().err().cloned();
            record(
                app,
                state,
                &ticket_id,
                tool,
                risk,
                &origin,
                "allow",
                rule,
                "approved_once",
                latency,
                params,
                if error.is_some() {
                    "failed"
                } else {
                    "completed"
                },
                error.clone(),
            )?;
            Ok(ActionResult {
                id: ticket_id,
                status: if error.is_some() {
                    "failed"
                } else {
                    "completed"
                }
                .into(),
                message: error.unwrap_or_else(|| "Ação aprovada e concluída.".into()),
                result: execution.ok(),
            })
        }
        decision => {
            let (reason, detail) = match decision {
                ApprovalDecision::Negada(reason) => (reason, "Ação negada."),
                ApprovalDecision::Expirada => ("approval_expired".into(), "A aprovação expirou."),
                ApprovalDecision::Cancelada => {
                    ("execution_cancelled".into(), "A execução foi cancelada.")
                }
                ApprovalDecision::Parada => (
                    "kill_switch".into(),
                    "A execução foi interrompida pelo kill switch.",
                ),
                ApprovalDecision::Aprovada => {
                    ("execution_stopped".into(), "A execução foi interrompida.")
                }
            };
            record(
                app,
                state,
                &ticket_id,
                tool,
                risk,
                &origin,
                "deny",
                &reason,
                "denied",
                latency,
                params,
                "denied",
                Some(reason.clone()),
            )?;
            Ok(ActionResult {
                id: ticket_id,
                status: "denied".into(),
                message: detail.into(),
                result: None,
            })
        }
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
            let audit_handle = handle.clone();
            let close_handle = close_window.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(item) = item {
                    if let Some(state) = audit_handle.try_state::<SecurityState>() {
                        if state.approval_broker.contains(&item.id).await {
                            let _ = state
                                .approval_broker
                                .resolve(
                                    &item.id,
                                    &item.digest,
                                    ApprovalDecision::Negada("approval_window_closed".into()),
                                )
                                .await;
                        }
                    }
                }
                if has_more {
                    let _ = audit_handle.emit("approval-updated", ());
                    let _ = close_handle.set_focus();
                } else {
                    let _ = close_handle.destroy();
                }
            });
        }
    });
    Ok(())
}

pub(super) async fn get_pending_approval_inner(
    app: tauri::AppHandle,
    state: State<'_, SecurityState>,
) -> Result<Option<PendingView>, String> {
    loop {
        let expired = {
            let mut pending = lock_pending(&state)?;
            if pending
                .front()
                .is_some_and(|item| is_expired(item.expires, Instant::now()))
            {
                pending.pop_front()
            } else {
                None
            }
        };
        let Some(expired) = expired else { break };
        if state.approval_broker.contains(&expired.id).await {
            let _ = state.approval_broker.expire(&expired.id).await;
        }
    }
    let pending = lock_pending(&state)?;
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

pub(super) async fn approval_respond_inner(
    app: tauri::AppHandle,
    state: State<'_, SecurityState>,
    id: String,
    display_hash: String,
    approve: bool,
) -> Result<ActionResult, String> {
    if state.approval_broker.contains(&id).await {
        let item = {
            let mut pending = lock_pending(&state)?;
            let Some(item) = pending.front() else {
                return Err("A aprovação não está mais disponível.".into());
            };
            if item.id != id || !display_hash_matches(&item.action, &item.digest, &display_hash) {
                return Err("Os parâmetros exibidos mudaram; a ação foi recusada.".into());
            }
            take_pending_approval(&mut pending, &id, &display_hash)
                .map_err(|_| "A aprovação não corresponde à ação pendente.".to_string())?
        };
        let decision = if state.is_halted() {
            ApprovalDecision::Parada
        } else if is_expired(item.expires, Instant::now()) {
            ApprovalDecision::Expirada
        } else if approve {
            ApprovalDecision::Aprovada
        } else {
            ApprovalDecision::Negada("user_denied".into())
        };
        state
            .approval_broker
            .resolve(&id, &display_hash, decision)
            .await
            .map_err(|_| {
                "A aprovação expirou, foi usada ou não corresponde aos parâmetros.".to_string()
            })?;
        let _ = app.emit("approval-updated", ());
        close_approval_if_empty(&app, &state);
        return Ok(ActionResult {
            id,
            status: "decision_sent".into(),
            message: "Decisão encaminhada à execução segura.".into(),
            result: None,
        });
    }
    Err("A aprovação não está mais disponível ou já foi resolvida.".into())
}

pub(super) fn close_approval_if_empty(app: &tauri::AppHandle, state: &SecurityState) {
    if lock_pending(state).is_ok_and(|pending| pending.is_empty()) {
        if let Some(window) = app.get_webview_window("approval") {
            let _ = window.close();
        }
    }
}

#[cfg(test)]
mod batch_approval_tests {
    use super::*;

    #[test]
    fn apply_plan_always_requires_one_explicit_batch_approval() {
        let action = SimulatedAction::Productivity {
            skill_id: "files.apply_plan".into(),
            params: serde_json::json!({"path":"","items":[]}),
        };
        assert_eq!(
            require_batch_approval(&action, Decision::Allow("mode_total_workspace")),
            Decision::AskUser("batch_requires_approval")
        );
        assert_eq!(
            require_batch_approval(&action, Decision::AskUser("mode_always_ask")),
            Decision::AskUser("mode_always_ask")
        );
    }
}
