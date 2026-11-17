import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { KanbanAuthGuard } from '../guards/kanban-auth.guard';
import { REQUIRED_SCOPES_KEY, ScopeGuard } from '../guards/scope.guard';
import { CardLeadController } from './card-lead.controller';
import { LeadsController } from './leads.controller';

function scopesOf(controller: { prototype: object }): Record<string, string[] | undefined> {
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.fromEntries(
    Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => [name, Reflect.getMetadata(REQUIRED_SCOPES_KEY, prototype[name] as object) as string[] | undefined])
  );
}

void test('controllers do lead: auth + scope na classe; envio flow:write; devolucao, fila e campos flow:admin', () => {
  for (const controller of [CardLeadController, LeadsController]) {
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, controller), [KanbanAuthGuard, ScopeGuard]);
  }
  assert.deepEqual(scopesOf(CardLeadController), {
    get: undefined,
    submit: ['flow:write'],
    returnToOffice: ['flow:admin']
  });
  assert.deepEqual(scopesOf(LeadsController), {
    queue: ['flow:admin'],
    getSettings: ['flow:admin'],
    updateSettings: ['flow:admin']
  });
});
