import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import { PageResult } from '../kanban.types';
import { KanbanViewer, visibleCardScope } from '../shared/card-visibility';
import { isLeadStatus, LeadStatus, nextLeadStatus } from './lead-state';

export interface LeadSubmissionRow {
  id: string;
  officeId: string | null;
  submittedByIdentityId: string;
  submittedAt: string;
  returnedByIdentityId: string | null;
  returnedAt: string | null;
  returnReason: string | null;
}

export interface CardLeadRow {
  status: LeadStatus;
  currentSubmission: (LeadSubmissionRow & { customerId: string; customerSnapshot: Record<string, unknown> }) | null;
}

export interface SubmissionDocumentSnapshot {
  documentTypeId: string;
  documentId: string;
  status: string;
}

export interface SubmitLeadInput {
  cardId: string;
  boardId: string;
  officeId: string | null;
  customerId: string;
  customerSnapshot: Record<string, unknown>;
  customerSnapshotSha256: string;
  documentsSnapshot: SubmissionDocumentSnapshot[];
  requiredFields: string[];
  identityId: string;
}

export type LeadTransitionResult =
  | { ok: true; submissionId: string; status: LeadStatus; activityId: string }
  | { ok: false; currentStatus: LeadStatus };

export interface LeadQueueFilters {
  officeId?: string;
  boardId?: string;
  status?: LeadStatus;
  submittedFrom?: string;
  submittedTo?: string;
  limit: number;
  offset: number;
}

export interface LeadQueueRow {
  cardId: string;
  boardId: string;
  boardName: string;
  cardTitle: string;
  officeId: string | null;
  officeName: string | null;
  status: LeadStatus;
  submissionId: string | null;
  submittedByIdentityId: string | null;
  submittedAt: string | null;
  returnedAt: string | null;
  returnReason: string | null;
  total?: string;
}

const SUBMISSION_SELECT = `s.id, s.office_id AS "officeId", s.submitted_by_identity_id AS "submittedByIdentityId",
                           s.submitted_at AS "submittedAt", s.returned_by_identity_id AS "returnedByIdentityId",
                           s.returned_at AS "returnedAt", s.return_reason AS "returnReason"`;

/**
 * Estado do lead e ciclos de envio (CRM de leads, Sprint 4). Toda leitura por
 * `card_id` acontece DEPOIS de `CardVisibilityService.requireVisibleCard` no
 * servico; leituras de conjunto (tile do quadro, fila do gestor) usam
 * `visibleCardScope`. Transicoes rodam numa transacao com lock do card, para
 * que dois envios/devolucoes concorrentes nao gerem dois ciclos.
 */
@Injectable()
export class LeadsRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Estado atual; ausencia de linha = `rascunho`. */
  async findStatus(databaseRef: string, clientId: string, cardId: string): Promise<LeadStatus> {
    const result = await this.database.queryForDatabaseRef<{ status: string }>(
      databaseRef,
      `SELECT status FROM kanban_card_leads WHERE client_id = $1 AND card_id = $2`,
      [clientId, cardId]
    );
    const status = result.rows[0]?.status;
    return isLeadStatus(status) ? status : 'rascunho';
  }

  async findByCard(databaseRef: string, clientId: string, cardId: string): Promise<CardLeadRow> {
    const result = await this.database.queryForDatabaseRef<
      { status: string; customerId: string | null; customerSnapshot: Record<string, unknown> | null } & Partial<LeadSubmissionRow>
    >(
      databaseRef,
      `SELECT l.status, ${SUBMISSION_SELECT}, s.customer_id AS "customerId", s.customer_snapshot AS "customerSnapshot"
       FROM kanban_card_leads l
       LEFT JOIN kanban_lead_submissions s ON s.client_id = l.client_id AND s.id = l.current_submission_id
       WHERE l.client_id = $1 AND l.card_id = $2`,
      [clientId, cardId]
    );
    const row = result.rows[0];
    if (!row || !isLeadStatus(row.status)) {
      return { status: 'rascunho', currentSubmission: null };
    }
    if (!row.id || !row.customerId) {
      return { status: row.status, currentSubmission: null };
    }
    return {
      status: row.status,
      currentSubmission: {
        id: row.id,
        officeId: row.officeId ?? null,
        submittedByIdentityId: row.submittedByIdentityId as string,
        submittedAt: row.submittedAt as string,
        returnedByIdentityId: row.returnedByIdentityId ?? null,
        returnedAt: row.returnedAt ?? null,
        returnReason: row.returnReason ?? null,
        customerId: row.customerId,
        customerSnapshot: row.customerSnapshot ?? {}
      }
    };
  }

  /** Ciclos de envio do card, do mais recente para o mais antigo (sem snapshot). */
  async listSubmissions(databaseRef: string, clientId: string, cardId: string, limit = 20): Promise<LeadSubmissionRow[]> {
    const result = await this.database.queryForDatabaseRef<LeadSubmissionRow>(
      databaseRef,
      `SELECT ${SUBMISSION_SELECT}
       FROM kanban_lead_submissions s
       WHERE s.client_id = $1 AND s.card_id = $2
       ORDER BY s.submitted_at DESC, s.id DESC
       LIMIT $3`,
      [clientId, cardId, limit]
    );
    return result.rows;
  }

  /**
   * Envio (rascunho|devolvido -> enviado), atomico: lock do card, checagem do
   * estado, ciclo novo com snapshot, estado do lead e `system_event`
   * `card.lead_submitted` (so ids). Estado nao editavel = `{ ok: false }`.
   *
   * Ponto de acoplamento da S7 (ADR 014, Decisao 3, outbox transacional): a
   * linha `kanban_lead_analysis_runs` (status `queued`) sera criada NESTA
   * transacao, logo apos o ciclo. A S4 nao cria fila nem outbox.
   */
  async submit(databaseRef: string, clientId: string, input: SubmitLeadInput): Promise<LeadTransitionResult> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      const current = await lockAndReadStatus(tx, clientId, input.cardId);
      const next = nextLeadStatus(current, 'submit');
      if (!next) {
        return { ok: false, currentStatus: current };
      }
      const submission = await tx.query<{ id: string }>(
        `INSERT INTO kanban_lead_submissions
           (client_id, card_id, board_id, office_id, customer_id, customer_snapshot, customer_snapshot_sha256,
            documents_snapshot, required_fields, submitted_by_identity_id)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9::text[], $10)
         RETURNING id`,
        [
          clientId,
          input.cardId,
          input.boardId,
          input.officeId,
          input.customerId,
          JSON.stringify(input.customerSnapshot),
          input.customerSnapshotSha256,
          JSON.stringify(input.documentsSnapshot),
          input.requiredFields,
          input.identityId
        ]
      );
      const submissionId = submission.rows[0].id;
      await upsertLeadStatus(tx, clientId, input.cardId, next, submissionId, input.identityId);
      const activityId = await insertLeadEvent(tx, clientId, input.cardId, input.identityId, {
        kind: 'card.lead_submitted',
        submissionId
      });
      return { ok: true, submissionId, status: next, activityId };
    });
  }

  /**
   * Devolucao ao escritorio (-> devolvido), atomica: grava autor, data e motivo
   * no ciclo atual e `system_event` `card.lead_returned` (ids + motivo).
   */
  async returnToOffice(
    databaseRef: string,
    clientId: string,
    input: { cardId: string; reason: string; identityId: string }
  ): Promise<LeadTransitionResult> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      const current = await lockAndReadStatus(tx, clientId, input.cardId);
      const next = nextLeadStatus(current, 'return');
      const lead = await tx.query<{ submissionId: string | null }>(
        `SELECT current_submission_id AS "submissionId" FROM kanban_card_leads WHERE client_id = $1 AND card_id = $2`,
        [clientId, input.cardId]
      );
      const submissionId = lead.rows[0]?.submissionId ?? null;
      if (!next || !submissionId) {
        return { ok: false, currentStatus: current };
      }
      await tx.query(
        `UPDATE kanban_lead_submissions
         SET returned_by_identity_id = $3, returned_at = clock_timestamp(), return_reason = $4
         WHERE client_id = $1 AND id = $2 AND returned_at IS NULL`,
        [clientId, submissionId, input.identityId, input.reason]
      );
      await upsertLeadStatus(tx, clientId, input.cardId, next, submissionId, input.identityId);
      const activityId = await insertLeadEvent(tx, clientId, input.cardId, input.identityId, {
        kind: 'card.lead_returned',
        submissionId,
        reason: input.reason
      });
      return { ok: true, submissionId, status: next, activityId };
    });
  }

  /** Estado do lead dos cards VISIVEIS do quadro (tile); so cards com linha. */
  async statusByCardForBoard(
    databaseRef: string,
    clientId: string,
    boardId: string,
    viewer: KanbanViewer
  ): Promise<Map<string, LeadStatus>> {
    const scope = visibleCardScope(viewer, 'c', 3);
    const result = await this.database.queryForDatabaseRef<{ cardId: string; status: string }>(
      databaseRef,
      `SELECT l.card_id AS "cardId", l.status
       FROM kanban_card_leads l
       JOIN kanban_cards c ON c.id = l.card_id AND c.client_id = l.client_id
       WHERE l.client_id = $1 AND c.board_id = $2 AND ${scope.sql}`,
      [clientId, boardId, ...scope.params]
    );
    return new Map(result.rows.filter((row) => isLeadStatus(row.status)).map((row) => [row.cardId, row.status as LeadStatus]));
  }

  /**
   * Fila do gestor: leads com ciclo de envio do tenant, so cards VISIVEIS
   * (admin com a chave ligada = todos; chave desligada = quadros em que e
   * membro, regra anterior), sem card excluido. Filtros por escritorio ATUAL
   * do card, quadro, estado e periodo do envio atual. Paginada.
   */
  async listQueue(
    databaseRef: string,
    clientId: string,
    viewer: KanbanViewer,
    filters: LeadQueueFilters
  ): Promise<PageResult<LeadQueueRow>> {
    const scope = visibleCardScope(viewer, 'c', 9);
    const result = await this.database.queryForDatabaseRef<LeadQueueRow>(
      databaseRef,
      `SELECT c.id AS "cardId", c.board_id AS "boardId", b.name AS "boardName", c.title AS "cardTitle",
              c.office_id AS "officeId", o.name AS "officeName", l.status,
              s.id AS "submissionId", s.submitted_by_identity_id AS "submittedByIdentityId",
              s.submitted_at AS "submittedAt", s.returned_at AS "returnedAt", s.return_reason AS "returnReason",
              count(*) OVER() AS total
       FROM kanban_card_leads l
       JOIN kanban_cards c ON c.id = l.card_id AND c.client_id = l.client_id
       JOIN kanban_boards b ON b.id = c.board_id AND b.client_id = c.client_id
       LEFT JOIN kanban_offices o ON o.id = c.office_id AND o.client_id = c.client_id
       LEFT JOIN kanban_lead_submissions s ON s.id = l.current_submission_id AND s.client_id = l.client_id
       WHERE l.client_id = $1 AND c.status <> 'deleted' AND ${scope.sql}
         AND ($4::uuid IS NULL OR c.office_id = $4)
         AND ($5::uuid IS NULL OR c.board_id = $5)
         AND ($6::text IS NULL OR l.status = $6)
         AND ($7::date IS NULL OR s.submitted_at >= $7::date)
         AND ($8::date IS NULL OR s.submitted_at < $8::date + 1)
       ORDER BY s.submitted_at DESC NULLS LAST, c.id
       LIMIT $2 OFFSET $3`,
      [
        clientId,
        filters.limit,
        filters.offset,
        filters.officeId ?? null,
        filters.boardId ?? null,
        filters.status ?? null,
        filters.submittedFrom ?? null,
        filters.submittedTo ?? null,
        ...scope.params
      ]
    );
    const total = result.rows[0]?.total ? Number(result.rows[0].total) : 0;
    return {
      data: result.rows.map(({ total: _total, ...rest }) => {
        void _total;
        return rest;
      }),
      meta: { limit: filters.limit, offset: filters.offset, total }
    };
  }
}

async function lockAndReadStatus(tx: PoolClient, clientId: string, cardId: string): Promise<LeadStatus> {
  await tx.query(`SELECT id FROM kanban_cards WHERE client_id = $1 AND id = $2 FOR UPDATE`, [clientId, cardId]);
  const result = await tx.query<{ status: string }>(
    `SELECT status FROM kanban_card_leads WHERE client_id = $1 AND card_id = $2 FOR UPDATE`,
    [clientId, cardId]
  );
  const status = result.rows[0]?.status;
  return isLeadStatus(status) ? status : 'rascunho';
}

async function upsertLeadStatus(
  tx: PoolClient,
  clientId: string,
  cardId: string,
  status: LeadStatus,
  submissionId: string,
  identityId: string
): Promise<void> {
  await tx.query(
    `INSERT INTO kanban_card_leads (card_id, client_id, status, current_submission_id, status_changed_by_identity_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (card_id) DO UPDATE
       SET status = EXCLUDED.status,
           current_submission_id = EXCLUDED.current_submission_id,
           status_changed_by_identity_id = EXCLUDED.status_changed_by_identity_id,
           status_changed_at = clock_timestamp()
     WHERE kanban_card_leads.client_id = EXCLUDED.client_id`,
    [cardId, clientId, status, submissionId, identityId]
  );
}

async function insertLeadEvent(
  tx: PoolClient,
  clientId: string,
  cardId: string,
  identityId: string,
  payload: Record<string, unknown>
): Promise<string> {
  const activity = await tx.query<{ id: string }>(
    `INSERT INTO kanban_card_activities (client_id, card_id, type, author_identity_id, event_payload)
     VALUES ($1, $2, 'system_event', $3, $4::jsonb)
     RETURNING id`,
    [clientId, cardId, identityId, JSON.stringify(payload)]
  );
  return activity.rows[0].id;
}
