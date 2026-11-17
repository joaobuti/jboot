import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { CatalogPageQuery, CatalogPageResult } from '../catalog.types';
import { CreateProductDto, InitialStockItemDto, UpdateProductDto } from './dto/product.dto';

export interface ProductRow {
  id: string;
  categoryId: string | null;
  sku: string | null;
  barcode: string | null;
  ncm: string | null;
  cfop: string | null;
  cest: string | null;
  gtin: string | null;
  name: string;
  description: string | null;
  unit: string;
  salePrice: string;
  costPrice: string | null;
  trackInventory: boolean;
  visibleInPdv: boolean;
  visibleInCardapio: boolean;
  visibleInComanda: boolean;
  queueType: 'cozinha' | 'bar' | null;
  imageFileId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  total?: string;
}

const COLS = `
  id, category_id AS "categoryId", sku, barcode, ncm, cfop, cest, gtin, name, description, unit,
  sale_price::text AS "salePrice", cost_price::text AS "costPrice",
  track_inventory AS "trackInventory",
  visible_in_pdv AS "visibleInPdv",
  visible_in_cardapio AS "visibleInCardapio",
  visible_in_comanda AS "visibleInComanda",
  queue_type AS "queueType",
  image_file_id AS "imageFileId",
  status, created_at AS "createdAt", updated_at AS "updatedAt"
`;

@Injectable()
export class CatalogProductsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(clientId: string, query: CatalogPageQuery): Promise<CatalogPageResult<Omit<ProductRow, 'total'>>> {
    const result = await this.database.query<ProductRow>(
      `SELECT ${COLS}, count(*) OVER() AS total
       FROM catalog_products
       WHERE client_id = $1
         AND ($4::text IS NULL OR status = $4)
         AND ($5::text IS NULL OR name ILIKE '%' || $5 || '%' OR sku ILIKE '%' || $5 || '%' OR barcode ILIKE '%' || $5 || '%')
         AND ($6::boolean IS NULL OR visible_in_pdv      = $6)
         AND ($7::boolean IS NULL OR visible_in_cardapio = $7)
         AND ($8::boolean IS NULL OR visible_in_comanda  = $8)
       ORDER BY name
       LIMIT $2 OFFSET $3`,
      [
        clientId, query.limit, query.offset,
        query.status ?? null,
        query.search ?? null,
        query.visibleInPdv      ?? null,
        query.visibleInCardapio ?? null,
        query.visibleInComanda  ?? null
      ]
    );
    return this.toPage(result.rows, query);
  }

  async create(clientId: string, dto: CreateProductDto, identityId: string): Promise<Omit<ProductRow, 'total'>> {
    const { initialStock, ...fields } = dto;

    if (initialStock && initialStock.length > 0 && fields.trackInventory !== false) {
      return this.database.transaction(async (client) => {
        const result = await client.query<Omit<ProductRow, 'total'>>(
          `INSERT INTO catalog_products (
             client_id, category_id, sku, barcode, ncm, cfop, cest, gtin, name, description, unit,
             sale_price, cost_price, track_inventory,
             visible_in_pdv, visible_in_cardapio, visible_in_comanda, queue_type
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::numeric, $13::numeric,
                   COALESCE($14, true), COALESCE($15, true), COALESCE($16, false), COALESCE($17, false), $18)
           RETURNING ${COLS}`,
          this.createParams(clientId, fields)
        );
        const product = result.rows[0];
        if (!product) throw new NotFoundException('Product not created');

        await this.writeInitialStock(client, clientId, product.id, initialStock, identityId);
        return product;
      });
    }

    const result = await this.database.query<Omit<ProductRow, 'total'>>(
      `INSERT INTO catalog_products (
         client_id, category_id, sku, barcode, ncm, cfop, cest, gtin, name, description, unit,
         sale_price, cost_price, track_inventory,
         visible_in_pdv, visible_in_cardapio, visible_in_comanda, queue_type
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::numeric, $13::numeric,
               COALESCE($14, true), COALESCE($15, true), COALESCE($16, false), COALESCE($17, false), $18)
       RETURNING ${COLS}`,
      this.createParams(clientId, fields)
    );
    if (!result.rows[0]) throw new NotFoundException('Product not created');
    return result.rows[0];
  }

  async findById(clientId: string, id: string): Promise<Omit<ProductRow, 'total'>> {
    const result = await this.database.query<Omit<ProductRow, 'total'>>(
      `SELECT ${COLS} FROM catalog_products WHERE client_id = $1 AND id = $2`,
      [clientId, id]
    );
    if (!result.rows[0]) throw new NotFoundException('Product not found');
    return result.rows[0];
  }

  async update(clientId: string, id: string, dto: UpdateProductDto): Promise<Omit<ProductRow, 'total'>> {
    const result = await this.database.query<Omit<ProductRow, 'total'>>(
      `UPDATE catalog_products
       SET category_id        = COALESCE($3, category_id),
           sku                = COALESCE($4, sku),
           barcode            = COALESCE($5, barcode),
           ncm                = COALESCE($6, ncm),
           cfop               = COALESCE($7, cfop),
           cest               = COALESCE($8, cest),
           gtin               = COALESCE($9, gtin),
           name               = COALESCE($10, name),
           description        = COALESCE($11, description),
           unit               = COALESCE($12, unit),
           sale_price         = COALESCE($13::numeric, sale_price),
           cost_price         = COALESCE($14::numeric, cost_price),
           track_inventory    = COALESCE($15, track_inventory),
           visible_in_pdv     = COALESCE($16, visible_in_pdv),
           visible_in_cardapio = COALESCE($17, visible_in_cardapio),
           visible_in_comanda  = COALESCE($18, visible_in_comanda),
           queue_type          = COALESCE($19, queue_type),
           status              = COALESCE($20, status),
           updated_at          = now()
       WHERE client_id = $1 AND id = $2
       RETURNING ${COLS}`,
      [
        clientId, id,
        dto.categoryId      ?? null,
        dto.sku             ?? null,
        dto.barcode         ?? null,
        dto.ncm             ?? null,
        dto.cfop            ?? null,
        dto.cest            ?? null,
        dto.gtin            ?? null,
        dto.name            ?? null,
        dto.description     ?? null,
        dto.unit            ?? null,
        dto.salePrice       ?? null,
        dto.costPrice       ?? null,
        dto.trackInventory  ?? null,
        dto.visibleInPdv    ?? null,
        dto.visibleInCardapio ?? null,
        dto.visibleInComanda  ?? null,
        dto.queueType         ?? null,
        dto.status          ?? null
      ]
    );
    if (!result.rows[0]) throw new NotFoundException('Product not found');
    return result.rows[0];
  }

  async updateImageFileId(clientId: string, id: string, imageFileId: string): Promise<Omit<ProductRow, 'total'>> {
    const result = await this.database.query<Omit<ProductRow, 'total'>>(
      `UPDATE catalog_products
       SET image_file_id = $3::uuid,
           updated_at = now()
       WHERE client_id = $1::uuid AND id = $2::uuid
       RETURNING ${COLS}`,
      [clientId, id, imageFileId]
    );
    if (!result.rows[0]) throw new NotFoundException('Product not found');
    return result.rows[0];
  }

  private createParams(clientId: string, dto: Omit<CreateProductDto, 'initialStock'>) {
    return [
      clientId,
      dto.categoryId      ?? null,
      dto.sku             ?? null,
      dto.barcode         ?? null,
      dto.ncm             ?? null,
      dto.cfop            ?? null,
      dto.cest            ?? null,
      dto.gtin            ?? null,
      dto.name,
      dto.description     ?? null,
      dto.unit,
      dto.salePrice,
      dto.costPrice       ?? null,
      dto.trackInventory  ?? null,
      dto.visibleInPdv    ?? null,
      dto.visibleInCardapio ?? null,
      dto.visibleInComanda  ?? null,
      dto.queueType         ?? null
    ];
  }

  private async writeInitialStock(
    client: import('pg').PoolClient,
    clientId: string,
    productId: string,
    entries: InitialStockItemDto[],
    identityId: string
  ): Promise<void> {
    for (const entry of entries) {
      if (Number(entry.quantity) <= 0) continue;
      await client.query(
        `INSERT INTO pdv_inventory_movements (
           client_id, product_id, location_id, type, quantity, reason, source_type, source_id, created_by_identity_id
         )
         VALUES ($1, $2, $3, 'initial', $4::numeric, NULL, 'product_create', $2, $5)`,
        [clientId, productId, entry.locationId, entry.quantity, identityId]
      );
      await client.query(
        `INSERT INTO pdv_inventory_balances (client_id, product_id, location_id, quantity)
         VALUES ($1, $2, $3, $4::numeric)
         ON CONFLICT (client_id, product_id, location_id)
         DO UPDATE SET quantity = pdv_inventory_balances.quantity + $4::numeric, updated_at = now()`,
        [clientId, productId, entry.locationId, entry.quantity]
      );
    }
  }

  private toPage(rows: ProductRow[], query: CatalogPageQuery): CatalogPageResult<Omit<ProductRow, 'total'>> {
    const total = rows[0]?.total ? Number(rows[0].total) : 0;
    return {
      data: rows.map(({ total: _ignored, ...data }) => { void _ignored; return data; }),
      meta: { limit: query.limit, offset: query.offset, total }
    };
  }
}
