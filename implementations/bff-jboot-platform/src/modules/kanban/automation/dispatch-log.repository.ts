import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { KanbanViewer, visibleCardScope } from '../shared/card-visibility';
import { ColumnAutomationActionConfigDto, ColumnAutomationRecipientRole, ColumnAutomationTriggerType } from './dto/automation-rule.dto';

export type AutomationDispatchStatus = 'pending' | 'processing' | 'sent' | 'skipped' | 'failed';

/** Tentativas antes da falha terminal (DLQ). Espera entre elas: 1, 2, 4 e 8 minutos. */
export const EMAIL_DISPATCH_MAX_ATTEMPTS = 5;

/**
 * Linha retomada pelo worker, com a regra e o quadro lidos no momento do envio
 * (o job leva so o id). `ruleActive` falso: regra removida, inativa ou de outra
 * acao — o envio e pulado.
 */
export interface ClaimedDispatch {
  id: string;
  clientId: string;
  automationRuleId: string;
  cardId: string;
  boardColumnId: string;
  sourceActivityId: string | null;
  dispatchDate: string | null;
  attemptCount: number;
  boardId: string | null;
  ruleActive: boolean;
  triggerType: ColumnAutomationTriggerType | null;
  recipientRole: ColumnAutomationRecipientRole | null;
  actionConfig: ColumnAutomationActionConfigDto | null;
  triggerConfig: { daysBefore?: number; daysStale?: number } | null;
}

export interface DispatchBacklog {
  pending: number;
  processing: number;
  failed: number;
  oldestPendingAt: string | null;
}

export interface AdminDispatchRow {
  id: string;
  status: AutomationDispatchStatus;
  attemptCount: number;
  lastError: string | null;
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
  boardId: string;
  boardName: string;
  columnName: string;
  cardId: string;
  cardTitle: string;
  triggerType: ColumnAutomationTriggerType;
}

export interface ScheduledIntent {
  automationRuleId: string;
  cardId: string;
  boardColumnId: string;
}

const REACTIVE_CONFLICT =
  'ON CONFLICT (card_id, board_column_id, automation_rule_id, source_activity_id) WHERE source_activity_id IS NOT NULL DO NOTHING';

/**
 * Intencao reativa derivada do evento do card + regras de e-mail ativas (mesmo
 * padrao do outbox de IA). A coluna da regra e o destino em `column_entered`, a
 * origem em `column_left` e a coluna do card no evento em
 * `juridico_process_moved` e `djen_publication_received`. Regra criada depois do evento nao dispara.
 */
function reactiveIntentSql(activityFilter: string): string {
  return `INSERT INTO kanban_automation_dispatch_log
      (client_id, automation_rule_id, card_id, board_column_id, source_activity_id, status, attempt_count, next_attempt_at)
    SELECT a.client_id, r.id, a.card_id, r.board_column_id, a.id, 'pending', 0, now()
    FROM kanban_card_activities a
    JOIN kanban_cards c ON c.client_id = a.client_id AND c.id = a.card_id
    JOIN kanban_column_automation_rules r
      ON r.client_id = a.client_id
     AND r.board_id = c.board_id
     AND r.action_type = 'send_email_notification'
     AND r.recipient_role IS NOT NULL
     AND r.is_active = true
     AND r.created_at <= a.created_at
     AND (
       (a.event_payload->>'kind' = 'card.moved' AND r.trigger_type = 'column_entered'
         AND r.board_column_id = (a.event_payload->>'toBoardColumnId')::uuid)
       OR (a.event_payload->>'kind' = 'card.moved' AND r.trigger_type = 'column_left'
         AND r.board_column_id = (a.event_payload->>'fromBoardColumnId')::uuid)
       OR (a.event_payload->>'kind' = 'juridico_process_changed' AND r.trigger_type = 'juridico_process_moved'
         AND r.board_column_id = (a.event_payload->>'boardColumnId')::uuid)
       OR (a.event_payload->>'kind' = 'djen_publication_received' AND r.trigger_type = 'djen_publication_received'
         AND r.board_column_id = (a.event_payload->>'boardColumnId')::uuid)
     )
    WHERE a.client_id = $1 AND a.type = 'system_event' AND ${activityFilter}
    ${REACTIVE_CONFLICT}
    RETURNING id`;
}

const CLAIMABLE = `((d.status = 'pending' AND d.next_attempt_at <= now())
  OR (d.status = 'processing' AND d.updated_at < now() - interval '5 minutes'))`;

/**
 * Outbox das automacoes de e-mail (Sprint 13). A intencao nasce no banco; o
 * Valkey so entrega o id. Idempotencia pelas UNIQUE parciais da Sprint 9
 * (`source_activity_id` reativo, `dispatch_date` agendado); retentativa e
 * falha terminal tambem ficam aqui, nao no BullMQ.
 */
@Injectable()
export class DispatchLogRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Caminho rapido: logo apos gravar o evento do card. */
  async recordForActivity(databaseRef: string, clientId: string, activityId: string): Promise<string[]> {
    const result = await this.database.queryForDatabaseRef<{ id: string }>(
      databaseRef,
      reactiveIntentSql('a.id = $2'),
      [clientId, activityId]
    );
    return result.rows.map((row) => row.id);
  }

  /** Varredura: evento gravado cuja intencao se perdeu (queda entre os dois passos). */
  async recoverRecent(databaseRef: string, clientId: string): Promise<number> {
    const result = await this.database.queryForDatabaseRef(
      databaseRef,
      reactiveIntentSql(`a.created_at >= now() - interval '24 hours'`),
      [clientId]
    );
    return result.rowCount ?? 0;
  }

  async recordScheduled(
    databaseRef: string,
    clientId: string,
    dispatchDate: string,
    intents: ScheduledIntent[]
  ): Promise<string[]> {
    if (intents.length === 0) {
      return [];
    }
    const result = await this.database.queryForDatabaseRef<{ id: string }>(
      databaseRef,
      `INSERT INTO kanban_automation_dispatch_log
         (client_id, automation_rule_id, card_id, board_column_id, dispatch_date, status, attempt_count, next_attempt_at)
       SELECT $1, i.rule_id, i.card_id, i.column_id, $2::date, 'pending', 0, now()
       FROM unnest($3::uuid[], $4::uuid[], $5::uuid[]) AS i(rule_id, card_id, column_id)
       ON CONFLICT (card_id, board_column_id, automation_rule_id, dispatch_date) WHERE dispatch_date IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        clientId,
        dispatchDate,
        intents.map((intent) => intent.automationRuleId),
        intents.map((intent) => intent.cardId),
        intents.map((intent) => intent.boardColumnId)
      ]
    );
    return result.rows.map((row) => row.id);
  }

  async listDue(databaseRef: string, clientId: string): Promise<string[]> {
    const result = await this.database.queryForDatabaseRef<{ id: string }>(
      databaseRef,
      `SELECT d.id FROM kanban_automation_dispatch_log d
       WHERE d.client_id = $1 AND ${CLAIMABLE}
       ORDER BY d.next_attempt_at
       LIMIT 100`,
      [clientId]
    );
    return result.rows.map((row) => row.id);
  }

  async claim(databaseRef: string, id: string): Promise<ClaimedDispatch | null> {
    const result = await this.database.queryForDatabaseRef<ClaimedDispatch>(
      databaseRef,
      `WITH claimed AS (
         UPDATE kanban_automation_dispatch_log d
         SET status = 'processing', attempt_count = attempt_count + 1, updated_at = now()
         WHERE d.id = $1 AND ${CLAIMABLE}
         RETURNING d.*
       )
       SELECT d.id, d.client_id AS "clientId", d.automation_rule_id AS "automationRuleId", d.card_id AS "cardId",
              d.board_column_id AS "boardColumnId", d.source_activity_id AS "sourceActivityId",
              d.dispatch_date::text AS "dispatchDate", d.attempt_count AS "attemptCount",
              c.board_id AS "boardId",
              COALESCE(r.is_active AND r.action_type = 'send_email_notification' AND r.recipient_role IS NOT NULL, false) AS "ruleActive",
              r.trigger_type AS "triggerType", r.recipient_role AS "recipientRole",
              r.action_config AS "actionConfig", r.trigger_config AS "triggerConfig"
       FROM claimed d
       LEFT JOIN kanban_cards c ON c.client_id = d.client_id AND c.id = d.card_id
       LEFT JOIN kanban_column_automation_rules r ON r.client_id = d.client_id AND r.id = d.automation_rule_id`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async sentRecipients(databaseRef: string, clientId: string, dispatchId: string): Promise<string[]> {
    const result = await this.database.queryForDatabaseRef<{ identityId: string }>(
      databaseRef,
      `SELECT identity_id AS "identityId" FROM kanban_automation_dispatch_recipients
       WHERE client_id = $1 AND dispatch_id = $2`,
      [clientId, dispatchId]
    );
    return result.rows.map((row) => row.identityId);
  }

  async recordRecipientSent(databaseRef: string, clientId: string, dispatchId: string, identityId: string): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `INSERT INTO kanban_automation_dispatch_recipients (dispatch_id, client_id, identity_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (dispatch_id, identity_id) DO NOTHING`,
      [dispatchId, clientId, identityId]
    );
  }

  async markSent(databaseRef: string, id: string): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_automation_dispatch_log
       SET status = 'sent', sent_at = now(), last_error = NULL, updated_at = now()
       WHERE id = $1 AND status = 'processing'`,
      [id]
    );
  }

  async markSkipped(databaseRef: string, id: string, reason: string): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_automation_dispatch_log
       SET status = 'skipped', last_error = $2, updated_at = now()
       WHERE id = $1 AND status = 'processing'`,
      [id, reason.slice(0, 200)]
    );
  }

  /** Nova tentativa com espera exponencial ou, esgotadas as tentativas, falha terminal. */
  async scheduleRetryOrFail(databaseRef: string, id: string, error: string): Promise<AutomationDispatchStatus | null> {
    const result = await this.database.queryForDatabaseRef<{ status: AutomationDispatchStatus }>(
      databaseRef,
      `UPDATE kanban_automation_dispatch_log
       SET status = CASE WHEN attempt_count >= $3 THEN 'failed' ELSE 'pending' END,
           next_attempt_at = now() + least(power(2, greatest(attempt_count - 1, 0)), 30) * interval '1 minute',
           last_error = $2, updated_at = now()
       WHERE id = $1 AND status = 'processing'
       RETURNING status`,
      [id, error.slice(0, 200), EMAIL_DISPATCH_MAX_ATTEMPTS]
    );
    return result.rows[0]?.status ?? null;
  }

  async backlog(databaseRef: string, clientId: string): Promise<DispatchBacklog> {
    const result = await this.database.queryForDatabaseRef<DispatchBacklog>(
      databaseRef,
      `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
              count(*) FILTER (WHERE status = 'processing')::int AS processing,
              count(*) FILTER (WHERE status = 'failed')::int AS failed,
              min(created_at) FILTER (WHERE status = 'pending') AS "oldestPendingAt"
       FROM kanban_automation_dispatch_log
       WHERE client_id = $1 AND status IN ('pending', 'processing', 'failed')`,
      [clientId]
    );
    return result.rows[0] ?? { pending: 0, processing: 0, failed: 0, oldestPendingAt: null };
  }

  /** Tela de envios (`flow:admin`): so linhas de cards visiveis ao usuario. */
  async listForAdmin(
    databaseRef: string,
    clientId: string,
    viewer: KanbanViewer,
    statuses: AutomationDispatchStatus[]
  ): Promise<AdminDispatchRow[]> {
    const scope = visibleCardScope(viewer, 'c', 3);
    const result = await this.database.queryForDatabaseRef<AdminDispatchRow>(
      databaseRef,
      `SELECT d.id, d.status, d.attempt_count AS "attemptCount", d.last_error AS "lastError",
              d.next_attempt_at AS "nextAttemptAt", d.created_at AS "createdAt", d.updated_at AS "updatedAt",
              c.board_id AS "boardId", b.name AS "boardName", col.name AS "columnName",
              c.id AS "cardId", c.title AS "cardTitle", r.trigger_type AS "triggerType"
       FROM kanban_automation_dispatch_log d
       JOIN kanban_cards c ON c.client_id = d.client_id AND c.id = d.card_id
       JOIN kanban_boards b ON b.client_id = c.client_id AND b.id = c.board_id
       JOIN kanban_board_columns col ON col.client_id = d.client_id AND col.id = d.board_column_id
       JOIN kanban_column_automation_rules r ON r.client_id = d.client_id AND r.id = d.automation_rule_id
       WHERE d.client_id = $1 AND d.status = ANY($2::text[]) AND c.status <> 'deleted' AND ${scope.sql}
       ORDER BY d.updated_at DESC, d.id
       LIMIT 200`,
      [clientId, statuses, ...scope.params]
    );
    return result.rows;
  }

  async findTarget(
    databaseRef: string,
    clientId: string,
    id: string
  ): Promise<{ id: string; status: AutomationDispatchStatus; cardId: string; boardId: string } | null> {
    const result = await this.database.queryForDatabaseRef<{ id: string; status: AutomationDispatchStatus; cardId: string; boardId: string }>(
      databaseRef,
      `SELECT d.id, d.status, d.card_id AS "cardId", c.board_id AS "boardId"
       FROM kanban_automation_dispatch_log d
       JOIN kanban_cards c ON c.client_id = d.client_id AND c.id = d.card_id
       WHERE d.client_id = $1 AND d.id = $2`,
      [clientId, id]
    );
    return result.rows[0] ?? null;
  }

  /** Reprocessar: so falha terminal; volta a fila com tentativas zeradas. */
  async requeueFailed(databaseRef: string, clientId: string, id: string): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_automation_dispatch_log
       SET status = 'pending', attempt_count = 0, next_attempt_at = now(), last_error = NULL, updated_at = now()
       WHERE client_id = $1 AND id = $2 AND status = 'failed'`,
      [clientId, id]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
