import 'reflect-metadata';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_SCOPES_KEY, ScopeGuard } from './scope.guard';

function buildContext(requiredScopes: string[] | undefined, requestScopes: string[]) {
  const reflector = {
    getAllAndOverride: (key: string) => (key === REQUIRED_SCOPES_KEY ? requiredScopes : undefined)
  };
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ pdvContext: { scopes: requestScopes } })
    })
  };
  return { reflector, context };
}

void test('ScopeGuard allows when handler has no required scopes', () => {
  const { reflector, context } = buildContext(undefined, []);
  const guard = new ScopeGuard(reflector as never);

  assert.equal(guard.canActivate(context as never), true);
});

void test('ScopeGuard allows when caller has one of the required scopes', () => {
  const { reflector, context } = buildContext(['pdv:sales:write'], ['pdv:sales:write']);
  const guard = new ScopeGuard(reflector as never);

  assert.equal(guard.canActivate(context as never), true);
});

void test('ScopeGuard denies when caller has none of the required scopes', () => {
  const { reflector, context } = buildContext(['pdv:sales:write'], ['pdv:sales:read']);
  const guard = new ScopeGuard(reflector as never);

  assert.throws(() => guard.canActivate(context as never), ForbiddenException);
});

void test('ScopeGuard denies when caller has no scopes at all', () => {
  const { reflector, context } = buildContext(['pdv:cashier:write'], []);
  const guard = new ScopeGuard(reflector as never);

  assert.throws(() => guard.canActivate(context as never), ForbiddenException);
});

void test('real Reflector reads RequireScopes metadata set on a handler', () => {
  class Sample {
    handler() {
      return true;
    }
  }
  Reflect.defineMetadata(REQUIRED_SCOPES_KEY, ['pdv:sales:read'], Sample.prototype.handler);

  const reflector = new Reflector();
  const scopes = reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [Sample.prototype.handler, Sample]);

  assert.deepEqual(scopes, ['pdv:sales:read']);
});
