import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ensureOne } from '../../admin/shared/repository-result';
import { CreateManagedUserDto } from './dto/create-managed-user.dto';

@Injectable()
export class ManagerUsersRepository {
  constructor(private readonly database: DatabaseService) {}

  listForApplication(clientId: string, applicationId: string) {
    return this.database.query(
      `SELECT i.id AS "identityId", i.document_type AS "documentType",
              i.display_name AS "displayName", i.email, i.phone,
              i.status AS "identityStatus",
              e.status AS "entitlementStatus", e.scopes, e.roles,
              e.created_at AS "grantedAt"
       FROM entitlements e
       JOIN identities i ON i.id = e.identity_id
       WHERE e.client_id = $1 AND e.application_id = $2
       ORDER BY i.display_name`,
      [clientId, applicationId]
    );
  }

  findByDocumentNumber(documentNumber: string) {
    return this.database.query(
      `SELECT id, document_type AS "documentType", display_name AS "displayName",
              email, phone, status
       FROM identities
       WHERE document_number = $1
       LIMIT 1`,
      [documentNumber]
    );
  }

  async createIdentity(dto: CreateManagedUserDto) {
    return ensureOne(
      await this.database.query(
        `INSERT INTO identities (document_type, document_number, display_name, email, phone)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, document_type AS "documentType", display_name AS "displayName",
                   email, phone, status`,
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

  async upsertEntitlement(
    identityId: string,
    clientId: string,
    applicationId: string,
    scopes: string[],
    roles: string[],
    moduleAttributes: Record<string, unknown> = {}
  ) {
    return ensureOne(
      await this.database.query(
        `INSERT INTO entitlements (identity_id, client_id, application_id, scopes, roles, module_attributes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (identity_id, client_id, application_id)
         DO UPDATE SET scopes = EXCLUDED.scopes,
                       roles = EXCLUDED.roles,
                       module_attributes = EXCLUDED.module_attributes,
                       status = 'active'
         RETURNING id, identity_id AS "identityId", client_id AS "clientId",
                   application_id AS "applicationId", scopes, roles, module_attributes AS "moduleAttributes",
                   status, created_at AS "createdAt"`,
        [identityId, clientId, applicationId, scopes, roles, JSON.stringify(moduleAttributes)]
      )
    );
  }

  async updateEntitlementStatus(
    identityId: string,
    clientId: string,
    applicationId: string,
    status: string
  ) {
    return ensureOne(
      await this.database.query(
        `UPDATE entitlements
         SET status = $4
         WHERE identity_id = $1 AND client_id = $2 AND application_id = $3
         RETURNING id, identity_id AS "identityId", client_id AS "clientId",
                   application_id AS "applicationId", scopes, roles, status,
                   created_at AS "createdAt"`,
        [identityId, clientId, applicationId, status]
      )
    );
  }
}
