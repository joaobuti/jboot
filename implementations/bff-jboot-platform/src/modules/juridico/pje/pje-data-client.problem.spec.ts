import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { HttpException } from '@nestjs/common';
import { PjeDataClientService } from './pje-data-client.service';

/**
 * Indisponibilidade da fonte oficial nao pode chegar a tela como falha
 * generica: o usuario conclui que o defeito e nosso quando o CNJ e que saiu do
 * ar, e nao ha nada a corrigir aqui.
 */
function clientAnswering(status: number, body: unknown) {
  const service = new PjeDataClientService({
    juridicoDataServiceUrl: 'http://data:8030',
    identityServiceUrl: 'http://identity:8000',
    platformServiceClientId: 'platform-api',
    platformServiceClientSecret: 'secret'
  } as never);
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes('/auth/service-token')) {
      return { ok: true, json: async () => ({ accessToken: 't', expiresIn: 300 }) } as never;
    }
    return { ok: false, status, json: async () => body } as never;
  }) as never;
  return service;
}

void test('a provider outage keeps the code and title the internal service reported', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const service = clientAnswering(503, { code: 'provider_unavailable', title: 'DJEN indisponivel' });
    await assert.rejects(
      () => service.tribunais(),
      (error: unknown) => {
        assert.ok(error instanceof HttpException);
        assert.equal(error.getStatus(), 503);
        const body = error.getResponse() as { code: string; title: string };
        assert.equal(body.code, 'provider_unavailable');
        assert.equal(body.title, 'DJEN indisponivel');
        return true;
      }
    );
  } finally { globalThis.fetch = originalFetch; }
});

void test('an unstructured body never leaks the provider payload', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const service = clientAnswering(502, 'texto cru do provedor com dados sensiveis');
    await assert.rejects(
      () => service.tribunais(),
      (error: unknown) => {
        const body = (error as HttpException).getResponse() as { code: string; title: string };
        assert.equal(body.code, 'provider_unavailable');
        assert.doesNotMatch(body.title, /texto cru/);
        return true;
      }
    );
  } finally { globalThis.fetch = originalFetch; }
});
