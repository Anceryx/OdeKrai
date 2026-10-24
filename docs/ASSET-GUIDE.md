# Guia de assets do Odekrai

O proprietário forneceu o modelo oficial `odekrai-head.glb` e seis referências visuais no pacote local `ODEKRAI_Referencias_Codex.zip`. O modelo e as referências foram extraídos para `assets/odekrai/character/` e `assets/odekrai/previews/official-references/`, respectivamente. `.gitignore` mantém esses arquivos fora do Git.

O ícone do aplicativo em `src-tauri/icons/icon.ico` é um recurso provisório gerado a partir do glifo circular “O” usado na interface. A versão PNG de origem fica ao lado. Ele não contém a arte oficial do mascote e deve ser substituído quando o proprietário fornecer o ícone final.

## Mascote oficial

- O renderer usa o GLB com Three.js e `GLTFLoader`; as 16 expressões são desenhadas em Canvas 2D e aplicadas por `CanvasTexture` à malha facial.
- O asset fornecido é proprietário. A presença no checkout não concede licença MIT nem autorização para distribuição. Builds locais com o modelo incorporam o GLB ao diretório `dist`; não publicar esses builds nem commitar o arquivo sem autorização expressa.
- Um checkout sem o GLB mantém o marcador de fallback, permitindo builds públicos do código sem incluir os arquivos oficiais.
- As imagens de referência são exclusivamente para revisão visual; não são sprites e não entram no bundle do aplicativo.
- Preservar os nomes internos `ADA_` do modelo. O código cria o alias `odekraiRoot` e valida `ADA_Face_Display` e `ADA_Eyes_Emissive_ReplaceTexture`.
- Não copiar arte, animação, ícones ou sons do Coucou/Mochi.

## Áudio

Os efeitos configuráveis ficam em `public/sounds/`; use arquivos curtos e licenciados. `docs/AUDIO-ASSETS.md` lista eventos, formatos e processo de substituição. Nenhum som foi integrado ainda.

## Pastas reservadas

`character/`, `island/`, `icons/`, `backgrounds/`, `sounds/`, `animations/` e `previews/`. Inclua origem e licença para cada material externo e não aceite caminhos absolutos, travessia `..` ou URL remota em manifestos.
