import * as assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { AppConfigService } from '../../config/app-config.service';
import { CredentialCryptoService } from './credential-crypto.service';

/* eslint-disable @typescript-eslint/no-floating-promises */

const oldKey = process.env.AI_GATEWAY_ENCRYPTION_KEY_BASE64;
process.env.AI_GATEWAY_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');
const binding = { id: '8d1f657e-5055-4514-bc72-8a9df0831444', clientId: 'tenant-a', ownerIdentityId: 'user-a', provider: 'fake' };

after(() => { if (oldKey === undefined) delete process.env.AI_GATEWAY_ENCRYPTION_KEY_BASE64; else process.env.AI_GATEWAY_ENCRYPTION_KEY_BASE64 = oldKey; });
test('encrypts and decrypts only with the original AAD binding', () => {
  const service = new CredentialCryptoService(new AppConfigService());
  const envelope = service.encrypt('fake_secret-value', binding);
  assert.notEqual(envelope.ciphertext.toString(), 'fake_secret-value');
  assert.equal(service.decrypt(envelope, binding), 'fake_secret-value');
  assert.throws(() => service.decrypt(envelope, { ...binding, clientId: 'tenant-b' }));
});
test('rejects tampered ciphertext', () => {
  const service = new CredentialCryptoService(new AppConfigService());
  const envelope = service.encrypt('fake_secret-value', binding);
  envelope.ciphertext[0] ^= 1;
  assert.throws(() => service.decrypt(envelope, binding));
});
