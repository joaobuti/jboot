import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PdvAuthGuard, PdvRequest } from '../../guards/pdv-auth.guard';
import { RequireScopes, ScopeGuard } from '../../guards/scope.guard';
import { buildMutateContext } from '../../shared/request-context';
import { ComandaMesasService } from './comanda-mesas.service';
import { CreateComandaMesaDto, UpdateComandaMesaDto, UpdateComandaMesaStatusDto } from './dto/comanda-mesas.dto';

/**
 * Prefixo `pdv/comanda-mesas`, e nao `pdv/comanda/mesas`, porque
 * `ComandaAdminController` ja registra `@Get(':id')` sob `pdv/comanda` — uma
 * rota irma seria capturada por aquele wildcard dependendo da ordem de
 * registro dos controllers. Prefixo proprio remove a dependencia de ordem.
 */
@ApiTags('pdv-comanda-mesas')
@ApiBearerAuth()
@UseGuards(PdvAuthGuard, ScopeGuard)
@Controller('pdv/comanda-mesas')
export class ComandaMesasController {
  constructor(private readonly service: ComandaMesasService) {}

  // Leitura tambem para o balcao: o mapa do salao (Sprint 8) e a impressao de
  // QR de uma mesa especifica sao operacao de balcao, nao configuracao.
  @Get()
  @RequireScopes('pdv:comanda:balcao', 'pdv:admin:read')
  list(@Req() request: PdvRequest) {
    return this.service.list(request.pdvContext);
  }

  @Post()
  @RequireScopes('pdv:admin:write')
  create(@Body() dto: CreateComandaMesaDto, @Req() request: PdvRequest) {
    return this.service.create(buildMutateContext(request), dto.tableNumber, dto.label);
  }

  @Patch(':id')
  @RequireScopes('pdv:admin:write')
  update(@Param('id') id: string, @Body() dto: UpdateComandaMesaDto, @Req() request: PdvRequest) {
    return this.service.updateLabel(buildMutateContext(request), id, dto.label);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequireScopes('pdv:admin:write')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateComandaMesaStatusDto, @Req() request: PdvRequest) {
    return this.service.updateStatus(buildMutateContext(request), id, dto.status);
  }

  @Post(':id/qr/regenerar')
  @HttpCode(200)
  @RequireScopes('pdv:admin:write')
  regenerateQr(@Param('id') id: string, @Req() request: PdvRequest) {
    return this.service.regenerateQr(buildMutateContext(request), id);
  }
}
