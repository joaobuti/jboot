import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { canSeeCard, KanbanViewer, seesAllCards, visibleCardScope } from './card-visibility';
import { KanbanViewerResolver } from './kanban-viewer-resolver.service';

const base: KanbanViewer = { identityId: 'u1', clientId: 'c1', isAdmin: false, officeIds: ['oA'], officeVisibilityEnabled: true };

void test('seesAllCards: flow:admin, com a chave ligada ou desligada (regra de 2026-11-11)', () => {
  assert.equal(seesAllCards({ ...base, isAdmin: true }), true);
  assert.equal(seesAllCards({ ...base, isAdmin: true, officeVisibilityEnabled: false }), true);
  assert.equal(seesAllCards(base), false);
});

void test('canSeeCard: matriz de chave x admin x membresia x escritorio', () => {
  const cases: Array<[string, KanbanViewer, string | null, boolean, boolean]> = [
    ['admin chave ligada, nao membro, card de outro escritorio', { ...base, isAdmin: true, officeIds: [] }, 'oB', false, true],
    ['admin chave ligada, card sem escritorio', { ...base, isAdmin: true }, null, false, true],
    ['admin chave desligada, nao membro', { ...base, isAdmin: true, officeVisibilityEnabled: false }, 'oA', false, true],
    ['admin chave desligada, membro', { ...base, isAdmin: true, officeVisibilityEnabled: false }, 'oB', true, true],
    ['membro do escritorio do card', base, 'oA', true, true],
    ['membro de outro escritorio', base, 'oB', true, false],
    ['membro, card sem escritorio', base, null, true, false],
    ['nao membro do escritorio do card', base, 'oA', false, false],
    ['sem escritorio, chave ligada', { ...base, officeIds: [] }, 'oA', true, false],
    ['chave desligada: so membresia', { ...base, officeVisibilityEnabled: false, officeIds: [] }, 'oB', true, true],
    ['chave desligada, nao membro', { ...base, officeVisibilityEnabled: false }, 'oA', false, false]
  ];
  for (const [label, viewer, officeId, member, expected] of cases) {
    assert.equal(canSeeCard(viewer, { officeId }, member), expected, label);
  }
});

void test('visibleCardScope: fragmento e parametros por caso', () => {
  assert.deepEqual(visibleCardScope({ ...base, isAdmin: true }, 'c', 3), { sql: 'TRUE', params: [] });

  const off = visibleCardScope({ ...base, officeVisibilityEnabled: false }, 'c', 3);
  assert.match(off.sql, /vis_m\.board_id = c\.board_id/);
  assert.match(off.sql, /vis_m\.identity_id = \$3::uuid AND vis_m\.status = 'active'/);
  assert.doesNotMatch(off.sql, /office_id/);
  assert.deepEqual(off.params, ['u1']);

  const on = visibleCardScope(base, 'kanban_cards', 9);
  assert.match(on.sql, /kanban_cards\.office_id = ANY\(\$10::uuid\[\]\)/);
  assert.match(on.sql, /vis_m\.identity_id = \$9::uuid/);
  assert.deepEqual(on.params, ['u1', ['oA']]);
});

void test('visibleCardScope recusa alias ou placeholder invalidos (sem SQL injetavel)', () => {
  assert.throws(() => visibleCardScope(base, 'c; DROP TABLE x', 1), /invalid sql alias/);
  assert.throws(() => visibleCardScope(base, 'c', 0), /invalid first param/);
});

void test('KanbanViewerResolver: admin pelo scope do JWT, uma consulta por objeto de contexto, falha nao memoizada', async () => {
  let calls = 0;
  let fail = true;
  const resolver = new KanbanViewerResolver({
    loadViewerState: async () => {
      calls += 1;
      if (fail) {
        fail = false;
        throw new Error('db down');
      }
      return { officeVisibilityEnabled: true, officeIds: ['oA'] };
    }
  } as never);
  const context = { identityId: 'u1', clientId: 'c1', databaseRef: 'db', applicationId: 'a', roles: [], scopes: ['flow:read', 'flow:admin'] };
  await assert.rejects(resolver.resolve(context), /db down/);
  const first = await resolver.resolve(context);
  const second = await resolver.resolve(context);
  assert.equal(first, second);
  assert.deepEqual(first, { identityId: 'u1', clientId: 'c1', isAdmin: true, officeIds: ['oA'], officeVisibilityEnabled: true });
  assert.equal(calls, 2);
  // Copia do contexto (padrao do socket por evento) = nova leitura.
  const copy = await resolver.resolve({ ...context, scopes: ['flow:read'] });
  assert.equal(copy.isAdmin, false);
  assert.equal(calls, 3);
});
