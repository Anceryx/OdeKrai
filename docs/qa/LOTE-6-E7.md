# LOTE 6 — E7: Conteúdo das seções do modal Configurações

## Causa

As seções Habilidades e Conectores renderizavam o mesmo componente `GlobalPreferences`,
que repetia preferências de animação e avatar já disponíveis em Geral e Assistente. O
índice de busca também associava essas seções a palavras-chave dessas preferências, em vez
de termos próprios de habilidades ou provedores.

## Correção

- Habilidades consulta o comando Rust existente `get_skills` em modo somente leitura e
  resume a quantidade registrada e ativa. Falha e ambiente sem Tauri têm estados visíveis.
  Busca, habilitação e configuração continuam na central existente.
- Conectores resume provedor principal, modelo salvo, estado habilitado e reservas com
  modelo configurado, usando apenas `AppSettings`. Não infere conexão ou validade de
  credencial.
- Cada resumo tem sua própria âncora e botão para a central correspondente. O callback já
  navega para a página `skills` ou `providers`; a navegação fecha o modal pela rota direta.
- O índice de pesquisa aponta para os novos resumos e usa termos específicos dessas áreas.
- As demais sete seções continuam mapeadas individualmente pelo `switch` e pelo índice
  compartilhado; os testes verificam os nove destinos e a unicidade das âncoras.

## Validação

Testes direcionados: `SettingsModal.test.tsx` e `settings-navigation.test.ts` (8 testes).
Validação completa: `npm run build`, `npm test` (49 arquivos, 243 testes),
`npm run format:check`, `npm run check:encoding`, `cargo fmt --check` e `cargo test`
(277 testes unitários e 2 de integração). O build manteve os avisos já existentes de
chunk acima de 500 kB e importação mista de `SecurityCenter.tsx`.

**Pendente:** não houve teste interativo do modal no executável Windows. A ferramenta de
controle de desktop não está disponível nesta sessão; a cobertura automatizada verifica
todos os IDs/seções, pesquisa, âncoras, resumos e destinos de abertura.
