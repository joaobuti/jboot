import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { keyOffVisibility } from '../../../test/kanban-visibility';
import { AutomationWorker, formatEventTime, sanitizeMailError } from './automation-worker.service';
import { ClaimedDispatch } from './dispatch-log.repository';

const config = { redisUrl: 'redis://unused:6379' };

const CARD = {
  id: 'card-1',
  boardId: 'board-1',
  boardColumnId: 'column-done',
  title: 'Fix the bug',
  createdByIdentityId: 'creator-1',
  dueDate: '2026-09-20'
};
const TO_COLUMN = { id: 'column-done', name: 'Done' };
const FROM_COLUMN = { id: 'column-doing', name: 'Doing' };
const ACTIVITY = {
  id: 'activity-1',
  cardId: 'card-1',
  authorIdentityId: 'mover-1',
  eventPayload: { kind: 'card.moved', fromBoardColumnId: 'column-doing', toBoardColumnId: 'column-done' },
  createdAt: '2026-09-13T12:00:00.000Z'
};
// Payload do evento `djen_publication_received` gravado pelo destino Flow (ADR 022), com o formato do
// DJEN real (comunicaapi.pje.jus.br, consulta de 2026-11-09) e dados anonimizados.
const DJEN_ACTIVITY = {
  id: 'activity-djen-1',
  cardId: 'card-1',
  authorIdentityId: 'mover-1',
  eventPayload: {
    kind: 'djen_publication_received',
    numeroProcesso: '0000000-00.0000.0.00.0000',
    publicacao: { dataDisponibilizacao: '2026-11-09', tipoComunicacao: 'Intimação', tipoDocumento: 'Decisão', orgao: 'Vara', trecho: 'Intime-se.' }
  },
  createdAt: '2026-11-09T12:00:00.000Z'
};

const JURIDICO_ACTIVITY = {
  id: 'activity-juridico-1',
  cardId: 'card-1',
  authorIdentityId: 'mover-1',
  eventPayload: {
    kind: 'juridico_process_changed',
    numeroProcesso: '0000000-00.0000.0.00.0000',
    tribunal: 'TJSC',
    novasMovimentacoes: [{ occurredAt: '2026-09-13T00:00:00.000Z', description: 'Movimento' }]
  },
  createdAt: '2026-09-13T12:00:00.000Z'
};

const IDENTITIES: Record<string, { id: string; displayName: string | null; email: string | null }> = {
  'assignee-1': { id: 'assignee-1', displayName: 'Alice', email: 'alice@example.com' },
  'assignee-2': { id: 'assignee-2', displayName: 'Bob', email: null }, // sem e-mail cadastrado
  'creator-1': { id: 'creator-1', displayName: 'Carol', email: 'carol@example.com' },
  'board-member-1': { id: 'board-member-1', displayName: 'Dave', email: 'dave@example.com' },
  'mover-1': { id: 'mover-1', displayName: 'Erin', email: 'erin@example.com' },
  'assignee-3': { id: 'assignee-3', displayName: 'Frank', email: 'frank@example.com' }
};

function claimed(overrides: Partial<ClaimedDispatch> = {}): ClaimedDispatch {
  return {
    id: 'dispatch-1',
    clientId: 'client-1',
    automationRuleId: 'rule-1',
    cardId: 'card-1',
    boardColumnId: 'column-done',
    sourceActivityId: 'activity-1',
    dispatchDate: null,
    attemptCount: 1,
    boardId: 'board-1',
    ruleActive: true,
    triggerType: 'column_entered',
    recipientRole: 'assignee',
    actionConfig: {},
    triggerConfig: {},
    ...overrides
  };
}

function buildDeps(row: ClaimedDispatch | null, overrides: Partial<Record<string, unknown>> = {}) {
  const sentEmails: Array<{ kind: string; input: unknown }> = [];
  const calls = {
    markSent: 0,
    skipped: [] as string[],
    retries: [] as string[],
    recipientsRecorded: [] as string[],
    recordedForActivity: [] as string[],
    outcomes: [] as string[]
  };
  let retryStatus: 'pending' | 'failed' = 'pending';

  const database = {
    queryIdentity: async (_text: string, values: readonly unknown[]) => {
      const ids = values[0] as string[];
      return { rows: ids.map((id) => IDENTITIES[id]).filter(Boolean) };
    }
  };

  const dispatchLog = {
    claim: async () => row,
    sentRecipients: async () => [] as string[],
    recordRecipientSent: async (_ref: string, _clientId: string, _id: string, identityId: string) => {
      calls.recipientsRecorded.push(identityId);
    },
    markSent: async () => {
      calls.markSent += 1;
    },
    markSkipped: async (_ref: string, _id: string, reason: string) => {
      calls.skipped.push(reason);
    },
    scheduleRetryOrFail: async (_ref: string, _id: string, error: string) => {
      calls.retries.push(error);
      return retryStatus;
    },
    recordForActivity: async (_ref: string, _clientId: string, activityId: string) => {
      calls.recordedForActivity.push(activityId);
      return ['dispatch-1'];
    },
    recordScheduled: async () => ['dispatch-1']
  };

  const cards = { findById: async () => CARD };
  const columns = {
    findById: async (_databaseRef: string, _clientId: string, _boardId: string, columnId: string) =>
      columnId === TO_COLUMN.id ? TO_COLUMN : columnId === FROM_COLUMN.id ? FROM_COLUMN : null
  };
  const activities = {
    findById: async (_databaseRef: string, _clientId: string, _cardId: string, activityId: string) =>
      activityId === JURIDICO_ACTIVITY.id ? JURIDICO_ACTIVITY : activityId === DJEN_ACTIVITY.id ? DJEN_ACTIVITY : ACTIVITY
  };
  const assignees = { list: async () => [{ identityId: 'assignee-1' }, { identityId: 'assignee-2' }] };
  const mailer = {
    sendColumnMovedNotification: async (input: unknown) => {
      sentEmails.push({ kind: 'column_moved', input });
    },
    sendDueDateApproachingNotification: async (input: unknown) => {
      sentEmails.push({ kind: 'due_date_approaching', input });
    },
    sendCardStaleNotification: async (input: unknown) => {
      sentEmails.push({ kind: 'card_stale', input });
    },
    sendDjenPublicationNotification: async (input: unknown) => {
      sentEmails.push({ kind: 'djen_publication_received', input });
    },
    sendJuridicoProcessMovedNotification: async (input: unknown) => {
      sentEmails.push({ kind: 'juridico_process_moved', input });
    }
  };
  const scheduledEvaluator = { evaluateAndEnqueue: async () => undefined };
  const emailScheduler = { recoverAndEnqueue: async () => undefined };
  const metrics = { record: (outcome: string) => calls.outcomes.push(outcome) };

  const deps = { database, dispatchLog, cards, columns, activities, assignees, mailer, scheduledEvaluator, emailScheduler, ...overrides };
  const worker = new AutomationWorker(
    config as never,
    deps.database as never,
    deps.dispatchLog as never,
    deps.cards as never,
    deps.columns as never,
    deps.activities as never,
    deps.assignees as never,
    deps.mailer as never,
    deps.scheduledEvaluator as never,
    keyOffVisibility(async () => ({})),
    { process: async () => undefined } as never,
    { recoverAndEnqueue: async () => undefined } as never,
    deps.emailScheduler as never,
    metrics as never
  );
  const setRetryStatus = (status: 'pending' | 'failed') => {
    retryStatus = status;
  };
  return { worker, sentEmails, calls, setRetryStatus };
}

void test('AutomationWorker.processDispatch resolve responsaveis, pula quem nao tem e-mail e registra cada envio', async () => {
  const { worker, sentEmails, calls } = buildDeps(claimed({ recipientRole: 'assignee' }));
  assert.equal(await worker.processDispatch('db-1', 'dispatch-1'), 'sent');

  assert.equal(sentEmails.length, 1, 'assignee-2 has no email registered and must be skipped silently');
  const input = sentEmails[0].input as { to: string; cardTitle: string; fromColumnName: string; toColumnName: string; movedByName: string };
  assert.equal(sentEmails[0].kind, 'column_moved');
  assert.equal(input.to, 'alice@example.com');
  assert.equal(input.cardTitle, 'Fix the bug');
  assert.equal(input.fromColumnName, 'Doing');
  assert.equal(input.toColumnName, 'Done');
  assert.equal(input.movedByName, 'Erin');
  assert.deepEqual(calls.recipientsRecorded, ['assignee-1']);
  assert.equal(calls.markSent, 1);
  assert.deepEqual(calls.outcomes, ['sent']);
});

void test('AutomationWorker.processDispatch resolve criador e membro fixo da regra', async () => {
  const creator = buildDeps(claimed({ recipientRole: 'creator' }));
  await creator.worker.processDispatch('db-1', 'dispatch-1');
  assert.equal((creator.sentEmails[0].input as { to: string }).to, 'carol@example.com');

  const member = buildDeps(claimed({ recipientRole: 'board_member', actionConfig: { boardMemberIdentityId: 'board-member-1' } }));
  await member.worker.processDispatch('db-1', 'dispatch-1');
  assert.equal((member.sentEmails[0].input as { to: string }).to, 'dave@example.com');
});

void test('AutomationWorker.processDispatch sem destinatario conclui como enviado, sem e-mail', async () => {
  const { worker, sentEmails, calls } = buildDeps(claimed(), { assignees: { list: async () => [] } });
  await worker.processDispatch('db-1', 'dispatch-1');

  assert.equal(sentEmails.length, 0);
  assert.equal(calls.markSent, 1);
});

void test('AutomationWorker.processDispatch nao faz nada quando a linha ja foi levada ou nao esta vencida', async () => {
  const { worker, sentEmails, calls } = buildDeps(null);
  assert.equal(await worker.processDispatch('db-1', 'dispatch-1'), null);

  assert.equal(sentEmails.length, 0);
  assert.equal(calls.markSent, 0);
  assert.deepEqual(calls.outcomes, []);
});

void test('AutomationWorker.processDispatch na retentativa nao reenvia a quem ja recebeu', async () => {
  const { worker, sentEmails, calls } = buildDeps(claimed({ attemptCount: 2 }), {
    assignees: { list: async () => [{ identityId: 'assignee-1' }, { identityId: 'assignee-3' }] }
  });
  (worker as unknown as { dispatchLog: { sentRecipients: () => Promise<string[]> } }).dispatchLog.sentRecipients = async () => ['assignee-1'];

  await worker.processDispatch('db-1', 'dispatch-1');

  assert.deepEqual(sentEmails.map((email) => (email.input as { to: string }).to), ['frank@example.com']);
  assert.deepEqual(calls.recipientsRecorded, ['assignee-3']);
  assert.equal(calls.markSent, 1);
});

void test('AutomationWorker.processDispatch com falha parcial do SMTP agenda nova tentativa sem lancar e sem endereco no erro', async () => {
  const { worker, sentEmails, calls } = buildDeps(claimed(), {
    assignees: { list: async () => [{ identityId: 'assignee-1' }, { identityId: 'assignee-3' }] },
    mailer: {
      sendColumnMovedNotification: async (input: { to: string }) => {
        if (input.to === 'frank@example.com') {
          throw new Error('550 5.1.1 <frank@example.com>: Recipient address rejected');
        }
        sentEmails.push({ kind: 'column_moved', input });
      }
    }
  });

  assert.equal(await worker.processDispatch('db-1', 'dispatch-1'), 'retry_scheduled');

  assert.deepEqual(calls.recipientsRecorded, ['assignee-1'], 'so quem recebeu fica registrado');
  assert.equal(calls.markSent, 0);
  assert.equal(calls.retries.length, 1);
  assert.match(calls.retries[0], /Recipient address rejected/);
  assert.doesNotMatch(calls.retries[0], /frank@example\.com/);
  assert.deepEqual(calls.outcomes, ['retry_scheduled']);
});

void test('AutomationWorker.processDispatch esgotadas as tentativas registra falha terminal', async () => {
  const { worker, calls, setRetryStatus } = buildDeps(claimed({ attemptCount: 5, recipientRole: 'creator' }), {
    mailer: {
      sendColumnMovedNotification: async () => {
        throw new Error('SMTP connection refused');
      }
    }
  });
  setRetryStatus('failed');

  assert.equal(await worker.processDispatch('db-1', 'dispatch-1'), 'failed');
  assert.deepEqual(calls.outcomes, ['failed']);
});

void test('AutomationWorker.processDispatch pula regra inativa e card removido, sem enviar', async () => {
  const inactive = buildDeps(claimed({ ruleActive: false }));
  assert.equal(await inactive.worker.processDispatch('db-1', 'dispatch-1'), 'skipped');
  assert.deepEqual(inactive.calls.skipped, ['rule_inactive']);
  assert.equal(inactive.sentEmails.length, 0);

  const missing = buildDeps(claimed({ boardId: null }));
  assert.equal(await missing.worker.processDispatch('db-1', 'dispatch-1'), 'skipped');
  assert.deepEqual(missing.calls.skipped, ['card_missing']);
});

void test('AutomationWorker.processDispatch monta e-mail de saida (column_left) pelas colunas do evento', async () => {
  const { worker, sentEmails } = buildDeps(claimed({ recipientRole: 'creator', triggerType: 'column_left', boardColumnId: 'column-doing' }));
  await worker.processDispatch('db-1', 'dispatch-1');

  const input = sentEmails[0].input as { direction: string; fromColumnName: string; toColumnName: string };
  assert.equal(input.direction, 'left');
  // fromColumn/toColumn sempre vem do event_payload do card.moved, nunca da coluna da regra.
  assert.equal(input.fromColumnName, 'Doing');
  assert.equal(input.toColumnName, 'Done');
});

void test('AutomationWorker.processDispatch monta agendados com a configuracao atual da regra', async () => {
  const due = buildDeps(
    claimed({ recipientRole: 'creator', triggerType: 'due_date_approaching', sourceActivityId: null, dispatchDate: '2026-09-13', triggerConfig: { daysBefore: 3 } })
  );
  await due.worker.processDispatch('db-1', 'dispatch-1');
  const dueInput = due.sentEmails[0].input as { dueDate: string; daysBefore: number; columnName: string };
  assert.equal(due.sentEmails[0].kind, 'due_date_approaching');
  assert.equal(dueInput.dueDate, '2026-09-20');
  assert.equal(dueInput.daysBefore, 3);
  assert.equal(dueInput.columnName, 'Done');

  const stale = buildDeps(
    claimed({ recipientRole: 'creator', triggerType: 'card_stale', sourceActivityId: null, dispatchDate: '2026-09-13', triggerConfig: { daysStale: 5 } })
  );
  await stale.worker.processDispatch('db-1', 'dispatch-1');
  assert.equal(stale.sentEmails[0].kind, 'card_stale');
  assert.equal((stale.sentEmails[0].input as { daysStale: number }).daysStale, 5);
});

void test('AutomationWorker.processDispatch monta juridico_process_moved pelo evento de origem', async () => {
  const { worker, sentEmails } = buildDeps(
    claimed({ recipientRole: 'creator', triggerType: 'juridico_process_moved', sourceActivityId: JURIDICO_ACTIVITY.id })
  );
  await worker.processDispatch('db-1', 'dispatch-1');

  const input = sentEmails[0].input as { numeroProcesso: string; tribunal: string; novasMovimentacoes: unknown[] };
  assert.equal(sentEmails[0].kind, 'juridico_process_moved');
  assert.equal(input.numeroProcesso, '0000000-00.0000.0.00.0000');
  assert.equal(input.tribunal, 'TJSC');
  assert.equal(input.novasMovimentacoes.length, 1);
});

void test('AutomationWorker.processDispatch monta djen_publication_received pelo evento de origem', async () => {
  const { worker, sentEmails } = buildDeps(
    claimed({ recipientRole: 'creator', triggerType: 'djen_publication_received', sourceActivityId: DJEN_ACTIVITY.id })
  );
  await worker.processDispatch('db-1', 'dispatch-1');

  const input = sentEmails[0].input as { numeroProcesso: string; tipoComunicacao: string; tipoDocumento: string; trecho: string; dataDisponibilizacao: string };
  assert.equal(sentEmails[0].kind, 'djen_publication_received');
  assert.equal(input.numeroProcesso, '0000000-00.0000.0.00.0000');
  assert.equal(input.tipoComunicacao, 'Intimação');
  assert.equal(input.tipoDocumento, 'Decisão');
  assert.equal(input.trecho, 'Intime-se.');
  assert.equal(input.dataDisponibilizacao, '2026-11-09');
});

void test('AutomationWorker.dispatch roteia avaliacao diaria, varredura e envio do outbox', async () => {
  let evaluated = 0;
  let recovered = 0;
  const { worker, sentEmails } = buildDeps(claimed({ recipientRole: 'creator' }), {
    scheduledEvaluator: { evaluateAndEnqueue: async () => { evaluated += 1; } },
    emailScheduler: { recoverAndEnqueue: async () => { recovered += 1; } }
  });
  const dispatch = (worker as unknown as { dispatch: (job: unknown) => Promise<void> }).dispatch.bind(worker);

  await dispatch({ name: 'evaluate-scheduled-automations', data: {} });
  await dispatch({ name: 'recover-email-dispatches', data: {} });
  await dispatch({ name: 'process-email-dispatch', data: { databaseRef: 'db-1', dispatchId: 'dispatch-1' } });

  assert.equal(evaluated, 1);
  assert.equal(recovered, 1);
  assert.equal(sentEmails.length, 1);
});

void test('AutomationWorker.dispatch converte job legado da Sprint 8 em linha do outbox antes de enviar', async () => {
  const { worker, sentEmails, calls } = buildDeps(claimed({ recipientRole: 'creator' }));
  const dispatch = (worker as unknown as { dispatch: (job: unknown) => Promise<void> }).dispatch.bind(worker);

  await dispatch({
    name: 'send-email-notification',
    data: {
      databaseRef: 'db-1', clientId: 'client-1', boardId: 'board-1', boardColumnId: 'column-done', cardId: 'card-1',
      automationRuleId: 'rule-1', triggerType: 'column_entered', recipientRole: 'creator', actionConfig: {}, sourceActivityId: 'activity-1'
    }
  });

  assert.deepEqual(calls.recordedForActivity, ['activity-1']);
  assert.equal(sentEmails.length, 1);
});

void test('sanitizeMailError tira enderecos, junta linhas e trunca', () => {
  assert.equal(sanitizeMailError(new Error('550 <a.b+c@mail.example.com>\n rejected')), '550 <[e-mail]> rejected');
  assert.equal(sanitizeMailError('x'.repeat(500)).length, 200);
  assert.equal(sanitizeMailError(new Error('   ')), 'mail_error');
});

// Regressao (E2E da Sprint 13): o pg devolve created_at como Date; o template de coluna quebrava
// com "value.replace is not a function" e nenhum e-mail de entrada/saida saia desde a Sprint 8.
void test('AutomationWorker.processDispatch envia e-mail de coluna quando o evento vem do banco com data Date', async () => {
  const { worker, sentEmails, calls } = buildDeps(claimed({ recipientRole: 'creator' }), {
    activities: { findById: async () => ({ ...ACTIVITY, createdAt: new Date('2026-10-17T03:30:16.000Z') }) },
    mailer: {
      sendColumnMovedNotification: async (input: { movedAt: unknown }) => {
        assert.equal(typeof input.movedAt, 'string');
        sentEmails.push({ kind: 'column_moved', input });
      }
    }
  });

  assert.equal(await worker.processDispatch('db-1', 'dispatch-1'), 'sent');
  assert.equal((sentEmails[0].input as { movedAt: string }).movedAt, '17/10/2026, 00:30');
  assert.equal(calls.retries.length, 0);
});

void test('formatEventTime aceita Date e ISO e preserva valor invalido', () => {
  assert.equal(formatEventTime('2026-09-13T12:00:00.000Z'), '13/09/2026, 09:00');
  assert.equal(formatEventTime('n/a'), 'n/a');
});
