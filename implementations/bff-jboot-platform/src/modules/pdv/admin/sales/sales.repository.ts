import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../../database/database.service';
import { AddSaleItemDto, AddSalePaymentDto, PaymentMethod } from './dto/sale.dto';

export interface SaleRow {
  id: string;
  saleNumber: number;
  clientId: string;
  operatorId: string;
  cashierId: string | null;
  locationId: string | null;
  status: string;
  subtotal: string;
  discount: string;
  total: string;
  fiscalDocumentId: string | null;
  fiscalStatus: string | null;
  fiscalRequestId: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  cancelledByIdentityId: string | null;
  fiscalCancelStatus: string | null;
  fiscalCancelError: string | null;
  callerModule: string;
  /** Sprint 9: venda-pai quando esta venda e um recebimento derivado. */
  parentSaleId: string | null;
  saleRole: SaleRole;
  createdAt: string;
  updatedAt: string;
}

/**
 * `comanda_parent` carrega os itens e nunca pagamento proprio;
 * `comanda_payment` carrega o pagamento e nunca item. O dinheiro vive
 * somente nas filhas — ver 042_comanda_pagamento_dividido.sql.
 */
export type SaleRole = 'standalone' | 'comanda_parent' | 'comanda_payment';

export interface SaleItemRow {
  id: string;
  saleId: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  total: string;
  sku: string | null;
  description: string;
  unit: string;
  gtin: string | null;
  cest: string | null;
  cfop: string | null;
  ncm: string;
}

export interface SalePaymentRow {
  id: string;
  saleId: string;
  paymentMethod: PaymentMethod;
  amount: string;
  status: string;
  externalRef: string | null;
}

/** Recebimento derivado, na visao da comanda (Sprint 9). */
export interface ComandaPaymentRow {
  saleId: string;
  saleNumber: number;
  paymentMethod: PaymentMethod;
  amount: string;
  operatorId: string;
  receivedAt: string;
}

const SALE_COLS = `
  id, sale_number AS "saleNumber",
  client_id AS "clientId", operator_id AS "operatorId",
  cashier_id AS "cashierId", location_id AS "locationId", status,
  subtotal::text, discount::text, total::text,
  fiscal_document_id AS "fiscalDocumentId",
  fiscal_status AS "fiscalStatus",
  fiscal_request_id AS "fiscalRequestId",
  cancellation_reason AS "cancellationReason",
  cancelled_at AS "cancelledAt",
  cancelled_by_identity_id AS "cancelledByIdentityId",
  fiscal_cancel_status AS "fiscalCancelStatus",
  fiscal_cancel_error AS "fiscalCancelError",
  caller_module AS "callerModule",
  parent_sale_id AS "parentSaleId", sale_role AS "saleRole",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

@Injectable()
export class SalesRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(
    clientId: string,
    operatorId: string,
    cashierId?: string,
    locationId?: string,
    role: SaleRole = 'standalone',
    parentSaleId?: string
  ): Promise<SaleRow> {
    const result = await this.database.query<SaleRow>(
      `INSERT INTO pdv_sales (client_id, operator_id, cashier_id, location_id, caller_module, sale_role, parent_sale_id)
       VALUES ($1, $2, $3, $4, 'pdv', $5, $6)
       RETURNING ${SALE_COLS}`,
      [clientId, operatorId, cashierId ?? null, locationId ?? null, role, parentSaleId ?? null]
    );
    return result.rows[0];
  }

  /** Soma confirmada dos recebimentos derivados de uma venda-pai. */
  async paidTotalByParent(clientId: string, parentSaleId: string): Promise<number> {
    const result = await this.database.query<{ total: string }>(
      `SELECT COALESCE(SUM(p.amount), 0)::text AS total
       FROM pdv_sales s
       JOIN pdv_sale_payments p ON p.sale_id = s.id
       WHERE s.client_id = $1 AND s.parent_sale_id = $2 AND s.status = 'completed'`,
      [clientId, parentSaleId]
    );
    return Number(result.rows[0]?.total ?? '0');
  }

  async paymentsByParent(clientId: string, parentSaleId: string): Promise<ComandaPaymentRow[]> {
    const result = await this.database.query<ComandaPaymentRow>(
      `SELECT s.id AS "saleId", s.sale_number AS "saleNumber",
              p.payment_method AS "paymentMethod", p.amount::text,
              s.operator_id AS "operatorId", s.created_at AS "receivedAt"
       FROM pdv_sales s
       JOIN pdv_sale_payments p ON p.sale_id = s.id
       WHERE s.client_id = $1 AND s.parent_sale_id = $2 AND s.status = 'completed'
       ORDER BY s.created_at ASC`,
      [clientId, parentSaleId]
    );
    return result.rows;
  }

  async findById(clientId: string, saleId: string): Promise<SaleRow> {
    const result = await this.database.query<SaleRow>(
      `SELECT ${SALE_COLS} FROM pdv_sales WHERE id = $1 AND client_id = $2`,
      [saleId, clientId]
    );
    if (!result.rows[0]) throw new NotFoundException('Sale not found');
    return result.rows[0];
  }

  async list(
    clientId: string,
    params: { limit: number; offset: number; status?: string }
  ): Promise<{ data: SaleRow[]; meta: { total: number; limit: number; offset: number } }> {
    const conditions: string[] = ['client_id = $1'];
    const values: unknown[] = [clientId];
    if (params.status) {
      values.push(params.status);
      conditions.push(`status = $${values.length}`);
    }
    const where = conditions.join(' AND ');
    const countResult = await this.database.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM pdv_sales WHERE ${where}`,
      values
    );
    const dataResult = await this.database.query<SaleRow>(
      `SELECT ${SALE_COLS} FROM pdv_sales WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, params.limit, params.offset]
    );
    return {
      data: dataResult.rows,
      meta: { total: parseInt(countResult.rows[0].total), limit: params.limit, offset: params.offset }
    };
  }

  async addItem(clientId: string, saleId: string, dto: AddSaleItemDto): Promise<SaleItemRow> {
    const total = dto.quantity * dto.unitPrice - (dto.discount ?? 0);
    const result = await this.database.query<SaleItemRow>(
      `INSERT INTO pdv_sale_items (
         sale_id, client_id, product_id, quantity, unit_price, discount, total,
         cfop, ncm, cst_icms, cst_pis, cst_cofins, aliq_icms, aliq_pis, aliq_cofins,
         sku, description, unit, gtin, cest
       )
       SELECT $1, $2, $3, $4, $5, $6, $7,
              COALESCE($8, p.cfop), COALESCE($9, p.ncm),
              $10, $11, $12, $13, $14, $15,
              p.sku, p.name, p.unit, p.gtin, p.cest
       FROM catalog_products p
       WHERE p.id = $3 AND p.client_id = $2
       RETURNING id, sale_id AS "saleId", product_id AS "productId",
                 quantity::text, unit_price::text AS "unitPrice",
                 discount::text, total::text, sku, description, unit, gtin, cest, cfop, ncm`,
      [
        saleId, clientId, dto.productId,
        dto.quantity, dto.unitPrice, dto.discount ?? 0, total,
        dto.cfop ?? null, dto.ncm ?? null,
        dto.cstIcms ?? null, dto.cstPis ?? null, dto.cstCofins ?? null,
        dto.aliqIcms ?? null, dto.aliqPis ?? null, dto.aliqCofins ?? null
      ]
    );
    await this.recalcTotals(clientId, saleId);
    return result.rows[0];
  }

  async removeItem(clientId: string, saleId: string, itemId: string): Promise<void> {
    await this.database.query(
      `DELETE FROM pdv_sale_items WHERE id = $1 AND sale_id = $2 AND client_id = $3`,
      [itemId, saleId, clientId]
    );
    await this.recalcTotals(clientId, saleId);
  }

  async updateItem(clientId: string, saleId: string, itemId: string, quantity: number): Promise<SaleItemRow> {
    const result = await this.database.query<SaleItemRow>(
      `UPDATE pdv_sale_items
       SET quantity = $3,
           total    = unit_price * $3 - discount
       WHERE id = $1 AND sale_id = $2 AND client_id = $4
       RETURNING id, sale_id AS "saleId", product_id AS "productId",
                 quantity::text, unit_price::text AS "unitPrice",
                 discount::text, total::text, sku, description, unit, gtin, cest, cfop, ncm`,
      [itemId, saleId, quantity, clientId]
    );
    if (!result.rows[0]) throw new NotFoundException('Item not found');
    await this.recalcTotals(clientId, saleId);
    return result.rows[0];
  }

  async applyDiscount(clientId: string, saleId: string, discount: number): Promise<SaleRow> {
    const result = await this.database.query<SaleRow>(
      `UPDATE pdv_sales
       SET discount   = $3,
           total      = GREATEST(0, subtotal - $3),
           updated_at = NOW()
       WHERE id = $2 AND client_id = $1 AND status = 'open'
       RETURNING ${SALE_COLS}`,
      [clientId, saleId, discount]
    );
    if (!result.rows[0]) throw new NotFoundException('Sale not found or not open');
    return result.rows[0];
  }

  async addPayment(clientId: string, saleId: string, dto: AddSalePaymentDto): Promise<SalePaymentRow> {
    const result = await this.database.query<SalePaymentRow>(
      `INSERT INTO pdv_sale_payments (sale_id, client_id, payment_method, amount, status)
       VALUES ($1, $2, $3, $4, 'confirmed')
       RETURNING id, sale_id AS "saleId",
                 payment_method AS "paymentMethod", amount::text, status,
                 external_ref AS "externalRef"`,
      [saleId, clientId, dto.paymentMethod, dto.amount]
    );
    return result.rows[0];
  }

  async addPendingPixPayment(
    clientId: string,
    saleId: string,
    amount: number,
    chargeId: string,
  ): Promise<SalePaymentRow> {
    const result = await this.database.query<SalePaymentRow>(
      `INSERT INTO pdv_sale_payments (
         sale_id, client_id, payment_method, amount, status, external_ref
       ) VALUES ($1, $2, 'pix', $3, 'pending', $4)
       ON CONFLICT (client_id, external_ref) WHERE external_ref IS NOT NULL
       DO UPDATE SET external_ref = EXCLUDED.external_ref
       RETURNING id, sale_id AS "saleId", payment_method AS "paymentMethod",
                 amount::text, status, external_ref AS "externalRef"`,
      [saleId, clientId, amount, chargeId],
    );
    return result.rows[0];
  }

  async confirmIntegratedPayment(
    clientId: string,
    saleId: string,
    chargeId: string,
  ): Promise<SalePaymentRow> {
    const result = await this.database.query<SalePaymentRow>(
      `UPDATE pdv_sale_payments
          SET status = 'confirmed'
        WHERE client_id = $1 AND sale_id = $2 AND external_ref = $3
          AND payment_method = 'pix' AND status IN ('pending', 'confirmed')
       RETURNING id, sale_id AS "saleId", payment_method AS "paymentMethod",
                 amount::text, status, external_ref AS "externalRef"`,
      [clientId, saleId, chargeId],
    );
    if (!result.rows[0]) throw new NotFoundException('Integrated Pix payment not found');
    return result.rows[0];
  }

  async itemsBySale(clientId: string, saleId: string): Promise<SaleItemRow[]> {
    const result = await this.database.query<SaleItemRow>(
      `SELECT i.id, i.sale_id AS "saleId", i.product_id AS "productId",
              i.quantity::text, i.unit_price::text AS "unitPrice",
              i.discount::text, i.total::text,
              COALESCE(i.sku, p.sku) AS sku,
              COALESCE(i.description, p.name) AS description,
              COALESCE(i.unit, p.unit) AS unit,
              COALESCE(i.gtin, p.gtin) AS gtin,
              COALESCE(i.cest, p.cest) AS cest,
              COALESCE(i.cfop, p.cfop) AS cfop,
              COALESCE(i.ncm, p.ncm) AS ncm
       FROM pdv_sale_items i
       JOIN catalog_products p ON p.id = i.product_id AND p.client_id = i.client_id
       WHERE i.sale_id = $1 AND i.client_id = $2
       ORDER BY i.created_at`,
      [saleId, clientId]
    );
    return result.rows;
  }

  async paymentsBySale(clientId: string, saleId: string): Promise<SalePaymentRow[]> {
    const result = await this.database.query<SalePaymentRow>(
      `SELECT id, sale_id AS "saleId",
              payment_method AS "paymentMethod", amount::text, status,
              external_ref AS "externalRef"
       FROM pdv_sale_payments
       WHERE sale_id = $1 AND client_id = $2
       ORDER BY created_at`,
      [saleId, clientId]
    );
    return result.rows;
  }

  async updateStatus(clientId: string, saleId: string, status: string): Promise<void> {
    await this.database.query(
      `UPDATE pdv_sales SET status = $3, updated_at = NOW()
       WHERE id = $1 AND client_id = $2`,
      [saleId, clientId, status]
    );
  }

  async cancelSale(
    clientId: string,
    saleId: string,
    identityId: string,
    reason: string | null,
    fiscalCancelStatus?: string,
    fiscalCancelError?: string
  ): Promise<void> {
    await this.database.query(
      `UPDATE pdv_sales
       SET status = 'cancelled',
           cancellation_reason = $4,
           cancelled_at = NOW(),
           cancelled_by_identity_id = $3,
           fiscal_cancel_status = COALESCE($5, fiscal_cancel_status),
           fiscal_cancel_error = $6,
           updated_at = NOW()
       WHERE id = $1 AND client_id = $2`,
      [saleId, clientId, identityId, reason, fiscalCancelStatus ?? null, fiscalCancelError ?? null]
    );
  }

  async setFiscalCancelStatus(clientId: string, saleId: string, status: string, error?: string): Promise<void> {
    await this.database.query(
      `UPDATE pdv_sales
       SET fiscal_cancel_status = $3,
           fiscal_cancel_error = $4,
           updated_at = NOW()
       WHERE id = $1 AND client_id = $2`,
      [saleId, clientId, status, error ?? null]
    );
  }

  async cancelByCashier(clientId: string, cashierId: string): Promise<void> {
    await this.database.query(
      `UPDATE pdv_sales SET status = 'cancelled', updated_at = NOW()
       WHERE client_id = $1 AND cashier_id = $2 AND status = 'open'`,
      [clientId, cashierId]
    );
  }

  async setFiscalStatus(
    clientId: string,
    saleId: string,
    fiscalStatus: string,
    fiscalDocumentId?: string,
    fiscalRequestId?: string,
    opts: { transitionSaleStatus?: boolean } = {}
  ): Promise<void> {
    const sql = opts.transitionSaleStatus
      ? `UPDATE pdv_sales
         SET fiscal_status      = $3,
             fiscal_document_id = COALESCE($4, fiscal_document_id),
             fiscal_request_id  = COALESCE($5, fiscal_request_id),
             status = CASE WHEN $3 = 'authorized' THEN 'completed'
                           WHEN $3 = 'failed'     THEN 'fiscal_error'
                           ELSE status END,
             updated_at = NOW()
         WHERE id = $1 AND client_id = $2`
      : `UPDATE pdv_sales
         SET fiscal_status      = $3,
             fiscal_document_id = COALESCE($4, fiscal_document_id),
             fiscal_request_id  = COALESCE($5, fiscal_request_id),
             updated_at         = NOW()
         WHERE id = $1 AND client_id = $2`;
    await this.database.query(sql, [saleId, clientId, fiscalStatus, fiscalDocumentId ?? null, fiscalRequestId ?? null]);
  }

  private async recalcTotals(clientId: string, saleId: string): Promise<void> {
    await this.database.query(
      `UPDATE pdv_sales
       SET subtotal   = (SELECT COALESCE(SUM(unit_price * quantity), 0) FROM pdv_sale_items WHERE sale_id = $1),
           total      = GREATEST(0,
                          (SELECT COALESCE(SUM(total), 0) FROM pdv_sale_items WHERE sale_id = $1)
                          - discount),
           updated_at = NOW()
       WHERE id = $1 AND client_id = $2`,
      [saleId, clientId]
    );
  }
}
