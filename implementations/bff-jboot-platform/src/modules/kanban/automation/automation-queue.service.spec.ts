import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Logger } from '@nestjs/common';
import {
  AutomationQueueService,
  EVALUATE_SCHEDULED_AUTOMATIONS_JOB,
  KANBAN_AUTOMATION_QUEUE_NAME,
  SCHEDULED_AUTOMATIONS_REPEAT_JOB_ID,
  PROCESS_AI_AUTOMATION_JOB,
  PROCESS_EMAIL_DISPATCH_JOB,
  RECOVER_AI_AUTOMATIONS_JOB,
  RECOVER_EMAIL_DISPATCHES_JOB,
  RECOVER_EMAIL_DISPATCHES_REPEAT_JOB_ID
} from './automation-queue.service';

const DISPATCH_ID = '22222222-2222-4222-8222-222222222222';

/**
 * Constroi a instancia sem passar pelo construtor real (que cria uma BullMQ Queue/conexao
 * ioredis de verdade) — o gate pede o worker/fila testados com Queue/Worker mockados, nao
 * contra um Valkey real em teste unitario. `queue` e substituido por um fake com o mesmo
 * formato usado por AutomationQueueService.enqueue (so o metodo `.add`).
 */
function buildServiceWithFakeQueue(queue: {
  add: (name: string, payload: unknown, options?: unknown) => Promise<unknown>;
}): AutomationQueueService {
  const instance = Object.create(AutomationQueueService.prototype) as AutomationQueueService;
  (instance as unknown as { logger: Logger }).logger = new Logger('test');
  (instance as unknown as { queue: unknown }).queue = queue;
  return instance;
}

void test('AutomationQueueService.enqueueEmailDispatch publica so o id do outbox, sem retentativa no BullMQ', async () => {
  const calls: unknown[] = [];
  const service = buildServiceWithFakeQueue({ add: async (name, payload, options) => calls.push({ name, payload, options }) });

  await service.enqueueEmailDispatch('db-1', DISPATCH_ID);

  const call = calls[0] as { name: string; payload: unknown; options: Record<string, unknown> };
  assert.equal(call.name, PROCESS_EMAIL_DISPATCH_JOB);
  assert.deepEqual(call.payload, { databaseRef: 'db-1', dispatchId: DISPATCH_ID });
  // Retentativa e do banco; job falho nao fica guardado para nao bloquear o mesmo jobId.
  assert.deepEqual(call.options, { jobId: `email-${DISPATCH_ID}`, attempts: 1, removeOnComplete: true, removeOnFail: true });
  assert.equal(KANBAN_AUTOMATION_QUEUE_NAME, 'kanban-column-automation');
});

void test('AutomationQueueService.enqueueEmailDispatch nunca lanca com Valkey indisponivel (a varredura republica)', async () => {
  const service = buildServiceWithFakeQueue({
    add: async () => {
      throw new Error('Valkey connection refused');
    }
  });

  await assert.doesNotReject(() => service.enqueueEmailDispatch('db-1', DISPATCH_ID));
});

void test('AutomationQueueService.enqueueAiOutbox uses the outbox id as BullMQ deduplication key', async () => {
  const calls: unknown[] = [];
  const service = buildServiceWithFakeQueue({ add: async (name, payload, options) => calls.push({ name, payload, options }) });
  await service.enqueueAiOutbox('db-ref', '11111111-1111-4111-8111-111111111111');
  const call = calls[0] as { name: string; payload: unknown; options: { jobId: string } };
  assert.equal(call.name, PROCESS_AI_AUTOMATION_JOB);
  assert.deepEqual(call.payload, { databaseRef: 'db-ref', outboxId: '11111111-1111-4111-8111-111111111111' });
  assert.equal(call.options.jobId, 'ai-11111111-1111-4111-8111-111111111111');
});

void test('AutomationQueueService registers the daily repeatable job on module init with a fixed jobId (dedup-safe across boots)', async () => {
  const calls: unknown[] = [];
  const queue = {
    add: async (name: string, payload: unknown, options: unknown) => {
      calls.push({ name, payload, options });
    }
  };
  const service = buildServiceWithFakeQueue(queue);

  await service.onModuleInit();
  await service.onModuleInit();

  assert.equal(calls.length, 6, 'each boot registers the daily evaluator and the minute AI/e-mail recoveries; BullMQ dedups them');
  const typed = calls as Array<{ name: string; options: { jobId: string; attempts?: number; repeat: { pattern: string; tz: string } } }>;
  assert.equal(typed.filter(call => call.name === EVALUATE_SCHEDULED_AUTOMATIONS_JOB).length, 2);
  assert.equal(typed.filter(call => call.name === RECOVER_AI_AUTOMATIONS_JOB).length, 2);
  assert.equal(typed.filter(call => call.name === RECOVER_EMAIL_DISPATCHES_JOB).length, 2);
  assert.ok(typed.some(call => call.options.jobId === RECOVER_EMAIL_DISPATCHES_REPEAT_JOB_ID && call.options.repeat.pattern === '*/1 * * * *'));
  assert.equal(typed.find(call => call.name === EVALUATE_SCHEDULED_AUTOMATIONS_JOB)?.options.attempts, 3);
  assert.ok(typed.some(call => call.options.jobId === SCHEDULED_AUTOMATIONS_REPEAT_JOB_ID));
  assert.ok(typed.every(call => call.options.repeat.tz === 'America/Sao_Paulo'));
});
