import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ColumnAutomationActionConfigDto, ColumnAutomationRecipientRole } from './dto/automation-rule.dto';

export interface ActiveFlowTenant {
  databaseRef: string;
  clientId: string;
}

export interface DueDateApproachingCandidate {
  ruleId: string;
  boardId: string;
  boardColumnId: string;
  cardId: string;
  recipientRole: ColumnAutomationRecipientRole;
  actionConfig: ColumnAutomationActionConfigDto;
  daysBefore: number;
}

export interface CardStaleCandidate {
  ruleId: string;
  boardId: string;
  boardColumnId: string;
  cardId: string;
  recipientRole: ColumnAutomationRecipientRole;
  actionConfig: ColumnAutomationActionConfigDto;
  daysStale: number;
}

/**
 * Repositorio do scheduler (Sprint 9). Duas responsabilidades separadas do
 * AutomationRulesRepository (que so conhece o banco dedicado de um tenant por
 * vez, resolvido via request/context):
 *
 * 1. `listActiveFlowTenants`: fan-out multi-tenant fora de request (o cron nao
 *    tem JWT) — itera `database_refs` no Identity filtrado por
 *    `application_slug = 'flow'`, mesma fonte que o modulo ja usa para
 *    resolver banco por requisicao (ver
 *    DomainIntegrationsRepository.resolveFlowDestination). Ver
 *    docs/product/kanban-sprint-9-gate.md, secao "Fan-out multi-tenant".
 * 2. Candidatos de `due_date_approaching`/`card_stale` por tenant, calculo em
 *    SQL (nao em app) para evitar drift de timezone entre app e banco.
 */
@Injectable()
export class ScheduledAutomationRepository {
  constructor(private readonly database: DatabaseService) {}

  async listActiveFlowTenants(): Promise<ActiveFlowTenant[]> {
    const result = await this.database.queryIdentity<{ databaseRef: string; clientId: string }>(
      `SELECT dr.id AS "databaseRef", dr.client_id AS "clientId"
       FROM database_refs dr
       JOIN applications a ON a.id = dr.application_id
       WHERE a.slug = 'flow'
         AND a.status = 'active'
         AND dr.status = 'active'
         AND dr.client_id IS NOT NULL`
    );
    return result.rows;
  }

  async findDueDateApproachingCandidates(databaseRef: string, clientId: string): Promise<DueDateApproachingCandidate[]> {
    const result = await this.database.queryForDatabaseRef<DueDateApproachingCandidate>(
      databaseRef,
      `SELECT r.id AS "ruleId", r.board_id AS "boardId", r.board_column_id AS "boardColumnId", c.id AS "cardId",
              r.recipient_role AS "recipientRole", r.action_config AS "actionConfig",
              (r.trigger_config->>'daysBefore')::int AS "daysBefore"
       FROM kanban_column_automation_rules r
       JOIN kanban_cards c ON c.board_column_id = r.board_column_id AND c.client_id = r.client_id
       WHERE r.client_id = $1
         AND r.trigger_type = 'due_date_approaching'
         AND r.action_type = 'send_email_notification'
         AND r.is_active = true
         AND c.status = 'active'
         AND c.due_date IS NOT NULL
         AND c.due_date - ((r.trigger_config->>'daysBefore')::int) = CURRENT_DATE`,
      [clientId]
    );
    return result.rows;
  }

  async findCardStaleCandidates(databaseRef: string, clientId: string): Promise<CardStaleCandidate[]> {
    const result = await this.database.queryForDatabaseRef<CardStaleCandidate>(
      databaseRef,
      `SELECT r.id AS "ruleId", r.board_id AS "boardId", r.board_column_id AS "boardColumnId", c.id AS "cardId",
              r.recipient_role AS "recipientRole", r.action_config AS "actionConfig",
              (r.trigger_config->>'daysStale')::int AS "daysStale"
       FROM kanban_column_automation_rules r
       JOIN kanban_cards c ON c.board_column_id = r.board_column_id AND c.client_id = r.client_id
       WHERE r.client_id = $1
         AND r.trigger_type = 'card_stale'
         AND r.action_type = 'send_email_notification'
         AND r.is_active = true
         AND c.status = 'active'
         AND COALESCE(
               (SELECT MAX(a.created_at)
                FROM kanban_card_activities a
                WHERE a.client_id = c.client_id
                  AND a.card_id = c.id
                  AND a.type = 'system_event'
                  AND a.event_payload->>'kind' = 'card.moved'
                  AND a.event_payload->>'toBoardColumnId' = c.board_column_id::text),
               c.created_at
             ) <= now() - (((r.trigger_config->>'daysStale')::int) * interval '1 day')`,
      [clientId]
    );
    return result.rows;
  }
}
