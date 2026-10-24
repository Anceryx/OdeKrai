use keyring::Entry;
use reqwest::{header, redirect::Policy, Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, sync::Mutex, time::Duration};
use tauri::State;
use tokio_util::sync::CancellationToken;

const KEYRING_SERVICE: &str = "site.anceryx.odekrai.provider";
const MAX_CREDENTIAL_BYTES: usize = 4096;
const MAX_MESSAGE_BYTES: usize = 1_000_000;

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

fn supports_credentials(provider_id: &str) -> bool {
    matches!(
        provider_id,
        "openai"
            | "anthropic"
            | "gemini"
            | "xai"
            | "mistral"
            | "cohere"
            | "groq"
            | "deepseek"
            | "perplexity"
            | "together"
            | "openrouter"
            | "fireworks"
            | "azure-openai"
            | "bedrock"
    )
}

fn credential_entry(provider_id: &str) -> Result<Entry, String> {
    if !supports_credentials(provider_id) {
        return Err("Este provedor ainda não aceita credenciais no OdeKrai.".into());
    }
    Entry::new(KEYRING_SERVICE, provider_id)
        .map_err(|_| "Não foi possível acessar o Gerenciador de Credenciais do Windows.".into())
}

#[tauri::command]
pub fn save_provider_credential(provider_id: String, credential: String) -> Result<(), String> {
    let credential = credential.trim();
    if credential.is_empty() || credential.len() > MAX_CREDENTIAL_BYTES {
        return Err("Informe uma credencial válida (até 4.096 bytes).".into());
    }
    credential_entry(&provider_id)?
        .set_password(credential)
        .map_err(|_| "Não foi possível salvar a credencial no Gerenciador do Windows.".into())
}

#[tauri::command]
pub fn has_provider_credential(provider_id: String) -> Result<bool, String> {
    match credential_entry(&provider_id)?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(_) => Err("Não foi possível consultar o Gerenciador de Credenciais do Windows.".into()),
    }
}

#[tauri::command]
pub fn remove_provider_credential(provider_id: String) -> Result<(), String> {
    match credential_entry(&provider_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Não foi possível remover a credencial do Gerenciador do Windows.".into()),
    }
}

#[tauri::command]
pub async fn cancel_provider_request(
    state: State<'_, ProviderRequests>,
    request_id: String,
) -> Result<bool, String> {
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
pub async fn send_provider_message(
    state: State<'_, ProviderRequests>,
    provider_id: String,
    base_url: String,
    model: String,
    messages: Vec<ProviderMessage>,
    request_id: String,
) -> Result<ProviderReply, String> {
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

    let result = tokio::select! {
        _ = cancellation.cancelled() => Err("Solicitação cancelada.".into()),
        response = request_provider(&provider_id, &base_url, &model, &messages) => response,
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
) -> Result<ProviderReply, String> {
    let entry = credential_entry(provider_id)?;
    let credential = entry.get_password().map_err(|error| match error {
        keyring::Error::NoEntry => {
            "Salve uma credencial para este provedor antes de conversar.".to_string()
        }
        _ => "Não foi possível recuperar a credencial do Gerenciador do Windows.".to_string(),
    })?;
    let endpoint = provider_endpoint(provider_id, base_url)?;
    let client = Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|_| "Não foi possível preparar uma conexão segura.".to_string())?;

    let request = match provider_id {
        "anthropic" => {
            let system = messages
                .iter()
                .filter(|message| message.role == "system")
                .map(|message| message.content.as_str())
                .collect::<Vec<_>>()
                .join("\n\n");
            let conversation = messages
                .iter()
                .filter(|message| message.role != "system")
                .map(|message| json!({ "role": message.role, "content": message.content }))
                .collect::<Vec<_>>();
            let mut body = json!({ "model": model, "max_tokens": 2048, "messages": conversation });
            if !system.is_empty() {
                body["system"] = json!(system);
            }
            client
                .post(endpoint)
                .header(header::AUTHORIZATION, bearer_value(&credential)?)
                .header("anthropic-version", "2023-06-01")
                .json(&body)
        }
        "perplexity" => {
            let input = messages
                .iter()
                .map(|message| format!("{}: {}", message.role, message.content))
                .collect::<Vec<_>>()
                .join("\n\n");
            client
                .post(endpoint)
                .header(header::AUTHORIZATION, bearer_value(&credential)?)
                .json(&json!({ "model": model, "input": input }))
        }
        "azure-openai" => client
            .post(endpoint)
            .header("api-key", header_value(&credential)?)
            .json(&json!({ "model": model, "messages": messages, "stream": false })),
        _ => client
            .post(endpoint)
            .header(header::AUTHORIZATION, bearer_value(&credential)?)
            .json(&json!({ "model": model, "messages": messages, "stream": false })),
    };

    let response = request
        .send()
        .await
        .map_err(|error| safe_transport_error(&error))?;
    let status = response.status();
    let payload: Value = response
        .json()
        .await
        .map_err(|_| "O provedor retornou uma resposta inválida.".to_string())?;
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 | 403 => "O provedor recusou a credencial ou as permissões configuradas.".into(),
            404 => "O endpoint ou modelo não foi encontrado. Confira a configuração.".into(),
            429 => "O limite de solicitações do provedor foi atingido. Tente novamente mais tarde."
                .into(),
            400 => "O provedor rejeitou o modelo ou os parâmetros da solicitação.".into(),
            500..=599 => "O serviço do provedor está indisponível no momento.".into(),
            _ => format!("O provedor respondeu com HTTP {}.", status.as_u16()),
        });
    }
    parse_provider_reply(provider_id, &payload)
}

fn provider_endpoint(provider_id: &str, base_url: &str) -> Result<Url, String> {
    if !supports_credentials(provider_id) {
        return Err("Este provedor ainda não possui um adaptador ativo.".into());
    }
    let mut url =
        Url::parse(base_url.trim()).map_err(|_| "Informe um endpoint válido.".to_string())?;
    if url.scheme() != "https"
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
    let allowed = match provider_id {
        "openai" => host == "api.openai.com",
        "anthropic" => host == "api.anthropic.com",
        "gemini" => host == "generativelanguage.googleapis.com",
        "xai" => host == "api.x.ai",
        "mistral" => host == "api.mistral.ai",
        "cohere" => host == "api.cohere.ai" || host == "api.cohere.com",
        "groq" => host == "api.groq.com",
        "deepseek" => host == "api.deepseek.com",
        "perplexity" => host == "api.perplexity.ai",
        "together" => host == "api.together.ai",
        "openrouter" => host == "openrouter.ai",
        "fireworks" => host == "api.fireworks.ai",
        "azure-openai" => {
            host.ends_with(".openai.azure.com") || host.ends_with(".services.ai.azure.com")
        }
        "bedrock" => {
            (host.starts_with("bedrock-runtime.") && host.ends_with(".amazonaws.com"))
                || (host.starts_with("bedrock-mantle.") && host.ends_with(".api.aws"))
        }
        _ => false,
    };
    if !allowed {
        return Err("O domínio do endpoint não corresponde ao provedor selecionado.".into());
    }

    let path = url.path().trim_end_matches('/');
    let endpoint_path = match provider_id {
        "anthropic" => "/v1/messages",
        "perplexity" => "/v1/agent",
        "azure-openai" if path.ends_with("/openai/v1") => "/chat/completions",
        "bedrock" if path.ends_with("/openai/v1") => "/chat/completions",
        "azure-openai" | "bedrock" => {
            return Err("O endpoint precisa terminar em /openai/v1.".into());
        }
        _ => "/chat/completions",
    };
    let path = match provider_id {
        "anthropic" if path.is_empty() || path == "/" => "/v1/messages".to_string(),
        "anthropic" if path.ends_with("/v1/messages") => path.to_string(),
        "anthropic" => return Err("O endpoint da Anthropic precisa ser a raiz da API.".into()),
        "perplexity" => path.to_string(),
        _ => format!("{path}{endpoint_path}"),
    };
    url.set_path(&path);
    Ok(url)
}

fn header_value(value: &str) -> Result<header::HeaderValue, String> {
    header::HeaderValue::from_str(value)
        .map_err(|_| "A credencial contém caracteres inválidos para uma requisição.".to_string())
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
        let output = payload["output"].as_array().ok_or_else(|| {
            "A Agent API da Perplexity retornou uma resposta em formato inesperado.".to_string()
        })?;
        let mut texts = Vec::new();
        let mut citations = Vec::new();
        for item in output {
            if let Some(contents) = item["content"].as_array() {
                for content in contents {
                    if content["type"] == "output_text" {
                        if let Some(text) = content["text"].as_str() {
                            texts.push(text.to_string());
                        }
                        if let Some(annotations) = content["annotations"].as_array() {
                            citations.extend(annotations.iter().filter_map(citation_from_value));
                        }
                    }
                }
            }
            if let Some(results) = item["results"].as_array() {
                citations.extend(results.iter().filter_map(citation_from_value));
            }
        }
        let content = texts.join("\n\n").trim().to_string();
        if content.is_empty() {
            return Err("A Agent API da Perplexity retornou uma resposta vazia.".into());
        }
        citations.sort_by(|left, right| left.url.cmp(&right.url));
        citations.dedup_by(|left, right| left.url == right.url);
        return Ok(ProviderReply { content, citations });
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

fn citation_from_value(value: &Value) -> Option<ProviderCitation> {
    let url = value
        .get("url")
        .or_else(|| {
            value
                .get("url_citation")
                .and_then(|citation| citation.get("url"))
        })?
        .as_str()?;
    let parsed = Url::parse(url).ok()?;
    if parsed.scheme() != "https" {
        return None;
    }
    let title = value
        .get("title")
        .or_else(|| {
            value
                .get("url_citation")
                .and_then(|citation| citation.get("title"))
        })
        .and_then(Value::as_str)
        .filter(|title| !title.trim().is_empty())
        .unwrap_or(url)
        .chars()
        .take(200)
        .collect();
    Some(ProviderCitation {
        title,
        url: parsed.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
}
