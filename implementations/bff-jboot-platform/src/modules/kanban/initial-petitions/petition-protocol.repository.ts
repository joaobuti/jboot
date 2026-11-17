import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { KanbanViewer, visibleCardScope } from '../shared/card-visibility';

/** Peticao da execucao mais recente do card, no recorte que o protocolo e o monitoramento usam. */
export interface ProtocolPetitionRow {
  id: string;
  cardId: string;
  customerId: string;
  court: 'jec' | 'jef';
  bank: string;
  fileName: string;
  protocolNumber: string | null;
  monitoringBoardId: string | null;
  monitoringCardId: string | null;
  /** Status da versao atual do documento (`rascunho`, `aprovado`, ...); `null` sem documento. */
  documentStatus: string | null;
}

/**
 * Card que ja usa o numero CNJ no tenant: peticao registrada, card exportado do DataJud ou card
 * importado por planilha (este ultimo reportado como `datajud_card`: card de processo sem peticao).
 */
export interface ProcessNumberOwner {
  kind: 'petition' | 'datajud_card';
  cardId: string;
  boardId: string;
}

export type RegisterProtocolResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'not_approved' | 'already_registered' }
  | { ok: false; reason: 'number_in_use'; owner: ProcessNumberOwner };

const LATEST_RUN = `(SELECT r.id FROM kanban_card_petition_runs r
                    WHERE r.client_id = $1 AND r.card_id = $2 ORDER BY r.created_at DESC LIMIT 1)`;

const PETITION_SELECT = `
  SELECT p.id, p.card_id AS "cardId", r.customer_id AS "customerId", p.court, p.bank, p.file_name AS "fileName",
         p.protocol_number AS "protocolNumber", p.monitoring_board_id AS "monitoringBoardId",
         p.monitoring_card_id AS "monitoringCardId",
         (SELECT d.status FROM kanban_card_generated_documents d
          WHERE d.client_id = p.client_id AND d.petition_id = p.id ORDER BY d.version DESC LIMIT 1) AS "documentStatus"
  FROM kanban_card_initial_petitions p
  JOIN kanban_card_petition_runs r ON r.client_id = p.client_id AND r.id = p.petition_run_id`;

/**
 * Numero do processo (CNJ) da peticao e envio ao board de monitoramento
 * (docs/product/flow-card-actions-sprints.md, Sprint 2; migration 118).
 * So a execucao de peticoes mais recente do card conta: e a unica que a tela mostra.
 */
@Injectable()
export class PetitionProtocolRepository {
  constructor(private readonly database: DatabaseService) {}

  async findForCard(databaseRef: string, clientId: string, cardId: string): Promise<ProtocolPetitionRow[]> {
    const result = await this.database.queryForDatabaseRef<ProtocolPetitionRow>(
      databaseRef,
      `${PETITION_SELECT}
       WHERE p.client_id = $1 AND p.card_id = $2 AND p.petition_run_id = ${LATEST_RUN}
       ORDER BY p.position`,
      [clientId, cardId]
    );
    return result.rows;
  }

  /** Aprovada, com CNJ e ainda nao enviada: o que a acao Monitorar oferece. */
  async findMonitorable(databaseRef: string, clientId: string, cardId: string): Promise<ProtocolPetitionRow[]> {
    return (await this.findForCard(databaseRef, clientId, cardId)).filter(isMonitorable);
  }

  /** Cards do board com ao menos uma peticao monitoravel: a acao Monitorar so aparece neles. */
  async monitorableCardIds(databaseRef: string, clientId: string, boardId: string, viewer: KanbanViewer): Promise<string[]> {
    const scope = visibleCardScope(viewer, 'c', 3);
    const result = await this.database.queryForDatabaseRef<{ cardId: string }>(
      databaseRef,
      `SELECT DISTINCT c.id AS "cardId"
       FROM kanban_cards c
       JOIN kanban_card_petition_runs r ON r.client_id = c.client_id AND r.card_id = c.id
       JOIN kanban_card_initial_petitions p ON p.client_id = r.client_id AND p.petition_run_id = r.id
       WHERE c.client_id = $1 AND c.board_id = $2 AND c.status = 'active' AND ${scope.sql}
         AND r.id = (SELECT r2.id FROM kanban_card_petition_runs r2
                     WHERE r2.client_id = c.client_id AND r2.card_id = c.id ORDER BY r2.created_at DESC LIMIT 1)
         AND p.protocol_number IS NOT NULL AND p.monitoring_card_id IS NULL
         AND (SELECT d.status FROM kanban_card_generated_documents d
              WHERE d.client_id = p.client_id AND d.petition_id = p.id ORDER BY d.version DESC LIMIT 1) = 'aprovado'`,
      [clientId, boardId, ...scope.params]
    );
    return result.rows.map((row) => row.cardId);
  }

  async isCardAssignee(databaseRef: string, clientId: string, cardId: string, identityId: string): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef(
      databaseRef,
      `SELECT 1 FROM kanban_card_assignees WHERE client_id = $1 AND card_id = $2 AND identity_id = $3`,
      [clientId, cardId, identityId]
    );
    return result.rows.length > 0;
  }

  /**
   * Grava o CNJ (so digitos) na peticao aprovada e sem protocolo. Unicidade por tenant: outra peticao
   * (indice unico da migration 118) ou card exportado do DataJud com o mesmo numero barram o registro.
   */
  async register(
    databaseRef: string,
    clientId: string,
    cardId: string,
    petitionId: string,
    processNumber: string,
    identityId: string
  ): Promise<RegisterProtocolResult> {
    return this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      // Serializa registros do mesmo numero no tenant (outra peticao ou card DataJud em paralelo).
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`kanban-cnj:${clientId}:${processNumber}`]);
      const found = await client.query<ProtocolPetitionRow>(
        `${PETITION_SELECT}
         WHERE p.client_id = $1 AND p.card_id = $2 AND p.id = $3 AND p.petition_run_id = ${LATEST_RUN}
         FOR UPDATE OF p`,
        [clientId, cardId, petitionId]
      );
      const petition = found.rows[0];
      if (!petition) return { ok: false, reason: 'not_found' };
      if (petition.protocolNumber) return { ok: false, reason: 'already_registered' };
      if (petition.documentStatus !== 'aprovado') return { ok: false, reason: 'not_approved' };
      const owner = await client.query<ProcessNumberOwner>(
        `SELECT 'petition' AS kind, p.card_id AS "cardId", c.board_id AS "boardId"
         FROM kanban_card_initial_petitions p JOIN kanban_cards c ON c.client_id = p.client_id AND c.id = p.card_id
         WHERE p.client_id = $1 AND p.protocol_number = $2
         UNION ALL
         SELECT 'datajud_card', c.id, c.board_id FROM kanban_cards c
         WHERE c.client_id = $1 AND c.source_type = 'datajud_processo' AND split_part(c.source_id, ':', 1) = $2
           AND c.status <> 'deleted'
         UNION ALL
         SELECT 'datajud_card', c.id, c.board_id FROM kanban_cards c
         WHERE c.client_id = $1 AND c.source_module = 'kanban' AND c.source_type = 'flow_process_import'
           AND c.source_id = $2 AND c.status <> 'deleted'
         LIMIT 1`,
        [clientId, processNumber]
      );
      if (owner.rows[0]) return { ok: false, reason: 'number_in_use', owner: owner.rows[0] };
      await client.query(
        `UPDATE kanban_card_initial_petitions
         SET protocol_number = $3, protocoled_at = clock_timestamp(), protocol_registered_by_identity_id = $4
         WHERE client_id = $1 AND id = $2`,
        [clientId, petitionId, processNumber, identityId]
      );
      return { ok: true };
    });
  }

  /**
   * Marca a peticao como enviada ao card de monitoramento. Idempotente: so a primeira chamada grava;
   * as seguintes devolvem o card ja registrado.
   */
  async markSent(
    databaseRef: string,
    clientId: string,
    petitionId: string,
    target: { boardId: string; cardId: string },
    identityId: string
  ): Promise<{ boardId: string; cardId: string; first: boolean }> {
    const updated = await this.database.queryForDatabaseRef<{ boardId: string; cardId: string }>(
      databaseRef,
      `UPDATE kanban_card_initial_petitions
       SET monitoring_board_id = $3, monitoring_card_id = $4, monitoring_sent_at = clock_timestamp(),
           monitoring_sent_by_identity_id = $5
       WHERE client_id = $1 AND id = $2 AND monitoring_card_id IS NULL AND protocol_number IS NOT NULL
       RETURNING monitoring_board_id AS "boardId", monitoring_card_id AS "cardId"`,
      [clientId, petitionId, target.boardId, target.cardId, identityId]
    );
    if (updated.rows[0]) return { ...updated.rows[0], first: true };
    const current = await this.database.queryForDatabaseRef<{ boardId: string; cardId: string }>(
      databaseRef,
      `SELECT monitoring_board_id AS "boardId", monitoring_card_id AS "cardId"
       FROM kanban_card_initial_petitions WHERE client_id = $1 AND id = $2 AND monitoring_card_id IS NOT NULL`,
      [clientId, petitionId]
    );
    if (!current.rows[0]) throw new Error('petition_not_monitorable');
    return { ...current.rows[0], first: false };
  }

  /**
   * Corrida rara: dois envios da mesma peticao para boards diferentes criam dois cards e so um fica na
   * peticao. O perdedor exclui (logicamente) o card que acabou de criar, restrito a origem desta peticao.
   */
  async discardLosingCard(databaseRef: string, clientId: string, boardId: string, cardId: string, petitionId: string): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_cards SET status = 'deleted', updated_at = now()
       WHERE client_id = $1 AND board_id = $2 AND id = $3
         AND source_module = 'kanban' AND source_type = 'flow_petition' AND source_id = $4`,
      [clientId, boardId, cardId, petitionId]
    );
  }
}

export function isMonitorable(petition: ProtocolPetitionRow): boolean {
  return petition.documentStatus === 'aprovado' && Boolean(petition.protocolNumber) && !petition.monitoringCardId;
}
