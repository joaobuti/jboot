import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../dto/common.dto';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { AuditEventsService } from './audit-events.service';

@ApiTags('admin-audit-events')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/audit-events')
export class AuditEventsController {
  constructor(private readonly auditEvents: AuditEventsService) {}

  @Get()
  async list(@Query() query: PageQueryDto) {
    return (await this.auditEvents.list(query)).rows;
  }
}
