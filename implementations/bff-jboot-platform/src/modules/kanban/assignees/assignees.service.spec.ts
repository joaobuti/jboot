import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AssigneesService } from './assignees.service';

const context = { clientId: 'c1', identityId: 'approver', databaseRef: 'ref', scopes: [], roles: [] } as never;
const mutate = { ...(context as object), ip: '127.0.0.1', userAgent: 'test', identityId: 'approver' } as never;

void test('responsavel pelo sistema: so membro ativo do board que ve o card; os outros ficam de fora com o motivo', async () => {
  const created: string[] = [];
  const events: Array<{ type: string; payload: unknown }> = [];
  const notified: string[] = [];
  const service = new AssigneesService(
    { create: async (_r: string, _c: string, _card: string, identityId: string) => { created.push(identityId); return { identityId }; } } as never,
    { identitiesWhoSeeCard: async (_r: string, _c: string, _b: string, _card: string, ids: string[]) => ids.filter((id) => id !== 'outro-escritorio') } as never,
    { findActiveMembership: async (_r: string, _c: string, _b: string, id: string) => (id === 'fora-do-board' ? null : { role: 'board_member' }) } as never,
    { createSystemEvent: async (_r: string, _c: string, _card: string, _actor: string, type: string, payload: unknown) => { events.push({ type, payload }); } } as never,
    // Sem checagem de papel de quem confirmou: o acesso ao board nao e consultado.
    { requireBoard: async () => { throw new Error('nao deve exigir acesso de quem confirmou'); } } as never,
    { notify: async (_c: unknown, input: { recipientIdentityId: string }) => { notified.push(input.recipientIdentityId); } } as never
  );

  const result = await service.assignBySystem(context, 'board', 'card', ['ana', 'fora-do-board', 'outro-escritorio'], mutate);

  assert.deepEqual(result, {
    assigned: ['ana'],
    skipped: [
      { identityId: 'fora-do-board', reason: 'not_board_member' },
      { identityId: 'outro-escritorio', reason: 'not_in_card_office' }
    ]
  });
  assert.deepEqual(created, ['ana']);
  assert.deepEqual(events, [{ type: 'card.assignee_added', payload: { identityId: 'ana' } }]);
  assert.deepEqual(notified, ['ana'], 'o responsavel recebe a notificacao de card atribuido');
});
