import 'reflect-metadata';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ComandaSessionController } from './comanda-session.controller';
import { ComandaSessionGuard } from '../guards/comanda-session.guard';

// Regressao do MODULE_CONTRACT.md do comanda: "POST /comanda/public/sessions"
// e a abertura da sessao — nao pode exigir sessao previa (nem PdvAuthGuard).
void test('createSession declares no guards (session does not exist yet at this point)', () => {
  const classGuards = Reflect.getMetadata(GUARDS_METADATA, ComandaSessionController) as unknown[] | undefined;
  const handlerGuards = Reflect.getMetadata(GUARDS_METADATA, ComandaSessionController.prototype.createSession) as
    | unknown[]
    | undefined;

  assert.equal(classGuards, undefined);
  assert.equal(handlerGuards, undefined);
});

void test('refreshSession requires ComandaSessionGuard (an active session to slide)', () => {
  const handlerGuards = Reflect.getMetadata(GUARDS_METADATA, ComandaSessionController.prototype.refreshSession) as
    | unknown[]
    | undefined;

  assert.deepEqual(handlerGuards, [ComandaSessionGuard]);
});
