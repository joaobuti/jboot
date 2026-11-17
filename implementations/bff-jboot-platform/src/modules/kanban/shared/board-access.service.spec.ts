import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { keyOffViewer } from '../../../test/kanban-visibility';
import { ForbiddenException } from '@nestjs/common';
import { BoardAccessService } from './board-access.service';

const context = { clientId: 'c1', identityId: 'u1', databaseRef: 'db', applicationId: 'a', roles: [], scopes: [] };

function serviceFor(membership: { role: string; profileId: string | null } | null, canReviewDocuments = false) {
  return new BoardAccessService(
    {} as never,
    { findActiveMembership: async () => membership } as never,
    {} as never,
    {
      findCapability: async () => ({
        canDeleteArchivedCards: false,
        canManageTags: false,
        canManageStatuses: false,
        canReviewDocuments
      })
    } as never,
    {} as never,
    // Sprint 3.5: chave desligada (papel efetivo = membresia).
    { resolve: async () => keyOffViewer('u1', 'c1') } as never
  );
}

void test('matriz de revisao de documentos: board_admin sempre; membro so com perfil revisor; viewer e nao membro nunca', async () => {
  const cases: Array<[string, { role: string; profileId: string | null } | null, boolean, boolean]> = [
    ['board_admin sem perfil', { role: 'board_admin', profileId: null }, false, true],
    ['board_member com perfil revisor', { role: 'board_member', profileId: 'p1' }, true, true],
    ['board_member com perfil comum', { role: 'board_member', profileId: 'p1' }, false, false],
    ['board_member sem perfil', { role: 'board_member', profileId: null }, true, false],
    ['board_viewer com perfil revisor', { role: 'board_viewer', profileId: 'p1' }, true, false],
    ['nao membro / outro tenant', null, true, false]
  ];
  for (const [label, membership, flag, expected] of cases) {
    const service = serviceFor(membership, flag);
    assert.equal(await service.canReviewDocuments(context as never, 'b1'), expected, label);
    if (expected) {
      await service.requireCanReviewDocuments(context as never, 'b1');
    } else {
      await assert.rejects(
        service.requireCanReviewDocuments(context as never, 'b1'),
        (error: ForbiddenException) =>
          error instanceof ForbiddenException && (error.getResponse() as { code: string }).code === 'cannot_review_documents',
        label
      );
    }
  }
});

void test('resolveCapabilities expoe canReviewDocuments (admin true, perfil conforme flag)', async () => {
  assert.equal((await serviceFor({ role: 'board_admin', profileId: null }).resolveCapabilities(context as never, 'b1')).canReviewDocuments, true);
  assert.equal(
    (await serviceFor({ role: 'board_member', profileId: 'p1' }, true).resolveCapabilities(context as never, 'b1')).canReviewDocuments,
    true
  );
  assert.equal((await serviceFor(null).resolveCapabilities(context as never, 'b1')).canReviewDocuments, false);
});

// Sprint 3.5 (P24): `flow:admin` com a visibilidade por escritorio ligada = `board_admin` efetivo.
function serviceWithViewer(
  membership: { role: string; profileId: string | null } | null,
  viewer: { isAdmin: boolean; officeVisibilityEnabled: boolean }
) {
  return new BoardAccessService(
    { findById: async () => ({ id: 'b1', currentUserRole: membership?.role ?? null }) } as never,
    { findActiveMembership: async () => membership } as never,
    {} as never,
    { findCapability: async () => null } as never,
    {} as never,
    { resolve: async () => ({ identityId: 'u1', clientId: 'c1', officeIds: [], ...viewer }) } as never
  );
}

void test('resolveEffectiveRole: flow:admin vira board_admin com a chave ligada ou desligada; demais = membresia', async () => {
  const on = { isAdmin: true, officeVisibilityEnabled: true };
  const off = { isAdmin: true, officeVisibilityEnabled: false };
  assert.deepEqual(await serviceWithViewer(null, on).resolveEffectiveRole(context as never, 'b1'), {
    role: 'board_admin',
    profileId: null
  });
  assert.deepEqual(await serviceWithViewer({ role: 'board_viewer', profileId: 'p1' }, on).resolveEffectiveRole(context as never, 'b1'), {
    role: 'board_admin',
    profileId: 'p1'
  });
  // Regra de 2026-11-11: flow:admin e board_admin em todo board, mesmo com a chave desligada.
  assert.deepEqual(await serviceWithViewer(null, off).resolveEffectiveRole(context as never, 'b1'), { role: 'board_admin', profileId: null });
  assert.deepEqual(await serviceWithViewer({ role: 'board_member', profileId: null }, off).resolveEffectiveRole(context as never, 'b1'), {
    role: 'board_admin',
    profileId: null
  });
  assert.deepEqual(
    await serviceWithViewer({ role: 'board_member', profileId: null }, { isAdmin: false, officeVisibilityEnabled: false }).resolveEffectiveRole(context as never, 'b1'),
    { role: 'board_member', profileId: null }
  );
  assert.equal(await serviceWithViewer(null, { isAdmin: false, officeVisibilityEnabled: true }).resolveEffectiveRole(context as never, 'b1'), null);
});

void test('requireRole/requireMember/capacidades/isEffectiveTenantAdmin seguem o papel efetivo', async () => {
  const admin = serviceWithViewer(null, { isAdmin: true, officeVisibilityEnabled: true });
  assert.equal(await admin.requireRole(context as never, 'b1', ['board_admin']), 'board_admin');
  assert.equal((await admin.requireMember(context as never, 'b1')).role, 'board_admin');
  assert.equal((await admin.resolveCapabilities(context as never, 'b1')).canReviewDocuments, true);
  assert.equal(await admin.isEffectiveTenantAdmin(context as never), true);

  const adminOff = serviceWithViewer(null, { isAdmin: true, officeVisibilityEnabled: false });
  assert.equal(await adminOff.requireRole(context as never, 'b1', ['board_admin']), 'board_admin');
  assert.equal(await adminOff.isEffectiveTenantAdmin(context as never), true);
  const nonMember = serviceWithViewer(null, { isAdmin: false, officeVisibilityEnabled: false });
  await assert.rejects(nonMember.requireRole(context as never, 'b1', ['board_admin']), ForbiddenException);
  await assert.rejects(
    nonMember.requireMember(context as never, 'b1'),
    (error: ForbiddenException) => (error.getResponse() as { code: string }).code === 'board_membership_required'
  );
  assert.equal(await nonMember.isEffectiveTenantAdmin(context as never), false);
});
