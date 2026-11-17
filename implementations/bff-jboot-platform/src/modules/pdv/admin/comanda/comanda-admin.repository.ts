import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../database/database.service';
import { ComandaAdminItemRow, ComandaAdminQueueType, ComandaAdminRawRow, ComandaSummaryRow } from './comanda-admin.types';

const ITEM_COLS = `
  ci.id, ci.comanda_id AS "comandaId", ci.comanda_pedido_id AS "comandaPedidoId",
  c.table_number AS "tableNumber", ci.product_id AS "productId",
  ci.product_name_snapshot AS "productName", ci.unit_price_snapshot::text AS "unitPrice",
  ci.quantity::text AS quantity, ci.queue_type AS "queueType", ci.notes, ci.status,
  ci.created_at AS "createdAt",
  ci.encaminhado_por AS "encaminhadoPor", ci.encaminhado_at AS "encaminhadoAt",
  ci.finalizado_por AS "finalizadoPor", ci.finalizado_at AS "finalizadoAt",
  ci.liberado_por AS "liberadoPor", ci.liberado_at AS "liberadoAt",
  ci.cancelado_por AS "canceladoPor", ci.cancelado_at AS "canceladoAt",
  ci.cancel_reason AS "cancelReason", ci.cancel_is_exception AS "cancelIsException"
`;

/**
 * Repository proprio do `pdv/admin` para as tabelas `comanda_itens`/`comandas`
 * (Sprint 2, `jboot_pdv`). Acesso paralelo e independente do repository do
 * modulo `comanda` publico — nunca importar `src/modules/comanda/repositories/*`
 * aqui (ver MODULE_CONTRACT.md do `pdv`, mesmo padrao usado entre `catalog`/`pdv`).
 */
@Injectable()
export class ComandaAdminRepository {
  constructor(private readonly database: DatabaseService) {}

  async findPendentes(clientId: string): Promise<ComandaAdminItemRow[]> {
    const result = await this.database.query<ComandaAdminItemRow>(
      `SELECT ${ITEM_COLS}
       FROM comanda_itens ci
       JOIN comandas c ON c.id = ci.comanda_id
       WHERE ci.client_id = $1 AND ci.status = 'pendente'
       ORDER BY ci.created_at ASC`,
      [clientId]
    );
    return result.rows;
  }

  async findFila(clientId: string, queueType: ComandaAdminQueueType): Promise<ComandaAdminItemRow[]> {
    const result = await this.database.query<ComandaAdminItemRow>(
      `SELECT ${ITEM_COLS}
       FROM comanda_itens ci
       JOIN comandas c ON c.id = ci.comanda_id
       WHERE ci.client_id = $1 AND ci.status = 'em_producao' AND ci.queue_type = $2
       ORDER BY ci.encaminhado_at ASC`,
      [clientId, queueType]
    );
    return result.rows;
  }

  async findProntos(clientId: string): Promise<ComandaAdminItemRow[]> {
    const result = await this.database.query<ComandaAdminItemRow>(
      `SELECT ${ITEM_COLS}
       FROM comanda_itens ci
       JOIN comandas c ON c.id = ci.comanda_id
       WHERE ci.client_id = $1 AND ci.status = 'pronto'
       ORDER BY ci.finalizado_at ASC`,
      [clientId]
    );
    return result.rows;
  }

  async findItemById(clientId: string, itemId: string): Promise<ComandaAdminItemRow | null> {
    const result = await this.database.query<ComandaAdminItemRow>(
      `SELECT ${ITEM_COLS}
       FROM comanda_itens ci
       JOIN comandas c ON c.id = ci.comanda_id
       WHERE ci.client_id = $1 AND ci.id = $2
       LIMIT 1`,
      [clientId, itemId]
    );
    return result.rows[0] ?? null;
  }

  async markEmProducao(clientId: string, itemId: string, identityId: string): Promise<void> {
    await this.database.query(
      `UPDATE comanda_itens
       SET status = 'em_producao', encaminhado_por = $3, encaminhado_at = now(), updated_at = now()
       WHERE id = $2 AND client_id = $1`,
      [clientId, itemId, identityId]
    );
  }

  async markPronto(clientId: string, itemId: string, identityId: string): Promise<void> {
    await this.database.query(
      `UPDATE comanda_itens
       SET status = 'pronto', finalizado_por = $3, finalizado_at = now(), updated_at = now()
       WHERE id = $2 AND client_id = $1`,
      [clientId, itemId, identityId]
    );
  }

  async markLiberado(clientId: string, itemId: string, identityId: string): Promise<void> {
    await this.database.query(
      `UPDATE comanda_itens
       SET status = 'liberado_para_entrega', liberado_por = $3, liberado_at = now(), updated_at = now()
       WHERE id = $2 AND client_id = $1`,
      [clientId, itemId, identityId]
    );
  }

  async markCancelado(
    clientId: string,
    itemId: string,
    identityId: string,
    reason: string | null,
    isException: boolean
  ): Promise<void> {
    await this.database.query(
      `UPDATE comanda_itens
       SET status = 'cancelado', cancelado_por = $3, cancelado_at = now(),
           cancel_reason = $4, cancel_is_exception = $5, updated_at = now()
       WHERE id = $2 AND client_id = $1`,
      [clientId, itemId, identityId, reason, isException]
    );
  }

  /**
   * Comandas `aberta` para a visao do Operador de Balcao — inclui as com
   * fechamento solicitado pelo cliente e as "esquecidas" (sem solicitacao,
   * inatividade longa), classificacao final feita no service (threshold de
   * 45min nao pertence a query).
   */
  async findComandasAbertas(clientId: string): Promise<ComandaSummaryRow[]> {
    const result = await this.database.query<ComandaSummaryRow>(
      `SELECT c.id, c.table_number AS "tableNumber",
              ec.name AS "customerName", ec.phone AS "customerPhone",
              ec.document_number AS "customerDocumentNumber",
              c.status, c.opened_at AS "openedAt", c.last_activity_at AS "lastActivityAt",
              c.closing_requested_at AS "closingRequestedAt",
              COALESCE(SUM(ci.unit_price_snapshot * ci.quantity)
                FILTER (WHERE ci.status != 'cancelado'), 0)::text AS total
       FROM comandas c
       JOIN pdv_establishment_customers ec ON ec.id = c.customer_id
       LEFT JOIN comanda_itens ci ON ci.comanda_id = c.id
       WHERE c.client_id = $1 AND c.status = 'aberta'
       GROUP BY c.id, ec.name, ec.phone, ec.document_number
       ORDER BY c.last_activity_at ASC`,
      [clientId]
    );
    return result.rows;
  }

  async findComandaSummary(clientId: string, comandaId: string): Promise<ComandaSummaryRow | null> {
    const result = await this.database.query<ComandaSummaryRow>(
      `SELECT c.id, c.table_number AS "tableNumber",
              ec.name AS "customerName", ec.phone AS "customerPhone",
              ec.document_number AS "customerDocumentNumber",
              c.status, c.opened_at AS "openedAt", c.last_activity_at AS "lastActivityAt",
              c.closing_requested_at AS "closingRequestedAt",
              COALESCE(SUM(ci.unit_price_snapshot * ci.quantity)
                FILTER (WHERE ci.status != 'cancelado'), 0)::text AS total
       FROM comandas c
       JOIN pdv_establishment_customers ec ON ec.id = c.customer_id
       LEFT JOIN comanda_itens ci ON ci.comanda_id = c.id
       WHERE c.client_id = $1 AND c.id = $2
       GROUP BY c.id, ec.name, ec.phone, ec.document_number
       LIMIT 1`,
      [clientId, comandaId]
    );
    return result.rows[0] ?? null;
  }

  async findRawById(clientId: string, comandaId: string): Promise<ComandaAdminRawRow | null> {
    const result = await this.database.query<ComandaAdminRawRow>(
      `SELECT id, client_id AS "clientId", status, parent_sale_id AS "parentSaleId"
       FROM comandas WHERE client_id = $1 AND id = $2`,
      [clientId, comandaId]
    );
    return result.rows[0] ?? null;
  }

  /** Sprint 9: amarra a comanda a venda-pai criada no primeiro recebimento. */
  async setParentSale(clientId: string, comandaId: string, saleId: string): Promise<void> {
    await this.database.query(
      `UPDATE comandas SET parent_sale_id = $3, updated_at = now()
       WHERE id = $2 AND client_id = $1`,
      [clientId, comandaId, saleId]
    );
  }

  async findAllItensByComanda(clientId: string, comandaId: string): Promise<ComandaAdminItemRow[]> {
    const result = await this.database.query<ComandaAdminItemRow>(
      `SELECT ${ITEM_COLS}
       FROM comanda_itens ci
       JOIN comandas c ON c.id = ci.comanda_id
       WHERE ci.client_id = $1 AND ci.comanda_id = $2
       ORDER BY ci.created_at ASC`,
      [clientId, comandaId]
    );
    return result.rows;
  }

  /**
   * `pdv_sales` nao guarda referencia de volta pra `comandas` — so
   * `comandas.closed_sale_id` aponta pra frente (venda). Sprint 6
   * (CPF-na-nota) busca pelo caminho inverso; nao adicionamos coluna nova
   * porque essa e a unica consumidora hoje e o volume de comandas fechadas
   * torna o full scan indexado (`closed_sale_id`) suficiente.
   */
  async findComandaCustomerLinkByClosedSaleId(
    clientId: string,
    saleId: string
  ): Promise<{ comandaId: string; customerId: string } | null> {
    const result = await this.database.query<{ comandaId: string; customerId: string }>(
      `SELECT id AS "comandaId", customer_id AS "customerId"
       FROM comandas
       WHERE client_id = $1 AND closed_sale_id = $2
       LIMIT 1`,
      [clientId, saleId]
    );
    return result.rows[0] ?? null;
  }

  async markFechada(clientId: string, comandaId: string, identityId: string, saleId: string): Promise<void> {
    await this.database.query(
      `UPDATE comandas
       SET status = 'fechada', closed_at = now(), paid_confirmed_by = $3,
           paid_confirmed_at = now(), closed_sale_id = $4, updated_at = now()
       WHERE id = $2 AND client_id = $1`,
      [clientId, comandaId, identityId, saleId]
    );
  }
}
