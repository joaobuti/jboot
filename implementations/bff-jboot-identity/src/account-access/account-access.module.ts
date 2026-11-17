import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { AccountAccessController } from './account-access.controller';
import { AccountAccessRepository } from './account-access.repository';
import { AccountAccessService } from './account-access.service';

@Module({
  imports: [AuditModule, MailModule],
  controllers: [AccountAccessController],
  providers: [AccountAccessRepository, AccountAccessService],
  exports: [AccountAccessService]
})
export class AccountAccessModule {}
