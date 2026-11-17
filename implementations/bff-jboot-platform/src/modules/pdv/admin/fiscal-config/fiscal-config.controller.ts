import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PdvAuthGuard, PdvRequest } from '../guards/pdv-auth.guard';
import { UpsertFiscalConfigDto } from './dto/fiscal-config.dto';
import { FiscalConfigService } from './fiscal-config.service';

@ApiTags('pdv-fiscal-config')
@ApiBearerAuth()
@UseGuards(PdvAuthGuard)
@Controller('pdv/fiscal-config')
export class FiscalConfigController {
  constructor(private readonly fiscalConfig: FiscalConfigService) {}

  @Get()
  get(@Req() request: PdvRequest) {
    return this.fiscalConfig.get(request.pdvContext);
  }

  @Put()
  upsert(@Body() dto: UpsertFiscalConfigDto, @Req() request: PdvRequest) {
    return this.fiscalConfig.upsert(request.pdvContext, dto);
  }
}
