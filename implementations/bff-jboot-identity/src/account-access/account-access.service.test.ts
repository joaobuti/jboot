import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AccountAccessService, hashToken, RESET_LIMIT_PER_IDENTITY, RESET_LIMIT_PER_IP } from './account-access.service';

type Identity = { id: string; displayName: string; documentType: string; documentNumber: string; email: string | null; status: string };

function build(options: { identity?: Identity | null; mailFails?: boolean; valid?: boolean; consumed?: boolean; recentResets?: number } = {}) {
  const issued: Array<{ tokenHash: string; purpose: string; expiresAt: Date }> = [];
  const sent: Array<{ to: string; text: string; subject: string }> = [];
  const audits: string[] = [];
  const consumed: Array<{ tokenId: string; identityId: string; secretHash: string }> = [];
  const identity = options.identity === undefined
    ? { id: 'id-1', displayName: 'Ana', documentType: 'cpf', documentNumber: '58631488968', email: 'ana@cliente.com', status: 'pending' }
    : options.identity;
  const repository = {
    findIdentity: async () => identity,
    findIdentityByDocument: async (type: string, number: string) => (identity && identity.documentType === type && identity.documentNumber === number ? identity : null),
    issue: async (input: { tokenHash: string; purpose: string; expiresAt: Date; limit?: { max: number } }) => {
      if (input.limit && (options.recentResets ?? 0) >= input.limit.max) return false;
      issued.push(input);
      return true;
    },
    findValid: async (hash: string) => (options.valid === false ? null : {
      tokenId: 'tok-1', purpose: 'invite', identityId: 'id-1', displayName: 'Ana', documentType: 'cpf', documentNumber: '58631488968', identityStatus: 'pending', hash
    }),
    consume: async (tokenId: string, identityId: string, secretHash: string) => { consumed.push({ tokenId, identityId, secretHash }); return options.consumed ?? true; }
  };
  const mail = {
    send: async (message: { to: string; text: string; subject: string }) => {
      if (options.mailFails) throw new Error('smtp down');
      sent.push(message);
    }
  };
  const audit = { record: async (input: { eventType: string }) => { audits.push(input.eventType); } };
  const config = { identityWebUrl: 'http://id.local', inviteTtlHours: 72, passwordResetTtlMinutes: 60 };
  const service = new AccountAccessService(repository as never, mail as never, audit as never, config as never);
  return { service, issued, sent, audits, consumed };
}

test('convite: link de uso unico no e-mail; o banco recebe so o hash; sem senha no texto', async () => {
  const { service, issued, sent, audits } = build();
  assert.deepEqual(await service.sendInvite('id-1', 'actor-1'), { sent: true });
  const token = new URL(sent[0].text.match(/http:\/\/id\.local\/criar-senha\?token=\S+/)?.[0] ?? '').searchParams.get('token') ?? '';
  assert.ok(token.length >= 40);
  assert.equal(issued[0].tokenHash, hashToken(token));
  assert.notEqual(issued[0].tokenHash, token);
  assert.equal(issued[0].purpose, 'invite');
  const hours = (issued[0].expiresAt.getTime() - Date.now()) / 3_600_000;
  assert.ok(hours > 71.9 && hours <= 72);
  assert.equal(sent[0].to, 'ana@cliente.com');
  assert.match(sent[0].text, /Login: 586\.314\.889-68/);
  assert.doesNotMatch(sent[0].text, /senha (inicial|provis)/i);
  assert.deepEqual(audits, ['account_invite_sent']);
});

test('convite so para conta pendente; sem e-mail ou com SMTP fora, avisa sem quebrar', async () => {
  await assert.rejects(build({ identity: { id: 'id-1', displayName: 'A', documentType: 'cpf', documentNumber: '1', email: 'a@b.c', status: 'active' } }).service.sendInvite('id-1'), ConflictException);
  const noEmail = build({ identity: { id: 'id-1', displayName: 'A', documentType: 'cpf', documentNumber: '1', email: null, status: 'pending' } });
  assert.deepEqual(await noEmail.service.sendInvite('id-1'), { sent: false, reason: 'no_email' });
  assert.equal(noEmail.issued.length, 0);
  const smtpDown = build({ mailFails: true });
  assert.deepEqual(await smtpDown.service.sendInvite('id-1'), { sent: false, reason: 'send_failed' });
  assert.deepEqual(smtpDown.audits, ['account_invite_failed']);
  await assert.rejects(build({ identity: null }).service.sendInvite('x'), NotFoundException);
});

test('criar senha: link valido consome com bcrypt; invalido, vencido ou ja usado da 404', async () => {
  const ok = build();
  assert.deepEqual(await ok.service.setPassword('t'.repeat(43), 'senha-forte-1'), { ok: true, purpose: 'invite' });
  assert.ok(await bcrypt.compare('senha-forte-1', ok.consumed[0].secretHash));
  assert.deepEqual(ok.audits, ['password_set']);
  await assert.rejects(build({ valid: false }).service.setPassword('t'.repeat(43), 'senha-forte-1'), NotFoundException);
  await assert.rejects(build({ consumed: false }).service.setPassword('t'.repeat(43), 'senha-forte-1'), NotFoundException);
  await assert.rejects(build({ valid: false }).service.check('t'.repeat(43)), NotFoundException);
  assert.deepEqual(await build().service.check('t'.repeat(43)), { purpose: 'invite', displayName: 'Ana', login: '586.314.889-68' });
});

const active: Identity = { id: 'id-1', displayName: 'Ana', documentType: 'cpf', documentNumber: '58631488968', email: 'ana@cliente.com', status: 'active' };

test('esqueci a senha: link de 1 h para o e-mail do login informado (com ou sem pontuacao)', async () => {
  const { service, issued, sent, audits } = build({ identity: active });
  assert.equal(await service.processPasswordReset('586.314.889-68'), 'sent');
  assert.equal(issued[0].purpose, 'password_reset');
  const minutes = (issued[0].expiresAt.getTime() - Date.now()) / 60_000;
  assert.ok(minutes > 59.9 && minutes <= 60);
  assert.equal(sent[0].to, 'ana@cliente.com');
  assert.match(sent[0].subject, /Redefini/);
  assert.match(sent[0].text, /vale por 1 hora/);
  assert.deepEqual(audits, ['password_reset_sent']);
});

test('esqueci a senha: nada e enviado sem cadastro, sem e-mail, bloqueado, documento invalido ou acima do limite', async () => {
  const cases: Array<[Parameters<typeof build>[0], string]> = [
    [{ identity: null }, '58631488968'],
    [{ identity: { ...active, email: null } }, '58631488968'],
    [{ identity: { ...active, status: 'blocked' } }, '58631488968'],
    [{ identity: active }, '123'],
    [{ identity: active, recentResets: RESET_LIMIT_PER_IDENTITY }, '58631488968']
  ];
  for (const [options, document] of cases) {
    const { service, sent, issued } = build(options);
    assert.equal(await service.processPasswordReset(document), 'skipped');
    assert.equal(sent.length + issued.length, 0);
  }
});

test('esqueci a senha: resposta sempre igual; limite por IP descarta em silencio', async () => {
  const { service } = build({ identity: null });
  const now = Date.now();
  for (let index = 0; index < RESET_LIMIT_PER_IP + 3; index += 1) {
    assert.deepEqual(service.requestPasswordReset('00000000000', '10.0.0.1', now), { accepted: true });
  }
  const limited = service as unknown as { resetRequestsByIp: Map<string, number[]> };
  assert.equal(limited.resetRequestsByIp.get('10.0.0.1')?.length, RESET_LIMIT_PER_IP);
  assert.deepEqual(service.requestPasswordReset('00000000000', '10.0.0.1', now + 3_600_001), { accepted: true });
  assert.equal(limited.resetRequestsByIp.get('10.0.0.1')?.length, 1);
});
