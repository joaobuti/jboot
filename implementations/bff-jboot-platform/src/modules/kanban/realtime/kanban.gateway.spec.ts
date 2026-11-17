import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import { buildRealVisibility } from '../../../test/kanban-visibility';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { ActivitiesRepository } from '../activities/activities.repository';
import { CardsRepository } from '../cards/cards.repository';
import { CardsService } from '../cards/cards.service';
import { ColumnsRepository } from '../columns/columns.repository';
import { CardDocumentsRepository } from '../documents/card-documents.repository';
import { KanbanRequestContext } from '../kanban.types';
import { ColumnPermissionsRepository } from '../profiles/column-permissions.repository';
import { TagsRepository } from '../tags/tags.repository';
import { KanbanGateway } from './kanban.gateway';
import { FlowLiveEvents } from './flow-live-events';

/**
 * Backlog T6 (docs/product/flow-crm-leads-sprints.md): `board_viewer` ativo entra na sala do
 * quadro so para receber eventos; mutacao via socket continua exigindo admin/member. Roda contra
 * o banco de dev real (transacao + ROLLBACK) com BoardAccessService, ACL de coluna e
 * CardsService reais; so o socket.io e simulado.
 */

interface Fixture {
  clientId: string;
  boardId: string;
  openColumnId: string;
  restrictedColumnId: string;
  cardId: string;
  admin: string;
  member: string;
  viewer: string;
  restrictedViewer: string;
  inactiveViewer: string;
  outsider: string;
}

async function seed(client: Client): Promise<Fixture> {
  const f: Fixture = {
    clientId: randomUUID(),
    boardId: randomUUID(),
    openColumnId: randomUUID(),
    restrictedColumnId: randomUUID(),
    cardId: randomUUID(),
    admin: randomUUID(),
    member: randomUUID(),
    viewer: randomUUID(),
    restrictedViewer: randomUUID(),
    inactiveViewer: randomUUID(),
    outsider: randomUUID()
  };
  const profileId = randomUUID();
  await client.query(`INSERT INTO kanban_boards (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'B', $3)`, [
    f.boardId,
    f.clientId,
    f.admin
  ]);
  await client.query(
    `INSERT INTO kanban_board_columns (id, client_id, board_id, name, position) VALUES
       ($1, $3, $4, 'Aberta', 0), ($2, $3, $4, 'Restrita', 1)`,
    [f.openColumnId, f.restrictedColumnId, f.clientId, f.boardId]
  );
  // Perfil que nao ve a coluna restrita (ACL explicita can_view = false).
  await client.query(`INSERT INTO kanban_member_profiles (id, client_id, board_id, name) VALUES ($1, $2, $3, 'Leitor parcial')`, [
    profileId,
    f.clientId,
    f.boardId
  ]);
  await client.query(
    `INSERT INTO kanban_board_column_permissions (client_id, profile_id, board_column_id, can_view, can_edit)
     VALUES ($1, $2, $3, false, false)`,
    [f.clientId, profileId, f.restrictedColumnId]
  );
  await client.query(
    `INSERT INTO kanban_board_members (client_id, board_id, identity_id, role, status, profile_id) VALUES
       ($1, $2, $3, 'board_admin', 'active', NULL),
       ($1, $2, $4, 'board_member', 'active', NULL),
       ($1, $2, $5, 'board_viewer', 'active', NULL),
       ($1, $2, $6, 'board_viewer', 'active', $8),
       ($1, $2, $7, 'board_viewer', 'inactive', NULL)`,
    [f.clientId, f.boardId, f.admin, f.member, f.viewer, f.restrictedViewer, f.inactiveViewer, profileId]
  );
  await client.query(
    `INSERT INTO kanban_cards (id, client_id, board_id, board_column_id, title, position, created_by_identity_id)
     VALUES ($1, $2, $3, $4, 'Lead', 0, $5)`,
    [f.cardId, f.clientId, f.boardId, f.openColumnId, f.admin]
  );
  return f;
}

function contextFor(clientId: string, identityId: string): KanbanRequestContext {
  return { identityId, clientId, applicationId: 'app', databaseRef: TEST_DATABASE_REF, scopes: ['flow:read'], roles: [] };
}

interface FakeSocket {
  kanbanContext: KanbanRequestContext;
  handshake: { headers: Record<string, string>; address: string };
  emitted: Array<{ event: string; payload: unknown }>;
  join(room: string): Promise<void>;
  leave(room: string): Promise<void>;
  emit(event: string, payload: unknown): boolean;
  disconnect(): void;
}

function build(db: DatabaseService) {
  const rooms = new Map<string, Set<FakeSocket>>();
  const columnPermissions = new ColumnPermissionsRepository(db);
  // Sprint 3.5: acesso + visibilidade reais; tenant sem a chave (regra anterior).
  const { access, visibility, officePolicy, leads, leadLock } = buildRealVisibility(db);
  const cardsRepository = new CardsRepository(db);
  const cards = new CardsService(
    cardsRepository,
    new ColumnsRepository(db),
    new ActivitiesRepository(db),
    new TagsRepository(db),
    {} as never,
    access,
    {} as never,
    {} as never,
    { recordForActivity: async () => undefined } as never,
    {} as never,
    {} as never,
    new CardDocumentsRepository(db),
    visibility,
    officePolicy,
    leads,
    leadLock,
    { assertCanEnterColumn: async () => undefined, cardIdsWithoutHisconForBoard: async () => new Set<string>(), cardIdsWithSignedKitPendingForBoard: async () => new Set<string>() } as never
  );
  const moduleRef = { get: () => cards };
  const gateway = new KanbanGateway({} as never, access, columnPermissions, moduleRef as never, visibility, new FlowLiveEvents(), {} as never, {} as never);
  (gateway as unknown as { server: unknown }).server = {
    in: (room: string) => ({ fetchSockets: async () => [...(rooms.get(room) ?? [])] })
  };

  function socketFor(context: KanbanRequestContext): FakeSocket {
    const socket: FakeSocket = {
      kanbanContext: context,
      handshake: { headers: {}, address: '127.0.0.1' },
      emitted: [],
      join: async (room) => {
        rooms.set(room, (rooms.get(room) ?? new Set()).add(socket));
      },
      leave: async (room) => {
        rooms.get(room)?.delete(socket);
      },
      emit: (event, payload) => {
        socket.emitted.push({ event, payload });
        return true;
      },
      disconnect: () => undefined
    };
    return socket;
  }

  const inRoom = (boardId: string, socket: FakeSocket) => rooms.get(`board:${boardId}`)?.has(socket) ?? false;
  return { gateway, socketFor, inRoom, cardsRepository };
}

function movedEvent(f: Fixture, toBoardColumnId: string) {
  return {
    cardId: f.cardId,
    fromBoardColumnId: f.openColumnId,
    toBoardColumnId,
    toPosition: 0,
    movedByIdentityId: f.admin,
    occurredAt: new Date().toISOString()
  };
}

const received = (socket: FakeSocket) => socket.emitted.filter((item) => item.event === 'card.moved');
const joinDenied = (socket: FakeSocket) =>
  socket.emitted.some((item) => item.event === 'error' && (item.payload as { code: string }).code === 'board_join_denied');

void test('realtime: board_viewer ativo entra na sala e recebe card.moved', () =>
  withTestDatabase(async (db, client) => {
    const f = await seed(client);
    const { gateway, socketFor, inRoom } = build(db);
    const viewer = socketFor(contextFor(f.clientId, f.viewer));

    await gateway.onBoardJoin(viewer as never, { boardId: f.boardId });
    assert.equal(inRoom(f.boardId, viewer), true);
    assert.equal(joinDenied(viewer), false);

    await gateway.broadcastCardMoved(f.boardId, movedEvent(f, f.openColumnId));
    assert.equal(received(viewer).length, 1);
    assert.equal((received(viewer)[0].payload as { boardId: string }).boardId, f.boardId);
  }));

void test('realtime: ACL de coluna vale para o viewer igual a leitura HTTP (perfil sem can_view nao recebe)', () =>
  withTestDatabase(async (db, client) => {
    const f = await seed(client);
    const { gateway, socketFor } = build(db);
    const viewer = socketFor(contextFor(f.clientId, f.viewer));
    const restricted = socketFor(contextFor(f.clientId, f.restrictedViewer));
    const admin = socketFor(contextFor(f.clientId, f.admin));
    for (const socket of [viewer, restricted, admin]) {
      await gateway.onBoardJoin(socket as never, { boardId: f.boardId });
    }

    await gateway.broadcastCardMoved(f.boardId, movedEvent(f, f.restrictedColumnId));
    assert.equal(received(admin).length, 1, 'board_admin ve todas as colunas');
    assert.equal(received(viewer).length, 1, 'viewer sem perfil: coluna sem ACL e visivel');
    assert.equal(received(restricted).length, 0, 'viewer com perfil can_view = false nao recebe');

    await gateway.broadcastCardMoved(f.boardId, movedEvent(f, f.openColumnId));
    assert.equal(received(restricted).length, 1, 'coluna sem linha de ACL continua visivel ao perfil');
  }));

void test('realtime: board_viewer nao move card via socket (CardsService exige admin/member)', () =>
  withTestDatabase(async (db, client) => {
    const f = await seed(client);
    const { gateway, socketFor, cardsRepository } = build(db);
    const viewer = socketFor(contextFor(f.clientId, f.viewer));
    await gateway.onBoardJoin(viewer as never, { boardId: f.boardId });

    await gateway.onCardMove(viewer as never, {
      boardId: f.boardId,
      cardId: f.cardId,
      toBoardColumnId: f.restrictedColumnId,
      toPosition: 0
    });

    const error = viewer.emitted.find((item) => item.event === 'error');
    assert.ok(error, 'remetente recebe erro');
    assert.equal((error.payload as { code: string }).code, 'ForbiddenException');
    assert.equal(received(viewer).length, 0, 'nenhum card.moved emitido');
    const card = await cardsRepository.findById(TEST_DATABASE_REF, f.clientId, f.boardId, f.cardId);
    assert.equal(card?.boardColumnId, f.openColumnId, 'card nao mudou de coluna');
  }));

void test('realtime: nao membro e membro inativo nao entram na sala nem recebem evento', () =>
  withTestDatabase(async (db, client) => {
    const f = await seed(client);
    const { gateway, socketFor, inRoom } = build(db);
    const outsider = socketFor(contextFor(f.clientId, f.outsider));
    const inactive = socketFor(contextFor(f.clientId, f.inactiveViewer));
    const otherTenant = socketFor(contextFor(randomUUID(), f.viewer));

    for (const socket of [outsider, inactive, otherTenant]) {
      await gateway.onBoardJoin(socket as never, { boardId: f.boardId });
      assert.equal(inRoom(f.boardId, socket), false);
      assert.equal(joinDenied(socket), true);
    }

    await gateway.broadcastCardMoved(f.boardId, movedEvent(f, f.openColumnId));
    for (const socket of [outsider, inactive, otherTenant]) {
      assert.equal(received(socket).length, 0);
    }
  }));

void test('realtime: viewer inativado depois do join deixa de receber (revalidacao por evento)', () =>
  withTestDatabase(async (db, client) => {
    const f = await seed(client);
    const { gateway, socketFor, inRoom } = build(db);
    const viewer = socketFor(contextFor(f.clientId, f.viewer));
    await gateway.onBoardJoin(viewer as never, { boardId: f.boardId });
    assert.equal(inRoom(f.boardId, viewer), true);

    await client.query(`UPDATE kanban_board_members SET status = 'inactive' WHERE client_id = $1 AND identity_id = $2`, [
      f.clientId,
      f.viewer
    ]);
    await gateway.broadcastCardMoved(f.boardId, movedEvent(f, f.openColumnId));
    assert.equal(received(viewer).length, 0);
  }));
