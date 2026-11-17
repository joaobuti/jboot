import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { AutomationRulesService } from './automation-rules.service';
import { CreateColumnAutomationRuleDto, UpdateColumnAutomationRuleDto } from './dto/automation-rule.dto';

@ApiTags('kanban-column-automation-rules')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/columns/:columnId/automation-rules')
export class ColumnAutomationRulesController {
  constructor(private readonly rules: AutomationRulesService) {}

  @Get()
  @RequireScopes('flow:admin')
  list(@Param('boardId') boardId: string, @Param('columnId') columnId: string, @Req() request: KanbanRequest) {
    return this.rules.list(request.kanbanContext, boardId, columnId);
  }

  @Post()
  @RequireScopes('flow:admin')
  create(
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Body() dto: CreateColumnAutomationRuleDto,
    @Req() request: KanbanRequest
  ) {
    return this.rules.create(request.kanbanContext, boardId, columnId, dto, buildMutateContext(request));
  }

  @Patch(':ruleId')
  @RequireScopes('flow:admin')
  update(
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateColumnAutomationRuleDto,
    @Req() request: KanbanRequest
  ) {
    return this.rules.update(request.kanbanContext, boardId, columnId, ruleId, dto, buildMutateContext(request));
  }

  @Delete(':ruleId')
  @HttpCode(204)
  @RequireScopes('flow:admin')
  async remove(
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Param('ruleId') ruleId: string,
    @Req() request: KanbanRequest
  ): Promise<void> {
    await this.rules.remove(request.kanbanContext, boardId, columnId, ruleId, buildMutateContext(request));
  }
}
