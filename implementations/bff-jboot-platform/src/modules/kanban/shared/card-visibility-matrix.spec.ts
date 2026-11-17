import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { OfficeScenario, ScenarioUser, scenarioContext, seedOfficeScenario } from '../../../test/kanban-office-fixture';
import { buildRealVisibility, fakeAdminDirectory } from '../../../test/kanban-visibility';
import { withTestDatabase } from '../../../test/with-test-database';
import { ActivitiesRepository } from '../activities/activities.repository';
import { ActivitiesService } from '../activities/activities.service';
import { AssigneesRepository } from '../assignees/assignees.repository';
import { AssigneesService } from '../assignees/assignees.service';
import { AttachmentsRepository } from '../attachments/attachments.repository';
import { AttachmentsService } from '../attachments/attachments.service';
import { CardsService } from '../cards/cards.service';
import { ColumnsRepository } from '../columns/columns.repository';
import { CardCustomersRepository } from '../customers/card-customers.repository';
import { CardCustomersService } from '../customers/card-customers.service';
import { CardDocumentsRepository } from '../documents/card-documents.repository';
import { CardDocumentsService } from '../documents/card-documents.service';
import { ChecklistGateService } from '../documents/checklist-gate.service';
import { DocumentTypesRepository } from '../documents/document-types.repository';
import { KanbanRequestContext } from '../kanban.types';
import { LeadAnalysisRepository } from '../lead-analysis/lead-analysis.repository';
import { LeadAnalysisService } from '../lead-analysis/lead-analysis.service';
import { LeadSettingsRepository } from '../leads/lead-settings.repository';
import { LeadsService } from '../leads/leads.service';
import { MetricsRepository } from '../metrics/metrics.repository';
import { MetricsService } from '../metrics/metrics.service';
import { OfficesService } from '../offices/offices.service';
import { TagsRepository } from '../tags/tags.repository';
import { TagsService } from '../tags/tags.service';

/**
 * Matriz da visibilidade por escritorio (CRM de leads, Sprint 3.5; ADR 014,
 * Decisao 6) em banco real (transacao + ROLLBACK), com todos os servicos que
 * leem ou alteram card montados sobre o ponto unico (`CardVisibilityService`).
 * Cada operacao roda para cada perfil de usuario, com a chave do tenant ligada
 * e desligada. Resultado: `ok` (passou pelo portao de visibilidade; erro de
 * negocio posterior conta como `ok`), `404` (card/quadro inexistente ou card
 * invisivel) ou `403` (membresia/papel/admin).
 */

type Outcome = 'ok' | '404' | '403';

async function outcome(run: () => Promise<unknown>): Promise<Outcome> {
  try {
    await run();
    return 'ok';
  } catch (error) {
    if (error instanceof ForbiddenException) {
      return '403';
    }
    if (error instanceof NotFoundException && ['Card not found', 'Board not found'].includes(error.message)) {
      return '404';
    }
    if (error instanceof HttpException) {
      return 'ok';
    }
    throw error;
  }
}

interface Extra {
  activityId: string;
  attachmentId: string;
  customerOfA: string;
}

async function seedCardContent(client: Client, s: OfficeScenario): Promise<Extra> {
  const extra = { activityId: randomUUID(), attachmentId: randomUUID(), customerOfA: randomUUID() };
  await client.query(
    `INSERT INTO kanban_card_activities (id, client_id, card_id, type, author_identity_id, text_content)
     VALUES ($1, $2, $3, 'comment', $4, 'oi')`,
    [extra.activityId, s.clientId, s.cardA, s.users.memberA]
  );
  await client.query(
    `INSERT INTO kanban_card_attachments
       (id, client_id, activity_id, file_name, content_type, size_bytes, storage_bucket, storage_key, uploaded_by_identity_id)
     VALUES ($1, $2, $3, 'doc.pdf', 'application/pdf', 10, 'b', $4, $5)`,
    [extra.attachmentId, s.clientId, extra.activityId, `${s.clientId}/${s.cardA}/${extra.activityId}/${extra.attachmentId}-doc.pdf`, s.users.memberA]
  );
  await client.query(
    `INSERT INTO kanban_card_customers (card_id, client_id, customer_id, created_by_identity_id) VALUES ($1, $2, $3, $4)`,
    [s.cardA, s.clientId, extra.customerOfA, s.users.memberA]
  );
  return extra;
}

function build(db: DatabaseService, s: OfficeScenario, customerIdsByCpf: Map<string, string[]>) {
  const dbWithIdentity = { ...db, queryIdentity: async () => ({ rows: [] }) } as unknown as DatabaseService;
  const directory = fakeAdminDirectory([s.users.admin]);
  const { access, visibility, officePolicy, members, offices, cards, leads, leadLock } = buildRealVisibility(dbWithIdentity, directory);
  const activities = new ActivitiesRepository(db);
  const assignees = new AssigneesRepository(db);
  const tags = new TagsRepository(db);
  const columns = new ColumnsRepository(db);
  const cardDocuments = new CardDocumentsRepository(db);
  const audit = { record: async () => undefined };
  const notifications = { notify: async () => undefined };
  const storage = { getSignedDownloadUrl: async () => ({ url: 'signed', expiresAt: 'x' }), buildStorageKey: () => 'k' };

  const cardsService = new CardsService(
    cards,
    columns,
    activities,
    tags,
    {} as never,
    access,
    audit as never,
    assignees,
    { recordForActivity: async () => undefined } as never,
    notifications as never,
    new ChecklistGateService(cardDocuments),
    cardDocuments,
    visibility,
    officePolicy,
    leads,
    leadLock,
    { assertCanEnterColumn: async () => undefined, cardIdsWithoutHisconForBoard: async () => new Set<string>(), cardIdsWithSignedKitPendingForBoard: async () => new Set<string>() } as never
  );
  const activitiesService = new ActivitiesService(activities, visibility, access, assignees, notifications as never);
  const attachmentsService = new AttachmentsService(new AttachmentsRepository(db), activities, visibility, storage as never, access);
  const documentsService = new CardDocumentsService(
    cardDocuments,
    new DocumentTypesRepository(db),
    visibility,
    assignees,
    storage as never,
    access,
    audit as never,
    notifications as never,
    columns,
    leadLock
  );
  const tagsService = new TagsService(tags, visibility, activities, access, audit as never);
  const assigneesService = new AssigneesService(assignees, visibility, members, activities, access, notifications as never);
  const customersService = new CardCustomersService(
    new CardCustomersRepository(db),
    visibility,
    activities,
    access,
    audit as never,
    {
      findIdsByCpf: async (_client: string, cpf: string) => customerIdsByCpf.get(cpf) ?? [],
      findById: async (_client: string, id: string) => ({ id, name: 'Cliente', documentNumber: '00000000000', status: 'active' })
    } as never,
    { get: async () => null, save: async () => undefined } as never,
    leadLock
  );
  const officesService = new OfficesService(offices, access, visibility, directory, audit as never, {} as never, {} as never);
  // Sprint 4: estado/envio/devolucao do lead pelo mesmo ponto unico.
  const leadsService = new LeadsService(
    leads,
    new LeadSettingsRepository(db),
    visibility,
    access,
    new CardCustomersRepository(db),
    { findById: async (_client: string, id: string) => ({ id, name: 'Cliente', documentNumber: '00000000000', status: 'active' }) } as never,
    { get: async () => null } as never,
    new DocumentTypesRepository(db),
    cardDocuments,
    assignees,
    members,
    notifications as never,
    directory,
    audit as never
  );
  const metricsService = new MetricsService(new MetricsRepository(db), members, columns, access, visibility);
  // Sprint 6: analise do lead (so flow:admin) e documentos entregues ao escritorio, pelo mesmo ponto unico.
  const analysisService = new LeadAnalysisService(
    new LeadAnalysisRepository(db),
    leads,
    visibility,
    access,
    { resolveForGeneration: async () => ({}) } as never,
    { list: async () => [], listVariables: async () => [] } as never,
    { list: async () => [] } as never,
    offices,
    storage as never,
    {} as never,
    { enqueue: async () => undefined } as never,
    notifications as never,
    assignees,
    members,
    audit as never
  );
  return {
    analysisService,
    cardsService,
    activitiesService,
    attachmentsService,
    documentsService,
    tagsService,
    assigneesService,
    customersService,
    officesService,
    metricsService,
    leadsService
  };
}

type Services = ReturnType<typeof build>;
type Operation = (c: KanbanRequestContext, s: OfficeScenario, e: Extra, svc: Services) => Promise<unknown>;

const mutate = (c: KanbanRequestContext) => ({ ...c, ip: '127.0.0.1', userAgent: 'test' });

/** Toda leitura e mutacao de card com `:cardId` (alvo: card do escritorio A). */
const CARD_OPERATIONS: Record<string, Operation> = {
  'GET activities': (c, s, _e, v) => v.activitiesService.list(c, s.boardId, s.cardA, { limit: 20, offset: 0 } as never),
  'GET attachments': (c, s, e, v) => v.attachmentsService.list(c, s.boardId, s.cardA, e.activityId),
  'GET attachment download': (c, s, e, v) => v.attachmentsService.getDownloadUrl(c, s.boardId, s.cardA, e.activityId, e.attachmentId),
  'GET documents (checklist)': (c, s, _e, v) => v.documentsService.getChecklist(c, s.boardId, s.cardA),
  'GET card tags': (c, s, _e, v) => v.tagsService.listForCard(c, s.boardId, s.cardA),
  'GET assignees': (c, s, _e, v) => v.assigneesService.list(c, s.boardId, s.cardA),
  'GET assignee candidates': (c, s, _e, v) => v.assigneesService.candidates(c, s.boardId, s.cardA),
  'GET customer panel': (c, s, _e, v) => v.customersService.getPanel(c, s.boardId, s.cardA),
  'PATCH card': (c, s, _e, v) => v.cardsService.update(c, s.boardId, s.cardA, { title: 'Lead A editado' }, mutate(c)),
  'PATCH card status': (c, s, _e, v) => v.cardsService.setStatus(c, s.boardId, s.cardA, null, mutate(c)),
  'POST move': (c, s, _e, v) =>
    v.cardsService.move(c, s.boardId, s.cardA, { toBoardColumnId: s.columnId, toPosition: 0 }, mutate(c)),
  'DELETE card': (c, s, _e, v) => v.cardsService.deletePermanently(c, s.boardId, s.cardA, mutate(c)),
  'POST comment': (c, s, _e, v) => v.activitiesService.createComment(c, s.boardId, s.cardA, { textContent: 'oi' }),
  'POST attachment': (c, s, e, v) => v.attachmentsService.upload(c, s.boardId, s.cardA, e.activityId, undefined),
  'POST document': (c, s, _e, v) => v.documentsService.upload(c, s.boardId, s.cardA, randomUUID(), undefined, mutate(c)),
  'POST document review': (c, s, _e, v) =>
    v.documentsService.review(c, s.boardId, s.cardA, randomUUID(), { status: 'aceito' } as never, mutate(c)),
  'POST assignee': (c, s, _e, v) => v.assigneesService.create(c, s.boardId, s.cardA, { identityId: s.users.memberAB }, mutate(c)),
  'DELETE assignee': (c, s, _e, v) => v.assigneesService.remove(c, s.boardId, s.cardA, randomUUID(), mutate(c)),
  'POST card tag': (c, s, _e, v) => v.tagsService.attach(c, s.boardId, s.cardA, randomUUID(), mutate(c)),
  'DELETE card tag': (c, s, _e, v) => v.tagsService.detach(c, s.boardId, s.cardA, randomUUID(), mutate(c)),
  'POST customer lookup': (c, s, _e, v) => v.customersService.lookup(c, s.boardId, s.cardA, '11144477735'),
  'PUT customer link': (c, s, _e, v) => v.customersService.link(c, s.boardId, s.cardA, { cpf: '11144477735' }, mutate(c)),
  'PATCH customer': (c, s, _e, v) => v.customersService.update(c, s.boardId, s.cardA, {}, mutate(c)),
  // Sprint 4 (CRM de leads): estado do lead e envio para analise.
  'GET lead': (c, s, _e, v) => v.leadsService.getLead(c, s.boardId, s.cardA),
  'POST lead submit': (c, s, _e, v) => v.leadsService.submit(c, s.boardId, s.cardA, mutate(c)),
  // Sprint 6 (P11): documentos entregues (aprovados) do lead, para quem ve o card.
  'GET lead documents': (c, s, _e, v) => v.analysisService.listDelivered(c, s.boardId, s.cardA),
  'GET lead document download': (c, s, _e, v) => v.analysisService.downloadDelivered(c, s.boardId, s.cardA, randomUUID(), 'docx')
};

/** Sprint 6: gestao da analise do lead, exclusiva de `flow:admin` (alvo: card do escritorio A). */
const ANALYSIS_ADMIN_OPERATIONS: Record<string, Operation> = {
  'GET analysis': (c, s, _e, v) => v.analysisService.getAnalysis(c, s.boardId, s.cardA),
  'POST analysis case': (c, s, _e, v) => v.analysisService.addCase(c, s.boardId, s.cardA, { caseTypeId: randomUUID() }, mutate(c)),
  'PATCH analysis case': (c, s, _e, v) =>
    v.analysisService.changeCase(c, s.boardId, s.cardA, randomUUID(), { caseTypeId: randomUUID(), reason: 'troca de teste' }, mutate(c)),
  'POST analysis case remove': (c, s, _e, v) =>
    v.analysisService.removeCase(c, s.boardId, s.cardA, randomUUID(), { reason: 'remocao de teste' }, mutate(c)),
  'POST analysis generate': (c, s, _e, v) => v.analysisService.generate(c, s.boardId, s.cardA, randomUUID(), {}, mutate(c)),
  'POST analysis approve': (c, s, _e, v) => v.analysisService.approve(c, s.boardId, s.cardA, randomUUID(), mutate(c)),
  'POST analysis edited version': (c, s, _e, v) =>
    v.analysisService.uploadEditedVersion(c, s.boardId, s.cardA, randomUUID(), undefined, mutate(c)),
  'POST analysis pdf retry': (c, s, _e, v) => v.analysisService.retryPdf(c, s.boardId, s.cardA, randomUUID(), mutate(c)),
  'GET analysis document download': (c, s, _e, v) => v.analysisService.downloadForManager(c, s.boardId, s.cardA, randomUUID(), 'docx')
};

const USERS: Array<ScenarioUser | 'otherTenant'> = [
  'admin',
  'memberA',
  'memberB',
  'memberAB',
  'noOffice',
  'inactiveA',
  'outsiderA',
  'onlyInactiveOffice',
  'boardAdminA',
  'otherTenant'
];

const EXPECTED_ON: Record<string, Outcome> = {
  admin: 'ok',
  memberA: 'ok',
  memberB: '404',
  memberAB: 'ok',
  noOffice: '404',
  inactiveA: '403',
  outsiderA: '403',
  onlyInactiveOffice: '404',
  boardAdminA: 'ok',
  otherTenant: '404'
};

// Chave desligada = regra anterior: so membresia; `flow:admin` nao membro nao le.
const EXPECTED_OFF: Record<string, Outcome> = {
  // flow:admin e board_admin em todo board, com a chave desligada tambem (regra de 2026-11-11).
  admin: 'ok',
  memberA: 'ok',
  memberB: 'ok',
  memberAB: 'ok',
  noOffice: 'ok',
  inactiveA: '403',
  outsiderA: '403',
  onlyInactiveOffice: 'ok',
  boardAdminA: 'ok',
  otherTenant: '404'
};

for (const enabled of [true, false]) {
  void test(`matriz por card (chave ${enabled ? 'LIGADA' : 'DESLIGADA'}): cada leitura e mutacao x cada perfil`, () =>
    withTestDatabase(async (db, client) => {
      const s = await seedOfficeScenario(client, { enabled });
      const extra = await seedCardContent(client, s);
      const services = build(db, s, new Map());
      const expected = enabled ? EXPECTED_ON : EXPECTED_OFF;
      assert.equal(Object.keys(CARD_OPERATIONS).length, 27);
      for (const [label, run] of Object.entries(CARD_OPERATIONS)) {
        for (const user of USERS) {
          const got = await outcome(() => run(scenarioContext(s, user), s, extra, services));
          assert.equal(got, expected[user], `${label} / ${user}`);
        }
      }
    }));
}

void test('transferencia de escritorio: so flow:admin; flow:admin, com a chave ligada ou desligada', () =>
  withTestDatabase(async (db, client) => {
    for (const enabled of [true, false]) {
      const s = await seedOfficeScenario(client, { enabled });
      const services = build(db, s, new Map());
      for (const user of USERS) {
        const got = await outcome(() =>
          services.officesService.transferCard(
            scenarioContext(s, user),
            s.boardId,
            s.cardNull,
            { officeId: s.officeB, reason: 'redistribuicao da carteira' },
            mutate(scenarioContext(s, user))
          )
        );
        const expected = user === 'admin' ? 'ok' : '403';
        assert.equal(got, expected, `transfer / ${user} / chave ${enabled}`);
      }
    }
  }));

void test('devolucao do lead (Sprint 4): so flow:admin; flow:admin, com a chave ligada ou desligada', () =>
  withTestDatabase(async (db, client) => {
    for (const enabled of [true, false]) {
      const s = await seedOfficeScenario(client, { enabled });
      const services = build(db, s, new Map());
      for (const user of USERS) {
        const got = await outcome(() =>
          services.leadsService.returnToOffice(
            scenarioContext(s, user),
            s.boardId,
            s.cardA,
            { reason: 'falta procuracao assinada' },
            mutate(scenarioContext(s, user))
          )
        );
        const expected = user === 'admin' ? 'ok' : '403';
        assert.equal(got, expected, `return / ${user} / chave ${enabled}`);
      }
    }
  }));

void test('analise do lead (Sprint 6): so flow:admin; flow:admin, com a chave ligada ou desligada', () =>
  withTestDatabase(async (db, client) => {
    for (const enabled of [true, false]) {
      const s = await seedOfficeScenario(client, { enabled });
      const extra = await seedCardContent(client, s);
      const services = build(db, s, new Map());
      assert.equal(Object.keys(ANALYSIS_ADMIN_OPERATIONS).length, 9);
      for (const [label, run] of Object.entries(ANALYSIS_ADMIN_OPERATIONS)) {
        for (const user of USERS) {
          const got = await outcome(() => run(scenarioContext(s, user), s, extra, services));
          const expected = user === 'admin' ? 'ok' : '403';
          assert.equal(got, expected, `${label} / ${user} / chave ${enabled}`);
        }
      }
    }
  }));

void test('lista de cards e metricas: so cards visiveis (contagem incluida)', () =>
  withTestDatabase(async (db, client) => {
    const expectations: Record<string, { on: string[]; off: string[] | '403' }> = {
      admin: { on: ['cardA', 'cardB', 'cardNull'], off: ['cardA', 'cardB', 'cardNull'] },
      memberA: { on: ['cardA'], off: ['cardA', 'cardB', 'cardNull'] },
      memberB: { on: ['cardB'], off: ['cardA', 'cardB', 'cardNull'] },
      memberAB: { on: ['cardA', 'cardB'], off: ['cardA', 'cardB', 'cardNull'] },
      noOffice: { on: [], off: ['cardA', 'cardB', 'cardNull'] },
      onlyInactiveOffice: { on: [], off: ['cardA', 'cardB', 'cardNull'] },
      boardAdminA: { on: ['cardA'], off: ['cardA', 'cardB', 'cardNull'] }
    };
    for (const enabled of [true, false]) {
      const s = await seedOfficeScenario(client, { enabled });
      const { cardsService, metricsService } = build(db, s, new Map());
      const names = new Map([
        [s.cardA, 'cardA'],
        [s.cardB, 'cardB'],
        [s.cardNull, 'cardNull']
      ]);
      for (const [user, expected] of Object.entries(expectations)) {
        const context = scenarioContext(s, user as ScenarioUser);
        const want = enabled ? expected.on : expected.off;
        if (want === '403') {
          await assert.rejects(cardsService.list(context, s.boardId, { limit: 50, offset: 0 } as never), ForbiddenException);
          continue;
        }
        const page = await cardsService.list(context, s.boardId, { limit: 50, offset: 0 } as never);
        assert.deepEqual(page.data.map((card) => names.get(card.id)).sort(), want, `lista / ${user} / ${enabled}`);
        assert.equal(page.meta.total, want.length, `total / ${user} / ${enabled}`);
        const metrics = await metricsService.getMetrics(context, { boardId: s.boardId } as never);
        assert.equal(metrics.totalCards, want.length, `metricas / ${user} / ${enabled}`);
        assert.equal(
          metrics.byColumn?.reduce((sum, column) => sum + column.count, 0),
          want.length,
          `metricas por coluna / ${user} / ${enabled}`
        );
      }
    }
  }));

void test('busca por CPF: proprio escritorio, outro escritorio no mesmo quadro, sem card e inexistente (operador e admin)', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const extra = await seedCardContent(client, s);
    const customerWithoutCard = randomUUID();
    const byCpf = new Map([
      ['11144477735', [extra.customerOfA]],
      ['52998224725', [customerWithoutCard]]
    ]);
    const { customersService } = build(db, s, byCpf);
    const lookup = (user: ScenarioUser, cardId: string, cpf: string) =>
      customersService.lookup(scenarioContext(s, user), s.boardId, cardId, cpf);

    assert.equal((await lookup('memberA', s.cardA, '11144477735')).status, 'found', 'proprio escritorio');
    assert.deepEqual(await lookup('memberB', s.cardB, '11144477735'), { status: 'outside_boards' }, 'outro escritorio, mesmo quadro');
    assert.deepEqual(await lookup('memberB', s.cardB, '52998224725'), { status: 'outside_boards' }, 'cliente sem card');
    assert.deepEqual(await lookup('memberB', s.cardB, '39053344705'), { status: 'not_found' }, 'inexistente');

    const adminFromB = await lookup('admin', s.cardB, '11144477735');
    assert.equal(adminFromB.status, 'found', 'admin ve o cliente do escritorio A');
    assert.equal((adminFromB as { crossOffice?: boolean }).crossOffice, true, 'admin: vinculo em B seria entre escritorios');
    assert.equal((adminFromB as { canOverride?: boolean }).canOverride, true);
    assert.deepEqual(await lookup('admin', s.cardB, '52998224725'), { status: 'outside_boards', canOverride: true }, 'admin: sem card');
    assert.deepEqual(await lookup('admin', s.cardB, '39053344705'), { status: 'not_found' });

    // Usuario com A e B ve o cliente, mas levar o cliente de A para um card de B exige o admin.
    const abFromB = await lookup('memberAB', s.cardB, '11144477735');
    assert.equal((abFromB as { crossOffice?: boolean }).crossOffice, true);
    assert.equal((abFromB as { canOverride?: boolean }).canOverride, undefined);
  }));

void test('vinculo de cliente entre escritorios (P30): operador 409, admin sem motivo 409, admin com motivo vincula com crossOffice', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const extra = await seedCardContent(client, s);
    const { customersService } = build(db, s, new Map([['11144477735', [extra.customerOfA]]]));
    const link = (user: ScenarioUser, dto: Record<string, unknown>) =>
      customersService.link(scenarioContext(s, user), s.boardId, s.cardB, { cpf: '11144477735', ...dto } as never, mutate(scenarioContext(s, user)));
    const code = (error: unknown) => (error as HttpException).getResponse() as { code: string };

    await assert.rejects(link('memberAB', {}), (error) => code(error).code === 'cross_office_link_requires_admin');
    await assert.rejects(link('memberAB', { override: { reason: 'motivo valido aqui' } }), (error) => code(error).code === 'override_not_allowed');
    await assert.rejects(link('admin', {}), (error) => code(error).code === 'cross_office_override_required');
    const linked = await link('admin', { override: { reason: 'cliente atendido pelos dois escritorios' } });
    assert.equal(linked.outcome, 'linked');
    const event = await client.query<{ payload: Record<string, unknown> }>(
      `SELECT event_payload AS payload FROM kanban_card_activities
       WHERE card_id = $1 AND event_payload->>'kind' = 'card.customer_linked'`,
      [s.cardB]
    );
    assert.equal(event.rows[0].payload.crossOffice, true);
    assert.equal(event.rows[0].payload.override, true);
    // Depois do vinculo pelo admin, o escritorio B ve o cadastro (pelo proprio card).
    assert.equal(
      (await customersService.lookup(scenarioContext(s, 'memberB'), s.boardId, s.cardB, '11144477735')).status,
      'found'
    );
  }));

void test('responsavel: candidatos so de quem ve o card; atribuir quem e de outro escritorio = 422', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { assigneesService } = build(db, s, new Map());
    const candidates = await assigneesService.candidates(scenarioContext(s, 'memberA'), s.boardId, s.cardA);
    assert.deepEqual(
      candidates.map((candidate) => candidate.identityId).sort(),
      [s.users.memberA, s.users.memberAB, s.users.boardAdminA].sort()
    );
    await assert.rejects(
      assigneesService.create(scenarioContext(s, 'memberA'), s.boardId, s.cardA, { identityId: s.users.memberB }, mutate(scenarioContext(s, 'memberA'))),
      (error: HttpException) => (error.getResponse() as { code: string }).code === 'identity_not_in_card_office'
    );
  }));
