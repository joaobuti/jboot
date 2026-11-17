import 'reflect-metadata';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PublicMenuController } from './public-menu.controller';

// Guarda de regressao para a regra do MODULE_CONTRACT.md do catalog:
// "Controller publico nunca deve declarar @UseGuards(PdvAuthGuard, ...)".
// Se algum dia alguem anexar PdvAuthGuard/ScopeGuard aqui por engano
// (ex.: copiando o padrao dos outros controllers do modulo), este teste falha.
void test('PublicMenuController declares no guards at the class level', () => {
  const guardsMetadata = Reflect.getMetadata(GUARDS_METADATA, PublicMenuController) as unknown[] | undefined;

  assert.equal(guardsMetadata, undefined);
});

void test('PublicMenuController.getMenu declares no guards at the handler level', () => {
  const guardsMetadata = Reflect.getMetadata(GUARDS_METADATA, PublicMenuController.prototype.getMenu) as
    | unknown[]
    | undefined;

  assert.equal(guardsMetadata, undefined);
});
