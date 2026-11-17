import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../../database/database.service';
import { ComandaSalaoRawRow } from './comanda-salao.types';

/**
 * Uma unica query para o mapa do salao. E a tela mais aberta da operacao de
 * balcao, com polling de 15s — compor a visao no cliente a partir de tres
 * endpoints (mesas, comandas, itens) multiplicaria a carga sem ganho.
 *
 * `LEFT JOIN` a partir de `comanda_tables` e o que faz mesa livre existir na
 * resposta: mesa sem comanda aberta volta com `comandaId = null`.
 */
@Injectable()
export class ComandaSalaoRepository {
  constructor(private readonly database: DatabaseService) {}

  async findSalao(clientId: string): Promise<ComandaSalaoRawRow[]> {
    const result = await this.database.query<ComandaSalaoRawRow>(
      `SELECT t.id AS "mesaId", t.table_number AS "tableNumber", t.label,
              t.status AS "mesaStatus",
              c.id AS "comandaId",
              ec.name AS "customerName", ec.phone AS "customerPhone",
              ec.document_number AS "customerDocumentNumber",
              c.opened_at AS "openedAt", c.last_activity_at AS "lastActivityAt",
              c.closing_requested_at AS "closingRequestedAt",
              COALESCE(i.total, 0)::text AS total,
              COALESCE(pay.pago, 0)::text AS pago,
              COALESCE(i.pendentes, 0)::int AS "itensPendentes",
              COALESCE(i.em_producao, 0)::int AS "itensEmProducao",
              COALESCE(i.prontos, 0)::int AS "itensProntos"
       FROM comanda_tables t
       LEFT JOIN comandas c
         ON c.client_id = t.client_id AND c.table_number = t.table_number AND c.status = 'aberta'
       LEFT JOIN pdv_establishment_customers ec ON ec.id = c.customer_id
       LEFT JOIN LATERAL (
         SELECT SUM(ci.unit_price_snapshot * ci.quantity) FILTER (WHERE ci.status <> 'cancelado') AS total,
                COUNT(*) FILTER (WHERE ci.status = 'pendente') AS pendentes,
                COUNT(*) FILTER (WHERE ci.status = 'em_producao') AS em_producao,
                COUNT(*) FILTER (WHERE ci.status = 'pronto') AS prontos
         FROM comanda_itens ci
         WHERE ci.comanda_id = c.id
       ) i ON TRUE
       -- Sprint 9: soma dos recebimentos ja registrados como vendas filhas
       -- da venda-pai da comanda. Valor pago maior que zero com saldo em
       -- aberto e o que produz o estado pagamento_parcial da mesa.
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(sp.amount), 0) AS pago
         FROM pdv_sales cs
         JOIN pdv_sale_payments sp ON sp.sale_id = cs.id
         WHERE cs.client_id = c.client_id
           AND cs.parent_sale_id = c.parent_sale_id
           AND cs.status = 'completed'
       ) pay ON c.parent_sale_id IS NOT NULL
       WHERE t.client_id = $1
       ORDER BY t.table_number ASC, c.opened_at ASC NULLS LAST`,
      [clientId]
    );
    return result.rows;
  }
}
