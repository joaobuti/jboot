import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { AiGatewayRequestError } from '../automation/ai-gateway-client.service';
import { CustomerDocumentRow } from '../customer-documents/customer-documents.repository';
import { ValidationRunRow } from './customer-validation.repository';
import { CustomerValidationService, deriveStatus, resolveValidationRoute, sameDocuments } from './customer-validation.service';

const CLICKER = randomUUID();
const CENTRAL = randomUUID();
const PRINCIPAL_OFFICE = randomUUID();
const context = { clientId: randomUUID(), identityId: CLICKER, databaseRef: 'ref', scopes: [], roles: [] } as never;
const central = { clientId: randomUUID(), identityId: CENTRAL, databaseRef: 'ref', scopes: [], roles: [] } as never;

function doc(type: CustomerDocumentRow['documentType']): CustomerDocumentRow {
  return { id: randomUUID(), customerId: 'c', documentType: type, version: 1, fileName: 'f', contentType: 'application/pdf', sizeBytes: 1, sha256: 'x', storageKey: 'k', uploadedByIdentityId: 'u', createdAt: 't' };
}
const fullDocs = () => (['identidade', 'cpf', 'comprovante_residencia', 'extrato_beneficio', 'hiscred'] as const).map(doc);

function run(overrides: Partial<ValidationRunRow> = {}): ValidationRunRow {
  return {
    id: randomUUID(), customerId: 'c', officeId: null, agentId: 'agent', executorIdentityId: CENTRAL, requestedByIdentityId: CLICKER,
    status: 'dispatched', documentsSnapshot: [], residenceProofThirdParty: false, cpfOnIdentity: false, verdict: null, findings: null, summary: null,
    extractedData: null, appliedFields: [],
    readableDocumentTypes: null, contractOfficeId: null, contractVersion: null, tagValues: null, gender: null, waiverCourt: null,
    generalFindings: null, alerts: null, review: null, reviewedByIdentityId: null, reviewedAt: null,
    intakeOfficeId: null, intakeResult: null, intakeBoardId: null, intakeCardId: null, intakeAssignees: null, kitResult: null, kitId: null,
    externalSessionUrl: null, errorCode: null, answeredAt: null, confirmedByIdentityId: null, confirmedAt: null, createdAt: 't',
    ...overrides
  };
}

function fixture(options: {
  settings?: boolean;
  docs?: CustomerDocumentRow[];
  createReturnsNull?: boolean;
  gateway?: () => Promise<unknown>;
  runRow?: ValidationRunRow | null;
  offices?: Array<{ id: string; name: string }>;
  /** Escritorios por responsavel, para a autorizacao do agente do escritorio (S4). */
  responsibleOf?: Array<[string, string[]]>;
  officeSettings?: Record<string, { agentId: string; agentOwnerIdentityId: string }>;
  responsible?: string[];
  /** Campos que o fillEmpty reporta como preenchidos; 'throw' simula falha. */
  filled?: string[] | 'throw';
  /** Campos de endereco que o replaceAddressFromDocument muda ([] = leitura incompleta ou igual a ficha); 'throw' simula falha. */
  addressFilled?: string[] | 'throw';
  /** Politica de documentos da empresa (ADR 019); undefined = sem politica. */
  readable?: CustomerDocumentRow['documentType'][];
  /** Tags do modelo do kit do escritorio; undefined = escritorio sem modelo. */
  contractTags?: string[];
  /** Runs devolvidos por listRecent (status). */
  recent?: ValidationRunRow[];
} = {}) {
  const calls: Record<string, unknown[]> = {
    execute: [], dispatched: [], failed: [], answer: [], confirm: [], create: [], fill: [], applied: [], audits: [], review: [], intake: [], touched: [], kit: [], address: []
  };
  const docs = options.docs ?? fullDocs();
  const repository = {
    getSettings: async () => (options.settings === false ? null : { officeId: PRINCIPAL_OFFICE, agentId: 'agent', executorIdentityId: CENTRAL, updatedAt: 't' }),
    expireStale: async () => undefined,
    getOfficeSettings: async (_r: string, _c: string, officeId: string) => {
      const row = options.officeSettings?.[officeId];
      return row ? { officeId, ...row, updatedAt: 't' } : null;
    },
    listOfficeSettings: async () => Object.entries(options.officeSettings ?? {}).map(([officeId, row]) => ({ officeId, ...row, updatedAt: 't' })),
    isOfficeResponsible: async (_r: string, _c: string, _officeId: string, identityId: string) => (options.responsible ?? []).includes(identityId),
    create: async (_r: string, _c: string, input: { id: string; snapshot: unknown; officeId: string | null; executorIdentityId: string; agentId: string }) => {
      calls.create.push(input);
      return options.createReturnsNull
        ? null
        : run({ id: input.id, status: 'dispatching', documentsSnapshot: input.snapshot as never, officeId: input.officeId, executorIdentityId: input.executorIdentityId, agentId: input.agentId });
    },
    markDispatched: async (...args: unknown[]) => { calls.dispatched.push(args); },
    markFailed: async (_r: string, _c: string, _id: string, code: string) => { calls.failed.push(code); },
    touchByRoutine: async (_r: string, _c: string, id: string) => { calls.touched.push(id); },
    listRecent: async () => options.recent ?? [],
    kitSummaries: async () => [],
    findById: async () => options.runRow ?? null,
    answer: async (_r: string, _c: string, input: unknown) => { calls.answer.push(input); return options.runRow ? { ...options.runRow, status: 'answered' } : null; },
    confirm: async (...args: unknown[]) => { calls.confirm.push(args); return options.runRow; },
    setAppliedFields: async (_r: string, _c: string, _id: string, fields: string[]) => { calls.applied.push(fields); },
    getReadablePolicy: async () => options.readable ?? null,
    saveReview: async (_r: string, _c: string, _customer: string, _id: string, review: unknown) => {
      calls.review.push(review);
      return options.runRow ? { ...options.runRow, review } : null;
    }
  };
  const documents = {
    listCurrent: async () => docs,
    getProfile: async () => ({ residenceProofThirdParty: false, cpfOnIdentity: false }),
    findById: async () => null
  };
  const customers = { requireVisibleCustomer: async () => ({}), validationOffices: async () => options.offices ?? [] };
  const gateway = {
    execute: async (input: unknown) => {
      calls.execute.push(input);
      return options.gateway ? options.gateway() : { id: randomUUID(), status: 'dispatched', externalSessionUrl: 'https://claude.ai/code/s1' };
    }
  };
  const audit = { record: async (event: string, _m: unknown, _b: unknown, payload: unknown) => { calls.audits.push({ event, payload }); } };
  const customerCore = {
    findForFlowById: async () => ({ name: 'Cliente Teste', documentNumber: '52998224725' }),
    findById: async () => ({ name: 'Cliente Teste', documentNumber: '52998224725', addressCity: null, addressState: null }),
    replaceAddressFromDocument: async (_c: string, _id: string, input: Record<string, string>) => {
      calls.address.push(input);
      if (options.addressFilled === 'throw') throw new Error('pdv down');
      return options.addressFilled ?? Object.keys(input);
    }
  };
  const offices = {
    findById: async (_r: string, _c: string, id: string) => ({ id, name: 'Manaus' }),
    findPrincipal: async () => ({ id: PRINCIPAL_OFFICE, name: 'Matriz', isPrincipal: true }),
    listResponsibleOfficeIdsByIdentity: async () => new Map(options.responsibleOf ?? [])
  };
  const contract = (version: number) => (options.contractTags ? { version, tags: options.contractTags } : null);
  const serviceContracts = {
    current: async () => contract(3),
    findVersion: async (_r: string, _c: string, _office: string, version: number) => contract(version)
  };
  const juridico = {
    get: async () => null,
    fillEmpty: async (_c: string, _id: string, input: Record<string, string>) => {
      calls.fill.push(input);
      if (options.filled === 'throw') throw new Error('db down');
      return options.filled ?? Object.keys(input);
    }
  };
  const service = new CustomerValidationService(
    repository as never, documents as never, customers as never, customerCore as never, juridico as never, {} as never, gateway as never, {} as never,
    audit as never, offices as never,
    { listFlowUsers: async () => [{ identityId: 'ana', displayName: 'Ana Advogada', email: null, isAdmin: false }] } as never,
    serviceContracts as never,
    { createForConfirmed: async (_c: unknown, run: { id: string }) => { calls.intake.push(run.id); return { result: 'created', boardId: 'b', cardId: 'card' }; } } as never,
    {} as never,
    {
      generateForConfirmed: async (_c: unknown, row: { id: string }, customer: { name: string }) => {
        calls.kit.push({ runId: row.id, customer: customer.name });
        return { result: 'generated', kitId: 'k' };
      }
    } as never
  );
  return { service, calls };
}

void test('validar dispara a rotina central em nome do executor, so com identificadores', async () => {
  const f = fixture();
  await f.service.request(context, 'c', context);
  const sent = f.calls.execute[0] as { requesterIdentityId: string; sourceType: string; payload: Record<string, unknown>; idempotencyKey: string };
  assert.equal(sent.requesterIdentityId, CENTRAL);
  assert.equal(sent.sourceType, 'flow_customer_validation');
  // O prompt da rotina usa do disparo so o run_id: nenhuma instrucao vai no payload.
  assert.deepEqual(Object.keys(sent.payload).sort(), ['document_count', 'run_id']);
  assert.equal(sent.payload.document_count, 5);
  assert.match(sent.idempotencyKey, /^customer-validation-/);
  assert.equal(f.calls.dispatched.length, 1);
});

void test('validar recusa sem agente, com documento faltando e com run em andamento, sem chamar o gateway', async () => {
  await assert.rejects(() => fixture({ settings: false }).service.request(context, 'c', context), /not configured/);
  await assert.rejects(() => fixture({ docs: fullDocs().slice(1) }).service.request(context, 'c', context), /Required documents missing/);
  const busy = fixture({ createReturnsNull: true });
  await assert.rejects(() => busy.service.request(context, 'c', context), /already in progress/);
  assert.equal(busy.calls.execute.length, 0);
});

void test('HISCON sem HISCRED bloqueia validacao antes de chamar IA', async () => {
  const f = fixture({ docs: fullDocs().filter((item) => item.documentType !== 'hiscred') });
  await assert.rejects(() => f.service.request(context, 'c', context), /Required documents missing/);
  assert.equal(f.calls.execute.length, 0);
});

void test('agente que nao e rotina e falha do gateway viram run falho com codigo', async () => {
  const api = fixture({ gateway: async () => ({ id: randomUUID(), status: 'succeeded', requestedActions: [] }) });
  await api.service.request(context, 'c', context);
  assert.deepEqual(api.calls.failed, ['validation_agent_not_routine']);
  const down = fixture({ gateway: async () => { throw new AiGatewayRequestError(503, 'ai_gateway_unavailable'); } });
  await down.service.request(context, 'c', context);
  assert.deepEqual(down.calls.failed, ['ai_gateway_unavailable']);
});

void test('conector: outro usuario nao enxerga o run e run sem parecer pendente e recusado', async () => {
  const other = fixture({ runRow: run({ executorIdentityId: randomUUID() }) });
  await assert.rejects(() => other.service.connectorRequest(central, randomUUID(), central), /nao encontrada/);
  const done = fixture({ runRow: run({ status: 'answered', verdict: 'aprovado', answeredAt: 't' }) });
  await assert.rejects(() => done.service.connectorSubmit(central, randomUUID(), { verdict: 'aprovado', findings: [], summary: 's' }, central), /nao aguarda/);
});

void test('conector: parecer descarta achados de documento fora da validacao', async () => {
  const f = fixture({ runRow: run({ documentsSnapshot: [{ type: 'cpf', documentId: 'd', version: 1 }] }) });
  await f.service.connectorSubmit(central, randomUUID(), {
    verdict: 'pendencias',
    findings: [{ documentType: 'cpf', status: 'ilegivel', note: 'x' }, { documentType: 'identidade', status: 'ok', note: 'y' }],
    summary: 's'
  }, central);
  assert.deepEqual((f.calls.answer[0] as { findings: Array<{ documentType: string }> }).findings.map((item) => item.documentType), ['cpf']);
});

void test('confirmacao exige parecer e documentos iguais aos validados', async () => {
  const docs = fullDocs();
  const snapshot = docs.map((row) => ({ type: row.documentType, documentId: row.id, version: 1 }));
  const answered = run({ status: 'answered', verdict: 'aprovado', answeredAt: 't', documentsSnapshot: snapshot });
  const ok = fixture({ docs, runRow: answered });
  await ok.service.confirm(context, 'c', answered.id, context);
  assert.equal(ok.calls.confirm.length, 1);
  assert.deepEqual(ok.calls.intake, [answered.id], 'confirmacao cria o card do cliente (ADR 019, decisao 16)');
  assert.deepEqual(ok.calls.kit, [{ runId: answered.id, customer: 'Cliente Teste' }], 'confirmacao gera o kit do escritorio (ADR 019, decisao 19)');
  const changed = fixture({ docs: [...docs.slice(1), doc('identidade')], runRow: answered });
  await assert.rejects(() => changed.service.confirm(context, 'c', answered.id, context), /Documents changed/);
  const pending = fixture({ docs, runRow: run({ documentsSnapshot: snapshot }) });
  await assert.rejects(() => pending.service.confirm(context, 'c', answered.id, context), /no pending answer/);
});

void test('status derivado: incompleto, em validacao, aguardando confirmacao, validado e nova versao invalida', () => {
  const docs = fullDocs();
  const snapshot = docs.map((row) => ({ type: row.documentType, documentId: row.id, version: 1 }));
  const answered = run({ status: 'answered', verdict: 'aprovado', answeredAt: 't', documentsSnapshot: snapshot });
  const own = { residenceProofThirdParty: false, cpfOnIdentity: false };
  assert.equal(deriveStatus(false, [], docs, own), 'documentos_incompletos');
  assert.equal(deriveStatus(true, [run()], docs, own), 'em_validacao');
  assert.equal(deriveStatus(true, [answered], docs, own), 'aguardando_confirmacao');
  assert.equal(deriveStatus(true, [{ ...answered, confirmedAt: 't', confirmedByIdentityId: 'u' }], docs, own), 'validado');
  const replaced = [...docs.slice(1), doc('identidade')];
  assert.equal(deriveStatus(true, [{ ...answered, confirmedAt: 't', confirmedByIdentityId: 'u' }], replaced, own), 'nao_validado');
  assert.equal(sameDocuments(answered, docs, { ...own, residenceProofThirdParty: true }), false, 'marcar comprovante de terceiro invalida a validacao');
  assert.equal(sameDocuments(answered, docs, { ...own, cpfOnIdentity: true }), false, 'dispensar o CPF invalida a validacao');
});

// ---- ADR 018: validacao pela conta Claude do escritorio ----

const MANAUS = { id: 'office-manaus', name: 'Manaus' };
const BOA_VISTA = { id: 'office-bv', name: 'Boa Vista' };
const OFFICE_OWNER = randomUUID();
const RESPONSIBLE = randomUUID();

void test('escritorio: cliente de um escritorio com rotina propria dispara a rotina do escritorio', async () => {
  const f = fixture({ offices: [MANAUS], officeSettings: { [MANAUS.id]: { agentId: 'agent-manaus', agentOwnerIdentityId: OFFICE_OWNER } } });
  await f.service.request(context, 'c', context);
  const created = f.calls.create[0] as { officeId: string; agentId: string; executorIdentityId: string };
  assert.deepEqual([created.officeId, created.agentId, created.executorIdentityId], [MANAUS.id, 'agent-manaus', OFFICE_OWNER]);
  const sent = f.calls.execute[0] as { agentId: string; requesterIdentityId: string };
  assert.deepEqual([sent.agentId, sent.requesterIdentityId], ['agent-manaus', OFFICE_OWNER]);
});

void test('escritorio: varios escritorios exigem escolha; escolha fora do cliente e recusada', async () => {
  const offices = [BOA_VISTA, MANAUS];
  const officeSettings = { [MANAUS.id]: { agentId: 'agent-manaus', agentOwnerIdentityId: OFFICE_OWNER } };
  await assert.rejects(() => fixture({ offices, officeSettings }).service.request(context, 'c', context), (error: { getResponse(): { code: string; offices: unknown[] } }) => {
    assert.equal(error.getResponse().code, 'customer_validation_office_required');
    assert.equal(error.getResponse().offices.length, 2);
    return true;
  });
  await assert.rejects(() => fixture({ offices, officeSettings }).service.request(context, 'c', context, 'office-x'), /not linked/);
  const chosen = fixture({ offices, officeSettings });
  await chosen.service.request(context, 'c', context, MANAUS.id);
  assert.equal((chosen.calls.create[0] as { officeId: string }).officeId, MANAUS.id);
});

void test('escritorio: sem rotina propria usa o agente do escritorio principal; sem nenhuma configuracao recusa', async () => {
  const fallback = fixture({ offices: [BOA_VISTA] });
  await fallback.service.request(context, 'c', context);
  const created = fallback.calls.create[0] as { officeId: string | null; executorIdentityId: string };
  assert.deepEqual([created.officeId, created.executorIdentityId], [PRINCIPAL_OFFICE, CENTRAL]);
  await assert.rejects(() => fixture({ offices: [BOA_VISTA], settings: false }).service.request(context, 'c', context), /not configured/);
  assert.equal(resolveValidationRoute('o', null, null), null);
});

void test('escritorio: so responsavel do escritorio le o pedido e registra o parecer', async () => {
  const officeRun = run({ officeId: MANAUS.id, executorIdentityId: OFFICE_OWNER });
  const responsible = { clientId: randomUUID(), identityId: RESPONSIBLE, databaseRef: 'ref', scopes: [], roles: [] } as never;
  const owner = { clientId: randomUUID(), identityId: OFFICE_OWNER, databaseRef: 'ref', scopes: [], roles: [] } as never;
  const f = fixture({ runRow: officeRun, responsible: [RESPONSIBLE] });
  await assert.rejects(() => f.service.connectorSubmit(owner, officeRun.id, { verdict: 'aprovado', findings: [], summary: 'x' }, owner), /nao encontrada/);
  const answered = await f.service.connectorSubmit(responsible, officeRun.id, { verdict: 'aprovado', findings: [], summary: 'x' }, responsible);
  assert.equal(answered.recorded, true);
});

// ---- S6: dados extraidos preenchem so campo vazio da ficha ----

void test('conector: extractedData normalizado vai ao parecer e preenche so campos vazios; formato invalido e descartado', async () => {
  const f = fixture({
    runRow: run({ documentsSnapshot: [{ type: 'identidade', documentId: 'd', version: 1 }] }),
    filled: ['nomeMae', 'rgUf']
  });
  const result = await f.service.connectorSubmit(central, randomUUID(), {
    verdict: 'aprovado',
    findings: [],
    summary: 's',
    extractedData: { nomeMae: '  Maria   da Silva ', rgUf: 'am', dataNascimento: '1960-02-30', profissao: 'Aposentada', endereco: 'Rua X' }
  }, central);
  const answered = f.calls.answer[0] as { extractedData: Record<string, string> };
  assert.deepEqual(answered.extractedData, { profissao: 'Aposentada', rgUf: 'AM', nomeMae: 'Maria da Silva' });
  assert.deepEqual(f.calls.fill, [answered.extractedData]);
  assert.deepEqual(f.calls.applied, [['nomeMae', 'rgUf']]);
  assert.deepEqual(result.appliedFields, ['nomeMae', 'rgUf']);
  assert.deepEqual(result.keptFields, ['profissao'], 'profissao ja preenchida na ficha prevalece');
  assert.deepEqual(result.discardedFields, ['dataNascimento']);
  const audit = (f.calls.audits as Array<{ event: string; payload: Record<string, unknown> }>).find((item) => item.event === 'kanban_customer_validation_data_applied');
  assert.deepEqual(audit?.payload.appliedFields, ['nomeMae', 'rgUf']);
  assert.equal(JSON.stringify(audit?.payload).includes('Maria'), false, 'auditoria sem o valor extraido');
});

void test('conector: sem extractedData nao toca a ficha; falha ao preencher nao desfaz o parecer', async () => {
  const none = fixture({ runRow: run() });
  const plain = await none.service.connectorSubmit(central, randomUUID(), { verdict: 'aprovado', findings: [], summary: 's' }, central);
  assert.deepEqual([none.calls.fill.length, plain.appliedFields], [0, []]);
  const failing = fixture({ runRow: run(), filled: 'throw' });
  const result = await failing.service.connectorSubmit(central, randomUUID(), {
    verdict: 'aprovado', findings: [], summary: 's', extractedData: { nomeMae: 'Maria' }
  }, central);
  assert.equal(result.recorded, true);
  assert.deepEqual(result.appliedFields, []);
  assert.ok((failing.calls.audits as Array<{ event: string }>).some((item) => item.event === 'kanban_customer_validation_data_apply_failed'));
});

void test('conector: endereco do comprovante vai ao parecer e substitui o da ficha, separado dos dados juridicos', async () => {
  const f = fixture({ runRow: run(), filled: ['nomeMae'] });
  const result = await f.service.connectorSubmit(central, randomUUID(), {
    verdict: 'aprovado',
    findings: [],
    summary: 's',
    extractedData: { nomeMae: 'Maria', addressZip: '69058830', addressCity: 'Manaus', addressState: 'am', addressStreet: 'Rua A' }
  }, central);
  const address = { addressZip: '69058-830', addressStreet: 'Rua A', addressCity: 'Manaus', addressState: 'AM' };
  assert.deepEqual(f.calls.fill, [{ nomeMae: 'Maria' }]);
  assert.deepEqual(f.calls.address, [address]);
  assert.deepEqual((f.calls.answer[0] as { extractedData: unknown }).extractedData, { nomeMae: 'Maria', ...address });
  assert.deepEqual(result.appliedFields, ['nomeMae', 'addressZip', 'addressStreet', 'addressCity', 'addressState']);
});

void test('conector: endereco sem mudanca nao conta como aplicado; falha no endereco nao desfaz os dados juridicos', async () => {
  const kept = fixture({ runRow: run(), addressFilled: [] });
  const keptResult = await kept.service.connectorSubmit(central, randomUUID(), {
    verdict: 'aprovado', findings: [], summary: 's', extractedData: { addressCity: 'Manaus', addressState: 'AM' }
  }, central);
  assert.deepEqual([kept.calls.fill.length, keptResult.appliedFields, keptResult.keptFields], [0, [], ['addressCity', 'addressState']]);

  const failing = fixture({ runRow: run(), filled: ['nomeMae'], addressFilled: 'throw' });
  const result = await failing.service.connectorSubmit(central, randomUUID(), {
    verdict: 'aprovado', findings: [], summary: 's', extractedData: { nomeMae: 'Maria', addressState: 'AM' }
  }, central);
  assert.deepEqual(result.appliedFields, ['nomeMae']);
  assert.ok((failing.calls.audits as Array<{ event: string }>).some((item) => item.event === 'kanban_customer_validation_data_apply_failed'));
});

// ---- ADR 019 / Sprint 2: valores do kit e documentos por etapa ----

const MODEL_TAGS = ['NOME_COMPLETO', 'CPF', 'BANCO_1', 'CONTRATO_1', 'DATA_POR_EXTENSO', 'LISTA_BANCOS', 'SE_JEC', 'FIM_SE_JEC'];
const OFFICE = { id: 'office-manaus', name: 'Manaus' };

void test('pedido grava o modelo do escritorio escolhido e a politica de documentos da empresa', async () => {
  const f = fixture({ offices: [OFFICE], contractTags: MODEL_TAGS, readable: ['identidade', 'extrato_beneficio'] });
  await f.service.request(context, 'c', context);
  const created = f.calls.create[0] as { contract: unknown; readableDocumentTypes: unknown; intakeOfficeId: unknown };
  assert.deepEqual(created.contract, { officeId: OFFICE.id, version: 3 });
  assert.equal(created.intakeOfficeId, OFFICE.id, 'o escritorio do pedido define o board de entrada');
  assert.deepEqual(created.readableDocumentTypes, ['identidade', 'extrato_beneficio']);
  const noModel = fixture({ offices: [OFFICE] });
  await noModel.service.request(context, 'c', context);
  assert.equal((noModel.calls.create[0] as { contract: unknown }).contract, null);
});

void test('conector: pedido lista so documentos liberados e tags do modelo sem blocos nem calculadas', async () => {
  const docs = fullDocs();
  const snapshot = docs.map((row) => ({ type: row.documentType, documentId: row.id, version: 1 }));
  const f = fixture({
    docs,
    contractTags: MODEL_TAGS,
    runRow: run({ documentsSnapshot: snapshot, readableDocumentTypes: ['identidade', 'extrato_beneficio'], contractOfficeId: OFFICE.id, contractVersion: 2 })
  });
  const request = await f.service.connectorRequest(central, randomUUID(), central);
  assert.deepEqual(request.documents.map((item) => item.documentType), ['identidade', 'extrato_beneficio']);
  assert.equal(f.calls.touched.length, 1, 'leitura do pedido marca que a rotina alcancou o Flow');
  assert.deepEqual(request.contractModel, { officeName: 'Manaus', version: 2, tags: ['NOME_COMPLETO', 'CPF', 'BANCO_1', 'CONTRATO_1'] });
  await assert.rejects(
    () => f.service.connectorDocumentPage(central, randomUUID(), 'hiscred', 1, central),
    (error: { code?: string }) => error.code === 'document_not_allowed'
  );
});

void test('conector: parecer aprovado grava valores do modelo e emprestimos _n; tag fora do modelo e descartada', async () => {
  const f = fixture({ contractTags: MODEL_TAGS, runRow: run({ contractOfficeId: OFFICE.id, contractVersion: 2 }) });
  const result = await f.service.connectorSubmit(central, randomUUID(), {
    verdict: 'aprovado', findings: [], summary: 's',
    tagValues: { NOME_COMPLETO: ' MARIA  DA SILVA ', BANCO_1: 'CREFISA', BANCO_3: 'BMG', CONTRATO_3: '123', INICIO_3: '01/02/2024',
      DATA_POR_EXTENSO: 'hoje', ENDERECO_COMPLETO: 'Rua X', CPF: '' },
    gender: 'feminino', waiverCourt: 'jef', alerts: ['Banco diferente da Crefisa'], generalFindings: []
  }, central);
  const kit = (f.calls.answer[0] as { kit: Record<string, unknown> }).kit;
  assert.deepEqual(kit.tagValues, { NOME_COMPLETO: 'MARIA DA SILVA', BANCO_1: 'CREFISA', BANCO_3: 'BMG', CONTRATO_3: '123' });
  assert.deepEqual([kit.gender, kit.waiverCourt, kit.alerts], ['feminino', 'jef', ['Banco diferente da Crefisa']]);
  assert.deepEqual(result.discardedKitTags.sort(), ['DATA_POR_EXTENSO', 'ENDERECO_COMPLETO', 'INICIO_3']);
  const audit = (f.calls.audits as Array<{ event: string; payload: Record<string, unknown> }>).find((item) => item.event === 'kanban_customer_validation_answered');
  assert.equal(JSON.stringify(audit?.payload).includes('MARIA'), false, 'auditoria so com nomes de tags');
});

void test('conector: parecer com pendencias descarta valores do kit, mas guarda pendencias gerais e alertas', async () => {
  const f = fixture({ contractTags: MODEL_TAGS, runRow: run({ contractOfficeId: OFFICE.id, contractVersion: 2 }) });
  await f.service.connectorSubmit(central, randomUUID(), {
    verdict: 'pendencias', findings: [], summary: 's',
    tagValues: { NOME_COMPLETO: 'MARIA' }, gender: 'feminino', waiverCourt: 'jec',
    generalFindings: ['Cliente nao alfabetizado: assinatura a rogo'], alerts: ['CNH vencida']
  }, central);
  const kit = (f.calls.answer[0] as { kit: Record<string, unknown> }).kit;
  assert.deepEqual([kit.tagValues, kit.gender, kit.waiverCourt], [null, null, null]);
  assert.deepEqual([kit.generalFindings, kit.alerts], [['Cliente nao alfabetizado: assinatura a rogo'], ['CNH vencida']]);
});

void test('revisao do kit: so parecer aprovado; tag fora do modelo e recusada; valores revisados sao gravados', async () => {
  const approved = run({ status: 'answered', verdict: 'aprovado', answeredAt: 't', contractOfficeId: OFFICE.id, contractVersion: 2 });
  const f = fixture({ contractTags: MODEL_TAGS, runRow: approved });
  await f.service.saveKitReview(context, 'c', approved.id, { values: { NOME_COMPLETO: 'MARIA', BANCO_2: 'BMG', CPF: ' ' }, gender: 'feminino', waiverCourt: 'jec' }, context);
  assert.deepEqual(f.calls.review, [{ values: { NOME_COMPLETO: 'MARIA', BANCO_2: 'BMG' }, gender: 'feminino', waiverCourt: 'jec' }]);
  await assert.rejects(
    () => f.service.saveKitReview(context, 'c', approved.id, { values: { OUTRA: 'x' }, gender: null, waiverCourt: null }, context),
    (error: { getResponse(): { code: string } }) => error.getResponse().code === 'customer_validation_kit_tag_invalid'
  );
  const pending = fixture({ contractTags: MODEL_TAGS, runRow: { ...approved, verdict: 'pendencias' } });
  await assert.rejects(
    () => pending.service.saveKitReview(context, 'c', approved.id, { values: {}, gender: null, waiverCourt: null }, context),
    (error: { getResponse(): { code: string } }) => error.getResponse().code === 'customer_validation_kit_not_available'
  );
  // Kit ja gerado na confirmacao (ADR 019, decisao 19): revisar depois nao muda o arquivo.
  const confirmed = fixture({ contractTags: MODEL_TAGS, runRow: { ...approved, confirmedAt: 't', confirmedByIdentityId: 'u' } });
  await assert.rejects(
    () => confirmed.service.saveKitReview(context, 'c', approved.id, { values: {}, gender: null, waiverCourt: null }, context),
    (error: { getResponse(): { code: string } }) => error.getResponse().code === 'customer_validation_kit_already_generated'
  );
  assert.deepEqual(confirmed.calls.review, []);
});

void test('status: responsaveis do card de entrada voltam com nome e motivo de quem ficou de fora', async () => {
  const confirmed = run({
    status: 'answered', verdict: 'aprovado', answeredAt: 't', confirmedAt: 't', confirmedByIdentityId: 'u', intakeResult: 'created',
    intakeAssignees: { assigned: ['ana'], skipped: [{ identityId: 'bia', reason: 'not_board_member' }] }
  });
  const f = fixture({ recent: [confirmed] });
  const result = await f.service.status(context, 'c', context);
  assert.deepEqual(result.runs[0].intakeAssignees, {
    assigned: [{ identityId: 'ana', name: 'Ana Advogada' }],
    skipped: [{ identityId: 'bia', reason: 'not_board_member', name: null }]
  });
});

// ---- flow-offices S4: agente do escritorio por admin ou responsavel com ai:agents:manage ----

void test('agente do escritorio: admin altera qualquer um; responsavel so o seu, com ai:agents:manage', async () => {
  const OFFICE = randomUUID();
  const as = (scopes: string[], identityId = CLICKER) => ({ clientId: randomUUID(), identityId, databaseRef: 'ref', scopes, roles: [] }) as never;
  const f = fixture({ responsibleOf: [[CLICKER, [OFFICE]]] });
  await assert.rejects(() => f.service.putOfficeSettings(as(['flow:read']), OFFICE, null, context), /office_agent_not_allowed|Only flow:admin/);
  await assert.rejects(() => f.service.putOfficeSettings(as(['ai:agents:manage']), randomUUID(), null, context), /Only flow:admin/);
  await assert.rejects(() => f.service.putSettings(as(['ai:agents:manage']), 'agent', context), /Only flow:admin/, 'principal nao e dele');
  const allowed = fixture({ responsibleOf: [[CLICKER, [OFFICE, PRINCIPAL_OFFICE]]] });
  await allowed.service.putOfficeSettings(as(['ai:agents:manage']), OFFICE, null, context).catch((error: Error) => {
    assert.doesNotMatch(error.message, /Only flow:admin/);
  });
});
