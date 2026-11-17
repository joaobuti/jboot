import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ComandaOrderService } from './comanda-order.service';
import { ComandaItemInput, ComandaItemRow } from '../repositories/comanda-pedidos.repository';

const CONTEXT = { clientId: 'client-1', customerId: 'customer-1', comandaId: 'comanda-1', tableNumber: 1 };

function buildItemRow(overrides: Partial<ComandaItemRow> = {}): ComandaItemRow {
  return {
    id: 'item-1',
    comandaId: CONTEXT.comandaId,
    comandaPedidoId: 'pedido-1',
    productId: 'product-1',
    productNameSnapshot: 'X-Burger',
    unitPriceSnapshot: '25.00',
    quantity: '1',
    queueType: 'cozinha',
    notes: null,
    status: 'pendente',
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

function buildService(overrides: {
  products?: { id: string; name: string; price: string; queueType: 'cozinha' | 'bar' | null }[];
  createPedidoWithItems?: (clientId: string, comandaId: string, items: ComandaItemInput[]) => Promise<unknown>;
} = {}) {
  const comandas = {
    findById: async () => ({ id: CONTEXT.comandaId, tableNumber: 1, status: 'aberta' }),
    touchLastActivity: async () => undefined,
    requestClosing: async () => undefined
  };

  const createCalls: { clientId: string; comandaId: string; items: ComandaItemInput[] }[] = [];
  const pedidos = {
    findPedidosByComanda: async () => [],
    findItensByComanda: async () => [],
    findItemById: async (_comandaId: string, itemId: string) =>
      itemId === 'pendente-item' ? buildItemRow({ id: 'pendente-item', status: 'pendente' }) : itemId === 'producao-item'
        ? buildItemRow({ id: 'producao-item', status: 'em_producao' })
        : null,
    cancelItemByClient: async (itemId: string) => buildItemRow({ id: itemId, status: 'cancelado' }),
    claimIdempotencyKey: async () => 'claim-1',
    attachPedidoToIdempotencyClaim: async () => undefined,
    findPedidoIdByIdempotencyKey: async () => null,
    createPedidoWithItems: async (clientId: string, comandaId: string, items: ComandaItemInput[]) => {
      createCalls.push({ clientId, comandaId, items });
      if (overrides.createPedidoWithItems) {
        return overrides.createPedidoWithItems(clientId, comandaId, items);
      }
      return {
        pedido: { id: 'pedido-1', comandaId, submittedAt: new Date().toISOString() },
        itens: items.map((item, index) => buildItemRow({ id: `item-${index}`, productId: item.productId }))
      };
    }
  };

  const products = {
    findVisibleByIds: async () => overrides.products ?? []
  };

  const service = new ComandaOrderService(comandas as never, pedidos as never, products as never);
  return { service, createCalls };
}

void test('createPedido resolves price/name/queueType from catalog_products, never from the request payload', async () => {
  const { service, createCalls } = buildService({
    products: [{ id: 'product-1', name: 'X-Burger', price: '25.50', queueType: 'cozinha' }]
  });

  await service.createPedido(CONTEXT, {
    items: [{ productId: 'product-1', quantity: 2, notes: 'sem cebola' }]
  } as never);

  assert.equal(createCalls.length, 1);
  assert.deepEqual(createCalls[0].items, [
    {
      productId: 'product-1',
      productNameSnapshot: 'X-Burger',
      unitPriceSnapshot: '25.50',
      quantity: 2,
      queueType: 'cozinha',
      notes: 'sem cebola'
    }
  ]);
});

void test('createPedido silently drops items whose product is not found/not visible, without failing the whole order', async () => {
  const { service, createCalls } = buildService({
    products: [{ id: 'product-1', name: 'X-Burger', price: '25.50', queueType: 'cozinha' }]
  });

  await service.createPedido(CONTEXT, {
    items: [
      { productId: 'product-1', quantity: 1 },
      { productId: 'product-missing', quantity: 1 }
    ]
  } as never);

  assert.equal(createCalls[0].items.length, 1);
  assert.equal(createCalls[0].items[0].productId, 'product-1');
});

void test('createPedido throws UnprocessableEntityException when no item resolves to a valid product', async () => {
  const { service } = buildService({ products: [] });

  await assert.rejects(
    () => service.createPedido(CONTEXT, { items: [{ productId: 'product-missing', quantity: 1 }] } as never),
    UnprocessableEntityException
  );
});

void test('cancelItem cancels an item in pendente', async () => {
  const { service } = buildService();

  const result = await service.cancelItem(CONTEXT, 'pendente-item');

  assert.equal(result.status, 'cancelado');
});

void test('cancelItem rejects an item that is no longer pendente', async () => {
  const { service } = buildService();

  await assert.rejects(() => service.cancelItem(CONTEXT, 'producao-item'), ConflictException);
});

void test('cancelItem rejects an item that does not belong to this comanda', async () => {
  const { service } = buildService();

  await assert.rejects(() => service.cancelItem(CONTEXT, 'unknown-item'), NotFoundException);
});
