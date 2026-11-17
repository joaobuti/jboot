import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type AccessTokenPurpose = 'invite' | 'password_reset';

export interface AccessTokenIdentity {
  tokenId: string;
  purpose: AccessTokenPurpose;
  identityId: string;
  displayName: string;
  documentType: string;
  documentNumber: string;
  identityStatus: string;
}

export interface AccessIdentity {
  id: string;
  displayName: string;
  documentType: string;
  documentNumber: string;
  email: string | null;
  status: string;
}

/**
 * Links de uso unico (convite e recuperacao de senha), guardados so pelo hash
 * (docs/product/account-access-email-sprints.md).
 */
@Injectable()
export class AccountAccessRepository {
  constructor(private readonly database: DatabaseService) {}

  async findIdentity(identityId: string): Promise<AccessIdentity | null> {
    const result = await this.database.query<AccessIdentity>(
      `SELECT id, display_name AS "displayName", document_type AS "documentType",
              document_number AS "documentNumber", email::text AS email, status
       FROM identities WHERE id = $1`,
      [identityId]
    );
    return result.rows[0] ?? null;
  }

  async findIdentityByDocument(documentType: string, documentNumber: string): Promise<AccessIdentity | null> {
    const result = await this.database.query<AccessIdentity>(
      `SELECT id, display_name AS "displayName", document_type AS "documentType",
              document_number AS "documentNumber", email::text AS email, status
       FROM identities WHERE document_type = $1 AND document_number = $2`,
      [documentType, documentNumber]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Novo link: os anteriores ainda validos do mesmo tipo deixam de valer. Com `limit`, so grava se a
   * identidade tiver menos que `limit.max` links desse tipo desde `limit.since`; a trava por
   * identidade faz a contagem e a gravacao juntas (pedidos simultaneos nao passam do limite).
   * Devolve se gravou.
   */
  async issue(input: {
    identityId: string;
    purpose: AccessTokenPurpose;
    tokenHash: string;
    expiresAt: Date;
    requestedIp?: string | null;
    createdByIdentityId?: string | null;
    limit?: { max: number; since: Date };
  }): Promise<boolean> {
    return this.database.transaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`access-token:${input.identityId}`]);
      if (input.limit) {
        const recent = await client.query<{ total: string }>(
          `SELECT count(*) AS total FROM identity_access_tokens
           WHERE identity_id = $1 AND purpose = $2 AND created_at >= $3`,
          [input.identityId, input.purpose, input.limit.since]
        );
        if (Number(recent.rows[0]?.total ?? 0) >= input.limit.max) return false;
      }
      await client.query(
        `UPDATE identity_access_tokens SET revoked_at = now()
         WHERE identity_id = $1 AND purpose = $2 AND used_at IS NULL AND revoked_at IS NULL`,
        [input.identityId, input.purpose]
      );
      await client.query(
        `INSERT INTO identity_access_tokens (identity_id, purpose, token_hash, expires_at, requested_ip, created_by_identity_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [input.identityId, input.purpose, input.tokenHash, input.expiresAt, input.requestedIp ?? null, input.createdByIdentityId ?? null]
      );
      return true;
    });
  }

  /** Link valido: nao usado, nao revogado, no prazo, identidade nao bloqueada nem apagada. */
  async findValid(tokenHash: string): Promise<AccessTokenIdentity | null> {
    const result = await this.database.query<AccessTokenIdentity>(
      `SELECT t.id AS "tokenId", t.purpose, i.id AS "identityId", i.display_name AS "displayName",
              i.document_type AS "documentType", i.document_number AS "documentNumber",
              i.status AS "identityStatus"
       FROM identity_access_tokens t
       JOIN identities i ON i.id = t.identity_id
       WHERE t.token_hash = $1
         AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at > now()
         AND i.status IN ('active', 'pending')`,
      [tokenHash]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Cria a senha numa transacao: consome o link (so um pedido vence a corrida), invalida os demais,
   * grava a credencial, ativa a conta convidada e encerra sessoes e acessos OAuth.
   */
  async consume(tokenId: string, identityId: string, secretHash: string): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const used = await client.query(
        `UPDATE identity_access_tokens SET used_at = now()
         WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
         RETURNING id`,
        [tokenId]
      );
      if (used.rowCount !== 1) return false;
      await client.query(
        `UPDATE identity_access_tokens SET revoked_at = now()
         WHERE identity_id = $1 AND id <> $2 AND used_at IS NULL AND revoked_at IS NULL`,
        [identityId, tokenId]
      );
      await client.query(
        `INSERT INTO credentials (identity_id, credential_type, credential_ref, secret_hash, status)
         VALUES ($1, 'password', 'local', $2, 'active')
         ON CONFLICT (identity_id, credential_type, credential_ref)
         DO UPDATE SET secret_hash = EXCLUDED.secret_hash, status = 'active'`,
        [identityId, secretHash]
      );
      await client.query(
        `UPDATE identities SET status = 'active', updated_at = now() WHERE id = $1 AND status = 'pending'`,
        [identityId]
      );
      await client.query(
        `UPDATE session_contexts SET revoked_at = now() WHERE identity_id = $1 AND revoked_at IS NULL`,
        [identityId]
      );
      await client.query(
        `UPDATE oauth_grants SET revoked_at = now(), revoked_reason = 'password_reset'
         WHERE identity_id = $1 AND revoked_at IS NULL`,
        [identityId]
      );
      return true;
    });
  }
}
