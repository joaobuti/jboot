import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { AppConfigService } from '../config/app-config.service';

interface DatabaseRefRow extends QueryResultRow {
  id: string;
  strategy: 'shared_db' | 'schema_per_client' | 'dedicated_db';
  connection_name: string;
  database_name: string;
  schema_name: string | null;
  status: string;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly identityPool: Pool;
  private readonly routedPools = new Map<string, Pool>();

  constructor(private readonly config: AppConfigService) {
    this.pool = new Pool({ connectionString: config.databaseUrl });
    this.identityPool = new Pool({ connectionString: config.identityDatabaseUrl });
  }

  query<T extends QueryResultRow = QueryResultRow>(text: string, values: readonly unknown[] = []) {
    return this.pool.query<T>(text, [...values]);
  }

  async transaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await handler(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async queryForDatabaseRef<T extends QueryResultRow = QueryResultRow>(
    databaseRef: string,
    text: string,
    values: readonly unknown[] = []
  ) {
    const pool = await this.poolForDatabaseRef(databaseRef);
    return pool.query<T>(text, [...values]);
  }

  async transactionForDatabaseRef<T>(
    databaseRef: string,
    handler: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const pool = await this.poolForDatabaseRef(databaseRef);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await handler(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async poolForDatabaseRef(databaseRef: string): Promise<Pool> {
    const result = await this.identityPool.query<DatabaseRefRow>(
      `SELECT id, strategy, connection_name, database_name, schema_name, status
       FROM database_refs
       WHERE id = $1
       LIMIT 1`,
      [databaseRef]
    );
    const ref = result.rows[0];
    if (!ref || ref.status !== 'active') {
      throw new Error('Database ref is not active');
    }

    return this.poolFor(ref.connection_name, ref.database_name);
  }

  private poolFor(connectionName: string, databaseName: string): Pool {
    const baseUrl = this.config.connectionUrls[connectionName];
    if (!baseUrl) {
      throw new Error(`Unknown database connection: ${connectionName}`);
    }

    const connectionString = this.withDatabaseName(baseUrl, databaseName);
    const cacheKey = `${connectionName}:${databaseName}`;
    const cached = this.routedPools.get(cacheKey);
    if (cached) {
      return cached;
    }

    const pool = new Pool({ connectionString });
    this.routedPools.set(cacheKey, pool);
    return pool;
  }

  queryIdentity<T extends QueryResultRow = QueryResultRow>(text: string, values: readonly unknown[] = []) {
    return this.identityPool.query<T>(text, [...values]);
  }

  queryRaw<T extends QueryResultRow = QueryResultRow>(
    connectionName: string,
    databaseName: string,
    text: string,
    values: readonly unknown[] = []
  ) {
    return this.poolFor(connectionName, databaseName).query<T>(text, [...values]);
  }

  async transactionRaw<T>(
    connectionName: string,
    databaseName: string,
    handler: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.poolFor(connectionName, databaseName).connect();
    try {
      await client.query('BEGIN');
      const result = await handler(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private withDatabaseName(connectionString: string, databaseName: string): string {
    const url = new URL(connectionString);
    url.pathname = `/${databaseName}`;
    return url.toString();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
    await this.identityPool.end();
    await Promise.all([...this.routedPools.values()].map((pool) => pool.end()));
  }
}
