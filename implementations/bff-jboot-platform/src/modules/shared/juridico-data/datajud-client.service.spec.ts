import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DataJudClientService } from './datajud-client.service';

void test('uses Identity service token and never forwards a user token', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith('/auth/service-token')) {
      return new Response(JSON.stringify({ accessToken: 's2s-token', tokenType: 'Bearer', expiresIn: 120 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ items: [], total: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const client = new DataJudClientService({
      juridicoDataServiceUrl: 'http://data:8030',
      identityServiceUrl: 'http://identity:8000',
      platformServiceClientId: 'platform-api',
      platformServiceClientSecret: 'secret',
    } as never);
    assert.deepEqual(await client.listTribunals(), { items: [], total: 0 });
    assert.equal(requests.length, 2);
    assert.equal(new Headers(requests[1].init?.headers).get('Authorization'), 'Bearer s2s-token');
    assert.doesNotMatch(JSON.stringify(requests[1]), /user-token/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

void test('consulta em segundo plano envia o modo e espera mais que a da tela', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith('/auth/service-token')) {
      return new Response(JSON.stringify({ accessToken: 's2s-token', tokenType: 'Bearer', expiresIn: 120 }), { status: 200 });
    }
    return new Response(JSON.stringify({ requestId: 'r', capturedAt: 'c', process: {} }), { status: 200 });
  }) as typeof fetch;
  try {
    const client = new DataJudClientService({
      juridicoDataServiceUrl: 'http://data:8030',
      identityServiceUrl: 'http://identity:8000',
      platformServiceClientId: 'platform-api',
      platformServiceClientSecret: 'secret',
    } as never);
    await client.queryProcess({ numeroProcesso: '00012340820238260100' }, 'req-1', { background: true });
    await client.queryProcess({ numeroProcesso: '00012340820238260100' }, 'req-2');
    const [background, interactive] = requests.filter((request) => request.url.endsWith('/processos/consulta'));
    assert.equal(new Headers(background.init?.headers).get('X-JBoot-Query-Mode'), 'background');
    assert.equal(new Headers(interactive.init?.headers).get('X-JBoot-Query-Mode'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
