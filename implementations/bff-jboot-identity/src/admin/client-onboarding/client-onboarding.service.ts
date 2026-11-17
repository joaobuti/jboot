import { Injectable } from '@nestjs/common';
import { AccountAccessService } from '../../account-access/account-access.service';
import { MutateContext } from '../admin.types';
import { AdminAuditService } from '../shared/admin-audit.service';
import { ClientOnboardingRepository } from './client-onboarding.repository';
import { CreateClientOnboardingDto } from './dto/client-onboarding.dto';

@Injectable()
export class ClientOnboardingService {
  constructor(
    private readonly audit: AdminAuditService,
    private readonly repository: ClientOnboardingRepository,
    private readonly access: AccountAccessService
  ) {}

  async create(dto: CreateClientOnboardingDto, context: MutateContext) {
    const result = await this.repository.create(dto);
    await this.audit.record('admin_client_onboarding_created', context, {
      clientId: result.client.id,
      applicationId: result.applicationContract.applicationId,
      applicationIds: result.applicationContracts.map(application => application.applicationId),
      identityId: result.adminIdentity.id,
      databaseRefId: result.databaseRef?.id
    });
    // Depois do cadastro gravado: falha no envio nao desfaz o cliente; a tela avisa e oferece reenviar.
    const invite = await this.access.sendInvite(result.adminIdentity.id, context.actor.identityId, context.ip);
    return { ...result, invite };
  }
}
