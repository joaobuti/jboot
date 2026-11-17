import { Module } from '@nestjs/common';
import { DataJudMonitorCryptoService } from '../shared/crypto/datajud-monitor-crypto.service';
import { DataJudClientService } from '../shared/juridico-data/datajud-client.service';
import { JuridicoWorkerAuthGuard } from '../shared/worker-auth/juridico-worker-auth.guard';
import { ProcessMonitoringCapabilityService } from './process-monitoring-capability.service';
import { ProcessMonitoringDeliveryRegistry } from './process-monitoring-delivery.registry';
import { ProcessMonitoringInternalController } from './process-monitoring-internal.controller';
import { ProcessMonitoringRepository } from './process-monitoring.repository';
import { ProcessMonitoringService } from './process-monitoring.service';
import { ProcessMonitoringWorkflowClient } from './process-monitoring-workflow.client';

/**
 * Capacidade `monitoramento-processual` (ADR 021). Nao importa `juridico`, `kanban` nem
 * `domain-integrations`: os produtos usam `ProcessMonitoringService` e registram o adaptador de
 * destino em `ProcessMonitoringDeliveryRegistry`.
 */
@Module({
  controllers: [ProcessMonitoringInternalController],
  providers: [
    ProcessMonitoringRepository,
    ProcessMonitoringCapabilityService,
    ProcessMonitoringDeliveryRegistry,
    ProcessMonitoringWorkflowClient,
    ProcessMonitoringService,
    DataJudMonitorCryptoService,
    DataJudClientService,
    JuridicoWorkerAuthGuard
  ],
  exports: [ProcessMonitoringService, ProcessMonitoringDeliveryRegistry, ProcessMonitoringCapabilityService]
})
export class ProcessMonitoringModule {}
