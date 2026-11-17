import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EntryRequirementsService } from '../automation/entry-requirements.service';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { ScopeGuard } from '../guards/scope.guard';
import { CardVisibilityService } from '../shared/card-visibility.service';

/** Envio de documento na ficha: mesmos scopes do `CustomerDocumentsController`. */
const CUSTOMER_DOCUMENT_WRITE_SCOPES = ['flow:customers:write', 'flow:admin'];

export interface CardHisconResponse {
  /** Cliente vinculado ao card; null sem cliente. */
  customerId: string | null;
  /** Cliente validado e sem HISCON atual: selo "SEM HISCON" e botao "Enviar HISCON". */
  missing: boolean;
  /** Quem ve pode enviar documento na ficha (o cliente de card visivel e visivel, como na tela Clientes). */
  canUpload: boolean;
}

/** HISCON do cliente no painel Cliente do card (docs/product/flow-customer-promobank-sprints.md, decisoes 3 e 5). */
@ApiTags('kanban-card-customer')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/cards/:cardId/customer/hiscon')
export class CardHisconController {
  constructor(
    private readonly visibility: CardVisibilityService,
    private readonly hiscon: EntryRequirementsService
  ) {}

  @Get()
  async get(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Req() request: KanbanRequest
  ): Promise<CardHisconResponse> {
    const context = request.kanbanContext;
    await this.visibility.requireVisibleCard(context, boardId, cardId);
    const status = await this.hiscon.cardWithoutHiscon(context.databaseRef, context.clientId, cardId);
    return {
      customerId: status?.customerId ?? null,
      missing: status?.missing ?? false,
      canUpload: Boolean(status) && context.scopes.some((scope) => CUSTOMER_DOCUMENT_WRITE_SCOPES.includes(scope))
    };
  }
}
