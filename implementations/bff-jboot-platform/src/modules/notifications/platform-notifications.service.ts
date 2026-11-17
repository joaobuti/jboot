import { Injectable } from '@nestjs/common';
import { ListPlatformNotificationsQueryDto } from './dto/notification-query.dto';
import { PlatformNotificationContext, PublishPlatformNotificationInput } from './notifications.types';
import { PlatformNotificationsGateway } from './platform-notifications.gateway';
import { PlatformNotificationsRepository } from './platform-notifications.repository';

@Injectable()
export class PlatformNotificationsService {
  constructor(
    private readonly repository: PlatformNotificationsRepository,
    private readonly gateway: PlatformNotificationsGateway
  ) {}

  async publish(input: PublishPlatformNotificationInput): Promise<void> {
    if (input.actorIdentityId && input.actorIdentityId === input.recipientIdentityId) {
      return;
    }
    const notification = await this.repository.create(input);
    this.gateway.emitNotification(notification);
  }

  list(context: PlatformNotificationContext, query: ListPlatformNotificationsQueryDto) {
    return this.repository.listForIdentity(context.clientId, context.identityId, query);
  }

  async summary(context: PlatformNotificationContext, query: ListPlatformNotificationsQueryDto) {
    const unreadCount = await this.repository.unreadCount(context.clientId, context.identityId, query);
    return { unreadCount };
  }

  async markRead(context: PlatformNotificationContext, notificationId: string): Promise<void> {
    await this.repository.markRead(context.clientId, context.identityId, notificationId);
  }

  async markAllRead(context: PlatformNotificationContext, query: ListPlatformNotificationsQueryDto): Promise<void> {
    await this.repository.markAllRead(context.clientId, context.identityId, query);
  }
}
