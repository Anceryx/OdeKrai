# Guia de assets do Odekrai

As artes definitivas serão fornecidas pelo proprietário. Não use o personagem, som, ícone ou ilustração do Coucou.

## Entrega recomendada

- PNG RGBA transparente para poses estáticas e sequências, em sRGB.
- WebP para imagens raster compactas quando a transparência/qualidade for adequada.
- SVG apenas para ícones vetoriais simples, sem scripts, fontes externas, filtros perigosos, referências externas ou entidades; será validado e sanitizado antes de renderizar.
- Spritesheet PNG/WebP com frames de dimensões iguais; forneça largura, altura, número de colunas/linhas e taxa de quadros no manifesto.
- GIF/APNG somente se o pipeline preservar transparência e oferecer controle confiável de duração; prefira sequências de frames para o personagem.

## Dimensões iniciais sugeridas

Produza cada pose em 512×512 px como referência principal, com personagem centralizado, transparência real e margem de 8–12%. Para a ilha, entregue uma versão 2× da escala visual pretendida. Não estique assets; use `contain` e dimensões físicas consistentes em diferentes DPI. Essas medidas são orientações iniciais e poderão ser ajustadas após teste visual no Companion.

## Nomes e manifesto

Os nomes são livres. Agrupe por estado em `assets/odekrai/character/<estado>/` e registre caminhos relativos, dimensões, escala, ponto de ancoragem, duração, repetição, fallback e licença em manifesto versionado. Não aceite caminhos absolutos, `..`, URLs remotas ou symlinks que escapem da pasta de assets. A validação ainda será implementada.

## Estados a produzir

Idle, walking, running, jumping, sleeping, happy, sad, angry, surprised, thinking, talking, listening, loading, celebrating, dragging, interações, transições, sazonal, roupas e expressões. Entregue pose neutra estática como fallback por estado. O motor não deve depender de nomes de arquivo específicos.

Pastas reservadas incluem `character/`, `island/`, `icons/`, `backgrounds/`, `sounds/`, `animations/` e `previews/`. Cada subpasta contém um README com sua finalidade. Não envie materiais oficiais até que sua distribuição no repositório esteja autorizada.
