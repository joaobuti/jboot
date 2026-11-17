import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

interface PortalRow {
  id: string;
  slug: string;
  name: string;
  authType: string;
  portalStatus: string;
  contracted: boolean;
  tenantStatus: string | null;
}

@Injectable()
export class PortaisRepository {
  constructor(private readonly database: DatabaseService) {}

  async listForClient(clientId: string, databaseRef: string): Promise<PortalRow[]> {
    const result = await this.database.queryForDatabaseRef<PortalRow>(
      databaseRef,
      `SELECT
         p.id,
         p.slug,
         p.name,
         p.auth_type      AS "authType",
         p.status         AS "portalStatus",
         (tp.id IS NOT NULL) AS contracted,
         tp.status        AS "tenantStatus"
       FROM juridico_portals p
       LEFT JOIN juridico_tenant_portals tp
         ON tp.portal_id = p.id
        AND tp.client_id = $1
       WHERE p.status = 'active'
       ORDER BY p.name`,
      [clientId],
    );
    return result.rows;
  }
}
