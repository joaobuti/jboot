import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { StorageService } from '../attachments/storage.service';
import { FlowCustomersService } from '../flow-customers/flow-customers.service';
import { CreateFlowCustomerDto, UpdateFlowCustomerDto } from '../flow-customers/dto/flow-customer.dto';
import { CustomerValidationRepository, ValidationRunRow } from '../customer-validation/customer-validation.repository';
import { DocumentRasterizerService } from '../customer-validation/document-rasterizer.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { missingCustomerDocumentTypes, requiredCustomerDocumentTypes } from './customer-document-catalog';
import { CustomerDocumentRow, CustomerDocumentsRepository, CreateCustomerDocumentInput } from './customer-documents.repository';
import { CustomerDocumentsService } from './customer-documents.service';

const context = { clientId: randomUUID(), identityId: randomUUID(), databaseRef: 'ref', scopes: [], roles: [] } as never;
const mutate = context;
const PDF = Buffer.from('%PDF-1.7\n%test');
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(30)]);

function fixture(
  options: { visible?: boolean; failInsert?: boolean; pdfRejection?: 'password_protected' | 'unreadable'; answered?: ValidationRunRow | null } = {}
) {
  const rows: CustomerDocumentRow[] = [];
  const uploads: string[] = [];
  const deleted: string[] = [];
  const audits: Array<{ event: string; payload: Record<string, unknown> }> = [];
  let profile = { residenceProofThirdParty: false, cpfOnIdentity: false };
  const repository = {
    listCurrent: async () => rows,
    getProfile: async () => profile,
    updateProfile: async (_r: string, _c: string, _id: string, patch: Partial<typeof profile>) => { profile = { ...profile, ...patch }; },
    createVersion: async (_r: string, _c: string, data: CreateCustomerDocumentInput) => {
      if (options.failInsert) throw new Error('db down');
      const row = { ...data, version: 1, uploadedByIdentityId: data.identityId, createdAt: new Date().toISOString() } as CustomerDocumentRow;
      rows.push(row);
      return row;
    },
    removeCurrent: async () => null,
    findById: async () => null
  } as unknown as CustomerDocumentsRepository;
  const customers = {
    requireVisibleCustomer: async () => {
      if (options.visible === false) throw new NotFoundException({ code: 'customer_not_found' });
      return {};
    }
  } as unknown as FlowCustomersService;
  const storage = {
    bucketName: 'bucket',
    buildCustomerDocumentKey: (p: { clientId: string; customerId: string; documentId: string }) =>
      `${p.clientId}/customers/${p.customerId}/documents/${p.documentId}`,
    upload: async (key: string) => { uploads.push(key); },
    deleteQuietly: async (key: string) => { deleted.push(key); return true; }
  } as unknown as StorageService;
  const audit = { record: async (event: string, _m: unknown, _b: unknown, payload: Record<string, unknown>) => { audits.push({ event, payload }); } } as unknown as KanbanAuditService;
  const rasterizer = { inspectPdf: async () => options.pdfRejection ?? null } as unknown as DocumentRasterizerService;
  const validations = { latestAnswered: async () => options.answered ?? null } as unknown as CustomerValidationRepository;
  return { service: new CustomerDocumentsService(repository, customers, storage, audit, rasterizer, validations), uploads, deleted, audits };
}

const file = (buffer: Buffer, mimetype: string, originalname = 'Joao da Silva RG.pdf') => ({ buffer, mimetype, originalname, size: buffer.length });

const own = { residenceProofThirdParty: false, cpfOnIdentity: false };
const thirdParty = { residenceProofThirdParty: true, cpfOnIdentity: false };

void test('catalogo: HISCRED exigido; declaracao so com comprovante de terceiro; extrato vale como um dos dois', () => {
  // Exigidos um a um: identidade, CPF, comprovante, HISCRED (+ declaracao). HISCON e Promobank: um dos dois.
  assert.deepEqual(requiredCustomerDocumentTypes(own), ['identidade', 'cpf', 'comprovante_residencia', 'hiscred']);
  assert.equal(requiredCustomerDocumentTypes(thirdParty).length, 5);
  assert.deepEqual(missingCustomerDocumentTypes(new Set(['identidade', 'cpf', 'comprovante_residencia', 'extrato_beneficio', 'hiscred']), thirdParty), [
    'declaracao_residencia_terceiro'
  ]);
  assert.deepEqual(missingCustomerDocumentTypes(new Set(['identidade', 'cpf', 'comprovante_residencia', 'extrato_beneficio']), own), ['hiscred']);
});

void test('catalogo (Promobank, 2026-11-02): HISCON ou Promobank basta; sem nenhum, falta o extrato na ordem do catalogo', () => {
  const base = ['identidade', 'cpf', 'comprovante_residencia', 'hiscred'] as const;
  assert.deepEqual(missingCustomerDocumentTypes(new Set([...base, 'promobank']), own), []);
  assert.deepEqual(missingCustomerDocumentTypes(new Set([...base, 'extrato_beneficio']), own), []);
  assert.deepEqual(missingCustomerDocumentTypes(new Set([...base, 'extrato_beneficio', 'promobank']), own), []);
  assert.deepEqual(missingCustomerDocumentTypes(new Set(base), own), ['extrato_beneficio']);
  assert.deepEqual(missingCustomerDocumentTypes(new Set(['identidade']), own), ['cpf', 'comprovante_residencia', 'extrato_beneficio', 'hiscred']);
});

void test('catalogo: CPF dispensado quando o RG novo ou a CNH ja trazem o numero', () => {
  const cpfOnIdentity = { residenceProofThirdParty: false, cpfOnIdentity: true };
  assert.deepEqual(requiredCustomerDocumentTypes(cpfOnIdentity), ['identidade', 'comprovante_residencia', 'hiscred']);
  assert.deepEqual(missingCustomerDocumentTypes(new Set(['identidade', 'comprovante_residencia', 'extrato_beneficio', 'hiscred']), cpfOnIdentity), []);
});

void test('ficha com Promobank: completa para validar, itens do extrato marcados como um dos dois', async () => {
  const f = fixture();
  const customerId = randomUUID();
  const result = await f.service.upload(context, customerId, 'promobank', file(PDF, 'application/pdf', 'promobank.pdf'), mutate);
  const promobank = result.items.find((item) => item.type === 'promobank');
  const hiscon = result.items.find((item) => item.type === 'extrato_beneficio');
  assert.deepEqual([promobank?.label, promobank?.required, promobank?.oneOf], ['Promobank — Extrato de Empréstimos', false, 'extrato']);
  assert.deepEqual([hiscon?.required, hiscon?.oneOf, hiscon?.current], [false, 'extrato', null]);
  assert.equal(result.missing.includes('extrato_beneficio'), false);
  assert.equal(result.items.find((item) => item.type === 'hiscred')?.oneOf, null);
});

void test('HISCON preserva o tipo anterior e HISCRED aceita upload independente', async () => {
  const f = fixture();
  const customerId = randomUUID();
  const hiscon = await f.service.upload(context, customerId, 'extrato_beneficio', file(PDF, 'application/pdf', 'hiscon.pdf'), mutate);
  const legacy = hiscon.items.find((item) => item.type === 'extrato_beneficio');
  assert.equal(legacy?.label, 'HISCON — Histórico de Consignado');
  const result = await f.service.upload(context, customerId, 'hiscred', file(PDF, 'application/pdf', 'hiscred.pdf'), mutate);
  assert.equal(result.items.find((item) => item.type === 'extrato_beneficio')?.current?.id, legacy?.current?.id);
  const added = result.items.find((item) => item.type === 'hiscred');
  assert.equal(added?.label, 'HISCRED — Histórico de Crédito');
  assert.equal(added?.required, true);
  assert.equal(added?.current?.fileName, 'hiscred.pdf');
  assert.equal(result.missing.includes('hiscred'), false);
});

void test('upload grava o objeto sem nome de arquivo na chave e audita sem dado pessoal', async () => {
  const f = fixture();
  const customerId = randomUUID();
  const result = await f.service.upload(context, customerId, 'identidade', file(PDF, 'application/pdf'), mutate);
  assert.equal(f.uploads.length, 1);
  assert.equal(f.uploads[0].includes('Joao'), false);
  assert.equal(result.items.find((item) => item.type === 'identidade')?.current?.fileName, 'Joao da Silva RG.pdf');
  assert.equal(result.complete, false);
  assert.deepEqual(f.audits[0], { event: 'kanban_flow_customer_document_uploaded', payload: { customerId, documentType: 'identidade', version: 1 } });
});

void test('upload recusa tipo desconhecido, formato fora da ficha e cliente invisivel antes de gravar', async () => {
  const f = fixture();
  await assert.rejects(() => f.service.upload(context, randomUUID(), 'procuracao', file(PDF, 'application/pdf'), mutate), /Unknown document type/);
  const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  await assert.rejects(() => f.service.upload(context, randomUUID(), 'cpf', file(DOCX, docxType, 'cpf.docx'), mutate), /PDF, PNG, JPEG or WebP/);
  await assert.rejects(() => f.service.upload(context, randomUUID(), 'cpf', file(Buffer.from('nao e pdf'), 'application/pdf'), mutate), /does not match/);
  const hidden = fixture({ visible: false });
  await assert.rejects(() => hidden.service.upload(context, randomUUID(), 'cpf', file(PDF, 'application/pdf'), mutate), NotFoundException);
  assert.equal(f.uploads.length + hidden.uploads.length, 0);
});

void test('falha ao gravar no banco remove o objeto ja enviado', async () => {
  const f = fixture({ failInsert: true });
  await assert.rejects(() => f.service.upload(context, randomUUID(), 'cpf', file(PDF, 'application/pdf'), mutate), /db down/);
  assert.deepEqual(f.deleted, f.uploads);
});

void test('comprovante de terceiro torna a declaracao exigida', async () => {
  const f = fixture();
  const result = await f.service.updateProfile(context, randomUUID(), { residenceProofThirdParty: true }, mutate);
  assert.equal(result.items.find((item) => item.type === 'declaracao_residencia_terceiro')?.required, true);
  assert.equal(result.missing.length, 6);
  assert.deepEqual(f.audits.at(-1), { event: 'kanban_flow_customer_document_profile_updated', payload: { customerId: result.customerId, residenceProofThirdParty: true } });
});

void test('CPF na identidade dispensa o documento CPF; patch vazio e recusado', async () => {
  const f = fixture();
  const result = await f.service.updateProfile(context, randomUUID(), { cpfOnIdentity: true }, mutate);
  assert.equal(result.cpfOnIdentity, true);
  assert.equal(result.items.find((item) => item.type === 'cpf')?.required, false);
  assert.equal(result.missing.includes('cpf'), false);
  await assert.rejects(
    () => f.service.updateProfile(context, randomUUID(), {}, mutate),
    (error: { getResponse(): { code: string } }) => error.getResponse().code === 'customer_document_profile_empty'
  );
});

void test('CPF obrigatorio: criacao sem CPF e edicao com null sao recusadas; edicao sem o campo passa', () => {
  const base = { name: 'Cliente', officeIds: [randomUUID()] };
  assert.ok(validateSync(plainToInstance(CreateFlowCustomerDto, base)).some((error) => error.property === 'documentNumber'));
  assert.equal(validateSync(plainToInstance(CreateFlowCustomerDto, { ...base, documentNumber: '529.982.247-25' })).length, 0);
  assert.ok(validateSync(plainToInstance(UpdateFlowCustomerDto, { documentNumber: null })).some((error) => error.property === 'documentNumber'));
  assert.equal(validateSync(plainToInstance(UpdateFlowCustomerDto, { name: 'Outro' })).length, 0);
});

void test('upload: PDF com senha ou corrompido e recusado antes de gravar', async () => {
  for (const [rejection, code] of [['password_protected', 'customer_document_password_protected'], ['unreadable', 'customer_document_unreadable']] as const) {
    const { service, uploads } = fixture({ pdfRejection: rejection });
    await assert.rejects(
      () => service.upload(context, randomUUID(), 'identidade', file(PDF, 'application/pdf'), mutate),
      (error: { getStatus(): number; getResponse(): { code: string } }) => error.getStatus() === 422 && error.getResponse().code === code
    );
    assert.deepEqual(uploads, []);
  }
});

void test('lista: parecer da IA marca o arquivo lido como recusado ou aprovado; nova versao volta a enviado', async () => {
  const answered = {
    answeredAt: '2026-10-21T10:00:00.000Z',
    confirmedAt: null,
    documentsSnapshot: [] as Array<{ type: string; documentId: string; version: number }>,
    findings: [
      { documentType: 'identidade', status: 'ilegivel', note: 'Foto cortada' },
      { documentType: 'cpf', status: 'ok', note: '' }
    ]
  } as unknown as ValidationRunRow;
  const f = fixture({ answered });
  const customerId = randomUUID();
  await f.service.upload(context, customerId, 'identidade', file(PDF, 'application/pdf'), mutate);
  const uploaded = await f.service.upload(context, customerId, 'cpf', file(PDF, 'application/pdf', 'cpf.pdf'), mutate);
  const identidade = uploaded.items.find((item) => item.type === 'identidade')!;
  const cpf = uploaded.items.find((item) => item.type === 'cpf')!;
  answered.documentsSnapshot.push(
    { type: 'identidade', documentId: identidade.current!.id, version: 1 },
    { type: 'cpf', documentId: cpf.current!.id, version: 1 }
  );
  const listed = await f.service.list(context, customerId, mutate);
  assert.deepEqual(listed.items.find((item) => item.type === 'identidade')?.review, {
    outcome: 'recusado', status: 'ilegivel', note: 'Foto cortada', answeredAt: '2026-10-21T10:00:00.000Z', confirmed: false
  });
  assert.equal(listed.items.find((item) => item.type === 'cpf')?.review?.outcome, 'aprovado');
  // Arquivo novo (outro id) ainda nao foi lido pela IA.
  const replaced = await f.service.upload(context, customerId, 'identidade', file(PDF, 'application/pdf', 'rg-novo.pdf'), mutate);
  assert.equal(replaced.items.find((item) => item.type === 'identidade')?.review, null);
});

void test('lista: documento da ficha nao liberado para a rotina aparece como nao conferido pela IA (ADR 019)', async () => {
  const answered = {
    answeredAt: '2026-10-22T10:00:00.000Z', confirmedAt: null, readableDocumentTypes: ['identidade'],
    documentsSnapshot: [] as Array<{ type: string; documentId: string; version: number }>,
    findings: [{ documentType: 'identidade', status: 'ok', note: '' }]
  } as unknown as ValidationRunRow;
  const f = fixture({ answered });
  const customerId = randomUUID();
  const hiscred = (await f.service.upload(context, customerId, 'hiscred', file(PDF, 'application/pdf', 'hiscred.pdf'), mutate)).items.find((item) => item.type === 'hiscred')!;
  answered.documentsSnapshot.push({ type: 'hiscred', documentId: hiscred.current!.id, version: 1 });
  const listed = await f.service.list(context, customerId, mutate);
  assert.equal(listed.items.find((item) => item.type === 'hiscred')?.review?.outcome, 'nao_conferido');
});
