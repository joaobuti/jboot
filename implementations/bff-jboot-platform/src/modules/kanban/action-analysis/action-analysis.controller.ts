import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { ScopeGuard } from '../guards/scope.guard';
import { ActionAnalysisService } from './action-analysis.service';

// Acoes identificadas pela Analise de Acoes (docs/product/flow-action-analysis-sprints.md, A1).
@ApiTags('kanban-action-analysis')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/cards/:cardId/action-analysis')
export class ActionAnalysisController {
  constructor(private readonly analyses: ActionAnalysisService) {}

  /** Analise mais recente do card; `{ analysis: null }` quando nunca houve. */
  @Get()
  async latest(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Req() request: KanbanRequest
  ) {
    return { analysis: await this.analyses.latestForCard(request.kanbanContext, boardId, cardId) };
  }
}
