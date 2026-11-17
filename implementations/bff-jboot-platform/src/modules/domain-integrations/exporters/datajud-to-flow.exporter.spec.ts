import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { DataJudToFlowExporter } from './datajud-to-flow.exporter';

void test('DataJud exporter recovers an existing card and uses a non-PII operation key', async () => {
  const caller = {
    identityId: randomUUID(), clientId: randomUUID(), applicationId: randomUUID(),
    databaseRef: randomUUID(), scopes: ['juridico:read'], roles: []
  };
  const juridico = { ...caller, databaseRef: randomUUID() };
  const flow = { ...caller, applicationId: randomUUID(), databaseRef: randomUUID(), scopes: ['flow:read', 'flow:write'] };
  const audits: Array<Record<string, unknown>> = [];
  const links: Array<Record<string, unknown>> = [];
  const exporter = new DataJudToFlowExporter(
    { requireCaller: async () => juridico, requireApplication: async () => flow } as never,
    {
      registerDataJudExport: async (_ref: string, input: Record<string, unknown>) => { links.push(input); },
      insertExportAudit: async (_ref: string, input: Record<string, unknown>) => { audits.push(input); }
    } as never,
    { createInDefaultColumnFromSource: async () => ({ card: { id: 'card-1' }, created: false }) } as never,
    { findProcessOwners: async () => new Map([['50060041320218240058', { kind: 'datajud_card', cardId: 'card-1', boardId: 'board-1' }]]) } as never,
    {
      getManualSnapshot: async () => ({
        id: 'snapshot', tribunal: 'TJSC', processNumberCiphertext: Buffer.from('cipher'),
        processFingerprint: 'f'.repeat(64), providerUpdatedAt: null, capturedAt: '2026-10-06T00:00:00.000Z',
        datajudId: null, grau: null, dataAjuizamento: null, sincronizadoEm: null,
        classe: null, formato: null, sistema: null, orgaoJulgador: null, assuntos: []
      }),
      listSnapshotMovements: async () => []
    } as never,
    { decrypt: () => '50060041320218240058' } as never,
    { juridicoDataAuditHmacKey: 'test-key', juridicoDataAuditHmacKeyVersion: 1 } as never
  );
  const result = await exporter.execute(caller, 'snapshot', 'board-1', 'office-1', {});
  assert.equal(result.created, false);
  assert.equal(links.length, 1);
  assert.match(String(audits[0].operationKey), /^datajud:[a-f0-9]{64}:flow:board-1$/);
  assert.equal(String(audits[0].operationKey).includes('50060041320218240058'), false);
});

void test('DataJud exporter refuses a process that already has a Flow card (petition or import), checked in the Kanban', async () => {
  const caller = { identityId: 'i', clientId: 'c', applicationId: 'a', databaseRef: 'd', scopes: ['juridico:read'], roles: [] };
  let created = false;
  const exporter = new DataJudToFlowExporter(
    { requireCaller: async () => caller, requireApplication: async () => ({ ...caller, databaseRef: 'flow' }) } as never,
    {
      registerDataJudExport: async () => undefined,
      insertExportAudit: async () => undefined
    } as never,
    { createInDefaultColumnFromSource: async () => { created = true; return { card: { id: 'x' }, created: true }; } } as never,
    {
      findProcessOwners: async (db: string, _c: string, numbers: string[]) => {
        assert.equal(db, 'flow');
        return new Map([[numbers[0]!, { kind: 'petition', cardId: 'petition-card', boardId: 'monitor-board' }]]);
      }
    } as never,
    { getManualSnapshot: async () => ({ tribunal: 'TJSP', processNumberCiphertext: Buffer.from('c') }), listSnapshotMovements: async () => [] } as never,
    { decrypt: () => '00000016820268260100' } as never,
    { juridicoDataAuditHmacKey: 'test-key', juridicoDataAuditHmacKeyVersion: 1 } as never
  );
  await assert.rejects(
    () => exporter.execute(caller, 'snapshot', 'board-1', 'office-1', {}),
    (error: unknown) => (error as { getResponse?: () => { cardUrl?: string } }).getResponse?.().cardUrl === '/flow/boards/monitor-board?card=petition-card'
  );
  assert.equal(created, false);
});
