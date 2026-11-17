import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PageQuery } from '../admin.types';
import { ensureOne } from '../shared/repository-result';
import { CreateEntitlementDto, UpdateEntitlementDto } from './dto/entitlement.dto';

@Injectable()
export class EntitlementsRepository {
  constructor(private readonly database: DatabaseService) {}

  list(clientId: string, query: PageQuery) {
    return this.database.query(
      `SELECT e.id, e.identity_id AS "identityId", e.client_id AS "clientId",
              e.application_id AS "applicationId", i.display_name AS "displayName",
              a.slug AS "applicationSlug", a.name AS "applicationName",
              e.scopes, e.roles, e.status, e.created_at AS "createdAt"
       FROM entitlements e
       JOIN identities i ON i.id = e.identity_id
       JOIN applications a ON a.id = e.application_id
       WHERE e.client_id = $1
         AND ($4::text IS NULL OR i.display_name ILIKE '%' || $4 || '%' OR a.name ILIKE '%' || $4 || '%')
       ORDER BY i.display_name, a.name
       LIMIT $2 OFFSET $3`,
      [clientId, query.limit, query.offset, query.search ?? null]
    );
  }

  async create(clientId: string, dto: CreateEntitlementDto) {
    return ensureOne(
      await this.database.query(
        `INSERT INTO entitlements (identity_id, client_id, application_id, scopes, roles)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, identity_id AS "identityId", client_id AS "clientId",
                   application_id AS "applicationId", scopes, roles, status,
                   created_at AS "createdAt"`,
        [dto.identityId, clientId, dto.applicationId, dto.scopes ?? [], dto.roles ?? []]
      )
    );
  }

  async update(clientId: string, identityId: string, applicationId: string, dto: UpdateEntitlementDto) {
    return ensureOne(
      await this.database.query(
        `UPDATE entitlements
         SET scopes = COALESCE($4, scopes),
             roles = COALESCE($5, roles),
             status = COALESCE($6, status)
         WHERE client_id = $1 AND identity_id = $2 AND application_id = $3
         RETURNING id, identity_id AS "identityId", client_id AS "clientId",
                   application_id AS "applicationId", scopes, roles, status,
                   created_at AS "createdAt"`,
        [clientId, identityId, applicationId, dto.scopes ?? null, dto.roles ?? null, dto.status ?? null]
      )
    );
  }
}
