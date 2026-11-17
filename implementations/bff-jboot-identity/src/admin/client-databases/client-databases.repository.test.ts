import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseService } from '../../database/database.service';
import { ClientDatabasesRepository } from './client-databases.repository';

function stub() {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const database = {
    transaction: async <T>(handler: (client: never) => Promise<T>) =>
      handler({
        query: async (sql: string, params: unknown[] = []) => {
          queries.push({ sql, params });
          return sql.includes('INSERT INTO database_refs') ? { rows: [{ id: 'novo' }] } : { rows: [] };
        }
      } as never)
  };
  return { repository: new ClientDatabasesRepository(database as unknown as DatabaseService), queries };
}

const expected = {
  databaseId: 'db-1', strategy: 'shared_db' as const, connectionName: 'postgres.kanban', databaseName: 'jboot_kanban_demo_dev',
  schemaName: null, status: 'active' as const, metadata: {}
};

test('aplicar corrige o proprio registro (mesmo id): sessoes e acompanhamentos guardam o id', async () => {
  const { repository, queries } = stub();
  assert.equal(await repository.applyExpected('client', 'app', 'ref-atual', expected), 'ref-atual');
  assert.equal(queries.some(query => query.sql.includes('INSERT INTO database_refs')), false);
  const update = queries.find(query => query.sql.includes('SET database_id'));
  assert.equal(update?.params[0], 'ref-atual');
  assert.equal(update?.params[4], 'jboot_kanban_demo_dev');
  assert.equal(queries[0].params[2], 'ref-atual');
});

test('sem registro, cria um', async () => {
  const { repository, queries } = stub();
  assert.equal(await repository.applyExpected('client', 'app', null, expected), 'novo');
  assert.ok(queries.some(query => query.sql.includes('INSERT INTO database_refs')));
});
