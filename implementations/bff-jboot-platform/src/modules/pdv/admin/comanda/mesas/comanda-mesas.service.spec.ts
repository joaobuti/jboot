import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ComandaMesasService } from './comanda-mesas.service';
import { ComandaMesaRow } from './comanda-mesas.types';

function baseMesa(overrides: Partial<ComandaMesaRow> = {}): ComandaMesaRow {
  return {
    id: 'mesa-1',
    tableNumber: 1,
    label: 'Mesa 1',
    status: 'active',
    tokenVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function buildContext(scopes: string[] = ['pdv:admin:write']) {
  return {
    identityId: 'identity-1',
    clientId: 'client-1',
    applicationId: 'app-1',
    databaseRef: 'db-1',
    scopes,
    roles: [],
    userAgent: 'test-agent',
    ip: '127.0.0.1'
  };
}

function buildService(overrides: { repository?: Partial<Record<string, unknown>> } = {}) {
  const auditCalls: { event: string; payload: unknown }[] = [];
  const repository = {
    findAll: async () => [baseMesa()],
    findById: async () => baseMesa(),
    findByTableNumber: async () => null,
    create: async (_clientId: string, tableNumber: number, label: string | null) =>
      baseMesa({ tableNumber, label }),
    updateLabel: async (_clientId: string, _id: string, label: string | null) => baseMesa({ label }),
    updateStatus: async (_clientId: string, _id: string, status: 'active' | 'inactive') => baseMesa({ status }),
    bumpTokenVersion: async () => baseMesa({ tokenVersion: 2 }),
    countComandasAbertas: async () => 0,
    ...overrides.repository
  };
  const jwt = {
    issueQrToken: async (params: { tableNumber: number; tokenVersion: number }) =>
      `qr-${params.tableNumber}-v${params.tokenVersion}`
  };
  const audit = {
    record: async (event: string, _context: unknown, payload: unknown) => {
      auditCalls.push({ event, payload });
    }
  };

  const service = new ComandaMesasService(repository as never, jwt as never, audit as never);
  return { service, repository, auditCalls };
}

void test('create rejects a table number already registered for the tenant', async () => {
  const { service } = buildService({ repository: { findByTableNumber: async () => baseMesa() } });

  await assert.rejects(
    () => service.create(buildContext(), 1),
    (error: unknown) => error instanceof Error && error.constructor.name === 'ConflictException'
  );
});

void test('create issues a QR token bound to the table number and token version', async () => {
  const { service, auditCalls } = buildService();

  const mesa = await service.create(buildContext(), 7, ' Varanda ');

  assert.equal(mesa.tableNumber, 7);
  assert.equal(mesa.label, 'Varanda');
  assert.equal(mesa.qrToken, 'qr-7-v1');
  assert.equal(auditCalls[0]?.event, 'pdv_comanda_mesa_criada');
});

void test('inactivating a table with open comandas is refused', async () => {
  const { service } = buildService({ repository: { countComandasAbertas: async () => 2 } });

  await assert.rejects(
    () => service.updateStatus(buildContext(), 'mesa-1', 'inactive'),
    (error: unknown) => error instanceof Error && error.constructor.name === 'ConflictException'
  );
});

void test('inactive table is returned without a QR token', async () => {
  const { service } = buildService();

  const mesa = await service.updateStatus(buildContext(), 'mesa-1', 'inactive');

  assert.equal(mesa.status, 'inactive');
  assert.equal(mesa.qrToken, null);
});

void test('regenerateQr bumps token version so the printed QR stops working', async () => {
  const { service, auditCalls } = buildService();

  const mesa = await service.regenerateQr(buildContext(), 'mesa-1');

  assert.equal(mesa.tokenVersion, 2);
  assert.equal(mesa.qrToken, 'qr-1-v2');
  assert.equal(auditCalls[0]?.event, 'pdv_comanda_mesa_qr_revogado');
});

void test('list resolves a QR token per active table', async () => {
  const { service } = buildService({
    repository: {
      findAll: async () => [baseMesa(), baseMesa({ id: 'mesa-2', tableNumber: 2, status: 'inactive' })]
    }
  });

  const mesas = await service.list(buildContext(['pdv:comanda:balcao']));

  assert.equal(mesas[0].qrToken, 'qr-1-v1');
  assert.equal(mesas[1].qrToken, null);
});
