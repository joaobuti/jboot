import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppConfigService } from '../../config/app-config.service';
import { CredentialCryptoService } from '../crypto/credential-crypto.service';
import { CredentialEnvelope } from '../crypto/credential-crypto.service';
import { ProviderCatalog } from '../providers/provider-catalog';
import { CredentialRecord, CredentialRepository } from './credential.repository';
import { CredentialService } from './credential.service';
import { ProviderRegistry } from '../providers/provider-registry';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

/* eslint-disable @typescript-eslint/no-floating-promises */

process.env.AI_GATEWAY_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 9).toString('base64');
process.env.AI_GATEWAY_ENABLED_PROVIDERS = 'openai,anthropic';
process.env.AI_GATEWAY_OPENAI_ALLOWED_MODELS = 'unit-model';
process.env.AI_GATEWAY_ANTHROPIC_ALLOWED_MODELS = 'unit-model';
const config = new AppConfigService();
const catalog = new ProviderCatalog(config);
class MemoryRepository {
  records: CredentialRecord[] = [];
  async list(clientId: string, ownerIdentityId: string) { return this.records.filter((r) => r.clientId === clientId && r.ownerIdentityId === ownerIdentityId); }
  async find(id: string, clientId: string, ownerIdentityId: string) { return this.records.find((r) => r.id === id && r.clientId === clientId && r.ownerIdentityId === ownerIdentityId) ?? null; }
  async upsert(clientId: string, ownerIdentityId: string, provider: string, envelope: CredentialEnvelope, last4: string, id: string) {
    const now = new Date(); const row = { id, clientId, ownerIdentityId, provider, status: 'pending_validation', last4, ...envelope, createdAt: now, updatedAt: now } as CredentialRecord;
    this.records = this.records.filter((r) => !(r.clientId === clientId && r.ownerIdentityId === ownerIdentityId && r.provider === provider)); this.records.push(row); return row;
  }
  async setStatus(id: string, clientId: string, ownerIdentityId: string, status: 'active' | 'invalid') { const row = await this.find(id, clientId, ownerIdentityId); if (row) row.status = status; return row; }
  async revoke(id: string, clientId: string, ownerIdentityId: string) { const row = await this.find(id, clientId, ownerIdentityId); if (row) { row.status = 'revoked'; row.ciphertext = row.nonce = row.authTag = null; } return row; }
}
const auth = { identityId: 'user-a', clientId: 'tenant-a', applicationSlug: 'flow', scopes: [], roles: [] };
const adapter = { models: async () => [] } as unknown as ProviderRegistry;
test('never returns plaintext and isolates credentials by tenant and owner', async () => {
  const repository = new MemoryRepository();
  const service = new CredentialService(repository as unknown as CredentialRepository, new CredentialCryptoService(config), catalog, adapter, config);
  const created = await service.upsert(auth, { provider: 'anthropic', apiKey: 'unit_top-secret' });
  assert.equal(JSON.stringify(created).includes('top-secret'), false);
  assert.equal((await service.list({ ...auth, clientId: 'tenant-b' })).length, 0);
  await assert.rejects(() => service.test({ ...auth, identityId: 'user-b' }, created.id));
  assert.equal((await service.test(auth, created.id)).status, 'active');
});
test('rejects a provider outside the executable catalog', async () => {
  const service = new CredentialService(new MemoryRepository() as unknown as CredentialRepository, new CredentialCryptoService(config), catalog, adapter, config);
  await assert.rejects(() => service.upsert(auth, { provider: 'unsupported', apiKey: 'sk-not-enabled' }), /Provider not enabled/);
  await assert.rejects(() => service.upsert(auth, { provider: 'fake', apiKey: 'fake_not-enabled' }), /Provider not enabled/);
});
test('same owner keeps separate encrypted credentials and routes validation by provider', async () => {
  const repository = new MemoryRepository();
  const calls: string[] = [];
  const registry = { models: async (provider: string) => { calls.push(provider); return []; } } as unknown as ProviderRegistry;
  const service = new CredentialService(repository as unknown as CredentialRepository, new CredentialCryptoService(config), catalog, registry, config);
  const anthropic = await service.upsert(auth, { provider: 'anthropic', apiKey: 'unit_anthropic' });
  const openai = await service.upsert(auth, { provider: 'openai', apiKey: 'unit_openai' });
  assert.notEqual(anthropic.id, openai.id);
  assert.equal((await service.list(auth)).length, 2);
  await service.test(auth, openai.id);
  assert.deepEqual(calls, ['openai']);
  assert.equal(repository.records.find(row => row.id === anthropic.id)?.status, 'pending_validation');
  assert.equal(JSON.stringify(openai).includes('unit_openai'), false);
});
test('model catalog exposes only allowlisted models with explicit response capabilities', async () => {
  const repository = new MemoryRepository();
  const registry = {
    models: async () => [
      { id: 'unit-model', label: 'Unit model' },
      { id: 'outside-model', label: 'Outside model' },
    ],
  } as unknown as ProviderRegistry;
  const service = new CredentialService(repository as unknown as CredentialRepository, new CredentialCryptoService(config), catalog, registry, config);
  const credential = await service.upsert(auth, { provider: 'openai', apiKey: 'unit_openai' });
  await service.test(auth, credential.id);
  assert.deepEqual(await service.models(auth, credential.id), [{
    id: 'unit-model',
    label: 'Unit model',
    capabilities: ['text-output', 'structured-output'],
  }]);
});
test('provider outage preserves credential status while authentication rejection invalidates it', async () => {
  const repository = new MemoryRepository();
  let failure: Error = new ServiceUnavailableException('ai_provider_unavailable');
  const provider = { models: async () => { throw failure; } } as unknown as ProviderRegistry;
  const service = new CredentialService(repository as unknown as CredentialRepository, new CredentialCryptoService(config), catalog, provider, config);
  const created = await service.upsert(auth, { provider: 'anthropic', apiKey: 'unit_secret-key' });
  await assert.rejects(() => service.test(auth, created.id), /ai_provider_unavailable/);
  assert.equal(repository.records[0].status, 'pending_validation');
  failure = new UnauthorizedException('ai_credential_invalid');
  await assert.rejects(() => service.test(auth, created.id), /ai_credential_invalid/);
  assert.equal(repository.records[0].status, 'invalid');
  await assert.rejects(() => service.models({ ...auth, clientId: 'other' }, created.id), /Active credential not found/);
});
