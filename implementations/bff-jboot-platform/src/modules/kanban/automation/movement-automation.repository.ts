import { ConflictException, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';

export interface MovementAutomationRun {
  id: string; clientId: string; ruleId: string; boardId: string; columnId: string; cardId: string;
  destinationColumnId: string; ownerIdentityId: string; depth: number; rootActivityId: string | null;
  claimToken: string; attemptCount: number;
}

@Injectable()
export class MovementAutomationRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Durable recovery from recorded events. No model payload supplies board or target authority. */
  async recover(databaseRef: string, clientId: string): Promise<void> {
    await this.database.queryForDatabaseRef(databaseRef, `
      WITH candidates AS (
        SELECT r.id rule_id, r.board_id,
          CASE WHEN r.trigger_type='column_left' THEN (a.event_payload->>'toBoardColumnId')::uuid ELSE r.board_column_id END board_column_id,
          c.id card_id, a.id source_id,
          a.id::text source_key, r.action_config->>'toBoardColumnId' target,
          r.created_by_identity_id owner_id,
          LEAST(COALESCE((a.event_payload->>'automationDepth')::int,0),10)+1 depth,
          COALESCE((a.event_payload->>'automationRootActivityId')::uuid,a.id) root_id
        FROM kanban_column_automation_rules r
        JOIN kanban_cards c ON c.client_id=r.client_id AND c.board_id=r.board_id AND c.status='active'
        JOIN kanban_card_activities a ON a.client_id=c.client_id AND a.card_id=c.id AND a.type='system_event'
        WHERE r.client_id=$1 AND r.action_type='move_card' AND r.is_active=true
          AND a.created_at >= r.created_at AND a.created_at >= NOW()-INTERVAL '7 days'
          AND ((r.trigger_type='ai_completed' AND a.event_payload->>'kind'='ai.automation_completed'
                AND r.board_column_id::text=a.event_payload->>'boardColumnId')
            OR (r.trigger_type='column_entered' AND a.event_payload->>'kind'='card.moved'
                AND r.board_column_id::text=a.event_payload->>'toBoardColumnId')
            OR (r.trigger_type='column_left' AND a.event_payload->>'kind'='card.moved'
                AND r.board_column_id::text=a.event_payload->>'fromBoardColumnId')
            OR (r.trigger_type='juridico_process_moved' AND a.event_payload->>'kind'='juridico_process_changed'
                AND r.board_column_id=c.board_column_id)
            OR (r.trigger_type='djen_publication_received' AND a.event_payload->>'kind'='djen_publication_received'
                AND r.board_column_id=c.board_column_id)
            OR (r.trigger_type='signed_kit_approved' AND a.event_payload->>'kind'='card.signed_kit_approved'
                AND r.board_column_id=c.board_column_id))
        UNION ALL
        SELECT r.id,r.board_id,r.board_column_id,c.id,NULL,CURRENT_DATE::text,
          r.action_config->>'toBoardColumnId',r.created_by_identity_id,1,NULL
        FROM kanban_column_automation_rules r JOIN kanban_cards c
          ON c.client_id=r.client_id AND c.board_id=r.board_id AND c.board_column_id=r.board_column_id
        WHERE r.client_id=$1 AND r.action_type='move_card' AND r.is_active=true AND c.status='active'
          AND ((r.trigger_type='due_date_approaching' AND c.due_date-(r.trigger_config->>'daysBefore')::int=CURRENT_DATE)
            OR (r.trigger_type='card_stale' AND c.updated_at::date+(r.trigger_config->>'daysStale')::int<=CURRENT_DATE))
      ) INSERT INTO kanban_movement_automation_outbox
        (client_id,automation_rule_id,board_id,board_column_id,card_id,source_activity_id,source_key,
         destination_column_id,owner_identity_id,automation_depth,root_activity_id)
      SELECT $1,x.rule_id,x.board_id,x.board_column_id,x.card_id,x.source_id,x.source_key,
        x.target::uuid,x.owner_id,x.depth,x.root_id
      FROM candidates x WHERE NOT EXISTS (SELECT 1 FROM kanban_movement_automation_outbox o
        WHERE o.client_id=$1 AND o.automation_rule_id=x.rule_id AND o.card_id=x.card_id AND o.source_key=x.source_key)
      ORDER BY x.source_key LIMIT 100
      ON CONFLICT (client_id,automation_rule_id,card_id,source_key) DO NOTHING`, [clientId]);
  }

  async claim(databaseRef: string, clientId: string): Promise<MovementAutomationRun | null> {
    await this.database.queryForDatabaseRef(databaseRef, `UPDATE kanban_movement_automation_outbox
      SET status='failed',last_error='automation_retry_exhausted',updated_at=now()
      WHERE client_id=$1 AND attempt_count>=5 AND status='processing' AND updated_at<now()-INTERVAL '5 minutes'`, [clientId]);
    const result = await this.database.queryForDatabaseRef<MovementAutomationRun>(databaseRef, `
      UPDATE kanban_movement_automation_outbox o SET status='processing',claim_token=gen_random_uuid(),
        attempt_count=attempt_count+1,updated_at=now()
      WHERE o.client_id=$1 AND o.id=(SELECT id FROM kanban_movement_automation_outbox
        WHERE client_id=$1 AND attempt_count<5 AND next_attempt_at<=now()
          AND (status='pending' OR (status='processing' AND updated_at<now()-INTERVAL '5 minutes'))
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id,client_id AS "clientId",automation_rule_id AS "ruleId",board_id AS "boardId",
        board_column_id AS "columnId",card_id AS "cardId",destination_column_id AS "destinationColumnId",
        owner_identity_id AS "ownerIdentityId",automation_depth AS depth,root_activity_id AS "rootActivityId",
        claim_token AS "claimToken",attempt_count AS "attemptCount"`, [clientId]);
    return result.rows[0] ?? null;
  }

  /** Called inside the canonical card movement transaction: receipt + movement are atomic. */
  async commit(client: PoolClient, run: MovementAutomationRun): Promise<void> {
    const rule = await client.query(`SELECT id FROM kanban_column_automation_rules WHERE client_id=$1 AND id=$2
      AND board_id=$3 AND is_active=true AND action_type='move_card'
      AND action_config->>'toBoardColumnId'=$4 AND created_by_identity_id=$5 FOR SHARE`,
    [run.clientId, run.ruleId, run.boardId, run.destinationColumnId, run.ownerIdentityId]);
    if (!rule.rows.length) throw new ConflictException({ code: 'automation_rule_changed' });
    const receipt = await client.query(`UPDATE kanban_movement_automation_outbox SET status='completed',updated_at=now(),last_error=NULL
      WHERE client_id=$1 AND id=$2 AND claim_token=$3 AND status='processing' RETURNING id`,
    [run.clientId, run.id, run.claimToken]);
    if (!receipt.rows.length) throw new ConflictException({ code: 'automation_claim_expired' });
  }

  async finish(databaseRef: string, run: MovementAutomationRun, status: 'skipped' | 'failed' | 'pending', code: string): Promise<void> {
    await this.database.queryForDatabaseRef(databaseRef, `UPDATE kanban_movement_automation_outbox
      SET status=$4,last_error=$5,updated_at=now(),next_attempt_at=now()+INTERVAL '1 minute'
      WHERE client_id=$1 AND id=$2 AND claim_token=$3 AND status='processing'`,
    [run.clientId,run.id,run.claimToken,status,code.slice(0,120)]);
  }
}
