import { Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { ScopeGuard } from '../guards/scope.guard';
import { ListNotificationsQueryDto } from './dto/notifications-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('kanban-notifications')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Query() query: ListNotificationsQueryDto, @Req() request: KanbanRequest) {
    return this.notifications.listForIdentity(request.kanbanContext, query.unreadOnly ?? false);
  }

  @Patch('read-all')
  async markAllRead(@Req() request: KanbanRequest): Promise<void> {
    await this.notifications.markAllRead(request.kanbanContext);
  }

  @Patch(':notificationId/read')
  async markRead(@Param('notificationId') notificationId: string, @Req() request: KanbanRequest): Promise<void> {
    await this.notifications.markRead(request.kanbanContext, notificationId);
  }
}
