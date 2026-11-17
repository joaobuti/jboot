import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { KanbanViewer, visibleCardScope } from '../shared/card-visibility';
import { CardDocumentResponse, CardDocumentStatus, PendingDocumentType } from './dto/card-document.dto';

interface CardDocumentRow {
  id: string;
  cardId: string;
  documentTypeId: string;
  status: CardDocumentStatus;
  rejectionReason: string | null;
  reviewedByIdentityId: string | null;
  reviewedAt: string | null;
  createdByIdentityId: string;
  createdAt: string;
  attachmentId: string;
  activityId: string;
  fileName: string;
  contentType: string;
  sizeBytes: string | number;
}

const DOCUMENT_SELECT = `d.id, d.card_id AS "cardId", d.document_type_id AS "documentTypeId", d.status,
                          d.rejection_reason AS "rejectionReason", d.reviewed_by_identity_id AS "reviewedByIdentityId",
                          d.reviewed_at AS "reviewedAt", d.created_by_identity_id AS "createdByIdentityId",
                          d.created_at AS "createdAt", a.id AS "attachmentId", a.activity_id AS "activityId",
                          a.file_name AS "fileName", a.content_type AS "contentType", a.size_bytes AS "sizeBytes"`;

const DOCUMENT_FROM = `kanban_card_documents d
                       JOIN kanban_card_attachments a ON a.id = d.attachment_id AND a.client_id = d.client_id`;

function toResponse(row: CardDocumentRow): CardDocumentResponse {
  return {
    id: row.id,
    cardId: row.cardId,
    documentTypeId: row.documentTypeId,
    status: row.status,
    rejectionReason: row.rejectionReason,
    reviewedByIdentityId: row.reviewedByIdentityId,
    reviewedAt: row.reviewedAt,
    createdByIdentityId: row.createdByIdentityId,
    createdAt: row.createdAt,
    attachment: {
      id: row.attachmentId,
      activityId: row.activityId,
      fileName: row.fileName,
      contentType: row.contentType,
      sizeBytes: Number(row.sizeBytes)
    }
  };
}

export interface CreateDocumentUploadInput {
  documentId: string;
  cardId: string;
  documentTypeId: string;
  activityId: string;
  attachmentId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageBucket: string;
  storageKey: string;
  identityId: string;
}

export interface BoardChecklistCompleteness {
  totalRequired: number;
  acceptedRequiredByCard: Map<string, number>;
}

/**
 * "Linha mais recente por (card, tipo)": DISTINCT ON ordenado por created_at
 * (clock_timestamp, migration 062) e id como desempate deterministico.
 */
const LATEST_PER_CARD_TYPE = `SELECT DISTINCT ON (d.card_id, d.document_type_id) d.card_id, d.document_type_id, d.status
                              FROM kanban_card_documents d`;

@Injectable()
export class CardDocumentsRepository {
  constructor(private readonly database: DatabaseService) {}

  async listForCard(databaseRef: string, clientId: string, cardId: string): Promise<CardDocumentResponse[]> {
    const result = await this.database.queryForDatabaseRef<CardDocumentRow>(
      databaseRef,
      `SELECT ${DOCUMENT_SELECT} FROM ${DOCUMENT_FROM}
       WHERE d.client_id = $1 AND d.card_id = $2
       ORDER BY d.created_at DESC, d.id DESC
       LIMIT 1000`,
      [clientId, cardId]
    );
    return result.rows.map(toResponse);
  }

  async findById(databaseRef: string, clientId: string, cardId: string, documentId: string): Promise<CardDocumentResponse | null> {
    const result = await this.database.queryForDatabaseRef<CardDocumentRow>(
      databaseRef,
      `SELECT ${DOCUMENT_SELECT} FROM ${DOCUMENT_FROM}
       WHERE d.client_id = $1 AND d.card_id = $2 AND d.id = $3`,
      [clientId, cardId, documentId]
    );
    return result.rows[0] ? toResponse(result.rows[0]) : null;
  }

  async findLatestIdForType(
    databaseRef: string,
    clientId: string,
    cardId: string,
    documentTypeId: string
  ): Promise<string | null> {
    const result = await this.database.queryForDatabaseRef<{ id: string }>(
      databaseRef,
      `SELECT id FROM kanban_card_documents
       WHERE client_id = $1 AND card_id = $2 AND document_type_id = $3
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [clientId, cardId, documentTypeId]
    );
    return result.rows[0]?.id ?? null;
  }

  /**
   * Envio atomico: `system_event` `card.document_uploaded` + `CardAttachment`
   * dessa activity + linha do documento, na mesma transacao. O objeto ja foi
   * enviado ao storage pelo servico; se esta transacao falhar, nenhuma linha
   * fica gravada e o servico remove o objeto (compensacao).
   * Payload do evento so com ids: nome do arquivo pode conter dado pessoal.
   */
  async createUpload(databaseRef: string, clientId: string, input: CreateDocumentUploadInput): Promise<CardDocumentResponse> {
    return this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      const id = input.documentId;
      await client.query(
        `INSERT INTO kanban_card_activities (id, client_id, card_id, type, author_identity_id, event_payload)
         VALUES ($1, $2, $3, 'system_event', $4, $5::jsonb)`,
        [
          input.activityId,
          clientId,
          input.cardId,
          input.identityId,
          JSON.stringify({
            kind: 'card.document_uploaded',
            documentId: id,
            documentTypeId: input.documentTypeId,
            attachmentId: input.attachmentId
          })
        ]
      );
      await client.query(
        `INSERT INTO kanban_card_attachments
           (id, client_id, activity_id, file_name, content_type, size_bytes, storage_bucket, storage_key, uploaded_by_identity_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          input.attachmentId,
          clientId,
          input.activityId,
          input.fileName,
          input.contentType,
          input.sizeBytes,
          input.storageBucket,
          input.storageKey,
          input.identityId
        ]
      );
      await client.query(
        `INSERT INTO kanban_card_documents (id, client_id, card_id, document_type_id, attachment_id, status, created_by_identity_id)
         VALUES ($1, $2, $3, $4, $5, 'enviado', $6)`,
        [id, clientId, input.cardId, input.documentTypeId, input.attachmentId, input.identityId]
      );
      const created = await client.query<CardDocumentRow>(
        `SELECT ${DOCUMENT_SELECT} FROM ${DOCUMENT_FROM} WHERE d.client_id = $1 AND d.id = $2`,
        [clientId, id]
      );
      return toResponse(created.rows[0]);
    });
  }

  /**
   * Revisao atomica: so altera documento ainda `enviado` (corrida entre dois
   * revisores devolve null) e grava o `system_event` na mesma transacao.
   */
  async review(
    databaseRef: string,
    clientId: string,
    params: {
      cardId: string;
      documentId: string;
      status: 'aceito' | 'rejeitado';
      rejectionReason: string | null;
      reviewerIdentityId: string;
      eventPayload: Record<string, unknown>;
    }
  ): Promise<{ document: CardDocumentResponse; activityId: string } | null> {
    return this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      const updated = await client.query<{ id: string }>(
        `UPDATE kanban_card_documents
         SET status = $4, rejection_reason = $5, reviewed_by_identity_id = $6, reviewed_at = now()
         WHERE client_id = $1 AND card_id = $2 AND id = $3 AND status = 'enviado'
         RETURNING id`,
        [clientId, params.cardId, params.documentId, params.status, params.rejectionReason, params.reviewerIdentityId]
      );
      if (!updated.rows[0]) {
        return null;
      }
      const kind = params.status === 'aceito' ? 'card.document_accepted' : 'card.document_rejected';
      const activity = await client.query<{ id: string }>(
        `INSERT INTO kanban_card_activities (client_id, card_id, type, author_identity_id, event_payload)
         VALUES ($1, $2, 'system_event', $3, $4::jsonb)
         RETURNING id`,
        [clientId, params.cardId, params.reviewerIdentityId, JSON.stringify({ kind, ...params.eventPayload })]
      );
      const document = await client.query<CardDocumentRow>(
        `SELECT ${DOCUMENT_SELECT} FROM ${DOCUMENT_FROM} WHERE d.client_id = $1 AND d.id = $2`,
        [clientId, params.documentId]
      );
      return { document: toResponse(document.rows[0]), activityId: activity.rows[0].id };
    });
  }

  /**
   * Tipos obrigatorios ativos do quadro cujo envio mais recente no card nao
   * esta `aceito`. `cardId = null` = card ainda nao criado (todos pendentes).
   */
  async listPendingRequired(
    databaseRef: string,
    clientId: string,
    boardId: string,
    cardId: string | null
  ): Promise<PendingDocumentType[]> {
    const result = await this.database.queryForDatabaseRef<PendingDocumentType>(
      databaseRef,
      `SELECT t.id, t.name
       FROM kanban_board_document_types t
       LEFT JOIN (
         ${LATEST_PER_CARD_TYPE}
         WHERE d.client_id = $1 AND d.card_id = $3::uuid
         ORDER BY d.card_id, d.document_type_id, d.created_at DESC, d.id DESC
       ) latest ON latest.document_type_id = t.id
       WHERE t.client_id = $1 AND t.board_id = $2 AND t.active AND t.required
         AND latest.status IS DISTINCT FROM 'aceito'
       ORDER BY t.sort_order, lower(t.name), t.id`,
      [clientId, boardId, cardId]
    );
    return result.rows;
  }

  /** Completude de todos os cards do quadro numa unica consulta (sem N+1 no board). */
  async completenessForBoard(
    databaseRef: string,
    clientId: string,
    boardId: string,
    viewer: KanbanViewer
  ): Promise<BoardChecklistCompleteness> {
    // Completude so dos cards visiveis (escopo unico, Sprint 3.5).
    const scope = visibleCardScope(viewer, 'c', 3);
    const result = await this.database.queryForDatabaseRef<{ cardId: string | null; accepted: string; totalRequired: string }>(
      databaseRef,
      `WITH required_types AS (
         SELECT id FROM kanban_board_document_types
         WHERE client_id = $1 AND board_id = $2 AND active AND required
       ),
       latest AS (
         ${LATEST_PER_CARD_TYPE}
         JOIN kanban_cards c ON c.id = d.card_id AND c.client_id = d.client_id
         WHERE d.client_id = $1 AND c.board_id = $2 AND ${scope.sql} AND d.document_type_id IN (SELECT id FROM required_types)
         ORDER BY d.card_id, d.document_type_id, d.created_at DESC, d.id DESC
       )
       SELECT NULL::uuid AS "cardId", 0::text AS accepted, (SELECT count(*) FROM required_types)::text AS "totalRequired"
       UNION ALL
       SELECT card_id, count(*)::text, NULL FROM latest WHERE status = 'aceito' GROUP BY card_id`,
      [clientId, boardId, ...scope.params]
    );
    let totalRequired = 0;
    const acceptedRequiredByCard = new Map<string, number>();
    for (const row of result.rows) {
      if (row.cardId === null) {
        totalRequired = Number(row.totalRequired);
      } else {
        acceptedRequiredByCard.set(row.cardId, Number(row.accepted));
      }
    }
    return { totalRequired, acceptedRequiredByCard };
  }
}
