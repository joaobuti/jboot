import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { CardCustomersService } from './card-customers.service';
import {
  CardCustomerLinkResponse,
  CardCustomerLookupDto,
  CardCustomerLookupResponse,
  CardCustomerPanelResponse,
  LinkCardCustomerDto,
  UpdateCardCustomerDto
} from './dto/card-customer.dto';

// CRM de leads, Sprint 1 (docs/product/flow-crm-leads-sprints.md). CPF trafega
// somente no corpo (POST/PUT), nunca em path/query, para nao cair em access log
// nem em atributo de span HTTP.
@ApiTags('kanban-card-customer')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/cards/:cardId/customer')
export class CardCustomersController {
  constructor(private readonly cardCustomers: CardCustomersService) {}

  @Get()
  get(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Req() request: KanbanRequest
  ): Promise<CardCustomerPanelResponse> {
    return this.cardCustomers.getPanel(request.kanbanContext, boardId, cardId);
  }

  @Post('lookup')
  @HttpCode(200)
  @RequireScopes('flow:write')
  lookup(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() dto: CardCustomerLookupDto,
    @Req() request: KanbanRequest
  ): Promise<CardCustomerLookupResponse> {
    return this.cardCustomers.lookup(request.kanbanContext, boardId, cardId, dto.cpf);
  }

  @Put()
  @RequireScopes('flow:write')
  link(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() dto: LinkCardCustomerDto,
    @Req() request: KanbanRequest
  ): Promise<CardCustomerLinkResponse> {
    return this.cardCustomers.link(request.kanbanContext, boardId, cardId, dto, buildMutateContext(request));
  }

  @Patch()
  @RequireScopes('flow:write')
  update(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() dto: UpdateCardCustomerDto,
    @Req() request: KanbanRequest
  ): Promise<CardCustomerPanelResponse> {
    return this.cardCustomers.update(request.kanbanContext, boardId, cardId, dto, buildMutateContext(request));
  }
}
