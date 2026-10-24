# Retomada do desenvolvimento

## Estado

Branch local `codex/odekrai-foundation`. A fundação React/Vite/Tauri permanece nos commits `5ccaef5` e `e7f718b`; esta etapa acrescenta ilha, modo livre e áudio. Não há confirmação de que a branch reflita `origin/main`: a consulta remota falhou. Não publicar até revisar a divergência.

## Concluído nesta etapa

- Janelas Companion separadas para ilha e marcador temporário no modo livre.
- Controles de visibilidade, posição, tamanho e prioridade no Hub.
- Arraste e persistência de posições; retorno do marcador à ilha.
- FSM e sinais de atividade reais do chat.
- Preferências, carregador de sons, testes e documentos atualizados.

## Próxima etapa

1. Instalar/configurar Rust MSVC e Visual Studio Build Tools pelo procedimento autorizado.
2. Executar build Tauri, `cargo test` e revisão no Windows 10/11.
3. Validar transparência, foco, hit-testing, arraste, DPI, restauração em monitores diferentes e consumo em repouso.
4. Implementar click-through seguro e comportamento em fullscreen após decidir e testar a estratégia nativa.
5. Baixar e inspecionar os ZIPs e licenças dos sons Kenney; escolher poucos efeitos e registrar os arquivos exatos.
6. Reconciliar a branch local com o remoto antes de integrar/publicar.

## Bloqueios conhecidos

`cargo` e `rustc` não estão disponíveis nesta máquina. O CLI `tauri` iniciou; `tauri build` falhou em `cargo metadata` porque não encontrou `cargo`. Não foi feita instalação do toolchain. Não desative o Microsoft Defender para contornar alertas de instaladores.
