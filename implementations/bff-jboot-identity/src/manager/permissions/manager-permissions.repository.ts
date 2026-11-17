import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ensureOne } from '../../admin/shared/repository-result';

export interface PermissionCatalogRow {
  type: 'scope' | 'role';
  key: string;
  label: string;
}

@Injectable()
export class ManagerPermissionsRepository {
  constructor(private readonly database: DatabaseService) {}

  listCatalog(applicationId: string) {
    return this.database.query<PermissionCatalogRow>(
      `SELECT permission_type AS type, permission_key AS key, label
       FROM application_permission_catalog
       WHERE application_id = $1 AND status = 'active'
       ORDER BY permission_type, label, permission_key`,
      [applicationId]
    );
  }

  async replace(
    identityId: string,
    clientId: string,
    applicationId: string,
    scopes: string[],
    roles: string[],
    managedScopes: string[],
    managedRoles: string[]
  ) {
    return ensureOne(await this.database.query(
      `UPDATE entitlements
       SET scopes = ARRAY(
             SELECT value FROM (
               SELECT value FROM unnest(scopes) AS value WHERE NOT (value = ANY($6::text[]))
               UNION
               SELECT value FROM unnest($4::text[]) AS value
             ) managed_scope_values
             ORDER BY value
           ),
           roles = ARRAY(
             SELECT value FROM (
               SELECT value FROM unnest(roles) AS value WHERE NOT (value = ANY($7::text[]))
               UNION
               SELECT value FROM unnest($5::text[]) AS value
             ) managed_role_values
             ORDER BY value
           )
       WHERE identity_id = $1 AND client_id = $2 AND application_id = $3
       RETURNING identity_id AS "identityId", scopes, roles, status`,
      [identityId, clientId, applicationId, scopes, roles, managedScopes, managedRoles]
    ));
  }
}
