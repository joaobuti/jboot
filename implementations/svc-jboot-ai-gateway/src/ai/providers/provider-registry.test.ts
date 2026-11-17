import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProviderRegistry } from './provider-registry';
import { AnthropicProviderAdapter } from './anthropic-provider.adapter';
import { AnthropicExecutionAdapter } from './anthropic-execution.adapter';
import { OpenAIProviderAdapter } from './openai-provider.adapter';
import { OpenAIExecutionAdapter } from './openai-execution.adapter';

void test('registry routes only to the selected provider and never silently falls back', async () => {
  const calls: string[] = [];
  const metadata = (provider: string) => ({ models: async (key: string) => { calls.push(`${provider}:${key}`); return []; } });
  const execution = (provider: string) => ({ execute: async () => { calls.push(`${provider}:execute`); return { output: {}, inputTokens: 0, outputTokens: 0 }; } });
  const registry = new ProviderRegistry(metadata('anthropic') as AnthropicProviderAdapter, execution('anthropic') as AnthropicExecutionAdapter, metadata('openai') as OpenAIProviderAdapter, execution('openai') as OpenAIExecutionAdapter);
  await registry.models('openai', 'unit-openai');
  await registry.models('anthropic', 'unit-anthropic');
  const input = { apiKey: 'unit', model: 'unit', systemPrompt: 'unit', input: {}, outputSchema: {} };
  await registry.execute('openai', input);
  assert.deepEqual(calls, ['openai:unit-openai', 'anthropic:unit-anthropic', 'openai:execute']);
  assert.throws(() => registry.models('unsupported', 'unit'));
  assert.throws(() => registry.execute('unsupported', input));
  assert.equal(calls.length, 3);
});
