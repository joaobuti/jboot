import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { HttpException } from '@nestjs/common';
import { DataJudService } from './datajud.service';

const ctx = {
  identityId: '11111111-1111-4111-8111-111111111111',
  clientId: '22222222-2222-4222-8222-222222222222',
  applicationId: '33333333-3333-4333-8333-333333333333',
  databaseRef: '44444444-4444-4444-8444-444444444444',
  scopes: ['juridico:read'],
  roles: [],
};

void test('query response adds lag notice, persists snapshot and audits only HMAC', async () => {
  const audits: Array<Record<string, unknown>> = [];
  const snapshots: Array<Record<string, unknown>> = [];
  const service = new DataJudService(
    {
      queryProcess: async (_body: unknown, requestId: string) => ({
        requestId,
        source: 'datajud',
        capturedAt: '2026-08-27T10:00:00Z',
        process: {
          numeroProcesso: '00012340820238260100', tribunal: 'TJSP', datajudId: null, grau: null,
          dataAjuizamento: null, dataUltimaAtualizacao: null, sincronizadoEm: null, nivelSigilo: 0,
          classe: null, formato: null, sistema: null, orgaoJulgador: null,
          assuntos: [], movimentacoes: [],
        },
      }),
    } as never,
    {
      insertAudit: async (_clientId: string, _databaseRef: string, input: Record<string, unknown>) => audits.push(input),
      upsertManualSnapshot: async (_clientId: string, _databaseRef: string, input: Record<string, unknown>) => {
        snapshots.push(input);
        return { snapshotId: 'snap-1', newMovements: [] };
      },
    } as never,
    { juridicoDataAuditHmacKey: 'audit-secret', juridicoDataAuditHmacKeyVersion: 1, juridicoMonitorEncryptionKeyVersion: 1, juridicoDataSnapshotRetentionDays: 180 } as never,
    { encrypt: () => Buffer.from('cipher') } as never,
    {} as never,
  );

  const result = await service.queryProcess(ctx, { numeroProcesso: '0001234-08.2023.8.26.0100' });
  assert.match(result.lagNotice, /defasagem/);
  assert.equal(result.snapshotId, 'snap-1');
  // O snapshot nunca guarda o numero em claro.
  assert.equal(snapshots.length, 1);
  assert.equal(String(snapshots[0].processNumberHmac).length, 64);
  assert.equal(snapshots[0].tribunal, 'TJSP');
  assert.equal(audits[0].resultStatus, 'success');
  assert.notEqual(audits[0].processNumberHmac, '00012340820238260100');
  assert.equal(String(audits[0].processNumberHmac).length, 64);
});

void test('provider problem is audited with stable status and rethrown', async () => {
  const audits: Array<Record<string, unknown>> = [];
  const service = new DataJudService(
    { queryProcess: async () => { throw new HttpException({ code: 'process_not_found' }, 404); } } as never,
    { insertAudit: async (_clientId: string, _databaseRef: string, input: Record<string, unknown>) => audits.push(input) } as never,
    { juridicoDataAuditHmacKey: 'audit-secret', juridicoDataAuditHmacKeyVersion: 2, juridicoMonitorEncryptionKeyVersion: 1, juridicoDataSnapshotRetentionDays: 180 } as never,
    { encrypt: () => Buffer.from('cipher') } as never,
    {} as never,
  );
  await assert.rejects(() => service.queryProcess(ctx, { numeroProcesso: '00012340820238260100' }));
  assert.equal(audits[0].resultStatus, 'not_found');
  assert.equal(audits[0].hmacKeyVersion, 2);
});

void test('a snapshot failure does not break the query, it only disables the export', async () => {
  const service = new DataJudService(
    {
      queryProcess: async (_body: unknown, requestId: string) => ({
        requestId,
        source: 'datajud',
        capturedAt: '2026-08-27T10:00:00Z',
        process: {
          numeroProcesso: '00012340820238260100', tribunal: 'TJSP', datajudId: null, grau: null,
          dataAjuizamento: null, dataUltimaAtualizacao: null, sincronizadoEm: null, nivelSigilo: 0,
          classe: null, formato: null, sistema: null, orgaoJulgador: null,
          assuntos: [], movimentacoes: [],
        },
      }),
    } as never,
    {
      insertAudit: async () => undefined,
      upsertManualSnapshot: async () => { throw new Error('postgres indisponivel'); },
    } as never,
    { juridicoDataAuditHmacKey: 'audit-secret', juridicoDataAuditHmacKeyVersion: 1, juridicoMonitorEncryptionKeyVersion: 1, juridicoDataSnapshotRetentionDays: 180 } as never,
    { encrypt: () => Buffer.from('cipher') } as never,
    {} as never,
  );

  const result = await service.queryProcess(ctx, { numeroProcesso: '00012340820238260100' });
  assert.equal(result.snapshotId, null);
  assert.equal(result.process.tribunal, 'TJSP');
});

void test('OAB search returns processes, not publications, and never calls DataJud', async () => {
  let dataJudCalled = false;
  let djenParams: URLSearchParams | null = null;
  const service = new DataJudService(
    { queryProcess: async () => { dataJudCalled = true; return {}; } } as never,
    { findExportedByProcessHmac: async () => new Map([['hmac-do-111', { boardId: 'b1', cardId: 'c1' }]]) } as never,
    { juridicoDataAuditHmacKey: '' } as never,
    {} as never,
    {
      comunicacoes: async (params: URLSearchParams) => {
        djenParams = params;
        return {
          count: 3,
          page: 1,
          pageSize: 100,
          items: [
            { numeroProcesso: '111', numeroProcessoMask: '1-11', siglaTribunal: 'TJSC', nomeClasse: 'Execucao', dataDisponibilizacao: '2026-09-01' },
            { numeroProcesso: '111', numeroProcessoMask: '1-11', siglaTribunal: 'TJSC', nomeClasse: 'Execucao', dataDisponibilizacao: '2026-09-08' },
            { numeroProcesso: '222', numeroProcessoMask: '2-22', siglaTribunal: 'TJPR', nomeClasse: 'Comum', dataDisponibilizacao: '2026-09-05' }
          ]
        };
      }
    } as never,
  );

  const result = await service.listProcessesByOab(ctx, {
    numeroOab: '75.900', ufOab: 'pr', dataInicio: '2026-06-01', dataFim: '2026-09-09'
  });

  // Tres publicacoes, dois processos: o advogado quer a lista de processos.
  assert.equal(result.publicacoesAnalisadas, 3);
  assert.equal(result.total, 2);
  // Ordenado pela publicacao mais recente.
  assert.equal(result.items[0].numeroProcesso, '111');
  assert.equal(result.items[0].publicacoes, 2);
  assert.equal(result.items[0].ultimaPublicacaoEm, '2026-09-08');
  assert.equal(result.items[1].publicacoes, 1);
  // A listagem nao pode enriquecer no DataJud: 25 processos levaram 87s na medicao.
  assert.equal(dataJudCalled, false);
  assert.equal(djenParams!.get('numeroOab'), '75900');
  assert.equal(djenParams!.get('ufOab'), 'PR');
});

void test('OAB search flags processes already exported to Flow', async () => {
  const service = new DataJudService(
    {} as never,
    {
      // O repositorio devolve pelo HMAC; o servico calcula o HMAC de cada processo.
      findExportedByProcessHmac: async (_c: string, _d: string, hmacs: string[]) =>
        new Map([[hmacs[0], { boardId: 'board-1', cardId: 'card-1' }]]),
      findSnapshotsByProcessHmac: async (_c: string, _d: string, hmacs: string[]) =>
        new Map([[hmacs[1], { snapshotId: 'snap-2', capturedAt: '2026-09-10T20:21:21.000Z' }]]),
    } as never,
    { juridicoDataAuditHmacKey: 'audit-secret', juridicoDataAuditHmacKeyVersion: 1 } as never,
    {} as never,
    {
      comunicacoes: async () => ({
        count: 2, page: 1, pageSize: 100,
        items: [
          { numeroProcesso: '111', numeroProcessoMask: '1-11', siglaTribunal: 'TJSC', dataDisponibilizacao: '2026-09-08' },
          { numeroProcesso: '222', numeroProcessoMask: '2-22', siglaTribunal: 'TJPR', dataDisponibilizacao: '2026-09-05' }
        ]
      })
    } as never,
  );

  const result = await service.listProcessesByOab(ctx, {
    numeroOab: '75900', ufOab: 'PR', dataInicio: '2026-06-01', dataFim: '2026-09-09'
  });

  const exportados = result.items.filter((item) => item.exportado);
  assert.equal(exportados.length, 1);
  assert.equal(exportados[0].cardUrl, '/flow/boards/board-1?card=card-1');
  assert.equal(result.items.filter((item) => !item.exportado)[0].cardUrl, null);

  // Consulta ja gravada acompanha a listagem: a tela reabre os dados sem
  // consultar o provedor de novo, inclusive depois de um reload.
  const comSnapshot = result.items.filter((item) => item.snapshotId);
  assert.equal(comSnapshot.length, 1);
  assert.equal(comSnapshot[0].snapshotId, 'snap-2');
  assert.ok(comSnapshot[0].consultadoEm);
  assert.equal(result.items.filter((item) => !item.snapshotId)[0].consultadoEm, null);
});
