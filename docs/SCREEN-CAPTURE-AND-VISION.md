# Captura de tela e análise visual

Atualizado em 28/10/2026.

## Estado e fluxo

- Implementado somente para Windows: a captura cobre o retângulo virtual dos monitores conectados e é feita pelo Rust com GDI. Outras plataformas retornam indisponibilidade explícita.
- O comando de captura exige a janela principal e só roda após a pessoa escolher “Continuar e capturar”. A captura é decodificada, reduzida a no máximo 1280 px por lado e reencodada em JPEG sem metadados; a saída tem limite de 512 KiB.
- A prévia existe apenas em memória e mostra conteúdo, resolução, provedor/modelo e pasta de destino local. O aplicativo não grava o arquivo nem chama um provedor durante a captura. “Salvar localmente” grava em `app_data_dir/screenshots`; “Analisar e enviar” envia a imagem e instrução apenas depois da confirmação explícita. Cancelar/descartar limpa a prévia.
- Agente desligado/indisponível ou modelo fora da allowlist desabilita o envio, mas não a captura e o salvamento local. O Rust repete as validações, sanitiza e limita imagens antes de qualquer request. Saídas de modelo permanecem sujeitas às políticas normais do agente.
- A imagem não é incluída no histórico persistente, nos logs nem no contexto do modelo além da solicitação confirmada. O texto da instrução continua seguindo o comportamento normal do histórico de conversas. Uma falha de envio mantém a prévia para a pessoa decidir se tenta novamente ou descarta.
- Não há anexos de imagem escolhidos pelo usuário neste escopo.

## Compatibilidade verificada

- OpenAI: apenas o ID exato `gpt-6-astra` está habilitado. O guia oficial mostra imagens em `Chat Completions` como parte `image_url`, incluindo URL de dados Base64 e o campo opcional `detail`. O adaptador usa `detail: low`.
- Anthropic: apenas os IDs `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` e `claude-fable-5-1` estão habilitados. A documentação oficial atual confirma imagem Base64 como bloco `image` com `source.type`, `source.media_type` e `source.data`; o catálogo atual declara entrada de imagem nos quatro modelos.
- Outros provedores, proxies compatíveis, aliases, modelos locais e toda a família de modelos permanecem desabilitados para análise visual até validação explícita. O estado de capabilities genérico do catálogo não é usado para inferir suporte a visão.
- Contratos consultados em 28/10/2026: [OpenAI Images and Vision](https://developers.openai.com/api/docs/guides/images-vision), [Anthropic Vision](https://platform.claude.com/docs/en/build-with-claude/vision) e [Anthropic Models Overview](https://platform.claude.com/docs/en/models/overview).
- Captura Windows baseada em [GetSystemMetrics](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getsystemmetrics) para limites do desktop virtual e [GetDIBits](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-getdibits) para leitura dos pixels. A validação visual no executável Windows, incluindo DPI e múltiplos monitores, continua pendente.

## Verificação

Testes unitários cobrem normalização, formato e limite de bytes, compatibilidade exata dos modelos, serializers OpenAI/Anthropic e bloqueio de análise sem confirmação usando callback mockado. Os testes não fazem chamadas de rede nem usam contas reais. A captura física, Credential Manager e provedor real não são necessários nem validados por esses testes.
