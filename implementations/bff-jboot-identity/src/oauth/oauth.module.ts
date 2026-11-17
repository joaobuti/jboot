import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CimdClientResolver } from './cimd-client.resolver';
import { OAuthConnectionsService } from './oauth-connections.service';
import { OAuthController } from './oauth.controller';
import { OAuthProviderService } from './oauth-provider.service';
import { OAuthRepository } from './oauth.repository';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [OAuthController],
  providers: [CimdClientResolver, OAuthRepository, OAuthProviderService, OAuthConnectionsService],
  exports: [OAuthProviderService]
})
export class OAuthModule {}
