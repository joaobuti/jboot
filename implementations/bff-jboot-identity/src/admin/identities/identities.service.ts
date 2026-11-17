import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { MutateContext, PageQuery } from '../admin.types';
import { AdminAuditService } from '../shared/admin-audit.service';
import { CreateIdentityDto, UpdateIdentityDto } from './dto/identity.dto';
import { IdentitiesRepository } from './identities.repository';

@Injectable()
export class IdentitiesService {
  constructor(
    private readonly audit: AdminAuditService,
    private readonly repository: IdentitiesRepository
  ) {}

  list(query: PageQuery) {
    return this.repository.list(query);
  }

  async create(dto: CreateIdentityDto, context: MutateContext) {
    const result = await this.repository.create(dto);
    if (dto.password) {
      await this.repository.upsertPassword(result.id, await bcrypt.hash(dto.password, 12));
    }
    await this.audit.record('admin_identity_created', context, { identityId: result.id });
    return result;
  }

  async update(id: string, dto: UpdateIdentityDto, context: MutateContext) {
    const result = await this.repository.update(id, dto);
    await this.audit.record('admin_identity_updated', context, { identityId: id });
    return result;
  }
}
