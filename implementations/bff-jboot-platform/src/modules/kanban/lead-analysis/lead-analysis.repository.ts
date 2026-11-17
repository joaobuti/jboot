import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import { isLeadStatus, LeadStatus } from '../leads/lead-state';
import { FilledVariable } from './generation-data';
import { LEAD_EVENT_KINDS } from './lead-analysis-events';
import { AnalysisFacts, isAnalysisOpen, LeadStatusStep, reconcileLeadStatus } from './lead-analysis-state';

export type GeneratedDocumentStatus = 'rascunho' | 'aprovado' | 'substituido';
export type GeneratedDocumentOrigin = 'generated' | 'uploaded_edit';
export type PdfStatus = 'pending' | 'done' | 'failed';

/** Limite de casos ativos por ciclo (protecao; P3 = N casos). */
export const MAX_ACTIVE_CASES = 20;

export interface LeadCaseRow {
  id: string;
  submissionId: string;
  caseTypeId: string;
  caseTypeName: string;
  caseTypeActive: boolean;
  source: 'manual' | 'ai';
  decidedByIdentityId: string;
  decidedAt: string;
  replacesCaseId: string | null;
  supersededAt: string | null;
  supersededByIdentityId: string | null;
  supersededReason: string | null;
}

export interface GeneratedDocumentRow {
  id: string;
  cardId: string;
  submissionId: string;
  leadCaseId: string;
  version: number;
  origin: GeneratedDocumentOrigin;
  basedOnDocumentId: string | null;
  templateId: string;
  templateName: string;
  templateVersionId: string;
  templateVersionNumber: number;
  templateSha256: string;
  catalogVersion: number;
  status: GeneratedDocumentStatus;
  sizeBytes: number;
  filledVariables: Record<string, FilledVariable>;
  createdByIdentityId: string;
  createdAt: string;
  approvedByIdentityId: string | null;
  approvedAt: string | null;
  pdfStatus: PdfStatus | null;
  pdfAttempts: number;
  pdfErrorCode: string | null;
  pdfCompletedAt: string | null;
}

/** Documento com as chaves dos objetos (uso interno: download; nunca vai para a API). */
export interface GeneratedDocumentStorageRow extends GeneratedDocumentRow {
  storageKey: string;
  pdfStorageKey: string | null;
  caseActive: boolean;
}

export interface NewGeneratedDocument {
  id: string;
  cardId: string;
  submissionId: string;
  leadCaseId: string;
  templateId: string;
  templateVersionId: string;
  templateSha256: string;
  catalogVersion: number;
  storageBucket: string;
  storageKey: string;
  sha256: string;
  sizeBytes: number;
  filledVariables: Record<string, FilledVariable>;
  identityId: string;
}

export interface NewEditedDocument {
  id: string;
  cardId: string;
  submissionId: string;
  baseDocumentId: string;
  storageBucket: string;
  storageKey: string;
  sha256: string;
  sizeBytes: number;
  identityId: string;
}

/** Falhas de negocio detectadas DENTRO da transacao (card travado). */
export type AnalysisRejection =
  | { reason: 'lead_not_in_analysis'; leadStatus: LeadStatus }
  | { reason: 'cycle_changed'; leadStatus: LeadStatus }
  | { reason: 'case_not_found' }
  | { reason: 'case_type_not_found' }
  | { reason: 'case_type_inactive' }
  | { reason: 'case_type_already_classified' }
  | { reason: 'case_type_unchanged' }
  | { reason: 'case_limit_reached' }
  | { reason: 'document_not_found' }
  | { reason: 'document_not_reviewable'; documentStatus: GeneratedDocumentStatus };

export type AnalysisResult<T> = ({ ok: true; steps: LeadStatusStep[] } & T) | ({ ok: false } & AnalysisRejection);

export interface DeliveredDocumentRow {
  id: string;
  version: number;
  origin: GeneratedDocumentOrigin;
  templateName: string;
  approvedAt: string;
  pdfStatus: PdfStatus | null;
}

const CASE_SELECT = `c.id, c.submission_id AS "submissionId", c.case_type_id AS "caseTypeId", t.name AS "caseTypeName",
  t.active AS "caseTypeActive", c.source, c.decided_by_identity_id AS "decidedByIdentityId", c.decided_at AS "decidedAt",
  c.replaces_case_id AS "replacesCaseId", c.superseded_at AS "supersededAt",
  c.superseded_by_identity_id AS "supersededByIdentityId", c.superseded_reason AS "supersededReason"`;

const DOCUMENT_SELECT = `d.id, d.card_id AS "cardId", d.submission_id AS "submissionId", d.lead_case_id AS "leadCaseId",
  d.version, d.origin, d.based_on_document_id AS "basedOnDocumentId", d.template_id AS "templateId", t.name AS "templateName",
  d.template_version_id AS "templateVersionId", v.version AS "templateVersionNumber", d.template_sha256 AS "templateSha256",
  d.catalog_version AS "catalogVersion", d.status, d.size_bytes::text AS "sizeBytes", d.filled_variables AS "filledVariables",
  d.created_by_identity_id AS "createdByIdentityId", d.created_at AS "createdAt",
  d.approved_by_identity_id AS "approvedByIdentityId", d.approved_at AS "approvedAt",
  d.pdf_status AS "pdfStatus", d.pdf_attempts AS "pdfAttempts", d.pdf_error_code AS "pdfErrorCode",
  d.pdf_completed_at AS "pdfCompletedAt"`;

const DOCUMENT_FROM = `FROM kanban_card_generated_documents d
  JOIN kanban_document_templates t ON t.client_id = d.client_id AND t.id = d.template_id
  JOIN kanban_document_template_versions v ON v.client_id = d.client_id AND v.id = d.template_version_id`;

type RawDocument = Omit<GeneratedDocumentRow, 'sizeBytes'> & { sizeBytes: string };

function toDocument<T extends RawDocument>(row: T): Omit<T, 'sizeBytes'> & { sizeBytes: number } {
  return { ...row, sizeBytes: Number(row.sizeBytes) };
}

/**
 * Casos e documentos gerados do lead (CRM de leads, Sprint 6). Toda leitura por
 * `card_id` acontece DEPOIS de `CardVisibilityService.requireVisibleCard` no
 * servico (allowlist do teste estatico). Toda mutacao roda numa transacao com
 * o card e o estado do lead travados (`FOR UPDATE`), confere estado e ciclo
 * atuais, grava o `system_event` e aplica `reconcileLeadStatus` antes do commit.
 */
@Injectable()
export class LeadAnalysisRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Casos do ciclo (ativos e substituidos), na ordem de decisao. */
  async listCases(databaseRef: string, clientId: string, cardId: string, submissionId: string): Promise<LeadCaseRow[]> {
    const result = await this.database.queryForDatabaseRef<LeadCaseRow>(
      databaseRef,
      `SELECT ${CASE_SELECT}
       FROM kanban_lead_cases c
       JOIN kanban_case_types t ON t.client_id = c.client_id AND t.id = c.case_type_id
       WHERE c.client_id = $1 AND c.card_id = $2 AND c.submission_id = $3
       ORDER BY c.decided_at, c.id
       LIMIT 200`,
      [clientId, cardId, submissionId]
    );
    return result.rows;
  }

  async findCase(databaseRef: string, clientId: string, cardId: string, caseId: string): Promise<LeadCaseRow | null> {
    const result = await this.database.queryForDatabaseRef<LeadCaseRow>(
      databaseRef,
      `SELECT ${CASE_SELECT}
       FROM kanban_lead_cases c
       JOIN kanban_case_types t ON t.client_id = c.client_id AND t.id = c.case_type_id
       WHERE c.client_id = $1 AND c.card_id = $2 AND c.id = $3`,
      [clientId, cardId, caseId]
    );
    return result.rows[0] ?? null;
  }

  /** Documentos do ciclo (todas as versoes de todos os casos), do mais novo para o mais antigo por caso. */
  async listDocuments(databaseRef: string, clientId: string, cardId: string, submissionId: string): Promise<GeneratedDocumentRow[]> {
    const result = await this.database.queryForDatabaseRef<RawDocument>(
      databaseRef,
      `SELECT ${DOCUMENT_SELECT}
       ${DOCUMENT_FROM}
       WHERE d.client_id = $1 AND d.card_id = $2 AND d.submission_id = $3
       ORDER BY d.lead_case_id, d.version DESC
       LIMIT 500`,
      [clientId, cardId, submissionId]
    );
    return result.rows.map(toDocument);
  }

  async findDocument(databaseRef: string, clientId: string, cardId: string, documentId: string): Promise<GeneratedDocumentStorageRow | null> {
    const result = await this.database.queryForDatabaseRef<RawDocument & { storageKey: string; pdfStorageKey: string | null; caseActive: boolean }>(
      databaseRef,
      `SELECT ${DOCUMENT_SELECT}, d.storage_key AS "storageKey", d.pdf_storage_key AS "pdfStorageKey",
              (c.superseded_at IS NULL) AS "caseActive"
       ${DOCUMENT_FROM}
       JOIN kanban_lead_cases c ON c.client_id = d.client_id AND c.id = d.lead_case_id
       WHERE d.client_id = $1 AND d.card_id = $2 AND d.id = $3`,
      [clientId, cardId, documentId]
    );
    const row = result.rows[0];
    return row ? toDocument(row) : null;
  }

  /**
   * Documentos ENTREGUES ao escritorio (P11): aprovados dos casos ativos do
   * ciclo atual. Sem tipo de caso, sem variaveis e sem historico.
   */
  async listDelivered(databaseRef: string, clientId: string, cardId: string, submissionId: string): Promise<DeliveredDocumentRow[]> {
    const result = await this.database.queryForDatabaseRef<DeliveredDocumentRow>(
      databaseRef,
      `SELECT d.id, d.version, d.origin, t.name AS "templateName", d.approved_at AS "approvedAt", d.pdf_status AS "pdfStatus"
       FROM kanban_card_generated_documents d
       JOIN kanban_lead_cases c ON c.client_id = d.client_id AND c.id = d.lead_case_id
       JOIN kanban_document_templates t ON t.client_id = d.client_id AND t.id = d.template_id
       WHERE d.client_id = $1 AND d.card_id = $2 AND d.submission_id = $3
         AND d.status = 'aprovado' AND c.superseded_at IS NULL
       ORDER BY c.decided_at, c.id
       LIMIT 100`,
      [clientId, cardId, submissionId]
    );
    return result.rows;
  }

  /** Caso novo no ciclo atual (classificacao manual pelo gestor). */
  async addCase(
    databaseRef: string,
    clientId: string,
    input: { cardId: string; submissionId: string; caseTypeId: string; identityId: string }
  ): Promise<AnalysisResult<{ caseId: string }>> {
    return this.inAnalysis<{ caseId: string }>(databaseRef, clientId, input.cardId, input.submissionId, input.identityId, async (tx) => {
      const check = await checkCaseType(tx, clientId, input.cardId, input.submissionId, input.caseTypeId, null);
      if (check) {
        return check;
      }
      const caseId = await insertCase(tx, clientId, input.cardId, input.submissionId, input.caseTypeId, input.identityId, null);
      await insertEvent(tx, clientId, input.cardId, input.identityId, {
        kind: LEAD_EVENT_KINDS.caseClassified,
        submissionId: input.submissionId,
        caseId,
        caseTypeId: input.caseTypeId
      });
      return { ok: true, caseId };
    });
  }

  /** Troca auditada: o caso atual e substituido (motivo) por um caso novo que aponta para ele. */
  async changeCase(
    databaseRef: string,
    clientId: string,
    input: { cardId: string; submissionId: string; caseId: string; caseTypeId: string; reason: string; identityId: string }
  ): Promise<AnalysisResult<{ caseId: string; previousCaseId: string }>> {
    return this.inAnalysis<{ caseId: string; previousCaseId: string }>(databaseRef, clientId, input.cardId, input.submissionId, input.identityId, async (tx) => {
      const current = await lockActiveCase(tx, clientId, input.cardId, input.submissionId, input.caseId);
      if (!current) {
        return { ok: false, reason: 'case_not_found' };
      }
      if (current.caseTypeId === input.caseTypeId) {
        return { ok: false, reason: 'case_type_unchanged' };
      }
      const check = await checkCaseType(tx, clientId, input.cardId, input.submissionId, input.caseTypeId, input.caseId);
      if (check) {
        return check;
      }
      await supersedeCase(tx, clientId, input.caseId, input.identityId, input.reason);
      const caseId = await insertCase(tx, clientId, input.cardId, input.submissionId, input.caseTypeId, input.identityId, input.caseId);
      await insertEvent(tx, clientId, input.cardId, input.identityId, {
        kind: LEAD_EVENT_KINDS.caseChanged,
        submissionId: input.submissionId,
        caseId,
        previousCaseId: input.caseId,
        caseTypeId: input.caseTypeId,
        reason: input.reason
      });
      return { ok: true, caseId, previousCaseId: input.caseId };
    });
  }

  /** Remocao auditada do caso (documentos dele passam a `substituido`; nada e apagado). */
  async removeCase(
    databaseRef: string,
    clientId: string,
    input: { cardId: string; submissionId: string; caseId: string; reason: string; identityId: string }
  ): Promise<AnalysisResult<{ caseId: string }>> {
    return this.inAnalysis<{ caseId: string }>(databaseRef, clientId, input.cardId, input.submissionId, input.identityId, async (tx) => {
      const current = await lockActiveCase(tx, clientId, input.cardId, input.submissionId, input.caseId);
      if (!current) {
        return { ok: false, reason: 'case_not_found' };
      }
      await supersedeCase(tx, clientId, input.caseId, input.identityId, input.reason);
      await insertEvent(tx, clientId, input.cardId, input.identityId, {
        kind: LEAD_EVENT_KINDS.caseRemoved,
        submissionId: input.submissionId,
        caseId: input.caseId,
        reason: input.reason
      });
      return { ok: true, caseId: input.caseId };
    });
  }

  /** Rascunho novo do caso (versao = ultima + 1); rascunhos anteriores do caso passam a `substituido`. */
  async insertGenerated(databaseRef: string, clientId: string, input: NewGeneratedDocument): Promise<AnalysisResult<{ version: number }>> {
    return this.inAnalysis<{ version: number }>(databaseRef, clientId, input.cardId, input.submissionId, input.identityId, async (tx) => {
      if (!(await lockActiveCase(tx, clientId, input.cardId, input.submissionId, input.leadCaseId))) {
        return { ok: false, reason: 'case_not_found' };
      }
      const version = await nextVersion(tx, clientId, input.leadCaseId);
      await tx.query(
        `UPDATE kanban_card_generated_documents
         SET status = 'substituido', status_changed_by_identity_id = $3, status_changed_at = clock_timestamp()
         WHERE client_id = $1 AND lead_case_id = $2 AND status = 'rascunho'`,
        [clientId, input.leadCaseId, input.identityId]
      );
      await tx.query(
        `INSERT INTO kanban_card_generated_documents
           (id, client_id, card_id, submission_id, lead_case_id, version, origin, template_id, template_version_id,
            template_sha256, catalog_version, storage_bucket, storage_key, sha256, size_bytes, filled_variables, created_by_identity_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'generated', $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16)`,
        [
          input.id,
          clientId,
          input.cardId,
          input.submissionId,
          input.leadCaseId,
          version,
          input.templateId,
          input.templateVersionId,
          input.templateSha256,
          input.catalogVersion,
          input.storageBucket,
          input.storageKey,
          input.sha256,
          input.sizeBytes,
          JSON.stringify(input.filledVariables),
          input.identityId
        ]
      );
      await insertEvent(tx, clientId, input.cardId, input.identityId, {
        kind: LEAD_EVENT_KINDS.documentGenerated,
        submissionId: input.submissionId,
        caseId: input.leadCaseId,
        documentId: input.id,
        version
      });
      return { ok: true, version };
    });
  }

  /**
   * Aprovacao do rascunho: grava aprovador/data e `pdf_status = 'pending'` na
   * MESMA transacao (a linha e o registro de outbox do PDF, ADR 014 Decisao 2);
   * aprovado anterior do mesmo caso passa a `substituido`.
   */
  async approve(
    databaseRef: string,
    clientId: string,
    input: { cardId: string; submissionId: string; documentId: string; identityId: string }
  ): Promise<AnalysisResult<{ leadCaseId: string; version: number }>> {
    return this.inAnalysis<{ leadCaseId: string; version: number }>(databaseRef, clientId, input.cardId, input.submissionId, input.identityId, async (tx) => {
      const document = await lockDocument(tx, clientId, input.cardId, input.submissionId, input.documentId);
      if (!document) {
        return { ok: false, reason: 'document_not_found' };
      }
      if (!document.caseActive) {
        return { ok: false, reason: 'case_not_found' };
      }
      if (document.status !== 'rascunho') {
        return { ok: false, reason: 'document_not_reviewable', documentStatus: document.status };
      }
      await supersedeApproved(tx, clientId, document.leadCaseId, input.identityId);
      await tx.query(
        `UPDATE kanban_card_generated_documents
         SET status = 'aprovado', approved_by_identity_id = $3, approved_at = clock_timestamp(),
             status_changed_by_identity_id = $3, status_changed_at = clock_timestamp(),
             pdf_status = 'pending', pdf_requested_at = clock_timestamp(), pdf_attempts = 0
         WHERE client_id = $1 AND id = $2`,
        [clientId, input.documentId, input.identityId]
      );
      await insertEvent(tx, clientId, input.cardId, input.identityId, {
        kind: LEAD_EVENT_KINDS.documentApproved,
        submissionId: input.submissionId,
        documentId: input.documentId,
        version: document.version
      });
      return { ok: true, leadCaseId: document.leadCaseId, version: document.version };
    });
  }

  /**
   * Versao editada pelo gestor (upload do `.docx` revisado): nasce `aprovado`
   * com `pdf_status = 'pending'` (outbox), herda modelo/versao do documento de
   * origem e substitui todo rascunho/aprovado do caso.
   */
  async insertEdited(databaseRef: string, clientId: string, input: NewEditedDocument): Promise<AnalysisResult<{ leadCaseId: string; version: number }>> {
    return this.inAnalysis<{ leadCaseId: string; version: number }>(databaseRef, clientId, input.cardId, input.submissionId, input.identityId, async (tx) => {
      const base = await lockDocument(tx, clientId, input.cardId, input.submissionId, input.baseDocumentId);
      if (!base) {
        return { ok: false, reason: 'document_not_found' };
      }
      if (!base.caseActive) {
        return { ok: false, reason: 'case_not_found' };
      }
      if (base.status === 'substituido') {
        return { ok: false, reason: 'document_not_reviewable', documentStatus: base.status };
      }
      const version = await nextVersion(tx, clientId, base.leadCaseId);
      await tx.query(
        `UPDATE kanban_card_generated_documents
         SET status = 'substituido', status_changed_by_identity_id = $3, status_changed_at = clock_timestamp()
         WHERE client_id = $1 AND lead_case_id = $2 AND status IN ('rascunho', 'aprovado')`,
        [clientId, base.leadCaseId, input.identityId]
      );
      await tx.query(
        `INSERT INTO kanban_card_generated_documents
           (id, client_id, card_id, submission_id, lead_case_id, version, origin, based_on_document_id, template_id,
            template_version_id, template_sha256, catalog_version, status, storage_bucket, storage_key, sha256, size_bytes,
            filled_variables, created_by_identity_id, approved_by_identity_id, approved_at,
            status_changed_by_identity_id, status_changed_at, pdf_status, pdf_requested_at, pdf_attempts)
         SELECT $1, client_id, card_id, submission_id, lead_case_id, $2, 'uploaded_edit', id, template_id,
                template_version_id, template_sha256, catalog_version, 'aprovado', $3, $4, $5, $6,
                '{}'::jsonb, $7, $7, clock_timestamp(), $7, clock_timestamp(), 'pending', clock_timestamp(), 0
         FROM kanban_card_generated_documents
         WHERE client_id = $8 AND id = $9`,
        [input.id, version, input.storageBucket, input.storageKey, input.sha256, input.sizeBytes, input.identityId, clientId, base.id]
      );
      await insertEvent(tx, clientId, input.cardId, input.identityId, {
        kind: LEAD_EVENT_KINDS.documentReplaced,
        submissionId: input.submissionId,
        caseId: base.leadCaseId,
        documentId: input.id,
        replacedDocumentId: base.id,
        version
      });
      await insertEvent(tx, clientId, input.cardId, input.identityId, {
        kind: LEAD_EVENT_KINDS.documentApproved,
        submissionId: input.submissionId,
        documentId: input.id,
        version
      });
      return { ok: true, leadCaseId: base.leadCaseId, version };
    });
  }

  /**
   * "Gerar PDF novamente" (gestor): `failed` volta a `pending` com tentativas
   * zeradas; `pending` so e reenfileirado; `done` nao muda (nunca duplica arquivo).
   */
  async requestPdfRetry(
    databaseRef: string,
    clientId: string,
    input: { cardId: string; documentId: string }
  ): Promise<{ outcome: 'requeued' | 'already_pending' | 'already_done' | 'not_approved' | 'not_found' }> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      const result = await tx.query<{ status: GeneratedDocumentStatus; pdfStatus: PdfStatus | null }>(
        `SELECT status, pdf_status AS "pdfStatus" FROM kanban_card_generated_documents
         WHERE client_id = $1 AND card_id = $2 AND id = $3 FOR UPDATE`,
        [clientId, input.cardId, input.documentId]
      );
      const row = result.rows[0];
      if (!row) {
        return { outcome: 'not_found' };
      }
      if (row.status !== 'aprovado' || !row.pdfStatus) {
        return { outcome: 'not_approved' };
      }
      if (row.pdfStatus === 'done') {
        return { outcome: 'already_done' };
      }
      if (row.pdfStatus === 'pending') {
        return { outcome: 'already_pending' };
      }
      await tx.query(
        `UPDATE kanban_card_generated_documents
         SET pdf_status = 'pending', pdf_attempts = 0, pdf_error_code = NULL, pdf_lease_until = NULL,
             pdf_requested_at = clock_timestamp()
         WHERE client_id = $1 AND id = $2`,
        [clientId, input.documentId]
      );
      return { outcome: 'requeued' };
    });
  }

  /**
   * Transacao da analise: trava card e estado do lead, confere analise aberta e
   * ciclo atual, executa `work` e reconcilia o estado do lead (com evento).
   */
  private async inAnalysis<T extends object>(
    databaseRef: string,
    clientId: string,
    cardId: string,
    submissionId: string,
    identityId: string,
    work: (tx: PoolClient) => Promise<({ ok: true } & T) | ({ ok: false } & AnalysisRejection)>
  ): Promise<AnalysisResult<T>> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      await tx.query(`SELECT id FROM kanban_cards WHERE client_id = $1 AND id = $2 FOR UPDATE`, [clientId, cardId]);
      const lead = await tx.query<{ status: string; submissionId: string | null }>(
        `SELECT status, current_submission_id AS "submissionId" FROM kanban_card_leads
         WHERE client_id = $1 AND card_id = $2 FOR UPDATE`,
        [clientId, cardId]
      );
      const status: LeadStatus = isLeadStatus(lead.rows[0]?.status) ? (lead.rows[0].status as LeadStatus) : 'rascunho';
      if (!isAnalysisOpen(status)) {
        return { ok: false, reason: 'lead_not_in_analysis', leadStatus: status };
      }
      if (lead.rows[0]?.submissionId !== submissionId) {
        return { ok: false, reason: 'cycle_changed', leadStatus: status };
      }
      const outcome = await work(tx);
      if (!outcome.ok) {
        return outcome;
      }
      const steps = reconcileLeadStatus(status, await analysisFacts(tx, clientId, cardId, submissionId));
      for (const step of steps) {
        await tx.query(
          `UPDATE kanban_card_leads
           SET status = $3, status_changed_by_identity_id = $4, status_changed_at = clock_timestamp()
           WHERE client_id = $1 AND card_id = $2`,
          [clientId, cardId, step.to, identityId]
        );
        await insertEvent(tx, clientId, cardId, identityId, {
          kind: LEAD_EVENT_KINDS.analysisStatusChanged,
          submissionId,
          from: step.from,
          to: step.to
        });
      }
      return { ...outcome, steps } as AnalysisResult<T>;
    });
  }
}

async function analysisFacts(tx: PoolClient, clientId: string, cardId: string, submissionId: string): Promise<AnalysisFacts> {
  const result = await tx.query<{ documents: string; activeCases: string; approvedCases: string }>(
    `SELECT
       (SELECT count(*) FROM kanban_card_generated_documents d
         WHERE d.client_id = $1 AND d.card_id = $2 AND d.submission_id = $3) AS documents,
       (SELECT count(*) FROM kanban_lead_cases c
         WHERE c.client_id = $1 AND c.card_id = $2 AND c.submission_id = $3 AND c.superseded_at IS NULL) AS "activeCases",
       (SELECT count(*) FROM kanban_lead_cases c
         WHERE c.client_id = $1 AND c.card_id = $2 AND c.submission_id = $3 AND c.superseded_at IS NULL
           AND EXISTS (SELECT 1 FROM kanban_card_generated_documents d
                       WHERE d.client_id = c.client_id AND d.lead_case_id = c.id AND d.status = 'aprovado')) AS "approvedCases"`,
    [clientId, cardId, submissionId]
  );
  const row = result.rows[0];
  return { documents: Number(row.documents), activeCases: Number(row.activeCases), approvedCases: Number(row.approvedCases) };
}

async function checkCaseType(
  tx: PoolClient,
  clientId: string,
  cardId: string,
  submissionId: string,
  caseTypeId: string,
  ignoreCaseId: string | null
): Promise<({ ok: false } & AnalysisRejection) | null> {
  const type = await tx.query<{ active: boolean }>(`SELECT active FROM kanban_case_types WHERE client_id = $1 AND id = $2 FOR SHARE`, [
    clientId,
    caseTypeId
  ]);
  if (!type.rows[0]) {
    return { ok: false, reason: 'case_type_not_found' };
  }
  if (!type.rows[0].active) {
    return { ok: false, reason: 'case_type_inactive' };
  }
  const active = await tx.query<{ caseTypeId: string }>(
    `SELECT case_type_id AS "caseTypeId" FROM kanban_lead_cases
     WHERE client_id = $1 AND card_id = $2 AND submission_id = $3 AND superseded_at IS NULL
       AND ($4::uuid IS NULL OR id <> $4)`,
    [clientId, cardId, submissionId, ignoreCaseId]
  );
  if (active.rows.some((row) => row.caseTypeId === caseTypeId)) {
    return { ok: false, reason: 'case_type_already_classified' };
  }
  if (active.rows.length >= MAX_ACTIVE_CASES) {
    return { ok: false, reason: 'case_limit_reached' };
  }
  return null;
}

async function insertCase(
  tx: PoolClient,
  clientId: string,
  cardId: string,
  submissionId: string,
  caseTypeId: string,
  identityId: string,
  replacesCaseId: string | null
): Promise<string> {
  const result = await tx.query<{ id: string }>(
    `INSERT INTO kanban_lead_cases (client_id, card_id, submission_id, case_type_id, decided_by_identity_id, replaces_case_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [clientId, cardId, submissionId, caseTypeId, identityId, replacesCaseId]
  );
  return result.rows[0].id;
}

async function lockActiveCase(
  tx: PoolClient,
  clientId: string,
  cardId: string,
  submissionId: string,
  caseId: string
): Promise<{ caseTypeId: string } | null> {
  const result = await tx.query<{ caseTypeId: string }>(
    `SELECT case_type_id AS "caseTypeId" FROM kanban_lead_cases
     WHERE client_id = $1 AND card_id = $2 AND submission_id = $3 AND id = $4 AND superseded_at IS NULL
     FOR UPDATE`,
    [clientId, cardId, submissionId, caseId]
  );
  return result.rows[0] ?? null;
}

async function supersedeCase(tx: PoolClient, clientId: string, caseId: string, identityId: string, reason: string): Promise<void> {
  await tx.query(
    `UPDATE kanban_lead_cases
     SET superseded_at = clock_timestamp(), superseded_by_identity_id = $3, superseded_reason = $4
     WHERE client_id = $1 AND id = $2 AND superseded_at IS NULL`,
    [clientId, caseId, identityId, reason]
  );
  await tx.query(
    `UPDATE kanban_card_generated_documents
     SET status = 'substituido', status_changed_by_identity_id = $3, status_changed_at = clock_timestamp()
     WHERE client_id = $1 AND lead_case_id = $2 AND status IN ('rascunho', 'aprovado')`,
    [clientId, caseId, identityId]
  );
}

async function supersedeApproved(tx: PoolClient, clientId: string, leadCaseId: string, identityId: string): Promise<void> {
  await tx.query(
    `UPDATE kanban_card_generated_documents
     SET status = 'substituido', status_changed_by_identity_id = $3, status_changed_at = clock_timestamp()
     WHERE client_id = $1 AND lead_case_id = $2 AND status = 'aprovado'`,
    [clientId, leadCaseId, identityId]
  );
}

async function nextVersion(tx: PoolClient, clientId: string, leadCaseId: string): Promise<number> {
  const result = await tx.query<{ version: number }>(
    `SELECT COALESCE(max(version), 0) + 1 AS version FROM kanban_card_generated_documents WHERE client_id = $1 AND lead_case_id = $2`,
    [clientId, leadCaseId]
  );
  return Number(result.rows[0].version);
}

async function lockDocument(
  tx: PoolClient,
  clientId: string,
  cardId: string,
  submissionId: string,
  documentId: string
): Promise<{ id: string; leadCaseId: string; status: GeneratedDocumentStatus; version: number; caseActive: boolean } | null> {
  const result = await tx.query<{ id: string; leadCaseId: string; status: GeneratedDocumentStatus; version: number; caseActive: boolean }>(
    `SELECT d.id, d.lead_case_id AS "leadCaseId", d.status, d.version, (c.superseded_at IS NULL) AS "caseActive"
     FROM kanban_card_generated_documents d
     JOIN kanban_lead_cases c ON c.client_id = d.client_id AND c.id = d.lead_case_id
     WHERE d.client_id = $1 AND d.card_id = $2 AND d.submission_id = $3 AND d.id = $4
     FOR UPDATE OF d`,
    [clientId, cardId, submissionId, documentId]
  );
  return result.rows[0] ?? null;
}

async function insertEvent(tx: PoolClient, clientId: string, cardId: string, identityId: string, payload: Record<string, unknown>): Promise<void> {
  await tx.query(
    `INSERT INTO kanban_card_activities (client_id, card_id, type, author_identity_id, event_payload)
     VALUES ($1, $2, 'system_event', $3, $4::jsonb)`,
    [clientId, cardId, identityId, JSON.stringify(payload)]
  );
}
