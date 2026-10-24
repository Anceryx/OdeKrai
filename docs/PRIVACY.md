# Privacidade

Preferências de aparência, Companion e configuração não secreta do provedor são salvas no armazenamento local do WebView. Credenciais suportadas são guardadas pelo processo Tauri no Gerenciador de Credenciais do Windows e não entram em `localStorage`.

O perfil (nome e apelido) fica em `profile.sqlite3` dentro dos dados locais do aplicativo. O avatar é reprocessado pelo Rust e salvo como PNG quadrado de 256 × 256 na mesma pasta. Esses arquivos ficam em texto simples; o aplicativo não os criptografa. O avatar não é adicionado ao histórico nem enviado aos provedores; o nome e o apelido só saem do dispositivo se o usuário os inserir numa mensagem. A escolha de atualizar o nome em `ODEKRAI.md` exige ação e aprovação explícitas.

Ao conversar, o texto enviado pelo usuário é encaminhado ao provedor selecionado. O teste de conexão consulta somente a lista de modelos documentada, quando disponível; o ping opcional envia apenas “ping” com limite de uma saída e pode gerar cobrança. As mensagens do chat são salvas em SQLite na pasta de dados local do aplicativo para permitir retomar conversas. Esse arquivo não é criptografado pelo OdeKrai; a proteção em repouso depende do Windows e da configuração do dispositivo. A política de retenção e uso do conteúdo enviado depende do provedor e da conta do usuário. Não envie dados que não deseja compartilhar com esse serviço.

A integração de credenciais depende do aplicativo nativo Windows. A prévia web não encaminha chamadas de IA.

O histórico pode ser apagado por conversa ou por inteiro na interface. A exclusão total remove os registros SQLite e executa `VACUUM`; cópias de segurança e conteúdo já enviado ao provedor permanecem fora do alcance dessa exclusão.

Após configurar a pasta, `ODEKRAI.md`, `memory/` e a versão aprovada ficam em texto simples no dispositivo. O chat envia ao provedor as regras fixas, a identidade aprovada e até 1.024 caracteres de `memory/estilo.md`; as outras notas não entram automaticamente no prompt. Não coloque senhas, tokens ou dados bancários nesses arquivos. Uma pasta com aparência de OneDrive gera aviso de possível sincronização em nuvem.

As configurações do motor de permissões (modo efetivo, exceções por ferramenta, atalho do kill switch, prazo de aprovação e estado parado) ficam em `permissions.sqlite3` nos dados locais do aplicativo, sem criptografia feita pelo OdeKrai. Aprovações pendentes ficam apenas em memória e não sobrevivem ao encerramento do processo.

Quando a pasta do agente está configurada, a auditoria grava JSONL diário em `logs/`, também em texto simples. Ela inclui ferramenta, risco, modo, origem, regra, decisão, resultado, latência e resumo dos parâmetros. Para mensagens simuladas e gravações, registra tamanho, SHA-256 e um trecho inicial curto; marcadores conhecidos de segredos ocultam esse trecho. Nenhuma mensagem é enviada por essas ferramentas nesta fase. Os logs não são removidos automaticamente e a interface ainda não oferece exclusão; o usuário pode removê-los no Explorador com o aplicativo fechado, o que quebra a cadeia verificável.
