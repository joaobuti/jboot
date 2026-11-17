import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { MutateContext } from '../admin.types';

@Injectable()
export class AdminAuditService {
  constructor(private readonly audit: AuditService) {}

  async record(
    eventType: string,
    context: MutateContext,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await this.audit.record({
      eventType,
      identityId: context.actor.identityId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata
    });
  }
}
