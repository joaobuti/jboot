import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { CustomerDocumentsRepository } from '../customer-documents/customer-documents.repository';
import { CustomerValidationRepository } from '../customer-validation/customer-validation.repository';
import { DocumentSyncRepository } from './document-sync.repository';
import { DocumentSyncService, driveLocation } from './document-sync.service';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

void test('pasta do Drive: escritorio > "CPF - nome"; sem escritorio usa pasta propria; peticao sem cliente fica no caminho legado', () => {
  const customerSource = { storageKey: 'k', contentType: 'application/pdf', customerId: 'cust', cardId: null, officeId: null, officeName: 'Manaus', documentType: 'comprovante_residencia' };
  const maria = { documentNumber: '529.982.247-25', name: 'MARIA DA SILVA' };
  const folder = '52998224725 - MARIA DA SILVA';
  assert.deepEqual(
    driveLocation('client', { sourceType: 'customer_document', documentId: 'doc', documentVersion: 2 }, customerSource, maria),
    { pathSegments: ['Manaus', folder], fileName: 'comprovante-residencia-v2.pdf' }
  );
  assert.deepEqual(
    driveLocation('client', { sourceType: 'customer_document', documentId: 'doc', documentVersion: 2 }, { ...customerSource, officeName: null }, maria),
    { pathSegments: ['Sem escritorio', folder], fileName: 'comprovante-residencia-v2.pdf' }
  );
  // Nome com barra e aspas nao quebra o caminho nem a busca do Drive.
  assert.deepEqual(
    driveLocation('client', { sourceType: 'customer_document', documentId: 'doc', documentVersion: 1 }, { ...customerSource, officeName: "Boa/Vista" }, { documentNumber: '52998224725', name: "JOANA D'ARC" }).pathSegments,
    ['Boa Vista', '52998224725 - JOANA D ARC']
  );
  const petition = { storageKey: 'k', contentType: DOCX, customerId: 'cust', cardId: 'card', officeId: 'office', officeName: 'Manaus', documentType: null };
  assert.deepEqual(
    driveLocation('client', { sourceType: 'generated_document', documentId: 'doc', documentVersion: 1 }, petition, maria),
    { pathSegments: ['Manaus', folder], fileName: 'peticao-doc-v1.docx' }
  );
  // Peticao da rotina (ADR 020): nome da peticao em todas as versoes; a corrigida atualiza o mesmo arquivo (S8).
  const routine = { ...petition, fileName: 'Inicial_JEC_Santander_Maria.docx' };
  assert.equal(driveLocation('client', { sourceType: 'generated_document', documentId: 'doc', documentVersion: 1 }, routine, maria).fileName, 'Inicial_JEC_Santander_Maria.docx');
  assert.equal(driveLocation('client', { sourceType: 'generated_document', documentId: 'doc', documentVersion: 2 }, routine, maria).fileName, 'Inicial_JEC_Santander_Maria.docx');
  // Kit do escritorio (Sprint 4): pasta do CPF, nome gerado pelo Flow.
  const kit = { ...petition, cardId: null, fileName: 'KIT_MARIA_DA_SILVA_2026-10-28.docx' };
  assert.deepEqual(
    driveLocation('client', { sourceType: 'office_kit', documentId: 'kit', documentVersion: 1 }, kit, maria),
    { pathSegments: ['Manaus', folder], fileName: 'KIT_MARIA_DA_SILVA_2026-10-28.docx' }
  );
  assert.deepEqual(
    driveLocation('client', { sourceType: 'generated_document', documentId: 'doc', documentVersion: 1 }, { ...petition, customerId: null }, null),
    { pathSegments: ['client', 'office', 'unlinked', 'card'], fileName: 'doc-v1.docx' }
  );
});

void test('envio de documento da ficha usa o escritorio, o CPF e o nome do cadastro e o tipo do arquivo original', async () => {
  const body = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const uploads: Array<{ pathSegments: unknown[]; fileName: string; contentType: string }> = [];
  const repo = {
    withClientDriveLock: async (_r: string, _c: string, run: () => Promise<unknown>) => run(),
    claim: async () => ({ id: 's', sourceType: 'customer_document', documentId: 'd', documentVersion: 3, checksum: createHash('sha256').update(body).digest('hex'), remoteFileId: null, attemptCount: 1, refreshTokenEnc: Buffer.from('e'), rootFolderId: 'root' }),
    source: async () => ({ storageKey: 'k', contentType: 'image/png', customerId: 'cust', cardId: null, officeId: null, officeName: 'Manaus', documentType: 'identidade' }),
    complete: async () => true,
    fail: async () => true
  };
  const service = new DocumentSyncService(
    repo as never,
    { download: async () => body } as never,
    { upload: async (input: { pathSegments: unknown[]; fileName: string; contentType: string }) => { uploads.push(input); return { remoteFileId: 'r', remoteVersion: '1' }; } } as never,
    {} as never,
    {} as never,
    { decrypt: () => 'refresh' } as never,
    { findForFlowById: async () => ({ documentNumber: '52998224725', name: 'MARIA' }) } as never
  );
  assert.equal(await service.process({ databaseRef: 'ref', clientId: 'client', syncId: 's' }), 'synced');
  assert.deepEqual(uploads.map((u) => [u.pathSegments, u.fileName, u.contentType]), [[['Manaus', '52998224725 - MARIA'], 'identidade-v3.png', 'image/png']]);
});

void test('origem removida falha de forma definitiva sem chamar o Drive', async () => {
  const failures: unknown[][] = [];
  const repo = {
    withClientDriveLock: async (_r: string, _c: string, run: () => Promise<unknown>) => run(),
    claim: async () => ({ id: 's', sourceType: 'customer_document', documentId: 'd', documentVersion: 1, checksum: 'a', remoteFileId: null, attemptCount: 1, refreshTokenEnc: Buffer.from('e'), rootFolderId: 'root' }),
    source: async () => null,
    fail: async (...args: unknown[]) => { failures.push(args); return true; }
  };
  const service = new DocumentSyncService(repo as never, {} as never, { upload: async () => { throw new Error('must not upload'); } } as never, {} as never, {} as never, {} as never, {} as never);
  assert.equal(await service.process({ databaseRef: 'ref', clientId: 'client', syncId: 's' }), 'failed');
  assert.ok(failures[0]?.includes('source_missing'));
});

async function activateDrive(client: Client, clientId: string) {
  await client.query(
    `INSERT INTO kanban_drive_configurations (client_id, provider, credential_mode, root_folder_id, status, updated_by_identity_id, refresh_token_enc)
     VALUES ($1, 'google_drive', 'oauth', 'root', 'active', $2, '\\x00'::bytea)`,
    [clientId, randomUUID()]
  );
}

async function confirmedValidation(db: ConstructorParameters<typeof CustomerValidationRepository>[0], clientId: string) {
  const documents = new CustomerDocumentsRepository(db);
  const validation = new CustomerValidationRepository(db);
  const customerId = randomUUID();
  const central = randomUUID();
  const doc = await documents.createVersion(TEST_DATABASE_REF, clientId, {
    id: randomUUID(), customerId, documentType: 'cpf', fileName: 'cpf.pdf', contentType: 'application/pdf', sizeBytes: 1,
    sha256: 'b'.repeat(64), storageBucket: 'bucket', storageKey: `test/${randomUUID()}`, identityId: central
  });
  const run = await validation.create(TEST_DATABASE_REF, clientId, {
    id: randomUUID(), customerId, officeId: null, agentId: randomUUID(), executorIdentityId: central, requestedByIdentityId: central,
    snapshot: [{ type: 'cpf', documentId: doc.id, version: doc.version }], residenceProofThirdParty: false, cpfOnIdentity: false
  });
  assert.ok(run);
  await validation.markDispatched(TEST_DATABASE_REF, clientId, run.id, randomUUID(), null);
  await validation.answer(TEST_DATABASE_REF, clientId, { id: run.id, executorIdentityId: central, verdict: 'aprovado', findings: [], summary: 'ok', extractedData: null });
  return { validation, customerId, runId: run.id, doc };
}

void test('confirmacao enfileira os documentos validados quando o Drive da empresa esta ativo', () =>
  withTestDatabase(async (db, client) => {
    const clientId = randomUUID();
    await activateDrive(client, clientId);
    const { validation, customerId, runId, doc } = await confirmedValidation(db, clientId);
    const confirmed = await validation.confirm(TEST_DATABASE_REF, clientId, customerId, runId, randomUUID());
    assert.equal(confirmed?.driveQueued, 1);
    const syncs = new DocumentSyncRepository(db);
    const [syncId] = await syncs.stale(TEST_DATABASE_REF, clientId);
    const claimed = await syncs.claim(TEST_DATABASE_REF, clientId, syncId);
    assert.equal(claimed?.sourceType, 'customer_document');
    assert.equal(claimed?.documentId, doc.id);
    const source = await syncs.source(TEST_DATABASE_REF, clientId, claimed!);
    assert.deepEqual([source?.customerId, source?.documentType, source?.contentType, source?.officeName], [customerId, 'cpf', 'application/pdf', null]);
  }));

void test('sem Drive ativo a confirmacao nao enfileira; ligar o Drive depois e coberto pela reconciliacao', () =>
  withTestDatabase(async (db, client) => {
    const clientId = randomUUID();
    const { validation, customerId, runId } = await confirmedValidation(db, clientId);
    assert.equal((await validation.confirm(TEST_DATABASE_REF, clientId, customerId, runId, randomUUID()))?.driveQueued, 0);
    const syncs = new DocumentSyncRepository(db);
    await activateDrive(client, clientId);
    assert.equal(await syncs.reconcileMissing(TEST_DATABASE_REF, clientId), 1);
    assert.equal(await syncs.reconcileMissing(TEST_DATABASE_REF, clientId), 0, 'idempotente');
  }));
