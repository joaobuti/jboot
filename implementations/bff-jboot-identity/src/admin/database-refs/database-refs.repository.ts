import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PageQuery } from '../admin.types';
import { ensureOne } from '../shared/repository-result';
import { CreateDatabaseRefDto, UpdateDatabaseRefDto } from './dto/database-ref.dto';

@Injectable()
export class DatabaseRefsRepository {
  constructor(private readonly database: DatabaseService) {}

  list(query: PageQuery) {
    return this.database.query(
      `SELECT dr.id, dr.application_id AS "applicationId", a.slug AS "applicationSlug",
              dr.client_id AS "clientId", COALESCE(c.trade_name, c.legal_name) AS "clientName",
              dr.strategy, dr.connection_name AS "connectionName",
              dr.database_name AS "databaseName", dr.schema_name AS "schemaName",
              dr.status, dr.metadata, dr.created_at AS "createdAt"
       FROM database_refs dr
       JOIN applications a ON a.id = dr.application_id
       LEFT JOIN clients c ON c.id = dr.client_id
       WHERE ($3::text IS NULL OR a.slug ILIKE '%' || $3 || '%' OR c.legal_name ILIKE '%' || $3 || '%')
       ORDER BY a.slug, c.legal_name NULLS FIRST
       LIMIT $1 OFFSET $2`,
      [query.limit, query.offset, query.search ?? null]
    );
  }

  async create(dto: CreateDatabaseRefDto) {
    return ensureOne(
      await this.database.query(
        `INSERT INTO database_refs (
           application_id, client_id, strategy, connection_name, database_name, schema_name, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, application_id AS "applicationId", client_id AS "clientId",
                   strategy, connection_name AS "connectionName", database_name AS "databaseName",
                   schema_name AS "schemaName", status, metadata, created_at AS "createdAt"`,
        [
          dto.applicationId,
          dto.clientId ?? null,
          dto.strategy,
          dto.connectionName,
          dto.databaseName,
          dto.schemaName ?? null,
          JSON.stringify(dto.metadata ?? {})
        ]
      )
    );
  }

  async update(id: string, dto: UpdateDatabaseRefDto) {
    return ensureOne(
      await this.database.query(
        `UPDATE database_refs
         SET status = COALESCE($2, status),
             connection_name = COALESCE($3, connection_name),
             metadata = COALESCE($4, metadata)
         WHERE id = $1
         RETURNING id, application_id AS "applicationId", client_id AS "clientId",
                   strategy, connection_name AS "connectionName", database_name AS "databaseName",
                   schema_name AS "schemaName", status, metadata, created_at AS "createdAt"`,
        [id, dto.status ?? null, dto.connectionName ?? null, dto.metadata ? JSON.stringify(dto.metadata) : null]
      )
    );
  }
}
