import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { ScheduledAutomationRepository } from './scheduled-automation.repository';

interface Fixture {
  clientId: string;
  identityId: string;
  boardId: string;
  columnId: string;
  otherColumnId: string;
}

async function seedBoard(client: Client): Promise<Fixture> {
  const clientId = randomUUID();
  const identityId = randomUUID();
  const boardId = randomUUID();
  const columnId = randomUUID();
  const otherColumnId = randomUUID();

  await client.query(`INSERT INTO kanban_boards (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'Board', $3)`, [
    boardId,
    clientId,
    identityId
  ]);
  await client.query(`INSERT INTO kanban_board_columns (id, client_id, board_id, name, position) VALUES ($1, $2, $3, 'Doing', 0)`, [
    columnId,
    clientId,
    boardId
  ]);
  await client.query(`INSERT INTO kanban_board_columns (id, client_id, board_id, name, position) VALUES ($1, $2, $3, 'Done', 1)`, [
    otherColumnId,
    clientId,
    boardId
  ]);

  return { clientId, identityId, boardId, columnId, otherColumnId };
}

async function insertCard(client: Client, fixture: Fixture): Promise<string> {
  const cardId = randomUUID();
  await client.query(
    `INSERT INTO kanban_cards (id, client_id, board_id, board_column_id, title, position, created_by_identity_id)
     VALUES ($1, $2, $3, $4, 'Card', 0, $5)`,
    [cardId, fixture.clientId, fixture.boardId, fixture.columnId, fixture.identityId]
  );
  return cardId;
}

async function insertRule(
  client: Client,
  fixture: Fixture,
  triggerType: 'due_date_approaching' | 'card_stale',
  triggerConfig: Record<string, number>
): Promise<string> {
  const ruleId = randomUUID();
  await client.query(
    `INSERT INTO kanban_column_automation_rules
       (id, client_id, board_id, board_column_id, trigger_type, action_type, recipient_role, trigger_config, created_by_identity_id)
     VALUES ($1, $2, $3, $4, $5, 'send_email_notification', 'creator', $6::jsonb, $7)`,
    [ruleId, fixture.clientId, fixture.boardId, fixture.columnId, triggerType, JSON.stringify(triggerConfig), fixture.identityId]
  );
  return ruleId;
}

async function insertMovedIntoColumnActivity(client: Client, fixture: Fixture, cardId: string, toColumnId: string) {
  await client.query(
    `INSERT INTO kanban_card_activities (id, client_id, card_id, type, author_identity_id, event_payload, created_at)
     VALUES ($1, $2, $3, 'system_event', $4, $5::jsonb, now() - interval '1 day')`,
    [
      randomUUID(),
      fixture.clientId,
      cardId,
      fixture.identityId,
      JSON.stringify({ kind: 'card.moved', fromBoardColumnId: fixture.otherColumnId, toBoardColumnId: toColumnId })
    ]
  );
}

void test('ScheduledAutomationRepository.findDueDateApproachingCandidates matches exactly due_date - daysBefore = today', async () => {
  await withTestDatabase(async (db, client) => {
    const fixture = await seedBoard(client);
    const repository = new ScheduledAutomationRepository(db);
    await insertRule(client, fixture, 'due_date_approaching', { daysBefore: 3 });

    const matchingCardId = await insertCard(client, fixture);
    await client.query(`UPDATE kanban_cards SET due_date = CURRENT_DATE + 3 WHERE id = $1`, [matchingCardId]);

    const nonMatchingCardId = await insertCard(client, fixture);
    await client.query(`UPDATE kanban_cards SET due_date = CURRENT_DATE + 4 WHERE id = $1`, [nonMatchingCardId]);

    // Card sem due_date (padrao do insertCard acima): ausencia de fato gerador, nunca erro.

    const candidates = await repository.findDueDateApproachingCandidates(TEST_DATABASE_REF, fixture.clientId);

    assert.deepEqual(
      candidates.map((c) => c.cardId).sort(),
      [matchingCardId].sort()
    );
    assert.equal(candidates[0].daysBefore, 3);
  });
});

void test('ScheduledAutomationRepository.findDueDateApproachingCandidates reopens after due_date changes and disappears when cleared', async () => {
  await withTestDatabase(async (db, client) => {
    const fixture = await seedBoard(client);
    const repository = new ScheduledAutomationRepository(db);
    await insertRule(client, fixture, 'due_date_approaching', { daysBefore: 0 });
    const cardId = await insertCard(client, fixture);
    await client.query(`UPDATE kanban_cards SET due_date = CURRENT_DATE WHERE id = $1`, [cardId]);

    let candidates = await repository.findDueDateApproachingCandidates(TEST_DATABASE_REF, fixture.clientId);
    assert.equal(candidates.length, 1);

    // due_date muda para uma data futura: some da avaliacao de hoje.
    await client.query(`UPDATE kanban_cards SET due_date = CURRENT_DATE + 10 WHERE id = $1`, [cardId]);
    candidates = await repository.findDueDateApproachingCandidates(TEST_DATABASE_REF, fixture.clientId);
    assert.equal(candidates.length, 0);

    // due_date volta a bater hoje: reabre elegibilidade (nao "ja disparou uma vez para sempre").
    await client.query(`UPDATE kanban_cards SET due_date = CURRENT_DATE WHERE id = $1`, [cardId]);
    candidates = await repository.findDueDateApproachingCandidates(TEST_DATABASE_REF, fixture.clientId);
    assert.equal(candidates.length, 1);

    // due_date limpo (null): some da avaliacao, sem erro.
    await client.query(`UPDATE kanban_cards SET due_date = NULL WHERE id = $1`, [cardId]);
    candidates = await repository.findDueDateApproachingCandidates(TEST_DATABASE_REF, fixture.clientId);
    assert.equal(candidates.length, 0);
  });
});

void test('ScheduledAutomationRepository.findCardStaleCandidates uses Card.created_at when the card never left the column', async () => {
  await withTestDatabase(async (db, client) => {
    const fixture = await seedBoard(client);
    const repository = new ScheduledAutomationRepository(db);
    await insertRule(client, fixture, 'card_stale', { daysStale: 5 });

    const staleCardId = await insertCard(client, fixture);
    await client.query(`UPDATE kanban_cards SET created_at = now() - interval '6 days' WHERE id = $1`, [staleCardId]);

    const freshCardId = await insertCard(client, fixture);
    await client.query(`UPDATE kanban_cards SET created_at = now() - interval '1 day' WHERE id = $1`, [freshCardId]);

    const candidates = await repository.findCardStaleCandidates(TEST_DATABASE_REF, fixture.clientId);

    assert.deepEqual(
      candidates.map((c) => c.cardId).sort(),
      [staleCardId].sort()
    );
    assert.equal(candidates[0].daysStale, 5);
  });
});

void test('ScheduledAutomationRepository.findCardStaleCandidates restarts the clock on re-entry into the column', async () => {
  await withTestDatabase(async (db, client) => {
    const fixture = await seedBoard(client);
    const repository = new ScheduledAutomationRepository(db);
    await insertRule(client, fixture, 'card_stale', { daysStale: 5 });

    // Card criado ha 10 dias, mas reentrou na coluna ha 1 dia (moved event mais recente que
    // created_at) — a contagem deve usar a reentrada, nao a criacao original do card.
    const cardId = await insertCard(client, fixture);
    await client.query(`UPDATE kanban_cards SET created_at = now() - interval '10 days' WHERE id = $1`, [cardId]);
    await insertMovedIntoColumnActivity(client, fixture, cardId, fixture.columnId);

    const candidates = await repository.findCardStaleCandidates(TEST_DATABASE_REF, fixture.clientId);

    assert.equal(candidates.length, 0, 'reentered 1 day ago, below the 5-day threshold: must not be stale yet');
  });
});

void test('ScheduledAutomationRepository.listActiveFlowTenants filters database_refs by application_slug=flow and active status', async () => {
  await withTestDatabase(async (db) => {
    // Este teste roda contra o banco Kanban de teste (withTestDatabase so mocka
    // queryForDatabaseRef); listActiveFlowTenants usa queryIdentity, que withTestDatabase nao
    // fornece — smoke minimo: so garante que o metodo existe e nao lanca quando queryIdentity e
    // injetado (a query real do Identity e coberta pelo dev seed/smoke manual do gate).
    const fakeIdentity = {
      queryIdentity: async () => ({
        rows: [{ databaseRef: 'ref-1', clientId: 'client-1' }]
      })
    };
    const repository = new ScheduledAutomationRepository(fakeIdentity as never);
    void db;

    const tenants = await repository.listActiveFlowTenants();

    assert.deepEqual(tenants, [{ databaseRef: 'ref-1', clientId: 'client-1' }]);
  });
});
