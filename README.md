![Banner do OdeKrai](banner.png)

[Português (Brasil)](README.md) · [English](README.en.md)

**Um assistente de IA para o seu Windows, com um mascote que fica ao seu lado e faz coisas por você.**

O OdeKrai conversa com a IA que você escolher, lembra do seu jeito de falar e, quando você permite, age no seu computador: organiza arquivos, abre sites e programas, cria eventos e documentos, mexe no volume e muito mais. Você decide o quanto ele pode fazer sozinho, e tudo fica registrado.

> Projeto em pré-lançamento (versão 0.14.0). Windows 10 e 11.

## Destaques

- **Escolha a sua IA:** 17 provedores, incluindo opções com plano gratuito e IA local rodando no seu computador.
- **Um mascote com nome:** 12 personagens animados, na área de trabalho como ilha ou solto na tela.
- **Agente que faz:** pede, e o OdeKrai executa habilidades no seu computador, sempre dentro das regras que você definiu.
- **Três modos de permissão:** aprovar por mim, sempre perguntar ou controle total.
- **Você no controle:** janela de aprovação, registro de tudo que foi feito e botão de parada de emergência.
- **Privado por padrão:** chaves no Gerenciador de Credenciais do Windows e conversas no seu computador.
- **Tudo em português**, com interface escura e leve.

## O que o OdeKrai faz

### Conversa com a IA que você escolher
- **17 provedores:** OpenAI, Anthropic, Google Gemini, xAI, Mistral, Cohere, Groq, DeepSeek, Perplexity, Together AI, Cerebras, OpenRouter, Fireworks AI, Azure OpenAI, AWS Bedrock, Vertex AI (guia de integração) e **IA local**.
- **Planos gratuitos** sinalizados (Groq, Google Gemini, Mistral, Cerebras e OpenRouter), com o passo a passo de cada provedor.
- **IA local:** conecta a servidores como Ollama e llama.cpp, mostra o que o seu computador aguenta e oferece modelos Qwen para baixar com a sua autorização.
- **Provedor principal e reservas:** se o principal falhar por problema temporário, o OdeKrai usa o próximo da lista.
- **Controle de uso:** limite diário de tokens e painel de consumo por provedor.
- **Respostas em tempo real**, histórico local com busca, links abertos com segurança e texto formatado.

### Agente: o OdeKrai age no seu computador
Ligue o **Modo agente** na conversa e peça em linguagem natural. As habilidades disponíveis:

| Área | O que ele faz |
|---|---|
| **Arquivos e pastas** | listar, pesquisar, ler, criar, editar, copiar, mover, renomear, organizar pastas em lote e apagar com segurança (Lixeira), guardando versões anteriores |
| **Abrir e sistema** | abrir sites (com confirmação por domínio), pastas e arquivos, iniciar programas que você cadastrar, abrir configurações do Windows, copiar texto, mostrar notificações, informar dados do sistema, controlar volume e mídia |
| **Calendário, documentos e planilhas** | criar eventos de calendário (arquivo `.ics` aberto no seu calendário), documentos em Markdown e texto, planilhas CSV |
| **Comunicação** | preparar rascunhos de e-mail no seu programa de e-mail; enviar mensagens ao Discord por webhook, com aprovação |
| **Web** | ler páginas da internet com proteção contra conteúdo malicioso |
| **Código** | delegar tarefas ao Codex CLI ou ao Claude Code em uma área isolada, com revisão das mudanças antes de aplicar |

O OdeKrai só age nas **pastas que você liberar** e pode ter cada habilidade ligada ou desligada na tela **Habilidades**.

### Você decide o quanto ele faz sozinho
- **Aprovar por mim:** o que é seguro roda sozinho; o que é arriscado pede a sua aprovação.
- **Sempre perguntar:** toda ação com efeito pede aprovação numa janela própria, mostrando exatamente o que será feito.
- **Controle total:** ele executa sem perguntar, mas respeitando bloqueios que nenhum modo desliga.
- Pedidos vindos de conteúdo externo (uma página, um arquivo baixado) **sempre pedem aprovação**.

### Segurança
- **Parada de emergência** por atalho global.
- **Registro de atividade** encadeado, que detecta adulteração.
- **Bloqueios fixos:** pastas do sistema, dados de navegadores e senhas, pagamentos e dados do próprio OdeKrai.
- **Modo seguro** na inicialização após uma interrupção.
- Política de segurança do aplicativo restrita e permissões mínimas por janela.

### Identidade e memória
- Uma pasta pessoal só sua, com o arquivo `ODEKRAI.md` que define como ele se comporta, e que só muda com a sua aprovação.
- Notas de memória que você pode ver, editar e apagar.
- Perfil com nome, apelido e foto (a foto nunca é enviada à IA).

### Mascotes e pet
- **12 mascotes com nome** (Nina, Mel, Clara, Alice, Vera, Bia, Theo, Beto, Guto, Davi, Caio e Leo), com animações para cada estado: parado, pensando, trabalhando, aguardando aprovação, sucesso e erro.
- **Ilha** junto à borda da tela ou **Livre**, para arrastar para onde quiser, com a posição lembrada.
- Sons de interface e ícone na bandeja do Windows, com opção de continuar rodando ao fechar a janela.

### Privacidade
- As **chaves de API** ficam no Gerenciador de Credenciais do Windows, nunca em arquivos.
- Conversas, perfil e preferências ficam **no seu computador**.
- O conteúdo da conversa só vai ao provedor que você configurou.
- Registro de diagnóstico sem conteúdo de conversas e sem segredos.

## Em breve
Lembretes e agenda própria, planilhas Excel, memória gerenciada pelo agente, integração com Google (Agenda, Gmail e Planilhas), conectores MCP e uma biblioteca de extensões, comandos de voz, análise de imagens, Discord pelo aplicativo e uma ilha ainda mais completa.

## Instalação
O OdeKrai está em pré-lançamento e ainda não tem instalador assinado.
- **Versões de teste:** o workflow **Build Windows**, no GitHub Actions, gera o executável.
- **Notas de cada versão:** `docs/releases/` e o `CHANGELOG.md` (tags de `v0.1.0` a `v0.14.0`).
- **Desenvolvimento:** Node.js 22.12 ou superior, Rust e as ferramentas de build C++ da Microsoft. Veja `docs/DEVELOPMENT.md`.

```powershell
npm ci
npm run tauri:dev
```

## Capturas de tela
As capturas ficam em `docs/screenshots/`.

## Licenças e créditos
Código sob a licença do arquivo `LICENSE`. Mascotes e sons: pacotes CC0 da Kenney. Ícones: Phosphor Icons (MIT). Fonte: Inter. Veja `THIRD_PARTY_NOTICES.md` e `LICENSE-ASSETS.md`.
