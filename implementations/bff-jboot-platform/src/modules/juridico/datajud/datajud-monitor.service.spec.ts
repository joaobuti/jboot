import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ProcessMonitoringDeliveryRegistry } from '../../process-monitoring/process-monitoring-delivery.registry';
import { DataJudMonitorService } from './datajud-monitor.service';

const context = {
  identityId: '11111111-1111-1111-1111-111111111111',
  clientId: '22222222-2222-2222-2222-222222222222',
  applicationId: '33333333-3333-3333-3333-333333333333',
  databaseRef: '44444444-4444-4444-4444-444444444444',
  scopes: ['juridico:read', 'juridico:write'],
  roles: [],
};

const view = {
  id: 'm-1', tribunal: 'TJSC', cadence: 'daily', state: 'active', originProduct: 'juridico', destinationProduct: 'juridico',
  destinationRef: { databaseRef: context.databaseRef }, lastCheckedAt: null, nextCheckAt: null, lastRunStatus: null, datajudEnabled: true, djenEnabled: null, djenCadenceDays: 1, djenLastCheckedAt: null, djenNextCheckOn: null, djenLastRunStatus: null, pausedAt: null, createdAt: 'c', updatedAt: 'u',
};

void test('a tela Acompanhamentos cria na capacidade com destino Juridico e devolve o formato antigo, sem a referencia', async () => {
  const calls: unknown[][] = [];
  const service = new DataJudMonitorService(
    { create: async (...args: unknown[]) => { calls.push(args); return view; } } as never,
    new ProcessMonitoringDeliveryRegistry(),
  );
  const row = await service.create(context, { processNumber: '0000000-00.0000.0.00.0000', cadence: 'daily' });
  const [caller, input] = calls[0] as [Record<string, unknown>, Record<string, unknown>];
  assert.deepEqual(caller, { clientId: context.clientId, identityId: context.identityId, product: 'juridico' });
  assert.deepEqual(input.destinationRef, { databaseRef: context.databaseRef });
  assert.equal('destinationRef' in row, false);
  assert.equal(row.deletedAt, null);
});

void test('pausar e trocar cadencia passam pela capacidade como Juridico', async () => {
  const calls: string[] = [];
  const service = new DataJudMonitorService(
    {
      setCadence: async (_c: unknown, id: string, cadence: string) => { calls.push(`cadence:${id}:${cadence}`); return view; },
      pause: async (_c: unknown, id: string) => { calls.push(`pause:${id}`); return { ...view, state: 'paused' }; },
    } as never,
    new ProcessMonitoringDeliveryRegistry(),
  );
  const row = await service.update(context, 'm-1', { cadence: 'weekly', state: 'paused' });
  assert.deepEqual(calls, ['cadence:m-1:weekly', 'pause:m-1']);
  assert.equal(row.state, 'paused');
});

void test('registra o destino Juridico para a entrega nao cair sem adaptador', async () => {
  const registry = new ProcessMonitoringDeliveryRegistry();
  new DataJudMonitorService({} as never, registry).onModuleInit();
  assert.equal(
    await registry.deliver('juridico', { clientId: 'c', monitorId: 'm', requestedByIdentityId: 'i', destinationRef: { databaseRef: 'd' }, numeroProcesso: '', tribunal: 'TJSC', processFingerprint: '', newMovements: [] }),
    true,
  );
});
