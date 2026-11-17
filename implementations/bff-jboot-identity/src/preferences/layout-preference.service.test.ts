import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { LayoutPreferenceService } from './layout-preference.service';

test('LayoutPreferenceService returns the stored preference for the identity', async () => {
  const repository = {
    find: async (identityId: string) => (identityId === 'identity-1' ? { layoutModeType: 'dark' } : null),
    upsert: async () => undefined
  };

  const service = new LayoutPreferenceService(repository as never);

  assert.deepEqual(await service.get('identity-1'), { layoutModeType: 'dark' });
  assert.equal(await service.get('identity-2'), null);
});

test('LayoutPreferenceService persists the preference via the repository', async () => {
  const upserted: Array<{ identityId: string; preference: Record<string, unknown> }> = [];
  const repository = {
    find: async () => null,
    upsert: async (identityId: string, preference: Record<string, unknown>) => {
      upserted.push({ identityId, preference });
    }
  };

  const service = new LayoutPreferenceService(repository as never);
  const result = await service.save('identity-1', { layoutModeType: 'light' });

  assert.deepEqual(result, { layoutModeType: 'light' });
  assert.deepEqual(upserted, [{ identityId: 'identity-1', preference: { layoutModeType: 'light' } }]);
});

test('LayoutPreferenceService rejects payloads larger than 8KB', async () => {
  const repository = {
    find: async () => null,
    upsert: async () => {
      throw new Error('upsert should not be called for oversized payloads');
    }
  };

  const service = new LayoutPreferenceService(repository as never);
  const oversized = { blob: 'x'.repeat(9000) };

  await assert.rejects(() => service.save('identity-1', oversized));
});
