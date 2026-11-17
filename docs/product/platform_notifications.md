# Platform Notifications

## Objetivo

Centralizar notificacoes in-app da Platform em um dominio transversal, mantendo modulos como Flow/Kanban, PDV e Juridico como produtores de eventos tipados. O shell Platform deve conectar uma unica vez no canal realtime global e receber notificacoes segmentadas por cliente, aplicacao/modulo e identidade.

## Decisao Arquitetural

- Usar um gateway WebSocket global da Platform (`/platform/ws`) para notificacoes.
- Persistir notificacoes em tabela global (`platform_notifications`) no banco Platform/Identity (`jboot_identity` em dev).
- Nao criar um WebSocket por modulo para notificacoes comuns.
- Usar rooms segmentadas; nunca broadcast global:
  - `notifications:client:{clientId}:identity:{identityId}`
  - `notifications:client:{clientId}:app:{applicationSlug}:identity:{identityId}`
  - `notifications:client:{clientId}:module:{moduleSlug}:identity:{identityId}`
- Modulos publicam via `PlatformNotificationsService.publish(...)`.
- O banco e fonte da verdade; WebSocket e apenas transporte realtime.

## Microtarefas

- [x] 1. Documentar arquitetura, rooms, contrato e plano de migracao.
- [x] 2. Criar migration global `platform_notifications` no banco Platform/Identity.
- [x] 3. Implementar backend `PlatformNotificationsModule` com auth JWT generico, repository, service, controller e gateway `/platform/ws`.
- [x] 4. Migrar hooks Kanban para publicar no serviço global mantendo compatibilidade operacional com o Sprint 7.
- [x] 5. Implementar frontend global `platform-notifications` client/socket e ajustar dropdown para consumir API/gateway globais.
- [x] 6. Adicionar/ajustar testes automatizados backend e frontend.
- [ ] 7. Rodar typecheck/lint/test e smoke via container (`curl`/`psql`).

## Contrato Backend

### Publish Interno

```ts
publish({
  clientId,
  applicationSlug: 'flow',
  moduleSlug: 'kanban',
  recipientIdentityId,
  actorIdentityId,
  kind: 'kanban.card.assigned',
  title: 'Voce foi atribuido a um card',
  body: null,
  entityType: 'kanban.card',
  entityId: cardId,
  actionUrl: `/flow/boards/${boardId}?card=${cardId}`,
  severity: 'info',
  payload: { boardId, cardId }
})
```

### HTTP

- `GET /notifications?applicationSlug=&moduleSlug=&unreadOnly=`
- `GET /notifications/summary?applicationSlug=&moduleSlug=`
- `PATCH /notifications/:notificationId/read`
- `PATCH /notifications/read-all`

### Realtime

- Namespace: `/platform/ws`
- Evento: `notification.created`
- Autenticacao: JWT da Platform/Identity enviado em `handshake.auth.token` ou `Authorization: Bearer`.

## Modelo De Dados

Tabela global:

- `client_id`
- `application_slug`
- `module_slug`
- `recipient_identity_id`
- `actor_identity_id`
- `kind`
- `title`
- `body`
- `entity_type`
- `entity_id`
- `action_url`
- `severity`
- `payload`
- `read_at`
- `created_at`

## Plano De Migracao Kanban

- Substituir `NotificationsService` local do Kanban por chamadas ao `PlatformNotificationsService`.
- Manter os endpoints locais do Kanban apenas se necessario para compatibilidade temporaria; o frontend novo deve consumir `/notifications`.
- Manter `CardActivity` como historico de dominio; notificacao global nao substitui auditoria/historico.
