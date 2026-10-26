# Integração com Discord: pesquisa

Pesquisa consultada em 26/10/2026. Este arquivo registra fontes e requisitos; não descreve uma integração bot implementada.

## Regras e acesso

- Discord proíbe automatizar contas de usuário comuns (self-bots). A autenticação de automação deve usar o token de um bot criado pelo próprio usuário ou um webhook. O conector previsto nesta pesquisa usa somente bot próprio; a integração existente por webhook permanece separada. [Política de contas automatizadas](https://support.discord.com/hc/pt-br/articles/115002192352-Contas-de-Usu%C3%A1rio-Automatizadas-Self-Bots) e [documentação OAuth2/bot](https://discord.com/developers/docs/topics/oauth2).
- Para canais de servidor, `VIEW_CHANNEL` permite visualizar canais, `READ_MESSAGE_HISTORY` é necessário para ler mensagens anteriores e `SEND_MESSAGES` autoriza publicar. O bot também precisa que as permissões efetivas do canal permitam a ação. A rota de histórico retorna no máximo 100 mensagens por chamada. [Permissões](https://discord.com/developers/docs/topics/permissions) e [Get Channel Messages / Create Message](https://discord.com/developers/docs/resources/message).
- `MESSAGE_CONTENT` é uma intent privilegiada que controla acesso ao conteúdo textual em APIs/eventos. Deve ser ativada no Developer Portal; apps que precisam de verificação também dependem da aprovação do Discord. Não solicitar `GUILD_MEMBERS` ou `GUILD_PRESENCES` para este escopo. [Gateway Intents](https://discord.com/developers/docs/events/gateway#gateway-intents).
- Limites HTTP variam por rota e são sujeitos a alteração. O cliente deve interpretar cabeçalhos de rate limit e respostas `429`, sem fixar quotas globais no código. [Rate Limits](https://discord.com/developers/docs/topics/rate-limits).
- Para impedir menções, enviar `allowed_mentions: { "parse": [] }`. [Allowed Mentions](https://discord.com/developers/docs/resources/message#allowed-mentions-object).

## Servidores MCP existentes

Não localizei uma implementação MCP oficial publicada pelo Discord; a existência de uma integração oficial fica `unverified` nesta pesquisa.

| Repositório                                                             | Mantenedor e licença declarados | Atividade visível                                                                    | Escopo observado                                                                                                | Avaliação para o OdeKrai                                                                                               |
| ----------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [tristan-kkim/discord-mcp](https://github.com/tristan-kkim/discord-mcp) | Conta `tristan-kkim`; MIT       | 27 commits na página consultada; data/hash do commit mais recente `unverified`       | Token de bot; stdio e Streamable HTTP; cerca de 31 ferramentas, incluindo gerenciamento de servidor e mensagens | Excede o escopo restrito; código executável de terceiros exigiria revisão e ficaria fora do motor de permissões nativo |
| [cappyeo/discord-mcp](https://github.com/cappyeo/discord-mcp)           | Conta `cappyeo`; Apache-2.0     | 587 commits e atividade apresentada pelo GitHub; data/hash mais recente `unverified` | Bot próprio; centenas de ferramentas para mensagens, canais, cargos, moderação e administração                  | Superfície muito maior que listar canais, ler histórico e enviar mensagens; não adotar diretamente                     |

Mantenedor, licença e funcionalidades acima refletem informações publicadas pelos próprios repositórios; não constituem auditoria de segurança nem prova de compatibilidade. `unverified` indica que a informação não pôde ser confirmada nas páginas consultadas.

## Roteiro oficial para criar e adicionar o bot

1. Acesse o [Discord Developer Portal](https://discord.com/developers/applications) e crie uma aplicação própria.
2. Na seção **Bot**, crie/abra o bot e gere o token. Trate-o como senha; não o envie ao chat, não o coloque em arquivos versionados e não o forneça a servidores MCP de terceiros.
3. Em **Bot → Privileged Gateway Intents**, ative **Message Content Intent**. Não habilite intents privilegiadas não necessárias.
4. Em **OAuth2 → URL Generator**, selecione apenas o escopo `bot` e as permissões necessárias para ver canais, ler histórico e enviar mensagens. Não selecione `Administrator`. Abra o link gerado e escolha o servidor onde você tem permissão para adicionar aplicações.

Consulte o guia oficial [OAuth2 e bot authorization](https://discord.com/developers/docs/topics/oauth2#bot-authorization-flow) e [permissões](https://discord.com/developers/docs/topics/permissions). A instalação é autorizada pelo administrador do servidor; o bot não pode entrar por convite comum de usuário.
