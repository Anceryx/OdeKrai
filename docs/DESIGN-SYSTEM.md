# Sistema visual do OdeKrai

Este documento registra os tokens globais e padrões reutilizáveis. O objetivo é consolidar estilos sem reorganizar telas. As bordas fortes ficam mais claras que o valor legado porque controles essenciais precisam alcançar contraste mínimo de 3:1.

## Tokens

| Grupo               | Tokens                                                                                                                                                                                                                                                                                           | Valor ou regra                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Fundo e superfícies | `--color-background`, `--color-surface`, `--color-surface-raised`                                                                                                                                                                                                                                | `#09090b`, `#111214`, `#191a1d`                                                                                                           |
| Texto               | `--color-text`, `--color-text-secondary`, `--color-text-muted`                                                                                                                                                                                                                                   | Texto principal, secundário e auxiliar; evitar texto informativo abaixo de 4,5:1 com o fundo                                              |
| Bordas              | `--color-border-subtle`, `--color-border-strong`                                                                                                                                                                                                                                                 | Discreta `#414147` em cartões/divisores; forte `#73737c` em campos, botões secundários, seletores e toggles                               |
| Marca               | `--color-accent`, `--color-accent-soft`, `--color-accent-contrast`                                                                                                                                                                                                                               | Laranja `#f97316`, laranja suave `#fb923c`, texto escuro `#211006`                                                                        |
| Ação com texto      | `--gradient-action`                                                                                                                                                                                                                                                                              | Gradiente do laranja da marca com extremidade `#d95a14`, que mantém pelo menos 4,5:1 com `--color-accent-contrast`                        |
| Estado              | `--color-success`, `--color-success-surface`; `--color-warning`, `--color-warning-surface`; `--color-danger`, `--color-danger-surface`; `--color-info`, `--color-info-surface`                                                                                                                   | Pares de texto/borda e superfície para sucesso, aviso, perigo e informação; o aviso usa amarelo (`#facc15`), separado do laranja da marca |
| Risco               | `--color-risk-reading`, `--color-risk-reading-surface`; `--color-risk-write`, `--color-risk-write-surface`; `--color-risk-communication`, `--color-risk-communication-surface`; `--color-risk-destructive`, `--color-risk-destructive-surface`; `--color-risk-code`, `--color-risk-code-surface` | Um par de cor e superfície por categoria de risco; texto e ícone contrastam pelo menos 4,5:1 com a superfície                             |
| Espaçamento         | `--space-1` a `--space-10`                                                                                                                                                                                                                                                                       | Escala de 4 px: 4, 8, 12, 16, 20, 24, 28, 32, 36 e 40 px                                                                                  |
| Raios               | `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill`                                                                                                                                                                                                                                     | 6, 10 e 14 px; pill de 999 px                                                                                                             |
| Elevação            | `--elevation-1`, `--elevation-2`                                                                                                                                                                                                                                                                 | `0 1px 0` e `0 3px 0`: deslocamento sem blur                                                                                              |
| Movimento           | `--motion-fast`, `--motion-normal`, `--motion-slow`                                                                                                                                                                                                                                              | 120, 200 e 320 ms; respeitar `prefers-reduced-motion`                                                                                     |

As bordas discretas preservam o valor visual legado. A borda forte tem contraste calculado de 3,99:1 sobre `#111214` e 3,71:1 sobre `#191a1d`. Ela é aplicada somente a controles cuja borda precisa comunicar um limite interativo.

## Regra para o laranja

Usar o laranja da marca para ações principais, seleção, progresso e detalhes do mascote. Botões primários com fundo laranja usam `--color-accent-contrast`, nunca texto branco. Sobre `--color-accent`, esse par tem contraste de 6,56:1. O gradiente de ação termina em `#d95a14`, com contraste mínimo calculado de 4,75:1 para o mesmo texto. O gradiente decorativo existente continua disponível para superfícies sem texto.

O alerta usa amarelo `--color-warning` e sua superfície escura; não usar o laranja de marca para comunicar aviso. Sucesso, perigo e informação também devem usar o par de superfície semântica correspondente.

## Badges

`RiskBadge` é o componente reutilizável único para rótulos de risco. Aceita identificadores Rust (`leitura`, `escrita_reversivel`, `comunicacao_externa`, `destrutivo_financeiro` e `execucao_de_codigo`) e os rótulos em português já persistidos nos cartões do agente. Cada categoria combina ícone Phosphor, nome acessível, rótulo em português e par de cor/superfície próprio. A execução de código permanece separada por ser uma categoria de alto risco já existente no OdeKrai. Valores desconhecidos aparecem como “Risco não identificado”, sem receber uma categoria permissiva.

Para estados sem risco, usar `ui-badge--success`, `ui-badge--warning`, `ui-badge--danger` ou `ui-badge--info` junto de ícone e texto quando necessário. A cor nunca deve ser o único indicador; manter rótulo legível e ícone acessível no contexto.

## Modo de desempenho

Definir `data-performance="on"` no elemento `<html>` ativa o modo de baixo custo visual: remove sombras e filtros, imagens de fundo em gradiente, animações de gradiente e translucidez em superfícies marcadas com `data-translucent`. O modo é opt-in e não altera preferências salvas nem a aparência padrão. Remover o atributo restaura o estilo usual.

## Teclado e movimento

No diálogo modal, o foco inicial vai para a pesquisa de configurações; a ordem de Tab segue o DOM, inclui o botão de fechar e os controles da seção, e permanece dentro do diálogo. `Escape` fecha e devolve o foco ao acionador. Em largura abaixo de 800 px, a navegação por seções usa uma lista suspensa rotulada. Controles interativos mantêm indicação `:focus-visible`.

As animações devem respeitar `prefers-reduced-motion`; o CSS global desliga animações e transições nessa preferência. O modo `data-performance="on"` aplica as reduções visuais e remove os efeitos de maior custo listados acima. A validação automatizada cobre os contratos de foco, rótulos, tokens, contraste e seletores; a inspeção no WebView2 continua manual.

## Verificação

`npm run check:design-tokens` confere presença dos tokens, escala de espaçamento, durações, elevações sem blur, modo de desempenho e contraste WCAG dos pares principais, estados e riscos. O comando deve passar junto a `npm run check:encoding`.
