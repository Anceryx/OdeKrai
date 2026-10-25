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

## Personagens 2D

Os modelos e a textura do pacote **Mini Characters (1.0)** foram criados e distribuídos por Kenney
(www.kenney.nl), em 17-07-2024. Licença Creative Commons Zero (CC0):
https://creativecommons.org/publicdomain/zero/1.0/. Atribuição não é obrigatória.
Texto da licença: `assets/pets/kenney-mini-characters/CC0-LICENSE.txt`.
Origem do pacote: https://kenney.nl/assets/mini-characters. Os 12 PNGs são renderizações dos
modelos GLB originais, com textura externa, câmera e iluminação uniformes, pose de repouso/bind
(nenhum clipe reproduzido), fundo transparente e saída de 512×512 px. Não foram incluídos os
modelos nem a textura no repositório. O script de desenvolvimento é `scripts/render-pets.mjs`;
instruções de regeneração: `docs/ASSET-GUIDE.md`.
