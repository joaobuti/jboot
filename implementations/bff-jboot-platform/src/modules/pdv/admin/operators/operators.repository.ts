import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../database/database.service';
import { PageQuery, PageResult } from '../admin.types';
import { ensureOne } from '../shared/repository-result';
import { CreateOperatorDto, UpdateOperatorDto } from './dto/operator.dto';

export interface OperatorRow {
  id: string;
  identityId: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  total?: string;
}

@Injectable()
export class OperatorsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(clientId: string, query: PageQuery): Promise<PageResult<Omit<OperatorRow, 'total'>>> {
    const result = await this.database.query<OperatorRow>(
      `SELECT id, identity_id AS "identityId", display_name AS "displayName", role, status,
              created_at AS "createdAt", updated_at AS "updatedAt", count(*) OVER() AS total
       FROM pdv_operators
       WHERE client_id = $1
         AND ($4::text IS NULL OR status = $4)
         AND ($5::text IS NULL OR display_name ILIKE '%' || $5 || '%')
       ORDER BY display_name
       LIMIT $2 OFFSET $3`,
      [clientId, query.limit, query.offset, query.status ?? null, query.search ?? null]
    );
    return this.toPage(result.rows, query);
  }

  async create(clientId: string, dto: CreateOperatorDto) {
    return ensureOne(
      await this.database.query<Omit<OperatorRow, 'total'>>(
        `INSERT INTO pdv_operators (client_id, identity_id, display_name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, identity_id AS "identityId", display_name AS "displayName", role, status,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [clientId, dto.identityId, dto.displayName, dto.role]
      )
    );
  }

  async update(clientId: string, id: string, dto: UpdateOperatorDto) {
    return ensureOne(
      await this.database.query<Omit<OperatorRow, 'total'>>(
        `UPDATE pdv_operators
         SET display_name = COALESCE($3, display_name),
             role = COALESCE($4, role),
             status = COALESCE($5, status),
             updated_at = now()
         WHERE client_id = $1 AND id = $2
         RETURNING id, identity_id AS "identityId", display_name AS "displayName", role, status,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [clientId, id, dto.displayName ?? null, dto.role ?? null, dto.status ?? null]
      )
    );
  }

  private toPage(rows: OperatorRow[], query: PageQuery): PageResult<Omit<OperatorRow, 'total'>> {
    const total = rows[0]?.total ? Number(rows[0].total) : 0;
    return {
      data: rows.map((row) => {
        const { total: _ignored, ...data } = row;
        void _ignored;
        return data;
      }),
      meta: { limit: query.limit, offset: query.offset, total }
    };
  }
}
