import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { ReplaceUserLawyerDto, UserLawyerResponseDto, UserLawyersSummaryDto } from './dto/user-lawyer.dto';
import { UserLawyersService } from './user-lawyers.service';

// Advogado no cadastro do usuario do Flow (docs/product/flow-initial-petitions-sprints.md, S7).
// Contrato HTTP: docs/api/flow-initial-petitions-openapi.yaml.
@ApiTags('kanban-user-settings')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/settings/users')
export class UserLawyersController {
  constructor(private readonly lawyers: UserLawyersService) {}

  @Get('lawyers')
  @RequireScopes('flow:admin')
  @ApiOkResponse({ type: UserLawyersSummaryDto })
  summary(@Req() request: KanbanRequest): Promise<UserLawyersSummaryDto> {
    return this.lawyers.summary(request.kanbanContext);
  }

  @Get(':identityId/lawyer')
  @RequireScopes('flow:admin')
  @ApiOkResponse({ type: UserLawyerResponseDto })
  get(@Param('identityId', ParseUUIDPipe) identityId: string, @Req() request: KanbanRequest): Promise<UserLawyerResponseDto> {
    return this.lawyers.get(request.kanbanContext, identityId);
  }

  @Put(':identityId/lawyer')
  @RequireScopes('flow:admin')
  @ApiOkResponse({ type: UserLawyerResponseDto })
  replace(
    @Param('identityId', ParseUUIDPipe) identityId: string,
    @Body() dto: ReplaceUserLawyerDto,
    @Req() request: KanbanRequest
  ): Promise<UserLawyerResponseDto> {
    return this.lawyers.replace(request.kanbanContext, buildMutateContext(request), identityId, dto);
  }
}
