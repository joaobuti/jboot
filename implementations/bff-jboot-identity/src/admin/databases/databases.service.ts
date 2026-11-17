import { Injectable } from '@nestjs/common';
import { MutateContext, PageQuery } from '../admin.types';
import { AdminAuditService } from '../shared/admin-audit.service';
import { DatabasesRepository } from './databases.repository';
import { CreateDatabaseDto, UpdateDatabaseDto } from './dto/database.dto';

@Injectable()
export class DatabasesService {
  constructor(
    private readonly audit: AdminAuditService,
    private readonly repository: DatabasesRepository
  ) {}

  list(query: PageQuery) {
    return this.repository.list(query);
  }

  async create(dto: CreateDatabaseDto, context: MutateContext) {
    const result = await this.repository.create(dto);
    await this.audit.record('admin_database_created', context, { databaseId: result.id });
    return result;
  }

  async update(id: string, dto: UpdateDatabaseDto, context: MutateContext) {
    const result = await this.repository.update(id, dto);
    await this.audit.record('admin_database_updated', context, { databaseId: id });
    return result;
  }
}
