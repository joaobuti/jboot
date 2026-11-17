import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { KanbanRequestContext } from '../kanban.types';
import { KanbanViewer, visibleCardScope } from '../shared/card-visibility';
import { EntryRequirement } from './dto/automation-rule.dto';

export const COLUMN_REQUIREMENTS_UNMET = 'column_requirements_unmet';

/** Cliente vinculado ao card, com validacao confirmada e sem HISCON atual. */
const CUSTOMER_WITHOUT_HISCON_SQL = `
  EXISTS (SELECT 1 FROM kanban_customer_validation_runs r
          WHERE r.client_id = l.client_id AND r.customer_id = l.customer_id AND r.confirmed_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM kanban_customer_documents cd
                  WHERE cd.client_id = l.client_id AND cd.customer_id = l.customer_id
                    AND cd.document_type = 'extrato_beneficio' AND cd.superseded_at IS NULL AND cd.removed_at IS NULL)`;

/**
 * Cliente vinculado ao card sem kit assinado aprovado: o kit mais recente nao tem a versao atual do assinado
 * com parecer aprovado e confirmado (S2). Cliente sem kit tambem nao cumpre.
 */
const CUSTOMER_WITHOUT_SIGNED_KIT_SQL = `
  NOT EXISTS (
    SELECT 1 FROM kanban_signed_kit_validations v
    JOIN kanban_customer_signed_kits s ON s.client_id = v.client_id AND s.id = v.signed_kit_id AND s.superseded_at IS NULL
    WHERE v.client_id = l.client_id AND v.verdict = 'aprovado' AND v.confirmed_at IS NOT NULL
      AND v.kit_id = (SELECT k.id FROM kanban_customer_office_kits k
                      WHERE k.client_id = l.client_id AND k.customer_id = l.customer_id
                      ORDER BY k.created_at DESC, k.id DESC LIMIT 1))`;

/** Alguma coluna ativa do quadro do card exige o requisito para entrar. */
const boardRequires = (requirement: EntryRequirement) => `
  EXISTS (SELECT 1 FROM kanban_column_automation_rules q
          WHERE q.client_id = c.client_id AND q.board_id = c.board_id AND q.is_active
            AND q.action_type = 'require_to_enter' AND q.action_config->'requirements' ? '${requirement}')`;

/** Alguma coluna ativa do quadro do card exige o HISCON do cliente para entrar. */
const BOARD_REQUIRES_HISCON_SQL = boardRequires('customer_hiscon');

/**
 * Requisitos de entrada da coluna (docs/product/flow-signed-kit-sprints.md, S1): regra configuravel
 * `require_to_enter` da coluna de destino, nunca deduzida de outras regras. Como o gate do checklist, vale so
 * na entrada e para qualquer papel; movimento por regra de automacao passa pelo mesmo `CardsService.move`.
 * Requisitos do cliente (`customer_hiscon`, `signed_kit`): card sem cliente nao e barrado (nada a exigir de um
 * cliente que nao existe).
 */
@Injectable()
export class EntryRequirementsService {
  constructor(private readonly database: DatabaseService) {}

  async assertCanEnterColumn(context: KanbanRequestContext, boardId: string, boardColumnId: string, cardId: string): Promise<void> {
    const result = await this.database.queryForDatabaseRef<{ requirement: EntryRequirement; unmet: boolean }>(
      context.databaseRef,
      `WITH required AS (
         SELECT DISTINCT jsonb_array_elements_text(r.action_config->'requirements') AS requirement
         FROM kanban_column_automation_rules r
         WHERE r.client_id = $1 AND r.board_id = $2 AND r.board_column_id = $3 AND r.is_active
           AND r.action_type = 'require_to_enter'
       )
       SELECT q.requirement,
              CASE q.requirement
                WHEN 'customer_hiscon' THEN EXISTS (
                  SELECT 1 FROM kanban_card_customers l
                  WHERE l.client_id = $1 AND l.card_id = $4 AND NOT EXISTS (
                    SELECT 1 FROM kanban_customer_documents cd
                    WHERE cd.client_id = l.client_id AND cd.customer_id = l.customer_id
                      AND cd.document_type = 'extrato_beneficio' AND cd.superseded_at IS NULL AND cd.removed_at IS NULL))
                WHEN 'signed_kit' THEN EXISTS (
                  SELECT 1 FROM kanban_card_customers l
                  WHERE l.client_id = $1 AND l.card_id = $4 AND ${CUSTOMER_WITHOUT_SIGNED_KIT_SQL})
                ELSE false
              END AS unmet
       FROM required q`,
      [context.clientId, boardId, boardColumnId, cardId]
    );
    const unmet = result.rows.filter((row) => row.unmet).map((row) => row.requirement);
    if (unmet.length > 0) {
      throw new UnprocessableEntityException({
        code: COLUMN_REQUIREMENTS_UNMET,
        message: 'Card cannot enter this column until its entry requirements are met',
        boardColumnId,
        unmetRequirements: unmet
      });
    }
  }

  /** Selo do card aberto: mesma regra de `cardIdsWithoutHisconForBoard`, para um card ja visivel. */
  async cardWithoutHiscon(databaseRef: string, clientId: string, cardId: string): Promise<{ customerId: string; missing: boolean } | null> {
    const result = await this.database.queryForDatabaseRef<{ customerId: string; missing: boolean }>(
      databaseRef,
      `SELECT l.customer_id AS "customerId", (${BOARD_REQUIRES_HISCON_SQL} AND ${CUSTOMER_WITHOUT_HISCON_SQL}) AS missing
       FROM kanban_card_customers l
       JOIN kanban_cards c ON c.id = l.card_id AND c.client_id = l.client_id
       WHERE l.client_id = $1 AND l.card_id = $2`,
      [clientId, cardId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Selo "SEM HISCON": cards visiveis do quadro cujo cliente tem validacao confirmada e nenhum HISCON atual,
   * so quando alguma coluna do quadro exige o HISCON para entrar. Uma consulta por quadro, sem N+1.
   */
  async cardIdsWithoutHisconForBoard(databaseRef: string, clientId: string, boardId: string, viewer: KanbanViewer): Promise<Set<string>> {
    const scope = visibleCardScope(viewer, 'c', 3);
    const result = await this.database.queryForDatabaseRef<{ cardId: string }>(
      databaseRef,
      `SELECT l.card_id AS "cardId"
       FROM kanban_card_customers l
       JOIN kanban_cards c ON c.id = l.card_id AND c.client_id = l.client_id
       WHERE l.client_id = $1 AND c.board_id = $2 AND c.status <> 'deleted' AND ${scope.sql}
         AND ${BOARD_REQUIRES_HISCON_SQL} AND ${CUSTOMER_WITHOUT_HISCON_SQL}`,
      [clientId, boardId, ...scope.params]
    );
    return new Set(result.rows.map((row) => row.cardId));
  }

  /**
   * Selo "ASSINATURA PENDENTE" (S2): cards visiveis do quadro cujo cliente ja tem kit e ainda nao tem o
   * assinado aprovado, so quando alguma coluna do quadro exige o kit assinado para entrar.
   */
  async cardIdsWithSignedKitPendingForBoard(databaseRef: string, clientId: string, boardId: string, viewer: KanbanViewer): Promise<Set<string>> {
    const scope = visibleCardScope(viewer, 'c', 3);
    const result = await this.database.queryForDatabaseRef<{ cardId: string }>(
      databaseRef,
      `SELECT l.card_id AS "cardId"
       FROM kanban_card_customers l
       JOIN kanban_cards c ON c.id = l.card_id AND c.client_id = l.client_id
       WHERE l.client_id = $1 AND c.board_id = $2 AND c.status <> 'deleted' AND ${scope.sql}
         AND ${boardRequires('signed_kit')}
         AND EXISTS (SELECT 1 FROM kanban_customer_office_kits k WHERE k.client_id = l.client_id AND k.customer_id = l.customer_id)
         AND ${CUSTOMER_WITHOUT_SIGNED_KIT_SQL}`,
      [clientId, boardId, ...scope.params]
    );
    return new Set(result.rows.map((row) => row.cardId));
  }
}
