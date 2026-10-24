# Estado da implementação

Atualizado em 24/10/2026 durante a implementação da Fase 3. Resultados das validações finais ainda serão registrados nesta revisão.

## Implementado

- Catálogo de 15 provedores; Vertex AI permanece como guia. O chat usa um provedor configurado por vez, identificado por `providerId` persistido nas preferências. Preferências antigas são migradas pelo nome conhecido.
- O backend Rust guarda chaves pelo `keyring`, restringe endpoints a HTTPS e hosts conhecidos e não segue redirecionamentos. A Anthropic usa `x-api-key` conforme a [API Messages](https://platform.claude.com/docs/en/api/messages/create).
- O chat salva conversas em SQLite local e pode retomá-las. Anthropic e adaptadores Chat Completions enviam trechos ao frontend por canal Tauri; Perplexity Agent API ainda retorna a resposta completa.
- A interface pode apagar uma conversa ou todo o histórico. A primeira execução oferece uma pasta pessoal local e gera `ODEKRAI.md` a partir de um template embutido. Identidade e memória manual são editáveis; alteração externa da identidade bloqueia seu uso até aprovação.
- O Rust compõe o prompt com regras fixas, identidade aprovada e resumo limitado de `memory/estilo.md`. Anthropic usa `system`, Chat Completions usa a mensagem `system` e Perplexity usa `instructions`. O chat sem pasta configurada continua disponível.
- A aplicação registra o plugin de instância única. A CSP de produção restringe conexões do WebView ao IPC, as capabilities da janela principal e das janelas auxiliares são separadas, e os comandos de janela verificam o chamador.
- Fase 2.1 implementada: catálogo verificado com campos por provedor, configuração isolada por ID e migração local, validação de host/caminho, listagem documentada de modelos, teste de conexão sem prompt de geração, perfil SQLite e processamento de avatar no Rust. Manrope e DM Mono são carregadas localmente sob OFL 1.1.
- Fase 3 implementada em Rust: matriz pura de políticas; modos, exceções, atalho e estado do kill switch em SQLite; janela `approval`; auditoria JSONL encadeada; ferramentas simuladas com gravação reversível e lixeira; parada e retomada cancelam/rejeitam trabalho.

## Limites e validação pendente

- Um erro WebView2 `0x800700AA` ocorreu anteriormente ao abrir o executável. Nesta revisão, um `odekrai.exe` de release (PID 14572) continuava aberto com processos WebView2 filhos. A relação causal com instâncias simultâneas é hipótese; exige repetição com o binário atualizado em Windows com acesso à janela visível. O processo existente foi preservado.
- Histórico SQLite não é criptografado pelo aplicativo. Proteção em repouso depende do dispositivo.
- Ainda são necessários testes com contas e chaves reais dos provedores, Credential Manager do Windows, streaming com respostas reais, reinício do aplicativo e inspeção visual do Hub, ilha e mascote.
- Fase 2.1 também requer validação visual nativa do perfil/avatar, tipografia, contraste, fluxo de configuração por provedor e chamadas de listagem em contas de teste. A integração de Vertex AI continua sem verificação completa de ADC.
- DPI, múltiplos monitores, fullscreen, foco, click-through, WebGL, instalador e atualização não são comprovados pelos testes automatizados.
- Agent loop, ferramentas reais, roteador, aprendizado automático e sons integrados continuam pendentes. Os modos declarados em `ODEKRAI.md` são informativos; o modo efetivo vem do SQLite. A auditoria grava em `logs/` sem retenção automática.
- A Fase 3 ainda requer confirmação visual da janela nativa, teste do atalho global e validação de foco, DPI e múltiplos monitores em Windows.
