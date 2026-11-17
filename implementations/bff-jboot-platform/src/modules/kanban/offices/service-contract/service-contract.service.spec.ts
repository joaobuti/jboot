import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { HttpException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { buildDocx, paragraphXml } from '../../../../test/docx-fixture';
import { DOCX_CONTENT_TYPE } from '../../document-templates/docx-package';
import { analyzeOfficeKitDocx } from './office-kit-docx';
import { ServiceContractService } from './service-contract.service';

const context = { clientId: 'c1', identityId: 'u1', databaseRef: 'db', applicationId: 'a', roles: [], scopes: ['flow:admin'] };
const mutate = { ...context, ip: '127.0.0.1', userAgent: 'test' };

const KIT = buildDocx({
  bodyXml: paragraphXml('[[NOME_COMPLETO]], portador(a)') + '<w:tbl><w:tr><w:tc>' + paragraphXml('[[BANCO_1]]') + '</w:tc></w:tr></w:tbl>'
});

function file(buffer: Buffer, name = 'KIT_MODELO.docx') {
  return { buffer, originalname: name, mimetype: DOCX_CONTENT_TYPE, size: buffer.length } as never;
}

function build(overrides: { office?: unknown; created?: boolean; saveFails?: boolean; versionRow?: Record<string, unknown> | null } = {}) {
  const saved: Array<Record<string, unknown>> = [];
  const audits: unknown[][] = [];
  const uploaded: string[] = [];
  const deleted: string[] = [];
  let current: Record<string, unknown> | null = null;
  const repository = {
    current: async () => current,
    listVersions: async () => (current ? [current] : []),
    findVersion: async () => overrides.versionRow ?? null,
    saveDocxIfChanged: async (_ref: string, _client: string, _office: string, input: Record<string, unknown>) => {
      if (overrides.saveFails) throw new Error('db down');
      saved.push(input);
      current = { version: 3, format: 'docx', fileName: input.fileName, sizeBytes: input.sizeBytes, tags: input.tags, analysis: input.analysis, contentHtml: null, createdByIdentityId: 'u1', createdAt: 't' };
      return { row: current, created: overrides.created ?? true };
    }
  };
  const offices = { findById: async () => ('office' in overrides ? overrides.office : { id: 'o1', name: 'Matriz' }) };
  const database = { queryIdentity: async () => ({ rows: [{ id: 'u1', displayName: 'Gestor' }] }) };
  const storage = {
    buildOfficeKitStorageKey: (params: { clientId: string; officeId: string; versionId: string }) => `${params.clientId}/offices/${params.officeId}/service-contract/${params.versionId}.docx`,
    upload: async (key: string) => { uploaded.push(key); },
    deleteQuietly: async (key: string) => { deleted.push(key); return true; },
    getSignedDownloadUrl: async (key: string, options: { downloadFileName?: string }) => ({ url: `signed:${key}:${options.downloadFileName}`, expiresAt: 't' })
  };
  // Runner sincrono no teste: a mesma funcao da worker thread.
  const runner = { analyzeOfficeKit: async (buffer: Buffer) => analyzeOfficeKitDocx(buffer) };
  const service = new ServiceContractService(
    repository as never,
    offices as never,
    { record: async (...args: unknown[]) => audits.push(args) } as never,
    database as never,
    storage as never,
    runner as never
  );
  return { service, saved, audits, uploaded, deleted };
}

void test('contrato: envio do .docx grava versao com tags e analise, guarda o arquivo e audita', async () => {
  const f = build();
  const result = await f.service.upload(context as never, mutate as never, 'o1', file(KIT));
  assert.equal(f.uploaded.length, 1);
  assert.match(f.uploaded[0], /^c1\/offices\/o1\/service-contract\/[0-9a-f-]{36}\.docx$/);
  assert.deepEqual(f.saved[0].tags, ['NOME_COMPLETO', 'BANCO_1']);
  assert.deepEqual((f.saved[0].analysis as { loanRowTags: string[] }).loanRowTags, ['BANCO_1']);
  assert.equal(f.saved[0].fileName, 'KIT_MODELO.docx');
  assert.equal(result.created, true);
  assert.equal(result.current?.format, 'docx');
  assert.deepEqual(result.current?.marks?.gender, [{ mark: 'portador(a)', count: 1 }]);
  assert.equal(f.audits[0][0], 'kanban_office_service_contract_saved');
  assert.equal((f.audits[0][3] as { format: string }).format, 'docx');
  assert.deepEqual(f.deleted, []);
});

void test('contrato: arquivo igual ao atual nao cria versao nem auditoria e remove o objeto enviado', async () => {
  const f = build({ created: false });
  const result = await f.service.upload(context as never, mutate as never, 'o1', file(KIT));
  assert.equal(result.created, false);
  assert.equal(f.audits.length, 0);
  assert.deepEqual(f.deleted, f.uploaded);
});

void test('contrato: falha ao gravar remove o objeto; arquivo recusado nao chega ao storage', async () => {
  const failing = build({ saveFails: true });
  await assert.rejects(failing.service.upload(context as never, mutate as never, 'o1', file(KIT)), /db down/);
  assert.deepEqual(failing.deleted, failing.uploaded);

  const f = build();
  const unbalanced = buildDocx({ paragraphs: ['[[CPF]]', '[[SE_JEC]]'] });
  await assert.rejects(f.service.upload(context as never, mutate as never, 'o1', file(unbalanced)), (error: HttpException) => {
    assert.equal(error.getStatus(), 422);
    assert.equal((error.getResponse() as { code: string }).code, 'service_contract_block_unbalanced');
    return true;
  });
  await assert.rejects(f.service.upload(context as never, mutate as never, 'o1', file(KIT, 'kit.pdf')), /Only Word documents/);
  assert.deepEqual(f.uploaded, []);
});

void test('contrato: download so de versao .docx; escritorio e versao inexistentes 404', async () => {
  const docx = build({ versionRow: { version: 2, format: 'docx', storageKey: 'k.docx', fileName: 'KIT.docx', tags: [], createdByIdentityId: 'u1' } });
  assert.deepEqual(await docx.service.download(context as never, 'o1', 2), { url: 'signed:k.docx:KIT.docx', expiresAt: 't' });
  const html = build({ versionRow: { version: 1, format: 'html', contentHtml: '<p>[[CPF]]</p>', storageKey: null, tags: ['CPF'], createdByIdentityId: 'u1' } });
  await assert.rejects(html.service.download(context as never, 'o1', 1), UnprocessableEntityException);
  const view = await html.service.getVersion(context as never, 'o1', 1);
  assert.equal(view.contentHtml, '<p>[[CPF]]</p>');
  assert.equal(view.marks, null, 'versao HTML e so historico, sem analise');

  await assert.rejects(build({ office: null }).service.get(context as never, 'o1'), NotFoundException);
  await assert.rejects(build({ office: null }).service.upload(context as never, mutate as never, 'o1', file(KIT)), NotFoundException);
  await assert.rejects(build().service.getVersion(context as never, 'o1', 9), NotFoundException);
});
