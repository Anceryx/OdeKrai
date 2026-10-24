# Privacidade

Preferências de aparência, Companion e configuração não secreta do provedor são salvas no armazenamento local do WebView. Credenciais suportadas são guardadas pelo processo Tauri no Gerenciador de Credenciais do Windows e não entram em `localStorage`.

Ao conversar ou testar conexão, o texto da conversa é enviado ao provedor selecionado. As mensagens do chat são salvas em SQLite na pasta de dados local do aplicativo para permitir retomar conversas. Esse arquivo não é criptografado pelo OdeKrai; a proteção em repouso depende do Windows e da configuração do dispositivo. A política de retenção e uso do conteúdo enviado depende do provedor e da conta do usuário. Não envie dados que não deseja compartilhar com esse serviço.

A integração de credenciais depende do aplicativo nativo Windows. A prévia web não encaminha chamadas de IA.
