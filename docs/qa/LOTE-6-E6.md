# LOTE 6 — E6: Menu de perfil da sidebar

## Causa encontrada

O popup era posicionado absolutamente em relação ao rodapé da sidebar. As regras CSS
reposicionavam o menu de forma diferente quando a sidebar estava recolhida, sem medir a
posição real do botão de perfil. Isso podia desalinhá-lo do card e sujeitá-lo aos limites
de layout de seus ancestrais.

## Correção

- Renderizar o único menu em um portal no `document.body`, fora de containers que possam
  recortá-lo ou estabelecer outro contexto de posicionamento.
- Calcular a posição a partir do `getBoundingClientRect()` do botão, com alinhamento
  superior para sidebar expandida e lateral para sidebar recolhida.
- Limitar largura, altura e coordenadas à viewport; permitir rolagem interna quando o
  menu não couber verticalmente.
- Recalcular em resize, scroll, mudanças de tamanho do botão/menu e eventos do
  `visualViewport`.
- Fechar ao clicar fora, pressionar Esc ou mudar de seção. Preservar foco inicial,
  retorno do foco ao botão e navegação por setas, Home e End.

## Validação

Testes unitários cobrem alinhamento expandido/recolhido, limites de viewport estreita,
as cinco ações de navegação e teclado. Validações executadas: `npm run build`, `npm test`
(48 arquivos, 239 testes), `npm run format:check`, `npm run check:encoding`,
`cargo fmt --check` e `cargo test` (277 unitários e 2 de integração). Uma execução Rust
concorrente falhou em `timeout_cancel_invalid_json_crash_and_restart`; o teste isolado e a
suíte completa repetida passaram.

**Pendente:** inspeção visual do executável Windows em diferentes tamanhos de janela e escalas
de 125% e 150%. Os testes automatizados não comprovam o posicionamento real do WebView.
