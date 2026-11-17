import { BadRequestException, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../../database/database.service';
import { InventoryBalanceQueryDto } from '../dto/common.dto';
import { PageResult } from '../admin.types';
import { ensureOne } from '../shared/repository-result';
import {
  CreateInventoryAdjustmentDto,
  CreateInventoryImportDto,
  CreateInventoryImportRowDto,
  CreateStockLocationDto,
  CreateStockTransferDto,
  InventoryImportQueryDto,
  UpdateStockLocationDto
} from './dto/inventory.dto';

export interface StockLocationRow {
  id: string;
  name: string;
  type: string;
  isMatriz: boolean;
  cnpj: string | null;
  ie: string | null;
  addressZip: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressIbgeCode: string | null;
  status: string;
}

export interface StockTransferRow {
  id: string;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  productId: string;
  productName: string;
  quantity: string;
  notes: string | null;
  transferredAt: string;
  total?: string;
}

export interface InventoryBalanceRow {
  productId: string;
  locationId: string;
  quantity: string;
  reservedQuantity: string;
  updatedAt: string;
  total?: string;
}

export interface InventoryMovementRow {
  id: string;
  productId: string;
  locationId: string;
  type: string;
  quantity: string;
  reason: string | null;
  sourceType: string;
  occurredAt: string;
}

export interface InventoryImportRow {
  id: string;
  locationId: string;
  status: string;
  fileName: string | null;
  totalRows: number;
  processedRows: number;
  failedRows: number;
  createdAt: string;
  processedAt: string | null;
  total?: string;
}

const LOCATION_COLS = `
  id, name, type,
  is_matriz AS "isMatriz",
  cnpj, ie,
  address_zip AS "addressZip",
  address_street AS "addressStreet",
  address_number AS "addressNumber",
  address_complement AS "addressComplement",
  address_neighborhood AS "addressNeighborhood",
  address_city AS "addressCity",
  address_state AS "addressState",
  address_ibge_code AS "addressIbgeCode",
  status
`;

@Injectable()
export class InventoryRepository {
  constructor(private readonly database: DatabaseService) {}

  async listLocations(clientId: string): Promise<PageResult<StockLocationRow>> {
    const result = await this.database.query<StockLocationRow>(
      `SELECT ${LOCATION_COLS}
       FROM pdv_stock_locations
       WHERE client_id = $1
       ORDER BY is_matriz DESC, name`,
      [clientId]
    );
    return { data: result.rows, meta: { limit: result.rows.length, offset: 0, total: result.rows.length } };
  }

  async createLocation(clientId: string, dto: CreateStockLocationDto) {
    return ensureOne(
      await this.database.query<StockLocationRow>(
        `INSERT INTO pdv_stock_locations (
           client_id, name, type, cnpj, ie,
           address_zip, address_street, address_number, address_complement,
           address_neighborhood, address_city, address_state, address_ibge_code
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING ${LOCATION_COLS}`,
        [
          clientId, dto.name, dto.type,
          dto.cnpj ?? null, dto.ie ?? null,
          dto.addressZip ?? null, dto.addressStreet ?? null, dto.addressNumber ?? null,
          dto.addressComplement ?? null, dto.addressNeighborhood ?? null,
          dto.addressCity ?? null, dto.addressState ?? null, dto.addressIbgeCode ?? null
        ]
      )
    );
  }

  async updateLocation(clientId: string, id: string, dto: UpdateStockLocationDto) {
    return ensureOne(
      await this.database.query<StockLocationRow>(
        `UPDATE pdv_stock_locations
         SET name                  = COALESCE($3, name),
             type                  = COALESCE($4, type),
             cnpj                  = COALESCE($5, cnpj),
             ie                    = COALESCE($6, ie),
             address_zip           = COALESCE($7, address_zip),
             address_street        = COALESCE($8, address_street),
             address_number        = COALESCE($9, address_number),
             address_complement    = COALESCE($10, address_complement),
             address_neighborhood  = COALESCE($11, address_neighborhood),
             address_city          = COALESCE($12, address_city),
             address_state         = COALESCE($13, address_state),
             address_ibge_code     = COALESCE($14, address_ibge_code),
             status                = COALESCE($15, status),
             updated_at            = now()
         WHERE client_id = $1 AND id = $2
         RETURNING ${LOCATION_COLS}`,
        [
          clientId, id,
          dto.name ?? null, dto.type ?? null,
          dto.cnpj ?? null, dto.ie ?? null,
          dto.addressZip ?? null, dto.addressStreet ?? null, dto.addressNumber ?? null,
          dto.addressComplement ?? null, dto.addressNeighborhood ?? null,
          dto.addressCity ?? null, dto.addressState ?? null, dto.addressIbgeCode ?? null,
          dto.status ?? null
        ]
      )
    );
  }

  async listTransfers(clientId: string, query: { limit: number; offset: number; productId?: string; fromLocationId?: string; toLocationId?: string }): Promise<PageResult<Omit<StockTransferRow, 'total'>>> {
    const result = await this.database.query<StockTransferRow>(
      `SELECT
         t.id,
         t.from_location_id AS "fromLocationId", fl.name AS "fromLocationName",
         t.to_location_id   AS "toLocationId",   tl.name AS "toLocationName",
         t.product_id       AS "productId",       p.name  AS "productName",
         t.quantity::text   AS quantity,
         t.notes,
         t.transferred_at   AS "transferredAt",
         count(*) OVER()    AS total
       FROM pdv_stock_transfers t
       JOIN pdv_stock_locations fl ON fl.id = t.from_location_id
       JOIN pdv_stock_locations tl ON tl.id = t.to_location_id
       JOIN catalog_products    p  ON p.id  = t.product_id
       WHERE t.client_id = $1
         AND ($4::uuid IS NULL OR t.product_id = $4)
         AND ($5::uuid IS NULL OR t.from_location_id = $5)
         AND ($6::uuid IS NULL OR t.to_location_id = $6)
       ORDER BY t.transferred_at DESC
       LIMIT $2 OFFSET $3`,
      [clientId, query.limit, query.offset, query.productId ?? null, query.fromLocationId ?? null, query.toLocationId ?? null]
    );
    const total = result.rows[0]?.total ? Number(result.rows[0].total) : 0;
    return {
      data: result.rows.map(({ total: _ignored, ...row }) => { void _ignored; return row; }),
      meta: { limit: query.limit, offset: query.offset, total }
    };
  }

  async createTransfer(clientId: string, dto: CreateStockTransferDto, identityId: string): Promise<Omit<StockTransferRow, 'total'>> {
    return this.database.transaction(async (client) => {
      const transfer = ensureOne(
        await client.query<{ id: string; transferredAt: string }>(
          `INSERT INTO pdv_stock_transfers (
             client_id, from_location_id, to_location_id, product_id,
             quantity, notes, transferred_by_identity_id
           )
           VALUES ($1, $2, $3, $4, $5::numeric, $6, $7)
           RETURNING id, transferred_at AS "transferredAt"`,
          [clientId, dto.fromLocationId, dto.toLocationId, dto.productId, dto.quantity, dto.notes ?? null, identityId]
        )
      );

      await this.insertMovement(client, clientId, {
        productId: dto.productId, locationId: dto.fromLocationId,
        type: 'adjustment_out', quantity: dto.quantity, reason: dto.notes ?? null,
        sourceType: 'stock_transfer', sourceId: transfer.id, identityId
      });
      await this.applyBalance(client, clientId, dto.productId, dto.fromLocationId, 'adjustment_out', dto.quantity);

      await this.insertMovement(client, clientId, {
        productId: dto.productId, locationId: dto.toLocationId,
        type: 'adjustment_in', quantity: dto.quantity, reason: dto.notes ?? null,
        sourceType: 'stock_transfer', sourceId: transfer.id, identityId
      });
      await this.applyBalance(client, clientId, dto.productId, dto.toLocationId, 'adjustment_in', dto.quantity);

      const enriched = await client.query<Omit<StockTransferRow, 'total'>>(
        `SELECT
           t.id,
           t.from_location_id AS "fromLocationId", fl.name AS "fromLocationName",
           t.to_location_id   AS "toLocationId",   tl.name AS "toLocationName",
           t.product_id       AS "productId",       p.name  AS "productName",
           t.quantity::text   AS quantity, t.notes, t.transferred_at AS "transferredAt"
         FROM pdv_stock_transfers t
         JOIN pdv_stock_locations fl ON fl.id = t.from_location_id
         JOIN pdv_stock_locations tl ON tl.id = t.to_location_id
         JOIN catalog_products    p  ON p.id  = t.product_id
         WHERE t.id = $1`,
        [transfer.id]
      );
      return enriched.rows[0];
    });
  }

  async listBalances(clientId: string, query: InventoryBalanceQueryDto): Promise<PageResult<Omit<InventoryBalanceRow, 'total'>>> {
    const result = await this.database.query<InventoryBalanceRow>(
      `SELECT product_id AS "productId", location_id AS "locationId", quantity::text AS quantity,
              reserved_quantity::text AS "reservedQuantity", updated_at AS "updatedAt", count(*) OVER() AS total
       FROM pdv_inventory_balances
       WHERE client_id = $1
         AND ($4::uuid IS NULL OR product_id = $4)
         AND ($5::uuid IS NULL OR location_id = $5)
       ORDER BY updated_at DESC
       LIMIT $2 OFFSET $3`,
      [clientId, query.limit, query.offset, query.productId ?? null, query.locationId ?? null]
    );
    const total = result.rows[0]?.total ? Number(result.rows[0].total) : 0;
    return {
      data: result.rows.map((row) => {
        const { total: _ignored, ...data } = row;
        void _ignored;
        return data;
      }),
      meta: { limit: query.limit, offset: query.offset, total }
    };
  }

  async createAdjustment(clientId: string, dto: CreateInventoryAdjustmentDto, identityId: string) {
    return this.database.transaction(async (client) => {
      const movement = await this.insertMovement(client, clientId, {
        productId: dto.productId,
        locationId: dto.locationId,
        type: dto.type,
        quantity: dto.quantity,
        reason: dto.reason ?? null,
        sourceType: 'manual_adjustment',
        sourceId: null,
        identityId
      });
      await this.applyBalance(client, clientId, dto.productId, dto.locationId, dto.type, dto.quantity);
      return movement;
    });
  }

  async listImports(clientId: string, query: InventoryImportQueryDto): Promise<PageResult<Omit<InventoryImportRow, 'total'>>> {
    const result = await this.database.query<InventoryImportRow>(
      `SELECT id, location_id AS "locationId", status, file_name AS "fileName",
              total_rows AS "totalRows", processed_rows AS "processedRows", failed_rows AS "failedRows",
              created_at AS "createdAt", processed_at AS "processedAt", count(*) OVER() AS total
       FROM pdv_inventory_imports
       WHERE client_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [clientId, query.limit, query.offset]
    );
    const total = result.rows[0]?.total ? Number(result.rows[0].total) : 0;
    return {
      data: result.rows.map((row) => {
        const { total: _ignored, ...data } = row;
        void _ignored;
        return data;
      }),
      meta: { limit: query.limit, offset: query.offset, total }
    };
  }

  async getImport(clientId: string, importId: string) {
    return ensureOne(
      await this.database.query<Omit<InventoryImportRow, 'total'>>(
        `SELECT id, location_id AS "locationId", status, file_name AS "fileName",
                total_rows AS "totalRows", processed_rows AS "processedRows", failed_rows AS "failedRows",
                created_at AS "createdAt", processed_at AS "processedAt"
         FROM pdv_inventory_imports
         WHERE client_id = $1 AND id = $2`,
        [clientId, importId]
      )
    );
  }

  async createImport(clientId: string, dto: CreateInventoryImportDto, identityId: string) {
    return this.database.transaction(async (client) => {
      const importRow = ensureOne(
        await client.query<InventoryImportRow>(
          `INSERT INTO pdv_inventory_imports (
             client_id, location_id, status, file_name, total_rows, created_by_identity_id
           )
           VALUES ($1, $2, 'processing', $3, $4, $5)
           RETURNING id, location_id AS "locationId", status, file_name AS "fileName",
                     total_rows AS "totalRows", processed_rows AS "processedRows", failed_rows AS "failedRows",
                     created_at AS "createdAt", processed_at AS "processedAt"`,
          [clientId, dto.locationId, dto.fileName ?? null, dto.rows.length, identityId]
        )
      );

      let processedRows = 0;
      let failedRows = 0;
      for (const [index, row] of dto.rows.entries()) {
        const rowStatus = await this.processImportRow(
          client, clientId, importRow.id, index + 1, row, dto.locationId, identityId
        );
        if (rowStatus === 'processed') processedRows += 1;
        else failedRows += 1;
      }

      const status = failedRows === 0 ? 'processed' : processedRows > 0 ? 'processed_with_errors' : 'failed';
      return ensureOne(
        await client.query<Omit<InventoryImportRow, 'total'>>(
          `UPDATE pdv_inventory_imports
           SET status = $3, processed_rows = $4, failed_rows = $5, processed_at = now()
           WHERE client_id = $1 AND id = $2
           RETURNING id, location_id AS "locationId", status, file_name AS "fileName",
                     total_rows AS "totalRows", processed_rows AS "processedRows", failed_rows AS "failedRows",
                     created_at AS "createdAt", processed_at AS "processedAt"`,
          [clientId, importRow.id, status, processedRows, failedRows]
        )
      );
    });
  }

  async findPrimaryStockLocation(clientId: string): Promise<string | null> {
    const result = await this.database.query<{ id: string }>(
      `SELECT id FROM pdv_stock_locations
       WHERE client_id = $1 AND status = 'active'
       ORDER BY is_matriz DESC, CASE type WHEN 'store' THEN 0 WHEN 'warehouse' THEN 1 ELSE 2 END
       LIMIT 1`,
      [clientId]
    );
    return result.rows[0]?.id ?? null;
  }

  async findTrackableProductIds(clientId: string, productIds: string[]): Promise<Set<string>> {
    if (productIds.length === 0) return new Set();
    const result = await this.database.query<{ id: string }>(
      `SELECT id FROM catalog_products
       WHERE client_id = $1 AND id = ANY($2::uuid[]) AND track_inventory = true`,
      [clientId, productIds]
    );
    return new Set(result.rows.map((r) => r.id));
  }

  async writeSaleMovements(
    clientId: string,
    saleId: string,
    items: Array<{ productId: string; quantity: string }>,
    locationId: string,
    identityId: string
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      for (const item of items) {
        await this.insertMovement(client, clientId, {
          productId: item.productId,
          locationId,
          type: 'sale',
          quantity: item.quantity,
          reason: null,
          sourceType: 'pdv_sale',
          sourceId: saleId,
          identityId
        });
        await this.applyBalance(client, clientId, item.productId, locationId, 'sale', item.quantity);
      }
    });
  }

  async writeSaleRefundMovements(
    clientId: string,
    saleId: string,
    items: Array<{ productId: string; quantity: string }>,
    locationId: string,
    identityId: string
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      for (const item of items) {
        await this.insertMovement(client, clientId, {
          productId: item.productId,
          locationId,
          type: 'adjustment_in',
          quantity: item.quantity,
          reason: 'Estorno de venda concluída',
          sourceType: 'pdv_sale',
          sourceId: saleId,
          identityId
        });
        await this.applyBalance(client, clientId, item.productId, locationId, 'adjustment_in', item.quantity);
      }
    });
  }

  async writeInitialStock(
    client: PoolClient,
    clientId: string,
    productId: string,
    entries: Array<{ locationId: string; quantity: string }>,
    identityId: string
  ): Promise<void> {
    for (const entry of entries) {
      if (!entry.quantity || Number(entry.quantity) <= 0) continue;
      await this.insertMovement(client, clientId, {
        productId, locationId: entry.locationId,
        type: 'initial', quantity: entry.quantity, reason: null,
        sourceType: 'product_create', sourceId: productId, identityId
      });
      await this.applyBalance(client, clientId, productId, entry.locationId, 'initial', entry.quantity);
    }
  }

  private async processImportRow(
    client: PoolClient,
    clientId: string,
    importId: string,
    rowNumber: number,
    row: CreateInventoryImportRowDto,
    locationId: string,
    identityId: string
  ): Promise<'processed' | 'failed'> {
    const productId = await this.resolveProductId(client, clientId, row);
    if (!productId) {
      await this.insertImportRow(client, clientId, importId, rowNumber, row, 'failed', 'Product not found', null);
      return 'failed';
    }
    const movement = await this.insertMovement(client, clientId, {
      productId,
      locationId,
      type: 'batch_import',
      quantity: row.quantity,
      reason: row.reason ?? null,
      sourceType: 'batch_import',
      sourceId: importId,
      identityId
    });
    await this.applyBalance(client, clientId, productId, locationId, 'batch_import', row.quantity);
    await this.insertImportRow(client, clientId, importId, rowNumber, row, 'processed', null, movement.id);
    return 'processed';
  }

  private async resolveProductId(client: PoolClient, clientId: string, row: CreateInventoryImportRowDto): Promise<string | null> {
    if (!row.productId && !row.sku && !row.barcode) {
      throw new BadRequestException('Import row must identify product by productId, sku or barcode');
    }
    const result = await client.query<{ id: string }>(
      `SELECT id
       FROM catalog_products
       WHERE client_id = $1
         AND (($2::uuid IS NOT NULL AND id = $2)
              OR ($3::text IS NOT NULL AND sku = $3)
              OR ($4::text IS NOT NULL AND barcode = $4))
       LIMIT 1`,
      [clientId, row.productId ?? null, row.sku ?? null, row.barcode ?? null]
    );
    return result.rows[0]?.id ?? null;
  }

  private async insertImportRow(
    client: PoolClient,
    clientId: string,
    importId: string,
    rowNumber: number,
    row: CreateInventoryImportRowDto,
    status: string,
    errorMessage: string | null,
    movementId: string | null
  ): Promise<void> {
    await client.query(
      `INSERT INTO pdv_inventory_import_rows (
         client_id, import_id, row_number, product_id, sku, barcode, quantity, status, error_message, movement_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, $8, $9, $10)`,
      [clientId, importId, rowNumber, row.productId ?? null, row.sku ?? null, row.barcode ?? null, row.quantity, status, errorMessage, movementId]
    );
  }

  private async insertMovement(
    client: PoolClient,
    clientId: string,
    input: {
      productId: string;
      locationId: string;
      type: string;
      quantity: string;
      reason: string | null;
      sourceType: string;
      sourceId: string | null;
      identityId: string;
    }
  ) {
    return ensureOne(
      await client.query<InventoryMovementRow>(
        `INSERT INTO pdv_inventory_movements (
           client_id, product_id, location_id, type, quantity, reason, source_type, source_id, created_by_identity_id
         )
         VALUES ($1, $2, $3, $4, $5::numeric, $6, $7, $8, $9)
         RETURNING id, product_id AS "productId", location_id AS "locationId", type,
                   quantity::text AS quantity, reason, source_type AS "sourceType", occurred_at AS "occurredAt"`,
        [
          clientId,
          input.productId,
          input.locationId,
          input.type,
          input.quantity,
          input.reason,
          input.sourceType,
          input.sourceId,
          input.identityId
        ]
      )
    );
  }

  private async applyBalance(
    client: PoolClient,
    clientId: string,
    productId: string,
    locationId: string,
    type: string,
    quantity: string
  ): Promise<void> {
    const direction = ['adjustment_out', 'sale'].includes(type) ? -1 : 1;
    await client.query(
      `INSERT INTO pdv_inventory_balances (client_id, product_id, location_id, quantity)
       VALUES ($1, $2, $3, $4::numeric * $5)
       ON CONFLICT (client_id, product_id, location_id)
       DO UPDATE SET quantity = pdv_inventory_balances.quantity + ($4::numeric * $5),
                     updated_at = now()`,
      [clientId, productId, locationId, quantity, direction]
    );
  }
}
