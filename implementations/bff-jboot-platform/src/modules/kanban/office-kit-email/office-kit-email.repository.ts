import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export const MAX_KIT_EMAIL_ATTEMPTS = 5;

export interface KitEmailSettingsRow {
  officeId: string;
  enabled: boolean;
  subject: string;
  body: string;
  updatedAt: string;
}

export interface KitEmailRow {
  id: string;
  createdByIdentityId?: string;
  customerId: string;
  kitId: string;
  toEmail: string;
  subject: string;
  body: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attemptCount: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

const EMAIL_COLUMNS = `id, customer_id AS "customerId", kit_id AS "kitId", to_email AS "toEmail", subject, body, status,
  attempt_count AS "attemptCount", last_error AS "lastError", sent_at AS "sentAt", created_at AS "createdAt"`;

/** E-mail do kit ao cliente (docs/product/flow-signed-kit-sprints.md, S4): configuracao por escritorio e fila. */
@Injectable()
export class OfficeKitEmailRepository {
  constructor(private readonly db: DatabaseService) {}

  async getSettings(ref: string, clientId: string, officeId: string): Promise<KitEmailSettingsRow | null> {
    const result = await this.db.queryForDatabaseRef<KitEmailSettingsRow>(
      ref,
      `SELECT office_id AS "officeId", enabled, subject, body, updated_at AS "updatedAt"
       FROM kanban_office_kit_email_settings WHERE client_id = $1 AND office_id = $2`,
      [clientId, officeId]
    );
    return result.rows[0] ?? null;
  }

  async putSettings(ref: string, clientId: string, officeId: string, input: { enabled: boolean; subject: string; body: string }, identityId: string) {
    await this.db.queryForDatabaseRef(
      ref,
      `INSERT INTO kanban_office_kit_email_settings (client_id, office_id, enabled, subject, body, updated_by_identity_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (client_id, office_id) DO UPDATE SET enabled = EXCLUDED.enabled, subject = EXCLUDED.subject, body = EXCLUDED.body,
         updated_by_identity_id = EXCLUDED.updated_by_identity_id, updated_at = clock_timestamp()`,
      [clientId, officeId, input.enabled, input.subject, input.body, identityId]
    );
  }

  /** Um envio por kit; repetir a geracao do mesmo kit nao duplica. */
  async enqueue(
    ref: string,
    clientId: string,
    input: { id: string; customerId: string; kitId: string; toEmail: string; subject: string; body: string; identityId: string }
  ): Promise<boolean> {
    const result = await this.db.queryForDatabaseRef(
      ref,
      `INSERT INTO kanban_office_kit_emails (id, client_id, customer_id, kit_id, to_email, subject, body, created_by_identity_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (client_id, kit_id) DO NOTHING`,
      [input.id, clientId, input.customerId, input.kitId, input.toEmail, input.subject, input.body, input.identityId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async forKit(ref: string, clientId: string, kitId: string): Promise<KitEmailRow | null> {
    const result = await this.db.queryForDatabaseRef<KitEmailRow>(
      ref,
      `SELECT ${EMAIL_COLUMNS} FROM kanban_office_kit_emails WHERE client_id = $1 AND kit_id = $2`,
      [clientId, kitId]
    );
    return result.rows[0] ?? null;
  }

  /** Reserva o proximo envio vencido (ou parado em `sending` com reserva vencida) por 2 minutos. */
  async claim(ref: string, clientId: string): Promise<(KitEmailRow & { storageKey: string; fileName: string; leaseUntil: string }) | null> {
    const result = await this.db.queryForDatabaseRef<KitEmailRow & { storageKey: string; fileName: string; leaseUntil: string }>(
      ref,
      `WITH next AS (
         SELECT e.id FROM kanban_office_kit_emails e
         WHERE e.client_id = $1 AND e.attempt_count < $2
           AND ((e.status = 'pending' AND e.next_attempt_at <= clock_timestamp())
             OR (e.status = 'sending' AND e.lease_until < clock_timestamp()))
         ORDER BY e.created_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE kanban_office_kit_emails e
       SET status = 'sending', attempt_count = e.attempt_count + 1, lease_until = clock_timestamp() + interval '2 minutes',
           updated_at = clock_timestamp()
       FROM next, kanban_customer_office_kits k
       WHERE e.id = next.id AND k.client_id = e.client_id AND k.id = e.kit_id
       RETURNING e.id, e.customer_id AS "customerId", e.kit_id AS "kitId", e.to_email AS "toEmail", e.subject, e.body, e.status,
         e.attempt_count AS "attemptCount", e.last_error AS "lastError", e.sent_at AS "sentAt", e.created_at AS "createdAt",
         k.storage_key AS "storageKey", k.file_name AS "fileName", e.lease_until::text AS "leaseUntil",
         e.created_by_identity_id AS "createdByIdentityId"`,
      [clientId, MAX_KIT_EMAIL_ATTEMPTS]
    );
    return result.rows[0] ?? null;
  }

  async markSent(ref: string, clientId: string, id: string, leaseUntil: string): Promise<boolean> {
    const result = await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_office_kit_emails
       SET status = 'sent', sent_at = clock_timestamp(), lease_until = NULL, next_attempt_at = NULL, last_error = NULL, updated_at = clock_timestamp()
       WHERE client_id = $1 AND id = $2 AND status = 'sending' AND lease_until = $3::timestamptz`,
      [clientId, id, leaseUntil]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Falha: nova tentativa com espera crescente (1, 2, 4, 8 min); na ultima, `failed`. */
  async markFailed(ref: string, clientId: string, id: string, leaseUntil: string, code: string): Promise<'retry' | 'failed' | 'skipped'> {
    const result = await this.db.queryForDatabaseRef<{ status: string }>(
      ref,
      `UPDATE kanban_office_kit_emails
       SET status = CASE WHEN attempt_count >= $4 THEN 'failed' ELSE 'pending' END,
           next_attempt_at = CASE WHEN attempt_count >= $4 THEN NULL
                                  ELSE clock_timestamp() + make_interval(mins => power(2, attempt_count - 1)::int) END,
           lease_until = NULL, last_error = $5, updated_at = clock_timestamp()
       WHERE client_id = $1 AND id = $2 AND status = 'sending' AND lease_until = $3::timestamptz
       RETURNING status`,
      [clientId, id, leaseUntil, MAX_KIT_EMAIL_ATTEMPTS, code.slice(0, 80)]
    );
    const status = result.rows[0]?.status;
    return status === 'failed' ? 'failed' : status === 'pending' ? 'retry' : 'skipped';
  }
}
