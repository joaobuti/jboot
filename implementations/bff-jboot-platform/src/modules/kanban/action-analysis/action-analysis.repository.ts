import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { recordAutomationCompleted } from '../automation/ai-automation-outbox.repository';
import { ActionAnalysisInput, ActionBlock, ActionContractInput } from './action-analysis.input';


export interface ActionAnalysisActionRow {
  id: string;
  block: ActionBlock;
  position: number;
  bank: string;
  year: string | null;
  rootContract: string | null;
  observations: string | null;
  contracts: ActionContractInput[];
}

export interface ActionAnalysisRow {
  id: string;
  cardId: string;
  customerId: string;
  automationRunId: string;
  status: 'concluida' | 'nao_concluida';
  failureReason: string | null;
  holderName: string | null;
  benefitNumber: string | null;
  statementDate: string | null;
  actionCount: number;
  submittedByIdentityId: string;
  createdAt: string;
  actions: ActionAnalysisActionRow[];
}

const ANALYSIS_SELECT = `id, card_id AS "cardId", customer_id AS "customerId", automation_run_id AS "automationRunId",
  status, failure_reason AS "failureReason", holder_name AS "holderName", benefit_number AS "benefitNumber",
  statement_date AS "statementDate", action_count AS "actionCount",
  submitted_by_identity_id AS "submittedByIdentityId", created_at AS "createdAt"`;

@Injectable()
export class ActionAnalysisRepository {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Grava a analise e encerra a execucao da rotina na mesma transacao: so a execucao
   * `dispatched` do dono, no card dela. Execucao ja encerrada (inclusive por um envio
   * anterior) devolve null e nada e gravado. Concluida com ao menos uma acao e a conclusao sem
   * erro: grava `ai.automation_completed`, de onde as regras `ai_completed -> move_card` movem o card.
   */
  async createClosingRun(
    databaseRef: string,
    clientId: string,
    input: { runId: string; cardId: string; customerId: string; ownerIdentityId: string; analysis: ActionAnalysisInput }
  ): Promise<{ id: string; completedEvent: boolean } | null> {
    const { analysis } = input;
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
          analysis.status === 'concluida' ? 'completed' : 'failed',
          analysis.status === 'concluida' ? null : 'routine_reported_failure'
        ]
      );
      if ((closed.rowCount ?? 0) === 0) return null;
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO kanban_card_action_analyses
           (client_id, card_id, customer_id, automation_run_id, status, failure_reason, holder_name, benefit_number,
            statement_date, action_count, submitted_by_identity_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          clientId,
          input.cardId,
          input.customerId,
          input.runId,
          analysis.status,
          analysis.status === 'nao_concluida' ? analysis.failureReason?.trim() ?? null : null,
          analysis.header?.holderName ?? null,
          analysis.header?.benefitNumber ?? null,
          analysis.header?.statementDate ?? null,
          analysis.actions.length,
          input.ownerIdentityId
        ]
      );
      const analysisId = inserted.rows[0].id;
      const positions = new Map<ActionBlock, number>();
      for (const action of analysis.actions) {
        const position = (positions.get(action.block) ?? 0) + 1;
        positions.set(action.block, position);
        await tx.query(
          `INSERT INTO kanban_card_action_analysis_actions
             (client_id, analysis_id, block, position, bank, year, root_contract, observations, contracts)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
          [
            clientId,
            analysisId,
            action.block,
            position,
            action.bank,
            action.year ?? null,
            action.rootContract ?? null,
            action.observations ?? null,
            JSON.stringify(action.contracts)
          ]
        );
      }
      const completedEvent =
        analysis.status === 'concluida' && analysis.actions.length > 0 ? await recordAutomationCompleted(tx, clientId, input.runId) : false;
      return { id: analysisId, completedEvent };
    });
  }

  /** Analise mais recente do card, com as acoes em ordem de bloco e posicao. */
  latestForCard(databaseRef: string, clientId: string, cardId: string): Promise<ActionAnalysisRow | null> {
    return this.latest(databaseRef, clientId, cardId, false);
  }

  /** Analise concluida mais recente do card: base das peticoes iniciais (ADR 020, S3). */
  latestConcludedForCard(databaseRef: string, clientId: string, cardId: string): Promise<ActionAnalysisRow | null> {
    return this.latest(databaseRef, clientId, cardId, true);
  }

  private async latest(databaseRef: string, clientId: string, cardId: string, concludedOnly: boolean): Promise<ActionAnalysisRow | null> {
    const found = await this.database.queryForDatabaseRef<Omit<ActionAnalysisRow, 'actions'>>(
      databaseRef,
      `SELECT ${ANALYSIS_SELECT} FROM kanban_card_action_analyses
       WHERE client_id = $1 AND card_id = $2 AND ($3::boolean IS FALSE OR status = 'concluida')
       ORDER BY created_at DESC LIMIT 1`,
      [clientId, cardId, concludedOnly]
    );
    const analysis = found.rows[0];
    if (!analysis) return null;
    const actions = await this.database.queryForDatabaseRef<ActionAnalysisActionRow>(
      databaseRef,
      `SELECT id, block, position, bank, year, root_contract AS "rootContract", observations, contracts
       FROM kanban_card_action_analysis_actions
       WHERE client_id = $1 AND analysis_id = $2
       ORDER BY array_position(ARRAY['caixa', 'e', 'a', 'b', 'c', 'd']::varchar[], block), position`,
      [clientId, analysis.id]
    );
    return { ...analysis, actions: actions.rows };
  }
}
