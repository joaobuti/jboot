import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { BoardsRepository } from './boards.repository';

async function countDefaultColumns(client: Client, clientId: string, boardId: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM kanban_board_columns
     WHERE client_id = $1 AND board_id = $2 AND is_default = true AND status = 'active'`,
    [clientId, boardId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

void test('BoardsRepository.createWithOwner creates recoverable BACKLOG default column', async () => {
  await withTestDatabase(async (db, client) => {
    const repository = new BoardsRepository(db);
    const clientId = randomUUID();
    const identityId = randomUUID();

    const board = await repository.createWithOwner(
      TEST_DATABASE_REF,
      clientId,
      { name: 'Integration board' },
      identityId
    );

    assert.ok(board.defaultColumnId);
    assert.equal(await countDefaultColumns(client, clientId, board.id), 1);

    const column = await client.query<{ name: string; position: number; isDefault: boolean }>(
      `SELECT name, position, is_default AS "isDefault"
       FROM kanban_board_columns
       WHERE id = $1 AND client_id = $2 AND board_id = $3`,
      [board.defaultColumnId, clientId, board.id]
    );
    assert.deepEqual(column.rows[0], { name: 'BACKLOG', position: 0, isDefault: true });

    const destinations = await repository.listImportDestinations(TEST_DATABASE_REF, clientId, identityId);
    assert.deepEqual(destinations, [{ id: board.id, name: 'Integration board', defaultColumnId: board.defaultColumnId }]);

    const found = await repository.findById(TEST_DATABASE_REF, clientId, board.id, identityId);
    assert.equal(found?.defaultColumnId, board.defaultColumnId);

    const list = await repository.list(TEST_DATABASE_REF, clientId, identityId, { limit: 10, offset: 0 });
    assert.equal(list.data[0]?.defaultColumnId, board.defaultColumnId);
  });
});

void test('BoardsRepository: captacao de leads (Sprint 4, PE1) nasce desligada e liga/desliga pelo update parcial', async () => {
  await withTestDatabase(async (db) => {
    const repository = new BoardsRepository(db);
    const clientId = randomUUID();
    const identityId = randomUUID();
    const board = await repository.createWithOwner(TEST_DATABASE_REF, clientId, { name: 'Leads' }, identityId);
    assert.equal(board.leadIntakeEnabled, false);

    const enabled = await repository.update(TEST_DATABASE_REF, clientId, board.id, { leadIntakeEnabled: true });
    assert.equal(enabled.leadIntakeEnabled, true);
    // Update parcial sem o campo preserva o valor.
    const renamed = await repository.update(TEST_DATABASE_REF, clientId, board.id, { name: 'Leads 2' });
    assert.equal(renamed.leadIntakeEnabled, true);
    assert.equal((await repository.findById(TEST_DATABASE_REF, clientId, board.id, identityId))?.leadIntakeEnabled, true);
    assert.equal((await repository.list(TEST_DATABASE_REF, clientId, identityId, { limit: 10, offset: 0 })).data[0]?.leadIntakeEnabled, true);
    const disabled = await repository.update(TEST_DATABASE_REF, clientId, board.id, { leadIntakeEnabled: false });
    assert.equal(disabled.leadIntakeEnabled, false);
  });
});
