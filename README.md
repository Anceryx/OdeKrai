# Odekrai

**Seu companheiro pessoal de IA para Windows.** Odekrai é um projeto local-first em estágio inicial, com código original sob MIT e assets oficiais separados.

> **Estado:** fundação da interface em desenvolvimento. O chat atual envia mensagens reais a uma API compatível com OpenAI Chat Completions; o Companion ainda é uma prévia visual. Consulte [docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md) antes de usar.

## Português

### O que funciona nesta base

- Hub em React e TypeScript com navegação entre visão geral, conversas, provedores, Companion e configurações.
- Shell Tauri 2 inicial e workflow Windows de CI com artefato NSIS configurados; o build Tauri ainda não foi comprovado.
- Preferências de interface salvas localmente no navegador do aplicativo.
- Chat real com endpoint compatível com OpenAI Chat Completions, usando URL e modelo configuráveis.
- A chave é mantida somente em memória nesta versão e apagada ao fechar a aplicação.
- Interface escura responsiva, opção de movimento reduzido e placeholder geométrico original.

### Desenvolvimento

Requisitos: Node.js 20.19+ ou 22.12+, npm e, para o aplicativo desktop, Rust estável e os pré-requisitos de compilação do Tauri 2 para Windows.

```powershell
npm install
npm run dev
```

Para compilar a interface: `npm run build`. A configuração desktop está em `src-tauri/`; `npm run tauri:dev` inicia o shell e `npm run tauri:build` gera o pacote quando os pré-requisitos Windows estiverem disponíveis. O shell ainda não foi validado nesta sessão.

Na tela **Provedores de IA**, configure o nome, a URL base, o modelo e uma chave para uma API compatível. O envio direto do WebView ao serviço depende de CORS habilitado pelo provedor. As mensagens e a chave deixam o dispositivo ao usar o provedor; confira os termos e custos dele.

### Documentação

- [Arquitetura](docs/ARCHITECTURE.md) · [Segurança](docs/SECURITY.md) · [Privacidade](docs/PRIVACY.md)
- [Provedores de IA](docs/AI-PROVIDERS.md) · [Desenvolvimento](docs/DEVELOPMENT.md) · [Testes](docs/TESTING.md)
- [Guia de assets](docs/ASSET-GUIDE.md) · [Roadmap](docs/ROADMAP.md) · [Distribuição](docs/RELEASE.md)
- [Status de implementação](docs/IMPLEMENTATION-STATUS.md)

### Licenças

O código original é disponibilizado sob MIT; isso não licencia o nome, a marca ou futuras artes oficiais. Consulte [LICENSE-ASSETS.md](LICENSE-ASSETS.md) e [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). As artes definitivas devem ser fornecidas pelo proprietário.

## English

Odekrai is an early-stage, local-first personal AI companion for Windows. The current foundation includes a React and TypeScript hub, an initial Tauri 2 shell, locally persisted non-secret preferences, and a real chat request flow for OpenAI Chat Completions-compatible APIs. API keys stay in memory only and are cleared when the app closes. The desktop shell, secure OS credential storage, mascot runtime, and Windows installer are not validated yet.

Run `npm install` and `npm run dev` to start the UI. See the linked documentation for architecture, security, privacy, development, testing, assets, and the implementation status. Original code is MIT-licensed; official Odekrai art and branding are reserved and are not granted by that license.
