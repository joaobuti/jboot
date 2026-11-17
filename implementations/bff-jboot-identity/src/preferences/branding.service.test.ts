import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { BrandingRepository } from './branding.repository';
import { BrandingService } from './branding.service';

class BrandingRepositoryStub implements Pick<BrandingRepository, 'findByClient' | 'saveForClient'> {
  saved: { clientId: string; branding: { logoDataUrl?: string; displayName?: string } } | null = null;

  async findByClient() {
    return null;
  }

  async saveForClient(clientId: string, branding: { logoDataUrl?: string; displayName?: string }) {
    this.saved = { clientId, branding };
  }
}

test('BrandingService saves valid image data URL for the client', async () => {
  const repository = new BrandingRepositoryStub();
  const service = new BrandingService(repository as unknown as BrandingRepository);
  const logoDataUrl = `data:image/png;base64,${Buffer.from('logo').toString('base64')}`;

  const result = await service.save('client-1', { logoDataUrl, displayName: ' Loja Demo ' });

  assert.deepEqual(result, { logoDataUrl, displayName: 'Loja Demo' });
  assert.deepEqual(repository.saved, {
    clientId: 'client-1',
    branding: { logoDataUrl, displayName: 'Loja Demo' }
  });
});

test('BrandingService rejects non-image data URLs', async () => {
  const service = new BrandingService(new BrandingRepositoryStub() as unknown as BrandingRepository);

  await assert.rejects(
    () => service.save('client-1', { logoDataUrl: 'data:text/plain;base64,Zm9v' }),
    BadRequestException
  );
});

test('BrandingService rejects oversized logos', async () => {
  const service = new BrandingService(new BrandingRepositoryStub() as unknown as BrandingRepository);
  const logoDataUrl = `data:image/png;base64,${'a'.repeat(193 * 1024)}`;

  await assert.rejects(() => service.save('client-1', { logoDataUrl }), BadRequestException);
});
