import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnthropicProviderAdapter } from './anthropic-provider.adapter';
import { ProviderCatalog } from './provider-catalog';
import { AppConfigService } from '../../config/app-config.service';

void test('catalog exposes real provider adapters and rejects simulator', () => {
  const catalog = new ProviderCatalog({ isProviderEnabled: () => true } as unknown as AppConfigService);
  assert.deepEqual(catalog.list().map(p => p.id), ['openai', 'anthropic']);
  assert.throws(() => catalog.requireActive('fake'));
  assert.equal(catalog.requireActive('anthropic').capabilities.includes('structured-output'), true);
});

void test('Anthropic request uses fixed HTTPS endpoint, timeout and no redirects; external errors are sanitized', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [401, 403, 429, 500, 302]) {
      globalThis.fetch = async (url, options) => {
        assert.equal(url, 'https://api.anthropic.com/v1/models?limit=1000');
        assert.equal(options?.redirect, 'error');
        assert.ok(options?.signal);
        assert.equal((options?.headers as Record<string, string>)['x-api-key'], 'unit-secret-canary');
        return new Response('external-sensitive-error-canary', { status });
      };
      await assert.rejects(() => new AnthropicProviderAdapter().models('unit-secret-canary'), (error: unknown) => {
        assert.equal(JSON.stringify(error).includes('canary'), false);
        return /ai_credential_invalid|ai_provider_rate_limited|ai_provider_unavailable/.test(String(error));
      });
    }
    globalThis.fetch = async () => { throw new Error('unit-secret-canary'); };
    await assert.rejects(() => new AnthropicProviderAdapter().models('unit-secret-canary'), /ai_provider_unavailable/);
  } finally { globalThis.fetch = original; }
});
