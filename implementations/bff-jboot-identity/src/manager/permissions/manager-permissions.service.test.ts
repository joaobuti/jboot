import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ManagerPermissionsService } from './manager-permissions.service';

const actor = { identityId: 'actor', clientId: 'client', applicationId: 'flow', roles: [], scopes: ['users:manage'] };
const rows = [
  { type: 'scope', key: 'flow:read', label: 'Read' },
  { type: 'role', key: 'board_member', label: 'Member' }
];

void describe('ManagerPermissionsService', () => {
  void it('returns only the authenticated application catalog', async () => {
    const repository = { listCatalog: async (applicationId: string) => ({ rows: applicationId === 'flow' ? rows : [] }) };
    const service = new ManagerPermissionsService(repository as never, {} as never, {} as never);
    assert.deepEqual(await service.catalog(actor), {
      scopes: [{ key: 'flow:read', label: 'Read' }],
      roles: [{ key: 'board_member', label: 'Member' }]
    });
  });

  void it('rejects a scope or role outside the module catalog', async () => {
    const repository = { listCatalog: async () => ({ rows }), replace: async () => { throw new Error('must not write'); } };
    const service = new ManagerPermissionsService(repository as never, {} as never, {} as never);
    await assert.rejects(() => service.replace(actor, 'target', { scopes: ['users:manage'], roles: ['global_master'] }));
  });

  void it('replaces only the target entitlement and invalidates its sessions', async () => {
    const writes: unknown[][] = [];
    const invalidated: string[] = [];
    const repository = {
      listCatalog: async () => ({ rows }),
      replace: async (...args: unknown[]) => { writes.push(args); return { identityId: 'target' }; }
    };
    const service = new ManagerPermissionsService(
      repository as never,
      { invalidateIdentity: async (id: string) => { invalidated.push(id); } } as never,
      { record: async () => {} } as never
    );
    await service.replace(actor, 'target', { scopes: ['flow:read'], roles: ['board_member'] });
    assert.deepEqual(writes, [[
      'target',
      'client',
      'flow',
      ['flow:read'],
      ['board_member'],
      ['flow:read'],
      ['board_member']
    ]]);
    assert.deepEqual(invalidated, ['target']);
  });
});
