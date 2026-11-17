import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MailMessage } from '../../shared/mail/mail.service';
import { MailerService } from './mailer.service';

function build() {
  const sent: Array<{ message: MailMessage; kind: string }> = [];
  const mail = { send: async (message: MailMessage, kind: string) => { sent.push({ message, kind }); } };
  return { mailer: new MailerService(mail as never), sent };
}

void test('textos do Flow saem pelo MailService comum', async () => {
  const { mailer, sent } = build();
  await mailer.sendCardStaleNotification({ to: 'a@b.com', recipientName: 'Ana', cardTitle: 'Card', columnName: 'Coluna', daysStale: 3 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message.to, 'a@b.com');
  assert.ok(sent[0].message.html);
  assert.match(sent[0].kind, /automation$/);
});

void test('kit do escritorio vai com anexo e texto escapado no HTML', async () => {
  const { mailer, sent } = build();
  await mailer.sendOfficeKitEmail({ to: 'c@d.com', subject: 'Kit', text: 'Ola <b>\nSegue', attachment: { filename: 'kit.pdf', content: Buffer.from('x') } });
  assert.equal(sent[0].message.attachments?.[0].filename, 'kit.pdf');
  assert.equal(sent[0].message.html, '<p>Ola &lt;b&gt;</p><p>Segue</p>');
  assert.equal(sent[0].kind, 'office-kit');
});

void test('falha no envio sobe para quem chamou (a fila do Flow tenta de novo)', async () => {
  const mailer = new MailerService({ send: async () => { throw new Error('smtp down'); } } as never);
  await assert.rejects(mailer.sendCardStaleNotification({ to: 'a@b.com', recipientName: null, cardTitle: 'C', columnName: 'X', daysStale: 1 }), /smtp down/);
});
