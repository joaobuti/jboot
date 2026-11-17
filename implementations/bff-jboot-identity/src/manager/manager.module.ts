import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ManagerAuthGuard } from './manager-auth.guard';
import { ManagerUsersController } from './users/manager-users.controller';
import { ManagerUsersRepository } from './users/manager-users.repository';
import { ManagerUsersService } from './users/manager-users.service';
import { ManagerPermissionsController } from './permissions/manager-permissions.controller';
import { ManagerPermissionsRepository } from './permissions/manager-permissions.repository';
import { ManagerPermissionsService } from './permissions/manager-permissions.service';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [ManagerUsersController, ManagerPermissionsController],
  providers: [ManagerAuthGuard, ManagerUsersRepository, ManagerUsersService, ManagerPermissionsRepository, ManagerPermissionsService]
})
export class ManagerModule {}
