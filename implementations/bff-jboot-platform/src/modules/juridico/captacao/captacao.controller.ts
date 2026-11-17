import { Body, Controller, Get, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JuridicoAuthGuard, JuridicoRequest } from '../shared/juridico-auth.guard';
import { CaptacaoService } from './captacao.service';
import { ImportCpfsDto, SetSchedulingConfigDto } from './dto/captacao.dto';

@ApiTags('juridico-captacao')
@ApiBearerAuth()
@UseGuards(JuridicoAuthGuard)
@Controller('juridico/captacao')
export class CaptacaoController {
  constructor(private readonly captacao: CaptacaoService) {}

  @Post('import')
  import(@Body() body: ImportCpfsDto, @Req() request: JuridicoRequest) {
    return this.captacao.importCpfs(request.juridicoContext, body.entries, body.uf, body.filename);
  }

  @Get()
  list(
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
    @Req() request: JuridicoRequest,
  ) {
    return this.captacao.list(request.juridicoContext, Number(limit), Number(offset));
  }

  @Get('export/:format')
  async export(
    @Param('format') format: 'excel' | 'pdf',
    @Req() request: JuridicoRequest,
    @Res() response: Response,
  ) {
    const file = await this.captacao.exportFoundProcesses(request.juridicoContext, format);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.send(file.buffer);
  }

  @Get('config/:portalSlug')
  getConfig(@Param('portalSlug') portalSlug: string, @Req() request: JuridicoRequest) {
    return this.captacao.getSchedulingConfig(request.juridicoContext, portalSlug);
  }

  @Put('config/:portalSlug')
  setConfig(
    @Param('portalSlug') portalSlug: string,
    @Body() body: SetSchedulingConfigDto,
    @Req() request: JuridicoRequest,
  ) {
    return this.captacao.setSchedulingConfig(request.juridicoContext, portalSlug, body.interval);
  }
}
