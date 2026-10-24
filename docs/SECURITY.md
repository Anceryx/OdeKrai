# Segurança

- Chaves de provedor são salvas pelo backend Tauri via `keyring` no Gerenciador de Credenciais do Windows. O frontend mantém o texto digitado apenas durante a configuração e não recupera segredos já salvos.
- O chat chama comandos Tauri; não envia chaves diretamente do WebView. Preview web não oferece conexão com provedores.
- O backend limita provedores conhecidos, HTTPS, hosts por provedor, URLs sem credenciais/parâmetros, redirecionamentos, tamanho de mensagens e tempo de resposta. Erros de transporte não incluem conteúdo da chave.
- Endpoint e caminho são validados no Rust para o provedor selecionado antes de guardar ou enviar a credencial. O catálogo documenta quais provedores oferecem uma lista de modelos sem geração. Respostas de erro expostas ao usuário são mapeadas por status; corpo bruto do provedor não é exibido nem registrado.
- O avatar é decodificado no Rust apenas após validar PNG/JPEG/WebP por magic bytes, arquivo até 5 MiB e dimensões/pixels limitados; é centralizado, reduzido a 256 × 256 e reencodado em PNG para remover metadados. A CSP da janela principal permite `data:` em `img-src` para exibir o avatar processado.
- O envio de prompts é uma ação real ao provedor selecionado e pode gerar custos. Confira permissões, preços e retenção do fornecedor.
- Vertex ADC/OAuth e AWS IAM/SigV4 não estão disponíveis. Bedrock aceita apenas o fluxo de chave de API compatível descrito pela AWS.
- O `keyring` ainda precisa ser validado com execução Windows atualizada; teste unitário não comprova persistência real no Credential Manager.
- A CSP de produção não permite conexão de rede pelo WebView além do IPC local; chamadas HTTPS aos provedores ocorrem no Rust. Capabilities separadas restringem as janelas auxiliares a eventos, e comandos de janela, provedores e histórico verificam o rótulo da janela chamadora no Rust.
- O histórico SQLite local contém mensagens em texto simples. Proteção de disco e backups dependem da configuração do Windows; não presumir criptografia pelo aplicativo.
- `ODEKRAI.md` tem limite de 16 KiB, é salvo por ação explícita e só entra no prompt quando seu SHA-256 coincide com a versão aprovada. O Rust envia regras fixas primeiro e recusa mensagens `system` vindas do frontend.
- Arquivos de `memory/` têm limite de 8 KiB, nomes simples e edição manual. Até 1.024 caracteres de `estilo.md` entram no prompt. Não armazene segredos: identidade e memória são texto simples. O agente não tem comando para escrever em `ODEKRAI.md` ou `logs/`.
- A validação da pasta recusa UNC, raiz de unidade, pastas protegidas, `..`, nomes reservados e links/junctions. O OneDrive gera aviso. A resistência a trocas simultâneas de caminhos ainda requer avaliação nativa antes de futuras tools de escrita.

## Fase 3 — política, aprovação, auditoria e parada

- `src-tauri/src/policy.rs` é uma função pura com a matriz modo × risco × origem × workspace. O modo efetivo e exceções por ferramenta vêm de `permissions.sqlite3`; o modo descrito em `ODEKRAI.md` é informativo e não controla decisões.
- `src-tauri/src/security.rs` valida os parâmetros Rust tipados, calcula o risco a partir da ferramenta, rejeita campos desconhecidos, limita cada ferramenta a cinco execuções por minuto e bloqueia pagamentos, caminhos de segredos, conteúdo de arquivo com marcadores conhecidos, `ODEKRAI.md`, `logs/`, diretórios de configuração/banco e extensões locais de banco. Os bloqueios aplicam-se à leitura, gravação e remoção no workspace. As ferramentas disponíveis nesta fase são simuladas; não há envio de mensagens nem pagamentos.
- `workspace.read_file` só lê arquivos do workspace (limite 64 KiB). `workspace.write_file` limita arquivos a 1 MiB e guarda a versão anterior em `.history`. `workspace.delete_file` move para `.trash` e nunca apaga definitivamente. Caminhos absolutos, traversal, links/junctions, hard links, nomes reservados e pastas internas são recusados; cada execução volta a validar o destino.
- As decisões que pedem aprovação abrem a janela `approval`, com capability separada. Só essa janela responde; a fila é FIFO, exibe uma ação por vez, aceita até três pendentes, usa hash SHA-256 dos parâmetros, expira por padrão em 120 segundos (configurável entre 30 e 600) e aceita uma aprovação de uso único. Fechar a janela nega a ação atual.
- O modo global e exceções mais permissivas exigem confirmação em caixa nativa do Windows. `MessageBoxW` roda em executor de bloqueio (`spawn_blocking`); a chamada assíncrona aguarda o resultado sem ocupar a thread da UI. O atalho global padrão é `Ctrl+Shift+F12`; conflitos são reportados nas configurações. O kill switch persiste o estado parado, cancela requisições/streams registrados, nega aprovações pendentes e bloqueia novos envios ao provedor até retomada explícita.
- Cada decisão e resultado usa JSONL diário em `logs/`, com encadeamento SHA-256 e gravação confirmada antes da execução. Falha ao verificar ou gravar a auditoria bloqueia ações. O log não tem retenção automática nem controles de apagar na interface nesta fase.

### Ameaças e limites

- **Prompt injection e conteúdo externo:** a política mantém a origem como dado Rust; ações tainted com risco acima de leitura pedem aprovação em qualquer modo. Ainda não existe agent loop que atribua origem a conteúdo de provedores; ferramentas desta fase só podem ser disparadas manualmente pelo usuário em builds de desenvolvimento.
- **Falsificação de aprovação e alteração de parâmetros:** o comando de resposta valida o rótulo `approval`, o ID e o hash da ação pendente; o Rust recalcula o hash e revalida caminhos imediatamente antes da execução. A UI nunca fornece a decisão de risco.
- **XSS no WebView:** a janela de aprovação tem capability mínima, CSP local sem conexões remotas e mostra a prévia como texto puro React. Uma vulnerabilidade que execute código na própria janela de aprovação ainda poderia induzir um clique; nenhuma aprovação é transferida para a janela principal.
- **TOCTOU:** canonicalização, detecção de reparse point/hard link e validação imediatamente antes da operação reduzem trocas de destino. Um processo local com os mesmos privilégios ainda pode disputar alterações durante a operação; a implementação não usa handles de diretório imutáveis para toda a caminhada.
- **Adulteração de logs:** a cadeia detecta alterações e quebras acidentais. Ela não impede edição e não resiste a malware ou processo local capaz de reescrever os arquivos e recalcular os hashes; não é uma assinatura com chave protegida.
- **Flood de aprovações:** uma fila limitada a três e uma janela visível por vez; excedentes são negados e auditados.
- **Risco residual geral:** configurações SQLite e logs são arquivos locais. Um processo com os mesmos privilégios do usuário pode alterá-los. Este motor reduz erro/abuso do agente e injeção; não protege contra malware local.

Os comandos `npm run tauri:build` verificam os assets e a guarda `cfg(debug_assertions)` antes de
empacotar. Consulte [`TRACEABILITY.md`](TRACEABILITY.md) para requisito, implementação, teste e
status detalhados.
