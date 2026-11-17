import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { EmailDispatchListDto, EmailDispatchRetryResponseDto, ListEmailDispatchesQueryDto } from './dto/email-dispatch.dto';
import { EmailDispatchesService } from './email-dispatches.service';

@ApiTags('kanban-automation-dispatches')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/automation-dispatches')
export class EmailDispatchesController {
  constructor(private readonly dispatches: EmailDispatchesService) {}

  @Get()
  @RequireScopes('flow:admin')
  @ApiOkResponse({ type: EmailDispatchListDto })
  list(@Query() query: ListEmailDispatchesQueryDto, @Req() request: KanbanRequest): Promise<EmailDispatchListDto> {
    return this.dispatches.list(request.kanbanContext, query.status);
  }

  @Post(':dispatchId/retry')
  @HttpCode(200)
  @RequireScopes('flow:admin')
  @ApiOkResponse({ type: EmailDispatchRetryResponseDto })
  retry(
    @Param('dispatchId', new ParseUUIDPipe()) dispatchId: string,
    @Req() request: KanbanRequest
  ): Promise<EmailDispatchRetryResponseDto> {
    return this.dispatches.retry(request.kanbanContext, buildMutateContext(request), dispatchId);
  }
}
