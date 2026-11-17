import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { MemberProfileTransitionInputDto } from './dto/profile.dto';

export interface MemberProfileTransitionRow {
  id: string;
  profileId: string;
  fromBoardColumnId: string;
  toBoardColumnId: string;
}

const TRANSITION_SELECT = `id, profile_id AS "profileId", from_board_column_id AS "fromBoardColumnId",
                            to_board_column_id AS "toBoardColumnId"`;

@Injectable()
export class ProfileTransitionsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(databaseRef: string, clientId: string, profileId: string): Promise<MemberProfileTransitionRow[]> {
    const result = await this.database.queryForDatabaseRef<MemberProfileTransitionRow>(
      databaseRef,
      `SELECT ${TRANSITION_SELECT} FROM kanban_member_profile_transitions
       WHERE client_id = $1 AND profile_id = $2
       ORDER BY created_at`,
      [clientId, profileId]
    );
    return result.rows;
  }

  async isAllowed(
    databaseRef: string,
    clientId: string,
    profileId: string,
    fromBoardColumnId: string,
    toBoardColumnId: string
  ): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef<{ exists: boolean }>(
      databaseRef,
      `SELECT EXISTS(
         SELECT 1 FROM kanban_member_profile_transitions
         WHERE client_id = $1 AND profile_id = $2 AND from_board_column_id = $3 AND to_board_column_id = $4
       ) AS "exists"`,
      [clientId, profileId, fromBoardColumnId, toBoardColumnId]
    );
    return result.rows[0]?.exists ?? false;
  }

  async replace(
    databaseRef: string,
    clientId: string,
    profileId: string,
    transitions: MemberProfileTransitionInputDto[]
  ): Promise<MemberProfileTransitionRow[]> {
    return this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      await client.query(`DELETE FROM kanban_member_profile_transitions WHERE client_id = $1 AND profile_id = $2`, [
        clientId,
        profileId
      ]);

      for (const transition of transitions) {
        await client.query(
          `INSERT INTO kanban_member_profile_transitions (client_id, profile_id, from_board_column_id, to_board_column_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (client_id, profile_id, from_board_column_id, to_board_column_id) DO NOTHING`,
          [clientId, profileId, transition.fromBoardColumnId, transition.toBoardColumnId]
        );
      }

      const result = await client.query<MemberProfileTransitionRow>(
        `SELECT ${TRANSITION_SELECT} FROM kanban_member_profile_transitions
         WHERE client_id = $1 AND profile_id = $2
         ORDER BY created_at`,
        [clientId, profileId]
      );
      return result.rows;
    });
  }
}
