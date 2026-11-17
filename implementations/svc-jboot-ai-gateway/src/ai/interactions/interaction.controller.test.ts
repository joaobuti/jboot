import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExecutionService } from '../executions/execution.service';
import { InteractionController } from './interaction.controller';

void test('interaction controller rejects divergent idempotency identity before execution', async () => {
  let calls = 0;
  const controller = new InteractionController({
    interact: async () => { calls++; return {}; },
  } as unknown as ExecutionService);
  const auth = { clientId: 'tenant', identityId: 'owner', applicationSlug: 'flow', scopes: ['ai:execute'], roles: [] };
  const body = {
    agentId: '11111111-1111-4111-8111-111111111111',
    requestId: '22222222-2222-4222-8222-222222222222',
    input: { message: 'unit' },
  };
  assert.throws(() => controller.interact(auth, '33333333-3333-4333-8333-333333333333', body), /requestId must match Idempotency-Key/);
  assert.equal(calls, 0);
  await controller.interact(auth, body.requestId, body);
  assert.equal(calls, 1);
});
