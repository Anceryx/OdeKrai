use super::ProviderMessage;
use serde_json::{json, Value};

pub(super) fn request_body(model: &str, messages: &[ProviderMessage], streaming: bool) -> Value {
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
    let mut body = json!({ "model": model, "max_tokens": 2048, "messages": conversation, "stream": streaming });
    if !system.is_empty() {
        body["system"] = json!(system);
    }
    body
}
