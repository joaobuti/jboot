import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ForbiddenException, HttpException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import {
  completeCustomer,
  createRequiredDocumentType,
  fakeCustomerServices,
  LEAD_CPF,
  LeadCustomerStore,
  linkCustomer,
  seedDocument,
  setLeadIntake
} from '../../../test/kanban-lead-fixture';
import { OfficeScenario, ScenarioUser, scenarioContext, seedOfficeScenario } from '../../../test/kanban-office-fixture';
import { buildRealVisibility, fakeAdminDirectory } from '../../../test/kanban-visibility';
import { withTestDatabase } from '../../../test/with-test-database';
import { ActivitiesRepository } from '../activities/activities.repository';
import { AssigneesRepository } from '../assignees/assignees.repository';
import { CardsService } from '../cards/cards.service';
import { ColumnsRepository } from '../columns/columns.repository';
import { CardCustomersRepository } from '../customers/card-customers.repository';
import { CardCustomersService } from '../customers/card-customers.service';
import { CardDocumentsRepository } from '../documents/card-documents.repository';
import { CardDocumentsService } from '../documents/card-documents.service';
import { ChecklistGateService } from '../documents/checklist-gate.service';
import { DocumentTypesRepository } from '../documents/document-types.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { TagsRepository } from '../tags/tags.repository';
import { ListLeadQueueQueryDto, ReturnLeadDto, UpdateLeadSettingsDto } from './dto/lead.dto';
import { LeadSettingsRepository } from './lead-settings.repository';
import { LeadSettingsService } from './lead-settings.service';
import { LeadsService } from './leads.service';

const code = (error: unknown) => ((error as HttpException).getResponse() as { code?: string }).code;
const body = (error: unknown) => (error as HttpException).getResponse() as Record<string, unknown>;
const ctx = (s: OfficeScenario, user: ScenarioUser) => scenarioContext(s, user);
const mut = (s: OfficeScenario, user: ScenarioUser) => ({ ...scenarioContext(s, user), ip: '127.0.0.1', userAgent: 'test' });

interface Published {
  recipientIdentityId: string;
  kind: string;
  payload: Record<string, unknown>;
}

function build(db: DatabaseService, s: OfficeScenario, store: LeadCustomerStore) {
  const dbWithIdentity = { ...db, queryIdentity: async () => ({ rows: [] }) } as unknown as DatabaseService;
  const directory = fakeAdminDirectory([s.users.admin]);
  const { access, visibility, officePolicy, members, cards, leads, leadLock } = buildRealVisibility(dbWithIdentity, directory);
  const published: Published[] = [];
  const audits: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const audit = {
    record: async (type: string, _m: unknown, _b: unknown, payload: Record<string, unknown>) => {
      audits.push({ type, payload });
    }
  };
  const notifications = new NotificationsService(
    { publish: async (input: Published) => void published.push(input) } as never,
    visibility
  );
  const { customers, juridico } = fakeCustomerServices(store);
  const activities = new ActivitiesRepository(db);
  const assignees = new AssigneesRepository(db);
  const columns = new ColumnsRepository(db);
  const cardDocuments = new CardDocumentsRepository(db);
  const cardCustomers = new CardCustomersRepository(db);
  const settingsRepository = new LeadSettingsRepository(db);
  const leadsService = new LeadsService(
    leads,
    settingsRepository,
    visibility,
    access,
    cardCustomers,
    customers as never,
    juridico as never,
    new DocumentTypesRepository(db),
    cardDocuments,
    assignees,
    members,
    notifications,
    directory,
    audit as never
  );
  const cardsService = new CardsService(
    cards,
    columns,
    activities,
    new TagsRepository(db),
    {} as never,
    access,
    audit as never,
    assignees,
    { recordForActivity: async () => undefined } as never,
    { notify: async () => undefined } as never,
    new ChecklistGateService(cardDocuments),
    cardDocuments,
    visibility,
    officePolicy,
    leads,
    leadLock,
    { assertCanEnterColumn: async () => undefined, cardIdsWithoutHisconForBoard: async () => new Set<string>(), cardIdsWithSignedKitPendingForBoard: async () => new Set<string>() } as never
  );
  const documentsService = new CardDocumentsService(
    cardDocuments,
    new DocumentTypesRepository(db),
    visibility,
    assignees,
    { buildStorageKey: () => 'k' } as never,
    access,
    audit as never,
    { notify: async () => undefined } as never,
    columns,
    leadLock
  );
  const customersService = new CardCustomersService(
    cardCustomers,
    visibility,
    activities,
    access,
    audit as never,
    customers as never,
    juridico as never,
    leadLock
  );
  const settingsService = new LeadSettingsService(settingsRepository, audit as never);
  return { leadsService, cardsService, documentsService, customersService, settingsService, published, audits };
}

/** Lead A completo: captacao ligada, cliente com cadastro default P16 e documento obrigatorio ENVIADO (nao aceito, P13). */
async function seedCompleteLead(client: Client, s: OfficeScenario) {
  const customerId = randomUUID();
  const store: LeadCustomerStore = {
    core: new Map([[customerId, completeCustomer(customerId)]]),
    juridico: new Map([[customerId, { dataNascimento: '1980-01-02' }]])
  };
  await setLeadIntake(client, s, true);
  await linkCustomer(client, s, s.cardA, customerId);
  const documentTypeId = await createRequiredDocumentType(client, s);
  const documentId = await seedDocument(client, s, s.cardA, documentTypeId, 'enviado');
  await client.query(
    `INSERT INTO kanban_card_assignees (client_id, card_id, identity_id, assigned_by_identity_id) VALUES ($1, $2, $3, $3)`,
    [s.clientId, s.cardA, s.users.memberAB]
  );
  return { customerId, store, documentTypeId, documentId };
}

async function leadRows(client: Client, s: OfficeScenario, cardId: string) {
  const [leads, submissions, events] = await Promise.all([
    client.query(`SELECT status FROM kanban_card_leads WHERE client_id = $1 AND card_id = $2`, [s.clientId, cardId]),
    client.query(`SELECT * FROM kanban_lead_submissions WHERE client_id = $1 AND card_id = $2 ORDER BY submitted_at`, [s.clientId, cardId]),
    client.query<{ payload: Record<string, unknown> }>(
      `SELECT event_payload AS payload FROM kanban_card_activities
       WHERE client_id = $1 AND card_id = $2 AND event_payload->>'kind' LIKE 'card.lead_%' ORDER BY created_at`,
      [s.clientId, cardId]
    )
  ]);
  return { leads: leads.rows, submissions: submissions.rows, events: events.rows.map((row) => row.payload) };
}

void test('envio: captacao desligada no quadro = 422 lead_intake_disabled; nada muda', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { store } = await seedCompleteLead(client, s);
    await setLeadIntake(client, s, false);
    const { leadsService } = build(db, s, store);
    await assert.rejects(leadsService.submit(ctx(s, 'memberA'), s.boardId, s.cardA, mut(s, 'memberA')), (error) => {
      assert.equal(code(error), 'lead_intake_disabled');
      return true;
    });
    const lead = await leadsService.getLead(ctx(s, 'memberA'), s.boardId, s.cardA);
    assert.equal(lead.leadIntakeEnabled, false);
    assert.equal(lead.canSubmit, false);
    assert.equal(lead.readiness, null);
    assert.deepEqual((await leadRows(client, s, s.cardA)).leads, []);
  }));

void test('envio incompleto: sem cliente, campo vazio, documento pendente/rejeitado = 422 lead_incomplete com a lista; nada muda', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    await setLeadIntake(client, s, true);
    const typeA = await createRequiredDocumentType(client, s, 'RG');
    const typeB = await createRequiredDocumentType(client, s, 'Procuracao');
    await seedDocument(client, s, s.cardA, typeB, 'rejeitado');
    const customerId = randomUUID();
    const store: LeadCustomerStore = {
      core: new Map([[customerId, { ...completeCustomer(customerId), addressStreet: '  ' }]]),
      juridico: new Map()
    };
    const { leadsService } = build(db, s, store);

    // Sem cliente vinculado.
    let error: unknown;
    await leadsService.submit(ctx(s, 'memberA'), s.boardId, s.cardA, mut(s, 'memberA')).catch((caught: unknown) => (error = caught));
    assert.equal(code(error), 'lead_incomplete');
    assert.equal(body(error).customerLinked, false);
    assert.deepEqual(body(error).missingFields, []);
    // Ordem do checklist do quadro (sort_order, nome).
    assert.deepEqual(body(error).pendingDocumentTypes, [
      { id: typeB, name: 'Procuracao', state: 'rejeitado' },
      { id: typeA, name: 'RG', state: 'pendente' }
    ]);

    // Com cliente, mas sem data de nascimento e com logradouro em branco.
    await linkCustomer(client, s, s.cardA, customerId);
    error = undefined;
    await leadsService.submit(ctx(s, 'memberA'), s.boardId, s.cardA, mut(s, 'memberA')).catch((caught: unknown) => (error = caught));
    assert.equal(body(error).customerLinked, true);
    assert.deepEqual(body(error).missingFields, ['addressStreet', 'juridico.dataNascimento']);
    assert.equal(JSON.stringify(body(error)).includes(LEAD_CPF), false, 'erro sem dado pessoal');

    const rows = await leadRows(client, s, s.cardA);
    assert.deepEqual(rows, { leads: [], submissions: [], events: [] });
    const readiness = (await leadsService.getLead(ctx(s, 'memberA'), s.boardId, s.cardA)).readiness;
    assert.equal(readiness?.complete, false);
    assert.deepEqual(readiness?.missingFields, ['addressStreet', 'juridico.dataNascimento']);
  }));

void test('envio completo (documento so ENVIADO, P13): estado enviado, ciclo com autor/data/snapshot, evento so com ids, admin notificado', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { store, customerId, documentId, documentTypeId } = await seedCompleteLead(client, s);
    const { leadsService, published, audits } = build(db, s, store);

    const before = await leadsService.getLead(ctx(s, 'memberA'), s.boardId, s.cardA);
    assert.equal(before.status, 'rascunho');
    assert.equal(before.canSubmit, true);
    assert.equal(before.readiness?.complete, true);

    const lead = await leadsService.submit(ctx(s, 'memberA'), s.boardId, s.cardA, mut(s, 'memberA'));
    assert.equal(lead.status, 'enviado');
    assert.equal(lead.editable, false);
    assert.equal(lead.canSubmit, false);
    assert.equal(lead.canReturn, false, 'operador nao devolve');
    assert.equal(lead.currentSubmission?.submittedByIdentityId, s.users.memberA);
    assert.ok(lead.currentSubmission?.submittedAt);
    assert.deepEqual(lead.customerSnapshot, { outdated: false, changedFields: [], customerChanged: false });

    const rows = await leadRows(client, s, s.cardA);
    assert.deepEqual(rows.leads, [{ status: 'enviado' }]);
    assert.equal(rows.submissions.length, 1);
    const submission = rows.submissions[0];
    assert.equal(submission.office_id, s.officeA);
    assert.equal(submission.customer_id, customerId);
    assert.equal(submission.customer_snapshot.documentNumber, LEAD_CPF);
    assert.match(submission.customer_snapshot_sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(submission.documents_snapshot, [{ documentTypeId, documentId, status: 'enviado' }]);
    assert.deepEqual(rows.events, [{ kind: 'card.lead_submitted', submissionId: submission.id }]);

    assert.deepEqual(audits.map((entry) => entry.type), ['kanban_lead_submitted']);
    assert.equal(JSON.stringify(audits).includes(LEAD_CPF), false);
    assert.deepEqual(
      published.map((entry) => [entry.recipientIdentityId, entry.kind]),
      [[s.users.admin, 'kanban.card.lead_submitted']]
    );
    assert.deepEqual(published[0].payload, { boardId: s.boardId, cardId: s.cardA, submissionId: submission.id });

    // Reenvio com o lead ja enviado: 409.
    await assert.rejects(leadsService.submit(ctx(s, 'memberA'), s.boardId, s.cardA, mut(s, 'memberA')), (error) => {
      assert.equal(code(error), 'lead_not_submittable');
      return true;
    });
  }));

void test('congelamento (P21/PE10): card, cliente pelo card e envio de documento = 409 lead_frozen (inclusive admin); revisao, mover e comentar seguem', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { store, documentId, documentTypeId } = await seedCompleteLead(client, s);
    const { leadsService, cardsService, documentsService, customersService } = build(db, s, store);
    await leadsService.submit(ctx(s, 'memberA'), s.boardId, s.cardA, mut(s, 'memberA'));

    const frozen = (error: unknown) => code(error) === 'lead_frozen' && body(error).leadStatus === 'enviado';
    for (const user of ['memberA', 'admin'] as const) {
      await assert.rejects(cardsService.update(ctx(s, user), s.boardId, s.cardA, { title: 'novo' }, mut(s, user)), frozen);
      await assert.rejects(cardsService.update(ctx(s, user), s.boardId, s.cardA, { status: 'archived' }, mut(s, user)), frozen);
      await assert.rejects(cardsService.deletePermanently(ctx(s, user), s.boardId, s.cardA, mut(s, user)), frozen);
      await assert.rejects(customersService.link(ctx(s, user), s.boardId, s.cardA, { cpf: LEAD_CPF }, mut(s, user)), frozen);
      await assert.rejects(
        customersService.update(ctx(s, user), s.boardId, s.cardA, { customer: { phone: '41999990000' } }, mut(s, user)),
        frozen
      );
      await assert.rejects(documentsService.upload(ctx(s, user), s.boardId, s.cardA, documentTypeId, undefined, mut(s, user)), frozen);
    }
    assert.equal((await customersService.getPanel(ctx(s, 'memberA'), s.boardId, s.cardA)).canEdit, false);
    assert.equal((await documentsService.getChecklist(ctx(s, 'memberA'), s.boardId, s.cardA)).canUpload, false);

    // Nao congela: revisao (PE10) e mover entre colunas (estado independe da coluna).
    const reviewed = await documentsService.review(ctx(s, 'admin'), s.boardId, s.cardA, documentId, { status: 'aceito' } as never, mut(s, 'admin'));
    assert.equal(reviewed.status, 'aceito');
    await cardsService.move(ctx(s, 'memberA'), s.boardId, s.cardA, { toBoardColumnId: s.columnId, toPosition: 0 }, mut(s, 'memberA'));
    assert.equal((await leadsService.getLead(ctx(s, 'memberA'), s.boardId, s.cardA)).status, 'enviado');
  }));

void test('devolucao: so flow:admin, com motivo; volta a editavel, notifica quem ve o card no escritorio; reenvio abre ciclo novo', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { store } = await seedCompleteLead(client, s);
    const { leadsService, cardsService, published } = build(db, s, store);

    await assert.rejects(
      leadsService.returnToOffice(ctx(s, 'admin'), s.boardId, s.cardA, { reason: 'falta procuracao assinada' }, mut(s, 'admin')),
      (error) => code(error) === 'lead_not_returnable',
      'rascunho nao e devolvido'
    );
    await leadsService.submit(ctx(s, 'memberA'), s.boardId, s.cardA, mut(s, 'memberA'));
    published.length = 0;

    for (const user of ['memberA', 'boardAdminA', 'memberAB'] as const) {
      await assert.rejects(
        leadsService.returnToOffice(ctx(s, user), s.boardId, s.cardA, { reason: 'falta procuracao assinada' }, mut(s, user)),
        (error) => error instanceof ForbiddenException && code(error) === 'lead_admin_required'
      );
    }
    const returned = await leadsService.returnToOffice(
      ctx(s, 'admin'),
      s.boardId,
      s.cardA,
      { reason: 'falta procuracao assinada' },
      mut(s, 'admin')
    );
    assert.equal(returned.status, 'devolvido');
    assert.equal(returned.editable, true);
    assert.equal(returned.currentSubmission?.returnReason, 'falta procuracao assinada');
    assert.equal(returned.currentSubmission?.returnedByIdentityId, s.users.admin);

    // Criador (owner, sem escritorio) nao ve o card: nao recebe. Quem enviou e o responsavel do escritorio A recebem.
    assert.deepEqual(
      published.map((entry) => entry.recipientIdentityId).sort(),
      [s.users.memberA, s.users.memberAB].sort()
    );
    assert.ok(published.every((entry) => entry.kind === 'kanban.card.lead_returned'));
    assert.equal(published[0].payload.reason, 'falta procuracao assinada');

    // Operador ve o estado e o motivo; edicao destravada.
    const seen = await leadsService.getLead(ctx(s, 'memberA'), s.boardId, s.cardA);
    assert.equal(seen.status, 'devolvido');
    assert.equal(seen.currentSubmission?.returnReason, 'falta procuracao assinada');
    assert.equal(seen.canSubmit, true);
    await cardsService.update(ctx(s, 'memberA'), s.boardId, s.cardA, { title: 'Lead corrigido' }, mut(s, 'memberA'));

    const resent = await leadsService.submit(ctx(s, 'memberA'), s.boardId, s.cardA, mut(s, 'memberA'));
    assert.equal(resent.status, 'enviado');
    assert.equal(resent.history.length, 2);
    assert.equal(resent.history[1].returnReason, 'falta procuracao assinada');
    assert.equal(resent.currentSubmission?.returnReason, null);
    const rows = await leadRows(client, s, s.cardA);
    assert.deepEqual(
      rows.events.map((event) => event.kind),
      ['card.lead_submitted', 'card.lead_returned', 'card.lead_submitted']
    );
    assert.equal(rows.events[1].reason, 'falta procuracao assinada');
  }));

void test('snapshot: cliente alterado por outro caminho depois do envio = desatualizado, so com o nome do campo', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { store, customerId } = await seedCompleteLead(client, s);
    const { leadsService } = build(db, s, store);
    await leadsService.submit(ctx(s, 'memberA'), s.boardId, s.cardA, mut(s, 'memberA'));
    store.core.set(customerId, { ...completeCustomer(customerId), addressStreet: 'Rua Nova' });
    const lead = await leadsService.getLead(ctx(s, 'admin'), s.boardId, s.cardA);
    assert.deepEqual(lead.customerSnapshot, { outdated: true, changedFields: ['addressStreet'], customerChanged: false });
  }));

void test('fila do gestor: somente flow:admin; filtros por escritorio, quadro, estado e data; paginada; so do tenant', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { store, documentTypeId } = await seedCompleteLead(client, s);
    const customerB = randomUUID();
    store.core.set(customerB, completeCustomer(customerB));
    store.juridico.set(customerB, { dataNascimento: '1990-03-04' });
    await linkCustomer(client, s, s.cardB, customerB);
    await seedDocument(client, s, s.cardB, documentTypeId, 'aceito');
    const { leadsService } = build(db, s, store);
    await leadsService.submit(ctx(s, 'memberA'), s.boardId, s.cardA, mut(s, 'memberA'));
    await leadsService.submit(ctx(s, 'memberB'), s.boardId, s.cardB, mut(s, 'memberB'));
    await leadsService.returnToOffice(ctx(s, 'admin'), s.boardId, s.cardB, { reason: 'cpf divergente no rg' }, mut(s, 'admin'));

    const query = (extra: Partial<ListLeadQueueQueryDto> = {}) => ({ limit: 20, offset: 0, ...extra }) as ListLeadQueueQueryDto;
    const all = await leadsService.listQueue(ctx(s, 'admin'), query());
    assert.equal(all.meta.total, 2);
    assert.deepEqual(all.data.map((row) => row.cardId).sort(), [s.cardA, s.cardB].sort());
    const rowB = all.data.find((row) => row.cardId === s.cardB);
    assert.equal(rowB?.officeName, 'Escritorio B');
    assert.equal(rowB?.status, 'devolvido');
    assert.equal(rowB?.returnReason, 'cpf divergente no rg');

    assert.deepEqual((await leadsService.listQueue(ctx(s, 'admin'), query({ officeId: s.officeA }))).data.map((r) => r.cardId), [s.cardA]);
    assert.deepEqual((await leadsService.listQueue(ctx(s, 'admin'), query({ status: 'enviado' }))).data.map((r) => r.cardId), [s.cardA]);
    assert.equal((await leadsService.listQueue(ctx(s, 'admin'), query({ boardId: randomUUID() }))).meta.total, 0);
    const today = new Date().toISOString().slice(0, 10);
    assert.equal((await leadsService.listQueue(ctx(s, 'admin'), query({ submittedFrom: today, submittedTo: today }))).meta.total, 2);
    assert.equal((await leadsService.listQueue(ctx(s, 'admin'), query({ submittedTo: '2000-01-01' }))).meta.total, 0);
    const page = await leadsService.listQueue(ctx(s, 'admin'), query({ limit: 1 }));
    assert.equal(page.data.length, 1);
    assert.equal(page.meta.total, 2);

    for (const user of ['memberA', 'memberAB', 'boardAdminA', 'noOffice'] as const) {
      await assert.rejects(leadsService.listQueue(ctx(s, user), query()), ForbiddenException, `fila / ${user}`);
    }
    // Admin de outro tenant: lista vazia (filtro por client_id).
    const otherAdmin = { ...ctx(s, 'admin'), clientId: s.otherClientId };
    assert.equal((await leadsService.listQueue(otherAdmin, query())).meta.total, 0);
  }));

void test('fila com a chave de escritorio DESLIGADA: flow:admin ve os leads de todo quadro, membro ou nao (regra de 2026-11-11)', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: false });
    const { store } = await seedCompleteLead(client, s);
    const { leadsService } = build(db, s, store);
    await leadsService.submit(ctx(s, 'memberA'), s.boardId, s.cardA, mut(s, 'memberA'));
    const query = { limit: 20, offset: 0 } as ListLeadQueueQueryDto;
    assert.equal((await leadsService.listQueue(ctx(s, 'admin'), query)).meta.total, 1, 'admin nao membro');
    await client.query(
      `INSERT INTO kanban_board_members (client_id, board_id, identity_id, role, status) VALUES ($1, $2, $3, 'board_admin', 'active')`,
      [s.clientId, s.boardId, s.users.admin]
    );
    assert.equal((await leadsService.listQueue(ctx(s, 'admin'), query)).meta.total, 1, 'admin membro');
  }));

void test('tile: estado do lead na lista de cards, so para cards visiveis; sem envio = null', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { store } = await seedCompleteLead(client, s);
    const { leadsService, cardsService } = build(db, s, store);
    await leadsService.submit(ctx(s, 'memberA'), s.boardId, s.cardA, mut(s, 'memberA'));
    const admin = await cardsService.list(ctx(s, 'admin'), s.boardId, { limit: 50, offset: 0 } as never);
    const byId = new Map(admin.data.map((card) => [card.id, card.leadStatus]));
    assert.equal(byId.get(s.cardA), 'enviado');
    assert.equal(byId.get(s.cardB), null);
    const memberB = await cardsService.list(ctx(s, 'memberB'), s.boardId, { limit: 50, offset: 0 } as never);
    assert.deepEqual(memberB.data.map((card) => card.id), [s.cardB]);
  }));

void test('campos obrigatorios por tenant (P16): somente admin; chave fora da whitelist = 422; default antes de configurar', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { store, customerId } = await seedCompleteLead(client, s);
    const { settingsService, leadsService, audits } = build(db, s, store);

    const initial = await settingsService.get(ctx(s, 'admin'));
    assert.equal(initial.configured, false);
    assert.deepEqual(initial.requiredFields, initial.defaultRequiredFields);
    for (const user of ['memberA', 'boardAdminA'] as const) {
      await assert.rejects(settingsService.get(ctx(s, user)), ForbiddenException);
      await assert.rejects(settingsService.update(ctx(s, user), { requiredFields: [] }, mut(s, user)), ForbiddenException);
    }
    await assert.rejects(settingsService.update(ctx(s, 'admin'), { requiredFields: ['name', 'documentNumber', 'x'] }, mut(s, 'admin')), (error) => {
      assert.equal(code(error), 'invalid_lead_fields');
      assert.deepEqual(body(error).invalidFields, ['documentNumber', 'x']);
      return true;
    });

    const updated = await settingsService.update(ctx(s, 'admin'), { requiredFields: ['juridico.nomeMae', 'name'] }, mut(s, 'admin'));
    assert.equal(updated.configured, true);
    assert.deepEqual(updated.requiredFields, ['name', 'juridico.nomeMae']);
    assert.deepEqual(audits.at(-1), { type: 'kanban_lead_required_fields_updated', payload: { requiredFields: ['name', 'juridico.nomeMae'] } });
    const readiness = (await leadsService.getLead(ctx(s, 'memberA'), s.boardId, s.cardA)).readiness;
    assert.deepEqual(readiness?.missingFields, ['juridico.nomeMae']);

    // Lista vazia e valida: so cliente vinculado e documentos.
    const empty = await settingsService.update(ctx(s, 'admin'), { requiredFields: [] }, mut(s, 'admin'));
    assert.deepEqual(empty.requiredFields, []);
    assert.equal(empty.configured, true);
    store.core.set(customerId, { ...completeCustomer(customerId), name: '' });
    assert.equal((await leadsService.getLead(ctx(s, 'memberA'), s.boardId, s.cardA)).readiness?.complete, true);
  }));

void test('DTOs: motivo da devolucao 10..500 apos trim; filtros da fila validados; campos limitados', () => {
  const errors = (cls: new () => object, plain: Record<string, unknown>) =>
    validateSync(plainToInstance(cls, plain), { whitelist: true, forbidNonWhitelisted: true }).map((error) => error.property);
  assert.deepEqual(errors(ReturnLeadDto, { reason: '   curto   ' }), ['reason']);
  assert.deepEqual(errors(ReturnLeadDto, { reason: 'x'.repeat(501) }), ['reason']);
  assert.deepEqual(errors(ReturnLeadDto, { reason: '  motivo valido aqui  ' }), []);
  assert.equal(plainToInstance(ReturnLeadDto, { reason: '  motivo valido aqui  ' }).reason, 'motivo valido aqui');
  assert.deepEqual(errors(ListLeadQueueQueryDto, { status: 'arquivado' }), ['status']);
  assert.deepEqual(errors(ListLeadQueueQueryDto, { officeId: 'x' }), ['officeId']);
  assert.deepEqual(errors(ListLeadQueueQueryDto, { submittedFrom: '12/10/2026' }), ['submittedFrom']);
  assert.deepEqual(errors(ListLeadQueueQueryDto, { limit: '500' }), ['limit']);
  assert.deepEqual(errors(ListLeadQueueQueryDto, { status: 'enviado', limit: '10', submittedTo: '2026-10-12' }), []);
  assert.deepEqual(errors(UpdateLeadSettingsDto, { requiredFields: ['name', 'name'] }), ['requiredFields']);
  assert.deepEqual(errors(UpdateLeadSettingsDto, { requiredFields: Array.from({ length: 41 }, (_, i) => `f${i}`) }), ['requiredFields']);
});
