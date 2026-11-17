import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export interface ComandaRow {
  id: string;
  clientId: string;
  customerId: string;
  tableNumber: number;
  status: 'aberta' | 'fechada';
  openedAt: string;
  lastActivityAt: string;
  closingRequestedAt: string | null;
  closedAt: string | null;
}

const SELECT_COLS = `
  id, client_id AS "clientId", customer_id AS "customerId",
  table_number AS "tableNumber", status,
  opened_at AS "openedAt", last_activity_at AS "lastActivityAt",
  closing_requested_at AS "closingRequestedAt", closed_at AS "closedAt"
`;

@Injectable()
export class ComandasRepository {
  constructor(private readonly database: DatabaseService) {}

  async findOpenByCustomer(clientId: string, customerId: string): Promise<ComandaRow | null> {
    const result = await this.database.query<ComandaRow>(
      `SELECT ${SELECT_COLS}
       FROM comandas
       WHERE client_id = $1::uuid AND customer_id = $2::uuid AND status = 'aberta'
       LIMIT 1`,
      [clientId, customerId]
    );
    return result.rows[0] ?? null;
  }

  async findById(clientId: string, comandaId: string): Promise<ComandaRow | null> {
    const result = await this.database.query<ComandaRow>(
      `SELECT ${SELECT_COLS}
       FROM comandas
       WHERE client_id = $1::uuid AND id = $2::uuid
       LIMIT 1`,
      [clientId, comandaId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Le apenas o status — usada pelo `ComandaSessionGuard` a cada request
   * mutavel, para invalidar sessao com JWT valido mas comanda ja fechada,
   * sem depender de blocklist/Redis.
   */
  async findStatusById(comandaId: string): Promise<'aberta' | 'fechada' | null> {
    const result = await this.database.query<{ status: 'aberta' | 'fechada' }>(
      `SELECT status FROM comandas WHERE id = $1::uuid LIMIT 1`,
      [comandaId]
    );
    return result.rows[0]?.status ?? null;
  }

  async create(clientId: string, customerId: string, tableNumber: number): Promise<ComandaRow> {
    const result = await this.database.query<ComandaRow>(
      `INSERT INTO comandas (client_id, customer_id, table_number)
       VALUES ($1::uuid, $2::uuid, $3)
       RETURNING ${SELECT_COLS}`,
      [clientId, customerId, tableNumber]
    );
    return result.rows[0];
  }

  async touchLastActivity(comandaId: string): Promise<void> {
    await this.database.query(
      `UPDATE comandas SET last_activity_at = now(), updated_at = now() WHERE id = $1::uuid`,
      [comandaId]
    );
  }

  async requestClosing(comandaId: string): Promise<void> {
    await this.database.query(
      `UPDATE comandas
       SET closing_requested_at = COALESCE(closing_requested_at, now()),
           last_activity_at = now(),
           updated_at = now()
       WHERE id = $1::uuid`,
      [comandaId]
    );
  }
}
