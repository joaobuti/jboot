import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PageQuery } from '../admin.types';
import { ensureOne } from '../shared/repository-result';
import { CreateApplicationDatabaseDto, UpdateApplicationDatabaseDto } from './dto/application-database.dto';

@Injectable()
export class ApplicationDatabasesRepository {
  constructor(private readonly database: DatabaseService) {}

  list(applicationId: string, query: PageQuery) {
    return this.database.query(
      `SELECT ad.id, ad.application_id AS "applicationId", ad.database_id AS "databaseId",
              d.slug AS "databaseSlug", d.name AS "databaseName", ad.role,
              ad.isolation_strategy AS "isolationStrategy", ad.required, ad.status,
              ad.metadata, ad.created_at AS "createdAt", ad.updated_at AS "updatedAt"
       FROM application_databases ad
       LEFT JOIN databases d ON d.id = ad.database_id
       WHERE ad.application_id = $1
         AND ($4::text IS NULL OR d.slug ILIKE '%' || $4 || '%' OR ad.role ILIKE '%' || $4 || '%')
       ORDER BY ad.role
       LIMIT $2 OFFSET $3`,
      [applicationId, query.limit, query.offset, query.search ?? null]
    );
  }

  async create(applicationId: string, dto: CreateApplicationDatabaseDto) {
    return ensureOne(
      await this.database.query(
        `INSERT INTO application_databases (
           application_id, database_id, role, isolation_strategy, required, metadata
         )
         VALUES ($1, $2, COALESCE($3, 'primary'), $4, COALESCE($5, true), $6)
         RETURNING id, application_id AS "applicationId", database_id AS "databaseId",
                   role, isolation_strategy AS "isolationStrategy", required, status,
                   metadata, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          applicationId,
          dto.databaseId ?? null,
          dto.role ?? null,
          dto.isolationStrategy,
          dto.required ?? null,
          JSON.stringify(dto.metadata ?? {})
        ]
      )
    );
  }

  async update(id: string, dto: UpdateApplicationDatabaseDto) {
    return ensureOne(
      await this.database.query(
        `UPDATE application_databases
         SET database_id = COALESCE($2, database_id),
             isolation_strategy = COALESCE($3, isolation_strategy),
             required = COALESCE($4, required),
             status = COALESCE($5, status),
             metadata = COALESCE($6, metadata),
             updated_at = now()
         WHERE id = $1
         RETURNING id, application_id AS "applicationId", database_id AS "databaseId",
                   role, isolation_strategy AS "isolationStrategy", required, status,
                   metadata, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          id,
          dto.databaseId ?? null,
          dto.isolationStrategy ?? null,
          dto.required ?? null,
          dto.status ?? null,
          dto.metadata ? JSON.stringify(dto.metadata) : null
        ]
      )
    );
  }
}
