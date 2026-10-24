# Conectores de IA

## Adaptadores no código

O catálogo tem 15 itens: 12 usam o formato Chat Completions; Anthropic usa Messages API; Perplexity usa Agent API; Vertex AI permanece sem autenticação ADC/OAuth e aparece como guia. A presença de um adaptador não comprova chave, modelo, conta ou serviço.

| Provedor                                                               | Adaptador                                 | Autenticação e limites conhecidos                                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| OpenAI                                                                 | Chat Completions                          | Bearer; ID de modelo manual                                                                               |
| Anthropic                                                              | Messages API                              | `x-api-key` e `anthropic-version`; modelo manual                                                          |
| Gemini                                                                 | Endpoint OpenAI compatível                | Chave do Google AI Studio; modelo manual                                                                  |
| xAI, Mistral, Cohere, Groq, DeepSeek, Together, OpenRouter e Fireworks | Chat Completions                          | Bearer; modelo manual                                                                                     |
| Perplexity                                                             | Agent API `/v1/agent`                     | Bearer; resposta `output[].content[].output_text`; modelo manual; busca web não é habilitada pelo ODEKRAI |
| Azure OpenAI                                                           | Endpoint v1 `/openai/v1/chat/completions` | Cabeçalho `api-key`; nome do deployment enviado como modelo                                               |
| AWS Bedrock                                                            | Chat Completions regional                 | Chave de API Bedrock; IAM/SigV4 não implementado                                                          |
| Vertex AI                                                              | Guia                                      | ADC/OAuth ainda não integrado                                                                             |

O processo Tauri valida HTTPS e restringe hosts por provedor, desativa redirecionamentos e não registra credenciais. A validação de conexão envia uma solicitação real e pode gerar cobrança. ID do provedor, modelo, endpoint e região são preferências locais. A lista de modelos é manual. O chat usa streaming para Anthropic e adaptadores Chat Completions; a Agent API da Perplexity ainda usa resposta completa. Não há failover nem medição de uso.

Credenciais ficam no Gerenciador de Credenciais do Windows pelo crate `keyring`. O frontend nunca lê a credencial já armazenada. Essa integração exige execução nativa Windows; preview web não envia chamadas com chaves.

## Fontes oficiais consultadas

- [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create)
- [Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)
- [Cohere Compatibility API](https://docs.cohere.com/docs/compatibility-api)
- [Perplexity Agent API](https://docs.perplexity.ai/docs/agent-api/quickstart)
- [Azure OpenAI v1](https://learn.microsoft.com/en-us/azure/foundry/openai/latest)
- [Amazon Bedrock Chat Completions](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html)
- [Vertex AI ADC](https://docs.cloud.google.com/docs/authentication/application-default-credentials)

Os logotipos incorporados usam o pacote `simple-icons`, CC0-1.0; os demais cards usam iniciais.
