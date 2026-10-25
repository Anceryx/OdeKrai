# Registro de alterações

## Não lançado

### Conectores

- A tela de conectores ganhou filtros por provedores conectados, planos gratuitos confirmados e catálogo completo, com busca e detalhes em painel sobreposto.
- Credenciais conectadas mostram os estados salva, testada e ativa, com controles para ativar, definir o provedor principal e remover a credencial.
- O fluxo orienta a criação da conta, geração da chave, carregamento de modelos e teste da conexão. O endereço da API fica em Avançado.
- Groq, Gemini, Mistral, Cerebras e OpenRouter têm selo de plano gratuito confirmado e link para limites oficiais. No OpenRouter, o selo se refere a modelos `:free`.
- Cerebras foi adicionado ao catálogo com Chat Completions compatível com OpenAI e carregamento de modelos.

### Conversas

- A área de Conversas agora tem lista pesquisável com título, data, prévia e opções de renomear/apagar; o cabeçalho da conversa permite editar o título e mostra o modelo ativo.
- Mensagens do usuário ficam à direita e respostas à esquerda, com avatares, horário e opção de usar o mascote como avatar do OdeKrai. Respostas mostram Markdown básico sem interpretar HTML bruto.
- O campo cresce com o texto; Enter envia e Shift+Enter cria uma nova linha. A resposta em andamento pode ser parada ou tentada novamente após erro.

### Dados e privacidade

- A exclusão de todo o histórico fica em Configurações → Dados e privacidade e exige duas etapas de confirmação.

### Janela e preferências

- O tamanho inicial da janela considera o fator de escala e a área útil do monitor, incluindo a barra de tarefas.
- Ao fechar a janela, a preferência padrão encerra o aplicativo; a opção alternativa minimiza para a bandeja com ações para abrir e sair.
- As configurações agora estão organizadas em Geral, Janela, Aparência e Dados e privacidade.

### Tipografia

- Unificada a fonte sans-serif em Inter Variable, empacotada localmente sob a licença OFL 1.1; trechos de código mantêm fonte monoespaçada do sistema.

### Personagens Kenney em alta resolução

- Substituídos os previews 64×64 por renderizações transparentes 512×512 dos 12 modelos Kenney CC0; agora também há imagem para `character-female-a`.
- Adicionado script de desenvolvimento para regenerar as imagens a partir dos GLBs externos, sem incluir os modelos-fonte no repositório.
- A tela Assistente do OdeKrai identifica a seção como “Escolha seu mascote”; o mascote da área de trabalho passou a ocupar até 160 px na escala-base.
- Seleções SQLite que não existem mais no catálogo são migradas para `character-female-a`.

### UI-3

- Adicionados sprites 2D CC0 do pacote Kenney, seleção persistida no SQLite, fallback para a imagem ausente e animações CSS ligadas aos estados do assistente.
- O pet escolhido aparece na Visão geral, nas respostas do chat e nas janelas auxiliares. O renderer 3D legado foi removido do aplicativo.
- Validação visual nativa do Windows permanece pendente.

### UI-2

- Centralizados os tokens visuais e adicionados componentes compartilhados para controles e cabeçalhos; a seleção usa o acento laranja e a interface respeita movimento reduzido.
- Padronizadas as telas principais, os controles da barra de conversas e o espaço reservado para o pet na Visão geral.
- Revisados textos visíveis para remover “COMPANION”, substituir “Ilha” por “Pet” e explicar permissões e identidade em linguagem direta.
- Ícones Iconly aguardam os SVGs e a licença exportados para `assets-src/iconly/`.

### UI-1

- Ajustadas as dimensões iniciais e mínimas da janela principal; teste Rust protege a configuração.
- Janelas auxiliares de ilha, mascote e aprovação são criadas sob demanda e fechadas quando deixam de ser necessárias.
- Endpoints salvos em domínio de outro provedor são restaurados ao padrão e exibem aviso; o catálogo também permite restaurar endpoint e modelo.
- Removido o cartão de perfil duplicado no rodapé da barra lateral; o caminho superior abre o Perfil, identificado no breadcrumb.
- Conversas anteriores exibem título e data do SQLite e permanecem selecionáveis.
- A primeira execução permite escolher uma pasta pelo diálogo nativo; idioma e tom usam opções estruturadas com tom personalizado.
- O aplicativo mantém a rolagem principal na área de conteúdo, com barra lateral e rodapé estáveis.

### Revisão de fechamento da Fase 3.1

- Bloqueadas operações simuladas sobre `ODEKRAI.md`, `logs/`, configurações, bancos locais e conteúdo reconhecido como segredo.
- Movida a confirmação `MessageBoxW` para o executor de operações bloqueantes do Tauri; comandos de modo e override agora aguardam assincronamente.
- Adicionados verificadores de release para assets privados e para o comando de disparo manual exclusivo de debug; `tauri:build` interrompe se detectar assets proprietários.
- Adicionada matriz de rastreabilidade das Fases 2.1 e 3, com pendências de teste e validação nativa.

### Fase 3

- Adicionados motor de políticas em Rust, modos persistidos em SQLite, exceções por ferramenta com confirmação nativa e tabela modo × risco.
- Adicionadas janela de aprovação de uso único, fila limitada e expiração configurável; parâmetros são vinculados por hash SHA-256 e só a janela `approval` pode responder.
- Adicionados log JSONL diário encadeado, viewer/exportação, verificação da cadeia, atalho global e kill switch com cancelamento de streams.
- Adicionadas ferramentas simuladas de workspace com backup reversível e lixeira; mensagens nunca são enviadas e pagamentos são bloqueados.
- A validação visual e nativa de janelas, atalho, DPI e foco em Windows permanece pendente.

### Fase 2

- Adicionadas pasta pessoal, identidade aprovada por hash, memória manual editável e prompt composto no Rust.
- Adicionada exclusão de conversas e de todo o histórico; corrigida a formatação global e atualizada a documentação de privacidade.

- Adicionadas janelas Tauri separadas para a ilha e o marcador geométrico temporário.
- Adicionados estados do Companion conectados ao ciclo real de solicitação do chat.
- Adicionados controles e persistência de posição, tamanho, prioridade, modo livre e efeitos sonoros.
- Adicionado motor de áudio com cache, volume, mute, substituição local e fallback silencioso. Nenhum arquivo de som foi incluído.
- A validação visual e nativa completa em Windows continua pendente.

### Fase 1

- Corrigido o cabeçalho de autenticação da Anthropic para `x-api-key` e adicionada verificação de cabeçalhos por provedor com servidor simulado.
- Persistido o ID do provedor com migração das preferências antigas.
- Adicionados plugin de instância única, CSP de produção restrita, capabilities por janela e validação do chamador para comandos de janela.
- Adicionados histórico local de conversas em SQLite e streaming com cancelamento para Anthropic e adaptadores Chat Completions.
- Revisada a documentação de status, testes, arquitetura, privacidade e segurança.
