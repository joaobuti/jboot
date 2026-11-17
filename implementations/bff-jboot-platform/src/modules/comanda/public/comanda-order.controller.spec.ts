import 'reflect-metadata';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ComandaOrderController } from './comanda-order.controller';
import { ComandaSessionGuard } from '../guards/comanda-session.guard';

// Regressao do MODULE_CONTRACT.md do comanda: toda rota autenticada do lado
// cliente usa ComandaSessionGuard, nunca PdvAuthGuard.
void test('ComandaOrderController requires ComandaSessionGuard at the class level', () => {
  const classGuards = Reflect.getMetadata(GUARDS_METADATA, ComandaOrderController) as unknown[] | undefined;

  assert.deepEqual(classGuards, [ComandaSessionGuard]);
});
