import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { CredentialEnvelope } from '../crypto/credential-crypto.service';

export interface CredentialRecord { id: string; clientId: string; ownerIdentityId: string; provider: string; status: string; last4: string; ciphertext: Buffer | null; nonce: Buffer | null; authTag: Buffer | null; keyVersion: number; createdAt: Date; updatedAt: Date }
type Row = { id: string; client_id: string; owner_identity_id: string; provider: string; status: string; last4: string; ciphertext: Buffer | null; nonce: Buffer | null; auth_tag: Buffer | null; encryption_key_version: number; created_at: Date; updated_at: Date; inserted?: boolean };
const map = (row: Row): CredentialRecord => ({ id: row.id, clientId: row.client_id, ownerIdentityId: row.owner_identity_id, provider: row.provider, status: row.status, last4: row.last4, ciphertext: row.ciphertext, nonce: row.nonce, authTag: row.auth_tag, keyVersion: row.encryption_key_version, createdAt: row.created_at, updatedAt: row.updated_at });

@Injectable()
export class CredentialRepository {
  constructor(private readonly db: DatabaseService) {}
  async list(clientId: string, ownerIdentityId: string) {
    const result = await this.db.query<Row>('SELECT * FROM ai_credentials WHERE client_id=$1 AND owner_identity_id=$2 ORDER BY provider LIMIT 100', [clientId, ownerIdentityId]);
    return result.rows.map(map);
  }
  async find(id: string, clientId: string, ownerIdentityId: string) {
    const result = await this.db.query<Row>('SELECT * FROM ai_credentials WHERE id=$1 AND client_id=$2 AND owner_identity_id=$3', [id, clientId, ownerIdentityId]);
    return result.rows[0] ? map(result.rows[0]) : null;
  }
  async upsert(clientId: string, ownerIdentityId: string, provider: string, envelope: CredentialEnvelope, last4: string, id: string) {
    return this.db.transaction(async (client) => {
      const result = await client.query<Row>(`INSERT INTO ai_credentials (id,client_id,owner_identity_id,provider,ciphertext,nonce,auth_tag,encryption_key_version,last4,status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_validation')
        ON CONFLICT (client_id,owner_identity_id,provider) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,nonce=EXCLUDED.nonce,auth_tag=EXCLUDED.auth_tag,encryption_key_version=EXCLUDED.encryption_key_version,last4=EXCLUDED.last4,status='pending_validation',validated_at=NULL,revoked_at=NULL,updated_at=NOW()
        RETURNING *, (xmax = 0) AS inserted`, [id, clientId, ownerIdentityId, provider, envelope.ciphertext, envelope.nonce, envelope.authTag, envelope.keyVersion, last4]);
      const record = map(result.rows[0]);
      await this.audit(client, record, result.rows[0].inserted ? 'created' : 'updated', 'accepted');
      return record;
    });
  }
  async setStatus(id: string, clientId: string, ownerIdentityId: string, status: 'active' | 'invalid', expectedNonce: Buffer) {
    return this.db.transaction(async (client) => {
      const result = await client.query<Row>("UPDATE ai_credentials SET status=$4,validated_at=NOW(),updated_at=NOW() WHERE id=$1 AND client_id=$2 AND owner_identity_id=$3 AND nonce=$5 AND status <> 'revoked' RETURNING *", [id, clientId, ownerIdentityId, status, expectedNonce]);
      const record = result.rows[0] ? map(result.rows[0]) : null;
      if (record) await this.audit(client, record, 'tested', status);
      return record;
    });
  }
  async revoke(id: string, clientId: string, ownerIdentityId: string) {
    return this.db.transaction(async (client) => {
      const result = await client.query<Row>("UPDATE ai_credentials SET status='revoked',ciphertext=NULL,nonce=NULL,auth_tag=NULL,revoked_at=NOW(),updated_at=NOW() WHERE id=$1 AND client_id=$2 AND owner_identity_id=$3 RETURNING *", [id, clientId, ownerIdentityId]);
      const record = result.rows[0] ? map(result.rows[0]) : null;
      if (record) await this.audit(client, record, 'revoked', 'accepted');
      return record;
    });
  }
  private async audit(client: PoolClient, record: CredentialRecord, eventType: 'created' | 'updated' | 'tested' | 'revoked', outcome: string) {
    await client.query('INSERT INTO ai_credential_audit (credential_id,client_id,owner_identity_id,event_type,outcome) VALUES ($1,$2,$3,$4,$5)', [record.id, record.clientId, record.ownerIdentityId, eventType, outcome]);
  }
}
