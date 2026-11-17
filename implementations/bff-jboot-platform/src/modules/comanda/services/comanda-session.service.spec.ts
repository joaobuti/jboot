import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { SignJWT } from 'jose';
import { ComandaSessionService } from './comanda-session.service';
import { ComandaJwtService } from './comanda-jwt.service';

const QR_SECRET = 'test-comanda-qr-secret-32-characters-min';
const SESSION_SECRET = 'test-comanda-session-secret-32-characters-min';

function buildJwtService() {
  return new ComandaJwtService({
    comandaQrSecret: QR_SECRET,
    comandaSessionSecret: SESSION_SECRET
  } as never);
}

async function signQr(payload: Record<string, unknown>) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().sign(new TextEncoder().encode(QR_SECRET));
}

const TABLE_ROW: {
  id: string;
  clientId: string;
  tableNumber: number;
  label: string;
  status: 'active' | 'inactive';
  tokenVersion: number;
} = {
  id: 'table-1',
  clientId: 'client-1',
  tableNumber: 1,
  label: 'Mesa 1',
  status: 'active',
  tokenVersion: 1
};

function buildService(overrides: {
  table?: typeof TABLE_ROW | null;
  existingComanda?: unknown;
  createCalls?: { clientId: string; customerId: string; tableNumber: number }[];
  customer?: { id: string };
} = {}) {
  const createCalls = overrides.createCalls ?? [];
  const tables = { findByClientAndTableNumber: async () => overrides.table ?? TABLE_ROW };
  const comandas = {
    findOpenByCustomer: async () => overrides.existingComanda ?? null,
    create: async (clientId: string, customerId: string, tableNumber: number) => {
      createCalls.push({ clientId, customerId, tableNumber });
      return { id: 'new-comanda', status: 'aberta', clientId, customerId, tableNumber };
    }
  };
  const customers = {
    findOrCreatePublic: async () => overrides.customer ?? { id: 'customer-1' }
  };
  const service = new ComandaSessionService(buildJwtService(), tables as never, comandas as never, customers as never);
  return { service, createCalls };
}

void test('createSession rejects a QR token whose tokenVersion does not match comanda_tables.token_version', async () => {
  const { service } = buildService({ table: { ...TABLE_ROW, tokenVersion: 5 } });
  const qrToken = await signQr({ typ: 'comanda_table_qr', clientId: 'client-1', tableNumber: 1, tokenVersion: 1 });

  await assert.rejects(
    () => service.createSession({ qrToken, phone: '11999999999' }),
    UnauthorizedException
  );
});

void test('createSession rejects a QR token for an inactive table', async () => {
  const { service } = buildService({ table: { ...TABLE_ROW, status: 'inactive' } });
  const qrToken = await signQr({ typ: 'comanda_table_qr', clientId: 'client-1', tableNumber: 1, tokenVersion: 1 });

  await assert.rejects(
    () => service.createSession({ qrToken, phone: '11999999999' }),
    UnauthorizedException
  );
});

void test('createSession rejects when neither phone nor documentNumber is provided', async () => {
  const { service } = buildService();
  const qrToken = await signQr({ typ: 'comanda_table_qr', clientId: 'client-1', tableNumber: 1, tokenVersion: 1 });

  await assert.rejects(() => service.createSession({ qrToken }), UnprocessableEntityException);
});

void test('createSession resumes the existing open comanda instead of creating a new one', async () => {
  const existingComanda = { id: 'existing-comanda', status: 'aberta', tableNumber: 1 };
  const { service, createCalls } = buildService({ existingComanda });
  const qrToken = await signQr({ typ: 'comanda_table_qr', clientId: 'client-1', tableNumber: 1, tokenVersion: 1 });

  const result = await service.createSession({ qrToken, phone: '11999999999' });

  assert.equal(result.comandaId, 'existing-comanda');
  assert.equal(createCalls.length, 0);
});

void test('createSession creates a new comanda when the customer has none open', async () => {
  const { service, createCalls } = buildService({ existingComanda: null, customer: { id: 'customer-7' } });
  const qrToken = await signQr({ typ: 'comanda_table_qr', clientId: 'client-1', tableNumber: 1, tokenVersion: 1 });

  const result = await service.createSession({ qrToken, documentNumber: '12345678900' });

  assert.equal(result.comandaId, 'new-comanda');
  assert.equal(createCalls.length, 1);
  assert.deepEqual(createCalls[0], { clientId: 'client-1', customerId: 'customer-7', tableNumber: 1 });
});
