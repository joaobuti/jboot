import { Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { PageResult } from '../kanban.types';
import { buildMutateContext } from '../shared/request-context';
import { LeadQueueItemResponse, LeadSettingsResponse, ListLeadQueueQueryDto, UpdateLeadSettingsDto } from './dto/lead.dto';
import { LeadSettingsService } from './lead-settings.service';
import { LeadsService } from './leads.service';

// Fila do gestor e campos obrigatorios do envio (somente flow:admin).
@ApiTags('kanban-leads')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly settings: LeadSettingsService
  ) {}

  @Get('leads')
  @RequireScopes('flow:admin')
  queue(@Query() query: ListLeadQueueQueryDto, @Req() request: KanbanRequest): Promise<PageResult<LeadQueueItemResponse>> {
    return this.leads.listQueue(request.kanbanContext, query);
  }

  @Get('lead-settings')
  @RequireScopes('flow:admin')
  getSettings(@Req() request: KanbanRequest): Promise<LeadSettingsResponse> {
    return this.settings.get(request.kanbanContext);
  }

  @Put('lead-settings')
  @RequireScopes('flow:admin')
  updateSettings(@Body() dto: UpdateLeadSettingsDto, @Req() request: KanbanRequest): Promise<LeadSettingsResponse> {
    return this.settings.update(request.kanbanContext, dto, buildMutateContext(request));
  }
}
