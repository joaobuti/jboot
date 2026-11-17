import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { recordAutomationCompleted } from '../automation/ai-automation-outbox.repository';
import { PetitionContent } from './document/petition-content';
import { PetitionReport } from './initial-petitions.input';

export interface PetitionDraftRow {
  petitionKey: string;
  court: 'jec' | 'jef';
  bank: string;
  fileName: string;
  actionIds: string[];
  content: PetitionContent;
}

export interface PetitionFigureRow {
  figureId: string;
  png: Buffer;
  width: number;
  height: number;
}

/** Peticao montada pelo servico, pronta para gravar no fechamento (arquivo ja no storage). */
export interface ClosingPetition {
  petitionId: string;
  documentId: string;
  petitionKey: string;
  court: 'jec' | 'jef';
  bank: string;
  fileName: string;
  actionIds: string[];
  content: PetitionContent | null;
  storageBucket: string;
  storageKey: string;
  sha256: string;
  sizeBytes: number;
}

export interface ClosingRunInput {
  runId: string;
  cardId: string;
  customerId: string;
  ownerIdentityId: string;
  generator: 'flow' | 'ai';
  status: 'concluida' | 'nao_concluida';
  failureReason: string | null;
  analysisId: string | null;
  report: (PetitionReport & { actionsWithoutPetition: Array<{ actionId: string; reason: string }> }) | null;
  uf: string | null;
  /** Pendencias do fecho montado pelo Flow (S7). */
  closingGaps: string[];
  petitions: ClosingPetition[];
}

export interface PetitionDocumentRow {
  documentId: string;
  petitionId: string;
  version: number;
  origin: 'routine_petition' | 'uploaded_edit';
  status: 'rascunho' | 'aprovado' | 'substituido';
  approvedAt: string | null;
  approvedByIdentityId: string | null;
  pdfStatus: string | null;
  storageKey: string;
  sizeBytes: number;
}

/** Versao corrigida enviada pela pessoa (S8); arquivo ja no storage. */
export interface CorrectedPetitionInput {
  documentId: string;
  cardId: string;
  baseDocumentId: string;
  storageBucket: string;
  storageKey: string;
  sha256: string;
  sizeBytes: number;
  identityId: string;
}

export type CorrectedPetitionResult =
  | { ok: true; petitionId: string; version: number; replacedStatus: 'rascunho' | 'aprovado' }
  | { ok: false; reason: 'not_found' | 'not_current' | 'protocoled' };

export interface PetitionRunRow {
  id: string;
  cardId: string;
  automationRunId: string;
  generator: 'flow' | 'ai';
  status: 'concluida' | 'nao_concluida';
  failureReason: string | null;
  triageSource: 'analysis' | 'hiscon';
  actionAnalysisId: string | null;
  petitionCount: number;
  report: ClosingRunInput['report'];
  closingGaps: string[];
  /** Conclusao sem erro gravada (`ai.automation_completed`); o card anda pelas regras da coluna. */
  completed: boolean;
  createdAt: string;
  petitions: Array<{
    id: string;
    petitionKey: string;
    position: number;
    court: 'jec' | 'jef';
    bank: string;
    fileName: string;
    actionIds: string[];
    protocolNumber: string | null;
    protocoledAt: string | null;
    /** Card criado no board de monitoramento (Sprint 2 de flow-card-actions); `null` antes do envio. */
    monitoringBoardId: string | null;
    monitoringCardId: string | null;
    document: PetitionDocumentRow | null;
  }>;
}

/**
 * Peticoes iniciais da rotina (migration 103; ADR 020, S5). Prints e rascunhos vivem so durante a
 * execucao; o fechamento grava execucao, peticoes, vinculos, documentos e julgados e encerra a
 * execucao na mesma transacao.
 */
@Injectable()
export class InitialPetitionsRepository {
  constructor(private readonly database: DatabaseService) {}

  async saveFigure(databaseRef: string, clientId: string, runId: string, figure: PetitionFigureRow): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `INSERT INTO kanban_petition_figures (client_id, automation_run_id, figure_id, png, width, height)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (client_id, automation_run_id, figure_id)
       DO UPDATE SET png = EXCLUDED.png, width = EXCLUDED.width, height = EXCLUDED.height, created_at = clock_timestamp()`,
      [clientId, runId, figure.figureId, figure.png, figure.width, figure.height]
    );
  }

  async figureIds(databaseRef: string, clientId: string, runId: string): Promise<Set<string>> {
    const result = await this.database.queryForDatabaseRef<{ figureId: string }>(
      databaseRef,
      `SELECT figure_id AS "figureId" FROM kanban_petition_figures WHERE client_id = $1 AND automation_run_id = $2`,
      [clientId, runId]
    );
    return new Set(result.rows.map((row) => row.figureId));
  }

  async figures(databaseRef: string, clientId: string, runId: string, ids: string[]): Promise<PetitionFigureRow[]> {
    if (ids.length === 0) return [];
    const result = await this.database.queryForDatabaseRef<PetitionFigureRow>(
      databaseRef,
      `SELECT figure_id AS "figureId", png, width, height FROM kanban_petition_figures
       WHERE client_id = $1 AND automation_run_id = $2 AND figure_id = ANY($3::varchar[])`,
      [clientId, runId, ids]
    );
    return result.rows;
  }

  async saveDraft(databaseRef: string, clientId: string, runId: string, draft: PetitionDraftRow): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `INSERT INTO kanban_petition_drafts (client_id, automation_run_id, petition_key, court, bank, file_name, action_ids, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[], $8::jsonb)
       ON CONFLICT (client_id, automation_run_id, petition_key)
       DO UPDATE SET court = EXCLUDED.court, bank = EXCLUDED.bank, file_name = EXCLUDED.file_name,
                     action_ids = EXCLUDED.action_ids, content = EXCLUDED.content, updated_at = clock_timestamp()`,
      [clientId, runId, draft.petitionKey, draft.court, draft.bank, draft.fileName, draft.actionIds, JSON.stringify(draft.content)]
    );
  }

  async drafts(databaseRef: string, clientId: string, runId: string): Promise<PetitionDraftRow[]> {
    const result = await this.database.queryForDatabaseRef<PetitionDraftRow>(
      databaseRef,
      `SELECT petition_key AS "petitionKey", court, bank, file_name AS "fileName", action_ids AS "actionIds", content
       FROM kanban_petition_drafts WHERE client_id = $1 AND automation_run_id = $2
       ORDER BY petition_key LIMIT 50`,
      [clientId, runId]
    );
    return result.rows;
  }

  /** Rascunhos e prints de execucao que nao esta mais em andamento (expirada ou encerrada). */
  async discardClosedRuns(databaseRef: string, clientId: string): Promise<void> {
    for (const table of ['kanban_petition_drafts', 'kanban_petition_figures']) {
      await this.database.queryForDatabaseRef(
        databaseRef,
        `DELETE FROM ${table} t
         WHERE t.client_id = $1 AND NOT EXISTS (
           SELECT 1 FROM kanban_ai_automation_outbox o
           WHERE o.client_id = t.client_id AND o.id = t.automation_run_id AND o.status = 'dispatched')`,
        [clientId]
      );
    }
  }

  /**
   * Encerra a execucao `dispatched` do dono e grava o resultado. `null` = execucao ja encerrada (nada
   * gravado; o chamador remove os arquivos que subiu). Concluida com ao menos uma peticao e a
   * conclusao sem erro (decisao do usuario 3): grava `ai.automation_completed` na mesma transacao.
   */
  async createClosingRun(databaseRef: string, clientId: string, input: ClosingRunInput): Promise<{ id: string; completedEvent: boolean } | null> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      const closed = await tx.query(
        `UPDATE kanban_ai_automation_outbox
         SET status = $5, last_error = $6, updated_at = NOW()
         WHERE id = $1 AND client_id = $2 AND card_id = $3 AND requester_identity_id = $4 AND status = 'dispatched'`,
        [
          input.runId,
          clientId,
          input.cardId,
          input.ownerIdentityId,
          input.status === 'concluida' ? 'completed' : 'failed',
          input.status === 'concluida' ? null : 'routine_reported_failure'
        ]
      );
      if ((closed.rowCount ?? 0) === 0) return null;
      const run = await tx.query<{ id: string }>(
        `INSERT INTO kanban_card_petition_runs
           (client_id, card_id, customer_id, automation_run_id, generator, status, failure_reason, triage_source,
            action_analysis_id, petition_count, report, submitted_by_identity_id, closing_gaps)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13::varchar[])
         RETURNING id`,
        [
          clientId,
          input.cardId,
          input.customerId,
          input.runId,
          input.generator,
          input.status,
          input.failureReason,
          input.analysisId ? 'analysis' : 'hiscon',
          input.analysisId,
          input.petitions.length,
          JSON.stringify(input.report ?? {}),
          input.ownerIdentityId,
          input.closingGaps
        ]
      );
      const runId = run.rows[0].id;
      let position = 0;
      for (const petition of input.petitions) {
        position += 1;
        await tx.query(
          `INSERT INTO kanban_card_initial_petitions
             (id, client_id, card_id, petition_run_id, petition_key, position, court, bank, file_name, generator, content)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
          [
            petition.petitionId,
            clientId,
            input.cardId,
            runId,
            petition.petitionKey,
            position,
            petition.court,
            petition.bank,
            petition.fileName,
            input.generator,
            petition.content ? JSON.stringify(petition.content) : null
          ]
        );
        for (const actionId of petition.actionIds) {
          await tx.query(
            `INSERT INTO kanban_card_initial_petition_actions (client_id, petition_run_id, petition_id, action_id) VALUES ($1, $2, $3, $4)`,
            [clientId, runId, petition.petitionId, actionId]
          );
        }
        await tx.query(
          `INSERT INTO kanban_card_generated_documents
             (id, client_id, card_id, petition_id, version, origin, status, storage_bucket, storage_key, sha256, size_bytes,
              ai_run_id, created_by_identity_id)
           VALUES ($1, $2, $3, $4, 1, 'routine_petition', 'rascunho', $5, $6, $7, $8, $9, $10)`,
          [
            petition.documentId,
            clientId,
            input.cardId,
            petition.petitionId,
            petition.storageBucket,
            petition.storageKey,
            petition.sha256,
            petition.sizeBytes,
            input.runId,
            input.ownerIdentityId
          ]
        );
      }
      if (input.uf) {
        for (const precedent of input.report?.precedents ?? []) {
          await tx.query(
            `INSERT INTO kanban_petition_precedents (client_id, petition_run_id, uf, process_number, url, court, theme)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [clientId, runId, input.uf, precedent.processNumber, precedent.url, precedent.court ?? null, precedent.theme ?? null]
          );
        }
      }
      await tx.query(`DELETE FROM kanban_petition_drafts WHERE client_id = $1 AND automation_run_id = $2`, [clientId, input.runId]);
      await tx.query(`DELETE FROM kanban_petition_figures WHERE client_id = $1 AND automation_run_id = $2`, [clientId, input.runId]);
      const completedEvent =
        input.status === 'concluida' && input.petitions.length > 0 ? await recordAutomationCompleted(tx, clientId, input.runId) : false;
      if (completedEvent) {
        await tx.query(`UPDATE kanban_card_petition_runs SET completed = true WHERE client_id = $1 AND id = $2`, [clientId, runId]);
      }
      return { id: runId, completedEvent };
    });
  }

  /** Execucao de peticoes mais recente do card, com as peticoes, os vinculos e a versao atual do documento. */
  async latestForCard(databaseRef: string, clientId: string, cardId: string): Promise<PetitionRunRow | null> {
    const found = await this.database.queryForDatabaseRef<Omit<PetitionRunRow, 'petitions'>>(
      databaseRef,
      `SELECT id, card_id AS "cardId", automation_run_id AS "automationRunId", generator, status,
              failure_reason AS "failureReason", triage_source AS "triageSource", action_analysis_id AS "actionAnalysisId",
              petition_count AS "petitionCount", report, closing_gaps AS "closingGaps", completed, created_at AS "createdAt"
       FROM kanban_card_petition_runs WHERE client_id = $1 AND card_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [clientId, cardId]
    );
    const run = found.rows[0];
    if (!run) return null;
    const petitions = await this.database.queryForDatabaseRef<PetitionRunRow['petitions'][number] & { document: PetitionDocumentRow | null }>(
      databaseRef,
      `SELECT p.id, p.petition_key AS "petitionKey", p.position, p.court, p.bank, p.file_name AS "fileName",
              p.protocol_number AS "protocolNumber", p.protocoled_at AS "protocoledAt",
              p.monitoring_board_id AS "monitoringBoardId", p.monitoring_card_id AS "monitoringCardId",
              COALESCE((SELECT array_agg(a.action_id ORDER BY a.action_id) FROM kanban_card_initial_petition_actions a
                        WHERE a.client_id = p.client_id AND a.petition_id = p.id), '{}') AS "actionIds",
              (SELECT json_build_object(
                        'documentId', d.id, 'petitionId', d.petition_id, 'version', d.version, 'status', d.status,
                        'origin', d.origin,
                        'approvedAt', d.approved_at, 'approvedByIdentityId', d.approved_by_identity_id,
                        'pdfStatus', d.pdf_status, 'storageKey', d.storage_key, 'sizeBytes', d.size_bytes)
               FROM kanban_card_generated_documents d
               WHERE d.client_id = p.client_id AND d.petition_id = p.id
               ORDER BY d.version DESC LIMIT 1) AS document
       FROM kanban_card_initial_petitions p
       WHERE p.client_id = $1 AND p.petition_run_id = $2
       ORDER BY p.position`,
      [clientId, run.id]
    );
    return { ...run, petitions: petitions.rows };
  }

  async findDocument(databaseRef: string, clientId: string, cardId: string, documentId: string) {
    const result = await this.database.queryForDatabaseRef<{ documentId: string; status: string; storageKey: string; fileName: string; version: number }>(
      databaseRef,
      `SELECT d.id AS "documentId", d.status, d.storage_key AS "storageKey", p.file_name AS "fileName", d.version
       FROM kanban_card_generated_documents d
       JOIN kanban_card_initial_petitions p ON p.client_id = d.client_id AND p.id = d.petition_id
       WHERE d.client_id = $1 AND d.card_id = $2 AND d.id = $3`,
      [clientId, cardId, documentId]
    );
    return result.rows[0] ?? null;
  }

  /** Rascunho -> aprovado, com o PDF pedido (o gatilho do banco enfileira a replica no Drive). */
  async approve(databaseRef: string, clientId: string, cardId: string, documentId: string, identityId: string): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_card_generated_documents
       SET status = 'aprovado', approved_by_identity_id = $4, approved_at = clock_timestamp(),
           status_changed_by_identity_id = $4, status_changed_at = clock_timestamp(),
           pdf_status = 'pending', pdf_requested_at = clock_timestamp(), pdf_attempts = 0
       WHERE client_id = $1 AND card_id = $2 AND id = $3 AND petition_id IS NOT NULL AND status = 'rascunho'`,
      [clientId, cardId, documentId, identityId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Versao corrigida (S8): so sobre a versao atual (rascunho ou aprovada) de peticao sem protocolo. A
   * anterior vira `substituido`; a nova (`uploaded_edit`) entra pendente de aprovacao. Trava a peticao
   * para duas correcoes simultaneas nao disputarem o numero da versao.
   */
  async insertCorrected(databaseRef: string, clientId: string, input: CorrectedPetitionInput): Promise<CorrectedPetitionResult> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      const base = await tx.query<{ petitionId: string; status: 'rascunho' | 'aprovado' | 'substituido'; protocoledAt: string | null }>(
        `SELECT d.petition_id AS "petitionId", d.status, p.protocoled_at AS "protocoledAt"
         FROM kanban_card_generated_documents d
         JOIN kanban_card_initial_petitions p ON p.client_id = d.client_id AND p.id = d.petition_id
         WHERE d.client_id = $1 AND d.card_id = $2 AND d.id = $3
         FOR UPDATE OF p, d`,
        [clientId, input.cardId, input.baseDocumentId]
      );
      const row = base.rows[0];
      if (!row) return { ok: false, reason: 'not_found' };
      if (row.protocoledAt) return { ok: false, reason: 'protocoled' };
      if (row.status === 'substituido') return { ok: false, reason: 'not_current' };
      const next = await tx.query<{ version: number }>(
        `SELECT COALESCE(max(version), 0) + 1 AS version FROM kanban_card_generated_documents WHERE client_id = $1 AND petition_id = $2`,
        [clientId, row.petitionId]
      );
      const version = Number(next.rows[0].version);
      await tx.query(
        `UPDATE kanban_card_generated_documents
         SET status = 'substituido', status_changed_by_identity_id = $3, status_changed_at = clock_timestamp()
         WHERE client_id = $1 AND id = $2`,
        [clientId, input.baseDocumentId, input.identityId]
      );
      await tx.query(
        `INSERT INTO kanban_card_generated_documents
           (id, client_id, card_id, petition_id, version, origin, based_on_document_id, status, storage_bucket, storage_key,
            sha256, size_bytes, created_by_identity_id)
         VALUES ($1, $2, $3, $4, $5, 'uploaded_edit', $6, 'rascunho', $7, $8, $9, $10, $11)`,
        [
          input.documentId,
          clientId,
          input.cardId,
          row.petitionId,
          version,
          input.baseDocumentId,
          input.storageBucket,
          input.storageKey,
          input.sha256,
          input.sizeBytes,
          input.identityId
        ]
      );
      return { ok: true, petitionId: row.petitionId, version, replacedStatus: row.status };
    });
  }
}
