import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ChecklistGateService } from '../documents/checklist-gate.service';
import { keyOffOfficePolicy, keyOffVisibility, noLeadLock, noLeadsRepository } from '../../../test/kanban-visibility';
import { CardsService } from './cards.service';

const context = {
  clientId: 'client-1',
  identityId: 'mover-1',
  databaseRef: 'db-1',
  applicationId: 'application-1',
  roles: [],
  scopes: []
};
const mutate = { ...context, userAgent: 'test', ip: '127.0.0.1' };

const CARD = { id: 'card-1', boardId: 'board-1', boardColumnId: 'column-doing', position: 0 };
const DESTINATION_COLUMN = { id: 'column-done', boardId: 'board-1', status: 'active', wipLimit: null, name: 'Done' };
const CREATED_ACTIVITY = { id: 'activity-99', cardId: 'card-1' };

function buildService(overrides: Partial<Record<string, unknown>> = {}) {
  const repository = {
    findById: async () => CARD,
    move: async () => ({ card: { ...CARD, boardColumnId: 'column-done' }, movedActivityId: 'activity-99' }),
    countActiveInColumn: async () => 0
  };
  const columns = { findById: async () => DESTINATION_COLUMN, list: async () => [] };
  const activities = { createSystemEvent: async () => CREATED_ACTIVITY };
  const tags = {};
  const statuses = {};
  const access = {
    requireBoard: async () => ({ id: 'board-1' }),
    requireMember: async () => ({ role: 'board_admin', profileId: null }),
    requireRole: async () => 'board_admin',
    requireTransitionAllowed: async () => undefined,
    requireColumnEditable: async () => undefined
  };
  const audit = { record: async () => undefined };
  const assignees = { list: async () => [] };
  const emailAutomations = { recordForActivity: async () => undefined };
  const notifications = { notify: async () => undefined };
  const checklistGate = { assertCanEnterColumn: async () => undefined };
  const cardDocuments = { completenessForBoard: async () => ({ totalRequired: 0, acceptedRequiredByCard: new Map() }) };

  const deps = {
    repository,
    columns,
    activities,
    tags,
    statuses,
    access,
    audit,
    assignees,
    emailAutomations,
    notifications,
    checklistGate,
    cardDocuments,
    ...overrides
  };

  return new CardsService(
    deps.repository as never,
    deps.columns as never,
    deps.activities as never,
    deps.tags as never,
    deps.statuses as never,
    deps.access as never,
    deps.audit as never,
    deps.assignees as never,
    deps.emailAutomations as never,
    deps.notifications as never,
    deps.checklistGate as never,
    deps.cardDocuments as never,
    // Sprint 3.5: chave desligada; card visivel = o que o repositorio do spec devolve.
    keyOffVisibility((boardId, cardId) =>
      (deps.repository as { findById: (...args: unknown[]) => Promise<unknown> }).findById('db-1', 'client-1', boardId, cardId)
    ),
    keyOffOfficePolicy,
    noLeadsRepository,
    noLeadLock,
    { assertCanEnterColumn: async () => undefined, cardIdsWithoutHisconForBoard: async () => new Set<string>(), cardIdsWithSignedKitPendingForBoard: async () => new Set<string>() } as never
  );
}

// Sprint 13: o evento card.moved nasce na transacao da movimentacao (repositorio) e o outbox de
// e-mail deriva dele as regras column_entered/column_left (dispatch-log.repository.spec).
void test('CardsService.move grava o evento na transacao do repositorio e entrega o evento ao outbox de e-mail', async () => {
  const moves: unknown[][] = [];
  const recorded: unknown[][] = [];
  const service = buildService({
    repository: {
      findById: async () => CARD,
      move: async (...args: unknown[]) => {
        moves.push(args);
        return { card: { ...CARD, boardColumnId: 'column-done' }, movedActivityId: 'activity-99' };
      },
      countActiveInColumn: async () => 0
    },
    emailAutomations: {
      recordForActivity: async (...args: unknown[]) => {
        recorded.push(args);
      }
    }
  });

  const result = await service.move(context as never, 'board-1', 'card-1', { toBoardColumnId: 'column-done', toPosition: 0 } as never, mutate as never);

  assert.equal(result.card.boardColumnId, 'column-done');
  assert.equal(moves[0][8], 'mover-1', 'autor do evento card.moved');
  assert.deepEqual(recorded, [['db-1', 'client-1', 'activity-99']]);
});

void test('CardsService.move nao aciona automacao quando o card fica na mesma coluna', async () => {
  let called = false;
  const sameColumnCard = { ...CARD, boardColumnId: 'column-done' };
  const service = buildService({
    emailAutomations: {
      recordForActivity: async () => {
        called = true;
      }
    },
    repository: {
      findById: async () => sameColumnCard,
      move: async () => ({ card: sameColumnCard, movedActivityId: null }),
      countActiveInColumn: async () => 0
    }
  });

  await service.move(context as never, 'board-1', 'card-1', { toBoardColumnId: 'column-done', toPosition: 1 } as never, mutate as never);

  assert.equal(called, false);
});

// --- CRM de leads, Sprint 2: bloqueio de entrada em coluna com checklist obrigatorio ---

const CHECKLIST_COLUMN = { ...DESTINATION_COLUMN, requiresCompleteChecklist: true };
const PENDING = [{ id: 'type-proc', name: 'Procuracao' }];

function realGate(pending: Array<{ id: string; name: string }>, lookups: Array<string | null> = []) {
  // Gate real sobre repositorio falso: valida o formato do erro em cada caminho.
  return new ChecklistGateService({
    listPendingRequired: async (_ref: string, _client: string, _board: string, cardId: string | null) => {
      lookups.push(cardId);
      return pending;
    }
  } as never);
}

async function expectChecklistIncomplete(promise: Promise<unknown>) {
  await assert.rejects(promise, (error: { getStatus: () => number; getResponse: () => Record<string, unknown> }) => {
    assert.equal(error.getStatus(), 422);
    const body = error.getResponse();
    assert.equal(body.code, 'checklist_incomplete');
    assert.deepEqual(body.pendingDocumentTypes, PENDING);
    return true;
  });
}

void test('checklist: move para coluna com requires_complete_checklist e pendencia retorna 422 e nao persiste', async () => {
  let moved = false;
  const lookups: Array<string | null> = [];
  const service = buildService({
    columns: { findById: async () => CHECKLIST_COLUMN },
    checklistGate: realGate(PENDING, lookups),
    repository: {
      findById: async () => CARD,
      move: async () => {
        moved = true;
        return { card: CARD, movedActivityId: null };
      },
      countActiveInColumn: async () => 0
    }
  });

  await expectChecklistIncomplete(
    service.move(context as never, 'board-1', 'card-1', { toBoardColumnId: 'column-done', toPosition: 0 } as never, mutate as never)
  );
  assert.equal(moved, false);
  assert.deepEqual(lookups, ['card-1']);
});

void test('checklist: move com todos os obrigatorios aceitos entra na coluna', async () => {
  const service = buildService({ columns: { findById: async () => CHECKLIST_COLUMN }, checklistGate: realGate([]) });
  const result = await service.move(
    context as never,
    'board-1',
    'card-1',
    { toBoardColumnId: 'column-done', toPosition: 0 } as never,
    mutate as never
  );
  assert.equal(result.card.boardColumnId, 'column-done');
});

void test('checklist: reordenar dentro da mesma coluna nao avalia o checklist (sem efeito retroativo)', async () => {
  const lookups: Array<string | null> = [];
  const sameColumnCard = { ...CARD, boardColumnId: 'column-done' };
  const service = buildService({
    columns: { findById: async () => CHECKLIST_COLUMN },
    checklistGate: realGate(PENDING, lookups),
    repository: { findById: async () => sameColumnCard, move: async () => ({ card: sameColumnCard, movedActivityId: null }), countActiveInColumn: async () => 0 }
  });
  await service.move(context as never, 'board-1', 'card-1', { toBoardColumnId: 'column-done', toPosition: 2 } as never, mutate as never);
  assert.deepEqual(lookups, []);
});

void test('checklist: criar card direto na coluna bloqueada retorna 422 e nao cria', async () => {
  let created = false;
  const lookups: Array<string | null> = [];
  const service = buildService({
    columns: { findById: async () => CHECKLIST_COLUMN },
    checklistGate: realGate(PENDING, lookups),
    repository: {
      create: async () => {
        created = true;
        return CARD;
      }
    }
  });
  await expectChecklistIncomplete(
    service.create(context as never, 'board-1', { boardColumnId: 'column-done', title: 'Lead' } as never, mutate as never)
  );
  assert.equal(created, false);
  assert.deepEqual(lookups, [null]);
});

void test('checklist (Sprint 3): importacao para coluna padrao com a flag cria o card sem passar pelo bloqueio', async () => {
  const lookups: Array<string | null> = [];
  const createCalls: unknown[][] = [];
  const service = buildService({
    columns: { findDefault: async () => ({ ...CHECKLIST_COLUMN, id: 'column-backlog' }) },
    checklistGate: realGate(PENDING, lookups),
    repository: {
      createFromSource: async (...args: unknown[]) => {
        createCalls.push(args);
        return { card: { ...CARD, boardColumnId: 'column-backlog' }, created: true };
      }
    }
  });
  const result = await service.createInDefaultColumnFromSource(
    context as never,
    'board-1',
    { title: 'T', sourceModule: 'juridico', sourceType: 'process', sourceId: 's1', sourcePayload: {} },
    mutate as never
  );
  assert.equal(result.created, true);
  assert.equal(result.card.boardColumnId, 'column-backlog');
  assert.deepEqual(lookups, [], 'o gate de checklist nao e consultado na importacao');
  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].length, 5, 'nenhuma guarda de entrada e repassada ao repositorio');
});

void test('checklist (Sprint 3): card importado na coluna com a flag continua sem poder ser movido para outra coluna com a flag (422)', async () => {
  const service = buildService({
    columns: { findById: async () => CHECKLIST_COLUMN },
    checklistGate: realGate(PENDING),
    repository: { findById: async () => ({ ...CARD, boardColumnId: 'column-backlog', sourceModule: 'juridico' }) }
  });
  await expectChecklistIncomplete(
    service.move(context as never, 'board-1', 'card-1', { toBoardColumnId: 'column-done', toPosition: 0 } as never, mutate as never)
  );
});

void test('checklistPending (Sprint 3): list sinaliza so card em coluna com a flag e obrigatorio pendente, sem N+1', async () => {
  let completenessCalls = 0;
  let columnListCalls = 0;
  const service = buildService({
    repository: {
      list: async () => ({
        data: [
          { id: 'card-imported', boardColumnId: 'column-gated' },
          { id: 'card-complete', boardColumnId: 'column-gated' },
          { id: 'card-free', boardColumnId: 'column-free' }
        ],
        meta: { limit: 20, offset: 0, total: 3 }
      }),
      listSummaries: async () => new Map()
    },
    tags: { listTagIdsForBoard: async () => new Map() },
    columns: {
      list: async () => {
        columnListCalls += 1;
        return [
          { id: 'column-gated', requiresCompleteChecklist: true },
          { id: 'column-free', requiresCompleteChecklist: false }
        ];
      }
    },
    cardDocuments: {
      completenessForBoard: async () => {
        completenessCalls += 1;
        return { totalRequired: 2, acceptedRequiredByCard: new Map([['card-complete', 2]]) };
      }
    }
  });
  const page = await service.list(context as never, 'board-1', { limit: 20, offset: 0 } as never);
  assert.equal(completenessCalls, 1);
  assert.equal(columnListCalls, 1);
  assert.deepEqual(
    page.data.map((card) => [card.id, card.checklistPending]),
    [
      ['card-imported', true],
      ['card-complete', false],
      ['card-free', false]
    ]
  );
});

void test('checklistPending (Sprint 3): quadro sem obrigatorio ativo nunca sinaliza, mesmo em coluna com a flag', async () => {
  const service = buildService({
    repository: {
      list: async () => ({ data: [{ id: 'card-a', boardColumnId: 'column-gated' }], meta: { limit: 20, offset: 0, total: 1 } }),
      listSummaries: async () => new Map()
    },
    tags: { listTagIdsForBoard: async () => new Map() },
    columns: { list: async () => [{ id: 'column-gated', requiresCompleteChecklist: true }] }
  });
  const page = await service.list(context as never, 'board-1', { limit: 20, offset: 0 } as never);
  assert.equal(page.data[0].checklistPending, false);
});

void test('completude: list agrega aceitos/total por card a partir de uma unica consulta do quadro', async () => {
  let completenessCalls = 0;
  const service = buildService({
    repository: {
      list: async () => ({ data: [{ id: 'card-a' }, { id: 'card-b' }], meta: { limit: 20, offset: 0, total: 2 } }),
      listSummaries: async () => new Map()
    },
    tags: { listTagIdsForBoard: async () => new Map() },
    cardDocuments: {
      completenessForBoard: async () => {
        completenessCalls += 1;
        return { totalRequired: 7, acceptedRequiredByCard: new Map([['card-a', 3]]) };
      }
    }
  });
  const page = await service.list(context as never, 'board-1', { limit: 20, offset: 0 } as never);
  assert.equal(completenessCalls, 1);
  assert.deepEqual(
    page.data.map((card) => card.documentChecklist),
    [
      { acceptedRequired: 3, totalRequired: 7 },
      { acceptedRequired: 0, totalRequired: 7 }
    ]
  );
});
