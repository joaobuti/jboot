import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JuridicoAuthGuard, JuridicoRequest } from '../shared/juridico-auth.guard';
import { CreateDataJudMonitorDto, UpdateDataJudMonitorDto } from './dto/datajud-monitor.dto';
import { DataJudMonitorService } from './datajud-monitor.service';

@ApiTags('juridico-datajud-monitoring')
@ApiBearerAuth()
@UseGuards(JuridicoAuthGuard)
@Controller('juridico/datajud/acompanhamentos')
export class DataJudMonitorController {
  constructor(private readonly service: DataJudMonitorService) {}

  @Post()
  create(@Req() request: JuridicoRequest, @Body() body: CreateDataJudMonitorDto) {
    this.requireScope(request, 'juridico:write');
    return this.service.create(request.juridicoContext, body);
  }

  @Get()
  list(@Req() request: JuridicoRequest) {
    return this.service.list(request.juridicoContext);
  }

  @Get(':id')
  get(@Req() request: JuridicoRequest, @Param('id') id: string) {
    return this.service.get(request.juridicoContext, id);
  }

  @Get(':id/movimentacoes')
  movements(@Req() request: JuridicoRequest, @Param('id') id: string) {
    return this.service.movements(request.juridicoContext, id);
  }

  @Patch(':id')
  update(@Req() request: JuridicoRequest, @Param('id') id: string, @Body() body: UpdateDataJudMonitorDto) {
    this.requireScope(request, 'juridico:write');
    return this.service.update(request.juridicoContext, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() request: JuridicoRequest, @Param('id') id: string) {
    this.requireScope(request, 'juridico:admin');
    await this.service.remove(request.juridicoContext, id);
  }

  private requireScope(request: JuridicoRequest, scope: string): void {
    if (!request.juridicoContext.scopes.includes(scope)) throw new ForbiddenException('Insufficient juridico scope');
  }
}
