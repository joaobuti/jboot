import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { KanbanAuthGuard } from '../guards/kanban-auth.guard';
import { REQUIRED_SCOPES_KEY, ScopeGuard } from '../guards/scope.guard';
import { OfficesController } from './offices.controller';

void test('OfficesController: guards de auth e scope na classe; toda rota administrativa exige flow:admin', () => {
  const guards = Reflect.getMetadata(GUARDS_METADATA, OfficesController) as unknown[];
  assert.deepEqual(guards, [KanbanAuthGuard, ScopeGuard]);
  const prototype = OfficesController.prototype as unknown as Record<string, unknown>;
  const handlers = Object.getOwnPropertyNames(prototype).filter((name) => name !== 'constructor');
  assert.equal(handlers.length, 13);
  for (const name of handlers) {
    const scopes = Reflect.getMetadata(REQUIRED_SCOPES_KEY, prototype[name] as object) as string[] | undefined;
    if (name === 'context') {
      assert.equal(scopes, undefined, 'contexto de escritorio e lido por todo usuario do Flow');
    } else if (name === 'myOffice' || name === 'chooseMyOffice') {
      assert.deepEqual(scopes, ['flow:read'], 'escritorio ativo e de todo usuario do Flow');
    } else if (name === 'userManagementContext') {
      assert.deepEqual(scopes, ['users:manage', 'flow:users:manage']);
    } else {
      assert.deepEqual(scopes, ['flow:admin'], `${name} exige flow:admin`);
    }
  }
});
