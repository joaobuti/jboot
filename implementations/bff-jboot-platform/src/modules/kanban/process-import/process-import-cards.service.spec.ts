import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ForbiddenException } from '@nestjs/common';
import { ProcessImportCardsService } from './process-import-cards.service';
import { ImportLotRow, ImportRowRecord } from './process-import.repository';

// Dados ficticios: CPF sintetico e CNJ calculado.
const NUMBER = '00000017420264014200';
const ctx = { databaseRef: 'db', clientId: 'tenant', identityId: 'me', applicationId: 'app', scopes: [], roles: [] };
const lot: ImportLotRow = {
  id: 'lot', boardId: 'board', officeId: 'office', createdByIdentityId: 'me', status: 'processing', totalRows: 1,
  createdCount: 0, existingCount: 0, failedCount: 0, failureCode: null, createdAt: '', startedAt: null, finishedAt: null
};
const baseRow: ImportRowRecord = {
  id: 'row', line: 2, processNumber: NUMBER, tribunal: 'TRF1', customerName: 'Teste', customerCpf: '52998224725', situation: 'REPLICA 30/06',
  status: 'pending', cardId: null, customerId: null, existingCardId: null, existingBoardId: null, extrasDone: false, skippedAssignees: 0, errorCode: null
};

interface Options { owner?: unknown; customerCreated?: boolean; cardFails?: boolean; viewer?: { isAdmin: boolean; officeIds: string[] }; office?: { active: boolean } | null }

function build(options: Options = {}) {
  const calls: string[] = [];
  const service = new ProcessImportCardsService(
    {
      findProcessOwners: async () => new Map(options.owner ? [[NUMBER, options.owner]] : []),
      markRow: async (_db: string, _c: string, _id: string, patch: Record<string, unknown>) => { calls.push(`mark:${JSON.stringify(patch)}`); },
      addAssignees: async (_db: string, _c: string, cardId: string, ids: string[]) => { calls.push(`assign:${cardId}:${ids.join(',')}`); return ids.length; }
    } as never,
    { requireBoard: async () => ({}), requireRole: async () => 'board_member' } as never,
    { resolve: async () => ({ identityId: 'me', clientId: 'tenant', isAdmin: false, officeIds: ['office'], officeVisibilityEnabled: true, ...options.viewer }) } as never,
    {
      findById: async () => (options.office === undefined ? { active: true } : options.office),
      listResponsibles: async () => new Map([['office', ['resp-1', 'resp-2']]])
    } as never,
    {} as never,
    {
      createIfCpfAbsent: async () => (options.customerCreated === false ? { created: false, existingIds: ['old-customer'] } : { created: true, id: 'new-customer' }),
      discardJustCreated: async (_c: string, id: string) => { calls.push(`discard:${id}`); return true; }
    } as never,
    {} as never,
    { replace: async (_db: string, _c: string, cardId: string, customerId: string) => { calls.push(`customer:${cardId}:${customerId}`); } } as never,
    {
      createInDefaultColumnFromSource: async (_c: unknown, boardId: string, input: { sourceType: string; sourceId: string; officeId: string }) => {
        if (options.cardFails) throw new Error('card failed');
        calls.push(`card:${boardId}:${input.sourceType}:${input.sourceId}:${input.officeId}`);
        return { card: { id: 'card-1' }, created: true };
      }
    } as never,
    { createComment: async (_db: string, _c: string, cardId: string, _who: string, text: string) => { calls.push(`comment:${cardId}:${text}`); } } as never,
    { identitiesWhoSeeCard: async () => ['resp-1'] } as never,
    { record: async () => undefined } as never
  );
  return { service, calls };
}

void test('Linha nova: cliente, card na coluna padrao com escritorio do lote, STATUS como comentario e responsaveis que veem o card', async () => {
  const { service, calls } = build();
  const outcome = await service.processRow(ctx, ctx, lot, baseRow);
  assert.deepEqual(outcome, { status: 'created', cardId: 'card-1', customerId: 'new-customer', skippedAssignees: 1 });
  assert.deepEqual(calls, [
    `card:board:flow_process_import:${NUMBER}:office`,
    'customer:card-1:new-customer',
    'mark:{"cardId":"card-1","customerId":"new-customer"}',
    'comment:card-1:Situacao na planilha: REPLICA 30/06',
    'assign:card-1:resp-1',
    'mark:{"extrasDone":true,"skippedAssignees":1}'
  ]);
});

void test('Numero ja usado por outro card: linha vira "existing" sem criar nada', async () => {
  const { service, calls } = build({ owner: { kind: 'petition', cardId: 'other', boardId: 'b2' } });
  const outcome = await service.processRow(ctx, ctx, lot, baseRow);
  assert.equal(outcome.status, 'existing');
  assert.deepEqual(calls, ['mark:{"status":"existing","existingCardId":"other","existingBoardId":"b2"}']);
});

void test('Retomada: card proprio da importacao no mesmo board segue; extras ja feitos nao se repetem', async () => {
  const { service, calls } = build({ owner: { kind: 'import_card', cardId: 'card-1', boardId: 'board' }, customerCreated: false });
  const outcome = await service.processRow(ctx, ctx, lot, { ...baseRow, cardId: 'card-1', customerId: 'old-customer', extrasDone: true });
  assert.equal(outcome.status, 'created');
  assert.ok(!calls.some((call) => call.startsWith('comment:') || call.startsWith('assign:')));
});

void test('Falha ao criar o card desfaz o cliente criado agora; cliente que ja existia nao e tocado', async () => {
  const created = build({ cardFails: true });
  await assert.rejects(() => created.service.processRow(ctx, ctx, lot, baseRow), /card failed/);
  assert.ok(created.calls.includes('discard:new-customer'));
  const existing = build({ cardFails: true, customerCreated: false });
  await assert.rejects(() => existing.service.processRow(ctx, ctx, lot, baseRow), /card failed/);
  assert.ok(!existing.calls.some((call) => call.startsWith('discard:')));
});

void test('Escritorio: usuario so importa para os seus; admin para qualquer ativo; inativo recusado', async () => {
  await build().service.authorize(ctx, 'board', 'office');
  await assert.rejects(() => build().service.authorize(ctx, 'board', 'other-office'), ForbiddenException);
  await build({ viewer: { isAdmin: true, officeIds: [] } }).service.authorize(ctx, 'board', 'other-office');
  await assert.rejects(() => build({ office: { active: false } }).service.authorize(ctx, 'board', 'office'), ForbiddenException);
});
