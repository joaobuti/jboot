import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Client } from 'pg';
import { seedOfficeScenario } from '../../../test/kanban-office-fixture';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { OfficesRepository } from './offices.repository';

const REF = TEST_DATABASE_REF;

/** Erro de SQL esperado dentro da transacao do teste: isola num SAVEPOINT. */
async function rejectsInSavepoint(client: Client, run: () => Promise<unknown>, expected: RegExp | (new (...args: never[]) => Error)) {
  await client.query('SAVEPOINT expected_error');
  await assert.rejects(run(), expected as never);
  await client.query('ROLLBACK TO SAVEPOINT expected_error');
}

void test('escritorios: cria, nome unico entre ativos (sem caixa/espacos), inativa sem apagar, lista com contagens', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: false });
    const repository = new OfficesRepository(db);
    const actor = randomUUID();

    const created = await repository.create(REF, s.clientId, 'Escritorio Centro', actor);
    assert.equal(created.active, true);
    await rejectsInSavepoint(client, () => repository.create(REF, s.clientId, '  escritorio centro ', actor), ConflictException);
    // Outro tenant pode usar o mesmo nome.
    await repository.create(REF, s.otherClientId, 'Escritorio Centro', actor);

    // Primeiro escritorio com principal: nasce principal; principal nao inativa (S1 de flow-offices).
    assert.equal(created.isPrincipal, true);
    await rejectsInSavepoint(client, () => repository.update(REF, s.clientId, created.id, { active: false }), ConflictException);
    const moved = await repository.setPrincipal(REF, s.clientId, s.officeA);
    assert.equal(moved.isPrincipal, true);
    assert.equal((await repository.findById(REF, s.clientId, created.id))?.isPrincipal, false);
    assert.equal((await repository.findPrincipal(REF, s.clientId))?.id, s.officeA);

    const inactive = await repository.update(REF, s.clientId, created.id, { active: false });
    assert.equal(inactive.active, false);
    // Nome volta a ficar livre entre os ativos.
    const again = await repository.create(REF, s.clientId, 'Escritorio Centro', actor);
    await rejectsInSavepoint(client, () => repository.update(REF, s.clientId, again.id, { name: 'Escritorio A' }), ConflictException);
    await assert.rejects(repository.update(REF, s.otherClientId, again.id, { name: 'X' }), /Office not found/);

    const list = await repository.list(REF, s.clientId);
    const a = list.find((office) => office.id === s.officeA);
    assert.deepEqual([a?.userCount, a?.cardCount], [5, 1]);
    assert.equal(list.length, 5);
    assert.equal(await repository.countActive(REF, s.clientId), 3);
    assert.equal((await repository.findById(REF, s.otherClientId, s.officeA)), null, 'escritorio de outro tenant');
    assert.deepEqual(
      (await repository.listByIds(REF, s.clientId, [s.officeB])).map((office) => office.id),
      [s.officeB]
    );
  }));

void test('chave do tenant e estado do usuario: default desligado; liga/desliga preservando quem ligou', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: false });
    await client.query(`DELETE FROM kanban_settings WHERE client_id = $1`, [s.clientId]);
    const repository = new OfficesRepository(db);
    assert.equal(await repository.isOfficeVisibilityEnabled(REF, s.clientId), false);
    assert.deepEqual(await repository.getSettings(REF, s.clientId), {
      officeVisibilityEnabled: false,
      enabledByIdentityId: null,
      enabledAt: null,
      updatedAt: null
    });
    const actor = randomUUID();
    const on = await repository.setOfficeVisibility(REF, s.clientId, true, actor);
    assert.equal(on.officeVisibilityEnabled, true);
    assert.equal(on.enabledByIdentityId, actor);
    const off = await repository.setOfficeVisibility(REF, s.clientId, false, randomUUID());
    assert.equal(off.officeVisibilityEnabled, false);
    assert.equal(off.enabledByIdentityId, actor, 'desligar preserva o registro de quem ligou');

    await repository.setOfficeVisibility(REF, s.clientId, true, actor);
    assert.deepEqual(await repository.loadViewerState(REF, s.clientId, s.users.memberAB), {
      officeVisibilityEnabled: true,
      officeIds: [s.officeA, s.officeB].sort()
    });
    assert.deepEqual(await repository.loadViewerState(REF, s.otherClientId, s.users.memberAB), {
      officeVisibilityEnabled: false,
      officeIds: []
    });
    const links = await repository.listOfficeIdsByIdentity(REF, s.clientId, [s.users.memberA, s.users.noOffice]);
    assert.deepEqual([...links.keys()], [s.users.memberA]);
  }));

void test('troca de escritorio do usuario (P28): sai dos responsaveis dos cards do escritorio que deixou, com system_event', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const repository = new OfficesRepository(db);
    const actor = randomUUID();
    for (const cardId of [s.cardA, s.cardB]) {
      await client.query(
        `INSERT INTO kanban_card_assignees (client_id, card_id, identity_id, assigned_by_identity_id) VALUES ($1, $2, $3, $4)`,
        [s.clientId, cardId, s.users.memberAB, actor]
      );
    }
    const result = await repository.replaceUserOffices(REF, s.clientId, s.users.memberAB, [s.officeB], actor);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.removed, [s.officeA]);
    assert.deepEqual(
      result.removedAssignments.map((row) => [row.cardId, row.cardTitle, row.boardName, row.officeId]),
      [[s.cardA, 'Lead A', 'Leads', s.officeA]]
    );
    const remaining = await client.query(`SELECT card_id FROM kanban_card_assignees WHERE identity_id = $1`, [s.users.memberAB]);
    assert.deepEqual(remaining.rows.map((row) => row.card_id), [s.cardB], 'continua responsavel no escritorio que manteve');
    const event = await client.query(
      `SELECT event_payload FROM kanban_card_activities WHERE card_id = $1 AND event_payload->>'kind' = 'card.assignee_removed'`,
      [s.cardA]
    );
    assert.deepEqual(event.rows[0].event_payload, {
      kind: 'card.assignee_removed',
      identityId: s.users.memberAB,
      reason: 'office_removed',
      officeId: s.officeA
    });

    const back = await repository.replaceUserOffices(REF, s.clientId, s.users.memberAB, [s.officeA, s.officeB], actor);
    assert.deepEqual(back.added, [s.officeA]);
    assert.deepEqual(back.removedAssignments, []);
  }));

void test('atribuicao em lote: so cards sem escritorio do quadro (todos ou ids), system_event por card', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: false });
    const repository = new OfficesRepository(db);
    assert.deepEqual(await repository.countCardsWithoutOfficeByBoard(REF, s.clientId), [
      { boardId: s.boardId, boardName: 'Leads', count: 1 }
    ]);
    assert.deepEqual(await repository.assignCardsWithoutOffice(REF, s.clientId, s.boardId, s.officeB, [s.cardA], randomUUID()), []);
    assert.deepEqual(await repository.assignCardsWithoutOffice(REF, s.clientId, s.boardId, s.officeB, null, randomUUID()), [s.cardNull]);
    const card = await client.query(`SELECT office_id FROM kanban_cards WHERE id = $1`, [s.cardNull]);
    assert.equal(card.rows[0].office_id, s.officeB);
    const event = await client.query(
      `SELECT event_payload FROM kanban_card_activities WHERE card_id = $1 AND event_payload->>'kind' = 'card.office_assigned'`,
      [s.cardNull]
    );
    assert.deepEqual(event.rows[0].event_payload, { kind: 'card.office_assigned', officeId: s.officeB, bulk: true });
    assert.deepEqual(await repository.countCardsWithoutOfficeByBoard(REF, s.clientId), []);
  }));

void test('transferencia: troca o escritorio com system_event; mesmo escritorio nao gera evento; card inexistente = null', () =>
  withTestDatabase(async (db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    const repository = new OfficesRepository(db);
    const actor = randomUUID();
    assert.deepEqual(await repository.transferCard(REF, s.clientId, s.boardId, s.cardA, s.officeB, 'mudanca de carteira', actor), {
      fromOfficeId: s.officeA,
      changed: true
    });
    assert.deepEqual(await repository.transferCard(REF, s.clientId, s.boardId, s.cardA, s.officeB, 'de novo, mesmo', actor), {
      fromOfficeId: s.officeB,
      changed: false
    });
    assert.equal(await repository.transferCard(REF, s.otherClientId, s.boardId, s.cardA, s.officeB, 'outro tenant', actor), null);
    const events = await client.query(
      `SELECT event_payload FROM kanban_card_activities WHERE card_id = $1 AND event_payload->>'kind' = 'card.office_changed'`,
      [s.cardA]
    );
    assert.equal(events.rows.length, 1);
    assert.deepEqual(events.rows[0].event_payload, {
      kind: 'card.office_changed',
      fromOfficeId: s.officeA,
      toOfficeId: s.officeB,
      reason: 'mudanca de carteira'
    });
  }));

void test('defesa no banco: card e vinculo nao apontam para escritorio de outro tenant (FK composta)', () =>
  withTestDatabase(async (_db, client) => {
    const s = await seedOfficeScenario(client, { enabled: true });
    await client.query('SAVEPOINT fk');
    await assert.rejects(client.query(`UPDATE kanban_cards SET office_id = $1 WHERE id = $2`, [randomUUID(), s.cardA]), /foreign key/);
    await client.query('ROLLBACK TO SAVEPOINT fk');
    await assert.rejects(
      client.query(
        `INSERT INTO kanban_user_offices (client_id, identity_id, office_id, created_by_identity_id) VALUES ($1, $2, $3, $2)`,
        [s.otherClientId, randomUUID(), s.officeA]
      ),
      /foreign key/
    );
    await client.query('ROLLBACK TO SAVEPOINT fk');
  }));
