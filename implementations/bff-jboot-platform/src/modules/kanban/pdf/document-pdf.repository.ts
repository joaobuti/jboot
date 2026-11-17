import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

/** Tentativas de conversao por documento (ADR 014, Decisao 2). */
export const MAX_PDF_ATTEMPTS = 3;
/** Lease do claim: acima do timeout do conversor (60 s) + leitura/gravacao no storage. */
export const PDF_LEASE_SECONDS = 180;

export interface ClaimedPdfDocument {
  id: string;
  cardId: string;
  storageKey: string;
  sha256: string;
  attempts: number;
}

/**
 * Outbox do PDF fora da requisicao (worker `kanban-document-pdf`). O payload do
 * job so traz `{ databaseRef, clientId, documentId }`; todo SQL filtra por
 * `client_id` e so toca documento `aprovado` com `pdf_status = 'pending'`.
 * Claim no banco: reentrega do BullMQ, job travado ou relay duplicado nunca
 * convertem o mesmo documento em paralelo.
 */
@Injectable()
export class DocumentPdfRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Claim com lease; conta a tentativa. `null` = nada a fazer (concluido, falho, substituido ou em uso). */
  async claim(databaseRef: string, clientId: string, documentId: string): Promise<ClaimedPdfDocument | null> {
    const result = await this.database.queryForDatabaseRef<ClaimedPdfDocument>(
      databaseRef,
      `UPDATE kanban_card_generated_documents
       SET pdf_lease_until = clock_timestamp() + make_interval(secs => $3), pdf_attempts = pdf_attempts + 1
       WHERE client_id = $1 AND id = $2 AND status = 'aprovado' AND pdf_status = 'pending'
         AND (pdf_lease_until IS NULL OR pdf_lease_until < clock_timestamp())
       RETURNING id, card_id AS "cardId", storage_key AS "storageKey", sha256, pdf_attempts AS attempts`,
      [clientId, documentId, PDF_LEASE_SECONDS]
    );
    return result.rows[0] ?? null;
  }

  async complete(
    databaseRef: string,
    clientId: string,
    documentId: string,
    pdf: { storageKey: string; sha256: string; sizeBytes: number }
  ): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_card_generated_documents
       SET pdf_status = 'done', pdf_storage_key = $3, pdf_sha256 = $4, pdf_size_bytes = $5,
           pdf_completed_at = clock_timestamp(), pdf_error_code = NULL, pdf_lease_until = NULL
       WHERE client_id = $1 AND id = $2 AND pdf_status = 'pending'`,
      [clientId, documentId, pdf.storageKey, pdf.sha256, pdf.sizeBytes]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Falha da tentativa: `final` = `failed` ("PDF pendente" para o gestor); senao continua `pending` sem lease. */
  async recordFailure(databaseRef: string, clientId: string, documentId: string, errorCode: string, final: boolean): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_card_generated_documents
       SET pdf_status = CASE WHEN $4 THEN 'failed' ELSE pdf_status END,
           pdf_error_code = $3, pdf_lease_until = NULL
       WHERE client_id = $1 AND id = $2 AND pdf_status = 'pending'`,
      [clientId, documentId, errorCode.slice(0, 64), final]
    );
  }

  /** Relay: aprovados `pending` sem lease vivo e pedidos ha mais de `olderThanSeconds` (job perdido). */
  async listStalePending(databaseRef: string, clientId: string, olderThanSeconds: number, limit = 100): Promise<string[]> {
    const result = await this.database.queryForDatabaseRef<{ id: string }>(
      databaseRef,
      `SELECT id FROM kanban_card_generated_documents
       WHERE client_id = $1 AND status = 'aprovado' AND pdf_status = 'pending'
         AND (pdf_lease_until IS NULL OR pdf_lease_until < clock_timestamp())
         AND pdf_requested_at < clock_timestamp() - make_interval(secs => $2)
       ORDER BY pdf_requested_at
       LIMIT $3`,
      [clientId, olderThanSeconds, limit]
    );
    return result.rows.map((row) => row.id);
  }
}
