# Google Calendar

A conexão usa o cliente OAuth desktop já configurado em **Habilidades > Integrações**. Para a API Calendar, informe somente o escopo `https://www.googleapis.com/auth/calendar.events.owned`; `calendar.events.owned.readonly` não permite operações de escrita. Habilite a Google Calendar API no projeto Google Cloud antes de conectar.

O módulo expõe as habilidades `google.calendar.list_events`, `google.calendar.create_event`, `google.calendar.update_event` e `google.calendar.delete_event`, limitadas ao calendário principal (`primary`). Leituras retornam conteúdo externo não confiável. Criação, atualização e exclusão exigem aprovação e exibem os dados do evento. A atualização lê o recurso completo e envia `If-Match` com o ETag para não sobrescrever uma edição concorrente. O calendário padrão pode encaminhar a criação local do agente ao Google Calendar quando a conexão tem o escopo necessário; a edição da tela Agenda continua usando o armazenamento local.

A criação envia ID determinístico aceito pelo formato de IDs da API. Se a resposta de criação indicar conflito, o módulo consulta o mesmo ID antes de confirmar para evitar duplicação em repetição. Datas devem conter hora e offset ISO 8601. Se o usuário não informar a duração, o agente deve perguntar.

## Documentação oficial conferida em 29/10/2026

- [Escopos OAuth da Google Calendar API](https://developers.google.com/workspace/calendar/api/auth): `calendar.events.owned` permite ver, criar, alterar e excluir eventos em calendários próprios; `calendar.events.owned.readonly` cobre somente leitura.
- [Listar eventos](https://developers.google.com/workspace/calendar/api/v3/reference/events/list): `GET /calendars/{calendarId}/events`; aceita `primary` e filtros de intervalo RFC 3339.
- [Inserir evento](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert): `POST /calendars/{calendarId}/events`; aceita o escopo de eventos próprios.
- [Atualizar evento](https://developers.google.com/workspace/calendar/api/v3/reference/events/update): `PUT /calendars/{calendarId}/events/{eventId}`; a referência recomenda GET + UPDATE com ETag para atualização atômica.
- [Excluir evento](https://developers.google.com/workspace/calendar/api/v3/reference/events/delete): `DELETE /calendars/{calendarId}/events/{eventId}`.
- [Recurso Event](https://developers.google.com/workspace/calendar/api/v3/reference/events): IDs definidos pelo cliente usam caracteres base32hex minúsculos e dígitos.

O escopo e os quatro métodos foram conferidos nas referências oficiais acima. A documentação oficial também informa que limites podem retornar HTTP 403 ou 429; o cliente lê somente o código de motivo para distinguir quota de permissão, sem exibir o corpo bruto. Teste real com conta Google, aprovação/verificação do consentimento e Credential Manager no Windows continuam pendentes.

- [Tratar erros da Calendar API](https://developers.google.com/workspace/calendar/api/guides/errors): `rateLimitExceeded` pode retornar 403 ou 429; `userRateLimitExceeded` e `quotaExceeded` também são erros de limite.
