import { Injectable } from '@nestjs/common';
import { IdentityApplicationsCacheService } from '../../auth/identity-applications-cache.service';
import { MutateContext } from '../admin.types';
import { ClientDatabasesService } from '../client-databases/client-databases.service';
import { AdminAuditService } from '../shared/admin-audit.service';
import { ClientAccessRepository } from './client-access.repository';

export interface ClientAccessResult {
  applications: number;
  admins: number;
  /** Modulos cujo banco nao pode ser criado pela regra (ex.: isolamento nao implementado). */
  databasesPending: string[];
}

/**
 * Acesso do admin do cliente a cada modulo contratado: pacote de admin do catalogo e registro de
 * banco pela regra do app. Chamado no cadastro de modulo novo/reativado e pelo
 * "Reaplicar permissoes de admin" (docs/product/tenant-isolation-sprints.md, Sprint 0.1).
 */
@Injectable()
export class ClientAccessService {
  constructor(
    private readonly repository: ClientAccessRepository,
    private readonly databases: ClientDatabasesService,
    private readonly audit: AdminAuditService,
    private readonly identityApplications: IdentityApplicationsCacheService
  ) {}

  /** Um modulo (contratacao/reativacao) ou todos os contratados (`applicationId` ausente). */
  async ensureAdminAccess(clientId: string, context: MutateContext, applicationId?: string): Promise<ClientAccessResult> {
    const applications = applicationId ? [applicationId] : await this.repository.contractedApplications(clientId);
    const admins = await this.repository.clientAdmins(clientId);
    const databasesPending: string[] = [];
    for (const app of applications) {
      const bundle = await this.repository.bundle(app);
      for (const identityId of admins) await this.repository.grant(identityId, clientId, app, bundle);
      const view = (await this.databases.listForClient(clientId)).find((row) => row.applicationId === app);
      if (view && !view.current) {
        if (view.canApply) await this.databases.applyForClient(clientId, app, context);
        else databasesPending.push(view.applicationName);
      }
    }
    for (const identityId of admins) await this.repository.bumpPermissionsVersion(identityId);
    await this.identityApplications.invalidateClient(clientId);
    await this.audit.record('admin_client_admin_access_granted', context, { clientId, applications, admins, databasesPending });
    return { applications: applications.length, admins: admins.length, databasesPending };
  }
}
