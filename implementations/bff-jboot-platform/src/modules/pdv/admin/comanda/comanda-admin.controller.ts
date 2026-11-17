import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PdvAuthGuard, PdvRequest } from '../guards/pdv-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { ComandaAdminService } from './comanda-admin.service';
import {
  CancelComandaItemDto,
  ComandaFilaQueryDto,
  FecharComandaDto,
  RegistrarPagamentoComandaDto
} from './dto/comanda-admin.dto';

@ApiTags('pdv-comanda-admin')
@ApiBearerAuth()
@UseGuards(PdvAuthGuard, ScopeGuard)
@Controller('pdv/comanda')
export class ComandaAdminController {
  constructor(private readonly service: ComandaAdminService) {}

  @Get('itens/pendentes')
  @RequireScopes('pdv:comanda:balcao')
  pendentes(@Req() request: PdvRequest) {
    return this.service.listPendentes(request.pdvContext);
  }

  @Post('itens/:id/encaminhar')
  @HttpCode(200)
  @RequireScopes('pdv:comanda:balcao')
  encaminhar(@Param('id') id: string, @Req() request: PdvRequest) {
    return this.service.encaminhar(buildMutateContext(request), id);
  }

  @Get('fila')
  @RequireScopes('pdv:comanda:cozinha', 'pdv:comanda:bar')
  fila(@Query() query: ComandaFilaQueryDto, @Req() request: PdvRequest) {
    return this.service.listFila(request.pdvContext, query.queueType);
  }

  @Post('itens/:id/finalizar')
  @HttpCode(200)
  @RequireScopes('pdv:comanda:cozinha', 'pdv:comanda:bar')
  finalizar(@Param('id') id: string, @Req() request: PdvRequest) {
    return this.service.finalizar(buildMutateContext(request), id);
  }

  @Get('itens/prontos')
  @RequireScopes('pdv:comanda:balcao')
  prontos(@Req() request: PdvRequest) {
    return this.service.listProntos(request.pdvContext);
  }

  @Post('itens/:id/liberar')
  @HttpCode(200)
  @RequireScopes('pdv:comanda:balcao')
  liberar(@Param('id') id: string, @Req() request: PdvRequest) {
    return this.service.liberar(buildMutateContext(request), id);
  }

  @Post('itens/:id/cancelar')
  @HttpCode(200)
  @RequireScopes('pdv:comanda:balcao')
  cancelar(@Param('id') id: string, @Body() dto: CancelComandaItemDto, @Req() request: PdvRequest) {
    return this.service.cancelar(buildMutateContext(request), id, dto.reason);
  }

  @Get()
  @RequireScopes('pdv:comanda:balcao')
  listComandas(@Req() request: PdvRequest) {
    return this.service.listComandas(request.pdvContext);
  }

  @Get(':id')
  @RequireScopes('pdv:comanda:balcao')
  comandaDetail(@Param('id') id: string, @Req() request: PdvRequest) {
    return this.service.getComandaDetail(request.pdvContext, id);
  }

  // Recebimento parcial ou final (Sprint 9). `fechar` continua sendo o
  // caminho de "recebeu tudo de uma vez" e recusa comanda que ja tenha
  // pagamento parcial.
  @Post(':id/pagamentos')
  @HttpCode(200)
  @RequireScopes('pdv:comanda:balcao')
  registrarPagamento(
    @Param('id') id: string,
    @Body() dto: RegistrarPagamentoComandaDto,
    @Req() request: PdvRequest
  ) {
    return this.service.registrarPagamento(buildMutateContext(request), id, dto.amount, dto.paymentMethod);
  }

  @Post(':id/fechar')
  @HttpCode(200)
  @RequireScopes('pdv:comanda:balcao')
  fechar(@Param('id') id: string, @Body() dto: FecharComandaDto, @Req() request: PdvRequest) {
    return this.service.fecharComanda(buildMutateContext(request), id, dto.paymentMethod);
  }
}
