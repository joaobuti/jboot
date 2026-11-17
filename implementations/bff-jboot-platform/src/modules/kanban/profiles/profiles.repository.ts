import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { PageQuery, PageResult } from '../kanban.types';
import { ensureOne } from '../shared/repository-result';
import { CreateMemberProfileDto, UpdateMemberProfileDto } from './dto/profile.dto';

export interface MemberProfileRow {
  id: string;
  boardId: string;
  name: string;
  canDeleteArchivedCards: boolean;
  canManageTags: boolean;
  canManageStatuses: boolean;
  canReviewDocuments: boolean;
  createdAt: string;
  updatedAt: string;
  total?: string;
}

export interface MemberProfileCapabilities {
  canDeleteArchivedCards: boolean;
  canManageTags: boolean;
  canManageStatuses: boolean;
  canReviewDocuments: boolean;
}

const PROFILE_SELECT = `id, board_id AS "boardId", name, can_delete_archived_cards AS "canDeleteArchivedCards",
                         can_manage_tags AS "canManageTags", can_manage_statuses AS "canManageStatuses",
                         can_review_documents AS "canReviewDocuments",
                         created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class ProfilesRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(
    databaseRef: string,
    clientId: string,
    boardId: string,
    query: PageQuery
  ): Promise<PageResult<Omit<MemberProfileRow, 'total'>>> {
    const result = await this.database.queryForDatabaseRef<MemberProfileRow>(
      databaseRef,
      `SELECT ${PROFILE_SELECT}, count(*) OVER() AS total
       FROM kanban_member_profiles
       WHERE client_id = $1 AND board_id = $2
       ORDER BY name
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

  async findById(
    databaseRef: string,
    clientId: string,
    boardId: string,
    profileId: string
  ): Promise<Omit<MemberProfileRow, 'total'> | null> {
    const result = await this.database.queryForDatabaseRef<Omit<MemberProfileRow, 'total'>>(
      databaseRef,
      `SELECT ${PROFILE_SELECT} FROM kanban_member_profiles WHERE client_id = $1 AND board_id = $2 AND id = $3`,
      [clientId, boardId, profileId]
    );
    return result.rows[0] ?? null;
  }

  async findCapability(
    databaseRef: string,
    clientId: string,
    profileId: string
  ): Promise<MemberProfileCapabilities | null> {
    const result = await this.database.queryForDatabaseRef<MemberProfileCapabilities>(
      databaseRef,
      `SELECT can_delete_archived_cards AS "canDeleteArchivedCards",
              can_manage_tags AS "canManageTags", can_manage_statuses AS "canManageStatuses",
              can_review_documents AS "canReviewDocuments"
       FROM kanban_member_profiles
       WHERE client_id = $1 AND id = $2`,
      [clientId, profileId]
    );
    return result.rows[0] ?? null;
  }

  async create(
    databaseRef: string,
    clientId: string,
    boardId: string,
    dto: CreateMemberProfileDto
  ): Promise<Omit<MemberProfileRow, 'total'>> {
    return ensureOne(
      await this.database.queryForDatabaseRef<Omit<MemberProfileRow, 'total'>>(
        databaseRef,
        `INSERT INTO kanban_member_profiles
           (client_id, board_id, name, can_delete_archived_cards, can_manage_tags, can_manage_statuses, can_review_documents)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${PROFILE_SELECT}`,
        [
          clientId,
          boardId,
          dto.name,
          dto.canDeleteArchivedCards ?? false,
          dto.canManageTags ?? false,
          dto.canManageStatuses ?? false,
          dto.canReviewDocuments ?? false
        ]
      )
    );
  }

  async update(
    databaseRef: string,
    clientId: string,
    boardId: string,
    profileId: string,
    dto: UpdateMemberProfileDto
  ): Promise<Omit<MemberProfileRow, 'total'>> {
    return ensureOne(
      await this.database.queryForDatabaseRef<Omit<MemberProfileRow, 'total'>>(
        databaseRef,
        `UPDATE kanban_member_profiles
         SET name = COALESCE($4, name),
             can_delete_archived_cards = COALESCE($5, can_delete_archived_cards),
             can_manage_tags = COALESCE($6, can_manage_tags),
             can_manage_statuses = COALESCE($7, can_manage_statuses),
             can_review_documents = COALESCE($8, can_review_documents),
             updated_at = now()
         WHERE client_id = $1 AND board_id = $2 AND id = $3
         RETURNING ${PROFILE_SELECT}`,
        [
          clientId,
          boardId,
          profileId,
          dto.name ?? null,
          dto.canDeleteArchivedCards ?? null,
          dto.canManageTags ?? null,
          dto.canManageStatuses ?? null,
          dto.canReviewDocuments ?? null
        ]
      )
    );
  }

  async remove(databaseRef: string, clientId: string, boardId: string, profileId: string): Promise<void> {
    const assigned = await this.database.queryForDatabaseRef<{ count: string }>(
      databaseRef,
      `SELECT count(*)::text AS count FROM kanban_board_members
       WHERE client_id = $1 AND board_id = $2 AND profile_id = $3 AND status = 'active'`,
      [clientId, boardId, profileId]
    );
    if (Number(assigned.rows[0]?.count ?? 0) > 0) {
      throw new ConflictException({
        code: 'profile_in_use',
        message: 'Profile still assigned to active board members'
      });
    }

    await this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      await client.query(
        `DELETE FROM kanban_board_column_permissions WHERE client_id = $1 AND profile_id = $2`,
        [clientId, profileId]
      );
      await client.query(
        `DELETE FROM kanban_member_profile_transitions WHERE client_id = $1 AND profile_id = $2`,
        [clientId, profileId]
      );
      await client.query(
        `DELETE FROM kanban_member_profiles WHERE client_id = $1 AND board_id = $2 AND id = $3`,
        [clientId, boardId, profileId]
      );
    });
  }
}
