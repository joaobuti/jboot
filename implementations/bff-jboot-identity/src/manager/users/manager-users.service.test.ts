import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ManagerUsersService } from './manager-users.service';

void describe('ManagerUsersService', () => {
  void it('does not delegate tenant or module user-management scopes to a created user', async () => {
    const writes: unknown[][] = [];
    const repository = {
      findByDocumentNumber: async () => ({ rows: [{ id: 'target' }] }),
      upsertEntitlement: async (...args: unknown[]) => {
        writes.push(args);
        return { identityId: 'target' };
      }
    };
    const service = new ManagerUsersService(
      repository as never,
      { invalidateIdentity: async () => {} } as never,
      { record: async () => {} } as never
    );

    await service.create(
      {
        identityId: 'actor', clientId: 'client', applicationId: 'flow',
        scopes: ['flow:read', 'flow:users:manage', 'users:manage'], roles: ['board_member']
      },
      { documentType: 'cpf', documentNumber: '00011122233', displayName: 'Target' }
    );

    assert.deepEqual(writes[0]?.slice(0, 5), ['target', 'client', 'flow', ['flow:read'], ['board_member']]);
  });
});
