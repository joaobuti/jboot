import { afterEach, describe, it, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import { DriveTokenCipher } from './drive-token-cipher.service';
import { GoogleDriveOAuthService } from './google-drive-oauth.service';

const config = {
  corsOrigins: ['http://localhost:3002'],
  flowDrive: { oauthClientId: 'cid', oauthClientSecret: 'secret', encryptionKey: 'k' }
} as never;
const service = () => new GoogleDriveOAuthService(config, new DriveTokenCipher(config));
const CLIENT = '11111111-1111-4111-8111-111111111111'; const USER = '22222222-2222-4222-8222-222222222222';
const idToken = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

void afterEach(() => mock.restoreAll());
void describe('GoogleDriveOAuthService', () => {
  void it('accepts only the Flow settings page of an allowed origin as redirect', () => {
    const oauth = service();
    oauth.assertRedirectUri('http://localhost:3002/flow/configuracoes/google-drive');
    for (const bad of ['http://evil.test/flow/configuracoes/google-drive', 'http://localhost:3002/outra', 'http://localhost:3002/flow/configuracoes/google-drive?x=1', 'nao-e-url']) {
      assert.throws(() => oauth.assertRedirectUri(bad));
    }
  });
  void it('binds the state to client and user and expires it', () => {
    const oauth = service(); const now = 1_000_000;
    const state = oauth.createState(CLIENT, USER, now);
    oauth.verifyState(state, CLIENT, USER, now + 1000);
    assert.throws(() => oauth.verifyState(state, 'other-client', USER, now + 1000));
    assert.throws(() => oauth.verifyState(state, CLIENT, 'other-user', now + 1000));
    assert.throws(() => oauth.verifyState(state, CLIENT, USER, now + 11 * 60 * 1000));
    assert.throws(() => oauth.verifyState(`${state.split('.')[0]}.forged`, CLIENT, USER, now));
  });
  void it('requests offline drive.file access without broader scopes', () => {
    const url = new URL(service().authorizationUrl('http://localhost:3002/flow/configuracoes/google-drive', 'st'));
    assert.equal(url.searchParams.get('access_type'), 'offline');
    assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file openid email');
  });
  void it('extracts the refresh token and the account e-mail from the code exchange', async () => {
    mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ refresh_token: 'rt', scope: 'openid email https://www.googleapis.com/auth/drive.file', id_token: idToken({ email: 'a@gmail.com' }) }), { status: 200 }));
    assert.deepEqual(await service().exchangeCode('code', 'http://localhost:3002/flow/configuracoes/google-drive'), { refreshToken: 'rt', email: 'a@gmail.com' });
  });
  void it('rejects a consent where the Drive permission was unchecked', async () => {
    mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ refresh_token: 'rt', scope: 'openid email' }), { status: 200 }));
    await assert.rejects(() => service().exchangeCode('code', 'x'), (e: { response?: { code?: string } }) => e.response?.code === 'drive_permission_denied');
  });
  void it('separates a revoked grant from a transient Google outage', async () => {
    mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 400 }));
    await assert.rejects(() => service().accessToken('rt'), (e: { response?: { code?: string } }) => e.response?.code === 'drive_oauth_invalid');
    mock.restoreAll();
    mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 503 }));
    await assert.rejects(() => service().accessToken('rt'), (e: { response?: { code?: string } }) => e.response?.code === 'drive_oauth_unavailable');
  });
  void it('accepts only a live Drive folder', async () => {
    mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ id: 'f', name: 'Docs', mimeType: 'application/vnd.google-apps.folder', trashed: false }), { status: 200 }));
    assert.deepEqual(await service().getFolder('t', 'f'), { id: 'f', name: 'Docs' });
    mock.restoreAll();
    mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ id: 'f', mimeType: 'text/plain' }), { status: 200 }));
    await assert.rejects(() => service().getFolder('t', 'f'), (e: { response?: { code?: string } }) => e.response?.code === 'drive_folder_invalid');
  });
});
