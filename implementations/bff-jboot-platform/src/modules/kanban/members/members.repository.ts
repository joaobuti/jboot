import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { BoardMemberRole, PageQuery, PageResult } from '../kanban.types';
import { ensureOne } from '../shared/repository-result';
import { CreateBoardMemberDto, UpdateBoardMemberDto } from './dto/member.dto';

export interface BoardMemberRow {
  id: string;
  boardId: string;
  identityId: string;
  role: BoardMemberRole;
  status: string;
  profileId: string | null;
  total?: string;
}

export interface ActiveMembership {
  role: BoardMemberRole;
  profileId: string | null;
}

export interface IdentitySummary {
  identityId: string;
  displayName: string | null;
  documentNumber: string | null;
}

const MEMBER_SELECT = `id, board_id AS "boardId", identity_id AS "identityId", role, status, profile_id AS "profileId"`;

@Injectable()
export class MembersRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(
    databaseRef: string,
    clientId: string,
    boardId: string,
    query: PageQuery
  ): Promise<PageResult<Omit<BoardMemberRow, 'total'>>> {
    const result = await this.database.queryForDatabaseRef<BoardMemberRow>(
      databaseRef,
      `SELECT ${MEMBER_SELECT}, count(*) OVER() AS total
       FROM kanban_board_members
       WHERE client_id = $1 AND board_id = $2
       ORDER BY created_at
       LIMIT $3 OFFSET $4`,
      [clientId, boardId, query.limit, query.offset]
    );
    const total = result.rows[0]?.total ? Number(result.rows[0].total) : 0;
    return {
      data: result.rows.map(({ total: _total, ...rest }) => {
        void _total;
        return rest;
      }),
      meta: { limit: query.limit, offset: query.offset, total }
    };
  }

  async findActiveMembership(
    databaseRef: string,
    clientId: string,
    boardId: string,
    identityId: string
  ): Promise<ActiveMembership | null> {
    const result = await this.database.queryForDatabaseRef<{ role: BoardMemberRole; profileId: string | null }>(
      databaseRef,
      `SELECT role, profile_id AS "profileId" FROM kanban_board_members
       WHERE client_id = $1 AND board_id = $2 AND identity_id = $3 AND status = 'active'`,
      [clientId, boardId, identityId]
    );
    return result.rows[0] ?? null;
  }

  async findActiveRole(
    databaseRef: string,
    clientId: string,
    boardId: string,
    identityId: string
  ): Promise<BoardMemberRole | null> {
    const membership = await this.findActiveMembership(databaseRef, clientId, boardId, identityId);
    return membership?.role ?? null;
  }

  async assignProfile(
    databaseRef: string,
    clientId: string,
    boardId: string,
    memberId: string,
    profileId: string | null
  ): Promise<Omit<BoardMemberRow, 'total'>> {
    return ensureOne(
      await this.database.queryForDatabaseRef<Omit<BoardMemberRow, 'total'>>(
        databaseRef,
        `UPDATE kanban_board_members
         SET profile_id = $4, updated_at = now()
         WHERE client_id = $1 AND board_id = $2 AND id = $3
         RETURNING ${MEMBER_SELECT}`,
        [clientId, boardId, memberId, profileId]
      )
    );
  }

  async create(
    databaseRef: string,
    clientId: string,
    boardId: string,
    dto: CreateBoardMemberDto
  ): Promise<Omit<BoardMemberRow, 'total'>> {
    return ensureOne(
      await this.database.queryForDatabaseRef<Omit<BoardMemberRow, 'total'>>(
        databaseRef,
        `INSERT INTO kanban_board_members (client_id, board_id, identity_id, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (client_id, board_id, identity_id)
         DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = now()
         RETURNING ${MEMBER_SELECT}`,
        [clientId, boardId, dto.identityId, dto.role]
      )
    );
  }

  async update(
    databaseRef: string,
    clientId: string,
    boardId: string,
    memberId: string,
    dto: UpdateBoardMemberDto
  ): Promise<Omit<BoardMemberRow, 'total'>> {
    return ensureOne(
      await this.database.queryForDatabaseRef<Omit<BoardMemberRow, 'total'>>(
        databaseRef,
        `UPDATE kanban_board_members
         SET role = COALESCE($4, role),
             status = COALESCE($5, status),
             updated_at = now()
         WHERE client_id = $1 AND board_id = $2 AND id = $3
         RETURNING ${MEMBER_SELECT}`,
        [clientId, boardId, memberId, dto.role ?? null, dto.status ?? null]
      )
    );
  }

  async remove(databaseRef: string, clientId: string, boardId: string, memberId: string): Promise<void> {
    await this.update(databaseRef, clientId, boardId, memberId, { status: 'inactive' });
  }

  /** Dos ids informados, os que sao membro ATIVO do quadro (qualquer papel). */
  async filterActiveMemberIds(databaseRef: string, clientId: string, boardId: string, identityIds: string[]): Promise<Set<string>> {
    if (identityIds.length === 0) {
      return new Set();
    }
    const result = await this.database.queryForDatabaseRef<{ identityId: string }>(
      databaseRef,
      `SELECT identity_id AS "identityId" FROM kanban_board_members
       WHERE client_id = $1 AND board_id = $2 AND status = 'active' AND identity_id = ANY($3::uuid[])`,
      [clientId, boardId, identityIds]
    );
    return new Set(result.rows.map((row) => row.identityId));
  }

  /** Membros ativos do quadro (qualquer papel), para candidatos a responsavel. */
  async listActiveMembers(databaseRef: string, clientId: string, boardId: string): Promise<Array<{ identityId: string; role: BoardMemberRole }>> {
    const result = await this.database.queryForDatabaseRef<{ identityId: string; role: BoardMemberRole }>(
      databaseRef,
      `SELECT identity_id AS "identityId", role FROM kanban_board_members
       WHERE client_id = $1 AND board_id = $2 AND status = 'active'
       ORDER BY created_at
       LIMIT 1000`,
      [clientId, boardId]
    );
    return result.rows;
  }

  // Identidades vivem em jboot_identity, board members em banco dedicado do Kanban — nao da
  // pra JOIN entre as duas. Resolve nomes num segundo round-trip via DatabaseService.queryIdentity.
  async resolveDisplayNames(identityIds: string[]): Promise<Map<string, IdentitySummary>> {
    if (identityIds.length === 0) {
      return new Map();
    }
    const result = await this.database.queryIdentity<{ id: string; displayName: string | null; documentNumber: string | null }>(
      `SELECT id, display_name AS "displayName", document_number AS "documentNumber"
       FROM identities WHERE id = ANY($1::uuid[])`,
      [identityIds]
    );
    return new Map(
      result.rows.map((row) => [
        row.id,
        { identityId: row.id, displayName: row.displayName, documentNumber: row.documentNumber }
      ])
    );
  }

  // Candidatos a membro: identidades do mesmo client_id com entitlement ativo em 'flow',
  // que ainda nao sao board_member ativo deste board especifico.
  async findCandidates(databaseRef: string, clientId: string, boardId: string): Promise<IdentitySummary[]> {
    const [entitled, activeMembers] = await Promise.all([
      this.database.queryIdentity<{ identityId: string; displayName: string | null; documentNumber: string | null }>(
        `SELECT i.id AS "identityId", i.display_name AS "displayName", i.document_number AS "documentNumber"
         FROM identities i
         JOIN entitlements e ON e.identity_id = i.id
         WHERE e.client_id = $1 AND e.application_id = (SELECT id FROM applications WHERE slug = 'flow')
           AND e.status = 'active' AND i.status = 'active'
         ORDER BY i.display_name`,
        [clientId]
      ),
      this.database.queryForDatabaseRef<{ identityId: string }>(
        databaseRef,
        `SELECT identity_id AS "identityId" FROM kanban_board_members
         WHERE client_id = $1 AND board_id = $2 AND status = 'active'`,
        [clientId, boardId]
      )
    ]);

    const memberIds = new Set(activeMembers.rows.map((row) => row.identityId));
    return entitled.rows.filter((row) => !memberIds.has(row.identityId));
  }
}
