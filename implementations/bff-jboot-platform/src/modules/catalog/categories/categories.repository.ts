import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { CatalogPageQuery, CatalogPageResult } from '../catalog.types';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

export interface CategoryRow {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  visibleInComanda: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  total?: string;
}

const COLS = `
  id, parent_id AS "parentId", name, slug, description,
  visible_in_comanda AS "visibleInComanda", status,
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

@Injectable()
export class CatalogCategoriesRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(clientId: string, query: CatalogPageQuery): Promise<CatalogPageResult<Omit<CategoryRow, 'total'>>> {
    const result = await this.database.query<CategoryRow>(
      `SELECT ${COLS}, count(*) OVER() AS total
       FROM catalog_categories
       WHERE client_id = $1
         AND ($4::text IS NULL OR status = $4)
         AND ($5::text IS NULL OR name ILIKE '%' || $5 || '%' OR slug ILIKE '%' || $5 || '%')
       ORDER BY name
       LIMIT $2 OFFSET $3`,
      [clientId, query.limit, query.offset, query.status ?? null, query.search ?? null]
    );
    return this.toPage(result.rows, query);
  }

  async create(clientId: string, dto: CreateCategoryDto): Promise<Omit<CategoryRow, 'total'>> {
    const result = await this.database.query<Omit<CategoryRow, 'total'>>(
      `INSERT INTO catalog_categories (client_id, parent_id, name, slug, description, visible_in_comanda)
       VALUES ($1::uuid, $2::uuid, $3::varchar, slugify($3::text), $4::text, COALESCE($5::boolean, false))
       RETURNING ${COLS}`,
      [clientId, dto.parentId ?? null, dto.name, dto.description ?? null, dto.visibleInComanda ?? null]
    );
    if (!result.rows[0]) throw new NotFoundException('Category not created');
    return result.rows[0];
  }

  async update(clientId: string, id: string, dto: UpdateCategoryDto): Promise<Omit<CategoryRow, 'total'>> {
    const result = await this.database.query<Omit<CategoryRow, 'total'>>(
      `UPDATE catalog_categories
       SET parent_id          = COALESCE($3::uuid, parent_id),
           name               = COALESCE($4::varchar, name),
           slug               = CASE WHEN $4::text IS NULL THEN slug ELSE slugify($4::text) END,
           description        = COALESCE($5::text, description),
           visible_in_comanda = COALESCE($6::boolean, visible_in_comanda),
           status             = COALESCE($7::varchar, status),
           updated_at         = now()
       WHERE client_id = $1 AND id = $2
       RETURNING ${COLS}`,
      [
        clientId, id,
        dto.parentId ?? null,
        dto.name ?? null,
        dto.description ?? null,
        dto.visibleInComanda ?? null,
        dto.status ?? null
      ]
    );
    if (!result.rows[0]) throw new NotFoundException('Category not found');
    return result.rows[0];
  }

  private toPage(rows: CategoryRow[], query: CatalogPageQuery): CatalogPageResult<Omit<CategoryRow, 'total'>> {
    const total = rows[0]?.total ? Number(rows[0].total) : 0;
    return {
      data: rows.map(({ total: _ignored, ...data }) => { void _ignored; return data; }),
      meta: { limit: query.limit, offset: query.offset, total }
    };
  }
}
