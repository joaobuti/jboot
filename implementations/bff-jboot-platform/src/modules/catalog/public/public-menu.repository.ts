import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

interface VisibleCategoryRow {
  id: string;
  name: string;
}

interface VisibleProductRow {
  id: string;
  name: string;
  description: string | null;
  price: string;
  queueType: 'cozinha' | 'bar' | null;
  categoryId: string | null;
  imageFileId: string | null;
}

interface TenantFlagRow {
  enabled: boolean;
}

@Injectable()
export class PublicMenuRepository {
  constructor(private readonly database: DatabaseService) {}

  /**
   * A comanda e uma capability contratada do cliente, registrada em
   * `jboot_identity` (`capability_registry` slug `comanda`, sub-modulo da
   * application `pdv`) e ligada por cliente em `client_capabilities`.
   *
   * Nao e entitlement de application: `comanda` nao tem `application_slug`
   * proprio (isenta por nao ter sessao Identity persistente), entao o QR de
   * mesa e sub-modulo do contrato do PDV, nao um modulo selecionavel a parte.
   * Ate 2026-08-23 isso vivia como chave jsonb em `client_applications.config`;
   * migrado em `docker/postgres/init/044_capability_application_submodules.sql`
   * para eliminar mecanismos paralelos (ver ADR 008).
   *
   * `cr.active` entra no filtro de proposito: desativar a capability no
   * catalogo global desliga o cardapio para todos os clientes de uma vez.
   *
   * `catalog` roda em `jboot_pdv` — leitura cross-database via
   * `DatabaseService.queryIdentity`, mesmo padrao ja usado por
   * `notifications/platform-notifications.repository.ts` e
   * `kanban/members/members.repository.ts`.
   */
  async isComandaAutoatendimentoEnabled(clientId: string): Promise<boolean> {
    const result = await this.database.queryIdentity<TenantFlagRow>(
      `SELECT cc.enabled
       FROM client_capabilities cc
       JOIN capability_registry cr ON cr.slug = cc.capability
       WHERE cc.client_id = $1::uuid
         AND cc.capability = 'comanda'
         AND cr.active = true
       LIMIT 1`,
      [clientId]
    );
    return result.rows[0]?.enabled ?? false;
  }

  async findVisibleCategories(clientId: string): Promise<VisibleCategoryRow[]> {
    const result = await this.database.query<VisibleCategoryRow>(
      `SELECT id, name
       FROM catalog_categories
       WHERE client_id = $1::uuid AND status = 'active' AND visible_in_comanda = true
       ORDER BY name`,
      [clientId]
    );
    return result.rows;
  }

  /**
   * Retorna produtos visiveis na comanda: status ativo + visible_in_comanda,
   * e (sem categoria OU categoria tambem visivel). Produto cuja categoria
   * existe mas nao esta visivel na comanda nunca aparece aqui (nem em
   * "Outros" — essa secao e so para category_id IS NULL).
   */
  async findVisibleProducts(clientId: string): Promise<VisibleProductRow[]> {
    const result = await this.database.query<VisibleProductRow>(
      `SELECT p.id, p.name, p.description, p.sale_price::text AS price, p.queue_type AS "queueType",
              p.category_id AS "categoryId", p.image_file_id AS "imageFileId"
       FROM catalog_products p
       WHERE p.client_id = $1::uuid
         AND p.status = 'active'
         AND p.visible_in_comanda = true
         AND (
           p.category_id IS NULL
           OR EXISTS (
             SELECT 1 FROM catalog_categories c
             WHERE c.id = p.category_id
               AND c.client_id = p.client_id
               AND c.status = 'active'
               AND c.visible_in_comanda = true
           )
         )
       ORDER BY p.name`,
      [clientId]
    );
    return result.rows;
  }
}
