import { Injectable } from '@nestjs/common';
import { MutateContext, PageQuery } from '../admin.types';
import { AdminAuditService } from '../shared/admin-audit.service';
import { ApplicationDatabasesRepository } from './application-databases.repository';
import { CreateApplicationDatabaseDto, UpdateApplicationDatabaseDto } from './dto/application-database.dto';

@Injectable()
export class ApplicationDatabasesService {
  constructor(
    private readonly audit: AdminAuditService,
    private readonly repository: ApplicationDatabasesRepository
  ) {}

  list(applicationId: string, query: PageQuery) {
    return this.repository.list(applicationId, query);
  }

  async create(applicationId: string, dto: CreateApplicationDatabaseDto, context: MutateContext) {
    const result = await this.repository.create(applicationId, dto);
    await this.audit.record('admin_application_database_created', context, {
      applicationId,
      applicationDatabaseId: result.id
    });
    return result;
  }

  async update(id: string, dto: UpdateApplicationDatabaseDto, context: MutateContext) {
    const result = await this.repository.update(id, dto);
    await this.audit.record('admin_application_database_updated', context, { applicationDatabaseId: id });
    return result;
  }
}
