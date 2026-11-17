import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { allCardsViewer } from '../../../test/kanban-visibility';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { CardsRepository } from '../cards/cards.repository';
import { ColumnsRepository } from '../columns/columns.repository';
import { CardDocumentsRepository } from './card-documents.repository';
import { isChecklistPending } from './checklist-pending';

interface Fixture {
  clientId: string;
  boardId: string;
  columnId: string;
  userId: string;
}

async function setup(client: Client): Promise<Fixture> {
  const clientId = randomUUID();
  const boardId = randomUUID();
  const columnId = randomUUID();
  const userId = randomUUID();
  await client.query(`INSERT INTO kanban_boards (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'B', $3)`, [
    boardId,
    clientId,
    userId
  ]);
  await client.query(
    `INSERT INTO kanban_board_columns (id, client_id, board_id, name, position) VALUES ($1, $2, $3, 'Todo', 0)`,
    [columnId, clientId, boardId]
  );
  return { clientId, boardId, columnId, userId };
}

let positionSeq = 0;
async function createCard(client: Client, f: Fixture): Promise<string> {
  const cardId = randomUUID();
  await client.query(
    `INSERT INTO kanban_cards (id, client_id, board_id, board_column_id, title, position, created_by_identity_id)
     VALUES ($1, $2, $3, $4, 'Lead', $5, $6)`,
    [cardId, f.clientId, f.boardId, f.columnId, positionSeq++, f.userId]
  );
  return cardId;
}

async function createType(client: Client, f: Fixture, name: string, opts: { required?: boolean; active?: boolean; sortOrder?: number } = {}) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO kanban_board_document_types (client_id, board_id, name, required, active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [f.clientId, f.boardId, name, opts.required ?? true, opts.active ?? true, opts.sortOrder ?? 0]
  );
  return result.rows[0].id;
}

async function upload(repository: CardDocumentsRepository, f: Fixture, cardId: string, documentTypeId: string) {
  const attachmentId = randomUUID();
  return repository.createUpload(TEST_DATABASE_REF, f.clientId, {
    documentId: randomUUID(),
    cardId,
    documentTypeId,
    activityId: randomUUID(),
    attachmentId,
    fileName: 'doc.pdf',
    contentType: 'application/pdf',
    sizeBytes: 100,
    storageBucket: 'kanban-card-attachments',
    storageKey: `${f.clientId}/${cardId}/x/${attachmentId}-doc.pdf`,
    identityId: f.userId
  });
}

async function review(
  repository: CardDocumentsRepository,
  f: Fixture,
  cardId: string,
  documentId: string,
  status: 'aceito' | 'rejeitado'
) {
  return repository.review(TEST_DATABASE_REF, f.clientId, {
    cardId,
    documentId,
    status,
    rejectionReason: status === 'rejeitado' ? 'Ilegivel' : null,
    reviewerIdentityId: randomUUID(),
    eventPayload: { documentId }
  });
}

void test('createUpload grava activity card.document_uploaded + attachment da activity + documento enviado, sem nome de arquivo no evento', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CardDocumentsRepository(db);
    const f = await setup(client);
    const cardId = await createCard(client, f);
    const typeId = await createType(client, f, 'Procuracao');

    const document = await upload(repository, f, cardId, typeId);
    assert.equal(document.status, 'enviado');
    assert.equal(document.cardId, cardId);

    const activity = await client.query(
      `SELECT card_id, type, event_payload FROM kanban_card_activities WHERE id = $1`,
      [document.attachment.activityId]
    );
    assert.equal(activity.rows[0].card_id, cardId, 'attachment pertence a activity do MESMO card');
    assert.equal(activity.rows[0].type, 'system_event');
    assert.deepEqual(Object.keys(activity.rows[0].event_payload).sort(), ['attachmentId', 'documentId', 'documentTypeId', 'kind']);
    assert.equal(activity.rows[0].event_payload.kind, 'card.document_uploaded');
    assert.doesNotMatch(JSON.stringify(activity.rows[0].event_payload), /doc\.pdf/);

    // Leitura por outro card ou outro tenant nao encontra o documento.
    assert.equal(await repository.findById(TEST_DATABASE_REF, f.clientId, await createCard(client, f), document.id), null);
    assert.equal(await repository.findById(TEST_DATABASE_REF, randomUUID(), cardId, document.id), null);
    assert.deepEqual(await repository.listForCard(TEST_DATABASE_REF, randomUUID(), cardId), []);
  }));

void test('review: so altera enviado (segunda revisao devolve null) e grava system_event na mesma operacao', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CardDocumentsRepository(db);
    const f = await setup(client);
    const cardId = await createCard(client, f);
    const typeId = await createType(client, f, 'RG');
    const document = await upload(repository, f, cardId, typeId);

    const rejected = await review(repository, f, cardId, document.id, 'rejeitado');
    assert.equal(rejected?.document.status, 'rejeitado');
    assert.equal(rejected?.document.rejectionReason, 'Ilegivel');
    assert.ok(rejected?.document.reviewedAt);
    const event = await client.query(`SELECT event_payload FROM kanban_card_activities WHERE id = $1`, [rejected?.activityId]);
    assert.equal(event.rows[0].event_payload.kind, 'card.document_rejected');

    assert.equal(await review(repository, f, cardId, document.id, 'aceito'), null);
    // Outro tenant nao revisa.
    const other = await upload(repository, f, cardId, typeId);
    const crossTenant = await repository.review(TEST_DATABASE_REF, randomUUID(), {
      cardId,
      documentId: other.id,
      status: 'aceito',
      rejectionReason: null,
      reviewerIdentityId: randomUUID(),
      eventPayload: {}
    });
    assert.equal(crossTenant, null);
  }));

void test('pendencias e completude: estado = envio mais recente; so obrigatorios ativos contam; agregado por quadro', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CardDocumentsRepository(db);
    const f = await setup(client);
    const cardA = await createCard(client, f);
    const cardB = await createCard(client, f);
    const procuracao = await createType(client, f, 'Procuracao', { sortOrder: 0 });
    const rg = await createType(client, f, 'RG', { sortOrder: 1 });
    const extra = await createType(client, f, 'Demais', { required: false, sortOrder: 2 });
    const legado = await createType(client, f, 'Legado', { active: false, sortOrder: 3 });

    // Card ainda nao criado: todos os obrigatorios ativos pendentes.
    assert.deepEqual(
      (await repository.listPendingRequired(TEST_DATABASE_REF, f.clientId, f.boardId, null)).map((t) => t.name),
      ['Procuracao', 'RG']
    );

    // Card A: procuracao aceita; RG aceito e depois reenviado (mais recente = enviado).
    const pA = await upload(repository, f, cardA, procuracao);
    await review(repository, f, cardA, pA.id, 'aceito');
    const rgOld = await upload(repository, f, cardA, rg);
    await review(repository, f, cardA, rgOld.id, 'aceito');
    await upload(repository, f, cardA, rg);
    await review(repository, f, cardA, (await upload(repository, f, cardA, extra)).id, 'aceito');
    await review(repository, f, cardA, (await upload(repository, f, cardA, legado)).id, 'aceito');

    assert.deepEqual(
      await repository.listPendingRequired(TEST_DATABASE_REF, f.clientId, f.boardId, cardA),
      [{ id: rg, name: 'RG' }]
    );
    assert.equal(await repository.findLatestIdForType(TEST_DATABASE_REF, f.clientId, cardA, rg) !== rgOld.id, true);

    // Card B: tudo aceito (rejeicao antiga superada por envio aceito).
    const rejectedOld = await upload(repository, f, cardB, procuracao);
    await review(repository, f, cardB, rejectedOld.id, 'rejeitado');
    await review(repository, f, cardB, (await upload(repository, f, cardB, procuracao)).id, 'aceito');
    await review(repository, f, cardB, (await upload(repository, f, cardB, rg)).id, 'aceito');
    assert.deepEqual(await repository.listPendingRequired(TEST_DATABASE_REF, f.clientId, f.boardId, cardB), []);

    const completeness = await repository.completenessForBoard(TEST_DATABASE_REF, f.clientId, f.boardId, allCardsViewer(f.clientId));
    assert.equal(completeness.totalRequired, 2);
    assert.equal(completeness.acceptedRequiredByCard.get(cardA), 1);
    assert.equal(completeness.acceptedRequiredByCard.get(cardB), 2);

    // Outro tenant: nada agregado e nenhum tipo pendente visivel.
    const foreign = await repository.completenessForBoard(TEST_DATABASE_REF, randomUUID(), f.boardId, allCardsViewer(f.clientId));
    assert.equal(foreign.totalRequired, 0);
    assert.equal(foreign.acceptedRequiredByCard.size, 0);
  }));

void test('constraint: rejeitado sem motivo e recusado pelo banco', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CardDocumentsRepository(db);
    const f = await setup(client);
    const cardId = await createCard(client, f);
    const typeId = await createType(client, f, 'RG');
    const document = await upload(repository, f, cardId, typeId);
    await client.query('SAVEPOINT attempt');
    await assert.rejects(
      client.query(
        `UPDATE kanban_card_documents SET status = 'rejeitado', reviewed_at = now(), reviewed_by_identity_id = $2 WHERE id = $1`,
        [document.id, randomUUID()]
      ),
      /check/i
    );
    await client.query('ROLLBACK TO SAVEPOINT attempt');
  }));

void test('Sprint 3: importacao entra na coluna com requires_complete_checklist e fica sinalizada ate o checklist completar (inclui rejeicao depois da entrada)', () =>
  withTestDatabase(async (db, client) => {
    const documents = new CardDocumentsRepository(db);
    const cards = new CardsRepository(db);
    const columns = new ColumnsRepository(db);
    const f = await setup(client);
    await client.query(`UPDATE kanban_board_columns SET requires_complete_checklist = true WHERE id = $1`, [f.columnId]);
    const freeColumnId = randomUUID();
    await client.query(
      `INSERT INTO kanban_board_columns (id, client_id, board_id, name, position) VALUES ($1, $2, $3, 'Livre', 1)`,
      [freeColumnId, f.clientId, f.boardId]
    );
    const typeId = await createType(client, f, 'Procuracao');

    const imported = await cards.createFromSource(
      TEST_DATABASE_REF,
      f.clientId,
      f.boardId,
      { boardColumnId: f.columnId, title: 'Lead importado', sourceModule: 'juridico', sourceType: 'process', sourceId: randomUUID(), sourcePayload: {} },
      f.userId
    );
    assert.equal(imported.created, true);
    const freeCardId = randomUUID();
    await client.query(
      `INSERT INTO kanban_cards (id, client_id, board_id, board_column_id, title, position, created_by_identity_id)
       VALUES ($1, $2, $3, $4, 'Livre', 0, $5)`,
      [freeCardId, f.clientId, f.boardId, freeColumnId, f.userId]
    );

    const pendingOf = async (cardId: string, columnId: string) => {
      const completeness = await documents.completenessForBoard(TEST_DATABASE_REF, f.clientId, f.boardId, allCardsViewer(f.clientId));
      const gated = new Set(
        (await columns.list(TEST_DATABASE_REF, f.clientId, f.boardId)).filter((c) => c.requiresCompleteChecklist).map((c) => c.id)
      );
      return isChecklistPending(gated.has(columnId), {
        acceptedRequired: completeness.acceptedRequiredByCard.get(cardId) ?? 0,
        totalRequired: completeness.totalRequired
      });
    };

    assert.equal(await pendingOf(imported.card.id, f.columnId), true, 'importado sem documento: sinalizado');
    assert.equal(await pendingOf(freeCardId, freeColumnId), false, 'coluna sem flag nunca sinaliza');

    const first = await upload(documents, f, imported.card.id, typeId);
    await review(documents, f, imported.card.id, first.id, 'aceito');
    assert.equal(await pendingOf(imported.card.id, f.columnId), false, 'checklist completo nao sinaliza');

    const resent = await upload(documents, f, imported.card.id, typeId);
    await review(documents, f, imported.card.id, resent.id, 'rejeitado');
    assert.equal(await pendingOf(imported.card.id, f.columnId), true, 'rejeitado depois da entrada volta a sinalizar');
  }));
