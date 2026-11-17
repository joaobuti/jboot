import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ProcessMonitoringDeliveryRegistry } from '../../process-monitoring/process-monitoring-delivery.registry';
import { FlowProcessMovementDelivery } from './flow-process-movement.delivery';

const notification = {
  clientId: 'client-1',
  monitorId: 'monitor-1',
  requestedByIdentityId: 'identity-1',
  destinationRef: { databaseRef: 'flow-db', boardId: 'board-1', cardId: 'card-1' },
  numeroProcesso: '0701234-77.2026.8.04.0001',
  tribunal: 'TJAM',
  processFingerprint: 'f'.repeat(64),
  newMovements: [{ occurredAt: '2026-11-08T10:00:00Z', description: 'Juntada de peticao' }]
};

void test('registra o evento no card de destino com a chave de antes da capacidade e enfileira e-mails', async () => {
  const order: string[] = [];
  let input: Record<string, unknown> | undefined;
  const registry = new ProcessMonitoringDeliveryRegistry();
  const delivery = new FlowProcessMovementDelivery(
    registry,
    { recordIntegrationEvent: async (value: Record<string, unknown>) => { input = value; order.push('event'); return { id: 'activity-1' }; } } as never,
    { findById: async () => ({ boardColumnId: 'column-1' }) } as never,
    { recordForActivity: async (_db: string, _client: string, activityId: string) => { order.push(`outbox:${activityId}`); } } as never,
    { record: async (value: { source: string }) => { order?.push?.(`bell:${value.source}`); } } as never
  );
  delivery.onModuleInit();
  assert.equal(await registry.deliver('flow', notification), true);
  assert.deepEqual(order, ['event', 'outbox:activity-1', 'bell:datajud']);
  assert.equal(input?.cardId, 'card-1');
  assert.equal(input?.databaseRef, 'flow-db');
  assert.equal(input?.authorIdentityId, 'identity-1');
  assert.equal(input?.kind, 'juridico_process_changed');
  assert.equal(input?.integrationKey, `juridico-process:monitor-1:${'f'.repeat(64)}`);
  assert.equal((input?.payload as Record<string, unknown>).boardColumnId, 'column-1');
});

void test('destino sem card e recusado sem gravar evento', async () => {
  let recorded = false;
  const delivery = new FlowProcessMovementDelivery(
    new ProcessMonitoringDeliveryRegistry(),
    { recordIntegrationEvent: async () => { recorded = true; return { id: 'a' }; } } as never,
    { findById: async () => null } as never,
    { recordForActivity: async () => undefined } as never,
    { record: async () => undefined } as never
  );
  await assert.rejects(delivery.deliver({ ...notification, destinationRef: { databaseRef: 'flow-db' } }), /without card/);
  assert.equal(recorded, false);
});

void test('publicacao nova do DJEN: um evento por publicacao, com chave propria, e intencao de e-mail', async () => {
  const order: string[] = [];
  const inputs: Array<Record<string, unknown>> = [];
  const registry = new ProcessMonitoringDeliveryRegistry();
  const delivery = new FlowProcessMovementDelivery(
    registry,
    {
      recordIntegrationEvent: async (value: Record<string, unknown>) => {
        inputs.push(value);
        order.push('event');
        return { id: `activity-${inputs.length}` };
      }
    } as never,
    { findById: async () => ({ boardColumnId: 'column-1' }) } as never,
    { recordForActivity: async (_db: string, _client: string, activityId: string) => { order.push(`outbox:${activityId}`); } } as never,
    { record: async (value: { source: string }) => { order?.push?.(`bell:${value.source}`); } } as never
  );
  delivery.onModuleInit();
  const publication = (id: string) => ({ id, availableOn: '2026-11-09', communicationType: 'Intimação', documentType: 'Decisão', courtName: 'Vara', excerpt: 'Intime-se.' });
  assert.equal(
    await registry.deliverPublications('flow', {
      clientId: 'client-1',
      monitorId: 'monitor-1',
      requestedByIdentityId: 'identity-1',
      destinationRef: { databaseRef: 'flow-db', boardId: 'board-1', cardId: 'card-1' },
      numeroProcesso: '0701234-77.2026.8.04.0001',
      publications: [publication('p1'), publication('p2')]
    }),
    true
  );
  assert.deepEqual(order, ['event', 'outbox:activity-1', 'event', 'outbox:activity-2', 'bell:djen']);
  assert.equal(inputs[0]?.kind, 'djen_publication_received');
  assert.equal(inputs[1]?.integrationKey, 'djen-publication:monitor-1:p2');
  assert.equal((inputs[0]?.payload as Record<string, unknown>).boardColumnId, 'column-1');
});
