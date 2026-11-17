import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { FiscalModule } from './modules/fiscal/fiscal.module';
import { HealthModule } from './health/health.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { AdminModule } from './modules/pdv/admin/admin.module';
import { EstablishmentCustomersModule } from './modules/establishment-customers/establishment-customers.module';
import { ComandaModule } from './modules/comanda/comanda.module';
import { DomainIntegrationsModule } from './modules/domain-integrations/domain-integrations.module';
import { JuridicoModule } from './modules/juridico/juridico.module';
import { ProcessMonitoringModule } from './modules/process-monitoring/process-monitoring.module';
import { KanbanModule } from './modules/kanban/kanban.module';
import { PlatformNotificationsModule } from './modules/notifications/platform-notifications.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    FiscalModule,
    CatalogModule,
    AdminModule,
    EstablishmentCustomersModule,
    ComandaModule,
    JuridicoModule,
    ProcessMonitoringModule,
    DomainIntegrationsModule,
    PlatformNotificationsModule,
    KanbanModule
  ]
})
export class AppModule {}
