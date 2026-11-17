import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { AutomationCustomerService } from './automation-customer.service';

const OWNER = randomUUID();
const context = { clientId: 'c1', identityId: OWNER, databaseRef: 'ref', scopes: [], roles: [] } as never;
const mutate = { ...(context as object), ip: '127.0.0.1' } as never;

function build(
  options: {
    run?: boolean;
    link?: boolean;
    confirmed?: boolean;
    visible?: boolean;
    customerDocumentTypes?: string[];
    expectedResult?: string;
    preconditions?: Record<string, unknown>;
    snapshot?: Array<{ type: string; documentId: string; version: number }>;
    current?: Array<{ id: string; documentType: string; version: number }>;
  } = {}
) {
  const audits: string[] = [];
  const failures: string[] = [];
  const downloads: string[] = [];
  const service = new AutomationCustomerService(
    { findDispatchedForOwner: async (_r: string, _c: string, _id: string, owner: string) => (options.run === false || owner !== OWNER ? null : { id: 'run', boardId: 'b', cardId: 'card', actionConfig: { ...(options.customerDocumentTypes ? { customerDocumentTypes: options.customerDocumentTypes } : {}), ...(options.expectedResult ? { expectedResult: options.expectedResult } : {}) } }), touchDispatched: async () => undefined, failDispatched: async (_r: string, _c: string, _id: string, code: string) => { failures.push(code); return true; } } as never,
    { findByCard: async () => (options.link === false ? null : { cardId: 'card', customerId: 'cust' }) } as never,
    {
      latestConfirmed: async () =>
        options.confirmed === false
          ? null
          : {
              verdict: 'aprovado', summary: 'ok', findings: [], confirmedAt: 't', residenceProofThirdParty: false,
              documentsSnapshot: options.snapshot ?? [{ type: 'extrato_beneficio', documentId: 'doc-1', version: 2 }, { type: 'hiscred', documentId: 'doc-2', version: 1 }]
            }
    } as never,
    {
      findById: async (_r: string, _c: string, customerId: string, id: string) => ({ id, customerId, storageKey: `key-${id}`, contentType: 'application/pdf' }),
      listCurrent: async () => options.current ?? []
    } as never,
    { findForFlowById: async () => ({ name: 'Cliente', documentNumber: '00000000191', email: null, phone: null }) } as never,
    { get: async () => ({ estadoCivil: 'casado' }) } as never,
    { download: async (key: string) => { downloads.push(key); return Buffer.from('pdf'); } } as never,
    { render: async (_b: Buffer, _t: string, page: number) => ({ jpeg: Buffer.from([0xff]), page, pageCount: 4, width: 1, height: 1 }) } as never,
    { requireVisibleCard: async () => { if (options.visible === false) throw new NotFoundException('Card not found'); return {}; } } as never,
    { record: async (event: string) => { audits.push(event); } } as never,
    { evaluate: async () => options.preconditions ?? { ok: true, context: {} } } as never,
    { createSystemEvent: async (_r: string, _c: string, _card: string, _who: string, kind: string, payload: { reason: string }) => { failures.push(`${kind}:${payload.reason}`); } } as never
  );
  return { service, audits, downloads, failures };
}

void test('automacao: rotina le ficha, parecer aprovado e pagina do extrato validado', async () => {
  const { service, audits, downloads } = build();
  const result = await service.cardCustomer(context, 'run', mutate);
  assert.equal(result.customer.cpf, '00000000191');
  assert.equal((result.customer as Record<string, unknown>).estadoCivil, 'casado');
  assert.deepEqual(result.documents.map((doc) => doc.documentType), ['extrato_beneficio', 'hiscred']);
  const page = await service.cardCustomerDocumentPage(context, 'run', 'extrato_beneficio', 3, mutate);
  assert.deepEqual([page.page, page.pageCount, page.version], [3, 4, 2]);
  assert.deepEqual(downloads, ['key-doc-1']);
  assert.deepEqual(audits, ['kanban_automation_customer_read', 'kanban_automation_customer_document_read']);
});

void test('automacao: outro usuario, card invisivel, card sem cliente ou cliente sem validacao aprovada nao leem nada', async () => {
  const other = { clientId: 'c1', identityId: randomUUID(), databaseRef: 'ref', scopes: [], roles: [] } as never;
  await assert.rejects(() => build().service.cardCustomer(other, 'run', mutate), /nao encontrada/);
  await assert.rejects(() => build({ visible: false }).service.cardCustomer(context, 'run', mutate), NotFoundException);
  await assert.rejects(() => build({ link: false }).service.cardCustomer(context, 'run', mutate), /sem cliente|nao tem cliente/);
  await assert.rejects(() => build({ confirmed: false }).service.cardCustomer(context, 'run', mutate), /validacao aprovada/);
  await assert.rejects(
    () => build().service.cardCustomerDocumentPage(context, 'run', 'cpf', 1, mutate),
    /nao faz parte da validacao aprovada/
  );
});

void test('automacao: so os documentos liberados na regra (ADR 019) sao listados e lidos', async () => {
  const { service, downloads } = build({ customerDocumentTypes: ['hiscred'] });
  const result = await service.cardCustomer(context, 'run', mutate);
  assert.deepEqual(result.documents.map((doc) => doc.documentType), ['hiscred']);
  await assert.rejects(
    () => service.cardCustomerDocumentPage(context, 'run', 'extrato_beneficio', 1, mutate),
    (error: { code?: string }) => error.code === 'document_not_allowed'
  );
  assert.deepEqual(downloads, []);
});

void test('peticoes iniciais: a ficha sai com UF, endereco, genero, acoes ajuizadas e quem assina (ADR 020, S3 e S7)', async () => {
  const petition = {
    ok: true,
    context: {
      customerId: 'cust', uf: 'AM', birthDate: '1950-03-01',
      address: { street: 'Rua A', number: '10', complement: null, neighborhood: 'Centro', city: 'Manaus', state: 'AM', zip: '69000-000' },
      validation: { gender: 'feminino' },
      priorLawsuits: { status: 'declared_none', lawsuits: [] },
      closing: {
        place: null,
        signer: { identityId: 'adv-1', name: 'Maria', oabNumber: '12345', oabUf: 'AM' },
        gaps: ['office_without_city']
      }
    }
  };
  const { service } = build({ expectedResult: 'initial_petitions', preconditions: petition });
  const result = (await service.cardCustomer(context, 'run', mutate)) as unknown as { petition: Record<string, unknown> };
  assert.equal(result.petition.uf, 'AM');
  assert.equal(result.petition.gender, 'feminino');
  assert.deepEqual(result.petition.signer, { name: 'Maria', oabNumber: '12345', oabUf: 'AM' }, 'sem o id interno');
  assert.deepEqual(result.petition.closingGaps, ['office_without_city']);
  assert.match(String(result.petition.notes), /montado pelo Flow/);
  assert.equal((result.petition.priorLawsuits as { status: string }).status, 'declared_none');

  const analysis = await build({ expectedResult: 'action_analysis' }).service.cardCustomer(context, 'run', mutate);
  assert.equal('petition' in analysis, false, 'outras automacoes nao recebem endereco nem advogado');
});

void test('peticoes iniciais: pre-condicao que caiu depois do disparo encerra a execucao e avisa a rotina', async () => {
  const { service, failures } = build({
    expectedResult: 'initial_petitions',
    preconditions: { ok: false, code: 'customer_without_uf', message: 'A ficha do cliente nao tem a UF do endereco.' }
  });
  await assert.rejects(
    () => service.cardCustomer(context, 'run', mutate),
    (error: Error & { code?: string }) => error.code === 'customer_without_uf' && /nao continue/.test(error.message)
  );
  assert.deepEqual(failures, ['customer_without_uf', 'card.automation_run_failed:customer_without_uf']);
});

void test('automacao (Promobank, 2026-11-02): HISCON enviado depois de validar com o Promobank e lido como os validados', async () => {
  const snapshot = [{ type: 'promobank', documentId: 'promo-1', version: 1 }, { type: 'hiscred', documentId: 'doc-2', version: 1 }];
  const current = [
    { id: 'promo-1', documentType: 'promobank', version: 1 },
    { id: 'late-hiscon', documentType: 'extrato_beneficio', version: 1 },
    { id: 'doc-2', documentType: 'hiscred', version: 1 }
  ];
  const { service, downloads } = build({ snapshot, current, customerDocumentTypes: ['extrato_beneficio'] });
  const result = await service.cardCustomer(context, 'run', mutate);
  assert.deepEqual(result.documents.map((doc) => doc.documentType), ['extrato_beneficio'], 'a regra libera so o HISCON; o tardio entra');
  const page = await service.cardCustomerDocumentPage(context, 'run', 'extrato_beneficio', 1, mutate);
  assert.equal(page.version, 1);
  assert.deepEqual(downloads, ['key-late-hiscon']);

  // Sem HISCON na ficha: a leitura continua recusada, com o motivo.
  const without = build({ snapshot, current: current.filter((row) => row.documentType !== 'extrato_beneficio') });
  await assert.rejects(
    () => without.service.cardCustomerDocumentPage(context, 'run', 'extrato_beneficio', 1, mutate),
    /nem foi enviado depois dela/
  );
  // So o HISCON tem leitura tardia: outro documento fora da validacao continua fora.
  const lateCpf = build({ snapshot, current: [...current, { id: 'cpf-1', documentType: 'cpf', version: 1 }] });
  await assert.rejects(() => lateCpf.service.cardCustomerDocumentPage(context, 'run', 'cpf', 1, mutate), /nao faz parte da validacao aprovada/);
});
