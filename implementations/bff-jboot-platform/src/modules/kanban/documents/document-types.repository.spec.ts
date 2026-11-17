import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { TEST_DATABASE_REF, withTestDatabase } from '../../../test/with-test-database';
import { ColumnsRepository } from '../columns/columns.repository';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { DocumentTypesRepository } from './document-types.repository';
import { INITIAL_DOCUMENT_TYPES } from './initial-document-types';

async function createBoard(client: Client, clientId: string): Promise<string> {
  const boardId = randomUUID();
  await client.query(`INSERT INTO kanban_boards (id, client_id, name, created_by_identity_id) VALUES ($1, $2, 'B', $3)`, [
    boardId,
    clientId,
    randomUUID()
  ]);
  return boardId;
}

/** Erro de constraint aborta a transacao do teste; o savepoint isola so a tentativa. */
async function inSavepoint<T>(client: Client, run: () => Promise<T>): Promise<T> {
  await client.query('SAVEPOINT attempt');
  try {
    const result = await run();
    await client.query('RELEASE SAVEPOINT attempt');
    return result;
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT attempt');
    throw error;
  }
}

void test('tipos: cria no fim da lista, atualiza, desativa e recusa nome ativo duplicado (sem caixa/espacos)', () =>
  withTestDatabase(async (db, client) => {
    const repository = new DocumentTypesRepository(db);
    const clientId = randomUUID();
    const boardId = await createBoard(client, clientId);

    const first = await repository.create(TEST_DATABASE_REF, clientId, boardId, { name: 'Procuracao' });
    const second = await repository.create(TEST_DATABASE_REF, clientId, boardId, { name: 'RG', required: false });
    assert.equal(first.sortOrder, 0);
    assert.equal(first.required, true, 'default obrigatorio');
    assert.equal(second.sortOrder, 1);
    assert.equal(second.required, false);

    await assert.rejects(
      () => inSavepoint(client, () => repository.create(TEST_DATABASE_REF, clientId, boardId, { name: '  procuracao ' })),
      (error: { getStatus: () => number; getResponse: () => { code: string } }) =>
        error.getStatus() === 409 && error.getResponse().code === 'document_type_name_taken'
    );

    const deactivated = await repository.update(TEST_DATABASE_REF, clientId, boardId, first.id, { active: false });
    assert.equal(deactivated?.active, false);
    // Nome liberado so entre os ATIVOS: recriar e permitido; reativar o antigo colide.
    const recreated = await repository.create(TEST_DATABASE_REF, clientId, boardId, { name: 'Procuracao' });
    await assert.rejects(
      () => inSavepoint(client, () => repository.update(TEST_DATABASE_REF, clientId, boardId, first.id, { active: true })),
      (error: { getResponse: () => { code: string } }) => error.getResponse().code === 'document_type_name_taken'
    );

    const list = await repository.list(TEST_DATABASE_REF, clientId, boardId);
    assert.deepEqual(
      list.map((type) => [type.name, type.active]),
      [
        ['RG', true],
        ['Procuracao', true],
        ['Procuracao', false]
      ]
    );
    assert.equal(list[1].id, recreated.id);

    // Outro tenant nao le nem altera.
    assert.deepEqual(await repository.list(TEST_DATABASE_REF, randomUUID(), boardId), []);
    assert.equal(await repository.findById(TEST_DATABASE_REF, randomUUID(), boardId, second.id), null);
    assert.equal(await repository.update(TEST_DATABASE_REF, randomUUID(), boardId, second.id, { name: 'X' }), null);
  }));

void test('lista inicial: 8 itens confirmados, so "Demais documentos" opcional, idempotente e sem duplicar nome existente', () =>
  withTestDatabase(async (db, client) => {
    const repository = new DocumentTypesRepository(db);
    const clientId = randomUUID();
    const boardId = await createBoard(client, clientId);

    // Nome ja existente (com outra caixa) e nome desativado de proposito nao sao recriados.
    await repository.create(TEST_DATABASE_REF, clientId, boardId, { name: 'hiscon', required: false });
    const disabled = await repository.create(TEST_DATABASE_REF, clientId, boardId, { name: 'Procuração' });
    await repository.update(TEST_DATABASE_REF, clientId, boardId, disabled.id, { active: false });

    const first = await repository.applyInitialList(TEST_DATABASE_REF, clientId, boardId, INITIAL_DOCUMENT_TYPES);
    assert.equal(INITIAL_DOCUMENT_TYPES.length, 8);
    assert.deepEqual(first.skippedNames.sort(), ['HISCON', 'Procuração']);
    assert.equal(first.created.length, 6);
    const optional = first.created.filter((type) => !type.required).map((type) => type.name);
    assert.deepEqual(optional, ['Demais documentos']);

    const second = await repository.applyInitialList(TEST_DATABASE_REF, clientId, boardId, INITIAL_DOCUMENT_TYPES);
    assert.equal(second.created.length, 0);
    assert.equal(second.skippedNames.length, 8);

    const total = await client.query(`SELECT count(*)::int AS n FROM kanban_board_document_types WHERE board_id = $1`, [boardId]);
    assert.equal(total.rows[0].n, 8);
  }));

void test('flags aditivas: requires_complete_checklist na coluna e can_review_documents no perfil (default false)', () =>
  withTestDatabase(async (db, client) => {
    const clientId = randomUUID();
    const boardId = await createBoard(client, clientId);
    const columns = new ColumnsRepository(db);
    const profiles = new ProfilesRepository(db);

    const column = await columns.create(TEST_DATABASE_REF, clientId, boardId, { name: 'Protocolo', position: 0 });
    assert.equal(column.requiresCompleteChecklist, false);
    const updated = await columns.update(TEST_DATABASE_REF, clientId, boardId, column.id, { requiresCompleteChecklist: true });
    assert.equal(updated.requiresCompleteChecklist, true);
    const renamed = await columns.update(TEST_DATABASE_REF, clientId, boardId, column.id, { name: 'Protocolar' });
    assert.equal(renamed.requiresCompleteChecklist, true, 'update parcial preserva a flag');

    const profile = await profiles.create(TEST_DATABASE_REF, clientId, boardId, { name: 'Central' });
    assert.equal(profile.canReviewDocuments, false);
    const reviewer = await profiles.update(TEST_DATABASE_REF, clientId, boardId, profile.id, { canReviewDocuments: true });
    assert.equal(reviewer.canReviewDocuments, true);
    const capability = await profiles.findCapability(TEST_DATABASE_REF, clientId, profile.id);
    assert.equal(capability?.canReviewDocuments, true);
  }));
