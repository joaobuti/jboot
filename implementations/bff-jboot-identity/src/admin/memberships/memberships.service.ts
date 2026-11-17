import { Injectable } from '@nestjs/common';
import { MutateContext, PageQuery } from '../admin.types';
import { AdminAuditService } from '../shared/admin-audit.service';
import { CreateMembershipDto, UpdateMembershipDto } from './dto/membership.dto';
import { MembershipsRepository } from './memberships.repository';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly audit: AdminAuditService,
    private readonly repository: MembershipsRepository
  ) {}

  list(clientId: string, query: PageQuery) {
    return this.repository.list(clientId, query);
  }

  async create(clientId: string, dto: CreateMembershipDto, context: MutateContext) {
    const result = await this.repository.create(clientId, dto);
    await this.audit.record('admin_membership_created', context, {
      clientId,
      identityId: dto.identityId
    });
    return result;
  }

  async update(clientId: string, identityId: string, dto: UpdateMembershipDto, context: MutateContext) {
    const result = await this.repository.update(clientId, identityId, dto);
    await this.audit.record('admin_membership_updated', context, { clientId, identityId });
    return result;
  }
}
