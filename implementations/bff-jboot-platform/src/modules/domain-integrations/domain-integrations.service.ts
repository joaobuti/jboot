import { Injectable } from '@nestjs/common';
import { MutateContext } from '../kanban/kanban.types';
import { DataJudMonitorCadence } from '../juridico/datajud/dto/datajud-monitor.dto';
import { DomainIntegrationRequestContext } from './domain-integration.types';
import { ExportToFlowResponseDto, FlowBoardsResponseDto } from './dto/domain-integration.dto';
import { DataJudToFlowExporter } from './exporters/datajud-to-flow.exporter';
import { PjeToFlowExporter } from './exporters/pje-to-flow.exporter';
import { FlowBoardsQuery } from './flow-boards.query';
import { CardMonitoringState, FlowCardMonitoringService } from './monitoring/flow-card-monitoring.service';
import { DjenCadenceDays } from '../process-monitoring/process-monitoring.types';
import { PetitionMonitoringExporter } from './monitoring/petition-monitoring.exporter';

@Injectable()
export class DomainIntegrationsService {
  constructor(
    private readonly boards: FlowBoardsQuery,
    private readonly pjeExporter: PjeToFlowExporter,
    private readonly dataJudExporter: DataJudToFlowExporter,
    private readonly monitoring: FlowCardMonitoringService,
    private readonly petitionMonitoring: PetitionMonitoringExporter
  ) {}

  listFlowBoards(context: DomainIntegrationRequestContext): Promise<FlowBoardsResponseDto> {
    return this.boards.execute(context);
  }

  exportPjeComunicacaoToFlow(
    context: DomainIntegrationRequestContext,
    communicationId: string,
    boardId: string,
    officeId: string,
    requestInfo: Pick<MutateContext, 'ip' | 'userAgent'>
  ): Promise<ExportToFlowResponseDto> {
    return this.pjeExporter.execute(context, communicationId, boardId, officeId, requestInfo);
  }

  exportDataJudProcessToFlow(
    context: DomainIntegrationRequestContext,
    snapshotId: string,
    boardId: string,
    officeId: string,
    requestInfo: Pick<MutateContext, 'ip' | 'userAgent'>
  ): Promise<ExportToFlowResponseDto> {
    return this.dataJudExporter.execute(context, snapshotId, boardId, officeId, requestInfo);
  }

  getCardMonitoring(context: DomainIntegrationRequestContext, cardId: string): Promise<CardMonitoringState> {
    return this.monitoring.get(context, cardId);
  }

  getCardProcessMovements(context: DomainIntegrationRequestContext, cardId: string) {
    return this.monitoring.movements(context, cardId);
  }

  lookupCardMovementPublications(context: DomainIntegrationRequestContext, cardId: string, movementId: string) {
    return this.monitoring.lookupPublications(context, cardId, movementId);
  }

  getCardPublications(context: DomainIntegrationRequestContext, cardId: string) {
    return this.monitoring.publications(context, cardId);
  }

  setCardDjen(context: DomainIntegrationRequestContext, cardId: string, enabled: boolean) {
    return this.monitoring.setDjen(context, cardId, enabled);
  }

  updateCardDjenCadence(context: DomainIntegrationRequestContext, cardId: string, days: DjenCadenceDays) {
    return this.monitoring.updateDjenCadence(context, cardId, days);
  }

  setCardMonitoring(
    context: DomainIntegrationRequestContext,
    cardId: string,
    monitor: boolean
  ): Promise<{ monitoring: boolean; monitorId: string | null }> {
    return this.monitoring.set(context, cardId, monitor);
  }

  updateCardMonitoringCadence(
    context: DomainIntegrationRequestContext,
    cardId: string,
    cadence: DataJudMonitorCadence
  ): Promise<{ monitoring: true; monitorId: string; cadence: DataJudMonitorCadence }> {
    return this.monitoring.updateCadence(context, cardId, cadence);
  }

  getPetitionMonitoringOptions(context: DomainIntegrationRequestContext, cardId: string) {
    return this.petitionMonitoring.options(context, cardId);
  }

  sendPetitionsToMonitoring(
    context: DomainIntegrationRequestContext,
    cardId: string,
    petitionIds: string[],
    targetBoardId: string,
    requestInfo: Pick<MutateContext, 'ip' | 'userAgent'>
  ) {
    return this.petitionMonitoring.send(context, cardId, petitionIds, targetBoardId, requestInfo);
  }
}
