import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PdvAuthGuard, PdvRequest } from '../../guards/pdv-auth.guard';
import { RequireScopes, ScopeGuard } from '../../guards/scope.guard';
import { ComandaSalaoService } from './comanda-salao.service';

/**
 * Prefixo proprio pelo mesmo motivo de `pdv/comanda-mesas`: `pdv/comanda`
 * ja tem `@Get(':id')`, que capturaria uma rota irma.
 */
@ApiTags('pdv-comanda-salao')
@ApiBearerAuth()
@UseGuards(PdvAuthGuard, ScopeGuard)
@Controller('pdv/comanda-salao')
export class ComandaSalaoController {
  constructor(private readonly service: ComandaSalaoService) {}

  @Get()
  @RequireScopes('pdv:comanda:balcao')
  salao(@Req() request: PdvRequest) {
    return this.service.getSalao(request.pdvContext);
  }
}
