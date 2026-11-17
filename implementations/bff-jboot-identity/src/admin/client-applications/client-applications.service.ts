import { Injectable } from '@nestjs/common';
import { IdentityApplicationsCacheService } from '../../auth/identity-applications-cache.service';
import { MutateContext, PageQuery } from '../admin.types';
import { ClientAccessService } from '../client-access/client-access.service';
import { AdminAuditService } from '../shared/admin-audit.service';
import { ClientApplicationsRepository } from './client-applications.repository';
import { CreateClientApplicationDto, UpdateClientApplicationDto } from './dto/client-application.dto';

@Injectable()
export class ClientApplicationsService {
  constructor(
    private readonly audit: AdminAuditService,
    private readonly identityApplications: IdentityApplicationsCacheService,
    private readonly repository: ClientApplicationsRepository,
    private readonly access: ClientAccessService
  ) {}

  list(clientId: string, query: PageQuery) {
    return this.repository.list(clientId, query);
  }

  async create(clientId: string, dto: CreateClientApplicationDto, context: MutateContext) {
    const result = await this.repository.create(clientId, dto);
    await this.audit.record('admin_client_application_created', context, {
      clientId,
      applicationId: dto.applicationId
    });
    // Modulo contratado depois do cadastro: admin do cliente recebe o pacote de admin e o banco.
    if (!dto.status || ['active', 'trial'].includes(dto.status)) {
      await this.access.ensureAdminAccess(clientId, context, dto.applicationId);
    }
    await this.identityApplications.invalidateClient(clientId);
    return result;
  }

  async update(
    clientId: string,
    applicationId: string,
    dto: UpdateClientApplicationDto,
    context: MutateContext
  ) {
    const result = await this.repository.update(clientId, applicationId, dto);
    await this.audit.record('admin_client_application_updated', context, { clientId, applicationId });
    if (dto.status && ['active', 'trial'].includes(dto.status)) {
      await this.access.ensureAdminAccess(clientId, context, applicationId);
    }
    await this.identityApplications.invalidateClient(clientId);
    return result;
  }
}
