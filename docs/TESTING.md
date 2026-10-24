# Testes e validação

## Fase 4 — lacuna de cobertura

Os testes atuais não implementam nem validam um loop de agente. O mock de provedores existente
verifica o chat de texto; ele não verifica tool calls parciais/completas, multi-turno com resultado,
usage, capabilities, failover, orçamento diário, nem que um failover jamais repete uma tool. Os
testes de política cobrem a decisão isolada da Fase 3, mas não a propagação tainted de ToolResult.
Não há teste de limite de voltas/tempo/tokens, cancelamento de execução, concorrência por conversa,
schema deny-unknown-fields para ferramentas do modelo, persistência de mensagens de tool ou UI do
modo agente. A matriz detalhada está em [`TRACEABILITY.md`](TRACEABILITY.md).

Após implementação, todos esses testes devem usar servidor/mock local e zero chamadas a APIs reais.
Validação visual no Windows deverá cobrir estados do chat, aprovação, parada e integração com
island/mascote.

## Verificações automatizadas

- `npm test`: chat, estados da ilha, persistência, carregador de sons, registro das 16 expressões, mapeamento de eventos, interpolação facial, piscadas e movimento reduzido.
- `npm run build`: TypeScript e bundle Vite.
- `npm run format:check`: estilo Prettier.
- `npm run check:debug-command`: confirma que declaração e registro do disparo manual estão limitados a `debug_assertions`.
- `npm run check:release-assets`: verifica `dist/` e falha se encontrar o GLB proprietário ou referências oficiais. O comando de build Tauri executa essa verificação antes do empacotamento.
- O workflow `CI` valida testes, formatação e build frontend no push/PR, mas não gera nem armazena instaladores Windows como artefatos do GitHub Actions.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`: formatação Rust.
- `cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc`: compilação Rust para Windows.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`: testes Rust, incluindo cabeçalhos de autenticação com servidor local simulado.
- `window_config_tests::main_window_uses_requested_default_and_minimum_size`: dimensões, mínimos e centralização da janela principal em `tauri.conf.json`.
- Testes Rust da validação do endpoint, mapeamento de status, recusa de formatos de imagem e normalização de avatar; sem chamadas às APIs reais.
- Testes Vitest da migração v1 e isolamento de endpoint/modelo entre provedores.
- `npm run tauri:build`: valida o build e as guardas de distribuição antes de compilar/gerar o NSIS; falhar por GLB ou referência proprietária é o resultado esperado neste checkout.
- `git diff --check`: whitespace e marcadores de conflito.

### Fase 3 — permissões

- `policy.rs`: tabela completa de modos × riscos × origens normal/tainted × dentro/fora do workspace, incluindo exceções permissivas e bloqueios fixos.
- `security.rs`: schema tipado com campos desconhecidos recusados; validação de traversal, UNC, nomes reservados, reparse point e hard link; bloqueio de pagamento, caminhos comuns de credenciais e marcadores conhecidos de segredo; limite de frequência; escrita com backup e lixeira sem exclusão definitiva; hash de parâmetros, fila limitada e cadeia de auditoria com adulteração detectada.
- `lib.rs`: teste de isolamento do chamador da aprovação (`approval` somente).
- `lib.rs`: teste das transições de criação/fechamento das janelas opcionais (`feature_window_lifecycle_tests`).
- `settings.test.ts`: rejeição de endpoint cujo host não pertence ao provedor salvo, incluindo Groq com endpoint da xAI.
- `history.rs`: listagem do SQLite inclui título e `created_at` (`conversation_list_includes_title_and_creation_time`).
- Todas as ferramentas desta fase são simuladas e os testes não fazem chamadas de rede reais.
- A confirmação de modo e exceção usa caixa nativa Win32 em execução interativa; não é exercitada por teste automatizado.

Resultados numéricos de builds e testes anteriores não devem ser aplicados à árvore atual. Uma tentativa antiga de instalação NSIS em pasta temporária e abertura do Hub não comprovou pixels renderizados. Os resultados atuais ficam registrados abaixo.

## Pré-visualização de desenvolvimento

Na página Companion, abrir “Pré-visualização e ferramentas de diagnóstico”. O painel permite escolher qualquer expressão, testar movimentos, habilitar flutuação/animações, ajustar luz, escala, posição e órbita da câmera, e ler FPS/triângulos/chamadas. O aviso identifica a simulação como local; os controles não emitem eventos para outras janelas.

O GLB deste proprietário fica fora do Git e pode ser incluído pelo `npm run build` local neste checkout. O empacotamento Tauri é bloqueado enquanto o GLB ou referências forem detectados em `dist/`. Um checkout sem o GLB deve exibir o fallback e seguir compilando. As referências não são importadas pelo Vite.

## Checklist manual de validação nativa

Execute em uma sessão Windows com a janela visível. Registre sistema, escala DPI, resolução/monitores e resultado por etapa. Não marque como aprovado quando não for possível observar o comportamento.

1. Abra o HUB e confirme que a janela aparece, responde e fecha normalmente.
2. Ative a ilha; confirme posição inicial, transparência, expansão/recolhimento e que áreas transparentes permitem clicar no desktop.
3. Abra o Companion em modo livre; arraste-o, mova o foco para outros apps e confirme que ele não rouba foco.
4. Reinicie o app e confirme a persistência da posição; use “Retornar à ilha” e confirme que a janela livre some e a ilha reaparece.
5. Abra a pré-visualização e percorra `idle`, `happy`, `sad`, `angry`, `surprised`, `confused`, `thinking`, `listening`, `talking`, `sleeping`, `waking`, `celebrating`, `loading`, `error`, `working` e `notification`. Para cada uma, confirme olhos no visor, identidade preservada, transição suave e ausência de deformação.
6. Teste piscar, olhar, flutuar, inclinar, arrastar, retornar e movimento reduzido. Minimize/restaure e feche/reabra; confirme que a animação pausa/restaura e não há consumo crescente ou processos órfãos.
7. Compare frente e três quartos com as referências oficiais locais; confira UV, espelhamento, profundidade, materiais vermelhos/pretos, brilho dos olhos, nitidez e transparência do fundo.
8. Envie uma conversa real e confirme as expressões `thinking`, `responding`, `completed` e `error` somente nos eventos correspondentes.
9. Repita em DPI 100%, 125% e 150%, monitores distintos, reconexão/desconexão e fullscreen; observe escala, posição e interação com o desktop.
10. Instale o NSIS em pasta de teste isolada, abra e feche o app, depois desinstale. Confirme que o UDF normal, o histórico e as preferências existentes permanecem intactos.
11. Abra o aplicativo duas vezes; confirme que a segunda abertura traz o Hub existente ao foco e não reproduz `0x800700AA`. Se o erro reaparecer, registre o processo e o perfil WebView2 em uso.
12. Envie uma resposta longa e confirme texto incremental, cancelamento e retomada da conversa após reiniciar. Repita com Anthropic, um adaptador Chat Completions e Perplexity.
13. Em perfil Windows novo, confirme a sugestão `%USERPROFILE%\OdeKrai`, escolha outra pasta local, confira o aviso OneDrive e verifique a estrutura criada. Tente UNC, raiz de unidade, pasta do sistema, pasta do aplicativo, `..`, nome reservado e junction; confirme as recusas.
14. Edite `ODEKRAI.md` fora do aplicativo, volte à tela Identidade e memória e confira o diff. Confirme que o chat bloqueia a identidade alterada e só retoma após aprovação explícita.
15. Crie, leia, edite e apague `memory/estilo.md` e outra nota. Apague toda a memória. Reinicie e confirme persistência. Não use dados reais sensíveis nesse ensaio.
16. Crie duas conversas, apague uma e depois todo o histórico. Reinicie e confirme que nenhuma reaparece. Confira no provedor real, com conta de teste, o campo de sistema/instruções recebido; testes locais não comprovam essa integração.
17. No perfil, salve nome e apelido, recarregue a aplicação e confirme persistência em SQLite. Tente SVG, GIF, arquivo corrompido, imagem acima do limite e PNG/JPEG/WebP válidos; confira recorte e dimensão 256 × 256.
18. Troque entre provedores e confirme que endpoint/modelo não se misturam. Informe endpoint de outro provedor e confirme a recusa antes do salvamento da credencial. Carregue modelos somente nos provedores com endpoint documentado; confirme o estado parcial nos demais.
19. Em Configurações → Permissões, troque cada modo e confirme a caixa nativa antes de salvar. Confira que o modo exibido em `ODEKRAI.md` não altera o modo efetivo do SQLite.
20. Em build de desenvolvimento, teste leitura, gravação com backup, mover para `.trash`, envio simulado e bloqueio financeiro. Confirme que só a janela `approval` pode aprovar, que Negar e fechar negam, que parâmetros adulterados/replay/expiração/fila cheia falham fechados e que conteúdo externo pede aprovação.
21. Confirme que a inicialização abre apenas `main`; habilite e desabilite island/mascote e resolva/expire aprovações, observando que as janelas correspondentes são criadas sob demanda e fechadas no fim do uso.
22. Na primeira execução com a janela visível, abra o seletor de pasta nativo, escolha um diretório local e confirme que o Rust ainda valida o caminho antes de criar a pasta do agente; teste os selects de idioma e tom.
23. Ao mudar modo ou habilitar override, confirme que a caixa Win32 aparece sem congelar a janela principal enquanto permanece aberta; confirme Cancelar e Sim retornando à interface.
24. Execute `npm run build` e confirme que o mascote fica em chunk lazy separado. O chunk Three.js ainda pode superar 500 kB bruto; registre o tamanho e gzip, sem elevar o limite de aviso para ocultá-lo.
25. Teste `npm run check:release-assets` com um `dist/` de fixture limpo (passa) e com o GLB/uma referência oficial (falha com os caminhos detectados). Não publique artefatos locais que contenham o GLB.
26. Teste `Ctrl+Shift+F12` e um atalho em conflito. Confirme que Parar tudo cancela uma resposta em streaming, nega aprovações pendentes, bloqueia novas ações e persiste após reiniciar; Retomar exige uma auditoria gravada.
27. Na tela Atividade, confirme a cadeia, exporte JSONL e altere uma cópia de teste para verificar a detecção. Não edite os logs reais durante o ensaio.
28. Repita a janela de aprovação em 100%, 125% e 150% de DPI, monitores distintos, foco alternado e telas menores; verifique texto longo sem renderização de Markdown/HTML.

## Inspeção visual manual pendente

A interface não ficou disponível para inspeção visual nesta sessão. O teste recente confirmou inicialização do executável e do UDF padrão por processo e título de janela, mas não comprova pixels renderizados, ilha visível, interação ou comportamento instalado. Execute o checklist acima numa sessão gráfica acessível.

Build/testes automatizados não comprovam visualização 3D correta, orientação UV, WebGL em Tauri, click-through ou comportamento em múltiplos monitores.

## Áudio

Não há sons Kenney integrados. As páginas oficiais de [UI Audio](https://kenney.nl/assets/ui-audio) e [Interface Sounds](https://kenney.nl/assets/interface-sounds) indicam CC0, mas os arquivos ZIP e licenças internas ainda precisam ser verificados. Não copiar sons do Coucou.

## Capturas verificáveis da revisão atual

As capturas desta revisão ainda não foram produzidas. Em Windows com sessão gráfica disponível:

1. Feche o processo antigo de release e gere o pacote atualizado com `npm run tauri:build`.
2. Inicie o novo executável e capture o Hub em 1366×768 ou na resolução real usada, com a escala DPI anotada.
3. Capture o catálogo mostrando o estado do provedor sem credencial e, se houver conta autorizada, uma conexão testada sem expor campos secretos.
4. Capture a ilha e a janela livre em separado, incluindo uma imagem sobre desktop claro e outra escuro para avaliar transparência.
5. Salve PNGs em diretório de evidências local ignorado pelo Git; anote build/commit, Windows, resolução, escala, monitor e etapa do checklist. Nunca publique imagens que mostrem chaves ou dados privados.

## Resultados da Fase 1 (24/10/2026)

- `npm run build`: passou; 54 módulos. O Vite avisou que o chunk Three.js tem 617,24 kB. O build local incorporou o GLB privado em `dist`; esse artefato não deve ser publicado.
- `npm test -- --pool=threads --maxWorkers=1`: 16 testes passaram em 5 arquivos, executados fora da restrição que causou `spawn EPERM` na primeira tentativa.
- `cargo check --manifest-path src-tauri/Cargo.toml --lib`: passou após resolver `rusqlite` e `tauri-plugin-single-instance`.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: passou.
- Prettier nos arquivos alterados: passou. `npm run format:check` global falhou em `index.html`, `README.en.md`, `src/ui/IslandWindow.tsx` e no arquivo local não rastreado `ODEKRAI.md`; esses arquivos não foram modificados nesta fase.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`: 5 testes passaram, incluindo cabeçalhos com servidor simulado, parsing de streaming e esquema SQLite.
- Inspeção visual e teste com provedores reais: não executados.

## Fase 2

O roteiro nativo da Fase 2 está nos itens 13–16. A validação automatizada desta revisão deve incluir sanitização dos campos, caminhos proibidos, detecção de alterações externas e ordem/limite do prompt, além de `npm run build`, `npm test`, `npm run format:check`, `cargo fmt --check`, `cargo test` e `git diff --check`. Registrar os resultados efetivamente obtidos no relatório da tarefa; build e testes locais não comprovam o assistente visível, junctions do perfil real, Credential Manager nem o formato aceito por contas reais dos provedores.
