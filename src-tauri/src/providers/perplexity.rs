use super::{ProviderCitation, ProviderMessage, ProviderReply};
use reqwest::Url;
use serde_json::{json, Value};

pub(super) fn perplexity_body(model: &str, messages: &[ProviderMessage]) -> Value {
    let input = messages
        .iter()
        .filter(|message| message.role != "system")
        .map(|message| format!("{}: {}", message.role, message.content))
        .collect::<Vec<_>>()
        .join("\n\n");
    let instructions = messages
        .iter()
        .filter(|message| message.role == "system")
        .map(|message| message.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    let mut body = json!({ "model": model, "input": input });
    if !instructions.is_empty() {
        body["instructions"] = json!(instructions);
    }
    body
}

pub(super) fn parse_reply(payload: &Value) -> Result<ProviderReply, String> {
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
    Ok(ProviderReply { content, citations })
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
