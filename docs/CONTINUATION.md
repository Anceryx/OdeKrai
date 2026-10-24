# Retomada do desenvolvimento

## Estado

Fase atual: fundação do Hub. A árvore local estava vazia e `main` não possuía commits. A tentativa de leitura do remoto `origin` falhou por indisponibilidade de rede; não foi possível confirmar se este workspace corresponde ao estado atual do GitHub.

## Concluído nesta etapa

- SPA de Hub com visão geral, chat, formulário de provedor, Companion demonstrativo e preferências.
- Envio real de chat no formato OpenAI Chat Completions; chave somente em memória.
- Shell Tauri 2 inicial, lockfile npm, workflow de build Windows, documentação e separação entre licença do código e artes reservadas.

## Ainda não validado

Validado: `npm ci`, `npm run build`, 5 testes `npm test`, `npm run format:check`, parse dos JSONs e `git diff --check`. O CLI/build Tauri não executou porque o binding nativo do CLI não carrega neste Windows; não há Rust/Cargo instalado. O workflow está configurado, mas não foi executado no GitHub.

## Próximo passo

1. Reconectar ao GitHub e confirmar a branch `main` atual antes de integrar/publicar esta base.
2. Executar o workflow Windows e corrigir erros de compilação Tauri/NSIS com evidência do runner.
3. Integrar credenciais via Windows Credential Manager antes de permitir persistência de chaves.
4. Adicionar testes para persistência de settings e tratamento do provedor.
5. Implementar manifesto de assets e validar previews sem depender de artes finais.

## Git

Commit local inicial: `feat: inicializa fundação do Odekrai`. A branch foi criada como raiz porque a cópia local não tinha commits e o remoto não pôde ser consultado. Não publicar até reconciliar com `origin/main`.
