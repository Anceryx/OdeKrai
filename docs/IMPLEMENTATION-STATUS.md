# Estado da implementação

Atualizado em 24/10/2026. Árvore local da branch `codex/odekrai-foundation`, baseada no HEAD `1243a27`; não houve commit ou publicação.

## O que foi implementado

- Catálogo de 15 provedores: 12 adaptadores Chat Completions, Anthropic Messages e Perplexity Agent API; Vertex AI aparece como guia até existir fluxo ADC/OAuth.
- Backend Tauri/Rust usa `keyring` para Gerenciador de Credenciais do Windows e `reqwest` para requisições nativas. Há allowlist de hosts HTTPS, bloqueio de redirects, limites de entrada, timeout, cancelamento e sanitização de erros.
- Backend disponibiliza comandos para salvar, consultar e remover credenciais; a tela permite salvar, remover e testar conexão com uma solicitação real. Credencial guardada não é mostrada como validada.
- README em português e inglês e guias de segurança, privacidade e conectores atualizados.

## Validações executadas nesta revisão

- `npm run build`: passou; 54 módulos transformados. Vite avisa que o chunk Three.js minificado (617,24 kB) excede 500 kB.
- `npm test -- --pool=threads --maxWorkers=1`: 15 testes passaram em 5 arquivos.
- `npx tsc -b`: passou como parte do build.
- `cargo fmt -- --check`: passou.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`: 2 testes passaram (hosts/endpoints e parser Anthropic/Perplexity).
- `cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc`: passou.
- `git diff --check`: passou; Git apenas avisou sobre normalização de CRLF em documentação.
- `npm run tauri:build`: **falhou ao substituir** `src-tauri/target/release/odekrai.exe` com erro Windows 5 (acesso negado), pois o executável anterior continua aberto. A versão atualizada e o instalador não foram gerados.
- `npm run tauri:dev`: compilou em 4m58s e iniciou `src-tauri/target/debug/odekrai.exe`; o processo foi listado como responsivo. A automação não capturou pixels ou interações.

## Evidência do ambiente anterior

Windows 10.0.19045 x64; Node 24.12.0; npm 11.6.2; Rust/Cargo 1.99.1; Tauri CLI 2.12.4; crates Tauri 2.12.5; Visual Studio Build Tools 2022 17.14.42; MSVC 14.44.35207; SDK 10.0.26100.0; WebView2 Runtime 153.0.4234.48. Cargo está em `%USERPROFILE%\.cargo\bin`. Versões precisam ser confirmadas no próximo build.

## Pendente de comprovação real

- Encerrar manualmente a instância antiga e gerar o executável atualizado/instalador; executar esse binário. O executável debug abriu nesta sessão, mas não houve inspeção visual.
- Testar salvar, consultar e remover uma credencial descartável no Credential Manager.
- Validar adaptadores com chaves reais do proprietário.
- Capturar e inspecionar visualmente Hub, catálogo, ilha e janela livre. DPI, múltiplos monitores, foco, click-through, always-on-top, fullscreen, arraste, persistência e retorno permanecem pendentes.
- Nenhum som Kenney foi integrado nesta revisão; arquivos de áudio/licenças individuais não foram verificados.
- Nenhuma publicação ocorreu; remoto não foi consultado.

### Resultado de build local e teste de abertura (24/10/2026)

- `npm run tauri:build` passou e gerou `src-tauri/target/release/odekrai.exe` (13.324.800 bytes) e `src-tauri/target/release/bundle/nsis/OdeKrai_0.1.0_x64-setup.exe` (3.692.149 bytes). Ambos sem assinatura Authenticode (`NotSigned`).
- O processo foi iniciado por `cargo run --release` e permaneceu responsivo. A abertura direta com `Start-Process` terminou com código 101. O stderr capturado identificou `0x800700AA` (recurso solicitado em uso) ao criar o WebView2; não foi possível identificar o processo que mantém o recurso ocupado.
- A sessão gráfica não está disponível para automação (`cua.getState()` retornou apps e browsers vazios). Não foi possível confirmar a janela visível, pixels ou interações. A validação visual segue pendente.
- Os binários e instalador estão no diretório ignorado `src-tauri/target/`; confirme `git ls-files '*.exe'` vazio antes de publicar.
