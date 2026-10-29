# Lote 6 — E1: “Seu computador”

**Data:** 29/10/2026

**Revisão-base:** `9091282e670dd605880316dc54eaa0ebb7328bf0`

## Causa e limites da confirmação

O fechamento relatado no executável instalado **não pôde ser reproduzido nesta sessão**: não havia uma interface de automação gráfica Windows acessível para abrir o modal e observar a janela/processo. Portanto, não há confirmação de crash Rust, saída do processo, encerramento do WebView2 ou erro da instalação usada no relato.

Foi confirmada uma falha de isolamento no código: `SettingsModal` renderizava a tela lazy “Seu computador” dentro de `Suspense`, sem o `ScreenErrorBoundary` usado na rota de tela completa. Uma exceção de renderização nessa tela podia escapar para a raiz React e desmontar a interface inteira. Também havia confiança nos formatos de IPC e acesso direto a `localStorage` durante a renderização; um retorno malformado ou `SecurityError` podia provocar essa exceção. Isso confirma um caminho de falha do frontend, mas não prova que tenha causado o fechamento observado no executável.

O comando nativo de hardware já usava `spawn_blocking`, convertia falha de tarefa em `Result` e tratava consultas parciais como avisos. Não foram encontradas evidências estáticas de encerramento intencional do processo nesse caminho. O Rust e o fluxo de modelos não foram alterados.

## Correções

- O conteúdo do modal de Configurações agora usa `ScreenErrorBoundary`, reiniciado ao trocar a categoria. Erros de renderização mantêm o restante do app montado e enviam mensagem e pilha React ao diagnóstico global existente, que aplica sanitização.
- Respostas de hardware e inventário são validadas antes do estado React; payload inválido deixa a tela utilizável com seleção manual de modelos e aviso de falha.
- O componente trata falhas de leitura/gravação do destino local, listener de progresso, seletor de pastas, inventário, download, cancelamento e exclusão com mensagens seguras e detalhes encaminhados ao diagnóstico sanitizado. Adicionou estado de carregamento explícito para hardware e inventário.
- A navegação do modal mantém a página subjacente; regressão percorre cinco ciclos abrir/fechar de “Seu computador” mantendo a conversa. Nenhuma configuração, conversa, seleção de modelo ou funcionalidade de IA local foi removida.

## Validação

- `npm run build`: passou.
- `npm test`: 48 arquivos e 234 testes passaram.
- `npm run format:check`: passou após formatação.
- `npm run check:encoding`: passou (UTF-8 sem BOM, sem mojibake).
- `npm run check:version`: passou (versões sincronizadas em `0.15.0`).
- `cargo fmt --check`: passou.
- `cargo test`: 266 testes da biblioteca, 2 de integração e doctests passaram.
- `git diff --check`: passou.
- `npm run check`: indisponível; o `package.json` não define script com esse nome. Foram executados os checks específicos disponíveis.

## Pendente

**VALIDAÇÃO WINDOWS PENDENTE.** Repetir o fluxo no executável instalado e identificado por caminho/SHA-256/revisão; observar separadamente visibilidade da janela, PID/saída do processo, log do WebView2 e diagnóstico do frontend. Também falta interação visual real para abrir, fechar, navegar para outra categoria e reabrir repetidamente. Os testes automatizados cobrem os contratos e o ciclo de estado da navegação, não a janela empacotada.
