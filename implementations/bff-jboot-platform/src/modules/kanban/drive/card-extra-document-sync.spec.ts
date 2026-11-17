import { afterEach, describe, it, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import { UnprocessableEntityException } from '@nestjs/common';
import { DocumentSyncService, driveLocation } from './document-sync.service';
import { GoogleDriveDocumentSyncAdapter } from './google-drive-document-sync.adapter';

const payload = { databaseRef: 'ref', clientId: '11111111-1111-4111-8111-111111111111', syncId: '22222222-2222-4222-8222-222222222222' };
const cipher = { decrypt: () => 'refresh' };

function removalHarness(claim: Record<string, unknown>, adapterTrash: () => Promise<'trashed' | 'missing'>) {
  const calls = { trashed: [] as string[], removed: 0, failures: [] as unknown[][], sourced: 0 };
  const repo = {
    claim: async () => ({ id: payload.syncId, sourceType: 'card_extra_document', documentId: 'doc', documentVersion: 1, checksum: 'a'.repeat(64),
      attemptCount: 1, leaseUntil: 't', refreshTokenEnc: Buffer.from('enc'), rootFolderId: 'root', removeRequested: true, remoteFileId: null, ...claim }),
    source: async () => { calls.sourced += 1; return null; },
    markRemoved: async () => { calls.removed += 1; return true; },
    fail: async (...args: unknown[]) => { calls.failures.push(args); return true; },
    markConfigInvalid: async () => undefined
  };
  const adapter = {
    trash: async ({ remoteFileId }: { remoteFileId: string }) => { calls.trashed.push(remoteFileId); return adapterTrash(); }
  };
  const service = new DocumentSyncService(repo as never, {} as never, adapter as never, {} as never, {} as never, cipher as never, {} as never);
  return { service, calls };
}

void describe('documento avulso do card no Drive (D1)', () => {
  afterEach(() => mock.restoreAll());

  void it('removal never sent to Drive leaves the queue without calling Drive', async () => {
    const { service, calls } = removalHarness({ remoteFileId: null }, async () => 'trashed');
    assert.equal(await service.process(payload), 'removed');
    assert.deepEqual([calls.trashed, calls.removed, calls.sourced], [[], 1, 0]);
  });

  void it('removal of a sent file trashes it; a file already gone also counts as removed', async () => {
    const sent = removalHarness({ remoteFileId: 'remote-1' }, async () => 'trashed');
    assert.equal(await sent.service.process(payload), 'removed');
    assert.deepEqual([sent.calls.trashed, sent.calls.removed], [['remote-1'], 1]);
    const gone = removalHarness({ remoteFileId: 'remote-2' }, async () => 'missing');
    assert.equal(await gone.service.process(payload), 'removed');
  });

  void it('Drive without permission to delete fails permanently with drive_delete_forbidden', async () => {
    const { service, calls } = removalHarness({ remoteFileId: 'remote-1' }, async () => {
      throw new UnprocessableEntityException({ code: 'drive_delete_forbidden', message: 'x' });
    });
    assert.equal(await service.process(payload), 'failed');
    assert.equal(calls.removed, 0);
    const [, , , , code, final] = calls.failures[0];
    assert.deepEqual([code, final], ['drive_delete_forbidden', true]);
  });

  void it('names the file with the first 8 chars of the id, in the customer folder or the legacy card path', () => {
    const sync = { sourceType: 'card_extra_document' as const, documentId: 'abcdef12-3456-4789-8abc-def012345678', documentVersion: 1 };
    const source = { storageKey: 'k', contentType: 'application/pdf', customerId: 'cust', cardId: 'card', officeId: 'office', documentType: null, officeName: 'Manaus', fileName: 'Extrato Banco.pdf' };
    assert.deepEqual(driveLocation('client', sync, source, { documentNumber: '182.870.852-68', name: 'SALIM' }), {
      pathSegments: ['Manaus', '18287085268 - SALIM'],
      fileName: 'Extrato Banco (abcdef12).pdf'
    });
    assert.deepEqual(driveLocation('client', sync, { ...source, customerId: null, fileName: 'sem-extensao' }, null), {
      pathSegments: ['client', 'office', 'unlinked', 'card'],
      fileName: 'sem-extensao (abcdef12).pdf'
    });
  });
});

void describe('GoogleDriveDocumentSyncAdapter.trash', () => {
  afterEach(() => mock.restoreAll());
  const oauth = { accessToken: async () => ({ accessToken: 'access', expiresIn: 3000 }) };

  void it('sends the file to the trash with PATCH trashed=true', async () => {
    const requests: Array<{ url: string; method?: string; body?: unknown }> = [];
    mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      requests.push({ url, method: init.method, body: init.body });
      return new Response(JSON.stringify({ id: 'remote-1' }), { status: 200 });
    });
    assert.equal(await new GoogleDriveDocumentSyncAdapter(oauth as never).trash({ refreshToken: 'r', remoteFileId: 'remote-1' }), 'trashed');
    assert.deepEqual(requests, [{ url: 'https://www.googleapis.com/drive/v3/files/remote-1?fields=id', method: 'PATCH', body: JSON.stringify({ trashed: true }) }]);
  });

  void it('404 is missing; 403 is drive_delete_forbidden; other errors are drive_delete_failed', async () => {
    const adapter = new GoogleDriveDocumentSyncAdapter(oauth as never);
    for (const [status, expected] of [[404, 'missing'], [403, 'drive_delete_forbidden'], [500, 'drive_delete_failed']] as const) {
      mock.method(globalThis, 'fetch', async () => new Response('{}', { status }));
      if (expected === 'missing') {
        assert.equal(await adapter.trash({ refreshToken: 'r', remoteFileId: 'x' }), 'missing');
      } else {
        await assert.rejects(adapter.trash({ refreshToken: 'r', remoteFileId: 'x' }), (error: UnprocessableEntityException) =>
          (error.getResponse() as { code: string }).code === expected);
      }
      mock.restoreAll();
    }
  });
});

void describe('kit assinado no Drive (S2)', () => {
  void it('fica ao lado do kit original, com _ASSINADO e a extensao do arquivo enviado', () => {
    const sync = { sourceType: 'signed_kit' as const, documentId: 'signed-1', documentVersion: 2 };
    const source = { storageKey: 'k', contentType: 'application/pdf', customerId: 'cust', cardId: null, officeId: 'office', documentType: null, officeName: 'Manaus', fileName: 'KIT_MARIA_2026-11-02.docx' };
    assert.deepEqual(driveLocation('client', sync, source, { documentNumber: '529.982.247-25', name: 'MARIA' }), {
      pathSegments: ['Manaus', '52998224725 - MARIA'],
      fileName: 'KIT_MARIA_2026-11-02_ASSINADO.pdf'
    });
    assert.equal(driveLocation('client', sync, { ...source, contentType: 'image/jpeg' }, { documentNumber: '52998224725', name: 'MARIA' }).fileName, 'KIT_MARIA_2026-11-02_ASSINADO.jpg');
  });
});
