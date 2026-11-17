import { Body, Controller, Get, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FiscalAuthGuard, FiscalRequest } from './fiscal-auth.guard';
import { UploadFiscalCertificateDto, UpsertFiscalConfigDto } from './fiscal-config.dto';
import { FiscalConfigService } from './fiscal-config.service';

@ApiTags('fiscal')
@ApiBearerAuth()
@UseGuards(FiscalAuthGuard)
@Controller('fiscal')
export class FiscalConfigController {
  constructor(private readonly fiscalConfig: FiscalConfigService) {}

  @Get('config')
  getConfig(@Query('cnpj_emitente') cnpjEmitente: string | undefined, @Req() request: FiscalRequest) {
    const { clientId } = request.fiscalContext;
    if (!cnpjEmitente) return this.fiscalConfig.listConfigs(clientId);
    return this.fiscalConfig.getConfig(cnpjEmitente, clientId);
  }

  @Put('config')
  upsertConfig(@Body() dto: UpsertFiscalConfigDto, @Req() request: FiscalRequest) {
    return this.fiscalConfig.upsertConfig(dto, request.fiscalContext.clientId);
  }

  @Post('certificados')
  uploadCertificate(@Body() dto: UploadFiscalCertificateDto, @Req() request: FiscalRequest) {
    return this.fiscalConfig.uploadCertificate(dto, request.fiscalContext.clientId);
  }
}
