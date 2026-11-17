import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export interface ComandaTableRow {
  id: string;
  clientId: string;
  tableNumber: number;
  label: string | null;
  status: 'active' | 'inactive';
  tokenVersion: number;
}

@Injectable()
export class ComandaTablesRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByClientAndTableNumber(clientId: string, tableNumber: number): Promise<ComandaTableRow | null> {
    const result = await this.database.query<ComandaTableRow>(
      `SELECT id, client_id AS "clientId", table_number AS "tableNumber",
              label, status, token_version AS "tokenVersion"
       FROM comanda_tables
       WHERE client_id = $1::uuid AND table_number = $2
       LIMIT 1`,
      [clientId, tableNumber]
    );
    return result.rows[0] ?? null;
  }
}
