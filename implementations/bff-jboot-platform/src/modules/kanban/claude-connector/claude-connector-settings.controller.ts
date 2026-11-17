import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { ClaudeConnectorSettingsService } from './claude-connector-settings.service';
import { ClaudeConnectorSettingsWriteDto } from './dto/claude-connector-settings.dto';

/** Leitura para todo usuario do Flow (precisa da URL para conectar); escrita so `flow:admin`. */
@ApiTags('kanban-claude-connector')
@ApiBearerAuth()
@Controller('kanban/settings/claude-connector')
@UseGuards(KanbanAuthGuard, ScopeGuard)
export class ClaudeConnectorSettingsController {
  constructor(private readonly service: ClaudeConnectorSettingsService) {}

  @Get()
  get(@Req() request: KanbanRequest) {
    return this.service.get(request.kanbanContext);
  }

  @Put()
  @RequireScopes('flow:admin')
  put(@Body() dto: ClaudeConnectorSettingsWriteDto, @Req() request: KanbanRequest) {
    return this.service.put(request.kanbanContext, dto, buildMutateContext(request));
  }
}
