import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { CustomerDocumentsRepository, CreateCustomerDocumentInput } from './customer-documents.repository';
import { CustomerValidationRepository } from '../customer-validation/customer-validation.repository';
import { DocumentSyncRepository } from '../drive/document-sync.repository';

function input(customerId: string, overrides: Partial<CreateCustomerDocumentInput> = {}): CreateCustomerDocumentInput {
  const id = randomUUID();
  return {
    id,
    customerId,
    documentType: 'identidade',
    fileName: 'rg.pdf',
    contentType: 'application/pdf',
    sizeBytes: 10,
    sha256: 'a'.repeat(64),
    storageBucket: 'kanban-attachments',
    storageKey: `test/${id}`,
    identityId: randomUUID(),
    ...overrides
  };
}

void test('HISCON e HISCRED: persistencia e historicos independentes com isolamento', () =>
  withTestDatabase(async (db) => {
    const repository = new CustomerDocumentsRepository(db);
    const clientId = randomUUID();
    const customerId = randomUUID();
    const hiscon = await repository.createVersion(TEST_DATABASE_REF, clientId, input(customerId, { documentType: 'extrato_beneficio' }));
    const first = await repository.createVersion(TEST_DATABASE_REF, clientId, input(customerId, { documentType: 'hiscred' }));
    const second = await repository.createVersion(TEST_DATABASE_REF, clientId, input(customerId, { documentType: 'hiscred' }));
    assert.equal(first.version, 1);
    assert.equal(second.version, 2);
    const current = await repository.listCurrent(TEST_DATABASE_REF, clientId, customerId);
    assert.deepEqual(current.map((row) => [row.documentType, row.version]), [['extrato_beneficio', 1], ['hiscred', 2]]);
    assert.equal((await repository.findById(TEST_DATABASE_REF, clientId, customerId, hiscon.id))?.id, hiscon.id);
    assert.equal((await repository.findById(TEST_DATABASE_REF, clientId, customerId, first.id))?.id, first.id);
    assert.equal(await repository.findById(TEST_DATABASE_REF, randomUUID(), customerId, second.id), null);
    await repository.removeCurrent(TEST_DATABASE_REF, clientId, customerId, 'hiscred', randomUUID());
    assert.deepEqual((await repository.listCurrent(TEST_DATABASE_REF, clientId, customerId)).map((row) => row.id), [hiscon.id]);
  }));

void test('documentos da ficha: nova versao substitui a corrente e mantem o historico', () =>
  withTestDatabase(async (db) => {
    const repository = new CustomerDocumentsRepository(db);
    const clientId = randomUUID();
    const customerId = randomUUID();
    const first = await repository.createVersion(TEST_DATABASE_REF, clientId, input(customerId));
    const second = await repository.createVersion(TEST_DATABASE_REF, clientId, input(customerId, { fileName: 'rg-novo.pdf' }));
    await repository.createVersion(TEST_DATABASE_REF, clientId, input(customerId, { documentType: 'cpf' }));
    assert.equal(first.version, 1);
    assert.equal(second.version, 2);
    const current = await repository.listCurrent(TEST_DATABASE_REF, clientId, customerId);
    assert.deepEqual(current.map((row) => [row.documentType, row.version]), [['cpf', 1], ['identidade', 2]]);
    assert.equal((await repository.findById(TEST_DATABASE_REF, clientId, customerId, first.id))?.fileName, 'rg.pdf');
  }));

void test('documentos da ficha: remocao logica tira so a corrente; nova versao continua a numeracao', () =>
  withTestDatabase(async (db) => {
    const repository = new CustomerDocumentsRepository(db);
    const clientId = randomUUID();
    const customerId = randomUUID();
    const identityId = randomUUID();
    await repository.createVersion(TEST_DATABASE_REF, clientId, input(customerId));
    const removed = await repository.removeCurrent(TEST_DATABASE_REF, clientId, customerId, 'identidade', identityId);
    assert.equal(removed?.version, 1);
    assert.equal(await repository.removeCurrent(TEST_DATABASE_REF, clientId, customerId, 'identidade', identityId), null);
    assert.equal((await repository.listCurrent(TEST_DATABASE_REF, clientId, customerId)).length, 0);
    const again = await repository.createVersion(TEST_DATABASE_REF, clientId, input(customerId));
    assert.equal(again.version, 2);
  }));

void test('documentos da ficha: isolamento por tenant e por cliente', () =>
  withTestDatabase(async (db) => {
    const repository = new CustomerDocumentsRepository(db);
    const clientId = randomUUID();
    const customerId = randomUUID();
    const created = await repository.createVersion(TEST_DATABASE_REF, clientId, input(customerId));
    assert.equal(await repository.findById(TEST_DATABASE_REF, randomUUID(), customerId, created.id), null);
    assert.equal(await repository.findById(TEST_DATABASE_REF, clientId, randomUUID(), created.id), null);
    assert.equal((await repository.listCurrent(TEST_DATABASE_REF, randomUUID(), customerId)).length, 0);
  }));

void test('documentos da ficha: perfil (terceiro, CPF na identidade) faz upsert parcial e default e falso', () =>
  withTestDatabase(async (db) => {
    const repository = new CustomerDocumentsRepository(db);
    const clientId = randomUUID();
    const customerId = randomUUID();
    const none = { residenceProofThirdParty: false, cpfOnIdentity: false };
    assert.deepEqual(await repository.getProfile(TEST_DATABASE_REF, clientId, customerId), none);
    await repository.updateProfile(TEST_DATABASE_REF, clientId, customerId, { residenceProofThirdParty: true }, randomUUID());
    assert.deepEqual(await repository.getProfile(TEST_DATABASE_REF, clientId, customerId), { ...none, residenceProofThirdParty: true });
    await repository.updateProfile(TEST_DATABASE_REF, clientId, customerId, { cpfOnIdentity: true }, randomUUID());
    assert.deepEqual(await repository.getProfile(TEST_DATABASE_REF, clientId, customerId), { residenceProofThirdParty: true, cpfOnIdentity: true });
    await repository.updateProfile(TEST_DATABASE_REF, clientId, customerId, { residenceProofThirdParty: false }, randomUUID());
    assert.deepEqual(await repository.getProfile(TEST_DATABASE_REF, clientId, customerId), { ...none, cpfOnIdentity: true });
    const batch = await repository.profilesForCustomers(TEST_DATABASE_REF, clientId, [customerId, randomUUID()]);
    assert.deepEqual([...batch.values()], [{ ...none, cpfOnIdentity: true }]);
  }));

void test('HISCON depois da validacao com Promobank (2026-11-02): vai ao Drive no envio e na reconciliacao', () =>
  withTestDatabase(async (db, client) => {
    const repository = new CustomerDocumentsRepository(db);
    const validations = new CustomerValidationRepository(db);
    const syncs = new DocumentSyncRepository(db);
    const clientId = randomUUID();
    const customerId = randomUUID();
    const user = randomUUID();
    const queued = async (documentId: string) =>
      (await client.query(`SELECT source_type, customer_id FROM kanban_document_syncs WHERE client_id = $1 AND document_id = $2`, [clientId, documentId])).rows;
    await client.query(
      `INSERT INTO kanban_drive_configurations (client_id, provider, credential_mode, root_folder_id, status, updated_by_identity_id, refresh_token_enc)
       VALUES ($1, 'google_drive', 'oauth', 'root', 'active', $2, '\\x00'::bytea)`,
      [clientId, user]
    );

    // Sem validacao confirmada: o HISCON ainda nao vai ao Drive (sobe na confirmacao).
    const early = await repository.createVersion(TEST_DATABASE_REF, clientId, input(customerId, { documentType: 'extrato_beneficio' }));
    assert.deepEqual(await queued(early.id), []);

    const promobank = await repository.createVersion(TEST_DATABASE_REF, clientId, input(customerId, { documentType: 'promobank' }));
    const run = await validations.create(TEST_DATABASE_REF, clientId, {
      id: randomUUID(), customerId, officeId: null, agentId: randomUUID(), executorIdentityId: user, requestedByIdentityId: user,
      snapshot: [{ type: 'promobank', documentId: promobank.id, version: 1 }], residenceProofThirdParty: false, cpfOnIdentity: false
    });
    assert.ok(run);
    await validations.markDispatched(TEST_DATABASE_REF, clientId, run.id, randomUUID(), 'https://claude.ai/code/s');
    await validations.answer(TEST_DATABASE_REF, clientId, { id: run.id, executorIdentityId: user, verdict: 'aprovado', findings: [], summary: 'ok', extractedData: null });
    assert.ok(await validations.confirm(TEST_DATABASE_REF, clientId, customerId, run.id, user));

    // Depois da confirmacao sem HISCON: o HISCON enviado entra na fila como documento da ficha.
    const late = await repository.createVersion(TEST_DATABASE_REF, clientId, input(customerId, { documentType: 'extrato_beneficio' }));
    assert.deepEqual(await queued(late.id), [{ source_type: 'customer_document', customer_id: customerId }]);
    // Outro tipo enviado depois nao entra (so o HISCON tem leitura tardia).
    const lateCpf = await repository.createVersion(TEST_DATABASE_REF, clientId, input(customerId, { documentType: 'cpf' }));
    assert.deepEqual(await queued(lateCpf.id), []);

    // Reconciliacao (Drive ligado depois): sobe o HISCON tardio atual, sem duplicar.
    await client.query(`DELETE FROM kanban_document_syncs WHERE client_id = $1 AND document_id = $2`, [clientId, late.id]);
    await syncs.reconcileMissing(TEST_DATABASE_REF, clientId);
    await syncs.reconcileMissing(TEST_DATABASE_REF, clientId);
    assert.deepEqual(await queued(late.id), [{ source_type: 'customer_document', customer_id: customerId }]);
    assert.deepEqual(await queued(early.id), [], 'versao substituida nao sobe');
  }));
