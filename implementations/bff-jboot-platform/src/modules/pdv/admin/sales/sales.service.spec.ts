import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { SalesService } from './sales.service';

const CONTEXT = {
  identityId: 'identity-1',
  clientId: 'client-1',
  applicationId: 'app-1',
  databaseRef: 'db-1',
  locationId: 'location-1',
  scopes: [],
  roles: []
};

function buildService(overrides: {
  sale?: Partial<Record<string, unknown>>;
  items?: unknown[];
  payments?: unknown[];
  repository?: Partial<Record<string, unknown>>;
  inventory?: Partial<Record<string, unknown>>;
  fiscal?: Partial<Record<string, unknown>>;
  cashierRepository?: Partial<Record<string, unknown>>;
  paymentsIntegration?: Partial<Record<string, unknown>>;
  fiscalConfig?: Partial<Record<string, unknown>>;
}) {
  const sale = { id: 'sale-1', status: 'open', subtotal: '100', total: '100', saleRole: 'standalone', ...overrides.sale };
  const items = overrides.items ?? [];
  const payments = overrides.payments ?? [];

  const repository = {
    findById: async () => sale,
    itemsBySale: async () => items,
    paymentsBySale: async () => payments,
    addItem: async () => ({}),
    applyDiscount: async (_clientId: string, _saleId: string, amount: number) => ({ ...sale, discount: amount }),
    updateStatus: async () => ({ ...sale, status: 'cancelled' }),
    cancelSale: async () => undefined,
    setFiscalCancelStatus: async () => undefined,
    ...overrides.repository
  };
  const inventory = {
    registerSaleMovements: async () => undefined,
    ...overrides.inventory
  };
  const fiscal = {
    cancelarDocumento: async () => ({ status: 'cancelled' }),
    ...overrides.fiscal
  };
  const fiscalConfigRepository = {
    listConfigs: async () => [],
    ...overrides.fiscalConfig,
  };
  const comandaAdmin = { findComandaCustomerLinkByClosedSaleId: async () => null };
  const customers = { findById: async () => null };
  const cashierRepository = {
    findOrOpenComandaFallback: async () => ({ id: 'cashier-fallback' }),
    ...overrides.cashierRepository
  };
  const paymentsIntegration = {
    createPixCharge: async () => ({ id: 'charge-1', status: 'awaiting_payment', checkoutUrl: 'https://checkout.infinitepay.io/test' }),
    verifyCharge: async () => ({ id: 'charge-1', status: 'received' }),
    ...overrides.paymentsIntegration,
  };

  const service = new SalesService(
    repository as never,
    fiscal as never,
    inventory as never,
    fiscalConfigRepository as never,
    comandaAdmin as never,
    customers as never,
    cashierRepository as never,
    paymentsIntegration as never
  );
  return { service, repository, inventory, cashierRepository };
}

void test('SalesService.addItem rejects when sale is not open', async () => {
  const { service } = buildService({ sale: { status: 'completed' } });

  await assert.rejects(() => service.addItem(CONTEXT, 'sale-1', { productId: 'p1', quantity: 1, unitPrice: 10 }), BadRequestException);
});

void test('SalesService.applyDiscount computes percent discount from subtotal', async () => {
  let capturedAmount: number | undefined;
  const { service } = buildService({
    sale: { subtotal: '200' },
    repository: {
      applyDiscount: async (_clientId: string, _saleId: string, amount: number) => {
        capturedAmount = amount;
        return {};
      }
    }
  });

  await service.applyDiscount(CONTEXT, 'sale-1', { discountType: 'percent', amount: 10 });

  assert.equal(capturedAmount, 20);
});

void test('SalesService.applyDiscount rejects percent above 100', async () => {
  const { service } = buildService({ sale: { subtotal: '200' } });

  await assert.rejects(
    () => service.applyDiscount(CONTEXT, 'sale-1', { discountType: 'percent', amount: 150 }),
    BadRequestException
  );
});

void test('SalesService.applyDiscount rejects value discount above subtotal', async () => {
  const { service } = buildService({ sale: { subtotal: '50' } });

  await assert.rejects(
    () => service.applyDiscount(CONTEXT, 'sale-1', { discountType: 'value', amount: 100 }),
    BadRequestException
  );
});

void test('SalesService.applyDiscount rejects when sale is not open', async () => {
  const { service } = buildService({ sale: { status: 'cancelled' } });

  await assert.rejects(
    () => service.applyDiscount(CONTEXT, 'sale-1', { discountType: 'value', amount: 10 }),
    BadRequestException
  );
});

void test('SalesService.complete rejects sale with no items', async () => {
  const { service } = buildService({ items: [], payments: [{ amount: '100', status: 'confirmed' }] });

  await assert.rejects(() => service.complete(CONTEXT, 'sale-1', {}), BadRequestException);
});

void test('SalesService.complete rejects sale with no payments', async () => {
  const { service } = buildService({ items: [{ id: 'item-1' }], payments: [] });

  await assert.rejects(() => service.complete(CONTEXT, 'sale-1', {}), BadRequestException);
});

void test('SalesService.complete rejects insufficient payment', async () => {
  const { service } = buildService({
    sale: { total: '100' },
    items: [{ id: 'item-1' }],
    payments: [{ amount: '40', status: 'confirmed' }]
  });

  await assert.rejects(() => service.complete(CONTEXT, 'sale-1', {}), BadRequestException);
});

void test('SalesService.complete without fiscal data marks sale completed and registers stock movement', async () => {
  let statusUpdated: string | undefined;
  let inventoryCalled = false;
  const { service } = buildService({
    sale: { total: '100' },
    items: [{ id: 'item-1' }],
    payments: [{ amount: '100', status: 'confirmed' }],
    repository: {
      updateStatus: async (_clientId: string, _saleId: string, status: string) => {
        statusUpdated = status;
        return {};
      }
    },
    inventory: {
      registerSaleMovements: async () => {
        inventoryCalled = true;
      }
    }
  });

  await service.complete(CONTEXT, 'sale-1', {});

  assert.equal(statusUpdated, 'completed');
  assert.equal(inventoryCalled, true);
});

void test('SalesService.cancel rejects sale that is neither open nor completed', async () => {
  const { service } = buildService({ sale: { status: 'fiscal_error' } });

  await assert.rejects(() => service.cancel(CONTEXT, 'sale-1'), BadRequestException);
});

void test('SalesService.cancel marks an open sale as cancelled', async () => {
  let cancelArgs: unknown[] = [];
  const { service } = buildService({
    sale: { status: 'open' },
    repository: {
      cancelSale: async (...args: unknown[]) => {
        cancelArgs = args;
      }
    }
  });

  await service.cancel(CONTEXT, 'sale-1');

  assert.deepEqual(cancelArgs, ['client-1', 'sale-1', 'identity-1', null]);
});

void test('SalesService.cancel completed sale requires reason', async () => {
  const { service } = buildService({ sale: { status: 'completed' } });

  await assert.rejects(() => service.cancel(CONTEXT, 'sale-1'), BadRequestException);
});

void test('SalesService.cancel completed sale restores stock and records cancellation metadata', async () => {
  let refundCalled = false;
  let cancelArgs: unknown[] = [];
  const { service } = buildService({
    sale: { status: 'completed' },
    items: [{ productId: 'product-1', quantity: '2' }],
    repository: {
      cancelSale: async (...args: unknown[]) => {
        cancelArgs = args;
      }
    },
    inventory: {
      registerSaleRefundMovements: async () => {
        refundCalled = true;
      }
    }
  });

  await service.cancel(CONTEXT, 'sale-1', { reason: 'devolução integral' });

  assert.equal(refundCalled, true);
  assert.deepEqual(cancelArgs, ['client-1', 'sale-1', 'identity-1', 'devolução integral', undefined, undefined]);
});

void test('SalesService.createComandaParent resolves fallback cashier when cashierId is missing', async () => {
  let createdCashierId: unknown;
  const { service } = buildService({
    repository: {
      create: async (_clientId: string, _identityId: string, cashierId: string) => {
        createdCashierId = cashierId;
        return { id: 'sale-1' };
      }
    }
  });

  await service.createComandaParent(CONTEXT);

  assert.equal(createdCashierId, 'cashier-fallback');
});

void test('SalesService.addPayment rejects manual PIX', async () => {
  const { service } = buildService({});
  await assert.rejects(
    () => service.addPayment(CONTEXT, 'sale-1', { paymentMethod: 'pix', amount: 10 }),
    /PIX deve ser iniciado pelo fluxo integrado/,
  );
});

void test('SalesService.initiatePixPayment creates charge in minor units and pending local payment', async () => {
  let chargeInput: Record<string, unknown> | undefined;
  let pendingArgs: unknown[] = [];
  const { service } = buildService({
    repository: {
      addPendingPixPayment: async (...args: unknown[]) => {
        pendingArgs = args;
        return { id: 'payment-1', status: 'pending' };
      },
    },
    paymentsIntegration: {
      createPixCharge: async (input: Record<string, unknown>) => {
        chargeInput = input;
        return { id: 'charge-1', status: 'awaiting_payment', checkoutUrl: 'https://checkout.infinitepay.io/test' };
      },
    },
  });

  const result = await service.initiatePixPayment(CONTEXT, 'sale-1', 10.25);

  assert.equal(chargeInput?.amountMinor, 1025);
  assert.deepEqual(pendingArgs, ['client-1', 'sale-1', 10.25, 'charge-1']);
  assert.equal(result.status, 'awaiting_payment');
});

void test('SalesService.verifyPixPayment confirms local payment only after received', async () => {
  let confirmed = false;
  const { service } = buildService({
    repository: {
      confirmIntegratedPayment: async () => {
        confirmed = true;
        return { id: 'payment-1', status: 'confirmed' };
      },
    },
  });

  const result = await service.verifyPixPayment(CONTEXT, 'sale-1', 'charge-1');

  assert.equal(result.status, 'received');
  assert.equal(confirmed, true);
});

void test('SalesService.emitNf reuses request id after uncertain result', async () => {
  let requestId: string | undefined;
  const fiscalConfig = {
    cnpjEmitente: '00000000000000', razaoSocial: 'EMITENTE HOMOLOGACAO', nomeFantasia: null,
    inscricaoEstadual: '000000000000', telefone: null, email: null,
    logradouro: 'Rua Teste', numero: '1', complemento: null, bairro: 'Centro', municipio: 'Sorocaba',
    uf: 'SP', cep: '18000000', codigoMunicipio: '3552205', regimeFiscal: 'simples',
  };
  const { service } = buildService({
    sale: {
      status: 'completed', total: '1.00', fiscalStatus: 'uncertain',
      fiscalRequestId: '11111111-1111-4111-8111-111111111111',
    },
    items: [{
      id: 'item-1', productId: 'product-1', description: 'Produto', ncm: '73181500',
      cfop: '5102', unit: 'UN', sku: 'HOMOLOG-001', gtin: null, cest: null,
      quantity: '1', unitPrice: '1.00', discount: '0', total: '1.00',
    }],
    payments: [{ paymentMethod: 'pix', amount: '1.00', status: 'confirmed' }],
    fiscalConfig: { listConfigs: async () => [fiscalConfig] },
    fiscal: {
      emitirNfce: async (input: { requestId: string }) => {
        requestId = input.requestId;
        return { fiscalDocumentId: 'doc-1', status: 'authorized' };
      },
    },
    repository: { setFiscalStatus: async () => undefined },
  });

  await service.emitNf(CONTEXT, 'sale-1', { nfType: 'nfce' });
  assert.equal(requestId, '11111111-1111-4111-8111-111111111111');
});

void test('SalesService.emitNf rejects product without valid NCM before calling fiscal service', async () => {
  let called = false;
  const { service } = buildService({
    sale: { status: 'completed', total: '1.00', fiscalStatus: null, fiscalRequestId: null },
    items: [{ productId: 'product-1', description: 'Produto', ncm: null }],
    fiscalConfig: { listConfigs: async () => [{ cnpjEmitente: '00000000000000' }] },
    fiscal: { emitirNfce: async () => { called = true; return { status: 'authorized' }; } },
  });

  await assert.rejects(() => service.emitNf(CONTEXT, 'sale-1', { nfType: 'nfce' }), /NCM fiscal válido/);
  assert.equal(called, false);
});
