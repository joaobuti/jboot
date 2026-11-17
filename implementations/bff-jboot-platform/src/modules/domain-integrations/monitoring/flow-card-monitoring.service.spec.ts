import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FlowCardMonitoringService } from './flow-card-monitoring.service';

type Monitor = { id: string; state: string; cadence: string; lastRunStatus?: string | null; lastCheckedAt?: string | null; nextCheckAt?: string | null; datajudEnabled?: boolean; djenCadenceDays?: number; djenLastRunStatus?: string | null; djenLastCheckedAt?: string | null; djenNextCheckOn?: string | null };

function fixture(
  overrides: {
    allowBoard?: boolean;
    hiddenCard?: boolean;
    juridico?: boolean;
    link?: { monitorId: string | null; snapshotId: string | null; boardId?: string; flowDatabaseRef?: string } | null;
    monitorByCard?: (cardId: string) => Monitor | null;
    contracted?: boolean;
    publications?: boolean;
    ensure?: (who: unknown, input: unknown) => Promise<{ id: string; created: boolean }>;
  } = {}
) {
  const calls: string[] = [];
  const caller = {
    identityId: randomUUID(), clientId: randomUUID(), applicationId: randomUUID(),
    databaseRef: randomUUID(), scopes: ['flow:read', 'flow:write'], roles: []
  };
  const flow = { ...caller };
  const boardId = randomUUID();
  const juridico = { ...caller, applicationId: randomUUID(), databaseRef: randomUUID(), scopes: ['juridico:read'] };
  const link = overrides.link === undefined ? null : overrides.link && {
    id: randomUUID(), tribunal: 'TJSC', boardId, flowDatabaseRef: flow.databaseRef, ...overrides.link
  };
  const service = new FlowCardMonitoringService(
    {
      requireCaller: async () => flow,
      requireApplication: async () => {
        calls.push('juridico');
        if (overrides.juridico === false) throw new ForbiddenException();
        return juridico;
      }
    } as never,
    {
      findExportByCard: async () => link,
      setExportMonitor: async (_ref: string, _client: string, cardId: string, monitorId: string) => { calls.push(`link:${cardId}:${monitorId}`); }
    } as never,
    { findByIdForClient: async () => ({ id: 'card', boardId }) } as never,
    {
      requireRole: async () => {
        if (overrides.allowBoard === false) throw new ForbiddenException();
        return 'board_member';
      }
    } as never,
    {
      requireVisibleCard: async () => {
        if (overrides.allowBoard === false) throw new ForbiddenException();
        if (overrides.hiddenCard) throw new NotFoundException('Card not found');
        return { id: 'card', boardId };
      }
    } as never,
    {
      findByDestinationCard: async (_who: unknown, _db: string, cardId: string) => {
        const found = overrides.monitorByCard?.(cardId);
        return found ? { datajudEnabled: true, djenCadenceDays: 1, ...found } : null;
      },
      ensureActive: overrides.ensure ?? (async () => ({ id: 'created', created: true })),
      setSource: async (_who: unknown, id: string, source: string, enabled: boolean) => { calls.push(`${source}:${id}:${enabled}`); return { id, state: 'active', cadence: 'daily', datajudEnabled: true, djenCadenceDays: 1 }; },
      setDjenCadence: async (_who: unknown, id: string, days: number) => { calls.push(`djen-cadence:${id}:${days}`); return { id, state: 'active', cadence: 'daily', datajudEnabled: true, djenCadenceDays: days }; },
      isEnabled: async () => overrides.contracted ?? true,
      sources: async () => ({ publicationsAvailable: overrides.publications ?? false, djenActive: overrides.publications ?? false }),
      processDetails: async () => ({ filedAt: '2026-07-17T16:35:27Z', className: 'Classe', courtName: 'Vara', systemName: 'Projudi' }),
      lookupPublications: async (_who: unknown, id: string, movementId: string) => { calls.push(`lookup:${id}:${movementId}`); return { from: 'a', to: 'b', items: [] }; },
      setCadence: async (_who: unknown, id: string, cadence: string) => { calls.push(`cadence:${id}:${cadence}`); return { id, state: 'active', cadence }; },
      processMovements: async (who: { product: string }, id: string) => { calls.push(`movements:${who.product}:${id}`); return [{ id: 'mv', description: 'Juntada', occurredAt: null, isNew: false }]; }
    } as never,
    { getManualSnapshot: async () => ({ processNumberCiphertext: Buffer.from('x'), tribunal: 'TJSC' }) } as never,
    { decrypt: () => '07012347720268040001' } as never
  );
  return { caller, service, calls, boardId };
}

void test('card com acompanhamento da capacidade nao consulta o Juridico', async () => {
  const { caller, service, calls } = fixture({ monitorByCard: () => ({ id: 'm-1', state: 'active', cadence: 'weekly' }), juridico: false });
  assert.deepEqual(await service.get(caller, randomUUID()), {
    monitoring: true, monitorId: 'm-1', hasSource: true, contracted: true, cadence: 'weekly', lastCheck: null, nextCheckAt: undefined,
    djen: { available: false, enabled: false, cadenceDays: 1, lastCheck: null, nextCheckOn: undefined },
    process: { filedAt: '2026-07-17T16:35:27Z', className: 'Classe', courtName: 'Vara', systemName: 'Projudi' }
  });
  assert.deepEqual(calls, []);
});

void test('card mostra a ultima consulta e a proxima', async () => {
  const { caller, service } = fixture({
    monitorByCard: () => ({ id: 'm-1', state: 'active', cadence: 'daily', lastRunStatus: 'timeout', lastCheckedAt: '2026-11-08T20:04:30Z', nextCheckAt: '2026-11-09T20:04:30Z' })
  });
  const state = await service.get(caller, randomUUID());
  assert.deepEqual(state.lastCheck, { status: 'timeout', checkedAt: '2026-11-08T20:04:30Z' });
  assert.equal(state.nextCheckAt, '2026-11-09T20:04:30Z');
});

void test('acompanhamento pausado aparece sem cadencia', async () => {
  const { caller, service } = fixture({ monitorByCard: () => ({ id: 'm-1', state: 'paused', cadence: 'weekly' }) });
  const state = await service.get(caller, randomUUID());
  assert.equal(state.monitoring, false);
  assert.equal('cadence' in state, false);
});

void test('cliente so com Flow: card sem acompanhamento nem origem nao tem o que monitorar', async () => {
  const { caller, service } = fixture({ juridico: false });
  assert.deepEqual(await service.get(caller, randomUUID()), { monitoring: false, monitorId: null, hasSource: false, contracted: true });
  await assert.rejects(() => service.set(caller, randomUUID(), true), NotFoundException);
});

void test('olho do DataJud liga e desliga so a fonte DataJud, pelo card', async () => {
  const { caller, service, calls } = fixture({ monitorByCard: () => ({ id: 'm-1', state: 'active', cadence: 'daily' }) });
  assert.deepEqual(await service.set(caller, randomUUID(), false), { monitoring: false, monitorId: 'm-1' });
  assert.deepEqual(await service.set(caller, randomUUID(), true), { monitoring: true, monitorId: 'm-1' });
  assert.deepEqual(calls, ['datajud:m-1:false', 'datajud:m-1:true']);
});

void test('sem contratar: DataJud aparece inativo e marcado como nao contratado', async () => {
  const { caller, service } = fixture({ contracted: false, monitorByCard: () => ({ id: 'm-1', state: 'active', cadence: 'weekly' }) });
  const state = await service.get(caller, randomUUID());
  assert.equal(state.contracted, false);
  assert.equal(state.monitoring, false);
  assert.equal('cadence' in state, false);
});

void test('DJEN: sem a capacidade vem indisponivel (bloqueado na tela); olho e frequencia pelo card', async () => {
  const without = fixture({ monitorByCard: () => ({ id: 'm-1', state: 'active', cadence: 'daily', datajudEnabled: true, djenCadenceDays: 1 }) });
  assert.equal((await without.service.get(without.caller, randomUUID())).djen?.available, false);
  const withDjen = fixture({
    publications: true,
    monitorByCard: () => ({ id: 'm-1', state: 'active', cadence: 'daily', datajudEnabled: false, djenCadenceDays: 3, djenLastRunStatus: 'success', djenLastCheckedAt: '2026-11-09T10:00:00Z', djenNextCheckOn: '2026-11-12' })
  });
  const state = await withDjen.service.get(withDjen.caller, randomUUID());
  assert.equal(state.monitoring, false);
  assert.deepEqual(state.djen, { available: true, enabled: true, cadenceDays: 3, lastCheck: { status: 'success', checkedAt: '2026-11-09T10:00:00Z' }, nextCheckOn: '2026-11-12' });
  await withDjen.service.setDjen(withDjen.caller, randomUUID(), false);
  await withDjen.service.updateDjenCadence(withDjen.caller, randomUUID(), 7);
  assert.deepEqual(withDjen.calls, ['djen:m-1:false', 'djen-cadence:m-1:7']);
});

void test('card exportado do DataJud sem acompanhamento cria na capacidade com destino no card e grava o vinculo', async () => {
  const ensured: unknown[] = [];
  const cardId = randomUUID();
  const { caller, service, calls, boardId } = fixture({
    link: { monitorId: null, snapshotId: randomUUID() },
    ensure: async (who, input) => { ensured.push([who, input]); return { id: 'created', created: true }; }
  });
  assert.deepEqual(await service.set(caller, cardId, true), { monitoring: true, monitorId: 'created' });
  const [who, input] = ensured[0] as [Record<string, unknown>, Record<string, unknown>];
  assert.equal(who.product, 'flow');
  assert.deepEqual(input.destinationRef, { databaseRef: caller.databaseRef, boardId, cardId });
  assert.equal(input.processNumber, '07012347720268040001');
  assert.ok(calls.includes(`link:${cardId}:created`));
});

void test('vinculo de outro quadro nao vale como origem', async () => {
  const { caller, service } = fixture({ link: { monitorId: null, snapshotId: randomUUID(), boardId: randomUUID() } });
  await assert.rejects(() => service.set(caller, randomUUID(), true), NotFoundException);
});

void test('processo ja acompanhado no Juridico nao ganha segundo acompanhamento pelo card', async () => {
  const { caller, service } = fixture({
    link: { monitorId: null, snapshotId: randomUUID() },
    ensure: async () => { throw new ConflictException({ code: 'process_monitor_in_use', destinationProduct: 'juridico' }); }
  });
  await assert.rejects(() => service.set(caller, randomUUID(), true), ConflictException);
});

void test('cadencia muda so o acompanhamento do proprio card', async () => {
  const cardA = randomUUID();
  const { caller, service, calls } = fixture({
    monitorByCard: (cardId) => (cardId === cardA ? { id: 'm-a', state: 'active', cadence: 'daily' } : { id: 'm-b', state: 'active', cadence: 'daily' })
  });
  assert.deepEqual(await service.updateCadence(caller, cardA, 'monthly'), { monitoring: true, monitorId: 'm-a', cadence: 'monthly' });
  assert.deepEqual(calls, ['cadence:m-a:monthly']);
});

void test('cadencia sem acompanhamento ativo e 404', async () => {
  const { caller, service } = fixture({ monitorByCard: () => ({ id: 'm', state: 'paused', cadence: 'daily' }) });
  await assert.rejects(() => service.updateCadence(caller, randomUUID(), 'monthly'), NotFoundException);
});

void test('card invisivel (escritorio) ou sem papel no quadro', async () => {
  const hidden = fixture({ hiddenCard: true });
  await assert.rejects(() => hidden.service.get(hidden.caller, randomUUID()), NotFoundException);
  const outsider = fixture({ allowBoard: false });
  await assert.rejects(() => outsider.service.set(outsider.caller, randomUUID(), true), ForbiddenException);
});

void test('movimentacoes do processo vem da capacidade pelo card, sem Juridico', async () => {
  const { caller, service, calls } = fixture({ monitorByCard: () => ({ id: 'm-1', state: 'paused', cadence: 'daily' }), juridico: false });
  assert.deepEqual(await service.movements(caller, randomUUID()), { items: [{ id: 'mv', description: 'Juntada', occurredAt: null, isNew: false }] });
  assert.deepEqual(calls, ['movements:flow:m-1']);
});

void test('card sem acompanhamento devolve lista vazia; card invisivel e 404', async () => {
  const { caller, service } = fixture();
  assert.deepEqual(await service.movements(caller, randomUUID()), { items: [] });
  const hidden = fixture({ hiddenCard: true });
  await assert.rejects(() => hidden.service.movements(hidden.caller, randomUUID()), NotFoundException);
});

void test('Ver no DJEN pelo card usa o acompanhamento do proprio card', async () => {
  const { caller, service, calls } = fixture({ monitorByCard: () => ({ id: 'm-1', state: 'active', cadence: 'daily' }) });
  await service.lookupPublications(caller, randomUUID(), 'mv-1');
  assert.deepEqual(calls, ['lookup:m-1:mv-1']);
  const none = fixture();
  await assert.rejects(() => none.service.lookupPublications(none.caller, randomUUID(), 'mv-1'), NotFoundException);
});
