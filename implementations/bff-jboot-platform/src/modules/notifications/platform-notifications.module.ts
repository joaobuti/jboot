import { Module } from '@nestjs/common';
import { PlatformNotificationsController } from './platform-notifications.controller';
import { PlatformNotificationsGateway } from './platform-notifications.gateway';
import { PlatformNotificationsRepository } from './platform-notifications.repository';
import { PlatformNotificationsService } from './platform-notifications.service';

@Module({
  controllers: [PlatformNotificationsController],
  providers: [PlatformNotificationsRepository, PlatformNotificationsService, PlatformNotificationsGateway],
  exports: [PlatformNotificationsService]
})
export class PlatformNotificationsModule {}
