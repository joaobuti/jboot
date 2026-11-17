import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { SignJWT } from 'jose';
import { JuridicoAuthGuard } from './juridico-auth.guard';

const secret = 'test-secret-test-secret-test-secret';

async function token(audience = 'app:juridico', scopes = ['juridico:read']): Promise<string> {
  return new SignJWT({
    client_id: '11111111-1111-4111-8111-111111111111',
    application_id: '22222222-2222-4222-8222-222222222222',
    database_ref: '33333333-3333-4333-8333-333333333333',
    scopes,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('jboot-identity')
    .setAudience(audience)
    .setSubject('44444444-4444-4444-8444-444444444444')
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(new TextEncoder().encode(secret));
}

function contextFor(bearer: string): ExecutionContext {
  const request = { headers: { authorization: `Bearer ${bearer}` } };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

void test('accepts only Identity juridico audience with juridico read scope', async () => {
  const guard = new JuridicoAuthGuard({ jwtSecret: secret, identityIssuer: 'jboot-identity' } as never);
  assert.equal(await guard.canActivate(contextFor(await token())), true);
  const wrongAudience = await token('app:pdv');
  const missingScope = await token('app:juridico', []);
  await assert.rejects(() => guard.canActivate(contextFor(wrongAudience)), UnauthorizedException);
  await assert.rejects(() => guard.canActivate(contextFor(missingScope)), ForbiddenException);
});
