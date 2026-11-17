import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PjeService } from './pje.service';
import { UpsertConfigInput } from './pje.repository';

const ctx = {
  clientId: 'client-1',
  identityId: 'identity-1',
  applicationId: 'juridico-app',
  databaseRef: 'postgres.juridico',
  scopes: ['juridico:read'],
  roles: [],
};

const data = { comunicacoes: async () => ({ items: [], count: 0, page: 1, pageSize: 100 }), tribunais: async () => ({ items: [], total: 0 }) };

function serviceWith(repository: unknown): PjeService {
  return new PjeService(repository as never, data as never);
}

void test('updateConfig rejeita configuracao sem filtro discriminante', async () => {
  const service = serviceWith({ getConfig: async () => null, upsertConfig: async () => undefined });

  await assert.rejects(
    () => service.updateConfig(ctx, { lookbackDays: 7 }),
    /ao menos OAB \+ UF/,
  );
});

void test('updateConfig exige numero e UF da OAB em conjunto', async () => {
  const service = serviceWith({ getConfig: async () => null, upsertConfig: async () => undefined });

  await assert.rejects(() => service.updateConfig(ctx, { numeroOab: '18312' }), /UF da OAB/);
  await assert.rejects(() => service.updateConfig(ctx, { ufOab: 'ms' }), /numero da OAB/);
});

void test('updateConfig normaliza UF e siglas de tribunal em maiusculas', async () => {
  const gravados: UpsertConfigInput[] = [];
  const service = serviceWith({
    getConfig: async () => ({
      numeroOab: '18312',
      ufOab: 'MS',
      nomeAdvogado: null,
      nomeParte: null,
      siglasTribunal: ['TJMS'],
      lookbackDays: 15,
      status: 'active',
      updatedAt: '2026-08-04',
    }),
    upsertConfig: async (_clientId: string, _ref: string, input: UpsertConfigInput) => {
      gravados.push(input);
    },
  });

  const result = await service.updateConfig(ctx, {
    numeroOab: '18312',
    ufOab: 'ms',
    siglasTribunal: [' tjms ', 'trf3'],
    lookbackDays: 15,
  });

  assert.deepEqual(gravados[0].siglasTribunal, ['TJMS', 'TRF3']);
  assert.equal(gravados[0].ufOab, 'MS');
  assert.equal(gravados[0].lookbackDays, 15);
  assert.equal(result.configured, true);
});

void test('updateConfig aceita apenas sigla de tribunal como filtro', async () => {
  const gravados: UpsertConfigInput[] = [];
  const service = serviceWith({
    getConfig: async () => null,
    upsertConfig: async (_clientId: string, _ref: string, input: UpsertConfigInput) => {
      gravados.push(input);
    },
  });

  await service.updateConfig(ctx, { siglasTribunal: ['TJMS'] });

  assert.equal(gravados.length, 1);
  assert.equal(gravados[0].numeroOab, null);
});

void test('startSync recusa quando monitoramento nao esta configurado', async () => {
  const service = serviceWith({ getConfig: async () => null });

  await assert.rejects(() => service.startSync(ctx, {}), /Configure o monitoramento/);
});

void test('startSync recusa quando monitoramento esta inativo', async () => {
  const service = serviceWith({
    getConfig: async () => ({ status: 'inactive', siglasTribunal: [], lookbackDays: 7 }),
  });

  await assert.rejects(() => service.startSync(ctx, {}), /inativo/);
});

void test('startSync cria job isolado pelo tenant e encaminha ao servico interno', async () => {
  const criados: Array<{ clientId: string; ref: string; input: unknown }> = [];
  const service = serviceWith({
    getConfig: async () => ({ status: 'active', siglasTribunal: ['TJMS'], lookbackDays: 7 }),
    createSyncJob: async (clientId: string, ref: string, input: unknown) => {
      criados.push({ clientId, ref, input });
      return { id: 'job-1', status: 'queued', triggerSource: 'manual', filtro: {}, dataInicio: '2026-08-01', dataFim: '2026-08-03', paginasLidas: 0, comunicacoesRecebidas: 0, comunicacoesNovas: 0, comunicacoesDuplicadas: 0, rateLimitWaits: 0, lastError: null, startedAt: null, finishedAt: null, createdAt: null, updatedAt: null };
    },
    markSyncRunning: async () => undefined,
    getSyncJob: async () => ({ status: 'cancelled' }),
    finishSyncJob: async () => undefined,
  });

  const result = await service.startSync(ctx, { lookbackDays: 3 });

  assert.equal(criados[0].clientId, 'client-1');
  assert.equal(criados[0].ref, 'postgres.juridico');
  assert.equal(result.jobId, 'job-1');
  assert.equal(result.runningInProcess, true);
});

void test('getActiveSync devolve status none quando nao ha job', async () => {
  const service = serviceWith({ getActiveOrLastSyncJob: async () => null });

  assert.deepEqual(await service.getActiveSync(ctx), { status: 'none' });
});


void test('listComunicacoes aplica paginacao padrao', async () => {
  const filtros: Array<{ page: number; pageSize: number }> = [];
  const service = serviceWith({
    listComunicacoes: async (_clientId: string, _ref: string, filter: { page: number; pageSize: number }) => {
      filtros.push(filter);
      return { items: [], total: 0 };
    },
  });

  const result = await service.listComunicacoes(ctx, {});

  assert.equal(filtros[0].page, 1);
  assert.equal(filtros[0].pageSize, 20);
  assert.equal(result.total, 0);
});
