# Estado da implementação

Atualizado em 24/10/2026 para a Fase 1 na branch `main`. Resultados anteriores não comprovam o estado atual.

## Implementado

- Catálogo de 15 provedores; Vertex AI permanece como guia. O chat usa um provedor configurado por vez, identificado por `providerId` persistido nas preferências. Preferências antigas são migradas pelo nome conhecido.
- O backend Rust guarda chaves pelo `keyring`, restringe endpoints a HTTPS e hosts conhecidos e não segue redirecionamentos. A Anthropic usa `x-api-key` conforme a [API Messages](https://platform.claude.com/docs/en/api/messages/create).
- O chat salva conversas em SQLite local e pode retomá-las. Anthropic e adaptadores Chat Completions enviam trechos ao frontend por canal Tauri; Perplexity Agent API ainda retorna a resposta completa.
- A aplicação registra o plugin de instância única. A CSP de produção restringe conexões do WebView ao IPC, as capabilities da janela principal e das janelas auxiliares são separadas, e os comandos de janela verificam o chamador.

## Limites e validação pendente

- Um erro WebView2 `0x800700AA` ocorreu anteriormente ao abrir o executável. Nesta revisão, um `odekrai.exe` de release (PID 14572) continuava aberto com processos WebView2 filhos. A relação causal com instâncias simultâneas é hipótese; exige repetição com o binário atualizado em Windows com acesso à janela visível. O processo existente foi preservado.
- Histórico SQLite não é criptografado pelo aplicativo. Proteção em repouso depende do dispositivo.
- Ainda são necessários testes com contas e chaves reais dos provedores, Credential Manager do Windows, streaming com respostas reais, reinício do aplicativo e inspeção visual do Hub, ilha e mascote.
- DPI, múltiplos monitores, fullscreen, foco, click-through, WebGL, instalador e atualização não são comprovados pelos testes automatizados.
- Agent loop, tools, modos de permissão, memória do agente, pasta do agente, `ODEKRAI.md` gerado pelo aplicativo, roteador e sons integrados continuam fora do escopo implementado. O arquivo `ODEKRAI.md` local não rastreado não é parte da implementação.
