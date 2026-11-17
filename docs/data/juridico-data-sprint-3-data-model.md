# Modelo de Dados — Sprint 3

`juridico_deadline_calendars` versiona o catálogo nacional por tenant/ano;
`juridico_deadline_calendar_entries` registra feriados e overrides; e
`juridico_deadline_calculations` guarda somente parâmetros, resultado e memória
do cálculo. Todas as tabelas usam UUID, `client_id` e `database_ref` autenticado.
