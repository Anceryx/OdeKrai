# Registro de alterações

## Não lançado

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
