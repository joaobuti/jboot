import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { DocumentSyncRepository } from './document-sync.repository';

/**
 * Pastas duplicadas no Drive (2026-10-30): envios paralelos do mesmo cliente procuravam a pasta, nao
 * achavam e criavam duas. A trava consultiva serializa os envios do cliente mesmo em conexoes (ou
 * instancias) diferentes; clientes diferentes seguem em paralelo. Cada transacao usa conexao propria.
 */
const url = process.env.JBOOT_KANBAN_DATABASE_URL ?? 'postgresql://jboot:jboot@127.0.0.1:5432/jboot_kanban_demo_dev';
const ownConnectionDb = {
  transactionForDatabaseRef: async <T>(_ref: string, handler: (client: Client) => Promise<T>): Promise<T> => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      await client.query('BEGIN');
      const result = await handler(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
  }
};

async function timeline(clientIds: string[]): Promise<Array<{ client: string; start: number; end: number }>> {
  const repository = new DocumentSyncRepository(ownConnectionDb as never);
  const started = Date.now();
  return Promise.all(
    clientIds.map((clientId) =>
      repository.withClientDriveLock('ref', clientId, async () => {
        const start = Date.now() - started;
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { client: clientId, start, end: Date.now() - started };
      })
    )
  );
}

void test('PostgreSQL: dois envios do mesmo cliente nunca rodam juntos; clientes diferentes rodam em paralelo', async () => {
  const clientA = randomUUID(), clientB = randomUUID();
  const same = await timeline([clientA, clientA]);
  const [first, second] = [...same].sort((a, b) => a.start - b.start);
  assert.ok(second.start >= first.end - 5, `o segundo envio comecou (${second.start} ms) antes do primeiro terminar (${first.end} ms)`);

  const different = await timeline([clientA, clientB]);
  const overlap = Math.min(different[0].end, different[1].end) - Math.max(different[0].start, different[1].start);
  assert.ok(overlap > 100, 'clientes diferentes nao esperam um pelo outro');
});
