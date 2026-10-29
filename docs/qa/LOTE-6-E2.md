# Lote 6 — E2: ciclo de vida de janelas e bandeja

## Evidências e conclusão

- A preferência `closeBehavior` é persistida pelo frontend e o padrão é `exit`. Em `minimize_to_tray`, o handler do X chama `prevent_close()` e oculta a janela principal: o processo continua ativo por projeto. O menu da bandeja tem ações Abrir, Mostrar/ocultar pet e Sair.
- O plugin `tauri_plugin_single_instance` está registrado. Antes desta correção, seu callback mostrava e focava a janela principal, mas não chamava `unminimize()`. Assim, uma janela minimizada podia continuar invisível após uma segunda abertura. A causa desse comportamento fica confirmada pelo caminho de código; não há reprodução visual nativa nesta sessão.
- O tray usa o ID fixo `odekrai-main-tray`. A configuração remove esse ID antes de construir o ícone, e o handler de fechamento da janela principal é instalado uma vez em `setup`. O código não evidencia dois IDs simultâneos nem registro repetido do handler. Ícones residuais do Explorer não podem ser distinguidos de ícones ativos sem inspeção visual da bandeja.
- Nesta sessão, `Get-Process -Name OdeKrai` e `Get-CimInstance Win32_Process -Filter "name='odekrai.exe'"` não retornaram processos. Isso descreve somente o instante da consulta e não comprova o estado observado pelo usuário.
- O encerramento aguardava limpeza por até três segundos e, em caso de timeout, usava `std::process::exit(0)`, contornando a finalização normal do runtime Tauri. O fluxo atualizado remove o tray e chama `AppHandle::exit(0)` após sucesso ou timeout, deixando a finalização de janelas e recursos nativos a cargo do ciclo do Tauri. Uma falha de janela auxiliar é tolerada pela saída do processo.

## Teste manual Windows pendente

Executar em build local da revisão corrigida, com o Gerenciador de Tarefas e a bandeja visível. Registrar PID e estado da janela em cada etapa; não apagar ícones da área de overflow para a verificação.

1. Com `Encerrar`, abrir o app, observar um processo e um ícone ativo (se a preferência criar tray), clicar X e confirmar que o processo encerra e que o ícone ativo some. Aguardar a atualização visual do Explorer para separar ícone residual.
2. Com `Minimizar para a bandeja`, abrir o app, clicar X e confirmar que a janela some, mas o mesmo PID continua. Usar Abrir no menu e confirmar janela visível, desminimizada e focada.
3. Minimizar a janela pela barra de título, iniciar o executável novamente e confirmar que o PID original permanece, a janela é desminimizada/mostrada/focada e não surge um segundo processo.
4. Repetir Abrir, X, minimizar e restaurar várias vezes; contar ícones ativos e processos. Distinguir ícone ativo do OdeKrai de entradas antigas na área de overflow do Explorer.
5. Abrir o pet, depois escolher Sair no menu da bandeja. Confirmar encerramento do processo e fechamento das janelas principal e pet. Repetir com diálogo de aprovação aberto e operação de provedor cancelável para observar a limpeza.
6. Reabrir após saída real e confirmar uma janela nova, um processo e estado de conversa/configurações preservado.

Não foi possível inspecionar a bandeja do Explorer nem reproduzir o executável instalado nesta sessão. Os relatos de múltiplos ícones e de restauração após fechamento inesperado permanecem sem confirmação quanto a processos duplicados ou cache visual do Explorer.
