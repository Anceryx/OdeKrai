# Guia de assets do OdeKrai

O runtime usa sprites PNG. Os modelos 3D Kenney usados para gerar as imagens permanecem fora do repositório; o aplicativo não os carrega.

## Personagens Kenney 2D

- `assets/pets/kenney-mini-characters/` contém 12 renderizações CC0 de modelos do pacote Mini Characters. Cada PNG mede 512×512 px, tem canal alfa e mostra a pose de repouso do modelo; a ferramenta não reproduz os clipes de animação.
- Para regenerar no Windows, instale Google Chrome, Microsoft Edge ou Brave e execute:

  ```powershell
  npm run render:pets -- --models "C:\Users\<usuário>\Documents\Projetos Olivera\Previews\Models"
  ```

- `--models` aponta à pasta que contém `GLB format/`. O renderizador lê somente os arquivos `character-female-a..f.glb`, `character-male-a..f.glb` e `GLB format/Textures/colormap.png`. O destino padrão é `assets/pets/kenney-mini-characters/`.
- O Chrome roda headless com WebGL por software (ANGLE/SwiftShader), em um servidor local temporário. O script não faz chamadas a serviços externos. Three.js é usado somente pelo script e está em `devDependencies`; não faz parte do app Tauri nem do bundle Vite.
- O enquadramento, a perspectiva, as luzes e a transparência são fixos. Os modelos são centralizados no chão e normalizados para 1,88 unidade de altura. O app limita a escala-base do pet de mesa a 160×160 CSS px.
- `npm test` verifica dimensões e transparência dos PNGs, o catálogo e o mapeamento de estado. Modelos-fonte e texturas permanecem externos e não devem ser adicionados ao Git.

## Ícone do aplicativo

Os ícones do aplicativo ficam em `src-tauri/icons/` e são compilados pelo Tauri.

## Áudio

Os efeitos configuráveis ficam em `public/sounds/`; use arquivos curtos e licenciados. `docs/AUDIO-ASSETS.md` lista eventos, formatos e processo de substituição.

## Pastas reservadas

`character/`, `island/`, `icons/`, `backgrounds/`, `sounds/`, `animations/` e `previews/`. Inclua origem e licença para cada material externo e não aceite caminhos absolutos, travessia `..` ou URL remota em manifestos.
