import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { OpenAIProviderAdapter } from './openai-provider.adapter';
import { OpenAIExecutionAdapter } from './openai-execution.adapter';
import { ToolCatalog } from '../tools/tool-catalog';

void test('OpenAI metadata validation isolates credentials and sanitizes authentication, permission and transient failures', async () => {
  const original = globalThis.fetch;
  try {
    for (const [status, code] of [[401, 'ai_credential_invalid'], [403, 'ai_provider_permission_denied'], [429, 'ai_provider_rate_limited'], [500, 'ai_provider_unavailable']] as const) {
      let calls = 0;
      globalThis.fetch = async (url, init) => {
        calls++;
        assert.equal(String(url), 'https://api.openai.com/v1/models');
        assert.equal(init?.redirect, 'error');
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('authorization'), 'Bearer unit-openai-canary');
        assert.equal(headers.has('x-api-key'), false);
        assert.equal(headers.has('openai-organization'), false);
        assert.equal(headers.has('openai-project'), false);
        return new Response('sensitive-provider-error-canary', { status });
      };
      await assert.rejects(() => new OpenAIProviderAdapter().models('unit-openai-canary'), error => {
        assert.equal(JSON.stringify(error).includes('canary'), false);
        return String(error).includes(code);
      });
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = original; }
});

void test('OpenAI Responses request uses structured output, no storage and no retry of paid inference', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(String(url), 'https://api.openai.com/v1/responses');
      assert.equal(init?.redirect, 'error');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.store, false);
      assert.equal(body.instructions, 'unit-system');
      assert.equal(body.max_output_tokens, 4096);
      assert.equal(body.text.format.type, 'json_schema');
      assert.equal(body.text.format.strict, true);
      assert.equal(body.tools, undefined);
      return new Response('unit-sensitive-canary', { status: 401 });
    };
    await assert.rejects(() => new OpenAIExecutionAdapter().execute({ apiKey: 'unit-key', model: 'unit-model', systemPrompt: 'unit-system', input: {}, outputSchema: { type: 'object' } }), /ai_credential_invalid/);
    assert.equal(calls, 1);
    await assert.rejects(() => new OpenAIExecutionAdapter().execute({ apiKey: 'unit-key', model: 'unit-model', systemPrompt: 'unit-system', input: {}, outputSchema: { type: 'invalid' } }), /ai_output_schema_invalid/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

void test('OpenAI text mode omits JSON schema and returns plain text', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.text, undefined);
      return new Response(JSON.stringify({
        id: 'resp_unit',
        object: 'response',
        status: 'completed',
        output: [{
          id: 'msg_unit',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'plain response', annotations: [], logprobs: [] }],
        }],
        usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const result = await new OpenAIExecutionAdapter().execute({
      apiKey: 'unit-key',
      model: 'unit-model',
      systemPrompt: 'unit-system',
      input: { message: 'unit' },
      responseMode: 'text',
    });
    assert.equal(result.output, 'plain response');
    assert.equal(result.inputTokens, 4);
    assert.equal(result.outputTokens, 2);
  } finally { globalThis.fetch = original; }
});

void test('OpenAI tool request is allowlisted, strict, single-call and locally validated', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.tools.length, 1);
      assert.equal(body.tools[0].name, 'kanban_card_append_activity');
      assert.equal(body.tools[0].strict, true);
      assert.equal(body.tools[0].parameters.additionalProperties, false);
      assert.equal(body.parallel_tool_calls, false);
      return new Response(JSON.stringify({
        id: 'resp_tool',
        object: 'response',
        status: 'completed',
        output: [{
          id: 'call_unit',
          type: 'function_call',
          call_id: 'call_unit',
          name: 'kanban_card_append_activity',
          arguments: JSON.stringify({ text: 'Analise concluida.' }),
          status: 'completed',
        }],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const [tool] = new ToolCatalog().requireAllowed(['kanban.card.append_activity']);
    const result = await new OpenAIExecutionAdapter().execute({
      apiKey: 'unit-key',
      model: 'unit-model',
      systemPrompt: 'unit-system',
      input: { cardId: 'unit' },
      responseMode: 'text',
      tools: [tool],
    });
    assert.deepEqual(result.toolCalls, [{
      callId: 'call_unit',
      toolId: 'kanban.card.append_activity',
      arguments: { text: 'Analise concluida.' },
    }]);
    assert.equal(result.output, null);
  } finally { globalThis.fetch = original; }
});

void test('OpenAI tool request rejects unknown functions and invalid arguments', async () => {
  const original = globalThis.fetch;
  try {
    const [tool] = new ToolCatalog().requireAllowed(['kanban.card.append_activity']);
    for (const [name, args, code] of [
      ['untrusted_function', { text: 'x' }, 'ai_tool_not_allowed'],
      ['kanban_card_append_activity', { unexpected: true }, 'ai_tool_arguments_invalid'],
    ] as const) {
      globalThis.fetch = async () => new Response(JSON.stringify({
        id: 'resp_tool_invalid', object: 'response', status: 'completed',
        output: [{ id: 'call_invalid', type: 'function_call', call_id: 'call_invalid', name, arguments: JSON.stringify(args), status: 'completed' }],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
      await assert.rejects(() => new OpenAIExecutionAdapter().execute({
        apiKey: 'unit-key', model: 'unit-model', systemPrompt: 'unit-system', input: {}, responseMode: 'text', tools: [tool],
      }), new RegExp(code));
    }
  } finally { globalThis.fetch = original; }
});
