import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ComandaSalaoService } from './comanda-salao.service';
import { ComandaSalaoRawRow } from './comanda-salao.types';

function baseRow(overrides: Partial<ComandaSalaoRawRow> = {}): ComandaSalaoRawRow {
  const now = new Date().toISOString();
  return {
    mesaId: 'mesa-1',
    tableNumber: 1,
    label: 'Mesa 1',
    mesaStatus: 'active',
    comandaId: 'comanda-1',
    customerName: 'Cliente 11999998888',
    customerPhone: '11999998888',
    customerDocumentNumber: null,
    openedAt: now,
    lastActivityAt: now,
    closingRequestedAt: null,
    total: '25.00',
    pago: '0',
    itensPendentes: 0,
    itensEmProducao: 0,
    itensProntos: 0,
    ...overrides
  };
}

function buildService(rows: ComandaSalaoRawRow[]) {
  const repository = { findSalao: async () => rows };
  return new ComandaSalaoService(repository as never);
}

const context = {
  identityId: 'identity-1',
  clientId: 'client-1',
  applicationId: 'app-1',
  databaseRef: 'db-1',
  scopes: ['pdv:comanda:balcao'],
  roles: []
};

void test('mesa without an open comanda is livre', async () => {
  const service = buildService([
    baseRow({
      comandaId: null,
      customerName: null,
      openedAt: null,
      lastActivityAt: null,
      total: '0'
    })
  ]);

  const [mesa] = await service.getSalao(context);

  assert.equal(mesa.state, 'livre');
  assert.equal(mesa.comandasAbertas, 0);
  assert.equal(mesa.totalMesa, '0.00');
});

void test('mesa inativa sem comanda aberta is reported as inativa', async () => {
  const service = buildService([
    baseRow({ mesaStatus: 'inactive', comandaId: null, openedAt: null, lastActivityAt: null, total: '0' })
  ]);

  const [mesa] = await service.getSalao(context);

  assert.equal(mesa.state, 'inativa');
});

void test('mesa inativa com comanda viva keeps the operational state, not the cadastro', async () => {
  const service = buildService([baseRow({ mesaStatus: 'inactive' })]);

  const [mesa] = await service.getSalao(context);

  assert.equal(mesa.state, 'ocupada');
});

void test('N comandas on the same mesa are aggregated, never merged into one conta', async () => {
  const service = buildService([
    baseRow({ comandaId: 'comanda-1', total: '25.00' }),
    baseRow({ comandaId: 'comanda-2', customerName: 'Cliente 11888887777', total: '40.50' })
  ]);

  const [mesa] = await service.getSalao(context);

  assert.equal(mesa.comandasAbertas, 2);
  assert.equal(mesa.totalMesa, '65.50');
  assert.equal(mesa.comandas.length, 2);
});

void test('item pronto outranks conta solicitada in the dominant state', async () => {
  const service = buildService([
    baseRow({ comandaId: 'comanda-1', closingRequestedAt: new Date().toISOString() }),
    baseRow({ comandaId: 'comanda-2', itensProntos: 1 })
  ]);

  const [mesa] = await service.getSalao(context);

  assert.equal(mesa.state, 'item_pronto');
});

void test('conta solicitada wins over plain ocupada', async () => {
  const service = buildService([baseRow({ closingRequestedAt: new Date().toISOString() })]);

  const [mesa] = await service.getSalao(context);

  assert.equal(mesa.state, 'conta_solicitada');
});

void test('comanda idle beyond the threshold marks the mesa as esquecida', async () => {
  const oldActivity = new Date(Date.now() - 60 * 60000).toISOString();
  const service = buildService([baseRow({ lastActivityAt: oldActivity })]);

  const [mesa] = await service.getSalao(context);

  assert.equal(mesa.state, 'esquecida');
  assert.equal(mesa.comandas[0].isForgotten, true);
});

void test('mesas are returned ordered by table number', async () => {
  const service = buildService([
    baseRow({ mesaId: 'mesa-3', tableNumber: 3, comandaId: null, openedAt: null, lastActivityAt: null }),
    baseRow({ mesaId: 'mesa-2', tableNumber: 2, comandaId: null, openedAt: null, lastActivityAt: null })
  ]);

  const mesas = await service.getSalao(context);

  assert.deepEqual(
    mesas.map((mesa) => mesa.tableNumber),
    [2, 3]
  );
});
