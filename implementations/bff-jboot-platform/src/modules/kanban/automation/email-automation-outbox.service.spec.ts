import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { EmailAutomationOutboxService } from './email-automation-outbox.service';

function build(dispatchLog: Record<string, unknown>) {
  const published: string[] = [];
  const service = new EmailAutomationOutboxService(dispatchLog as never, {
    enqueueEmailDispatch: async (_ref: string, id: string) => {
      published.push(id);
    }
  } as never);
  return { service, published };
}

void test('EmailAutomationOutboxService publica cada intencao gravada para o evento', async () => {
  const { service, published } = build({ recordForActivity: async () => ['d1', 'd2'] });
  await service.recordForActivity('db-1', 'client-1', 'activity-1');
  assert.deepEqual(published, ['d1', 'd2']);
});

void test('EmailAutomationOutboxService nunca lanca no caminho do card: a varredura recupera o evento', async () => {
  const { service, published } = build({
    recordForActivity: async () => {
      throw new Error('database unavailable');
    }
  });
  await assert.doesNotReject(() => service.recordForActivity('db-1', 'client-1', 'activity-1'));
  assert.deepEqual(published, []);
});

void test('EmailAutomationOutboxService agendado lanca para a avaliacao diaria repetir', async () => {
  const { service } = build({
    recordScheduled: async () => {
      throw new Error('database unavailable');
    }
  });
  await assert.rejects(() => service.recordScheduled('db-1', 'client-1', '2026-10-17', []), /database unavailable/);
});
