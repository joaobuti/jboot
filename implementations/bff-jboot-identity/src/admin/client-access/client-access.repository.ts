import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AdminBundle, loadAdminBundle } from '../shared/admin-bundle';

/** Admins do cliente e concessao do pacote de admin por modulo (migration 133). */
@Injectable()
export class ClientAccessRepository {
  constructor(private readonly database: DatabaseService) {}

  bundle(applicationId: string): Promise<AdminBundle> {
    return loadAdminBundle(this.database, applicationId);
  }

  /** Admin do cliente = vinculo ativo com o papel `client_admin` (o admin criado no cadastro). */
  async clientAdmins(clientId: string): Promise<string[]> {
    const result = await this.database.query<{ identity_id: string }>(
      `SELECT m.identity_id
       FROM memberships m
       JOIN identities i ON i.id = m.identity_id AND i.status IN ('active', 'pending')
       WHERE m.client_id = $1 AND m.status = 'active' AND 'client_admin' = ANY(m.roles)`,
      [clientId]
    );
    return result.rows.map((row) => row.identity_id);
  }

  async contractedApplications(clientId: string): Promise<string[]> {
    const result = await this.database.query<{ application_id: string }>(
      `SELECT application_id FROM client_applications WHERE client_id = $1 AND status IN ('active', 'trial')`,
      [clientId]
    );
    return result.rows.map((row) => row.application_id);
  }

  /** Cria ou completa o acesso (uniao; nunca remove o que o admin ja tem) e reativa se suspenso. */
  async grant(identityId: string, clientId: string, applicationId: string, bundle: AdminBundle): Promise<void> {
    await this.database.query(
      `INSERT INTO entitlements (identity_id, client_id, application_id, scopes, roles, status)
       VALUES ($1, $2, $3, $4::text[], $5::text[], 'active')
       ON CONFLICT (identity_id, client_id, application_id) DO UPDATE
       SET scopes = ARRAY(SELECT DISTINCT unnest(entitlements.scopes || EXCLUDED.scopes) ORDER BY 1),
           roles = ARRAY(SELECT DISTINCT unnest(entitlements.roles || EXCLUDED.roles) ORDER BY 1),
           status = 'active'`,
      [identityId, clientId, applicationId, bundle.scopes, bundle.roles]
    );
  }

  async bumpPermissionsVersion(identityId: string): Promise<void> {
    await this.database.query(
      `INSERT INTO identity_permission_versions (identity_id, version) VALUES ($1, 2)
       ON CONFLICT (identity_id) DO UPDATE SET version = identity_permission_versions.version + 1, updated_at = now()`,
      [identityId]
    );
  }
}
