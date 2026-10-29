use super::ChatRequest;
use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Clone, Debug, Default)]
pub(super) struct FunctionNameMap {
    to_api: HashMap<String, String>,
    from_api: HashMap<String, String>,
}

impl FunctionNameMap {
    fn add(&mut self, name: &str) -> Result<(), String> {
        if self.to_api.contains_key(name) {
            return Ok(());
        }
        let api_name = openai_function_name(name);
        if api_name.len() > 64 {
            return Err(
                "O identificador interno de uma ferramenta excede o limite aceito pela OpenAI."
                    .into(),
            );
        }
        if self
            .from_api
            .insert(api_name.clone(), name.to_owned())
            .is_some()
        {
            return Err("Não foi possível mapear com segurança os nomes das ferramentas.".into());
        }
        self.to_api.insert(name.to_owned(), api_name);
        Ok(())
    }

    fn api_name(&self, name: &str) -> Result<&str, String> {
        self.to_api
            .get(name)
            .map(String::as_str)
            .ok_or_else(|| "O histórico contém uma chamada de ferramenta sem nome mapeado.".into())
    }

    pub(super) fn original_name(&self, api_name: &str) -> Option<&str> {
        self.from_api.get(api_name).map(String::as_str)
    }
}

fn openai_function_name(name: &str) -> String {
    let mut api_name = String::from("f_");
    for byte in name.bytes() {
        match byte {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' => api_name.push(byte as char),
            b'_' => api_name.push_str("_u"),
            b'.' => api_name.push_str("_d"),
            _ => api_name.push_str(&format!("_x{byte:02x}")),
        }
    }
    api_name
}

pub(super) fn normalize_tool_names(
    mut request: ChatRequest,
) -> Result<(ChatRequest, FunctionNameMap), String> {
    let mut names = FunctionNameMap::default();
    for tool in &request.tools {
        names.add(&tool.name)?;
    }
    for message in &request.messages {
        for block in &message.blocks {
            if let super::Block::ToolCall { name, .. } = block {
                names.add(name)?;
            }
        }
    }
    for tool in &mut request.tools {
        tool.name = names.api_name(&tool.name)?.to_owned();
    }
    for message in &mut request.messages {
        for block in &mut message.blocks {
            if let super::Block::ToolCall { name, .. } = block {
                *name = names.api_name(name)?.to_owned();
            }
        }
    }
    Ok((request, names))
}

pub(super) fn restore_tool_names(
    reply: &mut super::ProviderReply,
    names: &FunctionNameMap,
) -> Result<(), String> {
    for call in &mut reply.tool_calls {
        call.name = names
            .original_name(&call.name)
            .ok_or_else(|| "O provedor retornou uma ferramenta que não foi anunciada.".to_string())?
            .to_owned();
    }
    Ok(())
}

pub(super) fn restore_event_name(
    event: &mut super::ProviderEvent,
    names: &FunctionNameMap,
) -> bool {
    if let super::ProviderEvent::ToolCallComplete { name, .. } = event {
        if let Some(original) = names.original_name(name) {
            *name = original.to_owned();
            return true;
        }
        return false;
    }
    true
}

pub(super) fn chat_request_body(
    request: &ChatRequest,
    include_usage: bool,
    reasoning_effort: Option<&str>,
) -> Value {
    let mut body = request_body_neutral(request);
    if let Some(reasoning_effort) = reasoning_effort {
        body["reasoning_effort"] = json!(reasoning_effort);
    }
    if !request.tools.is_empty() {
        body["tools"] = Value::Array(
            request
                .tools
                .iter()
                .map(|tool| {
                    json!({
                        "type": "function",
                        "function": {
                            "name": tool.name,
                            "description": tool.description,
                            "parameters": tool.json_schema
                        }
                    })
                })
                .collect(),
        );
    }
    if request.streaming && include_usage {
        body["stream_options"] = json!({ "include_usage": true });
    }
    body
}

fn request_body_neutral(request: &ChatRequest) -> Value {
    let messages = request
        .messages
        .iter()
        .flat_map(|message| {
            let text = message
                .blocks
                .iter()
                .filter_map(|block| match block {
                    super::Block::Text { text } => Some(text.as_str()),
                    _ => None,
                })
                .collect::<String>();
            match message.role.as_str() {
                "tool" => {
                    let results = message.blocks.iter().filter_map(|block| match block {
                        super::Block::ToolResult {
                            call_id,
                            content,
                            ..
                        } => Some(json!({
                            "role": "tool",
                            "tool_call_id": call_id,
                            "content": content
                        })),
                        _ => None,
                    }).collect::<Vec<_>>();
                    if results.is_empty() {
                        vec![json!({ "role": "tool", "content": text })]
                    } else {
                        results
                    }
                }
                "assistant" => {
                    let tool_calls = message
                        .blocks
                        .iter()
                        .filter_map(|block| match block {
                            super::Block::ToolCall { id, name, args } => Some(json!({
                                "id": id,
                                "type": "function",
                                "function": {
                                    "name": name,
                                    "arguments": args.to_string()
                                }
                            })),
                            _ => None,
                        })
                        .collect::<Vec<_>>();
                    if tool_calls.is_empty() {
                        vec![json!({ "role": message.role, "content": text })]
                    } else {
                        vec![json!({ "role": message.role, "content": if text.is_empty() { Value::Null } else { json!(text) }, "tool_calls": tool_calls })]
                    }
                }
                "user" if message.blocks.iter().any(|block| matches!(block, super::Block::Image { .. })) => {
                    let mut parts = message.blocks.iter().filter_map(|block| match block {
                        super::Block::Text { text } if !text.is_empty() => Some(json!({"type":"text","text":text})),
                        super::Block::Image { media_type, data_base64 } => Some(json!({
                            "type":"image_url",
                            "image_url":{"url":format!("data:{media_type};base64,{data_base64}"),"detail":"low"}
                        })),
                        _ => None,
                    }).collect::<Vec<_>>();
                    if parts.is_empty() { parts.push(json!({"type":"text","text":""})); }
                    vec![json!({ "role": "user", "content": parts })]
                }
                _ => vec![json!({ "role": message.role, "content": text })],
            }
        })
        .collect::<Vec<_>>();
    json!({
        "model": request.model,
        "messages": messages,
        "stream": request.streaming
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn openai_function_names_are_normalized_and_restored_for_current_and_historical_calls() {
        let request = ChatRequest {
            model: "gpt-6-luna".into(),
            messages: vec![super::super::Message {
                role: "assistant".into(),
                blocks: vec![super::super::Block::ToolCall {
                    id: "call-1".into(),
                    name: "google.calendar.update_event".into(),
                    args: json!({ "event_id": "event-1" }),
                }],
            }],
            tools: vec![super::super::ToolDef {
                name: "google.calendar.update_event".into(),
                description: "Atualiza evento".into(),
                json_schema: json!({ "type": "object", "properties": {}, "required": [], "additionalProperties": false }),
            }],
            streaming: true,
        };

        let (request, names) = normalize_tool_names(request).unwrap();
        let api_name = request.tools[0].name.clone();
        assert!(api_name.len() <= 64);
        assert!(api_name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-'));
        assert_eq!(
            request.messages[0].blocks[0],
            super::super::Block::ToolCall {
                id: "call-1".into(),
                name: api_name.clone(),
                args: json!({ "event_id": "event-1" }),
            }
        );
        assert_eq!(request.tools[0].json_schema["additionalProperties"], false);
        let body = chat_request_body(&request, true, Some("none"));
        assert_eq!(
            body["tools"][0]["function"]["name"].as_str(),
            Some(request.tools[0].name.as_str())
        );
        assert_eq!(
            body["messages"][0]["tool_calls"][0]["function"]["name"].as_str(),
            Some(request.tools[0].name.as_str())
        );

        let mut reply = super::super::ProviderReply {
            content: String::new(),
            tool_calls: vec![super::super::ToolCall {
                id: "call-2".into(),
                name: api_name,
                args: json!({ "event_id": "event-2" }),
            }],
            usage: None,
            stop_reason: None,
            citations: Vec::new(),
        };
        restore_tool_names(&mut reply, &names).unwrap();
        assert_eq!(reply.tool_calls[0].name, "google.calendar.update_event");
    }

    #[test]
    fn openai_function_aliases_are_stable_distinct_and_bounded() {
        let make_request = |tool_names: &[&str]| ChatRequest {
            model: "gpt-6-luna".into(),
            messages: Vec::new(),
            tools: tool_names
                .iter()
                .map(|name| super::super::ToolDef {
                    name: (*name).into(),
                    description: String::new(),
                    json_schema: json!({ "type": "object" }),
                })
                .collect(),
            streaming: false,
        };
        let (first, _) = normalize_tool_names(make_request(&["files.read", "files_read"])).unwrap();
        let (second, _) =
            normalize_tool_names(make_request(&["files.read", "files_read"])).unwrap();

        assert_eq!(first.tools[0].name, second.tools[0].name);
        assert_ne!(first.tools[0].name, first.tools[1].name);
        assert!(normalize_tool_names(make_request(&[&"x".repeat(63)])).is_err());
    }

    #[test]
    fn every_registered_skill_name_fits_the_openai_function_name_contract() {
        let tools = crate::security::skills::registry()
            .into_iter()
            .map(|skill| super::super::ToolDef {
                name: skill.id.into(),
                description: skill.model_description.into(),
                json_schema: skill.schema,
            })
            .collect::<Vec<_>>();
        let (request, names) = normalize_tool_names(ChatRequest {
            model: "gpt-6-luna".into(),
            messages: Vec::new(),
            tools,
            streaming: true,
        })
        .unwrap();

        assert!(!request.tools.is_empty());
        for tool in &request.tools {
            assert!(tool.name.len() <= 64);
            assert!(tool
                .name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-'));
            assert!(names.original_name(&tool.name).is_some());
        }
    }

    #[test]
    fn serializes_tool_calls_results_and_usage_request_options() {
        let request = ChatRequest {
            model: "mock-model".into(),
            messages: vec![
                super::super::Message {
                    role: "assistant".into(),
                    blocks: vec![super::super::Block::ToolCall {
                        id: "call-1".into(),
                        name: "lookup".into(),
                        args: json!({ "key": "value" }),
                    }],
                },
                super::super::Message {
                    role: "tool".into(),
                    blocks: vec![
                        super::super::Block::ToolResult {
                            call_id: "call-1".into(),
                            content: "found".into(),
                            is_error: false,
                        },
                        super::super::Block::ToolResult {
                            call_id: "call-2".into(),
                            content: "also found".into(),
                            is_error: true,
                        },
                    ],
                },
            ],
            tools: vec![super::super::ToolDef {
                name: "lookup".into(),
                description: "Look up an item".into(),
                json_schema: json!({ "type": "object", "properties": { "key": { "type": "string" } } }),
            }],
            streaming: true,
        };

        let body = chat_request_body(&request, true, Some("none"));
        assert_eq!(body["tools"][0]["function"]["name"], "lookup");
        assert_eq!(body["messages"][0]["tool_calls"][0]["id"], "call-1");
        assert_eq!(body["messages"][1]["tool_call_id"], "call-1");
        assert_eq!(body["messages"][2]["tool_call_id"], "call-2");
        assert_eq!(body["stream_options"]["include_usage"], true);
        assert_eq!(body["reasoning_effort"], "none");
    }

    #[test]
    fn serializes_only_user_image_blocks_as_chat_completions_image_urls() {
        let request = ChatRequest {
            model: "gpt-6-astra".into(),
            messages: vec![super::super::Message {
                role: "user".into(),
                blocks: vec![
                    super::super::Block::Text {
                        text: "Read this".into(),
                    },
                    super::super::Block::Image {
                        media_type: "image/jpeg".into(),
                        data_base64: "aGVsbG8=".into(),
                    },
                ],
            }],
            tools: Vec::new(),
            streaming: false,
        };
        let body = chat_request_body(&request, false, None);
        assert_eq!(body["messages"][0]["content"][0]["text"], "Read this");
        assert_eq!(body["messages"][0]["content"][1]["type"], "image_url");
        assert_eq!(
            body["messages"][0]["content"][1]["image_url"]["detail"],
            "low"
        );
        assert!(body["messages"][0]["content"][1]["image_url"]["url"]
            .as_str()
            .unwrap()
            .contains("base64,aGVsbG8="));
    }

    #[test]
    fn ordinary_chat_request_does_not_announce_tools_or_agent_options() {
        let body = chat_request_body(
            &ChatRequest {
                model: "gpt-6-luna".into(),
                messages: vec![super::super::Message {
                    role: "user".into(),
                    blocks: vec![super::super::Block::Text {
                        text: "Olá".into()
                    }],
                }],
                tools: Vec::new(),
                streaming: false,
            },
            false,
            None,
        );

        assert_eq!(body["messages"][0]["content"], "Olá");
        assert!(body.get("tools").is_none());
        assert!(body.get("reasoning_effort").is_none());
    }
}
