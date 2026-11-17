import { Injectable } from '@nestjs/common';
import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service';
import { AuthorizationRequestRecord, GrantRecord, GrantRevokedReason } from './oauth.types';

const REQUEST_SELECT = `id, oauth_client_id AS "oauthClientId", client_name AS "clientName",
  redirect_uri AS "redirectUri", code_challenge AS "codeChallenge", scopes, state, resource,
  expires_at AS "expiresAt", decided_at AS "decidedAt"`;

const GRANT_SELECT = `g.id, g.identity_id AS "identityId", g.client_id AS "clientId",
  g.application_id AS "applicationId", g.oauth_client_id AS "oauthClientId",
  g.client_name AS "clientName", g.scopes, g.resource, g.created_at AS "createdAt",
  g.last_used_at AS "lastUsedAt", g.revoked_at AS "revokedAt"`;

export interface CodeLookup {
  codeChallenge: string;
  redirectUri: string;
  expiresAt: Date;
  consumedAt: Date | null;
  grant: GrantRecord;
}

export type RefreshConsumption =
  | { status: 'ok'; grant: GrantRecord }
  | { status: 'reused'; grant: GrantRecord }
  | { status: 'invalid' };

interface Executor {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

@Injectable()
export class OAuthRepository {
  constructor(private readonly database: DatabaseService) {}

  transaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.database.transaction(handler);
  }

  async createAuthorizationRequest(input: Omit<AuthorizationRequestRecord, 'id' | 'decidedAt'>): Promise<string> {
    const result = await this.database.query<{ id: string }>(
      `INSERT INTO oauth_authorization_requests
         (oauth_client_id, client_name, redirect_uri, code_challenge, scopes, state, resource, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [input.oauthClientId, input.clientName, input.redirectUri, input.codeChallenge, input.scopes, input.state, input.resource, input.expiresAt]
    );
    return result.rows[0].id;
  }

  async findAuthorizationRequest(id: string): Promise<AuthorizationRequestRecord | null> {
    const result = await this.database.query<AuthorizationRequestRecord>(
      `SELECT ${REQUEST_SELECT} FROM oauth_authorization_requests WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /** Decisao unica: so o primeiro consentimento/recusa de um pedido valido vence. */
  async decideAuthorizationRequest(client: PoolClient, id: string): Promise<AuthorizationRequestRecord | null> {
    const result = await client.query<AuthorizationRequestRecord>(
      `UPDATE oauth_authorization_requests SET decided_at = now()
        WHERE id = $1 AND decided_at IS NULL AND expires_at > now()
        RETURNING ${REQUEST_SELECT}`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async createGrant(
    client: PoolClient,
    input: Pick<GrantRecord, 'identityId' | 'clientId' | 'applicationId' | 'oauthClientId' | 'clientName' | 'scopes' | 'resource'>
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO oauth_grants (identity_id, client_id, application_id, oauth_client_id, client_name, scopes, resource)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [input.identityId, input.clientId, input.applicationId, input.oauthClientId, input.clientName, input.scopes, input.resource]
    );
    return result.rows[0].id;
  }

  async createAuthorizationCode(
    client: PoolClient,
    input: { codeHash: Buffer; grantId: string; redirectUri: string; codeChallenge: string; expiresAt: Date }
  ): Promise<void> {
    await client.query(
      `INSERT INTO oauth_authorization_codes (code_hash, grant_id, redirect_uri, code_challenge, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.codeHash, input.grantId, input.redirectUri, input.codeChallenge, input.expiresAt]
    );
  }

  async findAuthorizationCode(codeHash: Buffer): Promise<CodeLookup | null> {
    return this.selectCode(this.database, codeHash, false);
  }

  /** Bloqueia o codigo para consumo; o chamador decide entre consumir e revogar. */
  async lockAuthorizationCode(client: PoolClient, codeHash: Buffer): Promise<CodeLookup | null> {
    return this.selectCode(client, codeHash, true);
  }

  async markCodeConsumed(client: PoolClient, codeHash: Buffer): Promise<void> {
    await client.query('UPDATE oauth_authorization_codes SET consumed_at = now() WHERE code_hash = $1', [codeHash]);
  }

  async insertToken(
    client: PoolClient,
    input: { tokenHash: Buffer; grantId: string; tokenType: 'access' | 'refresh'; expiresAt: Date }
  ): Promise<void> {
    await client.query(
      'INSERT INTO oauth_tokens (token_hash, grant_id, token_type, expires_at) VALUES ($1, $2, $3, $4)',
      [input.tokenHash, input.grantId, input.tokenType, input.expiresAt]
    );
  }

  /**
   * Rotacao do refresh token. Token ja consumido e reuso (indicio de roubo):
   * o chamador revoga a conexao inteira.
   */
  async consumeRefreshToken(client: PoolClient, tokenHash: Buffer): Promise<RefreshConsumption> {
    const result = await client.query<{ consumedAt: Date | null; expiresAt: Date } & GrantRecord>(
      `SELECT t.consumed_at AS "consumedAt", t.expires_at AS "expiresAt", ${GRANT_SELECT}
         FROM oauth_tokens t JOIN oauth_grants g ON g.id = t.grant_id
        WHERE t.token_hash = $1 AND t.token_type = 'refresh'
        FOR UPDATE OF t`,
      [tokenHash]
    );
    const row = result.rows[0];
    if (!row) {
      return { status: 'invalid' };
    }
    const { consumedAt, expiresAt, ...grant } = row;
    if (consumedAt) {
      return { status: 'reused', grant };
    }
    if (new Date(expiresAt).getTime() <= Date.now() || grant.revokedAt) {
      return { status: 'invalid' };
    }
    await client.query('UPDATE oauth_tokens SET consumed_at = now() WHERE token_hash = $1', [tokenHash]);
    return { status: 'ok', grant };
  }

  /** Conexao ativa de um access token valido; nulo para qualquer outro caso. */
  async findGrantByAccessToken(tokenHash: Buffer): Promise<(GrantRecord & { expiresAt: Date }) | null> {
    const result = await this.database.query<GrantRecord & { expiresAt: Date }>(
      `SELECT ${GRANT_SELECT}, t.expires_at AS "expiresAt"
         FROM oauth_tokens t JOIN oauth_grants g ON g.id = t.grant_id
        WHERE t.token_hash = $1 AND t.token_type = 'access'
          AND t.expires_at > now() AND g.revoked_at IS NULL`,
      [tokenHash]
    );
    return result.rows[0] ?? null;
  }

  async findGrantByAnyToken(tokenHash: Buffer): Promise<GrantRecord | null> {
    const result = await this.database.query<GrantRecord>(
      `SELECT ${GRANT_SELECT} FROM oauth_tokens t JOIN oauth_grants g ON g.id = t.grant_id WHERE t.token_hash = $1`,
      [tokenHash]
    );
    return result.rows[0] ?? null;
  }

  async touchGrant(grantId: string): Promise<void> {
    await this.database.query(
      `UPDATE oauth_grants SET last_used_at = now()
        WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`,
      [grantId]
    );
  }

  /** Idempotente: revogar de novo nao altera motivo nem data originais. */
  async revokeGrant(grantId: string, reason: GrantRevokedReason, executor: Executor = this.database): Promise<boolean> {
    const result = await executor.query(
      'UPDATE oauth_grants SET revoked_at = now(), revoked_reason = $2 WHERE id = $1 AND revoked_at IS NULL',
      [grantId, reason]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listActiveGrants(identityId: string, clientId: string, applicationId: string): Promise<GrantRecord[]> {
    const result = await this.database.query<GrantRecord>(
      `SELECT ${GRANT_SELECT} FROM oauth_grants g
        WHERE g.identity_id = $1 AND g.client_id = $2 AND g.application_id = $3 AND g.revoked_at IS NULL
        ORDER BY g.created_at DESC`,
      [identityId, clientId, applicationId]
    );
    return result.rows;
  }

  async findGrant(grantId: string): Promise<GrantRecord | null> {
    const result = await this.database.query<GrantRecord>(`SELECT ${GRANT_SELECT} FROM oauth_grants g WHERE g.id = $1`, [grantId]);
    return result.rows[0] ?? null;
  }

  private async selectCode(executor: Executor, codeHash: Buffer, lock: boolean): Promise<CodeLookup | null> {
    const result = await executor.query<{ codeChallenge: string; redirectUri: string; codeExpiresAt: Date; consumedAt: Date | null } & GrantRecord>(
      `SELECT c.code_challenge AS "codeChallenge", c.redirect_uri AS "redirectUri",
              c.expires_at AS "codeExpiresAt", c.consumed_at AS "consumedAt", ${GRANT_SELECT}
         FROM oauth_authorization_codes c JOIN oauth_grants g ON g.id = c.grant_id
        WHERE c.code_hash = $1${lock ? ' FOR UPDATE OF c' : ''}`,
      [codeHash]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const { codeChallenge, redirectUri, codeExpiresAt, consumedAt, ...grant } = row;
    return { codeChallenge, redirectUri, expiresAt: codeExpiresAt, consumedAt, grant };
  }
}
