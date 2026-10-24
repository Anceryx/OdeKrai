# Arquitetura

> **Estado da Fase 4:** o loop de agente e a abstração de tools ainda não estão implementados. O
> diagrama futuro está descrito aqui para delimitar a fronteira de segurança; não representa fluxo
> executável no HEAD atual.

O catálogo de provedores em `src-tauri/resources/provider-catalog.json` alimenta os metadados do frontend e do Rust. O Rust valida host e caminho, acessa credenciais e implementa listagem documentada de modelos. As preferências guardam configurações por `providerId`; perfil e histórico usam SQLite local. Avatar é processado no Rust e servido como data URL apenas para a interface principal.

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

O frontend usa React + TypeScript + Vite. `src/core/` mantém regras sem dependência da apresentação; `src/ui/` contém o Hub e as janelas do Companion. O shell Tauri cria `island` e `mascot`; comandos Rust controlam posição, tamanho, visibilidade e prioridade. Eventos Tauri conectam o chat às janelas do Companion e sincronizam as preferências locais.

## Mascote 3D

`src/core/mascot.ts` declara as 16 expressões, seus parâmetros faciais, o mapeamento dos estados reais da ilha e os movimentos. `src/core/mascot-face.ts` desenha os olhos em um Canvas 2D transparente. `src/ui/OdekraiCompanion.tsx` carrega o GLB com `GLTFLoader`, localiza `ADA_Face_Display`, clona o material `ADA_Eyes_Emissive_ReplaceTexture` e usa uma `CanvasTexture` como mapa de cor e emissão. O root usado pelo código chama-se `odekraiRoot`; nomes do GLB permanecem intactos.

`OdekraiMascot` carrega o renderer sob demanda. As janelas `island` e `mascot` compartilham o mesmo componente, mas cada WebView mantém sua própria cena e renderer. A máquina `transitionIsland` continua sendo a fonte de prioridades; os eventos aceitos atualizam a expressão. O chat envia `thinking`, `responding`, `completed` e `error` nos pontos reais do fluxo. O renderer pausa quando a janela ou o documento está oculto, respeita movimento reduzido e libera geometrias, materiais e texturas ao desmontar.

O GLB e as referências fornecidas pelo proprietário são extraídos para `assets/odekrai/character/` e `assets/odekrai/previews/official-references/`, diretórios ignorados pelo Git. Vite detecta o GLB local como asset opcional: o build local o incorpora em `dist`; um checkout sem o arquivo mantém o marcador tipográfico de fallback e não carrega o modelo. Não adicionar esse asset proprietário ao Git nem distribuir o bundle local sem autorização.

## Ilha, áudio e armazenamento

`src/core/island.ts` implementa transições e prioridades. `src/core/sounds.ts` carrega sons sob demanda, mantém cache, limita repetições, aplica volume e ignora arquivos ausentes ou inválidos. Preferências não secretas ficam no armazenamento local do WebView; chaves de API não são salvas. O histórico de conversas fica em SQLite na pasta de dados do aplicativo, acessado somente pelos comandos Rust da janela principal.

No Windows, as janelas auxiliares recebem regiões Win32 arredondadas para hit-testing. A região é atualizada no redimensionamento e na alteração de DPI. Isso ainda exige teste de desktop real para confirmar o encaminhamento de cliques nas áreas transparentes.

## Pasta e identidade do agente

`src-tauri/src/agent_home.rs` valida a pasta escolhida na primeira execução (sugestão: `%USERPROFILE%\OdeKrai`) e cria `ODEKRAI.md`, `memory/`, `workspace/`, `skills/` e `logs/`. O template está embutido no Rust; o repositório não contém o arquivo pessoal gerado. A última versão aprovada e seu SHA-256 ficam nos dados locais do aplicativo. Uma alteração externa suspende o prompt até revisão e aprovação.

O Rust compõe o prompt na ordem: regras fixas, identidade aprovada, até 1.024 caracteres de `memory/estilo.md` e o modo efetivo lido do SQLite local. Anthropic recebe `system`, APIs Chat Completions recebem uma mensagem `system` e a [Perplexity Agent API](https://docs.perplexity.ai/docs/agent-api/quickstart) recebe `instructions`. Sem pasta configurada, o chat funciona sem prompt pessoal.

## Motor de permissões

`src-tauri/src/policy.rs` contém a política pura e tabelada de modo, risco, origem e localização no workspace. `src-tauri/src/security.rs` guarda o estado de segurança em SQLite, valida os parâmetros tipados de `SimulatedAction`, decide e registra auditoria antes da execução. Só as ações de arquivo dentro de `workspace/` têm efeito local; comunicação é apenas simulada e pagamento é sempre bloqueado.

Pedidos `AskUser` entram numa fila Rust limitada e abrem a janela Tauri `approval`. A capability `src-tauri/capabilities/approval.json` dá somente os eventos e o fechamento de janela necessários. A confirmação, expiração, hash dos parâmetros e execução de uso único são verificados no Rust. A janela principal configura modo/atalho e consulta a tela de atividade; não pode responder aprovações.

O plugin Tauri `global-shortcut` registra o atalho no processo nativo. O kill switch persiste a parada, cancela tokens dos streams, nega a fila e bloqueia novos envios a provedores. Retomar só funciona depois de gravar a entrada de auditoria. As decisões no WebView servem somente para exibição e entrada do usuário.

## Limites conhecidos

- Um ensaio anterior abriu o executável com o UDF WebView2 padrão. O erro `0x800700AA` também ocorreu em outra tentativa; a causa permanece inconclusiva. O plugin de instância única evita abrir uma segunda instância do aplicativo, mas seu efeito sobre esse erro precisa de teste nativo. Orientação UV, alinhamento facial e renderização precisam de validação visual.
- O aplicativo pode usar o marcador de fallback em builds sem asset local. O bundle de build feito neste checkout inclui o GLB privado e não pode ser publicado.
- Escalas DPI, monitores adicionais, reconexão, fullscreen e hit-testing ainda precisam de validação manual.
- Nenhum áudio Kenney foi integrado.
