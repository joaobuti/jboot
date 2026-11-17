import 'reflect-metadata';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { REQUIRED_SCOPES_KEY, ScopeGuard } from '../guards/scope.guard';
import { ComandaAdminController } from './comanda-admin.controller';

const HANDLERS = [
  'pendentes',
  'encaminhar',
  'fila',
  'finalizar',
  'prontos',
  'liberar',
  'cancelar',
  'listComandas',
  'comandaDetail',
  'fechar'
] as const;

void test('ComandaAdminController uses PdvAuthGuard + ScopeGuard at class level', () => {
  const guardsMetadata = Reflect.getMetadata(GUARDS_METADATA, ComandaAdminController) as unknown[];
  assert.ok(guardsMetadata.some((guard) => guard === ScopeGuard));
});

void test('every ComandaAdminController handler declares RequireScopes', () => {
  const reflector = new Reflector();
  for (const handlerName of HANDLERS) {
    const handler = ComandaAdminController.prototype[handlerName];
    const scopes = reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [handler, ComandaAdminController]);
    assert.ok(Array.isArray(scopes) && scopes.length > 0, `handler "${handlerName}" is missing @RequireScopes`);
  }
});

void test('balcao-only handlers require pdv:comanda:balcao', () => {
  const reflector = new Reflector();
  for (const handlerName of [
    'pendentes',
    'encaminhar',
    'prontos',
    'liberar',
    'cancelar',
    'listComandas',
    'comandaDetail',
    'fechar'
  ] as const) {
    const handler = ComandaAdminController.prototype[handlerName];
    const scopes = reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [handler, ComandaAdminController]);
    assert.deepEqual(scopes, ['pdv:comanda:balcao'], `handler "${handlerName}" should require only pdv:comanda:balcao`);
  }
});

void test('fila and finalizar accept either pdv:comanda:cozinha or pdv:comanda:bar (exact match checked in the service)', () => {
  const reflector = new Reflector();
  for (const handlerName of ['fila', 'finalizar'] as const) {
    const handler = ComandaAdminController.prototype[handlerName];
    const scopes = reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [handler, ComandaAdminController]);
    assert.ok(scopes.includes('pdv:comanda:cozinha'), `handler "${handlerName}" should allow pdv:comanda:cozinha`);
    assert.ok(scopes.includes('pdv:comanda:bar'), `handler "${handlerName}" should allow pdv:comanda:bar`);
  }
});
