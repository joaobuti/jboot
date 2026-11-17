import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { buildMutateContext } from '../shared/request-context';
import { CardActionsService } from './card-actions.service';
import { ReplaceColumnActionsDto } from './dto/card-actions.dto';
import { CardActionsRateLimitGuard } from './card-actions-rate-limit.guard';

@ApiTags('kanban-card-actions')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, CardActionsRateLimitGuard)
@Controller('kanban/boards/:boardId')
export class CardActionsController {
  constructor(private readonly actions: CardActionsService) {}

  @Get('actions')
  list(@Param('boardId', ParseUUIDPipe) boardId: string, @Req() request: KanbanRequest) {
    return this.actions.list(request.kanbanContext, boardId);
  }

  @Put('columns/:columnId/actions')
  @HttpCode(204)
  async replace(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('columnId', ParseUUIDPipe) columnId: string,
    @Body() dto: ReplaceColumnActionsDto,
    @Req() request: KanbanRequest
  ): Promise<void> {
    await this.actions.replace(buildMutateContext(request), boardId, columnId, dto);
  }

  @Post('cards/:cardId/actions/:actionId/execute')
  @HttpCode(200)
  execute(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('actionId') actionId: string,
    @Req() request: KanbanRequest
  ) {
    return this.actions.execute(buildMutateContext(request), boardId, cardId, actionId);
  }
}
