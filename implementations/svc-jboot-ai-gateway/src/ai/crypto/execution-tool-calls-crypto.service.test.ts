import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppConfigService } from '../../config/app-config.service';
import { ExecutionToolCallsCryptoService } from './execution-tool-calls-crypto.service';

void test('execution tool calls are encrypted and bound to execution tenant and application', () => {
  const original = process.env.AI_GATEWAY_ENCRYPTION_KEY_BASE64;
  process.env.AI_GATEWAY_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');
  try {
    const crypto = new ExecutionToolCallsCryptoService(new AppConfigService());
    const binding = { executionId: 'execution', clientId: 'tenant', applicationSlug: 'flow' };
    const calls = [{ callId: 'call', toolId: 'kanban.card.append_activity', arguments: { text: 'unit-sensitive-canary' } }];
    const envelope = crypto.encrypt(calls, binding);
    assert.equal(envelope.ciphertext.includes(Buffer.from('unit-sensitive-canary')), false);
    assert.deepEqual(crypto.decrypt(envelope, binding), calls);
    assert.throws(() => crypto.decrypt(envelope, { ...binding, clientId: 'other' }));
  } finally {
    if (original === undefined) delete process.env.AI_GATEWAY_ENCRYPTION_KEY_BASE64;
    else process.env.AI_GATEWAY_ENCRYPTION_KEY_BASE64 = original;
  }
});
