import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmailDispatchesService } from './email-dispatches.service';

const context = { clientId: 'client-1', identityId: 'admin-1', databaseRef: 'db-1', applicationId: 'app', roles: [], scopes: ['flow:admin'] };
const mutate = { ...context, ip: '127.0.0.1', userAgent: 'test' };
const TARGET = { id: 'd1', status: 'failed', cardId: 'card-1', boardId: 'board-1' };

function build(overrides: Record<string, unknown> = {}) {
  const calls = { requeued: 0, audits: [] as unknown[], published: [] as string[], listed: [] as unknown[] };
  const dispatchLog = {
    findTarget: async () => TARGET,
    requeueFailed: async () => {
      calls.requeued += 1;
      return true;
    },
    listForAdmin: async (_ref: string, _clientId: string, _viewer: unknown, statuses: string[]) => {
      calls.listed.push(statuses);
      return [];
    },
    backlog: async () => ({ pending: 0, processing: 0, failed: 1, oldestPendingAt: null }),
    ...((overrides.dispatchLog as object) ?? {})
  };
  const service = new EmailDispatchesService(
    dispatchLog as never,
    { resolve: async () => ({ identityId: 'admin-1' }) } as never,
    (overrides.visibility ?? { requireVisibleCard: async () => ({}) }) as never,
    (overrides.access ?? { requireRole: async () => 'board_admin' }) as never,
    { enqueueEmailDispatch: async (_ref: string, id: string) => calls.published.push(id) } as never,
    { record: async (...args: unknown[]) => calls.audits.push(args) } as never
  );
  return { service, calls };
}

void test('envios: reprocessar falha terminal volta a fila, audita e publica', async () => {
  const { service, calls } = build();
  assert.deepEqual(await service.retry(context as never, mutate as never, 'd1'), { id: 'd1', status: 'pending' });
  assert.equal(calls.requeued, 1);
  assert.deepEqual(calls.published, ['d1']);
  assert.equal((calls.audits[0] as unknown[])[0], 'kanban_automation_dispatch_retried');
  assert.deepEqual((calls.audits[0] as unknown[])[3], { dispatchId: 'd1', cardId: 'card-1' });
});

void test('envios: linha inexistente ou de card fora do alcance responde 404; sem board_admin 403', async () => {
  await assert.rejects(
    () => build({ dispatchLog: { findTarget: async () => null } }).service.retry(context as never, mutate as never, 'd1'),
    NotFoundException
  );
  const hidden = build({ visibility: { requireVisibleCard: async () => { throw new NotFoundException('Card not found'); } } });
  await assert.rejects(() => hidden.service.retry(context as never, mutate as never, 'd1'), NotFoundException);
  assert.equal(hidden.calls.requeued, 0);
  const member = build({ access: { requireRole: async () => { throw new ForbiddenException('Insufficient board role'); } } });
  await assert.rejects(() => member.service.retry(context as never, mutate as never, 'd1'), ForbiddenException);
  assert.equal(member.calls.requeued, 0);
});

void test('envios: so falha terminal pode ser reprocessada (409), inclusive em corrida', async () => {
  const pending = build({ dispatchLog: { findTarget: async () => ({ ...TARGET, status: 'pending' }) } });
  await assert.rejects(() => pending.service.retry(context as never, mutate as never, 'd1'), ConflictException);
  assert.equal(pending.calls.requeued, 0);
  const raced = build({ dispatchLog: { requeueFailed: async () => false } });
  await assert.rejects(() => raced.service.retry(context as never, mutate as never, 'd1'), ConflictException);
  assert.deepEqual(raced.calls.published, []);
  assert.equal(raced.calls.audits.length, 0);
});

void test('envios: filtro da lista vira estados do outbox', async () => {
  const { service, calls } = build();
  const result = await service.list(context as never);
  await service.list(context as never, 'failed');
  await service.list(context as never, 'pending');
  assert.deepEqual(calls.listed, [['failed', 'pending', 'processing'], ['failed'], ['pending', 'processing']]);
  assert.equal(result.maxAttempts, 5);
  assert.equal(result.summary.failed, 1);
});
