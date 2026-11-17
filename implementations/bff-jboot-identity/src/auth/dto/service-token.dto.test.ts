import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { validate } from 'class-validator';
import { ServiceTokenDto } from './service-token.dto';

void test('service token DTO accepts the payments audience', async () => {
  const dto = Object.assign(new ServiceTokenDto(), {
    clientId: 'platform-api',
    clientSecret: 'secret',
    audience: 'svc:payments',
  });
  assert.equal((await validate(dto)).length, 0);
});

void test('service token DTO accepts the AI gateway audience', async () => {
  const dto = Object.assign(new ServiceTokenDto(), {
    clientId: 'platform-api',
    clientSecret: 'secret',
    audience: 'svc:ai-gateway',
  });
  assert.equal((await validate(dto)).length, 0);
});

void test('service token DTO rejects unknown audiences', async () => {
  const dto = Object.assign(new ServiceTokenDto(), {
    clientId: 'platform-api',
    clientSecret: 'secret',
    audience: 'svc:unknown',
  });
  assert.ok((await validate(dto)).length > 0);
});

void test('service token DTO accepts the AI gateway and connector introspection audiences', async () => {
  for (const audience of ['svc:ai-gateway', 'svc:identity-oauth']) {
    const dto = Object.assign(new ServiceTokenDto(), { clientId: 'platform-api', clientSecret: 'secret', audience });
    assert.equal((await validate(dto)).length, 0, audience);
  }
});
