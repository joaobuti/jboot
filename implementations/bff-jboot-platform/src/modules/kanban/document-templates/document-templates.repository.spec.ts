import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { ConflictException, HttpException } from '@nestjs/common';
import { Client } from 'pg';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { CaseTypesRepository, CaseTypeWrite } from '../case-types/case-types.repository';
import { DocumentTemplatesRepository, NewTemplateVersion } from './document-templates.repository';
import { resolveGenerationTemplate } from './generation-template';

const REF = TEST_DATABASE_REF;
const code = (error: unknown) => ((error as HttpException).getResponse() as { code?: string }).code;

/** Erro de SQL esperado dentro da transacao do teste: isola num SAVEPOINT. */
async function rejectsInSavepoint(client: Client, run: () => Promise<unknown>, expected: RegExp | ((error: unknown) => boolean)) {
  await client.query('SAVEPOINT expected_error');
  await assert.rejects(run(), expected as never);
  await client.query('ROLLBACK TO SAVEPOINT expected_error');
}

function newVersion(clientId: string, templateId: string, overrides: Partial<NewTemplateVersion> = {}): NewTemplateVersion {
  const versionId = overrides.versionId ?? randomUUID();
  return {
    versionId,
    templateId,
    storageBucket: 'kanban-card-attachments',
    storageKey: `${clientId}/templates/${templateId}/${versionId}.docx`,
    fileName: 'modelo.docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: 1234,
    sha256: 'a'.repeat(64),
    catalogVersion: 1,
    status: 'valid',
    report: { unknownVariables: [], warnings: [] },
    variables: [
      { key: 'cliente.nome', known: true, valueType: 'text' },
      { key: 'lead.casos', known: true, valueType: 'collection' }
    ],
    identityId: randomUUID(),
    ...overrides
  };
}

function caseType(overrides: Partial<CaseTypeWrite> = {}): CaseTypeWrite {
  return {
    name: 'Tipo sintetico',
    description: null,
    classificationCriteria: 'Criterio sintetico',
    expectedEvidence: null,
    active: true,
    templateIds: [],
    defaultTemplateId: null,
    ...overrides
  };
}

void test('modelos: cria, nome unico entre ativos por tenant, inativa sem apagar, lista com versao atual', () =>
  withTestDatabase(async (db, client) => {
    const repository = new DocumentTemplatesRepository(db);
    const clientId = randomUUID();
    const actor = randomUUID();
    const created = await repository.create(REF, clientId, { name: 'Peticao inicial', description: 'Sintetico' }, actor);
    assert.equal(created.active, true);
    assert.equal(created.currentVersionId, null);
    await rejectsInSavepoint(client, () => repository.create(REF, clientId, { name: ' peticao INICIAL ', description: null }, actor), (error) => error instanceof ConflictException);
    await repository.create(REF, randomUUID(), { name: 'Peticao inicial', description: null }, actor);

    const inactive = await repository.update(REF, clientId, created.id, { active: false, description: null }, actor);
    assert.deepEqual([inactive.active, inactive.description], [false, null]);
    const again = await repository.create(REF, clientId, { name: 'Peticao inicial', description: null }, actor);
    await assert.rejects(repository.update(REF, randomUUID(), again.id, { name: 'X' }, actor), /Document template not found/);

    await repository.createVersion(REF, clientId, newVersion(clientId, again.id));
    const list = await repository.list(REF, clientId);
    assert.equal(list.length, 2);
    assert.deepEqual(list[0].currentVersion && [list[0].id, list[0].currentVersion.version, list[0].currentVersion.validationStatus], [again.id, 1, 'valid']);
    assert.equal(list[1].currentVersion, null);
    assert.equal(await repository.findById(REF, randomUUID(), again.id), null, 'outro tenant nao ve');
  }));

void test('versoes: numero sequencial, variaveis default obrigatoria, versao atual muda e a anterior fica intacta', () =>
  withTestDatabase(async (db) => {
    const repository = new DocumentTemplatesRepository(db);
    const clientId = randomUUID();
    const template = await repository.create(REF, clientId, { name: 'Procuracao', description: null }, randomUUID());
    const first = await repository.createVersion(REF, clientId, newVersion(clientId, template.id));
    const second = await repository.createVersion(
      REF,
      clientId,
      newVersion(clientId, template.id, { sha256: 'b'.repeat(64), status: 'invalid_variables', variables: [{ key: 'cliente.nomee', known: false, valueType: null }] })
    );
    assert.deepEqual([first.version, second.version], [1, 2]);
    assert.equal((await repository.findById(REF, clientId, template.id))?.currentVersionId, second.id);
    const firstAgain = await repository.findVersion(REF, clientId, template.id, first.id);
    assert.deepEqual([firstAgain?.sha256, firstAgain?.validationStatus, firstAgain?.storageKey], [
      'a'.repeat(64),
      'valid',
      `${clientId}/templates/${template.id}/${first.id}.docx`
    ]);
    assert.deepEqual(
      (await repository.listVariables(REF, clientId, first.id)).map((variable) => [variable.key, variable.known, variable.valueType, variable.required]),
      [
        ['cliente.nome', true, 'text', true],
        ['lead.casos', true, 'collection', true]
      ]
    );
    assert.deepEqual((await repository.listVersions(REF, clientId, template.id)).map((version) => version.version), [2, 1]);
    assert.equal(await repository.findVersion(REF, randomUUID(), template.id, first.id), null);
    await assert.rejects(repository.createVersion(REF, clientId, newVersion(clientId, randomUUID())), /Document template not found/);
  }));

void test('imutabilidade: versao nao aceita UPDATE/DELETE; da variavel so muda "required"; chave sem nome de arquivo', () =>
  withTestDatabase(async (db, client) => {
    const repository = new DocumentTemplatesRepository(db);
    const clientId = randomUUID();
    const template = await repository.create(REF, clientId, { name: 'Modelo', description: null }, randomUUID());
    const version = await repository.createVersion(REF, clientId, newVersion(clientId, template.id));
    const immutable = /immutable|cannot be deleted|only "required"/;
    await rejectsInSavepoint(client, () => client.query(`UPDATE kanban_document_template_versions SET sha256 = $2 WHERE id = $1`, [version.id, 'c'.repeat(64)]), immutable);
    await rejectsInSavepoint(client, () => client.query(`UPDATE kanban_document_template_versions SET validation_status = 'valid' WHERE id = $1`, [version.id]), immutable);
    await rejectsInSavepoint(client, () => client.query(`DELETE FROM kanban_document_template_versions WHERE id = $1`, [version.id]), immutable);
    await rejectsInSavepoint(client, () => client.query(`UPDATE kanban_template_version_variables SET known = false, value_type = NULL WHERE version_id = $1`, [version.id]), immutable);
    await rejectsInSavepoint(client, () => client.query(`DELETE FROM kanban_template_version_variables WHERE version_id = $1`, [version.id]), immutable);
    // Chave fora do padrao `{client}/templates/{template}/{version}.docx` (ex.: com nome de arquivo) e recusada pelo banco.
    await rejectsInSavepoint(
      client,
      () => repository.createVersion(REF, clientId, newVersion(clientId, template.id, { storageKey: `${clientId}/templates/${template.id}/x-Maria.docx` })),
      /storage_key_check/
    );

    const actor = randomUUID();
    const result = await repository.updateVariableRequirements(REF, clientId, version.id, [
      { key: 'cliente.nome', required: false },
      { key: 'lead.casos', required: true }
    ], actor);
    assert.deepEqual(result.changed, ['cliente.nome'], 'so o que mudou');
    const variables = await repository.listVariables(REF, clientId, version.id);
    assert.equal(variables.find((variable) => variable.key === 'cliente.nome')?.required, false);
    assert.ok(variables.find((variable) => variable.key === 'cliente.nome')?.requiredUpdatedAt);
    await assert.rejects(
      repository.updateVariableRequirements(REF, clientId, version.id, [{ key: 'cliente.cpf', required: false }], actor),
      (error) => code(error) === 'template_variable_not_found'
    );
    await assert.rejects(
      repository.updateVariableRequirements(REF, randomUUID(), version.id, [{ key: 'cliente.nome', required: true }], actor),
      (error) => code(error) === 'template_variable_not_found',
      'outro tenant nao altera'
    );
  }));

void test('tipos de caso: cria vazio ou com modelos, nome unico entre ativos, padrao precisa estar vinculado (FK no banco)', () =>
  withTestDatabase(async (db, client) => {
    const templates = new DocumentTemplatesRepository(db);
    const repository = new CaseTypesRepository(db);
    const clientId = randomUUID();
    const actor = randomUUID();
    const t1 = await templates.create(REF, clientId, { name: 'Modelo 1', description: null }, actor);
    const t2 = await templates.create(REF, clientId, { name: 'Modelo 2', description: null }, actor);

    const empty = await repository.create(REF, clientId, caseType({ name: 'Sem modelo' }), actor);
    assert.deepEqual([empty.templateIds, empty.defaultTemplateId, empty.active], [[], null, true]);
    const withTemplates = await repository.create(
      REF,
      clientId,
      caseType({ name: 'Com modelos', templateIds: [t1.id, t2.id], defaultTemplateId: t2.id }),
      actor
    );
    assert.deepEqual(withTemplates.templateIds, [t1.id, t2.id].sort());
    assert.equal(withTemplates.defaultTemplateId, t2.id);
    await rejectsInSavepoint(client, () => repository.create(REF, clientId, caseType({ name: ' com MODELOS ' }), actor), (error) => error instanceof ConflictException);
    await rejectsInSavepoint(
      client,
      () => repository.create(REF, clientId, caseType({ name: 'Padrao solto', templateIds: [t1.id], defaultTemplateId: t2.id }), actor),
      /default_template_fkey/
    );

    // Troca vinculos e padrao juntos; remover o vinculo do padrao sem trocar o padrao e recusado.
    const swapped = await repository.update(REF, clientId, withTemplates.id, caseType({ name: 'Com modelos', templateIds: [t1.id], defaultTemplateId: t1.id }), actor);
    assert.deepEqual([swapped.templateIds, swapped.defaultTemplateId], [[t1.id], t1.id]);
    await rejectsInSavepoint(
      client,
      () => repository.update(REF, clientId, withTemplates.id, caseType({ name: 'Com modelos', templateIds: [t2.id], defaultTemplateId: t1.id }), actor),
      /default_template_fkey/
    );
    const inactive = await repository.update(REF, clientId, empty.id, caseType({ name: 'Sem modelo', active: false }), actor);
    assert.equal(inactive.active, false);
    await assert.rejects(repository.update(REF, randomUUID(), empty.id, caseType(), actor), /Case type not found/);
    assert.deepEqual((await repository.list(REF, clientId)).map((row) => row.name), ['Com modelos', 'Sem modelo']);
    assert.deepEqual((await templates.listLinkedCaseTypes(REF, clientId, t1.id)).map((row) => [row.name, row.isDefault]), [['Com modelos', true]]);
  }));

void test('geracao (preparo da S6): versao ATUAL valida do modelo padrao; inativo, sem padrao, nao vinculado e invalid_variables recusados', () =>
  withTestDatabase(async (db) => {
    const templates = new DocumentTemplatesRepository(db);
    const caseTypes = new CaseTypesRepository(db);
    const clientId = randomUUID();
    const actor = randomUUID();
    const t1 = await templates.create(REF, clientId, { name: 'Modelo padrao', description: null }, actor);
    const t2 = await templates.create(REF, clientId, { name: 'Modelo alternativo', description: null }, actor);
    const loose = await templates.create(REF, clientId, { name: 'Nao vinculado', description: null }, actor);
    const type = await caseTypes.create(REF, clientId, caseType({ name: 'Tipo', templateIds: [t1.id, t2.id], defaultTemplateId: t1.id }), actor);
    const resolve = async (templateId: string | null = null, typeId = type.id) =>
      resolveGenerationTemplate(await templates.loadGenerationCandidate(REF, clientId, typeId, templateId), templateId);
    const failsWith = async (expected: string, run: () => Promise<unknown>) =>
      assert.rejects(run(), (error) => code(error) === expected, expected);

    await failsWith('template_without_version', () => resolve());
    const v1 = await templates.createVersion(REF, clientId, newVersion(clientId, t1.id));
    const ok = await resolve();
    assert.deepEqual([ok.templateId, ok.version.id, ok.version.version, ok.version.sha256], [t1.id, v1.id, 1, 'a'.repeat(64)]);
    assert.equal(ok.version.storageKey, `${clientId}/templates/${t1.id}/${v1.id}.docx`);

    // Versao nova com variavel desconhecida vira a atual e bloqueia (sem fallback para a v1).
    await templates.createVersion(
      REF,
      clientId,
      newVersion(clientId, t1.id, { status: 'invalid_variables', report: { unknownVariables: ['cliente.nomee'] }, variables: [] })
    );
    await assert.rejects(resolve(), (error) => {
      const body = (error as HttpException).getResponse() as { code?: string; unknownVariables?: string[] };
      return body.code === 'template_version_not_usable' && body.unknownVariables?.[0] === 'cliente.nomee';
    });
    const v3 = await templates.createVersion(REF, clientId, newVersion(clientId, t1.id));
    assert.equal((await resolve()).version.id, v3.id, 'versao corrigida volta a gerar');

    await failsWith('template_not_linked', () => resolve(loose.id));
    await failsWith('template_without_version', () => resolve(t2.id));
    await templates.update(REF, clientId, t1.id, { active: false }, actor);
    await failsWith('template_inactive', () => resolve());
    await templates.update(REF, clientId, t1.id, { active: true }, actor);
    const noDefault = await caseTypes.create(REF, clientId, caseType({ name: 'Sem padrao', templateIds: [t1.id] }), actor);
    await failsWith('case_type_without_default_template', () => resolve(null, noDefault.id));
    assert.equal((await resolve(t1.id, noDefault.id)).templateId, t1.id, 'gestor escolhe entre os vinculados');
    await caseTypes.update(REF, clientId, type.id, caseType({ name: 'Tipo', active: false, templateIds: [t1.id, t2.id], defaultTemplateId: t1.id }), actor);
    await failsWith('case_type_inactive', () => resolve());
    await failsWith('case_type_not_found', () => resolve(null, randomUUID()));
    assert.equal(await templates.loadGenerationCandidate(REF, randomUUID(), noDefault.id, null), null, 'outro tenant');
  }));
