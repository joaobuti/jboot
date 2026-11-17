import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isChecklistPending } from './checklist-pending';

void test('isChecklistPending: so coluna com flag e obrigatorio ativo ainda nao aceito', () => {
  assert.equal(isChecklistPending(true, { acceptedRequired: 1, totalRequired: 3 }), true);
  assert.equal(isChecklistPending(true, { acceptedRequired: 3, totalRequired: 3 }), false, 'checklist completo');
  assert.equal(isChecklistPending(true, { acceptedRequired: 0, totalRequired: 0 }), false, 'quadro sem obrigatorio ativo');
  assert.equal(isChecklistPending(false, { acceptedRequired: 0, totalRequired: 3 }), false, 'coluna sem flag nunca sinaliza');
});
