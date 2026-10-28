use super::ChatRequest;
use serde_json::{json, Value};

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
}
