import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import {
  CreateCardFromCustomerDto,
  CreateFlowCustomerDto,
  ListFlowCustomersQueryDto,
  LinkExistingCardDto,
  UpdateFlowCustomerDto
} from './dto/flow-customer.dto';
import { FlowCustomersService } from './flow-customers.service';
import { FlowCustomerRateLimitGuard } from './flow-customer-rate-limit.guard';

@ApiTags('kanban-flow-customers')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/customers')
export class FlowCustomersController {
  constructor(private readonly service: FlowCustomersService) {}

  @Get()
  @RequireScopes('flow:customers:read', 'flow:admin')
  @UseGuards(FlowCustomerRateLimitGuard)
  list(@Query() query: ListFlowCustomersQueryDto, @Req() request: KanbanRequest) {
    return this.service.list(request.kanbanContext, query, buildMutateContext(request));
  }

  @Post()
  @RequireScopes('flow:customers:write', 'flow:admin')
  create(@Body() dto: CreateFlowCustomerDto, @Req() request: KanbanRequest) {
    return this.service.create(request.kanbanContext, dto, buildMutateContext(request));
  }

  @Get(':customerId')
  @RequireScopes('flow:customers:read', 'flow:admin')
  get(@Param('customerId', ParseUUIDPipe) customerId: string, @Req() request: KanbanRequest) {
    return this.service.get(request.kanbanContext, customerId, buildMutateContext(request));
  }

  @Patch(':customerId')
  @RequireScopes('flow:customers:write', 'flow:admin')
  update(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: UpdateFlowCustomerDto,
    @Req() request: KanbanRequest
  ) {
    return this.service.update(request.kanbanContext, customerId, dto, buildMutateContext(request));
  }

  @Get(':customerId/cards')
  @RequireScopes('flow:customers:read', 'flow:admin')
  listCards(@Param('customerId', ParseUUIDPipe) customerId: string, @Req() request: KanbanRequest) {
    return this.service.listCards(request.kanbanContext, customerId, buildMutateContext(request));
  }

  @Post(':customerId/cards')
  @RequireScopes('flow:customers:write', 'flow:admin')
  async createCard(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CreateCardFromCustomerDto,
    @Req() request: KanbanRequest,
    @Res({ passthrough: true }) response: Response
  ) {
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw new BadRequestException({ code: 'invalid_idempotency_key', message: 'Idempotency-Key must have between 8 and 128 characters' });
    }
    const result = await this.service.createCard(
      request.kanbanContext,
      customerId,
      idempotencyKey,
      dto,
      buildMutateContext(request)
    );
    response.status(result.replay ? 200 : 201);
    return result;
  }

  @Patch(':customerId/cards/:cardId')
  @RequireScopes('flow:customers:write', 'flow:admin')
  linkExistingCard(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() dto: LinkExistingCardDto,
    @Req() request: KanbanRequest
  ) {
    return this.service.linkExistingCard(
      request.kanbanContext,
      customerId,
      cardId,
      dto,
      buildMutateContext(request)
    );
  }
}
