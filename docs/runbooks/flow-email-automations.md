# Runbook: Envios Das Automacoes De E-mail Do Flow

Sprint 13 de `docs/product/kanban-sprints.md`. Contrato HTTP em
`docs/api/kanban-sprint-13-openapi.yaml`.

## Como Funciona

1. O evento do card (`card.moved`, gravado na mesma transacao da movimentacao,
   ou `juridico_process_changed`) e a fonte da verdade.
2. Logo apos o evento, `EmailAutomationOutboxService` deriva uma linha
   `pending` em `kanban_automation_dispatch_log` por regra de e-mail ativa e
   publica o id na fila `kanban-column-automation` (Valkey).
3. A varredura `recover-email-dispatches` roda a cada minuto: recria a linha de
   evento das ultimas 24 h que ficou sem intencao, republica o que esta vencido
   e mede o backlog.
4. O worker retoma a linha, le regra/card/destinatarios naquele momento, envia
   a quem ainda nao recebeu (`kanban_automation_dispatch_recipients`) e fecha a
   linha.
5. Falha: nova tentativa em 1, 2, 4 e 8 minutos; a quinta falha deixa a linha
   `failed`. Linha `processing` parada ha 5 minutos e retomada.
6. Agendados (`due_date_approaching`, `card_stale`): a avaliacao diaria das
   06:00 (America/Sao_Paulo) grava as linhas do dia; o job tem 3 tentativas e a
   insercao e idempotente por dia.

Estados: `pending` (na fila ou aguardando nova tentativa), `processing`,
`sent`, `skipped` (regra desativada, card ou evento removido) e `failed`.

## Sinais E Alertas

Metricas OpenTelemetry (exportadas pelo coletor configurado em `tracing.ts`):

| Metrica | Tipo | Atributos |
|---|---|---|
| `kanban.automation.email.dispatches` | contador | `outcome`: `sent`, `skipped`, `retry_scheduled`, `failed` |
| `kanban.automation.email.backlog` | gauge (ultima varredura) | `status`: `pending`, `processing`, `failed` |
| `kanban.automation.email.oldest_pending_age` | gauge, segundos | — |

Sem atributo de tenant, card ou destinatario.

Alertas sugeridos:

- `failed` do backlog subiu e ficou acima de zero por 15 min: falha terminal
  aguardando acao humana;
- `oldest_pending_age` acima de 900 s: fila parada (Valkey, worker ou SMTP);
- taxa de `retry_scheduled` acima de 20% dos resultados em 15 min: SMTP
  instavel.

Tela: `Configuracoes > Envios de e-mail` (`flow:admin`) mostra os contadores,
as falhas e a fila.

## Diagnostico

| Sintoma | Causa provavel | Acao |
|---|---|---|
| Fila crescendo e nada sendo enviado | Valkey ou worker parado | Verificar `valkey` e o processo `platform-api`; ao voltar, a varredura republica sozinha |
| Muitas `retry_scheduled` com erro de conexao | SMTP indisponivel ou credencial errada (`SMTP_*`) | Corrigir o SMTP; as linhas seguem as tentativas restantes |
| `failed` com `Recipient address rejected` | E-mail do usuario invalido no Identity | Corrigir o cadastro e usar Reprocessar |
| `failed` com `stuck_before_outbox` | Linha presa antes desta sprint (migration 088) | Reprocessar se o envio ainda fizer sentido |
| `skipped` com `rule_inactive` | Regra desativada/removida antes do envio | Esperado; nada a fazer |

## Reprocessar

Pela tela (botao Reprocessar) ou
`POST /kanban/automation-dispatches/{id}/retry`. So linha `failed`; exige
`flow:admin`, ver o card e ser `board_admin` do quadro. Zera as tentativas e
fica na auditoria (`kanban_automation_dispatch_retried`). Quem ja recebeu nao
recebe de novo.

Consulta direta (somente leitura):

```sql
SELECT status, count(*), min(created_at) FILTER (WHERE status = 'pending')
FROM kanban_automation_dispatch_log
WHERE client_id = '<client>' GROUP BY status;
```

## Deploy

Instancia antiga (antes da Sprint 13) ignora os jobs novos
(`process-email-dispatch`, `recover-email-dispatches`) e os conclui sem enviar.
Durante um deploy gradual o envio so atrasa: a linha continua `pending` e a
varredura das instancias novas republica a cada minuto. Jobs legados ja
enfileirados viram linha do outbox na instancia nova.

## Limites Conhecidos

- Entrega pelo menos uma vez: queda entre o aceite do SMTP e o registro do
  destinatario pode repetir um e-mail.
- Sem tratamento de bounce nem reputacao de dominio (SMTP generico).
- A varredura so recria intencao de eventos das ultimas 24 h.
