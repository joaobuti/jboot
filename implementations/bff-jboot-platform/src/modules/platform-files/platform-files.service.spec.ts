import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import { PlatformFilesService } from './platform-files.service';
import { PlatformFileOrigin, PlatformUploadedFile } from './platform-files.types';

const ORIGIN: PlatformFileOrigin = {
  clientId: '11111111-1111-1111-1111-111111111111',
  sourceModule: 'catalog',
  sourceEntityType: 'catalog_product',
  sourceEntityId: '22222222-2222-2222-2222-222222222222',
  usage: 'product_image',
  uploadedByIdentityId: '33333333-3333-3333-3333-333333333333'
};

const FILE: PlatformUploadedFile = {
  originalname: 'Cafe especial.webp',
  mimetype: 'image/webp',
  size: 128,
  buffer: Buffer.from('image')
};

function buildService() {
  const calls = { upload: 0, create: 0 };
  const storage = {
    bucketName: 'platform-files',
    upload: async () => {
      calls.upload += 1;
    },
    getSignedDownloadUrl: async () => ({ url: 'http://localhost:9000/signed', expiresAt: '2026-08-27T12:00:00.000Z' })
  };
  const repository = {
    create: async (params: Record<string, unknown>) => {
      calls.create += 1;
      return {
        ...params,
        createdAt: '2026-08-27T12:00:00.000Z'
      };
    },
    findById: async () => null,
    findByIds: async () => []
  };
  return { service: new PlatformFilesService(repository as never, storage as never), calls };
}

void test('upload stores file with server-generated tenant-prefixed key and metadata', async () => {
  const { service, calls } = buildService();

  const result = await service.upload(ORIGIN, FILE);

  assert.equal(calls.upload, 1);
  assert.equal(calls.create, 1);
  assert.equal(result.clientId, ORIGIN.clientId);
  assert.equal(result.usage, 'product_image');
  assert.match(String(result.storageKey), /^11111111-1111-1111-1111-111111111111\/catalog\/catalog_product\/22222222-2222-2222-2222-222222222222\/product_image\//);
  assert.match(String(result.storageKey), /Cafe_especial\.webp$/);
});

void test('upload rejects missing file', async () => {
  const { service } = buildService();
  await assert.rejects(() => service.upload(ORIGIN, undefined), BadRequestException);
});

void test('upload rejects unsupported product image content type', async () => {
  const { service } = buildService();
  await assert.rejects(
    () => service.upload(ORIGIN, { ...FILE, mimetype: 'application/pdf' }),
    UnsupportedMediaTypeException
  );
});

void test('upload rejects product image above the size limit', async () => {
  const { service } = buildService();
  await assert.rejects(
    () => service.upload(ORIGIN, { ...FILE, size: 5 * 1024 * 1024 + 1 }),
    PayloadTooLargeException
  );
});

void test('upload rejects invalid source identifiers before storage write', async () => {
  const { service, calls } = buildService();

  await assert.rejects(
    () => service.upload({ ...ORIGIN, sourceModule: '../catalog' }, FILE),
    BadRequestException
  );
  assert.equal(calls.upload, 0);
});
