# Arquitetura

## Estado atual

A interface é React + TypeScript com Vite. `src/core/` mantém contratos e regras independentes da apresentação; `src/ui/` contém o Hub e as janelas do Companion. Preferências não secretas ficam no armazenamento local do WebView. A chave de API permanece apenas em memória.

O shell Tauri cria duas janelas inicialmente ocultas: `island`, para a ilha, e `mascot`, para o marcador geométrico no modo livre. Ambas são transparentes, sem moldura, não focalizáveis, fora da barra de tarefas e configuradas para ficar acima das demais. Comandos Rust controlam visibilidade, posição e tamanho. Eventos Tauri conectam o chat, salvam posições movidas e sincronizam preferências entre janelas.

`src/core/island.ts` implementa transições e prioridades. `src/core/sounds.ts` carrega sons sob demanda, mantém cache, limita repetições, aplica volume e ignora arquivos ausentes ou inválidos. O marcador geométrico é original e substituível pelo mascote aprovado depois.

## Limites atuais

A janela inteira recebe entrada do mouse; click-through por regiões ainda não foi implementado. O modo livre move apenas o marcador temporário, não o mascote final. Detecção de fullscreen/jogos e ocultação automática não estão implementadas. O posicionamento inicial por canto usa a tela principal; posição arrastada é salva. DPI, múltiplos monitores e recuperação de telas desconectadas exigem validação nativa.

## Segurança e persistência

Comandos nativos validam escala e coordenadas finitas e limitadas. O frontend não acessa filesystem ou processos. Substituições de som aceitam somente caminhos locais sob `/sounds/` e extensões WAV, MP3 ou OGG; URLs externas não são permitidas.

## Referência Coucou

Foram estudados os arquivos Windows de FSM, ilha, desktop, animação, layout e áudio `sound.ts` de `Louis-CFM/coucou`, além da licença MIT. O arquivo `sounds.rs` não foi recuperado pela consulta de fonte. Nenhum módulo-fonte foi copiado: o modelo de estados, janelas e carregador foram escritos para os contratos do Odekrai. Não foram reutilizados arte, sons ou identidade do Coucou/Mochi. Consulte `THIRD_PARTY_NOTICES.md`.
