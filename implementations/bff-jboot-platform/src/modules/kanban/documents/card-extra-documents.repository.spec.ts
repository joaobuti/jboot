import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { DocumentSyncRepository } from '../drive/document-sync.repository';
import { CardExtraDocumentsRepository } from './card-extra-documents.repository';

interface Fixture {
  clientId: string;
  cardId: string;
  userId: string;
}

async function setup(client: Client): Promise<Fixture> {
  const clientId = randomUUID();
  const boardId = randomUUID();
  const columnId = randomUUID();
  const userId = randomUUID();
  const cardId = randomUUID();
  await client.query(`INSERT INTO kanban_boards (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'B', $3)`, [boardId, clientId, userId]);
  await client.query(`INSERT INTO kanban_board_columns (id, client_id, board_id, name, position) VALUES ($1, $2, $3, 'Protocolo', 0)`, [columnId, clientId, boardId]);
  await client.query(
    `INSERT INTO kanban_cards (id, client_id, board_id, board_column_id, title, position, created_by_identity_id)
     VALUES ($1, $2, $3, $4, 'Salim', 0, $5)`,
    [cardId, clientId, boardId, columnId, userId]
  );
  return { clientId, cardId, userId };
}

async function activateDrive(client: Client, f: Fixture) {
  await client.query(
    `INSERT INTO kanban_drive_configurations (client_id, provider, credential_mode, root_folder_id, status, updated_by_identity_id, refresh_token_enc)
     VALUES ($1, 'google_drive', 'oauth', 'root', 'active', $2, '\\x00'::bytea)`,
    [f.clientId, f.userId]
  );
}

function add(repository: CardExtraDocumentsRepository, f: Fixture, overrides: { description?: string | null; fileName?: string } = {}) {
  const documentId = randomUUID();
  return repository.create(TEST_DATABASE_REF, f.clientId, {
    documentId,
    cardId: f.cardId,
    description: overrides.description ?? null,
    activityId: randomUUID(),
    attachmentId: randomUUID(),
    fileName: overrides.fileName ?? 'extrato.pdf',
    contentType: 'application/pdf',
    sizeBytes: 2048,
    sha256: 'c'.repeat(64),
    storageBucket: 'bucket',
    storageKey: `k/${documentId}.pdf`,
    identityId: f.userId
  });
}

async function syncOf(client: Client, documentId: string) {
  const result = await client.query<{ state: string; source_type: string; customer_id: string | null; remove_requested: boolean; next_attempt: boolean }>(
    `SELECT state, source_type, customer_id, remove_requested_at IS NOT NULL AS remove_requested, next_attempt_at IS NOT NULL AS next_attempt
     FROM kanban_document_syncs WHERE document_id = $1`,
    [documentId]
  );
  return result.rows;
}

async function events(client: Client, cardId: string) {
  const result = await client.query<{ kind: string }>(
    `SELECT event_payload->>'kind' AS kind FROM kanban_card_activities WHERE card_id = $1 ORDER BY created_at, id`,
    [cardId]
  );
  return result.rows.map((row) => row.kind);
}

void test('avulsos: envio com descricao, lista so os ativos na ordem de envio e nao vaza entre tenants', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CardExtraDocumentsRepository(db);
    const f = await setup(client);
    const first = await add(repository, f, { description: 'Extrato mar/2026', fileName: 'extrato.pdf' });
    const second = await add(repository, f, { fileName: 'rg.jpg' });
    assert.equal(first.driveQueued, false, 'Drive desligado: nada na fila');
    assert.deepEqual([first.document.description, first.document.fileName, first.document.sizeBytes], ['Extrato mar/2026', 'extrato.pdf', 2048]);

    const listed = await repository.listActive(TEST_DATABASE_REF, f.clientId, f.cardId);
    assert.deepEqual(listed.map((row) => row.id), [first.document.id, second.document.id]);
    assert.deepEqual(await repository.listActive(TEST_DATABASE_REF, randomUUID(), f.cardId), []);
    assert.equal(await repository.findActive(TEST_DATABASE_REF, randomUUID(), f.cardId, first.document.id), null);

    assert.ok(await repository.remove(TEST_DATABASE_REF, f.clientId, { cardId: f.cardId, documentId: first.document.id, identityId: f.userId, activityId: randomUUID() }));
    assert.equal(await repository.remove(TEST_DATABASE_REF, f.clientId, { cardId: f.cardId, documentId: first.document.id, identityId: f.userId, activityId: randomUUID() }), null, 'segunda remocao nao vale');
    assert.deepEqual((await repository.listActive(TEST_DATABASE_REF, f.clientId, f.cardId)).map((row) => row.id), [second.document.id]);
    assert.equal(await repository.findActive(TEST_DATABASE_REF, f.clientId, f.cardId, first.document.id), null);
    // Mesma transacao do teste: horarios iguais, entao compara sem ordem.
    assert.deepEqual((await events(client, f.cardId)).sort(), ['card.extra_document_added', 'card.extra_document_added', 'card.extra_document_removed']);
    const kept = await client.query(`SELECT removed_at IS NOT NULL AS removed FROM kanban_card_extra_documents WHERE id = $1`, [first.document.id]);
    assert.deepEqual(kept.rows, [{ removed: true }], 'remocao logica: a linha continua');
  }));

void test('avulsos no Drive: entra na fila com o cliente do card; remover tira da fila ou pede a lixeira', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CardExtraDocumentsRepository(db);
    const syncs = new DocumentSyncRepository(db);
    const f = await setup(client);
    await activateDrive(client, f);
    const customerId = randomUUID();
    await client.query(`INSERT INTO kanban_card_customers (client_id, card_id, customer_id, created_by_identity_id) VALUES ($1, $2, $3, $4)`, [f.clientId, f.cardId, customerId, f.userId]);

    // Ainda nao enviado: sai da fila sem chamar o Drive.
    const pending = await add(repository, f);
    assert.equal(pending.driveQueued, true);
    assert.deepEqual(await syncOf(client, pending.document.id), [{ state: 'pending', source_type: 'card_extra_document', customer_id: customerId, remove_requested: false, next_attempt: true }]);
    const removedPending = await repository.remove(TEST_DATABASE_REF, f.clientId, { cardId: f.cardId, documentId: pending.document.id, identityId: f.userId, activityId: randomUUID() });
    assert.deepEqual(removedPending, { driveRemovalQueued: false });
    assert.deepEqual((await syncOf(client, pending.document.id)).map((row) => [row.state, row.remove_requested, row.next_attempt]), [['deleted', true, false]]);

    // Ja no Drive: volta a fila para ir a lixeira.
    const synced = await add(repository, f, { fileName: 'b.pdf' });
    await client.query(`UPDATE kanban_document_syncs SET state = 'synced', remote_file_id = 'remote-1', next_attempt_at = NULL WHERE document_id = $1`, [synced.document.id]);
    assert.deepEqual(await repository.remove(TEST_DATABASE_REF, f.clientId, { cardId: f.cardId, documentId: synced.document.id, identityId: f.userId, activityId: randomUUID() }), { driveRemovalQueued: true });
    assert.deepEqual((await syncOf(client, synced.document.id)).map((row) => [row.state, row.remove_requested, row.next_attempt]), [['pending', true, true]]);

    // Envio em andamento: termina e volta a fila para remover (complete nao marca synced).
    const inFlight = await add(repository, f, { fileName: 'c.pdf' });
    const syncId = (await client.query<{ id: string }>(`SELECT id FROM kanban_document_syncs WHERE document_id = $1`, [inFlight.document.id])).rows[0].id;
    const claim = await syncs.claim(TEST_DATABASE_REF, f.clientId, syncId);
    assert.ok(claim);
    assert.equal(claim.removeRequested, false);
    await repository.remove(TEST_DATABASE_REF, f.clientId, { cardId: f.cardId, documentId: inFlight.document.id, identityId: f.userId, activityId: randomUUID() });
    assert.equal((await syncOf(client, inFlight.document.id))[0].state, 'syncing');
    assert.ok(await syncs.complete(TEST_DATABASE_REF, f.clientId, syncId, claim, { remoteFileId: 'remote-2', remoteVersion: '1' }));
    assert.deepEqual((await syncOf(client, inFlight.document.id)).map((row) => [row.state, row.remove_requested, row.next_attempt]), [['pending', true, true]]);
    const removal = await syncs.claim(TEST_DATABASE_REF, f.clientId, syncId);
    assert.deepEqual([removal?.removeRequested, removal?.remoteFileId, removal?.sourceType], [true, 'remote-2', 'card_extra_document']);
    assert.ok(removal && await syncs.markRemoved(TEST_DATABASE_REF, f.clientId, syncId, removal));
    assert.equal((await syncOf(client, inFlight.document.id))[0].state, 'deleted');

    // Origem do avulso para o worker: anexo, card e cliente.
    const source = await syncs.source(TEST_DATABASE_REF, f.clientId, { sourceType: 'card_extra_document', documentId: synced.document.id });
    assert.deepEqual([source?.storageKey, source?.contentType, source?.customerId, source?.cardId, source?.fileName], [`k/${synced.document.id}.pdf`, 'application/pdf', customerId, f.cardId, 'b.pdf']);
  }));

void test('avulsos: Drive ligado depois sobe so os que continuam no card', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CardExtraDocumentsRepository(db);
    const syncs = new DocumentSyncRepository(db);
    const f = await setup(client);
    const kept = await add(repository, f);
    const removed = await add(repository, f, { fileName: 'x.pdf' });
    await repository.remove(TEST_DATABASE_REF, f.clientId, { cardId: f.cardId, documentId: removed.document.id, identityId: f.userId, activityId: randomUUID() });
    await activateDrive(client, f);
    await syncs.reconcileMissing(TEST_DATABASE_REF, f.clientId);
    assert.deepEqual((await syncOf(client, kept.document.id)).map((row) => [row.state, row.customer_id]), [['pending', null]]);
    assert.deepEqual(await syncOf(client, removed.document.id), []);
  }));
