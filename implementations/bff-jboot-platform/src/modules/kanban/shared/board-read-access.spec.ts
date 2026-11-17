import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { buildRealVisibility } from '../../../test/kanban-visibility';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { ActivitiesRepository } from '../activities/activities.repository';
import { ActivitiesService } from '../activities/activities.service';
import { AssigneesRepository } from '../assignees/assignees.repository';
import { AssigneesService } from '../assignees/assignees.service';
import { AttachmentsRepository } from '../attachments/attachments.repository';
import { AttachmentsService } from '../attachments/attachments.service';
import { CardsRepository } from '../cards/cards.repository';
import { CardsService } from '../cards/cards.service';
import { ColumnsRepository } from '../columns/columns.repository';
import { ColumnsService } from '../columns/columns.service';
import { CardDocumentsRepository } from '../documents/card-documents.repository';
import { CardDocumentsService } from '../documents/card-documents.service';
import { DocumentTypesRepository } from '../documents/document-types.repository';
import { KanbanRequestContext } from '../kanban.types';
import { MembersRepository } from '../members/members.repository';
import { MembersService } from '../members/members.service';
import { ColumnPermissionsRepository } from '../profiles/column-permissions.repository';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { StatusesRepository } from '../statuses/statuses.repository';
import { StatusesService } from '../statuses/statuses.service';
import { TagsRepository } from '../tags/tags.repository';
import { TagsService } from '../tags/tags.service';

/**
 * Correcao de seguranca (revisao 3 da Sprint 2 do CRM de leads): toda leitura de
 * conteudo do quadro exige membresia ATIVA (qualquer papel). Roda contra o banco
 * de dev real (transacao + ROLLBACK) com BoardAccessService e repositorios reais.
 */

interface Fixture {
  clientId: string;
  boardId: string;
  cardId: string;
  activityId: string;
  attachmentId: string;
  viewer: string;
  inactive: string;
  outsider: string;
}

async function seed(client: Client): Promise<Fixture> {
  const f: Fixture = {
    clientId: randomUUID(),
    boardId: randomUUID(),
    cardId: randomUUID(),
    activityId: randomUUID(),
    attachmentId: randomUUID(),
    viewer: randomUUID(),
    inactive: randomUUID(),
    outsider: randomUUID()
  };
  const owner = randomUUID();
  const columnId = randomUUID();
  await client.query(`INSERT INTO kanban_boards (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'B', $3)`, [
    f.boardId,
    f.clientId,
    owner
  ]);
  await client.query(`INSERT INTO kanban_board_columns (id, client_id, board_id, name, position) VALUES ($1, $2, $3, 'Todo', 0)`, [
    columnId,
    f.clientId,
    f.boardId
  ]);
  await client.query(
    `INSERT INTO kanban_board_members (client_id, board_id, identity_id, role, status) VALUES
       ($1, $2, $3, 'board_admin', 'active'), ($1, $2, $4, 'board_viewer', 'active'), ($1, $2, $5, 'board_member', 'inactive')`,
    [f.clientId, f.boardId, owner, f.viewer, f.inactive]
  );
  await client.query(
    `INSERT INTO kanban_cards (id, client_id, board_id, board_column_id, title, position, created_by_identity_id)
     VALUES ($1, $2, $3, $4, 'Lead', 0, $5)`,
    [f.cardId, f.clientId, f.boardId, columnId, owner]
  );
  await client.query(
    `INSERT INTO kanban_card_activities (id, client_id, card_id, type, author_identity_id, text_content)
     VALUES ($1, $2, $3, 'comment', $4, 'oi')`,
    [f.activityId, f.clientId, f.cardId, owner]
  );
  await client.query(
    `INSERT INTO kanban_card_attachments
       (id, client_id, activity_id, file_name, content_type, size_bytes, storage_bucket, storage_key, uploaded_by_identity_id)
     VALUES ($1, $2, $3, 'rg.pdf', 'application/pdf', 10, 'b', $4, $5)`,
    [f.attachmentId, f.clientId, f.activityId, `${f.clientId}/${f.cardId}/${f.activityId}/${f.attachmentId}-rg.pdf`, owner]
  );
  return f;
}

function contextFor(clientId: string, identityId: string): KanbanRequestContext {
  return { identityId, clientId, applicationId: 'app', databaseRef: TEST_DATABASE_REF, scopes: ['flow:read'], roles: [] };
}

type Read = (context: KanbanRequestContext, f: Fixture) => Promise<unknown>;

function buildReads(db: DatabaseService): Record<string, Read> {
  // Membros resolvem nome no banco Identity; aqui so importa a autorizacao.
  const dbWithIdentity = { ...db, queryIdentity: async () => ({ rows: [] }) } as unknown as DatabaseService;
  const members = new MembersRepository(dbWithIdentity);
  const profiles = new ProfilesRepository(db);
  const columnPermissions = new ColumnPermissionsRepository(db);
  // Sprint 3.5: acesso + visibilidade reais; tenant sem a chave (regra anterior).
  const { access, visibility, officePolicy, leads, leadLock } = buildRealVisibility(dbWithIdentity);
  const cards = new CardsRepository(db);
  const activities = new ActivitiesRepository(db);
  const tags = new TagsRepository(db);
  const cardDocuments = new CardDocumentsRepository(db);
  const storage = { getSignedDownloadUrl: async () => ({ url: 'signed', expiresAt: 'x' }) };
  const page = { limit: 20, offset: 0 };

  const cardsService = new CardsService(
    cards,
    new ColumnsRepository(db),
    activities,
    tags,
    {} as never,
    access,
    {} as never,
    {} as never,
    { recordForActivity: async () => undefined } as never,
    {} as never,
    {} as never,
    cardDocuments,
    visibility,
    officePolicy,
    leads,
    leadLock,
    { assertCanEnterColumn: async () => undefined, cardIdsWithoutHisconForBoard: async () => new Set<string>(), cardIdsWithSignedKitPendingForBoard: async () => new Set<string>() } as never
  );
  const activitiesService = new ActivitiesService(activities, visibility, access, {} as never, {} as never);
  const attachmentsService = new AttachmentsService(new AttachmentsRepository(db), activities, visibility, storage as never, access);
  const documentsService = new CardDocumentsService(
    cardDocuments,
    new DocumentTypesRepository(db),
    visibility,
    {} as never,
    storage as never,
    access,
    {} as never,
    {} as never,
    new ColumnsRepository(db),
    leadLock
  );
  const tagsService = new TagsService(tags, visibility, activities, access, {} as never);
  const statusesService = new StatusesService(new StatusesRepository(db), access, {} as never);
  const assigneesService = new AssigneesService(new AssigneesRepository(db), visibility, members, activities, access, {} as never);
  const membersService = new MembersService(members, profiles, access, {} as never);
  const columnsService = new ColumnsService(new ColumnsRepository(db), columnPermissions, access, {} as never);

  return {
    'GET cards': (c, f) => cardsService.list(c, f.boardId, page as never),
    'GET columns': (c, f) => columnsService.list(c, f.boardId),
    'GET activities': (c, f) => activitiesService.list(c, f.boardId, f.cardId, page as never),
    'GET attachments': (c, f) => attachmentsService.list(c, f.boardId, f.cardId, f.activityId),
    'GET attachment download': (c, f) => attachmentsService.getDownloadUrl(c, f.boardId, f.cardId, f.activityId, f.attachmentId),
    'GET documents (checklist)': (c, f) => documentsService.getChecklist(c, f.boardId, f.cardId),
    'GET tags': (c, f) => tagsService.list(c, f.boardId, page as never),
    'GET card tags': (c, f) => tagsService.listForCard(c, f.boardId, f.cardId),
    'GET statuses': (c, f) => statusesService.list(c, f.boardId, page as never),
    'GET assignees': (c, f) => assigneesService.list(c, f.boardId, f.cardId),
    'GET members': (c, f) => membersService.list(c, f.boardId, page as never)
  };
}

function isMembershipRequired(error: unknown): boolean {
  return (
    error instanceof ForbiddenException &&
    (error.getResponse() as { code?: string }).code === 'board_membership_required'
  );
}

void test('leituras de conteudo do quadro: viewer le; nao membro e membro inativo 403; outro tenant 404', () =>
  withTestDatabase(async (db, client) => {
    const f = await seed(client);
    const reads = buildReads(db);
    assert.equal(Object.keys(reads).length, 11);

    for (const [label, read] of Object.entries(reads)) {
      await read(contextFor(f.clientId, f.viewer), f);
      await assert.rejects(read(contextFor(f.clientId, f.outsider), f), isMembershipRequired, `${label}: nao membro`);
      await assert.rejects(read(contextFor(f.clientId, f.inactive), f), isMembershipRequired, `${label}: membro inativo`);
      await assert.rejects(read(contextFor(randomUUID(), f.viewer), f), NotFoundException, `${label}: outro tenant`);
    }
  }));

void test('requireMember nao altera requireBoard: quadro do tenant continua resolvido para nao membro', () =>
  withTestDatabase(async (db, client) => {
    const f = await seed(client);
    const { access } = buildRealVisibility(db);
    const board = await access.requireBoard(contextFor(f.clientId, f.outsider), f.boardId);
    assert.equal((board as { currentUserRole: string | null }).currentUserRole, null);
    const membership = await access.requireMember(contextFor(f.clientId, f.viewer), f.boardId);
    assert.equal(membership.role, 'board_viewer');
  }));
