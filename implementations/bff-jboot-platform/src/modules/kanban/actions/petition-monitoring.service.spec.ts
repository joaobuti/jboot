import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PetitionMonitoringService } from './petition-monitoring.service';

const NUMBER = '00000016820268260100'; // sintetico, digito verificador valido (TJSP)
const ctx = { databaseRef: 'db', clientId: 'tenant', identityId: 'me', applicationId: 'app', scopes: ['flow:admin'], roles: [] };

interface Options {
  petition?: Record<string, unknown> | null;
  notExecutable?: boolean;
  createdCardId?: string;
  createdNew?: boolean;
  sentCardId?: string;
}

function build(options: Options = {}) {
  const calls: string[] = [];
  const petition = options.petition === undefined
    ? { id: 'p1', cardId: 'origin', customerId: 'customer', court: 'jec', bank: 'PAN', fileName: 'Inicial.docx', protocolNumber: NUMBER, monitoringBoardId: null, monitoringCardId: null, documentStatus: 'aprovado' }
    : options.petition;
  const created = options.createdCardId ?? 'new-card';
  const service = new PetitionMonitoringService(
    {
      requireExecutable: async (_c: unknown, _b: string, _card: string, actionId: string) => {
        calls.push(`executable:${actionId}`);
        if (options.notExecutable) throw new ForbiddenException();
        return { officeId: 'office', title: 'SALIM JOSÉ PEREIRA DE BARROS' };
      }
    } as never,
    {
      findForCard: async () => (petition ? [petition] : []),
      findMonitorable: async () => (petition ? [petition] : []),
      markSent: async (_db: string, _client: string, _id: string, target: { boardId: string; cardId: string }) => {
        calls.push('markSent');
        const cardId = options.sentCardId ?? target.cardId;
        return { boardId: options.sentCardId ? 'winner-board' : target.boardId, cardId, first: cardId === target.cardId };
      },
      discardLosingCard: async (_db: string, _client: string, _board: string, cardId: string) => { calls.push(`discard:${cardId}`); }
    } as never,
    { listImportDestinations: async () => [{ id: 'monitor-board', name: 'Monitoramento', defaultColumnId: 'col' }, { id: 'board', name: 'Origem', defaultColumnId: 'c0' }] } as never,
    {
      createInDefaultColumnFromSource: async (_c: unknown, boardId: string, input: { sourceType: string; sourceId: string; officeId: string; title: string }) => {
        calls.push(`create:${boardId}:${input.sourceType}:${input.sourceId}:${input.officeId}`);
        assert.equal(input.title, 'SALIM JOSÉ PEREIRA DE BARROS');
        return { card: { id: created }, created: options.createdNew ?? true };
      }
    } as never,
    { replace: async (_db: string, _client: string, cardId: string, customerId: string) => { calls.push(`customer:${cardId}:${customerId}`); } } as never,
    { createSystemEvent: async (_db: string, _client: string, cardId: string, _who: string, kind: string) => { calls.push(`event:${cardId}:${kind}`); } } as never,
    { record: async () => { calls.push('audit'); } } as never
  );
  return { service, calls };
}

void test('Opcoes: peticoes monitoraveis com numero mascarado, boards de destino e criar board so para flow:admin', async () => {
  const { service } = build();
  const options = await service.options(ctx, 'board', 'origin');
  assert.deepEqual(options.petitions, [{ id: 'p1', fileName: 'Inicial.docx', bank: 'PAN', court: 'jec', processNumber: '0000001-68.2026.8.26.0100' }]);
  assert.deepEqual(options.boards, [{ id: 'monitor-board', name: 'Monitoramento' }], 'board de origem fora da lista');
  assert.equal(options.canCreateBoard, true);
  assert.equal((await service.options({ ...ctx, scopes: [] }, 'board', 'origin')).canCreateBoard, false);
});

void test('Envio cria card na coluna padrao, vincula o cliente antes de marcar, registra eventos nos dois cards', async () => {
  const { service, calls } = build();
  const result = await service.createMonitoringCard(ctx, ctx, 'board', 'origin', 'p1', 'monitor-board');
  assert.deepEqual(result, { petitionId: 'p1', processNumber: NUMBER, tribunal: 'TJSP', boardId: 'monitor-board', cardId: 'new-card', created: true });
  assert.deepEqual(calls, [
    'executable:monitorar',
    'create:monitor-board:flow_petition:p1:office',
    'customer:new-card:customer',
    'markSent',
    'event:origin:card.initial_petition_sent_to_monitoring',
    'event:new-card:card.monitoring_card_created',
    'audit'
  ]);
});

void test('Peticao ja enviada devolve o card existente sem criar outro', async () => {
  const { service, calls } = build({ petition: { id: 'p1', cardId: 'origin', customerId: 'c', court: 'jec', bank: 'PAN', fileName: 'x', protocolNumber: NUMBER, monitoringBoardId: 'mb', monitoringCardId: 'mc', documentStatus: 'aprovado' } });
  const result = await service.createMonitoringCard(ctx, ctx, 'board', 'origin', 'p1', 'other-board');
  assert.deepEqual([result.boardId, result.cardId, result.created], ['mb', 'mc', false]);
  assert.deepEqual(calls, ['executable:monitorar']);
});

void test('Corrida perdida: o card criado por este pedido e descartado e o vencedor devolvido', async () => {
  const { service, calls } = build({ sentCardId: 'winner-card' });
  const result = await service.createMonitoringCard(ctx, ctx, 'board', 'origin', 'p1', 'monitor-board');
  assert.deepEqual([result.boardId, result.cardId, result.created], ['winner-board', 'winner-card', false]);
  assert.ok(calls.includes('discard:new-card'));
  assert.ok(!calls.some((call) => call.startsWith('event:')), 'eventos so no envio vencedor');
});

void test('Sem acao na coluna, sem numero ou peticao nao aprovada: nada e criado', async () => {
  const blocked = build({ notExecutable: true });
  await assert.rejects(() => blocked.service.createMonitoringCard(ctx, ctx, 'board', 'origin', 'p1', 'monitor-board'), ForbiddenException);
  assert.deepEqual(blocked.calls, ['executable:monitorar']);
  for (const petition of [
    { id: 'p1', cardId: 'origin', customerId: 'c', court: 'jec', bank: 'PAN', fileName: 'x', protocolNumber: null, monitoringBoardId: null, monitoringCardId: null, documentStatus: 'aprovado' },
    { id: 'p1', cardId: 'origin', customerId: 'c', court: 'jec', bank: 'PAN', fileName: 'x', protocolNumber: NUMBER, monitoringBoardId: null, monitoringCardId: null, documentStatus: 'rascunho' }
  ]) {
    const { service, calls } = build({ petition });
    await assert.rejects(() => service.createMonitoringCard(ctx, ctx, 'board', 'origin', 'p1', 'monitor-board'), ConflictException);
    assert.ok(!calls.some((call) => call.startsWith('create:')));
  }
});

void test('Destino igual a origem e recusado antes de qualquer efeito', async () => {
  const { service, calls } = build();
  await assert.rejects(() => service.createMonitoringCard(ctx, ctx, 'board', 'origin', 'p1', 'board'), /monitoring_board_same_as_origin|board diferente/);
  assert.deepEqual(calls, []);
});
