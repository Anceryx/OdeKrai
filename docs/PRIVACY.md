# Privacidade

Preferências de aparência, Companion e configuração não secreta do provedor são salvas no armazenamento local do WebView. Credenciais suportadas são guardadas pelo processo Tauri no Gerenciador de Credenciais do Windows e não entram em `localStorage`.

Ao conversar ou testar conexão, o texto da conversa é enviado ao provedor selecionado. O aplicativo não mantém histórico de conversas após encerrar a sessão. A política de retenção e uso do conteúdo depende do provedor e da conta do usuário. Não envie dados que não deseja compartilhar com esse serviço.

A integração de credenciais depende do aplicativo nativo Windows. A prévia web não encaminha chamadas de IA.
