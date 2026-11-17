import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { AiAutomationOutboxRepository } from '../automation/ai-automation-outbox.repository';
import { ActionAnalysisInput, validateActionAnalysis } from './action-analysis.input';
import { ActionAnalysisRepository } from './action-analysis.repository';
import { ActionAnalysisService } from './action-analysis.service';

const header = { holderName: 'MARIA DA SILVA', benefitNumber: '1234567890', statementDate: '20/10/2026' };
const concluded = (actions: ActionAnalysisInput['actions']): ActionAnalysisInput => ({ status: 'concluida', header, actions });

void test('retorno da analise: campos por bloco e regra 8 do cliente (um contrato em um bloco so)', () => {
  assert.deepEqual(
    validateActionAnalysis(
      concluded([
        { block: 'caixa', bank: 'CAIXA', year: '2022', contracts: [{ number: '10', status: 'Excluido', inclusionDate: '01/02/2022' }] },
        { block: 'e', bank: 'BANCO Y', rootContract: '200', contracts: [{ number: '200_0001' }, { number: '200_0002' }] },
        { block: 'd', bank: 'BANCO Z', contracts: [{ number: '300', cardType: 'RMC', limit: 'R$ 1.000,00', status: 'ATIVO' }] },
        // Regra 9: duplicidade aparente no mesmo bloco e sinalizada, nao eliminada; "ilegivel" nao conta.
        { block: 'b', bank: 'BANCO X', year: '2021', contracts: [{ number: '400' }, { number: '400' }, { number: 'ilegível' }] },
        { block: 'c', bank: 'BANCO X', year: '2024', contracts: [{ number: 'Ilegivel' }] }
      ])
    ),
    []
  );
  const errors = validateActionAnalysis(
    concluded([
      { block: 'b', bank: 'BANCO X', contracts: [{ number: '111' }] },
      { block: 'e', bank: 'BANCO Y', contracts: [{ number: '222_0001' }] },
      { block: 'a', bank: 'BANCO Y', year: '2022', contracts: [{ number: '1' }, { number: '2' }] },
      { block: 'd', bank: 'BANCO Z', contracts: [{ number: '3' }] },
      { block: 'c', bank: 'BANCO X', year: '2023', contracts: [{ number: ' 111 ', cardType: 'RCC' }] }
    ])
  );
  assert.deepEqual(errors, [
    'Bloco B, acao 1: informe o ano.',
    'Bloco E, acao 1: informe o contrato-raiz (ou "nao identificado").',
    'Bloco A, acao 1: este bloco tem um contrato por acao.',
    'Bloco D, acao 1: informe o tipo do cartao (RMC ou RCC).',
    'Bloco C, acao 1: cardType e limit so valem no Bloco D.',
    'Contrato 111 aparece no Bloco B e no Bloco C.'
  ]);
  assert.deepEqual(validateActionAnalysis({ status: 'concluida', actions: [] }), [
    'header (titular, beneficio e data do extrato) e obrigatorio com status = concluida.'
  ]);
  assert.deepEqual(validateActionAnalysis({ status: 'nao_concluida', actions: [] }), ['failureReason e obrigatorio quando status = nao_concluida.']);
  assert.deepEqual(validateActionAnalysis({ status: 'nao_concluida', failureReason: 'HISCON ilegivel', actions: [] }), []);
});

interface Harness {
  run: { id: string; boardId: string; boardColumnId: string; cardId: string; actionConfig: Record<string, unknown> } | null;
  closed: boolean;
  completedEvent: boolean;
  events: Array<{ kind: string; payload: Record<string, unknown> }>;
}

function service(h: Harness) {
  const activities = {
    createSystemEvent: async (_ref: string, _c: string, _card: string, _who: string, kind: string, payload: Record<string, unknown>) => {
      h.events.push({ kind, payload });
    }
  };
  return new ActionAnalysisService(
    { createClosingRun: async () => (h.closed ? null : { id: 'analysis-1', completedEvent: h.completedEvent }) } as never,
    { findDispatchedForOwner: async () => h.run, touchDispatched: async () => undefined } as never,
    { findByCard: async () => ({ customerId: 'customer-1' }) } as never,
    { requireVisibleCard: async () => ({ id: 'card-1' }) } as never,
    activities as never,
    { record: async () => undefined } as never
  );
}

const context = { databaseRef: 'ref', clientId: 'client', identityId: 'owner' } as never;
const oneAction = concluded([{ block: 'b', bank: 'BANCO X', year: '2021', contracts: [{ number: '111' }] }]);
const fresh = (overrides: Partial<Harness> = {}): Harness => ({
  run: { id: 'run-1', boardId: 'board-1', boardColumnId: 'col-rule', cardId: 'card-1', actionConfig: { expectedResult: 'action_analysis' } },
  closed: false,
  completedEvent: true,
  events: [],
  ...overrides
});

void test('analise registrada encerra a execucao; a conclusao sem erro vai ao historico (o card anda pela regra move_card)', async () => {
  const h = fresh();
  const result = await service(h).connectorSubmit(context, 'run-1', oneAction, context);
  assert.deepEqual([result.runCompleted, result.automationCompleted], [true, true]);
  assert.deepEqual(h.events[0], {
    kind: 'card.action_analysis_registered',
    payload: { analysisId: 'analysis-1', status: 'concluida', actionCount: 1, completed: true }
  });
  const none = fresh({ completedEvent: false });
  assert.equal((await service(none).connectorSubmit(context, 'run-1', concluded([]), context)).automationCompleted, false);
});

void test('envio invalido, execucao encerrada ou de outro usuario nao grava nada', async () => {
  const h = fresh({ run: { id: 'run-1', boardId: 'board-1', boardColumnId: 'col-rule', cardId: 'card-1', actionConfig: {} } });
  await assert.rejects(
    service(h).connectorSubmit(context, 'run-1', concluded([{ block: 'a', bank: 'X', year: '2022', contracts: [] }]), context),
    (error: Error & { code?: string }) => error.code === 'invalid_analysis' && /um contrato por acao/.test(error.message)
  );
  h.closed = true;
  await assert.rejects(service(h).connectorSubmit(context, 'run-1', oneAction, context), (error: Error & { code?: string }) => error.code === 'run_closed');
  h.run = null;
  await assert.rejects(service(h).connectorSubmit(context, 'run-1', oneAction, context), (error: Error & { code?: string }) => error.code === 'not_found');
  assert.deepEqual(h.events, []);
});

async function dispatchedRun(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, owner: string) {
  const clientId = randomUUID(), boardId = randomUUID(), columnId = randomUUID(), cardId = randomUUID();
  const ruleId = randomUUID(), activityId = randomUUID(), runId = randomUUID();
  await client.query(`INSERT INTO kanban_boards (id,client_id,name,created_by_identity_id) VALUES($1,$2,'Board',$3)`, [boardId, clientId, owner]);
  await client.query(`INSERT INTO kanban_board_columns (id,client_id,board_id,name,position) VALUES($1,$2,$3,'Analise',0)`, [columnId, clientId, boardId]);
  await client.query(`INSERT INTO kanban_cards (id,client_id,board_id,board_column_id,title,position,created_by_identity_id) VALUES($1,$2,$3,$4,'Card',0,$5)`, [cardId, clientId, boardId, columnId, owner]);
  await client.query(
    `INSERT INTO kanban_column_automation_rules (id,client_id,board_id,board_column_id,trigger_type,action_type,recipient_role,action_config,created_by_identity_id)
     VALUES($1,$2,$3,$4,'column_entered','execute_ai_agent',NULL,'{}'::jsonb,$5)`,
    [ruleId, clientId, boardId, columnId, owner]
  );
  await client.query(`INSERT INTO kanban_card_activities (id,client_id,card_id,type,author_identity_id,event_payload) VALUES($1,$2,$3,'system_event',$4,'{"kind":"card.moved"}'::jsonb)`,
    [activityId, clientId, cardId, owner]);
  await client.query(
    `INSERT INTO kanban_ai_automation_outbox (id,client_id,automation_rule_id,board_id,board_column_id,card_id,source_activity_id,requester_identity_id,agent_id,trigger_type,action_config,status)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'column_entered','{}'::jsonb,'dispatched')`,
    [runId, clientId, ruleId, boardId, columnId, cardId, activityId, owner, randomUUID()]
  );
  return { clientId, cardId, runId };
}

void test('PostgreSQL: grava acoes vinculadas ao card e encerra a execucao uma vez so', () =>
  withTestDatabase(async (db, client) => {
    const owner = randomUUID();
    const { clientId, cardId, runId } = await dispatchedRun(client, owner);
    const repository = new ActionAnalysisRepository(db);
    const analysis = concluded([
      { block: 'd', bank: 'BANCO Z', contracts: [{ number: '300', cardType: 'RMC' }] },
      { block: 'b', bank: 'BANCO X', year: '2021', contracts: [{ number: '111' }] },
      { block: 'b', bank: 'BANCO X', year: '2022', contracts: [{ number: '112' }] },
      { block: 'caixa', bank: 'CAIXA', year: '2022', contracts: [{ number: '10' }] }
    ]);
    const input = { runId, cardId, customerId: randomUUID(), ownerIdentityId: owner, analysis };
    assert.equal(await repository.createClosingRun(TEST_DATABASE_REF, clientId, { ...input, ownerIdentityId: randomUUID() }), null, 'outro usuario');
    const created = await repository.createClosingRun(TEST_DATABASE_REF, clientId, input);
    assert.ok(created);
    assert.equal(await repository.createClosingRun(TEST_DATABASE_REF, clientId, input), null, 'segundo envio');
    const run = await client.query(`SELECT status FROM kanban_ai_automation_outbox WHERE id = $1`, [runId]) as { rows: Array<{ status: string }> };
    assert.equal(run.rows[0].status, 'completed');

    assert.equal(created.completedEvent, true, 'concluida com acoes: conclusao sem erro');
    const events = await client.query(
      `SELECT event_payload->>'automationRunId' AS run FROM kanban_card_activities
       WHERE card_id = $1 AND event_payload->>'kind' = 'ai.automation_completed'`,
      [cardId]
    ) as { rows: Array<{ run: string }> };
    assert.deepEqual(events.rows, [{ run: runId }], 'evento que as regras ai_completed -> move_card leem');
    const latest = await repository.latestForCard(TEST_DATABASE_REF, clientId, cardId);
    assert.deepEqual([latest?.actionCount, latest?.holderName], [4, 'MARIA DA SILVA']);
    assert.deepEqual(latest?.actions.map((action) => `${action.block}${action.position}`), ['caixa1', 'b1', 'b2', 'd1']);
    assert.deepEqual(latest?.actions[3].contracts, [{ number: '300', cardType: 'RMC' }]);
    assert.equal(await repository.latestForCard(TEST_DATABASE_REF, randomUUID(), cardId), null, 'outro tenant');
  }));

void test('PostgreSQL: rotina que nao chega ao Flow expira em 5 min; depois de chegar, em 15 min parada', () =>
  withTestDatabase(async (db, client) => {
    const owner = randomUUID();
    const outbox = new AiAutomationOutboxRepository(db);
    const unreached = await dispatchedRun(client, owner);
    await client.query(`UPDATE kanban_ai_automation_outbox SET updated_at = NOW() - INTERVAL '6 minutes' WHERE id = $1`, [unreached.runId]);
    assert.deepEqual(
      (await outbox.expireStaleDispatched(TEST_DATABASE_REF, unreached.clientId)).map((run) => [run.id, run.code]),
      [[unreached.runId, 'routine_not_reached']]
    );

    const reached = await dispatchedRun(client, owner);
    await outbox.touchDispatched(TEST_DATABASE_REF, reached.clientId, reached.runId);
    await client.query(`UPDATE kanban_ai_automation_outbox SET updated_at = NOW() - INTERVAL '6 minutes' WHERE id = $1`, [reached.runId]);
    assert.deepEqual(await outbox.expireStaleDispatched(TEST_DATABASE_REF, reached.clientId), [], 'chegou: prazo maior');
    await client.query(`UPDATE kanban_ai_automation_outbox SET updated_at = NOW() - INTERVAL '16 minutes' WHERE id = $1`, [reached.runId]);
    assert.deepEqual(
      (await outbox.expireStaleDispatched(TEST_DATABASE_REF, reached.clientId)).map((run) => run.code),
      ['routine_no_answer']
    );
  }));

void test('Analise de Acoes so conclui execucao de regra que espera analise (ADR 020)', async () => {
  const h = fresh({
    run: { id: 'run-1', boardId: 'board-1', boardColumnId: 'col-rule', cardId: 'card-1', actionConfig: { expectedResult: 'initial_petitions' } }
  });
  await assert.rejects(
    service(h).connectorSubmit(context, 'run-1', oneAction, context),
    (error: Error & { code?: string }) => error.code === 'wrong_expected_result'
  );
  assert.deepEqual(h.events, []);
  h.run = { ...h.run!, actionConfig: { expectedResult: 'action_analysis' } };
  assert.equal((await service(h).connectorSubmit(context, 'run-1', oneAction, context)).runCompleted, true);
});

void test('PostgreSQL: peticoes iniciais aguentam 30 min parada e expiram 3 h depois do disparo', () =>
  withTestDatabase(async (db, client) => {
    const owner = randomUUID();
    const outbox = new AiAutomationOutboxRepository(db);
    const petitions = async () => {
      const run = await dispatchedRun(client, owner);
      await client.query(
        `UPDATE kanban_ai_automation_outbox SET action_config = '{"expectedResult":"initial_petitions"}'::jsonb, dispatched_at = NOW() WHERE id = $1`,
        [run.runId]
      );
      await outbox.touchDispatched(TEST_DATABASE_REF, run.clientId, run.runId);
      return run;
    };

    const idle = await petitions();
    await client.query(`UPDATE kanban_ai_automation_outbox SET updated_at = NOW() - INTERVAL '20 minutes' WHERE id = $1`, [idle.runId]);
    assert.deepEqual(await outbox.expireStaleDispatched(TEST_DATABASE_REF, idle.clientId), [], '20 min parada: continua');
    await client.query(`UPDATE kanban_ai_automation_outbox SET updated_at = NOW() - INTERVAL '31 minutes' WHERE id = $1`, [idle.runId]);
    assert.deepEqual((await outbox.expireStaleDispatched(TEST_DATABASE_REF, idle.clientId)).map((run) => run.code), ['routine_no_answer']);

    const long = await petitions();
    await client.query(`UPDATE kanban_ai_automation_outbox SET dispatched_at = NOW() - INTERVAL '181 minutes' WHERE id = $1`, [long.runId]);
    assert.deepEqual(
      (await outbox.expireStaleDispatched(TEST_DATABASE_REF, long.clientId)).map((run) => run.code),
      ['routine_time_limit'],
      'chamando o Flow, mas alem do teto total'
    );

    const unreached = await petitions();
    await client.query(`UPDATE kanban_ai_automation_outbox SET picked_up_at = NULL, updated_at = NOW() - INTERVAL '6 minutes' WHERE id = $1`, [unreached.runId]);
    assert.deepEqual((await outbox.expireStaleDispatched(TEST_DATABASE_REF, unreached.clientId)).map((run) => run.code), ['routine_not_reached']);
  }));

void test('PostgreSQL: o disparo da rotina registra a hora (base do teto total)', () =>
  withTestDatabase(async (db, client) => {
    const owner = randomUUID();
    const outbox = new AiAutomationOutboxRepository(db);
    const run = await dispatchedRun(client, owner);
    await client.query(`UPDATE kanban_ai_automation_outbox SET status = 'processing' WHERE id = $1`, [run.runId]);
    await outbox.markDispatched(TEST_DATABASE_REF, run.runId, randomUUID(), null);
    const row = await client.query(`SELECT dispatched_at IS NOT NULL AS stamped FROM kanban_ai_automation_outbox WHERE id = $1`, [run.runId]) as { rows: Array<{ stamped: boolean }> };
    assert.equal(row.rows[0].stamped, true);
  }));

void test('peticoes iniciais leem a analise concluida com o id de cada acao; outra automacao nao le', async () => {
  const audits: string[] = [];
  const build = (actionConfig: Record<string, unknown>, analysis: unknown) =>
    new ActionAnalysisService(
      { latestConcludedForCard: async () => analysis } as never,
      { findDispatchedForOwner: async () => ({ id: 'run-1', boardId: 'board-1', boardColumnId: 'col', cardId: 'card-1', actionConfig }), touchDispatched: async () => undefined } as never,
      {} as never,
      { requireVisibleCard: async () => ({}) } as never,
      {} as never,
      { record: async (event: string) => { audits.push(event); } } as never
    );
  const row = {
    id: 'analysis-1', createdAt: 't', holderName: 'MARIA', benefitNumber: '1', statementDate: 'd',
    actions: [{ id: 'action-1', block: 'b', position: 1, bank: 'PAN', year: '2021', rootContract: null, observations: null, contracts: [{ number: '1' }] }]
  };
  const read = await build({ expectedResult: 'initial_petitions' }, row).connectorLatestConcluded(context, 'run-1', context);
  assert.deepEqual(read.analysis?.actions.map((action) => [action.actionId, action.block]), [['action-1', 'b']]);
  const none = await build({ expectedResult: 'initial_petitions' }, null).connectorLatestConcluded(context, 'run-1', context);
  assert.equal(none.analysis, null);
  assert.match(none.instructions, /secao 4\.3/);
  await assert.rejects(
    build({ expectedResult: 'action_analysis' }, row).connectorLatestConcluded(context, 'run-1', context),
    (error: Error & { code?: string }) => error.code === 'wrong_expected_result'
  );
  assert.deepEqual(audits, ['kanban_automation_action_analysis_read', 'kanban_automation_action_analysis_read']);
});

void test('PostgreSQL: a leitura das peticoes pula analise nao concluida mais recente', () =>
  withTestDatabase(async (db, client) => {
    const owner = randomUUID();
    const repository = new ActionAnalysisRepository(db);
    const first = await dispatchedRun(client, owner);
    const customerId = randomUUID();
    await repository.createClosingRun(TEST_DATABASE_REF, first.clientId, { runId: first.runId, cardId: first.cardId, customerId, ownerIdentityId: owner, analysis: oneAction });
    // Segunda execucao no mesmo card (atividade nova), que termina nao concluida e e a mais recente.
    const second = randomUUID(), activity = randomUUID();
    await client.query(
      `INSERT INTO kanban_card_activities (id,client_id,card_id,type,author_identity_id,event_payload)
       VALUES ($1,$2,$3,'system_event',$4,'{"kind":"card.moved"}'::jsonb)`,
      [activity, first.clientId, first.cardId, owner]
    );
    await client.query(
      `INSERT INTO kanban_ai_automation_outbox (id,client_id,automation_rule_id,board_id,board_column_id,card_id,source_activity_id,requester_identity_id,agent_id,trigger_type,action_config,status)
       SELECT $1, client_id, automation_rule_id, board_id, board_column_id, card_id, $3, requester_identity_id, agent_id, trigger_type, action_config, 'dispatched'
       FROM kanban_ai_automation_outbox WHERE id = $2`,
      [second, first.runId, activity]
    );
    await repository.createClosingRun(TEST_DATABASE_REF, first.clientId, {
      runId: second, cardId: first.cardId, customerId, ownerIdentityId: owner,
      analysis: { status: 'nao_concluida', failureReason: 'HISCON ilegivel', actions: [] }
    });
    assert.equal((await repository.latestForCard(TEST_DATABASE_REF, first.clientId, first.cardId))?.status, 'nao_concluida');
    const concluded = await repository.latestConcludedForCard(TEST_DATABASE_REF, first.clientId, first.cardId);
    assert.deepEqual([concluded?.status, concluded?.actions.length], ['concluida', 1]);
    assert.ok(concluded?.actions[0].id, 'cada acao com id para o vinculo');
  }));
