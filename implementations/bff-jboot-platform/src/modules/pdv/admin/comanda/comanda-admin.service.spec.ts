import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ComandaAdminService } from './comanda-admin.service';
import { ComandaAdminItemRow } from './comanda-admin.types';

interface ComandaPaymentDto {
  paymentMethod: string;
  amount: number;
}

interface ComandaParentItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

function baseItem(overrides: Partial<ComandaAdminItemRow> = {}): ComandaAdminItemRow {
  return {
    id: 'item-1',
    comandaId: 'comanda-1',
    comandaPedidoId: 'pedido-1',
    tableNumber: 1,
    productId: 'product-1',
    productName: 'X-Burger',
    unitPrice: '25.00',
    quantity: '1',
    queueType: 'cozinha',
    notes: null,
    status: 'pendente',
    createdAt: new Date().toISOString(),
    encaminhadoPor: null,
    encaminhadoAt: null,
    finalizadoPor: null,
    finalizadoAt: null,
    liberadoPor: null,
    liberadoAt: null,
    canceladoPor: null,
    canceladoAt: null,
    cancelReason: null,
    cancelIsException: false,
    ...overrides
  };
}

function buildContext(scopes: string[]) {
  return {
    identityId: 'identity-1',
    clientId: 'client-1',
    applicationId: 'app-1',
    databaseRef: 'db-1',
    locationId: 'location-1',
    scopes,
    roles: [],
    userAgent: 'test-agent',
    ip: '127.0.0.1'
  };
}

function baseSummary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'comanda-1',
    tableNumber: 1,
    customerName: 'Cliente 11999998888',
    customerPhone: '11999998888',
    customerDocumentNumber: null,
    status: 'aberta',
    openedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    closingRequestedAt: null,
    total: '25.00',
    ...overrides
  };
}

function buildService(overrides: {
  repository?: Partial<Record<string, unknown>>;
  audit?: Partial<Record<string, unknown>>;
  sales?: Partial<Record<string, unknown>>;
} = {}) {
  const auditCalls: { event: string; payload: unknown }[] = [];
  const repository = {
    findPendentes: async () => [],
    findFila: async () => [],
    findProntos: async () => [],
    findItemById: async () => baseItem(),
    markEmProducao: async () => undefined,
    markPronto: async () => undefined,
    markLiberado: async () => undefined,
    markCancelado: async () => undefined,
    findComandasAbertas: async () => [],
    findComandaSummary: async () => baseSummary(),
    findRawById: async () => ({ id: 'comanda-1', clientId: 'client-1', status: 'aberta', parentSaleId: null }),
    findAllItensByComanda: async () => [baseItem({ status: 'liberado_para_entrega' })],
    markFechada: async () => undefined,
    setParentSale: async () => undefined,
    ...overrides.repository
  };
  const audit = {
    record: async (event: string, _context: unknown, payload: unknown) => {
      auditCalls.push({ event, payload });
    },
    ...overrides.audit
  };
  const sales = {
    create: async () => ({ id: 'sale-1' }),
    addItem: async () => undefined,
    addPayment: async () => undefined,
    complete: async () => undefined,
    createComandaParent: async () => ({ id: 'parent-1' }),
    registerComandaPayment: async () => ({ sale: { id: 'child-1' }, payment: { id: 'payment-1' } }),
    paidTotalForComandaParent: async () => 0,
    paymentsForComandaParent: async () => [],
    completeComandaParent: async () => undefined,
    ...overrides.sales
  };

  const service = new ComandaAdminService(repository as never, audit as never, sales as never);
  return { service, repository, audit, sales, auditCalls };
}

void test('listFila allows staff with pdv:comanda:cozinha to read the cozinha queue', async () => {
  const { service } = buildService();
  const result = await service.listFila(buildContext(['pdv:comanda:cozinha']), 'cozinha');
  assert.deepEqual(result, []);
});

void test('listFila rejects staff with only pdv:comanda:bar reading the cozinha queue', async () => {
  const { service } = buildService();
  await assert.rejects(
    () => service.listFila(buildContext(['pdv:comanda:bar']), 'cozinha'),
    (error: unknown) => error instanceof Error && error.constructor.name === 'ForbiddenException'
  );
});

void test('listFila rejects staff with only pdv:comanda:cozinha reading the bar queue', async () => {
  const { service } = buildService();
  await assert.rejects(
    () => service.listFila(buildContext(['pdv:comanda:cozinha']), 'bar'),
    (error: unknown) => error instanceof Error && error.constructor.name === 'ForbiddenException'
  );
});

void test('encaminhar transitions pendente -> em_producao and records audit event', async () => {
  const { service, auditCalls } = buildService({
    repository: { findItemById: async () => baseItem({ status: 'pendente' }) }
  });

  const result = await service.encaminhar(buildContext(['pdv:comanda:balcao']), 'item-1');

  assert.equal(result.status, 'em_producao');
  assert.equal(result.encaminhadoPor, 'identity-1');
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'pdv_comanda_item_encaminhado');
});

void test('encaminhar rejects an item that is not pendente', async () => {
  const { service } = buildService({
    repository: { findItemById: async () => baseItem({ status: 'em_producao' }) }
  });

  await assert.rejects(
    () => service.encaminhar(buildContext(['pdv:comanda:balcao']), 'item-1'),
    (error: unknown) => error instanceof Error && error.constructor.name === 'ConflictException'
  );
});

void test('finalizar rejects staff whose scope does not match the item queue_type', async () => {
  const { service } = buildService({
    repository: { findItemById: async () => baseItem({ status: 'em_producao', queueType: 'cozinha' }) }
  });

  await assert.rejects(
    () => service.finalizar(buildContext(['pdv:comanda:bar']), 'item-1'),
    (error: unknown) => error instanceof Error && error.constructor.name === 'ForbiddenException'
  );
});

void test('finalizar transitions em_producao -> pronto for matching queue scope', async () => {
  const { service, auditCalls } = buildService({
    repository: { findItemById: async () => baseItem({ status: 'em_producao', queueType: 'bar' }) }
  });

  const result = await service.finalizar(buildContext(['pdv:comanda:bar']), 'item-1');

  assert.equal(result.status, 'pronto');
  assert.equal(auditCalls[0].event, 'pdv_comanda_item_finalizado');
});

void test('finalizar rejects an item that is not em_producao', async () => {
  const { service } = buildService({
    repository: { findItemById: async () => baseItem({ status: 'pronto', queueType: 'cozinha' }) }
  });

  await assert.rejects(
    () => service.finalizar(buildContext(['pdv:comanda:cozinha']), 'item-1'),
    (error: unknown) => error instanceof Error && error.constructor.name === 'ConflictException'
  );
});

void test('liberar transitions pronto -> liberado_para_entrega', async () => {
  const { service, auditCalls } = buildService({
    repository: { findItemById: async () => baseItem({ status: 'pronto' }) }
  });

  const result = await service.liberar(buildContext(['pdv:comanda:balcao']), 'item-1');

  assert.equal(result.status, 'liberado_para_entrega');
  assert.equal(auditCalls[0].event, 'pdv_comanda_item_liberado');
});

void test('liberar rejects an item that is not pronto', async () => {
  const { service } = buildService({
    repository: { findItemById: async () => baseItem({ status: 'pendente' }) }
  });

  await assert.rejects(
    () => service.liberar(buildContext(['pdv:comanda:balcao']), 'item-1'),
    (error: unknown) => error instanceof Error && error.constructor.name === 'ConflictException'
  );
});

void test('cancelar allows pendente item without reason and marks it as non-exception', async () => {
  const { service, auditCalls } = buildService({
    repository: { findItemById: async () => baseItem({ status: 'pendente' }) }
  });

  const result = await service.cancelar(buildContext(['pdv:comanda:balcao']), 'item-1');

  assert.equal(result.status, 'cancelado');
  assert.equal(result.cancelIsException, false);
  assert.equal(result.cancelReason, null);
  assert.deepEqual(auditCalls[0].payload, { itemId: 'item-1', comandaId: 'comanda-1', isException: false });
});

void test('cancelar requires a reason for an item beyond pendente', async () => {
  const { service } = buildService({
    repository: { findItemById: async () => baseItem({ status: 'em_producao' }) }
  });

  await assert.rejects(
    () => service.cancelar(buildContext(['pdv:comanda:balcao']), 'item-1'),
    (error: unknown) => error instanceof Error && error.constructor.name === 'UnprocessableEntityException'
  );
});

void test('cancelar marks exception cancellation when a reason is provided beyond pendente', async () => {
  const { service, auditCalls } = buildService({
    repository: { findItemById: async () => baseItem({ status: 'pronto' }) }
  });

  const result = await service.cancelar(buildContext(['pdv:comanda:balcao']), 'item-1', 'cliente desistiu');

  assert.equal(result.cancelIsException, true);
  assert.equal(result.cancelReason, 'cliente desistiu');
  assert.deepEqual(auditCalls[0].payload, { itemId: 'item-1', comandaId: 'comanda-1', isException: true });
});

void test('cancelar rejects an item that is already cancelado', async () => {
  const { service } = buildService({
    repository: { findItemById: async () => baseItem({ status: 'cancelado' }) }
  });

  await assert.rejects(
    () => service.cancelar(buildContext(['pdv:comanda:balcao']), 'item-1', 'motivo'),
    (error: unknown) => error instanceof Error && error.constructor.name === 'ConflictException'
  );
});

void test('listComandas marks a comanda as forgotten when inactive for over 45min without a closing request', async () => {
  const oldActivity = new Date(Date.now() - 46 * 60_000).toISOString();
  const { service } = buildService({
    repository: {
      findComandasAbertas: async () => [baseSummary({ lastActivityAt: oldActivity, closingRequestedAt: null })]
    }
  });

  const [result] = await service.listComandas(buildContext(['pdv:comanda:balcao']));
  assert.equal(result.isForgotten, true);
});

void test('listComandas does not mark a comanda as forgotten when a closing request already exists', async () => {
  const oldActivity = new Date(Date.now() - 46 * 60_000).toISOString();
  const { service } = buildService({
    repository: {
      findComandasAbertas: async () => [
        baseSummary({ lastActivityAt: oldActivity, closingRequestedAt: new Date().toISOString() })
      ]
    }
  });

  const [result] = await service.listComandas(buildContext(['pdv:comanda:balcao']));
  assert.equal(result.isForgotten, false);
});

void test('listComandas does not mark a recently active comanda as forgotten', async () => {
  const { service } = buildService({
    repository: { findComandasAbertas: async () => [baseSummary({ closingRequestedAt: null })] }
  });

  const [result] = await service.listComandas(buildContext(['pdv:comanda:balcao']));
  assert.equal(result.isForgotten, false);
});

void test('getComandaDetail throws NotFoundException when the comanda does not exist', async () => {
  const { service } = buildService({ repository: { findComandaSummary: async () => null } });

  await assert.rejects(
    () => service.getComandaDetail(buildContext(['pdv:comanda:balcao']), 'comanda-1'),
    (error: unknown) => error instanceof Error && error.constructor.name === 'NotFoundException'
  );
});

void test('fecharComanda rejects a comanda that is not aberta', async () => {
  const { service } = buildService({
    repository: {
      findRawById: async () => ({ id: 'comanda-1', clientId: 'client-1', status: 'fechada', parentSaleId: null })
    }
  });

  await assert.rejects(
    () => service.fecharComanda(buildContext(['pdv:comanda:balcao']) as never, 'comanda-1', 'dinheiro'),
    (error: unknown) => error instanceof Error && error.constructor.name === 'ConflictException'
  );
});

void test('fecharComanda rejects a comanda with no active items', async () => {
  const { service } = buildService({
    repository: { findAllItensByComanda: async () => [baseItem({ status: 'cancelado' })] }
  });

  await assert.rejects(
    () => service.fecharComanda(buildContext(['pdv:comanda:balcao']) as never, 'comanda-1', 'dinheiro'),
    (error: unknown) => error instanceof Error && error.constructor.name === 'UnprocessableEntityException'
  );
});

void test('fecharComanda orchestrates SalesService (create, addItem per active item, addPayment with computed total, complete) and marks comanda fechada', async () => {
  const salesCalls: string[] = [];
  const { service, auditCalls } = buildService({
    repository: {
      findAllItensByComanda: async () => [
        baseItem({ id: 'item-1', status: 'liberado_para_entrega', unitPrice: '25.00', quantity: '2' }),
        baseItem({ id: 'item-2', status: 'cancelado', unitPrice: '99.00', quantity: '9' })
      ]
    },
    sales: {
      createComandaSale: async () => {
        salesCalls.push('createComandaSale');
        return { id: 'sale-1' };
      },
      addItem: async (_ctx: unknown, saleId: string, dto: { unitPrice: number; quantity: number }) => {
        salesCalls.push(`addItem:${saleId}:${dto.unitPrice}x${dto.quantity}`);
      },
      addPayment: async (_ctx: unknown, saleId: string, dto: { paymentMethod: string; amount: number }) => {
        salesCalls.push(`addPayment:${saleId}:${dto.paymentMethod}:${dto.amount}`);
      },
      complete: async (_ctx: unknown, saleId: string) => {
        salesCalls.push(`complete:${saleId}`);
      }
    }
  });

  const result = await service.fecharComanda(buildContext(['pdv:comanda:balcao']) as never, 'comanda-1', 'pix');

  assert.equal(result.saleId, 'sale-1');
  assert.deepEqual(salesCalls, [
    'createComandaSale',
    'addItem:sale-1:25x2',
    'addPayment:sale-1:pix:50',
    'complete:sale-1'
  ]);
  assert.equal(auditCalls[0].event, 'pdv_comanda_fechada');
  assert.deepEqual(auditCalls[0].payload, {
    comandaId: 'comanda-1',
    saleId: 'sale-1',
    paymentMethod: 'pix',
    total: 50
  });
});

// --- Sprint 9: pagamento dividido (venda-pai + vendas derivadas) ---

void test('registrarPagamento cria a venda-pai no primeiro recebimento e a amarra a comanda', async () => {
  const calls: string[] = [];
  const { service } = buildService({
    repository: {
      findAllItensByComanda: async () => [baseItem({ quantity: '4', unitPrice: '25.00' })],
      setParentSale: async (_clientId: string, comandaId: string, saleId: string) => {
        calls.push(`setParentSale:${comandaId}:${saleId}`);
      }
    },
    sales: {
      createComandaParent: async () => {
        calls.push('createComandaParent');
        return { id: 'parent-1' };
      },
      registerComandaPayment: async (_ctx: unknown, parentSaleId: string, dto: ComandaPaymentDto) => {
        calls.push(`pay:${parentSaleId}:${dto.paymentMethod}:${dto.amount}`);
        return { sale: { id: 'child-1' }, payment: { id: 'payment-1' } };
      }
    }
  });

  const result = await service.registrarPagamento(
    buildContext(['pdv:comanda:balcao']) as never,
    'comanda-1',
    40,
    'pix'
  );

  assert.deepEqual(calls, ['createComandaParent', 'setParentSale:comanda-1:parent-1', 'pay:parent-1:pix:40']);
  assert.equal(result.fechada, false);
});

void test('registrarPagamento reaproveita a venda-pai existente em recebimentos seguintes', async () => {
  const calls: string[] = [];
  const { service } = buildService({
    repository: {
      findRawById: async () => ({
        id: 'comanda-1',
        clientId: 'client-1',
        status: 'aberta',
        parentSaleId: 'parent-existente'
      }),
      findAllItensByComanda: async () => [baseItem({ quantity: '4', unitPrice: '25.00' })]
    },
    sales: {
      createComandaParent: async () => {
        calls.push('createComandaParent');
        return { id: 'parent-novo' };
      },
      paidTotalForComandaParent: async () => 40,
      registerComandaPayment: async (_ctx: unknown, parentSaleId: string) => {
        calls.push(`pay:${parentSaleId}`);
        return { sale: { id: 'child-2' }, payment: { id: 'payment-2' } };
      }
    }
  });

  await service.registrarPagamento(buildContext(['pdv:comanda:balcao']) as never, 'comanda-1', 30, 'dinheiro');

  assert.deepEqual(calls, ['pay:parent-existente']);
});

void test('registrarPagamento recusa valor acima do saldo em aberto', async () => {
  const { service } = buildService({
    repository: {
      findAllItensByComanda: async () => [baseItem({ quantity: '2', unitPrice: '25.00' })]
    },
    sales: { paidTotalForComandaParent: async () => 30 }
  });

  await assert.rejects(
    () => service.registrarPagamento(buildContext(['pdv:comanda:balcao']) as never, 'comanda-1', 25, 'dinheiro'),
    (error: unknown) => error instanceof Error && error.constructor.name === 'UnprocessableEntityException'
  );
});

void test('registrarPagamento nao fecha a comanda enquanto houver saldo', async () => {
  const { service, auditCalls } = buildService({
    repository: {
      findAllItensByComanda: async () => [baseItem({ quantity: '4', unitPrice: '25.00' })]
    }
  });

  const result = await service.registrarPagamento(
    buildContext(['pdv:comanda:balcao']) as never,
    'comanda-1',
    60,
    'dinheiro'
  );

  assert.equal(result.fechada, false);
  assert.deepEqual(
    auditCalls.map((call) => call.event),
    ['pdv_comanda_pagamento_registrado']
  );
});

void test('registrarPagamento quita: materializa itens na venda-pai, conclui e fecha a comanda', async () => {
  const calls: string[] = [];
  const { service, auditCalls } = buildService({
    repository: {
      findRawById: async () => ({
        id: 'comanda-1',
        clientId: 'client-1',
        status: 'aberta',
        parentSaleId: 'parent-1'
      }),
      findAllItensByComanda: async () => [baseItem({ quantity: '4', unitPrice: '25.00' })],
      markFechada: async (_clientId: string, comandaId: string, _identityId: string, saleId: string) => {
        calls.push(`markFechada:${comandaId}:${saleId}`);
      }
    },
    sales: {
      paidTotalForComandaParent: async () => 60,
      completeComandaParent: async (_ctx: unknown, parentSaleId: string, items: ComandaParentItem[]) => {
        calls.push(`completeParent:${parentSaleId}:${items.length}itens`);
      }
    }
  });

  const result = await service.registrarPagamento(
    buildContext(['pdv:comanda:balcao']) as never,
    'comanda-1',
    40,
    'cartao_credito'
  );

  assert.equal(result.fechada, true);
  assert.deepEqual(calls, ['completeParent:parent-1:1itens', 'markFechada:comanda-1:parent-1']);
  assert.deepEqual(
    auditCalls.map((call) => call.event),
    ['pdv_comanda_pagamento_registrado', 'pdv_comanda_fechada']
  );
});

void test('fecharComanda recusa comanda que ja tem pagamento parcial (evita cobrar duas vezes)', async () => {
  const { service } = buildService({
    repository: {
      findRawById: async () => ({
        id: 'comanda-1',
        clientId: 'client-1',
        status: 'aberta',
        parentSaleId: 'parent-1'
      })
    }
  });

  await assert.rejects(
    () => service.fecharComanda(buildContext(['pdv:comanda:balcao']) as never, 'comanda-1', 'dinheiro'),
    (error: unknown) => error instanceof Error && error.constructor.name === 'ConflictException'
  );
});

void test('getComandaDetail expoe total, pago e saldo da comanda', async () => {
  const { service } = buildService({
    repository: {
      findRawById: async () => ({
        id: 'comanda-1',
        clientId: 'client-1',
        status: 'aberta',
        parentSaleId: 'parent-1'
      }),
      findComandaSummary: async () => baseSummary({ total: '100.00' })
    },
    sales: {
      paymentsForComandaParent: async () => [
        { saleId: 'child-1', saleNumber: 10, paymentMethod: 'pix', amount: '40.00', operatorId: 'op-1', receivedAt: 'x' }
      ]
    }
  });

  const detail = await service.getComandaDetail(buildContext(['pdv:comanda:balcao']), 'comanda-1');

  assert.equal(detail.saldo.total, '100.00');
  assert.equal(detail.saldo.pago, '40.00');
  assert.equal(detail.saldo.saldo, '60.00');
  assert.equal(detail.saldo.pagamentos.length, 1);
});
