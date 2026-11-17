import { Body, Controller, Delete, Get, HttpCode, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JuridicoAuthGuard, JuridicoRequest } from '../shared/juridico-auth.guard';
import { CredenciaisService } from './credenciais.service';
import { SetCredencialBodyDto } from './dto/credencial.dto';

@ApiTags('juridico-credenciais')
@ApiBearerAuth()
@UseGuards(JuridicoAuthGuard)
@Controller('juridico/credenciais')
export class CredenciaisController {
  constructor(private readonly credenciais: CredenciaisService) {}

  @Get(':portalSlug')
  getStatus(@Param('portalSlug') portalSlug: string, @Req() request: JuridicoRequest) {
    const { clientId, databaseRef } = request.juridicoContext;
    return this.credenciais.getStatus(clientId, databaseRef, portalSlug);
  }

  @Put(':portalSlug')
  set(
    @Param('portalSlug') portalSlug: string,
    @Body() body: SetCredencialBodyDto,
    @Req() request: JuridicoRequest,
  ) {
    return this.credenciais.set(request.juridicoContext, portalSlug, body, request.ip ?? null);
  }

  @Delete(':portalSlug')
  @HttpCode(204)
  remove(@Param('portalSlug') portalSlug: string, @Req() request: JuridicoRequest) {
    return this.credenciais.remove(request.juridicoContext, portalSlug, request.ip ?? null);
  }
}
