import { AccountAccessModule } from './account-access/account-access.module';
import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { CacheModule } from './cache/cache.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ManagerModule } from './manager/manager.module';
import { OAuthModule } from './oauth/oauth.module';
import { PreferencesModule } from './preferences/preferences.module';

@Module({
  imports: [ConfigModule, DatabaseModule, CacheModule, AuditModule, AuthModule, AccountAccessModule, AdminModule, ManagerModule, PreferencesModule, HealthModule, OAuthModule]
})
export class AppModule {}
