# Estado da implementação

Atualizado em 24/10/2026. Este documento descreve o estado desta árvore de trabalho.

## Implementado

- Hub React + TypeScript + Vite e chat compatível com OpenAI Chat Completions.
- Janelas Tauri `island` e `mascot`, configuradas transparentes, sem moldura, não focalizáveis, inicialmente ocultas e acima das demais janelas.
- Controles no Hub para ativar a ilha, escolher canto inicial, ajustar tamanho, prioridade, abertura por hover e recolhimento.
- Arraste da ilha e do marcador livre com posição persistida.
- Modo livre em janela secundária para o marcador geométrico, com ação de retorno à ilha.
- FSM com prioridades, timeout e sinais reais do chat (pensando, conclusão e erro).
- Preferências de som, volume, substituição de arquivo local, cache, limitação de repetição e fallback silencioso.
- Testes de chat, estados, prioridade, normalização de som e persistência/migração de preferências.

## Validação executada

- `npm test`: 13 testes passaram em 4 arquivos.
- `npm run build`: TypeScript e Vite concluídos.
- `npm run format:check` e `git diff --check` passaram.
- `npm run tauri:build` iniciou o CLI, mas parou em `cargo metadata`: Cargo/Rust não estão instalados.

## Limitações e pendências

- A janela, transparência, foco, animação nativa, arraste, DPI e múltiplos monitores não foram exercitados em Windows.
- Click-through por regiões, ocultação por fullscreen/jogos e notificações ainda não foram implementados.
- O modo livre movimenta apenas o marcador temporário; integração do mascote aprovado permanece pendente.
- Nenhum arquivo de áudio foi integrado. Os pacotes Kenney foram avaliados pelas páginas CC0, mas seus ZIPs/licenças internas não foram baixados.
- Restauração após desconexão de monitor precisa de validação nativa.
- Reconciliar a branch local com `origin/main` permanece pendente; a conexão remota falhou. Não houve push nem publicação.
