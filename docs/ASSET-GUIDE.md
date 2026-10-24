# Guia de assets do Odekrai

As artes definitivas serão fornecidas pelo proprietário. A ilha atual usa CSS e um glifo geométrico temporário; não usa imagens de personagem de terceiros.

## Personagem futuro

- PNG RGBA transparente em sRGB para poses estáticas e sequências; WebP quando transparência e qualidade forem adequadas.
- GLB poderá ser integrado quando o mascote e a necessidade de renderização 3D forem aprovados. Não adicionar dependência 3D antes dessa etapa.
- Sprite sheets devem informar dimensões, grade, taxa de quadros, âncora e licença no manifesto.
- Não copiar arte, animação, ícones ou sons do Coucou/Mochi.

## Áudio

Os efeitos configuráveis ficam em `public/sounds/`; use arquivos curtos e licenciados. `docs/AUDIO-ASSETS.md` lista eventos, formatos e processo de substituição. Nenhum som foi integrado ainda.

## Pastas reservadas

`character/`, `island/`, `icons/`, `backgrounds/`, `sounds/`, `animations/` e `previews/`. Inclua origem e licença para cada material externo e não aceite caminhos absolutos, travessia `..` ou URL remota em manifestos.
