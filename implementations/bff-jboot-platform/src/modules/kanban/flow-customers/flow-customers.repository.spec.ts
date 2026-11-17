import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { FlowCustomersRepository } from './flow-customers.repository';

void test('Kanban repository does not access customer master tables', () => {
  const source = readFileSync(__filename.replace(/\.spec\.ts$/, '.ts'), 'utf8');
  assert.equal(source.includes('pdv_establishment_customers'), false);
  assert.equal(source.includes('customer_juridico'), false);
});

void test('idempotent replay returns the original card', async () => {
  let calls = 0;
  const query = async (sql: string) => {
    calls += 1;
    if (sql.includes('INSERT INTO kanban_customer_card_commands')) return { rowCount: 0, rows: [] };
    if (sql.includes('SELECT request_hash')) return { rowCount: 1, rows: [{ requestHash: 'hash', status: 'completed', cardId: 'card-1' }] };
    if (sql.includes('SELECT c.id FROM kanban_cards')) return { rowCount: 1, rows: [{ id: 'card-1' }] };
    throw new Error(`unexpected SQL: ${sql}`);
  };
  const database = { transactionForDatabaseRef: async (_ref: string, callback: (tx: unknown) => unknown) => callback({ query }) };
  const repository = new FlowCustomersRepository(database as never);
  assert.deepEqual(await repository.createCardFromCustomer('db', 'tenant', command()), { cardId: 'card-1', replay: true });
  assert.equal(calls, 3);
});

void test('idempotency key with another payload is rejected', async () => {
  const query = async (sql: string) => sql.includes('INSERT INTO kanban_customer_card_commands')
    ? { rowCount: 0, rows: [] }
    : { rowCount: 1, rows: [{ requestHash: 'other', status: 'completed', cardId: 'card-1' }] };
  const database = { transactionForDatabaseRef: async (_ref: string, callback: (tx: unknown) => unknown) => callback({ query }) };
  await assert.rejects(() => new FlowCustomersRepository(database as never).createCardFromCustomer('db', 'tenant', command()), ConflictException);
});

void test('WIP is checked under a column lock before card insertion', async () => {
  const statements: string[] = [];
  const query = async (sql: string) => {
    statements.push(sql);
    if (sql.includes('INSERT INTO kanban_customer_card_commands')) return { rowCount: 1, rows: [{ id: 'command' }] };
    if (sql.includes('FROM kanban_board_columns')) return { rowCount: 1, rows: [{ wipLimit: 1 }] };
    if (sql.includes('count(*)')) return { rowCount: 1, rows: [{ count: '1' }] };
    throw new Error(`unexpected SQL: ${sql}`);
  };
  const database = { transactionForDatabaseRef: async (_ref: string, callback: (tx: unknown) => unknown) => callback({ query }) };
  await assert.rejects(() => new FlowCustomersRepository(database as never).createCardFromCustomer('db', 'tenant', command()), ConflictException);
  assert.equal(statements.some((sql) => sql.includes('INSERT INTO kanban_cards')), false);
});

function command() {
  return { idempotencyKey: 'request-1', requestHash: 'hash', customerId: 'customer', boardId: 'board',
    columnId: 'column', officeId: 'office', title: 'Card', identityId: 'identity' };
}
