# Efeitos sonoros

O aplicativo reconhece 19 eventos. Uma substituição escolhida tem prioridade; no modo automático,
o carregador tenta os arquivos disponíveis nesta ordem: WAV, OGG e MP3. Os buffers e as falhas ficam em cache. Se nenhum arquivo puder ser carregado,
o aplicativo permanece em silêncio. O volume, o intervalo mínimo entre reproduções e a opção de
desativar os sons continuam valendo. Há também um limite global de quatro inícios de reprodução
por segundo. Sons do grupo Pet não são reproduzidos quando o pet está oculto.

O manifesto é gerado por `scripts/generate-sound-manifest.mjs` antes de iniciar o Vite, construir o
aplicativo ou executar os testes. O script considera apenas arquivos no primeiro nível de
`public/sounds/`, valida nomes e extensões e grava `src/core/sound-manifest.generated.json`.

## Arquivos e licenças

O texto incluído em `public/sounds/License.txt` identifica Kenney Interface Sounds 1.0 e a licença
Creative Commons Zero (CC0). As linhas atribuídas a esse pacote correspondem aos arquivos
encontrados junto do texto de licença. A origem e a licença dos demais arquivos não estão
informadas. Nenhum arquivo é atribuído aos eventos sem correspondente disponível.

| Evento            | Arquivo               | Pacote de origem            | URL                                       | Licença       |
| ----------------- | --------------------- | --------------------------- | ----------------------------------------- | ------------- |
| `island_open`     | `island_open.ogg`     | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `island_close`    | `island_close.ogg`    | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `hover`           | `hover.ogg`           | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `click`           | `click.ogg`           | não informado               | não informado                             | não informado |
| `notification`    | `notification.ogg`    | não informado               | não informado                             | não informado |
| `listening_start` | não informado         | não informado               | não informado                             | não informado |
| `listening_stop`  | não informado         | não informado               | não informado                             | não informado |
| `thinking`        | `thinking.ogg`        | não informado               | não informado                             | não informado |
| `success`         | `success.ogg`         | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `error`           | `error.ogg`           | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `wake`            | `wake.ogg`            | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `sleep`           | `sleep.ogg`           | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `happy`           | `happy.ogg`           | não informado               | não informado                             | não informado |
| `drag_start`      | `drag_start.ogg`      | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `drag_end`        | `drag_end.ogg`        | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `return_home`     | `return_home.ogg`     | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `approval_needed` | `approval_needed.ogg` | não informado               | não informado                             | não informado |
| `action_done`     | `action_done.ogg`     | não informado               | não informado                             | não informado |
| `halted`          | `halted.ogg`          | não informado               | não informado                             | não informado |

O texto de licença fornecido com os arquivos está em `public/sounds/License.txt`. A licença não
exige atribuição; Kenney informa que o crédito é opcional.

## Eventos e gatilhos

Os estados abaixo refletem os arquivos encontrados em `public/sounds/` neste checkout. Arquivos
ausentes permanecem em silêncio. `listening_start` e `listening_stop` são reservados e não possuem
gatilho implementado.

| Evento            | Gatilho                                                                                        | Arquivo esperado      | Situação |
| ----------------- | ---------------------------------------------------------------------------------------------- | --------------------- | -------- |
| `island_open`     | O ponteiro expande o pet quando “Abrir ao passar o mouse” está ativo.                          | `island_open.ogg`     | presente |
| `island_close`    | O botão de recolher a ilha é acionado.                                                         | `island_close.ogg`    | presente |
| `hover`           | O ponteiro entra na janela do pet.                                                             | `hover.ogg`           | presente |
| `click`           | Clique no pet em qualquer modo ou em um botão do balão. No modo Livre, também dispara `happy`. | `click.ogg`           | presente |
| `notification`    | O banner de diagnóstico aparece, inclusive quando informa o modo seguro.                       | `notification.ogg`    | presente |
| `listening_start` | Reservado; sem gatilho.                                                                        | `listening_start.ogg` | ausente  |
| `listening_stop`  | Reservado; sem gatilho.                                                                        | `listening_stop.ogg`  | ausente  |
| `thinking`        | Início do envio de uma mensagem nova; uma vez por mensagem, sem repetir ao tentar novamente.   | `thinking.ogg`        | presente |
| `success`         | Resposta do provedor concluída.                                                                | `success.ogg`         | presente |
| `error`           | Falha ao obter a resposta do provedor.                                                         | `error.ogg`           | presente |
| `wake`            | Pet ativado na área de trabalho.                                                               | `wake.ogg`            | presente |
| `sleep`           | Pet ocultado na área de trabalho.                                                              | `sleep.ogg`           | presente |
| `happy`           | Clique no pet no modo Livre.                                                                   | `happy.ogg`           | presente |
| `drag_start`      | Sem gatilho implementado.                                                                      | `drag_start.ogg`      | presente |
| `drag_end`        | Sem gatilho implementado.                                                                      | `drag_end.ogg`        | presente |
| `return_home`     | Sem gatilho implementado.                                                                      | `return_home.ogg`     | presente |
| `approval_needed` | Uma aprovação pendente aparece na janela de aprovação.                                         | `approval_needed.ogg` | presente |
| `action_done`     | O resultado de uma ação no fluxo atual indica `completed`.                                     | `action_done.ogg`     | presente |
| `halted`          | O kill switch emite o evento de parada de emergência.                                          | `halted.ogg`          | presente |

## Validação pendente

A compatibilidade dos arquivos OGG e o volume percebido precisam de validação auditiva em uma
versão nativa do Windows com WebView2. Os testes automatizados não reproduzem nem avaliam áudio.
