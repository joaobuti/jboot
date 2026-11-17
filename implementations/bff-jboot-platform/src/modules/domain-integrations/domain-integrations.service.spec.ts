import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DomainIntegrationsService } from './domain-integrations.service';

void test('DomainIntegrationsService remains a thin facade over dedicated use cases', async () => {
  const calls: string[] = [];
  const service = new DomainIntegrationsService(
    { execute: async () => { calls.push('boards'); return { flowEnabled: true, boards: [] }; } } as never,
    { execute: async () => { calls.push('pje'); return { boardId: 'b', cardId: 'c', cardUrl: '/c', created: true }; } } as never,
    { execute: async () => { calls.push('datajud'); return { boardId: 'b', cardId: 'c', cardUrl: '/c', created: true }; } } as never,
    {
      get: async () => { calls.push('get-monitoring'); return { monitoring: false, monitorId: null, hasSource: true }; },
      set: async () => { calls.push('set-monitoring'); return { monitoring: true, monitorId: 'm' }; },
      updateCadence: async () => { calls.push('cadence'); return { monitoring: true, monitorId: 'm', cadence: 'weekly' }; }
    } as never,
    {
      options: async () => { calls.push('petition-options'); return {}; },
      send: async () => { calls.push('petition-send'); return { sent: [] }; }
    } as never
  );
  const context = {} as never;
  await service.listFlowBoards(context);
  await service.exportPjeComunicacaoToFlow(context, 'source', 'board', 'office', {});
  await service.exportDataJudProcessToFlow(context, 'snapshot', 'board', 'office', {});
  await service.getCardMonitoring(context, 'card');
  await service.setCardMonitoring(context, 'card', true);
  await service.updateCardMonitoringCadence(context, 'card', 'weekly');
  await service.getPetitionMonitoringOptions(context, 'card');
  await service.sendPetitionsToMonitoring(context, 'card', ['petition'], 'board', {});
  assert.deepEqual(calls, ['boards', 'pje', 'datajud', 'get-monitoring', 'set-monitoring', 'cadence', 'petition-options', 'petition-send']);
});
