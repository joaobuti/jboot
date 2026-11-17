import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export const IMPORT_SOURCE = { module: 'kanban', type: 'flow_process_import' } as const;

/** Card que ja usa o numero CNJ no tenant, no banco do Flow. */
export interface ProcessOwner {
  kind: 'petition' | 'datajud_card' | 'import_card';
  cardId: string;
  boardId: string;
}

export interface ImportLotRow {
  id: string;
  boardId: string;
  officeId: string;
  createdByIdentityId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalRows: number;
  createdCount: number;
  existingCount: number;
  failedCount: number;
  failureCode: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ImportRowRecord {
  id: string;
  line: number;
  processNumber: string;
  tribunal: string;
  customerName: string | null;
  customerCpf: string | null;
  situation: string | null;
  status: 'pending' | 'created' | 'existing' | 'failed';
  cardId: string | null;
  customerId: string | null;
  existingCardId: string | null;
  existingBoardId: string | null;
  extrasDone: boolean;
  skippedAssignees: number;
  errorCode: string | null;
}

export interface NewImportRow {
  line: number;
  processNumber: string;
  tribunal: string;
  customerName: string;
  customerCpf: string;
  situation: string | null;
}

const LOT_SELECT = `id, board_id AS "boardId", office_id AS "officeId", created_by_identity_id AS "createdByIdentityId",
  status, total_rows AS "totalRows", created_count AS "createdCount", existing_count AS "existingCount",
  failed_count AS "failedCount", failure_code AS "failureCode", created_at AS "createdAt",
  started_at AS "startedAt", finished_at AS "finishedAt"`;

const ROW_SELECT = `id, line, process_number AS "processNumber", tribunal, customer_name AS "customerName",
  customer_cpf AS "customerCpf", situation, status, card_id AS "cardId", customer_id AS "customerId",
  existing_card_id AS "existingCardId", existing_board_id AS "existingBoardId", extras_done AS "extrasDone",
  skipped_assignees AS "skippedAssignees", error_code AS "errorCode"`;

/**
 * Lote de importacao de processos por planilha (docs/product/flow-process-import-sprints.md;
 * migration 120). Nome, CPF e situacao das linhas so vivem enquanto o lote processa.
 */
@Injectable()
export class ProcessImportRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Numeros CNJ (20 digitos) que ja tem card no tenant: peticao, card DataJud ou card importado. */
  async findProcessOwners(databaseRef: string, clientId: string, numbers: string[]): Promise<Map<string, ProcessOwner>> {
    if (numbers.length === 0) return new Map();
    const result = await this.database.queryForDatabaseRef<ProcessOwner & { processNumber: string }>(
      databaseRef,
      `SELECT p.protocol_number AS "processNumber", 'petition' AS kind, p.card_id AS "cardId", c.board_id AS "boardId"
       FROM kanban_card_initial_petitions p JOIN kanban_cards c ON c.client_id = p.client_id AND c.id = p.card_id
       WHERE p.client_id = $1 AND p.protocol_number = ANY($2::text[])
       UNION ALL
       SELECT split_part(c.source_id, ':', 1), 'datajud_card', c.id, c.board_id FROM kanban_cards c
       WHERE c.client_id = $1 AND c.source_type = 'datajud_processo' AND c.status <> 'deleted'
         AND split_part(c.source_id, ':', 1) = ANY($2::text[])
       UNION ALL
       SELECT c.source_id, 'import_card', c.id, c.board_id FROM kanban_cards c
       WHERE c.client_id = $1 AND c.source_module = 'kanban' AND c.source_type = 'flow_process_import'
         AND c.status <> 'deleted' AND c.source_id = ANY($2::text[])`,
      [clientId, numbers]
    );
    const owners = new Map<string, ProcessOwner>();
    for (const row of result.rows) {
      if (!owners.has(row.processNumber)) owners.set(row.processNumber, { kind: row.kind, cardId: row.cardId, boardId: row.boardId });
    }
    return owners;
  }

  async createLot(
    databaseRef: string,
    clientId: string,
    input: { boardId: string; officeId: string; identityId: string; rows: NewImportRow[] }
  ): Promise<string> {
    return this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      const lot = await client.query<{ id: string }>(
        `INSERT INTO kanban_process_imports (client_id, board_id, office_id, created_by_identity_id, total_rows)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [clientId, input.boardId, input.officeId, input.identityId, input.rows.length]
      );
      const importId = lot.rows[0].id;
      await client.query(
        `INSERT INTO kanban_process_import_rows (client_id, import_id, line, process_number, tribunal, customer_name, customer_cpf, situation)
         SELECT $1, $2, r.line, r.process_number, r.tribunal, r.customer_name, r.customer_cpf, r.situation
         FROM jsonb_to_recordset($3::jsonb) AS r(line int, process_number text, tribunal text, customer_name text, customer_cpf text, situation text)`,
        [
          clientId,
          importId,
          JSON.stringify(input.rows.map((row) => ({
            line: row.line,
            process_number: row.processNumber,
            tribunal: row.tribunal,
            customer_name: row.customerName,
            customer_cpf: row.customerCpf,
            situation: row.situation
          })))
        ]
      );
      return importId;
    });
  }

  async findLot(databaseRef: string, clientId: string, importId: string): Promise<ImportLotRow | null> {
    const result = await this.database.queryForDatabaseRef<ImportLotRow>(
      databaseRef,
      `SELECT ${LOT_SELECT} FROM kanban_process_imports WHERE client_id = $1 AND id = $2`,
      [clientId, importId]
    );
    return result.rows[0] ?? null;
  }

  async listRows(databaseRef: string, clientId: string, importId: string): Promise<ImportRowRecord[]> {
    const result = await this.database.queryForDatabaseRef<ImportRowRecord>(
      databaseRef,
      `SELECT ${ROW_SELECT} FROM kanban_process_import_rows WHERE client_id = $1 AND import_id = $2 ORDER BY line`,
      [clientId, importId]
    );
    return result.rows;
  }

  /** `pending`/`failed` -> `processing`. Devolve `false` se o lote ja terminou ou nao existe. */
  async start(databaseRef: string, clientId: string, importId: string): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_process_imports SET status = 'processing', started_at = COALESCE(started_at, clock_timestamp()),
              failure_code = NULL
       WHERE client_id = $1 AND id = $2 AND status <> 'completed'`,
      [clientId, importId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markRow(
    databaseRef: string,
    clientId: string,
    rowId: string,
    patch: Partial<Pick<ImportRowRecord, 'status' | 'cardId' | 'customerId' | 'existingCardId' | 'existingBoardId' | 'extrasDone' | 'skippedAssignees' | 'errorCode'>>
  ): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_process_import_rows
       SET status = COALESCE($3, status), card_id = COALESCE($4, card_id), customer_id = COALESCE($5, customer_id),
           existing_card_id = COALESCE($6, existing_card_id), existing_board_id = COALESCE($7, existing_board_id),
           extras_done = COALESCE($8, extras_done), skipped_assignees = COALESCE($9, skipped_assignees),
           error_code = CASE WHEN $3::text IS NULL THEN error_code ELSE $10 END,
           processed_at = CASE WHEN $3::text IN ('created', 'existing', 'failed') THEN clock_timestamp() ELSE processed_at END
       WHERE client_id = $1 AND id = $2`,
      [
        clientId,
        rowId,
        patch.status ?? null,
        patch.cardId ?? null,
        patch.customerId ?? null,
        patch.existingCardId ?? null,
        patch.existingBoardId ?? null,
        patch.extrasDone ?? null,
        patch.skippedAssignees ?? null,
        patch.errorCode ?? null
      ]
    );
  }

  /** Conta o resultado, encerra o lote e apaga nome, CPF e situacao das linhas (minimizacao). */
  async finish(databaseRef: string, clientId: string, importId: string, failureCode: string | null = null): Promise<void> {
    await this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      if (!failureCode) {
        await client.query(
          `UPDATE kanban_process_import_rows SET customer_name = NULL, customer_cpf = NULL, situation = NULL
           WHERE client_id = $1 AND import_id = $2`,
          [clientId, importId]
        );
      }
      const updated = await client.query(
        `UPDATE kanban_process_imports i
         SET status = $3::varchar, failure_code = $4::varchar,
             finished_at = CASE WHEN $3::varchar = 'completed' THEN clock_timestamp() ELSE finished_at END,
             created_count = (SELECT count(*) FROM kanban_process_import_rows r WHERE r.client_id = i.client_id AND r.import_id = i.id AND r.status = 'created'),
             existing_count = (SELECT count(*) FROM kanban_process_import_rows r WHERE r.client_id = i.client_id AND r.import_id = i.id AND r.status = 'existing'),
             failed_count = (SELECT count(*) FROM kanban_process_import_rows r WHERE r.client_id = i.client_id AND r.import_id = i.id AND r.status = 'failed')
         WHERE i.client_id = $1 AND i.id = $2`,
        [clientId, importId, failureCode ? 'failed' : 'completed', failureCode]
      );
      if (!updated.rowCount) throw new NotFoundException('Import not found');
    });
  }

  /** Responsaveis no card importado; idempotente (retry nao duplica). Devolve quantos entraram agora. */
  async addAssignees(databaseRef: string, clientId: string, cardId: string, identityIds: string[], assignedBy: string): Promise<number> {
    if (identityIds.length === 0) return 0;
    const result = await this.database.queryForDatabaseRef(
      databaseRef,
      `INSERT INTO kanban_card_assignees (client_id, card_id, identity_id, assigned_by_identity_id)
       SELECT $1, $2, identity_id, $4 FROM unnest($3::uuid[]) AS identity_id
       ON CONFLICT (client_id, card_id, identity_id) DO NOTHING`,
      [clientId, cardId, identityIds, assignedBy]
    );
    return result.rowCount ?? 0;
  }
}
