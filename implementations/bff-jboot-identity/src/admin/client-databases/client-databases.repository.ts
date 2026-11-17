import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { ApplicationDatabaseRule, CurrentDatabaseRef, ExpectedDatabaseRef } from '../shared/database-ref-rule';

export interface ClientDatabaseRow {
  clientId: string;
  clientName: string;
  applicationId: string;
  applicationSlug: string;
  applicationName: string;
  rule: ApplicationDatabaseRule | null;
  current: CurrentDatabaseRef | null;
}

/**
 * Registro de banco de cada modulo contratado, comparado com a regra atual do app
 * (docs/product/tenant-isolation-sprints.md, Sprint 0).
 */
const ROWS = `
  SELECT c.id AS "clientId", c.legal_name AS "clientName",
         a.id AS "applicationId", a.slug AS "applicationSlug", a.name AS "applicationName",
         CASE WHEN ad.id IS NULL THEN NULL ELSE json_build_object(
           'id', ad.id, 'database_id', ad.database_id, 'isolation_strategy', ad.isolation_strategy,
           'connection_name', d.connection_name, 'default_database_name', d.default_database_name) END AS rule,
         CASE WHEN dr.id IS NULL THEN NULL ELSE json_build_object(
           'id', dr.id, 'databaseId', dr.database_id, 'strategy', dr.strategy, 'databaseName', dr.database_name,
           'schemaName', dr.schema_name, 'status', dr.status) END AS current
  FROM client_applications ca
  JOIN clients c ON c.id = ca.client_id AND c.status <> 'deleted'
  JOIN applications a ON a.id = ca.application_id
  LEFT JOIN application_databases ad
         ON ad.application_id = a.id AND ad.role = 'primary' AND ad.status = 'active'
  LEFT JOIN databases d ON d.id = ad.database_id
  LEFT JOIN LATERAL (
    SELECT * FROM database_refs r
    WHERE r.application_id = a.id AND r.client_id = c.id AND r.status <> 'disabled'
    ORDER BY CASE r.status WHEN 'active' THEN 0 ELSE 1 END, r.created_at DESC
    LIMIT 1
  ) dr ON true
  WHERE ca.status <> 'cancelled'`;

@Injectable()
export class ClientDatabasesRepository {
  constructor(private readonly database: DatabaseService) {}

  async listForClient(clientId: string): Promise<ClientDatabaseRow[]> {
    return (await this.database.query<ClientDatabaseRow>(`${ROWS} AND c.id = $1 ORDER BY a.name`, [clientId])).rows;
  }

  async listForApplication(applicationId: string): Promise<ClientDatabaseRow[]> {
    return (await this.database.query<ClientDatabaseRow>(`${ROWS} AND a.id = $1 ORDER BY c.legal_name`, [applicationId])).rows;
  }

  /**
   * Corrige o registro do cliente pela regra mantendo o mesmo id: o id e guardado fora do Identity
   * (sessoes, acompanhamentos processuais, filas do Flow), entao trocar de registro quebraria tudo
   * isso. Sem registro, cria um. Os demais registros em uso do par cliente x app ficam `disabled`.
   */
  async applyExpected(
    clientId: string,
    applicationId: string,
    currentId: string | null,
    expected: ExpectedDatabaseRef | null
  ): Promise<string | null> {
    return this.database.transaction(async (client: PoolClient) => {
      await client.query(
        `UPDATE database_refs SET status = 'disabled', updated_at = now()
         WHERE application_id = $1 AND client_id = $2 AND status <> 'disabled'
           AND ($3::uuid IS NULL OR id <> $3::uuid)`,
        [applicationId, clientId, expected ? currentId : null]
      );
      if (!expected) return null;
      const values = [
        expected.databaseId,
        expected.strategy,
        expected.connectionName,
        expected.databaseName,
        expected.schemaName,
        expected.status,
        JSON.stringify(expected.metadata)
      ];
      if (currentId) {
        await client.query(
          `UPDATE database_refs
           SET database_id = $2, strategy = $3, connection_name = $4, database_name = $5, schema_name = $6,
               status = $7, metadata = $8, updated_at = now()
           WHERE id = $1`,
          [currentId, ...values]
        );
        return currentId;
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO database_refs (
           application_id, client_id, database_id, strategy, connection_name, database_name, schema_name, status, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [applicationId, clientId, ...values]
      );
      return inserted.rows[0].id;
    });
  }
}
