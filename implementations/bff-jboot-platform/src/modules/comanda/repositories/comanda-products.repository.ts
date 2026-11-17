import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export interface ComandaProductSnapshotRow {
  id: string;
  name: string;
  price: string;
  queueType: 'cozinha' | 'bar' | null;
}

@Injectable()
export class ComandaProductsRepository {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Leitura direta de `catalog_products`, mesmo padrao do endpoint publico
   * de cardapio (Sprint 1, `catalog/public/public-menu.repository.ts`) —
   * nao passa pelo service administrativo autenticado de `catalog`.
   * Preco/nome/queue_type de item de pedido sao SEMPRE resolvidos aqui, no
   * servidor, nunca aceitos do payload do cliente.
   */
  async findVisibleByIds(clientId: string, productIds: string[]): Promise<ComandaProductSnapshotRow[]> {
    if (productIds.length === 0) {
      return [];
    }
    const result = await this.database.query<ComandaProductSnapshotRow>(
      `SELECT id, name, sale_price::text AS price, queue_type AS "queueType"
       FROM catalog_products
       WHERE client_id = $1::uuid
         AND status = 'active'
         AND visible_in_comanda = true
         AND id = ANY($2::uuid[])`,
      [clientId, productIds]
    );
    return result.rows;
  }
}
