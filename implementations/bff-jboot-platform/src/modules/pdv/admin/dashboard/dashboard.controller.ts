import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PdvAuthGuard, PdvRequest } from '../guards/pdv-auth.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('pdv-dashboard')
@ApiBearerAuth()
@UseGuards(PdvAuthGuard)
@Controller('pdv/admin/dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  get(
    @Req() req: PdvRequest,
    @Query('period') period = 'today',
    @Query('locationId') locationId?: string
  ) {
    return this.service.getDashboard(req.pdvContext, period, locationId);
  }
}
