import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { CatalogProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

const BASE_CREATE: CreateProductDto = {
  name: 'Cafe 500g',
  unit: 'UN',
  salePrice: '19.90'
};

function buildService(overrides: {
  findById?: (...args: unknown[]) => unknown;
  create?: (...args: unknown[]) => unknown;
  update?: (...args: unknown[]) => unknown;
  updateImageFileId?: (...args: unknown[]) => unknown;
  uploadFile?: (...args: unknown[]) => unknown;
} = {}) {
  const calls = { findById: 0, create: 0, update: 0, updateImageFileId: 0, uploadFile: 0 };
  const repository = {
    findById: async (...args: unknown[]) => {
      calls.findById += 1;
      return overrides.findById ? overrides.findById(...args) : { visibleInComanda: false, queueType: null };
    },
    create: async (...args: unknown[]) => {
      calls.create += 1;
      return overrides.create ? overrides.create(...args) : {};
    },
    update: async (...args: unknown[]) => {
      calls.update += 1;
      return overrides.update ? overrides.update(...args) : {};
    },
    updateImageFileId: async (...args: unknown[]) => {
      calls.updateImageFileId += 1;
      return overrides.updateImageFileId ? overrides.updateImageFileId(...args) : { imageFileId: 'file-1' };
    }
  };
  const files = {
    getSignedDownloadUrlMap: async () => new Map([['file-1', { url: 'http://localhost:9000/signed', expiresAt: '2026-08-27T12:00:00.000Z' }]]),
    upload: async (...args: unknown[]) => {
      calls.uploadFile += 1;
      return overrides.uploadFile ? overrides.uploadFile(...args) : { id: 'file-1' };
    }
  };
  const service = new CatalogProductsService(repository as never, files as never);
  return { service, repository, calls };
}

void test('create rejects when visibleInComanda=true and queueType is missing', async () => {
  const { service } = buildService();
  const dto: CreateProductDto = { ...BASE_CREATE, visibleInComanda: true };

  await assert.rejects(() => service.create('client-1', dto, 'identity-1'), BadRequestException);
});

void test('create accepts when visibleInComanda=true and queueType is provided', async () => {
  const { service, calls } = buildService();
  const dto: CreateProductDto = { ...BASE_CREATE, visibleInComanda: true, queueType: 'cozinha' };

  await service.create('client-1', dto, 'identity-1');

  assert.equal(calls.create, 1);
});

void test('create accepts when visibleInComanda is not true, queueType omitted', async () => {
  const { service, calls } = buildService();

  await service.create('client-1', { ...BASE_CREATE }, 'identity-1');

  assert.equal(calls.create, 1);
});

void test('update rejects when payload sets visibleInComanda=true without queueType and product has none', async () => {
  const { service } = buildService({ findById: async () => ({ visibleInComanda: false, queueType: null }) });
  const dto: UpdateProductDto = { visibleInComanda: true };

  await assert.rejects(() => service.update('client-1', 'product-1', dto), BadRequestException);
});

void test('update rejects when payload only sets visibleInComanda=true and product currently has no queueType, even without repeating queueType', async () => {
  const { service } = buildService({ findById: async () => ({ visibleInComanda: false, queueType: null }) });

  await assert.rejects(() => service.update('client-1', 'product-1', { visibleInComanda: true }), BadRequestException);
});

void test('update accepts when queueType provided directly in payload, without fetching current state', async () => {
  const { service, calls } = buildService({
    findById: () => {
      throw new Error('findById should not be called when queueType is present in the payload');
    }
  });

  await service.update('client-1', 'product-1', { queueType: 'bar' });

  assert.equal(calls.findById, 0);
  assert.equal(calls.update, 1);
});

void test('update accepts turning visibleInComanda on when the product already has a queueType from a previous save', async () => {
  const { service, calls } = buildService({ findById: async () => ({ visibleInComanda: false, queueType: 'cozinha' }) });

  await service.update('client-1', 'product-1', { visibleInComanda: true });

  assert.equal(calls.update, 1);
});

void test('update skips the queueType check entirely when visibleInComanda is explicitly turned off', async () => {
  const { service, calls } = buildService({
    findById: () => {
      throw new Error('findById should not be called when visibleInComanda=false');
    }
  });

  await service.update('client-1', 'product-1', { visibleInComanda: false });

  assert.equal(calls.findById, 0);
  assert.equal(calls.update, 1);
});

void test('uploadImage validates product tenant ownership before storing and linking the file', async () => {
  const { service, calls } = buildService({
    findById: async () => ({ id: 'product-1', visibleInComanda: true, queueType: 'cozinha' })
  });

  const result = await service.uploadImage(
    'client-1',
    'product-1',
    'identity-1',
    { originalname: 'foto.webp', mimetype: 'image/webp', size: 12, buffer: Buffer.from('x') }
  );

  assert.equal(calls.findById, 1);
  assert.equal(calls.uploadFile, 1);
  assert.equal(calls.updateImageFileId, 1);
  assert.equal(result.imageUrl, 'http://localhost:9000/signed');
});
