import { Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ListPlatformNotificationsQueryDto } from './dto/notification-query.dto';
import { PlatformNotificationsAuthGuard, PlatformNotificationsRequest } from './guards/platform-notifications-auth.guard';
import { PlatformNotificationsService } from './platform-notifications.service';

@ApiTags('platform-notifications')
@ApiBearerAuth()
@UseGuards(PlatformNotificationsAuthGuard)
@Controller('notifications')
export class PlatformNotificationsController {
  constructor(private readonly notifications: PlatformNotificationsService) {}

  @Get()
  list(@Query() query: ListPlatformNotificationsQueryDto, @Req() request: PlatformNotificationsRequest) {
    return this.notifications.list(request.platformNotificationContext, query);
  }

  @Get('summary')
  summary(@Query() query: ListPlatformNotificationsQueryDto, @Req() request: PlatformNotificationsRequest) {
    return this.notifications.summary(request.platformNotificationContext, query);
  }

  @Patch('read-all')
  async markAllRead(@Query() query: ListPlatformNotificationsQueryDto, @Req() request: PlatformNotificationsRequest): Promise<void> {
    await this.notifications.markAllRead(request.platformNotificationContext, query);
  }

  @Patch(':notificationId/read')
  async markRead(@Param('notificationId') notificationId: string, @Req() request: PlatformNotificationsRequest): Promise<void> {
    await this.notifications.markRead(request.platformNotificationContext, notificationId);
  }
}
