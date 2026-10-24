# Arquitetura

## Estado atual

A interface é uma SPA React + TypeScript construída com Vite. `src/core/` mantém lógica independente da apresentação; `src/ui/` contém componentes e estilos. `settings.ts` valida preferências e persiste apenas dados não secretos no armazenamento local do WebView. `chat.ts` faz uma requisição HTTP real para um endpoint OpenAI Chat Completions compatível.

## Direção planejada

O aplicativo desktop usará Tauri 2 e Rust para recursos Windows, acesso ao gerenciador de credenciais, janelas e bandeja. SQLite versionado será a persistência estruturada local. A interface não deve acessar filesystem, processos ou segredos diretamente. Comandos nativos devem ser pequenos, validados e expostos por permissões explícitas.

O Companion e o Hub devem compartilhar contratos de configurações e eventos, mantendo o renderizador do mascote isolado da navegação do Hub. O carregador de assets usará manifesto validado, formatos autorizados e caminhos confinados à pasta gerenciada.

## Referência Coucou

Foram estudadas a documentação e as decisões públicas da implementação Windows em `Louis-CFM/coucou/windows/`: janela superior sem moldura para a ilha, separação frontend/Tauri-Rust, tray e integração nativa específica por plataforma. O Odekrai não reutiliza código ou assets dessa referência nesta etapa. A identidade visual e o modelo de produto permanecem próprios.
