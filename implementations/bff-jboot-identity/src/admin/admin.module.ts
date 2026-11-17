import { Module } from '@nestjs/common';
import { AccountAccessModule } from '../account-access/account-access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ApplicationDatabasesController } from './application-databases/application-databases.controller';
import { ApplicationDatabasesRepository } from './application-databases/application-databases.repository';
import { ApplicationDatabasesService } from './application-databases/application-databases.service';
import { ApplicationsController } from './applications/applications.controller';
import { ApplicationsRepository } from './applications/applications.repository';
import { ApplicationsService } from './applications/applications.service';
import { AuditEventsController } from './audit-events/audit-events.controller';
import { CapabilitiesController, ClientCapabilitiesController } from './capabilities/capabilities.controller';
import { CapabilitiesRepository } from './capabilities/capabilities.repository';
import { CapabilitiesService } from './capabilities/capabilities.service';
import { AuditEventsRepository } from './audit-events/audit-events.repository';
import { AuditEventsService } from './audit-events/audit-events.service';
import { ClientApplicationsController } from './client-applications/client-applications.controller';
import { ClientApplicationsRepository } from './client-applications/client-applications.repository';
import { ClientApplicationsService } from './client-applications/client-applications.service';
import { ClientAccessController } from './client-access/client-access.controller';
import { ClientAccessRepository } from './client-access/client-access.repository';
import { ClientAccessService } from './client-access/client-access.service';
import { ClientDatabasesController } from './client-databases/client-databases.controller';
import { ClientDatabasesRepository } from './client-databases/client-databases.repository';
import { ClientDatabasesService } from './client-databases/client-databases.service';
import { ClientOnboardingController } from './client-onboarding/client-onboarding.controller';
import { ClientOnboardingRepository } from './client-onboarding/client-onboarding.repository';
import { ClientOnboardingService } from './client-onboarding/client-onboarding.service';
import { ClientsController } from './clients/clients.controller';
import { ClientsRepository } from './clients/clients.repository';
import { ClientsService } from './clients/clients.service';
import { DatabasesController } from './databases/databases.controller';
import { DatabasesRepository } from './databases/databases.repository';
import { DatabasesService } from './databases/databases.service';
import { DatabaseRefsController } from './database-refs/database-refs.controller';
import { DatabaseRefsRepository } from './database-refs/database-refs.repository';
import { DatabaseRefsService } from './database-refs/database-refs.service';
import { EntitlementsController } from './entitlements/entitlements.controller';
import { EntitlementsRepository } from './entitlements/entitlements.repository';
import { EntitlementsService } from './entitlements/entitlements.service';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { IdentitiesController } from './identities/identities.controller';
import { IdentitiesRepository } from './identities/identities.repository';
import { IdentitiesService } from './identities/identities.service';
import { MembershipsController } from './memberships/memberships.controller';
import { MembershipsRepository } from './memberships/memberships.repository';
import { MembershipsService } from './memberships/memberships.service';
import { AdminAuditService } from './shared/admin-audit.service';

@Module({
  imports: [AuditModule, AuthModule, AccountAccessModule],
  controllers: [
    ClientAccessController,
    ClientDatabasesController,
    ApplicationDatabasesController,
    ApplicationsController,
    AuditEventsController,
    CapabilitiesController,
    ClientCapabilitiesController,
    ClientApplicationsController,
    ClientOnboardingController,
    ClientsController,
    DatabasesController,
    DatabaseRefsController,
    EntitlementsController,
    IdentitiesController,
    MembershipsController
  ],
  providers: [
    ClientAccessRepository,
    ClientAccessService,
    ClientDatabasesRepository,
    ClientDatabasesService,
    AdminAuditService,
    AdminAuthGuard,
    ApplicationDatabasesRepository,
    ApplicationDatabasesService,
    ApplicationsRepository,
    ApplicationsService,
    AuditEventsRepository,
    AuditEventsService,
    CapabilitiesRepository,
    CapabilitiesService,
    ClientApplicationsRepository,
    ClientApplicationsService,
    ClientOnboardingRepository,
    ClientOnboardingService,
    ClientsRepository,
    ClientsService,
    DatabasesRepository,
    DatabasesService,
    DatabaseRefsRepository,
    DatabaseRefsService,
    EntitlementsRepository,
    EntitlementsService,
    IdentitiesRepository,
    IdentitiesService,
    MembershipsRepository,
    MembershipsService
  ]
})
export class AdminModule {}
