import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { KanbanGateway } from '../realtime/kanban.gateway';
import { buildMutateContext } from '../shared/request-context';
import { CardsService } from './cards.service';
import { CreateCardDto, ListCardsQueryDto, MoveCardDto, SetCardStatusDto, UpdateCardDto } from './dto/card.dto';

@ApiTags('kanban-cards')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/cards')
export class CardsController {
  constructor(
    private readonly cards: CardsService,
    private readonly gateway: KanbanGateway
  ) {}

  @Get()
  list(@Param('boardId') boardId: string, @Query() query: ListCardsQueryDto, @Req() request: KanbanRequest) {
    return this.cards.list(request.kanbanContext, boardId, query);
  }

  @Post()
  @RequireScopes('flow:write')
  create(@Param('boardId') boardId: string, @Body() dto: CreateCardDto, @Req() request: KanbanRequest) {
    return this.cards.create(request.kanbanContext, boardId, dto, buildMutateContext(request));
  }

  @Patch(':cardId')
  @RequireScopes('flow:write')
  update(
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Body() dto: UpdateCardDto,
    @Req() request: KanbanRequest
  ) {
    return this.cards.update(request.kanbanContext, boardId, cardId, dto, buildMutateContext(request));
  }

  // Arquivar (soft-remove) e feito via PATCH com { status: 'archived' } desde a Sprint 3.
  // DELETE passou a significar exclusao definitiva, e so e aceito sobre um card ja arquivado
  // (ver docs/product/kanban-sprint-3-gate.md, secao "Decisao De Implementacao — Rota DELETE").
  @Delete(':cardId')
  @HttpCode(204)
  @RequireScopes('flow:write')
  async deletePermanently(
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Req() request: KanbanRequest
  ): Promise<void> {
    await this.cards.deletePermanently(request.kanbanContext, boardId, cardId, buildMutateContext(request));
  }

  @Patch(':cardId/status')
  @RequireScopes('flow:write')
  setStatus(
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Body() dto: SetCardStatusDto,
    @Req() request: KanbanRequest
  ) {
    return this.cards.setStatus(request.kanbanContext, boardId, cardId, dto.cardStatusId, buildMutateContext(request));
  }

  @Post(':cardId/move')
  @RequireScopes('flow:write')
  async move(
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Body() dto: MoveCardDto,
    @Req() request: KanbanRequest
  ) {
    const result = await this.cards.move(request.kanbanContext, boardId, cardId, dto, buildMutateContext(request));
    await this.gateway.broadcastCardMoved(boardId, {
      cardId,
      fromBoardColumnId: result.fromBoardColumnId,
      toBoardColumnId: dto.toBoardColumnId,
      toPosition: dto.toPosition,
      movedByIdentityId: request.kanbanContext.identityId,
      occurredAt: new Date().toISOString()
    });
    return result.card;
  }
}
