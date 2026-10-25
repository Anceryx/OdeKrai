use super::{ProviderEvent, ToolCall};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Default)]
pub(super) struct StreamState {
    anthropic_tools: BTreeMap<u64, PartialTool>,
    chat_tools: BTreeMap<u64, PartialTool>,
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    stop_reason: Option<String>,
    completed_tools: Vec<ToolCall>,
    done_emitted: bool,
    usage_emitted: bool,
}

#[derive(Default)]
struct PartialTool {
    id: String,
    name: String,
    arguments: String,
}

impl StreamState {
    pub(super) fn consume(
        &mut self,
        provider_id: &str,
        payload: &Value,
    ) -> Result<Vec<ProviderEvent>, String> {
        if payload["type"] == "error" || payload.get("error").is_some() {
            return Err("O provedor interrompeu a resposta.".into());
        }
        if provider_id == "anthropic" {
            self.consume_anthropic(payload)
        } else {
            self.consume_chat_completions(payload)
        }
    }

    fn consume_anthropic(&mut self, payload: &Value) -> Result<Vec<ProviderEvent>, String> {
        let mut events = Vec::new();
        match payload["type"].as_str() {
            Some("message_start") => {
                self.input_tokens = payload["message"]["usage"]["input_tokens"].as_u64();
            }
            Some("content_block_start") if payload["content_block"]["type"] == "tool_use" => {
                let Some(index) = payload["index"].as_u64() else {
                    return Err("O provedor retornou um bloco de ferramenta inválido.".into());
                };
                let block = &payload["content_block"];
                self.anthropic_tools.insert(
                    index,
                    PartialTool {
                        id: block["id"].as_str().unwrap_or_default().to_owned(),
                        name: block["name"].as_str().unwrap_or_default().to_owned(),
                        arguments: String::new(),
                    },
                );
            }
            Some("content_block_delta") if payload["delta"]["type"] == "text_delta" => {
                if let Some(text) = payload["delta"]["text"].as_str() {
                    events.push(ProviderEvent::TextDelta {
                        text: text.to_owned(),
                    });
                }
            }
            Some("content_block_delta") if payload["delta"]["type"] == "input_json_delta" => {
                let Some(index) = payload["index"].as_u64() else {
                    return Err("O provedor retornou argumentos de ferramenta inválidos.".into());
                };
                if let Some(tool) = self.anthropic_tools.get_mut(&index) {
                    tool.arguments.push_str(
                        payload["delta"]["partial_json"]
                            .as_str()
                            .unwrap_or_default(),
                    );
                }
            }
            Some("content_block_stop") => {
                if let Some(index) = payload["index"].as_u64() {
                    if let Some(tool) = self.anthropic_tools.remove(&index) {
                        let call = complete_tool(tool)?;
                        self.completed_tools.push(call.clone());
                        events.push(ProviderEvent::ToolCallComplete {
                            id: call.id,
                            name: call.name,
                            args: call.args,
                        });
                    }
                }
            }
            Some("message_delta") => {
                self.output_tokens = payload["usage"]["output_tokens"].as_u64();
                self.stop_reason = payload["delta"]["stop_reason"].as_str().map(str::to_owned);
                self.emit_usage(&mut events);
            }
            Some("message_stop") => {
                self.done_emitted = true;
                events.push(ProviderEvent::Done {
                    stop_reason: self.stop_reason.clone(),
                });
            }
            Some("error") => return Err("O provedor interrompeu a resposta.".into()),
            _ => {}
        }
        Ok(events)
    }

    fn consume_chat_completions(&mut self, payload: &Value) -> Result<Vec<ProviderEvent>, String> {
        let mut events = Vec::new();
        if let Some(text) = payload["choices"][0]["delta"]["content"].as_str() {
            if !text.is_empty() {
                events.push(ProviderEvent::TextDelta {
                    text: text.to_owned(),
                });
            }
        }
        if let Some(calls) = payload["choices"][0]["delta"]["tool_calls"].as_array() {
            for call in calls {
                let Some(index) = call["index"].as_u64() else {
                    return Err("O provedor retornou um bloco de ferramenta inválido.".into());
                };
                let state = self.chat_tools.entry(index).or_default();
                if let Some(id) = call["id"].as_str() {
                    state.id.push_str(id);
                }
                if let Some(name) = call["function"]["name"].as_str() {
                    state.name.push_str(name);
                }
                if let Some(arguments) = call["function"]["arguments"].as_str() {
                    state.arguments.push_str(arguments);
                }
            }
        }
        if payload["usage"].is_object() {
            self.input_tokens = payload["usage"]["prompt_tokens"].as_u64();
            self.output_tokens = payload["usage"]["completion_tokens"].as_u64();
            self.emit_usage(&mut events);
        }
        if let Some(reason) = payload["choices"][0]["finish_reason"].as_str() {
            self.stop_reason = Some(reason.to_owned());
            if reason == "tool_calls" {
                events.extend(self.finish_tool_calls()?);
            }
            if reason != "null" {
                self.done_emitted = true;
                events.push(ProviderEvent::Done {
                    stop_reason: self.stop_reason.clone(),
                });
            }
        }
        Ok(events)
    }

    pub(super) fn finish(&mut self) -> Result<Vec<ProviderEvent>, String> {
        let mut events = self.finish_tool_calls()?;
        self.emit_usage(&mut events);
        if !self.done_emitted {
            self.done_emitted = true;
            events.push(ProviderEvent::Done {
                stop_reason: self.stop_reason.clone(),
            });
        }
        Ok(events)
    }

    fn finish_tool_calls(&mut self) -> Result<Vec<ProviderEvent>, String> {
        let pending = std::mem::take(&mut self.chat_tools);
        let calls = pending
            .into_values()
            .map(complete_tool)
            .collect::<Result<Vec<_>, _>>()?;
        self.completed_tools.extend(calls.iter().cloned());
        Ok(calls
            .into_iter()
            .map(|call| ProviderEvent::ToolCallComplete {
                id: call.id,
                name: call.name,
                args: call.args,
            })
            .collect())
    }

    fn emit_usage(&mut self, events: &mut Vec<ProviderEvent>) {
        if !self.usage_emitted {
            if let (Some(input), Some(output)) = (self.input_tokens, self.output_tokens) {
                events.push(ProviderEvent::Usage { input, output });
                self.usage_emitted = true;
            }
        }
    }

    pub(super) fn tool_calls(&self) -> &[ToolCall] {
        &self.completed_tools
    }

    pub(super) fn usage(&self) -> Option<super::Usage> {
        Some(super::Usage {
            input: self.input_tokens?,
            output: self.output_tokens?,
        })
    }

    pub(super) fn stop_reason(&self) -> Option<String> {
        self.stop_reason.clone()
    }
}

fn complete_tool(tool: PartialTool) -> Result<ToolCall, String> {
    if tool.id.is_empty() || tool.name.is_empty() {
        return Err("O provedor retornou uma chamada de ferramenta incompleta.".into());
    }
    let args = if tool.arguments.is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_str(&tool.arguments).map_err(|_| {
            "Os argumentos da ferramenta retornados pelo provedor não são JSON válido.".to_string()
        })?
    };
    Ok(ToolCall {
        id: tool.id,
        name: tool.name,
        args,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn emits_chat_completion_tool_call_only_after_argument_fragments_form_valid_json() {
        let mut state = StreamState::default();
        let first_arguments = r#"{"key":"#;
        let second_arguments = r#""value"}"#;
        let first = state
            .consume(
                "openai",
                &json!({ "choices": [{ "delta": { "tool_calls": [{ "index": 0, "id": "call-1", "function": { "name": "lookup", "arguments": first_arguments } }] } }] }),
            )
            .unwrap();
        assert!(first.is_empty());
        let second = state
            .consume(
                "openai",
                &json!({ "choices": [{ "delta": { "tool_calls": [{ "index": 0, "function": { "arguments": second_arguments } }] } }] }),
            )
            .unwrap();
        assert!(second.is_empty());
        let complete = state
            .consume(
                "openai",
                &json!({ "choices": [{ "delta": {}, "finish_reason": "tool_calls" }] }),
            )
            .unwrap();
        assert_eq!(
            complete[0],
            ProviderEvent::ToolCallComplete {
                id: "call-1".into(),
                name: "lookup".into(),
                args: json!({ "key": "value" }),
            }
        );
    }

    #[test]
    fn anthropic_tool_call_and_usage_are_emitted_only_when_complete() {
        let mut state = StreamState::default();
        let partial_json = r#"{"key":"value"}"#;
        state
            .consume(
                "anthropic",
                &json!({ "type": "message_start", "message": { "usage": { "input_tokens": 9 } } }),
            )
            .unwrap();
        state
            .consume(
                "anthropic",
                &json!({ "type": "content_block_start", "index": 2, "content_block": { "type": "tool_use", "id": "toolu-1", "name": "lookup", "input": {} } }),
            )
            .unwrap();
        let partial = state
            .consume(
                "anthropic",
                &json!({ "type": "content_block_delta", "index": 2, "delta": { "type": "input_json_delta", "partial_json": partial_json } }),
            )
            .unwrap();
        assert!(partial.is_empty());
        let complete = state
            .consume(
                "anthropic",
                &json!({ "type": "content_block_stop", "index": 2 }),
            )
            .unwrap();
        assert_eq!(
            complete,
            vec![ProviderEvent::ToolCallComplete {
                id: "toolu-1".into(),
                name: "lookup".into(),
                args: json!({ "key": "value" }),
            }]
        );
        let usage = state
            .consume(
                "anthropic",
                &json!({ "type": "message_delta", "delta": { "stop_reason": "tool_use" }, "usage": { "output_tokens": 4 } }),
            )
            .unwrap();
        assert_eq!(
            usage,
            vec![ProviderEvent::Usage {
                input: 9,
                output: 4
            }]
        );
    }

    #[test]
    fn invalid_arguments_never_emit_a_partial_tool_call() {
        let mut state = StreamState::default();
        state
            .consume(
                "openai",
                &json!({ "choices": [{ "delta": { "tool_calls": [{ "index": 0, "id": "call-1", "function": { "name": "lookup", "arguments": "{bad" } }] } }] }),
            )
            .unwrap();
        assert!(state.finish().unwrap_err().contains("JSON válido"));
    }
}
