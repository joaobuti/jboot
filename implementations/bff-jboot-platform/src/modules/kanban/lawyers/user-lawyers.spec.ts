import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { UnprocessableEntityException } from '@nestjs/common';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { normalizeLawyerName, normalizeOabNumber } from './lawyer.input';
import { UserLawyersRepository } from './user-lawyers.repository';
import { validLawyer } from './user-lawyers.service';

const code = (expected: string) => (error: UnprocessableEntityException) => (error.getResponse() as { code: string }).code === expected;

void test('OAB: ate 7 digitos e letra final da suplementar; pontos e espacos saem', () => {
  assert.equal(normalizeOabNumber('12.345'), '12345');
  assert.equal(normalizeOabNumber('12345-a'), '12345-A');
  assert.equal(normalizeOabNumber('SC 12345'), null);
  assert.equal(normalizeOabNumber('12345678'), null);
  assert.equal(normalizeLawyerName('  Maria   Souza '), 'Maria Souza');
});

void test('cadastro: uma OAB por UF, numero valido e nome obrigatorio com OAB', () => {
  assert.deepEqual(validLawyer({ signatureName: ' Maria  Souza ', oabs: [{ uf: 'SC', number: '1.234' }, { uf: 'AM', number: '99-a' }] }), {
    signatureName: 'Maria Souza',
    oabs: [{ uf: 'AM', number: '99-A' }, { uf: 'SC', number: '1234' }]
  });
  assert.throws(() => validLawyer({ signatureName: 'Maria', oabs: [{ uf: 'AM', number: 'x' }] }), code('user_lawyer_oab_invalid'));
  assert.throws(
    () => validLawyer({ signatureName: 'Maria', oabs: [{ uf: 'AM', number: '1' }, { uf: 'AM', number: '2' }] }),
    code('user_lawyer_uf_repeated')
  );
  assert.throws(() => validLawyer({ signatureName: '  ', oabs: [{ uf: 'AM', number: '1' }] }), code('user_lawyer_name_required'));
  assert.deepEqual(validLawyer({ signatureName: '', oabs: [] }), { signatureName: '', oabs: [] }, 'sem OAB remove o cadastro');
});

void test('PostgreSQL: quem assina e o responsavel do card com OAB na UF, pela hierarquia', () =>
  withTestDatabase(async (db, client) => {
    const repository = new UserLawyersRepository(db);
    const clientId = randomUUID(), boardId = randomUUID(), columnId = randomUUID(), cardId = randomUUID(), officeId = randomUUID();
    const [responsible, boardAdmin, member, outsider] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await client.query(`INSERT INTO kanban_boards (id,client_id,name,created_by_identity_id) VALUES($1,$2,'Board',$3)`, [boardId, clientId, member]);
    await client.query(`INSERT INTO kanban_board_columns (id,client_id,board_id,name,position) VALUES($1,$2,$3,'Iniciais',0)`, [columnId, clientId, boardId]);
    await client.query(`INSERT INTO kanban_offices (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'Manaus', $3)`, [officeId, clientId, member]);
    await client.query(
      `INSERT INTO kanban_cards (id,client_id,board_id,board_column_id,title,position,created_by_identity_id,office_id) VALUES($1,$2,$3,$4,'Card',0,$5,$6)`,
      [cardId, clientId, boardId, columnId, member, officeId]
    );
    await client.query(`INSERT INTO kanban_board_members (client_id, board_id, identity_id, role) VALUES ($1, $2, $3, 'board_admin')`, [clientId, boardId, boardAdmin]);
    await client.query(
      `INSERT INTO kanban_user_offices (client_id, identity_id, office_id, created_by_identity_id, is_responsible) VALUES ($1, $2, $3, $2, true)`,
      [clientId, responsible, officeId]
    );
    // Ordem de entrada no card: membro, admin do board, responsavel do escritorio.
    for (const [index, identityId] of [member, boardAdmin, responsible].entries()) {
      await client.query(
        `INSERT INTO kanban_card_assignees (client_id, card_id, identity_id, assigned_by_identity_id, created_at)
         VALUES ($1, $2, $3, $3, now() + make_interval(secs => $4))`,
        [clientId, cardId, identityId, index]
      );
    }
    const save = (identityId: string, name: string, oabs: Array<{ uf: 'AM' | 'SC'; number: string }>) =>
      repository.replace(TEST_DATABASE_REF, clientId, identityId, { signatureName: name, oabs }, member);

    await save(member, 'Membro', [{ uf: 'AM', number: '3' }]);
    await save(outsider, 'Fora do card', [{ uf: 'AM', number: '4' }]);
    assert.equal((await repository.signerForCard(TEST_DATABASE_REF, clientId, cardId, 'AM'))?.identityId, member, 'so ha o membro com OAB/AM');

    await save(boardAdmin, 'Admin do Board', [{ uf: 'AM', number: '2' }]);
    assert.equal((await repository.signerForCard(TEST_DATABASE_REF, clientId, cardId, 'AM'))?.identityId, boardAdmin, 'board_admin antes dos demais');

    await save(responsible, 'Responsavel', [{ uf: 'SC', number: '1' }]);
    assert.equal((await repository.signerForCard(TEST_DATABASE_REF, clientId, cardId, 'AM'))?.identityId, boardAdmin, 'responsavel sem OAB/AM e pulado');

    const saved = await save(responsible, 'Responsavel', [{ uf: 'SC', number: '1' }, { uf: 'AM', number: '1-A' }]);
    assert.deepEqual(saved, { identityId: responsible, signatureName: 'Responsavel', oabs: [{ uf: 'AM', number: '1-A' }, { uf: 'SC', number: '1' }] });
    assert.deepEqual(await repository.signerForCard(TEST_DATABASE_REF, clientId, cardId, 'AM'), {
      identityId: responsible, signatureName: 'Responsavel', oabNumber: '1-A', oabUf: 'AM', rank: 0
    });
    assert.equal(await repository.signerForCard(TEST_DATABASE_REF, clientId, cardId, 'RR' as never), null, 'ninguem com OAB na UF');

    await save(responsible, '', []);
    assert.deepEqual(await repository.find(TEST_DATABASE_REF, clientId, responsible), { identityId: responsible, signatureName: null, oabs: [] });
    assert.deepEqual(
      (await repository.summary(TEST_DATABASE_REF, clientId)).sort((a, b) => a.identityId.localeCompare(b.identityId)),
      [boardAdmin, member, outsider].sort().map((identityId) => ({ identityId, ufs: ['AM'] }))
    );
    assert.equal(await repository.signerForCard(TEST_DATABASE_REF, randomUUID(), cardId, 'AM'), null, 'outro tenant');
  }));
