import { Injectable } from '@nestjs/common';
import { IdentityApplicationsCacheService } from '../../auth/identity-applications-cache.service';
import { MutateContext, PageQuery } from '../admin.types';
import { AdminAuditService } from '../shared/admin-audit.service';
import { CreateEntitlementDto, UpdateEntitlementDto } from './dto/entitlement.dto';
import { EntitlementsRepository } from './entitlements.repository';

@Injectable()
export class EntitlementsService {
  constructor(
    private readonly audit: AdminAuditService,
    private readonly identityApplications: IdentityApplicationsCacheService,
    private readonly repository: EntitlementsRepository
  ) {}

  list(clientId: string, query: PageQuery) {
    return this.repository.list(clientId, query);
  }

  async create(clientId: string, dto: CreateEntitlementDto, context: MutateContext) {
    const result = await this.repository.create(clientId, dto);
    await this.audit.record('admin_entitlement_created', context, {
      clientId,
      identityId: dto.identityId,
      applicationId: dto.applicationId
    });
    await this.identityApplications.invalidateIdentity(dto.identityId);
    return result;
  }

  async update(
    clientId: string,
    identityId: string,
    applicationId: string,
    dto: UpdateEntitlementDto,
    context: MutateContext
  ) {
    const result = await this.repository.update(clientId, identityId, applicationId, dto);
    await this.audit.record('admin_entitlement_updated', context, { clientId, identityId, applicationId });
    await this.identityApplications.invalidateIdentity(identityId);
    return result;
  }
}
