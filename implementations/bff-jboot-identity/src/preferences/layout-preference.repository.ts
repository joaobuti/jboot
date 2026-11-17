import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class LayoutPreferenceRepository {
  constructor(private readonly database: DatabaseService) {}

  async find(identityId: string): Promise<Record<string, unknown> | null> {
    const result = await this.database.query<{ preference: Record<string, unknown> }>(
      'SELECT preference FROM identity_layout_preferences WHERE identity_id = $1',
      [identityId]
    );
    return result.rows[0]?.preference ?? null;
  }

  async upsert(identityId: string, preference: Record<string, unknown>): Promise<void> {
    await this.database.query(
      `INSERT INTO identity_layout_preferences (identity_id, preference, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (identity_id) DO UPDATE SET preference = $2, updated_at = now()`,
      [identityId, JSON.stringify(preference)]
    );
  }
}
