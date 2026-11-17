import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export interface CardExtraDocumentRow {
  id: string;
  cardId: string;
  description: string | null;
  createdByIdentityId: string;
  createdAt: string;
  attachmentId: string;
  activityId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface CreateExtraDocumentInput {
  documentId: string;
  cardId: string;
  description: string | null;
  activityId: string;
  attachmentId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  storageBucket: string;
  storageKey: string;
  identityId: string;
}

const EXTRA_SELECT = `d.id, d.card_id AS "cardId", d.description, d.created_by_identity_id AS "createdByIdentityId",
                      d.created_at AS "createdAt", a.id AS "attachmentId", a.activity_id AS "activityId",
                      a.file_name AS "fileName", a.content_type AS "contentType", a.size_bytes::integer AS "sizeBytes"`;

const EXTRA_FROM = `kanban_card_extra_documents d
                    JOIN kanban_card_attachments a ON a.id = d.attachment_id AND a.client_id = d.client_id`;

/**
 * Documentos avulsos do card (docs/product/flow-card-extra-documents-sprints.md, D1): fora do checklist
 * de tipos, com descricao opcional e remocao logica. Envio e remocao gravam o evento do historico e a
 * fila do Drive na mesma transacao.
 */
@Injectable()
export class CardExtraDocumentsRepository {
  constructor(private readonly database: DatabaseService) {}

  async listActive(databaseRef: string, clientId: string, cardId: string): Promise<CardExtraDocumentRow[]> {
    const result = await this.database.queryForDatabaseRef<CardExtraDocumentRow>(
      databaseRef,
      `SELECT ${EXTRA_SELECT} FROM ${EXTRA_FROM}
       WHERE d.client_id = $1 AND d.card_id = $2 AND d.removed_at IS NULL
       ORDER BY d.created_at, d.id`,
      [clientId, cardId]
    );
    return result.rows;
  }

  async findActive(databaseRef: string, clientId: string, cardId: string, documentId: string): Promise<CardExtraDocumentRow | null> {
    const result = await this.database.queryForDatabaseRef<CardExtraDocumentRow>(
      databaseRef,
      `SELECT ${EXTRA_SELECT} FROM ${EXTRA_FROM}
       WHERE d.client_id = $1 AND d.card_id = $2 AND d.id = $3 AND d.removed_at IS NULL`,
      [clientId, cardId, documentId]
    );
    return result.rows[0] ?? null;
  }

  /** Evento, anexo e documento numa transacao; com o Drive ativo, entra na fila (pasta do cliente do card). */
  async create(databaseRef: string, clientId: string, input: CreateExtraDocumentInput): Promise<{ document: CardExtraDocumentRow; driveQueued: boolean }> {
    return this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      await client.query(
        `INSERT INTO kanban_card_activities (id, client_id, card_id, type, author_identity_id, event_payload)
         VALUES ($1, $2, $3, 'system_event', $4, $5::jsonb)`,
        [
          input.activityId,
          clientId,
          input.cardId,
          input.identityId,
          JSON.stringify({ kind: 'card.extra_document_added', documentId: input.documentId, attachmentId: input.attachmentId })
        ]
      );
      await client.query(
        `INSERT INTO kanban_card_attachments
           (id, client_id, activity_id, file_name, content_type, size_bytes, storage_bucket, storage_key, uploaded_by_identity_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [input.attachmentId, clientId, input.activityId, input.fileName, input.contentType, input.sizeBytes,
          input.storageBucket, input.storageKey, input.identityId]
      );
      await client.query(
        `INSERT INTO kanban_card_extra_documents (id, client_id, card_id, attachment_id, description, sha256, created_by_identity_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [input.documentId, clientId, input.cardId, input.attachmentId, input.description, input.sha256, input.identityId]
      );
      const queued = await client.query(
        `INSERT INTO kanban_document_syncs
           (client_id, document_id, document_version, checksum, state, next_attempt_at, source_type, customer_id)
         SELECT $1, $2, 1, $3, 'pending', now(), 'card_extra_document',
                (SELECT cc.customer_id FROM kanban_card_customers cc WHERE cc.client_id = $1 AND cc.card_id = $4)
         WHERE EXISTS (SELECT 1 FROM kanban_drive_configurations cfg WHERE cfg.client_id = $1 AND cfg.status = 'active')
         ON CONFLICT (client_id, document_id, document_version, checksum, provider) DO NOTHING`,
        [clientId, input.documentId, input.sha256, input.cardId]
      );
      const created = await client.query<CardExtraDocumentRow>(
        `SELECT ${EXTRA_SELECT} FROM ${EXTRA_FROM} WHERE d.client_id = $1 AND d.id = $2`,
        [clientId, input.documentId]
      );
      return { document: created.rows[0], driveQueued: (queued.rowCount ?? 0) > 0 };
    });
  }

  /**
   * Remocao logica (so a primeira vale; corrida devolve null) com evento no historico. No Drive: envio
   * ainda nao feito sai da fila (`deleted`); arquivo enviado volta a fila para ir a lixeira; envio em
   * andamento termina e o worker remove em seguida (`remove_requested_at`).
   */
  async remove(
    databaseRef: string,
    clientId: string,
    params: { cardId: string; documentId: string; identityId: string; activityId: string }
  ): Promise<{ driveRemovalQueued: boolean } | null> {
    return this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      const removed = await client.query<{ attachmentId: string }>(
        `UPDATE kanban_card_extra_documents
         SET removed_at = clock_timestamp(), removed_by_identity_id = $4
         WHERE client_id = $1 AND card_id = $2 AND id = $3 AND removed_at IS NULL
         RETURNING attachment_id AS "attachmentId"`,
        [clientId, params.cardId, params.documentId, params.identityId]
      );
      if (!removed.rows[0]) return null;
      await client.query(
        `INSERT INTO kanban_card_activities (id, client_id, card_id, type, author_identity_id, event_payload)
         VALUES ($1, $2, $3, 'system_event', $4, $5::jsonb)`,
        [
          params.activityId,
          clientId,
          params.cardId,
          params.identityId,
          JSON.stringify({ kind: 'card.extra_document_removed', documentId: params.documentId, attachmentId: removed.rows[0].attachmentId })
        ]
      );
      const syncs = await client.query(
        `UPDATE kanban_document_syncs
         SET remove_requested_at = clock_timestamp(),
             state = CASE
               WHEN state = 'syncing' THEN state
               WHEN remote_file_id IS NULL THEN 'deleted'
               ELSE 'pending' END,
             attempt_count = CASE WHEN state = 'syncing' THEN attempt_count ELSE 0 END,
             next_attempt_at = CASE
               WHEN state = 'syncing' THEN next_attempt_at
               WHEN remote_file_id IS NULL THEN NULL
               ELSE now() END,
             last_error_code = CASE WHEN state = 'syncing' THEN last_error_code ELSE NULL END,
             updated_at = now()
         WHERE client_id = $1 AND document_id = $2 AND source_type = 'card_extra_document'
           AND remove_requested_at IS NULL AND state <> 'deleted'
         RETURNING state`,
        [clientId, params.documentId]
      );
      return { driveRemovalQueued: syncs.rows.some((row) => row.state !== 'deleted') };
    });
  }
}
