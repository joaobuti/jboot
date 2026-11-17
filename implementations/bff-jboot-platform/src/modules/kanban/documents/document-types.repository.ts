import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { BoardDocumentTypeResponse, CreateBoardDocumentTypeDto, UpdateBoardDocumentTypeDto } from './dto/document-type.dto';

const DOCUMENT_TYPE_SELECT = `id, board_id AS "boardId", name, required, sort_order AS "sortOrder", active,
                               created_at AS "createdAt", updated_at AS "updatedAt"`;

const ACTIVE_NAME_INDEX = 'kanban_board_document_types_active_name_idx';

function rethrowDuplicateName(error: unknown): never {
  const pgError = error as { code?: string; constraint?: string } | null;
  if (pgError?.code === '23505' && pgError.constraint === ACTIVE_NAME_INDEX) {
    throw new ConflictException({
      code: 'document_type_name_taken',
      message: 'An active document type with this name already exists on the board'
    });
  }
  throw error;
}

@Injectable()
export class DocumentTypesRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Todos os tipos do quadro (ativos e inativos), na ordem de exibicao. */
  async list(databaseRef: string, clientId: string, boardId: string): Promise<BoardDocumentTypeResponse[]> {
    const result = await this.database.queryForDatabaseRef<BoardDocumentTypeResponse>(
      databaseRef,
      `SELECT ${DOCUMENT_TYPE_SELECT} FROM kanban_board_document_types
       WHERE client_id = $1 AND board_id = $2
       ORDER BY active DESC, sort_order, lower(name), id
       LIMIT 500`,
      [clientId, boardId]
    );
    return result.rows;
  }

  async findById(
    databaseRef: string,
    clientId: string,
    boardId: string,
    documentTypeId: string
  ): Promise<BoardDocumentTypeResponse | null> {
    const result = await this.database.queryForDatabaseRef<BoardDocumentTypeResponse>(
      databaseRef,
      `SELECT ${DOCUMENT_TYPE_SELECT} FROM kanban_board_document_types
       WHERE client_id = $1 AND board_id = $2 AND id = $3`,
      [clientId, boardId, documentTypeId]
    );
    return result.rows[0] ?? null;
  }

  async create(
    databaseRef: string,
    clientId: string,
    boardId: string,
    dto: CreateBoardDocumentTypeDto
  ): Promise<BoardDocumentTypeResponse> {
    try {
      const result = await this.database.queryForDatabaseRef<BoardDocumentTypeResponse>(
        databaseRef,
        `INSERT INTO kanban_board_document_types (client_id, board_id, name, required, sort_order)
         VALUES ($1, $2, $3, $4,
                 COALESCE($5, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM kanban_board_document_types
                               WHERE client_id = $1 AND board_id = $2)))
         RETURNING ${DOCUMENT_TYPE_SELECT}`,
        [clientId, boardId, dto.name, dto.required ?? true, dto.sortOrder ?? null]
      );
      return result.rows[0];
    } catch (error) {
      rethrowDuplicateName(error);
    }
  }

  async update(
    databaseRef: string,
    clientId: string,
    boardId: string,
    documentTypeId: string,
    dto: UpdateBoardDocumentTypeDto
  ): Promise<BoardDocumentTypeResponse | null> {
    try {
      const result = await this.database.queryForDatabaseRef<BoardDocumentTypeResponse>(
        databaseRef,
        `UPDATE kanban_board_document_types
         SET name = COALESCE($4, name),
             required = COALESCE($5, required),
             sort_order = COALESCE($6, sort_order),
             active = COALESCE($7, active),
             updated_at = now()
         WHERE client_id = $1 AND board_id = $2 AND id = $3
         RETURNING ${DOCUMENT_TYPE_SELECT}`,
        [
          clientId,
          boardId,
          documentTypeId,
          dto.name ?? null,
          dto.required ?? null,
          dto.sortOrder ?? null,
          dto.active ?? null
        ]
      );
      return result.rows[0] ?? null;
    } catch (error) {
      rethrowDuplicateName(error);
    }
  }

  /**
   * Aplica a lista inicial de forma idempotente: so insere nomes que ainda nao
   * existem no quadro (ativos OU inativos, sem caixa/espacos nas pontas). Tipo
   * desativado de proposito nao e recriado nem reativado. Corre sob lock do
   * quadro para que duas aplicacoes simultaneas nao dupliquem nomes.
   */
  async applyInitialList(
    databaseRef: string,
    clientId: string,
    boardId: string,
    items: ReadonlyArray<{ name: string; required: boolean }>
  ): Promise<{ created: BoardDocumentTypeResponse[]; skippedNames: string[] }> {
    return this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      await client.query(`SELECT id FROM kanban_boards WHERE client_id = $1 AND id = $2 FOR UPDATE`, [clientId, boardId]);
      const existing = await client.query<{ key: string }>(
        `SELECT DISTINCT lower(btrim(name)) AS key FROM kanban_board_document_types
         WHERE client_id = $1 AND board_id = $2`,
        [clientId, boardId]
      );
      const taken = new Set(existing.rows.map((row) => row.key));
      const next = await client.query<{ next: number }>(
        `SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM kanban_board_document_types
         WHERE client_id = $1 AND board_id = $2`,
        [clientId, boardId]
      );
      let sortOrder = Number(next.rows[0]?.next ?? 0);

      const created: BoardDocumentTypeResponse[] = [];
      const skippedNames: string[] = [];
      for (const item of items) {
        const key = item.name.trim().toLowerCase();
        if (taken.has(key)) {
          skippedNames.push(item.name);
          continue;
        }
        const inserted = await client.query<BoardDocumentTypeResponse>(
          `INSERT INTO kanban_board_document_types (client_id, board_id, name, required, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING ${DOCUMENT_TYPE_SELECT}`,
          [clientId, boardId, item.name, item.required, sortOrder++]
        );
        taken.add(key);
        created.push(inserted.rows[0]);
      }
      return { created, skippedNames };
    });
  }
}
