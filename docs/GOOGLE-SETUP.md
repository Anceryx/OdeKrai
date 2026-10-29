# Configuração OAuth Google no Cloud

Este guia configura um cliente OAuth de aplicativo desktop para o módulo reutilizável do OdeKrai. O módulo não escolhe escopos: cada integração consumidora deve fornecer somente os escopos de que precisa. Esta fase não ativa Calendar, Gmail ou Planilhas.

## Criar o cliente

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2. Crie ou selecione um projeto dedicado ao aplicativo.
3. Abra **Google Auth Platform** e configure nome do app, email de suporte e público-alvo. Para testes, adicione as contas permitidas como usuários de teste quando o tipo de público exigir.
4. Em **Clientes**, crie um cliente OAuth do tipo **Aplicativo para computador**.
5. Copie o `client_id` para a tela Habilidades > Integrações do OdeKrai.
6. O `client_secret` é opcional. Clientes desktop são públicos e não conseguem manter um segredo confidencial; não o trate como barreira de segurança. Se fornecido, o OdeKrai o mantém junto aos dados OAuth no Gerenciador de Credenciais do Windows.
7. Habilite no projeto somente a API Google usada pela integração que fornecer os escopos. Não habilite APIs nesta fase.

O Google exibe a autorização no navegador padrão. O OdeKrai abre um listener HTTP restrito a `127.0.0.1`, em porta aleatória, de uso único e com prazo de expiração. O listener valida `state`; o código é trocado com PKCE S256. O refresh token e os dados da conexão ficam no Gerenciador de Credenciais do Windows. O access token permanece em memória.

## Consentimento e verificação

Em **Google Auth Platform > Público-alvo**, escolha o tipo de usuário apropriado. Aplicativos externos em modo de teste só permitem as contas de teste configuradas e podem ter limites de usuários/duração de autorização. Escopos sensíveis ou restritos podem exigir verificação do Google antes de distribuição pública. Consulte os requisitos atuais do Google antes de disponibilizar a integração a terceiros.

## Desconectar

Use **Desconectar** na integração do OdeKrai para solicitar a revogação do refresh token no endpoint oficial e apagar os dados locais após a confirmação. Se o Google já tiver revogado o token, conecte novamente para restaurar o acesso.

## Referências oficiais

- [OAuth 2.0 para aplicativos desktop](https://developers.google.com/identity/protocols/oauth2/native-app): cliente público, PKCE, navegador do sistema, callback loopback, endpoint de autorização e troca de código.
- [Referência OpenID Connect do Google](https://developers.google.com/identity/openid-connect/reference): endpoint de revogação `https://oauth2.googleapis.com/revoke` e formato da solicitação.
- [Políticas OAuth do Google](https://developers.google.com/identity/protocols/oauth2/policies): requisitos de uso e verificação.

Os endereços e comportamentos foram conferidos nessas páginas em 29/10/2026. O uso de uma conta Google real e a configuração do projeto Cloud permanecem pendentes.
