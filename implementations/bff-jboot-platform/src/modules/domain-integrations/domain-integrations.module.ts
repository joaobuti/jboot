import { Module } from '@nestjs/common';
import { JuridicoModule } from '../juridico/juridico.module';
import { KanbanModule } from '../kanban/kanban.module';
import { DomainIntegrationsController } from './domain-integrations.controller';
import { DomainIntegrationsRepository } from './domain-integrations.repository';
import { DomainIntegrationsService } from './domain-integrations.service';
import { DomainIntegrationAuthGuard } from './guards/domain-integration-auth.guard';
import { DomainApplicationContextService } from './application-context.service';
import { DataJudToFlowExporter } from './exporters/datajud-to-flow.exporter';
import { PjeToFlowExporter } from './exporters/pje-to-flow.exporter';
import { FlowBoardsQuery } from './flow-boards.query';
import { FlowCardMonitoringService } from './monitoring/flow-card-monitoring.service';
import { FlowMonitoringUpdatesService } from './monitoring/flow-monitoring-updates.service';
import { PetitionMonitoringExporter } from './monitoring/petition-monitoring.exporter';
import { ProcessImportQueueService } from './process-import/process-import-queue.service';
import { ProcessImportService } from './process-import/process-import.service';
import { ProcessImportWorker } from './process-import/process-import.worker';
import { FlowProcessMovementDelivery } from './process-change/flow-process-movement.delivery';
import { ProcessMonitoringModule } from '../process-monitoring/process-monitoring.module';

@Module({
  imports: [JuridicoModule, KanbanModule, ProcessMonitoringModule],
  controllers: [DomainIntegrationsController],
  providers: [
    DomainIntegrationAuthGuard,
    DomainIntegrationsRepository,
    DomainApplicationContextService,
    FlowBoardsQuery,
    PjeToFlowExporter,
    DataJudToFlowExporter,
    FlowCardMonitoringService,
    FlowMonitoringUpdatesService,
    PetitionMonitoringExporter,
    ProcessImportQueueService,
    ProcessImportService,
    ProcessImportWorker,
    FlowProcessMovementDelivery,
    DomainIntegrationsService
  ],
})
export class DomainIntegrationsModule {}
