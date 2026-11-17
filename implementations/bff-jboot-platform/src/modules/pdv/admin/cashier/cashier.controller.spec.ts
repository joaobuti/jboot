import 'reflect-metadata';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { REQUIRED_SCOPES_KEY, ScopeGuard } from '../guards/scope.guard';
import { CashierController } from './cashier.controller';

const HANDLERS = ['open', 'current', 'summary', 'close', 'createMovement'] as const;

void test('CashierController uses PdvAuthGuard + ScopeGuard at class level', () => {
  const guardsMetadata = Reflect.getMetadata(GUARDS_METADATA, CashierController) as unknown[];

  assert.ok(guardsMetadata.some((guard) => guard === ScopeGuard));
});

void test('every CashierController handler declares RequireScopes', () => {
  const reflector = new Reflector();

  for (const handlerName of HANDLERS) {
    const handler = CashierController.prototype[handlerName];
    const scopes = reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [handler, CashierController]);

    assert.ok(Array.isArray(scopes) && scopes.length > 0, `handler "${handlerName}" is missing @RequireScopes`);
  }
});

void test('open, close and movements require pdv:cashier:write', () => {
  const reflector = new Reflector();

  for (const handlerName of ['open', 'close', 'createMovement'] as const) {
    const handler = CashierController.prototype[handlerName];
    const scopes = reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [handler, CashierController]);

    assert.ok(scopes.includes('pdv:cashier:write'), `handler "${handlerName}" should require pdv:cashier:write`);
  }
});

void test('current and summary require pdv:cashier:read', () => {
  const reflector = new Reflector();

  for (const handlerName of ['current', 'summary'] as const) {
    const handler = CashierController.prototype[handlerName];
    const scopes = reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [handler, CashierController]);

    assert.ok(scopes.includes('pdv:cashier:read'), `handler "${handlerName}" should require pdv:cashier:read`);
  }
});
