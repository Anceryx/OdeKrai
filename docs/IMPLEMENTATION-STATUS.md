# Estado da implementação

Atualizado em 24/10/2026. Descreve a árvore de trabalho local; não representa publicação nem validação em outro computador.

## Implementado

- Hub React + TypeScript + Vite e chat compatível com OpenAI Chat Completions.
- Ilha Tauri e janela livre do Companion, com persistência, retorno à ilha e regiões Win32 arredondadas para hit-testing.
- Modelo oficial `odekrai-head.glb` carregado por Three.js no renderer local, com material facial clonado e expressões geradas por CanvasTexture.
- Dezesseis expressões procedurais, transições suavizadas, piscadas, flutuação, olhar, inclinação, confirmação, reações de conversa e falha, entrada/saída e retorno.
- Eventos reais do chat conectados: `thinking`, `responding`, `completed` e `error`; a máquina de estados da ilha mantém prioridade de eventos.
- Painel local de desenvolvimento com seletor de expressões, movimentos, órbita, zoom, iluminação, escala, posição, animação e métricas de renderização. A simulação do painel está explicitamente separada dos eventos reais.
- Redução de movimento, pausa quando a janela está oculta e liberação de geometrias, materiais e texturas no descarte do renderer.
- Modelo e referências permanecem em pastas locais ignoradas pelo Git. Checkouts sem o GLB usam o fallback e não o incorporam ao build.

## Ferramentas

- Windows 10.0.19045 x64; Node.js 24.12.0; npm 11.6.2.
- Rust/Cargo 1.99.1; Tauri CLI 2.12.4; crates Tauri 2.12.5.
- Three.js 0.186.1 e definições TypeScript `@types/three` 0.185.3.
- Visual Studio Build Tools 2022 17.14.42; MSVC 14.44.35207; Windows SDK 10.0.26100.0; WebView2 Runtime 153.0.4234.48.
- Rust/Cargo ficam em `%USERPROFILE%\.cargo\bin`; terminais que herdaram um `PATH` anterior podem precisar adicioná-lo.

## Estado da validação nesta etapa

- O GLB foi inspecionado: glTF 2.0, 19 malhas nomeadas, 7 materiais, textura facial e zero animações embutidas. A malha e material faciais esperados foram encontrados.
- `npm run build`: passou e incluiu o GLB de 940,10 kB no `dist` local. Three.js é carregado sob demanda; o bundle do vendor tem 617 kB minificado e produz aviso do Vite acima do limite de 500 kB.
- `npm test`: 17 testes passaram em 5 arquivos.
- A revisão de alinhamento UV e a renderização efetiva do modelo ainda dependem de inspeção visual. O último acesso à interface nativa não estava disponível nesta sessão.
- `tauri dev` iniciou com perfil WebView2 temporário. Em novo ensaio, o executável de release também iniciou com o perfil padrão, criou a janela Win32 `ODEKRAI Hub` e processos WebView2 sob o UDF padrão. A automação desta sessão não expõe a imagem da janela; a inspeção visual segue pendente.
- O UDF identificado é `%LOCALAPPDATA%\site.anceryx.odekrai\EBWebView`; ACL concede controle total ao usuário. Nenhuma variável `WEBVIEW2_*` estava definida e não havia processos Odekrai/WebView2 antes do teste. O `0x800700AA` anterior não se reproduziu; sua causa permanece inconclusiva. Concorrência/lock residual é hipótese, não causa confirmada.
- `npm run tauri:build` concluiu: executável em `src-tauri/target/release/odekrai.exe` (9.557.504 bytes) e instalador em `src-tauri/target/release/bundle/nsis/Odekrai_0.1.0_x64-setup.exe` (2.381.485 bytes). O Vite gerou o GLB local de 940,10 kB; o identificador `odekrai-head-BjCalycV.glb` está referenciado no executável Tauri.
- Teste NSIS em pasta TEMP exclusiva: instalação silenciosa retornou 0; a pasta continha `odekrai.exe` e `uninstall.exe`; o app instalado abriu a janela Win32 `ODEKRAI Hub`; desinstalação silenciosa retornou 0 e removeu a pasta de teste. O UDF normal foi preservado. Assinatura Authenticode: `NotSigned`. A interface gráfica não estava disponível para inspeção visual.
- Nenhum som Kenney foi integrado. As páginas oficiais listam CC0, mas os ZIPs/licenças internas não foram revisados; nenhum som Coucou foi copiado.

## Pendências

- Inspecionar visualmente HUB, ilha e Companion em uma sessão gráfica acessível; confirmar GLB, UV, transparência, escala e expressões.
- Testar cliques no desktop, always-on-top, foco, arraste, persistência, retorno à ilha, DPI 100/125/150%, múltiplos monitores, reconexão e fullscreen.
- Capturar e comparar imagens do render com as seis referências oficiais apenas localmente; não incluir as referências em builds ou no Git.
- Nenhum push ou publicação foi feito; `origin/main` não foi consultado.
