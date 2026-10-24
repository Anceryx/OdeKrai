# Estado da implementação

Atualizado em 24/10/2026. Este documento registra apenas o que existe nesta árvore de trabalho.

## Implementado

- SPA React + TypeScript + Vite com navegação do Hub, interface em português e tema escuro próprio.
- Preferências de idioma e movimento reduzido persistidas localmente.
- Formulário de configuração e chat que envia solicitações reais para APIs compatíveis com OpenAI Chat Completions.
- Chave mantida em memória; o código de preferências exclui explicitamente segredos.
- Validação de URL HTTPS, com HTTP permitido apenas para loopback, e tratamento de erros/cancelamento.
- Estrutura inicial de documentação, política de assets e pastas de referência.
- Workflow GitHub Actions para testes, build e artefato NSIS está configurado, sem execução remota confirmada.

## Parcial

- Companion e ilha são apenas prévias visuais geométricas; o shell Tauri foi criado, mas não há movimentação, animação ou integração com o Windows.
- A configuração Tauri e o workflow de instalador não foram validados em Windows. O binding nativo do CLI Tauri falhou ao carregar neste ambiente.
- Chat não tem streaming, histórico persistente, adapters específicos, chaveiro de sistema, orçamento ou chamadas de ferramenta.
- Preferências usam armazenamento do WebView, sem SQLite nem migrações.

## Pendente

- Armazenamento de credenciais pelo Windows Credential Manager.
- Cargo test, lint e resultado real do CI/instalador.
- Importação/validação de manifestos e preview de assets reais.
- Integrações, voz, memória, ferramentas e automações.

## Validação desta etapa

Validado localmente: `npm run build` passou com TypeScript e Vite; `npm test` passou (5 testes); JSONs de configuração parseados; `git diff --check` sem apontamentos. A instalação inicial incompleta foi corrigida e `package-lock.json` foi gerado.

`npm ci` e `npm run format:check` também passaram na árvore final.

Pendente: `npm run tauri:build`, `cargo test`, execução em Windows empacotado, resultado real do workflow no GitHub e instalação manual. O ambiente não possui Rust/Cargo, o binding nativo do CLI Tauri não carrega e a conexão ao GitHub falhou. Há um commit local inicial na branch `codex/odekrai-foundation`; não há push nem PR.
