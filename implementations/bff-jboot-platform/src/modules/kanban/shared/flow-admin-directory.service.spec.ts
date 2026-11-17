import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FlowAdminDirectory } from './flow-admin-directory.service';

function fakeIdentityDatabase(rows: () => Array<{ identityId: string; displayName: string | null; email: string | null; isAdmin: boolean }>) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    database: {
      queryIdentity: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        const adminsOnly = params[2] === true;
        return { rows: rows().filter((row) => !adminsOnly || row.isAdmin) };
      }
    }
  };
}

void test('FlowAdminDirectory: le entitlements do Identity so com SELECT parametrizado', async () => {
  const { calls, database } = fakeIdentityDatabase(() => [
    { identityId: 'a1', displayName: 'Admin', email: null, isAdmin: true },
    { identityId: 'u1', displayName: 'Operador', email: 'op@example.test', isAdmin: false }
  ]);
  const directory = new FlowAdminDirectory(database as never);
  assert.deepEqual([...(await directory.adminIdentityIds('c1'))], ['a1']);
  assert.equal((await directory.listFlowUsers('c1')).length, 2);
  for (const call of calls) {
    assert.match(call.sql.trim(), /^SELECT /);
    assert.doesNotMatch(call.sql, /\b(INSERT|UPDATE|DELETE)\b/);
    assert.match(call.sql, /e\.status = 'active'/);
    assert.match(call.sql, /i\.status = 'active'/);
    assert.match(call.sql, /slug = 'flow'/);
    assert.deepEqual(call.params.slice(0, 2), ['c1', 'flow:admin']);
  }
});

void test('FlowAdminDirectory: lista de admins com cache de 60 s por tenant', async () => {
  let admins = ['a1'];
  const { calls, database } = fakeIdentityDatabase(() =>
    admins.map((identityId) => ({ identityId, displayName: null, email: null, isAdmin: true }))
  );
  const directory = new FlowAdminDirectory(database as never);
  let now = 1_000;
  directory.now = () => now;

  assert.equal(await directory.isAdmin('c1', 'a1'), true);
  admins = ['a2'];
  now += 59_000;
  assert.equal(await directory.isAdmin('c1', 'a1'), true, 'dentro de 60 s usa o cache');
  assert.equal(calls.length, 1);
  now += 2_000;
  assert.equal(await directory.isAdmin('c1', 'a1'), false, 'depois de 60 s rele o Identity');
  assert.equal(await directory.isAdmin('c1', 'a2'), true);
  assert.equal(calls.length, 2);
  await directory.isAdmin('c2', 'a2');
  assert.equal(calls.length, 3, 'cache por tenant');
});
