# Áudio do Odekrai

## Estado atual

O motor de áudio suporta os eventos `island_open`, `island_close`, `hover`, `click`, `notification`, `listening_start`, `listening_stop`, `thinking`, `success`, `error`, `wake`, `sleep`, `happy`, `drag_start`, `drag_end` e `return_home`.

**Arquivos integrados:** nenhum. Não foram baixados nem incorporados sons Kenney ou sons do Coucou. Sem arquivo disponível, a reprodução falha em silêncio e não interrompe a interface.

No código atual, os gatilhos ligados são abrir/fechar, hover, sucesso/erro do chat, ativar/suspender a janela, soltar o marcador no desktop e retornar à ilha. Os eventos de notificação, voz, click genérico, pensamento e animações de humor estão catalogados no motor, mas ainda não têm produtores funcionais no produto; não são simulados.

## Adicionar e substituir

Adicione apenas arquivos autorizados em `public/sounds/`. O carregador aceita WAV, MP3 e OGG que o WebView consiga decodificar; o suporte efetivo depende do runtime WebView2. O caminho substituto deve seguir `/sounds/nome-do-arquivo.ext`, usando apenas letras, números, `_` e `-`. URLs externas e caminhos para fora da pasta são recusados.

O Hub permite escolher o evento e registrar o caminho de substituição. O sistema mantém o buffer decodificado em cache. Volume vai de 0 a 100%; volume zero ou a opção de sons desativada resulta em silêncio. Eventos repetidos são limitados, com intervalos maiores para hover e thinking.

## Fontes avaliadas

- [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds): página identifica 100 arquivos e CC0.
- [Kenney Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds): página identifica 70 arquivos e CC0.
- [Kenney UI Audio](https://kenney.nl/assets/ui-audio): página identifica 50 arquivos e CC0.

As páginas apresentam os pacotes como CC0, mas os arquivos não foram baixados nesta etapa; portanto, nenhum nome de efeito, licença incluída no ZIP ou seleção de áudio é declarado como validado. Ao baixar, guarde o texto de licença, selecione apenas os arquivos necessários e registre nomes, pacote, URL, licença e eventuais edições nesta documentação e em `THIRD_PARTY_NOTICES.md`.

## Referências de implementação

O sistema de carregamento e cache foi escrito para o Odekrai. O projeto estudou o carregador Windows TypeScript do Coucou; a implementação Rust `sounds.rs` não foi recuperada pela consulta de fonte. Nenhum código ou arquivo sonoro do Coucou foi copiado. A licença MIT do código do Coucou é independente da licença CC0 dos pacotes Kenney.
