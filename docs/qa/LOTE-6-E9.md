# LOTE 6 — E9: Cards de provedores de IA

## Diagnóstico

A grade definia `grid-auto-rows: minmax(236px, 1fr)`, e cada card repetia `min-height: 236px` (250 px em telas menores). O botão de seleção preenchia o espaço restante e atribuía `1fr` à linha das etiquetas, criando áreas vazias mesmo quando o provedor tinha poucas informações.

## Alterações

- A altura mínima artificial foi removida; as linhas da grade acompanham o card mais alto daquela linha e permanecem alinhadas.
- O conteúdo do botão ocupa somente a altura de nome, tipo de API e etiquetas, sem expandir a linha das etiquetas.
- A grade usa largura mínima responsiva de 250 px e reduz as colunas automaticamente, com mínimo de 280 px no breakpoint estreito (limitado pela largura disponível).
- Títulos e etiquetas podem quebrar em textos longos sem dividir palavras comuns. As etiquetas de conexão, teste, credencial, plano gratuito, provedor principal, habilitação e serviço local mantêm seus estados e recebem tons por estado.
- Provedores remotos sem credencial nem conexão mostram “Desconectado”; o conector local mantém o indicador próprio e o estado do serviço.

Busca, filtros, credenciais, seleção de modelo, provedores principais e adaptadores não foram alterados.

## Regressão e validação

O teste de `ProvidersScreen` cobre provedores sem credenciais, teste reprovado, provedor principal, habilitação, plano gratuito e estado local não verificado, além das regras de altura e quebra de texto.

Validação visual e screenshots comparativos em janelas reais não foram capturados neste ambiente; permanecem pendentes para revisão manual.
