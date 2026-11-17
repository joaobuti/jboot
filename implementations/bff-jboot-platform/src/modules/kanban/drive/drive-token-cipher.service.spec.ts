import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { DriveTokenCipher } from './drive-token-cipher.service';

const cipher = (key = 'test-key') => new DriveTokenCipher({ flowDrive: { encryptionKey: key } } as never);

void describe('DriveTokenCipher', () => {
  void it('round-trips and never stores the plaintext', () => {
    const encrypted = cipher().encrypt('client-a', 'refresh-token');
    assert.equal(encrypted.includes(Buffer.from('refresh-token')), false);
    assert.equal(cipher().decrypt('client-a', encrypted), 'refresh-token');
  });
  void it('does not decrypt with another client id or key', () => {
    const encrypted = cipher().encrypt('client-a', 'refresh-token');
    assert.throws(() => cipher().decrypt('client-b', encrypted));
    assert.throws(() => cipher('other-key').decrypt('client-a', encrypted));
  });
  void it('fails closed when the encryption key is not configured', () => {
    assert.throws(() => cipher('').encrypt('client-a', 'x'), /encryption is not configured/);
  });
});
