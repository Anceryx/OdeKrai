# Guia de assets do OdeKrai

O runtime usa imagens PNG estáticas e folhas de sprites WebP. Os modelos 3D Kenney usados para gerar as imagens permanecem fora do repositório; o aplicativo não os carrega nem usa WebGL.

## Personagens Kenney 2D

- `assets/pets/kenney-mini-characters/` contém 12 renderizações CC0 dos modelos do pacote Mini Characters. Cada PNG estático mede 512×512 px, tem canal alfa e usa um quadro central do clipe `idle`, sem a pose em T. A subpasta `animations/` contém folhas WebP horizontais com quadros de 192×192 px e manifestos JSON individuais por personagem.
- Para regenerar no Windows, instale Google Chrome, Microsoft Edge ou Brave e execute:

  ```powershell
  npm run render:pets -- --models "C:\Users\<usuário>\Documents\Projetos Olivera\Previews\Models"
  ```

- Para inspecionar os quadros centrais dos clipes de um personagem numa folha temporária, use `npm run render:pets -- --models "C:\Users\<usuário>\Documents\Projetos Olivera\Previews\Models" --contact-sheet character-female-a`. O arquivo PNG é gravado em `%TEMP%`; `--output caminho.png` escolhe outro destino.
- Depois de selecionar os clipes, regenere PNGs estáticos, folhas WebP e manifestos com `npm run render:pets:animations -- --models "C:\Users\<usuário>\Documents\Projetos Olivera\Previews\Models"`. A geração valida o limite total de 6 MiB para as folhas WebP.
- O mapeamento renderizado é: `idle` e `thinking` → `idle`; `working` → `interact-right`; `awaiting_approval` → `emote-no`; `success` → `emote-yes`; `error` → `die`; `paused` → `sit`. As folhas contínuas fazem loop; sucesso e erro tocam uma vez e retornam ao idle.

- `--models` aponta à pasta que contém `GLB format/`. O renderizador lê somente os arquivos `character-female-a..f.glb`, `character-male-a..f.glb` e `GLB format/Textures/colormap.png`. O destino padrão é `assets/pets/kenney-mini-characters/`.
- O Chrome roda headless com WebGL por software (ANGLE/SwiftShader), em um servidor local temporário. O script não faz chamadas a serviços externos. Three.js é usado somente pelo script e está em `devDependencies`; não faz parte do app Tauri nem do bundle Vite.
- O enquadramento, a perspectiva, as luzes e a transparência são fixos. Os modelos são centralizados no chão e normalizados para 1,88 unidade de altura. O app limita a escala-base do pet de mesa a 160×160 CSS px.
- `npm test` verifica dimensões e transparência dos PNGs e WebPs, manifestos, mapeamento de estado e orçamento de tamanho. Modelos-fonte e texturas permanecem externos e não devem ser adicionados ao Git.

## Ícone do aplicativo

Os ícones do aplicativo ficam em `src-tauri/icons/` e são compilados pelo Tauri.

## Áudio

Os efeitos configuráveis ficam em `public/sounds/`; use arquivos curtos e licenciados. `docs/AUDIO-ASSETS.md` lista eventos, formatos e processo de substituição.

## Pastas reservadas

`character/`, `island/`, `icons/`, `backgrounds/`, `sounds/`, `animations/` e `previews/`. Inclua origem e licença para cada material externo e não aceite caminhos absolutos, travessia `..` ou URL remota em manifestos.
