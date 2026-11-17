import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { keyOffVisibility } from '../../../test/kanban-visibility';
import { AttachmentsService, assertAttachmentFileAllowed, MAX_ATTACHMENT_SIZE_BYTES } from './attachments.service';
import { redactStorageKey } from './storage.service';

const context = { clientId: 'c1', identityId: 'u1', databaseRef: 'db', applicationId: 'a', roles: [], scopes: [] };
// Buffer com assinatura PDF real: a validacao confere os primeiros bytes (Backlog T5).
const PDF_BYTES = Buffer.from('%PDF-1.7\n%fake\n', 'latin1');
const PDF = { originalname: 'a.pdf', mimetype: 'application/pdf', size: PDF_BYTES.length, buffer: PDF_BYTES };

void test('assertAttachmentFileAllowed: limite e whitelist unicos para anexos e documentos', () => {
  assert.equal(assertAttachmentFileAllowed(PDF), PDF);
  assert.throws(() => assertAttachmentFileAllowed(undefined), (e: { getStatus: () => number }) => e.getStatus() === 400);
  assert.throws(
    () => assertAttachmentFileAllowed({ ...PDF, size: MAX_ATTACHMENT_SIZE_BYTES + 1 }),
    (e: { getStatus: () => number }) => e.getStatus() === 413
  );
  assert.throws(() => assertAttachmentFileAllowed({ ...PDF, size: 0 }), (e: { getStatus: () => number }) => e.getStatus() === 413);
  assert.throws(
    () => assertAttachmentFileAllowed({ ...PDF, mimetype: 'text/html' }),
    (e: { getStatus: () => number }) => e.getStatus() === 415
  );
});

void test('anexo: falha ao gravar a linha remove o objeto recem-enviado (sem objeto orfao)', async () => {
  const deleted: string[] = [];
  const uploaded: string[] = [];
  const service = new AttachmentsService(
    {
      create: async () => {
        throw new Error('db down');
      }
    } as never,
    { findById: async () => ({ id: 'act-1' }) } as never,
    keyOffVisibility(async () => ({ id: 'card-1' })),
    {
      bucketName: 'b',
      buildStorageKey: () => 'c1/card-1/act-1/att-a.pdf',
      upload: async (key: string) => {
        uploaded.push(key);
      },
      deleteQuietly: async (key: string) => {
        deleted.push(key);
        return true;
      }
    } as never,
    { requireBoard: async () => ({}), requireRole: async () => 'board_member' } as never
  );
  await assert.rejects(service.upload(context as never, 'b1', 'card-1', 'act-1', PDF), /db down/);
  assert.deepEqual(deleted, uploaded);
  assert.equal(deleted.length, 1);
});

void test('anexo: conteudo que nao condiz com o tipo declarado -> 415 antes de subir o objeto', async () => {
  const uploaded: string[] = [];
  const service = new AttachmentsService(
    { create: async () => ({}) } as never,
    { findById: async () => ({ id: 'act-1' }) } as never,
    keyOffVisibility(async () => ({ id: 'card-1' })),
    {
      bucketName: 'b',
      buildStorageKey: () => 'k',
      upload: async (key: string) => {
        uploaded.push(key);
      }
    } as never,
    { requireBoard: async () => ({}), requireRole: async () => 'board_member' } as never
  );
  const html = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');
  await assert.rejects(
    service.upload(context as never, 'b1', 'card-1', 'act-1', { ...PDF, mimetype: 'image/png', buffer: html, size: html.length }),
    (e: { getStatus: () => number; getResponse: () => { code: string } }) =>
      e.getStatus() === 415 && e.getResponse().code === 'content_signature_mismatch'
  );
  assert.deepEqual(uploaded, []);
});

void test('redactStorageKey remove o nome do arquivo do log de compensacao', () => {
  const attachmentId = '0b9f7c4e-1d2a-4c3b-9a8e-7f6d5c4b3a21';
  assert.equal(
    redactStorageKey(`client/card/activity/${attachmentId}-RG_Fulano_de_Tal.pdf`),
    `client/card/activity/${attachmentId}`
  );
});
