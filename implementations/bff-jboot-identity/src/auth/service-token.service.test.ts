import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ServiceTokenService } from './service-token.service';

void test('issues only the allowlisted platform service audience', async () => {
  const jwt = { issueServiceAccessToken: async () => 'signed-token' };
  const config = {
    platformServiceClientSecret: 'secret',
    platformServiceClientId: 'platform-api',
    platformServiceAudiences: new Set(['svc:juridico-data']),
    serviceAccessTokenTtlSeconds: 120,
  };
  const service = new ServiceTokenService(config as never, jwt as never);
  const result = await service.issue({
    clientId: 'platform-api',
    clientSecret: 'secret',
    audience: 'svc:juridico-data',
  });
  assert.deepEqual(result, { accessToken: 'signed-token', tokenType: 'Bearer', expiresIn: 120 });
  await assert.rejects(
    () => service.issue({ clientId: 'platform-api', clientSecret: 'wrong', audience: 'svc:juridico-data' }),
    /Invalid service credentials/,
  );
});

void test('issues the payments audience only to the allowlisted platform service', async () => {
  const issued: string[] = [];
  const jwt = {
    issueServiceAccessToken: async (_clientId: string, audience: string) => {
      issued.push(audience);
      return 'signed-token';
    },
  };
  const config = {
    platformServiceClientSecret: 'secret',
    platformServiceClientId: 'platform-api',
    platformServiceAudiences: new Set(['svc:juridico-data', 'svc:payments']),
    serviceAccessTokenTtlSeconds: 120,
  };
  const service = new ServiceTokenService(config as never, jwt as never);
  await service.issue({
    clientId: 'platform-api',
    clientSecret: 'secret',
    audience: 'svc:payments',
  });
  assert.deepEqual(issued, ['svc:payments']);
});

void test('issues the AI gateway audience only to the allowlisted platform service', async () => {
  const issued: string[] = [];
  const jwt = {
    issueServiceAccessToken: async (_clientId: string, audience: string) => {
      issued.push(audience);
      return 'signed-token';
    },
  };
  const config = {
    platformServiceClientSecret: 'secret',
    platformServiceClientId: 'platform-api',
    platformServiceAudiences: new Set(['svc:ai-gateway']),
    serviceAccessTokenTtlSeconds: 120,
  };
  const service = new ServiceTokenService(config as never, jwt as never);
  await service.issue({
    clientId: 'platform-api',
    clientSecret: 'secret',
    audience: 'svc:ai-gateway',
  });
  assert.deepEqual(issued, ['svc:ai-gateway']);
});

void test('rate limits repeated invalid service credentials per source IP', async () => {
  const service = new ServiceTokenService({
    platformServiceClientSecret: 'secret',
    platformServiceClientId: 'platform-api',
    platformServiceAudiences: new Set(['svc:juridico-data']),
    serviceAccessTokenTtlSeconds: 120,
  } as never, {} as never);
  const invalid = { clientId: 'platform-api', clientSecret: 'wrong', audience: 'svc:juridico-data' };
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await assert.rejects(() => service.issue(invalid, '127.0.0.2'), /Invalid service credentials/);
  }
  await assert.rejects(
    () => service.issue(invalid, '127.0.0.2'),
    (error: unknown) => (error as { getStatus?: () => number }).getStatus?.() === 429,
  );
});
