import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClaudeRoutineFireAdapter } from './claude-routine-fire.adapter';

const FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_01ABCDEFGHJKLMNOPQRSTUVW/fire';
const TOKEN = 'sk-ant-oat01-unitroutinetokencanary0123';

function adapter(response: Response | Error) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const instance = new ClaudeRoutineFireAdapter();
  instance.useFetcher(async (url, init) => {
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    return response;
  });
  return { instance, calls };
}

void test('fires with the routine token, fixed version header and no redirects', async () => {
  const { instance, calls } = adapter(new Response(JSON.stringify({ type: 'routine_fire', claude_code_session_id: 'session_01', claude_code_session_url: 'https://claude.ai/code/session_01' })));
  const outcome = await instance.fire({ fireUrl: FIRE_URL, token: TOKEN, text: 'card_id: 1' });
  assert.deepEqual(outcome, { kind: 'dispatched', sessionId: 'session_01', sessionUrl: 'https://claude.ai/code/session_01' });
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(headers['anthropic-version'], '2023-06-01');
  assert.equal(calls[0].init.redirect, 'error');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { text: 'card_id: 1' });
});

void test('rejects foreign urls and malformed tokens without any request', async () => {
  const { instance, calls } = adapter(new Response('{}'));
  for (const input of [
    { fireUrl: 'https://attacker.example/v1/claude_code/routines/trig_1/fire', token: TOKEN },
    { fireUrl: 'http://api.anthropic.com/v1/claude_code/routines/trig_1/fire', token: TOKEN },
    { fireUrl: FIRE_URL, token: 'sk-ant-api03-not-a-routine-token-0000' },
  ]) {
    assert.deepEqual(await instance.fire({ ...input, text: '' }), { kind: 'rejected', code: 'routine_invalid_request' });
  }
  assert.equal(calls.length, 0);
});

void test('maps documented error statuses; only 429 and 503 are retryable', async () => {
  const cases: Array<[number, string, string]> = [
    [400, 'rejected', 'routine_invalid_request'],
    [401, 'rejected', 'routine_token_invalid'],
    [403, 'rejected', 'routine_forbidden'],
    [404, 'rejected', 'routine_not_found'],
    [429, 'retryable', 'routine_rate_limited'],
    [503, 'retryable', 'routine_overloaded'],
    [500, 'ambiguous', 'routine_dispatch_ambiguous'],
  ];
  for (const [status, kind, code] of cases) {
    const { instance } = adapter(new Response('{}', { status, headers: { 'retry-after': '90' } }));
    const outcome = await instance.fire({ fireUrl: FIRE_URL, token: TOKEN, text: '' });
    assert.equal(outcome.kind, kind, String(status));
    assert.equal('code' in outcome ? outcome.code : '', code);
    if (outcome.kind === 'retryable') assert.equal(outcome.retryAfterSeconds, 90);
  }
});

void test('network failure and unreadable success are ambiguous (no idempotency on fire)', async () => {
  for (const response of [new TypeError('fetch failed'), new Response('not json'), new Response(JSON.stringify({ claude_code_session_url: 'https://attacker.example/x' }))]) {
    const { instance } = adapter(response);
    assert.deepEqual(await instance.fire({ fireUrl: FIRE_URL, token: TOKEN, text: '' }), { kind: 'ambiguous', code: 'routine_dispatch_ambiguous' });
  }
});
