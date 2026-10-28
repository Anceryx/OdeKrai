# Estado da implementação

Atualizado em 24/10/2026 após a verificação de fechamento da Fase 3. Requisitos e limites estão detalhados em [`TRACEABILITY.md`](TRACEABILITY.md).

## Agenda local

- A navegação principal abre a tela “Agenda”, com grade mensal, lista dos eventos do mês, edição e exclusão com confirmação. O formulário aceita início/fim, local, descrição, alerta e recorrência diária, semanal ou mensal.
- O armazenamento base usa `calendar_events` em `calendar.sqlite3`. As habilidades Rust `calendar.create_event`, `calendar.list_events`, `calendar.update_event` e `calendar.delete_event` percorrem o dispatcher; a exclusão exige aprovação em qualquer modo. Criação repetida com os mesmos título, início, fim e recorrência usa ID estável e atualiza em vez de duplicar.
- Importação/exportação `.ics` é local. Importações aceitam eventos VEVENT delimitados, limitadas a 1 MB e 1.000 eventos, e gravam em transação; exportação cria um arquivo novo e não sobrescreve. TZID nomeado e eventos de dia inteiro não são suportados; horários flutuantes são interpretados no fuso do sistema.
- “Calendário padrão” controla o destino de eventos criados pelo agente: SQLite local ou um arquivo `.ics` escolhido pelo usuário e aberto no calendário do sistema. Abrir um arquivo não comprova que outro aplicativo importou o evento. As operações CRUD da tela continuam na Agenda local.
- Não há integração Google Calendar nem agendador A6 conectado; alertas são registrados como pendentes. A data/hora local atual e o fuso entram no prompt de cada execução do agente. A interpretação de linguagem natural de “amanhã” depende do modelo e não substitui a confirmação da duração ausente.
- Testes automatizados cobrem gravação repetida com SQLite temporário, recusa de evento sem fim, importação/parsing iCalendar, relógio injetado e a exigência de aprovação para exclusão. A validação visual e do calendário padrão do Windows permanece pendente.

## Fase 4

**Implementado com limites.** `agent_runtime::agent_run` prepara a execução e `agent::run_agent` coordena chamadas de modelo e ferramentas, respeitando limites, cancelamento e respostas de aprovação. `security::skills::model_tools` oferece somente habilidades ativadas; o dispatcher aplica schemas, política e executor Rust. Os adaptadores e modelos não têm suporte uniforme a tools, e não há roteador geral entre provedores. Os testes em `agent.rs`, `agent_runtime.rs` e `security/` cobrem a continuidade e os bloqueios. A matriz de evidências está em [`TRACEABILITY.md`](TRACEABILITY.md).

## Implementado

- `code.delegate`: permite executar Codex CLI ou Claude Code já instalado pelo usuário em um `git worktree` descartável, sob aprovação obrigatória. O caminho do executável fica nas configurações locais; o projeto precisa estar em pasta permitida com leitura e escrita. Saída e diff são dados não confiáveis, o diff aparece no cartão e nunca é aplicado ao projeto original por esta habilidade. Limite de tempo, cancelamento, limite de saída e Job Object encerram o processo. O uso real das duas CLIs e a validação visual nativa continuam pendentes.

- Base de habilidades em Rust: schemas fechados, risco calculado no backend, prévias, confiança do resultado e limites por ferramenta. As habilidades começam desativadas; o agente recebe somente as que foram ativadas na tela “Habilidades”. “Pastas permitidas” salva níveis de acesso em SQLite e valida caminhos locais contra redirecionamentos e áreas protegidas.
- O prompt de sistema inclui em Rust a data, a hora, o fuso local do Windows e o idioma atual desta versão (`pt-BR`), além de instruções para não alegar ações sem resultado confirmado e não contornar uma negação.

- UI-3: catálogo 2D Kenney CC0, seleção no Assistente persistida no SQLite, avatar e pet da Visão geral, estados CSS ligados à FSM e overlays Phosphor. Os doze PNGs renderizados medem 512×512; o renderer 3D foi removido do aplicativo. Three.js permanece somente como dependência de desenvolvimento do script de renderização.

- Catálogo de 17 provedores (16 com adaptador ativo e Vertex AI como guia). O chat usa um provedor principal por vez, identificado por `providerId` persistido nas preferências. Preferências antigas são migradas pelo nome conhecido.
- No catálogo, “Conectados” exige credencial salva e último teste aprovado para provedores remotos; IA local depende de resposta válida de um serviço local detectado, não de texto preenchido. A tela separa credencial salva, resultado do teste, habilitação, principal, serviço local e indicação de plano gratuito verificada. A indicação de “Conectados” é o último estado verificado, não monitoramento contínuo.
- A aba “Gratuitos” inclui somente os planos marcados como verificados com base em documentação oficial conferida em 2026-10-28. Cerebras não aparece nessa aba: o material atual descreve crédito promocional temporário, não um plano gratuito contínuo. Limites, modelos e elegibilidade ainda dependem das condições de cada conta.
- O painel de detalhes dos conectores fica no fluxo da página, sem sobrepor a lista. Os cartões permitem quebra de rótulos e os controles administrativos ficam restritos a conectores verificados ou a seus detalhes.
- O backend Rust guarda chaves pelo `keyring`, restringe endpoints de provedores remotos a HTTPS e hosts conhecidos e não segue redirecionamentos. A exceção HTTP do conector local aceita somente loopback, com resolução verificada e fixada na conexão. A Anthropic usa `x-api-key` conforme a [API Messages](https://platform.claude.com/docs/en/api/messages/create).
- O conector IA local aceita servidores Ollama e llama.cpp já iniciados, lista modelos nas portas padrão e usa Chat Completions com streaming. Chave opcional, tools desativadas e não verificadas. A tela “Seu computador” permite escolher uma pasta e baixar GGUF após confirmação, com retomada, allowlist HTTPS do manifesto, verificação SHA-256 e cabeçalho GGUF; para inferência, o usuário precisa instalar, iniciar e carregar o modelo num motor separado e conectar em Provedores > IA local. O aplicativo não instala nem inicia Ollama ou llama.cpp.
- A tela “Seu computador” consulta RAM, espaço para modelos, núcleos, AVX e adaptadores/VRAM via DXGI; falhas parciais de RAM, disco ou DXGI são mostradas como avisos e não bloqueiam a escolha manual. Recomendações são heurísticas testadas com perfis simulados. O catálogo contém metadados de cinco GGUF do Hugging Face, atualizados por `node scripts/refresh-local-models.mjs`; licença dos modelos de origem declarada nos catálogos oficiais, mas licença dos repositórios GGUF, requisitos mínimos e contexto seguem não verificados. Escolher um modelo não inicia sua execução; o download requer confirmação explícita. O inventário consulta arquivos do catálogo pelo nome, tamanho, SHA-256 e cabeçalho GGUF; downloads parciais são reconhecidos pelo arquivo `.part`, e `BAIXANDO` só representa uma tarefa ativa neste processo. A pasta permanece no armazenamento local do frontend. Arquivos externos ao catálogo não são importados. O progresso e execução do modelo não são persistidos, e o aplicativo não inclui executor GGUF.
- O chat salva conversas em SQLite local e pode retomá-las. Anthropic e adaptadores Chat Completions enviam trechos ao frontend por canal Tauri; Perplexity Agent API ainda retorna a resposta completa.
- A interface pode apagar uma conversa ou todo o histórico. A primeira execução oferece uma pasta pessoal local e gera `ODEKRAI.md` a partir de um template embutido. Identidade e memória manual são editáveis; alteração externa da identidade bloqueia seu uso até aprovação.
- O Rust compõe o prompt com regras fixas, identidade aprovada e resumo limitado de `memory/estilo.md`. Anthropic usa `system`, Chat Completions usa a mensagem `system` e Perplexity usa `instructions`. O chat sem pasta configurada continua disponível.
- A aplicação registra o plugin de instância única. A CSP de produção restringe conexões do WebView ao IPC, as capabilities da janela principal e das janelas auxiliares são separadas, e os comandos de janela verificam o chamador.
- Fase 2.1 implementada: catálogo verificado com campos por provedor, configuração isolada por ID e migração local, validação de host/caminho, listagem documentada de modelos, teste de conexão sem prompt de geração, perfil SQLite e processamento de avatar no Rust. Inter é carregada localmente sob OFL 1.1.
- Fase 3 implementada em Rust: matriz pura de políticas; modos, exceções, atalho e estado do kill switch em SQLite; janela `approval`; auditoria JSONL encadeada; habilidades de arquivos com gravação reversível e lixeira, além de exportação de `.ics`, Markdown, texto e CSV; parada e retomada cancelam/rejeitam trabalho.
- `mail.draft` prepara um rascunho no aplicativo de e-mail padrão somente após aprovação explícita; não envia mensagens. Corpos acima do limite do link são salvos como `.txt` na pasta de trabalho.
- `discord.send` envia mensagens por webhooks cadastrados em Habilidades, com URL guardada no Credential Manager, menções bloqueadas, limite por webhook e aprovação explícita.
- `web.fetch` oferece leitura limitada de páginas HTTPS com aprovação inicial por domínio, validação SSRF em cada salto e resultado marcado como dado não confiável.
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
