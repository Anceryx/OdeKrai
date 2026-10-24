# Registro de alterações

## Não lançado

### UI-1

- Ajustadas as dimensões iniciais e mínimas da janela principal; teste Rust protege a configuração.
- Janelas auxiliares de ilha, mascote e aprovação são criadas sob demanda e fechadas quando deixam de ser necessárias.
- Endpoints salvos em domínio de outro provedor são restaurados ao padrão e exibem aviso; o catálogo também permite restaurar endpoint e modelo.
- Removido o cartão de perfil duplicado no rodapé da barra lateral; o caminho superior abre o Perfil, identificado no breadcrumb.
- Conversas anteriores exibem título e data do SQLite e permanecem selecionáveis.

### Revisão de fechamento da Fase 3.1

- Bloqueadas operações simuladas sobre `ODEKRAI.md`, `logs/`, configurações, bancos locais e conteúdo reconhecido como segredo.
- Movida a confirmação `MessageBoxW` para o executor de operações bloqueantes do Tauri; comandos de modo e override agora aguardam assincronamente.
- Adicionados verificadores de release para assets privados e para o comando de disparo manual exclusivo de debug; `tauri:build` interrompe se detectar assets proprietários.
- Adicionada matriz de rastreabilidade das Fases 2.1 e 3, com pendências de teste e validação nativa.

### Fase 3

- Adicionados motor de políticas em Rust, modos persistidos em SQLite, exceções por ferramenta com confirmação nativa e tabela modo × risco.
- Adicionadas janela de aprovação de uso único, fila limitada e expiração configurável; parâmetros são vinculados por hash SHA-256 e só a janela `approval` pode responder.
- Adicionados log JSONL diário encadeado, viewer/exportação, verificação da cadeia, atalho global e kill switch com cancelamento de streams.
- Adicionadas ferramentas simuladas de workspace com backup reversível e lixeira; mensagens nunca são enviadas e pagamentos são bloqueados.
- A validação visual e nativa de janelas, atalho, DPI e foco em Windows permanece pendente.

### Fase 2

- Adicionadas pasta pessoal, identidade aprovada por hash, memória manual editável e prompt composto no Rust.
- Adicionada exclusão de conversas e de todo o histórico; corrigida a formatação global e atualizada a documentação de privacidade.

- Adicionadas janelas Tauri separadas para a ilha e o marcador geométrico temporário.
- Adicionados estados do Companion conectados ao ciclo real de solicitação do chat.
- Adicionados controles e persistência de posição, tamanho, prioridade, modo livre e efeitos sonoros.
- Adicionado motor de áudio com cache, volume, mute, substituição local e fallback silencioso. Nenhum arquivo de som foi incluído.
- A validação visual e nativa completa em Windows continua pendente.

### Fase 1

- Corrigido o cabeçalho de autenticação da Anthropic para `x-api-key` e adicionada verificação de cabeçalhos por provedor com servidor simulado.
- Persistido o ID do provedor com migração das preferências antigas.
- Adicionados plugin de instância única, CSP de produção restrita, capabilities por janela e validação do chamador para comandos de janela.
- Adicionados histórico local de conversas em SQLite e streaming com cancelamento para Anthropic e adaptadores Chat Completions.
- Revisada a documentação de status, testes, arquitetura, privacidade e segurança.
