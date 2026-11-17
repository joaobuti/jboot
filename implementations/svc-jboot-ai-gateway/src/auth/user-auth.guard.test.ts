import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SignJWT } from 'jose';
import { AppConfigService } from '../config/app-config.service';
import { AuthContext } from './auth-context';
import { UserAuthGuard } from './user-auth.guard';

/* eslint-disable @typescript-eslint/no-floating-promises */
const secret = 'test-jwt-secret-with-enough-entropy';
process.env.JBOOT_IDENTITY_JWT_SECRET = secret;
const contextFor = (authorization?: string) => {
  const request: { headers: { authorization?: string }; auth?: AuthContext } = { headers: { authorization } };
  return { request, context: { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => contextFor, getClass: () => UserAuthGuard } as unknown as ExecutionContext };
};
const token = (scopes: string[]) => new SignJWT({ client_id: '11111111-1111-4111-8111-111111111111', scopes, roles: ['manager'] })
  .setProtectedHeader({ alg: 'HS256' }).setSubject('22222222-2222-4222-8222-222222222222').setIssuer('jboot-identity').setAudience('app:flow').setExpirationTime('5m').sign(new TextEncoder().encode(secret));

test('authenticates identity/tenant and independently requires credential scope', async () => {
  const reflector = { getAllAndOverride: () => ['ai:credentials:manage'] } as unknown as Reflector;
  const guard = new UserAuthGuard(new AppConfigService(), reflector);
  const denied = contextFor(`Bearer ${await token([])}`);
  await assert.rejects(() => guard.canActivate(denied.context), /Insufficient scope/);
  const allowed = contextFor(`Bearer ${await token(['ai:credentials:manage'])}`);
  assert.equal(await guard.canActivate(allowed.context), true);
  assert.equal(allowed.request.auth?.clientId, '11111111-1111-4111-8111-111111111111');
  assert.equal(allowed.request.auth?.identityId, '22222222-2222-4222-8222-222222222222');
  assert.equal(allowed.request.auth?.applicationSlug, 'flow');
});

test('authorizes agent routes with the agent scope without requiring credential management', async () => {
  const reflector = { getAllAndOverride: () => ['ai:agents:manage'] } as unknown as Reflector;
  const guard = new UserAuthGuard(new AppConfigService(), reflector);
  const allowed = contextFor(`Bearer ${await token(['ai:agents:manage'])}`);
  assert.equal(await guard.canActivate(allowed.context), true);
});
