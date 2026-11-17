import { Client } from 'pg';
import { DatabaseService } from '../database/database.service';

const KANBAN_TEST_DATABASE_URL =
  process.env.JBOOT_KANBAN_DATABASE_URL ?? 'postgresql://jboot:jboot@127.0.0.1:5432/jboot_kanban_demo_dev';

const PDV_TEST_DATABASE_URL =
  process.env.JBOOT_PDV_DATABASE_URL ?? 'postgresql://jboot:jboot@127.0.0.1:5432/jboot_pdv';

export const TEST_DATABASE_REF = 'test-ref';

export type TestDatabaseName = 'kanban' | 'pdv';

const DATABASE_URLS: Record<TestDatabaseName, string> = {
  kanban: KANBAN_TEST_DATABASE_URL,
  pdv: PDV_TEST_DATABASE_URL
};

// Repository specs rodam contra o Postgres real de dev (mesmo banco do app, nao um banco
// efemero separado), mas cada teste abre uma transacao e o cleanup sempre faz ROLLBACK —
// mesmo em falha — entao nunca commita e nunca polui o dado de dev compartilhado.
// O databaseRef passado pelos repositories e ignorado aqui de proposito: so existe uma
// conexao real (o client da transacao), nao o roteamento multi-tenant de producao.
// `database` escolhe o banco (default 'kanban', comportamento historico). Repositories que usam
// `query`/`transaction` (pool padrao, ex.: banco pdv) tambem sao suportados; `transaction` roda
// dentro de um SAVEPOINT para que falha dentro do handler desfaca so aquela unidade de trabalho
// (mesma semantica de atomicidade do BEGIN/ROLLBACK real) sem encerrar a transacao do teste.
export async function withTestDatabase<T>(
  run: (db: DatabaseService, client: Client) => Promise<T>,
  options: { database?: TestDatabaseName } = {}
): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URLS[options.database ?? 'kanban'] });
  await client.connect();
  let savepointSeq = 0;
  const savepointTransaction = async (handler: (c: Client) => Promise<unknown>) => {
    const name = `test_sp_${++savepointSeq}`;
    await client.query(`SAVEPOINT ${name}`);
    try {
      const result = await handler(client);
      await client.query(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (error) {
      await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
      throw error;
    }
  };
  const fakeDb = {
    query: (text: string, values: readonly unknown[] = []) => client.query(text, [...values]),
    transaction: (handler: (c: Client) => Promise<unknown>) => savepointTransaction(handler),
    queryForDatabaseRef: (_databaseRef: string, text: string, values: readonly unknown[] = []) =>
      client.query(text, [...values]),
    transactionForDatabaseRef: async (_databaseRef: string, handler: (c: Client) => Promise<unknown>) =>
      handler(client)
  } as unknown as DatabaseService;

  try {
    await client.query('BEGIN');
    return await run(fakeDb, client);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}
