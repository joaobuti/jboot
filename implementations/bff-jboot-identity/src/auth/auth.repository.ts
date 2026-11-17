import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { CredentialRecord, DestinationRecord, IdentityRecord } from './auth.types';

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseService) {}

  async findIdentityWithPassword(
    documentType: string,
    documentNumber: string
  ): Promise<{ identity: IdentityRecord; credential: CredentialRecord } | null> {
    const result = await this.database.query<{
      id: string;
      document_type: 'cpf' | 'cnpj';
      document_number: string;
      display_name: string;
      status: string;
      secret_hash: string | null;
    }>(
      `SELECT i.id, i.document_type, i.document_number, i.display_name, i.status, c.secret_hash
       FROM identities i
       JOIN credentials c ON c.identity_id = i.id
       WHERE i.document_type = $1
         AND i.document_number = $2
         AND i.status = 'active'
         AND c.credential_type = 'password'
         AND c.status = 'active'
       LIMIT 1`,
      [documentType, documentNumber]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      identity: {
        id: row.id,
        documentType: row.document_type,
        documentNumber: row.document_number,
        displayName: row.display_name,
        status: row.status
      },
      credential: {
        identityId: row.id,
        secretHash: row.secret_hash
      }
    };
  }

  async listDestinations(identityId: string): Promise<DestinationRecord[]> {
    const result = await this.database.query<{
      client_application_id: string;
      client_id: string;
      client_name: string;
      client_type: string;
      contract_status: 'active' | 'trial';
      plan_code: string | null;
      application_id: string;
      application_slug: string;
      application_name: string;
      token_audience: string;
      database_ref_id: string;
      database_strategy: string;
      database_name: string;
      schema_name: string | null;
      client_application_config: Record<string, unknown>;
      scopes: string[];
      roles: string[];
      module_attributes: Record<string, unknown>;
    }>(
      `SELECT
          ca.id AS client_application_id,
          c.id AS client_id,
          COALESCE(c.trade_name, c.legal_name) AS client_name,
          c.client_type,
          ca.status AS contract_status,
          ca.plan_code,
          a.id AS application_id,
          a.slug AS application_slug,
          a.name AS application_name,
          a.token_audience,
          ca.config AS client_application_config,
          dr.id AS database_ref_id,
          dr.strategy AS database_strategy,
          dr.database_name,
          dr.schema_name,
          e.scopes,
          e.roles,
          e.module_attributes
       FROM entitlements e
       JOIN memberships m
         ON m.identity_id = e.identity_id
        AND m.client_id = e.client_id
        AND m.status = 'active'
       JOIN clients c ON c.id = e.client_id AND c.status = 'active'
       JOIN applications a ON a.id = e.application_id AND a.status = 'active'
       JOIN client_applications ca
         ON ca.client_id = c.id
        AND ca.application_id = a.id
        AND ca.status IN ('active', 'trial')
        AND ca.starts_at <= now()
        AND (ca.ends_at IS NULL OR ca.ends_at > now())
       JOIN LATERAL (
          SELECT dr1.*
          FROM database_refs dr1
          WHERE dr1.application_id = a.id
            AND dr1.status = 'active'
            AND (dr1.client_id = c.id OR dr1.client_id IS NULL)
          ORDER BY CASE WHEN dr1.client_id = c.id THEN 0 ELSE 1 END
          LIMIT 1
       ) dr ON true
       WHERE e.identity_id = $1
         AND e.status = 'active'
       ORDER BY c.legal_name, a.name`,
      [identityId]
    );

    return result.rows.map((row) => ({
      clientApplicationId: row.client_application_id,
      clientId: row.client_id,
      clientName: row.client_name,
      clientType: row.client_type,
      contractStatus: row.contract_status,
      planCode: row.plan_code,
      applicationId: row.application_id,
      applicationSlug: row.application_slug,
      applicationName: row.application_name,
      tokenAudience: row.token_audience,
      launchUrl: this.launchUrl(row.client_application_config),
      databaseRefId: row.database_ref_id,
      databaseStrategy: row.database_strategy,
      databaseName: row.database_name,
      schemaName: row.schema_name,
      scopes: row.scopes ?? [],
      roles: row.roles ?? [],
      moduleAttributes: row.module_attributes ?? {}
    }));
  }

  async getPermissionsVersion(identityId: string): Promise<number> {
    const result = await this.database.query<{ version: string }>(
      `INSERT INTO identity_permission_versions (identity_id, version)
       VALUES ($1, 1)
       ON CONFLICT (identity_id) DO UPDATE
          SET version = identity_permission_versions.version
       RETURNING version`,
      [identityId]
    );
    return Number(result.rows[0]?.version ?? 1);
  }

  async bumpPermissionsVersion(identityId: string): Promise<number> {
    const result = await this.database.query<{ version: string }>(
      `INSERT INTO identity_permission_versions (identity_id, version)
       VALUES ($1, 2)
       ON CONFLICT (identity_id) DO UPDATE
          SET version = identity_permission_versions.version + 1,
              updated_at = now()
       RETURNING version`,
      [identityId]
    );
    return Number(result.rows[0]?.version ?? 1);
  }

  async listIdentityIdsForClient(clientId: string): Promise<string[]> {
    const result = await this.database.query<{ identity_id: string }>(
      `SELECT DISTINCT identity_id
       FROM entitlements
       WHERE client_id = $1`,
      [clientId]
    );
    return result.rows.map((row) => row.identity_id);
  }

  async listIdentityIdsForApplication(applicationId: string): Promise<string[]> {
    const result = await this.database.query<{ identity_id: string }>(
      `SELECT DISTINCT identity_id
       FROM entitlements
       WHERE application_id = $1`,
      [applicationId]
    );
    return result.rows.map((row) => row.identity_id);
  }

  private launchUrl(config: Record<string, unknown> | null): string | null {
    const value = config?.launchUrl ?? config?.launch_url;
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  async createSessionContext(
    client: PoolClient,
    params: {
      identityId: string;
      destination: DestinationRecord;
      expiresAt: Date;
      ip?: string;
      userAgent?: string;
      deviceRef?: string;
    }
  ): Promise<{ sessionId: string; jwtId: string }> {
    const result = await client.query<{ id: string; jwt_id: string }>(
      `INSERT INTO session_contexts (
        identity_id, client_id, application_id, database_ref_id, expires_at, ip, user_agent, device_ref
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, jwt_id`,
      [
        params.identityId,
        params.destination.clientId,
        params.destination.applicationId,
        params.destination.databaseRefId,
        params.expiresAt,
        params.ip ?? null,
        params.userAgent ?? null,
        params.deviceRef ?? null
      ]
    );

    return { sessionId: result.rows[0].id, jwtId: result.rows[0].jwt_id };
  }
}
