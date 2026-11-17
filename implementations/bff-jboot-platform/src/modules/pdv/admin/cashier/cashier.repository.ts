import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../../database/database.service';

export interface CashierSummary {
  salesCount: number;
  totalCollected: string;
  openingBalance: string;
  movementTotal: string;
  expectedClosingBalance: string;
  countedBalance: string | null;
  closingDifference: string | null;
  byMethod: { paymentMethod: string; amount: string }[];
  movements: CashierMovementRow[];
}

export interface CashierRow {
  id: string;
  clientId: string;
  operatorId: string;
  locationId: string | null;
  status: string;
  openingBalance: string;
  closingBalance: string | null;
  expectedClosingBalance: string | null;
  countedBalance: string | null;
  closingDifference: string | null;
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
}

export type CashierMovementType = 'sangria' | 'suprimento';

export interface CashierMovementRow {
  id: string;
  cashierId: string;
  operatorId: string;
  type: CashierMovementType;
  amount: string;
  reason: string;
  occurredAt: string;
}

const CASHIER_COLS = `
  id, client_id AS "clientId", operator_id AS "operatorId", location_id AS "locationId", status,
  opening_balance::text AS "openingBalance", closing_balance::text AS "closingBalance",
  expected_closing_balance::text AS "expectedClosingBalance",
  counted_balance::text AS "countedBalance", closing_difference::text AS "closingDifference",
  opened_at AS "openedAt", closed_at AS "closedAt", notes
`;

@Injectable()
export class CashierRepository {
  constructor(private readonly database: DatabaseService) {}

  async open(clientId: string, operatorId: string, openingBalance: number, notes?: string, locationId?: string): Promise<CashierRow> {
    const result = await this.database.query<CashierRow>(
      `INSERT INTO pdv_cashiers (client_id, operator_id, opening_balance, notes, location_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${CASHIER_COLS}`,
      [clientId, operatorId, openingBalance, notes ?? null, locationId ?? null]
    );
    return result.rows[0];
  }

  async findOpen(clientId: string, operatorId: string): Promise<CashierRow[]> {
    const result = await this.database.query<CashierRow>(
      `SELECT ${CASHIER_COLS}
       FROM pdv_cashiers
       WHERE client_id = $1 AND operator_id = $2 AND status = 'open'
       ORDER BY opened_at DESC`,
      [clientId, operatorId]
    );
    return result.rows;
  }

  async findOrOpenComandaFallback(clientId: string, contextIdentityId: string, locationId?: string): Promise<CashierRow> {
    const operatorId = await this.findPdvAdminIdentityId(clientId) ?? contextIdentityId;
    const open = await this.findOpen(clientId, operatorId);
    if (open[0]) return open[0];
    return this.open(
      clientId,
      operatorId,
      0,
      'Caixa operacional automático para recebimentos de Comanda sem cashierId',
      locationId
    );
  }

  async createMovement(
    clientId: string,
    cashierId: string,
    operatorId: string,
    type: CashierMovementType,
    amount: number,
    reason: string
  ): Promise<CashierMovementRow> {
    const result = await this.database.query<CashierMovementRow>(
      `INSERT INTO pdv_cashier_movements (client_id, cashier_id, operator_id, type, amount, reason)
       SELECT $1, c.id, $3, $4, $5, $6
       FROM pdv_cashiers c
       WHERE c.id = $2 AND c.client_id = $1 AND c.status = 'open'
       RETURNING id, cashier_id AS "cashierId", operator_id AS "operatorId",
                 type, amount::text, reason, occurred_at AS "occurredAt"`,
      [clientId, cashierId, operatorId, type, amount, reason]
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Caixa não encontrado ou já fechado');
    }
    return result.rows[0];
  }

  async calcExpectedClosingBalance(clientId: string, cashierId: string): Promise<number> {
    const result = await this.database.query<{ total: string }>(
      `SELECT (
         c.opening_balance
         + COALESCE((
             SELECT SUM(p.amount)
             FROM pdv_sale_payments p
             JOIN pdv_sales s ON s.id = p.sale_id
             WHERE s.client_id = $1
               AND s.cashier_id = $2
               AND s.status = 'completed'
               AND s.sale_role <> 'comanda_parent'
           ), 0)
         + COALESCE((
             SELECT SUM(CASE WHEN m.type = 'suprimento' THEN m.amount ELSE -m.amount END)
             FROM pdv_cashier_movements m
             WHERE m.client_id = $1 AND m.cashier_id = $2
           ), 0)
       )::text AS total
       FROM pdv_cashiers c
       WHERE c.client_id = $1 AND c.id = $2`,
      [clientId, cashierId]
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Caixa não encontrado');
    }
    return Number(result.rows[0].total);
  }

  async getSummary(clientId: string, cashierId: string): Promise<CashierSummary> {
    const mainResult = await this.database.query<{
      salesCount: string;
      totalCollected: string;
      openingBalance: string;
      movementTotal: string;
      expectedClosingBalance: string;
      countedBalance: string | null;
      closingDifference: string | null;
    }>(
      // `sale_role <> 'comanda_parent'`: a venda-pai de uma comanda dividida
      // (Sprint 9) carrega os itens, mas nenhum pagamento — o dinheiro esta
      // nas vendas filhas. Sem este filtro ela nao muda o total arrecadado,
      // mas infla o numero de vendas do turno.
      `SELECT
         COUNT(DISTINCT s.id)::text AS "salesCount",
         COALESCE(SUM(p.amount), 0)::text AS "totalCollected",
         c.opening_balance::text AS "openingBalance",
         COALESCE((
           SELECT SUM(CASE WHEN m.type = 'suprimento' THEN m.amount ELSE -m.amount END)
           FROM pdv_cashier_movements m
           WHERE m.client_id = c.client_id AND m.cashier_id = c.id
         ), 0)::text AS "movementTotal",
         COALESCE(c.expected_closing_balance, (
           c.opening_balance
           + COALESCE(SUM(p.amount), 0)
           + COALESCE((
             SELECT SUM(CASE WHEN m.type = 'suprimento' THEN m.amount ELSE -m.amount END)
             FROM pdv_cashier_movements m
             WHERE m.client_id = c.client_id AND m.cashier_id = c.id
           ), 0)
         ))::text AS "expectedClosingBalance",
         c.counted_balance::text AS "countedBalance",
         c.closing_difference::text AS "closingDifference"
       FROM pdv_cashiers c
       LEFT JOIN pdv_sales s
         ON s.cashier_id = c.id AND s.status = 'completed' AND s.sale_role <> 'comanda_parent'
       LEFT JOIN pdv_sale_payments p ON p.sale_id = s.id
       WHERE c.id = $1 AND c.client_id = $2
       GROUP BY c.id, c.client_id, c.opening_balance, c.expected_closing_balance,
                c.counted_balance, c.closing_difference`,
      [cashierId, clientId]
    );
    const byMethodResult = await this.database.query<{ paymentMethod: string; amount: string }>(
      `SELECT
         p.payment_method AS "paymentMethod",
         COALESCE(SUM(p.amount), 0)::text AS amount
       FROM pdv_sale_payments p
       JOIN pdv_sales s ON s.id = p.sale_id
       WHERE s.client_id = $1 AND s.cashier_id = $2 AND s.status = 'completed'
       GROUP BY p.payment_method
       ORDER BY SUM(p.amount) DESC`,
      [clientId, cashierId]
    );
    const movementsResult = await this.database.query<CashierMovementRow>(
      `SELECT id, cashier_id AS "cashierId", operator_id AS "operatorId",
              type, amount::text, reason, occurred_at AS "occurredAt"
       FROM pdv_cashier_movements
       WHERE client_id = $1 AND cashier_id = $2
       ORDER BY occurred_at DESC`,
      [clientId, cashierId]
    );
    const main = mainResult.rows[0] ?? {
      salesCount: '0',
      totalCollected: '0',
      openingBalance: '0',
      movementTotal: '0',
      expectedClosingBalance: '0',
      countedBalance: null,
      closingDifference: null
    };
    return {
      salesCount: parseInt(main.salesCount),
      totalCollected: main.totalCollected,
      openingBalance: main.openingBalance,
      movementTotal: main.movementTotal,
      expectedClosingBalance: main.expectedClosingBalance,
      countedBalance: main.countedBalance,
      closingDifference: main.closingDifference,
      byMethod: byMethodResult.rows,
      movements: movementsResult.rows
    };
  }

  async close(
    clientId: string,
    cashierId: string,
    expectedClosingBalance: number,
    countedBalance: number,
    notes?: string
  ): Promise<CashierRow> {
    const result = await this.database.query<CashierRow>(
      `UPDATE pdv_cashiers
       SET status = 'closed',
           closed_at = NOW(),
           closing_balance = $4,
           expected_closing_balance = $3,
           counted_balance = $4,
           closing_difference = $4 - $3,
           notes = COALESCE($5, notes)
       WHERE id = $1 AND client_id = $2 AND status = 'open'
       RETURNING ${CASHIER_COLS}`,
      [cashierId, clientId, expectedClosingBalance, countedBalance, notes ?? null]
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Caixa não encontrado ou já fechado');
    }
    return result.rows[0];
  }

  private async findPdvAdminIdentityId(clientId: string): Promise<string | null> {
    const result = await this.database.queryIdentity<{ identityId: string }>(
      `SELECT e.identity_id AS "identityId"
       FROM entitlements e
       JOIN applications a ON a.id = e.application_id
       WHERE e.client_id = $1
         AND e.status = 'active'
         AND a.slug = 'pdv'
         AND (
           'pdv:admin:write' = ANY(e.scopes)
           OR 'pdv:cashier:write' = ANY(e.scopes)
           OR 'pdv_admin' = ANY(e.roles)
           OR 'admin' = ANY(e.roles)
         )
       ORDER BY e.created_at ASC
       LIMIT 1`,
      [clientId]
    );
    return result.rows[0]?.identityId ?? null;
  }
}
