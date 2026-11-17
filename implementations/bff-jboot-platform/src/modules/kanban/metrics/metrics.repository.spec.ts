import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { keyOffViewer } from '../../../test/kanban-visibility';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { MetricsRepository } from './metrics.repository';

async function seed(client: Client) {
  const clientId = randomUUID();
  const identityId = randomUUID();
  const boardId = randomUUID();
  const columnId = randomUUID();
  const creatorId = randomUUID();

  await client.query(
    `INSERT INTO kanban_boards (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'Metrics board', $3)`,
    [boardId, clientId, creatorId]
  );
  await client.query(
    `INSERT INTO kanban_board_columns (id, client_id, board_id, name, position) VALUES ($1, $2, $3, 'Todo', 0)`,
    [columnId, clientId, boardId]
  );
  await client.query(
    `INSERT INTO kanban_board_members (client_id, board_id, identity_id, role, status) VALUES ($1, $2, $3, 'board_member', 'active')`,
    [clientId, boardId, identityId]
  );
  await client.query(
    `INSERT INTO kanban_cards (client_id, board_id, board_column_id, title, position, due_date, created_by_identity_id)
     VALUES
       ($1, $2, $3, 'Late', 0, CURRENT_DATE - interval '1 day', $4),
       ($1, $2, $3, 'Today', 1, CURRENT_DATE, $4),
       ($1, $2, $3, 'Future', 2, CURRENT_DATE + interval '1 day', $4),
       ($1, $2, $3, 'Archived late', 3, CURRENT_DATE - interval '2 days', $4)`,
    [clientId, boardId, columnId, creatorId]
  );
  await client.query(`UPDATE kanban_cards SET status = 'archived' WHERE title = 'Archived late' AND client_id = $1`, [clientId]);

  return { clientId, identityId, boardId };
}

void test('MetricsRepository.getOverdueCount counts only active cards due before current date', async () => {
  await withTestDatabase(async (db, client) => {
    const fixture = await seed(client);
    const repository = new MetricsRepository(db);

    const count = await repository.getOverdueCount(TEST_DATABASE_REF, fixture.clientId, keyOffViewer(fixture.identityId, fixture.clientId), {
      boardId: fixture.boardId
    });

    assert.equal(count, 1);
  });
});
