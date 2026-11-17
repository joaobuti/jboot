import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { REQUIRED_SCOPES_KEY } from '../guards/scope.guard';
import { FlowCustomersController } from './flow-customers.controller';

const cases: Array<[keyof FlowCustomersController, string[]]> = [
  ['list', ['flow:customers:read', 'flow:admin']],
  ['get', ['flow:customers:read', 'flow:admin']],
  ['listCards', ['flow:customers:read', 'flow:admin']],
  ['create', ['flow:customers:write', 'flow:admin']],
  ['update', ['flow:customers:write', 'flow:admin']],
  ['createCard', ['flow:customers:write', 'flow:admin']],
  ['linkExistingCard', ['flow:customers:write', 'flow:admin']]
];

for (const [method, expected] of cases) {
  void test(`${String(method)} requires a dedicated customer scope or flow:admin`, () => {
    assert.deepEqual(Reflect.getMetadata(REQUIRED_SCOPES_KEY, FlowCustomersController.prototype[method]), expected);
  });
}
