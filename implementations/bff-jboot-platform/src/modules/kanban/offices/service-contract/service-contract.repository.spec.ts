import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../../test/with-test-database';
import { ServiceContractRepository, StoredKitAnalysis } from './service-contract.repository';

async function office(client: Client, clientId: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO kanban_offices (client_id, name, created_by_identity_id) VALUES ($1, $2, $3) RETURNING id`,
    [clientId, `Escritorio ${randomUUID().slice(0, 8)}`, randomUUID()]
  );
  return result.rows[0].id;
}

const analysis: StoredKitAnalysis = {
  invalidTags: [],
  blocks: ['JEC', 'JEF'],
  loanRowTags: ['BANCO_1'],
  marks: { gender: [{ mark: 'portador(a)', count: 2 }], plural: [], unrecognized: [] },
  warnings: []
};

const input = (sha: string) => {
  const id = randomUUID();
  return { id, storageKey: `k/${id}.docx`, fileName: 'KIT.docx', sizeBytes: 1234, tags: ['CPF', 'BANCO_1'], analysis, contentSha256: sha.repeat(64), identityId: randomUUID() };
};

void test('contrato: versao .docx cresce sobre o historico HTML; arquivo igual nao cria versao; tenant isolado', () =>
  withTestDatabase(async (db, client) => {
    const repository = new ServiceContractRepository(db);
    const clientId = randomUUID();
    const officeA = await office(client, clientId);
    const officeB = await office(client, clientId);
    // Versao HTML da Sprint 1 (historico) gravada como o editor Quill gravava.
    await client.query(
      `INSERT INTO kanban_office_service_contract_versions (client_id, office_id, version, content_html, tags, content_sha256, created_by_identity_id)
       VALUES ($1, $2, 1, '<p>[[CPF]]</p>', '{CPF}', $3, $4)`,
      [clientId, officeA, 'h'.repeat(64), randomUUID()]
    );

    const first = await repository.saveDocxIfChanged(TEST_DATABASE_REF, clientId, officeA, input('a'));
    assert.equal(first.created, true);
    assert.equal(first.row.version, 2);
    assert.equal(first.row.format, 'docx');
    assert.equal(first.row.contentHtml, null);
    assert.deepEqual(first.row.analysis, analysis);

    const same = await repository.saveDocxIfChanged(TEST_DATABASE_REF, clientId, officeA, input('a'));
    assert.equal(same.created, false);
    assert.equal(same.row.version, 2);

    assert.equal((await repository.saveDocxIfChanged(TEST_DATABASE_REF, clientId, officeA, input('b'))).row.version, 3);
    assert.equal((await repository.saveDocxIfChanged(TEST_DATABASE_REF, clientId, officeB, input('a'))).row.version, 1);

    const versions = await repository.listVersions(TEST_DATABASE_REF, clientId, officeA);
    assert.deepEqual(versions.map((row) => [row.version, row.format]), [[3, 'docx'], [2, 'docx'], [1, 'html']]);
    assert.equal((await repository.findVersion(TEST_DATABASE_REF, clientId, officeA, 1))?.contentHtml, '<p>[[CPF]]</p>');
    assert.equal((await repository.current(TEST_DATABASE_REF, clientId, officeA))?.version, 3);
    assert.equal(await repository.current(TEST_DATABASE_REF, randomUUID(), officeA), null, 'outro tenant');
    await assert.rejects(
      repository.saveDocxIfChanged(TEST_DATABASE_REF, randomUUID(), officeA, input('d')),
      /kanban_office_service_contract_versions_office_fk/,
      'escritorio de outro tenant nao aceita versao'
    );
  }));

void test('contrato: banco recusa versao .docx sem arquivo ou com HTML', () =>
  withTestDatabase(async (_db, client) => {
    const clientId = randomUUID();
    const officeId = await office(client, clientId);
    await assert.rejects(
      client.query(
        `INSERT INTO kanban_office_service_contract_versions (client_id, office_id, version, format, content_html, tags, content_sha256, created_by_identity_id)
         VALUES ($1, $2, 1, 'docx', '<p>x</p>', '{}', $3, $4)`,
        [clientId, officeId, 'x'.repeat(64), randomUUID()]
      ),
      /kanban_office_service_contract_versions_format_check/
    );
  }));
