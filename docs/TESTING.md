# Testes e validação

## Verificações automatizadas

- `npm test`: chat, estados da ilha, persistência, carregador de sons, registro das 16 expressões, mapeamento de eventos, interpolação facial, piscadas e movimento reduzido.
- `npm run build`: TypeScript e bundle Vite.
- `npm run format:check`: estilo Prettier.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`: formatação Rust.
- `cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc`: compilação Rust para Windows.
- `cargo test --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc`: testes Rust (sem testes Rust declarados atualmente).
- `npm run tauri:build`: aplicação e instalador NSIS.
- `git diff --check`: whitespace e marcadores de conflito.

Na validação passaram `npm run build` (GLB local), `npm test` (17 testes em 5 arquivos), `npm run format:check`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` e `git diff --check`. O Vite reporta chunk Three.js de 617 kB minificado. `npm run tauri:build` gerou o executável de 9.557.504 bytes e o NSIS de 2.381.485 bytes. O NSIS foi instalado em uma pasta TEMP exclusiva (código 0), o executável iniciou com a janela `ODEKRAI Hub`, e a desinstalação retornou 0 e removeu a pasta de teste. O UDF existente foi preservado. Authenticode informa `NotSigned`. A automação desta sessão não permitiu inspecionar pixels da janela; validação visual continua pendente. O sandbox bloqueia esbuild com `spawn EPERM`; a execução autorizada passou.

## Pré-visualização de desenvolvimento

Na página Companion, abrir “Pré-visualização e ferramentas de diagnóstico”. O painel permite escolher qualquer expressão, testar movimentos, habilitar flutuação/animações, ajustar luz, escala, posição e órbita da câmera, e ler FPS/triângulos/chamadas. O aviso identifica a simulação como local; os controles não emitem eventos para outras janelas.

O GLB deste proprietário fica fora do Git e é incluído apenas no build feito neste checkout. Um checkout sem o GLB deve exibir o fallback e seguir compilando. As referências não são importadas pelo Vite.

## Checklist manual de validação nativa

Execute em uma sessão Windows com a janela visível. Registre sistema, escala DPI, resolução/monitores e resultado por etapa. Não marque como aprovado quando não for possível observar o comportamento.

1. Abra o HUB e confirme que a janela aparece, responde e fecha normalmente.
2. Ative a ilha; confirme posição inicial, transparência, expansão/recolhimento e que áreas transparentes permitem clicar no desktop.
3. Abra o Companion em modo livre; arraste-o, mova o foco para outros apps e confirme que ele não rouba foco.
4. Reinicie o app e confirme a persistência da posição; use “Retornar à ilha” e confirme que a janela livre some e a ilha reaparece.
5. Abra a pré-visualização e percorra `idle`, `happy`, `sad`, `angry`, `surprised`, `confused`, `thinking`, `listening`, `talking`, `sleeping`, `waking`, `celebrating`, `loading`, `error`, `working` e `notification`. Para cada uma, confirme olhos no visor, identidade preservada, transição suave e ausência de deformação.
6. Teste piscar, olhar, flutuar, inclinar, arrastar, retornar e movimento reduzido. Minimize/restaure e feche/reabra; confirme que a animação pausa/restaura e não há consumo crescente ou processos órfãos.
7. Compare frente e três quartos com as referências oficiais locais; confira UV, espelhamento, profundidade, materiais vermelhos/pretos, brilho dos olhos, nitidez e transparência do fundo.
8. Envie uma conversa real e confirme as expressões `thinking`, `responding`, `completed` e `error` somente nos eventos correspondentes.
9. Repita em DPI 100%, 125% e 150%, monitores distintos, reconexão/desconexão e fullscreen; observe escala, posição e interação com o desktop.
10. Instale o NSIS em pasta de teste isolada, abra e feche o app, depois desinstale. Confirme que o UDF normal e as preferências existentes permanecem intactos. Nesta etapa, a instalação e desinstalação silenciosas passaram e a pasta de teste foi removida; a assinatura é `NotSigned`.

## Inspeção visual manual pendente

A interface não ficou disponível para inspeção visual nesta sessão. O teste recente confirmou inicialização do executável e do UDF padrão por processo e título de janela, mas não comprova pixels renderizados, ilha visível, interação ou comportamento instalado. Execute o checklist acima numa sessão gráfica acessível.

Build/testes automatizados não comprovam visualização 3D correta, orientação UV, WebGL em Tauri, click-through ou comportamento em múltiplos monitores.

## Áudio

Não há sons Kenney integrados. As páginas oficiais de [UI Audio](https://kenney.nl/assets/ui-audio) e [Interface Sounds](https://kenney.nl/assets/interface-sounds) indicam CC0, mas os arquivos ZIP e licenças internas ainda precisam ser verificados. Não copiar sons do Coucou.
