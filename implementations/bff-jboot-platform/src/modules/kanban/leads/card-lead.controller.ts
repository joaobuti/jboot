import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { CardLeadResponse, ReturnLeadDto } from './dto/lead.dto';
import { LeadsService } from './leads.service';

// Envio do lead, devolucao e estado no card (CRM de leads, Sprint 4).
// Contrato: docs/api/flow-crm-leads-sprint-4-openapi.yaml.
@ApiTags('kanban-leads')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/cards/:cardId/lead')
export class CardLeadController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  get(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Req() request: KanbanRequest
  ): Promise<CardLeadResponse> {
    return this.leads.getLead(request.kanbanContext, boardId, cardId);
  }

  @Post('submit')
  @HttpCode(200)
  @RequireScopes('flow:write')
  submit(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Req() request: KanbanRequest
  ): Promise<CardLeadResponse> {
    return this.leads.submit(request.kanbanContext, boardId, cardId, buildMutateContext(request));
  }

  @Post('return')
  @HttpCode(200)
  @RequireScopes('flow:admin')
  returnToOffice(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() dto: ReturnLeadDto,
    @Req() request: KanbanRequest
  ): Promise<CardLeadResponse> {
    return this.leads.returnToOffice(request.kanbanContext, boardId, cardId, dto, buildMutateContext(request));
  }
}
