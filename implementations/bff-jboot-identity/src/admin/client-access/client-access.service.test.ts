import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadAdminBundle } from '../shared/admin-bundle';
import { ClientAccessService } from './client-access.service';

test('pacote de admin vem do catalogo; sem catalogo, so o papel de admin (nunca escopos inventados)', async () => {
  const rows = [
    { permission_type: 'role', permission_key: 'board_admin' },
    { permission_type: 'scope', permission_key: 'flow:admin' },
    { permission_type: 'scope', permission_key: 'users:manage' }
  ];
  assert.deepEqual(await loadAdminBundle({ query: async () => ({ rows }) } as never, 'app'), {
    scopes: ['flow:admin', 'users:manage'],
    roles: ['board_admin']
  });
  assert.deepEqual(await loadAdminBundle({ query: async () => ({ rows: [] }) } as never, 'app'), { scopes: [], roles: ['client_admin'] });
});

function build(options: { apps?: string[]; databases?: Array<{ applicationId: string; applicationName: string; current: unknown; canApply: boolean }> } = {}) {
  const grants: string[] = [];
  const bumps: string[] = [];
  const applied: string[] = [];
  const repository = {
    contractedApplications: async () => options.apps ?? ['flow', 'pdv'],
    clientAdmins: async () => ['admin-1', 'admin-2'],
    bundle: async (app: string) => ({ scopes: [`${app}:admin`], roles: ['client_admin'] }),
    grant: async (identityId: string, _client: string, app: string) => { grants.push(`${identityId}:${app}`); },
    bumpPermissionsVersion: async (identityId: string) => { bumps.push(identityId); }
  };
  const databases = {
    listForClient: async () => options.databases ?? [],
    applyForClient: async (_client: string, app: string) => { applied.push(app); }
  };
  const service = new ClientAccessService(
    repository as never,
    databases as never,
    { record: async () => undefined } as never,
    { invalidateClient: async () => 0 } as never
  );
  return { service, grants, bumps, applied };
}

const ctx = { actor: { identityId: 'op', roles: [], scopes: [] } } as never;

test('reaplicar: todo admin do cliente recebe o pacote em todo modulo contratado', async () => {
  const { service, grants, bumps } = build();
  const result = await service.ensureAdminAccess('client', ctx);
  assert.deepEqual(grants.sort(), ['admin-1:flow', 'admin-1:pdv', 'admin-2:flow', 'admin-2:pdv']);
  assert.deepEqual(bumps, ['admin-1', 'admin-2']);
  assert.deepEqual(result, { applications: 2, admins: 2, databasesPending: [] });
});

test('modulo contratado depois: pacote so nele e banco criado pela regra quando falta', async () => {
  const { service, grants, applied } = build({
    databases: [{ applicationId: 'juridico', applicationName: 'Juridico', current: null, canApply: true }]
  });
  await service.ensureAdminAccess('client', ctx, 'juridico');
  assert.deepEqual(grants, ['admin-1:juridico', 'admin-2:juridico']);
  assert.deepEqual(applied, ['juridico']);
  const pending = build({ databases: [{ applicationId: 'flow', applicationName: 'Flow', current: null, canApply: false }] });
  assert.deepEqual((await pending.service.ensureAdminAccess('client', ctx, 'flow')).databasesPending, ['Flow']);
  assert.deepEqual(pending.applied, []);
});
