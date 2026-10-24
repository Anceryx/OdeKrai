# Avisos de terceiros

## Código

Nenhum código-fonte do Coucou foi copiado para o repositório. Foram estudados os módulos Windows de FSM (`windows/src/island/fsm.ts`), ilha (`island.ts` e `island.rs`), desktop (`desktop.ts` e `desktop.rs`), animação, layout e áudio (`sound.ts`). A consulta ao arquivo `sounds.rs` não foi concluída por falha de recuperação da fonte. A FSM e o carregador de áudio do Odekrai foram escritos para os contratos próprios do projeto. Referência: [Louis-CFM/coucou](https://github.com/Louis-CFM/coucou), sob licença MIT. Como nenhum arquivo de origem foi incorporado, não há trecho MIT a redistribuir nesta alteração.

## Áudio e artes

Nenhum som Kenney foi baixado ou incorporado. As páginas de [Interface Sounds](https://kenney.nl/assets/interface-sounds), [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) e [UI Audio](https://kenney.nl/assets/ui-audio) identificam os pacotes como CC0; a inspeção dos arquivos de licença internos permanece pendente antes da incorporação. Não foram usados arquivos de som ou arte do Coucou/Mochi.

## Dependências

As dependências declaradas em `package.json` mantêm suas próprias licenças e avisos. Antes de distribuir binários, gerar e revisar um inventário das dependências efetivamente empacotadas e incluir os avisos exigidos por cada licença.

### Fontes

- Manrope, pacote `@fontsource-variable/manrope` 5.3.0. Autores: The Manrope Project Authors. Licença SIL Open Font License 1.1; arquivo `node_modules/@fontsource-variable/manrope/LICENSE`. Pacote local: https://www.npmjs.com/package/@fontsource-variable/manrope.
- DM Mono, pacote `@fontsource/dm-mono` 5.3.0. Autores: The DM Mono Project Authors. Licença SIL Open Font License 1.1; arquivo `node_modules/@fontsource/dm-mono/LICENSE`. Pacote local: https://www.npmjs.com/package/@fontsource/dm-mono.

Os arquivos das fontes são empacotados localmente pelo Vite; não há carregamento por CDN.
