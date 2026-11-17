import { Injectable } from '@nestjs/common';
import { IdentityApplicationsCacheService } from '../../auth/identity-applications-cache.service';
import { MutateContext, PageQuery } from '../admin.types';
import { AdminAuditService } from '../shared/admin-audit.service';
import { ApplicationsRepository } from './applications.repository';
import { CreateApplicationDto, UpdateApplicationDto } from './dto/application.dto';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly audit: AdminAuditService,
    private readonly identityApplications: IdentityApplicationsCacheService,
    private readonly repository: ApplicationsRepository
  ) {}

  list(query: PageQuery) {
    return this.repository.list(query);
  }

  async create(dto: CreateApplicationDto, context: MutateContext) {
    const result = await this.repository.create(dto);
    await this.audit.record('admin_application_created', context, { applicationId: result.id });
    return result;
  }

  async update(id: string, dto: UpdateApplicationDto, context: MutateContext) {
    const result = await this.repository.update(id, dto);
    await this.audit.record('admin_application_updated', context, { applicationId: id });
    await this.identityApplications.invalidateApplication(id);
    return result;
  }
}
