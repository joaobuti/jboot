import 'reflect-metadata';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { UnauthorizedException } from '@nestjs/common';
import { ComandaSessionGuard } from './comanda-session.guard';
import { ComandaJwtService } from '../services/comanda-jwt.service';

const QR_SECRET = 'test-comanda-qr-secret-32-characters-min';
const SESSION_SECRET = 'test-comanda-session-secret-32-characters-min';

function buildJwtService() {
  return new ComandaJwtService({
    comandaQrSecret: QR_SECRET,
    comandaSessionSecret: SESSION_SECRET
  } as never);
}

function buildContext(token: string | undefined) {
  const request: { headers: Record<string, string>; comandaContext?: unknown } = {
    headers: token ? { authorization: `Bearer ${token}` } : {}
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request })
  };
  return { request, context: context as never };
}

void test('ComandaSessionGuard rejects a request with no bearer token', async () => {
  const guard = new ComandaSessionGuard(buildJwtService(), { findStatusById: async () => 'aberta' } as never);
  const { context } = buildContext(undefined);

  await assert.rejects(() => guard.canActivate(context), UnauthorizedException);
});

void test('ComandaSessionGuard rejects a valid session token when the comanda is already fechada', async () => {
  const jwt = buildJwtService();
  const token = await jwt.issueSessionToken({
    clientId: 'client-1',
    customerId: 'customer-1',
    comandaId: 'comanda-1',
    tableNumber: 1
  });
  const guard = new ComandaSessionGuard(jwt, { findStatusById: async () => 'fechada' } as never);
  const { context } = buildContext(token);

  await assert.rejects(() => guard.canActivate(context), UnauthorizedException);
});

void test('ComandaSessionGuard rejects a valid session token when the comanda no longer exists', async () => {
  const jwt = buildJwtService();
  const token = await jwt.issueSessionToken({
    clientId: 'client-1',
    customerId: 'customer-1',
    comandaId: 'comanda-1',
    tableNumber: 1
  });
  const guard = new ComandaSessionGuard(jwt, { findStatusById: async () => null } as never);
  const { context } = buildContext(token);

  await assert.rejects(() => guard.canActivate(context), UnauthorizedException);
});

void test('ComandaSessionGuard allows a valid session token for an open comanda and injects comandaContext', async () => {
  const jwt = buildJwtService();
  const token = await jwt.issueSessionToken({
    clientId: 'client-1',
    customerId: 'customer-1',
    comandaId: 'comanda-1',
    tableNumber: 3
  });
  const guard = new ComandaSessionGuard(jwt, { findStatusById: async () => 'aberta' } as never);
  const { context, request } = buildContext(token);

  const result = await guard.canActivate(context);

  assert.equal(result, true);
  assert.deepEqual(request.comandaContext, {
    clientId: 'client-1',
    customerId: 'customer-1',
    comandaId: 'comanda-1',
    tableNumber: 3
  });
});
