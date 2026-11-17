import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { HttpException, UnprocessableEntityException } from '@nestjs/common';
import { OfficeScenario, ScenarioUser, scenarioContext, seedOfficeScenario } from '../../../test/kanban-office-fixture';
import { buildRealVisibility, fakeAdminDirectory } from '../../../test/kanban-visibility';
import { withTestDatabase } from '../../../test/with-test-database';
import { DatabaseService } from '../../../database/database.service';
import { officePlace, OfficesService } from './offices.service';
import { ActiveOfficeService } from './active-office.service';

const code = (error: unknown) => ((error as HttpException).getResponse() as { code?: string }).code;

function build(db: DatabaseService, s: OfficeScenario) {
  const directory = fakeAdminDirectory(
    [s.users.admin],
    Object.entries(s.users).map(([name, identityId]) => ({ identityId, displayName: name }))
  );
  const { access, visibility, offices, officePolicy, viewers } = buildRealVisibility(db, directory);
  const audits: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const granted: Array<{ identityId: string; scopes: string[] }> = [];
  const identity = { grantModuleScopes: async (_auth: string, identityId: string, scopes: string[]) => { granted.push({ identityId, scopes }); } };
  const audit = {
    record: async (type: string, _m: unknown, _b: unknown, payload: Record<string, unknown>) => {
      audits.push({ type, payload });
    }
  };
  return { service: new OfficesService(offices, access, visibility, directory, audit as never, new ActiveOfficeService(viewers, offices), identity as never), audits, officePolicy, granted };
}

const ctx = (s: OfficeScenario, user: ScenarioUser) => scenarioContext(s, user);
const mut = (s: OfficeScenario, user: ScenarioUser) => ({ ...scenarioContext(s, user), ip: '127.0.0.1' });

void test('contexto de escritorio: admin recebe todos; operador so os seus; sem escritorio vazio', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { service } = build(db, s);
    const admin = await service.context(ctx(s, 'admin'));
    assert.equal(admin.isAdmin, true);
    assert.equal(admin.officeVisibilityEnabled, true);
    assert.deepEqual(admin.offices.map((office) => office.id).sort(), [s.officeA, s.officeB, s.officeInactive].sort());
    const ab = await service.context(ctx(s, 'memberAB'));
    assert.deepEqual(ab.offices.map((office) => office.id).sort(), [s.officeA, s.officeB].sort());
    assert.deepEqual(ab.userOfficeIds, [s.officeA, s.officeB].sort());
    assert.deepEqual((await service.context(ctx(s, 'noOffice'))).offices, []);
  }));

void test('contexto de cadastro: manager escolhe escritorios ativos (varios so com flow:admin); delegado usa o escritorio ativo', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { service } = build(db, s);
    const manager = { ...ctx(s, 'admin'), scopes: ['users:manage'] };
    const selectable = await service.userManagementContext(manager);
    assert.equal(selectable.officeAssignmentMode, 'selectable');
    assert.equal(selectable.multipleOffices, false, 'users:manage sem flow:admin escolhe um');
    assert.equal((await service.userManagementContext({ ...manager, scopes: ['users:manage', 'flow:admin'] })).multipleOffices, true);
    assert.deepEqual(selectable.offices.map(office => office.id).sort(), [s.officeA, s.officeB].sort());

    const delegated = { ...ctx(s, 'memberAB'), scopes: ['flow:users:manage'] };
    const inherited = await service.userManagementContext(delegated);
    assert.equal(inherited.officeAssignmentMode, 'inherited');
    // So o escritorio ativo (sem escolha: o primeiro por nome, "Escritorio A").
    assert.deepEqual(inherited.offices.map(office => office.id), [s.officeA]);

    const withoutOffice = { ...ctx(s, 'noOffice'), scopes: ['flow:users:manage'] };
    await assert.rejects(
      service.userManagementContext(withoutOffice),
      error => code(error) === 'actor_without_active_office'
    );
  }));

void test('administracao exige flow:admin no servico (defesa alem do ScopeGuard)', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { service } = build(db, s);
    const operator = ctx(s, 'boardAdminA');
    const calls: Array<() => Promise<unknown>> = [
      () => service.list(operator),
      () => service.create(operator, { name: 'X' }, mut(s, 'boardAdminA')),
      () => service.update(operator, s.officeA, { active: false }, mut(s, 'boardAdminA')),
      () => service.listUsers(operator),
      () => service.replaceUserOffices(operator, s.users.memberA, { officeIds: [] }, mut(s, 'boardAdminA')),
      () => service.getSettings(operator),
      () => service.updateSettings(operator, { officeVisibilityEnabled: false }, mut(s, 'boardAdminA')),
      () => service.assignBoardCards(operator, s.boardId, { officeId: s.officeA }, mut(s, 'boardAdminA')),
      () => service.transferCard(operator, s.boardId, s.cardA, { officeId: s.officeB, reason: 'motivo do teste' }, mut(s, 'boardAdminA'))
    ];
    for (const call of calls) {
      await assert.rejects(call(), (error) => code(error) === 'office_admin_required');
    }
  }));

void test('CRUD e usuarios: cria/inativa com auditoria; lista usuarios do Flow com seus escritorios', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { service, audits } = build(db, s);
    const office = await service.create(ctx(s, 'admin'), { name: 'Escritorio Norte' }, mut(s, 'admin'));
    // Nasceu principal (o cenario nao tinha principal): marca outro antes de inativar.
    assert.equal(office.isPrincipal, true);
    await service.update(ctx(s, 'admin'), s.officeA, { isPrincipal: true }, mut(s, 'admin'));
    await service.update(ctx(s, 'admin'), office.id, { active: false }, mut(s, 'admin'));
    assert.deepEqual(audits.map((entry) => entry.type), ['kanban_office_created', 'kanban_office_updated', 'kanban_office_updated']);
    assert.equal((await service.list(ctx(s, 'admin'))).data.length, 4);
    const users = (await service.listUsers(ctx(s, 'admin'))).data;
    assert.deepEqual(users.find((user) => user.identityId === s.users.memberAB)?.officeIds, [s.officeA, s.officeB].sort());
    assert.equal(users.find((user) => user.identityId === s.users.admin)?.isAdmin, true);
  }));

void test('vinculo de usuario: so usuario do Flow; vinculo novo so com escritorio ativo; mantem inativo existente; devolve cards afetados', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { service, audits } = build(db, s);
    const admin = ctx(s, 'admin');
    await assert.rejects(
      service.replaceUserOffices(admin, randomUUID(), { officeIds: [] }, mut(s, 'admin')),
      (error) => code(error) === 'flow_user_not_found'
    );
    await assert.rejects(
      service.replaceUserOffices(admin, s.users.memberA, { officeIds: [s.officeInactive] }, mut(s, 'admin')),
      (error) => code(error) === 'office_not_allowed'
    );
    await assert.rejects(
      service.replaceUserOffices(admin, s.users.memberA, { officeIds: [randomUUID()] }, mut(s, 'admin')),
      (error) => code(error) === 'office_not_allowed'
    );
    const kept = await service.replaceUserOffices(admin, s.users.onlyInactiveOffice, { officeIds: [s.officeInactive, s.officeB] }, mut(s, 'admin'));
    assert.deepEqual(kept.added, [s.officeB]);

    await client.query(
      `INSERT INTO kanban_card_assignees (client_id, card_id, identity_id, assigned_by_identity_id) VALUES ($1, $2, $3, $3)`,
      [s.clientId, s.cardA, s.users.memberA]
    );
    const moved = await service.replaceUserOffices(admin, s.users.memberA, { officeIds: [s.officeB] }, mut(s, 'admin'));
    assert.deepEqual(moved.removedAssignments.map((row) => row.cardId), [s.cardA]);
    const audit = audits.find((entry) => entry.type === 'kanban_user_offices_changed' && entry.payload.identityId === s.users.memberA);
    assert.deepEqual(audit?.payload, { identityId: s.users.memberA, added: [s.officeB], removed: [s.officeA], removedAssignmentCardIds: [s.cardA] });
  }));

void test('ativacao: pre-visualizacao (cards e usuarios sem escritorio), exige escritorio ativo, liga/desliga com auditoria', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: false });
    const { service, audits } = build(db, s);
    const admin = ctx(s, 'admin');
    const preview = await service.getSettings(admin);
    assert.equal(preview.officeVisibilityEnabled, false);
    assert.equal(preview.activeOfficeCount, 2);
    assert.deepEqual(preview.cardsWithoutOffice, { total: 1, byBoard: [{ boardId: s.boardId, boardName: 'Leads', count: 1 }] });
    assert.deepEqual(preview.usersWithoutOffice.map((user) => user.identityId), [s.users.noOffice], 'admin sem escritorio nao entra');

    const on = await service.updateSettings(admin, { officeVisibilityEnabled: true }, mut(s, 'admin'));
    assert.equal(on.officeVisibilityEnabled, true);
    await service.updateSettings(admin, { officeVisibilityEnabled: false }, mut(s, 'admin'));
    assert.deepEqual(
      audits.map((entry) => entry.type),
      ['kanban_office_visibility_enabled', 'kanban_office_visibility_disabled']
    );
    assert.deepEqual(audits[0].payload, { cardsWithoutOffice: 1, usersWithoutOffice: 1 });

    await client.query(`UPDATE kanban_offices SET active = false WHERE client_id = $1`, [s.clientId]);
    await assert.rejects(
      service.updateSettings(admin, { officeVisibilityEnabled: true }, mut(s, 'admin')),
      (error) => code(error) === 'no_active_office'
    );
  }));

void test('lote e transferencia: escritorio destino ativo; transferencia sem mudanca nao audita', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { service, audits } = build(db, s);
    const admin = ctx(s, 'admin');
    await assert.rejects(
      service.assignBoardCards(admin, s.boardId, { officeId: s.officeInactive }, mut(s, 'admin')),
      (error) => code(error) === 'office_not_allowed'
    );
    assert.deepEqual(await service.assignBoardCards(admin, s.boardId, { officeId: s.officeA }, mut(s, 'admin')), {
      updated: 1,
      cardIds: [s.cardNull]
    });
    await assert.rejects(
      service.transferCard(admin, s.boardId, s.cardA, { officeId: s.officeInactive, reason: 'motivo do teste' }, mut(s, 'admin')),
      (error) => code(error) === 'office_not_allowed'
    );
    assert.deepEqual(
      await service.transferCard(admin, s.boardId, s.cardA, { officeId: s.officeB, reason: 'motivo do teste' }, mut(s, 'admin')),
      { cardId: s.cardA, fromOfficeId: s.officeA, officeId: s.officeB, changed: true }
    );
    assert.equal(
      (await service.transferCard(admin, s.boardId, s.cardA, { officeId: s.officeB, reason: 'motivo do teste' }, mut(s, 'admin'))).changed,
      false
    );
    assert.deepEqual(
      audits.map((entry) => entry.type),
      ['kanban_cards_office_assigned', 'kanban_card_office_changed']
    );
  }));

void test('escritorio do card novo (CardOfficePolicy): chave, admin, um/varios/nenhum escritorio, escritorio inativo', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { officePolicy } = build(db, s);
    const resolve = async (user: ScenarioUser, officeId?: string) => {
      try {
        return await officePolicy.resolveForNewCard(ctx(s, user), officeId);
      } catch (error) {
        return code(error);
      }
    };
    assert.equal(await resolve('admin'), 'office_required');
    assert.equal(await resolve('admin', s.officeInactive), 'office_not_allowed');
    assert.equal(await resolve('admin', randomUUID()), 'office_not_allowed');
    assert.equal(await resolve('admin', s.officeB), s.officeB);
    assert.equal(await resolve('memberA'), s.officeA, 'um escritorio: automatico');
    assert.equal(await resolve('memberA', s.officeB), 'office_not_allowed');
    // Varios escritorios sem escolha: escritorio ativo (S2) — sem preferencia, o primeiro por nome.
    assert.equal(await resolve('memberAB'), s.officeA);
    assert.equal(await resolve('memberAB', s.officeB), s.officeB);
    assert.equal(await resolve('noOffice'), 'user_without_office');
    assert.equal(await resolve('onlyInactiveOffice'), 'user_without_office');

    await client.query(`UPDATE kanban_settings SET office_visibility_enabled = false WHERE client_id = $1`, [s.clientId]);
    assert.equal(await officePolicy.resolveForNewCard({ ...ctx(s, 'noOffice') }, s.officeB), null, 'chave desligada: sem escritorio');
  }));

void test('responsavel do escritorio (ADR 018): so onde e vinculado; ausente mantem; lista devolve', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { service, audits } = build(db, s);
    const admin = ctx(s, 'admin');
    await assert.rejects(
      service.replaceUserOffices(admin, s.users.memberA, { officeIds: [s.officeA], responsibleOfficeIds: [s.officeB] }, mut(s, 'admin')),
      (error) => code(error) === 'responsible_office_not_linked'
    );
    await service.replaceUserOffices(admin, s.users.memberAB, { officeIds: [s.officeA, s.officeB], responsibleOfficeIds: [s.officeA] }, mut(s, 'admin'));
    const responsibleOf = async () =>
      (await service.listUsers(admin)).data.find((user) => user.identityId === s.users.memberAB)?.responsibleOfficeIds;
    assert.deepEqual(await responsibleOf(), [s.officeA]);
    assert.deepEqual(audits.at(-1)?.payload.responsibleOfficeIds, [s.officeA]);

    await service.replaceUserOffices(admin, s.users.memberAB, { officeIds: [s.officeA, s.officeB] }, mut(s, 'admin'));
    assert.deepEqual(await responsibleOf(), [s.officeA], 'sem responsibleOfficeIds mantem a marcacao');
    await service.replaceUserOffices(admin, s.users.memberAB, { officeIds: [s.officeB], responsibleOfficeIds: [] }, mut(s, 'admin'));
    assert.deepEqual(await responsibleOf(), []);
  }));

void test('cidade e UF do escritorio (local do fecho, S7): os dois juntos, nenhum, ou ausentes mantem', () => {
  assert.equal(officePlace({}), undefined);
  assert.deepEqual(officePlace({ city: '  Manaus  ', uf: 'AM' }), { city: 'Manaus', uf: 'AM' });
  assert.equal(officePlace({ city: ' ', uf: null }), null);
  assert.throws(() => officePlace({ city: 'Manaus', uf: null }), UnprocessableEntityException);
  assert.throws(() => officePlace({ uf: 'AM' }), UnprocessableEntityException);
});

void test('marcar responsavel concede as permissoes de IA no Identity; sem marcacao, nada (S4)', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { service, granted } = build(db, s);
    const admin = ctx(s, 'admin');
    const plain = await service.replaceUserOffices(admin, s.users.memberB, { officeIds: [s.officeB] }, mut(s, 'admin'), 'Bearer t');
    assert.equal(plain.aiPermissionsGranted, null);
    const marked = await service.replaceUserOffices(admin, s.users.memberB, { officeIds: [s.officeB], responsibleOfficeIds: [s.officeB] }, mut(s, 'admin'), 'Bearer t');
    assert.equal(marked.aiPermissionsGranted, true);
    assert.deepEqual(granted, [{ identityId: s.users.memberB, scopes: ['ai:agents:read', 'ai:agents:manage'] }]);
  }));
