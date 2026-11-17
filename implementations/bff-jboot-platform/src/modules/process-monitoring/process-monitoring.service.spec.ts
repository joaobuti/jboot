import { strict as assert } from 'node:assert';
import { ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { test } from 'node:test';
import { ProcessMonitoringDeliveryRegistry } from './process-monitoring-delivery.registry';
import { ProcessMonitoringService } from './process-monitoring.service';
import { ProcessMonitorView, ProcessMovementNotification } from './process-monitoring.types';

const CLIENT = '22222222-2222-2222-2222-222222222222';
const flowCaller = { clientId: CLIENT, identityId: '11111111-1111-1111-1111-111111111111', product: 'flow' as const };
const juridicoCaller = { ...flowCaller, product: 'juridico' as const };
const card = { databaseRef: 'flow-db', boardId: 'board-1', cardId: 'card-1' };
const config = { juridicoDataAuditHmacKey: 'key', juridicoDataAuditHmacKeyVersion: 1, juridicoMonitorEncryptionKeyVersion: 1 };

function monitor(overrides: Partial<ProcessMonitorView> = {}): ProcessMonitorView {
  return {
    id: 'monitor-1', tribunal: 'TJAM', cadence: 'daily', state: 'active', originProduct: 'flow', destinationProduct: 'flow',
    destinationRef: card, lastCheckedAt: null, nextCheckAt: null, lastRunStatus: null, datajudEnabled: true, djenEnabled: null, djenCadenceDays: 1, djenLastCheckedAt: null, djenNextCheckOn: null, djenLastRunStatus: null, pausedAt: null, createdAt: '', updatedAt: '', ...overrides
  };
}

function build(options: {
  enabled?: boolean;
  publications?: boolean;
  live?: ProcessMonitorView | null;
  repository?: Record<string, unknown>;
  workflow?: Record<string, unknown>;
  dataJud?: Record<string, unknown>;
  delivery?: ProcessMonitoringDeliveryRegistry;
} = {}) {
  const calls: { created: Record<string, unknown>[]; started: string[]; stopped: unknown[][]; deleted: string[]; states: unknown[][] } = {
    created: [], started: [], stopped: [], deleted: [], states: []
  };
  const repository = {
    findLiveByHmac: async () => options.live ?? null,
    find: async () => options.live ?? null,
    create: async (input: Record<string, unknown>) => { calls.created.push(input); return monitor({ id: 'created', destinationRef: input.destinationRef as never }); },
    setState: async (_c: string, id: string, state: string) => { calls.states.push([id, state]); return monitor({ id, state: state as never }); },
    markDeleted: async (_c: string, id: string) => { calls.deleted.push(id); return true; },
    recordEvent: async () => undefined,
    ...options.repository
  };
  const workflow = {
    start: async (_c: string, id: string) => { calls.started.push(id); },
    stop: async (...args: unknown[]) => { calls.stopped.push(args); },
    ...options.workflow
  };
  const capability = {
    require: async () => { if (options.enabled === false) throw new ForbiddenException({ code: 'process_monitoring_not_contracted' }); },
    isEnabled: async () => options.enabled !== false,
    publicationsEnabled: async () => options.publications ?? false,
    requirePublications: async () => { if (!options.publications) throw new ForbiddenException({ code: 'process_publications_not_contracted' }); }
  };
  const crypto = { encrypt: (_c: string, value: string) => Buffer.from(`enc:${value}`), decrypt: () => '07012347720268040001' };
  const service = new ProcessMonitoringService(
    repository as never, crypto as never, capability as never, workflow as never,
    options.delivery ?? new ProcessMonitoringDeliveryRegistry(), (options.dataJud ?? {}) as never, config as never
  );
  return { service, calls };
}

const input = { processNumber: '0701234-77.2026.8.04.0001', tribunal: 'tjam', cadence: 'daily' as const, destinationRef: card };

void test('criar exige a capacidade monitoramento-processual do cliente', async () => {
  const { service, calls } = build({ enabled: false });
  await assert.rejects(service.ensureActive(flowCaller, input), ForbiddenException);
  assert.equal(calls.created.length, 0);
});

void test('cria com origem e destino do produto chamador, CNJ cifrado e HMAC, e agenda o workflow', async () => {
  const { service, calls } = build();
  assert.deepEqual(await service.ensureActive(flowCaller, input), { id: 'created', created: true });
  const created = calls.created[0]!;
  assert.equal(created.originProduct, 'flow');
  assert.equal(created.destinationProduct, 'flow');
  assert.deepEqual(created.destinationRef, card);
  assert.equal(created.tribunal, 'TJAM');
  assert.equal((created.ciphertext as Buffer).toString(), 'enc:07012347720268040001');
  assert.match(String(created.hmac), /^[a-f0-9]{64}$/);
  assert.deepEqual(calls.started, ['created']);
});

void test('mesmo destino reaproveita o acompanhamento, retomando o pausado', async () => {
  const { service, calls } = build({ live: monitor({ state: 'paused' }) });
  assert.deepEqual(await service.ensureActive(flowCaller, input), { id: 'monitor-1', created: false });
  assert.deepEqual(calls.states, [['monitor-1', 'active']]);
  assert.deepEqual(calls.started, ['monitor-1']);
  assert.equal(calls.created.length, 0);
});

void test('processo acompanhado por outro produto devolve 409 sem criar o segundo nem expor a referencia', async () => {
  const { service, calls } = build({ live: monitor({ originProduct: 'juridico', destinationProduct: 'juridico', destinationRef: { databaseRef: 'juridico-db' } }) });
  const error = await service.ensureActive(flowCaller, input).catch((caught: unknown) => caught);
  assert.ok(error instanceof ConflictException);
  const body = error.getResponse() as Record<string, unknown>;
  assert.equal(body.code, 'process_monitor_in_use');
  assert.equal(body.destinationProduct, 'juridico');
  assert.equal(body.destinationRef, null);
  assert.equal(calls.created.length, 0);
  assert.equal(calls.started.length, 0);
});

void test('no mesmo produto, outro card nao herda o acompanhamento', async () => {
  const { service } = build({ live: monitor({ destinationRef: { ...card, cardId: 'card-2' } }) });
  await assert.rejects(service.ensureActive(flowCaller, input), ConflictException);
});

void test('corrida no indice unico usa o vencedor', async () => {
  let reads = 0;
  const { service } = build({
    repository: {
      findLiveByHmac: async () => (reads++ === 0 ? null : monitor({ id: 'winner' })),
      create: async () => { throw Object.assign(new Error('duplicate'), { code: '23505' }); }
    }
  });
  assert.deepEqual(await service.ensureActive(flowCaller, input), { id: 'winner', created: false });
});

void test('sem workflow agendado o acompanhamento criado nao fica ativo', async () => {
  const { service, calls } = build({ workflow: { start: async () => { throw new Error('worker down'); } } });
  await assert.rejects(service.ensureActive(flowCaller, input), /worker down/);
  assert.deepEqual(calls.deleted, ['created']);
});

void test('so o produto de destino ve, pausa ou exclui o acompanhamento', async () => {
  const { service, calls } = build({ live: monitor() });
  await assert.rejects(service.pause(juridicoCaller, 'monitor-1'), NotFoundException);
  await assert.rejects(service.remove(juridicoCaller, 'monitor-1'), NotFoundException);
  await assert.rejects(service.movements(juridicoCaller, 'monitor-1'), NotFoundException);
  await assert.rejects(service.processMovements(juridicoCaller, 'monitor-1'), NotFoundException);
  assert.equal(calls.stopped.length, 0);
  await service.remove(flowCaller, 'monitor-1');
  assert.deepEqual(calls.deleted, ['monitor-1']);
  assert.deepEqual(calls.stopped, [[CLIENT, 'monitor-1', true]]);
});

void test('execucao repetida pela mesma chave nao consulta o DataJud', async () => {
  let queried = false;
  const { service } = build({
    repository: {
      findForRun: async () => ({ ...monitor(), processNumberCiphertext: Buffer.from('x'), createdByIdentityId: flowCaller.identityId }),
      beginRun: async () => ({ id: 'run', alreadyProcessed: true })
    },
    dataJud: { queryProcess: async () => { queried = true; } }
  });
  assert.deepEqual(await service.run(CLIENT, 'monitor-1', 'wf:act', 'wf'), { idempotencyKey: 'wf:act', status: 'duplicate', movementsDetected: 0 });
  assert.equal(queried, false);
});

void test('movimentacao nova vai so para o destino, com CNJ mascarado', async () => {
  const backgroundQueries: unknown[] = [];
  const delivered: Array<[string, ProcessMovementNotification]> = [];
  const delivery = new ProcessMonitoringDeliveryRegistry();
  delivery.register('flow', { deliver: async (notification) => { delivered.push(['flow', notification]); } });
  delivery.register('juridico', { deliver: async (notification) => { delivered.push(['juridico', notification]); } });
  const completed: unknown[] = [];
  const { service } = build({
    delivery,
    repository: {
      findForRun: async () => ({ ...monitor(), processNumberCiphertext: Buffer.from('x'), createdByIdentityId: flowCaller.identityId }),
      beginRun: async () => ({ id: 'run', alreadyProcessed: false }),
      persistSnapshot: async (_c: string, _m: string, _r: string, destination: string) => {
        assert.equal(destination, 'flow');
        return [{ occurredAt: '2026-11-08T10:00:00Z', description: 'Juntada de peticao' }];
      },
      completeRun: async (_c: string, value: Record<string, unknown>) => { completed.push(value.status); }
    },
    dataJud: {
      queryProcess: async (_body: unknown, _id: string, options: { background?: boolean }) => {
        backgroundQueries.push(options?.background);
        return {
          requestId: 'r', source: 'datajud', capturedAt: '',
          process: { tribunal: 'TJAM', dataUltimaAtualizacao: null, movimentacoes: [{ codigo: 1, nome: 'Juntada de peticao', dataHora: '2026-11-08T10:00:00Z', complementos: [] }] }
        };
      }
    }
  });
  assert.deepEqual(await service.run(CLIENT, 'monitor-1', 'wf:act', 'wf'), { idempotencyKey: 'wf:act', status: 'success', movementsDetected: 1 });
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0]![0], 'flow');
  assert.equal(delivered[0]![1].numeroProcesso, '0701234-77.2026.8.04.0001');
  assert.deepEqual(delivered[0]![1].destinationRef, card);
  assert.deepEqual(completed, ['success']);
  assert.deepEqual(backgroundQueries, [true]);
});

void test('erro do provedor fecha a execucao com o status correspondente', async () => {
  const completed: unknown[] = [];
  const { service } = build({
    repository: {
      findForRun: async () => ({ ...monitor(), processNumberCiphertext: Buffer.from('x'), createdByIdentityId: flowCaller.identityId }),
      beginRun: async () => ({ id: 'run', alreadyProcessed: false }),
      completeRun: async (_c: string, value: Record<string, unknown>) => { completed.push(value.status); }
    },
    dataJud: { queryProcess: async () => { throw new HttpException({ code: 'process_not_found' }, 404); } }
  });
  await assert.rejects(service.run(CLIENT, 'monitor-1', 'wf:act', 'wf'), HttpException);
  assert.deepEqual(completed, ['not_found']);
});

void test('entrega sem adaptador ou com falha nao derruba a execucao', async () => {
  const registry = new ProcessMonitoringDeliveryRegistry();
  const notification = { clientId: CLIENT, monitorId: 'm', requestedByIdentityId: flowCaller.identityId, destinationRef: card, numeroProcesso: '', tribunal: 'TJAM', processFingerprint: '', newMovements: [] };
  assert.equal(await registry.deliver('flow', notification), false);
  registry.register('flow', { deliver: async () => { throw new Error('flow down'); } });
  assert.equal(await registry.deliver('flow', notification), false);
});

// ---- Sprint 7 (ADR 022): fontes separadas, ciclo diario e DJEN ----

const NOW = Date.parse('2026-11-09T12:00:00Z'); // segunda-feira, 09:00 em Brasilia
const forRun = (overrides: Partial<ProcessMonitorView> = {}) => ({ ...monitor(overrides), processNumberCiphertext: Buffer.from('x'), createdByIdentityId: flowCaller.identityId });

void test('plano diario: DataJud vence pela data em Brasilia; DJEN so com a capacidade e destino Flow', async () => {
  const due = build({ publications: true, repository: { findForRun: async () => forRun({ lastCheckedAt: '2026-11-08T13:00:00Z', nextCheckAt: '2026-11-09T13:00:00Z' }) } });
  assert.deepEqual(await due.service.plan(CLIENT, 'monitor-1', NOW), { active: true, datajud: true, djen: true });
  const notYet = build({ publications: false, repository: { findForRun: async () => forRun({ lastCheckedAt: '2026-11-09T10:00:00Z', nextCheckAt: '2026-11-16T10:00:00Z' }) } });
  assert.deepEqual(await notYet.service.plan(CLIENT, 'monitor-1', NOW), { active: true, datajud: false, djen: false });
  const juridico = build({ publications: true, repository: { findForRun: async () => forRun({ destinationProduct: 'juridico', destinationRef: { databaseRef: 'j' } }) } });
  assert.equal((await juridico.service.plan(CLIENT, 'monitor-1', NOW)).djen, false);
  const off = build({ publications: true, repository: { findForRun: async () => forRun({ datajudEnabled: false, djenEnabled: false }) } });
  assert.deepEqual(await off.service.plan(CLIENT, 'monitor-1', NOW), { active: true, datajud: false, djen: false });
  const djenLater = build({ publications: true, repository: { findForRun: async () => forRun({ djenNextCheckOn: '2026-11-12' }) } });
  assert.equal((await djenLater.service.plan(CLIENT, 'monitor-1', NOW)).djen, false);
  const cancelled = build({ enabled: false, repository: { findForRun: async () => forRun() } });
  assert.deepEqual(await cancelled.service.plan(CLIENT, 'monitor-1', NOW), { active: true, datajud: false, djen: false });
  const paused = build({ repository: { findForRun: async () => null } });
  assert.deepEqual(await paused.service.plan(CLIENT, 'monitor-1', NOW), { active: false, datajud: false, djen: false });
});

void test('DJEN: primeira consulta cobre 7 dias, texto puro cifrado, proxima em dias uteis', async () => {
  const queries: Record<string, string>[] = [];
  const saved: Array<Record<string, unknown>> = [];
  const completed: Array<Record<string, unknown>> = [];
  const delivered: unknown[] = [];
  const delivery = new ProcessMonitoringDeliveryRegistry();
  delivery.register('flow', { deliver: async () => undefined, deliverPublications: async (notification) => { delivered.push(notification); } });
  const { service } = build({
    publications: true,
    delivery,
    repository: {
      findForRun: async () => forRun({ djenCadenceDays: 3 }),
      beginRun: async (_c: string, _m: string, _k: string, _w: string, source: string) => { assert.equal(source, 'djen'); return { id: 'run', alreadyProcessed: false }; },
      findDjenWindow: async () => ({ checkedUntil: null, baselineEstablished: false }),
      persistPublications: async (_c: string, _m: string, _d: string, items: Array<Record<string, unknown>>) => { saved.push(...items); return items.map((item, index) => ({ ...item, id: `pub-${index}` })); },
      completeDjenRun: async (_c: string, value: Record<string, unknown>) => { completed.push(value); }
    },
    dataJud: {
      djenCommunications: async (params: Record<string, string>) => {
        queries.push(params);
        return { items: [{ hash: 'h1', tipoComunicacao: 'Intimação', tipoDocumento: 'DESPACHO/DECISÃO', dataDisponibilizacao: '2026-11-06', texto: '<p>INTIMA&Ccedil;&Atilde;O</p><script>x()</script>' }], count: 1, page: 1, pageSize: 100 };
      }
    }
  });
  const result = await service.runPublications(CLIENT, 'monitor-1', 'wf:djen', 'wf', NOW);
  assert.deepEqual(result, { idempotencyKey: 'wf:djen', status: 'success', publicationsDetected: 1 });
  assert.equal(queries[0]!.dataDisponibilizacaoInicio, '2026-11-02');
  assert.equal(queries[0]!.dataDisponibilizacaoFim, '2026-11-09');
  assert.equal(queries[0]!.numeroProcesso, '07012347720268040001');
  assert.equal((saved[0]!.textCiphertext as Buffer).toString(), 'enc:INTIMAÇÃO');
  assert.equal(saved[0]!.excerpt, 'INTIMAÇÃO');
  assert.deepEqual(completed[0], { runId: 'run', monitorId: 'monitor-1', status: 'success', latencyMs: completed[0]!.latencyMs, checkedUntil: '2026-11-09', nextCheckOn: '2026-11-12' });
  assert.equal(delivered.length, 1);
});

void test('DJEN: sem a capacidade a execucao e pulada; falha nao avanca o periodo', async () => {
  const skipped = build({ publications: false, repository: { findForRun: async () => forRun() } });
  assert.equal((await skipped.service.runPublications(CLIENT, 'monitor-1', 'k', 'wf', NOW)).status, 'skipped');
  const completed: Array<Record<string, unknown>> = [];
  const failing = build({
    publications: true,
    repository: {
      findForRun: async () => forRun(),
      beginRun: async () => ({ id: 'run', alreadyProcessed: false }),
      findDjenWindow: async () => ({ checkedUntil: '2026-11-06', baselineEstablished: true }),
      completeDjenRun: async (_c: string, value: Record<string, unknown>) => { completed.push(value); }
    },
    dataJud: { djenCommunications: async () => { throw new HttpException({ code: 'juridico_data_unavailable' }, 503); } }
  });
  await assert.rejects(failing.service.runPublications(CLIENT, 'monitor-1', 'k', 'wf', NOW), HttpException);
  assert.equal(completed[0]!.status, 'provider_unavailable');
  assert.equal(completed[0]!.checkedUntil, null);
  assert.equal(completed[0]!.nextCheckOn, null);
});

void test('fontes: desligar as duas pausa; ligar DJEN exige a capacidade; ligar retoma o pausado', async () => {
  const bothOff = build({
    publications: true,
    live: monitor({ djenEnabled: false }),
    repository: { setSources: async () => monitor({ datajudEnabled: false, djenEnabled: false }) }
  });
  await bothOff.service.setSource(flowCaller, 'monitor-1', 'datajud', false);
  assert.deepEqual(bothOff.calls.states, [['monitor-1', 'paused']]);
  const noContract = build({ publications: false, live: monitor() });
  await assert.rejects(noContract.service.setSource(flowCaller, 'monitor-1', 'djen', true), ForbiddenException);
  const resume = build({
    publications: true,
    live: monitor({ state: 'paused', datajudEnabled: false, djenEnabled: false }),
    repository: { setSources: async () => monitor({ state: 'paused', datajudEnabled: false, djenEnabled: true }) }
  });
  await resume.service.setSource(flowCaller, 'monitor-1', 'djen', true);
  assert.deepEqual(resume.calls.states, [['monitor-1', 'active']]);
  assert.deepEqual(resume.calls.started, ['monitor-1']);
  const onlyDjen = build({
    publications: true,
    live: monitor(),
    repository: { setSources: async () => monitor({ datajudEnabled: false }) }
  });
  await onlyDjen.service.setSource(flowCaller, 'monitor-1', 'datajud', false);
  assert.deepEqual(onlyDjen.calls.states, []);
});

// ---- Sprint 9: Ver no DJEN e dados do processo ----

void test('Ver no DJEN: exige a capacidade, busca em volta da data e grava como historico', async () => {
  const noContract = build({ publications: false, live: monitor() });
  await assert.rejects(noContract.service.lookupPublications(flowCaller, 'monitor-1', 'mv-1'), ForbiddenException);
  const queries: Record<string, string>[] = [];
  const saved: unknown[] = [];
  const { service } = build({
    publications: true,
    live: monitor({ state: 'paused' }),
    repository: {
      findMovement: async () => ({ occurredAt: '2026-10-29T02:34:03Z', description: 'Publicação' }),
      findForLookup: async () => forRun({ state: 'paused' }),
      saveHistoricalPublications: async (_c: string, _m: string, items: unknown[]) => { saved.push(...items); },
      listPublicationsBetween: async (_c: string, _m: string, from: string, to: string) => {
        assert.deepEqual([from, to], ['2026-10-25', '2026-11-07']);
        return [{ id: 'p1', availableOn: '2026-10-28', communicationType: 'Intimação', documentType: 'Decisão', courtName: 'Vara', textCiphertext: Buffer.from('x'), link: null, isNew: false }];
      }
    },
    dataJud: {
      djenCommunications: async (params: Record<string, string>) => {
        queries.push(params);
        return { items: [{ hash: 'h', dataDisponibilizacao: '2026-10-28', texto: '<p>Decisão</p>' }], count: 1, page: 1, pageSize: 100 };
      }
    }
  });
  const result = await service.lookupPublications(flowCaller, 'monitor-1', 'mv-1');
  assert.equal(queries[0]!.dataDisponibilizacaoInicio, '2026-10-25');
  assert.equal(queries[0]!.dataDisponibilizacaoFim, '2026-11-07');
  assert.equal(saved.length, 1);
  assert.equal(result.items[0]!.isNew, false);
  assert.equal(result.items[0]!.text, '07012347720268040001');
});

void test('lista marca Ver no DJEN so em movimentacao com data que costuma gerar comunicacao', async () => {
  const { service } = build({
    live: monitor(),
    repository: {
      listProcessMovements: async () => [
        { id: 'a', description: 'Publicação', occurredAt: '2026-10-29T00:00:00Z', isNew: false },
        { id: 'b', description: 'Petição', occurredAt: '2026-10-29T00:00:00Z', isNew: false },
        { id: 'c', description: 'Decisão', occurredAt: null, isNew: false }
      ]
    }
  });
  assert.deepEqual((await service.processMovements(flowCaller, 'monitor-1')).map((item) => item.djenLookup), [true, false, false]);
});
