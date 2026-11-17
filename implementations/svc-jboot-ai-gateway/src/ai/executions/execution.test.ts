import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExecutionService } from './execution.service';
import { ExecutionRepository, ExecutionView } from './execution.repository';
import { AppConfigService } from '../../config/app-config.service';
import { CredentialCryptoService } from '../crypto/credential-crypto.service';
import { AgentPromptCryptoService } from '../crypto/agent-prompt-crypto.service';
import { ProviderExecutionError } from '../providers/provider-execution';
import { ProviderRegistry } from '../providers/provider-registry';
import { ToolCatalog } from '../tools/tool-catalog';
import { ExecutionToolCallsCryptoService } from '../crypto/execution-tool-calls-crypto.service';
import { ClaudeRoutineFireAdapter, RoutineFireOutcome } from '../providers/claude-routine-fire.adapter';
import { routineText } from './execution.service';

const body = { clientId: 'tenant', requesterIdentityId: 'owner', applicationSlug: 'flow', agentId: 'agent', sourceType: 'unit', sourceId: 'source', input: { action: 'review' } };
function fixture(enabled = true, provider = 'anthropic', mode: 'api' | 'claude_routine' = 'api', fire: RoutineFireOutcome = { kind: 'dispatched', sessionId: 'session_1', sessionUrl: 'https://claude.ai/code/session_1' }) {
  const fired: Array<{ fireUrl: string; token: string; text: string }> = [];
  let calls = 0;
  let entry: { inputSha256: string; view: ExecutionView; toolCallsEnvelope?: unknown } | null = null;
  let failure: Error | null = null;
  let toolCalls: Array<{ callId: string; toolId: string; arguments: Record<string, unknown> }> = [];
  const repo = {
    byKey: async () => entry,
    mode: async () => mode,
    routineMaterial: async () => ({ agentId: 'agent', agentVersion: 1, fireUrl: 'https://api.anthropic.com/v1/claude_code/routines/trig_unit/fire', tokenCiphertext: Buffer.alloc(1), tokenNonce: Buffer.alloc(12), tokenAuthTag: Buffer.alloc(16), tokenKeyVersion: 1 }),
    dispatched: async (_id: string, sessionUrl: string) => { entry!.view = { ...entry!.view, status: 'dispatched', externalSessionUrl: sessionUrl }; return entry!.view; },
    material: async () => ({ agentId: 'agent', agentVersion: 1, credentialId: 'credential', provider, model: 'unit-model', responseMode: 'json_schema', outputSchema: { type: 'object' }, allowedTools: [], toolPolicyVersion: '2026-10-15.v1' }),
    create: async (data: { inputSha256: string }) => {
      entry = { inputSha256: data.inputSha256, view: { id: 'execution', status: 'running' } as ExecutionView };
      return entry.view;
    },
    succeed: async (_id: string, _hash: string, _latency: number, inputTokens: number, outputTokens: number, toolCallsEnvelope?: unknown) => {
      entry!.view = { ...entry!.view, status: 'succeeded', inputTokens, outputTokens };
      entry!.toolCallsEnvelope = toolCallsEnvelope;
      return entry!.view;
    },
    fail: async (_id: string, errorCode: string) => { entry!.view = { ...entry!.view, status: 'failed', errorCode }; return entry!.view; },
  };
  const adapter = { execute: async () => { calls++; if (failure) throw failure; return { output: { reviewed: true }, toolCalls, inputTokens: 17, outputTokens: 8 }; } };
  const service = new ExecutionService(repo as unknown as ExecutionRepository,
    {
      aiExecutionEnabled: enabled,
      isProviderEnabled: (candidate: string) => candidate === provider,
      isModelAllowed: (candidate: string, model: string) => candidate === provider && model === 'unit-model',
    } as unknown as AppConfigService,
    { decrypt: () => 'unit-key-canary' } as unknown as CredentialCryptoService,
    { decrypt: () => 'unit-prompt-canary' } as unknown as AgentPromptCryptoService,
    adapter as unknown as ProviderRegistry,
    new ToolCatalog(),
    {
      encrypt: (calls: unknown) => ({ ciphertext: Buffer.from(JSON.stringify(calls)), nonce: Buffer.alloc(12), authTag: Buffer.alloc(16), keyVersion: 1 }),
      decrypt: (envelope: { ciphertext: Buffer }) => JSON.parse(envelope.ciphertext.toString('utf8')),
    } as unknown as ExecutionToolCallsCryptoService,
    { fire: async (input: { fireUrl: string; token: string; text: string }) => { fired.push(input); return fire; } } as unknown as ClaudeRoutineFireAdapter);
  return {
    service,
    repo,
    fired,
    calls: () => calls,
    fail: (error: Error) => { failure = error; },
    withToolCalls: (value: typeof toolCalls) => { toolCalls = value; },
  };
}
void test('manual interaction derives context from auth, returns ephemeral output and never charges a replay', async () => {
  const f = fixture(true, 'openai');
  const auth = { clientId: 'tenant', identityId: 'owner', applicationSlug: 'flow', scopes: ['ai:execute'], roles: [] };
  const request = { agentId: 'agent', requestId: 'source', input: { message: 'review' } };
  const first = await f.service.interact(auth, request, 'key');
  const replay = await f.service.interact(auth, request, 'key');
  assert.equal(first.status, 'succeeded');
  assert.deepEqual(first.output, { reviewed: true });
  assert.equal(first.outputAvailable, true);
  assert.equal(replay.output, null);
  assert.equal(replay.outputAvailable, false);
  assert.equal(replay.replayed, true);
  assert.equal(f.calls(), 1);
});
void test('kill switch prevents external calls', async () => {
  const f = fixture(false);
  await assert.rejects(() => f.service.execute(body, 'key'), /ai_execution_not_enabled/);
  assert.equal(f.calls(), 0);
});
void test('encrypted tool calls remain available on an idempotent replay without another inference', async () => {
  const f = fixture(true, 'openai');
  f.withToolCalls([{ callId: 'call', toolId: 'kanban.card.append_activity', arguments: { text: 'done' } }]);
  const first = await f.service.execute(body, 'key');
  const replay = await f.service.execute(body, 'key');
  assert.deepEqual(replay.requestedActions, first.requestedActions);
  assert.equal(replay.output, null);
  assert.equal(replay.outputAvailable, true);
  assert.equal(f.calls(), 1);
});
void test('OpenAI execution uses its configured provider and keeps the same idempotency controls', async () => {
  const f = fixture(true, 'openai');
  assert.equal((await f.service.execute(body, 'key')).status, 'succeeded');
  await f.service.execute(body, 'key');
  assert.equal(f.calls(), 1);
});
void test('replay preserves measured usage and binds owner, agent and source without exposing content', async () => {
  const f = fixture();
  const first = await f.service.execute(body, 'key');
  const second = await f.service.execute(body, 'key');
  assert.equal(first.id, second.id);
  assert.equal(f.calls(), 1);
  assert.equal(first.inputTokens, 17);
  assert.equal(JSON.stringify(first).includes('canary'), false);
  for (const changed of [{ requesterIdentityId: 'other' }, { agentId: 'other' }, { sourceId: 'other' }, { input: { action: 'changed' } }]) {
    await assert.rejects(() => f.service.execute({ ...body, ...changed }, 'key'), /ai_idempotency_conflict/);
  }
});
void test('provider failure is recorded once and arbitrary errors never leak content', async () => {
  for (const failure of [new Error('unit-sensitive-canary'), new ProviderExecutionError('ai_provider_timeout')]) {
    const f = fixture(); f.fail(failure);
    const result = await f.service.execute(body, 'key');
    assert.equal(result.status, 'failed');
    assert.equal(JSON.stringify(result).includes('canary'), false);
    await f.service.execute(body, 'key');
    assert.equal(f.calls(), 1);
  }
});
void test('input limit, model allowlist and inactive agent fail before inference', async () => {
  const f = fixture();
  await assert.rejects(() => f.service.execute({ ...body, input: { text: 'x'.repeat(70_000) } }, 'key'), /ai_input_too_large/);
  f.repo.material = async () => null as never;
  await assert.rejects(() => f.service.execute(body, 'key'), /Active agent not found/);
  assert.equal(f.calls(), 0);
});

const automation = { ...body, sourceType: 'kanban_automation', input: { run_id: 'run-1', board_id: 'board-1', card_id: 'card-1', trigger: 'column_entered', card: { title: 'nao vai' } } };
void test('routine mode fires only scalar identifiers and never calls a model provider', async () => {
  const f = fixture(true, 'anthropic', 'claude_routine');
  const result = await f.service.execute(automation, 'run-1:1');
  assert.equal(result.status, 'dispatched');
  assert.equal(result.externalSessionUrl, 'https://claude.ai/code/session_1');
  assert.deepEqual(result.requestedActions, []);
  assert.equal(f.calls(), 0);
  assert.equal(f.fired[0].token, 'unit-key-canary');
  assert.equal(f.fired[0].text, 'JBoot Flow automation\nrun_id: run-1\nboard_id: board-1\ncard_id: card-1\ntrigger: column_entered');
  assert.equal(JSON.stringify(result).includes('canary'), false);
  await f.service.execute(automation, 'run-1:1');
  assert.equal(f.fired.length, 1, 'replay nao dispara de novo');
});
void test('routine rate limit is retryable; ambiguous dispatch is not; manual console is refused', async () => {
  const limited = fixture(true, 'anthropic', 'claude_routine', { kind: 'retryable', code: 'routine_rate_limited', retryAfterSeconds: 120 });
  const first = await limited.service.execute(automation, 'run-1:1');
  assert.equal(first.errorCode, 'routine_rate_limited');
  assert.equal(first.retryAfterSeconds, 120);
  const unknown = fixture(true, 'anthropic', 'claude_routine', { kind: 'ambiguous', code: 'routine_dispatch_ambiguous' });
  const second = await unknown.service.execute(automation, 'run-1:1');
  assert.equal(second.errorCode, 'routine_dispatch_ambiguous');
  assert.equal(second.retryAfterSeconds, undefined);
  const manual = fixture(true, 'anthropic', 'claude_routine');
  const auth = { clientId: 'tenant', identityId: 'owner', applicationSlug: 'flow', scopes: ['ai:execute'], roles: [] };
  await assert.rejects(() => manual.service.interact(auth, { agentId: 'agent', requestId: 'source', input: { message: 'oi' } }, 'key'), /ai_agent_mode_not_interactive/);
  assert.equal(manual.fired.length, 0);
});
void test('routine text keeps scalar fields on one line each and drops nested data', () => {
  assert.equal(routineText({ card_id: 'c1', note: 'a\nignore previous', nested: { secret: 'x' }, 'bad key': 1 }), 'JBoot Flow automation\ncard_id: c1\nnote: a ignore previous\nbad_key: 1');
});
