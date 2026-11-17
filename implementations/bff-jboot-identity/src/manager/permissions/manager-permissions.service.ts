import { ForbiddenException, Injectable } from '@nestjs/common';
import { IdentityApplicationsCacheService } from '../../auth/identity-applications-cache.service';
import { AuditService } from '../../audit/audit.service';
import { ManagerActor } from '../manager.types';
import { ReplaceModulePermissionsDto } from './dto/replace-module-permissions.dto';
import { ManagerPermissionsRepository } from './manager-permissions.repository';

@Injectable()
export class ManagerPermissionsService {
  constructor(
    private readonly repository: ManagerPermissionsRepository,
    private readonly identityApplications: IdentityApplicationsCacheService,
    private readonly audit: AuditService
  ) {}

  async catalog(actor: ManagerActor) {
    const rows = (await this.repository.listCatalog(actor.applicationId)).rows;
    return {
      scopes: rows.filter(row => row.type === 'scope').map(({ key, label }) => ({ key, label })),
      roles: rows.filter(row => row.type === 'role').map(({ key, label }) => ({ key, label }))
    };
  }

  async replace(actor: ManagerActor, identityId: string, dto: ReplaceModulePermissionsDto) {
    const rows = (await this.repository.listCatalog(actor.applicationId)).rows;
    const allowedScopes = new Set(rows.filter(row => row.type === 'scope').map(row => row.key));
    const allowedRoles = new Set(rows.filter(row => row.type === 'role').map(row => row.key));
    if (dto.scopes.some(scope => !allowedScopes.has(scope)) || dto.roles.some(role => !allowedRoles.has(role))) {
      throw new ForbiddenException({ code: 'module_permission_not_allowed', message: 'Permission is not allowed for this module' });
    }
    const result = await this.repository.replace(
      identityId,
      actor.clientId,
      actor.applicationId,
      dto.scopes,
      dto.roles,
      [...allowedScopes],
      [...allowedRoles]
    );
    await this.identityApplications.invalidateIdentity(identityId);
    await this.audit.record({
      eventType: 'manager_module_permissions_replaced',
      identityId: actor.identityId,
      clientId: actor.clientId,
      applicationId: actor.applicationId,
      metadata: { targetIdentityId: identityId, scopes: dto.scopes, roles: dto.roles }
    });
    return result;
  }
}
