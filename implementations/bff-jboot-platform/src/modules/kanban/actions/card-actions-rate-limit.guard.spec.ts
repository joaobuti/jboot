import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { HttpException } from '@nestjs/common';
import { CardActionsRateLimitGuard } from './card-actions-rate-limit.guard';

void test('Actions rate limit isolates tenant/user, rejects excess and recovers after window', () => {
  const guard = new CardActionsRateLimitGuard();
  const execution = (clientId: string, identityId = 'user') => ({
    switchToHttp: () => ({ getRequest: () => ({ kanbanContext: { clientId, identityId } }) })
  }) as never;
  const originalNow = Date.now;
  let now = 100_000;
  Date.now = () => now;
  try {
    for (let i = 0; i < 120; i++) assert.equal(guard.canActivate(execution('a')), true);
    assert.throws(() => guard.canActivate(execution('a')), (error: HttpException) => error.getStatus() === 429);
    assert.equal(guard.canActivate(execution('b')), true);
    assert.equal(guard.canActivate(execution('a', 'other')), true);
    now += 60_001;
    assert.equal(guard.canActivate(execution('a')), true);
  } finally { Date.now = originalNow; }
});
