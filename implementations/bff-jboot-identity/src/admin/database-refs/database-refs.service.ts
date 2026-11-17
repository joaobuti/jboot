import { Injectable } from '@nestjs/common';
import { MutateContext, PageQuery } from '../admin.types';
import { AdminAuditService } from '../shared/admin-audit.service';
import { DatabaseRefsRepository } from './database-refs.repository';
import { CreateDatabaseRefDto, UpdateDatabaseRefDto } from './dto/database-ref.dto';

@Injectable()
export class DatabaseRefsService {
  constructor(
    private readonly audit: AdminAuditService,
    private readonly repository: DatabaseRefsRepository
  ) {}

  list(query: PageQuery) {
    return this.repository.list(query);
  }

  async create(dto: CreateDatabaseRefDto, context: MutateContext) {
    const result = await this.repository.create(dto);
    await this.audit.record('admin_database_ref_created', context, {
      clientId: dto.clientId,
      applicationId: dto.applicationId,
      databaseRefId: result.id
    });
    return result;
  }

  async update(id: string, dto: UpdateDatabaseRefDto, context: MutateContext) {
    const result = await this.repository.update(id, dto);
    await this.audit.record('admin_database_ref_updated', context, { databaseRefId: id });
    return result;
  }
}
