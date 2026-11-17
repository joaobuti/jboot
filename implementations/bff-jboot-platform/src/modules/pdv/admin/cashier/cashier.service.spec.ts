import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { CashierService } from './cashier.service';

const CONTEXT = {
  identityId: 'identity-1',
  clientId: 'client-1',
  applicationId: 'app-1',
  databaseRef: 'db-1',
  locationId: 'location-1',
  scopes: [],
  roles: [],
  userAgent: 'test-agent',
  ip: '127.0.0.1'
};

function buildService(overrides: {
  repository?: Partial<Record<string, unknown>>;
  salesRepository?: Partial<Record<string, unknown>>;
  audit?: Partial<Record<string, unknown>>;
}) {
  const auditCalls: { event: string; payload: unknown }[] = [];
  const repository = {
    open: async () => ({ id: 'cashier-1', status: 'open' }),
    findOpen: async () => [{ id: 'cashier-1', status: 'open' }],
    getSummary: async () => ({ totalSales: 0 }),
    calcExpectedClosingBalance: async () => 150,
    createMovement: async () => ({ id: 'movement-1', cashierId: 'cashier-1', type: 'sangria', amount: '10.00' }),
    close: async () => ({ id: 'cashier-1', status: 'closed', closingDifference: '-5.00' }),
    ...overrides.repository
  };
  const salesRepository = {
    cancelByCashier: async () => undefined,
    ...overrides.salesRepository
  };
  const audit = {
    record: async (event: string, _context: unknown, payload: unknown) => {
      auditCalls.push({ event, payload });
    },
    ...overrides.audit
  };

  const service = new CashierService(repository as never, salesRepository as never, audit as never);
  return { service, repository, salesRepository, auditCalls };
}

void test('CashierService.open delegates to repository and records audit event', async () => {
  const { service, auditCalls } = buildService({});

  const result = await service.open(CONTEXT, { openingBalance: 50, notes: 'início do turno' });

  assert.equal(result.id, 'cashier-1');
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'cashier:opened');
  assert.deepEqual(auditCalls[0].payload, { cashierId: 'cashier-1', openingBalance: 50 });
});

void test('CashierService.findOpen delegates to repository with client and identity', async () => {
  let capturedArgs: unknown[] = [];
  const { service } = buildService({
    repository: {
      findOpen: async (...args: unknown[]) => {
        capturedArgs = args;
        return [];
      }
    }
  });

  await service.findOpen(CONTEXT);

  assert.deepEqual(capturedArgs, ['client-1', 'identity-1']);
});

void test('CashierService.close cancels open sales, calculates balance and records audit event', async () => {
  let cancelledCashierId: string | undefined;
  const { service, auditCalls } = buildService({
    salesRepository: {
      cancelByCashier: async (_clientId: string, cashierId: string) => {
        cancelledCashierId = cashierId;
      }
    }
  });

  const result = await service.close(CONTEXT, 'cashier-1', { countedBalance: 145, notes: 'fim do turno' });

  assert.equal(cancelledCashierId, 'cashier-1');
  assert.equal(result.id, 'cashier-1');
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'cashier:closed');
  assert.deepEqual(auditCalls[0].payload, {
    cashierId: 'cashier-1',
    expectedClosingBalance: 150,
    countedBalance: 145,
    closingDifference: -5
  });
});

void test('CashierService.createMovement records cash movement audit event', async () => {
  const { service, auditCalls } = buildService({});

  const result = await service.createMovement(CONTEXT, 'cashier-1', {
    type: 'sangria',
    amount: 10,
    reason: 'troco'
  });

  assert.equal(result.id, 'movement-1');
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'cashier:movement');
  assert.deepEqual(auditCalls[0].payload, {
    cashierId: 'cashier-1',
    movementId: 'movement-1',
    type: 'sangria',
    amount: 10
  });
});
