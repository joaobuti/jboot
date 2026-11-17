import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { KanbanViewer, visibleCardScope } from '../shared/card-visibility';
import { markDefaultNoPriorLawsuits } from '../prior-lawsuits/prior-lawsuits.repository';

export interface CustomerOfficeRow {
  officeId: string;
  source: string;
  linkedAt: string;
  linkedByIdentityId: string | null;
}

export interface VisibleCustomerCardRow {
  id: string;
  boardId: string;
  boardColumnId: string;
  officeId: string | null;
  title: string;
  status: string;
}

export interface CreateCardCommandInput {
  idempotencyKey: string;
  requestHash: string;
  customerId: string;
  boardId: string;
  columnId: string;
  officeId: string;
  title: string;
  identityId: string;
  ip?: string;
  userAgent?: string;
}

export interface LinkExistingCardInput {
  customerId: string;
  boardId: string;
  cardId: string;
  officeId: string;
  identityId: string;
  previousCustomerId: string | null;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class FlowCustomersRepository {
  constructor(private readonly database: DatabaseService) {}

  async listVisibleCustomerIds(databaseRef: string, clientId: string, officeIds: string[]): Promise<string[]> {
    if (officeIds.length === 0) return [];
    const result = await this.database.queryForDatabaseRef<{ customerId: string }>(
      databaseRef,
      `SELECT DISTINCT customer_id AS "customerId" FROM kanban_customer_offices
       WHERE client_id = $1 AND office_id = ANY($2::uuid[]) AND unlinked_at IS NULL
       ORDER BY "customerId" LIMIT 10000`,
      [clientId, officeIds]
    );
    return result.rows.map((row) => row.customerId);
  }

  async listActiveOffices(databaseRef: string, clientId: string, customerId: string): Promise<CustomerOfficeRow[]> {
    const result = await this.database.queryForDatabaseRef<CustomerOfficeRow>(
      databaseRef,
      `SELECT office_id AS "officeId", source, linked_at AS "linkedAt",
              linked_by_identity_id AS "linkedByIdentityId"
       FROM kanban_customer_offices
       WHERE client_id = $1 AND customer_id = $2 AND unlinked_at IS NULL
       ORDER BY linked_at, office_id LIMIT 500`,
      [clientId, customerId]
    );
    return result.rows;
  }

  async replaceOffices(
    databaseRef: string,
    clientId: string,
    customerId: string,
    officeIds: string[],
    identityId: string,
    source: 'flow_customer' | 'admin',
    reason?: string
  ): Promise<void> {
    await this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`, [clientId, customerId]);
      const current = await tx.query<{ officeId: string }>(
        `SELECT office_id AS "officeId" FROM kanban_customer_offices
         WHERE client_id = $1 AND customer_id = $2 AND unlinked_at IS NULL FOR UPDATE`,
        [clientId, customerId]
      );
      const currentIds = new Set(current.rows.map((row) => row.officeId));
      const targetIds = new Set(officeIds);
      const removed = [...currentIds].filter((id) => !targetIds.has(id));
      const added = [...targetIds].filter((id) => !currentIds.has(id));
      if ((removed.length > 0 || (currentIds.size > 0 && added.length > 0)) && !reason) {
        throw new ConflictException({ code: 'office_link_reason_required', message: 'Office link change requires a reason' });
      }
      if (removed.length > 0) {
        await tx.query(
          `UPDATE kanban_customer_offices SET unlinked_at = now(), unlinked_by_identity_id = $4, unlink_reason = $5
           WHERE client_id = $1 AND customer_id = $2 AND office_id = ANY($3::uuid[]) AND unlinked_at IS NULL`,
          [clientId, customerId, removed, identityId, reason]
        );
      }
      if (added.length > 0) {
        await tx.query(
          `INSERT INTO kanban_customer_offices
             (client_id, customer_id, office_id, source, linked_by_identity_id)
           SELECT $1, $2, office_id, $4, $5 FROM unnest($3::uuid[]) AS office_id`,
          [clientId, customerId, added, source, identityId]
        );
      }
      if (officeIds.length > 0) await markDefaultNoPriorLawsuits(tx, clientId, customerId, identityId);
    });
  }

  async listVisibleCards(
    databaseRef: string,
    clientId: string,
    customerId: string,
    viewer: KanbanViewer
  ): Promise<VisibleCustomerCardRow[]> {
    const scope = visibleCardScope(viewer, 'c', 3);
    const result = await this.database.queryForDatabaseRef<VisibleCustomerCardRow>(
      databaseRef,
      `SELECT c.id, c.board_id AS "boardId", c.board_column_id AS "boardColumnId",
              c.office_id AS "officeId", c.title, c.status
       FROM kanban_card_customers cc
       JOIN kanban_cards c ON c.client_id = cc.client_id AND c.id = cc.card_id
       WHERE cc.client_id = $1 AND cc.customer_id = $2 AND c.status <> 'deleted' AND ${scope.sql}
       ORDER BY c.updated_at DESC, c.id LIMIT 500`,
      [clientId, customerId, ...scope.params]
    );
    return result.rows;
  }

  async createCardFromCustomer(
    databaseRef: string,
    clientId: string,
    input: CreateCardCommandInput
  ): Promise<{ cardId: string; replay: boolean }> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      const claimed = await tx.query<{ id: string }>(
        `INSERT INTO kanban_customer_card_commands
           (client_id, idempotency_key, customer_id, board_id, column_id, office_id,
            request_hash, status, created_by_identity_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'processing',$8)
         ON CONFLICT (client_id, created_by_identity_id, idempotency_key) DO NOTHING RETURNING id`,
        [clientId, input.idempotencyKey, input.customerId, input.boardId, input.columnId, input.officeId, input.requestHash, input.identityId]
      );
      if (claimed.rowCount === 0) {
        const existing = await tx.query<{ requestHash: string; status: string; cardId: string | null }>(
          `SELECT request_hash AS "requestHash", status, card_id AS "cardId"
           FROM kanban_customer_card_commands
           WHERE client_id = $1 AND created_by_identity_id = $2 AND idempotency_key = $3 FOR UPDATE`,
          [clientId, input.identityId, input.idempotencyKey]
        );
        const row = existing.rows[0];
        if (!row || row.requestHash !== input.requestHash) {
          throw new ConflictException({ code: 'idempotency_conflict', message: 'Idempotency key was used with another payload' });
        }
        if (row.status === 'completed' && row.cardId) {
          const stillVisible = await tx.query<{ id: string }>(
            `SELECT c.id FROM kanban_cards c
             JOIN kanban_card_customers cc ON cc.client_id = c.client_id AND cc.card_id = c.id
             WHERE c.client_id = $1 AND c.id = $2 AND c.board_id = $3 AND c.board_column_id = $4
               AND c.office_id = $5 AND c.status <> 'deleted' AND cc.customer_id = $6`,
            [clientId, row.cardId, input.boardId, input.columnId, input.officeId, input.customerId]
          );
          if (!stillVisible.rows[0]) throw new NotFoundException('Card not found');
          return { cardId: row.cardId, replay: true };
        }
        throw new ConflictException({ code: 'idempotency_in_progress', message: 'Command is already processing' });
      }

      const column = await tx.query<{ wipLimit: number | null }>(
        `SELECT wip_limit AS "wipLimit" FROM kanban_board_columns
         WHERE client_id = $1 AND board_id = $2 AND id = $3 AND status = 'active' FOR UPDATE`,
        [clientId, input.boardId, input.columnId]
      );
      if (!column.rows[0]) throw new NotFoundException('Board column not found');
      if (column.rows[0].wipLimit !== null) {
        const count = await tx.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM kanban_cards
           WHERE client_id = $1 AND board_column_id = $2 AND status = 'active'`,
          [clientId, input.columnId]
        );
        if (Number(count.rows[0]?.count ?? 0) >= column.rows[0].wipLimit) {
          throw new ConflictException({ code: 'wip_limit_exceeded', message: 'Column WIP limit exceeded' });
        }
      }
      const position = await tx.query<{ next: number }>(
        `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM kanban_cards
         WHERE client_id = $1 AND board_column_id = $2 AND status = 'active'`,
        [clientId, input.columnId]
      );
      const card = await tx.query<{ id: string }>(
        `INSERT INTO kanban_cards
           (client_id, board_id, board_column_id, title, position, created_by_identity_id, office_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [clientId, input.boardId, input.columnId, input.title, position.rows[0]?.next ?? 0, input.identityId, input.officeId]
      );
      const cardId = card.rows[0].id;
      await tx.query(
        `INSERT INTO kanban_card_customers (card_id, client_id, customer_id, created_by_identity_id)
         VALUES ($1,$2,$3,$4)`,
        [cardId, clientId, input.customerId, input.identityId]
      );
      await tx.query(
        `INSERT INTO kanban_customer_offices (client_id, customer_id, office_id, source, linked_by_identity_id)
         VALUES ($1,$2,$3,'card',$4) ON CONFLICT (client_id, customer_id, office_id) WHERE unlinked_at IS NULL DO NOTHING`,
        [clientId, input.customerId, input.officeId, input.identityId]
      );
      await tx.query(
        `INSERT INTO kanban_card_activities
           (client_id, card_id, type, author_identity_id, event_payload)
         VALUES ($1,$2,'system_event',$3,$4::jsonb)`,
        [clientId, cardId, input.identityId, JSON.stringify({ kind: 'card.customer_linked', customerId: input.customerId })]
      );
      await tx.query(
        `INSERT INTO kanban_audit_events (client_id, identity_id, event_type, board_id, payload, ip, user_agent)
         VALUES ($1,$2,'kanban_card_created_from_customer',$3,$4::jsonb,$5,$6)`,
        [clientId, input.identityId, input.boardId,
          JSON.stringify({ cardId, customerId: input.customerId, officeId: input.officeId, boardColumnId: input.columnId }),
          input.ip ?? null, input.userAgent ?? null]
      );
      await tx.query(
        `UPDATE kanban_customer_card_commands SET status = 'completed', card_id = $4, completed_at = now()
         WHERE client_id = $1 AND created_by_identity_id = $2 AND idempotency_key = $3`,
        [clientId, input.identityId, input.idempotencyKey, cardId]
      );
      return { cardId, replay: false };
    });
  }

  async linkExistingCard(databaseRef: string, clientId: string, input: LinkExistingCardInput): Promise<void> {
    await this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      const card = await tx.query<{ id: string }>(
        `SELECT id FROM kanban_cards
         WHERE client_id = $1 AND board_id = $2 AND id = $3 AND office_id = $4 AND status <> 'deleted' FOR UPDATE`,
        [clientId, input.boardId, input.cardId, input.officeId]
      );
      if (!card.rows[0]) throw new NotFoundException('Card not found');
      await tx.query(`DELETE FROM kanban_card_customers WHERE client_id = $1 AND card_id = $2`, [clientId, input.cardId]);
      await tx.query(
        `INSERT INTO kanban_card_customers (card_id, client_id, customer_id, created_by_identity_id)
         VALUES ($1,$2,$3,$4)`,
        [input.cardId, clientId, input.customerId, input.identityId]
      );
      const kind = input.previousCustomerId ? 'card.customer_changed' : 'card.customer_linked';
      const payload = {
        kind,
        customerId: input.customerId,
        ...(input.previousCustomerId ? { previousCustomerId: input.previousCustomerId } : {})
      };
      await tx.query(
        `INSERT INTO kanban_card_activities (client_id, card_id, type, author_identity_id, event_payload)
         VALUES ($1,$2,'system_event',$3,$4::jsonb)`,
        [clientId, input.cardId, input.identityId, JSON.stringify(payload)]
      );
      await tx.query(
        `INSERT INTO kanban_audit_events (client_id, identity_id, event_type, board_id, payload, ip, user_agent)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
        [clientId, input.identityId, `kanban_${kind.replace('.', '_')}`, input.boardId,
          JSON.stringify({ cardId: input.cardId, customerId: input.customerId }), input.ip ?? null, input.userAgent ?? null]
      );
    });
  }
}
