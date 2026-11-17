import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { EmailDispatchSchedulerService } from './email-dispatch-scheduler.service';
import { sumBacklog } from './email-dispatch-metrics';
import { DispatchBacklog } from './dispatch-log.repository';
import { ScheduledAutomationEvaluatorService } from './scheduled-automation-evaluator.service';

const TENANTS = [
  { databaseRef: 'db-a', clientId: 'client-a' },
  { databaseRef: 'db-b', clientId: 'client-b' }
];

void test('varredura: recupera, republica o vencido e mede o backlog; falha de um tenant nao para os demais', async () => {
  const published: string[] = [];
  let measured: DispatchBacklog | null = null;
  const service = new EmailDispatchSchedulerService(
    { listActiveFlowTenants: async () => TENANTS } as never,
    {
      recoverRecent: async (ref: string) => {
        if (ref === 'db-a') throw new Error('tenant a down');
        return 1;
      },
      listDue: async () => ['d1', 'd2'],
      backlog: async () => ({ pending: 2, processing: 0, failed: 1, oldestPendingAt: '2026-10-17T10:00:00.000Z' })
    } as never,
    { enqueueEmailDispatch: async (ref: string, id: string) => published.push(`${ref}:${id}`) } as never,
    { setBacklog: (backlog: DispatchBacklog) => (measured = backlog) } as never
  );

  await service.recoverAndEnqueue();

  assert.deepEqual(published, ['db-b:d1', 'db-b:d2']);
  assert.deepEqual(measured, { pending: 2, processing: 0, failed: 1, oldestPendingAt: '2026-10-17T10:00:00.000Z' });
});

void test('backlog somado: pendente mais antigo e o menor entre tenants', () => {
  assert.deepEqual(
    sumBacklog([
      { pending: 1, processing: 0, failed: 2, oldestPendingAt: '2026-10-17T10:00:00.000Z' },
      { pending: 3, processing: 1, failed: 0, oldestPendingAt: '2026-10-17T09:00:00.000Z' },
      { pending: 0, processing: 0, failed: 0, oldestPendingAt: null }
    ]),
    { pending: 4, processing: 1, failed: 2, oldestPendingAt: '2026-10-17T09:00:00.000Z' }
  );
  assert.deepEqual(sumBacklog([]), { pending: 0, processing: 0, failed: 0, oldestPendingAt: null });
});

void test('avaliacao diaria grava as intencoes do dia no outbox e lanca no fim se um tenant falhou', async () => {
  const recorded: Array<{ ref: string; date: string; intents: unknown[] }> = [];
  const evaluator = new ScheduledAutomationEvaluatorService(
    {
      listActiveFlowTenants: async () => TENANTS,
      findDueDateApproachingCandidates: async (ref: string) => {
        if (ref === 'db-a') throw new Error('tenant a down');
        return [{ ruleId: 'r1', cardId: 'c1', boardColumnId: 'col', boardId: 'b' }];
      },
      findCardStaleCandidates: async () => [{ ruleId: 'r2', cardId: 'c2', boardColumnId: 'col', boardId: 'b' }]
    } as never,
    {
      recordScheduled: async (ref: string, _clientId: string, date: string, intents: unknown[]) => {
        recorded.push({ ref, date, intents });
      }
    } as never
  );

  await assert.rejects(() => evaluator.evaluateAndEnqueue(), /scheduled_automations_failed_tenants:1/);
  assert.equal(recorded.length, 1, 'tenant b gravado mesmo com a falha do tenant a');
  assert.equal(recorded[0].ref, 'db-b');
  assert.match(recorded[0].date, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(recorded[0].intents, [
    { automationRuleId: 'r1', cardId: 'c1', boardColumnId: 'col' },
    { automationRuleId: 'r2', cardId: 'c2', boardColumnId: 'col' }
  ]);
});
