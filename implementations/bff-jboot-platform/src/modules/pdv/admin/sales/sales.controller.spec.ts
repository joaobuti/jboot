import 'reflect-metadata';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { REQUIRED_SCOPES_KEY, ScopeGuard } from '../guards/scope.guard';
import { SalesController } from './sales.controller';

const HANDLERS = [
  'list',
  'create',
  'findOne',
  'comandaCustomer',
  'addItem',
  'removeItem',
  'updateItem',
  'applyDiscount',
  'addPayment',
  'initiatePix',
  'verifyPix',
  'complete',
  'emitNf',
  'cancel'
] as const;

void test('SalesController uses PdvAuthGuard + ScopeGuard at class level', () => {
  const guardsMetadata = Reflect.getMetadata(GUARDS_METADATA, SalesController) as unknown[];

  assert.ok(guardsMetadata.some((guard) => guard === ScopeGuard));
});

void test('every SalesController handler declares RequireScopes', () => {
  const reflector = new Reflector();

  for (const handlerName of HANDLERS) {
    const handler = SalesController.prototype[handlerName];
    const scopes = reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [handler, SalesController]);

    assert.ok(Array.isArray(scopes) && scopes.length > 0, `handler "${handlerName}" is missing @RequireScopes`);
  }
});

void test('mutating SalesController handlers require pdv:sales:write', () => {
  const reflector = new Reflector();
  const writeHandlers = ['create', 'addItem', 'removeItem', 'updateItem', 'applyDiscount', 'addPayment', 'initiatePix', 'complete', 'emitNf', 'cancel'] as const;

  for (const handlerName of writeHandlers) {
    const handler = SalesController.prototype[handlerName];
    const scopes = reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [handler, SalesController]);

    assert.ok(scopes.includes('pdv:sales:write'), `handler "${handlerName}" should require pdv:sales:write`);
  }
});

void test('read-only SalesController handlers require pdv:sales:read', () => {
  const reflector = new Reflector();

  for (const handlerName of ['list', 'findOne', 'comandaCustomer', 'verifyPix'] as const) {
    const handler = SalesController.prototype[handlerName];
    const scopes = reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [handler, SalesController]);

    assert.ok(scopes.includes('pdv:sales:read'), `handler "${handlerName}" should require pdv:sales:read`);
  }
});
