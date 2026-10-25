# Avisos de terceiros

## Código

Nenhum código-fonte do Coucou foi copiado para o repositório. Foram estudados os módulos Windows de FSM (`windows/src/island/fsm.ts`), ilha (`island.ts` e `island.rs`), desktop (`desktop.ts` e `desktop.rs`), animação, layout e áudio (`sound.ts`). A consulta ao arquivo `sounds.rs` não foi concluída por falha de recuperação da fonte. A FSM e o carregador de áudio do Odekrai foram escritos para os contratos próprios do projeto. Referência: [Louis-CFM/coucou](https://github.com/Louis-CFM/coucou), sob licença MIT. Como nenhum arquivo de origem foi incorporado, não há trecho MIT a redistribuir nesta alteração.

## Áudio e artes

Nenhum som Kenney foi baixado ou incorporado. As páginas de [Interface Sounds](https://kenney.nl/assets/interface-sounds), [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) e [UI Audio](https://kenney.nl/assets/ui-audio) identificam os pacotes como CC0; a inspeção dos arquivos de licença internos permanece pendente antes da incorporação. Não foram usados arquivos de som ou arte do Coucou/Mochi.

## Dependências

As dependências declaradas em `package.json` mantêm suas próprias licenças e avisos. Antes de distribuir binários, gerar e revisar um inventário das dependências efetivamente empacotadas e incluir os avisos exigidos por cada licença.

### Fonte Inter

- Inter Variable, pacote `@fontsource-variable/inter` 5.3.0. Autoria: The Inter Project Authors, liderado por Rasmus Andersson. Licença SIL Open Font License 1.1 (OFL); o texto integral acompanha o pacote em `node_modules/@fontsource-variable/inter/LICENSE`. Projeto: https://github.com/rsms/inter. Pacote: https://fontsource.org/fonts/inter.
- Os arquivos da fonte são empacotados localmente pelo Vite; não há carregamento por CDN. A fonte monoespaçada usada em trechos de código usa fontes do sistema e não adiciona arquivos de terceiros.

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

## Logotipos de provedores de IA

- 16 arquivos SVG de marca foram incorporados do pacote `@lobehub/icons-static-svg` 1.98.0, por LobeHub, sob licença MIT. Origem: https://github.com/lobehub/lobe-icons. Os arquivos foram copiados localmente para `src/assets/providers/`; os nomes dos provedores são marcas de seus respectivos titulares.
- MIT License (Copyright (c) 2023 LobeHub):

```text
MIT License

Copyright (c) 2023 LobeHub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
