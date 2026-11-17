import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CardsRepository } from './cards.repository';

/**
 * O Flow e o registro permanente do cliente: excluir card e operacao logica.
 * Ver JUR-003 em docs/product/juridico-official-data-pendencias.md.
 */
function repositoryCapturing(sql: string[]) {
  return new CardsRepository({
    queryForDatabaseRef: async (_ref: string, text: string) => {
      sql.push(text);
      return { rowCount: 1, rows: [] };
    }
  } as never);
}

void test('deleting a card marks it as deleted instead of removing the row', async () => {
  const sql: string[] = [];
  const done = await repositoryCapturing(sql).softDelete('ref', 'client', 'board', 'card');

  assert.equal(done, true);
  assert.match(sql[0], /UPDATE kanban_cards/);
  assert.match(sql[0], /status = 'deleted'/);
  // Nenhum caminho de exclusao pode apagar a linha.
  assert.doesNotMatch(sql[0], /DELETE FROM/);
  // Continua exigindo arquivamento previo, como antes.
  assert.match(sql[0], /status = 'archived'/);
});

void test('a deleted card is invisible to card lookup', async () => {
  const sql: string[] = [];
  await repositoryCapturing(sql).findById('ref', 'client', 'board', 'card');
  assert.match(sql[0], /status <> 'deleted'/);
});
