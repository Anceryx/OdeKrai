# Conectores de IA

## Capacidades para modo agente

O modo agente da Fase 4 não está implementado. Logo, nenhum provedor está atualmente habilitado
para tools pelo aplicativo. Anthropic Messages documenta tool use e streaming; OpenAI documenta
function calling e streaming em suas APIs oficiais. Isso confirma os contratos de referência, não
a compatibilidade de terceiros que usam endpoints Chat Completions semelhantes. Até existir
verificação específica e teste mock por adaptador/modelo, `tools` deve ser tratado como
`unverified` e falso. Visão, geração de imagens, custo e streaming também não são capacidades de
roteamento no estado atual.

Referências oficiais: [Anthropic tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview),
[Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming),
[OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling) e
[OpenAI streaming](https://developers.openai.com/api/docs/guides/streaming-responses).

## Adaptadores no código

O catálogo tem 16 itens: 13 usam o formato Chat Completions; Anthropic usa Messages API; Perplexity usa Agent API; Vertex AI permanece sem autenticação ADC/OAuth e aparece como guia. A presença de um adaptador não comprova chave, modelo, conta ou serviço.

| Provedor                                                                         | Adaptador                                 | Autenticação e limites conhecidos                                                                         |
| -------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| OpenAI                                                                           | Chat Completions                          | Bearer; ID de modelo manual                                                                               |
| Anthropic                                                                        | Messages API                              | `x-api-key` e `anthropic-version`; modelo manual                                                          |
| Gemini                                                                           | Endpoint OpenAI compatível                | Chave do Google AI Studio; modelo manual                                                                  |
| xAI, Mistral, Cohere, Groq, DeepSeek, Cerebras, Together, OpenRouter e Fireworks | Chat Completions                          | Bearer; modelo selecionado da lista oficial quando disponível                                             |
| Perplexity                                                                       | Agent API `/v1/agent`                     | Bearer; resposta `output[].content[].output_text`; modelo manual; busca web não é habilitada pelo ODEKRAI |
| Azure OpenAI                                                                     | Endpoint v1 `/openai/v1/chat/completions` | Cabeçalho `api-key`; nome do deployment enviado como modelo                                               |
| AWS Bedrock                                                                      | Chat Completions regional                 | Chave de API Bedrock; IAM/SigV4 não implementado                                                          |
| Vertex AI                                                                        | Guia                                      | ADC/OAuth ainda não integrado                                                                             |

O processo Tauri valida HTTPS, host e caminho por provedor antes de enviar a chave, desativa redirecionamentos e não registra credenciais. Endpoint, modelo e região ficam separados por `providerId`; a migração v1 preserva a configuração existente. A listagem de modelos é habilitada apenas para endpoints cuja documentação foi verificada. Provedores sem endpoint de listagem são identificados no catálogo; seu teste de conexão fica parcial e não envia geração. O chat usa streaming para Anthropic e adaptadores Chat Completions; a Agent API da Perplexity ainda usa resposta completa. Não há failover nem medição de uso.

Na tela de conectores, as abas filtram credenciais salvas, provedores com plano gratuito confirmado e o catálogo completo. Groq, Google Gemini, Mistral, Cerebras e OpenRouter mostram o selo de plano gratuito com links para as páginas oficiais de limites ou preços; no OpenRouter, o selo se refere aos modelos marcados com `:free`. As condições e os modelos podem variar por conta e mudar conforme o provedor. A interface não exibe limites numéricos fixos. Ao abrir os detalhes de um plano gratuito, o app avisa que alguns provedores podem usar os dados enviados nesses planos.

O catálogo versionado em `src-tauri/resources/provider-catalog.json` registra endpoint, caminho, cabeçalho de autenticação, forma de listar modelos, campos específicos, URL de documentação e data de conferência. Entradas sem confirmação documental permanecem `unverified` e não recebem botão de listagem. Modelos são selecionados da conta quando possível ou podem ser digitados manualmente; não há modelo padrão preenchido.

Credenciais ficam no Gerenciador de Credenciais do Windows pelo crate `keyring`. O frontend nunca lê a credencial já armazenada. Essa integração exige execução nativa Windows; preview web não envia chamadas com chaves.

Nos detalhes de cada conector, “Criar conta” abre a página de cadastro ou entrada do provedor e “Gerar chave” abre o console de credenciais apropriado. O app usa o plugin oficial Tauri Opener e limita os domínios externos aos endereços dos provedores catalogados. Os consoles podem exigir autenticação ou encaminhar para uma etapa adicional dentro do painel.

O filtro “Conectados” consulta as credenciais em sequência para evitar consultas concorrentes ao Gerenciador do Windows. Se alguma consulta falhar, a tela informa que o resultado pode estar incompleto em vez de afirmar que não há credenciais.

## Fontes oficiais consultadas

- [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create)
- [Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)
- [Cohere Compatibility API](https://docs.cohere.com/docs/compatibility-api)
- [Perplexity Agent API](https://docs.perplexity.ai/api-reference/agent-post)
- [Cerebras Chat Completions](https://inference-docs.cerebras.ai/api-reference/chat-completions) e [lista de modelos](https://inference-docs.cerebras.ai/api-reference/models/list-models)
- [Limites do Groq](https://console.groq.com/docs/rate-limits), [Gemini](https://ai.google.dev/gemini-api/docs/rate-limits), [Mistral](https://docs.mistral.ai/admin/billing-usage/usage-limits), [preços do Cerebras](https://inference-docs.cerebras.ai/support/pricing) e [preços/modelos gratuitos do OpenRouter](https://openrouter.ai/pricing)
- [Azure OpenAI v1](https://learn.microsoft.com/en-us/azure/foundry/openai/latest)
- [Amazon Bedrock Chat Completions](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html)
- [Vertex AI ADC](https://docs.cloud.google.com/docs/authentication/application-default-credentials)

Todos os 16 provedores do catálogo exibem um SVG de marca local. Os arquivos foram incorporados de `@lobehub/icons-static-svg` 1.98.0, sob MIT; os provedores sem variações de cor usam seus símbolos monocromáticos.

Os links de cadastro, chaves, limites e documentação abrem no navegador padrão por meio do plugin oficial `opener` do Tauri. A janela principal só pode abrir endereços HTTPS; se o sistema não conseguir iniciar o navegador, o painel mostra o endereço para cópia manual. Essa integração precisa de validação visual e nativa no Windows.
