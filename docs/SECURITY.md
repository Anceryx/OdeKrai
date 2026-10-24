# Segurança

## Proteções atuais

- A chave de API não é gravada no `localStorage`; ela fica em memória e desaparece ao fechar a página/aplicativo.
- URLs e modelos são texto configurável; respostas HTTP e erros são tratados sem exibir stack trace.
- Não há backend remoto próprio, login obrigatório ou telemetria implementados.

## Limitações e próximos controles

- O chat envia chave e mensagens diretamente ao provedor escolhido. O provedor pode processar ou reter esses dados conforme seus termos.
- A chamada direta pelo WebView pode exigir CORS no provedor. Não contorne CORS com proxy público ou extensão insegura do navegador.
- O armazenamento nativo no Windows Credential Manager ainda não está integrado. Não habilite persistência de chave até essa integração ser concluída e validada.
- Ainda faltam CSP testada no WebView, validação robusta de URL, permissões Tauri mínimas, revisão de dependências e testes de segurança.

Não execute comandos do sistema nem operações de arquivo a partir de conteúdo retornado por um modelo. Toda ferramenta futura deve exigir escopo explícito, validação de argumentos, confirmação para ações destrutivas e registro sem conteúdo sensível.
