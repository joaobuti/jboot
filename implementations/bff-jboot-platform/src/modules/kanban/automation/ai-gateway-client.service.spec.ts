import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AiGatewayClientService } from './ai-gateway-client.service';

void test('AI Gateway client uses service identity, delegated tenant headers and a stable idempotency key', async () => {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/auth/service-token')) {
        return new Response(JSON.stringify({ accessToken: 'service-token', expiresIn: 300 }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'execution', status: 'succeeded', errorCode: null, requestedActions: [] }), { status: 202 });
    };
    const client = new AiGatewayClientService({
      aiGatewayServiceUrl: 'http://ai-gateway.test', identityServiceUrl: 'http://identity.test',
      platformServiceClientId: 'platform-api', platformServiceClientSecret: 'unit-secret',
    } as never);
    await client.execute({
      clientId: '11111111-1111-4111-8111-111111111111',
      requesterIdentityId: '22222222-2222-4222-8222-222222222222',
      agentId: '33333333-3333-4333-8333-333333333333',
      sourceId: '44444444-4444-4444-8444-444444444444',
      idempotencyKey: 'kanban-ai-unit', payload: { card: { id: 'card' } },
    });
    assert.equal(calls.length, 2);
    const headers = new Headers(calls[1].init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer service-token');
    assert.equal(headers.get('idempotency-key'), 'kanban-ai-unit');
    assert.equal(headers.get('x-jboot-client-id'), '11111111-1111-4111-8111-111111111111');
    assert.equal(headers.get('x-jboot-application-slug'), 'flow');
    const body = JSON.parse(String(calls[1].init?.body));
    assert.equal(body.requesterIdentityId, '22222222-2222-4222-8222-222222222222');
    assert.equal(body.sourceType, 'kanban_automation');
  } finally { globalThis.fetch = original; }
});

void test('AI Gateway client sanitizes non-JSON upstream errors', async () => {
  const original = globalThis.fetch;
  try {
    let request = 0;
    globalThis.fetch = async () => {
      request++;
      if (request === 1) return new Response(JSON.stringify({ accessToken: 'token', expiresIn: 300 }), { status: 200 });
      return new Response('unit-sensitive-provider-canary', { status: 502 });
    };
    const client = new AiGatewayClientService({
      aiGatewayServiceUrl: 'http://ai-gateway.test', identityServiceUrl: 'http://identity.test',
      platformServiceClientId: 'platform-api', platformServiceClientSecret: 'unit-secret',
    } as never);
    await assert.rejects(
      () => client.execute({ clientId: 'c', requesterIdentityId: 'i', agentId: 'a', sourceId: 's', idempotencyKey: 'key', payload: {} }),
      error => !String(error).includes('canary') && String(error).includes('ai_gateway_rejected'),
    );
  } finally { globalThis.fetch = original; }
});
