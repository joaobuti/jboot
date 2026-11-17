import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { UnprocessableEntityException } from '@nestjs/common';
import { Client } from 'pg';
import { allCardsViewer } from '../../../test/kanban-visibility';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { CustomerValidationRepository } from '../customer-validation/customer-validation.repository';
import { SignedKitRepository } from '../signed-kit/signed-kit.repository';
import { COLUMN_REQUIREMENTS_UNMET, EntryRequirementsService } from './entry-requirements.service';

interface Fixture {
  clientId: string;
  boardId: string;
  analysisColumnId: string;
  plainColumnId: string;
  cardId: string;
  customerId: string;
  userId: string;
}

async function setup(client: Client): Promise<Fixture> {
  const f = {
    clientId: randomUUID(), boardId: randomUUID(), analysisColumnId: randomUUID(), plainColumnId: randomUUID(),
    cardId: randomUUID(), customerId: randomUUID(), userId: randomUUID()
  };
  await client.query(`INSERT INTO kanban_boards (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'Juridico', $3)`, [f.boardId, f.clientId, f.userId]);
  await client.query(
    `INSERT INTO kanban_board_columns (id, client_id, board_id, name, position) VALUES ($1, $2, $3, 'Backlog', 0), ($4, $2, $3, 'Analise de Acoes', 1)`,
    [f.plainColumnId, f.clientId, f.boardId, f.analysisColumnId]
  );
  await client.query(
    `INSERT INTO kanban_cards (id, client_id, board_id, board_column_id, title, position, created_by_identity_id)
     VALUES ($1, $2, $3, $4, 'Salim', 0, $5)`,
    [f.cardId, f.clientId, f.boardId, f.plainColumnId, f.userId]
  );
  await client.query(`INSERT INTO kanban_card_customers (client_id, card_id, customer_id, created_by_identity_id) VALUES ($1, $2, $3, $4)`, [f.clientId, f.cardId, f.customerId, f.userId]);
  return f;
}

async function addRule(client: Client, f: Fixture, actionType: string, actionConfig: Record<string, unknown>, active = true, columnId = f.analysisColumnId) {
  await client.query(
    `INSERT INTO kanban_column_automation_rules (client_id, board_id, board_column_id, trigger_type, action_type, action_config, is_active, created_by_identity_id)
     VALUES ($1, $2, $3, 'column_entered', $4, $5::jsonb, $6, $7)`,
    [f.clientId, f.boardId, columnId, actionType, JSON.stringify(actionConfig), active, f.userId]
  );
}

const requireHiscon = (client: Client, f: Fixture, active = true) => addRule(client, f, 'require_to_enter', { requirements: ['customer_hiscon'] }, active);

async function addDocument(client: Client, f: Fixture, type: string) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO kanban_customer_documents (id, client_id, customer_id, document_type, version, file_name, content_type, size_bytes, sha256, storage_bucket, storage_key, uploaded_by_identity_id)
     VALUES ($1, $2, $3, $4, 1, 'x.pdf', 'application/pdf', 10, $5, 'b', $7, $6)`,
    [id, f.clientId, f.customerId, type, 'd'.repeat(64), f.userId, `k/${id}`]
  );
  return id;
}

async function confirmValidation(db: ConstructorParameters<typeof CustomerValidationRepository>[0], f: Fixture) {
  const repository = new CustomerValidationRepository(db);
  const run = await repository.create(TEST_DATABASE_REF, f.clientId, {
    id: randomUUID(), customerId: f.customerId, officeId: null, agentId: randomUUID(), executorIdentityId: f.userId,
    requestedByIdentityId: f.userId, snapshot: [{ type: 'promobank', documentId: randomUUID(), version: 1 }],
    residenceProofThirdParty: false, cpfOnIdentity: false
  });
  assert.ok(run);
  await repository.markDispatched(TEST_DATABASE_REF, f.clientId, run.id, randomUUID(), 'https://claude.ai/code/s');
  await repository.answer(TEST_DATABASE_REF, f.clientId, { id: run.id, executorIdentityId: f.userId, verdict: 'aprovado', findings: [], summary: 'ok', extractedData: null });
  assert.ok(await repository.confirm(TEST_DATABASE_REF, f.clientId, f.customerId, run.id, f.userId));
}

const context = (f: Fixture) => ({ clientId: f.clientId, identityId: f.userId, databaseRef: TEST_DATABASE_REF, applicationId: 'flow', scopes: [], roles: [] });

async function blocked(service: EntryRequirementsService, f: Fixture, columnId = f.analysisColumnId): Promise<boolean> {
  try {
    await service.assertCanEnterColumn(context(f), f.boardId, columnId, f.cardId);
    return false;
  } catch (error) {
    assert.ok(error instanceof UnprocessableEntityException);
    const body = error.getResponse() as { code: string; unmetRequirements: string[] };
    assert.deepEqual([body.code, body.unmetRequirements], [COLUMN_REQUIREMENTS_UNMET, ['customer_hiscon']]);
    return true;
  }
}

void test('requisito de entrada: a regra da coluna barra cliente sem HISCON e libera com HISCON atual', () =>
  withTestDatabase(async (db, client) => {
    const service = new EntryRequirementsService(db);
    const f = await setup(client);
    assert.equal(await blocked(service, f), false, 'coluna sem requisito nao barra');

    await requireHiscon(client, f);
    assert.equal(await blocked(service, f), true);
    assert.equal(await blocked(service, f, f.plainColumnId), false, 'so a coluna da regra');

    await addDocument(client, f, 'promobank');
    assert.equal(await blocked(service, f), true, 'Promobank nao substitui o HISCON para avancar');
    const hiscon = await addDocument(client, f, 'extrato_beneficio');
    assert.equal(await blocked(service, f), false);

    await client.query(`UPDATE kanban_customer_documents SET superseded_at = now() WHERE id = $1`, [hiscon]);
    assert.equal(await blocked(service, f), true, 'HISCON substituido sem versao atual barra de novo');
  }));

void test('requisito de entrada: so a regra configurada e ativa; regras de agente nao barram; card sem cliente passa', () =>
  withTestDatabase(async (db, client) => {
    const service = new EntryRequirementsService(db);
    const f = await setup(client);
    // Antes (P1) o bloqueio era deduzido destas regras; agora so a regra explicita conta (S1).
    await addRule(client, f, 'execute_ai_agent', { connectionMode: 'claude_routine', expectedResult: 'action_analysis', customerDocumentTypes: ['extrato_beneficio'] });
    await requireHiscon(client, f, false);
    assert.equal(await blocked(service, f), false, 'regra de agente e requisito inativo nao barram');

    await requireHiscon(client, f);
    assert.equal(await blocked(service, f), true);

    await client.query(`DELETE FROM kanban_card_customers WHERE card_id = $1`, [f.cardId]);
    assert.equal(await blocked(service, f), false);
  }));

void test('selo SEM HISCON: quadro com o requisito e cliente com validacao confirmada sem HISCON atual', () =>
  withTestDatabase(async (db, client) => {
    const service = new EntryRequirementsService(db);
    const f = await setup(client);
    const board = () => service.cardIdsWithoutHisconForBoard(TEST_DATABASE_REF, f.clientId, f.boardId, allCardsViewer(f.clientId));
    await confirmValidation(db, f);
    assert.deepEqual([...(await board())], [], 'quadro sem requisito de HISCON nao mostra o selo');
    assert.equal((await service.cardWithoutHiscon(TEST_DATABASE_REF, f.clientId, f.cardId))?.missing, false);

    await requireHiscon(client, f);
    assert.deepEqual([...(await board())], [f.cardId]);
    assert.deepEqual(await service.cardWithoutHiscon(TEST_DATABASE_REF, f.clientId, f.cardId), { customerId: f.customerId, missing: true });

    await addDocument(client, f, 'extrato_beneficio');
    assert.deepEqual([...(await board())], []);
    assert.equal((await service.cardWithoutHiscon(TEST_DATABASE_REF, f.clientId, f.cardId))?.missing, false);
    assert.equal(await service.cardWithoutHiscon(TEST_DATABASE_REF, randomUUID(), f.cardId), null, 'outro tenant');
  }));

void test('selo SEM HISCON: cliente sem validacao confirmada (lead/CRM) nao recebe o selo', () =>
  withTestDatabase(async (db, client) => {
    const service = new EntryRequirementsService(db);
    const f = await setup(client);
    await requireHiscon(client, f);
    assert.deepEqual([...(await service.cardIdsWithoutHisconForBoard(TEST_DATABASE_REF, f.clientId, f.boardId, allCardsViewer(f.clientId)))], []);
  }));

async function addKit(client: Client, f: Fixture) {
  const officeId = (await client.query<{ id: string }>(
    `INSERT INTO kanban_offices (client_id, name, created_by_identity_id) VALUES ($1, $3, $2) RETURNING id`, [f.clientId, f.userId, `Escritorio ${randomUUID()}`]
  )).rows[0].id;
  const runId = randomUUID();
  await client.query(
    `INSERT INTO kanban_customer_validation_runs (id, client_id, customer_id, agent_id, executor_identity_id, requested_by_identity_id, status, documents_snapshot, residence_proof_third_party)
     VALUES ($1, $2, $3, $4, $5, $5, 'expired', '[]'::jsonb, false)`,
    [runId, f.clientId, f.customerId, randomUUID(), f.userId]
  );
  const kitId = randomUUID();
  await client.query(
    `INSERT INTO kanban_customer_office_kits (id, client_id, customer_id, run_id, office_id, contract_version, storage_key, file_name, size_bytes, sha256, report, created_by_identity_id)
     VALUES ($1, $2, $3, $4, $5, 1, $6, 'KIT.docx', 10, $7, '{}'::jsonb, $8)`,
    [kitId, f.clientId, f.customerId, runId, officeId, `k/${kitId}`, 'a'.repeat(64), f.userId]
  );
  return kitId;
}

async function approveSigned(db: ConstructorParameters<typeof SignedKitRepository>[0], f: Fixture, kitId: string, confirm = true) {
  const repository = new SignedKitRepository(db);
  const id = randomUUID();
  await repository.createVersion(TEST_DATABASE_REF, f.clientId, {
    id, customerId: f.customerId, kitId, fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 1, sha256: 'b'.repeat(64), storageKey: `s/${id}`, uploadedByIdentityId: f.userId
  });
  const run = await repository.createRun(TEST_DATABASE_REF, f.clientId, {
    id: randomUUID(), customerId: f.customerId, kitId, signedKitId: id, agentId: randomUUID(), executorIdentityId: f.userId, requestedByIdentityId: f.userId
  });
  assert.ok(run);
  await repository.markDispatched(TEST_DATABASE_REF, f.clientId, run.id, randomUUID(), null);
  await repository.answer(TEST_DATABASE_REF, f.clientId, { id: run.id, executorIdentityId: f.userId, verdict: 'aprovado', summary: 'ok', findings: [] });
  if (confirm) await repository.confirm(TEST_DATABASE_REF, f.clientId, run.id, f.userId);
}

async function blockedBy(service: EntryRequirementsService, f: Fixture): Promise<string[]> {
  try {
    await service.assertCanEnterColumn(context(f), f.boardId, f.analysisColumnId, f.cardId);
    return [];
  } catch (error) {
    assert.ok(error instanceof UnprocessableEntityException);
    return (error.getResponse() as { unmetRequirements: string[] }).unmetRequirements;
  }
}

void test('requisito kit assinado (S2): barra sem kit, sem assinado ou sem confirmacao; libera com o assinado atual aprovado e confirmado', () =>
  withTestDatabase(async (db, client) => {
    const service = new EntryRequirementsService(db);
    const f = await setup(client);
    await addRule(client, f, 'require_to_enter', { requirements: ['customer_hiscon', 'signed_kit'] });
    await addDocument(client, f, 'extrato_beneficio');
    assert.deepEqual(await blockedBy(service, f), ['signed_kit'], 'cliente sem kit nao cumpre');

    const kitId = await addKit(client, f);
    assert.deepEqual(await blockedBy(service, f), ['signed_kit']);
    await approveSigned(db, f, kitId, false);
    assert.deepEqual(await blockedBy(service, f), ['signed_kit'], 'parecer aprovado sem confirmacao humana nao libera');
    await approveSigned(db, f, kitId);
    assert.deepEqual(await blockedBy(service, f), []);

    // Versao nova do assinado: a aprovacao da anterior deixa de valer.
    const repository = new SignedKitRepository(db);
    const id = randomUUID();
    await repository.createVersion(TEST_DATABASE_REF, f.clientId, {
      id, customerId: f.customerId, kitId, fileName: 'b.pdf', contentType: 'application/pdf', sizeBytes: 1, sha256: 'c'.repeat(64), storageKey: `s/${id}`, uploadedByIdentityId: f.userId
    });
    assert.deepEqual(await blockedBy(service, f), ['signed_kit']);

    // Kit novo (outra validacao confirmada): precisa ser assinado de novo.
    await approveSigned(db, f, kitId);
    await client.query(`UPDATE kanban_customer_office_kits SET created_at = now() - interval '1 day' WHERE id = $1`, [kitId]);
    await addKit(client, f);
    assert.deepEqual(await blockedBy(service, f), ['signed_kit']);
  }));

void test('selo ASSINATURA PENDENTE (S2): quadro que exige o kit assinado e cliente com kit sem assinado aprovado', () =>
  withTestDatabase(async (db, client) => {
    const service = new EntryRequirementsService(db);
    const f = await setup(client);
    const board = () => service.cardIdsWithSignedKitPendingForBoard(TEST_DATABASE_REF, f.clientId, f.boardId, allCardsViewer(f.clientId));
    const kitId = await addKit(client, f);
    assert.deepEqual([...(await board())], [], 'quadro sem o requisito nao mostra o selo');
    await addRule(client, f, 'require_to_enter', { requirements: ['signed_kit'] });
    assert.deepEqual([...(await board())], [f.cardId]);
    await approveSigned(db, f, kitId);
    assert.deepEqual([...(await board())], []);
  }));
