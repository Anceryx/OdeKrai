# Integração do mascote ODEKRAI

## Asset e direitos

O pacote local contém `odekrai-head.glb` e seis imagens oficiais de referência. Os arquivos foram extraídos para pastas dentro de `assets/odekrai/`, todas ignoradas pelo Git. O modelo é material do proprietário, não automaticamente coberto pela licença MIT do código. Builds criados neste checkout contêm o GLB no `dist`; não distribuir esses artefatos sem autorização. Referências não são empacotadas.

## Carregamento

`OdekraiCompanion` importa Three.js sob demanda e usa `GLTFLoader`. O GLB observado é glTF 2.0, possui grupo `world`, malha facial `ADA_Face_Display`, material `ADA_Eyes_Emissive_ReplaceTexture`, 7 materiais, 3 imagens internas e nenhuma animação embutida. O renderer cria um alias `odekraiRoot` sem alterar nomes internos. O material facial é clonado antes da troca dos mapas.

O mapa facial é um CanvasTexture de 1024×1024 com canal alpha, sRGB e a orientação UV glTF configurada como `flipY=false`. Ele alimenta `map` e `emissiveMap`; a geometria e os materiais de casco/visor permanecem os do GLB. A validação visual de orientação UV ainda está pendente.

## Expressões e eventos

`src/core/mascot.ts` mantém poses e nomes para `idle`, `happy`, `sad`, `angry`, `surprised`, `confused`, `thinking`, `listening`, `talking`, `sleeping`, `waking`, `celebrating`, `loading`, `error`, `working` e `notification`.

`src/core/mascot-face.ts` desenha os olhos por Canvas 2D, sem sprites por expressão. Interpolação suaviza parâmetros faciais; piscadas e estados animados atualizam a textura reutilizada. `evaluateMascotMotion` produz flutuação, rotação, olhar e movimentos curtos; movimento reduzido zera a animação. O preview de diagnóstico pode simular todas as expressões e ações sem emitir eventos globais.

Three.js é dependência MIT (`three` 0.186.1); as definições TypeScript vêm de `@types/three` 0.185.3. Essa licença cobre a dependência, não o GLB nem as imagens do proprietário.

O chat existente emite `thinking` durante a requisição, `responding` ao apresentar a resposta, `completed` após um curto intervalo e `error` em falhas reais. `expressionForIslandState` mapeia estados aceitos pela máquina da ilha para o rosto. A janela livre usa a mesma prioridade com `transitionIsland`.

## Renderização e desempenho

- `WebGLRenderer` usa alpha transparente, `requestAnimationFrame` via `setAnimationLoop`, DPR limitado a 2, redimensionamento por `ResizeObserver` e iluminação sem pós-processamento.
- O renderer só é importado ao abrir as superfícies Companion/prévia. O vendor Three.js fica em chunk separado.
- Renderização para quando o documento ou a janela nativa fica oculta; o Canvas facial redesenha em até 30 Hz e o modelo anima em frame loop.
- Ao desmontar, libera geometrias, materiais clonados/originais, texturas de cena, CanvasTexture e contexto WebGL.
- Perda de contexto apresenta status de erro e tenta retomar quando o browser restaura o contexto.
- Em checkouts sem o asset, o fallback tipográfico é exibido e o build continua sem incluir arquivos oficiais.

## Contrato mantido

Não renomear nós `ADA_`, não substituir o GLB por sprites, não editar ou dispor recursos compartilhados enquanto a cena está montada, e não enviar sinais de simulação para outros processos. Atualizar este documento após a revisão visual e o teste nativo.
