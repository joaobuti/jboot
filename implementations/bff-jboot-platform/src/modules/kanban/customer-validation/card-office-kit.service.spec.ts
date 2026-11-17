import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { NotFoundException } from '@nestjs/common';
import { CardOfficeKitService } from './card-office-kit.service';

const context = { clientId: 'c1', identityId: 'u1', databaseRef: 'db', applicationId: 'a', roles: [], scopes: [] } as never;
const mutate = { ...(context as object), ip: '127.0.0.1', userAgent: 'test' } as never;
const KIT = { id: 'kit2', fileName: 'KIT_SALIM_2026-10-30.docx', sizeBytes: 1234, storageKey: 'c1/customers/cust/kits/kit2.docx', createdAt: '2026-10-30T10:00:00Z' };

function build(options: { visible?: boolean; customerId?: string | null; latest?: typeof KIT | null; owned?: typeof KIT | null } = {}) {
  const calls = { audits: [] as Array<{ event: string; boardId: unknown; payload: Record<string, unknown> }>, signed: [] as Array<{ key: string; name?: string }>, lookups: [] as unknown[][] };
  const service = new CardOfficeKitService(
    {
      requireVisibleCard: async () => {
        if (options.visible === false) throw new NotFoundException('card');
        return { id: 'card1' };
      }
    } as never,
    { findByCard: async () => ('customerId' in options && options.customerId === null ? null : { customerId: options.customerId ?? 'cust' }) } as never,
    {
      latestKitForCustomer: async (...args: unknown[]) => { calls.lookups.push(args); return 'latest' in options ? options.latest : KIT; },
      findKitForCustomer: async (...args: unknown[]) => { calls.lookups.push(args); return 'owned' in options ? options.owned : KIT; }
    } as never,
    {
      getSignedDownloadUrl: async (key: string, opts: { downloadFileName?: string }) => {
        calls.signed.push({ key, name: opts.downloadFileName });
        return { url: 'https://minio/kit', expiresAt: '2026-10-30T10:05:00Z' };
      }
    } as never,
    { record: async (event: string, _m: unknown, boardId: unknown, payload: Record<string, unknown>) => { calls.audits.push({ event, boardId, payload }); } } as never
  );
  return { service, calls };
}

void test('latest returns the newest kit of the card customer without the storage key', async () => {
  const { service, calls } = build();
  assert.deepEqual(await service.latest(context, 'board1', 'card1'), {
    kit: { id: 'kit2', fileName: 'KIT_SALIM_2026-10-30.docx', sizeBytes: 1234, createdAt: '2026-10-30T10:00:00Z', email: null }
  });
  assert.deepEqual(calls.lookups[0], ['db', 'c1', 'cust']);
});

void test('latest is null for a card without customer or a customer without kit', async () => {
  assert.deepEqual(await build({ customerId: null }).service.latest(context, 'board1', 'card1'), { kit: null });
  assert.deepEqual(await build({ latest: null }).service.latest(context, 'board1', 'card1'), { kit: null });
});

void test('latest and download require the card to be visible', async () => {
  const { service, calls } = build({ visible: false });
  await assert.rejects(service.latest(context, 'board1', 'card1'), NotFoundException);
  await assert.rejects(service.download(context, 'board1', 'card1', 'kit2', mutate), NotFoundException);
  assert.equal(calls.signed.length, 0);
});

void test('download signs the stored file with its name and audits without content', async () => {
  const { service, calls } = build();
  assert.deepEqual(await service.download(context, 'board1', 'card1', 'kit2', mutate), { url: 'https://minio/kit', expiresAt: '2026-10-30T10:05:00Z' });
  assert.deepEqual(calls.lookups[0], ['db', 'c1', 'cust', 'kit2']);
  assert.deepEqual(calls.signed, [{ key: KIT.storageKey, name: KIT.fileName }]);
  assert.deepEqual(calls.audits, [{ event: 'kanban_customer_office_kit_downloaded', boardId: 'board1', payload: { cardId: 'card1', customerId: 'cust', kitId: 'kit2' } }]);
});

void test('download refuses a kit of another customer or a card without customer', async () => {
  const other = build({ owned: null });
  await assert.rejects(other.service.download(context, 'board1', 'card1', 'kit9', mutate), NotFoundException);
  assert.equal(other.calls.signed.length, 0);
  const noCustomer = build({ customerId: null });
  await assert.rejects(noCustomer.service.download(context, 'board1', 'card1', 'kit2', mutate), NotFoundException);
  assert.equal(noCustomer.calls.audits.length, 0);
});
