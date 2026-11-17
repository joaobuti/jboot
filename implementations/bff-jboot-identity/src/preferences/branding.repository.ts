import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface ClientBranding {
  displayName?: string;
  logoDataUrl?: string;
}

@Injectable()
export class BrandingRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByClient(clientId: string): Promise<ClientBranding | null> {
    const result = await this.database.query<{ branding: ClientBranding | null }>(
      `SELECT ca.config -> 'branding' AS branding
       FROM client_applications ca
       WHERE ca.client_id = $1
         AND ca.status IN ('active', 'trial')
         AND ca.config ? 'branding'
       ORDER BY ca.updated_at DESC
       LIMIT 1`,
      [clientId]
    );

    return result.rows[0]?.branding ?? null;
  }

  async saveForClient(clientId: string, branding: ClientBranding): Promise<void> {
    await this.database.query(
      `UPDATE client_applications
       SET config = jsonb_set(config, '{branding}', $2::jsonb, true),
           updated_at = now()
       WHERE client_id = $1
         AND status IN ('active', 'trial')`,
      [clientId, JSON.stringify(branding)]
    );
  }
}
