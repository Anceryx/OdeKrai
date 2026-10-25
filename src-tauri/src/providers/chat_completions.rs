use super::ProviderMessage;
use serde_json::{json, Value};

pub(super) fn request_body(model: &str, messages: &[ProviderMessage], streaming: bool) -> Value {
    json!({ "model": model, "messages": messages, "stream": streaming })
}
