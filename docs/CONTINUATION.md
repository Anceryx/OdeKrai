# Retomada do desenvolvimento

## Estado

Branch local `codex/odekrai-foundation`, HEAD `5335af4` antes desta etapa. A árvore já continha ilha flutuante, modo livre, estados, áudio e correções do build Windows; preservar todas as alterações não commitadas.

O pacote `ODEKRAI_Referencias_Codex.zip` foi lido. O GLB e seis referências oficiais estão em diretórios locais ignorados. Não adicioná-los ao Git ou publicar o bundle local sem autorização específica.

## Trabalho desta etapa

- Adicionados Three.js 0.186.1 e `@types/three` 0.185.3.
- Implementado renderer do GLB e CanvasTexture facial programática, com validação dos nomes da malha/material, clonagem do material facial e descarte dos recursos temporários.
- Integradas 16 expressões e movimentos ao Companion da ilha e da janela livre; eventos do chat atualizam a expressão sem substituir a máquina de prioridades existente.
- Substituída a forma geométrica nas janelas do Companion pelo renderer do mascote e adicionada pré-visualização local de diagnóstico.
- `npm run build` passou, com aviso de chunk Three.js de 617 kB. `npm test` passou com 17 testes em 5 arquivos.
- `tauri dev` iniciou com perfil WebView2 temporário; depois, o executável de release abriu com o UDF padrão e criou a janela `ODEKRAI Hub`. O erro `0x800700AA` anterior não se reproduziu; causa inconclusiva. NSIS instalado e desinstalado em pasta TEMP isolada (ambos com código 0); a cópia instalada abriu o Hub. A automação não expôs a imagem da janela. O instalador está sem assinatura Authenticode.

## Próximas ações

1. Abrir o app em uma sessão gráfica e inspecionar HUB, ilha e Companion; o teste automatizado de processo não substitui a inspeção visual.
2. Comparar textura facial e orientação UV com as referências locais; corrigir somente após inspeção do GLB renderizado.
3. Validar expressões, movimentos, eventos reais, retorno, persistência, foco e hit-testing conforme `docs/TESTING.md`.
4. Executar o checklist gráfico manual, inclusive inspeção do GLB e validação das 16 expressões; o teste automático comprovou abertura de janela, não a aparência do renderer.
5. Testar build sem o GLB para confirmar fallback sem assets privados.
6. Validar DPI, múltiplos monitores, desconexão e fullscreen.
7. Consultar `origin/main` antes de integração/publicação. Não publicar sem autorização explícita.

## Comandos úteis

- Build web: `npm run build`
- Testes: `npm test`
- Build Windows: `npm run tauri:build` em ambiente `VsDevCmd.bat` com MSVC/Windows SDK.
- Asset local ignorado: `assets/odekrai/character/odekrai-head.glb`.
- Renderer: `src/ui/OdekraiCompanion.tsx` e `src/core/mascot-face.ts`.
