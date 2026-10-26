use crate::{
    agent::{self, AgentBackend, AgentEvent, AgentLimits, ToolExecution},
    policy::Origin,
    providers::{Block, Message, ProviderReply, ToolCall, ToolDef},
    security::{self, skills::Skill, SecurityState},
};
use sha2::{Digest, Sha256};
use std::{future::Future, pin::Pin};
use tauri::{ipc::Channel, State};
use tokio_util::sync::CancellationToken;

struct RuntimeBackend<'a> {
    app: tauri::AppHandle,
    security: &'a SecurityState,
    conversation_id: String,
    targets: Vec<crate::history::ConversationProviderTarget>,
    active_skills: Vec<Skill>,
    events: Channel<AgentEvent>,
}

impl AgentBackend for RuntimeBackend<'_> {
    fn model_turn<'a>(
        &'a mut self,
        messages: &'a [Message],
        tools: &'a [ToolDef],
        _: &'a CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<ProviderReply, String>> + Send + 'a>> {
        Box::pin(async move {
            crate::providers::agent_model_turn(
                &self.app,
                self.security,
                self.targets.clone(),
                messages,
                tools,
            )
            .await
        })
    }

    fn execute_tool<'a>(
        &'a mut self,
        call: &'a ToolCall,
        tainted: bool,
        cancel: &'a CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<ToolExecution, String>> + Send + 'a>> {
        Box::pin(async move {
            let skill = self
                .active_skills
                .iter()
                .find(|skill| skill.id == call.name)
                .ok_or_else(|| "A habilidade não está ativa; chamada recusada.".to_string())?;
            let conversation_id = self.conversation_id.clone();
            let args_hash = format!("{:x}", Sha256::digest(call.args.to_string().as_bytes()));
            crate::history::persist_agent_record(
                &self.app,
                &conversation_id,
                "tool_call",
                skill.id,
                None,
                &format!("arguments_sha256={args_hash}"),
            )?;
            let channel = self.events.clone();
            let mut on_approval = move |id: String| {
                let _ = channel.send(AgentEvent::AwaitingApproval {
                    id: id.clone(),
                    audit_id: id,
                });
            };
            let result = skill
                .execute(
                    self.app.clone(),
                    self.security,
                    call.args.clone(),
                    Origin::Model,
                    tainted,
                    cancel,
                    &mut on_approval,
                )
                .await?;
            let status = result.status.clone();
            let result_text = result.result.as_deref().unwrap_or(&result.message);
            let result_hash = format!("{:x}", Sha256::digest(result_text.as_bytes()));
            crate::history::persist_agent_record(
                &self.app,
                &conversation_id,
                "tool_result",
                skill.id,
                Some(&result.id),
                &format!("status={status}; result_sha256={result_hash}"),
            )?;
            Ok(ToolExecution {
                content: result.result.unwrap_or(result.message),
                audit_id: Some(result.id),
                denied: status == "denied",
                external_communication: skill.id == "simulated.send_message",
            })
        })
    }
}

#[tauri::command]
pub async fn agent_run(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    state: State<'_, SecurityState>,
    conversation_id: String,
    message: String,
    on_event: Channel<AgentEvent>,
) -> Result<String, String> {
    crate::require_main(&caller)?;
    let result = agent_run_inner(app, &state, conversation_id, message, on_event.clone()).await;
    if let Err(message) = &result {
        let _ = on_event.send(AgentEvent::Error {
            kind: "agent".into(),
            message: message.clone(),
        });
    }
    result
}

async fn agent_run_inner(
    app: tauri::AppHandle,
    state: &SecurityState,
    conversation_id: String,
    message: String,
    on_event: Channel<AgentEvent>,
) -> Result<String, String> {
    if message.trim().is_empty() || message.len() > 1_000_000 {
        return Err("Informe uma mensagem válida para o agente.".into());
    }
    if state.is_halted() {
        return Err("O agente está parado pelo kill switch.".into());
    }
    let (provider_id, model, enabled, targets, _) =
        crate::history::load_agent_context(&app, &conversation_id)?;
    if !enabled {
        return Err("Modo agente indisponível: ele está desativado nesta conversa. Ative-o nas configurações da conversa.".into());
    }
    if crate::agent_home::system_prompt(&app)?.is_none() {
        return Err(
            "Modo agente indisponível: configure a pasta e a identidade aprovada do agente.".into(),
        );
    }
    crate::history::save_agent_user_message(&app, &conversation_id, &message)?;
    let mut messages = crate::history::load_agent_context(&app, &conversation_id)?.4;
    let mut active_skills = Vec::new();
    for skill in security::skills::registry() {
        if security::skills::is_skill_enabled(&app, skill.id)? {
            active_skills.push(skill);
        }
    }
    if active_skills.is_empty() {
        return Err(
            "Modo agente indisponível: ative ao menos uma habilidade em Habilidades.".into(),
        );
    }
    if !crate::providers::verified_tool_support(&app, &provider_id, &model) {
        return Err("Modo agente indisponível: o provedor e modelo desta conversa não têm tool calling verificado. Escolha um compatível em Conectores de IA.".into());
    }
    let prompt = crate::agent_home::system_prompt(&app)?
        .ok_or("Configure a pasta e a identidade aprovada do agente.")?;
    let skill_context = active_skills
        .iter()
        .map(|skill| format!("- {}: {}", skill.name, skill.model_description))
        .collect::<Vec<_>>()
        .join("\n");
    messages.insert(
        0,
        Message {
            role: "system".into(),
            blocks: vec![Block::Text {
                text: format!(
                    "{prompt}\n\nHabilidades ativas para esta execução:\n{skill_context}"
                ),
            }],
        },
    );
    let tools = security::skills::model_tools(&app)?;
    let token = CancellationToken::new();
    {
        let mut runs = state.agent_runs.lock().await;
        if runs.contains_key(&conversation_id) {
            return Err("Já existe uma execução do agente nesta conversa.".into());
        }
        runs.insert(conversation_id.clone(), token.clone());
    }
    let mut backend = RuntimeBackend {
        app: app.clone(),
        security: &state,
        conversation_id: conversation_id.clone(),
        targets,
        active_skills,
        events: on_event.clone(),
    };
    let result = agent::run_agent(
        &mut backend,
        &mut messages,
        &tools,
        AgentLimits::default(),
        &token,
        |event| {
            if !matches!(event, AgentEvent::Error { .. }) {
                let _ = on_event.send(event);
            }
        },
    )
    .await;
    state.agent_runs.lock().await.remove(&conversation_id);
    match result {
        Ok(answer) => {
            crate::history::save_agent_final(&app, &conversation_id, &answer)?;
            Ok(answer)
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub async fn agent_cancel(
    caller: tauri::WebviewWindow,
    state: State<'_, SecurityState>,
    conversation_id: String,
) -> Result<bool, String> {
    crate::require_main(&caller)?;
    let runs = state.agent_runs.lock().await;
    if let Some(token) = runs.get(&conversation_id) {
        token.cancel();
        Ok(true)
    } else {
        Ok(false)
    }
}
