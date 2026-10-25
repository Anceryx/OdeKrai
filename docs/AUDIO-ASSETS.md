# Efeitos sonoros

O aplicativo reconhece 16 eventos. Uma substituição escolhida tem prioridade; no modo automático,
o carregador tenta os arquivos disponíveis nesta ordem: WAV, OGG e MP3. Os buffers e as falhas ficam em cache. Se nenhum arquivo puder ser carregado,
o aplicativo permanece em silêncio. O volume, o intervalo mínimo entre reproduções e a opção de
desativar os sons continuam valendo.

O manifesto é gerado por `scripts/generate-sound-manifest.mjs` antes de iniciar o Vite, construir o
aplicativo ou executar os testes. O script considera apenas arquivos no primeiro nível de
`public/sounds/`, valida nomes e extensões e grava `src/core/sound-manifest.generated.json`.

## Arquivos e licenças

O pacote incluído em `public/sounds/License.txt` identifica Kenney Interface Sounds 1.0 e a licença
Creative Commons Zero (CC0). Os arquivos listados foram encontrados junto desse texto de licença.
Nenhum arquivo é atribuído aos eventos sem correspondente disponível.

| Evento            | Arquivo            | Pacote de origem            | URL                                       | Licença       |
| ----------------- | ------------------ | --------------------------- | ----------------------------------------- | ------------- |
| `island_open`     | `island_open.ogg`  | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `island_close`    | `island_close.ogg` | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `hover`           | `hover.ogg`        | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `click`           | não informado      | não informado               | não informado                             | não informado |
| `notification`    | não informado      | não informado               | não informado                             | não informado |
| `listening_start` | não informado      | não informado               | não informado                             | não informado |
| `listening_stop`  | não informado      | não informado               | não informado                             | não informado |
| `thinking`        | não informado      | não informado               | não informado                             | não informado |
| `success`         | `success.ogg`      | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `error`           | `error.ogg`        | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `wake`            | `wake.ogg`         | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `sleep`           | `sleep.ogg`        | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `happy`           | não informado      | não informado               | não informado                             | não informado |
| `drag_start`      | `drag_start.ogg`   | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `drag_end`        | `drag_end.ogg`     | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |
| `return_home`     | `return_home.ogg`  | Kenney Interface Sounds 1.0 | https://kenney.nl/assets/interface-sounds | CC0 1.0       |

O texto de licença fornecido com os arquivos está em `public/sounds/License.txt`. A licença não
exige atribuição; Kenney informa que o crédito é opcional.

## Validação pendente

A compatibilidade dos arquivos OGG e o volume percebido precisam de validação auditiva em uma
versão nativa do Windows com WebView2. Os testes automatizados não reproduzem nem avaliam áudio.
