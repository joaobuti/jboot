import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { DISPATCHED_RUN_TIMEOUT_MINUTES, ROUTINE_PICKUP_TIMEOUT_MINUTES } from '../customer-validation/customer-validation.repository';
import { KanbanViewer, visibleCardScope } from '../shared/card-visibility';

export type SignatureVerdict = 'aprovado' | 'pendencias';
export type SignatureRunStatus = 'dispatching' | 'dispatched' | 'answered' | 'failed' | 'expired';

export interface SignatureFinding {
  item: string;
  status: 'ok' | 'pendente' | 'ilegivel' | 'divergente';
  note: string;
}

export interface SignedKitRow {
  id: string;
  customerId: string;
  kitId: string;
  version: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  uploadedByIdentityId: string;
  createdAt: string;
}

export interface SignatureRunRow {
  id: string;
  customerId: string;
  kitId: string;
  signedKitId: string;
  agentId: string;
  executorIdentityId: string;
  status: SignatureRunStatus;
  errorCode: string | null;
  externalSessionUrl: string | null;
  verdict: SignatureVerdict | null;
  summary: string | null;
  findings: SignatureFinding[] | null;
  answeredAt: string | null;
  confirmedAt: string | null;
  confirmedByIdentityId: string | null;
  createdAt: string;
}

const SIGNED_COLUMNS = `id, customer_id AS "customerId", kit_id AS "kitId", version, file_name AS "fileName",
  content_type AS "contentType", size_bytes AS "sizeBytes", sha256, storage_key AS "storageKey",
  uploaded_by_identity_id AS "uploadedByIdentityId", created_at AS "createdAt"`;

const RUN_COLUMNS = `id, customer_id AS "customerId", kit_id AS "kitId", signed_kit_id AS "signedKitId", agent_id AS "agentId",
  executor_identity_id AS "executorIdentityId", status, error_code AS "errorCode", external_session_url AS "externalSessionUrl",
  verdict, summary, findings, answered_at AS "answeredAt", confirmed_at AS "confirmedAt",
  confirmed_by_identity_id AS "confirmedByIdentityId", created_at AS "createdAt"`;

/** Mesmos prazos da validacao de cadastro: 5 min sem a rotina chegar, 15 min parada depois disso. */
const EXPIRE_STALE = `UPDATE kanban_signed_kit_validations
  SET status = 'expired',
      error_code = CASE WHEN picked_up_at IS NULL THEN 'routine_not_reached' ELSE 'routine_no_answer' END,
      updated_at = clock_timestamp()
  WHERE client_id = $1 AND kit_id = $2 AND status = 'dispatched'
    AND updated_at < clock_timestamp() - make_interval(mins => CASE WHEN picked_up_at IS NULL THEN $3::int ELSE $4::int END)`;

/**
 * Kit assinado e execucoes do Validador de assinatura (docs/product/flow-signed-kit-sprints.md, S2). O kit
 * original nunca muda; o assinado tem versoes e a validacao vale para uma versao exata.
 */
@Injectable()
export class SignedKitRepository {
  constructor(private readonly db: DatabaseService) {}

  async currentSigned(ref: string, clientId: string, kitId: string): Promise<SignedKitRow | null> {
    const result = await this.db.queryForDatabaseRef<SignedKitRow>(
      ref,
      `SELECT ${SIGNED_COLUMNS} FROM kanban_customer_signed_kits
       WHERE client_id = $1 AND kit_id = $2 AND superseded_at IS NULL`,
      [clientId, kitId]
    );
    return result.rows[0] ?? null;
  }

  async findSigned(ref: string, clientId: string, kitId: string, signedKitId: string): Promise<SignedKitRow | null> {
    const result = await this.db.queryForDatabaseRef<SignedKitRow>(
      ref,
      `SELECT ${SIGNED_COLUMNS} FROM kanban_customer_signed_kits WHERE client_id = $1 AND kit_id = $2 AND id = $3`,
      [clientId, kitId, signedKitId]
    );
    return result.rows[0] ?? null;
  }

  /** Nova versao atual; a anterior fica guardada e a validacao em andamento dela expira. */
  async createVersion(
    ref: string,
    clientId: string,
    input: Omit<SignedKitRow, 'version' | 'createdAt'>
  ): Promise<SignedKitRow> {
    return this.db.transactionForDatabaseRef(ref, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`kanban_signed_kit:${clientId}:${input.kitId}`]);
      const next = await client.query<{ version: number }>(
        `SELECT COALESCE(MAX(version), 0) + 1 AS version FROM kanban_customer_signed_kits WHERE client_id = $1 AND kit_id = $2`,
        [clientId, input.kitId]
      );
      await client.query(
        `UPDATE kanban_signed_kit_validations
         SET status = 'expired', error_code = 'signed_kit_replaced', updated_at = clock_timestamp()
         WHERE client_id = $1 AND kit_id = $2 AND status IN ('dispatching', 'dispatched')`,
        [clientId, input.kitId]
      );
      await client.query(
        `UPDATE kanban_customer_signed_kits SET superseded_at = clock_timestamp()
         WHERE client_id = $1 AND kit_id = $2 AND superseded_at IS NULL`,
        [clientId, input.kitId]
      );
      const inserted = await client.query<SignedKitRow>(
        `INSERT INTO kanban_customer_signed_kits
           (id, client_id, customer_id, kit_id, version, file_name, content_type, size_bytes, sha256, storage_key, uploaded_by_identity_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING ${SIGNED_COLUMNS}`,
        [input.id, clientId, input.customerId, input.kitId, Number(next.rows[0].version), input.fileName, input.contentType,
          input.sizeBytes, input.sha256, input.storageKey, input.uploadedByIdentityId]
      );
      return inserted.rows[0];
    });
  }

  async latestRun(ref: string, clientId: string, kitId: string): Promise<SignatureRunRow | null> {
    await this.db.queryForDatabaseRef(ref, EXPIRE_STALE, [clientId, kitId, ROUTINE_PICKUP_TIMEOUT_MINUTES, DISPATCHED_RUN_TIMEOUT_MINUTES]);
    const result = await this.db.queryForDatabaseRef<SignatureRunRow>(
      ref,
      `SELECT ${RUN_COLUMNS} FROM kanban_signed_kit_validations WHERE client_id = $1 AND kit_id = $2
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [clientId, kitId]
    );
    return result.rows[0] ?? null;
  }

  async findRun(ref: string, clientId: string, runId: string): Promise<SignatureRunRow | null> {
    const result = await this.db.queryForDatabaseRef<SignatureRunRow>(
      ref,
      `SELECT ${RUN_COLUMNS} FROM kanban_signed_kit_validations WHERE client_id = $1 AND id = $2`,
      [clientId, runId]
    );
    const run = result.rows[0] ?? null;
    if (!run) return null;
    await this.db.queryForDatabaseRef(ref, EXPIRE_STALE, [clientId, run.kitId, ROUTINE_PICKUP_TIMEOUT_MINUTES, DISPATCHED_RUN_TIMEOUT_MINUTES]);
    const fresh = await this.db.queryForDatabaseRef<SignatureRunRow>(
      ref,
      `SELECT ${RUN_COLUMNS} FROM kanban_signed_kit_validations WHERE client_id = $1 AND id = $2`,
      [clientId, runId]
    );
    return fresh.rows[0] ?? null;
  }

  /** null quando ja ha validacao em andamento para este kit assinado (indice unico parcial). */
  async createRun(
    ref: string,
    clientId: string,
    input: { id: string; customerId: string; kitId: string; signedKitId: string; agentId: string; executorIdentityId: string; requestedByIdentityId: string }
  ): Promise<SignatureRunRow | null> {
    await this.db.queryForDatabaseRef(ref, EXPIRE_STALE, [clientId, input.kitId, ROUTINE_PICKUP_TIMEOUT_MINUTES, DISPATCHED_RUN_TIMEOUT_MINUTES]);
    const result = await this.db.queryForDatabaseRef<SignatureRunRow>(
      ref,
      `INSERT INTO kanban_signed_kit_validations
         (id, client_id, customer_id, kit_id, signed_kit_id, agent_id, executor_identity_id, requested_by_identity_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'dispatching')
       ON CONFLICT DO NOTHING
       RETURNING ${RUN_COLUMNS}`,
      [input.id, clientId, input.customerId, input.kitId, input.signedKitId, input.agentId, input.executorIdentityId, input.requestedByIdentityId]
    );
    return result.rows[0] ?? null;
  }

  async markDispatched(ref: string, clientId: string, id: string, executionId: string, sessionUrl: string | null): Promise<void> {
    await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_signed_kit_validations
       SET status = 'dispatched', gateway_execution_id = $3, external_session_url = $4,
           dispatched_at = clock_timestamp(), updated_at = clock_timestamp()
       WHERE client_id = $1 AND id = $2 AND status = 'dispatching'`,
      [clientId, id, executionId, sessionUrl]
    );
  }

  async markFailed(ref: string, clientId: string, id: string, code: string): Promise<void> {
    await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_signed_kit_validations SET status = 'failed', error_code = $3, updated_at = clock_timestamp()
       WHERE client_id = $1 AND id = $2 AND status IN ('dispatching', 'dispatched')`,
      [clientId, id, code.slice(0, 80)]
    );
  }

  /** A rotina alcancou o Flow: vale o prazo de 15 min parada, nao mais o de 5 min sem chegar. */
  async touchByRoutine(ref: string, clientId: string, id: string): Promise<void> {
    await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_signed_kit_validations
       SET picked_up_at = COALESCE(picked_up_at, clock_timestamp()), updated_at = clock_timestamp()
       WHERE client_id = $1 AND id = $2 AND status = 'dispatched'`,
      [clientId, id]
    );
  }

  /** Parecer so do executor e so de execucao `dispatched`; corrida devolve null. */
  async answer(
    ref: string,
    clientId: string,
    input: { id: string; executorIdentityId: string; verdict: SignatureVerdict; summary: string; findings: SignatureFinding[] }
  ): Promise<SignatureRunRow | null> {
    const result = await this.db.queryForDatabaseRef<SignatureRunRow>(
      ref,
      `UPDATE kanban_signed_kit_validations
       SET status = 'answered', verdict = $4, summary = $5, findings = $6::jsonb,
           answered_at = clock_timestamp(), updated_at = clock_timestamp()
       WHERE client_id = $1 AND id = $2 AND executor_identity_id = $3 AND status = 'dispatched'
       RETURNING ${RUN_COLUMNS}`,
      [clientId, input.id, input.executorIdentityId, input.verdict, input.summary, JSON.stringify(input.findings)]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Confirmacao humana do parecer aprovado da versao atual do kit assinado; com o Drive ativo, o assinado
   * entra na fila no mesmo comando. null: nao ha parecer aprovado pendente desta versao.
   */
  async confirm(ref: string, clientId: string, runId: string, identityId: string): Promise<{ run: SignatureRunRow; driveQueued: boolean } | null> {
    return this.db.transactionForDatabaseRef(ref, async (client) => {
      const confirmed = await client.query<SignatureRunRow>(
        `UPDATE kanban_signed_kit_validations v
         SET confirmed_at = clock_timestamp(), confirmed_by_identity_id = $3, updated_at = clock_timestamp()
         WHERE v.client_id = $1 AND v.id = $2 AND v.status = 'answered' AND v.verdict = 'aprovado' AND v.confirmed_at IS NULL
           AND EXISTS (SELECT 1 FROM kanban_customer_signed_kits s
                       WHERE s.client_id = v.client_id AND s.id = v.signed_kit_id AND s.superseded_at IS NULL)
         RETURNING ${RUN_COLUMNS}`,
        [clientId, runId, identityId]
      );
      const run = confirmed.rows[0];
      if (!run) return null;
      const queued = await client.query(
        `INSERT INTO kanban_document_syncs
           (client_id, document_id, document_version, checksum, state, next_attempt_at, source_type, customer_id)
         SELECT s.client_id, s.id, s.version, s.sha256, 'pending', now(), 'signed_kit', s.customer_id
         FROM kanban_customer_signed_kits s
         WHERE s.client_id = $1 AND s.id = $2
           AND EXISTS (SELECT 1 FROM kanban_drive_configurations cfg WHERE cfg.client_id = $1 AND cfg.status = 'active')
         ON CONFLICT (client_id, document_id, document_version, checksum, provider) DO NOTHING`,
        [clientId, run.signedKitId]
      );
      return { run, driveQueued: (queued.rowCount ?? 0) > 0 };
    });
  }

  /**
   * Cards do board em que "Validar assinatura" tem o que fazer (S5): cliente vinculado, kit mais recente com
   * assinado atual e sem parecer util para essa versao (sem validacao, falhou, expirou ou pendencias). Validacao
   * `dispatched` vencida conta como expirada, como em `EXPIRE_STALE`. Conveniencia de tela; a execucao revalida.
   */
  async validatableCardIds(ref: string, clientId: string, boardId: string, viewer: KanbanViewer): Promise<string[]> {
    const scope = visibleCardScope(viewer, 'c', 5);
    const result = await this.db.queryForDatabaseRef<{ cardId: string }>(
      ref,
      `SELECT c.id AS "cardId"
       FROM kanban_cards c
       JOIN kanban_card_customers l ON l.client_id = c.client_id AND l.card_id = c.id
       JOIN LATERAL (SELECT k.id FROM kanban_customer_office_kits k
                     WHERE k.client_id = c.client_id AND k.customer_id = l.customer_id
                     ORDER BY k.created_at DESC, k.id DESC LIMIT 1) k ON true
       JOIN kanban_customer_signed_kits s ON s.client_id = c.client_id AND s.kit_id = k.id AND s.superseded_at IS NULL
       LEFT JOIN LATERAL (SELECT v.signed_kit_id, v.status, v.verdict, v.updated_at, v.picked_up_at
                          FROM kanban_signed_kit_validations v
                          WHERE v.client_id = c.client_id AND v.kit_id = k.id
                          ORDER BY v.created_at DESC, v.id DESC LIMIT 1) v ON true
       WHERE c.client_id = $1 AND c.board_id = $2 AND c.status = 'active' AND ${scope.sql}
         AND NOT (v.signed_kit_id IS NOT DISTINCT FROM s.id AND (
               v.status = 'dispatching'
               OR v.verdict IS NOT DISTINCT FROM 'aprovado'
               OR (v.status = 'dispatched' AND v.updated_at >= clock_timestamp()
                   - make_interval(mins => CASE WHEN v.picked_up_at IS NULL THEN $3::int ELSE $4::int END))))`,
      [clientId, boardId, ROUTINE_PICKUP_TIMEOUT_MINUTES, DISPATCHED_RUN_TIMEOUT_MINUTES, ...scope.params]
    );
    return result.rows.map((row) => row.cardId);
  }
}
