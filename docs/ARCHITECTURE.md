# Arquitetura

> **Estado da Fase 4:** o loop de agente e a abstração de tools ainda não estão implementados. O
> diagrama futuro está descrito aqui para delimitar a fronteira de segurança; não representa fluxo
> executável no HEAD atual.

O catálogo de provedores em `src-tauri/resources/provider-catalog.json` alimenta os metadados do frontend e do Rust. O Rust valida host e caminho, acessa credenciais e implementa listagem documentada de modelos. As preferências guardam configurações por `providerId`; perfil e histórico usam SQLite local. Avatar é processado no Rust e servido como data URL apenas para a interface principal.

`src/ui/design-tokens.css` centraliza as cores, a tipografia, o espaçamento, os raios e as sombras da interface. `src/ui/DesignSystem.tsx` oferece componentes compartilhados para botões, cartões, avisos, campos, seletores, alternâncias, opções selecionáveis e cabeçalhos. A interface aplica esses padrões nas telas principais; a conferência visual em tamanhos e escalas de Windows continua manual.

## Fluxo de agente planejado — não implementado

```mermaid
sequenceDiagram
    participant UI as Interface
    participant Rust as Loop Rust
    participant LLM as Provedor LLM
    participant Policy as Motor da Fase 3
    participant Approval as Janela de aprovação
    participant Tool as Tool local
    UI->>Rust: pedido + conversa
    Rust->>LLM: mensagens + schemas de tools
    LLM-->>Rust: texto ou chamada completa
    Rust->>Policy: ActionRequest com origem e argumentos validados
    Policy-->>Approval: aprovação necessária
    Approval-->>Policy: decisão do usuário
    Policy->>Tool: executar somente após permitir
    Tool-->>Rust: resultado rotulado Local/Untrusted
    Rust->>LLM: resultado como dado; próxima volta
    LLM-->>UI: resposta final via evento
```

O fluxo acima só poderá ser ativado quando cada chamada passar pelo motor de políticas e auditoria
Rust. Tool calls parciais não podem executar. Conteúdo Untrusted deve propagar taint até a origem
da próxima ação. O workspace usa `.history` e `.trash`; arquivos locais baixados ainda podem conter
injeção de instrução, e a proteção depende do taint e da política para efeitos colaterais.

## Aplicativo

O frontend usa React + TypeScript + Vite. `src/core/` mantém regras sem dependência da apresentação; `src/ui/` contém o Hub e as janelas do Companion. Na abertura, o Tauri cria somente `main`. Rust cria `island` e `mascot` quando ativadas e fecha cada uma quando desativada; cria `approval` quando há uma aprovação pendente e fecha a janela após resolver ou expirar a fila. Comandos Rust controlam posição, tamanho, visibilidade e prioridade. Eventos Tauri conectam o chat às janelas do Companion e sincronizam as preferências locais.

## Pet 2D

O pet padrão é o sprite CSS de `assets/pets/kenney-mini-characters/`, escolhido pelo usuário e
persistido na tabela `pet_preferences` do SQLite local. O catálogo `pets.json` é validado no
frontend e no Rust; nomes de arquivo aceitos são apenas nomes simples `.png`. Estados da FSM são
convertidos em animações CSS, que ficam estáticas quando a preferência do aplicativo ou do sistema
reduz movimento está ativa.

O componente `PetSprite` renderiza o PNG selecionado e animações CSS associadas aos estados da FSM. Ele é usado na Visão geral, no chat, na prévia do Assistente e nas janelas auxiliares. A preferência `reduzir animações` e `prefers-reduced-motion` mantêm o sprite estático. Three.js é usado somente pelo script de desenvolvimento `scripts/render-pets.mjs`; não é importado pelo frontend nem pelo runtime Tauri. Modelos proprietários não são necessários para compilar ou executar o aplicativo.

## Ilha, áudio e armazenamento

`src/core/island.ts` implementa transições e prioridades. `src/core/sounds.ts` carrega sons sob demanda, mantém cache, limita repetições, aplica volume e ignora arquivos ausentes ou inválidos. Preferências não secretas ficam no armazenamento local do WebView; chaves de API não são salvas. O histórico de conversas fica em SQLite na pasta de dados do aplicativo, acessado somente pelos comandos Rust da janela principal.

Conversas apresenta uma lista pesquisável com título, data e prévia; o SQLite armazena título e
mensagens com horário. A tela permite selecionar, renomear e apagar uma conversa. O painel da
conversa mostra mensagens do usuário à direita e respostas à esquerda; o avatar das respostas usa
o ícone do aplicativo por padrão, com uma preferência para usar o mascote. As respostas usam um
renderizador Markdown que cria elementos React a partir de texto, sem interpretar HTML. Links só
aceitam `http` e `https`.

No Windows, a janela do mascote recebe região Win32 retangular no limite do sprite; a ilha mantém a região arredondada para acomodar seus controles. As regiões são atualizadas no redimensionamento e na alteração de DPI. Isso ainda exige teste de desktop real para confirmar o encaminhamento de cliques nas áreas transparentes.

## Pasta e identidade do agente

`src-tauri/src/agent_home.rs` valida a pasta escolhida na primeira execução (sugestão: `%USERPROFILE%\OdeKrai`) e cria `ODEKRAI.md`, `memory/`, `workspace/`, `skills/` e `logs/`. O template está embutido no Rust; o repositório não contém o arquivo pessoal gerado. A última versão aprovada e seu SHA-256 ficam nos dados locais do aplicativo. Uma alteração externa suspende o prompt até revisão e aprovação.

O Rust compõe o prompt na ordem: regras fixas, identidade aprovada, até 1.024 caracteres de `memory/estilo.md` e o modo efetivo lido do SQLite local. Anthropic recebe `system`, APIs Chat Completions recebem uma mensagem `system` e a [Perplexity Agent API](https://docs.perplexity.ai/docs/agent-api/quickstart) recebe `instructions`. Sem pasta configurada, o chat funciona sem prompt pessoal.

## Motor de permissões

`src-tauri/src/policy.rs` contém a política pura e tabelada de modo, risco, origem e localização no workspace. `src-tauri/src/security.rs` guarda o estado de segurança em SQLite, valida os parâmetros tipados de `SimulatedAction`, decide e registra auditoria antes da execução. Só as ações de arquivo dentro de `workspace/` têm efeito local; comunicação é apenas simulada e pagamento é sempre bloqueado.

Pedidos `AskUser` entram numa fila Rust limitada e abrem a janela Tauri `approval`. A capability `src-tauri/capabilities/approval.json` dá somente os eventos e o fechamento de janela necessários. A confirmação, expiração, hash dos parâmetros e execução de uso único são verificados no Rust. A janela principal configura modo/atalho e consulta a tela de atividade; não pode responder aprovações.

O plugin Tauri `global-shortcut` registra o atalho no processo nativo. O kill switch persiste a parada, cancela tokens dos streams, nega a fila e bloqueia novos envios a provedores. Retomar só funciona depois de gravar a entrada de auditoria. As decisões no WebView servem somente para exibição e entrada do usuário.

## Limites conhecidos

- Um ensaio anterior abriu o executável com o UDF WebView2 padrão. O erro `0x800700AA` também ocorreu em outra tentativa; a causa permanece inconclusiva. O plugin de instância única evita abrir uma segunda instância do aplicativo, mas seu efeito sobre esse erro precisa de teste nativo.
- A nitidez dos sprites, as animações, o recorte dos avatares e o hit-testing das janelas auxiliares precisam de validação visual no Windows.
- Escalas DPI, monitores adicionais, reconexão, fullscreen e hit-testing ainda precisam de validação manual.
- Nenhum áudio Kenney foi integrado.

## Inicialização do painel

Janelas auxiliares são construídas somente por caminhos assíncronos. A restauração da ilha e do mascote ocorre após as leituras iniciais, com limite de cinco segundos e sem condicionar a janela principal. Uma inicialização anterior incompleta ativa o modo seguro e mantém essas janelas desligadas nessa sessão. Falhas de inicialização e erros não tratados do frontend aparecem no banner **Diagnóstico** e são registrados em `app_data_dir/logs/diagnostic.log`, sem mensagens de conversa, segredos ou texto livre de erros.

Comandos nativos de leitura usados durante a abertura (pasta do agente, credenciais, perfil, permissões, mascote e histórico) são assíncronos no Tauri para não executar trabalho de disco ou do Gerenciador de Credenciais na thread principal da janela.
