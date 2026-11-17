import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';

export interface OfficeRow {
  id: string;
  name: string;
  active: boolean;
  /** Local do fecho da peticao (S7); os dois juntos ou nenhum. */
  city: string | null;
  uf: string | null;
  /** Escritorio principal: no maximo um por cliente, sempre ativo (flow-offices-sprints.md, S1). */
  isPrincipal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OfficeListRow extends OfficeRow {
  userCount: number;
  cardCount: number;
}

export interface OfficeSettingsRow {
  officeVisibilityEnabled: boolean;
  enabledByIdentityId: string | null;
  enabledAt: string | null;
  updatedAt: string | null;
}

export interface ViewerOfficeState {
  officeVisibilityEnabled: boolean;
  officeIds: string[];
}

export interface CardWithoutOfficeByBoard {
  boardId: string;
  boardName: string;
  count: number;
}

export interface AffectedAssignment {
  boardId: string;
  boardName: string;
  cardId: string;
  cardTitle: string;
  officeId: string;
}

export interface ReplaceUserOfficesResult {
  added: string[];
  removed: string[];
  removedAssignments: AffectedAssignment[];
}

const OFFICE_SELECT = `id, name, active, city, uf, is_principal AS "isPrincipal", created_at AS "createdAt", updated_at AS "updatedAt"`;

/** Inativar o escritorio principal deixaria a validacao sem reserva; marque outro antes. */
export const PRINCIPAL_OFFICE_ACTIVE = {
  code: 'office_principal_must_stay_active',
  message: 'Mark another office as principal before inactivating this one'
} as const;

/** Violacao do indice unico parcial de nome entre escritorios ativos. */
const OFFICE_NAME_TAKEN = { code: 'office_name_taken', message: 'An active office with this name already exists' } as const;

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}

/**
 * Escritorios do tenant (CRM de leads, Sprint 3.5): `kanban_offices`,
 * `kanban_user_offices`, `kanban_settings` e a coluna `kanban_cards.office_id`
 * (somente as escritas administrativas sobre ela). Leitura de visibilidade de
 * card NAO mora aqui: a regra e `shared/card-visibility.ts`.
 */
@Injectable()
export class OfficesRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Estado do usuario para a regra de visibilidade: chave do tenant + escritorios atuais. */
  async loadViewerState(databaseRef: string, clientId: string, identityId: string): Promise<ViewerOfficeState> {
    const result = await this.database.queryForDatabaseRef<ViewerOfficeState>(
      databaseRef,
      `SELECT COALESCE((SELECT office_visibility_enabled FROM kanban_settings WHERE client_id = $1), false)
                AS "officeVisibilityEnabled",
              COALESCE((SELECT array_agg(office_id ORDER BY office_id) FROM kanban_user_offices
                        WHERE client_id = $1 AND identity_id = $2), ARRAY[]::uuid[]) AS "officeIds"`,
      [clientId, identityId]
    );
    const row = result.rows[0];
    return { officeVisibilityEnabled: row?.officeVisibilityEnabled === true, officeIds: row?.officeIds ?? [] };
  }

  async isOfficeVisibilityEnabled(databaseRef: string, clientId: string): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef<{ enabled: boolean }>(
      databaseRef,
      `SELECT office_visibility_enabled AS enabled FROM kanban_settings WHERE client_id = $1`,
      [clientId]
    );
    return result.rows[0]?.enabled === true;
  }

  async getSettings(databaseRef: string, clientId: string): Promise<OfficeSettingsRow> {
    const result = await this.database.queryForDatabaseRef<OfficeSettingsRow>(
      databaseRef,
      `SELECT office_visibility_enabled AS "officeVisibilityEnabled", enabled_by_identity_id AS "enabledByIdentityId",
              enabled_at AS "enabledAt", updated_at AS "updatedAt"
       FROM kanban_settings WHERE client_id = $1`,
      [clientId]
    );
    return (
      result.rows[0] ?? { officeVisibilityEnabled: false, enabledByIdentityId: null, enabledAt: null, updatedAt: null }
    );
  }

  async setOfficeVisibility(
    databaseRef: string,
    clientId: string,
    enabled: boolean,
    identityId: string
  ): Promise<OfficeSettingsRow> {
    const result = await this.database.queryForDatabaseRef<OfficeSettingsRow>(
      databaseRef,
      `INSERT INTO kanban_settings (client_id, office_visibility_enabled, enabled_by_identity_id, enabled_at, updated_by_identity_id, updated_at)
       VALUES ($1, $2, CASE WHEN $2 THEN $3::uuid END, CASE WHEN $2 THEN now() END, $3, now())
       ON CONFLICT (client_id) DO UPDATE SET
         office_visibility_enabled = EXCLUDED.office_visibility_enabled,
         enabled_by_identity_id = CASE WHEN EXCLUDED.office_visibility_enabled THEN EXCLUDED.enabled_by_identity_id
                                       ELSE kanban_settings.enabled_by_identity_id END,
         enabled_at = CASE WHEN EXCLUDED.office_visibility_enabled THEN EXCLUDED.enabled_at
                           ELSE kanban_settings.enabled_at END,
         updated_by_identity_id = EXCLUDED.updated_by_identity_id,
         updated_at = now()
       RETURNING office_visibility_enabled AS "officeVisibilityEnabled", enabled_by_identity_id AS "enabledByIdentityId",
                 enabled_at AS "enabledAt", updated_at AS "updatedAt"`,
      [clientId, enabled, identityId]
    );
    return result.rows[0];
  }

  async list(databaseRef: string, clientId: string): Promise<OfficeListRow[]> {
    const result = await this.database.queryForDatabaseRef<OfficeRow & { userCount: string; cardCount: string }>(
      databaseRef,
      `SELECT o.id, o.name, o.active, o.city, o.uf, o.is_principal AS "isPrincipal", o.created_at AS "createdAt", o.updated_at AS "updatedAt",
              (SELECT count(*) FROM kanban_user_offices uo WHERE uo.client_id = o.client_id AND uo.office_id = o.id)::text
                AS "userCount",
              (SELECT count(*) FROM kanban_cards c
                WHERE c.client_id = o.client_id AND c.office_id = o.id AND c.status <> 'deleted')::text AS "cardCount"
       FROM kanban_offices o
       WHERE o.client_id = $1
       ORDER BY o.active DESC, lower(o.name), o.id
       LIMIT 500`,
      [clientId]
    );
    return result.rows.map((row) => ({ ...row, userCount: Number(row.userCount), cardCount: Number(row.cardCount) }));
  }

  /** Nomes de todos os escritorios do tenant (ou so dos ids informados). */
  async listByIds(databaseRef: string, clientId: string, officeIds: string[] | null): Promise<OfficeRow[]> {
    const result = await this.database.queryForDatabaseRef<OfficeRow>(
      databaseRef,
      `SELECT ${OFFICE_SELECT} FROM kanban_offices
       WHERE client_id = $1 AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))
       ORDER BY lower(name), id
       LIMIT 500`,
      [clientId, officeIds]
    );
    return result.rows;
  }

  async findById(databaseRef: string, clientId: string, officeId: string): Promise<OfficeRow | null> {
    const result = await this.database.queryForDatabaseRef<OfficeRow>(
      databaseRef,
      `SELECT ${OFFICE_SELECT} FROM kanban_offices WHERE client_id = $1 AND id = $2`,
      [clientId, officeId]
    );
    return result.rows[0] ?? null;
  }

  async countActive(databaseRef: string, clientId: string): Promise<number> {
    const result = await this.database.queryForDatabaseRef<{ count: string }>(
      databaseRef,
      `SELECT count(*)::text AS count FROM kanban_offices WHERE client_id = $1 AND active`,
      [clientId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async create(
    databaseRef: string,
    clientId: string,
    name: string,
    identityId: string,
    place: { city: string; uf: string } | null = null
  ): Promise<OfficeRow> {
    try {
      const result = await this.database.queryForDatabaseRef<OfficeRow>(
        databaseRef,
        // O primeiro escritorio do cliente (sem principal ativo) ja nasce principal.
        `INSERT INTO kanban_offices (client_id, name, created_by_identity_id, city, uf, is_principal)
         VALUES ($1, $2, $3, $4, $5, NOT EXISTS (SELECT 1 FROM kanban_offices WHERE client_id = $1 AND is_principal))
         RETURNING ${OFFICE_SELECT}`,
        [clientId, name, identityId, place?.city ?? null, place?.uf ?? null]
      );
      return result.rows[0];
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(OFFICE_NAME_TAKEN);
      }
      throw error;
    }
  }

  async update(
    databaseRef: string,
    clientId: string,
    officeId: string,
    patch: { name?: string; active?: boolean; place?: { city: string; uf: string } | null }
  ): Promise<OfficeRow> {
    let result;
    try {
      result = await this.database.queryForDatabaseRef<OfficeRow>(
        databaseRef,
        `UPDATE kanban_offices
         SET name = COALESCE($3, name), active = COALESCE($4, active),
             city = CASE WHEN $5::boolean THEN $6 ELSE city END, uf = CASE WHEN $5::boolean THEN $7 ELSE uf END,
             updated_at = now()
         WHERE client_id = $1 AND id = $2
         RETURNING ${OFFICE_SELECT}`,
        [clientId, officeId, patch.name ?? null, patch.active ?? null, patch.place !== undefined, patch.place?.city ?? null, patch.place?.uf ?? null]
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(OFFICE_NAME_TAKEN);
      }
      if ((error as { code?: string } | null)?.code === '23514') {
        throw new ConflictException(PRINCIPAL_OFFICE_ACTIVE);
      }
      throw error;
    }
    if (!result.rows[0]) {
      throw new NotFoundException({ code: 'office_not_found', message: 'Office not found' });
    }
    return result.rows[0];
  }

  /** Escritorio ativo escolhido pelo usuario (sem validar vinculo; quem chama confere). */
  async getActiveOfficePreference(databaseRef: string, clientId: string, identityId: string): Promise<string | null> {
    const result = await this.database.queryForDatabaseRef<{ officeId: string }>(
      databaseRef,
      `SELECT office_id AS "officeId" FROM kanban_user_active_office WHERE client_id = $1 AND identity_id = $2`,
      [clientId, identityId]
    );
    return result.rows[0]?.officeId ?? null;
  }

  async setActiveOfficePreference(databaseRef: string, clientId: string, identityId: string, officeId: string): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `INSERT INTO kanban_user_active_office (client_id, identity_id, office_id) VALUES ($1, $2, $3)
       ON CONFLICT (client_id, identity_id) DO UPDATE SET office_id = EXCLUDED.office_id, updated_at = now()`,
      [clientId, identityId, officeId]
    );
  }

  /** Marca o escritorio (ativo) como principal e desmarca o anterior, numa transacao. */
  async setPrincipal(databaseRef: string, clientId: string, officeId: string): Promise<OfficeRow> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      const target = await tx.query<{ active: boolean }>(
        `SELECT active FROM kanban_offices WHERE client_id = $1 AND id = $2 FOR UPDATE`,
        [clientId, officeId]
      );
      if (!target.rows[0]) throw new NotFoundException({ code: 'office_not_found', message: 'Office not found' });
      if (!target.rows[0].active) {
        throw new ConflictException({ code: 'office_principal_requires_active', message: 'Only an active office can be principal' });
      }
      await tx.query(
        `UPDATE kanban_offices SET is_principal = false, updated_at = now() WHERE client_id = $1 AND is_principal AND id <> $2`,
        [clientId, officeId]
      );
      const result = await tx.query<OfficeRow>(
        `UPDATE kanban_offices SET is_principal = true, updated_at = now() WHERE client_id = $1 AND id = $2 RETURNING ${OFFICE_SELECT}`,
        [clientId, officeId]
      );
      return result.rows[0];
    });
  }

  async findPrincipal(databaseRef: string, clientId: string): Promise<OfficeRow | null> {
    const result = await this.database.queryForDatabaseRef<OfficeRow>(
      databaseRef,
      `SELECT ${OFFICE_SELECT} FROM kanban_offices WHERE client_id = $1 AND is_principal`,
      [clientId]
    );
    return result.rows[0] ?? null;
  }

  /** Escritorios por usuario, para todos os vinculos do tenant ou so para os ids informados. */
  async listOfficeIdsByIdentity(
    databaseRef: string,
    clientId: string,
    identityIds: string[] | null
  ): Promise<Map<string, string[]>> {
    const result = await this.database.queryForDatabaseRef<{ identityId: string; officeIds: string[] }>(
      databaseRef,
      `SELECT identity_id AS "identityId", array_agg(office_id ORDER BY office_id) AS "officeIds"
       FROM kanban_user_offices
       WHERE client_id = $1 AND ($2::uuid[] IS NULL OR identity_id = ANY($2::uuid[]))
       GROUP BY identity_id`,
      [clientId, identityIds]
    );
    return new Map(result.rows.map((row) => [row.identityId, row.officeIds]));
  }

  /** Responsaveis por escritorio (ADR 018): quem conecta a conta Claude do escritorio. */
  async listResponsibles(databaseRef: string, clientId: string): Promise<Map<string, string[]>> {
    const result = await this.database.queryForDatabaseRef<{ officeId: string; identityIds: string[] }>(
      databaseRef,
      `SELECT office_id AS "officeId", array_agg(identity_id ORDER BY identity_id) AS "identityIds"
       FROM kanban_user_offices WHERE client_id = $1 AND is_responsible GROUP BY office_id`,
      [clientId]
    );
    return new Map(result.rows.map((row) => [row.officeId, row.identityIds]));
  }

  /** Escritorios em que cada usuario e responsavel. */
  async listResponsibleOfficeIdsByIdentity(databaseRef: string, clientId: string): Promise<Map<string, string[]>> {
    const result = await this.database.queryForDatabaseRef<{ identityId: string; officeIds: string[] }>(
      databaseRef,
      `SELECT identity_id AS "identityId", array_agg(office_id ORDER BY office_id) AS "officeIds"
       FROM kanban_user_offices WHERE client_id = $1 AND is_responsible GROUP BY identity_id`,
      [clientId]
    );
    return new Map(result.rows.map((row) => [row.identityId, row.officeIds]));
  }

  /**
   * Substitui os escritorios do usuario numa transacao. Ao SAIR de um
   * escritorio, o usuario deixa de ser responsavel pelos cards (nao excluidos)
   * desse escritorio, com `system_event` `card.assignee_removed` por card
   * (P28). Cards criados por ele continuam no escritorio original.
   */
  async replaceUserOffices(
    databaseRef: string,
    clientId: string,
    identityId: string,
    officeIds: string[],
    actorIdentityId: string,
    responsibleOfficeIds?: string[]
  ): Promise<ReplaceUserOfficesResult> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      // Serializa alteracoes concorrentes do mesmo usuario.
      await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`, [clientId, identityId]);
      const current = await tx.query<{ officeId: string }>(
        `SELECT office_id AS "officeId" FROM kanban_user_offices WHERE client_id = $1 AND identity_id = $2`,
        [clientId, identityId]
      );
      const currentIds = new Set(current.rows.map((row) => row.officeId));
      const target = new Set(officeIds);
      const added = [...target].filter((id) => !currentIds.has(id)).sort();
      const removed = [...currentIds].filter((id) => !target.has(id)).sort();

      if (removed.length > 0) {
        await tx.query(
          `DELETE FROM kanban_user_offices WHERE client_id = $1 AND identity_id = $2 AND office_id = ANY($3::uuid[])`,
          [clientId, identityId, removed]
        );
      }
      for (const officeId of added) {
        await tx.query(
          `INSERT INTO kanban_user_offices (client_id, identity_id, office_id, created_by_identity_id) VALUES ($1, $2, $3, $4)`,
          [clientId, identityId, officeId, actorIdentityId]
        );
      }
      if (responsibleOfficeIds) {
        // Responsavel so onde o usuario e vinculado; ausente do pedido = mantem as marcacoes.
        await tx.query(
          `UPDATE kanban_user_offices SET is_responsible = (office_id = ANY($3::uuid[]))
           WHERE client_id = $1 AND identity_id = $2`,
          [clientId, identityId, responsibleOfficeIds]
        );
      }
      const removedAssignments = removed.length > 0 ? await this.removeAssignmentsInOffices(tx, clientId, identityId, removed, actorIdentityId) : [];
      return { added, removed, removedAssignments };
    });
  }

  private async removeAssignmentsInOffices(
    tx: PoolClient,
    clientId: string,
    identityId: string,
    officeIds: string[],
    actorIdentityId: string
  ): Promise<AffectedAssignment[]> {
    const removed = await tx.query<AffectedAssignment>(
      `DELETE FROM kanban_card_assignees ca
       USING kanban_cards c, kanban_boards b
       WHERE ca.client_id = $1 AND ca.identity_id = $2
         AND c.id = ca.card_id AND c.client_id = ca.client_id
         AND b.id = c.board_id AND b.client_id = c.client_id
         AND c.status <> 'deleted' AND c.office_id = ANY($3::uuid[])
       RETURNING c.board_id AS "boardId", b.name AS "boardName", c.id AS "cardId", c.title AS "cardTitle",
                 c.office_id AS "officeId"`,
      [clientId, identityId, officeIds]
    );
    for (const row of removed.rows) {
      await tx.query(
        `INSERT INTO kanban_card_activities (client_id, card_id, type, author_identity_id, event_payload)
         VALUES ($1, $2, 'system_event', $3, $4::jsonb)`,
        [
          clientId,
          row.cardId,
          actorIdentityId,
          JSON.stringify({ kind: 'card.assignee_removed', identityId, reason: 'office_removed', officeId: row.officeId })
        ]
      );
    }
    return removed.rows;
  }

  /**
   * Atribuicao em lote do escritorio aos cards SEM escritorio de um quadro
   * (todos, ou so os `cardIds` informados), com `system_event`
   * `card.office_assigned` por card. Devolve os ids atualizados.
   */
  async assignCardsWithoutOffice(
    databaseRef: string,
    clientId: string,
    boardId: string,
    officeId: string,
    cardIds: string[] | null,
    actorIdentityId: string
  ): Promise<string[]> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      const updated = await tx.query<{ id: string }>(
        `UPDATE kanban_cards SET office_id = $3, updated_at = now()
         WHERE client_id = $1 AND board_id = $2 AND office_id IS NULL AND status <> 'deleted'
           AND ($4::uuid[] IS NULL OR id = ANY($4::uuid[]))
         RETURNING id`,
        [clientId, boardId, officeId, cardIds]
      );
      for (const row of updated.rows) {
        await tx.query(
          `INSERT INTO kanban_card_activities (client_id, card_id, type, author_identity_id, event_payload)
           VALUES ($1, $2, 'system_event', $3, $4::jsonb)`,
          [clientId, row.id, actorIdentityId, JSON.stringify({ kind: 'card.office_assigned', officeId, bulk: true })]
        );
      }
      return updated.rows.map((row) => row.id).sort();
    });
  }

  /**
   * Transferencia de escritorio de um card (so admin, motivo obrigatorio, P23):
   * trava o card, troca `office_id` e grava `system_event`
   * `card.office_changed` na mesma transacao. `null` se o card nao existe.
   */
  async transferCard(
    databaseRef: string,
    clientId: string,
    boardId: string,
    cardId: string,
    toOfficeId: string,
    reason: string,
    actorIdentityId: string
  ): Promise<{ fromOfficeId: string | null; changed: boolean } | null> {
    return this.database.transactionForDatabaseRef(databaseRef, async (tx) => {
      const current = await tx.query<{ officeId: string | null }>(
        `SELECT office_id AS "officeId" FROM kanban_cards
         WHERE client_id = $1 AND board_id = $2 AND id = $3 AND status <> 'deleted'
         FOR UPDATE`,
        [clientId, boardId, cardId]
      );
      if (!current.rows[0]) {
        return null;
      }
      const fromOfficeId = current.rows[0].officeId;
      if (fromOfficeId === toOfficeId) {
        return { fromOfficeId, changed: false };
      }
      await tx.query(`UPDATE kanban_cards SET office_id = $3, updated_at = now() WHERE client_id = $1 AND id = $2`, [
        clientId,
        cardId,
        toOfficeId
      ]);
      await tx.query(
        `INSERT INTO kanban_card_activities (client_id, card_id, type, author_identity_id, event_payload)
         VALUES ($1, $2, 'system_event', $3, $4::jsonb)`,
        [clientId, cardId, actorIdentityId, JSON.stringify({ kind: 'card.office_changed', fromOfficeId, toOfficeId, reason })]
      );
      return { fromOfficeId, changed: true };
    });
  }

  /** Pre-visualizacao da ativacao: cards (nao excluidos) sem escritorio, por quadro. */
  async countCardsWithoutOfficeByBoard(databaseRef: string, clientId: string): Promise<CardWithoutOfficeByBoard[]> {
    const result = await this.database.queryForDatabaseRef<{ boardId: string; boardName: string; count: string }>(
      databaseRef,
      `SELECT b.id AS "boardId", b.name AS "boardName", count(c.id)::text AS count
       FROM kanban_boards b
       JOIN kanban_cards c ON c.board_id = b.id AND c.client_id = b.client_id
       WHERE b.client_id = $1 AND c.office_id IS NULL AND c.status <> 'deleted'
       GROUP BY b.id, b.name
       ORDER BY lower(b.name), b.id
       LIMIT 500`,
      [clientId]
    );
    return result.rows.map((row) => ({ boardId: row.boardId, boardName: row.boardName, count: Number(row.count) }));
  }
}
