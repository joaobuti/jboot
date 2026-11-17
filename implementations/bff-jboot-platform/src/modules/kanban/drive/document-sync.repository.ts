import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export const MAX_SYNC_ATTEMPTS = 5;

export type SyncSourceType = 'generated_document' | 'customer_document' | 'office_kit' | 'card_extra_document' | 'signed_kit';

export interface ClaimedSync {
  id: string;
  sourceType: SyncSourceType;
  documentId: string;
  documentVersion: number;
  checksum: string;
  remoteFileId: string | null;
  /** Documento avulso removido no Flow: o worker manda o arquivo do Drive para a lixeira. */
  removeRequested: boolean;
  attemptCount: number;
  /** Fim da reserva deste worker: so quem ainda a tem grava o resultado (fencing). */
  leaseUntil: string;
  refreshTokenEnc: Buffer;
  rootFolderId: string;
}

/** Objeto canonico e contexto de pasta de um item da replica (peticao ou documento da ficha). */
export interface SyncSource {
  storageKey: string;
  contentType: string;
  customerId: string | null;
  /** Peticao: card/escritorio para o caminho legado quando nao ha cliente com CPF. */
  cardId: string | null;
  officeId: string | null;
  /** Documento da ficha: tipo do catalogo (nome legivel do arquivo). */
  documentType: string | null;
  /** Escritorio da pasta no Drive (ADR 019, decisao 17): validacao confirmada mais recente, senao o do cliente. */
  officeName: string | null;
  /** Peticao da rotina (ADR 020): `Inicial_[JEC|JEF]_[Banco]_[PrimeiroNome].docx`. */
  fileName?: string | null;
}

export interface SyncedCandidate {
  id: string;
  checksum: string;
  remoteFileId: string;
  refreshTokenEnc: Buffer;
}

@Injectable()
export class DocumentSyncRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Serializa os envios ao Drive do cliente com trava consultiva do PostgreSQL, valida entre instancias
   * do BFF: pastas e arquivos sao achados pelo nome antes de criar, e o envio seguinte ja ve o que o
   * anterior criou. A conexao fica presa so durante o envio.
   */
  async withClientDriveLock<T>(ref: string, clientId: string, run: () => Promise<T>): Promise<T> {
    return this.db.transactionForDatabaseRef(ref, async (tx) => {
      await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`kanban-drive-sync:${clientId}`]);
      return run();
    });
  }

  async claim(ref: string, clientId: string, syncId: string) {
    await this.recoverExpired(ref, clientId, syncId);
    const result = await this.db.queryForDatabaseRef<ClaimedSync>(
      ref,
      `UPDATE kanban_document_syncs s
       SET state = 'syncing', attempt_count = attempt_count + 1,
           lease_until = clock_timestamp() + interval '3 minutes', updated_at = now()
       FROM kanban_drive_configurations cfg
       WHERE s.client_id = $1 AND s.id = $2 AND cfg.client_id = s.client_id AND cfg.status = 'active'
         AND s.state IN ('pending', 'failed') AND s.next_attempt_at <= now()
         AND (s.lease_until IS NULL OR s.lease_until < now()) AND s.attempt_count < $3
       RETURNING s.id, s.source_type AS "sourceType", s.document_id AS "documentId",
         s.document_version AS "documentVersion", s.checksum, s.remote_file_id AS "remoteFileId",
         (s.remove_requested_at IS NOT NULL) AS "removeRequested", s.attempt_count AS "attemptCount", s.lease_until::text AS "leaseUntil", cfg.refresh_token_enc AS "refreshTokenEnc",
         cfg.root_folder_id AS "rootFolderId"`,
      [clientId, syncId, MAX_SYNC_ATTEMPTS]
    );
    return result.rows[0] ?? null;
  }

  /** Origem do item reservado; null quando o objeto canonico nao existe mais. */
  async source(ref: string, clientId: string, sync: Pick<ClaimedSync, 'sourceType' | 'documentId'>): Promise<SyncSource | null> {
    // Kit do escritorio (Sprint 4): pasta do escritorio do modelo usado, nome `KIT_<NOME>_<data>.docx`.
    const officeKit = `SELECT k.storage_key AS "storageKey",
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' AS "contentType",
                  k.customer_id AS "customerId", NULL::uuid AS "cardId", k.office_id AS "officeId", NULL AS "documentType",
                  o.name AS "officeName", k.file_name AS "fileName"
           FROM kanban_customer_office_kits k
           JOIN kanban_offices o ON o.client_id = k.client_id AND o.id = k.office_id
           WHERE k.client_id = $1 AND k.id = $2`;
    // Documento avulso do card (D1): pasta do cliente do card; nome do arquivo enviado.
    const extraDocument = `SELECT a.storage_key AS "storageKey", a.content_type AS "contentType",
                  cc.customer_id AS "customerId", d.card_id AS "cardId", c.office_id AS "officeId", NULL AS "documentType",
                  o.name AS "officeName", a.file_name AS "fileName"
           FROM kanban_card_extra_documents d
           JOIN kanban_card_attachments a ON a.client_id = d.client_id AND a.id = d.attachment_id
           JOIN kanban_cards c ON c.client_id = d.client_id AND c.id = d.card_id
           LEFT JOIN kanban_offices o ON o.client_id = c.client_id AND o.id = c.office_id
           LEFT JOIN kanban_card_customers cc ON cc.client_id = c.client_id AND cc.card_id = c.id
           WHERE d.client_id = $1 AND d.id = $2`;
    // Kit assinado aprovado (flow-signed-kit-sprints.md, S2): pasta do escritorio do kit, nome do kit + _ASSINADO.
    const signedKit = `SELECT s.storage_key AS "storageKey", s.content_type AS "contentType",
                  s.customer_id AS "customerId", NULL::uuid AS "cardId", k.office_id AS "officeId", NULL AS "documentType",
                  o.name AS "officeName", k.file_name AS "fileName"
           FROM kanban_customer_signed_kits s
           JOIN kanban_customer_office_kits k ON k.client_id = s.client_id AND k.id = s.kit_id
           JOIN kanban_offices o ON o.client_id = k.client_id AND o.id = k.office_id
           WHERE s.client_id = $1 AND s.id = $2`;
    const sql = sync.sourceType === 'signed_kit' ? signedKit : sync.sourceType === 'card_extra_document' ? extraDocument : sync.sourceType === 'office_kit' ? officeKit :
      sync.sourceType === 'customer_document'
        ? `SELECT cd.storage_key AS "storageKey", cd.content_type AS "contentType", cd.customer_id AS "customerId",
                  NULL::uuid AS "cardId", NULL::uuid AS "officeId", cd.document_type AS "documentType",
                  COALESCE(
                    (SELECT o.name FROM kanban_customer_validation_runs r
                     JOIN kanban_offices o ON o.client_id = r.client_id
                       AND o.id = COALESCE(r.intake_office_id, r.contract_office_id, r.office_id)
                     WHERE r.client_id = cd.client_id AND r.customer_id = cd.customer_id AND r.confirmed_at IS NOT NULL
                     ORDER BY r.confirmed_at DESC LIMIT 1),
                    (SELECT o.name FROM kanban_customer_offices co
                     JOIN kanban_offices o ON o.client_id = co.client_id AND o.id = co.office_id
                     WHERE co.client_id = cd.client_id AND co.customer_id = cd.customer_id AND co.unlinked_at IS NULL
                     ORDER BY co.linked_at, co.office_id LIMIT 1)
                  ) AS "officeName"
           FROM kanban_customer_documents cd WHERE cd.client_id = $1 AND cd.id = $2`
        : `SELECT d.storage_key AS "storageKey",
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' AS "contentType",
                  cc.customer_id AS "customerId", d.card_id AS "cardId", c.office_id AS "officeId", NULL AS "documentType",
                  o.name AS "officeName", p.file_name AS "fileName"
           FROM kanban_card_generated_documents d
           LEFT JOIN kanban_card_initial_petitions p ON p.client_id = d.client_id AND p.id = d.petition_id
           JOIN kanban_cards c ON c.client_id = d.client_id AND c.id = d.card_id
           LEFT JOIN kanban_offices o ON o.client_id = c.client_id AND o.id = c.office_id
           LEFT JOIN kanban_card_customers cc ON cc.client_id = c.client_id AND cc.card_id = c.id
           WHERE d.client_id = $1 AND d.id = $2`;
    const result = await this.db.queryForDatabaseRef<SyncSource>(ref, sql, [clientId, sync.documentId]);
    return result.rows[0] ?? null;
  }

  /**
   * Grava o resultado so se este worker ainda tem a reserva (mesma tentativa e mesmo fim de reserva,
   * ainda valida). Reserva vencida ou tomada por outro worker: `false`, nada muda.
   */
  async complete(
    ref: string,
    clientId: string,
    id: string,
    claim: Pick<ClaimedSync, 'attemptCount' | 'leaseUntil'>,
    remote: { remoteFileId: string; remoteVersion: string | null }
  ): Promise<boolean> {
    const result = await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_document_syncs
       SET state = CASE WHEN remove_requested_at IS NULL THEN 'synced' ELSE 'pending' END,
           remote_file_id = $3, remote_version = $4, lease_until = NULL,
           next_attempt_at = CASE WHEN remove_requested_at IS NULL THEN NULL ELSE now() END, last_error_code = NULL,
           last_reconciled_at = now(), updated_at = now()
       WHERE client_id = $1 AND id = $2 AND state = 'syncing'
         AND attempt_count = $5 AND lease_until = $6::timestamptz AND lease_until > now()`,
      [clientId, id, remote.remoteFileId, remote.remoteVersion, claim.attemptCount, claim.leaseUntil]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Remocao concluida no Drive (ou nada a remover): sai da fila de vez. Mesmo fencing de `complete`. */
  async markRemoved(ref: string, clientId: string, id: string, claim: Pick<ClaimedSync, 'attemptCount' | 'leaseUntil'>): Promise<boolean> {
    const result = await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_document_syncs
       SET state = 'deleted', lease_until = NULL, next_attempt_at = NULL, last_error_code = NULL, updated_at = now()
       WHERE client_id = $1 AND id = $2 AND state = 'syncing'
         AND attempt_count = $3 AND lease_until = $4::timestamptz AND lease_until > now()`,
      [clientId, id, claim.attemptCount, claim.leaseUntil]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async fail(
    ref: string,
    clientId: string,
    id: string,
    claim: Pick<ClaimedSync, 'attemptCount' | 'leaseUntil'>,
    code: string,
    final: boolean
  ): Promise<boolean> {
    const result = await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_document_syncs
       SET state = 'failed', lease_until = NULL, last_error_code = $3,
           next_attempt_at = CASE WHEN $4 THEN NULL ELSE now() +
             make_interval(secs => LEAST(3600, 30 * power(2, GREATEST(attempt_count - 1, 0)))::integer) END,
           updated_at = now()
       WHERE client_id = $1 AND id = $2 AND state = 'syncing'
         AND attempt_count = $5 AND lease_until = $6::timestamptz AND lease_until > now()`,
      [clientId, id, code.slice(0, 80), final, claim.attemptCount, claim.leaseUntil]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Token revogado/expirado: pausa o envio ate o cliente reconectar a conta. */
  async markConfigInvalid(ref: string, clientId: string, code: string) {
    await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_drive_configurations SET status = 'invalid', last_error_code = $2, updated_at = now()
       WHERE client_id = $1 AND status = 'active'`,
      [clientId, code]
    );
  }

  async stale(ref: string, clientId: string) {
    await this.recoverExpired(ref, clientId);
    const result = await this.db.queryForDatabaseRef<{ id: string }>(
      ref,
      `SELECT s.id
       FROM kanban_document_syncs s
       JOIN kanban_drive_configurations c ON c.client_id = s.client_id AND c.status = 'active'
       WHERE s.client_id = $1 AND s.state IN ('pending', 'failed')
         AND s.next_attempt_at <= now() AND (s.lease_until IS NULL OR s.lease_until < now())
         AND s.attempt_count < $2
       ORDER BY s.created_at LIMIT 100`,
      [clientId, MAX_SYNC_ATTEMPTS]
    );
    return result.rows.map(({ id }) => id);
  }

  /** Item preso em `syncing` com reserva vencida (worker caiu): volta como falha para nova tentativa. */
  private async recoverExpired(ref: string, clientId: string, syncId: string | null = null) {
    await this.db.queryForDatabaseRef(
      ref,
      `WITH expired AS (
         SELECT s.id FROM kanban_document_syncs s
         WHERE s.client_id = $1 AND s.state = 'syncing' AND s.lease_until <= now()
           AND ($3::uuid IS NULL OR s.id = $3::uuid)
         ORDER BY s.lease_until, s.id LIMIT 100 FOR UPDATE SKIP LOCKED
       )
       UPDATE kanban_document_syncs s
       SET state = 'failed', lease_until = NULL, last_error_code = 'sync_lease_expired',
           next_attempt_at = CASE WHEN s.attempt_count < $2 THEN now() ELSE NULL END,
           updated_at = now()
       FROM expired e WHERE s.client_id = $1 AND s.id = e.id`,
      [clientId, MAX_SYNC_ATTEMPTS, syncId]
    );
  }

  async reconcileMissing(ref: string, clientId: string) {
    const result = await this.db.queryForDatabaseRef(
      ref,
      `INSERT INTO kanban_document_syncs
         (client_id, document_id, document_version, checksum, state, next_attempt_at)
       SELECT d.client_id, d.id, d.version, d.sha256, 'pending', now()
       FROM kanban_card_generated_documents d
       JOIN kanban_drive_configurations cfg ON cfg.client_id = d.client_id AND cfg.status = 'active'
       WHERE d.client_id = $1 AND d.status = 'aprovado'
       ON CONFLICT (client_id, document_id, document_version, checksum, provider) DO NOTHING`,
      [clientId]
    );
    // Documentos da ficha de validacoes confirmadas (Drive ligado depois da confirmacao).
    const customers = await this.db.queryForDatabaseRef(
      ref,
      `INSERT INTO kanban_document_syncs
         (client_id, document_id, document_version, checksum, state, next_attempt_at, source_type, customer_id)
       SELECT cd.client_id, cd.id, cd.version, cd.sha256, 'pending', now(), 'customer_document', cd.customer_id
       FROM kanban_customer_validation_runs r
       CROSS JOIN LATERAL jsonb_array_elements(r.documents_snapshot) item
       JOIN kanban_customer_documents cd ON cd.client_id = r.client_id AND cd.id = (item->>'documentId')::uuid
       JOIN kanban_drive_configurations cfg ON cfg.client_id = r.client_id AND cfg.status = 'active'
       WHERE r.client_id = $1 AND r.confirmed_at IS NOT NULL
       ON CONFLICT (client_id, document_id, document_version, checksum, provider) DO NOTHING`,
      [clientId]
    );
    // Kits gerados com o Drive desligado sobem quando ele volta (Sprint 4, Q4).
    const kits = await this.db.queryForDatabaseRef(
      ref,
      `INSERT INTO kanban_document_syncs
         (client_id, document_id, document_version, checksum, state, next_attempt_at, source_type, customer_id)
       SELECT k.client_id, k.id, 1, k.sha256, 'pending', now(), 'office_kit', k.customer_id
       FROM kanban_customer_office_kits k
       JOIN kanban_drive_configurations cfg ON cfg.client_id = k.client_id AND cfg.status = 'active'
       WHERE k.client_id = $1
       ON CONFLICT (client_id, document_id, document_version, checksum, provider) DO NOTHING`,
      [clientId]
    );
    // HISCON enviado depois da validacao confirmada sem ele (Promobank, 2026-11-02): sobe como os validados.
    const lateHiscon = await this.db.queryForDatabaseRef(
      ref,
      `INSERT INTO kanban_document_syncs
         (client_id, document_id, document_version, checksum, state, next_attempt_at, source_type, customer_id)
       SELECT cd.client_id, cd.id, cd.version, cd.sha256, 'pending', now(), 'customer_document', cd.customer_id
       FROM kanban_customer_documents cd
       JOIN kanban_drive_configurations cfg ON cfg.client_id = cd.client_id AND cfg.status = 'active'
       CROSS JOIN LATERAL (
         SELECT r.documents_snapshot FROM kanban_customer_validation_runs r
         WHERE r.client_id = cd.client_id AND r.customer_id = cd.customer_id AND r.confirmed_at IS NOT NULL
         ORDER BY r.confirmed_at DESC LIMIT 1
       ) latest
       WHERE cd.client_id = $1 AND cd.document_type = 'extrato_beneficio'
         AND cd.superseded_at IS NULL AND cd.removed_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(latest.documents_snapshot) item WHERE item->>'type' = 'extrato_beneficio')
       ON CONFLICT (client_id, document_id, document_version, checksum, provider) DO NOTHING`,
      [clientId]
    );
    // Kit assinado aprovado e confirmado (S2) com o Drive ligado depois: so a versao atual.
    const signedKits = await this.db.queryForDatabaseRef(
      ref,
      `INSERT INTO kanban_document_syncs
         (client_id, document_id, document_version, checksum, state, next_attempt_at, source_type, customer_id)
       SELECT s.client_id, s.id, s.version, s.sha256, 'pending', now(), 'signed_kit', s.customer_id
       FROM kanban_customer_signed_kits s
       JOIN kanban_drive_configurations cfg ON cfg.client_id = s.client_id AND cfg.status = 'active'
       WHERE s.client_id = $1 AND s.superseded_at IS NULL
         AND EXISTS (SELECT 1 FROM kanban_signed_kit_validations v
                     WHERE v.client_id = s.client_id AND v.signed_kit_id = s.id AND v.verdict = 'aprovado' AND v.confirmed_at IS NOT NULL)
       ON CONFLICT (client_id, document_id, document_version, checksum, provider) DO NOTHING`,
      [clientId]
    );
    // Avulsos do card ainda no bloco Documentos (removido nao sobe).
    const extras = await this.db.queryForDatabaseRef(
      ref,
      `INSERT INTO kanban_document_syncs
         (client_id, document_id, document_version, checksum, state, next_attempt_at, source_type, customer_id)
       SELECT d.client_id, d.id, 1, d.sha256, 'pending', now(), 'card_extra_document', cc.customer_id
       FROM kanban_card_extra_documents d
       JOIN kanban_drive_configurations cfg ON cfg.client_id = d.client_id AND cfg.status = 'active'
       LEFT JOIN kanban_card_customers cc ON cc.client_id = d.client_id AND cc.card_id = d.card_id
       WHERE d.client_id = $1 AND d.removed_at IS NULL
       ON CONFLICT (client_id, document_id, document_version, checksum, provider) DO NOTHING`,
      [clientId]
    );
    return (result.rowCount ?? 0) + (customers.rowCount ?? 0) + (kits.rowCount ?? 0) + (extras.rowCount ?? 0) + (lateHiscon.rowCount ?? 0) + (signedKits.rowCount ?? 0);
  }

  async syncedCandidates(ref: string, clientId: string) {
    const result = await this.db.queryForDatabaseRef<SyncedCandidate>(
      ref,
      `SELECT s.id, s.checksum, s.remote_file_id AS "remoteFileId", cfg.refresh_token_enc AS "refreshTokenEnc"
       FROM kanban_document_syncs s
       JOIN kanban_drive_configurations cfg ON cfg.client_id = s.client_id AND cfg.status = 'active'
       WHERE s.client_id = $1 AND s.state = 'synced' AND s.remote_file_id IS NOT NULL
         AND (s.last_reconciled_at IS NULL OR s.last_reconciled_at < now() - interval '6 hours')
       ORDER BY s.last_reconciled_at NULLS FIRST, s.updated_at
       LIMIT 100`,
      [clientId]
    );
    return result.rows;
  }

  async markReconciled(ref: string, clientId: string, id: string) {
    await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_document_syncs SET last_reconciled_at = now(), updated_at = now()
       WHERE client_id = $1 AND id = $2 AND state = 'synced'`,
      [clientId, id]
    );
  }

  async requeueReplica(ref: string, clientId: string, id: string, code: string) {
    await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_document_syncs
       SET state = 'pending', remote_file_id = NULL, remote_version = NULL, attempt_count = 0,
           next_attempt_at = now(), lease_until = NULL, last_error_code = $3,
           last_reconciled_at = now(), updated_at = now()
       WHERE client_id = $1 AND id = $2 AND state = 'synced'`,
      [clientId, id, code]
    );
  }

  async operations(ref: string, clientId: string) {
    const summary = await this.db.queryForDatabaseRef<{
      pending: number; syncing: number; synced: number; retrying: number; failed: number; oldestPendingSeconds: number | null;
    }>(
      ref,
      `SELECT
         count(*) FILTER (WHERE state = 'pending')::integer AS pending,
         count(*) FILTER (WHERE state = 'syncing')::integer AS syncing,
         count(*) FILTER (WHERE state = 'synced')::integer AS synced,
         count(*) FILTER (WHERE state = 'failed' AND next_attempt_at IS NOT NULL)::integer AS retrying,
         count(*) FILTER (WHERE state = 'failed' AND next_attempt_at IS NULL)::integer AS failed,
         EXTRACT(EPOCH FROM now() - min(created_at) FILTER (WHERE state IN ('pending','syncing') OR (state = 'failed' AND next_attempt_at IS NOT NULL)))::integer AS "oldestPendingSeconds"
       FROM kanban_document_syncs WHERE client_id = $1`,
      [clientId]
    );
    const failed = await this.db.queryForDatabaseRef<{
      id: string; documentId: string; documentVersion: number; errorCode: string | null; updatedAt: string;
    }>(
      ref,
      `SELECT id, document_id AS "documentId", document_version AS "documentVersion",
         last_error_code AS "errorCode", updated_at AS "updatedAt"
       FROM kanban_document_syncs
       WHERE client_id = $1 AND state = 'failed' AND next_attempt_at IS NULL
       ORDER BY updated_at DESC LIMIT 50`,
      [clientId]
    );
    return { summary: summary.rows[0], failed: failed.rows };
  }

  async reprocess(ref: string, clientId: string, id: string) {
    const result = await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_document_syncs
       SET state = 'pending', attempt_count = 0, next_attempt_at = now(),
           lease_until = NULL, last_error_code = NULL, updated_at = now()
       WHERE client_id = $1 AND id = $2 AND state = 'failed'`,
      [clientId, id]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
