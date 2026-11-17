import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DomainIntegrationsRepository } from './domain-integrations.repository';

void test('application context resolution binds the application slug and enforces required scopes', async () => {
  let values: readonly unknown[] = [];
  const repository = new DomainIntegrationsRepository({
    queryIdentity: async (_sql: string, input: readonly unknown[]) => {
      values = input;
      return { rows: [{ applicationId: 'app', databaseRef: 'db', scopes: ['flow:read'], roles: [] }] };
    }
  } as never);

  const denied = await repository.resolveApplicationContext('identity', 'client', 'flow', ['flow:read', 'flow:write']);
  assert.equal(denied, null);
  assert.deepEqual(values, ['identity', 'client', 'flow']);
});

void test('export audit uses operation key conflict handling', async () => {
  let sql = '';
  let values: readonly unknown[] = [];
  const repository = new DomainIntegrationsRepository({
    queryForDatabaseRef: async (_ref: string, text: string, input: readonly unknown[]) => {
      sql = text;
      values = input;
      return { rows: [], rowCount: 0 };
    }
  } as never);

  await repository.insertExportAudit('juridico-db', {
    clientId: 'client', identityId: 'identity', eventType: 'event',
    operationKey: 'operation', payload: {}, ip: null
  });
  assert.match(sql, /ON CONFLICT \(client_id, event_type, operation_key\)/);
  assert.equal(values[3], 'operation');
});
