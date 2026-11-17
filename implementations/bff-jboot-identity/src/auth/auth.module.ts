import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AccessAuthGuard } from './access-auth.guard';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { IdentityApplicationsCacheService } from './identity-applications-cache.service';
import { IdentityJwtService } from './jwt.service';
import { ServiceTokenService } from './service-token.service';

@Module({
  imports: [AuditModule],
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, IdentityJwtService, IdentityApplicationsCacheService, AccessAuthGuard, ServiceTokenService],
  exports: [IdentityJwtService, IdentityApplicationsCacheService, AccessAuthGuard]
})
export class AuthModule {}
