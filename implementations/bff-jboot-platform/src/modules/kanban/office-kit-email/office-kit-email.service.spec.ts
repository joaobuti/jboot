import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { OfficeKitEmailService, renderKitEmail } from './office-kit-email.service';

const ctx = { clientId: 'c1', identityId: 'me', databaseRef: 'db', applicationId: 'flow', roles: [], scopes: [] } as never;
const mutate = { clientId: 'c1', identityId: 'me', ip: '127.0.0.1' } as never;

function build(options: { settings?: { enabled: boolean; subject: string; body: string } | null; mailFails?: boolean; claims?: number } = {}) {
  const calls = { queued: [] as Array<Record<string, unknown>>, mails: [] as Array<Record<string, unknown>>, events: [] as string[], sent: 0, failed: [] as string[] };
  let claims = options.claims ?? 0;
  const service = new OfficeKitEmailService(
    {
      getSettings: async () => ('settings' in options ? options.settings : { enabled: true, subject: 'Documentos - [[ESCRITORIO]]', body: 'Olá, [[NOME]].\n\n[[ESCRITORIO]]' }),
      enqueue: async (_r: string, _c: string, input: Record<string, unknown>) => { calls.queued.push(input); return true; },
      claim: async () => {
        if (claims <= 0) return null;
        claims -= 1;
        return { id: 'e1', customerId: 'cust', kitId: 'kit', toEmail: 'maria@exemplo.com', subject: 's', body: 'b', status: 'sending', attemptCount: 1, lastError: null, sentAt: null, createdAt: 't', storageKey: 'k.docx', fileName: 'KIT.docx', leaseUntil: 'l', createdByIdentityId: 'me' };
      },
      markSent: async () => { calls.sent += 1; return true; },
      markFailed: async (_r: string, _c: string, _id: string, _l: string, code: string) => { calls.failed.push(code); return 'retry'; }
    } as never,
    { findById: async () => ({ id: 'office', name: 'Manaus' }) } as never,
    { download: async () => Buffer.from('docx') } as never,
    {
      sendOfficeKitEmail: async (input: Record<string, unknown>) => {
        if (options.mailFails) throw new Error('smtp down');
        calls.mails.push(input);
      }
    } as never,
    { listActiveFlowTenants: async () => [{ databaseRef: 'db', clientId: 'c1' }] } as never,
    { cardIdsByCustomer: async () => ['card-1', 'card-2'] } as never,
    { createSystemEvent: async (_r: string, _c: string, cardId: string, _who: string, kind: string) => { calls.events.push(`${kind}:${cardId}`); } } as never,
    { record: async () => undefined } as never
  );
  return { service, calls };
}

void test('modelo do e-mail: [[NOME]] e [[ESCRITORIO]] trocados, o resto como foi salvo', () => {
  assert.equal(renderKitEmail('Olá, [[NOME]]. [[NOME]]! [[ESCRITORIO]] [[OUTRA]]', { name: 'MARIA', office: 'Manaus' }), 'Olá, MARIA. MARIA! Manaus [[OUTRA]]');
});

void test('na geracao do kit: entra na fila so com envio ligado e e-mail valido, ja montado', async () => {
  const queued = build();
  assert.equal(await queued.service.enqueueForKit(ctx, { id: 'kit', officeId: 'office', customerId: 'cust' }, { name: 'MARIA', email: ' maria@exemplo.com ' }, mutate), 'queued');
  assert.deepEqual([queued.calls.queued[0].toEmail, queued.calls.queued[0].subject, queued.calls.queued[0].body], ['maria@exemplo.com', 'Documentos - Manaus', 'Olá, MARIA.\n\nManaus']);
  assert.equal(await build({ settings: null }).service.enqueueForKit(ctx, { id: 'kit', officeId: 'office', customerId: 'cust' }, { name: 'M', email: 'm@x.com' }, mutate), 'disabled');
  assert.equal(await build({ settings: { enabled: false, subject: 's', body: 'b' } }).service.enqueueForKit(ctx, { id: 'kit', officeId: 'office', customerId: 'cust' }, { name: 'M', email: 'm@x.com' }, mutate), 'disabled');
  for (const email of [null, '', 'sem-arroba', 'a@b']) {
    const none = build();
    assert.equal(await none.service.enqueueForKit(ctx, { id: 'kit', officeId: 'office', customerId: 'cust' }, { name: 'M', email }, mutate), 'no_email');
    assert.equal(none.calls.queued.length, 0);
  }
});

void test('envio: kit anexo, registra no historico de cada card do cliente; falha vai para nova tentativa', async () => {
  const ok = build({ claims: 1 });
  await ok.service.sendDue();
  assert.deepEqual(ok.calls.mails.map((mail) => [mail.to, (mail.attachment as { filename: string }).filename]), [['maria@exemplo.com', 'KIT.docx']]);
  assert.equal(ok.calls.sent, 1);
  assert.deepEqual(ok.calls.events, ['card.office_kit_emailed:card-1', 'card.office_kit_emailed:card-2']);

  const failing = build({ claims: 1, mailFails: true });
  await failing.service.sendDue();
  assert.deepEqual([failing.calls.sent, failing.calls.failed, failing.calls.events], [0, ['office_kit_email_failed'], []]);
});
