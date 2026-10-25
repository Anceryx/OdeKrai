use reqwest::{header, redirect::Policy, Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{atomic::AtomicU64, Mutex},
    time::Duration,
};
use tauri::{ipc::Channel, Manager, State};
use tokio_util::sync::CancellationToken;

mod anthropic;
mod cancellation;
mod chat_completions;
mod credentials;
mod perplexity;
use credentials::{credential_entry, supports_credentials};
static INTERNAL_REQUEST_ID: AtomicU64 = AtomicU64::new(1);
pub use cancellation::cancel_all;
#[cfg(test)]
use cancellation::cancel_requests;
use cancellation::cancellable_request;
const MAX_CREDENTIAL_BYTES: usize = 4096;
const MAX_MESSAGE_BYTES: usize = 1_000_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelOption {
    pub id: String,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStage {
    pub id: String,
    pub status: String,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTest {
    pub stages: Vec<ConnectionStage>,
    pub overall: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogEntry {
    id: String,
    base_url: String,
    chat_path: Option<String>,
    auth_header: Option<String>,
    model_list_path: Option<String>,
    model_list_shape: Option<String>,
    host_rule: Option<String>,
}

fn catalog_entry(provider_id: &str) -> Option<CatalogEntry> {
    serde_json::from_str::<Vec<CatalogEntry>>(include_str!("../../resources/provider-catalog.json"))
        .ok()?
        .into_iter()
        .find(|entry| entry.id == provider_id)
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ProviderMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ProviderCitation {
    pub title: String,
    pub url: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ProviderReply {
    pub content: String,
    pub citations: Vec<ProviderCitation>,
}

#[derive(Default)]
pub struct ProviderRequests(Mutex<HashMap<String, CancellationToken>>);

#[tauri::command]
pub fn save_provider_credential(
    caller: tauri::WebviewWindow,
    provider_id: String,
    credential: String,
) -> Result<(), String> {
    super::require_main(&caller)?;
    let credential = credential.trim();
    if credential.is_empty() || credential.len() > MAX_CREDENTIAL_BYTES {
        return Err("Informe uma credencial válida (até 4.096 bytes).".into());
    }
    credential_entry(&provider_id)?
        .set_password(credential)
        .map_err(|_| "Não foi possível salvar a credencial no Gerenciador do Windows.".into())
}

#[tauri::command]
pub async fn has_provider_credential(
    caller: tauri::WebviewWindow,
    provider_id: String,
) -> Result<bool, String> {
    super::require_main(&caller)?;
    match credential_entry(&provider_id)?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(_) => Err("Não foi possível consultar o Gerenciador de Credenciais do Windows.".into()),
    }
}

#[tauri::command]
pub fn remove_provider_credential(
    caller: tauri::WebviewWindow,
    provider_id: String,
) -> Result<(), String> {
    super::require_main(&caller)?;
    match credential_entry(&provider_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Não foi possível remover a credencial do Gerenciador do Windows.".into()),
    }
}

#[tauri::command]
pub async fn cancel_provider_request(
    caller: tauri::WebviewWindow,
    state: State<'_, ProviderRequests>,
    request_id: String,
) -> Result<bool, String> {
    super::require_main(&caller)?;
    let token = state
        .0
        .lock()
        .map_err(|_| "Não foi possível cancelar a solicitação.".to_string())?
        .get(&request_id)
        .cloned();
    if let Some(token) = token {
        token.cancel();
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn validate_provider_endpoint(
    caller: tauri::WebviewWindow,
    provider_id: String,
    base_url: String,
) -> Result<(), String> {
    super::require_main(&caller)?;
    provider_endpoint(&provider_id, &base_url).map(|_| ())
}

#[tauri::command]
pub async fn list_provider_models(
    caller: tauri::WebviewWindow,
    state: State<'_, ProviderRequests>,
    security: State<'_, crate::security::SecurityState>,
    provider_id: String,
    base_url: String,
) -> Result<Vec<ModelOption>, String> {
    super::require_main(&caller)?;
    cancellable_request(&state, &security, fetch_models(&provider_id, &base_url)).await
}

async fn fetch_models(provider_id: &str, base_url: &str) -> Result<Vec<ModelOption>, String> {
    let mut url = provider_endpoint(provider_id, base_url)?;
    let entry =
        catalog_entry(provider_id).ok_or("O catálogo deste provedor não está disponível.")?;
    let path = entry.model_list_path.as_deref().ok_or(
        "A documentação oficial deste provedor não oferece listagem de modelos neste endpoint.",
    )?;
    let credential = credential_entry(provider_id)?
        .get_password()
        .map_err(|_| "Salve uma credencial para listar os modelos.")?;
    let base_path = if provider_id == "azure-openai" {
        url.path()
            .strip_suffix("/chat/completions")
            .unwrap_or(url.path())
            .trim_end_matches('/')
            .to_string()
    } else if entry.base_url.is_empty() {
        url.path().trim_end_matches('/').to_string()
    } else {
        Url::parse(&entry.base_url)
            .map(|u| u.path().trim_end_matches('/').to_string())
            .unwrap_or_default()
    };
    url.set_path(&format!("{}{}", base_path, path));
    let client = Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Não foi possível preparar uma conexão segura.".to_string())?;
    let mut request = client.get(url).pipe_auth(provider_id, &credential)?;
    if provider_id == "anthropic" {
        request = request.header("anthropic-version", "2023-06-01");
    }
    let response = request
        .send()
        .await
        .map_err(|error| safe_transport_error(&error))?;
    if !response.status().is_success() {
        return Err(provider_http_error(response.status().as_u16()));
    }
    let payload: Value = response
        .json()
        .await
        .map_err(|_| "O provedor retornou uma lista inválida.".to_string())?;
    let values = if entry.model_list_shape.as_deref() == Some("data") {
        payload.get("data").and_then(Value::as_array)
    } else {
        payload.as_array()
    }
    .ok_or("A resposta não corresponde ao formato documentado do provedor.")?;
    Ok(values
        .iter()
        .filter_map(|value| {
            let id = value
                .get("id")
                .or_else(|| value.get("name"))?
                .as_str()?
                .to_string();
            if id.is_empty() || id.len() > 300 {
                return None;
            }
            Some(ModelOption {
                name: id.clone(),
                id,
            })
        })
        .collect())
}

#[tauri::command]
pub async fn test_provider_connection(
    caller: tauri::WebviewWindow,
    requests: State<'_, ProviderRequests>,
    security: State<'_, crate::security::SecurityState>,
    provider_id: String,
    base_url: String,
    model: String,
) -> Result<ConnectionTest, String> {
    super::require_main(&caller)?;
    cancellable_request(
        &requests,
        &security,
        test_provider_connection_inner(&provider_id, &base_url, &model),
    )
    .await
}

async fn test_provider_connection_inner(
    provider_id: &str,
    base_url: &str,
    model: &str,
) -> Result<ConnectionTest, String> {
    credential_entry(provider_id)?
        .get_password()
        .map_err(|_| "Salve uma credencial para testar a conexão.")?;
    let endpoint = provider_endpoint(provider_id, base_url)?;
    let mut stages = vec![
        ConnectionStage {
            id: "credential".into(),
            status: "passed".into(),
            message: "Credencial encontrada no Gerenciador do Windows.".into(),
        },
        ConnectionStage {
            id: "host".into(),
            status: "passed".into(),
            message: format!(
                "Host HTTPS permitido: {}.",
                endpoint.host_str().unwrap_or("")
            ),
        },
    ];
    match fetch_models(provider_id, base_url).await {
        Ok(models) => {
            stages.push(ConnectionStage {
                id: "network".into(),
                status: "passed".into(),
                message: "Conexão HTTPS concluída.".into(),
            });
            stages.push(ConnectionStage {
                id: "authentication".into(),
                status: "passed".into(),
                message: "A API aceitou a credencial.".into(),
            });
            let exists = models.iter().any(|item| item.id == model);
            stages.push(ConnectionStage {
                id: "model".into(),
                status: if exists { "passed" } else { "failed" }.into(),
                message: if exists {
                    "O modelo aparece na lista da conta."
                } else {
                    "O modelo não aparece na lista da conta; confira o identificador."
                }
                .into(),
            });
            Ok(ConnectionTest {
                stages,
                overall: if exists { "passed" } else { "failed" }.into(),
            })
        }
        Err(message) if message.contains("não oferece listagem") => {
            stages.extend([
                ConnectionStage {
                    id: "network".into(),
                    status: "not_checked".into(),
                    message: "Este endpoint não oferece uma verificação sem custo.".into(),
                },
                ConnectionStage {
                    id: "authentication".into(),
                    status: "not_checked".into(),
                    message: "A autenticação só será confirmada ao enviar uma solicitação.".into(),
                },
                ConnectionStage {
                    id: "model".into(),
                    status: "not_checked".into(),
                    message: "Não foi possível confirmar o modelo sem chamar a API de geração."
                        .into(),
                },
            ]);
            Ok(ConnectionTest {
                stages,
                overall: "partial".into(),
            })
        }
        Err(message) => Err(message),
    }
}

fn ping_body(provider_id: &str, model: &str) -> Option<Value> {
    match provider_id {
        "anthropic" => Some(
            json!({ "model": model, "max_tokens": 1, "messages": [{"role":"user","content":"ping"}] }),
        ),
        "perplexity" => None,
        _ => Some(
            json!({ "model": model, "max_tokens": 1, "messages": [{"role":"user","content":"ping"}] }),
        ),
    }
}

#[tauri::command]
pub async fn ping_provider(
    caller: tauri::WebviewWindow,
    requests: State<'_, ProviderRequests>,
    security: State<'_, crate::security::SecurityState>,
    provider_id: String,
    base_url: String,
    model: String,
) -> Result<(), String> {
    super::require_main(&caller)?;
    cancellable_request(
        &requests,
        &security,
        ping_provider_inner(&provider_id, &base_url, &model),
    )
    .await
}

async fn ping_provider_inner(provider_id: &str, base_url: &str, model: &str) -> Result<(), String> {
    let endpoint = provider_endpoint(provider_id, base_url)?;
    let body = ping_body(provider_id, model)
        .ok_or("O ping opcional não está disponível para este adaptador.")?;
    let credential = credential_entry(provider_id)?
        .get_password()
        .map_err(|_| "Salve uma credencial para testar a geração.")?;
    let client = Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Não foi possível preparar uma conexão segura.")?;
    let mut request = client
        .post(endpoint)
        .pipe_auth(provider_id, &credential)?
        .json(&body);
    if provider_id == "anthropic" {
        request = request.header("anthropic-version", "2023-06-01");
    }
    let response = request
        .send()
        .await
        .map_err(|error| safe_transport_error(&error))?;
    if !response.status().is_success() {
        return Err(provider_http_error(response.status().as_u16()));
    }
    Ok(())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn send_provider_message(
    caller: tauri::WebviewWindow,
    state: State<'_, ProviderRequests>,
    security: State<'_, crate::security::SecurityState>,
    provider_id: String,
    base_url: String,
    model: String,
    messages: Vec<ProviderMessage>,
    request_id: String,
) -> Result<ProviderReply, String> {
    super::require_main(&caller)?;
    if security.is_halted() {
        return Err("O OdeKrai está parado pelo kill switch.".into());
    }
    send_message_inner(
        state,
        provider_id,
        base_url,
        model,
        messages,
        request_id,
        None,
        security,
    )
    .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn stream_provider_message(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    state: State<'_, ProviderRequests>,
    security: State<'_, crate::security::SecurityState>,
    provider_id: String,
    base_url: String,
    model: String,
    messages: Vec<ProviderMessage>,
    request_id: String,
    on_chunk: Channel<String>,
) -> Result<ProviderReply, String> {
    super::require_main(&caller)?;
    if security.is_halted() {
        return Err("O OdeKrai está parado pelo kill switch.".into());
    }
    let mut messages = messages;
    if messages.iter().any(|message| message.role == "system") {
        return Err("A mensagem de sistema só pode ser criada pelo aplicativo.".into());
    }
    if let Some(prompt) = super::agent_home::system_prompt(&app)? {
        messages.insert(
            0,
            ProviderMessage {
                role: "system".into(),
                content: prompt,
            },
        );
    }
    send_message_inner(
        state,
        provider_id,
        base_url,
        model,
        messages,
        request_id,
        Some(on_chunk),
        security,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn send_message_inner(
    state: State<'_, ProviderRequests>,
    provider_id: String,
    base_url: String,
    model: String,
    messages: Vec<ProviderMessage>,
    request_id: String,
    on_chunk: Option<Channel<String>>,
    security: State<'_, crate::security::SecurityState>,
) -> Result<ProviderReply, String> {
    if security.is_halted() {
        return Err("O OdeKrai está parado pelo kill switch.".into());
    }
    if request_id.is_empty()
        || request_id.len() > 80
        || !request_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return Err("Identificador de solicitação inválido.".into());
    }
    if model.trim().is_empty() || model.len() > 200 {
        return Err("Informe um ID de modelo válido.".into());
    }
    if messages.is_empty()
        || messages.len() > 100
        || messages.iter().any(|message| {
            !matches!(message.role.as_str(), "system" | "user" | "assistant")
                || message.content.len() > MAX_MESSAGE_BYTES
        })
        || messages
            .iter()
            .map(|message| message.content.len())
            .sum::<usize>()
            > MAX_MESSAGE_BYTES
    {
        return Err("A conversa está vazia ou excede o limite permitido.".into());
    }
    if on_chunk.is_none() && messages.iter().any(|message| message.role == "system") {
        return Err("A mensagem de sistema só pode ser criada pelo aplicativo.".into());
    }

    let cancellation = CancellationToken::new();
    {
        let mut requests = state
            .0
            .lock()
            .map_err(|_| "Não foi possível iniciar a solicitação.".to_string())?;
        if requests.contains_key(&request_id) {
            return Err("Já existe uma solicitação com este identificador.".into());
        }
        requests.insert(request_id.clone(), cancellation.clone());
    }
    if security.is_halted() {
        cancellation.cancel();
        if let Ok(mut requests) = state.0.lock() {
            requests.remove(&request_id);
        }
        return Err("O OdeKrai está parado pelo kill switch.".into());
    }

    let result = tokio::select! {
        _ = cancellation.cancelled() => Err("Solicitação cancelada.".into()),
        response = request_provider(&provider_id, &base_url, &model, &messages, on_chunk) => response,
    };
    if let Ok(mut requests) = state.0.lock() {
        requests.remove(&request_id);
    }
    result
}

async fn request_provider(
    provider_id: &str,
    base_url: &str,
    model: &str,
    messages: &[ProviderMessage],
    on_chunk: Option<Channel<String>>,
) -> Result<ProviderReply, String> {
    let endpoint = provider_endpoint(provider_id, base_url)?;
    let entry = credential_entry(provider_id)?;
    let credential = entry.get_password().map_err(|error| match error {
        keyring::Error::NoEntry => {
            "Salve uma credencial para este provedor antes de conversar.".to_string()
        }
        _ => "Não foi possível recuperar a credencial do Gerenciador do Windows.".to_string(),
    })?;
    let client = Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|_| "Não foi possível preparar uma conexão segura.".to_string())?;

    let request = match provider_id {
        "anthropic" => client
            .post(endpoint)
            .pipe_auth(provider_id, &credential)?
            .header("anthropic-version", "2023-06-01")
            .json(&anthropic::request_body(
                model,
                messages,
                on_chunk.is_some(),
            )),
        "perplexity" => client
            .post(endpoint)
            .pipe_auth(provider_id, &credential)?
            .json(&perplexity::perplexity_body(model, messages)),
        "azure-openai" => client
            .post(endpoint)
            .pipe_auth(provider_id, &credential)?
            .json(&chat_completions::request_body(
                model,
                messages,
                on_chunk.is_some(),
            )),
        _ => client
            .post(endpoint)
            .pipe_auth(provider_id, &credential)?
            .json(&chat_completions::request_body(
                model,
                messages,
                on_chunk.is_some(),
            )),
    };

    let mut response = request
        .send()
        .await
        .map_err(|error| safe_transport_error(&error))?;
    let status = response.status();
    if !status.is_success() {
        return Err(provider_http_error(status.as_u16()));
    }
    if let Some(channel) = on_chunk {
        if provider_id != "perplexity" {
            let mut pending = Vec::new();
            let mut content = String::new();
            let mut finished = false;
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|error| safe_transport_error(&error))?
            {
                pending.extend_from_slice(&chunk);
                if pending.len() > MAX_MESSAGE_BYTES {
                    return Err("A resposta excede o limite permitido.".into());
                }
                while let Some((end, delimiter_len)) = pending
                    .windows(4)
                    .position(|part| part == b"\r\n\r\n")
                    .map(|end| (end, 4))
                    .or_else(|| {
                        pending
                            .windows(2)
                            .position(|part| part == b"\n\n")
                            .map(|end| (end, 2))
                    })
                {
                    let event = pending.drain(..end + delimiter_len).collect::<Vec<_>>();
                    for line in String::from_utf8_lossy(&event).lines() {
                        if let Some(data) = line.trim_end_matches('\r').strip_prefix("data: ") {
                            if data == "[DONE]" {
                                finished = true;
                                continue;
                            }
                            let payload: Value = serde_json::from_str(data).map_err(|_| {
                                "O provedor retornou um evento inválido.".to_string()
                            })?;
                            if payload["type"] == "message_stop" {
                                finished = true;
                            }
                            if payload["type"] == "error" {
                                return Err("O provedor interrompeu a resposta.".into());
                            }
                            let delta = stream_delta(provider_id, &payload);
                            if let Some(delta) = delta {
                                content.push_str(delta);
                                if content.len() > MAX_MESSAGE_BYTES {
                                    return Err("A resposta excede o limite permitido.".into());
                                }
                                let _ = channel.send(delta.to_string());
                            }
                        }
                    }
                }
            }
            if !finished {
                return Err("A resposta do provedor foi interrompida.".into());
            }
            if content.trim().is_empty() {
                return Err("O provedor retornou uma resposta vazia.".into());
            }
            return Ok(ProviderReply {
                content,
                citations: Vec::new(),
            });
        }
    }
    let payload: Value = response
        .json()
        .await
        .map_err(|_| "O provedor retornou uma resposta inválida.".to_string())?;
    parse_provider_reply(provider_id, &payload)
}

fn stream_delta<'a>(provider_id: &str, payload: &'a Value) -> Option<&'a str> {
    if provider_id == "anthropic" {
        if payload["type"] == "content_block_delta" && payload["delta"]["type"] == "text_delta" {
            payload["delta"]["text"].as_str()
        } else {
            None
        }
    } else {
        payload["choices"][0]["delta"]["content"].as_str()
    }
}

fn provider_endpoint(provider_id: &str, base_url: &str) -> Result<Url, String> {
    if !supports_credentials(provider_id) {
        return Err("Este provedor ainda não possui um adaptador ativo.".into());
    }
    let mut url =
        Url::parse(base_url.trim()).map_err(|_| "Informe um endpoint válido.".to_string())?;
    if url.scheme() != "https"
        || url.port().is_some_and(|port| port != 443)
        || url.username() != ""
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "O endpoint precisa usar HTTPS e não pode conter credenciais ou parâmetros.".into(),
        );
    }
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    let config =
        catalog_entry(provider_id).ok_or("A configuração deste provedor não está cadastrada.")?;
    let allowed = config.host_rule.as_deref().is_some_and(|rule| {
        rule.split('|').any(|part| {
            if let Some(suffix) = part.strip_prefix("*.") {
                host.len() > suffix.len() + 1 && host.ends_with(&format!(".{suffix}"))
            } else if part.contains("{region}") {
                let (prefix, suffix) = part.split_once("{region}").unwrap();
                host.strip_prefix(prefix)
                    .and_then(|rest| rest.strip_suffix(suffix))
                    .is_some_and(|region| {
                        !region.is_empty()
                            && region
                                .bytes()
                                .all(|b| b.is_ascii_alphanumeric() || b == b'-')
                    })
            } else {
                host == part
            }
        })
    });
    if !allowed {
        return Err(format!(
            "Este host não corresponde a {provider_id}. Use o host HTTPS documentado: {}.",
            config.host_rule.as_deref().unwrap_or("sem host cadastrado")
        ));
    }

    let path = url.path().trim_end_matches('/');
    let base_path = Url::parse(&config.base_url)
        .map(|value| value.path().trim_end_matches('/').to_string())
        .unwrap_or_default();
    if provider_id == "azure-openai" || provider_id == "bedrock" {
        if !path.ends_with("/openai/v1") {
            return Err("O endpoint precisa terminar em /openai/v1.".into());
        }
    } else if path != base_path && !(provider_id == "anthropic" && path == "/v1/messages") {
        return Err(format!("O caminho do endpoint não corresponde ao prefixo oficial de {provider_id}: {base_path}."));
    }
    let chat_path = config
        .chat_path
        .as_deref()
        .ok_or("Este provedor ainda não possui um adaptador de chat ativo.")?;
    let path = if chat_path.is_empty() || (provider_id == "anthropic" && path.ends_with(chat_path))
    {
        path.to_string()
    } else {
        format!("{path}{chat_path}")
    };
    url.set_path(&path);
    Ok(url)
}

fn provider_http_error(status: u16) -> String {
    match status {
        400 => {
            format!("O provedor rejeitou o modelo ou os parâmetros da solicitação (HTTP {status}).")
        }
        401 | 403 => format!("A credencial é inválida ou não tem permissão (HTTP {status})."),
        404 => "O endpoint ou modelo não foi encontrado (HTTP 404).".into(),
        408 => "O provedor atingiu o tempo limite (HTTP 408). Tente novamente.".into(),
        429 => "O limite de uso deste provedor foi atingido (HTTP 429). Consulte os limites do seu plano e tente novamente mais tarde.".into(),
        500..=599 => format!("O serviço do provedor está indisponível (HTTP {status})."),
        _ => format!("O provedor respondeu com HTTP {status}."),
    }
}

fn header_value(value: &str) -> Result<header::HeaderValue, String> {
    header::HeaderValue::from_str(value)
        .map_err(|_| "A credencial contém caracteres inválidos para uma requisição.".to_string())
}

trait AuthRequest {
    fn pipe_auth(self, provider_id: &str, credential: &str) -> Result<Self, String>
    where
        Self: Sized;
}

impl AuthRequest for reqwest::RequestBuilder {
    fn pipe_auth(self, provider_id: &str, credential: &str) -> Result<Self, String> {
        let entry = catalog_entry(provider_id)
            .ok_or("A autenticação deste provedor não está cadastrada.")?;
        match entry.auth_header.as_deref() {
            Some("x-api-key") => Ok(self.header("x-api-key", header_value(credential)?)),
            Some("api-key") => Ok(self.header("api-key", header_value(credential)?)),
            Some("Authorization") => {
                Ok(self.header(header::AUTHORIZATION, bearer_value(credential)?))
            }
            _ => Err("O método de autenticação deste provedor ainda não está implementado.".into()),
        }
    }
}

fn bearer_value(value: &str) -> Result<header::HeaderValue, String> {
    header::HeaderValue::from_str(&format!("Bearer {value}"))
        .map_err(|_| "A credencial contém caracteres inválidos para uma requisição.".to_string())
}

fn safe_transport_error(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        "O provedor demorou para responder. Tente novamente.".into()
    } else if error.is_connect() {
        "Não foi possível conectar ao provedor. Verifique sua conexão.".into()
    } else {
        "A comunicação segura com o provedor falhou.".into()
    }
}

fn parse_provider_reply(provider_id: &str, payload: &Value) -> Result<ProviderReply, String> {
    if provider_id == "perplexity" {
        return perplexity::parse_reply(payload);
    }

    let content = if provider_id == "anthropic" {
        payload["content"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|part| part["type"] == "text")
            .filter_map(|part| part["text"].as_str())
            .collect::<Vec<_>>()
            .join("")
    } else {
        payload["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or_default()
            .to_string()
    };
    if content.trim().is_empty() {
        return Err("O provedor retornou uma resposta vazia ou em formato inesperado.".into());
    }
    Ok(ProviderReply {
        content: content.trim().to_string(),
        citations: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kill_switch_cancels_every_registered_provider_request() {
        let state = ProviderRequests::default();
        let first = CancellationToken::new();
        let second = CancellationToken::new();
        {
            let mut requests = state.0.lock().unwrap();
            requests.insert("one".into(), first.clone());
            requests.insert("two".into(), second.clone());
        }
        cancel_requests(&state);
        assert!(first.is_cancelled());
        assert!(second.is_cancelled());
    }

    #[tokio::test]
    async fn cancellable_request_returns_when_its_token_is_cancelled() {
        let requests = ProviderRequests::default();
        let security = crate::security::SecurityState::new(false);
        let request = cancellable_request(
            &requests,
            &security,
            std::future::pending::<Result<(), String>>(),
        );
        tokio::pin!(request);
        tokio::select! {
            result = &mut request => panic!("request unexpectedly completed: {result:?}"),
            _ = tokio::task::yield_now() => {},
        }
        cancel_requests(&requests);
        let error = request.await.unwrap_err();
        assert!(error.contains("kill switch"));
    }

    use serde_json::json;

    #[test]
    fn perplexity_uses_instructions_for_system_prompt() {
        let body = perplexity::perplexity_body(
            "sonar",
            &[
                ProviderMessage {
                    role: "system".into(),
                    content: "Regras fixas".into(),
                },
                ProviderMessage {
                    role: "user".into(),
                    content: "Olá".into(),
                },
            ],
        );
        assert_eq!(body["instructions"], "Regras fixas");
        assert_eq!(body["input"], "user: Olá");
    }

    #[test]
    fn builds_provider_specific_endpoints_without_allowing_host_confusion() {
        assert_eq!(
            provider_endpoint("anthropic", "https://api.anthropic.com")
                .unwrap()
                .as_str(),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            provider_endpoint("anthropic", "https://api.anthropic.com/v1/messages")
                .unwrap()
                .as_str(),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            provider_endpoint("perplexity", "https://api.perplexity.ai/v1/agent")
                .unwrap()
                .as_str(),
            "https://api.perplexity.ai/v1/agent"
        );
        assert!(provider_endpoint("openai", "https://api.openai.com.attacker.invalid/v1").is_err());
        assert!(provider_endpoint("openai", "http://api.openai.com/v1").is_err());
        assert!(provider_endpoint("vertex-ai", "https://aiplatform.googleapis.com").is_err());
        assert!(provider_endpoint("groq", "https://api.x.ai/v1").is_err());
        assert!(provider_endpoint("groq", "https://api.groq.com/v1").is_err());
        assert_eq!(
            provider_endpoint("anthropic", "https://api.anthropic.com/v1/messages")
                .unwrap()
                .path(),
            "/v1/messages"
        );
    }

    #[test]
    fn provider_catalog_deserializes_from_embedded_resource() {
        let anthropic = catalog_entry("anthropic").unwrap();
        assert_eq!(anthropic.auth_header.as_deref(), Some("x-api-key"));
        assert_eq!(anthropic.chat_path.as_deref(), Some("/v1/messages"));
        assert_eq!(anthropic.model_list_path.as_deref(), Some("/v1/models"));
    }

    #[test]
    fn unsupported_provider_is_rejected_before_accessing_credential_store() {
        let error = credential_entry("vertex-ai").unwrap_err();
        assert!(error.contains("não aceita credenciais"));
    }

    #[test]
    fn maps_provider_statuses_to_safe_portuguese_errors() {
        for (status, expected) in [
            (400, "HTTP 400"),
            (401, "HTTP 401"),
            (403, "HTTP 403"),
            (404, "HTTP 404"),
            (408, "HTTP 408"),
            (429, "HTTP 429"),
            (503, "HTTP 503"),
        ] {
            let message = provider_http_error(status);
            assert!(message.contains(expected));
            assert!(!message.contains("test-secret"));
        }
        assert!(provider_http_error(429).contains("limite de uso"));
    }

    #[test]
    fn optional_ping_is_limited_to_one_output_token() {
        for provider in ["openai", "anthropic", "groq", "azure-openai", "bedrock"] {
            let body = ping_body(provider, "model").unwrap();
            assert_eq!(body["max_tokens"], 1);
            assert_eq!(body["messages"][0]["content"], "ping");
        }
        assert!(ping_body("perplexity", "model").is_none());
    }

    #[test]
    fn parses_anthropic_text_and_perplexity_citations() {
        let anthropic = parse_provider_reply(
            "anthropic",
            &json!({ "content": [{ "type": "text", "text": "Resposta" }] }),
        )
        .unwrap();
        assert_eq!(anthropic.content, "Resposta");

        let perplexity = parse_provider_reply(
            "perplexity",
            &json!({ "output": [{ "type": "message", "content": [{ "type": "output_text", "text": "Resposta", "annotations": [{ "type": "url_citation", "url": "https://example.com/source", "title": "Fonte" }] }] }] }),
        )
        .unwrap();
        assert_eq!(perplexity.content, "Resposta");
        assert_eq!(perplexity.citations[0].title, "Fonte");
    }

    #[tokio::test]
    async fn sends_adapter_urls_headers_and_bodies_to_mock_server() {
        use std::io::{Read, Write};
        for entry in serde_json::from_str::<Vec<CatalogEntry>>(include_str!(
            "../../resources/provider-catalog.json"
        ))
        .unwrap()
        {
            let provider = entry.id.as_str();
            if !supports_credentials(provider) {
                continue;
            }
            let base_url = match provider {
                "azure-openai" => "https://resource.openai.azure.com/openai/v1".to_string(),
                _ => entry.base_url.clone(),
            };
            let endpoint = provider_endpoint(provider, &base_url).unwrap();
            let body = if provider == "perplexity" {
                json!({ "model": "test-model", "input": "ping" })
            } else {
                ping_body(provider, "test-model").unwrap()
            };
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let expected_path = endpoint.path().to_string();
            let server = std::thread::spawn(move || {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut bytes = Vec::new();
                let mut chunk = [0_u8; 4096];
                loop {
                    let count = socket.read(&mut chunk).unwrap();
                    if count == 0 {
                        break;
                    }
                    bytes.extend_from_slice(&chunk[..count]);
                    if let Some(header_end) = bytes.windows(4).position(|part| part == b"\r\n\r\n")
                    {
                        let headers =
                            String::from_utf8_lossy(&bytes[..header_end]).to_ascii_lowercase();
                        let content_length = headers
                            .lines()
                            .find_map(|line| line.strip_prefix("content-length: "))
                            .and_then(|value| value.parse::<usize>().ok())
                            .unwrap_or(0);
                        if bytes.len() >= header_end + 4 + content_length {
                            break;
                        }
                    }
                }
                let request = String::from_utf8_lossy(&bytes).to_ascii_lowercase();
                socket
                    .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}")
                    .unwrap();
                (request, expected_path)
            });
            let client = Client::new();
            client
                .post(format!("http://{address}{}", endpoint.path()))
                .pipe_auth(provider, "test-secret")
                .unwrap()
                .json(&body)
                .send()
                .await
                .unwrap();
            let (request, expected_path) = server.join().unwrap();
            let first_line = request.lines().next().unwrap_or_default();
            assert!(
                first_line.contains(&expected_path),
                "URL incorreta para {provider}: {first_line}"
            );
            let expected_header = match entry.auth_header.as_deref() {
                Some("x-api-key") => "x-api-key: test-secret",
                Some("api-key") => "api-key: test-secret",
                _ => "authorization: bearer test-secret",
            };
            assert!(
                request.contains(expected_header),
                "cabeçalho incorreto para {provider}"
            );
            assert!(
                request.contains("\"model\":\"test-model\""),
                "corpo incorreto para {provider}"
            );
            if provider == "anthropic" {
                assert!(!request.contains("authorization:"));
            }
            if provider == "azure-openai" {
                assert!(!request.contains("authorization:"));
            }
        }
    }

    #[test]
    fn extracts_only_text_from_stream_events() {
        assert_eq!(
            stream_delta(
                "anthropic",
                &json!({"type":"content_block_delta","delta":{"type":"text_delta","text":"Olá"}})
            ),
            Some("Olá")
        );
        assert_eq!(
            stream_delta(
                "anthropic",
                &json!({"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"secret"}})
            ),
            None
        );
        assert_eq!(
            stream_delta(
                "openai",
                &json!({"choices":[{"delta":{"content":"Tudo bem"}}]})
            ),
            Some("Tudo bem")
        );
    }
}
