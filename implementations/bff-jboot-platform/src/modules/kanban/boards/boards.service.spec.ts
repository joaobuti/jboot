import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { BoardsService } from './boards.service';

const context = { clientId: 'c1', identityId: 'u1', databaseRef: 'db', applicationId: 'a', roles: [], scopes: ['flow:read'] };
const page = {
  data: [
    { id: 'b1', name: 'A', currentUserRole: null },
    { id: 'b2', name: 'B', currentUserRole: 'board_member' }
  ],
  meta: { limit: 20, offset: 0, total: 2 }
};

function service(effectiveAdmin: boolean, effectiveRole: string | null) {
  return new BoardsService(
    { list: async () => page } as never,
    {
      isEffectiveTenantAdmin: async () => effectiveAdmin,
      requireBoard: async () => ({ id: 'b1', name: 'A', currentUserRole: null }),
      resolveEffectiveRole: async () => (effectiveRole ? { role: effectiveRole, profileId: null } : null),
      resolveCapabilities: async () => ({ canReviewDocuments: false })
    } as never,
    {} as never
  );
}

void test('BoardsService.list: admin efetivo (Sprint 3.5) ve board_admin em todos; demais inalterado', async () => {
  const admin = await service(true, 'board_admin').list(context as never, { limit: 20, offset: 0 });
  assert.deepEqual(admin.data.map((board) => board.currentUserRole), ['board_admin', 'board_admin']);
  const regular = await service(false, null).list(context as never, { limit: 20, offset: 0 });
  assert.deepEqual(regular, page);
});

void test('BoardsService.get: currentUserRole e o papel efetivo', async () => {
  assert.equal((await service(true, 'board_admin').get(context as never, 'b1')).currentUserRole, 'board_admin');
  assert.equal((await service(false, null).get(context as never, 'b1')).currentUserRole, null);
});
