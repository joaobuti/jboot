import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import { DISPATCHED_RUN_TIMEOUT_MINUTES, ROUTINE_PICKUP_TIMEOUT_MINUTES } from '../customer-validation/customer-validation.repository';

/**
 * Peticoes iniciais (ADR 020, Q4): a rotina pesquisa jurisprudencia na web entre uma chamada e outra,
 * entao a execucao aguenta mais tempo parada e tem um teto total desde o disparo.
 */
export const PETITIONS_IDLE_TIMEOUT_MINUTES = 30;
export const PETITIONS_TOTAL_TIMEOUT_MINUTES = 180;

export interface AiAutomationOutboxRow {
  id: string;
  clientId: string;
  automationRuleId: string;
  boardId: string;
  boardColumnId: string;
  cardId: string;
  sourceActivityId: string;
  requesterIdentityId: string;
  agentId: string;
  triggerType: 'column_entered' | 'column_left';
  actionConfig: Record<string, unknown>;
  status: 'pending' | 'processing' | 'dispatched' | 'completed' | 'review_required' | 'awaiting_confirmation' | 'failed';
  attemptCount: number;
  aiExecutionId: string | null;
  /** Rotina: tentativa de disparo (muda so depois de 429/503 da rotina). */
  dispatchAttempt: number;
}

export interface AiAutomationSnapshot {
  card: {
    id: string;
    boardId: string;
    boardColumnId: string;
    title: string;
    description: string | null;
    dueDate: string | null;
    status: string;
  };
  event: Record<string, unknown>;
}

/** Execucao por rotina em andamento, vista pelas tools do conector. */
export interface DispatchedRun {
  id: string;
  boardId: string;
  /** Coluna da regra que disparou a execucao. */
  boardColumnId: string;
  cardId: string;
  actionConfig: Record<string, unknown>;
}

const SELECT = `id, client_id AS "clientId", automation_rule_id AS "automationRuleId",
  board_id AS "boardId", board_column_id AS "boardColumnId", card_id AS "cardId",
  source_activity_id AS "sourceActivityId", requester_identity_id AS "requesterIdentityId",
  agent_id AS "agentId", trigger_type AS "triggerType", action_config AS "actionConfig",
  status, attempt_count AS "attemptCount", ai_execution_id AS "aiExecutionId",
  dispatch_attempt AS "dispatchAttempt"`;

/**
 * Conclusao sem erro de uma execucao ja `completed` (flow-ai-completion-sprints.md; ADR 020): grava o
 * evento `ai.automation_completed` no card, na transacao de quem encerrou. Regras `ai_completed ->
 * move_card` da coluna do card derivam dele. Mesmo payload de `completeConfirmed`.
 */
export async function recordAutomationCompleted(tx: PoolClient, clientId: string, runId: string): Promise<boolean> {
  const result = await tx.query(
    `INSERT INTO kanban_card_activities (client_id, card_id, type, author_identity_id, event_payload)
     SELECT f.client_id, f.card_id, 'system_event', f.requester_identity_id,
       jsonb_build_object('kind', 'ai.automation_completed', 'automationRunId', f.id,
         'boardColumnId', c.board_column_id, 'sourceActivityId', f.source_activity_id,
         'automationDepth', COALESCE((a.event_payload->>'automationDepth')::int, 0),
         'automationRootActivityId', COALESCE(a.event_payload->>'automationRootActivityId', a.id::text))
     FROM kanban_ai_automation_outbox f
     JOIN kanban_cards c ON c.id = f.card_id AND c.client_id = f.client_id AND c.board_id = f.board_id
     JOIN kanban_card_activities a ON a.id = f.source_activity_id AND a.client_id = f.client_id
     WHERE f.client_id = $1 AND f.id = $2 AND f.status = 'completed' AND c.status = 'active'`,
    [clientId, runId]
  );
  return (result.rowCount ?? 0) > 0;
}

@Injectable()
export class AiAutomationOutboxRepository {
  constructor(private readonly database: DatabaseService) {}

  async recoverMissing(databaseRef: string, clientId: string): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `INSERT INTO kanban_ai_automation_outbox
        (client_id, automation_rule_id, board_id, board_column_id, card_id, source_activity_id,
         requester_identity_id, agent_id, trigger_type, action_config)
       SELECT a.client_id, r.id, r.board_id, r.board_column_id, a.card_id, a.id,
              r.created_by_identity_id, (r.action_config->>'agentId')::uuid, r.trigger_type, r.action_config
       FROM kanban_card_activities a
       JOIN kanban_cards c ON c.id = a.card_id AND c.client_id = a.client_id
       JOIN kanban_column_automation_rules r
         ON r.client_id = a.client_id
        AND r.board_id = c.board_id
        AND r.action_type = 'execute_ai_agent'
        AND r.is_active = true
        AND r.trigger_type IN ('column_entered', 'column_left')
        AND r.board_column_id = CASE
          WHEN r.trigger_type = 'column_entered' THEN (a.event_payload->>'toBoardColumnId')::uuid
          ELSE (a.event_payload->>'fromBoardColumnId')::uuid
        END
       WHERE a.client_id = $1
         AND a.type = 'system_event'
         AND a.event_payload->>'kind' = 'card.moved'
         AND a.created_at >= r.created_at
         AND a.created_at >= NOW() - INTERVAL '7 days'
       ON CONFLICT (automation_rule_id, card_id, source_activity_id) DO NOTHING`,
      [clientId],
    );
  }

  async listDue(databaseRef: string, clientId: string): Promise<string[]> {
    const result = await this.database.queryForDatabaseRef<{ id: string }>(
      databaseRef,
      `SELECT id FROM kanban_ai_automation_outbox
       WHERE client_id = $1
         AND next_attempt_at <= NOW()
         AND (status = 'pending' OR (status = 'processing' AND updated_at < NOW() - INTERVAL '5 minutes'))
       ORDER BY created_at
       LIMIT 100`,
      [clientId],
    );
    return result.rows.map(row => row.id);
  }

  async claim(databaseRef: string, outboxId: string): Promise<AiAutomationOutboxRow | null> {
    const result = await this.database.queryForDatabaseRef<AiAutomationOutboxRow>(
      databaseRef,
      `UPDATE kanban_ai_automation_outbox
       SET status = 'processing', attempt_count = attempt_count + 1, updated_at = NOW()
       WHERE id = $1
         AND (status = 'pending' OR (status = 'processing' AND updated_at < NOW() - INTERVAL '5 minutes'))
       RETURNING ${SELECT}`,
      [outboxId],
    );
    return result.rows[0] ?? null;
  }

  async snapshot(databaseRef: string, row: AiAutomationOutboxRow): Promise<AiAutomationSnapshot | null> {
    const result = await this.database.queryForDatabaseRef<{
      id: string; boardId: string; boardColumnId: string; title: string; description: string | null;
      dueDate: string | null; status: string; event: Record<string, unknown>;
    }>(
      databaseRef,
      `SELECT c.id, c.board_id AS "boardId", c.board_column_id AS "boardColumnId", c.title,
              c.description, c.due_date AS "dueDate", c.status, a.event_payload AS event
       FROM kanban_cards c
       JOIN kanban_card_activities a ON a.id = $4 AND a.card_id = c.id AND a.client_id = c.client_id
       WHERE c.client_id = $1 AND c.board_id = $2 AND c.id = $3`,
      [row.clientId, row.boardId, row.cardId, row.sourceActivityId],
    );
    const found = result.rows[0];
    if (!found) return null;
    const { event, ...card } = found;
    return { card, event };
  }

  async markCompleted(databaseRef: string, id: string, executionId: string): Promise<void> {
    await this.completeConfirmed(databaseRef, id, executionId);
  }

  async markAwaitingConfirmation(databaseRef: string, id: string, executionId: string): Promise<void> {
    await this.finish(databaseRef, id, 'awaiting_confirmation', executionId, 'ai_completion_confirmation_missing');
  }

  async markReviewRequired(databaseRef: string, id: string, executionId: string): Promise<void> {
    await this.finish(databaseRef, id, 'review_required', executionId, null);
  }

  async markFailed(databaseRef: string, id: string, code: string, executionId: string | null = null): Promise<void> {
    await this.finish(databaseRef, id, 'failed', executionId, code);
  }

  /** Rotina disparada: aguarda o comentario do conector com o run_id. */
  async markDispatched(databaseRef: string, id: string, executionId: string, sessionUrl: string | null): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_ai_automation_outbox
       SET status = 'dispatched', ai_execution_id = $2, external_session_url = $3, last_error = NULL,
           dispatched_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'processing'`,
      [id, executionId, sessionUrl],
    );
  }

  /** Limite da rotina (rotina nao iniciada): nova tentativa com chave nova. */
  async rescheduleRoutine(databaseRef: string, id: string, code: string, retryAfterSeconds: number): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_ai_automation_outbox
       SET status = 'pending', dispatch_attempt = dispatch_attempt + 1, last_error = $2,
           next_attempt_at = NOW() + make_interval(secs => $3), updated_at = NOW()
       WHERE id = $1 AND status = 'processing'`,
      [id, code.slice(0, 120), Math.min(Math.max(retryAfterSeconds, 1), 3600)],
    );
  }

  /**
   * Conector MCP: comentario da rotina com run_id conclui o item. So o dono
   * (quem criou a regra), no mesmo card, e so a partir de `dispatched`.
   */
  async completeDispatched(
    databaseRef: string,
    clientId: string,
    input: { id: string; cardId: string; ownerIdentityId: string },
  ): Promise<boolean> {
    return this.completeConfirmed(databaseRef, input.id, null, { clientId, ...input });
  }

  /** Completion and its trigger event commit together; duplicate acknowledgements produce no new event. */
  private async completeConfirmed(databaseRef: string, id: string, executionId: string | null,
    principal?: { clientId: string; cardId: string; ownerIdentityId: string }): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef(databaseRef,
      `WITH finished AS (
        UPDATE kanban_ai_automation_outbox SET status = 'completed', last_error = NULL,
          ai_execution_id = COALESCE($2::uuid, ai_execution_id), updated_at = NOW()
        WHERE id = $1 AND (($3::uuid IS NULL AND status = 'processing') OR
          (client_id = $3 AND card_id = $4 AND requester_identity_id = $5 AND status = 'dispatched'))
        RETURNING *
       ) INSERT INTO kanban_card_activities (client_id, card_id, type, author_identity_id, event_payload)
       SELECT f.client_id, f.card_id, 'system_event', f.requester_identity_id,
         jsonb_build_object('kind', 'ai.automation_completed', 'automationRunId', f.id,
           'boardColumnId', c.board_column_id, 'sourceActivityId', f.source_activity_id,
           'automationDepth', COALESCE((a.event_payload->>'automationDepth')::int, 0),
           'automationRootActivityId', COALESCE(a.event_payload->>'automationRootActivityId', a.id::text))
       FROM finished f JOIN kanban_cards c ON c.id = f.card_id AND c.client_id = f.client_id AND c.board_id = f.board_id
       JOIN kanban_card_activities a ON a.id = f.source_activity_id AND a.client_id = f.client_id
       WHERE c.status = 'active'
       RETURNING id`, [id, executionId, principal?.clientId ?? null, principal?.cardId ?? null, principal?.ownerIdentityId ?? null]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Execucao por rotina em andamento (`dispatched`) do dono informado: base das tools que
   * dao a rotina acesso ao cliente do card (S5 de flow-customer-documents-sprints.md).
   */
  async findDispatchedForOwner(
    databaseRef: string,
    clientId: string,
    id: string,
    ownerIdentityId: string,
  ): Promise<DispatchedRun | null> {
    const result = await this.database.queryForDatabaseRef<DispatchedRun>(
      databaseRef,
      `SELECT id, board_id AS "boardId", board_column_id AS "boardColumnId", card_id AS "cardId", action_config AS "actionConfig"
       FROM kanban_ai_automation_outbox
       WHERE id = $1 AND client_id = $2 AND requester_identity_id = $3 AND status = 'dispatched'`,
      [id, clientId, ownerIdentityId],
    );
    return result.rows[0] ?? null;
  }

  /** Encerra como falha a execucao em andamento (pre-condicao que deixou de valer durante a execucao). */
  async failDispatched(databaseRef: string, clientId: string, id: string, code: string): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_ai_automation_outbox SET status = 'failed', last_error = $3, updated_at = NOW()
       WHERE id = $1 AND client_id = $2 AND status = 'dispatched'`,
      [id, clientId, code.slice(0, 120)],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** A rotina chegou ao Flow: marca a primeira chamada e renova o prazo a cada chamada. */
  async touchDispatched(databaseRef: string, clientId: string, id: string): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_ai_automation_outbox
       SET picked_up_at = COALESCE(picked_up_at, NOW()), updated_at = NOW()
       WHERE id = $1 AND client_id = $2 AND status = 'dispatched'`,
      [id, clientId],
    );
  }

  /**
   * Rotina que nao chega ao Flow nao consegue avisar a falha (o conector e o canal):
   * sem chamada em ROUTINE_PICKUP_TIMEOUT_MINUTES, `routine_not_reached`; depois da
   * primeira chamada, parada alem do prazo do resultado esperado, `routine_no_answer`
   * (DISPATCHED_RUN_TIMEOUT_MINUTES; peticoes iniciais, PETITIONS_IDLE_TIMEOUT_MINUTES). Peticoes
   * iniciais tambem expiram PETITIONS_TOTAL_TIMEOUT_MINUTES depois do disparo (`routine_time_limit`).
   */
  async expireStaleDispatched(
    databaseRef: string,
    clientId: string,
  ): Promise<Array<{ id: string; cardId: string; requesterIdentityId: string; code: string }>> {
    const result = await this.database.queryForDatabaseRef<{ id: string; cardId: string; requesterIdentityId: string; code: string }>(
      databaseRef,
      `WITH runs AS (
         SELECT id, picked_up_at, updated_at, dispatched_at,
                (action_config->>'expectedResult') = 'initial_petitions' AS petitions
         FROM kanban_ai_automation_outbox
         WHERE client_id = $1 AND status = 'dispatched'
       ),
       expired AS (
         SELECT id,
                CASE
                  WHEN petitions AND dispatched_at < NOW() - make_interval(mins => $5::int) THEN 'routine_time_limit'
                  WHEN picked_up_at IS NULL AND updated_at < NOW() - make_interval(mins => $2::int) THEN 'routine_not_reached'
                  WHEN picked_up_at IS NOT NULL
                       AND updated_at < NOW() - make_interval(mins => CASE WHEN petitions THEN $4::int ELSE $3::int END)
                    THEN 'routine_no_answer'
                END AS code
         FROM runs
       )
       UPDATE kanban_ai_automation_outbox o
       SET status = 'failed', last_error = e.code, updated_at = NOW()
       FROM expired e
       WHERE o.id = e.id AND o.client_id = $1 AND o.status = 'dispatched' AND e.code IS NOT NULL
       RETURNING o.id, o.card_id AS "cardId", o.requester_identity_id AS "requesterIdentityId", o.last_error AS code`,
      [clientId, ROUTINE_PICKUP_TIMEOUT_MINUTES, DISPATCHED_RUN_TIMEOUT_MINUTES, PETITIONS_IDLE_TIMEOUT_MINUTES, PETITIONS_TOTAL_TIMEOUT_MINUTES],
    );
    return result.rows;
  }

  async releaseForRetry(databaseRef: string, id: string, code: string): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_ai_automation_outbox
       SET status = 'pending', last_error = $2, next_attempt_at = NOW() + INTERVAL '1 minute', updated_at = NOW()
       WHERE id = $1 AND status = 'processing'`,
      [id, code.slice(0, 120)],
    );
  }

  private async finish(
    databaseRef: string,
    id: string,
    status: 'completed' | 'review_required' | 'awaiting_confirmation' | 'failed',
    executionId: string | null,
    error: string | null,
  ): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_ai_automation_outbox
       SET status = $2, ai_execution_id = $3, last_error = $4, updated_at = NOW()
       WHERE id = $1 AND status = 'processing'`,
      [id, status, executionId, error?.slice(0, 120) ?? null],
    );
  }
}
