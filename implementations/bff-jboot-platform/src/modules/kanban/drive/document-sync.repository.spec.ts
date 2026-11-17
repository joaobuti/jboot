import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Client } from 'pg';
import { TEST_DATABASE_REF as ref, withTestDatabase } from '../../../test/with-test-database';
import { DocumentSyncRepository, MAX_SYNC_ATTEMPTS } from './document-sync.repository';

// Copias temporarias com as colunas, checks e indices de producao; nenhuma linha real e tocada e o
// helper sempre faz rollback. O claim so depende da fila e da configuracao ativa do Drive.
async function fixture(client: Client) {
  for (const table of ['kanban_document_syncs', 'kanban_drive_configurations']) {
    await client.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL) ON COMMIT DROP`);
  }
  const clientId = randomUUID();
  await client.query(`INSERT INTO kanban_drive_configurations
    (client_id,credential_mode,refresh_token_enc,root_folder_id,status,updated_by_identity_id)
    VALUES ($1,'oauth',$2,'synthetic-root','active',$3)`, [clientId, Buffer.from('synthetic'), randomUUID()]);
  const id = randomUUID();
  await client.query(`INSERT INTO kanban_document_syncs
    (id,client_id,document_id,document_version,checksum,state,attempt_count,lease_until,next_attempt_at)
    VALUES ($1,$2,$3,1,$4,'syncing',1,now() - interval '1 minute',NULL)`,
  [id, clientId, randomUUID(), 'a'.repeat(64)]);
  return { id, clientId };
}

async function state(client: Client, id: string) {
  return (await client.query(`SELECT state,attempt_count,lease_until,next_attempt_at,last_error_code,
    remote_file_id FROM kanban_document_syncs WHERE id=$1`, [id])).rows[0];
}

void test('Drive sweep recovers an expired lease once and a live lease cannot be stolen', async () => {
  await withTestDatabase(async (db, client) => {
    const { id, clientId } = await fixture(client);
    const repo = new DocumentSyncRepository(db);
    assert.deepEqual(await repo.stale(ref, clientId), [id]);
    assert.deepEqual(await repo.stale(ref, clientId), [id]);
    const claim = await repo.claim(ref, clientId, id);
    assert.equal(claim?.attemptCount, 2);
    assert.ok(claim?.leaseUntil);
    assert.equal(await repo.claim(ref, clientId, id), null);
    assert.deepEqual(await repo.stale(ref, clientId), []);
    assert.equal(await repo.complete(ref, clientId, id, claim!, { remoteFileId: 'synthetic', remoteVersion: null }), true);
    assert.equal(await repo.complete(ref, clientId, id, claim!, { remoteFileId: 'duplicate', remoteVersion: null }), false);
    assert.equal((await state(client, id)).remote_file_id, 'synthetic');
  });
});

void test('Drive direct claim recovers a crash without waiting for the relay', async () => {
  await withTestDatabase(async (db, client) => {
    const { id, clientId } = await fixture(client);
    const claim = await new DocumentSyncRepository(db).claim(ref, clientId, id);
    assert.equal(claim?.attemptCount, 2);
    assert.equal((await state(client, id)).state, 'syncing');
  });
});

void test('Drive final expired attempt becomes terminal and needs explicit reprocess', async () => {
  await withTestDatabase(async (db, client) => {
    const { id, clientId } = await fixture(client);
    await client.query('UPDATE kanban_document_syncs SET attempt_count=$2 WHERE id=$1', [id, MAX_SYNC_ATTEMPTS]);
    const repo = new DocumentSyncRepository(db);
    assert.deepEqual(await repo.stale(ref, clientId), []);
    assert.equal(await repo.claim(ref, clientId, id), null);
    const row = await state(client, id);
    assert.equal(row.state, 'failed');
    assert.equal(row.attempt_count, MAX_SYNC_ATTEMPTS);
    assert.equal(row.next_attempt_at, null);
    assert.equal(row.last_error_code, 'sync_lease_expired');
    assert.equal(await repo.reprocess(ref, clientId, id), true);
    assert.equal((await repo.claim(ref, clientId, id))?.attemptCount, 1);
  });
});

void test('Drive recovery and completion stay tenant-scoped and disabled tenants are not queued', async () => {
  await withTestDatabase(async (db, client) => {
    const { id, clientId } = await fixture(client);
    const repo = new DocumentSyncRepository(db), otherTenant = randomUUID();
    assert.deepEqual(await repo.stale(ref, otherTenant), []);
    assert.equal(await repo.claim(ref, otherTenant, id), null);
    assert.equal((await state(client, id)).state, 'syncing');
    await client.query("UPDATE kanban_drive_configurations SET status='inactive' WHERE client_id=$1", [clientId]);
    assert.deepEqual(await repo.stale(ref, clientId), []);
    assert.equal(await repo.claim(ref, clientId, id), null);
    await client.query("UPDATE kanban_drive_configurations SET status='active' WHERE client_id=$1", [clientId]);
    const claim = (await repo.claim(ref, clientId, id))!;
    assert.equal(await repo.complete(ref, otherTenant, id, claim, { remoteFileId: 'wrong', remoteVersion: null }), false);
    assert.equal(await repo.fail(ref, otherTenant, id, claim, 'wrong', true), false);
    assert.equal((await state(client, id)).state, 'syncing');
  });
});

void test('Drive fencing rejects old completion/failure after retry and after manual reprocess', async () => {
  await withTestDatabase(async (db, client) => {
    const { id, clientId } = await fixture(client);
    const repo = new DocumentSyncRepository(db);
    const oldClaim = (await repo.claim(ref, clientId, id))!;
    await client.query("UPDATE kanban_document_syncs SET lease_until=now() - interval '1 second' WHERE id=$1", [id]);
    assert.equal(await repo.complete(ref, clientId, id, oldClaim, { remoteFileId: 'late', remoteVersion: null }), false);
    assert.equal(await repo.fail(ref, clientId, id, oldClaim, 'late', true), false);
    const retryClaim = (await repo.claim(ref, clientId, id))!;
    assert.equal(retryClaim.attemptCount, oldClaim.attemptCount + 1);
    assert.equal(await repo.fail(ref, clientId, id, oldClaim, 'late', true), false);
    assert.equal(await repo.complete(ref, clientId, id, oldClaim, { remoteFileId: 'late', remoteVersion: null }), false);
    assert.equal(await repo.fail(ref, clientId, id, retryClaim, 'retry_failure', false), true);
    assert.deepEqual(await repo.stale(ref, clientId), [], 'backoff is respected');
    await repo.reprocess(ref, clientId, id);
    const resetClaim = (await repo.claim(ref, clientId, id))!;
    // Even a recycled attempt count cannot authorize a previous lease (ABA).
    assert.equal(await repo.complete(ref, clientId, id,
      { ...oldClaim, attemptCount: resetClaim.attemptCount }, { remoteFileId: 'late', remoteVersion: null }), false);
    assert.equal(await repo.complete(ref, clientId, id, resetClaim, { remoteFileId: 'current', remoteVersion: null }), true);
  });
});

void test('Drive recovery handles at most 100 expired leases per tenant per sweep', async () => {
  await withTestDatabase(async (db, client) => {
    const { id, clientId } = await fixture(client);
    await client.query(`INSERT INTO kanban_document_syncs
      (client_id,document_id,document_version,checksum,state,attempt_count,lease_until)
      SELECT client_id,gen_random_uuid(),1,checksum,'syncing',1,now() - interval '1 minute'
      FROM kanban_document_syncs CROSS JOIN generate_series(1,100) WHERE id=$1`, [id]);
    const repo = new DocumentSyncRepository(db);
    assert.equal((await repo.stale(ref, clientId)).length, 100);
    const remaining = await client.query("SELECT count(*)::int AS count FROM kanban_document_syncs WHERE state='syncing'");
    assert.equal(remaining.rows[0].count, 1);
    await repo.stale(ref, clientId);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM kanban_document_syncs WHERE state='syncing'")).rows[0].count, 0);
  });
});
