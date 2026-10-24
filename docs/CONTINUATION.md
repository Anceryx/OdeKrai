# Continuação

## ODEKRAI 2.0 — 24/10/2026

Estado local: branch `codex/odekrai-foundation`, baseada no HEAD `1243a27`. Preservar todos os diffs locais. Esta revisão adicionou backend Tauri/Rust para credenciais e chamadas de provedores, catálogo com 14 adaptadores e Vertex como guia, README em português/inglês e documentação atualizada.

### Evidências

- Build web passou; 15 testes Vitest passaram em 5 arquivos; TypeScript passou.
- `cargo test --lib`: 2 testes passaram; `cargo check` para `x86_64-pc-windows-msvc` passou.
- `npm run tauri:build` recompilou frontend e crates, mas falhou na etapa final ao substituir `src-tauri/target/release/odekrai.exe`: erro 5, porque a instância anterior está aberta.
- `tauri:dev` compilou em 4m58s e iniciou `src-tauri/target/debug/odekrai.exe`, processo responsivo no Windows; a automação não permitiu verificar pixels ou interações. O executável de release atualizado não foi produzido.
- Credential Manager real e provedores com credenciais do proprietário ainda não foram validados.

### Próxima sequência

1. Fechar o ODEKRAI antigo pela interface do Windows e repetir `npm run tauri:build` com `%USERPROFILE%\.cargo\bin` no PATH.
2. Abrir o novo executável; validar credencial descartável salvar/consultar/remover no Credential Manager. Não registrar chave em logs.
3. Fazer testes com credenciais de provedor autorizadas e observar respostas, erros e possíveis cobranças.
4. Inspecionar/capturar Hub, catálogo, ilha e modo livre. Validar arraste, click-through, foco, always-on-top, persistência, retorno, DPI, monitores e fullscreen.
5. Revisar licenças internas dos sons Kenney antes de qualquer integração; nenhum som foi adicionado nesta etapa.

Nenhum commit, push, release ou publicação foi feito. Verificar o remoto antes de qualquer publicação futura.

- O build release agora passou após remover os artefatos antigos: executável `src-tauri/target/release/odekrai.exe` (13.324.800 bytes) e instalador NSIS `src-tauri/target/release/bundle/nsis/OdeKrai_0.1.0_x64-setup.exe` (3.693.545 bytes), ambos `NotSigned`.
- `cargo run --release` manteve o processo responsivo. A tentativa com `Start-Process` encerrou com código 101, sem causa confirmada. A sessão gráfica inacessível impede confirmar a janela; abrir visualmente e testar as interações segue pendente.
