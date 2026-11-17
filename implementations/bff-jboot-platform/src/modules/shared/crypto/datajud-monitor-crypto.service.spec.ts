import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DataJudMonitorCryptoService } from './datajud-monitor-crypto.service';

const config = { juridicoMonitorEncryptionKey: 'dev-only-monitor-encryption-key' } as never;

void test('DataJudMonitorCryptoService encrypts and decrypts a CNJ number', () => {
  const crypto = new DataJudMonitorCryptoService(config);
  const cipher = crypto.encrypt('client-a', '50060041320218240058');
  // iv (12) + auth tag (16) + ciphertext
  assert.equal(cipher.length, 28 + '50060041320218240058'.length);
  assert.equal(crypto.decrypt('client-a', cipher), '50060041320218240058');
});

void test('DataJudMonitorCryptoService isolates ciphertext per client', () => {
  const crypto = new DataJudMonitorCryptoService(config);
  const cipher = crypto.encrypt('client-a', '50060041320218240058');
  assert.throws(() => crypto.decrypt('client-b', cipher));
});

void test('DataJudMonitorCryptoService rejects a truncated ciphertext', () => {
  const crypto = new DataJudMonitorCryptoService(config);
  assert.throws(() => crypto.decrypt('client-a', Buffer.alloc(10)));
});
