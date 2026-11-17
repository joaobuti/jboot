import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { SignedKitRepository } from './signed-kit.repository';

interface Fixture { clientId: string; customerId: string; kitId: string; officeId: string; userId: string }

async function setup(client: Client): Promise<Fixture> {
  const f = { clientId: randomUUID(), customerId: randomUUID(), kitId: randomUUID(), officeId: '', userId: randomUUID() };
  f.officeId = (await client.query<{ id: string }>(
    `INSERT INTO kanban_offices (client_id, name, created_by_identity_id) VALUES ($1, 'Manaus', $2) RETURNING id`, [f.clientId, f.userId]
  )).rows[0].id;
  const runId = randomUUID();
  await client.query(
    `INSERT INTO kanban_customer_validation_runs (id, client_id, customer_id, agent_id, executor_identity_id, requested_by_identity_id, status, documents_snapshot, residence_proof_third_party)
     VALUES ($1, $2, $3, $4, $5, $5, 'expired', '[]'::jsonb, false)`,
    [runId, f.clientId, f.customerId, randomUUID(), f.userId]
  );
  await client.query(
    `INSERT INTO kanban_customer_office_kits (id, client_id, customer_id, run_id, office_id, contract_version, storage_key, file_name, size_bytes, sha256, report, created_by_identity_id)
     VALUES ($1, $2, $3, $4, $5, 1, 'k.docx', 'KIT_MARIA_2026-11-02.docx', 10, $6, '{}'::jsonb, $7)`,
    [f.kitId, f.clientId, f.customerId, runId, f.officeId, 'a'.repeat(64), f.userId]
  );
  return f;
}

function signed(f: Fixture, id = randomUUID()) {
  return { id, customerId: f.customerId, kitId: f.kitId, fileName: 'kit-assinado.pdf', contentType: 'application/pdf', sizeBytes: 100,
    sha256: 'b'.repeat(64), storageKey: `s/${id}`, uploadedByIdentityId: f.userId };
}

async function dispatchedRun(repository: SignedKitRepository, f: Fixture, signedKitId: string, executor = f.userId) {
  const run = await repository.createRun(TEST_DATABASE_REF, f.clientId, {
    id: randomUUID(), customerId: f.customerId, kitId: f.kitId, signedKitId, agentId: randomUUID(), executorIdentityId: executor, requestedByIdentityId: f.userId
  });
  assert.ok(run);
  await repository.markDispatched(TEST_DATABASE_REF, f.clientId, run.id, randomUUID(), 'https://claude.ai/code/s');
  return run;
}

void test('kit assinado: versoes, so uma atual, e versao nova expira a validacao em andamento', () =>
  withTestDatabase(async (db, client) => {
    const repository = new SignedKitRepository(db);
    const f = await setup(client);
    const first = await repository.createVersion(TEST_DATABASE_REF, f.clientId, signed(f));
    const run = await dispatchedRun(repository, f, first.id);
    assert.equal(await repository.createRun(TEST_DATABASE_REF, f.clientId, {
      id: randomUUID(), customerId: f.customerId, kitId: f.kitId, signedKitId: first.id, agentId: randomUUID(), executorIdentityId: f.userId, requestedByIdentityId: f.userId
    }), null, 'uma validacao em andamento por kit assinado');

    const second = await repository.createVersion(TEST_DATABASE_REF, f.clientId, signed(f));
    assert.deepEqual([first.version, second.version], [1, 2]);
    assert.equal((await repository.currentSigned(TEST_DATABASE_REF, f.clientId, f.kitId))?.id, second.id);
    const expired = await repository.findRun(TEST_DATABASE_REF, f.clientId, run.id);
    assert.deepEqual([expired?.status, expired?.errorCode], ['expired', 'signed_kit_replaced']);
    assert.equal((await repository.findSigned(TEST_DATABASE_REF, f.clientId, f.kitId, first.id))?.id, first.id, 'versao anterior fica guardada');
    assert.equal(await repository.currentSigned(TEST_DATABASE_REF, randomUUID(), f.kitId), null, 'outro tenant');
  }));

void test('parecer so do executor e de execucao dispatched; confirmacao so do aprovado da versao atual, com fila do Drive', () =>
  withTestDatabase(async (db, client) => {
    const repository = new SignedKitRepository(db);
    const f = await setup(client);
    const current = await repository.createVersion(TEST_DATABASE_REF, f.clientId, signed(f));
    const run = await dispatchedRun(repository, f, current.id);
    const answer = { id: run.id, executorIdentityId: f.userId, verdict: 'aprovado' as const, summary: 'ok', findings: [{ item: 'Procuracao', status: 'ok' as const, note: '' }] };
    assert.equal(await repository.answer(TEST_DATABASE_REF, f.clientId, { ...answer, executorIdentityId: randomUUID() }), null);
    await repository.touchByRoutine(TEST_DATABASE_REF, f.clientId, run.id);
    const answered = await repository.answer(TEST_DATABASE_REF, f.clientId, answer);
    assert.deepEqual([answered?.status, answered?.verdict, answered?.findings?.length], ['answered', 'aprovado', 1]);
    assert.equal(await repository.answer(TEST_DATABASE_REF, f.clientId, answer), null, 'segundo parecer nao vale');

    await client.query(
      `INSERT INTO kanban_drive_configurations (client_id, provider, credential_mode, root_folder_id, status, updated_by_identity_id, refresh_token_enc)
       VALUES ($1, 'google_drive', 'oauth', 'root', 'active', $2, '\\x00'::bytea)`,
      [f.clientId, f.userId]
    );
    const confirmed = await repository.confirm(TEST_DATABASE_REF, f.clientId, run.id, f.userId);
    assert.equal(confirmed?.driveQueued, true);
    assert.ok(confirmed?.run.confirmedAt);
    assert.equal(await repository.confirm(TEST_DATABASE_REF, f.clientId, run.id, f.userId), null, 'confirmacao unica');
    const queued = await client.query(`SELECT source_type, customer_id FROM kanban_document_syncs WHERE document_id = $1`, [current.id]);
    assert.deepEqual(queued.rows, [{ source_type: 'signed_kit', customer_id: f.customerId }]);
  }));

void test('confirmacao recusa parecer com pendencias e parecer de versao substituida', () =>
  withTestDatabase(async (db, client) => {
    const repository = new SignedKitRepository(db);
    const f = await setup(client);
    const first = await repository.createVersion(TEST_DATABASE_REF, f.clientId, signed(f));
    const pending = await dispatchedRun(repository, f, first.id);
    await repository.answer(TEST_DATABASE_REF, f.clientId, { id: pending.id, executorIdentityId: f.userId, verdict: 'pendencias', summary: 'falta assinatura', findings: [] });
    assert.equal(await repository.confirm(TEST_DATABASE_REF, f.clientId, pending.id, f.userId), null);

    const approvedOld = await repository.createVersion(TEST_DATABASE_REF, f.clientId, signed(f));
    const run = await dispatchedRun(repository, f, approvedOld.id);
    await repository.answer(TEST_DATABASE_REF, f.clientId, { id: run.id, executorIdentityId: f.userId, verdict: 'aprovado', summary: 'ok', findings: [] });
    await repository.createVersion(TEST_DATABASE_REF, f.clientId, signed(f));
    assert.equal(await repository.confirm(TEST_DATABASE_REF, f.clientId, run.id, f.userId), null, 'parecer de versao substituida nao confirma');
  }));

void test('execucao parada expira: 5 min sem a rotina chegar, 15 min depois que ela chegou', () =>
  withTestDatabase(async (db, client) => {
    const repository = new SignedKitRepository(db);
    const f = await setup(client);
    const current = await repository.createVersion(TEST_DATABASE_REF, f.clientId, signed(f));
    const run = await dispatchedRun(repository, f, current.id);
    await client.query(`UPDATE kanban_signed_kit_validations SET updated_at = clock_timestamp() - interval '6 minutes' WHERE id = $1`, [run.id]);
    assert.deepEqual([(await repository.latestRun(TEST_DATABASE_REF, f.clientId, f.kitId))?.status, (await repository.findRun(TEST_DATABASE_REF, f.clientId, run.id))?.errorCode], ['expired', 'routine_not_reached']);

    const picked = await dispatchedRun(repository, f, current.id);
    await repository.touchByRoutine(TEST_DATABASE_REF, f.clientId, picked.id);
    await client.query(`UPDATE kanban_signed_kit_validations SET updated_at = clock_timestamp() - interval '6 minutes' WHERE id = $1`, [picked.id]);
    assert.equal((await repository.findRun(TEST_DATABASE_REF, f.clientId, picked.id))?.status, 'dispatched', 'depois de chegar, vale o prazo de 15 min');
    await client.query(`UPDATE kanban_signed_kit_validations SET updated_at = clock_timestamp() - interval '16 minutes' WHERE id = $1`, [picked.id]);
    assert.equal((await repository.findRun(TEST_DATABASE_REF, f.clientId, picked.id))?.errorCode, 'routine_no_answer');
  }));

void test('cards com Validar assinatura disponivel: assinado atual sem parecer util (S5)', () =>
  withTestDatabase(async (db, client) => {
    const repository = new SignedKitRepository(db);
    const f = await setup(client);
    const boardId = randomUUID();
    const columnId = randomUUID();
    const [withSigned, withoutSigned, otherCustomer] = [randomUUID(), randomUUID(), randomUUID()];
    await client.query(`INSERT INTO kanban_boards (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'Manaus', $3)`, [boardId, f.clientId, f.userId]);
    await client.query(`INSERT INTO kanban_board_columns (id, client_id, board_id, name, position) VALUES ($1, $2, $3, 'Backlog', 0)`, [columnId, f.clientId, boardId]);
    await client.query(
      `INSERT INTO kanban_cards (id, client_id, board_id, board_column_id, title, position, created_by_identity_id)
       VALUES ($1, $4, $5, $6, 'Maria', 0, $7), ($2, $4, $5, $6, 'Sem cliente', 1, $7), ($3, $4, $5, $6, 'Outro', 2, $7)`,
      [withSigned, withoutSigned, otherCustomer, f.clientId, boardId, columnId, f.userId]
    );
    await client.query(
      `INSERT INTO kanban_card_customers (client_id, card_id, customer_id, created_by_identity_id) VALUES ($1, $2, $3, $5), ($1, $4, $6, $5)`,
      [f.clientId, withSigned, f.customerId, otherCustomer, f.userId, randomUUID()]
    );
    const viewer = { identityId: f.userId, clientId: f.clientId, isAdmin: true, officeIds: [], officeVisibilityEnabled: true };
    const available = () => repository.validatableCardIds(TEST_DATABASE_REF, f.clientId, boardId, viewer);

    assert.deepEqual(await available(), [], 'sem kit assinado');
    const current = await repository.createVersion(TEST_DATABASE_REF, f.clientId, signed(f));
    assert.deepEqual(await available(), [withSigned], 'so o card do cliente com assinado atual');

    const run = await dispatchedRun(repository, f, current.id);
    assert.deepEqual(await available(), [], 'validacao em andamento');
    await client.query(`UPDATE kanban_signed_kit_validations SET updated_at = clock_timestamp() - interval '6 minutes' WHERE id = $1`, [run.id]);
    assert.deepEqual(await available(), [withSigned], 'validacao vencida conta como expirada');

    const answered = await dispatchedRun(repository, f, current.id);
    await repository.answer(TEST_DATABASE_REF, f.clientId, { id: answered.id, executorIdentityId: f.userId, verdict: 'pendencias', summary: 's', findings: [] });
    assert.deepEqual(await available(), [withSigned], 'pendencias: valida de novo');
    const approved = await dispatchedRun(repository, f, current.id);
    await repository.answer(TEST_DATABASE_REF, f.clientId, { id: approved.id, executorIdentityId: f.userId, verdict: 'aprovado', summary: 's', findings: [] });
    assert.deepEqual(await available(), [], 'aprovado');
    await repository.createVersion(TEST_DATABASE_REF, f.clientId, signed(f));
    assert.deepEqual(await available(), [withSigned], 'versao nova do assinado');
    assert.deepEqual(await repository.validatableCardIds(TEST_DATABASE_REF, randomUUID(), boardId, viewer), [], 'outro tenant');
  }));
