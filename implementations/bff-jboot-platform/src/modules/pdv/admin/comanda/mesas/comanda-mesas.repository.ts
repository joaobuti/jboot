import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../../database/database.service';
import { ComandaMesaRow, ComandaMesaStatus } from './comanda-mesas.types';

const MESA_COLS = `
  id, table_number AS "tableNumber", label, status,
  token_version AS "tokenVersion", created_at AS "createdAt", updated_at AS "updatedAt"
`;

/**
 * Repository do cadastro administrativo de mesas (Sprint 7). Mesmo padrao dos
 * demais repositories de `pdv/admin`: acesso proprio a `comanda_tables`, sem
 * import de `src/modules/comanda/repositories/*`.
 */
@Injectable()
export class ComandaMesasRepository {
  constructor(private readonly database: DatabaseService) {}

  async findAll(clientId: string): Promise<ComandaMesaRow[]> {
    const result = await this.database.query<ComandaMesaRow>(
      `SELECT ${MESA_COLS}
       FROM comanda_tables
       WHERE client_id = $1
       ORDER BY table_number ASC`,
      [clientId]
    );
    return result.rows;
  }

  async findById(clientId: string, id: string): Promise<ComandaMesaRow | null> {
    const result = await this.database.query<ComandaMesaRow>(
      `SELECT ${MESA_COLS} FROM comanda_tables WHERE client_id = $1 AND id = $2 LIMIT 1`,
      [clientId, id]
    );
    return result.rows[0] ?? null;
  }

  async findByTableNumber(clientId: string, tableNumber: number): Promise<ComandaMesaRow | null> {
    const result = await this.database.query<ComandaMesaRow>(
      `SELECT ${MESA_COLS} FROM comanda_tables WHERE client_id = $1 AND table_number = $2 LIMIT 1`,
      [clientId, tableNumber]
    );
    return result.rows[0] ?? null;
  }

  async create(clientId: string, tableNumber: number, label: string | null): Promise<ComandaMesaRow> {
    const result = await this.database.query<ComandaMesaRow>(
      `INSERT INTO comanda_tables (client_id, table_number, label, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING ${MESA_COLS}`,
      [clientId, tableNumber, label]
    );
    return result.rows[0];
  }

  async updateLabel(clientId: string, id: string, label: string | null): Promise<ComandaMesaRow> {
    const result = await this.database.query<ComandaMesaRow>(
      `UPDATE comanda_tables SET label = $3, updated_at = now()
       WHERE client_id = $1 AND id = $2
       RETURNING ${MESA_COLS}`,
      [clientId, id, label]
    );
    return result.rows[0];
  }

  async updateStatus(clientId: string, id: string, status: ComandaMesaStatus): Promise<ComandaMesaRow> {
    const result = await this.database.query<ComandaMesaRow>(
      `UPDATE comanda_tables SET status = $3, updated_at = now()
       WHERE client_id = $1 AND id = $2
       RETURNING ${MESA_COLS}`,
      [clientId, id, status]
    );
    return result.rows[0];
  }

  /**
   * Revogacao do QR impresso: incrementa `token_version`, invalidando
   * qualquer token emitido antes, sem tocar no segredo JWT global.
   */
  async bumpTokenVersion(clientId: string, id: string): Promise<ComandaMesaRow> {
    const result = await this.database.query<ComandaMesaRow>(
      `UPDATE comanda_tables SET token_version = token_version + 1, updated_at = now()
       WHERE client_id = $1 AND id = $2
       RETURNING ${MESA_COLS}`,
      [clientId, id]
    );
    return result.rows[0];
  }

  async countComandasAbertas(clientId: string, tableNumber: number): Promise<number> {
    const result = await this.database.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM comandas
       WHERE client_id = $1 AND table_number = $2 AND status = 'aberta'`,
      [clientId, tableNumber]
    );
    return Number(result.rows[0]?.total ?? '0');
  }
}
