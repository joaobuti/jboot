import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import PizZip from 'pizzip';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { HttpException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { buildDocx, DOCM_MAIN } from '../../../test/docx-fixture';
import { memoryStorage, seedSubmittedLead, syntheticSnapshot } from '../../../test/kanban-analysis-fixture';
import { OfficeScenario, ScenarioUser, scenarioContext, seedOfficeScenario } from '../../../test/kanban-office-fixture';
import { buildRealVisibility, fakeAdminDirectory } from '../../../test/kanban-visibility';
import { withTestDatabase } from '../../../test/with-test-database';
import { ActivitiesRepository } from '../activities/activities.repository';
import { ActivitiesService } from '../activities/activities.service';
import { AssigneesRepository } from '../assignees/assignees.repository';
import { CaseTypesRepository } from '../case-types/case-types.repository';
import { CaseTypesService } from '../case-types/case-types.service';
import { DocumentTemplatesRepository } from '../document-templates/document-templates.repository';
import { DocumentTemplatesService } from '../document-templates/document-templates.service';
import { DOCX_CONTENT_TYPE } from '../document-templates/docx-package';
import { TemplateValidationRunner } from '../document-templates/template-validation-runner.service';
import { KanbanAuthGuard } from '../guards/kanban-auth.guard';
import { REQUIRED_SCOPES_KEY, ScopeGuard } from '../guards/scope.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { OfficesRepository } from '../offices/offices.repository';
import { LeadAnalysisController } from './lead-analysis.controller';
import { LeadAnalysisRepository } from './lead-analysis.repository';
import { LeadAnalysisService } from './lead-analysis.service';
import { LeadDocumentsController } from './lead-documents.controller';

const code = (error: unknown) => ((error as HttpException).getResponse() as { code?: string }).code;
const status = (error: unknown) => (error as HttpException).getStatus();
const body = (error: unknown) => (error as HttpException).getResponse() as Record<string, unknown>;
const ctx = (s: OfficeScenario, user: ScenarioUser) => scenarioContext(s, user);
const mut = (s: OfficeScenario, user: ScenarioUser) => ({ ...scenarioContext(s, user), ip: '127.0.0.1', userAgent: 'test' });

function docxFile(buffer: Buffer, originalname = 'Revisado - Cliente Sintetico.docx') {
  return { originalname, mimetype: DOCX_CONTENT_TYPE, size: buffer.length, buffer };
}

interface Published {
  recipientIdentityId: string;
  kind: string;
  payload: Record<string, unknown>;
}

function build(db: DatabaseService, s: OfficeScenario) {
  const dbWithIdentity = { ...db, queryIdentity: async () => ({ rows: [] }) } as unknown as DatabaseService;
  const directory = fakeAdminDirectory([s.users.admin]);
  const { access, visibility, members, leads } = buildRealVisibility(dbWithIdentity, directory);
  const storage = memoryStorage();
  const audits: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const audit = {
    record: async (type: string, _m: unknown, _b: unknown, payload: Record<string, unknown>) => void audits.push({ type, payload })
  };
  const published: Published[] = [];
  const notifications = new NotificationsService({ publish: async (input: Published) => void published.push(input) } as never, visibility);
  const enqueued: string[] = [];
  const pdfQueue = { enqueue: async (payload: { documentId: string }) => void enqueued.push(payload.documentId) };
  const templatesRepository = new DocumentTemplatesRepository(db);
  const runner = new TemplateValidationRunner();
  const templates = new DocumentTemplatesService(templatesRepository, storage as never, runner, audit as never);
  const caseTypesRepository = new CaseTypesRepository(db);
  const caseTypes = new CaseTypesService(caseTypesRepository, templatesRepository, audit as never);
  const assignees = new AssigneesRepository(db);
  const analysis = new LeadAnalysisService(
    new LeadAnalysisRepository(db),
    leads,
    visibility,
    access,
    templates,
    templatesRepository,
    caseTypesRepository,
    new OfficesRepository(db),
    storage as never,
    runner,
    pdfQueue as never,
    notifications,
    assignees,
    members,
    audit as never
  );
  const activities = new ActivitiesService(new ActivitiesRepository(db), visibility, access, assignees, notifications);
  return { analysis, templates, caseTypes, storage, audits, published, enqueued, activities };
}

type Built = ReturnType<typeof build>;

const TEMPLATE_PARAGRAPHS = [
  'PROCURACAO SINTETICA',
  'Outorgante: {{cliente.nome}}, CPF {{cliente.cpf}}, nascida em {{cliente.data_nascimento}}.',
  'Mae: {{cliente.nome_mae}}. Telefone: {{cliente.telefone}}. E-mail: {{cliente.email}}.',
  'Escritorio: {{escritorio.nome}}. Caso: {{caso.tipo}}.',
  '{{#lead.casos}}{{ordem}}) {{tipo}} {{/lead.casos}}'
];

/** Modelo sintetico (S5) com e-mail opcional, tipo de caso vinculado como padrao. */
async function seedTemplate(b: Built, s: OfficeScenario, name: string, paragraphs = TEMPLATE_PARAGRAPHS, optional = ['cliente.email']) {
  const admin = ctx(s, 'admin');
  const template = await b.templates.create(admin, { name }, mut(s, 'admin'));
  const version = await b.templates.uploadVersion(admin, template.id, docxFile(buildDocx({ paragraphs }), 'modelo.docx'), mut(s, 'admin'));
  if (optional.length > 0) {
    await b.templates.updateVariables(
      admin,
      template.id,
      version.id,
      { variables: optional.map((key) => ({ key, required: false })) },
      mut(s, 'admin')
    );
  }
  const caseType = await b.caseTypes.create(
    admin,
    { name: `Tipo ${name}`, templateIds: [template.id], defaultTemplateId: template.id },
    mut(s, 'admin')
  );
  return { templateId: template.id, versionId: version.id, caseTypeId: caseType.id };
}

async function leadStatus(client: Client, cardId: string): Promise<string> {
  return (await client.query<{ status: string }>(`SELECT status FROM kanban_card_leads WHERE card_id = $1`, [cardId])).rows[0].status;
}

function textOf(docx: Buffer): string {
  const xml = new PizZip(docx).file('word/document.xml')?.asText() ?? '';
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join(' ');
}

void test('controllers: gestao so flow:admin; documentos entregues sem scope extra (card visivel)', () => {
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, LeadAnalysisController), [KanbanAuthGuard, ScopeGuard]);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, LeadDocumentsController), [KanbanAuthGuard, ScopeGuard]);
  const admin = LeadAnalysisController.prototype as unknown as Record<string, object>;
  const handlers = Object.getOwnPropertyNames(admin).filter((name) => name !== 'constructor');
  assert.equal(handlers.length, 9);
  for (const name of handlers) {
    assert.deepEqual(Reflect.getMetadata(REQUIRED_SCOPES_KEY, admin[name]), ['flow:admin'], name);
  }
  const office = LeadDocumentsController.prototype as unknown as Record<string, object>;
  for (const name of Object.getOwnPropertyNames(office).filter((item) => item !== 'constructor')) {
    assert.equal(Reflect.getMetadata(REQUIRED_SCOPES_KEY, office[name]), undefined, name);
  }
});

void test('fluxo completo: classificar, gerar (PE14), regerar, aprovar (outbox do PDF), entregar ao escritorio', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const b = build(db, s);
    const seeded = await seedTemplate(b, s, 'Procuracao sintetica');
    const submissionId = await seedSubmittedLead(client, s, s.cardA);
    const admin = ctx(s, 'admin');

    const empty = await b.analysis.getAnalysis(admin, s.boardId, s.cardA);
    assert.equal(empty.leadStatus, 'enviado');
    assert.equal(empty.analysisOpen, true);
    assert.deepEqual(empty.cases, []);
    const option = empty.caseTypes.find((type) => type.id === seeded.caseTypeId);
    assert.deepEqual(option?.templates.map((t) => [t.id, t.isDefault, t.usable]), [[seeded.templateId, true, true]]);

    const classified = await b.analysis.addCase(admin, s.boardId, s.cardA, { caseTypeId: seeded.caseTypeId }, mut(s, 'admin'));
    assert.equal(classified.cases.length, 1);
    assert.equal(classified.leadStatus, 'enviado', 'classificar nao muda o estado');
    const caseId = classified.cases[0].id;
    await assert.rejects(
      b.analysis.addCase(admin, s.boardId, s.cardA, { caseTypeId: seeded.caseTypeId }, mut(s, 'admin')),
      (error) => status(error) === 409 && code(error) === 'case_type_already_classified'
    );

    const generated = await b.analysis.generate(admin, s.boardId, s.cardA, caseId, {}, mut(s, 'admin'));
    assert.equal(generated.leadStatus, 'aguardando_revisao', 'PE14: primeiro rascunho');
    const [v1] = generated.cases[0].documents;
    assert.deepEqual([v1.version, v1.status, v1.origin, v1.pdf], [1, 'rascunho', 'generated', null]);
    assert.equal(v1.templateVersionId, seeded.versionId);
    assert.deepEqual(v1.missingOptional, ['cliente.email']);
    assert.equal(v1.variables.find((variable) => variable.key === 'cliente.nome')?.origin, 'cadastro_enviado');
    assert.equal(v1.variables.find((variable) => variable.key === 'escritorio.nome')?.origin, 'escritorio');

    // Arquivo: chave sem nome, valores do snapshot do envio, opcional ausente com marcador.
    const key = `${s.clientId}/${s.cardA}/generated/${v1.id}.docx`;
    const docx = b.storage.objects.get(key);
    assert.ok(docx, 'objeto no prefixo generated do card');
    const text = textOf(docx);
    assert.match(text, /Outorgante: Cliente Sintetico da Silva, CPF 529\.982\.247-25, nascida em 05\/03\/1960\./);
    assert.match(text, /Mae: Mae Sintetica\. Telefone: \(41\) 99999-0000\. E-mail: \[PREENCHER: cliente\.email\]\./);
    assert.match(text, /Escritorio: Escritorio A\. Caso: Tipo Procuracao sintetica\./);
    assert.match(text, /1\) Tipo Procuracao sintetica/);

    // Rastreabilidade (R7) no banco: FK da versao, sha do modelo, valores e origem.
    const row = (
      await client.query<{ templateSha: string; filled: Record<string, { value: unknown; origin: string }>; sha: string }>(
        `SELECT template_sha256 AS "templateSha", filled_variables AS filled, sha256 AS sha FROM kanban_card_generated_documents WHERE id = $1`,
        [v1.id]
      )
    ).rows[0];
    const templateVersion = (await client.query<{ sha: string }>(`SELECT sha256 AS sha FROM kanban_document_template_versions WHERE id = $1`, [
      seeded.versionId
    ])).rows[0];
    assert.equal(row.templateSha, templateVersion.sha);
    assert.equal(row.sha, createHash('sha256').update(docx).digest('hex'));
    assert.deepEqual(row.filled['cliente.cpf'], { value: '529.982.247-25', origin: 'cadastro_enviado', required: true, filled: true });

    // Regerar: versao nova; rascunho anterior substituido.
    const regenerated = await b.analysis.generate(admin, s.boardId, s.cardA, caseId, {}, mut(s, 'admin'));
    assert.deepEqual(regenerated.cases[0].documents.map((doc) => [doc.version, doc.status]), [
      [2, 'rascunho'],
      [1, 'substituido']
    ]);
    const v2 = regenerated.cases[0].documents[0];

    // Escritorio ainda nao ve nada (so aprovado).
    assert.deepEqual((await b.analysis.listDelivered(ctx(s, 'memberA'), s.boardId, s.cardA)).documents, []);
    await assert.rejects(b.analysis.downloadDelivered(ctx(s, 'memberA'), s.boardId, s.cardA, v2.id, 'docx'), (e) => code(e) === 'generated_document_not_found');

    // Aprovar: aprovador/data, PDF pending (outbox) + enqueue; lead aprovado (unico caso); escritorio notificado.
    const approved = await b.analysis.approve(admin, s.boardId, s.cardA, v2.id, mut(s, 'admin'));
    assert.equal(approved.leadStatus, 'aprovado');
    const approvedDoc = approved.cases[0].documents[0];
    assert.deepEqual([approvedDoc.status, approvedDoc.pdf?.status, approvedDoc.approvedByIdentityId], ['aprovado', 'pending', s.users.admin]);
    assert.ok(approvedDoc.approvedAt);
    assert.deepEqual(b.enqueued, [v2.id]);
    const notified = b.published.filter((item) => item.kind === 'kanban.card.lead_document_approved');
    assert.deepEqual(
      notified.map((item) => item.recipientIdentityId),
      [s.users.memberA],
      'quem enviou (escritorio A); criador do card nao e membro'
    );
    assert.deepEqual(notified[0].payload, { boardId: s.boardId, cardId: s.cardA, submissionId, documentId: v2.id });
    await assert.rejects(b.analysis.approve(admin, s.boardId, s.cardA, v2.id, mut(s, 'admin')), (e) => code(e) === 'document_not_reviewable');

    // Escritorio: ve e baixa o aprovado (.docx); PDF ainda pendente = 409; versao substituida = 404.
    const delivered = await b.analysis.listDelivered(ctx(s, 'memberA'), s.boardId, s.cardA);
    assert.deepEqual(delivered.documents.map((doc) => [doc.id, doc.title, doc.version, doc.pdfStatus]), [
      [v2.id, 'Procuracao sintetica', 2, 'pending']
    ]);
    assert.equal(Object.prototype.hasOwnProperty.call(delivered.documents[0], 'caseTypeName'), false, 'P11: sem classificacao');
    const download = await b.analysis.downloadDelivered(ctx(s, 'memberA'), s.boardId, s.cardA, v2.id, 'docx');
    assert.equal(download.fileName, 'Procuracao sintetica - v2.docx');
    await assert.rejects(b.analysis.downloadDelivered(ctx(s, 'memberA'), s.boardId, s.cardA, v2.id, 'pdf'), (e) => code(e) === 'pdf_not_ready');
    await assert.rejects(b.analysis.downloadDelivered(ctx(s, 'memberA'), s.boardId, s.cardA, v1.id, 'docx'), (e) => code(e) === 'generated_document_not_found');
    // Escritorio de outro card (Sprint 3.5): card invisivel = 404 sem revelar.
    await assert.rejects(b.analysis.listDelivered(ctx(s, 'memberB'), s.boardId, s.cardA), (e) => (e as Error).message === 'Card not found');
    await assert.rejects(b.analysis.downloadDelivered(ctx(s, 'memberB'), s.boardId, s.cardA, v2.id, 'docx'), (e) => (e as Error).message === 'Card not found');

    // Gestor baixa o rascunho antigo com nome marcado.
    assert.equal((await b.analysis.downloadForManager(admin, s.boardId, s.cardA, v1.id, 'docx')).fileName, 'Procuracao sintetica - rascunho v1.docx');

    // Auditoria e eventos sem dado pessoal.
    const audited = JSON.stringify(b.audits);
    assert.doesNotMatch(audited, /Cliente Sintetico|529\.982|52998224725/);
    const events = await client.query<{ payload: Record<string, unknown> }>(
      `SELECT event_payload AS payload FROM kanban_card_activities WHERE card_id = $1 AND type = 'system_event' ORDER BY created_at`,
      [s.cardA]
    );
    const kinds = events.rows.map((event) => event.payload.kind);
    for (const kind of [
      'card.lead_case_classified',
      'card.lead_document_generated',
      'card.lead_analysis_status_changed',
      'card.lead_document_approved'
    ]) {
      assert.ok(kinds.includes(kind), kind);
    }
    assert.doesNotMatch(JSON.stringify(events.rows), /Cliente Sintetico|529\.982|Procuracao/);
  }));

void test('R5: obrigatoria sem valor bloqueia a geracao e lista os campos; nada e gravado', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const b = build(db, s);
    const seeded = await seedTemplate(b, s, 'Declaracao sintetica', ['{{cliente.nome}} {{cliente.email}} {{cliente.profissao}}'], []);
    await seedSubmittedLead(client, s, s.cardA, syntheticSnapshot({ email: null }));
    const admin = ctx(s, 'admin');
    const caseId = (await b.analysis.addCase(admin, s.boardId, s.cardA, { caseTypeId: seeded.caseTypeId }, mut(s, 'admin'))).cases[0].id;
    await assert.rejects(b.analysis.generate(admin, s.boardId, s.cardA, caseId, {}, mut(s, 'admin')), (error) => {
      assert.equal(status(error), 422);
      assert.equal(code(error), 'document_required_variables_missing');
      assert.deepEqual(body(error).missingVariables, [
        { key: 'cliente.email', label: 'E-mail' },
        { key: 'cliente.profissao', label: 'Profissao' }
      ]);
      return true;
    });
    assert.equal([...b.storage.objects.keys()].filter((key) => key.includes('/generated/')).length, 0);
    assert.equal(await leadStatus(client, s.cardA), 'enviado');
  }));

void test('permissao: so flow:admin classifica, gera, aprova, substitui e ve a analise (operador e board_admin = 403)', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const b = build(db, s);
    await seedSubmittedLead(client, s, s.cardA);
    const id = randomUUID();
    for (const user of ['memberA', 'boardAdminA', 'memberB'] as ScenarioUser[]) {
      const c = ctx(s, user);
      const m = mut(s, user);
      const calls: Array<() => Promise<unknown>> = [
        () => b.analysis.getAnalysis(c, s.boardId, s.cardA),
        () => b.analysis.addCase(c, s.boardId, s.cardA, { caseTypeId: id }, m),
        () => b.analysis.changeCase(c, s.boardId, s.cardA, id, { caseTypeId: id, reason: 'motivo de teste' }, m),
        () => b.analysis.removeCase(c, s.boardId, s.cardA, id, { reason: 'motivo de teste' }, m),
        () => b.analysis.generate(c, s.boardId, s.cardA, id, {}, m),
        () => b.analysis.approve(c, s.boardId, s.cardA, id, m),
        () => b.analysis.uploadEditedVersion(c, s.boardId, s.cardA, id, docxFile(buildDocx()), m),
        () => b.analysis.retryPdf(c, s.boardId, s.cardA, id, m),
        () => b.analysis.downloadForManager(c, s.boardId, s.cardA, id, 'docx')
      ];
      for (const call of calls) {
        await assert.rejects(call(), (error) => status(error) === 403 && code(error) === 'lead_admin_required', user);
      }
    }
  }));

void test('versao editada: nasce aprovada com PDF novo, substitui o aprovado; arquivo inseguro recusado sem gravar', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const b = build(db, s);
    const seeded = await seedTemplate(b, s, 'Peticao sintetica');
    await seedSubmittedLead(client, s, s.cardA);
    const admin = ctx(s, 'admin');
    const caseId = (await b.analysis.addCase(admin, s.boardId, s.cardA, { caseTypeId: seeded.caseTypeId }, mut(s, 'admin'))).cases[0].id;
    const draft = (await b.analysis.generate(admin, s.boardId, s.cardA, caseId, {}, mut(s, 'admin'))).cases[0].documents[0];
    await b.analysis.approve(admin, s.boardId, s.cardA, draft.id, mut(s, 'admin'));

    await assert.rejects(
      b.analysis.uploadEditedVersion(admin, s.boardId, s.cardA, draft.id, docxFile(buildDocx({ mainContentType: DOCM_MAIN })), mut(s, 'admin')),
      (error) => status(error) === 422 && code(error) === 'template_macro_forbidden'
    );
    await assert.rejects(
      b.analysis.uploadEditedVersion(admin, s.boardId, s.cardA, draft.id, { ...docxFile(buildDocx()), originalname: 'x.pdf' }, mut(s, 'admin')),
      (error) => code(error) === 'document_content_type_not_allowed'
    );
    const objectsBefore = b.storage.objects.size;

    const edited = buildDocx({ paragraphs: ['Peticao revisada pelo gestor', 'Sobrou {{cliente.nome}}'] });
    const result = await b.analysis.uploadEditedVersion(admin, s.boardId, s.cardA, draft.id, docxFile(edited), mut(s, 'admin'));
    assert.deepEqual(result.warnings.map((warning) => warning.code), ['template_tag_left']);
    assert.equal(b.storage.objects.size, objectsBefore + 1);
    const docs = result.analysis.cases[0].documents;
    assert.deepEqual(docs.map((doc) => [doc.version, doc.status, doc.origin]), [
      [2, 'aprovado', 'uploaded_edit'],
      [1, 'substituido', 'generated']
    ]);
    assert.equal(docs[0].basedOnDocumentId, draft.id);
    assert.equal(docs[0].templateVersionId, seeded.versionId, 'herda a versao do modelo');
    assert.equal(docs[0].pdf?.status, 'pending');
    assert.equal(result.analysis.leadStatus, 'aprovado');
    assert.deepEqual(b.enqueued, [draft.id, result.documentId]);
    assert.deepEqual(b.storage.objects.get(`${s.clientId}/${s.cardA}/generated/${result.documentId}.docx`), edited);
    const delivered = await b.analysis.listDelivered(ctx(s, 'memberA'), s.boardId, s.cardA);
    assert.deepEqual(delivered.documents.map((doc) => [doc.id, doc.editedByManager]), [[result.documentId, true]]);
    assert.doesNotMatch(JSON.stringify(b.audits), /Revisado|Cliente Sintetico/, 'auditoria sem nome de arquivo');
  }));

void test('N casos (P3): aprovado so com todos; troca/remocao auditadas reabrem; duplicado e inativo recusados', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const b = build(db, s);
    const first = await seedTemplate(b, s, 'Modelo A');
    const second = await seedTemplate(b, s, 'Modelo B');
    const third = await seedTemplate(b, s, 'Modelo C');
    await seedSubmittedLead(client, s, s.cardA);
    const admin = ctx(s, 'admin');
    const m = mut(s, 'admin');
    let analysis = await b.analysis.addCase(admin, s.boardId, s.cardA, { caseTypeId: first.caseTypeId }, m);
    analysis = await b.analysis.addCase(admin, s.boardId, s.cardA, { caseTypeId: second.caseTypeId }, m);
    const [caseA, caseB] = analysis.cases.map((item) => item.id);

    const docA = (await b.analysis.generate(admin, s.boardId, s.cardA, caseA, {}, m)).cases[0].documents[0];
    // O laco lead.casos lista os dois casos no documento.
    assert.match(textOf(b.storage.objects.get(`${s.clientId}/${s.cardA}/generated/${docA.id}.docx`) as Buffer), /1\) Tipo Modelo A 2\) Tipo Modelo B/);
    analysis = await b.analysis.approve(admin, s.boardId, s.cardA, docA.id, m);
    assert.equal(analysis.leadStatus, 'aguardando_revisao', 'caso B sem documento aprovado');
    const docB = (await b.analysis.generate(admin, s.boardId, s.cardA, caseB, {}, m)).cases[1].documents[0];
    analysis = await b.analysis.approve(admin, s.boardId, s.cardA, docB.id, m);
    assert.equal(analysis.leadStatus, 'aprovado');

    // Troca do caso B (motivo): caso novo aponta para o anterior; documento do caso trocado sai da entrega; lead reabre.
    await assert.rejects(
      b.analysis.changeCase(admin, s.boardId, s.cardA, caseB, { caseTypeId: first.caseTypeId, reason: 'mudou para A' }, m),
      (error) => code(error) === 'case_type_already_classified'
    );
    analysis = await b.analysis.changeCase(admin, s.boardId, s.cardA, caseB, { caseTypeId: third.caseTypeId, reason: 'classificado errado' }, m);
    assert.equal(analysis.leadStatus, 'aguardando_revisao');
    assert.deepEqual(analysis.cases.map((item) => item.caseTypeId), [first.caseTypeId, third.caseTypeId]);
    assert.equal(analysis.cases[1].replacesCaseId, caseB);
    assert.deepEqual(analysis.removedCases.map((item) => [item.id, item.supersededReason]), [[caseB, 'classificado errado']]);
    assert.equal(analysis.removedCases[0].documents[0].status, 'substituido');
    assert.deepEqual((await b.analysis.listDelivered(ctx(s, 'memberA'), s.boardId, s.cardA)).documents.map((doc) => doc.id), [docA.id]);

    // Remocao do caso novo (sem documento): todos os ativos aprovados de novo -> aprovado.
    analysis = await b.analysis.removeCase(admin, s.boardId, s.cardA, analysis.cases[1].id, { reason: 'caso nao se aplica' }, m);
    assert.equal(analysis.leadStatus, 'aprovado');

    // Tipo inativo nao entra.
    await client.query(`UPDATE kanban_case_types SET active = false WHERE id = $1`, [third.caseTypeId]);
    await assert.rejects(b.analysis.addCase(admin, s.boardId, s.cardA, { caseTypeId: third.caseTypeId }, m), (error) => code(error) === 'case_type_inactive');
    assert.equal((await b.analysis.getAnalysis(admin, s.boardId, s.cardA)).caseTypes.some((type) => type.id === third.caseTypeId), false);
  }));

void test('estado: fora da analise = 409; devolvido mantem o ciclo e bloqueia geracao; modelo adulterado no storage = 409', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const b = build(db, s);
    const seeded = await seedTemplate(b, s, 'Modelo integridade');
    const admin = ctx(s, 'admin');
    await assert.rejects(
      b.analysis.addCase(admin, s.boardId, s.cardA, { caseTypeId: seeded.caseTypeId }, mut(s, 'admin')),
      (error) => status(error) === 409 && code(error) === 'lead_not_in_analysis'
    );
    await seedSubmittedLead(client, s, s.cardA);
    const caseId = (await b.analysis.addCase(admin, s.boardId, s.cardA, { caseTypeId: seeded.caseTypeId }, mut(s, 'admin'))).cases[0].id;

    const templateKey = [...b.storage.objects.keys()].find((key) => key.includes(`/templates/${seeded.templateId}/`)) as string;
    const original = b.storage.objects.get(templateKey) as Buffer;
    b.storage.objects.set(templateKey, buildDocx({ paragraphs: ['{{cliente.nome}} adulterado'] }));
    await assert.rejects(b.analysis.generate(admin, s.boardId, s.cardA, caseId, {}, mut(s, 'admin')), (error) => code(error) === 'template_integrity_mismatch');
    b.storage.objects.set(templateKey, original);

    await client.query(`UPDATE kanban_card_leads SET status = 'devolvido' WHERE card_id = $1`, [s.cardA]);
    await assert.rejects(b.analysis.generate(admin, s.boardId, s.cardA, caseId, {}, mut(s, 'admin')), (error) => code(error) === 'lead_not_in_analysis');
    const view = await b.analysis.getAnalysis(admin, s.boardId, s.cardA);
    assert.equal(view.analysisOpen, false);
    assert.equal(view.cases.length, 1, 'o ciclo devolvido continua no historico do gestor');
  }));

void test('PDF: "Gerar PDF novamente" so para failed (volta a pending e reenfileira); done = 409', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const b = build(db, s);
    const seeded = await seedTemplate(b, s, 'Modelo PDF');
    await seedSubmittedLead(client, s, s.cardA);
    const admin = ctx(s, 'admin');
    const caseId = (await b.analysis.addCase(admin, s.boardId, s.cardA, { caseTypeId: seeded.caseTypeId }, mut(s, 'admin'))).cases[0].id;
    const draft = (await b.analysis.generate(admin, s.boardId, s.cardA, caseId, {}, mut(s, 'admin'))).cases[0].documents[0];
    await assert.rejects(b.analysis.retryPdf(admin, s.boardId, s.cardA, draft.id, mut(s, 'admin')), (error) => code(error) === 'document_not_approved');
    await b.analysis.approve(admin, s.boardId, s.cardA, draft.id, mut(s, 'admin'));
    await client.query(
      `UPDATE kanban_card_generated_documents SET pdf_status = 'failed', pdf_attempts = 3, pdf_error_code = 'converter_unavailable' WHERE id = $1`,
      [draft.id]
    );
    const failedView = await b.analysis.getAnalysis(admin, s.boardId, s.cardA);
    assert.deepEqual(failedView.cases[0].documents[0].pdf, { status: 'failed', attempts: 3, errorCode: 'converter_unavailable', completedAt: null });
    const retried = await b.analysis.retryPdf(admin, s.boardId, s.cardA, draft.id, mut(s, 'admin'));
    assert.deepEqual([retried.cases[0].documents[0].pdf?.status, retried.cases[0].documents[0].pdf?.attempts], ['pending', 0]);
    assert.equal(retried.cases[0].documents[0].status, 'aprovado', 'aprovacao mantida');
    assert.deepEqual(b.enqueued, [draft.id, draft.id]);
    await client.query(
      `UPDATE kanban_card_generated_documents SET pdf_status = 'done', pdf_storage_key = $2, pdf_sha256 = $3, pdf_completed_at = now() WHERE id = $1`,
      [draft.id, `${s.clientId}/${s.cardA}/generated/${draft.id}.pdf`, 'c'.repeat(64)]
    );
    await assert.rejects(b.analysis.retryPdf(admin, s.boardId, s.cardA, draft.id, mut(s, 'admin')), (error) => code(error) === 'pdf_already_generated');
    const pdfLink = await b.analysis.downloadDelivered(ctx(s, 'memberA'), s.boardId, s.cardA, draft.id, 'pdf');
    assert.equal(pdfLink.fileName, 'Modelo PDF - v1.pdf');
    assert.match(pdfLink.url, /\.pdf$/);
  }));

void test('historico do card (P11): classificacao e geracao so o gestor ve; aprovacao e estado o escritorio ve', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const b = build(db, s);
    const seeded = await seedTemplate(b, s, 'Modelo historico');
    await seedSubmittedLead(client, s, s.cardA);
    const admin = ctx(s, 'admin');
    const caseId = (await b.analysis.addCase(admin, s.boardId, s.cardA, { caseTypeId: seeded.caseTypeId }, mut(s, 'admin'))).cases[0].id;
    const draft = (await b.analysis.generate(admin, s.boardId, s.cardA, caseId, {}, mut(s, 'admin'))).cases[0].documents[0];
    await b.analysis.approve(admin, s.boardId, s.cardA, draft.id, mut(s, 'admin'));
    const kindsFor = async (user: ScenarioUser) =>
      (await b.activities.list(ctx(s, user), s.boardId, s.cardA, { limit: 100, offset: 0 } as never)).data
        .map((activity) => activity.eventPayload?.kind)
        .filter(Boolean);
    const office = await kindsFor('memberA');
    // now() e constante na transacao do fixture. Este teste verifica visibilidade,
    // nao a ordem indefinida entre eventos que possuem o mesmo created_at.
    assert.deepEqual([...office].sort(), ['card.lead_analysis_status_changed', 'card.lead_document_approved', 'card.lead_analysis_status_changed'].sort());
    const manager = await kindsFor('admin');
    assert.ok(manager.includes('card.lead_case_classified'));
    assert.ok(manager.includes('card.lead_document_generated'));
    const page = await b.activities.list(ctx(s, 'memberA'), s.boardId, s.cardA, { limit: 100, offset: 0 } as never);
    assert.equal(page.meta.total, office.length, 'total nao revela evento oculto');
  }));
