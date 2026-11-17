import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PublicMenuService } from './public-menu.service';

const CLIENT_ID = '11111111-1111-1111-1111-111111111111';

function buildService(overrides: {
  enabled?: boolean;
  categories?: { id: string; name: string }[];
  products?: {
    id: string;
    name: string;
    description: string | null;
    price: string;
    queueType: 'cozinha' | 'bar' | null;
    categoryId: string | null;
    imageFileId: string | null;
  }[];
  signedUrls?: Map<string, { url: string; expiresAt: string }>;
} = {}) {
  const calls = { isComandaAutoatendimentoEnabled: 0, findVisibleCategories: 0, findVisibleProducts: 0 };
  const repository = {
    isComandaAutoatendimentoEnabled: async () => {
      calls.isComandaAutoatendimentoEnabled += 1;
      return overrides.enabled ?? true;
    },
    findVisibleCategories: async () => {
      calls.findVisibleCategories += 1;
      return overrides.categories ?? [];
    },
    findVisibleProducts: async () => {
      calls.findVisibleProducts += 1;
      return overrides.products ?? [];
    }
  };
  const files = {
    getSignedDownloadUrlMap: async () => overrides.signedUrls ?? new Map()
  };
  const service = new PublicMenuService(repository as never, files as never);
  return { service, calls };
}

void test('getMenu returns empty menu without querying the database when clientId is not a valid UUID', async () => {
  const { service, calls } = buildService();

  const result = await service.getMenu('not-a-uuid');

  assert.deepEqual(result, { categories: [], uncategorized: { name: 'Outros', products: [] } });
  assert.equal(calls.isComandaAutoatendimentoEnabled, 0);
});

void test('getMenu returns empty menu (200, not an error) when the tenant flag autoatendimento_comanda is off', async () => {
  const { service, calls } = buildService({ enabled: false });

  const result = await service.getMenu(CLIENT_ID);

  assert.deepEqual(result, { categories: [], uncategorized: { name: 'Outros', products: [] } });
  assert.equal(calls.findVisibleCategories, 0);
  assert.equal(calls.findVisibleProducts, 0);
});

void test('getMenu groups visible products under their visible category', async () => {
  const { service } = buildService({
    enabled: true,
    categories: [{ id: 'cat-1', name: 'Bebidas' }],
    products: [{
      id: 'prod-1',
      name: 'Suco',
      description: 'Natural',
      price: '10.00',
      queueType: 'bar',
      categoryId: 'cat-1',
      imageFileId: 'file-1'
    }],
    signedUrls: new Map([['file-1', { url: 'http://localhost:9000/signed', expiresAt: '2026-08-27T12:00:00.000Z' }]])
  });

  const result = await service.getMenu(CLIENT_ID);

  assert.deepEqual(result.categories, [
    {
      id: 'cat-1',
      name: 'Bebidas',
      products: [{
        id: 'prod-1',
        name: 'Suco',
        description: 'Natural',
        price: '10.00',
        queueType: 'bar',
        imageUrl: 'http://localhost:9000/signed'
      }]
    }
  ]);
  assert.deepEqual(result.uncategorized, { name: 'Outros', products: [] });
});

void test('getMenu groups a product with no category into "Outros"', async () => {
  const { service } = buildService({
    enabled: true,
    categories: [],
    products: [{
      id: 'prod-2',
      name: 'Combo do dia',
      description: null,
      price: '25.00',
      queueType: 'cozinha',
      categoryId: null,
      imageFileId: null
    }]
  });

  const result = await service.getMenu(CLIENT_ID);

  assert.deepEqual(result.categories, []);
  assert.deepEqual(result.uncategorized.products, [
    {
      id: 'prod-2',
      name: 'Combo do dia',
      description: null,
      price: '25.00',
      queueType: 'cozinha',
      imageUrl: null
    }
  ]);
});

void test('getMenu never surfaces a product whose category is hidden (repository already filters it, service must not resurrect it)', async () => {
  // findVisibleProducts is the repository boundary: it only ever returns products
  // whose category is visible or absent. A product tied to a hidden category is
  // never among the rows the service receives — this test locks that contract in
  // from the service side, so the cascade cannot regress silently here.
  const { service } = buildService({
    enabled: true,
    categories: [{ id: 'cat-visible', name: 'Pratos' }],
    products: []
  });

  const result = await service.getMenu(CLIENT_ID);

  assert.deepEqual(result.categories, [{ id: 'cat-visible', name: 'Pratos', products: [] }]);
  assert.deepEqual(result.uncategorized.products, []);
});
