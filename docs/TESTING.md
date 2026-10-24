# Testes

## Comandos planejados

- TypeScript e build da interface: `npm run build`.
- Testes unitários: Vitest (ainda não configurado).
- Rust: `cargo test` (ainda não há toolchain Rust disponível nesta etapa).
- Testes de fluxo desktop: Playwright ou automação Tauri após a shell nativa existir.

## Verificações manuais necessárias

Testar chave ausente, URL inválida, falha de rede, erro HTTP do provedor, resposta vazia, cancelamento, configuração persistida e remoção da chave ao fechar. Testar também escala/DPI, navegação por teclado, movimento reduzido e funcionamento em Windows 10/11.

Não interprete a compilação web como prova de funcionamento de janelas, tray, credenciais ou instalador Windows.
