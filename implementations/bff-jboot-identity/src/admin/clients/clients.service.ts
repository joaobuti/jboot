import { Injectable } from '@nestjs/common';
import { MutateContext, PageQuery } from '../admin.types';
import { AdminAuditService } from '../shared/admin-audit.service';
import { ClientsRepository } from './clients.repository';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly audit: AdminAuditService,
    private readonly repository: ClientsRepository
  ) {}

  list(query: PageQuery) {
    return this.repository.list(query);
  }

  async create(dto: CreateClientDto, context: MutateContext) {
    const result = await this.repository.create(dto);
    await this.audit.record('admin_client_created', context, { clientId: result.id });
    return result;
  }

  async update(id: string, dto: UpdateClientDto, context: MutateContext) {
    const result = await this.repository.update(id, dto);
    await this.audit.record('admin_client_updated', context, { clientId: id });
    return result;
  }
}
