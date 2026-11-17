import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { buildDocx } from '../../../test/docx-fixture';
import { SignedKitService } from './signed-kit.service';

const ME = 'me';
const ctx = (scopes: string[] = []) => ({ clientId: 'c1', identityId: ME, databaseRef: 'db', applicationId: 'flow', roles: [], scopes }) as never;
const mutate = { clientId: 'c1', identityId: ME, ip: '127.0.0.1' } as never;
const PDF = { originalname: 'kit-assinado.pdf', mimetype: 'application/pdf', size: 1024, buffer: Buffer.from('%PDF-1.7\n', 'latin1') };
const KIT = { id: 'kit-1', officeId: 'office-1', fileName: 'KIT_MARIA_2026-11-02.docx', sizeBytes: 10, storageKey: 'kit.docx', createdAt: 't' };
const SIGNED = { id: 'signed-2', customerId: 'cust', kitId: 'kit-1', version: 2, fileName: 'kit-assinado.pdf', contentType: 'application/pdf', sizeBytes: 1024, sha256: 'b'.repeat(64), storageKey: 's/2', uploadedByIdentityId: ME, createdAt: 't' };

function run(overrides: Record<string, unknown> = {}) {
  return { id: 'run-1', customerId: 'cust', kitId: 'kit-1', signedKitId: 'signed-2', agentId: 'agent', executorIdentityId: ME, status: 'answered', errorCode: null,
    externalSessionUrl: null, verdict: 'aprovado', summary: 'ok', findings: [], answeredAt: 't', confirmedAt: null, confirmedByIdentityId: null, createdAt: 't', ...overrides };
}

function build(options: {
  kit?: typeof KIT | null;
  signed?: typeof SIGNED | null;
  latestRun?: ReturnType<typeof run> | null;
  member?: boolean;
  gateway?: 'dispatched' | 'failed' | 'throw';
  confirmResult?: { run: ReturnType<typeof run>; driveQueued: boolean } | null;
} = {}) {
  const calls = { created: [] as unknown[], runs: [] as Array<Record<string, unknown>>, dispatched: [] as string[], failed: [] as string[], events: [] as string[], audits: [] as string[], fires: [] as Array<Record<string, unknown>> };
  const service = new SignedKitService(
    {
      currentSigned: async () => ('signed' in options ? options.signed : SIGNED),
      latestRun: async () => ('latestRun' in options ? options.latestRun : null),
      findRun: async () => ('latestRun' in options ? options.latestRun : run({ status: 'dispatched', verdict: null })),
      createVersion: async (_r: string, _c: string, input: Record<string, unknown>) => { calls.created.push(input); return { ...SIGNED, ...input, version: 3 }; },
      createRun: async (_r: string, _c: string, input: Record<string, unknown>) => { calls.runs.push(input); return run({ ...input, status: 'dispatching', verdict: null }); },
      markDispatched: async (_r: string, _c: string, id: string) => { calls.dispatched.push(id); },
      markFailed: async (_r: string, _c: string, _id: string, code: string) => { calls.failed.push(code); },
      touchByRoutine: async () => undefined,
      answer: async (_r: string, _c: string, input: { executorIdentityId: string }) => (input.executorIdentityId === ME ? run() : null),
      confirm: async () => ('confirmResult' in options ? options.confirmResult : { run: run({ confirmedAt: 't' }), driveQueued: true })
    } as never,
    {
      latestKitForCustomer: async () => ('kit' in options ? options.kit : KIT),
      findKitForCustomer: async () => ('kit' in options ? options.kit : KIT)
    } as never,
    { findByCard: async () => ({ customerId: 'cust' }) } as never,
    { requireVisibleCard: async () => ({ id: 'card' }) } as never,
    { requireRole: async () => { if (options.member === false) throw new ForbiddenException('no'); } } as never,
    { requireVisibleCustomer: async () => ({ name: 'MARIA', documentNumber: '52998224725' }) } as never,
    {
      buildSignedKitStorageKey: (p: { signedKitId: string }) => `s/${p.signedKitId}`,
      upload: async () => undefined,
      deleteQuietly: async () => true,
      download: async (key: string) => (key === 'kit.docx' ? buildDocx({ paragraphs: ['PROCURACAO', 'Assinatura: ____'] }) : Buffer.from('%PDF'))
    } as never,
    {
      inspectPdf: async () => null,
      render: async (_b: Buffer, _t: string, page: number) => ({ jpeg: Buffer.from([0xff]), page, pageCount: 4, totalPages: 4, width: 1, height: 1 })
    } as never,
    {
      execute: async (input: Record<string, unknown>) => {
        calls.fires.push(input);
        if (options.gateway === 'throw') throw new Error('network');
        return options.gateway === 'failed' ? { status: 'failed', errorCode: 'agent_inactive', id: 'x' } : { status: 'dispatched', id: 'exec-1', externalSessionUrl: 'https://claude.ai/code/s' };
      }
    } as never,
    { createSystemEvent: async (_r: string, _c: string, _card: string, _who: string, kind: string) => { calls.events.push(kind); } } as never,
    { record: async (event: string) => { calls.audits.push(event); } } as never
  );
  return { service, calls };
}

const ROUTE = { agentId: 'action-agent', executorIdentityId: 'admin' };

void test('envio do kit assinado grava a versao e registra no historico, sem disparar validacao (S5)', async () => {
  const { service, calls } = build();
  const view = await service.upload(ctx(), 'b', 'card', 'kit-1', PDF as never, mutate);
  assert.equal(calls.created.length, 1);
  assert.deepEqual(calls.events, ['card.signed_kit_uploaded']);
  assert.deepEqual([calls.runs.length, calls.fires.length], [0, 0]);
  assert.equal(view.validation, null);
});

void test('acao Validar assinatura: dispara com o agente da acao e executor = quem configurou', async () => {
  const { service, calls } = build();
  const message = await service.validateFromAction(ctx(), 'b', 'card', ROUTE, mutate);
  assert.match(message, /iniciada/);
  assert.deepEqual(calls.runs.map((r) => [r.agentId, r.executorIdentityId, r.requestedByIdentityId, r.signedKitId]), [['action-agent', 'admin', ME, 'signed-2']]);
  const runId = calls.runs[0].id;
  assert.deepEqual([calls.fires[0].sourceType, calls.fires[0].payload, calls.fires[0].requesterIdentityId], ['flow_signature_validation', { run_id: runId }, 'admin']);
  assert.deepEqual(calls.dispatched, [runId]);
});

void test('acao Validar assinatura: sem assinado, em andamento ou aprovado 409; pendencias, falha ou versao anterior validam de novo', async () => {
  await assert.rejects(build({ signed: null }).service.validateFromAction(ctx(), 'b', 'card', ROUTE, mutate), ConflictException);
  await assert.rejects(build({ kit: null }).service.validateFromAction(ctx(), 'b', 'card', ROUTE, mutate), ConflictException);
  await assert.rejects(build({ latestRun: run({ status: 'dispatched', verdict: null }) }).service.validateFromAction(ctx(), 'b', 'card', ROUTE, mutate), ConflictException);
  await assert.rejects(build({ latestRun: run() }).service.validateFromAction(ctx(), 'b', 'card', ROUTE, mutate), ConflictException);
  for (const latestRun of [run({ verdict: 'pendencias' }), run({ status: 'failed', verdict: null }), run({ status: 'expired', verdict: null }), run({ signedKitId: 'signed-1' })]) {
    const { service, calls } = build({ latestRun });
    await service.validateFromAction(ctx(), 'b', 'card', ROUTE, mutate);
    assert.equal(calls.runs.length, 1);
  }
});

void test('acao Validar assinatura: falha no disparo grava o motivo e devolve 409 com o codigo', async () => {
  const failed = build({ gateway: 'failed' });
  await assert.rejects(failed.service.validateFromAction(ctx(), 'b', 'card', ROUTE, mutate), (error: ConflictException) => {
    assert.equal((error.getResponse() as { code: string }).code, 'agent_inactive');
    return true;
  });
  assert.deepEqual(failed.calls.failed, ['agent_inactive']);
  const thrown = build({ gateway: 'throw' });
  await assert.rejects(thrown.service.validateFromAction(ctx(), 'b', 'card', ROUTE, mutate), ConflictException);
  assert.deepEqual(thrown.calls.failed, ['signature_dispatch_failed']);
});

void test('so o kit mais recente pode ser assinado; leitor do quadro nao envia', async () => {
  await assert.rejects(build().service.upload(ctx(), 'b', 'card', 'kit-antigo', PDF as never, mutate), NotFoundException);
  await assert.rejects(build({ kit: null }).service.upload(ctx(), 'b', 'card', 'kit-1', PDF as never, mutate), NotFoundException);
  await assert.rejects(build({ member: false }).service.upload(ctx(), 'b', 'card', 'kit-1', PDF as never, mutate), ForbiddenException);
});

void test('tela: confirmar so com flow:validation:approve e parecer aprovado da versao atual; aprovado quando confirmado', async () => {
  const pending = await build({ latestRun: run() }).service.cardView(ctx(['flow:validation:approve']), 'b', 'card');
  assert.deepEqual([pending.canConfirm, pending.approved], [true, false]);
  assert.equal((await build({ latestRun: run() }).service.cardView(ctx(['flow:admin']), 'b', 'card')).canConfirm, false, 'flow:admin sozinho nao confirma');
  const old = await build({ latestRun: run({ signedKitId: 'signed-1' }) }).service.cardView(ctx(['flow:validation:approve']), 'b', 'card');
  assert.deepEqual([old.canConfirm, old.validation?.current], [false, false], 'parecer da versao anterior nao vale');
  const approved = await build({ latestRun: run({ confirmedAt: 't' }) }).service.cardView(ctx(), 'b', 'card');
  assert.equal(approved.approved, true);
});

void test('confirmacao: sem permissao 403; parecer nao confirmavel 409; confirmada registra no historico', async () => {
  await assert.rejects(build().service.confirm(ctx(), 'b', 'card', 'kit-1', 'run-1', mutate), ForbiddenException);
  await assert.rejects(build({ confirmResult: null }).service.confirm(ctx(['flow:validation:approve']), 'b', 'card', 'kit-1', 'run-1', mutate), ConflictException);
  const { service, calls } = build({ latestRun: run() });
  await service.confirm(ctx(['flow:validation:approve']), 'b', 'card', 'kit-1', 'run-1', mutate);
  assert.deepEqual(calls.events, ['card.signed_kit_approved']);
  assert.ok(calls.audits.includes('kanban_signed_kit_validation_confirmed'));
});

void test('conector: so o executor, so execucao dispatched e so da versao atual do assinado', async () => {
  const { service } = build();
  const request = await service.connectorRequest(ctx(), 'run-1', mutate);
  assert.deepEqual([request.originalKit.textPartCount, request.signedKit.pageCount, request.customer.name], [1, 4, 'MARIA']);
  const text = await service.connectorOriginalText(ctx(), 'run-1', 1);
  assert.equal(text.text, 'PROCURACAO\nAssinatura: ____');

  const other = { clientId: 'c1', identityId: 'outro', databaseRef: 'db', applicationId: 'flow', roles: [], scopes: [] } as never;
  await assert.rejects(service.connectorRequest(other, 'run-1', mutate), /nao encontrada/);
  await assert.rejects(build({ latestRun: run() }).service.connectorRequest(ctx(), 'run-1', mutate), /nao aguarda parecer/);
  await assert.rejects(build({ signed: { ...SIGNED, id: 'signed-3' } }).service.connectorRequest(ctx(), 'run-1', mutate), /mudou/);
});
