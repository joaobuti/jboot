import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PageQuery } from '../admin.types';
import { ensureOne } from '../shared/repository-result';
import { CreateApplicationDto, UpdateApplicationDto } from './dto/application.dto';

@Injectable()
export class ApplicationsRepository {
  constructor(private readonly database: DatabaseService) {}

  list(query: PageQuery) {
    return this.database.query(
      `SELECT id, slug, name, token_audience AS "tokenAudience", status, created_at AS "createdAt"
       FROM applications
       WHERE ($3::text IS NULL OR slug ILIKE '%' || $3 || '%' OR name ILIKE '%' || $3 || '%')
       ORDER BY name
       LIMIT $1 OFFSET $2`,
      [query.limit, query.offset, query.search ?? null]
    );
  }

  async create(dto: CreateApplicationDto) {
    return ensureOne(
      await this.database.query(
        `INSERT INTO applications (slug, name, token_audience)
         VALUES ($1, $2, $3)
         RETURNING id, slug, name, token_audience AS "tokenAudience", status, created_at AS "createdAt"`,
        [dto.slug, dto.name, dto.tokenAudience]
      )
    );
  }

  async update(id: string, dto: UpdateApplicationDto) {
    return ensureOne(
      await this.database.query(
        `UPDATE applications
         SET name = COALESCE($2, name),
             token_audience = COALESCE($3, token_audience),
             status = COALESCE($4, status)
         WHERE id = $1
         RETURNING id, slug, name, token_audience AS "tokenAudience", status, created_at AS "createdAt"`,
        [id, dto.name ?? null, dto.tokenAudience ?? null, dto.status ?? null]
      )
    );
  }
}
