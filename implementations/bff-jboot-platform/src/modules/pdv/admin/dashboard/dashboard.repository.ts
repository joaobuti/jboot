import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../database/database.service';

export type DashboardPeriod = 'today' | 'week' | 'month';

export interface DashboardData {
  period: DashboardPeriod;
  locationId: string | null;
  revenue: string;
  salesCount: number;
  averageTicket: string;
  topProducts: { productId: string; productName: string; quantitySold: string; revenue: string }[];
  paymentMethods: { method: string; amount: string; count: number }[];
  fiscalErrors: number;
}

const PERIOD_SQL = `
  CASE $3
    WHEN 'today' THEN current_date::timestamptz
    WHEN 'week'  THEN date_trunc('week', now())
    WHEN 'month' THEN date_trunc('month', now())
    ELSE current_date::timestamptz
  END
`;

const COMPLETED_STATUSES = `('completed', 'fiscal_pending', 'fiscal_error')`;

@Injectable()
export class DashboardRepository {
  constructor(private readonly db: DatabaseService) {}

  async getDashboard(clientId: string, period: DashboardPeriod, locationId: string | null): Promise<DashboardData> {
    const [summary, topProducts, paymentMethods, fiscalErrors] = await Promise.all([
      this.querySummary(clientId, period, locationId),
      this.queryTopProducts(clientId, period, locationId),
      this.queryPaymentMethods(clientId, period, locationId),
      this.queryFiscalErrors(clientId, period, locationId)
    ]);

    return {
      period,
      locationId,
      revenue: summary.revenue,
      salesCount: summary.salesCount,
      averageTicket: summary.averageTicket,
      topProducts,
      paymentMethods,
      fiscalErrors
    };
  }

  private async querySummary(clientId: string, period: DashboardPeriod, locationId: string | null) {
    const result = await this.db.query<{
      revenue: string;
      sales_count: string;
      average_ticket: string;
    }>(
      `SELECT
         COALESCE(SUM(total), 0)::text          AS revenue,
         COUNT(*)::text                          AS sales_count,
         COALESCE(AVG(total), 0)::numeric(12,2)::text AS average_ticket
       FROM pdv_sales
       WHERE client_id = $1
         AND status IN ${COMPLETED_STATUSES}
         AND ($2::uuid IS NULL OR location_id = $2)
         AND created_at >= ${PERIOD_SQL}`,
      [clientId, locationId, period]
    );
    const row = result.rows[0];
    return {
      revenue: row?.revenue ?? '0',
      salesCount: Number(row?.sales_count ?? 0),
      averageTicket: row?.average_ticket ?? '0.00'
    };
  }

  private async queryTopProducts(clientId: string, period: DashboardPeriod, locationId: string | null) {
    const result = await this.db.query<{
      product_id: string;
      product_name: string;
      quantity_sold: string;
      revenue: string;
    }>(
      `SELECT
         si.product_id                        AS product_id,
         COALESCE(p.name, si.product_id::text) AS product_name,
         SUM(si.quantity)::text               AS quantity_sold,
         SUM(si.total)::text                  AS revenue
       FROM pdv_sale_items si
       JOIN pdv_sales s ON s.id = si.sale_id
       LEFT JOIN catalog_products p ON p.id = si.product_id AND p.client_id = $1
       WHERE s.client_id = $1
         AND s.status IN ${COMPLETED_STATUSES}
         AND ($2::uuid IS NULL OR s.location_id = $2)
         AND s.created_at >= ${PERIOD_SQL}
       GROUP BY si.product_id, p.name
       ORDER BY SUM(si.quantity) DESC
       LIMIT 5`,
      [clientId, locationId, period]
    );
    return result.rows.map((r) => ({
      productId: r.product_id,
      productName: r.product_name,
      quantitySold: r.quantity_sold,
      revenue: r.revenue
    }));
  }

  private async queryPaymentMethods(clientId: string, period: DashboardPeriod, locationId: string | null) {
    const result = await this.db.query<{
      method: string;
      amount: string;
      count: string;
    }>(
      `SELECT
         sp.payment_method            AS method,
         SUM(sp.amount)::text         AS amount,
         COUNT(*)::text               AS count
       FROM pdv_sale_payments sp
       JOIN pdv_sales s ON s.id = sp.sale_id
       WHERE s.client_id = $1
         AND s.status IN ${COMPLETED_STATUSES}
         AND ($2::uuid IS NULL OR s.location_id = $2)
         AND s.created_at >= ${PERIOD_SQL}
       GROUP BY sp.payment_method
       ORDER BY SUM(sp.amount) DESC`,
      [clientId, locationId, period]
    );
    return result.rows.map((r) => ({
      method: r.method,
      amount: r.amount,
      count: Number(r.count)
    }));
  }

  private async queryFiscalErrors(clientId: string, period: DashboardPeriod, locationId: string | null) {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM pdv_sales
       WHERE client_id = $1
         AND fiscal_status = 'failed'
         AND ($2::uuid IS NULL OR location_id = $2)
         AND created_at >= ${PERIOD_SQL}`,
      [clientId, locationId, period]
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}
