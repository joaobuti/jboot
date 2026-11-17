import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { keyOffVisibility } from '../../../test/kanban-visibility';
import { NotificationsService } from './notifications.service';
import { PublishPlatformNotificationInput } from '../../notifications/notifications.types';

const context = {
  clientId: 'client-1',
  identityId: 'actor-1',
  databaseRef: 'db-1',
  applicationId: 'application-1',
  roles: [],
  scopes: []
};

void test('NotificationsService.notify delegates self-notification suppression to global service input', async () => {
  let publishCalls = 0;
  const platformNotifications = {
    publish: async () => {
      publishCalls += 1;
    }
  };
  const service = new NotificationsService(platformNotifications as never, keyOffVisibility(async () => ({})));

  await service.notify(context as never, {
    boardId: 'board-1',
    cardId: 'card-1',
    recipientIdentityId: 'actor-1',
    actorIdentityId: 'actor-1',
    kind: 'card.assigned',
    payload: {}
  });

  assert.equal(publishCalls, 0);
});

void test('NotificationsService.notify publishes Kanban event to global platform notifications', async () => {
  const published: PublishPlatformNotificationInput[] = [];
  const platformNotifications = {
    publish: async (input: PublishPlatformNotificationInput) => {
      published.push(input);
    }
  };
  const service = new NotificationsService(platformNotifications as never, keyOffVisibility(async () => ({})));

  await service.notify(context as never, {
    boardId: 'board-1',
    cardId: 'card-1',
    recipientIdentityId: 'recipient-1',
    actorIdentityId: 'actor-1',
    kind: 'card.assigned',
    payload: {}
  });

  assert.equal(published.length, 1);
  assert.equal(published[0].clientId, 'client-1');
  assert.equal(published[0].applicationSlug, 'flow');
  assert.equal(published[0].moduleSlug, 'kanban');
  assert.equal(published[0].recipientIdentityId, 'recipient-1');
  assert.equal(published[0].kind, 'kanban.card.assigned');
  assert.equal(published[0].actionUrl, '/flow/boards/board-1?card=card-1');
});

void test('NotificationsService.notify publica rejeicao de documento com titulo proprio', async () => {
  const published: PublishPlatformNotificationInput[] = [];
  const service = new NotificationsService(
    {
      publish: async (input: PublishPlatformNotificationInput) => {
        published.push(input);
      }
    } as never,
    keyOffVisibility(async () => ({}))
  );
  await service.notify(context as never, {
    boardId: 'board-1',
    cardId: 'card-1',
    recipientIdentityId: 'creator-1',
    actorIdentityId: 'actor-1',
    kind: 'card.document_rejected',
    payload: { documentId: 'doc-1' }
  });
  assert.equal(published[0].kind, 'kanban.card.document_rejected');
  assert.equal(published[0].title, 'Documento rejeitado em card seu');
});

void test('NotificationsService.notify: kinds do lead (Sprint 4) com titulo proprio e payload so com ids/motivo', async () => {
  const published: PublishPlatformNotificationInput[] = [];
  const service = new NotificationsService(
    { publish: async (input: PublishPlatformNotificationInput) => void published.push(input) } as never,
    keyOffVisibility(async () => ({}))
  );
  for (const kind of ['card.lead_submitted', 'card.lead_returned'] as const) {
    await service.notify(context as never, {
      boardId: 'board-1',
      cardId: 'card-1',
      recipientIdentityId: 'recipient-1',
      actorIdentityId: 'actor-1',
      kind,
      payload: kind === 'card.lead_returned' ? { submissionId: 's-1', reason: 'motivo' } : { submissionId: 's-1' }
    });
  }
  assert.deepEqual(
    published.map((entry) => [entry.kind, entry.title]),
    [
      ['kanban.card.lead_submitted', 'Novo lead enviado para analise'],
      ['kanban.card.lead_returned', 'Lead devolvido ao escritorio']
    ]
  );
  assert.deepEqual(published[1].payload, { boardId: 'board-1', cardId: 'card-1', submissionId: 's-1', reason: 'motivo' });
});
