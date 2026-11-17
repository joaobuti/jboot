import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { CustomerValidationService } from './customer-validation.service';
import {
  PutCustomerValidationSettingsDto,
  PutIntakeBoardDto,
  PutKitReviewDto,
  PutOfficeValidationSettingsDto,
  PutValidationDocumentPolicyDto,
  RequestCustomerValidationDto
} from './dto/customer-validation.dto';

/** Permissao de confirmar o parecer da IA (ADR 018). */
export const VALIDATION_APPROVE_SCOPE = 'flow:validation:approve';

/** Validacao da ficha por agente Claude com confirmacao humana (ADR 017, S2; por escritorio na ADR 018). */
@ApiTags('kanban-flow-customer-validation')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban')
export class CustomerValidationController {
  constructor(private readonly service: CustomerValidationService) {}

  @Get('customers/:customerId/validation')
  @RequireScopes('flow:customers:read', 'flow:admin')
  status(@Param('customerId', ParseUUIDPipe) customerId: string, @Req() request: KanbanRequest) {
    return this.service.status(request.kanbanContext, customerId, buildMutateContext(request));
  }

  @Post('customers/:customerId/validation')
  @RequireScopes('flow:customers:write', 'flow:admin')
  request(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: RequestCustomerValidationDto,
    @Req() request: KanbanRequest
  ) {
    return this.service.request(request.kanbanContext, customerId, buildMutateContext(request), dto?.officeId);
  }

  @Post('customers/:customerId/validation/runs/:runId/confirm')
  @RequireScopes(VALIDATION_APPROVE_SCOPE)
  confirm(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Req() request: KanbanRequest
  ) {
    return this.service.confirm(request.kanbanContext, customerId, runId, buildMutateContext(request));
  }

  @Get('settings/customer-validation')
  @RequireScopes('flow:admin', 'ai:agents:read', 'ai:agents:manage')
  getSettings(@Req() request: KanbanRequest) {
    return this.service.getSettings(request.kanbanContext);
  }

  @Put('settings/customer-validation')
  @RequireScopes('flow:admin', 'ai:agents:manage')
  putSettings(@Body() dto: PutCustomerValidationSettingsDto, @Req() request: KanbanRequest) {
    return this.service.putSettings(request.kanbanContext, dto.agentId, buildMutateContext(request));
  }

  @Put('settings/customer-validation/offices/:officeId')
  @RequireScopes('flow:admin', 'ai:agents:manage')
  putOfficeSettings(
    @Param('officeId', ParseUUIDPipe) officeId: string,
    @Body() dto: PutOfficeValidationSettingsDto,
    @Req() request: KanbanRequest
  ) {
    return this.service.putOfficeSettings(request.kanbanContext, officeId, dto.agentId, buildMutateContext(request));
  }

  /** Revisao humana dos valores do kit (ADR 019): mesma permissao de confirmar o parecer. */
  @Put('customers/:customerId/validation/runs/:runId/kit-review')
  @RequireScopes(VALIDATION_APPROVE_SCOPE)
  putKitReview(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body() dto: PutKitReviewDto,
    @Req() request: KanbanRequest
  ) {
    return this.service.saveKitReview(request.kanbanContext, customerId, runId, dto, buildMutateContext(request));
  }

  /** Documentos que a rotina de validacao pode ler (ADR 019, decisao 3). */
  @Put('settings/customer-validation/documents')
  @RequireScopes('flow:admin')
  putDocumentPolicy(@Body() dto: PutValidationDocumentPolicyDto, @Req() request: KanbanRequest) {
    return this.service.putReadablePolicy(request.kanbanContext, dto.documentTypes, buildMutateContext(request));
  }

  /** Board de entrada do escritorio para o card do cliente confirmado (ADR 019, decisao 16). */
  @Put('settings/customer-validation/offices/:officeId/intake-board')
  @RequireScopes('flow:admin')
  putIntakeBoard(
    @Param('officeId', ParseUUIDPipe) officeId: string,
    @Body() dto: PutIntakeBoardDto,
    @Req() request: KanbanRequest
  ) {
    return this.service.putOfficeIntakeBoard(request.kanbanContext, officeId, dto.boardId, buildMutateContext(request));
  }
}
