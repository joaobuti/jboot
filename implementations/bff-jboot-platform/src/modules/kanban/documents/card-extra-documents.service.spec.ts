import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CardExtraDocumentsService } from './card-extra-documents.service';

const context = { clientId: 'c1', identityId: 'me', databaseRef: 'db', applicationId: 'a', roles: [], scopes: [] } as never;
const mutate = { ...(context as object), ip: '127.0.0.1', userAgent: 'test' } as never;
const PDF = { originalname: 'extrato.pdf', mimetype: 'application/pdf', size: 1024, buffer: Buffer.from('%PDF-1.7\n', 'latin1') };

function row(id: string, createdBy: string) {
  return {
    id, cardId: 'card1', description: null, createdByIdentityId: createdBy, createdAt: '2026-10-30T10:00:00Z',
    attachmentId: `att-${id}`, activityId: `act-${id}`, fileName: `${id}.pdf`, contentType: 'application/pdf', sizeBytes: 4
  };
}

function build(options: { role?: boolean; columnEditable?: boolean; leadEditable?: boolean; reviewer?: boolean; rows?: ReturnType<typeof row>[]; removeResult?: { driveRemovalQueued: boolean } | null } = {}) {
  const calls = { created: [] as Array<Record<string, unknown>>, removed: [] as Array<Record<string, unknown>>, audits: [] as Array<{ event: string; payload: Record<string, unknown> }>, uploaded: [] as string[], deleted: [] as string[] };
  const rows = options.rows ?? [row('mine', 'me'), row('theirs', 'other')];
  const forbidden = () => { throw new ForbiddenException('no'); };
  const service = new CardExtraDocumentsService(
    {
      listActive: async () => rows,
      findActive: async (_r: string, _c: string, _card: string, id: string) => rows.find((item) => item.id === id) ?? null,
      create: async (_r: string, _c: string, input: Record<string, unknown>) => {
        calls.created.push(input);
        return { document: { ...row(input.documentId as string, 'me'), description: input.description }, driveQueued: true };
      },
      remove: async (_r: string, _c: string, params: Record<string, unknown>) => {
        calls.removed.push(params);
        return 'removeResult' in options ? options.removeResult : { driveRemovalQueued: true };
      }
    } as never,
    { requireVisibleCard: async () => ({ id: 'card1', boardColumnId: 'col1' }) } as never,
    {
      requireBoard: async () => undefined,
      requireRole: async () => (options.role === false ? forbidden() : undefined),
      requireColumnEditable: async () => (options.columnEditable === false ? forbidden() : undefined),
      canReviewDocuments: async () => options.reviewer === true
    } as never,
    {
      bucketName: 'bucket',
      buildStorageKey: (p: { attachmentId: string }) => `k/${p.attachmentId}`,
      upload: async (key: string) => { calls.uploaded.push(key); },
      deleteQuietly: async (key: string) => { calls.deleted.push(key); return true; }
    } as never,
    { record: async (event: string, _m: unknown, _b: unknown, payload: Record<string, unknown>) => { calls.audits.push({ event, payload }); } } as never,
    { assertEditable: async () => (options.leadEditable === false ? forbidden() : undefined), isEditable: async () => options.leadEditable !== false } as never
  );
  return { service, calls };
}

void test('list: member removes only what they sent; reviewer removes any; locked column removes nothing', async () => {
  const member = await build().service.list(context, 'b1', 'card1');
  assert.equal(member.canUpload, true);
  assert.deepEqual(member.documents.map((doc) => [doc.id, doc.canRemove]), [['mine', true], ['theirs', false]]);
  assert.deepEqual(member.documents[0].attachment, { id: 'att-mine', activityId: 'act-mine', fileName: 'mine.pdf', contentType: 'application/pdf', sizeBytes: 4 });

  const reviewer = await build({ reviewer: true }).service.list(context, 'b1', 'card1');
  assert.deepEqual(reviewer.documents.map((doc) => doc.canRemove), [true, true]);

  const locked = await build({ reviewer: true, columnEditable: false }).service.list(context, 'b1', 'card1');
  assert.deepEqual([locked.canUpload, ...locked.documents.map((doc) => doc.canRemove)], [false, false, false]);
  const viewer = await build({ role: false }).service.list(context, 'b1', 'card1');
  assert.equal(viewer.canUpload, false);
});

void test('upload stores the file, hashes it, keeps the description and audits without content', async () => {
  const { service, calls } = build();
  const created = await service.upload(context, 'b1', 'card1', 'Extrato mar/2026', PDF as never, mutate);
  assert.equal(created.description, 'Extrato mar/2026');
  assert.equal(created.canRemove, true);
  assert.equal(calls.uploaded.length, 1);
  assert.equal(calls.created[0].sha256, createHash('sha256').update(PDF.buffer).digest('hex'));
  assert.equal(calls.created[0].fileName, 'extrato.pdf');
  assert.deepEqual(calls.audits.map((audit) => audit.event), ['kanban_card_extra_document_added']);
  assert.equal('fileName' in calls.audits[0].payload, false);

  const empty = build();
  await empty.service.upload(context, 'b1', 'card1', '', PDF as never, mutate);
  assert.equal(empty.calls.created[0].description, null, 'descricao vazia vira nula');
});

void test('upload is refused on a locked column or frozen lead, before touching the storage', async () => {
  for (const options of [{ columnEditable: false }, { leadEditable: false }, { role: false }]) {
    const { service, calls } = build(options);
    await assert.rejects(service.upload(context, 'b1', 'card1', undefined, PDF as never, mutate), ForbiddenException);
    assert.equal(calls.uploaded.length, 0);
  }
});

void test('upload failure in the database removes the stored file', async () => {
  const { service, calls } = build();
  (service as unknown as { repository: { create: () => Promise<never> } }).repository.create = async () => { throw new Error('db down'); };
  await assert.rejects(service.upload(context, 'b1', 'card1', undefined, PDF as never, mutate), /db down/);
  assert.equal(calls.deleted.length, 1);
});

void test('remove: who sent it or a reviewer; others get 403; unknown or already removed is 404', async () => {
  const own = build();
  await own.service.remove(context, 'b1', 'card1', 'mine', mutate);
  assert.equal(own.calls.removed.length, 1);
  assert.deepEqual(own.calls.audits, [{ event: 'kanban_card_extra_document_removed', payload: { cardId: 'card1', documentId: 'mine', driveRemovalQueued: true } }]);

  const other = build();
  await assert.rejects(other.service.remove(context, 'b1', 'card1', 'theirs', mutate), ForbiddenException);
  assert.equal(other.calls.removed.length, 0);

  const reviewer = build({ reviewer: true });
  await reviewer.service.remove(context, 'b1', 'card1', 'theirs', mutate);
  assert.equal(reviewer.calls.removed.length, 1);

  await assert.rejects(build().service.remove(context, 'b1', 'card1', 'missing', mutate), NotFoundException);
  await assert.rejects(build({ removeResult: null }).service.remove(context, 'b1', 'card1', 'mine', mutate), NotFoundException);
  await assert.rejects(build({ columnEditable: false, reviewer: true }).service.remove(context, 'b1', 'card1', 'mine', mutate), ForbiddenException);
});
