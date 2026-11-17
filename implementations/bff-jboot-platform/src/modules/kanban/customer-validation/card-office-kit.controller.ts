import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { CardOfficeKitService } from './card-office-kit.service';

/** Kit do escritorio no bloco Documentos do card: mesma visibilidade do card (ADR 019, decisao 19). */
@ApiTags('kanban-card-office-kit')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/cards/:cardId/office-kit')
export class CardOfficeKitController {
  constructor(private readonly service: CardOfficeKitService) {}

  @Get()
  latest(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Req() request: KanbanRequest
  ) {
    return this.service.latest(request.kanbanContext, boardId, cardId);
  }

  @Get(':kitId/download')
  download(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('kitId', ParseUUIDPipe) kitId: string,
    @Req() request: KanbanRequest
  ) {
    return this.service.download(request.kanbanContext, boardId, cardId, kitId, buildMutateContext(request));
  }
}
