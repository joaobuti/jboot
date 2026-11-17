import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { KanbanViewer } from '../shared/card-visibility';
import { DispatchLogRepository, EMAIL_DISPATCH_MAX_ATTEMPTS } from './dispatch-log.repository';

const REF = TEST_DATABASE_REF;

interface Fixture {
  clientId: string;
  identityId: string;
  boardId: string;
  doingId: string;
  doneId: string;
  cardId: string;
}

async function seed(client: Client): Promise<Fixture> {
  const f: Fixture = {
    clientId: randomUUID(),
    identityId: randomUUID(),
    boardId: randomUUID(),
    doingId: randomUUID(),
    doneId: randomUUID(),
    cardId: randomUUID()
  };
  await client.query(`INSERT INTO kanban_boards (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'Board', $3)`, [
    f.boardId,
    f.clientId,
    f.identityId
  ]);
  await client.query(
    `INSERT INTO kanban_board_columns (id, client_id, board_id, name, position) VALUES ($1, $3, $4, 'Doing', 0), ($2, $3, $4, 'Done', 1)`,
    [f.doingId, f.doneId, f.clientId, f.boardId]
  );
  await client.query(
    `INSERT INTO kanban_cards (id, client_id, board_id, board_column_id, title, position, created_by_identity_id)
     VALUES ($1, $2, $3, $4, 'Card', 0, $5)`,
    [f.cardId, f.clientId, f.boardId, f.doneId, f.identityId]
  );
  return f;
}

async function rule(
  client: Client,
  f: Fixture,
  input: { columnId: string; trigger: string; action?: string; active?: boolean; triggerConfig?: Record<string, unknown> }
): Promise<string> {
  const id = randomUUID();
  const action = input.action ?? 'send_email_notification';
  await client.query(
    `INSERT INTO kanban_column_automation_rules
       (id, client_id, board_id, board_column_id, trigger_type, action_type, recipient_role, is_active, trigger_config, created_by_identity_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
    [
      id,
      f.clientId,
      f.boardId,
      input.columnId,
      input.trigger,
      action,
      action === 'send_email_notification' ? 'creator' : null,
      input.active ?? true,
      JSON.stringify(input.triggerConfig ?? {}),
      f.identityId
    ]
  );
  return id;
}

async function event(client: Client, f: Fixture, payload: Record<string, unknown>): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO kanban_card_activities (client_id, card_id, type, author_identity_id, event_payload)
     VALUES ($1, $2, 'system_event', $3, $4::jsonb) RETURNING id`,
    [f.clientId, f.cardId, f.identityId, JSON.stringify(payload)]
  );
  return result.rows[0].id;
}

const moved = (f: Fixture) => ({ kind: 'card.moved', fromBoardColumnId: f.doingId, toBoardColumnId: f.doneId });

async function statusOf(client: Client, id: string) {
  const result = await client.query<{ status: string; attempt_count: number; last_error: string | null; due_in: number }>(
    `SELECT status, attempt_count, last_error, round(extract(epoch FROM next_attempt_at - now()) / 60)::int AS due_in
     FROM kanban_automation_dispatch_log WHERE id = $1`,
    [id]
  );
  return result.rows[0];
}

void test('outbox: card.moved gera uma intencao por regra de e-mail ativa de entrada e de saida, sem duplicar', () =>
  withTestDatabase(async (db, client) => {
    const f = await seed(client);
    const repository = new DispatchLogRepository(db);
    const entered = await rule(client, f, { columnId: f.doneId, trigger: 'column_entered' });
    const left = await rule(client, f, { columnId: f.doingId, trigger: 'column_left' });
    await rule(client, f, { columnId: f.doneId, trigger: 'column_entered', active: false });
    await rule(client, f, { columnId: f.doneId, trigger: 'column_entered', action: 'execute_ai_agent' });
    await rule(client, f, { columnId: f.doingId, trigger: 'column_entered' });
    const late = await rule(client, f, { columnId: f.doneId, trigger: 'column_entered' });
    await client.query(`UPDATE kanban_column_automation_rules SET created_at = now() + interval '1 minute' WHERE id = $1`, [late]);
    const activityId = await event(client, f, moved(f));

    const ids = await repository.recordForActivity(REF, f.clientId, activityId);
    assert.equal(ids.length, 2);
    const rows = await client.query<{ automation_rule_id: string; board_column_id: string; status: string }>(
      `SELECT automation_rule_id, board_column_id, status FROM kanban_automation_dispatch_log WHERE source_activity_id = $1`,
      [activityId]
    );
    assert.deepEqual(
      rows.rows.map((row) => [row.automation_rule_id, row.board_column_id, row.status]).sort(),
      [
        [entered, f.doneId, 'pending'],
        [left, f.doingId, 'pending']
      ].sort()
    );
    assert.deepEqual(await repository.recordForActivity(REF, f.clientId, activityId), [], 'reentrega nao duplica');
    assert.deepEqual(await repository.recordForActivity(REF, randomUUID(), activityId), [], 'outro tenant');
  }));

void test('outbox: juridico_process_changed dispara so a regra da coluna gravada no evento', () =>
  withTestDatabase(async (db, client) => {
    const f = await seed(client);
    const repository = new DispatchLogRepository(db);
    const inColumn = await rule(client, f, { columnId: f.doneId, trigger: 'juridico_process_moved' });
    await rule(client, f, { columnId: f.doingId, trigger: 'juridico_process_moved' });

    const withColumn = await event(client, f, { kind: 'juridico_process_changed', boardColumnId: f.doneId });
    const ids = await repository.recordForActivity(REF, f.clientId, withColumn);
    assert.equal(ids.length, 1);
    const row = await client.query(`SELECT automation_rule_id FROM kanban_automation_dispatch_log WHERE id = $1`, [ids[0]]);
    assert.equal(row.rows[0].automation_rule_id, inColumn);

    const legacy = await event(client, f, { kind: 'juridico_process_changed' });
    assert.deepEqual(await repository.recordForActivity(REF, f.clientId, legacy), [], 'evento sem coluna nao dispara');
  }));

void test('outbox: djen_publication_received dispara so a regra DJEN da coluna gravada no evento', () =>
  withTestDatabase(async (db, client) => {
    const f = await seed(client);
    const repository = new DispatchLogRepository(db);
    const djen = await rule(client, f, { columnId: f.doneId, trigger: 'djen_publication_received' });
    await rule(client, f, { columnId: f.doneId, trigger: 'juridico_process_moved' });
    await rule(client, f, { columnId: f.doingId, trigger: 'djen_publication_received' });

    const publication = await event(client, f, { kind: 'djen_publication_received', boardColumnId: f.doneId });
    const ids = await repository.recordForActivity(REF, f.clientId, publication);
    assert.equal(ids.length, 1);
    const row = await client.query(`SELECT automation_rule_id FROM kanban_automation_dispatch_log WHERE id = $1`, [ids[0]]);
    assert.equal(row.rows[0].automation_rule_id, djen);

    const movement = await event(client, f, { kind: 'juridico_process_changed', boardColumnId: f.doneId });
    const movementIds = await repository.recordForActivity(REF, f.clientId, movement);
    const movementRule = await client.query(`SELECT automation_rule_id FROM kanban_automation_dispatch_log WHERE id = ANY($1::uuid[])`, [movementIds]);
    assert.ok(movementRule.rows.every((item: { automation_rule_id: string }) => item.automation_rule_id !== djen), 'movimentacao nao dispara regra DJEN');
  }));

void test('outbox: varredura recria intencao de evento recente que ficou sem linha', () =>
  withTestDatabase(async (db, client) => {
    const f = await seed(client);
    const repository = new DispatchLogRepository(db);
    await rule(client, f, { columnId: f.doneId, trigger: 'column_entered' });
    await event(client, f, moved(f));
    const old = await event(client, f, moved(f));
    await client.query(`UPDATE kanban_card_activities SET created_at = now() - interval '2 days' WHERE id = $1`, [old]);

    assert.equal(await repository.recoverRecent(REF, f.clientId), 1, 'so o evento das ultimas 24 h');
    assert.equal(await repository.recoverRecent(REF, f.clientId), 0);
    assert.equal((await repository.listDue(REF, f.clientId)).length, 1);
  }));

void test('outbox: retomada le a regra atual; falhas esperam 1, 2, 4 e 8 min e a quinta e terminal', () =>
  withTestDatabase(async (db, client) => {
    const f = await seed(client);
    const repository = new DispatchLogRepository(db);
    const ruleId = await rule(client, f, { columnId: f.doneId, trigger: 'column_entered' });
    const [id] = await repository.recordForActivity(REF, f.clientId, await event(client, f, moved(f)));

    const waits: number[] = [];
    for (let attempt = 1; attempt <= EMAIL_DISPATCH_MAX_ATTEMPTS; attempt += 1) {
      const row = await repository.claim(REF, id);
      assert.ok(row, `tentativa ${attempt} retomada`);
      assert.equal(row.attemptCount, attempt);
      assert.equal(row.boardId, f.boardId);
      assert.equal(row.ruleActive, true);
      assert.equal(row.triggerType, 'column_entered');
      assert.equal(row.recipientRole, 'creator');
      assert.equal(row.automationRuleId, ruleId);
      assert.equal(await repository.claim(REF, id), null, 'em processamento nao e retomada de novo');
      const status = await repository.scheduleRetryOrFail(REF, id, 'smtp down');
      const current = await statusOf(client, id);
      if (attempt < EMAIL_DISPATCH_MAX_ATTEMPTS) {
        assert.equal(status, 'pending');
        waits.push(current.due_in);
        assert.equal(await repository.claim(REF, id), null, 'antes do prazo nao e retomada');
        await client.query(`UPDATE kanban_automation_dispatch_log SET next_attempt_at = now() WHERE id = $1`, [id]);
      } else {
        assert.equal(status, 'failed');
        assert.equal(current.last_error, 'smtp down');
      }
    }
    assert.deepEqual(waits, [1, 2, 4, 8]);
    assert.equal(await repository.claim(REF, id), null, 'falha terminal nao e retomada sozinha');

    assert.equal(await repository.requeueFailed(REF, f.clientId, id), true);
    assert.equal(await repository.requeueFailed(REF, f.clientId, id), false, 'so falha terminal volta');
    const requeued = await statusOf(client, id);
    assert.equal(requeued.status, 'pending');
    assert.equal(requeued.attempt_count, 0);
  }));

void test('outbox: processamento parado ha 5 minutos e retomado; regra desativada chega como inativa', () =>
  withTestDatabase(async (db, client) => {
    const f = await seed(client);
    const repository = new DispatchLogRepository(db);
    const ruleId = await rule(client, f, { columnId: f.doneId, trigger: 'column_entered' });
    const [id] = await repository.recordForActivity(REF, f.clientId, await event(client, f, moved(f)));
    assert.ok(await repository.claim(REF, id));
    await client.query(`UPDATE kanban_automation_dispatch_log SET updated_at = now() - interval '6 minutes' WHERE id = $1`, [id]);
    await client.query(`UPDATE kanban_column_automation_rules SET is_active = false WHERE id = $1`, [ruleId]);

    assert.deepEqual(await repository.listDue(REF, f.clientId), [id]);
    const row = await repository.claim(REF, id);
    assert.equal(row?.attemptCount, 2);
    assert.equal(row?.ruleActive, false);
    await repository.markSkipped(REF, id, 'rule_inactive');
    assert.equal((await statusOf(client, id)).status, 'skipped');
  }));

void test('outbox: agendado e unico por regra, card e dia e retoma a configuracao do gatilho', () =>
  withTestDatabase(async (db, client) => {
    const f = await seed(client);
    const repository = new DispatchLogRepository(db);
    const ruleId = await rule(client, f, { columnId: f.doneId, trigger: 'card_stale', triggerConfig: { daysStale: 5 } });
    const intent = { automationRuleId: ruleId, cardId: f.cardId, boardColumnId: f.doneId };

    const [id] = await repository.recordScheduled(REF, f.clientId, '2026-10-17', [intent]);
    assert.ok(id);
    assert.deepEqual(await repository.recordScheduled(REF, f.clientId, '2026-10-17', [intent]), []);
    assert.equal((await repository.recordScheduled(REF, f.clientId, '2026-10-18', [intent])).length, 1);
    assert.deepEqual(await repository.recordScheduled(REF, f.clientId, '2026-10-19', []), []);

    const row = await repository.claim(REF, id);
    assert.equal(row?.dispatchDate, '2026-10-17');
    assert.equal(row?.sourceActivityId, null);
    assert.equal(row?.triggerConfig?.daysStale, 5);
  }));

void test('outbox: destinatario atendido fica registrado uma vez; backlog conta por estado', () =>
  withTestDatabase(async (db, client) => {
    const f = await seed(client);
    const repository = new DispatchLogRepository(db);
    await rule(client, f, { columnId: f.doneId, trigger: 'column_entered' });
    await rule(client, f, { columnId: f.doingId, trigger: 'column_left' });
    const [first, second] = await repository.recordForActivity(REF, f.clientId, await event(client, f, moved(f)));
    const recipient = randomUUID();

    await repository.recordRecipientSent(REF, f.clientId, first, recipient);
    await repository.recordRecipientSent(REF, f.clientId, first, recipient);
    assert.deepEqual(await repository.sentRecipients(REF, f.clientId, first), [recipient]);
    assert.deepEqual(await repository.sentRecipients(REF, randomUUID(), first), [], 'outro tenant');

    await repository.claim(REF, second);
    const backlog = await repository.backlog(REF, f.clientId);
    assert.equal(backlog.pending, 1);
    assert.equal(backlog.processing, 1);
    assert.equal(backlog.failed, 0);
    assert.ok(backlog.oldestPendingAt);
  }));

void test('outbox: tela de envios lista so cards visiveis ao usuario', () =>
  withTestDatabase(async (db, client) => {
    const f = await seed(client);
    const repository = new DispatchLogRepository(db);
    await rule(client, f, { columnId: f.doneId, trigger: 'column_entered' });
    const [id] = await repository.recordForActivity(REF, f.clientId, await event(client, f, moved(f)));
    const member = randomUUID();
    await client.query(
      `INSERT INTO kanban_board_members (client_id, board_id, identity_id, role) VALUES ($1, $2, $3, 'board_admin')`,
      [f.clientId, f.boardId, member]
    );
    const viewer = (identityId: string): KanbanViewer => ({
      identityId,
      clientId: f.clientId,
      isAdmin: true,
      officeIds: [],
      officeVisibilityEnabled: false
    });

    const rows = await repository.listForAdmin(REF, f.clientId, viewer(member), ['pending']);
    assert.deepEqual(rows.map((row) => [row.id, row.boardName, row.columnName, row.cardTitle, row.triggerType]), [
      [id, 'Board', 'Done', 'Card', 'column_entered']
    ]);
    // flow:admin ve envios de todo board, membro ou nao (regra de 2026-11-11); quem nao e admin nem membro, nada.
    assert.equal((await repository.listForAdmin(REF, f.clientId, viewer(randomUUID()), ['pending'])).length, 1, 'admin nao membro');
    assert.deepEqual(
      await repository.listForAdmin(REF, f.clientId, { ...viewer(randomUUID()), isAdmin: false }, ['pending']),
      [],
      'nao admin, nao membro'
    );
    assert.deepEqual(await repository.listForAdmin(REF, f.clientId, viewer(member), ['failed']), []);

    const target = await repository.findTarget(REF, f.clientId, id);
    assert.deepEqual(target, { id, status: 'pending', cardId: f.cardId, boardId: f.boardId });
    assert.equal(await repository.findTarget(REF, randomUUID(), id), null);
  }));
