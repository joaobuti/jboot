import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JuridicoAuthGuard, JuridicoRequest } from '../shared/juridico-auth.guard';
import { DataJudService } from './datajud.service';
import { ListProcessesByOabDto, QueryDataJudProcessDto } from './dto/datajud.dto';

@ApiTags('juridico-datajud')
@ApiBearerAuth()
@UseGuards(JuridicoAuthGuard)
@Controller('juridico/datajud')
export class DataJudController {
  constructor(private readonly service: DataJudService) {}

  @Get('processos/por-oab')
  listProcessesByOab(@Req() request: JuridicoRequest, @Query() query: ListProcessesByOabDto) {
    return this.service.listProcessesByOab(request.juridicoContext, query);
  }

  @Get('processos/snapshots/:snapshotId')
  getStoredProcess(@Req() request: JuridicoRequest, @Param('snapshotId', ParseUUIDPipe) snapshotId: string) {
    return this.service.getStoredProcess(request.juridicoContext, snapshotId);
  }

  @Get('tribunais')
  listTribunals() {
    return this.service.listTribunals();
  }

  @Post('processos/consulta')
  queryProcess(@Req() request: JuridicoRequest, @Body() body: QueryDataJudProcessDto) {
    return this.service.queryProcess(request.juridicoContext, body);
  }
}
