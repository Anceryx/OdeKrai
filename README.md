# OdeKrai

Assistente pessoal de inteligência artificial para Windows, desenvolvido com React, TypeScript e Tauri 2. O nome do aplicativo é **OdeKrai**. O projeto está em desenvolvimento: o build do frontend e os testes automatizados não comprovam a inspeção visual nem a validação dos adaptadores com contas reais.

## Recursos implementados

- Aplicativo com visão geral, conversas, catálogo de 15 provedores e configurações do assistente.
- Janelas nativas do Tauri para a ilha flutuante e o modo livre do mascote.
- Preferências locais sem chaves de API.
- Armazenamento de credenciais via Gerenciador de Credenciais do Windows e envio de mensagens pelo processo Rust.
- Histórico de conversas em SQLite local, com retomada da conversa e respostas incrementais para Anthropic e adaptadores Chat Completions. A Perplexity ainda retorna a resposta completa.
- Instância única, CSP de produção restrita e permissões separadas para as janelas auxiliares.
- Adaptadores para 12 APIs Chat Completions, Anthropic Messages e Perplexity Agent API. Vertex AI continua como guia pendente de ADC/OAuth.
- Modelo 3D oficial local ignorado pelo Git; checkouts sem o asset usam fallback.

## Requisitos e execução

- Windows 10/11 x64, Node.js 20.19+ ou 22.12+, Rust estável, MSVC Build Tools, Windows SDK e WebView2 Runtime.
- `npm install`, `npm run dev`, `npm run build`, `npm test`.
- `npm run tauri:dev` inicia o aplicativo; `npm run tauri:build` gera os artefatos Windows.

No catálogo, informe o endpoint permitido, o ID do modelo e a credencial. Salvar não valida o acesso. **Testar conexão** envia uma solicitação real e pode gerar cobrança. As chaves compatíveis ficam no Gerenciador de Credenciais do Windows. Vertex AI, autenticação AWS IAM/SigV4 e listagem automática de modelos não estão implementados.

## Capturas de tela

Não há capturas verificadas desta revisão. Para capturá-las, consulte [docs/TESTING.md](docs/TESTING.md) e registre as telas do aplicativo, catálogo, ilha e modo livre depois de executar o build atualizado. Não use imagens conceituais como evidência de execução.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md) · [Segurança](docs/SECURITY.md) · [Privacidade](docs/PRIVACY.md)
- [Provedores](docs/AI-PROVIDERS.md) · [Desenvolvimento](docs/DEVELOPMENT.md) · [Testes](docs/TESTING.md)
- [Assets](docs/ASSET-GUIDE.md) · [Áudio](docs/AUDIO-ASSETS.md) · [Status](docs/IMPLEMENTATION-STATUS.md) · [Continuação](docs/CONTINUATION.md)

## Licenças

O código original está sob MIT. Essa licença não concede direitos sobre a marca ou arquivos oficiais do mascote. Consulte [LICENSE-ASSETS.md](LICENSE-ASSETS.md) e [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Não distribua os assets privados.
