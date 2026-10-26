# OdeKrai

[Português (Brasil)](README.md) · [English](README.en.md)

![Banner do OdeKrai](banner.png)

Aplicativo OdeKrai para Windows, desenvolvido com React, TypeScript e Tauri 2. O projeto está em desenvolvimento: o build do frontend e os testes automatizados não comprovam a inspeção visual nem a validação dos adaptadores com contas reais.

## Recursos implementados

- Aplicativo com visão geral, conversas, catálogo de 17 provedores e configurações do assistente.
- Uma janela nativa do Tauri para os modos Ilha e Livre do pet, com posição, tamanho e modo persistidos.
- Preferências locais sem chaves de API.
- Armazenamento de credenciais via Gerenciador de Credenciais do Windows e envio de mensagens pelo processo Rust.
- Histórico de conversas em SQLite local, com retomada da conversa e respostas incrementais para Anthropic e adaptadores Chat Completions. A Perplexity ainda retorna a resposta completa.
- Pasta pessoal escolhida na primeira execução, identidade `ODEKRAI.md` e memória manual editáveis. O histórico pode ser apagado na interface. O motor de permissões em Rust inclui aprovação nativa, auditoria encadeada e kill switch; nesta fase, só há ferramentas simuladas.
- Perfil local em SQLite, com avatar reprocessado no Rust e nunca enviado aos provedores.
- Instância única, CSP de produção restrita e permissões separadas para as janelas auxiliares.
- Inicialização tolerante a falhas, modo seguro após interrupção e registro local de diagnóstico sem conteúdo de conversas.
- Adaptadores para 13 APIs Chat Completions remotas, Anthropic Messages, Perplexity Agent API e conexão local OpenAI compatível. Vertex AI continua como guia pendente de ADC/OAuth.
- Conector IA local para servidores Ollama ou llama.cpp já iniciados, com seleção de modelos e conversa por streaming; não baixa modelos nem inicia servidores.
- Pet 2D com 12 personagens CC0 renderizados em 512×512, escolha persistida no SQLite e animações
  CSS.

## Requisitos e execução

- Windows 10/11 x64, Node.js 20.19+ ou 22.12+, Rust estável, MSVC Build Tools, Windows SDK e WebView2 Runtime.
- `npm install`, `npm run dev`, `npm run build`, `npm test`.
- `npm run tauri:dev` inicia o aplicativo; `npm run tauri:build` gera os artefatos Windows.

No catálogo, cada provedor mantém seu endpoint e modelo. A validação de endpoint acontece antes de salvar a credencial; a listagem de modelos só aparece quando documentada para esse endpoint. **Testar conexão** usa essa listagem sem enviar um prompt de geração; para provedores sem listagem, o resultado é parcial. Vertex AI e autenticação AWS IAM/SigV4 não estão integrados.

## Capturas de tela

Não há capturas verificadas desta revisão. Para capturá-las, consulte [docs/TESTING.md](docs/TESTING.md) e registre as telas do aplicativo, catálogo, ilha e modo livre depois de executar o build atualizado. Não use imagens conceituais como evidência de execução.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md) · [Segurança](docs/SECURITY.md) · [Privacidade](docs/PRIVACY.md)
- [Provedores](docs/AI-PROVIDERS.md) · [Desenvolvimento](docs/DEVELOPMENT.md) · [Testes](docs/TESTING.md)
- [Assets](docs/ASSET-GUIDE.md) · [Áudio](docs/AUDIO-ASSETS.md) · [Status](docs/IMPLEMENTATION-STATUS.md) · [Continuação](docs/CONTINUATION.md)

## Licenças

O código original está sob MIT. Essa licença não concede direitos sobre a marca ou arquivos oficiais do mascote. Consulte [LICENSE-ASSETS.md](LICENSE-ASSETS.md) e [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Não distribua os assets privados.
