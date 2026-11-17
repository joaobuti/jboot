import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { FlowBoardsQuery } from './flow-boards.query';

void test('board discovery preserves flowEnabled false when Flow is not contracted', async () => {
  const query = new FlowBoardsQuery({
    requireCaller: async () => ({}),
    requireApplication: async () => { throw new ForbiddenException(); }
  } as never, {} as never, {} as never, {} as never);
  assert.deepEqual(await query.execute({} as never), { flowEnabled: false, boards: [], offices: [] });
});

void test('board discovery lists only active offices the user may use (own offices unless flow:admin)', async () => {
  const flow = { identityId: 'u', clientId: 'c', databaseRef: 'flow-db', scopes: ['flow:read'] };
  const requested: Array<string[] | null> = [];
  const offices = {
    listByIds: async (_ref: string, _client: string, ids: string[] | null) => {
      requested.push(ids);
      return [{ id: 'o1', name: 'Matriz', active: true }, { id: 'o2', name: 'Antigo', active: false }];
    }
  };
  const build = (isAdmin: boolean) =>
    new FlowBoardsQuery(
      { requireCaller: async () => ({}), requireApplication: async () => flow } as never,
      { listImportDestinations: async () => [{ id: 'b', name: 'Quadro', defaultColumnId: 'col' }] } as never,
      { resolve: async () => ({ isAdmin, officeIds: ['o1'] }) } as never,
      offices as never
    );
  const member = await build(false).execute({} as never);
  assert.deepEqual(member.offices, [{ id: 'o1', name: 'Matriz' }]);
  await build(true).execute({} as never);
  assert.deepEqual(requested, [['o1'], null], 'flow:admin ve todos os escritorios');
});
