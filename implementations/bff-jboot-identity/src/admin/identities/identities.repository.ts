import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PageQuery } from '../admin.types';
import { ensureOne } from '../shared/repository-result';
import { CreateIdentityDto, UpdateIdentityDto } from './dto/identity.dto';

@Injectable()
export class IdentitiesRepository {
  constructor(private readonly database: DatabaseService) {}

  list(query: PageQuery) {
    return this.database.query(
      `SELECT id, document_type AS "documentType", display_name AS "displayName",
              email, phone, status, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM identities
       WHERE ($3::text IS NULL OR display_name ILIKE '%' || $3 || '%' OR email::text ILIKE '%' || $3 || '%')
       ORDER BY display_name
       LIMIT $1 OFFSET $2`,
      [query.limit, query.offset, query.search ?? null]
    );
  }

  async create(dto: CreateIdentityDto) {
    return ensureOne(
      await this.database.query(
        `INSERT INTO identities (document_type, document_number, display_name, email, phone)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, document_type AS "documentType", display_name AS "displayName",
                   email, phone, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [dto.documentType, dto.documentNumber, dto.displayName, dto.email ?? null, dto.phone ?? null]
      )
    );
  }

  async upsertPassword(identityId: string, secretHash: string) {
    await this.database.query(
      `INSERT INTO credentials (identity_id, credential_type, credential_ref, secret_hash)
       VALUES ($1, 'password', 'local', $2)
       ON CONFLICT (identity_id, credential_type, credential_ref)
       DO UPDATE SET secret_hash = EXCLUDED.secret_hash, status = 'active'`,
      [identityId, secretHash]
    );
  }

  async update(id: string, dto: UpdateIdentityDto) {
    return ensureOne(
      await this.database.query(
        `UPDATE identities
         SET display_name = COALESCE($2, display_name),
             email = COALESCE($3, email),
             phone = COALESCE($4, phone),
             status = COALESCE($5, status),
             updated_at = now()
         WHERE id = $1
         RETURNING id, document_type AS "documentType", display_name AS "displayName",
                   email, phone, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, dto.displayName ?? null, dto.email ?? null, dto.phone ?? null, dto.status ?? null]
      )
    );
  }
}
