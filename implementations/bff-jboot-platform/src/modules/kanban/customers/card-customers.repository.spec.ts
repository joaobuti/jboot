import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { keyOffViewer } from '../../../test/kanban-visibility';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { CardCustomersRepository } from './card-customers.repository';

interface BoardFixture {
  boardId: string;
  columnId: string;
}

async function createBoard(client: Client, clientId: string, ownerId: string): Promise<BoardFixture> {
  const boardId = randomUUID();
  const columnId = randomUUID();
  await client.query(`INSERT INTO kanban_boards (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'B', $3)`, [
    boardId,
    clientId,
    ownerId
  ]);
  await client.query(
    `INSERT INTO kanban_board_columns (id, client_id, board_id, name, position) VALUES ($1, $2, $3, 'Todo', 0)`,
    [columnId, clientId, boardId]
  );
  return { boardId, columnId };
}

let positionSeq = 0;
async function createCard(
  client: Client,
  clientId: string,
  board: BoardFixture,
  ownerId: string,
  status: 'active' | 'archived' | 'deleted' = 'active'
): Promise<string> {
  const cardId = randomUUID();
  await client.query(
    `INSERT INTO kanban_cards (id, client_id, board_id, board_column_id, title, position, status, created_by_identity_id)
     VALUES ($1, $2, $3, $4, 'Lead', $5, $6, $7)`,
    [cardId, clientId, board.boardId, board.columnId, positionSeq++, status, ownerId]
  );
  return cardId;
}

async function addMember(
  client: Client,
  clientId: string,
  boardId: string,
  identityId: string,
  status: 'active' | 'inactive' = 'active'
): Promise<void> {
  await client.query(
    `INSERT INTO kanban_board_members (client_id, board_id, identity_id, role, status) VALUES ($1, $2, $3, 'board_member', $4)`,
    [clientId, boardId, identityId, status]
  );
}

async function linkRaw(client: Client, clientId: string, cardId: string, customerId: string, by: string): Promise<void> {
  await client.query(
    `INSERT INTO kanban_card_customers (card_id, client_id, customer_id, created_by_identity_id) VALUES ($1, $2, $3, $4)`,
    [cardId, clientId, customerId, by]
  );
}

void test('replace vincula, troca devolvendo o titular anterior e mantem um titular por card', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CardCustomersRepository(db);
    const clientId = randomUUID();
    const userId = randomUUID();
    const board = await createBoard(client, clientId, userId);
    const cardId = await createCard(client, clientId, board, userId);
    const officeId = randomUUID();
    await client.query(
      `INSERT INTO kanban_offices (id, client_id, name, created_by_identity_id) VALUES ($1,$2,'Escritorio',$3)`,
      [officeId, clientId, userId]
    );
    await client.query(`UPDATE kanban_cards SET office_id = $3 WHERE client_id = $1 AND id = $2`, [clientId, cardId, officeId]);
    const customerA = randomUUID();
    const customerB = randomUUID();

    assert.equal(await repository.findByCard(TEST_DATABASE_REF, clientId, cardId), null);

    const first = await repository.replace(TEST_DATABASE_REF, clientId, cardId, customerA, userId);
    assert.equal(first.previousCustomerId, null);
    assert.equal(first.link.customerId, customerA);
    assert.equal(first.link.createdByIdentityId, userId);
    const inheritedOffice = await client.query<{ officeId: string; source: string }>(
      `SELECT office_id AS "officeId", source FROM kanban_customer_offices
       WHERE client_id = $1 AND customer_id = $2 AND unlinked_at IS NULL`,
      [clientId, customerA]
    );
    assert.deepEqual(inheritedOffice.rows, [{ officeId, source: 'card' }]);

    const second = await repository.replace(TEST_DATABASE_REF, clientId, cardId, customerB, userId);
    assert.equal(second.previousCustomerId, customerA);

    const current = await repository.findByCard(TEST_DATABASE_REF, clientId, cardId);
    assert.equal(current?.customerId, customerB);
    const count = await client.query(`SELECT count(*)::int AS n FROM kanban_card_customers WHERE card_id = $1`, [cardId]);
    assert.equal(count.rows[0].n, 1);

    // Outro tenant nao enxerga nem altera o vinculo.
    assert.equal(await repository.findByCard(TEST_DATABASE_REF, randomUUID(), cardId), null);
    await assert.rejects(() => repository.replace(TEST_DATABASE_REF, randomUUID(), cardId, customerA, userId), /Card not found/);
  }));

void test('replace recusa card excluido logicamente', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CardCustomersRepository(db);
    const clientId = randomUUID();
    const userId = randomUUID();
    const board = await createBoard(client, clientId, userId);
    const deletedCard = await createCard(client, clientId, board, userId, 'deleted');
    await assert.rejects(
      () => repository.replace(TEST_DATABASE_REF, clientId, deletedCard, randomUUID(), userId),
      /Card not found/
    );
  }));

void test('filterVisibleCustomerIds: membro ativo, inativo, card excluido, card arquivado, outro tenant e quadro sem acesso', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CardCustomersRepository(db);
    const clientId = randomUUID();
    const otherClientId = randomUUID();
    const userId = randomUUID();
    const ownerId = randomUUID();

    const memberBoard = await createBoard(client, clientId, ownerId);
    const inactiveBoard = await createBoard(client, clientId, ownerId);
    const noAccessBoard = await createBoard(client, clientId, ownerId);
    const otherTenantBoard = await createBoard(client, otherClientId, ownerId);
    await addMember(client, clientId, memberBoard.boardId, userId);
    await addMember(client, clientId, inactiveBoard.boardId, userId, 'inactive');
    await addMember(client, otherClientId, otherTenantBoard.boardId, userId);

    const activeMember = randomUUID();
    const archivedCardCustomer = randomUUID();
    const deletedCardCustomer = randomUUID();
    const inactiveMember = randomUUID();
    const noAccess = randomUUID();
    const otherTenant = randomUUID();
    const unlinked = randomUUID();

    await linkRaw(client, clientId, await createCard(client, clientId, memberBoard, ownerId), activeMember, ownerId);
    await linkRaw(client, clientId, await createCard(client, clientId, memberBoard, ownerId, 'archived'), archivedCardCustomer, ownerId);
    await linkRaw(client, clientId, await createCard(client, clientId, memberBoard, ownerId, 'deleted'), deletedCardCustomer, ownerId);
    await linkRaw(client, clientId, await createCard(client, clientId, inactiveBoard, ownerId), inactiveMember, ownerId);
    await linkRaw(client, clientId, await createCard(client, clientId, noAccessBoard, ownerId), noAccess, ownerId);
    await linkRaw(
      client,
      otherClientId,
      await createCard(client, otherClientId, otherTenantBoard, ownerId),
      otherTenant,
      ownerId
    );

    const visible = (ids: string[], tenant = clientId) =>
      repository.filterVisibleCustomerIds(TEST_DATABASE_REF, tenant, keyOffViewer(userId, tenant), ids);

    assert.deepEqual(await visible([activeMember]), [activeMember], 'membro ativo ve');
    assert.deepEqual(await visible([archivedCardCustomer]), [archivedCardCustomer], 'card arquivado conta');
    assert.deepEqual(await visible([deletedCardCustomer]), [], 'card excluido nao conta');
    assert.deepEqual(await visible([inactiveMember]), [], 'membro inativo nao ve');
    assert.deepEqual(await visible([noAccess]), [], 'quadro sem acesso nao conta');
    assert.deepEqual(await visible([unlinked]), [], 'cliente sem card nao e visivel');
    assert.deepEqual(await visible([otherTenant]), [], 'vinculo de outro tenant nao vaza');
    assert.deepEqual(await visible([otherTenant], otherClientId), [otherTenant], 'no proprio tenant o vinculo vale');
    assert.deepEqual(await visible([]), []);

    // Mantem a ordem de entrada (duplicidade legada: o primeiro visivel vence).
    assert.deepEqual(await visible([noAccess, archivedCardCustomer, activeMember]), [archivedCardCustomer, activeMember]);
  }));

void test('filterVisibleCustomerIds: cliente da ficha sem card e visivel pelo escritorio do usuario (admin: qualquer escritorio)', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CardCustomersRepository(db);
    const clientId = randomUUID();
    const userId = randomUUID();
    const manaus = randomUUID();
    const boaVista = randomUUID();
    for (const [id, name] of [[manaus, 'Manaus'], [boaVista, 'Boa Vista']]) {
      await client.query(
        `INSERT INTO kanban_offices (id, client_id, name, created_by_identity_id) VALUES ($1, $2, $3, $4)`,
        [id, clientId, name, userId]
      );
    }
    const inMyOffice = randomUUID();
    const inOtherOffice = randomUUID();
    const unlinkedFromMine = randomUUID();
    const withoutOffice = randomUUID();
    const linkOffice = (customerId: string, officeId: string, unlinked = false) =>
      client.query(
        unlinked
          ? `INSERT INTO kanban_customer_offices (client_id, customer_id, office_id, source, unlinked_at, unlinked_by_identity_id, unlink_reason)
             VALUES ($1, $2, $3, 'flow_customer', now(), $4, 'saiu do escritorio')`
          : `INSERT INTO kanban_customer_offices (client_id, customer_id, office_id, source) VALUES ($1, $2, $3, 'flow_customer')`,
        unlinked ? [clientId, customerId, officeId, userId] : [clientId, customerId, officeId]
      );
    await linkOffice(inMyOffice, manaus);
    await linkOffice(inOtherOffice, boaVista);
    await linkOffice(unlinkedFromMine, manaus, true);

    const member = { identityId: userId, clientId, isAdmin: false, officeIds: [manaus], officeVisibilityEnabled: true };
    const ids = [inMyOffice, inOtherOffice, unlinkedFromMine, withoutOffice];
    assert.deepEqual(await repository.filterVisibleCustomerIds(TEST_DATABASE_REF, clientId, member, ids), [inMyOffice]);
    const admin = { ...member, isAdmin: true, officeIds: [] };
    assert.deepEqual(
      await repository.filterVisibleCustomerIds(TEST_DATABASE_REF, clientId, admin, ids),
      [inMyOffice, inOtherOffice],
      'admin ve cliente de qualquer escritorio; sem escritorio ou desvinculado continua exigindo o vinculo pelo administrador'
    );
    assert.deepEqual(await repository.filterVisibleCustomerIds(TEST_DATABASE_REF, randomUUID(), admin, ids), [], 'outro tenant nao vaza');
  }));
