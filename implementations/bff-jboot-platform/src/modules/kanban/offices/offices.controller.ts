import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import {
  AssignBoardCardsOfficeDto,
  ChooseActiveOfficeDto,
  CreateOfficeDto,
  OfficeContextResponse,
  FlowUserManagementContextResponse,
  OfficeSettingsResponse,
  OfficeUserResponse,
  ReplaceUserOfficesDto,
  ReplaceUserOfficesResponse,
  TransferCardOfficeDto,
  TransferCardOfficeResponse,
  UpdateOfficeDto,
  UpdateOfficeSettingsDto
} from './dto/office.dto';
import { OfficeListRow, OfficeRow } from './offices.repository';
import { OfficesService } from './offices.service';
import { ActiveOfficeService, ActiveOfficeState } from './active-office.service';

// Escritorios e visibilidade por escritorio (CRM de leads, Sprint 3.5).
// Contrato: docs/api/flow-crm-leads-sprint-3-5-openapi.yaml.
@ApiTags('kanban-offices')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban')
export class OfficesController {
  constructor(
    private readonly offices: OfficesService,
    private readonly activeOffice: ActiveOfficeService
  ) {}

  /** Escritorio ativo do usuario logado e os escritorios dele (flow-offices-sprints.md, S2/S3). */
  @Get('me/office')
  @RequireScopes('flow:read')
  myOffice(@Req() request: KanbanRequest): Promise<ActiveOfficeState> {
    return this.activeOffice.state(request.kanbanContext);
  }

  @Put('me/office')
  @RequireScopes('flow:read')
  chooseMyOffice(@Body() dto: ChooseActiveOfficeDto, @Req() request: KanbanRequest): Promise<ActiveOfficeState> {
    return this.activeOffice.choose(request.kanbanContext, dto.officeId);
  }

  /** Contexto de escritorio do usuario (todo usuario do Flow): chave, admin, escritorios. */
  @Get('offices/context')
  context(@Req() request: KanbanRequest): Promise<OfficeContextResponse> {
    return this.offices.context(request.kanbanContext);
  }

  @Get('settings/users/context')
  @RequireScopes('users:manage', 'flow:users:manage')
  userManagementContext(@Req() request: KanbanRequest): Promise<FlowUserManagementContextResponse> {
    return this.offices.userManagementContext(request.kanbanContext);
  }

  @Get('offices')
  @RequireScopes('flow:admin')
  list(@Req() request: KanbanRequest): Promise<{ data: OfficeListRow[] }> {
    return this.offices.list(request.kanbanContext);
  }

  @Post('offices')
  @RequireScopes('flow:admin')
  create(@Body() dto: CreateOfficeDto, @Req() request: KanbanRequest): Promise<OfficeRow> {
    return this.offices.create(request.kanbanContext, dto, buildMutateContext(request));
  }

  @Patch('offices/:officeId')
  @RequireScopes('flow:admin')
  update(
    @Param('officeId', ParseUUIDPipe) officeId: string,
    @Body() dto: UpdateOfficeDto,
    @Req() request: KanbanRequest
  ): Promise<OfficeRow> {
    return this.offices.update(request.kanbanContext, officeId, dto, buildMutateContext(request));
  }

  @Get('office-users')
  @RequireScopes('flow:admin')
  listUsers(@Req() request: KanbanRequest): Promise<{ data: OfficeUserResponse[] }> {
    return this.offices.listUsers(request.kanbanContext);
  }

  @Put('office-users/:identityId/offices')
  @RequireScopes('flow:admin')
  replaceUserOffices(
    @Param('identityId', ParseUUIDPipe) identityId: string,
    @Body() dto: ReplaceUserOfficesDto,
    @Req() request: KanbanRequest
  ): Promise<ReplaceUserOfficesResponse> {
    return this.offices.replaceUserOffices(request.kanbanContext, identityId, dto, buildMutateContext(request), request.get('authorization') ?? undefined);
  }

  @Get('office-settings')
  @RequireScopes('flow:admin')
  getSettings(@Req() request: KanbanRequest): Promise<OfficeSettingsResponse> {
    return this.offices.getSettings(request.kanbanContext);
  }

  @Put('office-settings')
  @RequireScopes('flow:admin')
  updateSettings(@Body() dto: UpdateOfficeSettingsDto, @Req() request: KanbanRequest): Promise<OfficeSettingsResponse> {
    return this.offices.updateSettings(request.kanbanContext, dto, buildMutateContext(request));
  }

  @Post('boards/:boardId/office-assignment')
  @HttpCode(200)
  @RequireScopes('flow:admin')
  assignBoardCards(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Body() dto: AssignBoardCardsOfficeDto,
    @Req() request: KanbanRequest
  ): Promise<{ updated: number; cardIds: string[] }> {
    return this.offices.assignBoardCards(request.kanbanContext, boardId, dto, buildMutateContext(request));
  }

  @Post('boards/:boardId/cards/:cardId/office')
  @HttpCode(200)
  @RequireScopes('flow:admin')
  transferCard(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() dto: TransferCardOfficeDto,
    @Req() request: KanbanRequest
  ): Promise<TransferCardOfficeResponse> {
    return this.offices.transferCard(request.kanbanContext, boardId, cardId, dto, buildMutateContext(request));
  }
}
