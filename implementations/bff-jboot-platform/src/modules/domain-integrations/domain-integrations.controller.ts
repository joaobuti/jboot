import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  DomainIntegrationAuthGuard,
  DomainIntegrationRequest
} from './guards/domain-integration-auth.guard';
import { DomainIntegrationsService } from './domain-integrations.service';
import { ProcessImportRequestDto } from './dto/process-import.dto';
import { ProcessImportService } from './process-import/process-import.service';
import { FlowMonitoringUpdatesService } from './monitoring/flow-monitoring-updates.service';
import {
  ExportJuridicoDataJudToFlowDto,
  ExportJuridicoPjeToFlowDto,
  SendPetitionsToMonitoringDto,
  SetCardDjenCadenceDto,
  SetCardDjenDto,
  SetCardMonitoringCadenceDto,
  SetCardMonitoringDto
} from './dto/domain-integration.dto';

@ApiTags('domain-integrations')
@ApiBearerAuth()
@UseGuards(DomainIntegrationAuthGuard)
@Controller('domain-integrations')
export class DomainIntegrationsController {
  constructor(
    private readonly service: DomainIntegrationsService,
    private readonly processImports: ProcessImportService,
    private readonly monitoringUpdates: FlowMonitoringUpdatesService
  ) {}

  @Get('flow/boards')
  listFlowBoards(@Req() request: DomainIntegrationRequest) {
    return this.service.listFlowBoards(request.domainIntegrationContext);
  }

  @Post('juridico/pje/comunicacoes/:id/export-flow')
  exportPjeComunicacaoToFlow(
    @Req() request: DomainIntegrationRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExportJuridicoPjeToFlowDto
  ) {
    return this.service.exportPjeComunicacaoToFlow(request.domainIntegrationContext, id, body.boardId, body.officeId, {
      ip: request.ip,
      userAgent: request.headers['user-agent']
    });
  }

  @Post('juridico/datajud/processos/:snapshotId/export-flow')
  exportDataJudProcessToFlow(
    @Req() request: DomainIntegrationRequest,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
    @Body() body: ExportJuridicoDataJudToFlowDto
  ) {
    return this.service.exportDataJudProcessToFlow(request.domainIntegrationContext, snapshotId, body.boardId, body.officeId, {
      ip: request.ip,
      userAgent: request.headers['user-agent']
    });
  }

  /** Sino do Flow: processos atualizados hoje (DataJud e DJEN), so cards visiveis (flow-offices-sprints.md, S6). */
  @Get('flow/monitoramento/hoje')
  monitoringUpdatesToday(@Req() request: DomainIntegrationRequest) {
    return this.monitoringUpdates.today(request.domainIntegrationContext);
  }

  @Get('flow/cards/:cardId/monitoramento')
  getCardMonitoring(@Req() request: DomainIntegrationRequest, @Param('cardId', ParseUUIDPipe) cardId: string) {
    return this.service.getCardMonitoring(request.domainIntegrationContext, cardId);
  }

  /** "Ver no DJEN" de uma movimentacao do card (Sprint 9): busca em volta da data e grava como historico. */
  @Post('flow/cards/:cardId/monitoramento/movimentacoes/:movementId/djen')
  lookupCardMovementPublications(
    @Req() request: DomainIntegrationRequest,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('movementId', ParseUUIDPipe) movementId: string
  ) {
    return this.service.lookupCardMovementPublications(request.domainIntegrationContext, cardId, movementId);
  }

  /** Publicacoes do DJEN do card (ADR 022), somente leitura. */
  @Get('flow/cards/:cardId/monitoramento/publicacoes')
  getCardPublications(@Req() request: DomainIntegrationRequest, @Param('cardId', ParseUUIDPipe) cardId: string) {
    return this.service.getCardPublications(request.domainIntegrationContext, cardId);
  }

  /** Olho do DJEN do card (ADR 022). */
  @Post('flow/cards/:cardId/monitoramento/djen')
  setCardDjen(@Req() request: DomainIntegrationRequest, @Param('cardId', ParseUUIDPipe) cardId: string, @Body() body: SetCardDjenDto) {
    return this.service.setCardDjen(request.domainIntegrationContext, cardId, body.enabled);
  }

  @Patch('flow/cards/:cardId/monitoramento/djen/cadencia')
  updateCardDjenCadence(
    @Req() request: DomainIntegrationRequest,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() body: SetCardDjenCadenceDto
  ) {
    return this.service.updateCardDjenCadence(request.domainIntegrationContext, cardId, body.days);
  }

  /** Movimentacoes do processo do card (Sprint 5 de process-monitoring-sprints.md), somente leitura. */
  @Get('flow/cards/:cardId/monitoramento/movimentacoes')
  getCardProcessMovements(@Req() request: DomainIntegrationRequest, @Param('cardId', ParseUUIDPipe) cardId: string) {
    return this.service.getCardProcessMovements(request.domainIntegrationContext, cardId);
  }

  @Post('flow/cards/:cardId/monitoramento')
  setCardMonitoring(
    @Req() request: DomainIntegrationRequest,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() body: SetCardMonitoringDto
  ) {
    return this.service.setCardMonitoring(request.domainIntegrationContext, cardId, body.monitor);
  }

  @Patch('flow/cards/:cardId/monitoramento/cadencia')
  updateCardMonitoringCadence(
    @Req() request: DomainIntegrationRequest,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() body: SetCardMonitoringCadenceDto
  ) {
    return this.service.updateCardMonitoringCadence(request.domainIntegrationContext, cardId, body.cadence);
  }

  /** Acao Monitorar: peticoes aprovadas com CNJ ainda nao enviadas e boards de destino. */
  @Get('flow/cards/:cardId/peticoes/monitoramento')
  getPetitionMonitoringOptions(@Req() request: DomainIntegrationRequest, @Param('cardId', ParseUUIDPipe) cardId: string) {
    return this.service.getPetitionMonitoringOptions(request.domainIntegrationContext, cardId);
  }

  /** Cada peticao vira card na coluna padrao do board escolhido, com acompanhamento DataJud diario. */
  @Post('flow/cards/:cardId/peticoes/monitoramento')
  @HttpCode(200)
  sendPetitionsToMonitoring(
    @Req() request: DomainIntegrationRequest,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() body: SendPetitionsToMonitoringDto
  ) {
    return this.service.sendPetitionsToMonitoring(request.domainIntegrationContext, cardId, body.petitionIds, body.targetBoardId, {
      ip: request.ip,
      userAgent: request.headers['user-agent']
    });
  }

  /** Importacao de processos por planilha (docs/product/flow-process-import-sprints.md): boards e escritorios. */
  @Get('flow/process-imports/options')
  getProcessImportOptions(@Req() request: DomainIntegrationRequest) {
    return this.processImports.options(request.domainIntegrationContext);
  }

  /** Conferencia linha a linha, sem gravar. */
  @Post('flow/process-imports/preview')
  @HttpCode(200)
  previewProcessImport(@Req() request: DomainIntegrationRequest, @Body() body: ProcessImportRequestDto) {
    return this.processImports.preview(request.domainIntegrationContext, body.boardId, body.officeId, body.rows);
  }

  /** Grava o lote com as linhas prontas (revalidadas aqui) e enfileira o processamento. */
  @Post('flow/process-imports')
  createProcessImport(@Req() request: DomainIntegrationRequest, @Body() body: ProcessImportRequestDto) {
    return this.processImports.create(request.domainIntegrationContext, body.boardId, body.officeId, body.rows, {
      ip: request.ip,
      userAgent: request.headers['user-agent']
    });
  }

  @Get('flow/process-imports/:importId')
  getProcessImport(@Req() request: DomainIntegrationRequest, @Param('importId', ParseUUIDPipe) importId: string) {
    return this.processImports.status(request.domainIntegrationContext, importId);
  }

  /** Reenfileira lote nao concluido (Valkey fora no envio, falha do job ou linhas que falharam). */
  @Post('flow/process-imports/:importId/resume')
  @HttpCode(200)
  resumeProcessImport(@Req() request: DomainIntegrationRequest, @Param('importId', ParseUUIDPipe) importId: string) {
    return this.processImports.resume(request.domainIntegrationContext, importId);
  }
}
