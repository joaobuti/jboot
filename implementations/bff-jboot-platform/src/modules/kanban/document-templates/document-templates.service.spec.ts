import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { HttpException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { buildDocx } from '../../../test/docx-fixture';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { contentDispositionAttachment, StorageService } from '../attachments/storage.service';
import { CaseTypesController } from '../case-types/case-types.controller';
import { CaseTypesRepository } from '../case-types/case-types.repository';
import { CaseTypesService, validateCaseTypeTemplates } from '../case-types/case-types.service';
import { KanbanAuthGuard } from '../guards/kanban-auth.guard';
import { REQUIRED_SCOPES_KEY, ScopeGuard } from '../guards/scope.guard';
import { KanbanRequestContext } from '../kanban.types';
import { DOCX_CONTENT_TYPE } from './docx-package';
import { DocumentTemplatesController } from './document-templates.controller';
import { DocumentTemplatesRepository } from './document-templates.repository';
import { assertTemplateFileAllowed, DocumentTemplatesService, templateDownloadFileName } from './document-templates.service';
import { TemplateValidationRunner } from './template-validation-runner.service';

const code = (error: unknown) => ((error as HttpException).getResponse() as { code?: string }).code;
const status = (error: unknown) => (error as HttpException).getStatus();

function context(clientId: string, scopes = ['flow:read', 'flow:write', 'flow:admin']): KanbanRequestContext {
  return { identityId: randomUUID(), clientId, applicationId: randomUUID(), databaseRef: TEST_DATABASE_REF, scopes, roles: [] };
}

function docxFile(buffer: Buffer, originalname = 'Modelo sintetico.docx', mimetype = DOCX_CONTENT_TYPE) {
  return { originalname, mimetype, size: buffer.length, buffer };
}

interface FakeStorage {
  uploads: Array<{ key: string; contentType: string }>;
  deleted: string[];
  signed: Array<{ key: string; downloadFileName?: string }>;
}

function build(db: DatabaseService, options: { failCreateVersion?: boolean } = {}) {
  const store: FakeStorage = { uploads: [], deleted: [], signed: [] };
  const storage = {
    bucketName: 'kanban-card-attachments',
    buildTemplateStorageKey: StorageService.prototype.buildTemplateStorageKey,
    upload: async (key: string, _body: Buffer, contentType: string) => {
      store.uploads.push({ key, contentType });
    },
    deleteQuietly: async (key: string) => {
      store.deleted.push(key);
      return true;
    },
    getSignedDownloadUrl: async (key: string, opts: { downloadFileName?: string } = {}) => {
      store.signed.push({ key, downloadFileName: opts.downloadFileName });
      return { url: `https://storage.example/${key}`, expiresAt: '2026-10-12T00:05:00.000Z' };
    }
  };
  const audits: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const audit = {
    record: async (type: string, _m: unknown, _b: unknown, payload: Record<string, unknown>) => {
      audits.push({ type, payload });
    }
  };
  const templatesRepository = new DocumentTemplatesRepository(db);
  if (options.failCreateVersion) {
    templatesRepository.createVersion = async () => {
      throw new Error('falha simulada do banco');
    };
  }
  const runner = new TemplateValidationRunner();
  const templates = new DocumentTemplatesService(templatesRepository, storage as never, runner, audit as never);
  const caseTypes = new CaseTypesService(new CaseTypesRepository(db), templatesRepository, audit as never);
  return { templates, caseTypes, store, audits };
}

void test('arquivo de modelo: mesmas regras dos anexos + so .docx (tipo e extensao) + 10 MB', () => {
  const docx = buildDocx();
  assert.equal(assertTemplateFileAllowed(docxFile(docx)).originalname, 'Modelo sintetico.docx');
  assert.throws(() => assertTemplateFileAllowed(undefined), (error) => code(error) === 'file_required');
  assert.throws(() => assertTemplateFileAllowed(docxFile(docx, 'modelo.docm')), (error) => code(error) === 'template_content_type_not_allowed');
  assert.throws(
    () => assertTemplateFileAllowed(docxFile(Buffer.from('%PDF-1.7'), 'modelo.pdf', 'application/pdf')),
    (error) => code(error) === 'template_content_type_not_allowed'
  );
  assert.throws(
    () => assertTemplateFileAllowed(docxFile(Buffer.from('nao e zip'), 'modelo.docx')),
    (error) => code(error) === 'content_signature_mismatch'
  );
  const big = Buffer.concat([docx, Buffer.alloc(10 * 1024 * 1024)]);
  assert.throws(() => assertTemplateFileAllowed(docxFile(big)), (error) => code(error) === 'template_too_large' && status(error) === 413);
});

void test('nome do download e Content-Disposition seguro', () => {
  assert.equal(templateDownloadFileName('Peticao: "inicial"/INSS', 3), 'Peticao inicial INSS - v3.docx');
  assert.equal(templateDownloadFileName('   ', 1), 'modelo - v1.docx');
  assert.equal(
    contentDispositionAttachment('Petição (v2).docx'),
    `attachment; filename="Peticao _v2_.docx"; filename*=UTF-8''Peti%C3%A7%C3%A3o%20%28v2%29.docx`
  );
});

void test('vinculos do tipo de caso: modelo do tenant, vinculo novo so ativo, padrao entre os vinculados', () => {
  const active = { id: 'a', active: true };
  const inactive = { id: 'i', active: false };
  validateCaseTypeTemplates({ templateIds: ['a'], defaultTemplateId: 'a' }, [], [active]);
  validateCaseTypeTemplates({ templateIds: ['a', 'i'], defaultTemplateId: null }, ['i'], [active, inactive]);
  assert.throws(() => validateCaseTypeTemplates({ templateIds: ['i'], defaultTemplateId: null }, [], [inactive]), (error) => code(error) === 'template_not_allowed');
  assert.throws(() => validateCaseTypeTemplates({ templateIds: ['x'], defaultTemplateId: null }, [], []), (error) => code(error) === 'template_not_allowed');
  assert.throws(
    () => validateCaseTypeTemplates({ templateIds: ['a'], defaultTemplateId: 'i' }, [], [active]),
    (error) => code(error) === 'default_template_not_linked'
  );
});

void test('controllers: guards de auth/scope e toda rota exige flow:admin (operador = 403)', () => {
  for (const controller of [DocumentTemplatesController, CaseTypesController]) {
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, controller), [KanbanAuthGuard, ScopeGuard]);
    const prototype = controller.prototype as unknown as Record<string, unknown>;
    const handlers = Object.getOwnPropertyNames(prototype).filter((name) => name !== 'constructor');
    assert.ok(handlers.length >= 4);
    for (const name of handlers) {
      assert.deepEqual(Reflect.getMetadata(REQUIRED_SCOPES_KEY, prototype[name] as object), ['flow:admin'], `${controller.name}.${name}`);
    }
  }
});

void test('servicos exigem flow:admin (defesa alem do ScopeGuard): operador de escritorio recebe 403', () =>
  withTestDatabase(async (db) => {
    const { templates, caseTypes } = build(db);
    const operator = context(randomUUID(), ['flow:read', 'flow:write']);
    const mutate = { ...operator };
    const id = randomUUID();
    const calls: Array<() => unknown> = [
      () => templates.catalog(operator),
      () => templates.list(operator),
      () => templates.get(operator, id),
      () => templates.create(operator, { name: 'X' }, mutate),
      () => templates.update(operator, id, { active: false }, mutate),
      () => templates.uploadVersion(operator, id, docxFile(buildDocx()), mutate),
      () => templates.getVersion(operator, id, id),
      () => templates.updateVariables(operator, id, id, { variables: [{ key: 'cliente.nome', required: false }] }, mutate),
      () => templates.download(operator, id, id),
      () => templates.resolveForGeneration(operator, id),
      () => caseTypes.list(operator),
      () => caseTypes.get(operator, id),
      () => caseTypes.create(operator, { name: 'X' }, mutate),
      () => caseTypes.update(operator, id, { active: false }, mutate)
    ];
    for (const call of calls) {
      await assert.rejects(async () => call(), (error) => status(error) === 403 && code(error) === 'template_admin_required');
    }
  }));

void test('upload: valida, grava objeto no prefixo do tenant sem nome de arquivo, versao imutavel; nova versao nao altera a anterior', () =>
  withTestDatabase(async (db) => {
    const { templates, store, audits } = build(db);
    const clientId = randomUUID();
    const admin = context(clientId);
    const created = await templates.create(admin, { name: 'Peticao sintetica', description: '  ' }, admin);
    assert.deepEqual([created.description, created.currentVersion, created.versions], [null, null, []]);

    const v1 = await templates.uploadVersion(
      admin,
      created.id,
      docxFile(buildDocx({ paragraphs: ['{{cliente.nome}} {{cliente.cpf}}', '{cliente.cpf}'] }), 'Maria da Silva - modelo.docx'),
      admin
    );
    assert.equal(v1.version, 1);
    assert.equal(v1.validationStatus, 'valid');
    assert.equal(v1.usableForGeneration, true);
    assert.equal(v1.fileName, 'Maria da Silva - modelo.docx', 'nome original so no banco');
    assert.deepEqual(v1.variables.map((variable) => [variable.key, variable.label, variable.required]), [
      ['cliente.cpf', 'CPF', true],
      ['cliente.nome', 'Nome', true]
    ]);
    assert.deepEqual(v1.warnings, [{ code: 'possible_malformed_tag', detail: '{cliente.cpf}' }]);
    assert.deepEqual(store.uploads, [{ key: `${clientId}/templates/${created.id}/${v1.id}.docx`, contentType: DOCX_CONTENT_TYPE }]);
    assert.doesNotMatch(store.uploads[0].key, /Maria/);
    const uploadAudit = audits.find((entry) => entry.type === 'kanban_document_template_version_uploaded');
    assert.equal(uploadAudit?.payload.sha256, v1.sha256);
    assert.doesNotMatch(JSON.stringify(audits), /Maria/, 'auditoria sem nome de arquivo');

    // Variavel desconhecida: versao 2 salva como invalid_variables e vira a atual (inutilizavel na geracao).
    const v2 = await templates.uploadVersion(admin, created.id, docxFile(buildDocx({ paragraphs: ['{{cliente.nomee}}'] })), admin);
    assert.deepEqual([v2.version, v2.validationStatus, v2.usableForGeneration, v2.unknownVariables], [2, 'invalid_variables', false, ['cliente.nomee']]);
    assert.deepEqual(v2.variables.map((variable) => [variable.key, variable.known, variable.label]), [['cliente.nomee', false, null]]);

    const detail = await templates.get(admin, created.id);
    assert.deepEqual(detail.versions.map((version) => [version.version, version.isCurrent]), [[2, true], [1, false]]);
    const firstAgain = await templates.getVersion(admin, created.id, v1.id);
    assert.deepEqual([firstAgain.sha256, firstAgain.validationStatus, firstAgain.usableForGeneration], [v1.sha256, 'valid', false]);

    // Obrigatoria/opcional por variavel; chave inexistente recusada; duplicada recusada.
    const marked = await templates.updateVariables(admin, created.id, v1.id, { variables: [{ key: 'cliente.cpf', required: false }] }, admin);
    assert.equal(marked.variables.find((variable) => variable.key === 'cliente.cpf')?.required, false);
    await assert.rejects(
      templates.updateVariables(admin, created.id, v1.id, { variables: [{ key: 'cliente.email', required: false }] }, admin),
      (error) => code(error) === 'template_variable_not_found'
    );
    await assert.rejects(
      templates.updateVariables(admin, created.id, v1.id, { variables: [{ key: 'cliente.cpf', required: false }, { key: 'cliente.cpf', required: true }] }, admin),
      (error) => code(error) === 'template_variable_duplicated'
    );

    const link = await templates.download(admin, created.id, v1.id);
    assert.match(link.url, new RegExp(`${clientId}/templates/${created.id}/${v1.id}\\.docx$`));
    assert.deepEqual(store.signed.at(-1)?.downloadFileName, 'Peticao sintetica - v1.docx');
    await assert.rejects(templates.download(context(randomUUID()), created.id, v1.id), (error) => code(error) === 'template_not_found');
    await assert.rejects(templates.getVersion(admin, created.id, randomUUID()), (error) => code(error) === 'template_version_not_found');
  }));

void test('upload recusado nao toca storage nem banco; falha do banco remove o objeto enviado', () =>
  withTestDatabase(async (db) => {
    const { templates, store } = build(db);
    const admin = context(randomUUID());
    const created = await templates.create(admin, { name: 'Modelo' }, admin);
    await assert.rejects(
      templates.uploadVersion(admin, created.id, docxFile(buildDocx({ paragraphs: ['{{@raw}}'] })), admin),
      (error) => status(error) === 422 && code(error) === 'template_raw_xml_forbidden'
    );
    await assert.rejects(
      templates.uploadVersion(admin, created.id, docxFile(buildDocx({ mainContentType: 'application/vnd.ms-word.document.macroEnabled.main+xml' })), admin),
      (error) => code(error) === 'template_macro_forbidden'
    );
    await assert.rejects(
      templates.uploadVersion(admin, randomUUID(), docxFile(buildDocx()), admin),
      (error) => code(error) === 'template_not_found'
    );
    assert.deepEqual(store.uploads, []);
    assert.equal((await templates.get(admin, created.id)).versions.length, 0);

    const failing = build(db, { failCreateVersion: true });
    await assert.rejects(failing.templates.uploadVersion(admin, created.id, docxFile(buildDocx()), admin), /falha simulada/);
    assert.equal(failing.store.uploads.length, 1);
    assert.deepEqual(failing.store.deleted, [failing.store.uploads[0].key], 'compensacao remove o objeto');
  }));

void test('tipos de caso pelo servico: cadastro vazio no inicio, vinculo e padrao validados, inativar e geracao pela versao atual', () =>
  withTestDatabase(async (db) => {
    const { templates, caseTypes, audits } = build(db);
    const admin = context(randomUUID());
    assert.deepEqual((await caseTypes.list(admin)).data, [], 'P1: nenhum tipo de caso inventado');
    const model = await templates.create(admin, { name: 'Modelo A' }, admin);
    const other = await templates.create(admin, { name: 'Modelo B' }, admin);
    await templates.update(admin, other.id, { active: false }, admin);

    await assert.rejects(
      caseTypes.create(admin, { name: 'Tipo', templateIds: [other.id] }, admin),
      (error) => code(error) === 'template_not_allowed'
    );
    await assert.rejects(
      caseTypes.create(admin, { name: 'Tipo', templateIds: [model.id], defaultTemplateId: other.id }, admin),
      (error) => code(error) === 'default_template_not_linked'
    );
    const created = await caseTypes.create(
      admin,
      { name: 'Tipo sintetico', description: 'Descricao', classificationCriteria: 'Criterio', expectedEvidence: 'HISCON', templateIds: [model.id], defaultTemplateId: model.id },
      admin
    );
    assert.deepEqual(created.templates, [{ id: model.id, name: 'Modelo A', active: true }]);
    assert.equal(created.defaultTemplateId, model.id);
    await assert.rejects(
      caseTypes.update(admin, created.id, { templateIds: [] }, admin),
      (error) => code(error) === 'default_template_not_linked',
      'remover o vinculo do padrao exige trocar/limpar o padrao'
    );
    const cleared = await caseTypes.update(admin, created.id, { templateIds: [], defaultTemplateId: null, description: '' }, admin);
    assert.deepEqual([cleared.templates, cleared.defaultTemplateId, cleared.description, cleared.classificationCriteria], [[], null, null, 'Criterio']);
    await caseTypes.update(admin, created.id, { templateIds: [model.id], defaultTemplateId: model.id }, admin);

    await assert.rejects(templates.resolveForGeneration(admin, created.id), (error) => code(error) === 'template_without_version');
    const version = await templates.uploadVersion(admin, model.id, docxFile(buildDocx({ paragraphs: ['{{caso.tipo}}'] })), admin);
    const resolved = await templates.resolveForGeneration(admin, created.id);
    assert.deepEqual([resolved.templateId, resolved.version.id, resolved.caseTypeName], [model.id, version.id, 'Tipo sintetico']);

    const inactive = await caseTypes.update(admin, created.id, { active: false }, admin);
    assert.equal(inactive.active, false);
    await assert.rejects(templates.resolveForGeneration(admin, created.id), (error) => code(error) === 'case_type_inactive');
    assert.deepEqual(
      audits.filter((entry) => entry.type.startsWith('kanban_case_type')).map((entry) => entry.type),
      ['kanban_case_type_created', 'kanban_case_type_updated', 'kanban_case_type_updated', 'kanban_case_type_updated']
    );
    await assert.rejects(caseTypes.get(context(randomUUID()), created.id), (error) => code(error) === 'case_type_not_found');
  }));
