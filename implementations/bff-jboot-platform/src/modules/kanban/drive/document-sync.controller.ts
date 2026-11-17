import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { FlowCustomerRateLimitGuard } from '../flow-customers/flow-customer-rate-limit.guard';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { DocumentSyncService } from './document-sync.service';

@Controller('kanban/document-syncs')
@UseGuards(KanbanAuthGuard, ScopeGuard)
@RequireScopes('flow:admin')
export class DocumentSyncController {
  constructor(private readonly service: DocumentSyncService) {}

  @Get()
  @UseGuards(FlowCustomerRateLimitGuard)
  operations(@Req() req: KanbanRequest) {
    return this.service.operations({
      databaseRef: req.kanbanContext.databaseRef,
      clientId: req.kanbanContext.clientId
    });
  }

  @Post(':syncId/reprocess')
  @HttpCode(202)
  @UseGuards(FlowCustomerRateLimitGuard)
  reprocess(@Param('syncId', ParseUUIDPipe) syncId: string, @Req() req: KanbanRequest) {
    return this.service.reprocess({
      databaseRef: req.kanbanContext.databaseRef,
      clientId: req.kanbanContext.clientId,
      syncId
    });
  }
}
