# Estado da implementação

Atualizado em 24/10/2026 após a verificação de fechamento da Fase 3. Requisitos e limites estão detalhados em [`TRACEABILITY.md`](TRACEABILITY.md).

## Fase 4

**Pendente.** O modelo ainda não pode solicitar tools. O chat existente é textual e usa um único
provedor por vez. Não há `LlmProvider`, schemas de tools, roteador, fallback, orçamento de tokens,
loop de agente, ferramentas de workspace expostas ao modelo, persistência de tool calls, modo agente
na conversa, painel de uso ou eventos de execução. A matriz de evidências e os testes realmente
existentes estão em [`TRACEABILITY.md`](TRACEABILITY.md). Anthropic e OpenAI têm documentação
oficial de tool use/function calling consultada; isso não equivale a integração local. Todos os
demais provedores permanecem `unverified` para tools.

## Implementado

- UI-3: catálogo 2D Kenney CC0, seleção no Assistente persistida no SQLite, avatar e pet da Visão geral, estados CSS ligados à FSM e overlays Phosphor. Os doze PNGs renderizados medem 512×512; o renderer 3D foi removido do aplicativo. Three.js permanece somente como dependência de desenvolvimento do script de renderização.

- Catálogo de 16 provedores (15 com adaptador ativo e Vertex AI como guia). O chat usa um provedor principal por vez, identificado por `providerId` persistido nas preferências. Preferências antigas são migradas pelo nome conhecido.
- O backend Rust guarda chaves pelo `keyring`, restringe endpoints a HTTPS e hosts conhecidos e não segue redirecionamentos. A Anthropic usa `x-api-key` conforme a [API Messages](https://platform.claude.com/docs/en/api/messages/create).
- O chat salva conversas em SQLite local e pode retomá-las. Anthropic e adaptadores Chat Completions enviam trechos ao frontend por canal Tauri; Perplexity Agent API ainda retorna a resposta completa.
- A interface pode apagar uma conversa ou todo o histórico. A primeira execução oferece uma pasta pessoal local e gera `ODEKRAI.md` a partir de um template embutido. Identidade e memória manual são editáveis; alteração externa da identidade bloqueia seu uso até aprovação.
- O Rust compõe o prompt com regras fixas, identidade aprovada e resumo limitado de `memory/estilo.md`. Anthropic usa `system`, Chat Completions usa a mensagem `system` e Perplexity usa `instructions`. O chat sem pasta configurada continua disponível.
- A aplicação registra o plugin de instância única. A CSP de produção restringe conexões do WebView ao IPC, as capabilities da janela principal e das janelas auxiliares são separadas, e os comandos de janela verificam o chamador.
- Fase 2.1 implementada: catálogo verificado com campos por provedor, configuração isolada por ID e migração local, validação de host/caminho, listagem documentada de modelos, teste de conexão sem prompt de geração, perfil SQLite e processamento de avatar no Rust. Inter é carregada localmente sob OFL 1.1.
- Fase 3 implementada em Rust: matriz pura de políticas; modos, exceções, atalho e estado do kill switch em SQLite; janela `approval`; auditoria JSONL encadeada; ferramentas simuladas com gravação reversível e lixeira; parada e retomada cancelam/rejeitam trabalho.
- Revisão 3.1: caminhos de identidade, logs, banco, configuração e arquivos com marcadores de segredo são bloqueados para leitura/escrita/remoção; `MessageBoxW` roda em `spawn_blocking`; o comando de disparo manual é limitado a debug.

## Limites e validação pendente

- Um erro WebView2 `0x800700AA` ocorreu anteriormente ao abrir o executável. A causa não foi confirmada; qualquer conclusão exige repetição com o binário atualizado em Windows com acesso à janela visível.
- Histórico SQLite não é criptografado pelo aplicativo. Proteção em repouso depende do dispositivo.
- Ainda são necessários testes com contas e chaves reais dos provedores, Credential Manager do Windows, streaming com respostas reais, reinício do aplicativo e inspeção visual do Hub, ilha e mascote.
- Fase 2.1 também requer validação visual nativa do perfil/avatar, tipografia, contraste, fluxo de configuração por provedor e chamadas de listagem em contas de teste. A integração de Vertex AI continua sem verificação completa de ADC.
- DPI, múltiplos monitores, fullscreen, foco, click-through, bandeja, instalador e atualização não são comprovados pelos testes automatizados.
- Agent loop, ferramentas reais, roteador, aprendizado automático e sons integrados continuam pendentes. Os modos declarados em `ODEKRAI.md` são informativos; o modo efetivo vem do SQLite. A auditoria grava em `logs/` sem retenção automática.
- A UI-3 exige validação visual no Windows para seletor, animações, recorte do avatar, janela de ilha/mascote, arrasto, click-through e topmost. Não foi realizada nesta execução.
- A Fase 3 ainda requer confirmação visual da janela nativa, teste do atalho global e validação de foco, DPI e múltiplos monitores em Windows.

## Resultados históricos da verificação 3.1

- `npm test`: 21 testes passaram em 7 arquivos. Inclui testes dos verificadores de assets proprietários e do `cfg(debug_assertions)`.
- `cargo test --offline`: 40 testes passaram; `cargo check --offline`, `cargo fmt --check`, `npm run format:check` e `git diff --check` passaram.
- `npm run check:debug-command`: passou ao conferir as duas guardas no código Rust.
- `npm run tauri:build`: não foi executado nesta revisão.
- O caminho nativo de `MessageBoxW` compila e foi movido para `spawn_blocking`; falta conferir com a janela visível que a interface permanece responsiva enquanto o diálogo está aberto.

## Verificação da remoção do renderer 3D

- `npm run build`: 66 módulos transformados; bundle JavaScript principal de 340,39 kB, sem aviso de chunk acima de 500 kB.
- `dist/`: nenhuma imagem GLB e nenhuma referência `three.module`, `GLTFLoader` ou `WebGLRenderer`.
- `npm test`: 26 testes passaram em 7 arquivos; `cargo test --lib`: 50 testes passaram. `npm run format:check`, `cargo fmt --check` e `git diff --check` passaram.
- `npm run tauri:build` e validação visual nativa no Windows não foram executados nesta revisão.
