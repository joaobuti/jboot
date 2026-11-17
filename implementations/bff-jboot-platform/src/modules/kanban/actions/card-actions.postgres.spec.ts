import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { withTestDatabase, TEST_DATABASE_REF } from '../../../test/with-test-database';
import { CardActionsRepository } from './card-actions.repository';
import { MutateContext } from '../kanban.types';

void test('PostgreSQL: assignments, current column, removal, audit and tenant FK isolation', async () => {
  await withTestDatabase(async (db, client) => {
    const context: MutateContext = {
      clientId: randomUUID(), identityId: randomUUID(), applicationId: randomUUID(),
      databaseRef: TEST_DATABASE_REF, scopes: [], roles: []
    };
    const boardId = randomUUID(), columnId = randomUUID(), destination = randomUUID(), cardId = randomUUID();
    await client.query(`INSERT INTO kanban_boards (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'Actions test', $3)`,
      [boardId, context.clientId, context.identityId]);
    await client.query(`INSERT INTO kanban_board_columns (id, client_id, board_id, name, position)
      VALUES ($1, $3, $4, 'Source', 0), ($2, $3, $4, 'Destination', 1)`, [columnId, destination, context.clientId, boardId]);
    await client.query(`INSERT INTO kanban_cards (id, client_id, board_id, board_column_id, title, position, created_by_identity_id)
      VALUES ($1, $2, $3, $4, 'Synthetic action card', 0, $5)`, [cardId, context.clientId, boardId, columnId, context.identityId]);
    const repository = new CardActionsRepository(db);
    await repository.replace(context, boardId, columnId, ['monitorar', 'gerar-protocolo']);
    assert.equal((await repository.list(TEST_DATABASE_REF, context.clientId, boardId, [columnId])).length, 2);
    assert.deepEqual(await repository.list(TEST_DATABASE_REF, randomUUID(), boardId, [columnId]), []);
    assert.deepEqual(await repository.list(TEST_DATABASE_REF, context.clientId, randomUUID(), [columnId]), []);
    assert.deepEqual(await repository.list(TEST_DATABASE_REF, context.clientId, boardId, [destination]), []);
    await repository.confirmExecution(context, boardId, cardId, columnId, 'monitorar');
    await client.query(`UPDATE kanban_cards SET board_column_id = $1 WHERE id = $2`, [destination, cardId]);
    await assert.rejects(() => repository.confirmExecution(context, boardId, cardId, columnId, 'monitorar'), ConflictException);
    await assert.rejects(() => repository.confirmExecution(context, boardId, cardId, destination, 'monitorar'), ConflictException);
    await assert.rejects(() => repository.replace({ ...context, clientId: randomUUID() }, boardId, columnId, []), NotFoundException);
    await repository.replace(context, boardId, columnId, []);
    assert.deepEqual(await repository.list(TEST_DATABASE_REF, context.clientId, boardId, [columnId]), []);
    const events = await client.query(`SELECT event_type, payload FROM kanban_audit_events WHERE client_id = $1 ORDER BY created_at, id`, [context.clientId]);
    assert.equal(events.rows.filter(event => event.event_type === 'kanban_column_actions_replaced').length, 2);
    assert.equal(events.rows.filter(event => event.event_type === 'kanban_card_action_executed').length, 1);
    assert.equal(JSON.stringify(events.rows).includes('Synthetic action card'), false);

    await client.query('SAVEPOINT cross_tenant_fk');
    await assert.rejects(() => client.query(`INSERT INTO kanban_column_actions (client_id, board_id, column_id, action_id, configured_by_identity_id)
      VALUES ($1, $2, $3, 'monitorar', $4)`, [randomUUID(), boardId, columnId, context.identityId]),
    (error: { code: string }) => error.code === '23503');
    await client.query('ROLLBACK TO SAVEPOINT cross_tenant_fk');
  });
});
