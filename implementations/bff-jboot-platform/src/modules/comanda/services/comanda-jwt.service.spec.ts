import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { UnauthorizedException } from '@nestjs/common';
import { SignJWT } from 'jose';
import { ComandaJwtService } from './comanda-jwt.service';

const QR_SECRET = 'test-comanda-qr-secret-32-characters-min';
const SESSION_SECRET = 'test-comanda-session-secret-32-characters-min';

function buildService() {
  return new ComandaJwtService({
    comandaQrSecret: QR_SECRET,
    comandaSessionSecret: SESSION_SECRET
  } as never);
}

async function signQr(payload: Record<string, unknown>, secret = QR_SECRET) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().sign(new TextEncoder().encode(secret));
}

void test('verifyQrToken accepts a well-formed table QR token', async () => {
  const service = buildService();
  const token = await signQr({ typ: 'comanda_table_qr', clientId: 'client-1', tableNumber: 1, tokenVersion: 1 });

  const payload = await service.verifyQrToken(token);

  assert.equal(payload.clientId, 'client-1');
  assert.equal(payload.tableNumber, 1);
  assert.equal(payload.tokenVersion, 1);
});

void test('verifyQrToken rejects a token signed with the wrong secret', async () => {
  const service = buildService();
  const token = await signQr({ typ: 'comanda_table_qr', clientId: 'client-1', tableNumber: 1, tokenVersion: 1 }, 'wrong-secret-at-least-32-characters-long');

  await assert.rejects(() => service.verifyQrToken(token), UnauthorizedException);
});

void test('verifyQrToken rejects a token missing required claims', async () => {
  const service = buildService();
  const token = await signQr({ typ: 'comanda_table_qr', clientId: 'client-1' });

  await assert.rejects(() => service.verifyQrToken(token), UnauthorizedException);
});

void test('issueSessionToken/verifySessionToken round-trip preserves claims', async () => {
  const service = buildService();
  const token = await service.issueSessionToken({
    clientId: 'client-1',
    customerId: 'customer-1',
    comandaId: 'comanda-1',
    tableNumber: 2
  });

  const payload = await service.verifySessionToken(token);

  assert.equal(payload.typ, 'comanda_session');
  assert.equal(payload.clientId, 'client-1');
  assert.equal(payload.customerId, 'customer-1');
  assert.equal(payload.comandaId, 'comanda-1');
  assert.equal(payload.tableNumber, 2);
  assert.ok(typeof payload.exp === 'number' && payload.exp > payload.iat);
});

void test('verifySessionToken rejects a QR token presented as a session token (different secrets)', async () => {
  const service = buildService();
  const qrToken = await signQr({ typ: 'comanda_table_qr', clientId: 'client-1', tableNumber: 1, tokenVersion: 1 });

  await assert.rejects(() => service.verifySessionToken(qrToken), UnauthorizedException);
});
