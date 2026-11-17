import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildDocx } from '../../../test/docx-fixture';
import { renderOfficeKitDocx } from '../offices/service-contract/office-kit-render';
import { ValidationRunRow } from './customer-validation.repository';
import { kitFileName, OfficeKitGenerationService } from './office-kit-generation.service';

const context = { clientId: 'c1', identityId: 'u1', databaseRef: 'db', applicationId: 'a', roles: [], scopes: [] } as never;
const mutate = { ...(context as object), ip: '127.0.0.1', userAgent: 'test' } as never;
const MODEL = buildDocx({ paragraphs: ['[[NOME_COMPLETO]], portador(a), CPF [[CPF]], [[PROFISSAO]]'] });

function run(overrides: Partial<ValidationRunRow> = {}): ValidationRunRow {
  return {
    id: 'run1', customerId: 'cust', verdict: 'aprovado', contractOfficeId: 'office', contractVersion: 3,
    tagValues: { NOME_COMPLETO: 'MARIA IA', CPF: '529.982.247-25' }, gender: 'feminino', waiverCourt: 'jec', review: null,
    ...overrides
  } as ValidationRunRow;
}

function build(options: { model?: Record<string, unknown> | null; saveFails?: boolean; renderFails?: boolean; kitEmails?: unknown } = {}) {
  const calls = { saved: [] as Array<Record<string, unknown>>, results: [] as string[], audits: [] as Array<{ event: string; payload: Record<string, unknown> }>, uploaded: [] as string[], deleted: [] as string[], rendered: [] as unknown[] };
  const validations = {
    setKitResult: async (_r: string, _c: string, _id: string, result: string) => { calls.results.push(result); },
    saveKit: async (_r: string, _c: string, kit: Record<string, unknown>) => {
      if (options.saveFails) throw new Error('db down');
      calls.saved.push(kit);
      return { driveQueued: true };
    }
  };
  const model = 'model' in options ? options.model : { format: 'docx', storageKey: 'model.docx', version: 3 };
  const service = new OfficeKitGenerationService(
    validations as never,
    { findVersion: async () => model } as never,
    {
      download: async () => MODEL,
      buildCustomerKitStorageKey: (p: { clientId: string; customerId: string; kitId: string }) => `${p.clientId}/customers/${p.customerId}/kits/${p.kitId}.docx`,
      upload: async (key: string) => { calls.uploaded.push(key); },
      deleteQuietly: async (key: string) => { calls.deleted.push(key); return true; }
    } as never,
    {
      renderOfficeKit: async (buffer: Buffer, input: unknown) => {
        calls.rendered.push(input);
        return options.renderFails ? { ok: false, status: 422, code: 'office_kit_render_failed', message: 'x', details: {} } : renderOfficeKitDocx(buffer, input as never);
      }
    } as never,
    { record: async (event: string, _m: unknown, _b: unknown, payload: Record<string, unknown>) => { calls.audits.push({ event, payload }); } } as never,
    options.kitEmails as never
  );
  return { service, calls };
}

const customer = { name: 'Maria José da Silva', documentNumber: '52998224725' };

void test('kit: parecer aprovado gera o arquivo com os valores revisados, guarda e audita sem conteudo', async () => {
  const f = build();
  const reviewed = run({ review: { values: { NOME_COMPLETO: 'MARIA REVISADA', CPF: '111.111.111-11' }, gender: 'masculino', waiverCourt: 'jef' } });
  const outcome = await f.service.generateForConfirmed(context, reviewed, customer, mutate);
  assert.equal(outcome.result, 'generated');
  assert.deepEqual(f.calls.rendered[0], { values: { NOME_COMPLETO: 'MARIA REVISADA', CPF: '111.111.111-11' }, gender: 'masculino', waiverCourt: 'jef', generatedAt: (f.calls.rendered[0] as { generatedAt: string }).generatedAt });
  const saved = f.calls.saved[0] as { fileName: string; storageKey: string; report: { emptyTags: string[]; warnings: Array<{ code: string }> } };
  assert.match(saved.fileName, /^KIT_MARIA_JOSE_DA_SILVA_\d{4}-\d{2}-\d{2}\.docx$/);
  assert.match(saved.storageKey, /^c1\/customers\/cust\/kits\/[0-9a-f-]{36}\.docx$/);
  assert.deepEqual(saved.report.emptyTags, ['PROFISSAO']);
  assert.deepEqual(saved.report.warnings.map((item) => item.code), ['waiver_jef_not_applied', 'cpf_differs_from_customer']);
  const audit = f.calls.audits.find((item) => item.event === 'kanban_customer_office_kit_generated');
  assert.equal(audit?.payload.emptyTagCount, 1);
  assert.equal(JSON.stringify(audit?.payload).includes('MARIA'), false, 'auditoria sem valor do kit');
  assert.deepEqual(f.calls.results, []);
});

void test('kit: sem gerar com pendencias, sem modelo ou com modelo do editor antigo; motivo fica no run', async () => {
  for (const [row, options, expected] of [
    [run({ verdict: 'pendencias' }), {}, 'not_approved'],
    [run({ contractOfficeId: null, contractVersion: null }), {}, 'no_model'],
    [run(), { model: null }, 'no_model'],
    [run(), { model: { format: 'html', storageKey: null } }, 'model_not_docx'],
    [run(), { renderFails: true }, 'failed']
  ] as const) {
    const f = build(options);
    assert.equal((await f.service.generateForConfirmed(context, row, customer, mutate)).result, expected);
    assert.deepEqual(f.calls.results, [expected]);
    assert.deepEqual(f.calls.uploaded, []);
  }
});

void test('kit: falha ao gravar remove o arquivo e vira "failed" sem lancar', async () => {
  const f = build({ saveFails: true });
  assert.deepEqual(await f.service.generateForConfirmed(context, run(), customer, mutate), { result: 'failed', kitId: null });
  assert.deepEqual(f.calls.deleted, f.calls.uploaded);
  assert.deepEqual(f.calls.results, ['failed']);
});

void test('kit (S4 de flow-signed-kit-sprints.md): gerado, entra na fila de e-mail com o e-mail do cliente; falha la nao desfaz o kit', async () => {
  const queued: Array<{ kit: Record<string, unknown>; customer: Record<string, unknown> }> = [];
  const f = build({ kitEmails: { enqueueForKit: async (_c: unknown, kit: Record<string, unknown>, customer: Record<string, unknown>) => { queued.push({ kit, customer }); return 'queued'; } } });
  const outcome = await f.service.generateForConfirmed(context, run(), { ...customer, email: 'maria@exemplo.com' }, mutate);
  assert.equal(outcome.result, 'generated');
  assert.deepEqual([queued[0].kit.id, queued[0].kit.officeId, queued[0].kit.customerId, queued[0].customer.email], [outcome.kitId, 'office', 'cust', 'maria@exemplo.com']);

  const broken = build({ kitEmails: { enqueueForKit: async () => { throw new Error('db down'); } } });
  assert.equal((await broken.service.generateForConfirmed(context, run(), customer, mutate)).result, 'generated');
  assert.equal(broken.calls.saved.length, 1);
});

void test('kit: nome do arquivo em maiusculas sem acento', () => {
  assert.equal(kitFileName('João  D\'Ávila', '2026-10-28T15:00:00Z'), 'KIT_JOAO_D_AVILA_2026-10-28.docx');
  assert.equal(kitFileName('', '2026-10-28T15:00:00Z'), 'KIT_CLIENTE_2026-10-28.docx');
});
