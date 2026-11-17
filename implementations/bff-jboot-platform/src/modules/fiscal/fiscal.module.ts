import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { FiscalTokenService } from '../../config/fiscal-token.service';
import { FiscalConfigController } from './fiscal-config.controller';
import { FiscalConfigService } from './fiscal-config.service';

@Module({
  controllers: [FiscalConfigController],
  providers: [AppConfigService, FiscalTokenService, FiscalConfigService],
  exports: [FiscalConfigService]
})
export class FiscalModule {}
