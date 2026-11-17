import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';

export interface ComandaItemInput {
  productId: string;
  productNameSnapshot: string;
  unitPriceSnapshot: string;
  quantity: number;
  queueType: 'cozinha' | 'bar';
  notes: string | null;
}

export interface ComandaItemRow {
  id: string;
  comandaId: string;
  comandaPedidoId: string;
  productId: string;
  productNameSnapshot: string;
  unitPriceSnapshot: string;
  quantity: string;
  queueType: 'cozinha' | 'bar';
  notes: string | null;
  status: 'pendente' | 'em_producao' | 'pronto' | 'liberado_para_entrega' | 'cancelado';
  createdAt: string;
}

export interface ComandaPedidoRow {
  id: string;
  comandaId: string;
  submittedAt: string;
}

const ITEM_SELECT_COLS = `
  id, comanda_id AS "comandaId", comanda_pedido_id AS "comandaPedidoId",
  product_id AS "productId", product_name_snapshot AS "productNameSnapshot",
  unit_price_snapshot AS "unitPriceSnapshot", quantity, queue_type AS "queueType",
  notes, status, created_at AS "createdAt"
`;

@Injectable()
export class ComandaPedidosRepository {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Cria `comanda_pedidos` + `comanda_itens` numa unica transacao. Chamador
   * garante que `items` ja veio filtrado/resolvido no servidor (preco,
   * nome, queue_type) — este repository apenas persiste.
   */
  async createPedidoWithItems(
    clientId: string,
    comandaId: string,
    items: ComandaItemInput[]
  ): Promise<{ pedido: ComandaPedidoRow; itens: ComandaItemRow[] }> {
    return this.database.transaction(async (client: PoolClient) => {
      const pedidoResult = await client.query<ComandaPedidoRow>(
        `INSERT INTO comanda_pedidos (client_id, comanda_id)
         VALUES ($1::uuid, $2::uuid)
         RETURNING id, comanda_id AS "comandaId", submitted_at AS "submittedAt"`,
        [clientId, comandaId]
      );
      const pedido = pedidoResult.rows[0];

      const itens: ComandaItemRow[] = [];
      for (const item of items) {
        const itemResult = await client.query<ComandaItemRow>(
          `INSERT INTO comanda_itens (
             client_id, comanda_id, comanda_pedido_id, product_id,
             product_name_snapshot, unit_price_snapshot, quantity, queue_type, notes
           ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9)
           RETURNING ${ITEM_SELECT_COLS}`,
          [
            clientId,
            comandaId,
            pedido.id,
            item.productId,
            item.productNameSnapshot,
            item.unitPriceSnapshot,
            item.quantity,
            item.queueType,
            item.notes
          ]
        );
        itens.push(itemResult.rows[0]);
      }

      return { pedido, itens };
    });
  }

  async findPedidosByComanda(comandaId: string): Promise<ComandaPedidoRow[]> {
    const result = await this.database.query<ComandaPedidoRow>(
      `SELECT id, comanda_id AS "comandaId", submitted_at AS "submittedAt"
       FROM comanda_pedidos
       WHERE comanda_id = $1::uuid
       ORDER BY submitted_at`,
      [comandaId]
    );
    return result.rows;
  }

  async findItensByComanda(comandaId: string): Promise<ComandaItemRow[]> {
    const result = await this.database.query<ComandaItemRow>(
      `SELECT ${ITEM_SELECT_COLS}
       FROM comanda_itens
       WHERE comanda_id = $1::uuid
       ORDER BY created_at`,
      [comandaId]
    );
    return result.rows;
  }

  async findItemById(comandaId: string, itemId: string): Promise<ComandaItemRow | null> {
    const result = await this.database.query<ComandaItemRow>(
      `SELECT ${ITEM_SELECT_COLS}
       FROM comanda_itens
       WHERE comanda_id = $1::uuid AND id = $2::uuid
       LIMIT 1`,
      [comandaId, itemId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Cancelamento pelo proprio cliente: `cancelado_por` fica NULL (coluna e
   * `uuid`, sem identidade de staff disponivel nesse fluxo — ver
   * MODULE_CONTRACT.md e nota de decisao no relatorio da sprint).
   */
  async cancelItemByClient(itemId: string): Promise<ComandaItemRow> {
    const result = await this.database.query<ComandaItemRow>(
      `UPDATE comanda_itens
       SET status = 'cancelado', cancelado_por = NULL, cancelado_at = now(), updated_at = now()
       WHERE id = $1::uuid
       RETURNING ${ITEM_SELECT_COLS}`,
      [itemId]
    );
    return result.rows[0];
  }

  /**
   * Tenta reivindicar uma `Idempotency-Key` para esta comanda. Retorna o id
   * da linha de claim quando esta requisicao e a primeira a usar a chave
   * (deve prosseguir criando o pedido); retorna `null` em caso de conflito
   * (chave ja usada — chamador deve consultar `findByIdempotencyKey`).
   */
  async claimIdempotencyKey(comandaId: string, key: string): Promise<string | null> {
    const result = await this.database.query<{ id: string }>(
      `INSERT INTO comanda_pedido_idempotency_keys (comanda_id, idempotency_key)
       VALUES ($1::uuid, $2)
       ON CONFLICT (comanda_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [comandaId, key]
    );
    return result.rows[0]?.id ?? null;
  }

  async attachPedidoToIdempotencyClaim(claimId: string, pedidoId: string): Promise<void> {
    await this.database.query(
      `UPDATE comanda_pedido_idempotency_keys SET comanda_pedido_id = $2::uuid WHERE id = $1::uuid`,
      [claimId, pedidoId]
    );
  }

  async findPedidoIdByIdempotencyKey(comandaId: string, key: string): Promise<string | null> {
    const result = await this.database.query<{ comandaPedidoId: string | null }>(
      `SELECT comanda_pedido_id AS "comandaPedidoId"
       FROM comanda_pedido_idempotency_keys
       WHERE comanda_id = $1::uuid AND idempotency_key = $2
       LIMIT 1`,
      [comandaId, key]
    );
    return result.rows[0]?.comandaPedidoId ?? null;
  }
}
