import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AiAutomationProcessorService } from './ai-automation-processor.service';
import { AUTOMATION_COMPLETION, AUTOMATION_COMPLETION_INSTRUCTIONS } from './automation-completion';

const row = {
  id: 'outbox', clientId: 'client', automationRuleId: 'rule', boardId: 'board', boardColumnId: 'column',
  cardId: 'card', sourceActivityId: 'activity', requesterIdentityId: 'owner', agentId: 'agent',
  triggerType: 'column_entered' as const,
  actionConfig: { connectionMode: 'api_key', inputPolicyVersion: 1, toolPolicyVersion: '2026-10-15.v1' },
  status: 'processing' as const, attemptCount: 1, aiExecutionId: null,
};

function fixture(toolId: string, args: Record<string, unknown>, complete = false) {
  const calls: string[] = [];
  const outbox = {
    claim: async () => row,
    snapshot: async () => ({ card: { id: 'card', title: 'Card' }, event: { kind: 'card.moved' } }),
    markCompleted: async () => { calls.push('completed'); },
    markAwaitingConfirmation: async () => { calls.push('awaiting'); },
    markReviewRequired: async () => { calls.push('review'); },
    markFailed: async (_d: string, _id: string, code: string) => { calls.push(`failed:${code}`); },
    releaseForRetry: async () => { calls.push('retry'); },
  };
  const gateway = { execute: async () => ({ id: 'execution', status: 'succeeded', errorCode: null, requestedActions: [
    { callId: 'call', toolId, arguments: args }, ...(complete ? [{ callId: 'complete', toolId: 'kanban.automation.complete', arguments: AUTOMATION_COMPLETION }] : [])
  ] }) };
  const activities = {
    createAiComment: async () => { calls.push('comment'); },
    createAiReviewRequest: async () => { calls.push('review-event'); },
  };
  return { service: new AiAutomationProcessorService(outbox as never, gateway as never, activities as never, {} as never), calls };
}

void test('AI automation executes only the locally revalidated automatic card activity tool', async () => {
  const f = fixture('kanban.card.append_activity', { text: 'Analise concluida.' });
  await f.service.process('database-ref', 'outbox');
  assert.deepEqual(f.calls, ['comment', 'awaiting']);
});

void test('API confirms only after all authorized effects and a final explicit success declaration', async () => {
  const f = fixture('kanban.card.append_activity', { text: 'Todas as tarefas concluidas.' }, true);
  await f.service.process('database-ref', 'outbox');
  assert.deepEqual(f.calls, ['comment', 'completed']);
});

void test('Pending human review never completes even with an explicit model declaration', async () => {
  const f = fixture('kanban.card.update_description', { description: 'Proposta' }, true);
  await f.service.process('database-ref', 'outbox');
  assert.deepEqual(f.calls, ['review-event', 'review']);
});

void test('Malformed completion, partial success and prose cannot trigger completion', async () => {
  for (const args of [{ allTasksCompleted: false }, { ...AUTOMATION_COMPLETION, status: 'failed' }, { text: 'sucesso' }]) {
    const f = fixture('kanban.automation.complete', args);
    await f.service.process('database-ref', 'outbox');
    assert.deepEqual(f.calls, ['failed:ai_completion_invalid']);
  }
});

void test('AI automation records a review request instead of mutating protected card text', async () => {
  const f = fixture('kanban.card.update_description', { description: 'Nova descricao' });
  await f.service.process('database-ref', 'outbox');
  assert.deepEqual(f.calls, ['review-event', 'review']);
});

void test('AI automation rejects tools outside the Kanban capability allowlist', async () => {
  const f = fixture('kanban.card.move', { columnId: 'other' });
  await f.service.process('database-ref', 'outbox');
  assert.deepEqual(f.calls, ['failed:ai_tool_not_authorized']);
});

// Modo claude_routine: so ids vao ao gateway; a rotina comenta pelo conector.
function routineFixture(
  response: Record<string, unknown>,
  dispatchAttempt = 1,
  petitions: { expectedResult?: string; preconditions?: { ok: boolean; code?: string } } = {}
) {
  const calls: string[] = [];
  const executed: Array<{ idempotencyKey: string; payload: Record<string, unknown> }> = [];
  const routineRow = {
    ...row,
    dispatchAttempt,
    actionConfig: {
      connectionMode: 'claude_routine', inputPolicyVersion: 1, toolPolicyVersion: 'claude_routine.v1',
      ...(petitions.expectedResult ? { expectedResult: petitions.expectedResult } : {}),
    },
  };
  const outbox = {
    claim: async () => routineRow,
    snapshot: async () => ({ card: { id: 'card', title: 'Card com CPF 000.000.001-91' }, event: { kind: 'card.moved' } }),
    markDispatched: async (_d: string, _id: string, executionId: string, sessionUrl: string | null) => { calls.push(`dispatched:${executionId}:${sessionUrl}`); },
    rescheduleRoutine: async (_d: string, _id: string, code: string, seconds: number) => { calls.push(`reschedule:${code}:${seconds}`); },
    markFailed: async (_d: string, _id: string, code: string) => { calls.push(`failed:${code}`); },
    markCompleted: async () => { calls.push('completed'); },
    releaseForRetry: async () => { calls.push('retry'); },
  };
  const gateway = { execute: async (input: { idempotencyKey: string; payload: Record<string, unknown> }) => { executed.push(input); return { id: 'execution', requestedActions: [], errorCode: null, ...response }; } };
  const activities = {
    createSystemEvent: async (_d: string, _c: string, _card: string, _who: string, kind: string, payload: { reason: string }) => {
      calls.push(`event:${kind}:${payload.reason}`);
    },
  };
  const preconditions = {
    evaluate: async () => { calls.push('preconditions'); return petitions.preconditions ?? { ok: true, context: {} }; },
  };
  return {
    service: new AiAutomationProcessorService(outbox as never, gateway as never, activities as never, preconditions as never),
    calls,
    executed,
  };
}

void test('claude_routine: envia so identificadores e aguarda o conector (dispatched)', async () => {
  const f = routineFixture({ status: 'dispatched', externalSessionUrl: 'https://claude.ai/code/session_1' });
  await f.service.process('database-ref', 'outbox');
  assert.deepEqual(f.calls, ['dispatched:execution:https://claude.ai/code/session_1']);
  assert.equal(f.executed[0].idempotencyKey, 'kanban-ai-outbox:routine:1');
  assert.deepEqual(f.executed[0].payload, { run_id: 'outbox', board_id: 'board', card_id: 'card', trigger: 'column_entered', completion_instructions: AUTOMATION_COMPLETION_INSTRUCTIONS });
  assert.doesNotMatch(JSON.stringify(f.executed[0]), /051\.030|Card com/);
});

void test('claude_routine: limite reagenda com chave nova; ambiguo e excesso de tentativas falham', async () => {
  const limited = routineFixture({ status: 'failed', errorCode: 'routine_rate_limited', retryAfterSeconds: 90 });
  await limited.service.process('database-ref', 'outbox');
  assert.deepEqual(limited.calls, ['reschedule:routine_rate_limited:90']);
  const exhausted = routineFixture({ status: 'failed', errorCode: 'routine_rate_limited', retryAfterSeconds: 90 }, 5);
  await exhausted.service.process('database-ref', 'outbox');
  assert.equal(exhausted.executed[0].idempotencyKey, 'kanban-ai-outbox:routine:5');
  assert.deepEqual(exhausted.calls, ['failed:routine_rate_limited']);
  const ambiguous = routineFixture({ status: 'failed', errorCode: 'routine_dispatch_ambiguous' });
  await ambiguous.service.process('database-ref', 'outbox');
  assert.deepEqual(ambiguous.calls, ['failed:routine_dispatch_ambiguous']);
});

void test('peticoes iniciais: pre-condicao falhando encerra antes de chamar a rotina, com o motivo no card (ADR 020)', async () => {
  const blocked = routineFixture({ status: 'dispatched' }, 1, {
    expectedResult: 'initial_petitions',
    preconditions: { ok: false, code: 'prior_lawsuits_missing' },
  });
  await blocked.service.process('database-ref', 'outbox');
  assert.deepEqual(blocked.calls, ['preconditions', 'failed:prior_lawsuits_missing', 'event:card.automation_run_failed:prior_lawsuits_missing']);
  assert.equal(blocked.executed.length, 0, 'a rotina nao e chamada');

  const ready = routineFixture({ status: 'dispatched', externalSessionUrl: null }, 1, { expectedResult: 'initial_petitions' });
  await ready.service.process('database-ref', 'outbox');
  assert.deepEqual(ready.calls, ['preconditions', 'dispatched:execution:null']);

  const analysis = routineFixture({ status: 'dispatched', externalSessionUrl: null }, 1, { expectedResult: 'action_analysis' });
  await analysis.service.process('database-ref', 'outbox');
  assert.deepEqual(analysis.calls, ['dispatched:execution:null'], 'outros resultados nao checam');
});
