import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { allCardsViewer } from '../../../test/kanban-visibility';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { CardsRepository } from './cards.repository';

interface Fixture {
  clientId: string;
  boardId: string;
  columnId: string;
  statusOpenId: string;
  statusDoneId: string;
  tagBugId: string;
  cardBugTitled: string;
  cardWithStatusId: string;
  cardPlainId: string;
}

async function seed(client: Client): Promise<Fixture> {
  const clientId = randomUUID();
  const identityId = randomUUID();
  const boardId = randomUUID();
  const columnId = randomUUID();
  const statusOpenId = randomUUID();
  const statusDoneId = randomUUID();
  const tagBugId = randomUUID();
  const cardBugTitled = randomUUID();
  const cardWithStatusId = randomUUID();
  const cardPlainId = randomUUID();

  await client.query(
    `INSERT INTO kanban_boards (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'Test board', $3)`,
    [boardId, clientId, identityId]
  );
  await client.query(
    `INSERT INTO kanban_board_columns (id, client_id, board_id, name, position) VALUES ($1, $2, $3, 'Todo', 0)`,
    [columnId, clientId, boardId]
  );
  await client.query(
    `INSERT INTO kanban_card_statuses (id, client_id, board_id, name) VALUES ($1, $2, $3, 'Open'), ($4, $2, $3, 'Done')`,
    [statusOpenId, clientId, boardId, statusDoneId]
  );
  await client.query(`INSERT INTO kanban_card_tags (id, client_id, board_id, name) VALUES ($1, $2, $3, 'bug')`, [
    tagBugId,
    clientId,
    boardId
  ]);

  await client.query(
    `INSERT INTO kanban_cards (id, client_id, board_id, board_column_id, title, description, position, created_by_identity_id)
     VALUES
       ($1, $4, $5, $6, 'Fix login bug', 'urgent regression', 0, $7),
       ($2, $4, $5, $6, 'Write docs', null, 1, $7),
       ($3, $4, $5, $6, 'Plain card', null, 2, $7)`,
    [cardBugTitled, cardWithStatusId, cardPlainId, clientId, boardId, columnId, identityId]
  );
  await client.query(`UPDATE kanban_cards SET card_status_id = $1 WHERE id = $2`, [statusOpenId, cardWithStatusId]);
  await client.query(`INSERT INTO kanban_card_tag_links (client_id, card_id, tag_id) VALUES ($1, $2, $3)`, [
    clientId,
    cardBugTitled,
    tagBugId
  ]);

  return { clientId, boardId, columnId, statusOpenId, statusDoneId, tagBugId, cardBugTitled, cardWithStatusId, cardPlainId };
}

void test('CardsRepository.list filters by search, cardStatusId and tagId, isolated and combined', async () => {
  await withTestDatabase(async (db, client) => {
    const fixture = await seed(client);
    const repository = new CardsRepository(db);
    const baseQuery = { limit: 50, offset: 0 };

    const bySearch = await repository.list(TEST_DATABASE_REF, fixture.clientId, fixture.boardId, {
      ...baseQuery,
      search: 'login'
    }, allCardsViewer(fixture.clientId));
    assert.deepEqual(bySearch.data.map((c) => c.id), [fixture.cardBugTitled]);

    const byTag = await repository.list(TEST_DATABASE_REF, fixture.clientId, fixture.boardId, {
      ...baseQuery,
      tagId: fixture.tagBugId
    }, allCardsViewer(fixture.clientId));
    assert.deepEqual(byTag.data.map((c) => c.id), [fixture.cardBugTitled]);

    const byStatus = await repository.list(TEST_DATABASE_REF, fixture.clientId, fixture.boardId, {
      ...baseQuery,
      cardStatusId: fixture.statusOpenId
    }, allCardsViewer(fixture.clientId));
    assert.deepEqual(byStatus.data.map((c) => c.id), [fixture.cardWithStatusId]);

    const byStatusNoMatch = await repository.list(TEST_DATABASE_REF, fixture.clientId, fixture.boardId, {
      ...baseQuery,
      cardStatusId: fixture.statusDoneId
    }, allCardsViewer(fixture.clientId));
    assert.deepEqual(byStatusNoMatch.data, []);

    const combinedNoMatch = await repository.list(TEST_DATABASE_REF, fixture.clientId, fixture.boardId, {
      ...baseQuery,
      tagId: fixture.tagBugId,
      cardStatusId: fixture.statusOpenId
    }, allCardsViewer(fixture.clientId));
    assert.deepEqual(combinedNoMatch.data, [], 'tag bug + status open never intersect in the fixture');

    const noFilters = await repository.list(TEST_DATABASE_REF, fixture.clientId, fixture.boardId, baseQuery, allCardsViewer(fixture.clientId));
    assert.equal(noFilters.data.length, 3);
  });
});

void test('CardsRepository.create and update persist dueDate, including explicit null clear', async () => {
  await withTestDatabase(async (db, client) => {
    const fixture = await seed(client);
    const repository = new CardsRepository(db);
    const created = await repository.create(
      TEST_DATABASE_REF,
      fixture.clientId,
      fixture.boardId,
      { boardColumnId: fixture.columnId, title: 'Due card', description: null, dueDate: '2026-06-30' },
      randomUUID()
    );

    assert.equal(created.dueDate, '2026-06-30');

    const updated = await repository.update(TEST_DATABASE_REF, fixture.clientId, fixture.boardId, created.id, {
      dueDate: null
    });
    assert.equal(updated.dueDate, null);
  });
});

void test('CardsRepository.createFromSource is idempotent by external source reference', async () => {
  await withTestDatabase(async (db, _client) => {
    const fixture = await seed(_client);
    const repository = new CardsRepository(db);
    const sourceInput = {
      boardColumnId: fixture.columnId,
      title: 'PJe 0000000-00.0000.0.00.0000',
      description: 'Imported from Juridico',
      sourceModule: 'juridico',
      sourceType: 'pje_comunicacao',
      sourceId: randomUUID(),
      sourcePayload: { numeroProcesso: '00000000000000000000' },
      sourceUrl: '/juridico/pje?comunicacao=1'
    };

    const first = await repository.createFromSource(
      TEST_DATABASE_REF,
      fixture.clientId,
      fixture.boardId,
      sourceInput,
      randomUUID()
    );
    const second = await repository.createFromSource(
      TEST_DATABASE_REF,
      fixture.clientId,
      fixture.boardId,
      sourceInput,
      randomUUID()
    );

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.card.id, first.card.id);
    assert.equal(first.card.sourceModule, 'juridico');
    assert.equal(first.card.sourceType, 'pje_comunicacao');
    assert.equal(first.card.sourceId, sourceInput.sourceId);
  });
});

// Sprint 13: o evento card.moved nasce na mesma transacao da movimentacao (base do outbox de e-mail
// e de IA); reordenar na mesma coluna nao gera evento.
void test('CardsRepository.move grava o evento card.moved na transacao da troca de coluna', async () => {
  await withTestDatabase(async (db, client) => {
    const fixture = await seed(client);
    const repository = new CardsRepository(db);
    const doneId = randomUUID();
    const mover = randomUUID();
    await client.query(
      `INSERT INTO kanban_board_columns (id, client_id, board_id, name, position) VALUES ($1, $2, $3, 'Done', 1)`,
      [doneId, fixture.clientId, fixture.boardId]
    );

    const moved = await repository.move(TEST_DATABASE_REF, fixture.clientId, fixture.boardId, fixture.cardPlainId, fixture.columnId, 2, doneId, 0, mover);
    assert.equal(moved.card.boardColumnId, doneId);
    assert.ok(moved.movedActivityId);
    const activity = await client.query(
      `SELECT card_id, type, author_identity_id, event_payload FROM kanban_card_activities WHERE id = $1`,
      [moved.movedActivityId]
    );
    assert.deepEqual(activity.rows[0], {
      card_id: fixture.cardPlainId,
      type: 'system_event',
      author_identity_id: mover,
      event_payload: { kind: 'card.moved', fromBoardColumnId: fixture.columnId, toBoardColumnId: doneId }
    });

    const reordered = await repository.move(TEST_DATABASE_REF, fixture.clientId, fixture.boardId, fixture.cardBugTitled, fixture.columnId, 0, fixture.columnId, 1, mover);
    assert.equal(reordered.movedActivityId, null);
  });
});
