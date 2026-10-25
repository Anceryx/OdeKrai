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

## Personagens Kenney 2D

- `assets/pets/kenney-mini-characters/` contém 12 renderizações CC0 de modelos GLB do pacote Mini
  Characters. Cada PNG mede 512×512 px, tem canal alfa e mostra a pose de repouso do modelo; a
  ferramenta não reproduz os clipes de animação.
- Para regenerar no Windows, instale o Google Chrome, Microsoft Edge ou Brave e execute:

  ```powershell
  npm run render:pets -- --models "C:\Users\<usuário>\Documents\Projetos Olivera\Previews\Models"
  ```

- `--models` aponta à pasta que contém `GLB format/`. O renderizador lê somente os 12 arquivos
  `character-female-a..f.glb`, `character-male-a..f.glb` e a textura `GLB format/Textures/colormap.png`.
  O caminho de saída é `assets/pets/kenney-mini-characters/`; ele pode ser alterado no script para
  uma revisão temporária. O Chrome roda headless com WebGL por software (ANGLE/SwiftShader), em um
  servidor local temporário. O script carrega os modelos e a textura somente por esse servidor e
  não faz chamadas a serviços externos. Nenhum pacote novo é necessário; a ferramenta usa o Three.js
  já instalado no projeto e não faz parte do app Tauri nem do bundle do Vite.
- O enquadramento, a perspectiva, as luzes e a transparência são fixos. Os modelos são centralizados
  no chão e normalizados para 1,88 unidade de altura para manter margem no quadro. A imagem renderizada
  é 512×512; o app limita a escala-base do pet de mesa a 160×160 CSS px e aplica a escala escolhida.
- `npm test` verifica as dimensões e a transparência dos 12 PNGs, o catálogo e o mapeamento de
  estado. Os modelos-fonte e a pasta `Textures/` permanecem externos e não devem ser adicionados ao
  Git.

## Áudio

Os efeitos configuráveis ficam em `public/sounds/`; use arquivos curtos e licenciados. `docs/AUDIO-ASSETS.md` lista eventos, formatos e processo de substituição. Nenhum som foi integrado ainda.

## Pastas reservadas

`character/`, `island/`, `icons/`, `backgrounds/`, `sounds/`, `animations/` e `previews/`. Inclua origem e licença para cada material externo e não aceite caminhos absolutos, travessia `..` ou URL remota em manifestos.
