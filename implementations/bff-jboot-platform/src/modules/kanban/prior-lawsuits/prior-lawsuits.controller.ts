import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { AddPriorLawsuitDto, PriorLawsuitsDto } from './dto/prior-lawsuits.dto';
import { PriorLawsuitsService } from './prior-lawsuits.service';

/**
 * Acoes ja ajuizadas na ficha do cliente (ADR 020; S2 de docs/product/flow-initial-petitions-sprints.md).
 * Contrato HTTP: docs/api/flow-initial-petitions-openapi.yaml.
 */
@ApiTags('kanban-flow-customer-prior-lawsuits')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/customers/:customerId/prior-lawsuits')
export class PriorLawsuitsController {
  constructor(private readonly service: PriorLawsuitsService) {}

  @Get()
  @RequireScopes('flow:customers:read', 'flow:admin')
  @ApiOkResponse({ type: PriorLawsuitsDto })
  get(@Param('customerId', ParseUUIDPipe) customerId: string, @Req() request: KanbanRequest): Promise<PriorLawsuitsDto> {
    return this.service.get(request.kanbanContext, customerId, buildMutateContext(request));
  }

  @Post()
  @RequireScopes('flow:customers:write', 'flow:admin')
  @ApiOkResponse({ type: PriorLawsuitsDto })
  add(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: AddPriorLawsuitDto,
    @Req() request: KanbanRequest
  ): Promise<PriorLawsuitsDto> {
    return this.service.add(request.kanbanContext, customerId, dto, buildMutateContext(request));
  }

  @Post('declaration')
  @HttpCode(200)
  @RequireScopes('flow:customers:write', 'flow:admin')
  @ApiOkResponse({ type: PriorLawsuitsDto })
  declareNone(@Param('customerId', ParseUUIDPipe) customerId: string, @Req() request: KanbanRequest): Promise<PriorLawsuitsDto> {
    return this.service.declareNone(request.kanbanContext, customerId, buildMutateContext(request));
  }

  @Delete('declaration')
  @RequireScopes('flow:customers:write', 'flow:admin')
  @ApiOkResponse({ type: PriorLawsuitsDto })
  withdraw(@Param('customerId', ParseUUIDPipe) customerId: string, @Req() request: KanbanRequest): Promise<PriorLawsuitsDto> {
    return this.service.withdraw(request.kanbanContext, customerId, buildMutateContext(request));
  }

  // Depois das rotas de `declaration`: `:lawsuitId` capturaria o segmento literal.
  @Delete(':lawsuitId')
  @RequireScopes('flow:customers:write', 'flow:admin')
  @ApiOkResponse({ type: PriorLawsuitsDto })
  remove(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('lawsuitId', ParseUUIDPipe) lawsuitId: string,
    @Req() request: KanbanRequest
  ): Promise<PriorLawsuitsDto> {
    return this.service.remove(request.kanbanContext, customerId, lawsuitId, buildMutateContext(request));
  }
}
