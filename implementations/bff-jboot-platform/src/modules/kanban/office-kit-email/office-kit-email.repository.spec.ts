import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { MAX_KIT_EMAIL_ATTEMPTS, OfficeKitEmailRepository } from './office-kit-email.repository';

async function setup(client: Client) {
  const clientId = randomUUID(), customerId = randomUUID(), userId = randomUUID(), kitId = randomUUID(), runId = randomUUID();
  const officeId = (await client.query<{ id: string }>(
    `INSERT INTO kanban_offices (client_id, name, created_by_identity_id) VALUES ($1, 'Manaus', $2) RETURNING id`, [clientId, userId]
  )).rows[0].id;
  await client.query(
    `INSERT INTO kanban_customer_validation_runs (id, client_id, customer_id, agent_id, executor_identity_id, requested_by_identity_id, status, documents_snapshot, residence_proof_third_party)
     VALUES ($1, $2, $3, $4, $5, $5, 'expired', '[]'::jsonb, false)`,
    [runId, clientId, customerId, randomUUID(), userId]
  );
  await client.query(
    `INSERT INTO kanban_customer_office_kits (id, client_id, customer_id, run_id, office_id, contract_version, storage_key, file_name, size_bytes, sha256, report, created_by_identity_id)
     VALUES ($1, $2, $3, $4, $5, 1, 'k.docx', 'KIT_MARIA.docx', 10, $6, '{}'::jsonb, $7)`,
    [kitId, clientId, customerId, runId, officeId, 'a'.repeat(64), userId]
  );
  return { clientId, customerId, userId, kitId, officeId };
}

void test('e-mail do kit: configuracao por escritorio, um envio por kit e reserva para enviar', () =>
  withTestDatabase(async (db, client) => {
    const repository = new OfficeKitEmailRepository(db);
    const f = await setup(client);
    assert.equal(await repository.getSettings(TEST_DATABASE_REF, f.clientId, f.officeId), null);
    await repository.putSettings(TEST_DATABASE_REF, f.clientId, f.officeId, { enabled: true, subject: 'Docs', body: 'Ola' }, f.userId);
    await repository.putSettings(TEST_DATABASE_REF, f.clientId, f.officeId, { enabled: false, subject: 'Docs 2', body: 'Ola 2' }, f.userId);
    assert.deepEqual(
      (({ enabled, subject, body }) => ({ enabled, subject, body }))((await repository.getSettings(TEST_DATABASE_REF, f.clientId, f.officeId))!),
      { enabled: false, subject: 'Docs 2', body: 'Ola 2' }
    );

    const input = { id: randomUUID(), customerId: f.customerId, kitId: f.kitId, toEmail: 'maria@exemplo.com', subject: 'Docs', body: 'Ola, MARIA.', identityId: f.userId };
    assert.equal(await repository.enqueue(TEST_DATABASE_REF, f.clientId, input), true);
    assert.equal(await repository.enqueue(TEST_DATABASE_REF, f.clientId, { ...input, id: randomUUID() }), false, 'um envio por kit');

    const claimed = await repository.claim(TEST_DATABASE_REF, f.clientId);
    assert.deepEqual([claimed?.storageKey, claimed?.fileName, claimed?.toEmail, claimed?.attemptCount, claimed?.createdByIdentityId], ['k.docx', 'KIT_MARIA.docx', 'maria@exemplo.com', 1, f.userId]);
    assert.equal(await repository.claim(TEST_DATABASE_REF, f.clientId), null, 'reservado nao sai de novo');
    assert.equal(await repository.claim(TEST_DATABASE_REF, randomUUID()), null, 'outro tenant');
    assert.equal(await repository.markSent(TEST_DATABASE_REF, f.clientId, claimed!.id, '2000-01-01T00:00:00Z'), false, 'reserva de outro worker nao grava');
    assert.equal(await repository.markSent(TEST_DATABASE_REF, f.clientId, claimed!.id, claimed!.leaseUntil), true);
    const sent = await repository.forKit(TEST_DATABASE_REF, f.clientId, f.kitId);
    assert.equal(sent?.status, 'sent');
    assert.ok(sent?.sentAt);
  }));

void test('e-mail do kit: falha tenta de novo com espera e para na ultima tentativa', () =>
  withTestDatabase(async (db, client) => {
    const repository = new OfficeKitEmailRepository(db);
    const f = await setup(client);
    await repository.enqueue(TEST_DATABASE_REF, f.clientId, { id: randomUUID(), customerId: f.customerId, kitId: f.kitId, toEmail: 'm@x.com', subject: 's', body: 'b', identityId: f.userId });
    const outcomes: string[] = [];
    for (let attempt = 1; attempt <= MAX_KIT_EMAIL_ATTEMPTS; attempt += 1) {
      await client.query(`UPDATE kanban_office_kit_emails SET next_attempt_at = clock_timestamp() - interval '1 second' WHERE kit_id = $1 AND status = 'pending'`, [f.kitId]);
      const row = await repository.claim(TEST_DATABASE_REF, f.clientId);
      assert.ok(row, `tentativa ${attempt}`);
      outcomes.push(await repository.markFailed(TEST_DATABASE_REF, f.clientId, row.id, row.leaseUntil, 'smtp_down'));
    }
    assert.deepEqual(outcomes, ['retry', 'retry', 'retry', 'retry', 'failed']);
    const failed = await repository.forKit(TEST_DATABASE_REF, f.clientId, f.kitId);
    assert.deepEqual([failed?.status, failed?.lastError, failed?.attemptCount], ['failed', 'smtp_down', MAX_KIT_EMAIL_ATTEMPTS]);
    assert.equal(await repository.claim(TEST_DATABASE_REF, f.clientId), null);
  }));
