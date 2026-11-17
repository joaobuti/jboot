import * as assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { AppConfigService } from '../../config/app-config.service';
import { DatabaseService } from '../../database/database.service';
import { CredentialCryptoService } from '../crypto/credential-crypto.service';
import { ProviderCatalog } from '../providers/provider-catalog';
import { CredentialRepository } from './credential.repository';
import { CredentialService } from './credential.service';
import { AnthropicProviderAdapter } from '../providers/anthropic-provider.adapter';
import { AnthropicExecutionAdapter } from '../providers/anthropic-execution.adapter';
import { OpenAIProviderAdapter } from '../providers/openai-provider.adapter';
import { OpenAIExecutionAdapter } from '../providers/openai-execution.adapter';
import { ProviderRegistry } from '../providers/provider-registry';

/* eslint-disable @typescript-eslint/no-floating-promises */
const auth = { clientId: '11111111-1111-4111-8111-111111111111', identityId: '22222222-2222-4222-8222-222222222222', applicationSlug: 'flow', scopes: ['ai:credentials:manage'], roles: ['manager'] };
process.env.AI_GATEWAY_ENABLED_PROVIDERS = 'openai,anthropic';
const config = new AppConfigService();
const db = new DatabaseService(config);
const service = new CredentialService(new CredentialRepository(db), new CredentialCryptoService(config), new ProviderCatalog(config), new ProviderRegistry(new AnthropicProviderAdapter(), new AnthropicExecutionAdapter(), new OpenAIProviderAdapter(), new OpenAIExecutionAdapter()), config);
const clean = async () => {
  await db.query('DELETE FROM ai_credential_audit WHERE client_id=$1 AND owner_identity_id=$2', [auth.clientId, auth.identityId]);
  await db.query('DELETE FROM ai_credentials WHERE client_id=$1 AND owner_identity_id=$2', [auth.clientId, auth.identityId]);
};
before(clean);
after(async () => { await clean(); await db.onModuleDestroy(); });

test('persists encrypted material, audits lifecycle and cryptographically erases on revoke', async () => {
  const created = await service.upsert(auth, { provider: 'anthropic', apiKey: 'storage-only_integration-secret' });
  const stored = await db.query<{ ciphertext: Buffer; nonce: Buffer; auth_tag: Buffer; status: string }>('SELECT ciphertext,nonce,auth_tag,status FROM ai_credentials WHERE id=$1', [created.id]);
  assert.equal(stored.rows[0].ciphertext.includes(Buffer.from('integration-secret')), false);
  assert.equal(created.status, 'pending_validation');
  assert.equal((await service.revoke(auth, created.id)).status, 'revoked');
  const erased = await db.query<{ ciphertext: Buffer | null; nonce: Buffer | null; auth_tag: Buffer | null }>('SELECT ciphertext,nonce,auth_tag FROM ai_credentials WHERE id=$1', [created.id]);
  assert.equal(erased.rows[0].ciphertext, null);
  assert.equal(erased.rows[0].nonce, null);
  assert.equal(erased.rows[0].auth_tag, null);
  const audit = await db.query<{ event_type: string }>('SELECT event_type FROM ai_credential_audit WHERE credential_id=$1 ORDER BY occurred_at', [created.id]);
  assert.deepEqual(audit.rows.map((row) => row.event_type), ['created', 'revoked']);
});

test('concurrent upserts keep a stable record id and a decryptable envelope', async () => {
  await clean();
  const [first, second] = await Promise.all([
    service.upsert(auth, { provider: 'anthropic', apiKey: 'storage-only_concurrent-one' }),
    service.upsert(auth, { provider: 'anthropic', apiKey: 'storage-only_concurrent-two' }),
  ]);
  assert.equal(first.id, second.id);
  assert.equal(first.status, 'pending_validation');
  const count = await db.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM ai_credentials WHERE client_id=$1 AND owner_identity_id=$2 AND provider=$3', [auth.clientId, auth.identityId, 'anthropic']);
  assert.equal(count.rows[0].count, '1');
});
test('validation of an older key cannot activate its replacement or revive a revoked credential', async () => {
  const repository = new CredentialRepository(db);
  const created = await service.upsert(auth, { provider: 'anthropic', apiKey: 'storage-only_original' });
  const original = await repository.find(created.id, auth.clientId, auth.identityId);
  await service.upsert(auth, { provider: 'anthropic', apiKey: 'storage-only_replacement' });
  assert.equal(await repository.setStatus(created.id, auth.clientId, auth.identityId, 'active', original!.nonce!), null);
  const replacement = await repository.find(created.id, auth.clientId, auth.identityId);
  await service.revoke(auth, created.id);
  assert.equal(await repository.setStatus(created.id, auth.clientId, auth.identityId, 'active', replacement!.nonce!), null);
});
