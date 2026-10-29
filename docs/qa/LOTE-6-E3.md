# Lote 6 — E3: modo agente e erros HTTP 400

## Causa comprovada

O caminho OpenAI do modo agente enviava diretamente ao adaptador os identificadores internos do
registro Rust, que incluem pontos (por exemplo, `google.calendar.update_event`). O adaptador
Chat Completions os serializava sem tradução como `function.name`. A definição oficial de function
tool restringe esse nome a letras, números, `_` e `-`, com até 64 caracteres. Isso confirma uma
incompatibilidade concreta capaz de produzir HTTP 400. O fluxo de chat normal não anuncia tools,
portanto não reproduzia a falha.

O registro suporta vários provedores e modelos. A declaração geral de suporte a tools não comprova
compatibilidade de todo modelo; respostas explícitas de recusa de tools continuam atualizando o
cache local por provedor/modelo. Para GPT-6 Luna, o adaptador já selecionava `reasoning_effort: none`
quando ferramentas estão habilitadas, conforme a documentação do modelo.

## Exemplo sanitizado

```text
Antes: function.name = "google.calendar.update_event"
Depois: function.name = "f_google_dcalendar_dupdate_uevent"
Interno restaurado antes da validação: "google.calendar.update_event"
Diagnóstico HTTP: O provedor rejeitou o nome de uma ferramenta (HTTP 400).
```

Corpos brutos de erro do provedor não são incluídos em logs nem devolvidos ao usuário. O adaptador
usa categorias limitadas (nome, schema, configuração ou solicitação genérica) e distingue 401,
403, 404, 429, 5xx e falhas de transporte. Respostas 2xx vazias/malformadas são diagnosticadas
como payload inválido, sem atribuir um status HTTP inexistente.

## Alterações e testes

- Mapeamento reversível, limitado e sem colisões de nomes OpenAI; histórico de chamadas também é
  transformado. Nomes de ferramentas retornados pelo provedor são aceitos apenas se anunciados e
  são restaurados antes da validação e execução pelo runtime Rust.
- Validação prévia das definições enviadas pelo modo agente. Aprovações, taint, auditoria, limites e
  kill switch continuam no runtime Rust.
- Teste HTTP local simulado para 400/401/403/429/500, sem ecoar conteúdo de resposta; testes de
  aliases, nomes registrados, chat sem tools e respostas vazias/inválidas.
- Nenhuma credencial foi usada e nenhuma API real foi chamada.

## Limitações

A reprodução interativa no executável Windows instalado e uma chamada real autorizada não foram
feitas. A compatibilidade com modelos OpenAI compatíveis de terceiros não pode ser concluída só
pela família de API; verificar a resposta sanitizada do endpoint específico continua necessário.
O HTTP 400 genérico permanece classificado como solicitação inválida quando o corpo não contém
marcadores seguros suficientes para atribuir uma categoria. Nenhuma mensagem ou payload privado é
preservado para diagnóstico.
