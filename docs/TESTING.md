# Testes

## Validação disponível

- `npm test`: chat, máquina de estados, prioridade de interrupção, volume/mute, caminho de substituição e persistência/migração de preferências.
- `npm run build`: TypeScript e bundle Vite.
- `npm run format:check`: formatação Prettier.
- `git diff --check`: espaços e marcadores de conflito.

Nesta etapa, 13 testes passaram em 4 arquivos; `npm run build`, `npm run format:check` e `git diff --check` passaram. A primeira tentativa do Vitest foi bloqueada pelo sandbox (`spawn EPERM` no esbuild); a execução autorizada posterior passou.

## Teste nativo pendente

O ambiente não tem Rust/Cargo. `npm run tauri:build` iniciou o CLI, mas parou em `cargo metadata` com `program not found`; não há evidência de build nativo ou validação da janela no Windows.

Depois de instalar Rust MSVC e Visual Studio Build Tools com o workload Desktop development with C++, executar `npm run tauri:dev` e `npm run tauri:build`. Em Windows 10/11, testar ativar/desativar, expandir/recolher, arrastar a ilha e o marcador, retornar à ilha, reiniciar e confirmar posições, escalas 100/125/150%, monitores distintos, foco, fullscreen/jogos, desconexão de monitor e ausência de janelas órfãs. Registrar sistema, escala e resultado por cenário.

Arquivos de som ainda não estão presentes. Testar arquivo ausente/corrompido, caminho recusado fora de `/sounds/`, volume mínimo/máximo, mute e substituição válida após integrar assets.

Build web e testes unitários não comprovam transparência, click-through, DPI, múltiplos monitores, foco ou empacotamento Windows.
