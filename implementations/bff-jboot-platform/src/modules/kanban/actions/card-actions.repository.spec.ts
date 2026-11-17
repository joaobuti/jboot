import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CardActionsRepository } from './card-actions.repository';

const context = { clientId: 'tenant', databaseRef: 'db', identityId: 'user', applicationId: 'flow', scopes: [], roles: [] };

function fixture(options: { noCard?: boolean; moved?: boolean; noColumn?: boolean; noAction?: boolean } = {}) {
  const queries: { sql: string; values: unknown[] }[] = [];
  let committed = false;
  const query = async (sql: string, values: unknown[]) => {
    queries.push({ sql, values });
    if (sql.includes('FROM kanban_cards')) return { rows: options.noCard ? [] : [{ columnId: options.moved ? 'other' : 'column' }] };
    if (sql.includes('FROM kanban_board_columns')) return { rows: options.noColumn ? [] : [{ id: 'column' }] };
    if (sql.includes('SELECT config')) return { rows: options.noAction ? [] : [{ config: { agentId: 'agent' }, configuredByIdentityId: 'admin' }] };
    return { rows: [] };
  };
  const repository = new CardActionsRepository({
    transactionForDatabaseRef: async (ref: string, handler: (client: unknown) => Promise<unknown>) => {
      assert.equal(ref, 'db');
      const result = await handler({ query });
      committed = true;
      return result;
    },
    queryForDatabaseRef: async (ref: string, sql: string, values: unknown[]) => {
      assert.equal(ref, 'db');
      return query(sql, values);
    }
  } as never);
  return { repository, queries, committed: () => committed };
}

void test('Assignments replace atomically under column lock; every query includes authenticated tenant and board', async () => {
  const { repository, queries, committed } = fixture();
  await repository.replace(context, 'board', 'column', ['monitorar', 'gerar-protocolo']);
  assert.equal(committed(), true);
  assert.match(queries[0].sql, /FOR UPDATE/);
  assert.equal(queries.length, 4);
  for (const query of queries) assert.equal(query.values[0], 'tenant');
  assert.deepEqual(queries[2].values, ['tenant', 'board', 'column', ['monitorar', 'gerar-protocolo'], 'user', '{}']);
  assert.match(queries[3].sql, /kanban_audit_events/);
});

void test('Assignment stores the config of actions that require one', async () => {
  const { repository, queries } = fixture();
  await repository.replace(context, 'board', 'column', ['validar-assinatura'], { 'validar-assinatura': { agentId: 'agent' } });
  assert.match(queries[2].sql, /COALESCE\(\(\$6::jsonb\)->action_id, '\{\}'::jsonb\)/);
  assert.deepEqual(JSON.parse(queries[2].values[5] as string), { 'validar-assinatura': { agentId: 'agent' } });
});

void test('Nonexistent/inactive/wrong tenant column cannot be configured', async () => {
  const { repository, queries, committed } = fixture({ noColumn: true });
  await assert.rejects(() => repository.replace(context, 'board', 'column', ['monitorar']), NotFoundException);
  assert.equal(queries.length, 1);
  assert.equal(committed(), false);
});

for (const options of [{ noCard: true }, { moved: true }, { noColumn: true }, { noAction: true }]) {
  void test(`Execution checks live state and never audits rejected execution: ${JSON.stringify(options)}`, async () => {
    const { repository, queries, committed } = fixture(options);
    await assert.rejects(() => repository.confirmExecution(context, 'board', 'card', 'column', 'monitorar'),
      options.noCard || options.noColumn ? NotFoundException : ConflictException);
    assert.equal(committed(), false);
    assert.equal(queries.some(query => query.sql.includes('INSERT INTO kanban_audit_events')), false);
  });
}

void test('Successful execution locks current card and column before association check and atomic audit', async () => {
  const { repository, queries, committed } = fixture();
  assert.deepEqual(await repository.confirmExecution(context, 'board', 'card', 'column', 'monitorar'), { config: { agentId: 'agent' }, configuredByIdentityId: 'admin' });
  assert.equal(committed(), true);
  assert.match(queries[0].sql, /status = 'active' FOR UPDATE/);
  assert.match(queries[1].sql, /FOR UPDATE/);
  assert.deepEqual(queries[2].values, ['tenant', 'board', 'column', 'monitorar']);
  assert.deepEqual(JSON.parse(queries[3].values[4] as string), { cardId: 'card', columnId: 'column', actionId: 'monitorar' });
});

void test('Listing assignments restricts query to tenant, board and visible columns', async () => {
  const { repository, queries } = fixture();
  await repository.list('db', 'tenant', 'board', ['visible']);
  assert.deepEqual(queries[0].values, ['tenant', 'board', ['visible']]);
  assert.match(queries[0].sql, /ANY\(\$3::uuid\[\]\)/);
});
