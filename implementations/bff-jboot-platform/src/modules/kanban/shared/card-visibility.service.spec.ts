import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { HttpException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { OfficeScenario, scenarioContext, seedOfficeScenario, setOfficeVisibility } from '../../../test/kanban-office-fixture';
import { buildRealVisibility, fakeAdminDirectory } from '../../../test/kanban-visibility';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { PublishPlatformNotificationInput } from '../../notifications/notifications.types';
import { ActivitiesRepository } from '../activities/activities.repository';
import { AssigneesRepository } from '../assignees/assignees.repository';
import { AutomationWorker } from '../automation/automation-worker.service';
import { CardsService } from '../cards/cards.service';
import { ColumnsRepository } from '../columns/columns.repository';
import { CardCustomersRepository } from '../customers/card-customers.repository';
import { CardDocumentsRepository } from '../documents/card-documents.repository';
import { ChecklistGateService } from '../documents/checklist-gate.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TagsRepository } from '../tags/tags.repository';

const REF = TEST_DATABASE_REF;

function stack(db: DatabaseService, s: OfficeScenario) {
  return buildRealVisibility(db, fakeAdminDirectory([s.users.admin]));
}

void test('identitiesWhoSeeCard: chave desligada devolve todos; ligada filtra por membresia e escritorio; admin pelo diretorio', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: false });
    const { visibility } = stack(db, s);
    const everyone = Object.values(s.users);
    assert.deepEqual(await visibility.identitiesWhoSeeCard(REF, s.clientId, s.boardId, s.cardA, everyone), everyone);

    await setOfficeVisibility(client, s.clientId, true);
    assert.deepEqual(
      await visibility.identitiesWhoSeeCard(REF, s.clientId, s.boardId, s.cardA, everyone),
      [s.users.admin, s.users.memberA, s.users.memberAB, s.users.boardAdminA],
      'admin (nao membro), A, A+B e board_admin de A; nunca B, sem escritorio, inativo ou nao membro'
    );
    assert.deepEqual(await visibility.identitiesWhoSeeCard(REF, s.clientId, s.boardId, s.cardNull, everyone), [s.users.admin]);
    assert.deepEqual(await visibility.identitiesWhoSeeCard(REF, s.clientId, s.boardId, randomUUID(), everyone), []);
    assert.deepEqual(await visibility.identitiesWhoSeeCard(REF, s.clientId, s.boardId, s.cardA, []), []);
  }));

void test('requireVisibleCard: card visivel volta; outro escritorio e inexistente = 404 identico (sem revelar existencia)', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { visibility } = stack(db, s);
    const card = await visibility.requireVisibleCard(scenarioContext(s, 'memberB'), s.boardId, s.cardB);
    assert.equal(card.officeId, s.officeB);
    const hidden = await visibility.requireVisibleCard(scenarioContext(s, 'memberB'), s.boardId, s.cardA).catch((error: Error) => error);
    const missing = await visibility.requireVisibleCard(scenarioContext(s, 'memberB'), s.boardId, randomUUID()).catch((error: Error) => error);
    assert.ok(hidden instanceof NotFoundException && missing instanceof NotFoundException);
    assert.deepEqual((hidden as HttpException).getResponse(), (missing as HttpException).getResponse());
  }));

void test('membros: filterActiveMemberIds e listActiveMembers so membresia ativa do quadro', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { members } = stack(db, s);
    const active = await members.filterActiveMemberIds(REF, s.clientId, s.boardId, [s.users.memberA, s.users.inactiveA, s.users.outsiderA]);
    assert.deepEqual([...active], [s.users.memberA]);
    assert.deepEqual([...(await members.filterActiveMemberIds(REF, s.clientId, s.boardId, []))], []);
    const listed = await members.listActiveMembers(REF, s.clientId, s.boardId);
    assert.equal(listed.length, 7, 'owner, A, B, A+B, sem escritorio, so-inativo, board_admin A');
    assert.equal(listed.some((member) => member.identityId === s.users.inactiveA), false);
  }));

void test('isCrossOfficeLink: cliente com card so em outro escritorio = true; com card no escritorio ou sem card = false', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const repository = new CardCustomersRepository(db);
    const customer = randomUUID();
    await client.query(
      `INSERT INTO kanban_card_customers (card_id, client_id, customer_id, created_by_identity_id) VALUES ($1, $2, $3, $4)`,
      [s.cardA, s.clientId, customer, s.users.memberA]
    );
    assert.equal(await repository.isCrossOfficeLink(REF, s.clientId, customer, s.officeB, s.cardB), true);
    assert.equal(await repository.isCrossOfficeLink(REF, s.clientId, customer, s.officeA, s.cardNull), false);
    assert.equal(await repository.isCrossOfficeLink(REF, s.clientId, randomUUID(), s.officeB, s.cardB), false);
    assert.equal(await repository.isCrossOfficeLink(REF, s.clientId, customer, s.officeB, s.cardA), false, 'o proprio card nao conta');
  }));

void test('notificacao in-app: so destinatario que ve o card no envio; outro escritorio ignorado sem erro; chave desligada inalterada', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { visibility } = stack(db, s);
    const published: PublishPlatformNotificationInput[] = [];
    const notifications = new NotificationsService({ publish: async (input: PublishPlatformNotificationInput) => void published.push(input) } as never, visibility);
    const notify = (recipientIdentityId: string) =>
      notifications.notify(scenarioContext(s, 'memberA'), {
        boardId: s.boardId,
        cardId: s.cardA,
        recipientIdentityId,
        actorIdentityId: s.users.memberA,
        kind: 'card.commented',
        payload: {}
      });
    for (const recipient of [s.users.memberB, s.users.noOffice, s.users.memberAB, s.users.admin]) {
      await notify(recipient);
    }
    assert.deepEqual(published.map((input) => input.recipientIdentityId), [s.users.memberAB, s.users.admin]);

    await setOfficeVisibility(client, s.clientId, false);
    published.length = 0;
    await notify(s.users.memberB);
    assert.deepEqual(published.map((input) => input.recipientIdentityId), [s.users.memberB]);
  }));

void test('e-mail da automacao: destinatario fixo de outro escritorio e ignorado sem erro', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { visibility } = stack(db, s);
    const asked: string[][] = [];
    const worker = new AutomationWorker(
      {} as never,
      {
        queryIdentity: async (_sql: string, [ids]: [string[]]) => ({
          rows: ids.map((id) => ({ id, displayName: 'Pessoa', email: `${id}@example.test` }))
        })
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { list: async () => [{ identityId: s.users.memberA }, { identityId: s.users.memberB }] } as never,
      {} as never,
      {} as never,
      {
        identitiesWhoSeeCard: async (...args: [string, string, string, string, string[]]) => {
          asked.push(args[4]);
          return visibility.identitiesWhoSeeCard(...args);
        }
      } as never,
      { process: async () => undefined } as never,
      { recoverAndEnqueue: async () => undefined } as never,
      { recoverAndEnqueue: async () => undefined } as never,
      { record: () => undefined } as never,
    );
    const resolve = (recipientRole: string, actionConfig: Record<string, unknown> = {}) =>
      (worker as unknown as { resolveRecipients(p: unknown): Promise<Array<{ identityId: string }>> }).resolveRecipients({
        databaseRef: REF,
        clientId: s.clientId,
        boardId: s.boardId,
        cardId: s.cardA,
        recipientRole,
        actionConfig
      });
    assert.deepEqual((await resolve('assignee')).map((row) => row.identityId), [s.users.memberA]);
    assert.deepEqual(await resolve('board_member', { boardMemberIdentityId: s.users.memberB }), []);
    assert.deepEqual(asked, [[s.users.memberA, s.users.memberB], [s.users.memberB]]);
  }));

void test('criacao de card: escritorio gravado (automatico, escolhido, admin); sem escritorio 403; importacao segue a regra', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const { access, visibility, officePolicy, cards, leads, leadLock } = stack(db, s);
    const cardDocuments = new CardDocumentsRepository(db);
    const service = new CardsService(
      cards,
      new ColumnsRepository(db),
      new ActivitiesRepository(db),
      new TagsRepository(db),
      {} as never,
      access,
      { record: async () => undefined } as never,
      new AssigneesRepository(db),
      { recordForActivity: async () => undefined } as never,
      {} as never,
      new ChecklistGateService(cardDocuments),
      cardDocuments,
      visibility,
      officePolicy,
      leads,
      leadLock,
      { assertCanEnterColumn: async () => undefined, cardIdsWithoutHisconForBoard: async () => new Set<string>(), cardIdsWithSignedKitPendingForBoard: async () => new Set<string>() } as never
    );
    const create = (user: 'memberA' | 'memberAB' | 'noOffice' | 'admin', officeId?: string) =>
      service.create(
        scenarioContext(s, user),
        s.boardId,
        { boardColumnId: s.columnId, title: 'Novo lead', officeId },
        { ...scenarioContext(s, user) }
      );
    const code = (error: unknown) => ((error as HttpException).getResponse() as { code?: string }).code;

    assert.equal((await create('memberA')).officeId, s.officeA);
    assert.equal((await create('memberAB', s.officeB)).officeId, s.officeB);
    assert.equal((await create('admin', s.officeB)).officeId, s.officeB, 'admin nao membro cria em qualquer escritorio ativo');
    // Varios escritorios sem escolha: escritorio ativo (flow-offices-sprints.md, S2), sem preferencia o primeiro por nome.
    assert.equal((await create('memberAB')).officeId, s.officeA);
    await assert.rejects(create('noOffice'), (error) => code(error) === 'user_without_office');

    const imported = await service.createInDefaultColumnFromSource(
      scenarioContext(s, 'memberA'),
      s.boardId,
      { title: 'Processo', sourceModule: 'juridico', sourceType: 'datajud', sourceId: randomUUID(), sourcePayload: {} },
      { ...scenarioContext(s, 'memberA') }
    );
    assert.equal(imported.card.officeId, s.officeA);
    // Varios escritorios: a importacao vai para o escritorio ativo (flow-offices-sprints.md, S2).
    const importedAB = await service.createInDefaultColumnFromSource(
      scenarioContext(s, 'memberAB'),
      s.boardId,
      { title: 'Processo', sourceModule: 'juridico', sourceType: 'datajud', sourceId: randomUUID(), sourcePayload: {} },
      { ...scenarioContext(s, 'memberAB') }
    );
    assert.equal(importedAB.card.officeId, s.officeA);

    await setOfficeVisibility(client, s.clientId, false);
    assert.equal((await create('noOffice', s.officeB)).officeId, null, 'chave desligada: officeId ignorado, comportamento anterior');
  }));
