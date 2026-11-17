import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnthropicExecutionAdapter } from './anthropic-execution.adapter';

void test('invalid local schema fails without contacting provider', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('must not contact provider'); };
  try {
    await assert.rejects(() => new AnthropicExecutionAdapter().execute({ apiKey: 'unit-key', model: 'unit-model', systemPrompt: 'unit', input: {}, outputSchema: { type: 'not-a-type' } }), /ai_output_schema_invalid/);
  } finally { globalThis.fetch = original; }
});
void test('SDK authentication failures are sanitized and requests cannot redirect or override the endpoint', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), 'https://api.anthropic.com/v1/messages');
    assert.equal(init?.redirect, 'error');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.max_tokens, 4096);
    assert.equal(body.system, 'unit-system-canary');
    assert.equal(body.tools, undefined);
    assert.deepEqual(body.output_config, { format: { type: 'json_schema', schema: { type: 'object' } } });
    return new Response('sensitive-provider-error-canary', { status: 401 });
  };
  try {
    await assert.rejects(() => new AnthropicExecutionAdapter().execute({ apiKey: 'unit-key-canary', model: 'unit-model', systemPrompt: 'unit-system-canary', input: {}, outputSchema: { type: 'object' } }), error => {
      assert.equal(String(error).includes('canary'), false);
      return /ai_credential_invalid/.test(String(error));
    });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

void test('Anthropic text mode omits JSON schema and returns plain text', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.output_config, undefined);
      return new Response(JSON.stringify({
        id: 'msg_unit',
        type: 'message',
        role: 'assistant',
        model: 'unit-model',
        content: [{ type: 'text', text: 'plain response' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 3, output_tokens: 2 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const result = await new AnthropicExecutionAdapter().execute({
      apiKey: 'unit-key',
      model: 'unit-model',
      systemPrompt: 'unit-system',
      input: { message: 'unit' },
      responseMode: 'text',
    });
    assert.equal(result.output, 'plain response');
    assert.equal(result.inputTokens, 3);
    assert.equal(result.outputTokens, 2);
  } finally { globalThis.fetch = original; }
});
