import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { DriveConfigurationService } from './drive-configuration.service';

const context = { clientId:'11111111-1111-4111-8111-111111111111',identityId:'22222222-2222-4222-8222-222222222222',databaseRef:'ref',scopes:['flow:admin'] };
const mutate = { ...context, ip:'127.0.0.1', userAgent:'test' };
const connected = { status:'inactive',googleAccountEmail:'cliente@gmail.com',refreshTokenEnc:Buffer.from('enc'),rootFolderId:null,rootFolderName:null,lastErrorCode:null };

function build(overrides: { row?: unknown; oauth?: Record<string, unknown>; saved?: unknown[][]; events?: unknown[][] } = {}) {
  const saved = overrides.saved ?? []; const events = overrides.events ?? [];
  const repository = {
    get: async () => overrides.row === undefined ? connected : overrides.row,
    connect: async (...a: unknown[]) => { saved.push(['connect', ...a]); },
    saveFolder: async (...a: unknown[]) => { saved.push(['saveFolder', ...a]); },
    disconnect: async (...a: unknown[]) => { saved.push(['disconnect', ...a]); }
  };
  const oauth = {
    assertConfigured: () => {}, assertRedirectUri: () => {}, createState: () => 'state', verifyState: () => {},
    authorizationUrl: () => 'https://accounts.google.com/auth', exchangeCode: async () => ({ refreshToken: 'refresh-secret', email: 'cliente@gmail.com' }),
    accessToken: async () => ({ accessToken: 'access', expiresIn: 3000 }), getFolder: async (_t: string, id: string) => ({ id, name: 'Documentos' }),
    revoke: async () => {}, ...overrides.oauth
  };
  const cipher = { encrypt: () => Buffer.from('cipher'), decrypt: () => 'refresh-secret' };
  const audit = { record: async (...a: unknown[]) => { events.push(a); } };
  const config = { flowDrive: { pickerApiKey: 'key', pickerAppId: 'app' } };
  return new DriveConfigurationService(repository as never, oauth as never, cipher as never, audit as never, config as never);
}

void describe('DriveConfigurationService', () => {
  void it('never exposes the token and audits only non-secret metadata', async () => {
    const events: unknown[][] = []; const saved: unknown[][] = [];
    const service = build({ events, saved });
    const result = await service.completeConnect(context as never, { code: 'c', state: 's', redirectUri: 'http://localhost:3002/flow/configuracoes/google-drive' }, mutate as never);
    assert.equal(JSON.stringify(result).includes('refresh'), false);
    assert.equal(JSON.stringify(events).includes('refresh-secret'), false);
    assert.equal(saved[0]?.[0], 'connect');
    assert.equal(result.accountEmail, 'cliente@gmail.com');
  });
  void it('refuses a state that does not belong to the authenticated user', async () => {
    const service = build({ oauth: { verifyState: () => { throw { response: { code: 'drive_state_invalid' } }; } } });
    await assert.rejects(() => service.completeConnect(context as never, { code: 'c', state: 'forged', redirectUri: 'x' }, mutate as never));
  });
  void it('requires a connected account before choosing a folder or enabling', async () => {
    const service = build({ row: null });
    await assert.rejects(() => service.put(context as never, { rootFolderId: 'folder', enabled: true }, mutate as never), /Connect a Google account first/);
    await assert.rejects(() => service.pickerToken(context as never), /Connect a Google account first/);
  });
  void it('cannot enable without a folder', async () => {
    await assert.rejects(() => build().put(context as never, { enabled: true }, mutate as never), /Choose a Drive folder first/);
  });
  void it('stores the folder name returned by Google instead of trusting the browser', async () => {
    const saved: unknown[][] = [];
    await build({ saved }).put(context as never, { rootFolderId: 'folder_1', enabled: true }, mutate as never);
    assert.deepEqual(saved[0]?.slice(-1)[0], { rootFolderId: 'folder_1', rootFolderName: 'Documentos', status: 'active' });
  });
  void it('marks the connection invalid when Google reports a revoked grant', async () => {
    const saved: unknown[][] = [];
    const service = build({ saved, oauth: { accessToken: async () => { throw { response: { code: 'drive_oauth_invalid' } }; } } });
    await assert.rejects(() => service.pickerToken(context as never));
    assert.equal((saved[0]?.slice(-1)[0] as { status: string }).status, 'invalid');
  });
  void it('returns picker credentials without the refresh token', async () => {
    const result = await build().pickerToken(context as never);
    assert.deepEqual(result, { accessToken: 'access', expiresIn: 3000, apiKey: 'key', appId: 'app' });
  });
  void it('revokes at Google and clears the stored connection on disconnect', async () => {
    const saved: unknown[][] = []; let revoked = '';
    await build({ saved, oauth: { revoke: async (t: string) => { revoked = t; } } }).disconnect(context as never, mutate as never);
    assert.equal(revoked, 'refresh-secret'); assert.equal(saved[0]?.[0], 'disconnect');
  });
});
