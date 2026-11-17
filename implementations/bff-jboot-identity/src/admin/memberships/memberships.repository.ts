import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PageQuery } from '../admin.types';
import { ensureOne } from '../shared/repository-result';
import { CreateMembershipDto, UpdateMembershipDto } from './dto/membership.dto';

@Injectable()
export class MembershipsRepository {
  constructor(private readonly database: DatabaseService) {}

  list(clientId: string, query: PageQuery) {
    return this.database.query(
      `SELECT m.id, m.identity_id AS "identityId", m.client_id AS "clientId",
              i.display_name AS "displayName", i.document_type AS "documentType",
              m.roles, m.status, m.created_at AS "createdAt"
       FROM memberships m
       JOIN identities i ON i.id = m.identity_id
       WHERE m.client_id = $1
         AND ($4::text IS NULL OR i.display_name ILIKE '%' || $4 || '%')
       ORDER BY i.display_name
       LIMIT $2 OFFSET $3`,
      [clientId, query.limit, query.offset, query.search ?? null]
    );
  }

  async create(clientId: string, dto: CreateMembershipDto) {
    return ensureOne(
      await this.database.query(
        `INSERT INTO memberships (identity_id, client_id, roles)
         VALUES ($1, $2, $3)
         RETURNING id, identity_id AS "identityId", client_id AS "clientId",
                   roles, status, created_at AS "createdAt"`,
        [dto.identityId, clientId, dto.roles ?? []]
      )
    );
  }

  async update(clientId: string, identityId: string, dto: UpdateMembershipDto) {
    return ensureOne(
      await this.database.query(
        `UPDATE memberships
         SET roles = COALESCE($3, roles),
             status = COALESCE($4, status)
         WHERE client_id = $1 AND identity_id = $2
         RETURNING id, identity_id AS "identityId", client_id AS "clientId",
                   roles, status, created_at AS "createdAt"`,
        [clientId, identityId, dto.roles ?? null, dto.status ?? null]
      )
    );
  }
}
