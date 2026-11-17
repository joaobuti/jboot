import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DataJudRepository } from './datajud.repository';

/**
 * A tabela juridico_data_process_snapshots guarda dois ciclos de vida: monitor
 * (purga junto do monitor deletado) e manual_query (180 dias). A purga de um
 * nunca pode alcancar o outro.
 */
function repositoryCapturing(sql: string[]) {
  return new DataJudRepository({
    queryForDatabaseRef: async (_ref: string, text: string) => {
      sql.push(text);
      return { rowCount: 1, rows: [] };
    }
  } as never);
}

void test('manual snapshot purge only targets manual_query rows', async () => {
  const sql: string[] = [];
  const purged = await repositoryCapturing(sql).purgeExpiredManualSnapshots('ref');

  assert.equal(purged, 1);
  assert.equal(sql.length, 1);
  assert.match(sql[0], /DELETE FROM juridico_data_process_snapshots/);
  assert.match(sql[0], /origin = 'manual_query'/);
  assert.match(sql[0], /purge_after <= now\(\)/);
  // Sem esta guarda, a purga levaria snapshots de monitor junto.
  assert.doesNotMatch(sql[0], /origin = 'monitor'/);
});

void test('manual snapshot purge never deletes rows without a purge date', async () => {
  const sql: string[] = [];
  await repositoryCapturing(sql).purgeExpiredManualSnapshots('ref');
  assert.match(sql[0], /purge_after IS NOT NULL/);
});
