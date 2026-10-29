# Lote 6 — E5: layout e usabilidade do chat

## Alterações

- Cabeçalho separado em título/modelo e controles do agente; pasta de trabalho, estado do agente e
  identificação de modelo permanecem agrupados e podem quebrar linha em larguras menores.
- Histórico preserva uma área de rolagem própria e flexível. O compositor permanece fora dela, na
  base do painel, com microfone, captura e envio alinhados; as explicações de Enter/Shift+Enter e de
  microfone desativado ficam junto aos controles.
- Erros longos quebram linha e ficam limitados a uma área rolável; detalhes técnicos aparecem em
  bloco expansível e podem ser lidos sem alargar o painel.
- A rolagem automática acompanha respostas apenas enquanto o usuário está perto do fim. A mudança
  de conversa volta a acompanhar o histórico selecionado; alterações de altura e redimensionamento
  mantêm a posição no fim sem puxar quem está lendo mensagens anteriores.
- Blocos de código e mensagens extensas mantêm quebra de palavras e rolagem horizontal local.

## Validação

- Testes de interface verificam estrutura do cabeçalho, histórico e compositor, mensagem de estado
  do microfone, apresentação de erro/detalhes técnicos e regra de acompanhamento da rolagem.
- `npm run build`, `npm test`, `npm run format:check`, `npm run check:encoding`, `cargo fmt --check`,
  `cargo test` e `git diff --check` foram executados para esta alteração; resultados são reportados
  junto com o commit E5.
- Screenshots comparativos e validação de janela pequena, escala de 125% e 150% ainda dependem de
  inspeção visual no executável Windows. Não há controle de desktop/screenshot disponível neste
  ambiente; build e testes automatizados não comprovam o layout visual do WebView.
