import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JuridicoAuthGuard, JuridicoRequest } from '../shared/juridico-auth.guard';
import {
  ListPjeComunicacoesDto,
  StartPjeSyncDto,
  UpdatePjeMonitoringConfigDto,
} from './dto/pje.dto';
import { PjeService } from './pje.service';

@ApiTags('juridico-pje')
@ApiBearerAuth()
@UseGuards(JuridicoAuthGuard)
@Controller('juridico/pje')
export class PjeController {
  constructor(private readonly service: PjeService) {}

  @Get('config')
  getConfig(@Req() req: JuridicoRequest) {
    return this.service.getConfig(req.juridicoContext);
  }

  @Put('config')
  updateConfig(@Req() req: JuridicoRequest, @Body() body: UpdatePjeMonitoringConfigDto) {
    return this.service.updateConfig(req.juridicoContext, body);
  }

  @Get('resumo')
  getResumo(@Req() req: JuridicoRequest) {
    return this.service.getResumo(req.juridicoContext);
  }

  @Get('comunicacoes')
  listComunicacoes(@Req() req: JuridicoRequest, @Query() query: ListPjeComunicacoesDto) {
    return this.service.listComunicacoes(req.juridicoContext, query);
  }

  @Get('comunicacoes/:id')
  getComunicacao(@Req() req: JuridicoRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getComunicacao(req.juridicoContext, id);
  }

  @Post('sync')
  startSync(@Req() req: JuridicoRequest, @Body() body: StartPjeSyncDto) {
    return this.service.startSync(req.juridicoContext, body);
  }

  @Get('sync/active')
  getActiveSync(@Req() req: JuridicoRequest) {
    return this.service.getActiveSync(req.juridicoContext);
  }

  @Get('sync/:jobId')
  getSync(@Req() req: JuridicoRequest, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.service.getSync(req.juridicoContext, jobId);
  }

  @Post('sync/:jobId/cancel')
  cancelSync(@Req() req: JuridicoRequest, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.service.cancelSync(req.juridicoContext, jobId);
  }

  @Get('tribunais')
  listTribunais() {
    return this.service.listTribunais();
  }
}
