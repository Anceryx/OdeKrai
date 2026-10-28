![Banner do OdeKrai](banner.png)

[PortuguÃªs (Brasil)](README.md) Â· [English](README.en.md)

**Um assistente de IA para o seu Windows, com um mascote que fica ao seu lado.**

O OdeKrai conversa com o provedor de IA que vocÃª configurar e pode executar habilidades no computador dentro das permissÃµes definidas por vocÃª. A interface reÃºne conversas, configuraÃ§Ãµes e um mascote que acompanha o uso do aplicativo.

> Projeto em prÃ©-lanÃ§amento (versÃ£o 0.14.0), para Windows.

## Destaques

- **Escolha a sua IA:** provedores de nuvem, opÃ§Ãµes com plano gratuito sinalizado e conexÃ£o com servidor local compatÃ­vel.
- **Um mascote com nome:** 12 personagens com animaÃ§Ãµes e modos Ilha e Livre.
- **Habilidades locais:** o agente pode executar aÃ§Ãµes registradas no aplicativo, sujeitas Ã s permissÃµes do Rust.
- **Agenda local:** organize eventos por dia e mÃªs, configure recorrÃªncias e importe ou exporte arquivos `.ics`.
- **VocÃª no controle:** modos de permissÃ£o, aprovaÃ§Ãµes, registro de atividade e kill switch.
- **ConfiguraÃ§Ãµes locais:** credenciais de provedores sÃ£o armazenadas pelo Rust no Gerenciador de Credenciais do Windows.

## O que o OdeKrai faz

### Conversas e provedores

O catÃ¡logo inclui OpenAI, Anthropic, Google Gemini, xAI, Mistral, Cohere, Groq, DeepSeek, Perplexity, Cerebras, Together AI, OpenRouter, Fireworks AI, Azure OpenAI e AWS Bedrock. Vertex AI aparece como guia de integraÃ§Ã£o, sem autenticaÃ§Ã£o integrada. A conexÃ£o local Ã© compatÃ­vel com servidores como Ollama e llama.cpp jÃ¡ iniciados.

O catÃ¡logo sinaliza opÃ§Ãµes gratuitas para Google Gemini, Mistral, Groq, Cerebras e OpenRouter; disponibilidade e limites dependem do provedor, modelo e conta. Ã‰ possÃ­vel configurar um provedor principal e reservas. O failover Ã© limitado a falhas transitÃ³rias antes de haver saÃ­da observada; chamadas de ferramentas nÃ£o sÃ£o repetidas pelo failover.

As conversas sÃ£o mantidas no histÃ³rico SQLite local. Para responder, o conteÃºdo enviado Ã© encaminhado ao provedor configurado. O aplicativo tambÃ©m oferece respostas em streaming quando suportadas pelo adaptador, busca no histÃ³rico e abertura de links externos com confirmaÃ§Ã£o por domÃ­nio.

### Agente e habilidades

Ative o modo agente em uma conversa para permitir que o modelo solicite habilidades registradas no Rust. As habilidades disponÃ­veis incluem operaÃ§Ãµes de leitura e organizaÃ§Ã£o de arquivos em pastas permitidas; criaÃ§Ã£o, consulta, ediÃ§Ã£o e remoÃ§Ã£o aprovada de eventos na Agenda local ou criaÃ§Ã£o em um arquivo `.ics` escolhido; criaÃ§Ã£o de arquivos Markdown, texto e CSV; abertura de links, arquivos e configuraÃ§Ãµes do Windows; notificaÃ§Ãµes, Ã¡rea de transferÃªncia, informaÃ§Ãµes do sistema, volume e controles de mÃ­dia; rascunhos de e-mail; envio aprovado por webhook do Discord; leitura de pÃ¡ginas web; e delegaÃ§Ã£o de cÃ³digo ao Codex CLI ou Claude Code.

As habilidades comeÃ§am desativadas e podem ser habilitadas na tela Habilidades. Os resultados de conteÃºdo externo sÃ£o tratados como nÃ£o confiÃ¡veis, e aÃ§Ãµes com efeitos colaterais podem exigir aprovaÃ§Ã£o conforme a polÃ­tica aplicada pelo Rust.

### PermissÃµes e seguranÃ§a

- **Aprovar por mim**, **Sempre perguntar** e **Controle total** sÃ£o os modos disponÃ­veis; bloqueios fixos continuam valendo em todos eles.
- AprovaÃ§Ãµes sÃ£o apresentadas em janela prÃ³pria. O atalho global configurado aciona o kill switch, que interrompe execuÃ§Ãµes e bloqueia novas aÃ§Ãµes atÃ© ser retomado.
- O registro de auditoria local encadeia entradas e bloqueia aÃ§Ãµes se uma gravaÃ§Ã£o ou verificaÃ§Ã£o falhar.
- O Rust valida habilidades, riscos, caminhos e permissÃµes. O WebView apresenta o estado e encaminha decisÃµes do usuÃ¡rio.

### Identidade, mascote e sons

O aplicativo oferece uma pasta pessoal, identidade `ODEKRAI.md` aprovada pelo usuÃ¡rio, notas de memÃ³ria editÃ¡veis e perfil local. O mascote tem 12 personagens e animaÃ§Ãµes associadas aos estados do aplicativo. Pode aparecer nos modos Ilha e Livre, com posiÃ§Ã£o persistida. HÃ¡ sons de interface configurÃ¡veis e opÃ§Ã£o para minimizar para a bandeja ao fechar a janela.

### Privacidade

Credenciais de provedores sÃ£o guardadas pelo backend Rust no Gerenciador de Credenciais do Windows. O histÃ³rico, perfil e preferÃªncias usam armazenamento local; isso nÃ£o significa que o banco local ou backups sejam criptografados. O conteÃºdo enviado em uma conversa vai ao provedor escolhido. Os logs de diagnÃ³stico nÃ£o incluem o conteÃºdo das conversas.

## InstalaÃ§Ã£o e desenvolvimento

O projeto estÃ¡ em prÃ©-lanÃ§amento. O bundle Windows configurado Ã© NSIS. Para desenvolvimento, sÃ£o necessÃ¡rios Windows, Node.js 22.12 ou superior, Rust e as ferramentas C++ da Microsoft, Windows SDK e WebView2 Runtime.

```powershell
npm ci
npm run tauri:dev
```

## Capturas de tela

As capturas ficam em `docs/screenshots/`.

## LicenÃ§as e crÃ©ditos

Consulte [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) e [LICENSE-ASSETS.md](LICENSE-ASSETS.md) para os termos do cÃ³digo, dependÃªncias e assets. NÃ£o distribua assets privados do proprietÃ¡rio.

