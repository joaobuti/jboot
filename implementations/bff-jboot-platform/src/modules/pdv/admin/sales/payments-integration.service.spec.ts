import { afterEach, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PaymentsIntegrationService } from './payments-integration.service';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

void test('PaymentsIntegrationService obtains svc:payments token and sends tenant/idempotency headers', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/auth/service-token')) {
      return new Response(JSON.stringify({ accessToken: 'token', expiresIn: 60 }), { status: 200 });
    }
    return new Response(JSON.stringify({
      id: 'charge-1', consumerApplication: 'pdv', merchantOrderReference: 'sale-1',
      amountMinor: 100, currency: 'BRL', status: 'awaiting_payment',
      checkoutUrl: 'https://checkout.infinitepay.io/test', createdAt: new Date().toISOString(),
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const service = new PaymentsIntegrationService({
    identityServiceUrl: 'http://identity', paymentsServiceUrl: 'http://payments',
    platformServiceClientId: 'platform-api', platformServiceClientSecret: 'secret',
  } as never);
  await service.createPixCharge({ clientId: 'tenant-1', saleId: 'sale-1', amountMinor: 100, idempotencyKey: 'idem-key' });

  const tokenBody = JSON.parse(String(calls[0].init?.body));
  assert.equal(tokenBody.audience, 'svc:payments');
  const headers = calls[1].init?.headers as Record<string, string>;
  assert.equal(headers['X-JBoot-Client-Id'], 'tenant-1');
  assert.equal(headers['Idempotency-Key'], 'idem-key');
});

void test('PaymentsIntegrationService does not leak raw upstream error bodies', async () => {
  global.fetch = (async (input: string | URL | Request) => {
    if (String(input).endsWith('/auth/service-token')) {
      return new Response(JSON.stringify({ accessToken: 'token', expiresIn: 60 }), { status: 200 });
    }
    return new Response('secret-provider-payload', { status: 503 });
  }) as typeof fetch;

  const service = new PaymentsIntegrationService({
    identityServiceUrl: 'http://identity', paymentsServiceUrl: 'http://payments',
    platformServiceClientId: 'platform-api', platformServiceClientSecret: 'secret',
  } as never);

  await assert.rejects(
    () => service.verifyCharge('tenant-1', 'charge-1'),
    (error: unknown) => !JSON.stringify(error).includes('secret-provider-payload'),
  );
});

void test('PaymentsIntegrationService sends audited operator identity only on refund mutation', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/auth/service-token')) {
      return new Response(JSON.stringify({ accessToken: 'token', expiresIn: 60 }), { status: 200 });
    }
    return new Response(JSON.stringify({
      id: 'refund-1', chargeId: 'charge-1', amountMinor: 100,
      status: 'requested', reason: 'cliente solicitou', operatorIdentityId: 'operator-1',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const service = new PaymentsIntegrationService({
    identityServiceUrl: 'http://identity', paymentsServiceUrl: 'http://payments',
    platformServiceClientId: 'platform-api', platformServiceClientSecret: 'secret',
  } as never);
  await service.requestRefund({
    clientId: 'tenant-1', operatorIdentityId: 'operator-1', chargeId: 'charge-1',
    amountMinor: 100, reason: 'cliente solicitou', idempotencyKey: 'refund-key-123',
  });

  const headers = calls[1].init?.headers as Record<string, string>;
  assert.equal(headers['X-JBoot-Operator-Id'], 'operator-1');
  assert.equal(headers['Idempotency-Key'], 'refund-key-123');
});
