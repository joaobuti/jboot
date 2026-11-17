import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { IdentityApplicationsCacheService } from './identity-applications-cache.service';
import { DestinationRecord } from './auth.types';

const destination: DestinationRecord = {
  clientApplicationId: 'client-app-1',
  clientId: 'client-1',
  clientName: 'Cliente Demo',
  clientType: 'company',
  contractStatus: 'active',
  planCode: null,
  applicationId: 'app-1',
  applicationSlug: 'flow',
  applicationName: 'Flow',
  tokenAudience: 'flow',
  launchUrl: '/flow',
  databaseRefId: 'db-1',
  databaseStrategy: 'shared',
  databaseName: 'jboot_identity',
  schemaName: null,
  scopes: ['flow:admin'],
  roles: ['admin'],
  moduleAttributes: {}
};

test('IdentityApplicationsCacheService reuses cached destinations for the current permission version', async () => {
  const store = new Map<string, string>();
  let repositoryReads = 0;
  const repository = {
    getPermissionsVersion: async () => 7,
    listDestinations: async () => {
      repositoryReads += 1;
      return [destination];
    },
    bumpPermissionsVersion: async () => 8,
    listIdentityIdsForClient: async () => [],
    listIdentityIdsForApplication: async () => []
  };
  const cache = {
    get: async (key: string) => store.get(key) ?? null,
    setex: async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
    },
    scan: async () => [],
    del: async () => 0
  };

  const service = new IdentityApplicationsCacheService(
    cache as never,
    { identityApplicationsCacheTtlSeconds: 300 } as never,
    repository as never
  );

  assert.deepEqual(await service.listDestinations('identity-1'), [destination]);
  assert.deepEqual(await service.listDestinations('identity-1'), [destination]);
  assert.equal(repositoryReads, 1);
});

test('IdentityApplicationsCacheService bumps version and removes identity cache keys on invalidation', async () => {
  const deleted: string[][] = [];
  let bumped = '';
  const repository = {
    getPermissionsVersion: async () => 1,
    listDestinations: async () => [],
    bumpPermissionsVersion: async (identityId: string) => {
      bumped = identityId;
      return 2;
    },
    listIdentityIdsForClient: async () => [],
    listIdentityIdsForApplication: async () => []
  };
  const cache = {
    get: async () => null,
    setex: async () => undefined,
    scan: async (pattern: string) => [`${pattern}:old`],
    del: async (...keys: string[]) => {
      deleted.push(keys);
      return keys.length;
    }
  };
  const service = new IdentityApplicationsCacheService(
    cache as never,
    { identityApplicationsCacheTtlSeconds: 300 } as never,
    repository as never
  );

  const count = await service.invalidateIdentity('identity-1');

  assert.equal(bumped, 'identity-1');
  assert.equal(count, 1);
  assert.deepEqual(deleted, [['identity:applications:identity-1:v*:old']]);
});
