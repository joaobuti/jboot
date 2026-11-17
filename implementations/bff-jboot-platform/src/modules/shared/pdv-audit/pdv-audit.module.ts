import { Module } from '@nestjs/common';
import { PdvAuditService } from './pdv-audit.service';

@Module({
  providers: [PdvAuditService],
  exports: [PdvAuditService]
})
export class PdvAuditModule {}
