import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { UserProvisioningService } from './user-provisioning.service';

const context = {
  identityId: 'actor', clientId: 'client', applicationId: 'flow', databaseRef: 'db',
  scopes: ['users:manage'], roles: []
};
const dto = { identity: { documentType: 'cpf' as const, documentNumber: '00011122233', displayName: 'User' }, officeIds: ['office-a'] };

void test('manager provisioning creates identity, links selected offices and completes command', async () => {
  const calls: string[] = [];
  const commands = {
    begin: async () => ({ id: 'command', requestSha256: '', state: 'processing', identityId: null, claimed: true }),
    setIdentity: async () => { calls.push('setIdentity'); },
    complete: async () => ({ id: 'command', state: 'completed', identityId: 'target', officeIds: ['office-a'] }),
    fail: async () => { calls.push('fail'); }
  };
  const offices = {
    listByIds: async () => [{ id: 'office-a', name: 'A', active: true }],
    replaceUserOffices: async () => { calls.push('replace'); }
  };
  const identity = { createUser: async () => { calls.push('identity'); return 'target'; } };
  const service = new UserProvisioningService(commands as never, offices as never, identity as never, { userProvisioningHmacKey: 'test-key' } as never, { require: async () => 'active-office' } as never);
  // The command repository normally returns the supplied hash.
  commands.begin = async (_db?: unknown, _client?: unknown, _actor?: unknown, _key?: unknown, hash?: unknown) =>
    ({ id: 'command', requestSha256: String(hash), state: 'processing', identityId: null, claimed: true });

  const result = await service.provision(context, 'Bearer token', 'idempotency-1', dto);
  assert.equal(result.state, 'completed');
  assert.deepEqual(calls, ['identity', 'setIdentity', 'replace']);
});

void test('delegated provisioning ignores submitted offices: the new user joins the actor active office only', async () => {
  let linked: string[] = [];
  const commands = {
    begin: async (_db: unknown, _client: unknown, _actor: unknown, _key: unknown, hash: unknown) =>
      ({ id: 'command', requestSha256: String(hash), state: 'processing', identityId: null, claimed: true }),
    setIdentity: async () => {}, complete: async () => ({ state: 'completed' }), fail: async () => {}
  };
  const offices = {
    listOfficeIdsByIdentity: async () => new Map([['actor', ['inherited', 'inactive']]]),
    listByIds: async () => [
      { id: 'inherited', active: true, name: 'Inherited' },
      { id: 'inactive', active: false, name: 'Inactive' }
    ],
    replaceUserOffices: async (_db: string, _client: string, _target: string, ids: string[]) => { linked = ids; }
  };
  const service = new UserProvisioningService(commands as never, offices as never, { createUser: async () => 'target' } as never, { userProvisioningHmacKey: 'test-key' } as never, { require: async () => 'active-office' } as never);
  await service.provision({ ...context, scopes: ['flow:users:manage'] }, 'Bearer token', 'idempotency-2', dto);
  // So flow:admin atribui mais de um escritorio (flow-offices-sprints.md, S2).
  assert.deepEqual(linked, ['active-office']);
});

void test('tenant user manager without flow:admin cannot link a user to more than one office', async () => {
  const commands = {
    begin: async (_db: unknown, _client: unknown, _actor: unknown, _key: unknown, hash: unknown) =>
      ({ id: 'command', requestSha256: String(hash), state: 'processing', identityId: null, claimed: true }),
    setIdentity: async () => {}, complete: async () => ({ state: 'completed' }), fail: async () => {}
  };
  const offices = { listByIds: async () => [{ id: 'a', active: true }, { id: 'b', active: true }], replaceUserOffices: async () => {} };
  const service = new UserProvisioningService(commands as never, offices as never, { createUser: async () => 'target' } as never, { userProvisioningHmacKey: 'test-key' } as never, { require: async () => 'a' } as never);
  await assert.rejects(
    () => service.provision({ ...context, scopes: ['users:manage'] }, 'Bearer token', 'idempotency-4', { ...dto, officeIds: ['a', 'b'] }),
    /more than one office/
  );
});

void test('same idempotency key with another payload is rejected before side effects', async () => {
  const commands = { begin: async () => ({ id: 'command', requestSha256: 'different', state: 'completed', claimed: false }) };
  const service = new UserProvisioningService(commands as never, {} as never, {} as never, { userProvisioningHmacKey: 'test-key' } as never, { require: async () => 'active-office' } as never);
  await assert.rejects(() => service.provision(context, 'Bearer token', 'idempotency-3', dto));
});
