import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { ScopeGuard } from '../guards/scope.guard';
import { MetricsQueryDto } from './dto/metrics-query.dto';
import { MetricsService } from './metrics.service';

@ApiTags('kanban-metrics')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics')
  get(@Query() query: MetricsQueryDto, @Req() request: KanbanRequest) {
    return this.metrics.getMetrics(request.kanbanContext, query);
  }
}
