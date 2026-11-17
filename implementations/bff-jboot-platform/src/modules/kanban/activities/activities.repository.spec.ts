import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ActivitiesRepository } from './activities.repository';

void test('integration events use the database uniqueness key for retry safety', async () => {
  let sql = '';
  let values: readonly unknown[] = [];
  const repository = new ActivitiesRepository({
    queryForDatabaseRef: async (_databaseRef: string, text: string, input: readonly unknown[]) => {
      sql = text;
      values = input;
      return { rows: [{ id: 'activity-1' }], rowCount: 1 };
    }
  } as never);

  await repository.createSystemEvent(
    'flow-db', 'client-1', 'card-1', 'identity-1',
    'juridico_process_changed', {}, 'operation-1'
  );

  assert.match(sql, /ON CONFLICT \(client_id, card_id, integration_key\)/);
  assert.equal(values[4], 'operation-1');
});
