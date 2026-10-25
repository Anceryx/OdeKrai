use super::{Block, ChatRequest};
use serde_json::{json, Value};

pub(super) fn chat_request_body(request: &ChatRequest) -> Value {
    let system = request
        .messages
        .iter()
        .filter(|message| message.role == "system")
        .flat_map(|message| message.blocks.iter())
        .filter_map(|block| match block {
            Block::Text { text } => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    let mut messages: Vec<Value> = Vec::new();
    for message in request
        .messages
        .iter()
        .filter(|message| message.role != "system")
    {
        let mut content = Vec::new();
        for block in &message.blocks {
            match block {
                Block::Text { text } if !text.is_empty() => {
                    content.push(json!({ "type": "text", "text": text }));
                }
                Block::ToolCall { id, name, args } => content.push(json!({
                    "type": "tool_use",
                    "id": id,
                    "name": name,
                    "input": args
                })),
                Block::ToolResult {
                    call_id,
                    content: result,
                    is_error,
                } => content.push(json!({
                    "type": "tool_result",
                    "tool_use_id": call_id,
                    "content": result,
                    "is_error": is_error
                })),
                Block::Text { .. } => {}
            }
        }
        content.sort_by_key(|block| if block["type"] == "tool_result" { 0 } else { 1 });
        if content.is_empty() {
            continue;
        }
        let role = if message.role == "tool" {
            "user"
        } else {
            &message.role
        };
        if let Some(previous) = messages.last_mut() {
            if previous["role"] == role {
                previous["content"].as_array_mut().unwrap().extend(content);
                continue;
            }
        }
        messages.push(json!({ "role": role, "content": content }));
    }

    let mut body = json!({
        "model": request.model,
        "max_tokens": 2048,
        "messages": messages,
        "stream": request.streaming
    });
    if !system.is_empty() {
        body["system"] = json!(system);
    }
    if !request.tools.is_empty() {
        body["tools"] = Value::Array(
            request
                .tools
                .iter()
                .map(|tool| {
                    json!({
                        "name": tool.name,
                        "description": tool.description,
                        "input_schema": tool.json_schema
                    })
                })
                .collect(),
        );
    }
    body
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn serializes_anthropic_tool_use_and_tool_result_in_message_blocks() {
        let request = ChatRequest {
            model: "mock-model".into(),
            messages: vec![
                super::super::Message {
                    role: "assistant".into(),
                    blocks: vec![Block::ToolCall {
                        id: "toolu-1".into(),
                        name: "lookup".into(),
                        args: json!({ "key": "value" }),
                    }],
                },
                super::super::Message {
                    role: "tool".into(),
                    blocks: vec![
                        Block::Text {
                            text: "Resultado da consulta:".into(),
                        },
                        Block::ToolResult {
                            call_id: "toolu-1".into(),
                            content: "found".into(),
                            is_error: false,
                        },
                    ],
                },
            ],
            tools: vec![super::super::ToolDef {
                name: "lookup".into(),
                description: "Look up an item".into(),
                json_schema: json!({ "type": "object" }),
            }],
            streaming: true,
        };

        let body = chat_request_body(&request);
        assert_eq!(body["tools"][0]["input_schema"]["type"], "object");
        assert_eq!(body["messages"][0]["content"][0]["type"], "tool_use");
        assert_eq!(body["messages"][1]["role"], "user");
        assert_eq!(body["messages"][1]["content"][0]["type"], "tool_result");
        assert_eq!(body["messages"][1]["content"][0]["tool_use_id"], "toolu-1");
        assert_eq!(body["messages"][1]["content"][1]["type"], "text");
    }
}
