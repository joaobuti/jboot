import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FlowCustomerRateLimitGuard } from './flow-customer-rate-limit.guard';

void test('customer search limiter isolates buckets by tenant and identity without inspecting the search term', () => {
  const guard = new FlowCustomerRateLimitGuard();
  const execution = (clientId: string, identityId: string) => ({
    switchToHttp: () => ({ getRequest: () => ({ kanbanContext: { clientId, identityId } }) })
  }) as never;
  for (let index = 0; index < 60; index += 1) assert.equal(guard.canActivate(execution('tenant-a', 'user-a')), true);
  assert.throws(() => guard.canActivate(execution('tenant-a', 'user-a')));
  assert.equal(guard.canActivate(execution('tenant-a', 'user-b')), true);
  assert.equal(guard.canActivate(execution('tenant-b', 'user-a')), true);
});
