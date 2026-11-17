import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { DomainApplicationContextService } from './application-context.service';
import { DomainIntegrationRequestContext, ResolvedApplicationContext } from './domain-integration.types';

function context(overrides: Partial<DomainIntegrationRequestContext> = {}): DomainIntegrationRequestContext {
  return {
    identityId: randomUUID(),
    clientId: randomUUID(),
    applicationId: randomUUID(),
    databaseRef: randomUUID(),
    scopes: ['flow:read', 'flow:write'],
    roles: [],
    ...overrides
  };
}

void test('requireCaller rejects a token scope missing from the caller context', async () => {
  const service = new DomainApplicationContextService({ resolveApplicationContext: async () => null } as never);
  await assert.rejects(
    () => service.requireCaller(context({ scopes: ['flow:read'] }), 'flow', ['flow:write']),
    (error) => error instanceof ForbiddenException
  );
});

void test('requireCaller rejects a database reference from another application context', async () => {
  const caller = context();
  const resolved: ResolvedApplicationContext = { ...caller, databaseRef: randomUUID() };
  const service = new DomainApplicationContextService({
    resolveApplicationContext: async () => resolved
  } as never);

  await assert.rejects(
    () => service.requireCaller(caller, 'flow', ['flow:read']),
    (error) => error instanceof ForbiddenException
  );
});

void test('requireApplication resolves a destination independently from caller database reference', async () => {
  const caller = context();
  const juridico = { ...caller, applicationId: randomUUID(), databaseRef: randomUUID(), scopes: ['juridico:read'] };
  const service = new DomainApplicationContextService({
    resolveApplicationContext: async () => juridico
  } as never);

  assert.equal(
    (await service.requireApplication(caller, 'juridico', ['juridico:read'])).databaseRef,
    juridico.databaseRef
  );
});
