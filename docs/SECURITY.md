# Segurança

- Chaves de provedor são salvas pelo backend Tauri via `keyring` no Gerenciador de Credenciais do Windows. O frontend mantém o texto digitado apenas durante a configuração e não recupera segredos já salvos.
- O chat chama comandos Tauri; não envia chaves diretamente do WebView. Preview web não oferece conexão com provedores.
- O backend limita provedores conhecidos, HTTPS, hosts por provedor, URLs sem credenciais/parâmetros, redirecionamentos, tamanho de mensagens e tempo de resposta. Erros de transporte não incluem conteúdo da chave.
- O envio de prompts é uma ação real ao provedor selecionado e pode gerar custos. Confira permissões, preços e retenção do fornecedor.
- Vertex ADC/OAuth e AWS IAM/SigV4 não estão disponíveis. Bedrock aceita apenas o fluxo de chave de API compatível descrito pela AWS.
- O `keyring` ainda precisa ser validado com execução Windows atualizada; teste unitário não comprova persistência real no Credential Manager.
- A CSP de produção não permite conexão de rede pelo WebView além do IPC local; chamadas HTTPS aos provedores ocorrem no Rust. Capabilities separadas restringem as janelas auxiliares a eventos, e comandos de janela, provedores e histórico verificam o rótulo da janela chamadora no Rust.
- O histórico SQLite local contém mensagens em texto simples. Proteção de disco e backups dependem da configuração do Windows; não presumir criptografia pelo aplicativo.
