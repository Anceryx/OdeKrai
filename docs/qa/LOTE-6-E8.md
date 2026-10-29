# LOTE 6 — E8: Catálogo de Habilidades

## Diagnóstico

Os cards usavam uma coluna mínima de 280 px e mantinham o ícone, o texto e a etiqueta de risco na mesma linha. Em larguras próximas ao mínimo, a etiqueta consumia boa parte da largura disponível e deixava títulos e descrições estreitos, aumentando artificialmente a altura dos cards. Na tela Gerenciar, nomes extensos também não tinham regras próprias de quebra; descrições e exemplos usavam `overflow-wrap: anywhere`, que pode separar palavras mesmo quando uma quebra entre palavras é suficiente.

## Alterações

- Os cards passam a usar colunas de no mínimo 320 px quando houver espaço; abaixo desse limite, ocupam a largura disponível e reduzem para uma coluna no breakpoint já existente.
- O cabeçalho usa uma grade com ícone e texto; a etiqueta de risco ocupa uma linha própria abaixo do texto.
- Títulos e identificadores extensos podem quebrar sem alterar a quebra normal de palavras. Descrições e exemplos priorizam as quebras naturais e mantêm `break-word` para conteúdo sem espaços.
- O rodapé pode quebrar em larguras menores e a etiqueta de risco de cada habilidade fica separada da origem.
- A seção “Acessos e integrações” permanece um resumo somente para leitura com atalho para “Privacidade e permissões”; as configurações e comandos não estão duplicados na central de Habilidades.

Busca, filtros, abas Pessoal e Público, contagens, estados, habilitação, permissões, exemplos e ações de gerenciamento não foram alterados.

## Regressão e validação

O teste da central cobre nomes e descrições longos, identificador sem espaços, exemplo longo, etiqueta de maior risco e famílias de categorias local e de integração. Também verifica a largura mínima, o cabeçalho em grade, a posição da etiqueta e a coluna única em janelas estreitas.

Capturas comparativas e validação visual em janelas reais, incluindo escala de exibição do Windows, não foram possíveis neste ambiente. Permanecem pendentes para revisão visual manual.
