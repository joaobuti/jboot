import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DatabaseService } from '../../../database/database.service';
import { OfficeScenario, ScenarioUser, scenarioContext, seedOfficeScenario, setOfficeVisibility } from '../../../test/kanban-office-fixture';
import { buildRealVisibility, fakeAdminDirectory } from '../../../test/kanban-visibility';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { ActivitiesRepository } from '../activities/activities.repository';
import { CardsRepository } from '../cards/cards.repository';
import { CardCustomersRepository } from '../customers/card-customers.repository';
import { KanbanRequestContext } from '../kanban.types';
import { ColumnPermissionsRepository } from '../profiles/column-permissions.repository';
import { FlowLiveEvents } from './flow-live-events';
import { KanbanGateway } from './kanban.gateway';

/**
 * Realtime com visibilidade por escritorio (CRM de leads, Sprint 3.5): evento de card so chega
 * ao socket cujo usuario ve o card, revalidado por evento (troca de escritorio vale sem novo
 * login). Banco real (transacao + ROLLBACK); so o socket.io e simulado.
 */

interface FakeSocket {
  kanbanContext: KanbanRequestContext;
  handshake: { headers: Record<string, string>; address: string };
  emitted: Array<{ event: string; payload: unknown }>;
  join(room: string): Promise<void>;
  leave(room: string): Promise<void>;
  emit(event: string, payload: unknown): boolean;
  disconnect(): void;
}

function build(db: DatabaseService, s: OfficeScenario) {
  const rooms = new Map<string, Set<FakeSocket>>();
  const { access, visibility } = buildRealVisibility(db, fakeAdminDirectory([s.users.admin]));
  const live = new FlowLiveEvents();
  const gateway = new KanbanGateway(
    {} as never, access, new ColumnPermissionsRepository(db), { get: () => null } as never, visibility,
    live, new CardsRepository(db), new CardCustomersRepository(db)
  );
  (gateway as unknown as { server: unknown }).server = {
    in: (room: string) => ({ fetchSockets: async () => [...(rooms.get(room) ?? [])] }),
    to: (room: string) => ({ emit: (event: string, payload: unknown) => [...(rooms.get(room) ?? [])].forEach((socket) => socket.emit(event, payload)) })
  };
  const socketFor = (user: ScenarioUser): FakeSocket => {
    const socket: FakeSocket = {
      kanbanContext: scenarioContext(s, user),
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
  };
  return { gateway, socketFor, live };
}

const received = (socket: FakeSocket) => socket.emitted.filter((item) => item.event === 'card.moved').length;

function moved(s: OfficeScenario, cardId: string) {
  return {
    cardId,
    fromBoardColumnId: s.columnId,
    toBoardColumnId: s.columnId,
    toPosition: 0,
    movedByIdentityId: s.users.memberA,
    occurredAt: new Date().toISOString()
  };
}

void test('realtime por escritorio: evento do card de A so chega a quem ve A; admin nao membro entra e recebe', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { gateway, socketFor } = build(db, s);
    const sockets = {
      admin: socketFor('admin'),
      memberA: socketFor('memberA'),
      memberB: socketFor('memberB'),
      memberAB: socketFor('memberAB'),
      noOffice: socketFor('noOffice')
    };
    for (const socket of Object.values(sockets)) {
      await gateway.onBoardJoin(socket as never, { boardId: s.boardId });
    }
    await gateway.broadcastCardMoved(s.boardId, moved(s, s.cardA));
    assert.deepEqual(
      Object.fromEntries(Object.entries(sockets).map(([name, socket]) => [name, received(socket)])),
      { admin: 1, memberA: 1, memberB: 0, memberAB: 1, noOffice: 0 }
    );
  }));

void test('realtime: usuario que sai do escritorio deixa de receber no evento seguinte (socket aberto, sem novo login)', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { gateway, socketFor } = build(db, s);
    const socket = socketFor('memberA');
    await gateway.onBoardJoin(socket as never, { boardId: s.boardId });
    await gateway.broadcastCardMoved(s.boardId, moved(s, s.cardA));
    assert.equal(received(socket), 1);

    await client.query(`DELETE FROM kanban_user_offices WHERE client_id = $1 AND identity_id = $2`, [s.clientId, s.users.memberA]);
    await gateway.broadcastCardMoved(s.boardId, moved(s, s.cardA));
    assert.equal(received(socket), 1, 'evento do escritorio removido nao chega');
  }));

void test('realtime com a chave desligada: todo membro recebe; flow:admin nao membro tambem entra (regra de 2026-11-11)', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: false });
    await setOfficeVisibility(client, s.clientId, false);
    const { gateway, socketFor } = build(db, s);
    const admin = socketFor('admin');
    const memberB = socketFor('memberB');
    await gateway.onBoardJoin(admin as never, { boardId: s.boardId });
    await gateway.onBoardJoin(memberB as never, { boardId: s.boardId });
    await gateway.broadcastCardMoved(s.boardId, moved(s, s.cardA));
    assert.equal(received(memberB), 1);
    assert.equal(received(admin), 1);
    assert.equal(admin.emitted.some((item) => item.event === 'error'), false);
  }));

const updates = (socket: FakeSocket) => socket.emitted.filter((item) => item.event === 'card.updated');
/** O repasse e assincrono: espera ate os avisos esperados chegarem (ou 2 s), e um pouco mais para pegar extras. */
async function settle(done: () => boolean): Promise<void> {
  for (let waited = 0; waited < 2000 && !done(); waited += 20) await new Promise((resolve) => setTimeout(resolve, 20));
  await new Promise((resolve) => setTimeout(resolve, 100));
}

void test('tempo real (R1): atividade gravada no card vira card.updated so para quem ve o card', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { gateway, socketFor, live } = build(db, s);
    gateway.onModuleInit();
    const sockets = { admin: socketFor('admin'), memberA: socketFor('memberA'), memberB: socketFor('memberB'), noOffice: socketFor('noOffice') };
    for (const socket of Object.values(sockets)) await gateway.onBoardJoin(socket as never, { boardId: s.boardId });
    const otherTenant = socketFor('memberA');
    otherTenant.kanbanContext = { ...otherTenant.kanbanContext, clientId: '00000000-0000-0000-0000-000000000001' };
    await gateway.onBoardJoin(otherTenant as never, { boardId: s.boardId }).catch(() => undefined);

    await new ActivitiesRepository(db, live).createSystemEvent(TEST_DATABASE_REF, s.clientId, s.cardA, s.users.memberA, 'card.initial_petitions_registered');
    await settle(() => updates(sockets.admin).length > 0 && updates(sockets.memberA).length > 0);
    assert.deepEqual(
      Object.fromEntries(Object.entries(sockets).map(([name, socket]) => [name, updates(socket).length])),
      { admin: 1, memberA: 1, memberB: 0, noOffice: 0 }
    );
    assert.deepEqual(updates(sockets.memberA)[0].payload, { boardId: s.boardId, cardId: s.cardA, kind: 'card.initial_petitions_registered' });
    assert.equal(updates(otherTenant).length, 0, 'outro tenant nunca recebe');
    gateway.onModuleDestroy();
  }));

void test('tempo real (R1): ficha do cliente alterada avisa a sala do tenant e os cards vinculados', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { gateway, socketFor, live } = build(db, s);
    gateway.onModuleInit();
    const memberA = socketFor('memberA');
    const memberB = socketFor('memberB');
    await gateway.handleConnection(memberA as never).catch(() => undefined);
    await memberA.join(`tenant:${s.clientId}`);
    await memberB.join(`tenant:${s.clientId}`);
    await gateway.onBoardJoin(memberA as never, { boardId: s.boardId });
    await gateway.onBoardJoin(memberB as never, { boardId: s.boardId });
    const customerId = '11111111-1111-4111-8111-111111111111';
    await client.query(
      `INSERT INTO kanban_card_customers (card_id, client_id, customer_id, created_by_identity_id) VALUES ($1, $2, $3, $4)`,
      [s.cardA, s.clientId, customerId, s.users.memberA]
    );

    live.customerChanged(TEST_DATABASE_REF, s.clientId, customerId, 'customer.validation_answered');
    await settle(() => updates(memberA).length > 0);
    const customerEvents = (socket: FakeSocket) => socket.emitted.filter((item) => item.event === 'customer.updated').map((item) => item.payload);
    assert.deepEqual(customerEvents(memberA), [{ customerId, kind: 'customer.validation_answered' }], 'so o id e o tipo');
    assert.deepEqual(customerEvents(memberB), [{ customerId, kind: 'customer.validation_answered' }]);
    assert.deepEqual(updates(memberA).map((item) => item.payload), [{ boardId: s.boardId, cardId: s.cardA, kind: 'customer.validation_answered' }]);
    assert.equal(updates(memberB).length, 0, 'card do escritorio A nao chega a quem so ve B');
    gateway.onModuleDestroy();
  }));
