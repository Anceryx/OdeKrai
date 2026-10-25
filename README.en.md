# OdeKrai

A personal AI assistant for Windows, built with React, TypeScript, and Tauri 2. The application is named **OdeKrai**. This project is under development: a frontend build and automated tests do not prove visual inspection or live provider validation.

## Implemented features

- App with overview, chat, a catalog of 16 providers, and assistant settings.
- Native Tauri windows for the floating island and free mascot mode.
- Local preferences without API keys.
- Credential storage through Windows Credential Manager and message requests through the Rust process.
- A Rust permission engine with native, one-time approvals, chained local audit logs, and a global kill switch. Only simulated tools are available in this phase.
- Adapters for 12 Chat Completions APIs, Anthropic Messages, and Perplexity Agent API. Vertex AI remains a guide pending ADC/OAuth integration.
- Official 3D model is local and Git-ignored; checkouts without the asset use a fallback.

## Requirements and development

- Windows 10/11 x64, Node.js 20.19+ or 22.12+, stable Rust, MSVC Build Tools, Windows SDK, and WebView2 Runtime.
- `npm install`, `npm run dev`, `npm run build`, `npm test`.
- `npm run tauri:dev` starts the app; `npm run tauri:build` creates Windows artifacts.

In the catalog, enter an allowed endpoint, model ID, and credential. Saving does not validate access. **Test connection** sends a real request and may incur charges. Supported credentials are stored in Windows Credential Manager. Vertex AI, AWS IAM/SigV4 authentication, and automatic model listing are not implemented.

## Screenshots

No verified screenshots are available for this revision. See [docs/TESTING.md](docs/TESTING.md) for capture steps, then record the app, provider catalog, island, and free-mode windows after running the updated build. Do not present concept images as runtime evidence.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) · [Security](docs/SECURITY.md) · [Privacy](docs/PRIVACY.md)
- [AI providers](docs/AI-PROVIDERS.md) · [Development](docs/DEVELOPMENT.md) · [Testing](docs/TESTING.md)
- [Assets](docs/ASSET-GUIDE.md) · [Audio](docs/AUDIO-ASSETS.md) · [Implementation status](docs/IMPLEMENTATION-STATUS.md) · [Continuation](docs/CONTINUATION.md)

## Licensing

Original code is MIT licensed. This license does not grant rights to the brand or official mascot files. See [LICENSE-ASSETS.md](LICENSE-ASSETS.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Do not distribute private assets.
