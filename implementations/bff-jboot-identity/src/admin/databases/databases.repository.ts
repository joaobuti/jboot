import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PageQuery } from '../admin.types';
import { ensureOne } from '../shared/repository-result';
import { CreateDatabaseDto, UpdateDatabaseDto } from './dto/database.dto';

@Injectable()
export class DatabasesRepository {
  constructor(private readonly database: DatabaseService) {}

  list(query: PageQuery) {
    return this.database.query(
      `SELECT id, slug, name, engine, connection_name AS "connectionName",
              default_database_name AS "defaultDatabaseName", status, metadata,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM databases
       WHERE ($3::text IS NULL OR slug ILIKE '%' || $3 || '%' OR name ILIKE '%' || $3 || '%')
       ORDER BY name
       LIMIT $1 OFFSET $2`,
      [query.limit, query.offset, query.search ?? null]
    );
  }

  async create(dto: CreateDatabaseDto) {
    return ensureOne(
      await this.database.query(
        `INSERT INTO databases (slug, name, engine, connection_name, default_database_name, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, slug, name, engine, connection_name AS "connectionName",
                   default_database_name AS "defaultDatabaseName", status, metadata,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          dto.slug,
          dto.name,
          dto.engine,
          dto.connectionName,
          dto.defaultDatabaseName,
          JSON.stringify(dto.metadata ?? {})
        ]
      )
    );
  }

  async update(id: string, dto: UpdateDatabaseDto) {
    return ensureOne(
      await this.database.query(
        `UPDATE databases
         SET name = COALESCE($2, name),
             status = COALESCE($3, status),
             connection_name = COALESCE($4, connection_name),
             default_database_name = COALESCE($5, default_database_name),
             metadata = COALESCE($6, metadata),
             updated_at = now()
         WHERE id = $1
         RETURNING id, slug, name, engine, connection_name AS "connectionName",
                   default_database_name AS "defaultDatabaseName", status, metadata,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          id,
          dto.name ?? null,
          dto.status ?? null,
          dto.connectionName ?? null,
          dto.defaultDatabaseName ?? null,
          dto.metadata ? JSON.stringify(dto.metadata) : null
        ]
      )
    );
  }
}
