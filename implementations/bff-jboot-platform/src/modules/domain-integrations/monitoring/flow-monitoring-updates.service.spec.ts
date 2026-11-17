import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { FlowMonitoringUpdatesService, monitoringUpdatesKey } from './flow-monitoring-updates.service';

const NOW = Date.parse('2026-11-11T15:00:00Z'); // 12h em Brasilia

function build(options: { datajud?: boolean; djen?: boolean; hidden?: string[] } = {}) {
  const store = new Map<string, Map<string, string>>();
  const fake = {
    multi() {
      const ops: Array<() => void> = [];
      const chain = {
        hset: (key: string, field: string, value: string) => { ops.push(() => { if (!store.has(key)) store.set(key, new Map()); store.get(key)!.set(field, value); }); return chain; },
        expire: () => chain,
        exec: async () => { ops.forEach((op) => op()); return []; }
      };
      return chain;
    },
    hgetall: async (key: string) => Object.fromEntries(store.get(key) ?? new Map())
  };
  const service = new FlowMonitoringUpdatesService(
    { redisUrl: 'redis://x' } as never,
    { requireCaller: async () => ({ databaseRef: 'ref' }) } as never,
    {
      requireVisibleCard: async (_ctx: unknown, _board: string, cardId: string) => {
        if (options.hidden?.includes(cardId)) throw new NotFoundException('Card not found');
        return { title: `Cliente ${cardId}` };
      }
    } as never,
    { isEnabled: async () => options.datajud ?? true, publicationsEnabled: async () => options.djen ?? true } as never
  );
  (service as unknown as { client: unknown }).client = fake;
  return { service, store };
}

const caller = { clientId: 'client', identityId: 'user' } as never;

void test('sino: conta processos do dia por fonte, um por card, so os que o usuario ve', async () => {
  const { service, store } = build({ hidden: ['c3'] });
  await service.record({ clientId: 'client', source: 'datajud', cardId: 'c1', boardId: 'b', processNumber: '0000001-00.2026.8.26.0100' }, NOW);
  await service.record({ clientId: 'client', source: 'datajud', cardId: 'c1', boardId: 'b', processNumber: '0000001-00.2026.8.26.0100' }, NOW + 1000);
  await service.record({ clientId: 'client', source: 'djen', cardId: 'c2', boardId: 'b', processNumber: '0000002-00.2026.8.26.0100' }, NOW);
  await service.record({ clientId: 'client', source: 'djen', cardId: 'c3', boardId: 'b', processNumber: '0000003-00.2026.8.26.0100' }, NOW);
  assert.ok(store.has(monitoringUpdatesKey('client', '2026-11-11', 'datajud')));
  const today = await service.today(caller, NOW);
  assert.equal(today.date, '2026-11-11');
  assert.equal(today.total, 2);
  assert.deepEqual(today.datajud.items.map((item) => [item.cardId, item.title]), [['c1', 'Cliente c1']]);
  assert.deepEqual(today.djen.items.map((item) => item.cardId), ['c2']);
});

void test('sino: fonte sem capacidade contratada nao aparece nem conta', async () => {
  const { service } = build({ djen: false });
  await service.record({ clientId: 'client', source: 'djen', cardId: 'c2', boardId: 'b', processNumber: 'x' }, NOW);
  const today = await service.today(caller, NOW);
  assert.equal(today.djen.enabled, false);
  assert.equal(today.total, 0);
});

void test('sino: dia seguinte comeca zerado (dia de Brasilia)', async () => {
  const { service } = build();
  await service.record({ clientId: 'client', source: 'datajud', cardId: 'c1', boardId: 'b', processNumber: 'x' }, NOW);
  assert.equal((await service.today(caller, NOW + 24 * 3600 * 1000)).total, 0);
});
