import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { CaseTypesService } from './case-types.service';
import { CaseTypeResponse, CreateCaseTypeDto, UpdateCaseTypeDto } from './dto/case-type.dto';

// Tipos de caso (CRM de leads, Sprint 5). Contrato: docs/api/flow-crm-leads-sprint-5-openapi.yaml.
@ApiTags('kanban-case-types')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/case-types')
export class CaseTypesController {
  constructor(private readonly caseTypes: CaseTypesService) {}

  @Get()
  @RequireScopes('flow:admin')
  list(@Req() request: KanbanRequest): Promise<{ data: CaseTypeResponse[] }> {
    return this.caseTypes.list(request.kanbanContext);
  }

  @Get(':caseTypeId')
  @RequireScopes('flow:admin')
  get(@Param('caseTypeId', ParseUUIDPipe) caseTypeId: string, @Req() request: KanbanRequest): Promise<CaseTypeResponse> {
    return this.caseTypes.get(request.kanbanContext, caseTypeId);
  }

  @Post()
  @RequireScopes('flow:admin')
  create(@Body() dto: CreateCaseTypeDto, @Req() request: KanbanRequest): Promise<CaseTypeResponse> {
    return this.caseTypes.create(request.kanbanContext, dto, buildMutateContext(request));
  }

  @Patch(':caseTypeId')
  @RequireScopes('flow:admin')
  update(
    @Param('caseTypeId', ParseUUIDPipe) caseTypeId: string,
    @Body() dto: UpdateCaseTypeDto,
    @Req() request: KanbanRequest
  ): Promise<CaseTypeResponse> {
    return this.caseTypes.update(request.kanbanContext, caseTypeId, dto, buildMutateContext(request));
  }
}
