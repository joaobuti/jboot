import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export interface CredencialStatusRow {
  slug: string;
  authType: string;
  configured: boolean;
  updatedAt: string | null;
}

interface EncryptedFields {
  encryptedUsername: Buffer | null;
  encryptedPassword: Buffer | null;
  encryptedToken: Buffer | null;
  keyRef: string;
}

interface AuditData {
  identityId: string;
  eventType: string;
  portalSlug: string;
  payload: Record<string, unknown>;
  ip: string | null;
}

@Injectable()
export class CredenciaisRepository {
  constructor(private readonly database: DatabaseService) {}

  async getStatus(clientId: string, databaseRef: string, portalSlug: string): Promise<CredencialStatusRow | null> {
    const result = await this.database.queryForDatabaseRef<CredencialStatusRow>(
      databaseRef,
      `SELECT p.slug,
              p.auth_type          AS "authType",
              (c.id IS NOT NULL)   AS configured,
              c.updated_at         AS "updatedAt"
       FROM juridico_portals p
       LEFT JOIN juridico_portal_credentials c
         ON c.portal_id = p.id AND c.client_id = $1
       WHERE p.slug = $2
         AND p.status = 'active'
       LIMIT 1`,
      [clientId, portalSlug],
    );
    return result.rows[0] ?? null;
  }

  async upsert(clientId: string, databaseRef: string, portalSlug: string, fields: EncryptedFields): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `INSERT INTO juridico_portal_credentials
         (client_id, portal_id, encrypted_username, encrypted_password, encrypted_token, encryption_key_ref)
       SELECT $1, p.id, $3, $4, $5, $6
       FROM juridico_portals p
       WHERE p.slug = $2
       ON CONFLICT (client_id, portal_id) DO UPDATE SET
         encrypted_username  = EXCLUDED.encrypted_username,
         encrypted_password  = EXCLUDED.encrypted_password,
         encrypted_token     = EXCLUDED.encrypted_token,
         encryption_key_ref  = EXCLUDED.encryption_key_ref,
         updated_at          = now()`,
      [clientId, portalSlug, fields.encryptedUsername, fields.encryptedPassword, fields.encryptedToken, fields.keyRef],
    );
  }

  async remove(clientId: string, databaseRef: string, portalSlug: string): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef(
      databaseRef,
      `DELETE FROM juridico_portal_credentials
       WHERE client_id = $1
         AND portal_id = (SELECT id FROM juridico_portals WHERE slug = $2 LIMIT 1)`,
      [clientId, portalSlug],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getEncrypted(
    clientId: string,
    databaseRef: string,
    portalSlug: string,
  ): Promise<{ encUsername: Buffer | null; encPassword: Buffer | null } | null> {
    const result = await this.database.queryForDatabaseRef<{
      enc_username: Buffer | null;
      enc_password: Buffer | null;
    }>(
      databaseRef,
      `SELECT c.encrypted_username AS enc_username, c.encrypted_password AS enc_password
       FROM juridico_portal_credentials c
       JOIN juridico_portals p ON p.id = c.portal_id
       WHERE c.client_id = $1 AND p.slug = $2
       LIMIT 1`,
      [clientId, portalSlug],
    );
    if (!result.rows[0]) return null;
    return {
      encUsername: result.rows[0].enc_username,
      encPassword: result.rows[0].enc_password,
    };
  }

  async auditLog(clientId: string, databaseRef: string, data: AuditData): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `INSERT INTO juridico_audit_events (client_id, identity_id, event_type, portal_id, payload, ip)
       SELECT $1, $2, $3, p.id, $5::jsonb, $6
       FROM juridico_portals p
       WHERE p.slug = $4`,
      [clientId, data.identityId, data.eventType, data.portalSlug, JSON.stringify(data.payload), data.ip],
    );
  }
}
