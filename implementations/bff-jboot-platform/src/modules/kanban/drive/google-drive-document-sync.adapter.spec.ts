import { afterEach, describe, it, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import { driveQueryValue, GoogleDriveDocumentSyncAdapter } from './google-drive-document-sync.adapter';

const oauth = { accessToken: async (refreshToken: string) => { assert.equal(refreshToken, 'refresh'); return { accessToken: 'access', expiresIn: 3000 }; } };
const adapter = () => new GoogleDriveDocumentSyncAdapter(oauth as never);
const upload = (overrides: Partial<Parameters<GoogleDriveDocumentSyncAdapter['upload']>[0]> = {}) =>
  adapter().upload({
    refreshToken: 'refresh', rootFolderId: 'root', pathSegments: ['Manaus', '52998224725 - MARIA DA SILVA'],
    fileName: 'cpf-v1.pdf', contentType: 'application/pdf', body: Buffer.from('pdf'),
    checksum: 'a'.repeat(64), idempotencyKey: 'sync-id', remoteFileId: null, ...overrides
  });

/** Drive simulado: pastas e arquivos por (pai, nome); registra o que foi criado e o que foi substituido. */
function fakeDrive(state: { folders?: Array<[string, string, string]>; files?: Array<[string, string, string]>; remote?: Record<string, { parents: string[]; trashed?: boolean }> }) {
  const created: Array<{ name: string; parent: string; folder: boolean }> = [];
  const patched: string[] = [];
  const queries: string[] = [];
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer access');
    if (url.includes('/drive/v3/files?q=')) {
      const query = decodeURIComponent(url.split('q=')[1].split('&')[0]);
      queries.push(url);
      const name = /name='((?:[^'\\]|\\.)*)'/.exec(query)?.[1].replace(/\\(.)/g, '$1');
      const parent = /'([^']+)' in parents/.exec(query)?.[1];
      const pool = query.includes("mimeType='application/vnd.google-apps.folder'") ? state.folders ?? [] : state.files ?? [];
      const ids = pool.filter(([p, n]) => p === parent && n === name).map(([, , id]) => ({ id }));
      return new Response(JSON.stringify({ files: ids }), { status: 200 });
    }
    const remoteMatch = /\/drive\/v3\/files\/([^?]+)\?fields=id,trashed,parents/.exec(url);
    if (remoteMatch) {
      const remote = state.remote?.[decodeURIComponent(remoteMatch[1])];
      return remote ? new Response(JSON.stringify({ id: remoteMatch[1], ...remote }), { status: 200 }) : new Response('', { status: 404 });
    }
    if (url.includes('/drive/v3/files?fields=id') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { name: string; parents: string[] };
      created.push({ name: body.name, parent: body.parents[0], folder: true });
      return new Response(JSON.stringify({ id: `new-${body.name}` }), { status: 200 });
    }
    if (init?.method === 'PATCH') {
      patched.push(/files\/([^?]+)\?/.exec(url)?.[1] ?? '');
      return new Response(JSON.stringify({ id: patched.at(-1), version: '8' }), { status: 200 });
    }
    const parent = (/"parents":\["([^"]+)"\]/.exec(String(init?.body)) ?? [])[1] ?? '';
    const name = (/"name":"([^"]+)"/.exec(String(init?.body)) ?? [])[1] ?? '';
    created.push({ name, parent, folder: false });
    return new Response(JSON.stringify({ id: 'new-file', version: '1' }), { status: 200 });
  });
  return { created, patched, queries };
}

void afterEach(() => mock.restoreAll());
void describe('GoogleDriveDocumentSyncAdapter (nome exato, 2026-10-30)', () => {
  void it('reaproveita a pasta do escritorio e a do cliente com o nome exato; so cria o que falta', async () => {
    const drive = fakeDrive({ folders: [['root', 'Manaus', 'office'], ['office', '52998224725 - MARIA', 'other-customer']] });
    await upload();
    assert.deepEqual(drive.created, [
      { name: '52998224725 - MARIA DA SILVA', parent: 'office', folder: true },
      { name: 'cpf-v1.pdf', parent: 'new-52998224725 - MARIA DA SILVA', folder: false }
    ], 'pasta com nome parecido (mesmo CPF) nao conta: so nome igual');
  });

  void it('com pasta duplicada usa a mais antiga e nao cria outra', async () => {
    const drive = fakeDrive({ folders: [['root', 'Manaus', 'oldest'], ['root', 'Manaus', 'newer'], ['oldest', '52998224725 - MARIA DA SILVA', 'customer']] });
    await upload();
    assert.deepEqual(drive.created, [{ name: 'cpf-v1.pdf', parent: 'customer', folder: false }]);
    assert.ok(drive.queries.every((url) => url.includes('orderBy=createdTime')), 'busca ordena pela criacao');
  });

  void it('arquivo com o mesmo nome na pasta e substituido; nome diferente cria arquivo novo', async () => {
    const same = fakeDrive({
      folders: [['root', 'Manaus', 'office'], ['office', '52998224725 - MARIA DA SILVA', 'customer']],
      files: [['customer', 'cpf-v1.pdf', 'existing-file'], ['customer', 'rg-v1.pdf', 'other-file']]
    });
    assert.deepEqual(await upload(), { remoteFileId: 'existing-file', remoteVersion: '8' });
    assert.deepEqual([same.patched, same.created], [['existing-file'], []]);
    mock.restoreAll();

    const different = fakeDrive({
      folders: [['root', 'Manaus', 'office'], ['office', '52998224725 - MARIA DA SILVA', 'customer']],
      files: [['customer', 'cpf-v1.pdf', 'existing-file']]
    });
    await upload({ fileName: 'cpf-v2.pdf' });
    assert.deepEqual([different.patched, different.created], [[], [{ name: 'cpf-v2.pdf', parent: 'customer', folder: false }]]);
  });

  void it('arquivo ja conhecido so e atualizado se continua na pasta; apagado ou movido cai na regra do nome', async () => {
    const folders: Array<[string, string, string]> = [['root', 'Manaus', 'office'], ['office', '52998224725 - MARIA DA SILVA', 'customer']];
    const kept = fakeDrive({ folders, remote: { known: { parents: ['customer'] } } });
    await upload({ remoteFileId: 'known', fileName: 'Inicial_JEC_PAN_Maria.docx' });
    assert.deepEqual(kept.patched, ['known']);
    mock.restoreAll();

    const trashed = fakeDrive({ folders, remote: { known: { parents: ['customer'], trashed: true } } });
    await upload({ remoteFileId: 'known', fileName: 'Inicial_JEC_PAN_Maria.docx' });
    assert.deepEqual([trashed.patched, trashed.created.map((item) => item.name)], [[], ['Inicial_JEC_PAN_Maria.docx']]);
  });

  void it('nome com aspa ou barra invertida continua exato na consulta', () => {
    assert.equal(driveQueryValue("D'Avila"), "D\\'Avila");
    assert.equal(driveQueryValue('a\\b'), 'a\\\\b');
  });

  void it('inspects checksum metadata and treats a missing remote file as drift', async () => {
    let missing = false;
    mock.method(globalThis, 'fetch', async () => missing
      ? new Response('', { status: 404 })
      : new Response(JSON.stringify({ appProperties: { jbootChecksum: 'checksum' } }), { status: 200 }));
    assert.deepEqual(await adapter().inspect({ refreshToken: 'refresh', remoteFileId: 'remote' }), { checksum: 'checksum' });
    missing = true;
    assert.equal(await adapter().inspect({ refreshToken: 'refresh', remoteFileId: 'remote' }), null);
  });
});
