import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PlatformNotificationsService } from './platform-notifications.service';

void test('PlatformNotificationsService.publish skips self-notifications', async () => {
  let createCalls = 0;
  let emitCalls = 0;
  const repository = {
    create: async () => {
      createCalls += 1;
      return {};
    }
  };
  const gateway = {
    emitNotification: () => {
      emitCalls += 1;
    }
  };
  const service = new PlatformNotificationsService(repository as never, gateway as never);

  await service.publish({
    clientId: 'client-1',
    applicationSlug: 'flow',
    moduleSlug: 'kanban',
    recipientIdentityId: 'identity-1',
    actorIdentityId: 'identity-1',
    kind: 'kanban.card.assigned',
    title: 'Assigned'
  });

  assert.equal(createCalls, 0);
  assert.equal(emitCalls, 0);
});

void test('PlatformNotificationsService.publish persists then emits notification', async () => {
  const persisted = { id: 'notification-1' };
  let emitted: unknown = null;
  const repository = {
    create: async () => persisted
  };
  const gateway = {
    emitNotification: (notification: unknown) => {
      emitted = notification;
    }
  };
  const service = new PlatformNotificationsService(repository as never, gateway as never);

  await service.publish({
    clientId: 'client-1',
    applicationSlug: 'flow',
    moduleSlug: 'kanban',
    recipientIdentityId: 'identity-2',
    actorIdentityId: 'identity-1',
    kind: 'kanban.card.assigned',
    title: 'Assigned'
  });

  assert.equal(emitted, persisted);
});
